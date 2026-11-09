import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, Quotation, inr } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';
import { Plus } from 'lucide-react';

export default function Quotations() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['quotations'], queryFn: () => api.get<Quotation[]>('/quotations') });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Quotations</h1>
          <p className="text-sm text-navy-500 mt-1">{q.data?.length ?? 0} quotations</p>
        </div>
        {can('quotation:write') && (
          <Link to="/quotations/new" className="btn-primary ml-auto"><Plus size={16} /> New quotation</Link>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-navy-50/60">
            <tr>
              <th className="th">Number</th><th className="th">Customer</th><th className="th">Status</th>
              <th className="th text-right">Subtotal</th><th className="th text-right">Before tax</th>
              <th className="th text-right">Tax</th><th className="th text-right">Grand total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {q.data?.map((x) => (
              <tr key={x.id} className="hover:bg-navy-50/40">
                <td className="td font-mono text-xs">{x.quotationNo}<span className="text-navy-300">/{x.revision}</span></td>
                <td className="td font-medium">{x.customerName}</td>
                <td className="td"><StatusBadge status={x.status} /></td>
                <td className="td text-right">{inr(x.subtotal)}</td>
                <td className="td text-right">{inr(x.amountBeforeTax)}</td>
                <td className="td text-right">{inr(x.taxAmount)}</td>
                <td className="td text-right font-semibold">{inr(x.grandTotal)}</td>
              </tr>
            ))}
            {q.data && !q.data.length && (
              <tr><td className="td text-navy-400" colSpan={7}>No quotations yet. Create one to see the wage engine in action.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
