import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertOctagon, Timer, Star, ShieldCheck } from 'lucide-react';
import {
  api, ApiFailure, Client, Complaint, ClientCareSummary, SlaAgreement, dateOnly,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const NEXT_STATUSES: Record<string, string[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'],
  ASSIGNED: ['IN_PROGRESS', 'ESCALATED'],
  IN_PROGRESS: ['RESOLVED', 'ESCALATED'],
  ESCALATED: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED'],
};

/**
 * Client care: SLA agreements, tickets and customer feedback.
 *
 * The breach flag and overdue hours are computed by the server on every read,
 * so a ticket that passes its deadline shows as breached without any job having
 * to sweep the table first.
 */
export default function ClientCare() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'tickets' | 'sla'>('tickets');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState('');
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [rating, setRating] = useState(5);

  const blank = { clientId: '', slaId: '', subject: '', description: '', priority: 'MEDIUM', category: '' };
  const [form, setForm] = useState(blank);
  const [slaForm, setSlaForm] = useState({
    clientId: '', title: '', responseHours: '4', resolutionHours: '24', uptimeTarget: '99.5', startDate: '',
  });

  const summary = useQuery({
    queryKey: ['care-summary'],
    queryFn: () => api.get<ClientCareSummary>('/client-care/summary'),
  });
  const tickets = useQuery({
    queryKey: ['complaints'],
    queryFn: () => api.get<Complaint[]>('/complaints?openOnly=true'),
  });
  const allTickets = useQuery({
    queryKey: ['complaints-all'],
    queryFn: () => api.get<Complaint[]>('/complaints'),
  });
  const slas = useQuery({
    queryKey: ['slas'],
    queryFn: () => api.get<SlaAgreement[]>('/sla'),
  });
  const clients = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<{ items: Client[] }>('/clients?pageSize=100'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['complaints'] });
    qc.invalidateQueries({ queryKey: ['complaints-all'] });
    qc.invalidateQueries({ queryKey: ['care-summary'] });
    qc.invalidateQueries({ queryKey: ['slas'] });
  };

  const create = useMutation({
    mutationFn: () => api.post<Complaint>('/complaints', {
      clientId: form.clientId,
      slaId: form.slaId || undefined,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
      category: form.category || undefined,
    }),
    onSuccess: () => { setShowForm(false); setError(''); setForm(blank); refresh(); },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not log the ticket'),
  });

  const createSla = useMutation({
    mutationFn: () => api.post<SlaAgreement>('/sla', {
      clientId: slaForm.clientId,
      title: slaForm.title,
      responseHours: Number(slaForm.responseHours),
      resolutionHours: Number(slaForm.resolutionHours),
      uptimeTarget: slaForm.uptimeTarget ? Number(slaForm.uptimeTarget) : undefined,
      startDate: slaForm.startDate,
    }),
    onSuccess: () => {
      setError('');
      setSlaForm({ clientId: '', title: '', responseHours: '4', resolutionHours: '24', uptimeTarget: '99.5', startDate: '' });
      refresh();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save the SLA'),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<Complaint>(`/complaints/${id}`, { status }),
    onSuccess: () => { setRowError(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not update the ticket'),
  });

  const sendFeedback = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      api.post<Complaint>(`/complaints/${id}/feedback`, { rating }),
    onSuccess: () => { setRowError(''); setFeedbackFor(null); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not record the feedback'),
  });

  const s = summary.data;
  const rows = allTickets.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Client Care</h1>
          <p className="text-sm text-navy-500 mt-1">SLA tracking, tickets and customer feedback</p>
        </div>
        {can('complaint:write') && tab === 'tickets' && (
          <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> Log a ticket
          </button>
        )}
      </div>

      {s && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Open tickets', value: s.open, icon: AlertOctagon },
            { label: 'Breached', value: s.breached, icon: ShieldCheck, warn: s.breached > 0 },
            { label: 'Breach rate', value: `${s.breachRatePct}%`, icon: Timer, warn: s.breachRatePct > 10 },
            { label: 'Avg resolution', value: `${s.avgResolutionHours}h`, icon: Timer },
            { label: 'Avg rating', value: s.avgRating ?? '—', icon: Star },
          ].map(({ label, value, icon: Icon, warn }) => (
            <div key={label} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</div>
                <Icon size={15} className={warn ? 'text-red-500' : 'text-navy-300'} />
              </div>
              <div className={`mt-1 text-xl font-semibold ${warn ? 'text-red-600' : 'text-navy-800'}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 bg-navy-100 rounded-lg p-1 w-fit">
        {(['tickets', 'sla'] as const).map((t) => (
          <button key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition
                    ${tab === t ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'}`}>
            {t === 'tickets' ? 'Tickets' : 'SLA agreements'}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {rowError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{rowError}</div>}

      {showForm && tab === 'tickets' && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-1">Log a ticket</h2>
          <p className="text-xs text-navy-500 mb-4">
            The client's active SLA is attached automatically and the due time is derived from it.
          </p>
          <form className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <label>
              <span className="label">Client *</span>
              <select className="input" required value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">Select a client…</option>
                {(clients.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.clientCode} — {c.companyName}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Priority</span>
              <select className="input" value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="label">Subject *</span>
              <input className="input" required value={form.subject}
                     onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Description *</span>
              <textarea className="input" rows={3} required value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label>
              <span className="label">Category</span>
              <input className="input" value={form.category}
                     onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <button className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Log ticket'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {tab === 'tickets' && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-navy-50 border-b border-navy-100">
              <tr>
                <th className="th">Ticket</th>
                <th className="th">Subject</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th">Due</th>
                <th className="th">SLA</th>
                <th className="th">Rating</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {rows.map((t) => (
                <tr key={t.id} className={t.breached ? 'bg-red-50/40' : 'hover:bg-navy-50/60'}>
                  <td className="td font-mono text-xs">{t.ticketNo}</td>
                  <td className="td max-w-[280px]">
                    <div className="font-medium text-navy-800 truncate">{t.subject}</div>
                    <div className="text-xs text-navy-500 truncate">{t.category || 'Uncategorised'}</div>
                  </td>
                  <td className="td"><StatusBadge status={t.priority} /></td>
                  <td className="td"><StatusBadge status={t.status} /></td>
                  <td className="td text-xs whitespace-nowrap">
                    {dateOnly(t.dueAt)}
                    {t.breached && (
                      <div className="text-red-600 font-semibold">
                        {t.overdueHours}h overdue
                      </div>
                    )}
                  </td>
                  <td className="td">
                    {t.breached
                      ? <span className="badge bg-red-50 text-red-700">BREACHED</span>
                      : <span className="badge bg-emerald-50 text-emerald-700">Within SLA</span>}
                  </td>
                  <td className="td text-xs">
                    {t.feedbackRating ? (
                      <span className="inline-flex items-center gap-1">
                        <Star size={12} className="text-amber-500 fill-amber-500" /> {t.feedbackRating}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-2">
                      {can('complaint:write') && (NEXT_STATUSES[t.status] ?? []).slice(0, 2).map((next) => (
                        <button key={next}
                                className="text-xs font-semibold text-brand-500 hover:text-brand-600"
                                onClick={() => move.mutate({ id: t.id, status: next })}>
                          {next.replace(/_/g, ' ')}
                        </button>
                      ))}
                      {can('complaint:write') && ['RESOLVED', 'CLOSED'].includes(t.status) && !t.feedbackRating && (
                        <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                                onClick={() => { setFeedbackFor(t.id); setRating(5); }}>
                          Rate
                        </button>
                      )}
                    </div>
                    {feedbackFor === t.id && (
                      <div className="mt-2 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                            <Star size={15} className={n <= rating ? 'text-amber-500 fill-amber-500' : 'text-navy-300'} />
                          </button>
                        ))}
                        <button className="ml-1 text-xs font-semibold text-emerald-600"
                                onClick={() => sendFeedback.mutate({ id: t.id, rating })}>
                          Save
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="td text-center text-navy-500 py-10" colSpan={8}>No tickets logged.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sla' && (
        <div className="space-y-5">
          {can('sla:write') && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-4">New SLA agreement</h2>
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    onSubmit={(e) => { e.preventDefault(); createSla.mutate(); }}>
                <label className="sm:col-span-2">
                  <span className="label">Client *</span>
                  <select className="input" required value={slaForm.clientId}
                          onChange={(e) => setSlaForm({ ...slaForm, clientId: e.target.value })}>
                    <option value="">Select a client…</option>
                    {(clients.data?.items ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.clientCode} — {c.companyName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Title *</span>
                  <input className="input" required value={slaForm.title}
                         onChange={(e) => setSlaForm({ ...slaForm, title: e.target.value })} />
                </label>
                <label>
                  <span className="label">Response hours</span>
                  <input className="input" type="number" min="1" value={slaForm.responseHours}
                         onChange={(e) => setSlaForm({ ...slaForm, responseHours: e.target.value })} />
                </label>
                <label>
                  <span className="label">Resolution hours</span>
                  <input className="input" type="number" min="1" value={slaForm.resolutionHours}
                         onChange={(e) => setSlaForm({ ...slaForm, resolutionHours: e.target.value })} />
                </label>
                <label>
                  <span className="label">Start date *</span>
                  <input className="input" type="date" required value={slaForm.startDate}
                         onChange={(e) => setSlaForm({ ...slaForm, startDate: e.target.value })} />
                </label>
                <div className="sm:col-span-2 lg:col-span-3">
                  <button className="btn-primary" disabled={createSla.isPending}>
                    {createSla.isPending ? 'Saving…' : 'Create SLA'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-navy-50 border-b border-navy-100">
                <tr>
                  <th className="th">Agreement</th>
                  <th className="th">Title</th>
                  <th className="th">Response</th>
                  <th className="th">Resolution</th>
                  <th className="th">Uptime</th>
                  <th className="th">From</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {(slas.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="td font-mono text-xs">{a.agreementNo}</td>
                    <td className="td">{a.title}</td>
                    <td className="td text-xs">{a.responseHours}h</td>
                    <td className="td text-xs">{a.resolutionHours}h</td>
                    <td className="td text-xs">{a.uptimeTarget ? `${a.uptimeTarget}%` : '—'}</td>
                    <td className="td text-xs">{dateOnly(a.startDate)}</td>
                    <td className="td"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
                {(slas.data ?? []).length === 0 && (
                  <tr><td className="td text-center text-navy-500 py-10" colSpan={7}>No SLA agreements yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
