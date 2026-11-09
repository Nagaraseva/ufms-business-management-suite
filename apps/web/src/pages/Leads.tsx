import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, Lead, ApiFailure } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';
import { Plus, Search } from 'lucide-react';

export default function Leads() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: '', companyName: '', mobile: '', email: '', serviceType: 'Housekeeping' });
  const [error, setError] = useState('');

  const leads = useQuery({
    queryKey: ['leads', q, status],
    queryFn: () => api.get<{ items: Lead[]; total: number }>(
      `/leads?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`,
    ),
  });

  const create = useMutation({
    mutationFn: () => api.post<Lead>('/leads', {
      customerName: form.customerName,
      companyName: form.companyName || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      serviceType: form.serviceType || undefined,
    }),
    onSuccess: () => {
      setShowForm(false); setError('');
      setForm({ customerName: '', companyName: '', mobile: '', email: '', serviceType: 'Housekeeping' });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Leads</h1>
          <p className="text-sm text-navy-500 mt-1">{leads.data?.total ?? 0} in this workspace</p>
        </div>
        {can('lead:write') && (
          <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> New lead
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-4">New lead</h2>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          >
            <div><label className="label">Customer name *</label>
              <input required className="input" value={form.customerName}
                     onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
            <div><label className="label">Company</label>
              <input className="input" value={form.companyName}
                     onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
            <div><label className="label">Mobile</label>
              <input className="input" value={form.mobile}
                     onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
            <div><label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="sm:col-span-2 flex gap-2">
              <button className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create lead'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-navy-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
            <input className="input pl-9" placeholder="Search name, company, lead number…"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'QUOTED', 'WON', 'LOST'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-navy-50/60">
              <tr>
                <th className="th">Lead #</th><th className="th">Customer</th><th className="th">Service</th>
                <th className="th">Status</th><th className="th">Mobile</th><th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {leads.isLoading && <tr><td className="td" colSpan={6}>Loading…</td></tr>}
              {leads.data?.items.map((l) => (
                <tr key={l.id} className="hover:bg-navy-50/40">
                  <td className="td font-mono text-xs">
                    <Link to={`/leads/${l.id}`} className="text-brand-600 hover:underline">{l.leadNo}</Link>
                  </td>
                  <td className="td font-medium">
                    <Link to={`/leads/${l.id}`} className="hover:text-brand-600">{l.customerName}</Link>
                    {l.companyName && <div className="text-xs text-navy-400">{l.companyName}</div>}
                  </td>
                  <td className="td">{l.serviceType ?? '—'}</td>
                  <td className="td"><StatusBadge status={l.status} /></td>
                  <td className="td">{l.mobile ?? '—'}</td>
                  <td className="td text-navy-400">{new Date(l.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
              {leads.data && !leads.data.items.length && (
                <tr><td className="td text-navy-400" colSpan={6}>No leads match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
