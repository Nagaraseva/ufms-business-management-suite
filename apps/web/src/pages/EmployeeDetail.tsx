import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, ShieldAlert, FileText, Plus, LogOut } from 'lucide-react';
import {
  api, ApiFailure, Employee, DOC_CATEGORIES, WAGE_CATEGORIES, inr, dateOnly,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

/**
 * Employee detail.
 *
 * The reveal panel only appears for a caller holding `employee:pii:read`, and
 * it demands a written reason before the server will decrypt anything. Every
 * reveal is written to the audit log by the API.
 */
export default function EmployeeDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [rowError, setRowError] = useState('');
  const [revealed, setRevealed] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState({ category: 'AADHAAR', fileName: '', expiryDate: '' });

  const employee = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get<Employee>(`/employees/${id}`),
  });

  const reveal = useMutation({
    mutationFn: () => api.post<any>(`/employees/${id}/reveal-pii`, { reason }),
    onSuccess: (data) => { setRowError(''); setRevealed(data); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not reveal'),
  });

  const addDoc = useMutation({
    mutationFn: () => api.post(`/employees/${id}/documents`, {
      category: doc.category,
      fileName: doc.fileName,
      expiryDate: doc.expiryDate || undefined,
    }),
    onSuccess: () => {
      setRowError(''); setDoc({ category: 'AADHAAR', fileName: '', expiryDate: '' });
      qc.invalidateQueries({ queryKey: ['employee', id] });
    },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not register the document'),
  });

  const deactivate = useMutation({
    mutationFn: () => api.post<any>(`/employees/${id}/deactivate`, { reason: 'Marked as left from employee record' }),
    onSuccess: () => {
      setRowError('');
      qc.invalidateQueries({ queryKey: ['employee', id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not deactivate'),
  });

  const e = employee.data;
  if (employee.isLoading) return <div className="text-sm text-navy-500">Loading employee…</div>;
  if (!e) return <div className="text-sm text-red-600">Employee not found.</div>;

  const gross = Number(e.basic) + Number(e.hra) + Number(e.da) + Number(e.otherAllowances);

  const identifiers: Array<[string, string | null]> = [
    ['Aadhaar', e.aadhaarHint],
    ['PAN', e.panHint],
    ['UAN', e.uanHint],
    ['ESI number', e.esiNoHint],
    ['Bank account', e.bankAccountHint],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link to="/employees" className="btn-ghost"><ArrowLeft size={15} /> Back</Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-navy-500">{e.employeeCode}</span>
            <StatusBadge status={e.status} />
            {e.legacyEmployeeId && (
              <span className="font-mono text-[11px] text-navy-400">legacy {e.legacyEmployeeId}</span>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-navy-800 mt-1">{e.name}</h1>
          <p className="text-sm text-navy-500">
            {[e.designation, e.department].filter(Boolean).join(' · ') || 'No designation set'}
          </p>
        </div>
        {can('employee:write') && e.active && (
          <button
            className="btn-ghost ml-auto text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => { if (confirm('Mark this employee as left? Their record and history are kept.')) deactivate.mutate(); }}
            disabled={deactivate.isPending}
          >
            <LogOut size={15} /> Mark as left
          </button>
        )}
      </div>

      {rowError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{rowError}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Statutory wage structure</h2>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                ['Basic', inr(e.basic)],
                ['HRA', inr(e.hra)],
                ['DA', inr(e.da)],
                ['Other allowances', inr(e.otherAllowances)],
                ['Monthly gross', inr(gross)],
                ['PT state', e.ptState || '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{k}</dt>
                  <dd className="text-sm text-navy-700 mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 pt-4 border-t border-navy-100 flex gap-2">
              <span className={`badge ${e.esiApplicable ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-100 text-navy-500'}`}>
                ESI {e.esiApplicable ? 'applicable' : 'not applicable'}
              </span>
              <span className={`badge ${e.pfApplicable ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-100 text-navy-500'}`}>
                PF {e.pfApplicable ? 'applicable' : 'not applicable'}
              </span>
            </div>
            <p className="text-xs text-navy-400 mt-3">
              Basic + DA is the wage compared against the statutory minimum for this category.
            </p>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Deployment history</h2>
            {(e.allocations ?? []).length === 0 ? (
              <p className="text-sm text-navy-500">
                Not deployed yet. <Link to="/workforce" className="text-brand-500">Deploy from the workforce board</Link>.
              </p>
            ) : (
              <ul className="divide-y divide-navy-100">
                {(e.allocations ?? []).map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-navy-800">
                        {a.designation || e.designation || 'Unassigned'}{' '}
                        <span className="text-xs font-normal text-navy-500">({a.category.replace(/_/g, ' ')})</span>
                      </div>
                      <div className="text-xs text-navy-500">
                        {dateOnly(a.startDate)} → {a.endDate ? dateOnly(a.endDate) : 'ongoing'}
                        {a.releaseReason && ` · ${a.releaseReason}`}
                      </div>
                    </div>
                    <span className="ml-auto"><StatusBadge status={a.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-800">Documents</h2>
            </div>
            {(e.documents ?? []).length === 0 ? (
              <p className="text-sm text-navy-500">No documents registered.</p>
            ) : (
              <ul className="divide-y divide-navy-100">
                {(e.documents ?? []).map((d) => (
                  <li key={d.id} className="py-2.5 flex items-center gap-3">
                    <FileText size={15} className="text-navy-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-navy-800 truncate">{d.fileName}</div>
                      <div className="text-xs text-navy-500">
                        {d.category}
                        {d.expiryDate && ` · expires ${dateOnly(d.expiryDate)}`}
                      </div>
                    </div>
                    <span className="ml-auto badge bg-amber-50 text-amber-700">
                      {d.status.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-navy-400">
              The register tracks what exists and when it expires. File content is held in object
              storage, never on the application server.
            </p>

            {can('employee:write') && (
              <form className="mt-4 pt-4 border-t border-navy-100 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end"
                    onSubmit={(ev) => { ev.preventDefault(); addDoc.mutate(); }}>
                <label>
                  <span className="label">Category</span>
                  <select className="input" value={doc.category}
                          onChange={(ev) => setDoc({ ...doc, category: ev.target.value })}>
                    {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">File name</span>
                  <input className="input" required placeholder="aadhaar-card.pdf"
                         value={doc.fileName} onChange={(ev) => setDoc({ ...doc, fileName: ev.target.value })} />
                </label>
                <button className="btn-primary" disabled={addDoc.isPending}>
                  <Plus size={15} /> Register
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-1 flex items-center gap-2">
              <Lock size={15} className="text-navy-400" /> Statutory identifiers
            </h2>
            <p className="text-xs text-navy-500 mb-4">
              Held encrypted. Only the last four characters are ever displayed.
            </p>
            <dl className="space-y-3">
              {identifiers.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{k}</dt>
                  <dd className="text-sm font-mono text-navy-700 mt-0.5">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          {can('employee:pii:read') && (
            <div className="card p-5 border-l-4 border-l-amber-400">
              <h2 className="font-semibold text-navy-800 mb-1 flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-500" /> Reveal full values
              </h2>
              <p className="text-xs text-navy-500 mb-3">
                Decrypts the identifiers for this employee. The reason you give is written to the
                audit log with your name and the time.
              </p>
              {revealed ? (
                <dl className="space-y-2 text-sm">
                  {[
                    ['Aadhaar', revealed.aadhaarNo],
                    ['PAN', revealed.panNo],
                    ['UAN', revealed.uanNo],
                    ['ESI', revealed.esiNo],
                    ['Bank account', revealed.bankAccountNo],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-navy-500">{k}</dt>
                      <dd className="font-mono text-navy-800">{v || '—'}</dd>
                    </div>
                  ))}
                  <button className="btn-ghost w-full mt-2" onClick={() => { setRevealed(null); setReason(''); }}>
                    Hide again
                  </button>
                </dl>
              ) : (
                <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); reveal.mutate(); }}>
                  <label>
                    <span className="label">Reason *</span>
                    <textarea className="input" rows={2} required minLength={10}
                              placeholder="e.g. verifying bank details before the payroll run"
                              value={reason} onChange={(ev) => setReason(ev.target.value)} />
                  </label>
                  <button className="btn-primary w-full" disabled={reveal.isPending || reason.trim().length < 10}>
                    {reveal.isPending ? 'Decrypting…' : 'Reveal'}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Contact</h2>
            <dl className="space-y-3">
              {([
                ['Mobile', e.mobile || '—'],
                ['Email', e.email || '—'],
                ['Date of joining', dateOnly(e.dateOfJoining)],
                ['Date of leaving', dateOnly(e.dateOfLeaving)],
                ['Emergency contact', e.emergencyContactName || '—'],
                ['Emergency mobile', e.emergencyContactMobile || '—'],
                ['Bank', e.bankName || '—'],
                ['IFSC', e.ifsc || '—'],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{k}</dt>
                  <dd className="text-sm text-navy-700 mt-0.5 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
