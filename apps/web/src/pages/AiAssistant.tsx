import { useEffect, useState } from 'react';
import { api, AiConversation, AiMessage, AiToolCall, AiProviderConfig } from '../lib/api';

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

export default function AiAssistant() {
  const [tab, setTab] = useState<'chat'|'tools'|'providers'>('chat');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-xl font-bold">AI Assistant</h1><p className="text-sm text-navy-400">Tenant-scoped conversations. High-risk actions (email / send / finance) require approval — Rule 19.</p></div>
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">No auto-send without approval. Official APIs only (Rule 20).</div>
      </div>
      <div className="bg-white rounded-xl border border-navy-100">
        <div className="flex gap-1 px-4 border-b border-navy-100">
          <Tab active={tab==='chat'} onClick={()=>setTab('chat')}>Chat</Tab>
          <Tab active={tab==='tools'} onClick={()=>setTab('tools')}>Tool approvals</Tab>
          <Tab active={tab==='providers'} onClick={()=>setTab('providers')}>Providers</Tab>
        </div>
        <div className="p-4">
          {tab==='chat' && <ChatTab />}
          {tab==='tools' && <ToolsTab />}
          {tab==='providers' && <ProvidersTab />}
        </div>
      </div>
    </div>
  );
}

function ChatTab() {
  const [convs, setConvs] = useState<AiConversation[]>([]);
  const [active, setActive] = useState<AiConversation | null>(null);
  const [msgs, setMsgs] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const load = async()=> setConvs(await api.get<AiConversation[]>('/ai/conversations'));
  const openConv = async(id:string)=>{
    const c = await api.get<any>(`/ai/conversations/${id}`);
    setActive(c); setMsgs(c.messages ?? []);
  };
  useEffect(()=>{ load(); },[]);
  const newConv = async()=>{
    setCreating(true);
    const c = await api.post<AiConversation>('/ai/conversations', { title: 'New conversation' });
    await load(); await openConv(c.id); setCreating(false);
  };
  const send = async()=>{
    if(!input.trim() || !active) return;
    const r = await api.post<any>(`/ai/conversations/${active.id}/messages`, { content: input });
    setInput('');
    // Optimistic: reload messages
    const c = await api.get<any>(`/ai/conversations/${active.id}`);
    setActive(c); setMsgs(c.messages ?? []); await load();
  };
  return (
    <div className="flex gap-4 min-h-[420px]">
      <div className="w-64 shrink-0 border rounded-xl p-2 space-y-1 overflow-y-auto max-h-[560px]">
        <Btn onClick={newConv} className="w-full" v="pri">{creating?'…':'＋ New chat'}</Btn>
        {convs.map(c=>(
          <button key={c.id} onClick={()=>openConv(c.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${active?.id===c.id?'bg-navy-900 text-white':'hover:bg-navy-50'}`}>
            <div className="font-medium truncate">{c.title ?? 'Untitled'}</div>
            <div className={`text-xs ${active?.id===c.id?'text-white/60':'text-navy-400'}`}>{c.provider} · {c.updatedAt.slice(0,10)}</div>
          </button>
        ))}
        {!convs.length && <div className="text-sm text-navy-400 py-4 text-center">No conversations.</div>}
      </div>
      <div className="flex-1 border rounded-xl flex flex-col overflow-hidden">
        {!active ? (
          <div className="flex-1 grid place-items-center text-sm text-navy-400">Select or create a conversation.</div>
        ) : (
          <>
            <div className="px-4 py-2 border-b bg-navy-50/40 text-sm font-semibold">{active.title}</div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[380px]">
              {msgs.map(m=>(
                <div key={m.id} className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${m.role==='USER'?'bg-navy-900 text-white ml-auto':'bg-navy-50 text-navy-800'}`}>
                  <div className="text-[11px] font-bold opacity-60 mb-1">{m.role}{m.toolName?` · ${m.toolName}`:''}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
              {!msgs.length && <div className="text-sm text-navy-400">No messages yet. Start chatting.</div>}
            </div>
            <div className="p-3 border-t flex gap-2">
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about leads, tenders, clients, or draft an email (with approval)…" className="flex-1 border rounded-lg px-3 py-2 text-sm"/>
              <Btn onClick={send}>Send</Btn>
            </div>
            <div className="px-4 pb-2 text-xs text-navy-400">Tools like <code>send_email</code> / <code>schedule_social_post</code> always enter the approval queue — they are not executed until a user with <b>ai:approve</b> approves.</div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolsTab() {
  const [rows, setRows] = useState<AiToolCall[]>([]);
  const [filter, setFilter] = useState('');
  const load = async()=> setRows(await api.get<AiToolCall[]>(`/ai/tool-calls${filter?`?status=${filter}`:''}`));
  useEffect(()=>{ load(); },[]);
  const approve = async(id:string, status:string)=>{
    try { await api.post(`/ai/tool-calls/${id}/approve`, { status }); await load(); } catch(e:any){ alert(e.error?.message ?? e.message); }
  };
  const defs = ['PENDING_APPROVAL','APPROVED','EXECUTED','REJECTED','FAILED'];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e=>setFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All statuses</option>{defs.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        <Btn v="sec" onClick={load}>Refresh</Btn>
      </div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Tool</th><th>Status</th><th>Args</th><th>Result</th><th></th></tr></thead>
      <tbody>{rows.map(r=>(
        <tr key={r.id} className="border-b">
          <td className="py-2 font-medium">{r.toolName}</td>
          <td><Chip tone={r.status==='PENDING_APPROVAL'?'amber':r.status==='EXECUTED'?'green':r.status==='REJECTED'?'red':'slate'}>{r.status}</Chip></td>
          <td className="text-xs max-w-xs truncate">{JSON.stringify(r.argsJson).slice(0,80)}</td>
          <td className="text-xs max-w-xs truncate">{JSON.stringify(r.resultJson)?.slice(0,80) ?? '—'}</td>
          <td className="space-x-1 text-right">
            {r.status==='PENDING_APPROVAL' && <><Btn v="sec" onClick={()=>approve(r.id,'APPROVED')}>Approve</Btn><Btn onClick={()=>approve(r.id,'REJECTED')} v="sec">Reject</Btn></>}
          </td>
        </tr>
      ))}</tbody></table>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No tool calls.</div>}
      <div className="text-xs text-navy-400 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">High-risk tools (draft_email, send_email, create_campaign, schedule_social_post) are marked <b>highRisk</b> and cannot auto-execute — they remain PENDING_APPROVAL until approved by a user with <b>ai:approve</b>.</div>
    </div>
  );
}

function ProvidersTab() {
  const [rows, setRows] = useState<AiProviderConfig[]>([]);
  const [form, setForm] = useState({ provider:'OPENAI', displayName:'OpenAI', model:'gpt-4o-mini', apiKey:'' });
  const load = async()=> setRows(await api.get<AiProviderConfig[]>('/ai/providers'));
  useEffect(()=>{ load(); },[]);
  const save = async()=>{
    if(!form.provider.trim()) return;
    await api.post('/ai/providers', form); setForm({ provider:'OPENAI', displayName:'OpenAI', model:'gpt-4o-mini', apiKey:''}); await load();
  };
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-5 gap-2">
        <select value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>OPENAI</option><option>GROQ</option><option>GEMINI</option><option>DEEPSEEK</option><option>OPENROUTER</option><option>ZAI</option><option>ANTHROPIC</option></select>
        <input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Display name *" className="border rounded-lg px-3 py-2 text-sm"/>
        <input value={form.model} onChange={e=>setForm({...form,model:e.target.value})} placeholder="Model" className="border rounded-lg px-3 py-2 text-sm"/>
        <input value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})} placeholder="API key (write-only)" type="password" className="border rounded-lg px-3 py-2 text-sm"/>
        <Btn onClick={save}>Save provider</Btn>
      </div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Provider</th><th>Display</th><th>Model</th><th>Enabled</th><th>Has key</th><th></th></tr></thead>
      <tbody>{rows.map(r=>(
        <tr key={r.id} className="border-b"><td><Chip>{r.provider}</Chip></td><td>{r.displayName}</td><td className="text-xs">{r.model ?? '—'}</td><td>{r.enabled?'✓':'—'}</td><td>{r.hasKey?'✓ (encrypted)':'—'}</td><td><Btn v="sec" onClick={async()=>{ await api.del(`/ai/providers/${r.id}`); await load();}}>Delete</Btn></td></tr>
      ))}</tbody></table>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No providers configured. Add one to enable real LLM replies (otherwise requests return a stub).</div>}
      <div className="text-xs text-navy-400">API keys are encrypted with <code>CREDENTIAL_ENCRYPTION_KEY</code> and never returned to the browser. Platform defaults (tenantId null) are visible read-only.</div>
    </div>
  );
}
