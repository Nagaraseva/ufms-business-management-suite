import { useQuery } from '@tanstack/react-query';
import { api, Survey } from '../lib/api';
import { StatusBadge } from './Dashboard';

export default function Surveys() {
  const q = useQuery({ queryKey: ['surveys'], queryFn: () => api.get<Survey[]>('/surveys') });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Site surveys</h1>
        <p className="text-sm text-navy-500 mt-1">{q.data?.length ?? 0} surveys</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-navy-50/60">
            <tr>
              <th className="th">Lead</th><th className="th">Customer</th><th className="th">Scheduled</th>
              <th className="th">Status</th><th className="th">Site contact</th><th className="th text-right">Manpower</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {q.data?.map((s) => (
              <tr key={s.id} className="hover:bg-navy-50/40">
                <td className="td font-mono text-xs">{s.leadNo}</td>
                <td className="td font-medium">{s.customerName}</td>
                <td className="td">{new Date(s.scheduledDate).toLocaleDateString('en-IN')}</td>
                <td className="td"><StatusBadge status={s.status} /></td>
                <td className="td">{s.siteContact ?? '—'}</td>
                <td className="td text-right">{s.manpowerRequired ?? '—'}</td>
              </tr>
            ))}
            {q.data && !q.data.length && (
              <tr><td className="td text-navy-400" colSpan={6}>No surveys scheduled.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
