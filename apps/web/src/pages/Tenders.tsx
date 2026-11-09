import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { api, ApiFailure, Tender, TenderMetrics, TENDER_STATUSES, inr, dateOnly, today } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

/**
 * Tender pipeline.
 *
 * Nothing on this screen references a Lead: tenders stand alone, with their own
 * TND-YYYY-NNNN business number. Leaving the number blank lets the server
 * allocate the next one in the year; typing one preserves the portal's number.
 */
export default function Tenders() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const blank = {
    tenderTitle: '', portal: 'GeM', tenderNo: '', organization: '', sector: 'Government',
    location: '', tenderFee: '', emdAmount: '', tenderValue: '', manpowerCount: '',
    tenureMonths: '', submissionDate: '', preBidDate: '', scope: '',
  };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const list = useQuery({
    queryKey: ['tenders', q, status],
    queryFn: () => api.get<{ items: Tender[]; total: number }>(
      `/tenders?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`,
    ),
  });

  const metrics = useQuery({
    queryKey: ['tender-metrics'],
    queryFn: () => api.get<TenderMetrics>(`/tenders/metrics?today=${today()}`),
  });

  const num = (v: string) => (v === '' ? undefined : Number(v));

  const create = useMutation({
    mutationFn: () => api.post<Tender>('/tenders', {
      tenderTitle: form.tenderTitle,
      portal: form.portal,
      tenderNo: form.tenderNo || undefined,
      organization: form.organization || undefined,
      sector: form.sector,
      location: form.location || undefined,
      tenderFee: num(form.tenderFee),
      emdAmount: num(form.emdAmount),
      tenderValue: num(form.tenderValue),
      manpowerCount: form.manpowerCount || undefined,
      tenureMonths: num(form.tenureMonths),
      submissionDate: form.submissionDate,
      preBidDate: form.preBidDate || undefined,
      scope: form.scope || undefined,
    }),
    onSuccess: () => {
      setShowForm(false); setError(''); setForm(blank);
      qc.invalidateQueries({ queryKey: ['tenders'] });
      qc.invalidateQueries({ queryKey: ['tender-metrics'] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save the tender'),
  });

  const m = metrics.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Tender Management</h1>
          <p className="text-sm text-navy-500 mt-1">
            {list.data?.total ?? 0} tender{(list.data?.total ?? 0) === 1 ? '' : 's'} · independent of any Lead
          </p>
        </div>
        {can('tender:write') && (
          <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> New tender
          </button>
        )}
      </div>

      {m && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Open tenders', value: m.totalOpen },
            { label: 'Due today', value: m.dueToday, warn: m.dueToday > 0 },
            { label: 'Due in 7 days', value: m.dueWithin7Days, warn: m.dueWithin7Days > 0 },
            { label: 'Documents pending', value: m.documentsPending, warn: m.documentsPending > 0 },
            { label: 'Participated', value: m.participated },
            { label: 'Technically qualified', value: m.technicallyQualified },
            { label: 'Won', value: m.won },
            { label: 'Open tender value', value: inr(m.openTenderValue) },
          ].map((c) => (
            <div key={c.label} className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{c.label}</div>
              <div className={`mt-1 text-xl font-semibold ${c.warn ? 'text-amber-600' : 'text-navy-800'}`}>
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-1">New tender</h2>
          <p className="text-xs text-navy-500 mb-4">
            Leave the tender number blank to allocate the next <span className="font-mono">TND-YYYY-NNNN</span>.
          </p>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          >
            <label className="sm:col-span-2">
              <span className="label">Tender title *</span>
              <input className="input" required value={form.tenderTitle} onChange={set('tenderTitle')} />
            </label>
            <label>
              <span className="label">Portal *</span>
              <input className="input" required value={form.portal} onChange={set('portal')} />
            </label>
            <label>
              <span className="label">Tender no. (blank = auto)</span>
              <input className="input font-mono" placeholder="TND-2026-0001" value={form.tenderNo} onChange={set('tenderNo')} />
            </label>
            <label>
              <span className="label">Department / organisation</span>
              <input className="input" value={form.organization} onChange={set('organization')} />
            </label>
            <label>
              <span className="label">Sector *</span>
              <input className="input" required value={form.sector} onChange={set('sector')} />
            </label>
            <label>
              <span className="label">Location</span>
              <input className="input" value={form.location} onChange={set('location')} />
            </label>
            <label>
              <span className="label">Submission date *</span>
              <input className="input" type="date" required value={form.submissionDate} onChange={set('submissionDate')} />
            </label>
            <label>
              <span className="label">Pre-bid date</span>
              <input className="input" type="date" value={form.preBidDate} onChange={set('preBidDate')} />
            </label>
            <label>
              <span className="label">Tender fee (₹)</span>
              <input className="input" type="number" min="0" value={form.tenderFee} onChange={set('tenderFee')} />
            </label>
            <label>
              <span className="label">EMD (₹)</span>
              <input className="input" type="number" min="0" value={form.emdAmount} onChange={set('emdAmount')} />
            </label>
            <label>
              <span className="label">Tender value (₹)</span>
              <input className="input" type="number" min="0" value={form.tenderValue} onChange={set('tenderValue')} />
            </label>
            <label>
              <span className="label">Manpower</span>
              <input className="input" placeholder="e.g. 45" value={form.manpowerCount} onChange={set('manpowerCount')} />
            </label>
            <label>
              <span className="label">Tenure (months)</span>
              <input className="input" type="number" min="0" value={form.tenureMonths} onChange={set('tenureMonths')} />
            </label>
            <label className="sm:col-span-2 lg:col-span-3">
              <span className="label">Scope of work</span>
              <textarea className="input" rows={2} value={form.scope} onChange={set('scope')} />
            </label>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
              <button className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create tender'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[220px]">
          <span className="label">Search</span>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              className="input pl-9" placeholder="Number, title, department or portal"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </label>
        <label className="w-52">
          <span className="label">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {TENDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-navy-50 border-b border-navy-100">
            <tr>
              <th className="th">Tender no.</th>
              <th className="th">Title</th>
              <th className="th">Portal</th>
              <th className="th">Submission</th>
              <th className="th text-right">Value</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {(list.data?.items ?? []).map((t) => {
              const dueSoon = t.submissionDate && dateOnly(t.submissionDate) <= dateOnly(new Date(Date.now() + 3 * 864e5).toISOString());
              const open = !['FINANCIALLY_WON', 'LOST', 'CANCELLED'].includes(t.status);
              return (
                <tr key={t.id} className="hover:bg-navy-50/60">
                  <td className="td font-mono text-xs">{t.tenderNo}</td>
                  <td className="td max-w-[320px]">
                    <div className="font-medium text-navy-800 truncate">{t.tenderTitle}</div>
                    <div className="text-xs text-navy-500 truncate">{t.organization || t.sector}</div>
                  </td>
                  <td className="td">{t.portal}</td>
                  <td className="td whitespace-nowrap">
                    <span className={dueSoon && open ? 'text-amber-600 font-semibold' : ''}>
                      {dateOnly(t.submissionDate)}
                    </span>
                    {dueSoon && open && <AlertTriangle size={13} className="inline ml-1 text-amber-500" />}
                  </td>
                  <td className="td text-right tabular-nums">{inr(t.tenderValue)}</td>
                  <td className="td"><StatusBadge status={t.status} /></td>
                  <td className="td">
                    <Link to={`/tenders/${t.id}`} className="text-brand-500 hover:text-brand-600 inline-flex items-center gap-1 text-sm font-medium">
                      Open <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {list.data?.items.length === 0 && (
              <tr><td className="td text-center text-navy-500 py-10" colSpan={7}>No tenders match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
