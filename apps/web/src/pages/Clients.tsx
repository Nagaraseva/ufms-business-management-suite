import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, ArrowUpRight } from 'lucide-react';
import { api, ApiFailure, Client } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

export default function Clients() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const blank = {
    companyName: '', legalName: '', gstin: '', pan: '',
    billingAddress: '', serviceAddress: '', primaryEmail: '', primaryPhone: '', paymentTerms: 'Net 30',
  };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const list = useQuery({
    queryKey: ['clients', q],
    queryFn: () => api.get<{ items: Client[]; total: number }>(
      `/clients?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),
  });

  const create = useMutation({
    mutationFn: () => api.post<Client>('/clients', {
      companyName: form.companyName,
      legalName: form.legalName || undefined,
      gstin: form.gstin || undefined,
      pan: form.pan || undefined,
      billingAddress: form.billingAddress || undefined,
      serviceAddress: form.serviceAddress || undefined,
      primaryEmail: form.primaryEmail || undefined,
      primaryPhone: form.primaryPhone || undefined,
      paymentTerms: form.paymentTerms || undefined,
    }),
    onSuccess: () => {
      setShowForm(false); setError(''); setForm(blank);
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save the client'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Clients</h1>
          <p className="text-sm text-navy-500 mt-1">
            {list.data?.total ?? 0} client{(list.data?.total ?? 0) === 1 ? '' : 's'} · a client never needs a Lead
          </p>
        </div>
        {can('client:write') && (
          <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> New client
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-1">New client</h2>
          <p className="text-xs text-navy-500 mb-4">The client code is allocated automatically (CLT-NNNN).</p>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <label className="sm:col-span-2">
              <span className="label">Company name *</span>
              <input className="input" required value={form.companyName} onChange={set('companyName')} />
            </label>
            <label>
              <span className="label">Legal name</span>
              <input className="input" value={form.legalName} onChange={set('legalName')} />
            </label>
            <label>
              <span className="label">GSTIN</span>
              <input className="input font-mono" placeholder="29AABCM1234N1Z5" value={form.gstin} onChange={set('gstin')} />
            </label>
            <label>
              <span className="label">PAN</span>
              <input className="input font-mono" placeholder="AABCM1234N" value={form.pan} onChange={set('pan')} />
            </label>
            <label>
              <span className="label">Primary email</span>
              <input className="input" type="email" value={form.primaryEmail} onChange={set('primaryEmail')} />
            </label>
            <label>
              <span className="label">Primary phone</span>
              <input className="input" value={form.primaryPhone} onChange={set('primaryPhone')} />
            </label>
            <label>
              <span className="label">Payment terms</span>
              <input className="input" value={form.paymentTerms} onChange={set('paymentTerms')} />
            </label>
            <label>
              <span className="label">Billing address</span>
              <input className="input" value={form.billingAddress} onChange={set('billingAddress')} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Service address</span>
              <input className="input" value={form.serviceAddress} onChange={set('serviceAddress')} />
            </label>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
              <button className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create client'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card p-4">
        <label>
          <span className="label">Search</span>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input className="input pl-9" placeholder="Name, code, GSTIN or email"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="bg-navy-50 border-b border-navy-100">
            <tr>
              <th className="th">Code</th>
              <th className="th">Client</th>
              <th className="th">GSTIN</th>
              <th className="th">Contact</th>
              <th className="th text-right">Contracts</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {(list.data?.items ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-navy-50/60">
                <td className="td font-mono text-xs">{c.clientCode}</td>
                <td className="td">
                  <div className="font-medium text-navy-800">{c.companyName}</div>
                  {c.legalName && c.legalName !== c.companyName && (
                    <div className="text-xs text-navy-500">{c.legalName}</div>
                  )}
                </td>
                <td className="td font-mono text-xs">{c.gstin || '—'}</td>
                <td className="td text-xs">
                  {c.primaryEmail || '—'}
                  {c.primaryPhone && <div className="text-navy-500">{c.primaryPhone}</div>}
                </td>
                <td className="td text-right tabular-nums">{c._count?.contracts ?? 0}</td>
                <td className="td"><StatusBadge status={c.status} /></td>
                <td className="td">
                  <Link to={`/clients/${c.id}`} className="text-brand-500 hover:text-brand-600 inline-flex items-center gap-1 text-sm font-medium">
                    Open <ArrowUpRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr><td className="td text-center text-navy-500 py-10" colSpan={7}>
                No clients yet. A won quotation or a manual entry creates one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
