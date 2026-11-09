import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, CalendarClock, CheckCircle2, Truck } from 'lucide-react';
import { api, ApiFailure, Client, Contract, inr, dateOnly } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

/**
 * Contracts and mobilisation.
 *
 * The two guards shown on screen mirror the server exactly: a contract must be
 * ACTIVE before the mobilise action appears, and once mobilised it never
 * reappears. The server re-checks both — the UI only avoids a pointless click.
 */
export default function Contracts() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState('');
  const blank = {
    clientId: '', serviceType: 'Housekeeping', contractValue: '',
    startDate: '', endDate: '', paymentTerms: 'Net 30', serviceScope: '',
  };
  const [form, setForm] = useState(blank);

  const contracts = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.get<{ items: Contract[]; total: number }>('/contracts?pageSize=100'),
  });

  const expiring = useQuery({
    queryKey: ['contracts-expiring'],
    queryFn: () => api.get<Contract[]>('/contracts/expiring'),
  });

  const clients = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<{ items: Client[] }>('/clients?pageSize=100'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['contracts-expiring'] });
  };

  const create = useMutation({
    mutationFn: () => api.post<Contract>('/contracts', {
      clientId: form.clientId,
      serviceType: form.serviceType || undefined,
      contractValue: form.contractValue ? Number(form.contractValue) : undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      paymentTerms: form.paymentTerms || undefined,
      serviceScope: form.serviceScope || undefined,
    }),
    onSuccess: () => {
      setShowForm(false); setError(''); setForm(blank); refresh();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save the contract'),
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.patch<Contract>(`/contracts/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: () => { setRowError(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not activate'),
  });

  const mobilise = useMutation({
    mutationFn: (id: string) => api.post<Contract>(`/contracts/${id}/mobilise`),
    onSuccess: () => { setRowError(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not mobilise'),
  });

  const soon = expiring.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Contracts</h1>
          <p className="text-sm text-navy-500 mt-1">
            {contracts.data?.total ?? 0} contract{(contracts.data?.total ?? 0) === 1 ? '' : 's'} on record
          </p>
        </div>
        {can('contract:write') && (
          <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> New contract
          </button>
        )}
      </div>

      {soon.length > 0 && (
        <div className="card p-4 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <CalendarClock size={16} /> {soon.length} renewal{soon.length === 1 ? '' : 's'} inside the alert window
          </div>
          <ul className="mt-2 space-y-1">
            {soon.slice(0, 5).map((c) => (
              <li key={c.id} className="text-sm text-navy-600">
                <span className="font-mono text-xs">{c.contractNo}</span> · {c.client?.companyName} ·{' '}
                <span className={c.daysLeft !== undefined && c.daysLeft < 0 ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>
                  {c.daysLeft !== undefined && c.daysLeft < 0
                    ? `${Math.abs(c.daysLeft)} days overdue`
                    : `${c.daysLeft} days left`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-1">New contract</h2>
          <p className="text-xs text-navy-500 mb-4">
            New contracts start in DRAFT. Activate, then mobilise when operations take over.
          </p>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <label className="sm:col-span-2">
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
              <span className="label">Service type</span>
              <input className="input" value={form.serviceType}
                     onChange={(e) => setForm({ ...form, serviceType: e.target.value })} />
            </label>
            <label>
              <span className="label">Start date *</span>
              <input className="input" type="date" required value={form.startDate}
                     onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label>
              <span className="label">End date *</span>
              <input className="input" type="date" required value={form.endDate}
                     onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </label>
            <label>
              <span className="label">Contract value (₹)</span>
              <input className="input" type="number" min="0" value={form.contractValue}
                     onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
            </label>
            <label>
              <span className="label">Payment terms</span>
              <input className="input" value={form.paymentTerms}
                     onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
            </label>
            <label className="sm:col-span-2 lg:col-span-3">
              <span className="label">Service scope</span>
              <textarea className="input" rows={2} value={form.serviceScope}
                        onChange={(e) => setForm({ ...form, serviceScope: e.target.value })} />
            </label>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
              <button className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create contract'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {rowError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{rowError}</div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-navy-50 border-b border-navy-100">
            <tr>
              <th className="th">Contract</th>
              <th className="th">Client</th>
              <th className="th">Period</th>
              <th className="th text-right">Value</th>
              <th className="th">Status</th>
              <th className="th">Mobilisation</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {(contracts.data?.items ?? []).map((k) => (
              <tr key={k.id} className="hover:bg-navy-50/60">
                <td className="td font-mono text-xs">{k.contractNo}</td>
                <td className="td">
                  <div className="font-medium text-navy-800">{k.client?.companyName ?? '—'}</div>
                  <div className="text-xs text-navy-500">{k.serviceType || 'General'}</div>
                </td>
                <td className="td text-xs whitespace-nowrap">{dateOnly(k.startDate)} → {dateOnly(k.endDate)}</td>
                <td className="td text-right tabular-nums">{inr(k.contractValue)}</td>
                <td className="td"><StatusBadge status={k.status} /></td>
                <td className="td text-xs">
                  {k.mobilisedAt ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 size={13} /> {dateOnly(k.mobilisedAt)}
                    </span>
                  ) : 'Not mobilised'}
                </td>
                <td className="td">
                  {can('contract:write') && k.status === 'DRAFT' && (
                    <button className="text-sm font-medium text-brand-500 hover:text-brand-600"
                            onClick={() => activate.mutate(k.id)} disabled={activate.isPending}>
                      Activate
                    </button>
                  )}
                  {can('contract:write') && k.status === 'ACTIVE' && !k.mobilisedAt && (
                    <button className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                            onClick={() => mobilise.mutate(k.id)} disabled={mobilise.isPending}>
                      <Truck size={14} /> Mobilise
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {contracts.data?.items.length === 0 && (
              <tr><td className="td text-center text-navy-500 py-10" colSpan={7}>No contracts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
