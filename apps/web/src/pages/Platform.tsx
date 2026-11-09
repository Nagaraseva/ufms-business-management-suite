import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const Tones: Record<string,string> = { ACTIVE:'bg-emerald-50 text-emerald-700', TRIAL:'bg-blue-50 text-blue-700', PAST_DUE:'bg-amber-50 text-amber-700', SUSPENDED:'bg-red-50 text-red-700', CANCELLED:'bg-navy-100 text-navy-500' };
const Chip = ({ children, tone='slate' }: { children: React.ReactNode; tone?: string }) => <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${Tones[String(children)] ?? 'bg-navy-50 text-navy-600'}`}>{children}</span>;
const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'pri'|'sec' }> = ({ v='pri', ...p }) => <button {...p} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${v==='pri'?'bg-navy-900 text-white':'bg-navy-50 text-navy-700 border border-navy-200'} ${p.className??''}`} />;

export default function Platform() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [tab, setTab] = useState<'tenants'|'plans'|'subs'|'audit'|'queue'|'storage'>('tenants');
  const [msg, setMsg] = useState('');
  const [newTenant, setNewTenant] = useState({ slug:'', legalName:'', displayName:'', adminEmail:'', adminName:'', adminPassword:'' });
  const [newPlan, setNewPlan] = useState({ code:'', name:'', monthlyPrice: 0, annualPrice: 0, trialDays:14 });

  const loadTenants = async()=> setTenants(await api.get<any[]>('/platform/tenants'));
  const loadPlans = async()=> setPlans(await api.get<any[]>('/platform/plans'));
  useEffect(()=>{ loadTenants(); loadPlans(); },[]);

  const createTenant = async()=>{
    try { await api.post('/platform/tenants', newTenant); setMsg('Tenant created'); setNewTenant({ slug:'', legalName:'', displayName:'', adminEmail:'', adminName:'', adminPassword:''}); await loadTenants(); } catch(e:any){ setMsg(e.error?.message ?? e.message); }
  };
  const setStatus = async(id:string, status:string)=>{
    const reason = prompt(`Reason for ${status}? (recorded in audit)`) ?? '';
    try { await api.patch(`/platform/tenants/${id}/status`, { status, reason }); setMsg(`${status} ✓`); await loadTenants(); } catch(e:any){ setMsg(e.error?.message ?? e.message); }
  };
  const upsertPlan = async()=>{
    try { await api.post('/platform/plans', { ...newPlan, code: newPlan.code.toUpperCase() }); setMsg('Plan saved'); await loadPlans(); } catch(e:any){ setMsg(e.error?.message ?? e.message); }
  };

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Platform Admin</h1><p className="text-sm text-navy-400">Provisioning, entitlements, suspensions — platform_admin only (Rule 18: reason-recorded, audited, never a silent backdoor).</p></div>
      <div className="flex gap-1 border-b border-navy-100 text-sm">
        {(['tenants','plans','subs','audit','queue','storage'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-3 py-2 border-b-2 font-medium ${tab===t?'border-navy-900 text-navy-900':'border-transparent text-navy-400'}`}>{t}</button>
        ))}
      </div>
      {msg && <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">{msg}</div>}

      {tab==='tenants' && (
        <div className="space-y-3">
          <div className="bg-white border border-navy-100 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold">Provision tenant</h3>
            <div className="grid md:grid-cols-3 gap-2">
              <input value={newTenant.slug} onChange={e=>setNewTenant({...newTenant, slug:e.target.value})} placeholder="slug (acme)" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newTenant.legalName} onChange={e=>setNewTenant({...newTenant, legalName:e.target.value})} placeholder="Legal name" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newTenant.displayName} onChange={e=>setNewTenant({...newTenant, displayName:e.target.value})} placeholder="Display name" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newTenant.adminEmail} onChange={e=>setNewTenant({...newTenant, adminEmail:e.target.value})} placeholder="Owner email" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newTenant.adminName} onChange={e=>setNewTenant({...newTenant, adminName:e.target.value})} placeholder="Owner name" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newTenant.adminPassword} onChange={e=>setNewTenant({...newTenant, adminPassword:e.target.value})} placeholder="Temp password" type="password" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <Btn onClick={createTenant}>Create tenant</Btn>
            <p className="text-xs text-navy-400">Creates tenant + verified subdomain + starter subscription. Owner receives email via console adapter in dev (real SES/SMTP in prod).</p>
          </div>
          <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-navy-50"><tr><th className="text-left px-3 py-2">Tenant</th><th>Status</th><th>White-label</th><th>Subscription</th><th></th></tr></thead>
            <tbody>{tenants.map((t:any)=>(
              <tr key={t.id} className="border-t border-navy-100">
                <td className="px-3 py-2"><div className="font-medium">{t.slug}</div><div className="text-xs text-navy-400">{t.displayName}</div></td>
                <td><Chip>{t.status}</Chip></td><td>{t.whiteLabel?'yes':'—'}</td>
                <td className="text-xs">{t.subscription ? `${t.subscription.planId.slice(0,8)}… ${t.subscription.status}` : '—'}</td>
                <td className="space-x-1">
                  {t.status!=='SUSPENDED' ? <Btn v="sec" onClick={()=>setStatus(t.id,'SUSPENDED')}>Suspend</Btn> : <Btn v="sec" onClick={()=>setStatus(t.id,'ACTIVE')}>Activate</Btn>}
                </td>
              </tr>
            ))}</tbody></table>
            {!tenants.length && <div className="p-6 text-center text-navy-400 text-sm">No tenants (you may not have platform_admin).</div>}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">Suspension is enforced at <b>SessionGuard</b> (API), not just UI — a suspended tenant's tokens are rejected with <code>TENANT_SUSPENDED</code>.</div>
        </div>
      )}

      {tab==='plans' && (
        <div className="space-y-3">
          <div className="bg-white border border-navy-100 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold">Upsert plan</h3>
            <div className="grid md:grid-cols-4 gap-2">
              <input value={newPlan.code} onChange={e=>setNewPlan({...newPlan, code:e.target.value})} placeholder="CODE (STARTER)" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newPlan.name} onChange={e=>setNewPlan({...newPlan, name:e.target.value})} placeholder="Name" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={String(newPlan.monthlyPrice)} onChange={e=>setNewPlan({...newPlan, monthlyPrice:Number(e.target.value)})} placeholder="Monthly INR" type="number" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={String(newPlan.trialDays)} onChange={e=>setNewPlan({...newPlan, trialDays:Number(e.target.value)})} placeholder="Trial days" type="number" className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <Btn onClick={upsertPlan}>Save plan</Btn>
          </div>
          <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-navy-50"><tr><th className="text-left px-3 py-2">Code</th><th>Name</th><th className="text-right">Monthly</th><th>Trial</th><th>Modules</th></tr></thead>
            <tbody>{plans.map((p:any)=>(
              <tr key={p.id} className="border-t border-navy-100">
                <td className="px-3 py-2 font-mono">{p.code}</td><td>{p.name}</td><td className="text-right">₹{Number(p.monthlyPrice).toLocaleString('en-IN')}</td><td>{p.trialDays}d</td><td className="text-xs">{p.modules?.map((pm:any)=>pm.module?.code ?? pm.moduleId).join(', ') ?? '—'}</td>
              </tr>
            ))}</tbody></table>
          </div>
        </div>
      )}

      {tab==='subs' && <SubsTab />}
      {tab==='audit' && <AuditTab />}
      {tab==='queue' && <QueueTab />}
      {tab==='storage' && <StorageTab />}
    </div>
  );
}

function SubsTab(){
  const [rows,setRows]=useState<any[]>([]);
  useEffect(()=>{ api.get<any[]>('/platform/subscriptions').then(setRows).catch(()=>{}); },[]);
  return (
    <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm"><thead className="bg-navy-50"><tr><th className="text-left px-3 py-2">Tenant</th><th>Plan</th><th>Status</th><th>Period</th></tr></thead>
      <tbody>{rows.map((s:any)=>(
        <tr key={s.id} className="border-t border-navy-100">
          <td className="px-3 py-2">{s.tenant?.slug ?? s.tenantId.slice(0,8)}</td><td>{s.plan?.code ?? s.planId.slice(0,8)}</td><td><span className="text-xs bg-navy-50 px-2 py-0.5 rounded-full">{s.status}</span></td><td className="text-xs">{new Date(s.currentPeriodStart).toLocaleDateString()} → {new Date(s.currentPeriodEnd).toLocaleDateString()}</td>
        </tr>
      ))}</tbody></table>
      {!rows.length && <div className="p-6 text-center text-navy-400 text-sm">No subscriptions.</div>}
    </div>
  );
}
function AuditTab(){
  const [rows,setRows]=useState<any[]>([]);
  useEffect(()=>{ api.get<any[]>('/platform/audit').then(setRows).catch(()=>{}); },[]);
  return (
    <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm"><thead className="bg-navy-50"><tr><th className="text-left px-3 py-2">Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>{rows.map((r:any)=>(
        <tr key={String(r.id)} className="border-t border-navy-100">
          <td className="px-3 py-1 text-xs">{new Date(r.createdAt).toLocaleString()}</td><td className="text-xs">{r.actorEmail ?? '—'}</td><td className="text-xs font-mono">{r.action}</td><td className="text-xs">{r.entityType} {r.entityId?.slice(0,8)}</td>
        </tr>
      ))}</tbody></table>
      {!rows.length && <div className="p-6 text-center text-navy-400 text-sm">No platform audit rows (platform.* actions only).</div>}
    </div>
  );
}
function QueueTab(){
  const [rows,setRows]=useState<any[]>([]);
  const load=async()=> setRows(await api.get<any[]>('/queue/jobs').catch(()=>[]));
  useEffect(()=>{ load(); const id=setInterval(load, 3000); return()=>clearInterval(id); },[]);
  return (
    <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
      <div className="p-3 flex justify-between items-center"><h3 className="font-semibold text-sm">Worker queue (tenant-scoped; platform_admin can pass ?all=true)</h3><button onClick={load} className="text-xs bg-navy-50 px-2 py-1 rounded">Refresh</button></div>
      <table className="w-full text-sm"><thead className="bg-navy-50"><tr><th className="text-left px-3 py-2">Type</th><th>Status</th><th>Attempts</th><th>Error</th></tr></thead>
      <tbody>{rows.map((j:any)=>(
        <tr key={j.id} className="border-t border-navy-100"><td className="px-3 py-1 font-mono text-xs">{j.type}</td><td><span className={`text-xs px-2 py-0.5 rounded-full ${j.status==='completed'?'bg-emerald-50 text-emerald-700':j.status==='dead'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700'}`}>{j.status}</span></td><td className="text-xs">{j.attempts}/{j.maxAttempts}</td><td className="text-xs text-navy-400 max-w-xs truncate">{j.lastError ?? '—'}</td></tr>
      ))}</tbody></table>
      {!rows.length && <div className="p-6 text-center text-navy-400 text-sm">No pending jobs.</div>}
      <div className="p-3 text-xs bg-blue-50 border-t border-navy-100">Jobs: <code>marketing:send_campaign</code> · <code>social:publish_post</code> · <code>ai:execute_tool</code> · <code>report:generate_snapshot</code> — auto-retried with exponential backoff; dead jobs surfaced here.</div>
    </div>
  );
}
function StorageTab(){
  const [desc,setDesc]=useState<any>(null);
  const [form,setForm]=useState({ originalName:'demo.pdf', sizeBytes:1024, category:'uploads' });
  const [out,setOut]=useState<any>(null);
  useEffect(()=>{ api.get<any>('/storage/describe').then(setDesc).catch(()=>{}); },[]);
  const reg=async()=>{ try{ setOut(await api.post<any>('/storage/uploads/register', form)); } catch(e:any){ setOut({ error: e.error?.message ?? e.message }); } };
  return (
    <div className="space-y-3">
      <div className="bg-white border border-navy-100 rounded-xl p-4 text-sm"><h3 className="font-semibold">Storage adapter</h3><div className="text-xs text-navy-400">{desc ? `${desc.provider} · ${desc.bucket} · ${desc.mode}` : 'Loading…'}</div><div className="mt-2 text-xs">Rule 4: uploads are never stored on app server local filesystem. <b>console</b> provider is metadata-only (dev); set <code>STORAGE_PROVIDER=s3</code> + <code>STORAGE_BUCKET</code> + credentials for production.</div></div>
      <div className="bg-white border border-navy-100 rounded-xl p-4 space-y-2">
        <h3 className="font-semibold text-sm">Register upload (reserve key + signed URL)</h3>
        <div className="grid md:grid-cols-4 gap-2">
          <input value={form.originalName} onChange={e=>setForm({...form, originalName:e.target.value})} placeholder="originalName" className="border rounded-lg px-3 py-2 text-sm" />
          <input value={String(form.sizeBytes)} onChange={e=>setForm({...form, sizeBytes:Number(e.target.value)})} placeholder="sizeBytes" type="number" className="border rounded-lg px-3 py-2 text-sm" />
          <input value={form.category} onChange={e=>setForm({...form, category:e.target.value})} placeholder="category" className="border rounded-lg px-3 py-2 text-sm" />
          <Btn v="pri" onClick={reg}>Register</Btn>
        </div>
        {out && <pre className="text-xs bg-navy-50 rounded-lg p-3 overflow-auto max-h-64">{JSON.stringify(out,null,2)}</pre>}
      </div>
    </div>
  );
}
