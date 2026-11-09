import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiFailure, inr, StockItem } from '../lib/api';

export default function Stock(){
  const qc=useQueryClient();
  const [error,setError]=useState('');
  const fail=(e:unknown)=> setError(e instanceof ApiFailure? e.error.message: 'Request failed');

  const [itemForm,setItemForm]=useState({ itemName:'', sku:'', category:'', unit:'Nos', reorderLevel:'5', unitCost:'' });
  const items = useQuery({ queryKey:['stock-items'], queryFn:()=> api.get<{items:StockItem[],total:number}>('/stock-items?pageSize=200') });
  const lowStock = useQuery({ queryKey:['low-stock'], queryFn:()=> api.get<StockItem[]>('/stock-items/low-stock') });

  const createItem = useMutation({
    mutationFn:()=> api.post('/stock-items', { itemName: itemForm.itemName, itemCode: itemForm.sku||undefined, category: itemForm.category||undefined, unit: itemForm.unit||undefined, minStockLevel: itemForm.reorderLevel? Number(itemForm.reorderLevel): undefined, unitCost: itemForm.unitCost? Number(itemForm.unitCost): undefined }),
    onSuccess:()=>{ setItemForm({itemName:'',sku:'',category:'',unit:'Nos',reorderLevel:'5',unitCost:''}); qc.invalidateQueries({queryKey:['stock-items']}); qc.invalidateQueries({queryKey:['low-stock']}); setError(''); },
    onError: fail,
  });

  const [purchase,setPurchase]=useState({ stockItemId:'', quantity:'', unitCost:'', billNo:'' });
  const purchases = useQuery({ queryKey:['stock-purchases'], queryFn:()=> api.get<{items:any[],total:number}>('/stock-purchases?pageSize=100') });
  const today = new Date().toISOString().slice(0,10);
  const createPurchase = useMutation({
    mutationFn:()=> api.post('/stock-purchases', { purchaseDate: today, items: [{ stockItemId: purchase.stockItemId, quantity: Number(purchase.quantity), unitCost: Number(purchase.unitCost) }], invoiceNo: purchase.billNo||undefined }),
    onSuccess:()=>{ setPurchase({stockItemId:'',quantity:'',unitCost:'',billNo:''}); qc.invalidateQueries({queryKey:['stock-items']}); qc.invalidateQueries({queryKey:['stock-purchases']}); qc.invalidateQueries({queryKey:['low-stock']}); },
    onError: fail,
  });

  const [dist,setDist]=useState({ stockItemId:'', siteId:'', quantity:'', purpose:'' });
  const dists = useQuery({ queryKey:['stock-distributions'], queryFn:()=> api.get<{items:any[],total:number}>('/stock-distributions?pageSize=100') });
  const createDist = useMutation({
    mutationFn:()=> api.post('/stock-distributions', { stockItemId: dist.stockItemId, siteId: dist.siteId||undefined, quantity: Number(dist.quantity), purpose: dist.purpose||undefined }),
    onSuccess:()=>{ setDist({stockItemId:'',siteId:'',quantity:'',purpose:''}); qc.invalidateQueries({queryKey:['stock-items']}); qc.invalidateQueries({queryKey:['stock-distributions']}); },
    onError: fail,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Stock & Inventory</h1>
        <p className="text-sm text-navy-500 mt-1">Stock items, purchases that increase stock, and distributions that decrease it. Balance cannot go negative.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {(lowStock.data?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-800">⚠️ Low stock</div>
          <div className="text-xs text-amber-700 mt-1">{lowStock.data?.map(s=> `${s.itemName} (${(s as any).currentBalance ?? (s as any).currentStock} left, reorder at ${(s as any).minStockLevel ?? (s as any).reorderLevel})`).join(' · ')}</div>
        </div>
      )}

      <div className="card p-4">
        <h3 className="font-semibold text-navy-800 text-sm mb-3">Stock items</h3>
        <div className="grid sm:grid-cols-6 gap-2 mb-3">
          <input className="input" placeholder="Item name *" value={itemForm.itemName} onChange={e=>setItemForm({...itemForm,itemName:e.target.value})} />
          <input className="input font-mono text-sm" placeholder="SKU" value={itemForm.sku} onChange={e=>setItemForm({...itemForm,sku:e.target.value})} />
          <input className="input" placeholder="Category" value={itemForm.category} onChange={e=>setItemForm({...itemForm,category:e.target.value})} />
          <input className="input" placeholder="Unit" value={itemForm.unit} onChange={e=>setItemForm({...itemForm,unit:e.target.value})} />
          <input className="input" type="number" placeholder="Reorder level" value={itemForm.reorderLevel} onChange={e=>setItemForm({...itemForm,reorderLevel:e.target.value})} />
          <input className="input" type="number" placeholder="Unit cost (₹)" value={itemForm.unitCost} onChange={e=>setItemForm({...itemForm,unitCost:e.target.value})} />
        </div>
        <button className="btn-primary" disabled={!itemForm.itemName.trim() || createItem.isPending} onClick={()=>createItem.mutate()}>{createItem.isPending?'Saving…':'Add item'}</button>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-3 py-2">Item</th><th className="text-left px-2 py-2">SKU</th><th className="text-right px-2 py-2">Stock</th><th className="text-right px-2 py-2">Reorder at</th><th className="text-right px-2 py-2">Unit cost</th></tr></thead>
            <tbody>
              {(items.data?.items??[]).map(s=>(
                <tr key={s.id} className="border-t border-navy-100">
                  <td className="px-3 py-2 font-medium text-navy-800">{s.itemName}</td><td className="px-2 py-2 font-mono text-xs">{(s as any).itemCode ?? s.sku ?? '—'}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${Number((s as any).currentBalance ?? (s as any).currentStock) <= Number((s as any).minStockLevel ?? (s as any).reorderLevel)?'text-red-600':'text-navy-800'}`}>{(s as any).currentBalance ?? (s as any).currentStock} {s.unit ?? ''}</td>
                  <td className="px-2 py-2 text-right text-navy-500">{(s as any).minStockLevel ?? (s as any).reorderLevel}</td><td className="px-2 py-2 text-right">{s.unitCost? inr(s.unitCost):'—'}</td>
                </tr>
              ))}
              {!items.data?.items.length && !items.isLoading && <tr><td colSpan={5} className="text-center py-6 text-navy-400 text-sm">No stock items yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-navy-800 text-sm mb-3">Record a purchase (increases stock)</h3>
        <div className="grid sm:grid-cols-4 gap-2 mb-2">
          <select className="input" value={purchase.stockItemId} onChange={e=>setPurchase({...purchase,stockItemId:e.target.value})}>
            <option value="">Select stock item…</option>{(items.data?.items??[]).map(s=> <option key={s.id} value={s.id}>{s.itemName}</option>)}
          </select>
          <input className="input" type="number" placeholder="Quantity *" value={purchase.quantity} onChange={e=>setPurchase({...purchase,quantity:e.target.value})} />
          <input className="input" type="number" placeholder="Unit cost (₹) *" value={purchase.unitCost} onChange={e=>setPurchase({...purchase,unitCost:e.target.value})} />
          <input className="input" placeholder="Bill no (optional)" value={purchase.billNo} onChange={e=>setPurchase({...purchase,billNo:e.target.value})} />
        </div>
        <button className="btn-primary" disabled={!purchase.stockItemId || !purchase.quantity || !purchase.unitCost || createPurchase.isPending} onClick={()=>createPurchase.mutate()}>{createPurchase.isPending?'Saving…':'Record purchase'}</button>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-2 py-2">Item</th><th className="text-right px-2 py-2">Qty</th><th className="text-right px-2 py-2">Unit cost</th><th className="text-right px-3 py-2">Total</th></tr></thead>
            <tbody>{(purchases.data?.items??[]).map((p:any)=>(
              <tr key={p.id} className="border-t border-navy-100"><td className="px-3 py-2 text-xs">{String(p.purchaseDate).slice(0,10)}</td><td className="px-2 py-2">{p.stockItem?.itemName ?? '—'}</td><td className="px-2 py-2 text-right">{p.quantity}</td><td className="px-2 py-2 text-right">{inr(p.unitCost)}</td><td className="px-3 py-2 text-right font-semibold">{inr(p.totalCost)}</td></tr>
            ))}
            {!purchases.data?.items.length && !purchases.isLoading && <tr><td colSpan={5} className="text-center py-4 text-navy-400 text-sm">No purchases yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-navy-800 text-sm mb-3">Distribute stock (decreases balance)</h3>
        <div className="grid sm:grid-cols-4 gap-2 mb-2">
          <select className="input" value={dist.stockItemId} onChange={e=>setDist({...dist,stockItemId:e.target.value})}>
            <option value="">Select stock item…</option>{(items.data?.items??[]).map(s=> <option key={s.id} value={s.id}>{s.itemName} ({(s as any).currentBalance ?? (s as any).currentStock})</option>)}
          </select>
          <input className="input" type="number" placeholder="Quantity *" value={dist.quantity} onChange={e=>setDist({...dist,quantity:e.target.value})} />
          <input className="input" placeholder="Site / purpose" value={dist.purpose} onChange={e=>setDist({...dist,purpose:e.target.value})} />
          <input className="input" placeholder="Site ID (optional)" value={dist.siteId} onChange={e=>setDist({...dist,siteId:e.target.value})} />
        </div>
        <button className="btn-primary" disabled={!dist.stockItemId || !dist.quantity || createDist.isPending} onClick={()=>createDist.mutate()}>{createDist.isPending?'Saving…':'Distribute'}</button>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-2 py-2">Item</th><th className="text-right px-2 py-2">Qty</th><th className="text-left px-2 py-2">Purpose</th><th className="text-left px-3 py-2">Status</th></tr></thead>
            <tbody>{(dists.data?.items??[]).map((d:any)=>(
              <tr key={d.id} className="border-t border-navy-100"><td className="px-3 py-2 text-xs">{String(d.distributionDate).slice(0,10)}</td><td className="px-2 py-2">{d.stockItem?.itemName ?? '—'}</td><td className="px-2 py-2 text-right">{d.quantity}</td><td className="px-2 py-2 text-xs">{d.purpose ?? '—'}</td><td className="px-3 py-2 text-xs">{d.status}</td></tr>
            ))}
            {!dists.data?.items.length && !dists.isLoading && <tr><td colSpan={5} className="text-center py-4 text-navy-400 text-sm">No distributions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
