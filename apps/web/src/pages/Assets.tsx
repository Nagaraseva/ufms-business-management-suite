import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiFailure, Vendor, Asset, inr } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Plus, Search, Building2, Package, Truck } from 'lucide-react';

type Tab = 'assets'|'vendors'|'summary';

export default function Assets() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab,setTab]=useState<Tab>('assets');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const fail=(e:unknown)=> setError(e instanceof ApiFailure? e.error.message: 'Request failed');
  const canRead = can('asset:read') || can('vendor:read');
  const canWrite = can('asset:write') || can('vendor:write');

  if(!canRead) return <div className="p-6 text-sm text-red-700">You need asset:read or vendor:read to view this area.</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Assets & Vendors</h1>
        <p className="text-sm text-navy-500 mt-1">Fixed assets, vendor register and assignment history. Every movement is recorded.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      <div className="flex gap-1 border-b border-navy-100">
        {(['assets','vendors','summary'] as Tab[]).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab===t?'border-brand-500 text-brand-600':'border-transparent text-navy-500 hover:text-navy-700'}`}>
            {t==='assets'?'Assets':t==='vendors'?'Vendors':'Summary'}
          </button>
        ))}
      </div>
      {tab==='assets' && <AssetsTab qc={qc} canWrite={!!canWrite} onError={fail} onNotice={setNotice} />}
      {tab==='vendors' && <VendorsTab qc={qc} canWrite={!!canWrite} onError={fail} onNotice={setNotice} />}
      {tab==='summary' && <SummaryTab />}
    </div>
  );
}

function SummaryTab(){
  const summary = useQuery({ queryKey:['assets-summary'], queryFn:()=> api.get<any>('/assets/summary') });
  if(summary.isLoading) return <div className="p-6 text-sm text-navy-500">Loading…</div>;
  const d = summary.data;
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <div className="card p-4"><div className="text-xs text-navy-500">Total assets</div><div className="text-xl font-semibold text-navy-800 mt-1">{d?.total ?? 0}</div></div>
      <div className="card p-4"><div className="text-xs text-navy-500">Assigned</div><div className="text-xl font-semibold text-emerald-700 mt-1">{d?.assigned ?? 0}</div></div>
      <div className="card p-4"><div className="text-xs text-navy-500">Available</div><div className="text-xl font-semibold text-navy-800 mt-1">{d?.available ?? 0}</div></div>
      <div className="card p-4"><div className="text-xs text-navy-500">Under maintenance</div><div className="text-xl font-semibold text-amber-600 mt-1">{d?.maintenance ?? 0}</div></div>
      <div className="card p-4"><div className="text-xs text-navy-500">Retired</div><div className="text-xl font-semibold text-navy-500 mt-1">{d?.retired ?? 0}</div></div>
      <div className="card p-4"><div className="text-xs text-navy-500">Total value (purchase cost)</div><div className="text-xl font-semibold text-navy-800 mt-1">{d?.totalValue? inr(d.totalValue):'—'}</div></div>
    </div>
  );
}

function VendorsTab({qc,canWrite,onError,onNotice}:{qc:ReturnType<typeof useQueryClient>,canWrite:boolean,onError:(e:unknown)=>void,onNotice:(s:string)=>void}) {
  const [q,setQ]=useState(''); const [show,setShow]=useState(false);
  const [form,setForm]=useState({ vendorName:'', contactPerson:'', mobile:'', email:'', gstin:'', categories:'' });
  const list = useQuery({ queryKey:['vendors',q], queryFn:()=> api.get<{items:Vendor[],total:number}>(`/vendors?pageSize=200${q?`&q=${encodeURIComponent(q)}`:''}`) });
  const create = useMutation({
    mutationFn:()=> api.post<Vendor>('/vendors', { vendorName: form.vendorName, contactPerson: form.contactPerson||undefined, mobile: form.mobile||undefined, email: form.email||undefined, gstin: form.gstin||undefined, categories: form.categories||undefined }),
    onSuccess:()=>{ setShow(false); setForm({vendorName:'',contactPerson:'',mobile:'',email:'',gstin:'',categories:''}); qc.invalidateQueries({queryKey:['vendors']}); onNotice('Vendor created.'); },
    onError,
  });
  return (
    <div className="space-y-3">
      <div className="card p-3 flex gap-2">
        <div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" /><input className="input pl-8" placeholder="Vendor, contact, code" value={q} onChange={e=>setQ(e.target.value)} /></div>
        {canWrite && <button className="btn-primary shrink-0" onClick={()=>setShow(!show)}><Plus size={16} /> New vendor</button>}
      </div>
      {show && (
        <div className="card p-4 grid sm:grid-cols-3 gap-3">
          <label><span className="label">Vendor name *</span><input className="input" value={form.vendorName} onChange={e=>setForm({...form,vendorName:e.target.value})} /></label>
          <label><span className="label">Contact person</span><input className="input" value={form.contactPerson} onChange={e=>setForm({...form,contactPerson:e.target.value})} /></label>
          <label><span className="label">Mobile</span><input className="input" value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} /></label>
          <label><span className="label">Email</span><input className="input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></label>
          <label><span className="label">GSTIN</span><input className="input font-mono text-sm" value={form.gstin} onChange={e=>setForm({...form,gstin:e.target.value})} /></label>
          <label><span className="label">Categories</span><input className="input" value={form.categories} onChange={e=>setForm({...form,categories:e.target.value})} placeholder="Uniforms, Security equipment" /></label>
          <div className="sm:col-span-3 flex gap-2">
            <button className="btn-primary" disabled={!form.vendorName.trim() || create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Create'}</button>
            <button className="btn-ghost" onClick={()=>setShow(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-4 py-2">Code</th><th className="text-left px-2 py-2">Vendor</th><th className="text-left px-2 py-2">Contact</th><th className="text-left px-2 py-2">GSTIN</th><th className="text-left px-2 py-2">Status</th></tr></thead>
          <tbody>
            {(list.data?.items??[]).map(v=>(
              <tr key={v.id} className="border-t border-navy-100"><td className="px-4 py-2 font-mono text-xs">{v.vendorCode}</td><td className="px-2 py-2 font-medium text-navy-800">{v.vendorName}</td><td className="px-2 py-2 text-xs">{v.contactPerson ?? '—'} {v.mobile?`· ${v.mobile}`:''}</td><td className="px-2 py-2 font-mono text-xs">{v.gstin ?? '—'}</td><td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${v.status==='ACTIVE'?'bg-emerald-100 text-emerald-800':'bg-navy-100 text-navy-600'}`}>{v.status}</span></td></tr>
            ))}
            {!list.data?.items.length && !list.isLoading && <tr><td colSpan={5} className="text-center py-8 text-navy-400 text-sm">No vendors yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetsTab({qc,canWrite,onError,onNotice}:{qc:ReturnType<typeof useQueryClient>,canWrite:boolean,onError:(e:unknown)=>void,onNotice:(s:string)=>void}) {
  const [q,setQ]=useState(''); const [status,setStatus]=useState(''); const [show,setShow]=useState(false);
  const [form,setForm]=useState({ assetName:'', category:'EQUIPMENT', brand:'', serialNo:'', purchaseCost:'', vendorId:'', condition:'GOOD' });
  const list = useQuery({ queryKey:['assets',q,status], queryFn:()=> api.get<{items:Asset[], total:number}>(`/assets?pageSize=200${q?`&q=${encodeURIComponent(q)}`:''}${status?`&status=${status}`:''}`) });
  const vendors = useQuery({ queryKey:['vendor-options'], queryFn:()=> api.get<Array<{id:string,vendorName:string}>>('/vendors/options').then(r=> Array.isArray(r)?r:(r as any).items??[]), enabled: show });
  const create = useMutation({
    mutationFn:()=> api.post<Asset>('/assets', { assetName: form.assetName, category: form.category, brand: form.brand||undefined, serialNo: form.serialNo||undefined, purchaseCost: form.purchaseCost? Number(form.purchaseCost): undefined, vendorId: form.vendorId||undefined, condition: form.condition }),
    onSuccess:()=>{ setShow(false); setForm({assetName:'',category:'EQUIPMENT',brand:'',serialNo:'',purchaseCost:'',vendorId:'',condition:'GOOD'}); qc.invalidateQueries({queryKey:['assets']}); onNotice('Asset created.'); },
    onError,
  });
  const [assignFor,setAssignFor]=useState<string|null>(null); const [assignTo,setAssignTo]=useState('');
  const doAssign = useMutation({
    mutationFn:()=> api.post(`/assets/${assignFor}/assign`, { assignedToId: assignTo||undefined }),
    onSuccess:()=>{ setAssignFor(null); setAssignTo(''); qc.invalidateQueries({queryKey:['assets']}); onNotice('Asset assigned.'); },
    onError,
  });
  const doReturn = useMutation({
    mutationFn:(id:string)=> api.post(`/assets/${id}/return`, {}),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['assets']}); onNotice('Asset returned to store.'); },
    onError,
  });
  return (
    <div className="space-y-3">
      <div className="card p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" /><input className="input pl-8" placeholder="Asset code, name, serial" value={q} onChange={e=>setQ(e.target.value)} /></div>
        <select className="input w-40" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="AVAILABLE">Available</option><option value="ASSIGNED">Assigned</option><option value="UNDER_MAINTENANCE">Under maintenance</option><option value="RETIRED">Retired</option><option value="DISPOSED">Disposed</option></select>
        {canWrite && <button className="btn-primary shrink-0" onClick={()=>setShow(!show)}><Plus size={16} /> New asset</button>}
      </div>
      {show && (
        <div className="card p-4 grid sm:grid-cols-3 gap-3">
          <label><span className="label">Asset name *</span><input className="input" value={form.assetName} onChange={e=>setForm({...form,assetName:e.target.value})} placeholder="Metal detector – Model X" /></label>
          <label><span className="label">Category</span><select className="input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>EQUIPMENT</option><option>VEHICLE</option><option>FURNITURE</option><option>IT</option><option>UNIFORM</option><option>OTHER</option></select></label>
          <label><span className="label">Brand / Model</span><input className="input" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} /></label>
          <label><span className="label">Serial no</span><input className="input font-mono text-sm" value={form.serialNo} onChange={e=>setForm({...form,serialNo:e.target.value})} /></label>
          <label><span className="label">Purchase cost (₹)</span><input className="input" type="number" value={form.purchaseCost} onChange={e=>setForm({...form,purchaseCost:e.target.value})} /></label>
          <label><span className="label">Vendor (optional)</span>
            <select className="input" value={form.vendorId} onChange={e=>setForm({...form,vendorId:e.target.value})}><option value="">— None —</option>{(vendors.data??[]).map(v=> <option key={v.id} value={v.id}>{v.vendorName}</option>)}</select>
          </label>
          <div className="sm:col-span-3 flex gap-2">
            <button className="btn-primary" disabled={!form.assetName.trim() || create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Create asset'}</button>
            <button className="btn-ghost" onClick={()=>setShow(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-4 py-2">Code</th><th className="text-left px-2 py-2">Asset</th><th className="text-left px-2 py-2">Category</th><th className="text-left px-2 py-2">Assigned to</th><th className="text-left px-2 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {(list.data?.items??[]).map(a=>(
              <tr key={a.id} className="border-t border-navy-100 hover:bg-navy-50/40">
                <td className="px-4 py-2 font-mono text-xs">{a.assetCode}</td>
                <td className="px-2 py-2"><div className="font-medium text-navy-800">{a.assetName}</div><div className="text-xs text-navy-400">{a.brand ?? ''} {a.serialNo?`· ${a.serialNo}`:''}</div></td>
                <td className="px-2 py-2 text-xs">{a.category ?? '—'}</td>
                <td className="px-2 py-2 text-xs">{a.assignedTo?.name ?? <span className="text-navy-400">—</span>}</td>
                <td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${a.status==='AVAILABLE'?'bg-emerald-100 text-emerald-800':a.status==='ASSIGNED'?'bg-sky-100 text-sky-800':a.status==='RETIRED'?'bg-navy-100 text-navy-600':'bg-amber-100 text-amber-800'}`}>{a.status}</span></td>
                <td className="px-4 py-2 text-right flex gap-2 justify-end">
                  {a.status==='AVAILABLE' && canWrite && <button className="text-xs text-brand-600 hover:underline" onClick={()=>setAssignFor(a.id)}>Assign</button>}
                  {a.status==='ASSIGNED' && canWrite && <button className="text-xs text-navy-600 hover:text-navy-800" onClick={()=>doReturn.mutate(a.id)}>Return</button>}
                </td>
              </tr>
            ))}
            {!list.data?.items.length && !list.isLoading && <tr><td colSpan={6} className="text-center py-8 text-navy-400 text-sm">No assets match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      {assignFor && (
        <div className="fixed inset-0 bg-navy-950/40 grid place-items-center p-4 z-30">
          <div className="card w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold text-navy-900">Assign asset</h3>
            <p className="text-xs text-navy-500">The assignment is recorded in the asset's history. The assignee must acknowledge receipt.</p>
            <label><span className="label">Assign to (employee/site description)</span><input className="input" value={assignTo} onChange={e=>setAssignTo(e.target.value)} placeholder="Employee name or site name" /></label>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={()=>setAssignFor(null)}>Cancel</button><button className="btn-primary" onClick={()=>doAssign.mutate()}>Assign</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
