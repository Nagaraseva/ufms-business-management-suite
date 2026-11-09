import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Trophy, XCircle, Clock } from 'lucide-react';
import {
  api, ApiFailure, Tender, TenderFollowup, TENDER_STATUSES, inr, dateOnly,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

type Detail = Tender & {
  followups: TenderFollowup[];
  order: { id: string; contractValue: string; status: string; createdAt: string } | null;
};

/**
 * Tender detail and follow-up log.
 *
 * The only write path is a follow-up: the status never changes on its own, and
 * a follow-up can never set NEW. Reaching FINANCIALLY_WON is what creates the
 * order record — the button below says so before you click it.
 */
export default function TenderDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [form, setForm] = useState({ status: 'DOCUMENTS_PENDING', notes: '', amountQuoted: '', nextFollowupAt: '' });

  const tender = useQuery({
    queryKey: ['tender', id],
    queryFn: () => api.get<Detail>(`/tenders/${id}`),
  });

  const addFollowup = useMutation({
    mutationFn: () => api.post<{ tender: Tender; orderId: string | null }>(`/tenders/${id}/followups`, {
      status: form.status,
      notes: form.notes,
      amountQuoted: form.amountQuoted ? Number(form.amountQuoted) : undefined,
      nextFollowupAt: form.nextFollowupAt || undefined,
    }),
    onSuccess: () => {
      setError('');
      setForm({ status: 'DOCUMENTS_PENDING', notes: '', amountQuoted: '', nextFollowupAt: '' });
      qc.invalidateQueries({ queryKey: ['tender', id] });
      qc.invalidateQueries({ queryKey: ['tenders'] });
      qc.invalidateQueries({ queryKey: ['tender-metrics'] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not record the follow-up'),
  });

  const t = tender.data;
  if (tender.isLoading) return <div className="text-sm text-navy-500">Loading tender…</div>;
  if (!t) return <div className="text-sm text-red-600">Tender not found.</div>;

  const closed = ['FINANCIALLY_WON', 'LOST', 'CANCELLED'].includes(t.status);
  const followupStatuses = TENDER_STATUSES.filter((s) => s !== 'NEW');

  const facts: Array<[string, string]> = [
    ['Portal', t.portal],
    ['Department', t.organization || '—'],
    ['Sector', t.sector],
    ['Location', t.location || '—'],
    ['Submission date', dateOnly(t.submissionDate)],
    ['Pre-bid date', dateOnly(t.preBidDate)],
    ['Opening date', dateOnly(t.openingDate)],
    ['Tenure', t.tenureMonths ? `${t.tenureMonths} months` : '—'],
    ['Manpower', t.manpowerCount || '—'],
    ['Tender fee', inr(t.tenderFee)],
    ['EMD', inr(t.emdAmount)],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link to="/tenders" className="btn-ghost"><ArrowLeft size={15} /> Back</Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-navy-500">{t.tenderNo}</span>
            <StatusBadge status={t.status} />
            {t.legacyTenderId && (
              <span className="font-mono text-[11px] text-navy-400" title="Migrated record identifier">
                legacy {t.legacyTenderId}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-navy-800 mt-1">{t.tenderTitle}</h1>
          <p className="text-sm text-navy-500 mt-1">
            Tender value <span className="font-semibold text-navy-700">{inr(t.tenderValue)}</span>
          </p>
        </div>
      </div>

      {t.status === 'FINANCIALLY_WON' && t.order && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
          <Trophy size={18} className="text-emerald-600 mt-0.5" />
          <div>
            <div className="font-semibold text-emerald-800 text-sm">Order created</div>
            <div className="text-xs text-emerald-700 mt-0.5">
              Contract value {inr(t.order.contractValue)} · recorded {dateOnly(t.order.createdAt)}
            </div>
          </div>
        </div>
      )}

      {t.resultReason && closed && (
        <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">Result reason</div>
          <div className="text-sm text-navy-700 mt-1">{t.resultReason}</div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Tender record</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{k}</dt>
                  <dd className="text-sm text-navy-700 mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
            {t.scope && (
              <div className="mt-4 pt-4 border-t border-navy-100">
                <div className="text-xs font-semibold uppercase tracking-wide text-navy-400">Scope of work</div>
                <p className="text-sm text-navy-700 mt-1 whitespace-pre-wrap">{t.scope}</p>
              </div>
            )}
            {t.documentsPending && (
              <div className="mt-4 pt-4 border-t border-navy-100">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Documents pending</div>
                <p className="text-sm text-navy-700 mt-1 whitespace-pre-wrap">{t.documentsPending}</p>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Follow-up log</h2>
            <ol className="space-y-4">
              {t.followups.map((f) => (
                <li key={f.id} className="flex gap-3">
                  <div className="mt-1 shrink-0">
                    {f.status === 'FINANCIALLY_WON' ? <Trophy size={16} className="text-emerald-600" />
                      : ['LOST', 'CANCELLED'].includes(f.status) ? <XCircle size={16} className="text-red-500" />
                      : <Clock size={16} className="text-navy-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={f.status} />
                      <span className="text-xs text-navy-400">{new Date(f.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-sm text-navy-700 mt-1 whitespace-pre-wrap">{f.notes}</p>
                    {f.documentsPending && (
                      <p className="text-xs text-amber-600 mt-1">Pending docs: {f.documentsPending}</p>
                    )}
                    {Number(f.amountQuoted) > 0 && (
                      <p className="text-xs text-navy-500 mt-1">Amount quoted: {inr(f.amountQuoted)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-5">
          {can('tender:write') ? (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-1">Record a follow-up</h2>
              <p className="text-xs text-navy-500 mb-4">
                The status only moves when you record why.
              </p>
              {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addFollowup.mutate(); }}>
                <label>
                  <span className="label">New status</span>
                  <select className="input" value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {followupStatuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                {form.status === 'FINANCIALLY_WON' && t.status !== 'FINANCIALLY_WON' && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                    <span>This will create the tender order record.</span>
                  </div>
                )}
                <label>
                  <span className="label">Notes *</span>
                  <textarea className="input" rows={3} required value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
                <label>
                  <span className="label">Amount quoted (₹)</span>
                  <input className="input" type="number" min="0" value={form.amountQuoted}
                         onChange={(e) => setForm({ ...form, amountQuoted: e.target.value })} />
                </label>
                <label>
                  <span className="label">Next follow-up</span>
                  <input className="input" type="date" value={form.nextFollowupAt}
                         onChange={(e) => setForm({ ...form, nextFollowupAt: e.target.value })} />
                </label>
                <button className="btn-primary w-full" disabled={addFollowup.isPending}>
                  {addFollowup.isPending ? 'Saving…' : 'Record follow-up'}
                </button>
              </form>
            </div>
          ) : (
            <div className="card p-5 text-sm text-navy-500">
              You have read-only access to this tender.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
