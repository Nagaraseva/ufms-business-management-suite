import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, ApiFailure, Client, ClientContact, Contract, inr, dateOnly } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

type Detail = Client & { contacts: ClientContact[]; contracts: Contract[] };

export default function ClientDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [contact, setContact] = useState({ name: '', designation: '', email: '', mobile: '', isPrimary: false });

  const client = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<Detail>(`/clients/${id}`),
  });

  const addContact = useMutation({
    mutationFn: () => api.post<ClientContact>(`/clients/${id}/contacts`, {
      name: contact.name,
      designation: contact.designation || undefined,
      email: contact.email || undefined,
      mobile: contact.mobile || undefined,
      isPrimary: contact.isPrimary,
    }),
    onSuccess: () => {
      setError('');
      setContact({ name: '', designation: '', email: '', mobile: '', isPrimary: false });
      qc.invalidateQueries({ queryKey: ['client', id] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not add the contact'),
  });

  const c = client.data;
  if (client.isLoading) return <div className="text-sm text-navy-500">Loading client…</div>;
  if (!c) return <div className="text-sm text-red-600">Client not found.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link to="/clients" className="btn-ghost"><ArrowLeft size={15} /> Back</Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-navy-500">{c.clientCode}</span>
            <StatusBadge status={c.status} />
          </div>
          <h1 className="text-2xl font-semibold text-navy-800 mt-1">{c.companyName}</h1>
          {c.legalName && c.legalName !== c.companyName && (
            <p className="text-sm text-navy-500">{c.legalName}</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Contract history</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-navy-100">
                  <tr>
                    <th className="th">Contract</th>
                    <th className="th">Period</th>
                    <th className="th text-right">Value</th>
                    <th className="th">Status</th>
                    <th className="th">Mobilised</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {c.contracts.map((k) => (
                    <tr key={k.id}>
                      <td className="td font-mono text-xs">{k.contractNo}</td>
                      <td className="td text-xs whitespace-nowrap">
                        {dateOnly(k.startDate)} → {dateOnly(k.endDate)}
                      </td>
                      <td className="td text-right tabular-nums">{inr(k.contractValue)}</td>
                      <td className="td"><StatusBadge status={k.status} /></td>
                      <td className="td text-xs">{k.mobilisedAt ? dateOnly(k.mobilisedAt) : '—'}</td>
                    </tr>
                  ))}
                  {c.contracts.length === 0 && (
                    <tr><td className="td text-center text-navy-500 py-8" colSpan={5}>
                      No contracts yet. <Link to="/contracts" className="text-brand-500">Create one</Link>.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Contacts</h2>
            <ul className="divide-y divide-navy-100">
              {c.contacts.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-navy-800">
                      {p.name}
                      {p.isPrimary && <span className="ml-2 badge bg-brand-50 text-brand-600">Primary</span>}
                    </div>
                    <div className="text-xs text-navy-500">
                      {[p.designation, p.email, p.mobile].filter(Boolean).join(' · ') || 'No contact details'}
                    </div>
                  </div>
                </li>
              ))}
              {c.contacts.length === 0 && <li className="py-3 text-sm text-navy-500">No contacts recorded.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Billing details</h2>
            <dl className="space-y-3">
              {([
                ['GSTIN', c.gstin || '—'],
                ['PAN', c.pan || '—'],
                ['Payment terms', c.paymentTerms || '—'],
                ['Billing address', c.billingAddress || '—'],
                ['Service address', c.serviceAddress || '—'],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{k}</dt>
                  <dd className="text-sm text-navy-700 mt-0.5 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {can('client:write') && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-4">Add a contact</h2>
              {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addContact.mutate(); }}>
                <label>
                  <span className="label">Name *</span>
                  <input className="input" required value={contact.name}
                         onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                </label>
                <label>
                  <span className="label">Designation</span>
                  <input className="input" value={contact.designation}
                         onChange={(e) => setContact({ ...contact, designation: e.target.value })} />
                </label>
                <label>
                  <span className="label">Email</span>
                  <input className="input" type="email" value={contact.email}
                         onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                </label>
                <label>
                  <span className="label">Mobile</span>
                  <input className="input" value={contact.mobile}
                         onChange={(e) => setContact({ ...contact, mobile: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-sm text-navy-600">
                  <input type="checkbox" checked={contact.isPrimary}
                         onChange={(e) => setContact({ ...contact, isPrimary: e.target.checked })} />
                  Primary contact
                </label>
                <button className="btn-primary w-full" disabled={addContact.isPending}>
                  <Plus size={15} /> {addContact.isPending ? 'Saving…' : 'Add contact'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
