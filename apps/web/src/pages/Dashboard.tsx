import { useQuery } from '@tanstack/react-query';
import { api, inr, Lead, Quotation } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Users2, FileText, ClipboardList, TrendingUp } from 'lucide-react';

function Stat({ icon: Icon, label, value, hint }: any) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-navy-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-navy-800">{value}</div>
          {hint && <div className="mt-1 text-xs text-navy-400">{hint}</div>}
        </div>
        <div className="h-10 w-10 rounded-lg bg-brand-50 grid place-items-center text-brand-500">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { me, can } = useAuth();

  const leads = useQuery({
    queryKey: ['leads', 'summary'],
    queryFn: () => api.get<{ items: Lead[]; total: number }>('/leads?pageSize=100'),
    enabled: can('lead:read'),
  });
  const quotes = useQuery({
    queryKey: ['quotations', 'summary'],
    queryFn: () => api.get<Quotation[]>('/quotations'),
    enabled: can('quotation:read'),
  });
  const surveys = useQuery({
    queryKey: ['surveys', 'summary'],
    queryFn: () => api.get<any[]>('/surveys'),
    enabled: can('survey:read'),
  });

  const pipeline = (leads.data?.items ?? []).reduce((sum, l) => {
    const won = l.status === 'WON';
    return { won: sum.won + (won ? 1 : 0), open: sum.open + (won || l.status === 'LOST' ? 0 : 1) };
  }, { won: 0, open: 0 });

  const quotedValue = (quotes.data ?? []).reduce((s, q) => s + Number(q.grandTotal || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Dashboard</h1>
        <p className="text-sm text-navy-500 mt-1">
          {me?.tenant.displayName} · signed in as {me?.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users2} label="Leads" value={leads.data?.total ?? '—'} hint={`${pipeline.open} open · ${pipeline.won} won`} />
        <Stat icon={ClipboardList} label="Surveys" value={surveys.data?.length ?? '—'} hint="scheduled & completed" />
        <Stat icon={FileText} label="Quotations" value={quotes.data?.length ?? '—'} hint="all revisions" />
        <Stat icon={TrendingUp} label="Quoted value" value={inr(quotedValue)} hint="grand total, excl. tax" />
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between">
          <h2 className="font-semibold text-navy-800">Recent quotations</h2>
          <span className="text-xs text-navy-400">latest 5</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-navy-50/60">
              <tr>
                <th className="th">Number</th><th className="th">Customer</th>
                <th className="th">Status</th><th className="th text-right">Grand total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {(quotes.data ?? []).slice(0, 5).map((q) => (
                <tr key={q.id}>
                  <td className="td font-mono text-xs">{q.quotationNo}</td>
                  <td className="td">{q.customerName}</td>
                  <td className="td"><StatusBadge status={q.status} /></td>
                  <td className="td text-right font-medium">{inr(q.grandTotal)}</td>
                </tr>
              ))}
              {!quotes.data?.length && (
                <tr><td className="td text-navy-400" colSpan={4}>No quotations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    NEW: 'bg-blue-50 text-blue-700', CONTACTED: 'bg-amber-50 text-amber-700',
    QUALIFIED: 'bg-indigo-50 text-indigo-700', SURVEY_SCHEDULED: 'bg-purple-50 text-purple-700',
    QUOTED: 'bg-cyan-50 text-cyan-700', WON: 'bg-emerald-50 text-emerald-700',
    LOST: 'bg-red-50 text-red-700', DRAFT: 'bg-navy-100 text-navy-600',
    PENDING_APPROVAL: 'bg-amber-50 text-amber-700', APPROVED: 'bg-emerald-50 text-emerald-700',
    SENT: 'bg-blue-50 text-blue-700', SCHEDULED: 'bg-blue-50 text-blue-700',
    COMPLETED: 'bg-emerald-50 text-emerald-700', CANCELLED: 'bg-red-50 text-red-700',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
    // tenders
    DOCUMENTS_PENDING: 'bg-amber-50 text-amber-700',
    READY_TO_SUBMIT: 'bg-sky-50 text-sky-700',
    SUBMITTED: 'bg-blue-50 text-blue-700',
    TECHNICALLY_QUALIFIED: 'bg-indigo-50 text-indigo-700',
    FINANCIALLY_WON: 'bg-emerald-50 text-emerald-700',
    ON_HOLD: 'bg-navy-100 text-navy-600',
    // contracts
    ACTIVE: 'bg-emerald-50 text-emerald-700',
    EXPIRING: 'bg-amber-50 text-amber-700',
    EXPIRED: 'bg-navy-100 text-navy-600',
    TERMINATED: 'bg-red-50 text-red-700',
    RENEWED: 'bg-emerald-50 text-emerald-700',
    // client care
    OPEN: 'bg-blue-50 text-blue-700',
    ASSIGNED: 'bg-indigo-50 text-indigo-700',
    RESOLVED: 'bg-emerald-50 text-emerald-700',
    CLOSED: 'bg-navy-100 text-navy-600',
    ESCALATED: 'bg-red-50 text-red-700',
    REOPENED: 'bg-amber-50 text-amber-700',
    HIGH: 'bg-orange-50 text-orange-700',
    CRITICAL: 'bg-red-50 text-red-700',
    // workforce (ON_HOLD already defined above)
    NOTICE_PERIOD: 'bg-amber-50 text-amber-700',
    LEFT: 'bg-red-50 text-red-700',
    RELEASED: 'bg-navy-100 text-navy-600',
    REPLACED: 'bg-indigo-50 text-indigo-700',
    // statutory
    PROVISIONAL: 'bg-amber-50 text-amber-700',
    CONFIRMED: 'bg-emerald-50 text-emerald-700',
    CONTESTED: 'bg-red-50 text-red-700',
  };
  return <span className={`badge ${tone[status] ?? 'bg-navy-100 text-navy-600'}`}>{status.replace(/_/g, ' ')}</span>;
}
