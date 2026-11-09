import { useEffect, useState } from 'react';
import { api, DailyReport, ReportSnapshot, today } from '../lib/api';

const Tab = ({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`px-3 py-2 text-sm font-medium border-b-2 ${active ? 'border-navy-900 text-navy-900' : 'border-transparent text-navy-400 hover:text-navy-600'}`}>{children}</button>
);
const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'pri'|'sec' }> = ({ v='pri', ...p }) => (
  <button {...p} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${v==='pri'?'bg-navy-900 text-white hover:bg-navy-800':'bg-navy-50 text-navy-700 border border-navy-200 hover:bg-navy-100'} ${p.className ?? ''}`} />
);
const Chip = ({ children }: { children: React.ReactNode }) => <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-navy-50 text-navy-600">{children}</span>;

export default function Reports() {
  const [tab, setTab] = useState<'overview'|'daily'|'snapshots'|'mom'>('overview');
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Reports & Dashboards</h1><p className="text-sm text-navy-400">Executive KPIs, daily reports, saved snapshots and MOM workflow.</p></div>
      <div className="bg-white rounded-xl border border-navy-100">
        <div className="flex gap-1 px-4 border-b border-navy-100">
          <Tab active={tab==='overview'} onClick={()=>setTab('overview')}>Overview</Tab>
          <Tab active={tab==='daily'} onClick={()=>setTab('daily')}>Daily Reports</Tab>
          <Tab active={tab==='snapshots'} onClick={()=>setTab('snapshots')}>Snapshots</Tab>
          <Tab active={tab==='mom'} onClick={()=>setTab('mom')}>MOM</Tab>
        </div>
        <div className="p-4">
          {tab==='overview' && <OverviewTab />}
          {tab==='daily' && <DailyTab />}
          {tab==='snapshots' && <SnapshotsTab />}
          {tab==='mom' && <MomTab />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState<any>(null);
  useEffect(()=>{ api.get<any>('/reports/overview').then(setData).catch(()=>{}); },[]);
  if(!data) return <div className="text-sm text-navy-400 py-8 text-center">Loading…</div>;
  const { kpis } = data;
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-4 gap-3">
        {[
          ['Leads', kpis.leads], ['Tenders', kpis.tenders], ['Clients', kpis.clients], ['MOMs', kpis.moms],
          ['Open actions', kpis.openActions], ['Invoices value', kpis.invoicesValue], ['Period', `${data.period?.from ?? ''} → ${data.period?.to ?? ''}`], ['Generated', new Date(data.generatedAt).toLocaleString()],
        ].map(([label, val])=>(
          <div key={String(label)} className="border rounded-xl p-4 bg-navy-50/40"><div className="text-xs text-navy-400">{label}</div><div className="text-lg font-bold mt-1">{String(val)}</div></div>
        ))}
      </div>
      <div className="text-xs text-navy-400">{data.disclaimer}</div>
    </div>
  );
}

function DailyTab() {
  const [rows, setRows] = useState<DailyReport[]>([]);
  const [form, setForm] = useState({ reportDate: today(), title:'', summary:'' });
  const load = async()=> setRows(await api.get<DailyReport[]>('/reports/daily'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!form.title.trim()) return; await api.post('/reports/daily', form); setForm({ reportDate: today(), title:'', summary:''}); await load(); };
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-4 gap-2">
        <input type="date" value={form.reportDate} onChange={e=>setForm({...form,reportDate:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"/>
        <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Title *" className="border rounded-lg px-3 py-2 text-sm"/>
        <input value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} placeholder="Summary" className="border rounded-lg px-3 py-2 text-sm"/>
        <Btn onClick={create}>Add daily report</Btn>
      </div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Date</th><th>Title</th><th>Summary</th><th></th></tr></thead>
      <tbody>{rows.map(r=>(
        <tr key={r.id} className="border-b"><td>{r.reportDate.slice(0,10)}</td><td className="font-medium">{r.title}</td><td className="text-navy-500 max-w-sm truncate">{r.summary ?? '—'}</td><td><Btn v="sec" onClick={async()=>{ await api.del(`/reports/daily/${r.id}`); await load();}}>Delete</Btn></td></tr>
      ))}</tbody></table>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No daily reports.</div>}
    </div>
  );
}

function SnapshotsTab() {
  const [rows, setRows] = useState<ReportSnapshot[]>([]);
  const [type, setType] = useState('EXEC_DASHBOARD');
  const load = async()=> setRows(await api.get<ReportSnapshot[]>(`/reports/snapshots${type?`?reportType=${type}`:''}`));
  useEffect(()=>{ load(); },[]);
  const generate = async()=>{ await api.post('/reports/snapshots/generate', { reportType: type }); await load(); };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select value={type} onChange={e=>setType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option>EXEC_DASHBOARD</option><option>LEAD_FUNNEL</option><option>REVENUE</option><option>TENDER_PIPELINE</option><option>ATTENDANCE_SUMMARY</option><option>PAYROLL_SUMMARY</option>
        </select>
        <Btn onClick={generate}>Generate snapshot</Btn>
        <Btn v="sec" onClick={load}>Refresh</Btn>
        <a href={`/api/v1/reports/export/${type}`} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-navy-50 text-navy-700 border border-navy-200 hover:bg-navy-100">Export CSV</a>
      </div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Type</th><th>Period</th><th>Created</th><th>Data preview</th></tr></thead>
      <tbody>{rows.map(r=>(
        <tr key={r.id} className="border-b"><td><Chip>{r.reportType}</Chip></td><td className="text-xs">{r.periodFrom?.slice(0,10) ?? '—'} → {r.periodTo?.slice(0,10) ?? '—'}</td><td className="text-xs">{r.createdAt.slice(0,16).replace('T',' ')}</td><td className="text-xs text-navy-500 max-w-xs truncate">{JSON.stringify(r.dataJson).slice(0,120)}</td></tr>
      ))}</tbody></table>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No snapshots. Generate one.</div>}
    </div>
  );
}

function MomTab() {
  const [moms, setMoms] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ title:'', meetingDate: today(), location:'', notes:'' });
  const load = async()=> setMoms(await api.get<any[]>('/reports/moms'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!form.title.trim()) return; await api.post('/reports/moms', form); setForm({ title:'', meetingDate: today(), location:'', notes:''}); await load(); };
  const openMom = async(id:string)=> setSelected(await api.get<any>(`/reports/moms/${id}`));
  const addParticipant = async()=>{
    const name = prompt('Participant name *'); if(!name?.trim()) return;
    await api.post(`/reports/moms/${selected.id}/participants`, { name }); setSelected(await api.get<any>(`/reports/moms/${selected.id}`));
  };
  const addAgenda = async()=>{
    const topic = prompt('Agenda topic *'); if(!topic?.trim()) return;
    await api.post(`/reports/moms/${selected.id}/agendas`, { topic }); setSelected(await api.get<any>(`/reports/moms/${selected.id}`));
  };
  const addAction = async()=>{
    const title = prompt('Action title *'); if(!title?.trim()) return;
    await api.post(`/reports/moms/${selected.id}/actions`, { title }); setSelected(await api.get<any>(`/reports/moms/${selected.id}`));
  };
  const closeAction = async(aid:string)=>{
    await api.patch(`/reports/moms/${selected.id}/actions/${aid}`, { status:'DONE' }); setSelected(await api.get<any>(`/reports/moms/${selected.id}`));
  };
  if(selected) {
    return (
      <div className="space-y-3">
        <Btn v="sec" onClick={()=>setSelected(null)}>← Back to MOMs</Btn>
        <div className="border rounded-xl p-4 bg-navy-50/30">
          <div className="text-lg font-bold">{selected.title}</div>
          <div className="text-sm text-navy-400">{selected.meetingDate.slice(0,10)} · {selected.location ?? '—'} · <Chip>{selected.status}</Chip></div>
          <div className="text-sm mt-2">{selected.notes ?? ''}</div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="border rounded-xl p-3">
            <div className="flex justify-between items-center"><span className="font-semibold text-sm">Participants</span><Btn v="sec" onClick={addParticipant}>Add</Btn></div>
            <div className="mt-2 space-y-1 text-sm">{(selected.participants??[]).map((p:any)=>(<div key={p.id} className="flex justify-between"><span>{p.name}{p.role?` · ${p.role}`:''}</span><span className="text-navy-400">{p.present?'✓':'✗'}</span></div>))}{!selected.participants?.length && <div className="text-navy-400 text-sm">None</div>}</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="flex justify-between items-center"><span className="font-semibold text-sm">Agendas</span><Btn v="sec" onClick={addAgenda}>Add</Btn></div>
            <div className="mt-2 space-y-1 text-sm">{(selected.agendas??[]).map((a:any)=>(<div key={a.id}>• {a.topic}{a.owner?` (${a.owner})`:''}</div>))}{!selected.agendas?.length && <div className="text-navy-400 text-sm">None</div>}</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="flex justify-between items-center"><span className="font-semibold text-sm">Actions</span><Btn v="sec" onClick={addAction}>Add</Btn></div>
            <div className="mt-2 space-y-2">
              {(selected.actions??[]).map((a:any)=>(
                <div key={a.id} className={`p-2 rounded-lg border text-sm ${a.isOverdue?'bg-red-50 border-red-100':'bg-white'}`}>
                  <div className="font-medium">{a.title} {a.isOverdue && <span className="text-red-600 text-xs">OVERDUE</span>}</div>
                  <div className="text-xs text-navy-400">{a.assigneeName ?? 'unassigned'} · {a.status} · due {a.dueDate?.slice(0,10) ?? '—'}</div>
                  {a.status!=='DONE' && <Btn v="sec" onClick={()=>closeAction(a.id)} className="mt-1">Mark done</Btn>}
                </div>
              ))}{!selected.actions?.length && <div className="text-navy-400 text-sm">None</div>}
            </div>
          </div>
        </div>
        <div className="border rounded-xl p-3">
          <div className="font-semibold text-sm">Decisions</div>
          <div className="mt-2 space-y-1 text-sm">{(selected.decisions??[]).map((d:any)=>(<div key={d.id}>• {d.decision}</div>))}{!selected.decisions?.length && <div className="text-navy-400 text-sm">None</div>}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-4 gap-2">
        <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Meeting title *" className="border rounded-lg px-3 py-2 text-sm"/>
        <input type="date" value={form.meetingDate} onChange={e=>setForm({...form,meetingDate:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"/>
        <input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Location" className="border rounded-lg px-3 py-2 text-sm"/>
        <Btn onClick={create}>Create MOM</Btn>
      </div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Title</th><th>Date</th><th>Status</th><th></th></tr></thead>
      <tbody>{moms.map(m=>(
        <tr key={m.id} className="border-b hover:bg-navy-50/50 cursor-pointer" onClick={()=>openMom(m.id)}>
          <td className="py-2 font-medium">{m.title}</td><td>{m.meetingDate.slice(0,10)}</td><td><Chip>{m.status}</Chip></td><td><Btn v="sec" onClick={(e: any)=>{e.stopPropagation(); openMom(m.id);}}>Open</Btn></td>
        </tr>
      ))}</tbody></table>
      {!moms.length && <div className="text-sm text-navy-400 py-4 text-center">No MOMs.</div>}
    </div>
  );
}
