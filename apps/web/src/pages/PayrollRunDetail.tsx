import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, Ban, CheckCircle2, Download, Info,
  Lock, LockOpen, ShieldAlert, ShieldCheck, UserCheck, XCircle,
} from 'lucide-react';
import {
  api, ApiFailure, inr, monthName, PayrollFinding, PayrollRun, PayrollRunItem,
} from '../lib/api';
import { useAuth } from '../lib/auth';

const runTone: Record<string, string> = {
  DRAFT: 'bg-navy-100 text-navy-700',
  LOCKED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  DISBURSED: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

/**
 * One payroll run, and the whole lifecycle of it.
 *
 * The important parts of this screen are the things it refuses to do:
 *   - it will not offer Approve to the person who prepared the run (Rule 16);
 *   - it will not let a run with blocking findings be approved;
 *   - it will not let an approved run be unlocked or cancelled — the answer is
 *     an adjustment, not a silent edit;
 *   - the bank file is only produced once the figures are locked.
 */
export default function PayrollRunDetail() {
  const { id = '' } = useParams();
  const { can, me } = useAuth();
  const qc = useQueryClient();

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<null | 'unlock' | 'cancel' | 'disburse' | 'approve'>(null);
  const [reason, setReason] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [selfException, setSelfException] = useState(false);

  const run = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => api.get<PayrollRun>(`/payroll/runs/${id}`),
    enabled: !!id,
  });

  const fail = (e: unknown) =>
    setError(e instanceof ApiFailure ? e.error.message : 'The request could not be completed.');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll-run', id] });
    qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    qc.invalidateQueries({ queryKey: ['payroll-summary'] });
  };

  const act = (path: string, body: unknown, ok: string) => ({
    mutationFn: () => api.post<PayrollRun>(`/payroll/runs/${id}/${path}`, body),
    onSuccess: () => { setError(''); setNotice(ok); setDialog(null); setReason(''); refresh(); },
    onError: fail,
  });

  const lock = useMutation(act('lock', {}, 'Run locked. The period is now frozen.'));
  const unlock = useMutation(act('unlock', { reason }, 'Run reopened for correction.'));
  const approve = useMutation(act('approve', {
    reason: reason || undefined,
    enableSelfApprovalException: selfException || undefined,
  }, 'Run approved.'));
  const disburse = useMutation(act('disburse', { bankFileRef: bankRef || undefined }, 'Marked as disbursed.'));
  const cancel = useMutation(act('cancel', { reason }, 'Run cancelled.'));
  const recompute = useMutation(act('recompute', {}, 'Totals recomputed.'));

  const r = run.data;
  const findings: PayrollFinding[] = r?.findings ?? [];
  const blocking = findings.filter((f) => f.severity === 'BLOCKING');
  const warnings = findings.filter((f) => f.severity === 'WARNING');

  const isPreparer = !!r && !!me && r.preparedById === me.id;
  const canApprovePerm = can('payroll:approve');
  const canPreparePerm = can('payroll:prepare');

  const download = async (kind: 'bank-csv' | 'ecr') => {
    setError('');
    try {
      const token = localStorage.getItem('ufms_token');
      const res = await fetch(`/api/v1/payroll/runs/${id}/export/${kind}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let msg = 'Export failed.';
        try { const b = await res.json(); msg = b?.error?.message ?? msg; } catch { /* ignore */ }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = kind === 'bank-csv'
        ? `bank-transfer-${r?.runNumber}.csv`
        : `pf-ecr-${r?.runNumber}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('File downloaded.');
    } catch {
      setError('Export failed.');
    }
  };

  if (run.isLoading) return <div className="p-6 text-sm text-navy-500">Loading run…</div>;
  if (run.isError || !r) {
    return (
      <div className="card p-6 text-sm text-navy-600">
        <XCircle className="w-4 h-4 inline mr-2 text-red-600" />
        This payroll run could not be loaded. It may belong to another tenant or no longer exist.
        <div className="mt-3"><Link className="btn-ghost" to="/payroll"><ArrowLeft className="w-4 h-4" /> Back to payroll</Link></div>
      </div>
    );
  }

  const t = r.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/payroll" className="text-xs text-navy-500 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Payroll
          </Link>
          <h1 className="text-xl font-semibold text-navy-900 mt-1 flex items-center gap-2">
            {r.runNumber}
            <span className={`text-xs px-2 py-1 rounded ${runTone[r.status]}`}>{r.status}</span>
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            {monthName(r.month)} {r.year} · {t?.employees ?? r.totalEmployees} employees ·
            statutory set <span className="font-mono">{r.statutorySetCode ?? 'none'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPreparePerm && r.status === 'DRAFT' && (
            <>
              <button className="btn-ghost" disabled={recompute.isPending}
                onClick={() => { setNotice(''); recompute.mutate(); }}>Recompute</button>
              <button className="btn-primary" disabled={lock.isPending}
                onClick={() => { setNotice(''); lock.mutate(); }}>
                <Lock className="w-4 h-4" /> Lock period
              </button>
            </>
          )}
          {canPreparePerm && r.status === 'LOCKED' && (
            <button className="btn-ghost" onClick={() => setDialog('unlock')}>
              <LockOpen className="w-4 h-4" /> Unlock
            </button>
          )}
          {r.status === 'LOCKED' && (
            <button
              className="btn-primary"
              disabled={!canApprovePerm || isPreparer || blocking.length > 0}
              title={
                !canApprovePerm ? 'You need payroll:approve'
                  : isPreparer ? 'You prepared this run; a second person must approve it'
                    : blocking.length ? 'Resolve the blocking findings first'
                      : 'Approve this run'
              }
              onClick={() => setDialog('approve')}
            >
              <BadgeCheck className="w-4 h-4" /> Approve
            </button>
          )}
          {r.status === 'APPROVED' && canApprovePerm && (
            <button className="btn-primary" onClick={() => setDialog('disburse')}>
              <CheckCircle2 className="w-4 h-4" /> Mark disbursed
            </button>
          )}
          {(r.status === 'DRAFT' || r.status === 'LOCKED') && canPreparePerm && (
            <button className="btn-ghost text-red-700" onClick={() => setDialog('cancel')}>
              <Ban className="w-4 h-4" /> Cancel run
            </button>
          )}
          {['LOCKED', 'APPROVED', 'DISBURSED'].includes(r.status) && (
            <button className="btn-ghost" onClick={() => download('bank-csv')}>
              <Download className="w-4 h-4" /> Bank file
            </button>
          )}
          {['LOCKED', 'APPROVED', 'DISBURSED'].includes(r.status) && (
            <button className="btn-ghost" onClick={() => download('ecr')}>
              <Download className="w-4 h-4" /> PF ECR
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      {/* maker-checker banner */}
      <div className="card p-4 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-navy-500" />
          <span className="text-navy-500">Prepared by</span>
          <span className="font-mono text-xs text-navy-800">{r.preparedById ?? '—'}</span>
          {isPreparer && <span className="text-[11px] px-1.5 py-0.5 rounded bg-navy-100 text-navy-700">you</span>}
        </div>
        <span className="text-navy-300">→</span>
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-navy-500" />
          <span className="text-navy-500">Approved by</span>
          <span className="font-mono text-xs text-navy-800">{r.approvedById ?? '—'}</span>
        </div>
        {r.selfApprovalException && (
          <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            self-approval exception recorded: {r.selfApprovalReason}
          </span>
        )}
        {!r.approvedById && isPreparer && canApprovePerm && (
          <span className="inline-flex items-center gap-1 text-amber-700 text-xs ml-auto">
            <ShieldAlert className="w-3.5 h-3.5" /> You cannot approve your own run (Rule 16).
          </span>
        )}
      </div>

      {/* findings */}
      {findings.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-navy-800">
            <ShieldAlert className="w-4 h-4" /> Pre-flight checks
            <span className="text-xs text-navy-500">
              {blocking.length} blocking · {warnings.length} warning
            </span>
          </div>
          <ul className="space-y-1">
            {findings.map((f, i) => (
              <li key={`${f.code}-${i}`} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 px-1.5 py-0.5 rounded shrink-0 ${f.severity === 'BLOCKING' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {f.severity}
                </span>
                <span className="text-navy-700">
                  <span className="font-mono text-[11px] text-navy-500 mr-1">{f.code}</span>
                  {f.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* totals */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Gross', t?.gross], ['Deductions', t?.deductions], ['Net payable', t?.net],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-4">
            <div className="text-xs text-navy-500">{label}</div>
            <div className="text-lg font-semibold text-navy-900 mt-1">{inr(Number(value ?? 0))}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-xs text-navy-500">Employer contributions</div>
          <div className="text-sm text-navy-800 mt-1 space-y-0.5">
            <div className="flex justify-between"><span>EPF</span><span>{inr(t?.pfEmployerEPF ?? 0)}</span></div>
            <div className="flex justify-between"><span>EPS</span><span>{inr(t?.pfEmployerEPS ?? 0)}</span></div>
            <div className="flex justify-between"><span>EDLI</span><span>{inr(t?.pfEmployerEDLIS ?? 0)}</span></div>
            <div className="flex justify-between"><span>ESI</span><span>{inr(t?.esiEmployer ?? 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-navy-500 flex items-start gap-1">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Employer contributions are a company cost and are never deducted from the employee.
        The ECR and bank file reproduce the legacy v5.6.61 layouts; verify them against the
        current EPFO and bank specifications before filing.
      </div>

      {/* items */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900 text-sm">Line items</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-50 text-navy-600 text-xs">
              <th className="text-left px-4 py-2">Employee</th>
              <th className="text-right px-2 py-2">Days</th>
              <th className="text-right px-2 py-2">Basic</th>
              <th className="text-right px-2 py-2">Gross</th>
              <th className="text-right px-2 py-2">PF</th>
              <th className="text-right px-2 py-2">ESI</th>
              <th className="text-right px-2 py-2">PT</th>
              <th className="text-right px-2 py-2">Adj.</th>
              <th className="text-right px-2 py-2">Deductions</th>
              <th className="text-right px-4 py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {(r.items ?? []).map((i: PayrollRunItem) => (
              <tr key={i.id} className="border-t border-navy-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-navy-800">{i.employeeName}</div>
                  <div className="text-[11px] text-navy-400 font-mono">
                    {i.employeeCode}{i.designation ? ` · ${i.designation}` : ''}
                  </div>
                </td>
                <td className="px-2 py-2 text-right">{Number(i.daysWorked)}</td>
                <td className="px-2 py-2 text-right">{inr(i.basic)}</td>
                <td className="px-2 py-2 text-right">{inr(i.grossEarnings)}</td>
                <td className="px-2 py-2 text-right text-navy-600">{inr(i.pfEmployee)}</td>
                <td className="px-2 py-2 text-right text-navy-600">{inr(i.esiEmployee)}</td>
                <td className="px-2 py-2 text-right text-navy-600">{inr(i.pt)}</td>
                <td className={`px-2 py-2 text-right ${i.adjustmentAmount > 0 ? 'text-emerald-700' : i.adjustmentAmount < 0 ? 'text-red-700' : 'text-navy-300'}`}>
                  {i.adjustmentAmount ? inr(i.adjustmentAmount) : '—'}
                </td>
                <td className="px-2 py-2 text-right text-navy-600">{inr(i.totalDeductions)}</td>
                <td className="px-4 py-2 text-right font-semibold">{inr(i.netPay)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-navy-200 bg-navy-50 text-sm font-semibold">
              <td className="px-4 py-2" colSpan={3}>Total</td>
              <td className="px-2 py-2 text-right">{inr(t?.gross ?? 0)}</td>
              <td className="px-2 py-2 text-right">{inr(t?.pfEmployee ?? 0)}</td>
              <td className="px-2 py-2 text-right">{inr(t?.esiEmployee ?? 0)}</td>
              <td className="px-2 py-2 text-right">{inr(t?.pt ?? 0)}</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right">{inr(t?.deductions ?? 0)}</td>
              <td className="px-4 py-2 text-right">{inr(t?.net ?? 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {r.bankFileRef && (
        <div className="text-xs text-navy-600">
          Bank reference: <span className="font-mono">{r.bankFileRef}</span>
        </div>
      )}
      {r.cancelReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Cancelled: {r.cancelReason}
        </div>
      )}

      {/* dialogs */}
      {dialog && (
        <div className="fixed inset-0 bg-navy-950/40 grid place-items-center p-4 z-30">
          <div className="card w-full max-w-md p-5 space-y-4">
            {dialog === 'approve' && (
              <>
                <h3 className="font-semibold text-navy-900">Approve {r.runNumber}</h3>
                <p className="text-xs text-navy-500">
                  Approving locks the figures. After this, corrections must be made as adjustments.
                  You are not the preparer, so no exception is required.
                </p>
                {isPreparer && (
                  <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-2 rounded">
                    <input type="checkbox" checked={selfException}
                      onChange={(e) => setSelfException(e.target.checked)} className="mt-0.5" />
                    <span>
                      You prepared this run. Approving it anyway requires the configured exception and
                      a written reason; both are recorded permanently on the run.
                    </span>
                  </label>
                )}
                <div>
                  <label className="text-xs text-navy-500 block mb-1">
                    {isPreparer ? 'Reason for the self-approval exception *' : 'Note (optional)'}
                  </label>
                  <textarea className="input h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
                  <button className="btn-primary"
                    disabled={approve.isPending || (isPreparer && (reason.trim().length < 10 || !selfException))}
                    onClick={() => approve.mutate()}>
                    {approve.isPending ? 'Approving…' : 'Approve run'}
                  </button>
                </div>
              </>
            )}

            {dialog === 'unlock' && (
              <>
                <h3 className="font-semibold text-navy-900">Reopen {r.runNumber}</h3>
                <p className="text-xs text-navy-500">
                  This returns the run to DRAFT so attendance and slips can be corrected. It is only
                  possible before approval — an approved run cannot be reopened.
                </p>
                <textarea className="input h-20" placeholder="Why does this period need reopening?"
                  value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
                  <button className="btn-primary" disabled={unlock.isPending || reason.trim().length < 10}
                    onClick={() => unlock.mutate()}>Unlock</button>
                </div>
              </>
            )}

            {dialog === 'cancel' && (
              <>
                <h3 className="font-semibold text-navy-900">Cancel {r.runNumber}</h3>
                <p className="text-xs text-navy-500">
                  The slips return to the pool and can be assembled into a new run.
                </p>
                <textarea className="input h-20" placeholder="Reason for cancelling this run"
                  value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setDialog(null)}>Keep it</button>
                  <button className="btn-primary bg-red-700 hover:bg-red-800"
                    disabled={cancel.isPending || reason.trim().length < 10}
                    onClick={() => cancel.mutate()}>Cancel run</button>
                </div>
              </>
            )}

            {dialog === 'disburse' && (
              <>
                <h3 className="font-semibold text-navy-900">Mark {r.runNumber} disbursed</h3>
                <p className="text-xs text-navy-500">
                  Record the bank's reference so the payment can be traced. This is the final state;
                  nothing about the run changes after it.
                </p>
                <input className="input" placeholder="Bank / NEFT reference"
                  value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
                  <button className="btn-primary" disabled={disburse.isPending}
                    onClick={() => disburse.mutate()}>Confirm disbursed</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
