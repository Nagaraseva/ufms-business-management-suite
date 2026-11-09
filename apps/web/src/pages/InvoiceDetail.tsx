import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiFailure, inr, dateOnly, Invoice } from '../lib/api';

export default function InvoiceDetail() {
  const { id } = useParams<{id:string}>();
  const qc = useQueryClient();
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState({ amount:'', mode:'NEFT', referenceNo:'', bankName:'' });

  const inv = useQuery({ queryKey:['invoice',id], queryFn:()=> api.get<Invoice>(`/invoices/${id}`), enabled:!!id });

  const record = useMutation({
    mutationFn:()=> api.post(`/invoices/${id}/receipts`, { amount: Number(receipt.amount), mode: receipt.mode, referenceNo: receipt.referenceNo, bankName: receipt.bankName || 'CASH' }),
    onSuccess:()=>{ setReceipt({amount:'',mode:'NEFT',referenceNo:'',bankName:''}); qc.invalidateQueries({queryKey:['invoice',id]}); setError(''); },
    onError:(e)=> setError(e instanceof ApiFailure? e.error.message: 'Could not record receipt'),
  });
  const cancel = useMutation({
    mutationFn:()=> api.post(`/invoices/${id}/cancel`, {}),
    onSuccess:()=> qc.invalidateQueries({queryKey:['invoice',id]}),
    onError:(e)=> setError(e instanceof ApiFailure? e.error.message: 'Could not cancel'),
  });

  if (inv.isLoading) return <div className="p-6 text-sm text-navy-500">Loading invoice…</div>;
  if (!inv.data) return <div className="p-6 text-sm text-red-700">Invoice not found.</div>;
  const d = inv.data;
  const total = Number(d.totalAmount), paid = Number(d.paidAmount), bal = total - paid;

  return (
    <div className="max-w-4xl space-y-4">
      <Link to="/finance" className="text-sm text-navy-500 hover:text-navy-700">← Finance</Link>
      <div className="card p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-navy-900 font-mono">{d.invoiceNo}</h1>
            <div className="text-sm text-navy-500">{d.clientName} · {dateOnly(d.invoiceDate)} → {dateOnly(d.dueDate)}</div>
          </div>
          <div className="text-right">
            <span className={`text-xs px-2 py-1 rounded ${tone(d.status)}`}>{d.status}</span>
            <div className="text-sm mt-1"><span className="text-navy-500">Total</span> <b>{inr(total)}</b> <span className="text-navy-400">| Paid</span> <b className="text-emerald-700">{inr(paid)}</b> <span className="text-navy-400">| Balance</span> <b>{inr(bal)}</b></div>
          </div>
        </div>

        {error && <div className="mt-3 rounded bg-red-50 border border-red-200 p-2 text-sm text-red-800">{error}</div>}

        <div className="mt-4 flex gap-2 flex-wrap">
          {d.status!=='CANCELLED' && d.status!=='PAID' && <button className="btn-ghost text-xs" disabled={cancel.isPending} onClick={()=>{ if(confirm('Cancel this invoice?')) cancel.mutate();}}>Cancel invoice</button>}
          <a href={`/api/v1/invoices/${d.id}/html`} target="_blank" rel="noreferrer" className="btn-ghost text-xs">Print / PDF</a>
        </div>

        <table className="w-full text-sm mt-5">
          <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-3 py-2">Description</th><th className="text-right px-2 py-2">Qty</th><th className="text-right px-2 py-2">Rate</th><th className="text-right px-2 py-2">Tax</th><th className="text-right px-3 py-2">Total</th></tr></thead>
          <tbody>
            {(d.items??[]).map(it=>(
              <tr key={it.id} className="border-t border-navy-100"><td className="px-3 py-2">{it.description}</td><td className="px-2 py-2 text-right">{it.quantity}</td><td className="px-2 py-2 text-right">{inr(it.rate)}</td><td className="px-2 py-2 text-right">{it.taxPercent}%</td><td className="px-3 py-2 text-right font-semibold">{inr(it.totalAmount)}</td></tr>
            ))}
            <tr className="border-t-2 border-navy-200 font-semibold"><td colSpan={4} className="px-3 py-2 text-right">Subtotal</td><td className="px-3 py-2 text-right">{inr(d.subTotal)}</td></tr>
            <tr><td colSpan={4} className="px-3 py-1 text-right text-xs text-navy-500">Tax {d.taxPercent}%</td><td className="px-3 py-1 text-right text-sm">{inr(d.taxAmount)}</td></tr>
            <tr className="border-t border-navy-200"><td colSpan={4} className="px-3 py-2 text-right font-bold">Grand total</td><td className="px-3 py-2 text-right font-bold">{inr(d.totalAmount)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-navy-800 text-sm mb-3">Receipts</h2>
        {(d.payments??[]).length===0 ? <div className="text-sm text-navy-400">No receipts yet.</div> :
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-3 py-2">Date</th><th className="text-right px-2 py-2">Amount</th><th className="text-left px-2 py-2">Mode</th><th className="text-left px-2 py-2">Reference</th><th className="text-left px-2 py-2">Status</th></tr></thead>
            <tbody>{d.payments?.map(p=>(
              <tr key={p.id} className="border-t border-navy-100"><td className="px-3 py-2 text-xs">{dateOnly(p.receivedDate)}</td><td className="px-2 py-2 text-right">{inr(p.amount)}</td><td className="px-2 py-2">{p.mode}</td><td className="px-2 py-2 font-mono text-xs">{p.referenceNo}</td><td className="px-2 py-2 text-xs">{p.approvalStatus}</td></tr>
            ))}</tbody>
          </table>}
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-navy-800 text-sm">Record a receipt</h2>
        <p className="text-xs text-navy-500">Receipts above ₹2,00,000 require approval.</p>
        <div className="grid sm:grid-cols-4 gap-2">
          <label><span className="label">Amount *</span><input className="input" type="number" value={receipt.amount} onChange={e=>setReceipt({...receipt,amount:e.target.value})} /></label>
          <label><span className="label">Mode</span><select className="input" value={receipt.mode} onChange={e=>setReceipt({...receipt,mode:e.target.value})}><option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>CHEQUE</option><option>CASH</option></select></label>
          <label><span className="label">Reference *</span><input className="input" value={receipt.referenceNo} onChange={e=>setReceipt({...receipt,referenceNo:e.target.value})} placeholder="UTR / cheque" /></label>
          <label><span className="label">Bank</span><input className="input" value={receipt.bankName} onChange={e=>setReceipt({...receipt,bankName:e.target.value})} placeholder="HDFC / CASH" /></label>
        </div>
        <button className="btn-primary" disabled={!receipt.amount || !receipt.referenceNo || record.isPending} onClick={()=>record.mutate()}>Record receipt</button>
      </div>
    </div>
  );
}
function tone(s:string){ if(s==='PAID') return 'bg-emerald-100 text-emerald-800'; if(s==='OVERDUE') return 'bg-red-100 text-red-700'; if(s==='PARTIALLY_PAID') return 'bg-amber-100 text-amber-800'; if(s==='CANCELLED') return 'bg-navy-100 text-navy-600'; return 'bg-navy-100 text-navy-700'; }
