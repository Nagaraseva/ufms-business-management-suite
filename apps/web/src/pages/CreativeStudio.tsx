import { useEffect, useState } from 'react';
import { api, CreativeProject, CreativeAsset, MarketingTemplate } from '../lib/api';

const Tab = ({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`px-3 py-2 text-sm font-medium border-b-2 ${active ? 'border-navy-900 text-navy-900' : 'border-transparent text-navy-400 hover:text-navy-600'}`}>{children}</button>
);
const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'pri'|'sec' }> = ({ v='pri', ...p }) => (
  <button {...p} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${v==='pri'?'bg-navy-900 text-white hover:bg-navy-800':'bg-navy-50 text-navy-700 border border-navy-200 hover:bg-navy-100'} ${p.className ?? ''}`} />
);
const Chip = ({ children, tone='slate' }: { children: React.ReactNode; tone?: string }) => {
  const m: Record<string,string> = { slate:'bg-navy-50 text-navy-600', green:'bg-emerald-50 text-emerald-700', amber:'bg-amber-50 text-amber-700', red:'bg-red-50 text-red-700', blue:'bg-blue-50 text-blue-700' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m[tone]??m.slate}`}>{children}</span>;
};

export default function CreativeStudio() {
  const [tab, setTab] = useState<'projects'|'templates'>('projects');
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Creative Studio</h1><p className="text-sm text-navy-400">Presentations, proposals, social creatives and shared assets. Content stored as JSON (slides/blocks); files reference object-storage keys — never local filesystem (Rule 4).</p></div>
      <div className="bg-white rounded-xl border border-navy-100">
        <div className="flex gap-1 px-4 border-b border-navy-100">
          <Tab active={tab==='projects'} onClick={()=>setTab('projects')}>Projects</Tab>
          <Tab active={tab==='templates'} onClick={()=>setTab('templates')}>Templates</Tab>
        </div>
        <div className="p-4">{tab==='projects' ? <ProjectsTab /> : <TemplatesTab />}</div>
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [rows, setRows] = useState<CreativeProject[]>([]);
  const [selected, setSelected] = useState<CreativeProject|null>(null);
  const [form, setForm] = useState({ name:'', type:'PRESENTATION' });
  const [assetForm, setAssetForm] = useState({ fileName:'' });
  const load = async()=> setRows(await api.get<CreativeProject[]>('/creative/projects'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!form.name.trim()) return; await api.post('/creative/projects', form); setForm({ name:'', type:'PRESENTATION'}); await load(); };
  const open = async(id:string)=> setSelected(await api.get<CreativeProject>(`/creative/projects/${id}`));
  const transition = async(status:string)=>{ await api.post(`/creative/projects/${selected!.id}/publish`, { status }); setSelected(await api.get<CreativeProject>(`/creative/projects/${selected!.id}`)); await load(); };
  const addAsset = async()=>{
    if(!assetForm.fileName.trim() || !selected) return;
    await api.post(`/creative/projects/${selected.id}/assets`, { fileName: assetForm.fileName, storageKey: `tenant/${selected.id}/${assetForm.fileName}` });
    setAssetForm({ fileName:''}); setSelected(await api.get<CreativeProject>(`/creative/projects/${selected.id}`));
  };
  if(selected) {
    return (
      <div className="space-y-3">
        <Btn v="sec" onClick={()=>setSelected(null)}>← Back</Btn>
        <div className="border rounded-xl p-4 bg-navy-50/30">
          <div className="text-lg font-bold">{selected.name}</div>
          <div className="text-sm text-navy-400">{selected.type} · <Chip tone={selected.status==='PUBLISHED'?'green':selected.status==='APPROVED'?'blue':'slate'}>{selected.status}</Chip></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.status==='DRAFT' && <Btn onClick={()=>transition('IN_REVIEW')}>Submit for review</Btn>}
          {selected.status==='IN_REVIEW' && <><Btn onClick={()=>transition('APPROVED')}>Approve</Btn><Btn v="sec" onClick={()=>transition('DRAFT')}>Return to draft</Btn></>}
          {selected.status==='APPROVED' && <Btn onClick={()=>transition('PUBLISHED')}>Publish</Btn>}
          <Btn v="sec" onClick={async()=>{ await api.post(`/creative/projects/${selected.id}/duplicate`,{}); await load(); setSelected(null);}}>Duplicate</Btn>
          <Btn v="sec" onClick={async()=>{ await api.del(`/creative/projects/${selected.id}`); setSelected(null); await load();}}>Archive</Btn>
        </div>
        <div className="border rounded-xl p-3">
          <div className="font-semibold text-sm">Assets (object-storage keys, Rule 4)</div>
          <div className="flex gap-2 mt-2"><input value={assetForm.fileName} onChange={e=>setAssetForm({fileName:e.target.value})} placeholder="file name *" className="border rounded-lg px-3 py-2 text-sm flex-1"/><Btn onClick={addAsset}>Add asset</Btn></div>
          <div className="mt-2 space-y-1 text-sm">{(selected.assets??[]).map((a:CreativeAsset)=>(
            <div key={a.id} className="flex justify-between border rounded-lg px-3 py-2"><span>{a.fileName}<span className="text-navy-400 text-xs ml-2">{a.storageKey ?? a.url ?? ''}</span></span><button onClick={async()=>{ await api.del(`/creative/assets/${a.id}`); setSelected(await api.get<CreativeProject>(`/creative/projects/${selected!.id}`));}} className="text-navy-400 hover:text-navy-600 text-xs">Remove</button></div>
          ))}{!selected.assets?.length && <div className="text-navy-400 text-sm">No assets.</div>}</div>
        </div>
        <div className="border rounded-xl p-3 bg-white">
          <div className="font-semibold text-sm">Content JSON</div>
          <pre className="text-xs bg-navy-50 rounded-lg p-3 mt-2 overflow-auto max-h-48">{JSON.stringify(selected.contentJson ?? { blocks: [] }, null, 2)}</pre>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Project name *" className="border rounded-lg px-3 py-2 text-sm w-64"/>
        <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>PRESENTATION</option><option>PROPOSAL</option><option>BROCHURE</option><option>SOCIAL_POST</option><option>LOGO</option><option>BANNER</option><option>OTHER</option></select>
        <Btn onClick={create}>Create project</Btn>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {rows.map(r=>(
          <button key={r.id} onClick={()=>open(r.id)} className="text-left border rounded-xl p-4 hover:border-navy-300 bg-white">
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-navy-400 mt-1">{r.type} · <Chip tone={r.status==='PUBLISHED'?'green':r.status==='APPROVED'?'blue':'slate'}>{r.status}</Chip></div>
            <div className="text-xs text-navy-300 mt-1">{r.assets?.length ?? 0} assets · {r.updatedAt.slice(0,10)}</div>
          </button>
        ))}
      </div>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No projects. Create one.</div>}
    </div>
  );
}

function TemplatesTab() {
  const [rows, setRows] = useState<MarketingTemplate[]>([]);
  const [form, setForm] = useState({ name:'', category:'PRESENTATION', bodyHtml:'' });
  const load = async()=> setRows(await api.get<MarketingTemplate[]>('/creative/templates'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!form.name.trim()) return; await api.post('/creative/templates', form); setForm({ name:'', category:'PRESENTATION', bodyHtml:''}); await load(); };
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-4 gap-2">
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Template name *" className="border rounded-lg px-3 py-2 text-sm"/>
        <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>PRESENTATION</option><option>PROPOSAL</option><option>SOCIAL</option><option>EMAIL</option></select>
        <input value={form.bodyHtml} onChange={e=>setForm({...form,bodyHtml:e.target.value})} placeholder="HTML / template markup" className="border rounded-lg px-3 py-2 text-sm"/>
        <Btn onClick={create}>Create template</Btn>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {rows.map(r=>(
          <div key={r.id} className="border rounded-xl p-4 bg-navy-50/30">
            <div className="font-semibold text-sm">{r.name}</div>
            <div className="text-xs text-navy-400"><Chip>{r.category}</Chip> {r.subject ?? ''}</div>
            <div className="text-xs text-navy-300 mt-2 truncate">{r.bodyHtml?.slice(0,120) ?? ''}</div>
          </div>
        ))}
      </div>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No creative templates. Create one or seed from system templates.</div>}
    </div>
  );
}
