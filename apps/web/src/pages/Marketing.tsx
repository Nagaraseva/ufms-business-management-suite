import { useEffect, useState } from 'react';
import { api, MarketingContact, MarketingList, MarketingCampaign, MarketingTemplate, SocialAccount, SocialPost, MarketingSuppression, MarketingMailbox } from '../lib/api';

// ── Helpers ─────────────────────────────────────────────────────────────────
const H = ({ c, children }: { c?: string; children: React.ReactNode }) => <h2 className={`text-lg font-bold ${c ?? ''}`}>{children}</h2>;
const L = () => <div className="text-sm text-navy-400 py-8 text-center">Loading…</div>;
const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'pri' | 'sec' | 'ghost' }> = ({ v='pri', className='', ...p }) => {
  const s = v==='pri' ? 'bg-navy-900 text-white hover:bg-navy-800' : v==='sec' ? 'bg-navy-50 text-navy-700 hover:bg-navy-100 border border-navy-200' : 'text-navy-500 hover:bg-navy-50';
  return <button {...p} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${s} ${className}`} />;
};
const Chip = ({ children, tone='slate' }: { children: React.ReactNode; tone?: string }) => {
  const m: Record<string,string> = { slate:'bg-navy-50 text-navy-600', green:'bg-emerald-50 text-emerald-700', amber:'bg-amber-50 text-amber-700', red:'bg-red-50 text-red-700', blue:'bg-blue-50 text-blue-700' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m[tone] ?? m.slate}`}>{children}</span>;
};
const Tab = ({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`px-3 py-2 text-sm font-medium border-b-2 ${active ? 'border-navy-900 text-navy-900' : 'border-transparent text-navy-400 hover:text-navy-600'}`}>{children}</button>
);

export default function Marketing() {
  const [tab, setTab] = useState<'contacts'|'lists'|'templates'|'campaigns'|'social'|'suppressions'|'mailboxes'>('contacts');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Marketing & Communication</h1><p className="text-sm text-navy-400">Contacts, lists, templates, campaigns (approval-gated) and social publishing.</p></div>
        <div className="flex gap-2 text-xs">
          <Chip>Rule 19 gated</Chip><Chip tone="blue">Rule 20 official APIs</Chip>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy-100">
        <div className="flex gap-1 px-4 border-b border-navy-100 overflow-x-auto">
          <Tab active={tab==='contacts'} onClick={()=>setTab('contacts')}>Contacts</Tab>
          <Tab active={tab==='lists'} onClick={()=>setTab('lists')}>Lists</Tab>
          <Tab active={tab==='templates'} onClick={()=>setTab('templates')}>Templates</Tab>
          <Tab active={tab==='campaigns'} onClick={()=>setTab('campaigns')}>Campaigns</Tab>
          <Tab active={tab==='social'} onClick={()=>setTab('social')}>Social</Tab>
          <Tab active={tab==='suppressions'} onClick={()=>setTab('suppressions')}>Suppression</Tab>
          <Tab active={tab==='mailboxes'} onClick={()=>setTab('mailboxes')}>Mailboxes</Tab>
        </div>
        <div className="p-4">
          {tab==='contacts' && <ContactsTab />}
          {tab==='lists' && <ListsTab />}
          {tab==='templates' && <TemplatesTab />}
          {tab==='campaigns' && <CampaignsTab />}
          {tab==='social' && <SocialTab />}
          {tab==='suppressions' && <SuppressionsTab />}
          {tab==='mailboxes' && <MailboxesTab />}
        </div>
      </div>
    </div>
  );
}

// ── Contacts ────────────────────────────────────────────────────────────────
function ContactsTab() {
  const [rows, setRows] = useState<MarketingContact[]>([]);
  const [q, setQ] = useState(''); const [form, setForm] = useState({ email:'', name:'', company:'', phone:'' });
  const load = async () => setRows(await api.get<MarketingContact[]>(`/marketing/contacts${q?`?q=${encodeURIComponent(q)}`:''}`));
  useEffect(()=>{ load(); },[]);
  const create = async () => {
    if(!form.email.trim()) return;
    await api.post('/marketing/contacts', form); setForm({ email:'', name:'', company:'', phone:'' }); await load();
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email *" className="border rounded-lg px-3 py-2 text-sm w-56" />
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="name" className="border rounded-lg px-3 py-2 text-sm w-40" />
        <input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="company" className="border rounded-lg px-3 py-2 text-sm w-40" />
        <Btn onClick={create}>Add contact</Btn>
        <div className="ml-auto flex gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="search…" className="border rounded-lg px-3 py-2 text-sm w-48" />
          <Btn v="sec" onClick={load}>Search</Btn>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-navy-400 border-b"><th className="text-left py-2 px-2">Email</th><th>Name</th><th>Company</th><th>Status</th><th>Source</th><th></th></tr></thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.id} className="border-b hover:bg-navy-50/50">
                <td className="py-2 px-2 font-medium">{r.email}</td><td>{r.name ?? '—'}</td><td>{r.company ?? '—'}</td>
                <td><Chip tone={r.status==='ACTIVE'?'green':r.status==='UNSUBSCRIBED'?'amber':'red'}>{r.status}</Chip></td>
                <td className="text-navy-400">{r.source}</td>
                <td><Btn v="ghost" onClick={async()=>{ await api.del(`/marketing/contacts/${r.id}`); await load(); }}>Delete</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="text-sm text-navy-400 py-6 text-center">No contacts yet. Add one above.</div>}
      </div>
    </div>
  );
}

// ── Lists ───────────────────────────────────────────────────────────────────
function ListsTab() {
  const [rows, setRows] = useState<MarketingList[]>([]);
  const [name, setName] = useState('');
  const load = async()=> setRows(await api.get<MarketingList[]>('/marketing/lists'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!name.trim()) return; await api.post('/marketing/lists',{name}); setName(''); await load(); };
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="New list name" className="border rounded-lg px-3 py-2 text-sm w-64"/><Btn onClick={create}>Create list</Btn></div>
      <div className="grid md:grid-cols-3 gap-3">
        {rows.map(l=>(
          <div key={l.id} className="border rounded-xl p-4 bg-navy-50/40">
            <div className="font-semibold">{l.name}</div>
            <div className="text-xs text-navy-400">{l.type} · {l._count?.members ?? 0} members</div>
            <div className="text-xs text-navy-300 mt-1">{l.description ?? ''}</div>
          </div>
        ))}
      </div>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No lists.</div>}
    </div>
  );
}

// ── Templates ───────────────────────────────────────────────────────────────
function TemplatesTab() {
  const [rows, setRows] = useState<MarketingTemplate[]>([]);
  const [form, setForm] = useState({ name:'', subject:'', category:'EMAIL', bodyHtml:'' });
  const load = async()=> setRows(await api.get<MarketingTemplate[]>('/marketing/templates'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!form.name.trim()) return; await api.post('/marketing/templates', form); setForm({ name:'', subject:'', category:'EMAIL', bodyHtml:'' }); await load(); };
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-4 gap-2">
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Template name *" className="border rounded-lg px-3 py-2 text-sm"/>
        <input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Subject" className="border rounded-lg px-3 py-2 text-sm"/>
        <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>EMAIL</option><option>SOCIAL</option><option>PRESENTATION</option><option>PROPOSAL</option></select>
        <Btn onClick={create}>Create template</Btn>
      </div>
      <textarea value={form.bodyHtml} onChange={e=>setForm({...form,bodyHtml:e.target.value})} placeholder="HTML body (use {{name}} variables)" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm"/>
      <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Name</th><th>Subject</th><th>Category</th><th></th></tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.id} className="border-b"><td className="py-2 font-medium">{r.name}</td><td>{r.subject ?? '—'}</td><td><Chip>{r.category}</Chip></td><td><Btn v="ghost" onClick={async()=>{await api.del(`/marketing/templates/${r.id}`); await load();}}>Delete</Btn></td></tr>))}</tbody></table>
      </div>
    </div>
  );
}

// ── Campaigns ───────────────────────────────────────────────────────────────
function CampaignsTab() {
  const [rows, setRows] = useState<MarketingCampaign[]>([]);
  const [form, setForm] = useState({ name:'', subject:'', channel:'EMAIL' });
  const [msg, setMsg] = useState('');
  const load = async()=> setRows(await api.get<MarketingCampaign[]>('/marketing/campaigns'));
  useEffect(()=>{ load(); },[]);
  const create = async()=>{ if(!form.name.trim()) return; await api.post('/marketing/campaigns', form); setForm({ name:'', subject:'', channel:'EMAIL'}); setMsg('Campaign created'); await load(); };
  const transition = async(id:string, status:string)=>{
    try { await api.patch(`/marketing/campaigns/${id}/status`, { status, note:'UI transition' }); setMsg(`${status} ✓`); await load(); } catch(e:any){ setMsg(e.error?.message ?? e.message); }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Campaign name *" className="border rounded-lg px-3 py-2 text-sm w-64"/>
        <input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Subject" className="border rounded-lg px-3 py-2 text-sm w-64"/>
        <select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>EMAIL</option><option>SMS</option><option>WHATSAPP</option></select>
        <Btn onClick={create}>Create</Btn>
      </div>
      {msg && <div className="text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{msg}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-navy-400 border-b"><th className="text-left py-2 px-2">Name</th><th>Channel</th><th>Status</th><th>Sent</th><th className="text-right">Actions</th></tr></thead>
          <tbody>{rows.map(r=>(
            <tr key={r.id} className="border-b">
              <td className="py-2 px-2 font-medium">{r.name}<div className="text-xs text-navy-400">{r.subject ?? ''}</div></td>
              <td><Chip>{r.channel}</Chip></td>
              <td><Chip tone={r.status==='SENT'?'green':r.status==='CANCELLED'?'red':r.status==='DRAFT'?'slate':'blue'}>{r.status}</Chip></td>
              <td>{r.sentCount}/{r.recipientCount}</td>
              <td className="text-right space-x-1">
                {r.status==='DRAFT' && <Btn v="sec" onClick={()=>transition(r.id,'PENDING_APPROVAL')}>Submit</Btn>}
                {r.status==='PENDING_APPROVAL' && <Btn v="sec" onClick={()=>transition(r.id,'APPROVED')}>Approve</Btn>}
                {r.status==='APPROVED' && <><Btn v="sec" onClick={()=>transition(r.id,'SCHEDULED')}>Schedule</Btn><Btn v="ghost" onClick={()=>transition(r.id,'SENDING')}>Send now</Btn></>}
                {r.status==='SENDING' && <Btn v="pri" onClick={()=>transition(r.id,'SENT')}>Mark sent</Btn>}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <div className="text-sm text-navy-400 py-6 text-center">No campaigns.</div>}
      </div>
      <div className="text-xs text-navy-400 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Rule 19: campaigns must go DRAFT → PENDING_APPROVAL → APPROVED → SCHEDULED/SENDING → SENT. Only users with <b>marketing:campaign:approve</b> can approve. Emails are queued via the configured provider adapter (console in dev); no real send occurs without a verified SMTP/SES binding.</div>
    </div>
  );
}

// ── Social ──────────────────────────────────────────────────────────────────
function SocialTab() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [form, setForm] = useState({ platform:'LINKEDIN', handle:'', displayName:'' });
  const [postForm, setPostForm] = useState({ platform:'LINKEDIN', content:'' });
  const load = async()=>{ setAccounts(await api.get<SocialAccount[]>('/marketing/social/accounts')); setPosts(await api.get<SocialPost[]>('/marketing/social/posts')); };
  useEffect(()=>{ load(); },[]);
  const addAccount = async()=>{ if(!form.handle.trim()) return; await api.post('/marketing/social/accounts', form); setForm({ platform:'LINKEDIN', handle:'', displayName:''}); await load(); };
  const addPost = async()=>{ if(!postForm.content.trim()) return; await api.post('/marketing/social/posts', postForm); setPostForm({ platform:'LINKEDIN', content:''}); await load(); };
  const transition = async(id:string, status:string)=>{ await api.patch(`/marketing/social/posts/${id}/status`, { status, note: status==='PUBLISHED'?'manual-confirm publish':'UI' }); await load(); };
  return (
    <div className="space-y-4">
      <div>
        <H>Accounts</H>
        <div className="flex gap-2 mt-2 flex-wrap">
          <select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>LINKEDIN</option><option>FACEBOOK</option><option>INSTAGRAM</option><option>TWITTER</option><option>YOUTUBE</option></select>
          <input value={form.handle} onChange={e=>setForm({...form,handle:e.target.value})} placeholder="handle *" className="border rounded-lg px-3 py-2 text-sm w-48"/>
          <input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="display name" className="border rounded-lg px-3 py-2 text-sm w-48"/>
          <Btn onClick={addAccount}>Add account</Btn>
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">{accounts.map(a=>(
          <span key={a.id} className="border rounded-full px-3 py-1 text-sm bg-navy-50">{a.platform} · {a.handle}{a.verified?' ✓':''}</span>
        ))}{!accounts.length && <span className="text-sm text-navy-400">No accounts.</span>}</div>
      </div>
      <div>
        <H>Posts</H>
        <div className="flex gap-2 mt-2">
          <select value={postForm.platform} onChange={e=>setPostForm({...postForm,platform:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>LINKEDIN</option><option>FACEBOOK</option><option>INSTAGRAM</option><option>TWITTER</option></select>
          <input value={postForm.content} onChange={e=>setPostForm({...postForm,content:e.target.value})} placeholder="Post content *" className="border rounded-lg px-3 py-2 text-sm flex-1"/>
          <Btn onClick={addPost}>Create post</Btn>
        </div>
        <table className="w-full text-sm mt-3"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Platform</th><th>Content</th><th>Status</th><th>Scheduled</th><th></th></tr></thead>
        <tbody>{posts.map(p=>(
          <tr key={p.id} className="border-b"><td><Chip>{p.platform}</Chip></td><td className="max-w-sm truncate">{p.content}</td><td><Chip tone={p.status==='PUBLISHED'?'green':p.status==='DRAFT'?'slate':'blue'}>{p.status}</Chip></td><td className="text-navy-400 text-xs">{p.scheduledAt?.slice(0,10) ?? '—'}</td>
          <td className="space-x-1 text-right">
            {p.status==='DRAFT' && <><Btn v="sec" onClick={()=>transition(p.id,'PENDING_APPROVAL')}>Submit</Btn><Btn v="ghost" onClick={()=>transition(p.id,'SCHEDULED')}>Schedule</Btn></>}
            {p.status==='PENDING_APPROVAL' && <Btn v="sec" onClick={()=>transition(p.id,'APPROVED')}>Approve</Btn>}
            {p.status==='APPROVED' && <Btn v="sec" onClick={()=>transition(p.id,'SCHEDULED')}>Schedule</Btn>}
            {p.status==='SCHEDULED' && <Btn v="pri" onClick={()=>transition(p.id,'PUBLISHED')}>Publish (manual-confirm)</Btn>}
          </td></tr>
        ))}</tbody></table>
      </div>
      <div className="text-xs text-navy-400 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">Rule 20: only LinkedIn supports auto-publish via official API. Other platforms require manual confirmation (the UI enforces a <code>manual-confirm</code> note).</div>
    </div>
  );
}

// ── Suppressions ────────────────────────────────────────────────────────────
function SuppressionsTab() {
  const [rows, setRows] = useState<MarketingSuppression[]>([]);
  const [form, setForm] = useState({ email:'', reason:'UNSUBSCRIBED'});
  const load = async()=> setRows(await api.get<MarketingSuppression[]>('/marketing/suppressions'));
  useEffect(()=>{ load(); },[]);
  const add = async()=>{ if(!form.email.trim()) return; await api.post('/marketing/suppressions', form); setForm({ email:'', reason:'UNSUBSCRIBED'}); await load(); };
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email *" className="border rounded-lg px-3 py-2 text-sm w-64"/><select value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} className="border rounded-lg px-3 py-2 text-sm"><option>UNSUBSCRIBED</option><option>BOUNCED</option><option>COMPLAINED</option><option>MANUAL</option></select><Btn onClick={add}>Suppress</Btn></div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Email</th><th>Reason</th><th></th></tr></thead><tbody>{rows.map(r=>(<tr key={r.id} className="border-b"><td className="py-2">{r.email}</td><td><Chip tone="red">{r.reason}</Chip></td><td><Btn v="ghost" onClick={async()=>{await api.del(`/marketing/suppressions/${r.id}`); await load();}}>Remove</Btn></td></tr>))}</tbody></table>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No suppressions.</div>}
    </div>
  );
}

// ── Mailboxes ───────────────────────────────────────────────────────────────
function MailboxesTab() {
  const [rows, setRows] = useState<MarketingMailbox[]>([]);
  const [email, setEmail] = useState('');
  const load = async()=> setRows(await api.get<MarketingMailbox[]>('/marketing/mailboxes'));
  useEffect(()=>{ load(); },[]);
  const add = async()=>{ if(!email.trim()) return; await api.post('/marketing/mailboxes', { email }); setEmail(''); await load(); };
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="mailbox email *" className="border rounded-lg px-3 py-2 text-sm w-64"/><Btn onClick={add}>Add mailbox</Btn></div>
      <table className="w-full text-sm"><thead><tr className="text-navy-400 border-b"><th className="text-left py-2">Email</th><th>Provider</th><th>Verified</th><th>Credentials</th></tr></thead><tbody>{rows.map(r=>(<tr key={r.id} className="border-b"><td className="py-2">{r.email}</td><td><Chip>{r.provider}</Chip></td><td>{r.verified?'✓':'—'}</td><td>{r.hasCredentials?'stored (encrypted)':'none'}</td></tr>))}</tbody></table>
      {!rows.length && <div className="text-sm text-navy-400 py-4 text-center">No mailboxes.</div>}
      <div className="text-xs text-navy-400">Credentials are stored encrypted (CREDENTIAL_ENCRYPTION_KEY) and never returned to the browser. OAuth verification happens via the provider's official scopes.</div>
    </div>
  );
}
