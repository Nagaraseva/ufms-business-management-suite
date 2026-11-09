import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Lead, Followup } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';
import { ArrowLeft } from 'lucide-react';

export default function LeadDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [type, setType] = useState('CALL');
  const [newStatus, setNewStatus] = useState('');

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api.get<Lead>(`/leads/${id}`) });
  const followups = useQuery({
    queryKey: ['followups', id],
    queryFn: () => api.get<Followup[]>(`/leads/${id}/followups`),
  });

  const add = useMutation({
    mutationFn: () => api.post(`/leads/${id}/followups`, {
      type, notes, ...(newStatus ? { newStatus } : {}),
    }),
    onSuccess: () => {
      setNotes(''); setNewStatus('');
      qc.invalidateQueries({ queryKey: ['followups', id] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  if (lead.isLoading) return <div className="text-sm text-navy-500">Loading…</div>;
  if (lead.error) return <div className="text-sm text-red-600">Lead not found.</div>;
  const l = lead.data!;

  return (
    <div className="space-y-5">
      <Link to="/leads" className="inline-flex items-center gap-2 text-sm text-navy-500 hover:text-navy-800">
        <ArrowLeft size={15} /> Back to leads
      </Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="text-xs font-mono text-navy-400">{l.leadNo}</div>
            <h1 className="text-xl font-semibold text-navy-800 mt-1">{l.customerName}</h1>
            {l.companyName && <div className="text-sm text-navy-500">{l.companyName}</div>}
          </div>
          <div className="ml-auto"><StatusBadge status={l.status} /></div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3 mt-5 text-sm">
          <div><dt className="text-xs uppercase text-navy-400">Mobile</dt><dd className="mt-1">{l.mobile ?? '—'}</dd></div>
          <div><dt className="text-xs uppercase text-navy-400">Email</dt><dd className="mt-1">{l.email ?? '—'}</dd></div>
          <div><dt className="text-xs uppercase text-navy-400">Service</dt><dd className="mt-1">{l.serviceType ?? '—'}</dd></div>
        </dl>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {can('lead:write') && (
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Record a follow-up</h2>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                    {['CALL', 'EMAIL', 'VISIT', 'WHATSAPP', 'MEETING'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">New status</label>
                  <select className="input" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                    <option value="">Keep current</option>
                    {['CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'QUOTED', 'WON', 'LOST'].map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Notes *</label>
                <textarea required className="input" rows={3} value={notes}
                          onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed?" />
              </div>
              <button className="btn-primary" disabled={add.isPending || !notes.trim()}>
                {add.isPending ? 'Saving…' : 'Add follow-up'}
              </button>
            </form>
          </div>
        )}

        <div className="card">
          <div className="px-5 py-4 border-b border-navy-100">
            <h2 className="font-semibold text-navy-800">Follow-up history</h2>
          </div>
          <ul className="divide-y divide-navy-50">
            {followups.data?.map((f) => (
              <li key={f.id} className="px-5 py-4">
                <div className="flex items-center gap-2 text-xs text-navy-400">
                  <span className="badge bg-navy-100 text-navy-600">{f.type}</span>
                  {f.outcome && <span>{f.outcome}</span>}
                  <span className="ml-auto">{new Date(f.createdAt).toLocaleString('en-IN')}</span>
                </div>
                <p className="mt-2 text-sm text-navy-700">{f.notes}</p>
                {f.newStatus && <div className="mt-2"><StatusBadge status={f.newStatus} /></div>}
              </li>
            ))}
            {!followups.data?.length && (
              <li className="px-5 py-8 text-sm text-navy-400 text-center">No follow-ups recorded yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
