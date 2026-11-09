import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiFailure } from '../lib/api';

export default function InvoiceForm() {
  const nav = useNavigate();
  const [error,setError]=useState('');
  const [form,setForm]=useState({
    clientName:'', invoiceDate: new Date().toISOString().slice(0,10), dueDate: new Date(Date.now()+15*864e5).toISOString().slice(0,10),
    taxPercent:'18', notes:'',
    items:[{ description:'', quantity:'1', unit:'Nos', rate:'', taxPercent:'18' }],
  });
  const addRow=()=> setForm({...form, items:[...form.items,{description:'',quantity:'1',unit:'Nos',rate:'',taxPercent:'18'}]});
  const rmRow=(i:number)=> setForm({...form, items: form.items.filter((_,k)=>k!==i)});
  const setItem=(i:number,k:string,v:string)=> setForm({...form, items: form.items.map((r,idx)=> idx===i? {...r,[k]:v}:r)});

  const save = useMutation({
    mutationFn: ()=> api.post('/invoices', {
      clientName: form.clientName, invoiceDate: form.invoiceDate, dueDate: form.dueDate,
      taxPercent: form.taxPercent? Number(form.taxPercent): undefined,
      notes: form.notes||undefined,
      items: form.items.filter(r=>r.description.trim()).map(r=>({
        description:r.description, quantity: Number(r.quantity), unit: r.unit||undefined, rate: Number(r.rate), taxPercent: Number(r.taxPercent||0),
      })),
    }),
    onSuccess:(r:any)=> nav(`/finance/invoices/${r.id}`),
    onError:(e)=> setError(e instanceof ApiFailure? e.error.message : 'Could not save invoice'),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <button className="text-sm text-navy-500 hover:text-navy-700" onClick={()=>nav('/finance')}>← Back to Finance</button>
        <h1 className="text-xl font-semibold text-navy-900 mt-2">New invoice</h1>
        <p className="text-sm text-navy-500">The invoice number is allocated automatically. Totals use the same arithmetic as the server — subtotal, tax and grand total match.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label><span className="label">Client *</span><input className="input" value={form.clientName} onChange={e=>setForm({...form,clientName:e.target.value})} placeholder="Acme Corp" /></label>
          <label><span className="label">TAX % (default)</span><input className="input" type="number" value={form.taxPercent} onChange={e=>setForm({...form,taxPercent:e.target.value})} /></label>
          <label><span className="label">Invoice date *</span><input className="input" type="date" value={form.invoiceDate} onChange={e=>setForm({...form,invoiceDate:e.target.value})} /></label>
          <label><span className="label">Due date *</span><input className="input" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})} /></label>
          <label className="sm:col-span-2"><span className="label">Notes</span><input className="input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-navy-800">Line items</h3>
            <button type="button" className="btn-ghost text-xs" onClick={addRow}>+ Add line</button>
          </div>
          <div className="space-y-2">
            {form.items.map((r,i)=>(
              <div key={i} className="grid grid-cols-[1fr_80px_100px_70px_auto] gap-2 items-end">
                <label><span className="label text-[11px]">Description *</span><input className="input" value={r.description} onChange={e=>setItem(i,'description',e.target.value)} placeholder="Guarding service – March" /></label>
                <label><span className="label text-[11px]">Qty</span><input className="input" type="number" value={r.quantity} onChange={e=>setItem(i,'quantity',e.target.value)} /></label>
                <label><span className="label text-[11px]">Rate (₹)</span><input className="input" type="number" value={r.rate} onChange={e=>setItem(i,'rate',e.target.value)} /></label>
                <label><span className="label text-[11px]">Tax %</span><input className="input" type="number" value={r.taxPercent} onChange={e=>setItem(i,'taxPercent',e.target.value)} /></label>
                <button type="button" className="text-xs text-red-600 hover:text-red-700 pb-2" onClick={()=>rmRow(i)} disabled={form.items.length===1}>Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending || !form.clientName.trim()} onClick={()=>save.mutate()}>{save.isPending?'Saving…':'Create invoice'}</button>
          <button type="button" className="btn-ghost" onClick={()=>nav('/finance')}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
