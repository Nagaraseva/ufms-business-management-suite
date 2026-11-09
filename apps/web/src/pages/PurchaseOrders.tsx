import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiFailure, inr, dateOnly, Vendor } from '../lib/api';

export default function PurchaseOrders(){
  const qc=useQueryClient();
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const fail=(e:unknown)=> setError(e instanceof ApiFailure? e.error.message: 'Request failed');

  const list = useQuery({ queryKey:['purchase-orders'], queryFn:()=> api.get<{items:any[],total:number}>('/purchase-orders?pageSize=200') });
  const vendors = useQuery({ queryKey:['vendor-options-po'], queryFn:()=> api.get<Vendor[] | {items:Vendor[]}>('/vendors/options').then(r=> Array.isArray(r)?r:(r as any).items??[] ) });

  const [show,setShow]=useState(false);
  const [form,setForm]=useState({ vendorId:'', vendorName:'', expectedDeliveryDate:'', notes:'', items:[{ description:'', quantity:'1', unit:'Nos', rate:'', taxPercent:'18' }] });
  const addRow=()=> setForm({...form, items:[...form.items,{description:'',quantity:'1',unit:'Nos',rate:'',taxPercent:'18'}]});
  const rmRow=(i:number)=> setForm({...form, items: form.items.filter((_,k)=>k!==i)});
  const setIt=(i:number,k:string,v:string)=> setForm({...form, items: form.items.map((r,idx)=> idx===i? {...r,[k]:v}:r)});

  const today = new Date().toISOString().slice(0,10);
  const create = useMutation({
    mutationFn:()=> api.post('/purchase-orders', {
      poDate: today,
      vendorId: form.vendorId,
      expectedDeliveryDate: form.expectedDeliveryDate||undefined,
      notes: form.notes||undefined,
      items: form.items.filter(r=>r.description.trim()).map(r=>({ stockItemId: (r as any).stockItemId || form.vendorId, itemName: r.description, quantity: Number(r.quantity), unit: r.unit||undefined, unitCost: Number(r.rate), taxPercent: Number((r as any).taxPercent||0) })),
    }),
    onSuccess:()=>{ setShow(false); setForm({vendorId:'',vendorName:'',expectedDeliveryDate:'',notes:'',items:[{description:'',quantity:'1',unit:'Nos',rate:'',taxPercent:'18'}]}); qc.invalidateQueries({queryKey:['purchase-orders']}); setNotice('Purchase order created as draft.'); setError(''); },
    onError: fail,
  });
  const act = (id:string, action:string)=> api.post(`/purchase-orders/${id}/${action}`, {});

  const doAction = useMutation({
    mutationFn:({id,action}:{id:string,action:string})=> api.post(`/purchase-orders/${id}/${action}`, {}),
    onSuccess:(_,v)=>{ qc.invalidateQueries({queryKey:['purchase-orders']}); setNotice(`PO ${v.action} succeeded.`); setError(''); },
    onError: fail,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Purchase Orders</h1>
          <p className="text-sm text-navy-500 mt-1">Draft → Released → Acknowledged → Received. Receiving a PO creates a stock purchase automatically.</p>
        </div>
        <button className="btn-primary ml-auto" onClick={()=>setShow(!show)}>+ New PO</button>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {show && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">New purchase order</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <label><span className="label">Vendor *</span>
              <select className="input" value={form.vendorId} onChange={e=>{
                const v = vendors.data?.find(x=>x.id===e.target.value);
                setForm({...form, vendorId:e.target.value, vendorName: v?.vendorName ?? ''});
              }}>
                <option value="">— Select vendor —</option>{(vendors.data??[]).map(v=> <option key={v.id} value={v.id}>{v.vendorName} ({v.vendorCode})</option>)}
              </select>
            </label>
            {!form.vendorId && <label><span className="label">Or type vendor name</span><input className="input" value={form.vendorName} onChange={e=>setForm({...form,vendorName:e.target.value})} placeholder="Vendor name" /></label>}
            <label><span className="label">Expected delivery</span><input className="input" type="date" value={form.expectedDeliveryDate} onChange={e=>setForm({...form,expectedDeliveryDate:e.target.value})} /></label>
          </div>
          <label><span className="label">Notes</span><input className="input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label>
          <div>
            <div className="flex items-center justify-between mb-2"><span className="label">Line items</span><button className="btn-ghost text-xs" onClick={addRow}>+ Add line</button></div>
            {form.items.map((r,i)=>(
              <div key={i} className="grid grid-cols-[1fr_70px_90px_60px_auto] gap-2 mb-2">
                <input className="input" placeholder="Description *" value={r.description} onChange={e=>setIt(i,'description',e.target.value)} />
                <input className="input" type="number" placeholder="Qty" value={r.quantity} onChange={e=>setIt(i,'quantity',e.target.value)} />
                <input className="input" type="number" placeholder="Rate (₹)" value={r.rate} onChange={e=>setIt(i,'rate',e.target.value)} />
                <input className="input" type="number" placeholder="Tax %" value={r.taxPercent} onChange={e=>setIt(i,'taxPercent',e.target.value)} />
                <button className="text-xs text-red-600" onClick={()=>rmRow(i)} disabled={form.items.length===1}>Remove</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2"><button className="btn-primary" disabled={create.isPending || (!form.vendorId && !form.vendorName.trim())} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Create PO'}</button><button className="btn-ghost" onClick={()=>setShow(false)}>Cancel</button></div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-4 py-2">PO No</th><th className="text-left px-2 py-2">Vendor</th><th className="text-left px-2 py-2">PO date</th><th className="text-right px-2 py-2">Total</th><th className="text-left px-2 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {(list.data?.items??[]).map((po:any)=>(
              <tr key={po.id} className="border-t border-navy-100 hover:bg-navy-50/40">
                <td className="px-4 py-2 font-mono text-xs">{po.poNo}</td>
                <td className="px-2 py-2">{po.vendor?.vendorName ?? po.vendorName ?? '—'}</td>
                <td className="px-2 py-2 text-xs">{dateOnly(po.poDate)}</td>
                <td className="px-2 py-2 text-right font-semibold">{inr(po.totalAmount)}</td>
                <td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${poTone(po.status)}`}>{po.status}</span></td>
                <td className="px-4 py-2 text-right flex gap-1 justify-end flex-wrap">
                  {po.status==='DRAFT' && <button className="text-xs text-brand-600 hover:underline" onClick={()=>doAction.mutate({id:po.id, action:'release'})}>Release</button>}
                  {po.status==='DRAFT' && <button className="text-xs text-red-600 hover:underline" onClick={()=>doAction.mutate({id:po.id, action:'cancel'})}>Cancel</button>}
                  {po.status==='RELEASED' && <button className="text-xs text-emerald-700 hover:underline" onClick={()=>doAction.mutate({id:po.id, action:'acknowledge'})}>Acknowledge</button>}
                  {po.status==='ACKNOWLEDGED' && <button className="text-xs text-emerald-700 hover:underline" onClick={()=>doAction.mutate({id:po.id, action:'receive'})}>Receive → Stock</button>}
                  <a href={`/api/v1/purchase-orders/${po.id}/html`} target="_blank" rel="noreferrer" className="text-xs text-navy-500 hover:text-navy-700">Print</a>
                </td>
              </tr>
            ))}
            {!list.data?.items.length && !list.isLoading && <tr><td colSpan={6} className="text-center py-8 text-navy-400 text-sm">No purchase orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function poTone(s:string){
  if(s==='RELEASED') return 'bg-sky-100 text-sky-800';
  if(s==='ACKNOWLEDGED') return 'bg-amber-100 text-amber-800';
  if(s==='RECEIVED') return 'bg-emerald-100 text-emerald-800';
  if(s==='CANCELLED') return 'bg-navy-100 text-navy-600';
  return 'bg-navy-100 text-navy-700';
}
