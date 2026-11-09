import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Banknote, CalendarDays, CheckCircle2, Clock,
  FileSpreadsheet, Lock, PlayCircle, Plus, ShieldAlert, Wallet, XCircle,
} from 'lucide-react';
import {
  api, ApiFailure, GenerateSlipsResult, inr, MONTH_OPTIONS, monthName,
  PayrollAdjustment, PayrollRun, PayrollRunStatus, PayrollSummary, SalarySlip,
} from '../lib/api';
import { useAuth } from '../lib/auth';

const runTone: Record<PayrollRunStatus, string> = {
  DRAFT: 'bg-navy-100 text-navy-700',
  LOCKED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  DISBURSED: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

const slipTone: Record<string, string> = {
  DRAFT: 'bg-navy-100 text-navy-700',
  GENERATED: 'bg-emerald-100 text-emerald-800',
  SENT: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

/**
 * Payroll.
 *
 * The workflow is deliberately longer than the legacy one, which created a run
 * already LOCKED and let the preparer approve it:
 *
 *   attendance → draft slips → finalise → DRAFT run → LOCK → APPROVED → DISBURSED
 *
 * Every step is a separate permission and the person who prepares cannot be the
 * person who approves (Rule 16).
 */
export default function Payroll() {
  const { can, me } = useAuth();
  const qc = useQueryClient();

  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(today.getUTCMonth() === 0 ? 12 : today.getUTCMonth());
  const [year, setYear] = useState(today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    employeeId: '', originalRunId: '', type: 'ADDITION' as 'ADDITION' | 'REVERSAL',
    amount: '', reason: '',
  });

  const canPrepare = can('payroll:prepare');
  const canApprove = can('payroll:approve');

  const summary = useQuery({
    queryKey: ['payroll-summary'],
    queryFn: () => api.get<PayrollSummary>('/payroll/summary'),
  });
  const runs = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get<PayrollRun[]>('/payroll/runs'),
  });
  const slips = useQuery({
    queryKey: ['payroll-slips', month, year],
    queryFn: () => api.get<{ count: number; slips: SalarySlip[] }>(`/payroll/slips?month=${month}&year=${year}`),
  });
  const adjustments = useQuery({
    queryKey: ['payroll-adjustments'],
    queryFn: () => api.get<PayrollAdjustment[]>('/payroll/adjustments'),
  });
  // /employees/options returns a bare array (it is a picker feed, not a paged
  // list), so it is normalised here rather than assuming a { items } envelope.
  const employees = useQuery({
    queryKey: ['employee-options'],
    queryFn: async () => {
      const res = await api.get<Array<{ id: string; employeeCode: string; name: string }>
        | { items: Array<{ id: string; employeeCode: string; name: string }> }>('/employees/options');
      return Array.isArray(res) ? res : res.items;
    },
    enabled: showAdjust,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll-summary'] });
    qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    qc.invalidateQueries({ queryKey: ['payroll-slips'] });
    qc.invalidateQueries({ queryKey: ['payroll-adjustments'] });
  };

  const fail = (e: unknown) =>
    setError(e instanceof ApiFailure ? e.error.message : 'The request could not be completed.');

  const generate = useMutation({
    mutationFn: () => api.post<GenerateSlipsResult>('/payroll/slips/generate', { month, year }),
    onSuccess: (r) => {
      setError('');
      const bits = [`${r.generated} slip(s) computed as drafts.`];
      if (r.skipped) bits.push(`${r.skipped} skipped.`);
      if (r.statutory.problems.length) bits.push(r.statutory.problems.join(' '));
      setNotice(bits.join(' '));
      refresh();
    },
    onError: fail,
  });

  const finalise = useMutation({
    mutationFn: () => api.post<{ finalised: number }>('/payroll/slips/finalise', { month, year }),
    onSuccess: (r) => { setError(''); setNotice(`${r.finalised} slip(s) published for a run.`); refresh(); },
    onError: fail,
  });

  const createRun = useMutation({
    mutationFn: () => api.post<PayrollRun>('/payroll/runs', { month, year }),
    onSuccess: (r) => { setError(''); setNotice(`Run ${r.runNumber} created as a draft.`); refresh(); },
    onError: fail,
  });

  const raiseAdjustment = useMutation({
    mutationFn: () => api.post('/payroll/adjustments', {
      employeeId: adjustForm.employeeId,
      originalRunId: adjustForm.originalRunId || undefined,
      type: adjustForm.type,
      amount: Number(adjustForm.amount),
      reason: adjustForm.reason,
    }),
    onSuccess: () => {
      setError('');
      setShowAdjust(false);
      setAdjustForm({ employeeId: '', originalRunId: '', type: 'ADDITION', amount: '', reason: '' });
      setNotice('Adjustment raised. It needs a second person to approve it before it affects pay.');
      refresh();
    },
    onError: fail,
  });

  const approveAdjustment = useMutation({
    mutationFn: (id: string) => api.post(`/payroll/adjustments/${id}/approve`, {}),
    onSuccess: () => { setError(''); setNotice('Adjustment approved.'); refresh(); },
    onError: fail,
  });

  const statusOf = summary.data?.slipsByStatus ?? {};
  const draftCount = statusOf.DRAFT ?? 0;
  const generatedCount = statusOf.GENERATED ?? 0;
  const monthRuns = (runs.data ?? []).filter((r) => r.month === month && r.year === year);
  const liveRun = monthRuns.find((r) => r.status !== 'CANCELLED');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900 flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Payroll
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Prepare, review and approve a month's pay. The preparer cannot approve their own run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_OPTIONS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input className="input w-24" type="number" value={year}
            onChange={(e) => setYear(Number(e.target.value))} />
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

      {/* ---- position cards ---- */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-navy-500 flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> This month
          </div>
          <div className="text-lg font-semibold text-navy-900 mt-1">{summary.data?.period.label ?? '—'}</div>
          <div className="text-xs text-navy-500 mt-1">
            {summary.data?.attendanceRowsThisMonth ?? 0} attendance rows recorded
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-navy-500 flex items-center gap-1">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Slips ({monthName(month)} {year})
          </div>
          <div className="text-lg font-semibold text-navy-900 mt-1">
            {draftCount} draft · {generatedCount} ready
          </div>
          <div className="text-xs text-navy-500 mt-1">Only published slips enter a run.</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-navy-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Adjustments pending
          </div>
          <div className="text-lg font-semibold text-navy-900 mt-1">{summary.data?.pendingAdjustments ?? 0}</div>
          <div className="text-xs text-navy-500 mt-1">Each needs a second approver.</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-navy-500 flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5" /> Last run net
          </div>
          <div className="text-lg font-semibold text-navy-900 mt-1">
            {summary.data?.recentRuns?.[0] ? inr(summary.data.recentRuns[0].totalNet) : '—'}
          </div>
          <div className="text-xs text-navy-500 mt-1">
            {summary.data?.recentRuns?.[0]?.label ?? 'No runs yet'}
          </div>
        </div>
      </div>

      {/* ---- the month's pipeline ---- */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-navy-900">{monthName(month)} {year}</h2>
          <span className={`text-xs px-2 py-1 rounded ${liveRun ? runTone[liveRun.status] : 'bg-navy-100 text-navy-600'}`}>
            {liveRun ? `Run ${liveRun.runNumber} · ${liveRun.status}` : 'No run yet'}
          </span>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          {[
            { n: 1, label: 'Record attendance', done: (summary.data?.attendanceRowsThisMonth ?? 0) > 0, to: '/attendance' },
            { n: 2, label: 'Compute slips', done: draftCount + generatedCount > 0, action: 'generate' },
            { n: 3, label: 'Publish slips', done: generatedCount > 0 && draftCount === 0, action: 'finalise' },
            { n: 4, label: 'Assemble run', done: !!liveRun, action: 'createRun' },
          ].map((s) => (
            <li key={s.n} className={`rounded-lg border p-3 ${s.done ? 'border-emerald-200 bg-emerald-50/60' : 'border-navy-100'}`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${s.done ? 'bg-emerald-600 text-white' : 'bg-navy-200 text-navy-700'}`}>
                  {s.done ? '✓' : s.n}
                </span>
                <span className="text-navy-800">{s.label}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/attendance">
            <CalendarDays className="w-4 h-4" /> Open attendance
          </Link>
          {canPrepare && (
            <>
              <button className="btn-primary" disabled={generate.isPending} onClick={() => { setNotice(''); generate.mutate(); }}>
                <PlayCircle className="w-4 h-4" /> {generate.isPending ? 'Computing…' : 'Compute slips'}
              </button>
              <button className="btn-ghost" disabled={finalise.isPending || draftCount === 0}
                onClick={() => { setNotice(''); finalise.mutate(); }}>
                Publish {draftCount || ''} draft slip{draftCount === 1 ? '' : 's'}
              </button>
              <button className="btn-ghost" disabled={createRun.isPending || !!liveRun || generatedCount === 0}
                onClick={() => { setNotice(''); createRun.mutate(); }}>
                <Plus className="w-4 h-4" /> Assemble run
              </button>
            </>
          )}
          {canPrepare && (
            <button className="btn-ghost ml-auto" onClick={() => setShowAdjust(true)}>
              Raise adjustment
            </button>
          )}
        </div>
      </div>

      {/* ---- slips for the month ---- */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-navy-100 flex items-center justify-between">
          <h2 className="font-semibold text-navy-900 text-sm">Slips — {monthName(month)} {year}</h2>
          <span className="text-xs text-navy-500">{slips.data?.count ?? 0} slip(s)</span>
        </div>
        {slips.isLoading ? (
          <div className="p-6 text-sm text-navy-500">Loading…</div>
        ) : (slips.data?.slips.length ?? 0) === 0 ? (
          <div className="p-6 text-sm text-navy-500">
            No slips computed for this month yet. Record attendance, then compute.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-50 text-navy-600 text-xs">
                <th className="text-left px-4 py-2">Employee</th>
                <th className="text-right px-2 py-2">Days</th>
                <th className="text-right px-2 py-2">Gross</th>
                <th className="text-right px-2 py-2">PF</th>
                <th className="text-right px-2 py-2">ESI</th>
                <th className="text-right px-2 py-2">PT</th>
                <th className="text-right px-2 py-2">Deductions</th>
                <th className="text-right px-4 py-2">Net</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {slips.data?.slips.map((s) => (
                <tr key={s.id} className="border-t border-navy-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-navy-800">{s.employee?.name ?? '—'}</div>
                    <div className="text-[11px] text-navy-400 font-mono">{s.slipNumber}</div>
                  </td>
                  <td className="px-2 py-2 text-right">{Number(s.daysWorked)}/{s.daysInMonth}</td>
                  <td className="px-2 py-2 text-right">{inr(s.grossEarnings)}</td>
                  <td className="px-2 py-2 text-right text-navy-600">{inr(s.pfEmployee)}</td>
                  <td className="px-2 py-2 text-right text-navy-600">{inr(s.esiEmployee)}</td>
                  <td className="px-2 py-2 text-right text-navy-600">{inr(s.pt)}</td>
                  <td className="px-2 py-2 text-right text-navy-600">{inr(s.totalDeductions)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{inr(s.netPay)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${slipTone[s.status] ?? ''}`}>{s.status}</span>
                    {s.payrollRunId && <Lock className="w-3 h-3 inline ml-1 text-amber-600" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- runs ---- */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900 text-sm">Payroll runs</h2>
        </div>
        {(runs.data?.length ?? 0) === 0 ? (
          <div className="p-6 text-sm text-navy-500">No payroll runs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-50 text-navy-600 text-xs">
                <th className="text-left px-4 py-2">Run</th>
                <th className="text-left px-2 py-2">Period</th>
                <th className="text-right px-2 py-2">Employees</th>
                <th className="text-right px-2 py-2">Gross</th>
                <th className="text-right px-2 py-2">Net</th>
                <th className="text-left px-2 py-2">Statutory set</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.data?.map((r) => {
                const blocking = r.blockingFindings ?? 0;
                return (
                  <tr key={r.id} className="border-t border-navy-100 hover:bg-navy-50/50">
                    <td className="px-4 py-2 font-mono text-xs">{r.runNumber}</td>
                    <td className="px-2 py-2">{monthName(r.month)} {r.year}</td>
                    <td className="px-2 py-2 text-right">{r.totalEmployees}</td>
                    <td className="px-2 py-2 text-right">{inr(r.totalGross)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{inr(r.totalNet)}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.statutorySetCode ?? <span className="text-amber-700">none</span>}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded ${runTone[r.status]}`}>{r.status}</span>
                      {blocking > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-red-700">
                          <ShieldAlert className="w-3 h-3" />{blocking}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link className="text-navy-700 hover:underline inline-flex items-center gap-1 text-xs" to={`/payroll/runs/${r.id}`}>
                        Open <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- adjustments ---- */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-navy-100 flex items-center justify-between">
          <h2 className="font-semibold text-navy-900 text-sm">Corrections (adjustments)</h2>
          <span className="text-xs text-navy-500">
            Approved periods are never edited — they are adjusted here.
          </span>
        </div>
        {(adjustments.data?.length ?? 0) === 0 ? (
          <div className="p-6 text-sm text-navy-500">No adjustments raised.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-50 text-navy-600 text-xs">
                <th className="text-left px-4 py-2">Employee</th>
                <th className="text-left px-2 py-2">Type</th>
                <th className="text-right px-2 py-2">Amount</th>
                <th className="text-left px-2 py-2">Reason</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.data?.map((a) => (
                <tr key={a.id} className="border-t border-navy-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-navy-800">{a.employee?.name ?? '—'}</div>
                    <div className="text-[11px] text-navy-400 font-mono">{a.employee?.employeeCode}</div>
                  </td>
                  <td className="px-2 py-2 text-xs">{a.type}</td>
                  <td className={`px-2 py-2 text-right ${a.type === 'REVERSAL' ? 'text-red-700' : 'text-emerald-700'}`}>
                    {a.type === 'REVERSAL' ? '−' : '+'}{inr(a.amount)}
                  </td>
                  <td className="px-2 py-2 text-xs text-navy-600 max-w-xs truncate" title={a.reason}>{a.reason}</td>
                  <td className="px-2 py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded ${a.status === 'APPLIED' ? 'bg-emerald-100 text-emerald-800'
                      : a.status === 'VOID' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {a.status === 'PENDING' && canApprove && a.requestedById !== me?.id && (
                      <button className="btn-ghost text-xs" disabled={approveAdjustment.isPending}
                        onClick={() => { setNotice(''); approveAdjustment.mutate(a.id); }}>
                        Approve
                      </button>
                    )}
                    {a.status === 'PENDING' && a.requestedById === me?.id && (
                      <span className="text-[11px] text-navy-400 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> needs another approver
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdjust && (
        <div className="fixed inset-0 bg-navy-950/40 grid place-items-center p-4 z-30">
          <div className="card w-full max-w-lg p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-navy-900">Raise an adjustment</h3>
              <p className="text-xs text-navy-500 mt-1">
                Use this to correct a period that has already been locked. A second person with
                payroll:approve must authorise it before it affects anyone's pay.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-navy-500 block mb-1">Employee *</label>
                <select className="input" value={adjustForm.employeeId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, employeeId: e.target.value })}>
                  <option value="">Select…</option>
                  {(employees.data ?? []).map((e) => (
                    <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-navy-500 block mb-1">Type *</label>
                <select className="input" value={adjustForm.type}
                  onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value as 'ADDITION' | 'REVERSAL' })}>
                  <option value="ADDITION">ADDITION — pay the employee more</option>
                  <option value="REVERSAL">REVERSAL — recover money already paid</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-navy-500 block mb-1">Amount (₹) *</label>
                <input className="input" type="number" min={0} step="0.01" value={adjustForm.amount}
                  onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-navy-500 block mb-1">Related run (optional)</label>
                <select className="input" value={adjustForm.originalRunId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, originalRunId: e.target.value })}>
                  <option value="">Not tied to a specific run</option>
                  {(runs.data ?? []).filter((r) => ['LOCKED', 'APPROVED', 'DISBURSED'].includes(r.status))
                    .map((r) => (
                      <option key={r.id} value={r.id}>{r.runNumber} — {monthName(r.month)} {r.year}</option>
                    ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-navy-500 block mb-1">What went wrong? *</label>
                <textarea className="input h-20" value={adjustForm.reason}
                  placeholder="e.g. Night shift on 14th was not captured; gate register confirms 8 hours."
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setShowAdjust(false)}>Cancel</button>
              <button className="btn-primary"
                disabled={raiseAdjustment.isPending || !adjustForm.employeeId
                  || !adjustForm.amount || adjustForm.reason.trim().length < 10}
                onClick={() => raiseAdjustment.mutate()}>
                {raiseAdjustment.isPending ? 'Saving…' : 'Raise adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
