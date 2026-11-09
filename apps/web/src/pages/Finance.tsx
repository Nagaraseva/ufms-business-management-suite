import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Banknote, Clock, FileText, Landmark, AlertTriangle, CheckCircle2, XCircle, Plus, Search } from 'lucide-react';
import { api, ApiFailure, inr, dateOnly, FinanceOverview, ReceivableAgeing, FinanceApproval } from '../lib/api';
import { useAuth } from '../lib/auth';

type Tab = 'overview' | 'invoices' | 'bills' | 'bank' | 'approvals';

export default function Finance() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const overview = useQuery({ queryKey: ['finance-overview'], queryFn: () => api.get<FinanceOverview>('/finance/overview'), enabled: tab === 'overview' });
  const receivable = useQuery({ queryKey: ['receivable-ageing'], queryFn: () => api.get<ReceivableAgeing>('/finance/receivable-ageing'), enabled: tab === 'overview' });
  const approvals = useQuery({ queryKey: ['finance-approvals'], queryFn: () => api.get<FinanceApproval[]>('/finance/approvals'), enabled: tab === 'approvals' });

  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.error.message : 'Request failed');
  const canRead = can('invoice:read') || can('finance:read');
  const canWrite = can('invoice:write') || can('finance:write');

  if (!canRead) return <div className="p-6 text-sm text-red-700">You do not have permission to view Finance. Ask an administrator for finance:read.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Finance</h1>
          <p className="text-sm text-navy-500 mt-1">Invoices, vendor bills, receipts, bank book and approvals. The server enforces the ₹2,00,000 approval threshold — not the browser.</p>
        </div>
        {canWrite && tab === 'invoices' && (
          <Link to="/finance/invoices/new" className="btn-primary ml-auto"><Plus size={16} /> New invoice</Link>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><XCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}</div>}

      <div className="flex gap-1 border-b border-navy-100 pb-0">
        {(['overview','invoices','bills','bank','approvals'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab===t ? 'border-brand-500 text-brand-600' : 'border-transparent text-navy-500 hover:text-navy-700'}`}>
            {t==='overview'?'Overview': t==='invoices'?'Invoices': t==='bills'?'Vendor Bills': t==='bank'?'Bank & Book':'Approvals'}
            {t==='approvals' && approvals.data?.length ? <span className="ml-1 bg-amber-100 text-amber-800 text-[11px] px-1.5 py-0.5 rounded-full">{approvals.data.length}</span> : null}
          </button>
        ))}
      </div>

      {tab==='overview' && <OverviewTab overview={overview} receivable={receivable} />}
      {tab==='invoices' && <InvoicesTab onError={fail} onNotice={setNotice} />}
      {tab==='bills' && <BillsTab onError={fail} onNotice={setNotice} />}
      {tab==='bank' && <BankTab onError={fail} />}
      {tab==='approvals' && <ApprovalsTab approvals={approvals} qc={qc} onError={fail} onNotice={setNotice} />}
    </div>
  );
}

function OverviewTab({ overview, receivable }: { overview: ReturnType<typeof useQuery<FinanceOverview>>, receivable: ReturnType<typeof useQuery<ReceivableAgeing>> }) {
  const k = overview.data?.kpi;
  const ageing = receivable.data?.buckets ?? overview.data?.ageing;
  if (overview.isLoading) return <div className="p-6 text-sm text-navy-500">Loading finance overview…</div>;
  if (!overview.data) return <div className="p-6 text-sm text-navy-500">No finance data yet.</div>;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label:'Outstanding receivable', value: inr(k?.outstanding ?? 0), icon: FileText },
          { label:'Overdue', value: inr(k?.overdue ?? 0), icon: Clock, warn: (k?.overdue ?? 0) > 0 },
          { label:'Cash position', value: inr(k?.cashPosition ?? 0), icon: Landmark },
          { label:'Pending approvals', value: String(k?.pendingApprovals ?? 0), icon: AlertTriangle, warn: (k?.pendingApprovals ?? 0) > 0 },
        ].map(({label,value,icon:Icon,warn})=> (
          <div key={label} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 flex items-center gap-1"><Icon size={13} /> {label}</div>
            <div className={`mt-1 text-xl font-semibold ${warn?'text-amber-600':'text-navy-800'}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold text-navy-800 text-sm mb-3">Receivable ageing</h3>
          <div className="space-y-2">
            {Object.entries(ageing ?? {}).map(([bucket, amt])=> (
              <div key={bucket} className="flex justify-between text-sm">
                <span className="text-navy-500">{bucket} days</span>
                <span className="font-semibold text-navy-800">{inr(Number(amt))}</span>
              </div>
            ))}
            {!ageing || !Object.keys(ageing).length && <div className="text-sm text-navy-400">No outstanding invoices.</div>}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="font-semibold text-navy-800 text-sm mb-3">Recent invoices</h3>
          <div className="space-y-2">
            {(overview.data.recentInvoices ?? []).map(inv=>(
              <Link key={inv.id} to={`/finance/invoices/${inv.id}`} className="flex justify-between text-sm hover:bg-navy-50 px-2 py-1.5 rounded">
                <span className="text-navy-800 font-mono text-xs">{inv.invoiceNo} <span className="text-navy-400">· {inv.clientName}</span></span>
                <span className="font-semibold">{inr(inv.totalAmount)}</span>
              </Link>
            ))}
            {!overview.data.recentInvoices?.length && <div className="text-sm text-navy-400">No invoices yet.</div>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold text-navy-800 text-sm mb-2">Recent receipts</h3>
          {(overview.data.recentReceipts ?? []).map(r=>(
            <div key={r.id} className="flex justify-between text-sm py-1 border-b border-navy-50 last:border-0">
              <span className="text-navy-600">{dateOnly(r.receivedDate)} · {r.mode} · {r.referenceNo}</span>
              <span className="font-semibold text-emerald-700">{inr(r.amount)}</span>
            </div>
          ))}
          {!overview.data.recentReceipts?.length && <div className="text-sm text-navy-400">No receipts yet.</div>}
        </div>
        <div className="card p-4">
          <h3 className="font-semibold text-navy-800 text-sm mb-2">Recent vendor bills</h3>
          {(overview.data.recentBills ?? []).map(b=>(
            <div key={b.id} className="flex justify-between text-sm py-1 border-b border-navy-50 last:border-0">
              <span className="text-navy-800 font-mono text-xs">{b.billNo}</span>
              <span className="font-semibold">{inr(b.totalAmount)}</span>
            </div>
          ))}
          {!overview.data.recentBills?.length && <div className="text-sm text-navy-400">No vendor bills yet.</div>}
        </div>
      </div>
    </div>
  );
}

function InvoicesTab({ onError, onNotice }: { onError:(e:unknown)=>void, onNotice:(s:string)=>void }) {
  const [q,setQ]=useState(''); const [status,setStatus]=useState('');
  const list = useQuery({
    queryKey:['invoices',q,status],
    queryFn:()=> api.get<{items: import('../lib/api').Invoice[], total:number, page:number, pageSize:number}>(`/invoices?pageSize=100${q?`&search=${encodeURIComponent(q)}`:''}${status?`&status=${status}`:''}`),
  });
  const [receiptFor, setReceiptFor] = useState<string|null>(null);
  const [receiptForm, setReceiptForm] = useState({ amount:'', mode:'NEFT', referenceNo:'', bankName:'' });
  const createReceipt = useMutation({
    mutationFn: ()=> api.post(`/invoices/${receiptFor}/receipts`, { amount: Number(receiptForm.amount), mode: receiptForm.mode, referenceNo: receiptForm.referenceNo, bankName: receiptForm.bankName }),
    onSuccess: ()=>{ onNotice('Receipt recorded. Large receipts above ₹2L require approval.'); setReceiptFor(null); setReceiptForm({amount:'',mode:'NEFT',referenceNo:'',bankName:''}); },
    onError,
  });
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-3">
        <label className="flex-1 min-w-[220px]"><span className="label">Search</span>
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input className="input pl-8" placeholder="Invoice no, client" value={q} onChange={e=>setQ(e.target.value)} /></div>
        </label>
        <label className="w-48"><span className="label">Status</span>
          <select className="input" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All</option><option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option><option value="PARTIALLY_PAID">Partially paid</option><option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600 text-xs">
            <tr><th className="text-left px-4 py-2">Invoice</th><th className="text-left px-2 py-2">Client</th><th className="text-left px-2 py-2">Due</th><th className="text-right px-2 py-2">Total</th><th className="text-right px-2 py-2">Paid</th><th className="text-right px-2 py-2">Balance</th><th className="text-left px-2 py-2">Status</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map(inv=>{
              const total=Number(inv.totalAmount), paid=Number(inv.paidAmount), bal=total-paid;
              return (
              <tr key={inv.id} className="border-t border-navy-100 hover:bg-navy-50/50">
                <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNo}</td>
                <td className="px-2 py-2">{inv.clientName}</td>
                <td className="px-2 py-2 text-xs">{dateOnly(inv.dueDate)}</td>
                <td className="px-2 py-2 text-right">{inr(total)}</td>
                <td className="px-2 py-2 text-right text-emerald-700">{inr(paid)}</td>
                <td className="px-2 py-2 text-right font-semibold">{inr(bal)}</td>
                <td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${statusTone(inv.status)}`}>{inv.status}</span></td>
                <td className="px-4 py-2 flex gap-2 justify-end">
                  <Link to={`/finance/invoices/${inv.id}`} className="text-brand-600 hover:underline text-xs">Open</Link>
                  {inv.status!=='CANCELLED' && inv.status!=='PAID' && <button className="text-xs text-navy-600 hover:text-navy-800" onClick={()=>setReceiptFor(inv.id)}>Receipt</button>}
                  <a href={`/api/v1/invoices/${inv.id}/html`} target="_blank" rel="noreferrer" className="text-xs text-navy-500 hover:text-navy-700">Print</a>
                </td>
              </tr>);
            })}
            {!list.data?.items.length && !list.isLoading && <tr><td colSpan={8} className="text-center py-8 text-navy-400 text-sm">No invoices match this filter.</td></tr>}
          </tbody>
        </table>
      </div>

      {receiptFor && (
        <div className="fixed inset-0 bg-navy-950/40 grid place-items-center p-4 z-30">
          <div className="card w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold text-navy-900">Record receipt</h3>
            <p className="text-xs text-navy-500">Receipts above ₹2,00,000 require a second approval before they reduce the balance.</p>
            <label><span className="label">Amount (₹) *</span><input className="input" type="number" value={receiptForm.amount} onChange={e=>setReceiptForm({...receiptForm,amount:e.target.value})} /></label>
            <label><span className="label">Mode</span>
              <select className="input" value={receiptForm.mode} onChange={e=>setReceiptForm({...receiptForm,mode:e.target.value})}>
                <option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>CHEQUE</option><option>CASH</option>
              </select>
            </label>
            <label><span className="label">Reference no *</span><input className="input" value={receiptForm.referenceNo} onChange={e=>setReceiptForm({...receiptForm,referenceNo:e.target.value})} placeholder="UTR / cheque no" /></label>
            <label><span className="label">Bank</span><input className="input" value={receiptForm.bankName} onChange={e=>setReceiptForm({...receiptForm,bankName:e.target.value})} placeholder="HDFC, ICICI … or CASH" /></label>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={()=>setReceiptFor(null)}>Cancel</button>
              <button className="btn-primary" disabled={createReceipt.isPending || !receiptForm.amount || !receiptForm.referenceNo} onClick={()=>createReceipt.mutate()}>Save receipt</button>
            </div>
            {createReceipt.isError && <div className="text-sm text-red-700">{(createReceipt.error as ApiFailure)?.error?.message ?? 'Failed'}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function BillsTab({ onError, onNotice }: { onError:(e:unknown)=>void, onNotice:(s:string)=>void }) {
  const [q,setQ]=useState('');
  const list = useQuery({
    queryKey:['vendor-bills',q],
    queryFn:()=> api.get<{items: import('../lib/api').VendorBill[], total:number}>(`/vendor-bills?pageSize=100${q?`&search=${encodeURIComponent(q)}`:''}`),
  });
  return (
    <div className="space-y-4">
      <div className="card p-3 flex gap-2">
        <div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
        <input className="input pl-8" placeholder="Bill no, vendor" value={q} onChange={e=>setQ(e.target.value)} /></div>
        <Link to="/finance/vendor-bills/new" className="btn-primary shrink-0"><Plus size={16} /> New bill</Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-4 py-2">Bill</th><th className="text-left px-2 py-2">Vendor</th><th className="text-left px-2 py-2">Date</th><th className="text-right px-2 py-2">Total</th><th className="text-right px-2 py-2">Paid</th><th className="text-left px-2 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {(list.data?.items??[]).map(b=>(
              <tr key={b.id} className="border-t border-navy-100 hover:bg-navy-50/50">
                <td className="px-4 py-2 font-mono text-xs">{b.billNo}</td><td className="px-2 py-2">{b.vendorName}</td><td className="px-2 py-2 text-xs">{dateOnly(b.billDate)}</td>
                <td className="px-2 py-2 text-right">{inr(b.totalAmount)}</td><td className="px-2 py-2 text-right text-emerald-700">{inr(b.paidAmount)}</td>
                <td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${statusTone(b.status)}`}>{b.status}</span></td>
                <td className="px-4 py-2 text-right"><Link to={`/finance/vendor-bills/${b.id}`} className="text-brand-600 hover:underline text-xs">Open</Link></td>
              </tr>
            ))}
            {!list.data?.items.length && !list.isLoading && <tr><td colSpan={7} className="text-center py-8 text-navy-400 text-sm">No vendor bills yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BankTab({ onError }: { onError:(e:unknown)=>void }) {
  const [form,setForm]=useState({ name:'', type:'BANK', bankName:'', accountNo:'', ifsc:'', openingBalance:'', isDefault:false });
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey:['bank-accounts'], queryFn:()=> api.get<import('../lib/api').BankAccount[]>('/bank-accounts') });
  const book = useQuery({ queryKey:['bank-book'], queryFn:()=> api.get<import('../lib/api').BankBookEntry[]>('/bank-book?pageSize=200') });
  const create = useMutation({
    mutationFn:()=> api.post('/bank-accounts', { name: form.name, type: form.type, bankName: form.bankName||undefined, accountNo: form.accountNo||undefined, ifsc: form.ifsc||undefined, openingBalance: form.openingBalance? Number(form.openingBalance): undefined, isDefault: form.isDefault }),
    onSuccess:()=>{ setForm({name:'',type:'BANK',bankName:'',accountNo:'',ifsc:'',openingBalance:'',isDefault:false}); qc.invalidateQueries({queryKey:['bank-accounts']}); },
    onError,
  });
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold text-navy-800 text-sm mb-3 flex items-center gap-1"><Landmark size={14} /> Bank accounts</h3>
        <div className="grid sm:grid-cols-5 gap-2 mb-3">
          <input className="input" placeholder="Account name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          <input className="input" placeholder="Bank" value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})} />
          <input className="input font-mono text-sm" placeholder="Account no" value={form.accountNo} onChange={e=>setForm({...form,accountNo:e.target.value})} />
          <input className="input font-mono text-sm" placeholder="IFSC" value={form.ifsc} onChange={e=>setForm({...form,ifsc:e.target.value})} />
          <input className="input" type="number" placeholder="Opening balance" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:e.target.value})} />
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs text-navy-600"><input type="checkbox" checked={form.isDefault} onChange={e=>setForm({...form,isDefault:e.target.checked})} /> Default</label>
          <button className="btn-primary ml-auto" disabled={!form.name || create.isPending} onClick={()=>create.mutate()}>{create.isPending?'Saving…':'Add account'}</button>
        </div>
        <div className="mt-3 space-y-1">
          {(accounts.data??[]).map(a=>(
            <div key={a.id} className="flex justify-between text-sm border border-navy-100 rounded px-3 py-2">
              <span><b>{a.name}</b> <span className="text-navy-400 text-xs">{a.bankName ?? ''} {a.accountNo?`· ${a.accountNo}`:''}</span> {a.isDefault && <span className="text-[11px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded ml-1">Default</span>}</span>
              <span className="font-semibold">{inr(a.currentBalance)}</span>
            </div>
          ))}
          {!accounts.data?.length && !accounts.isLoading && <div className="text-sm text-navy-400 py-2">No bank accounts yet.</div>}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-navy-100"><h3 className="font-semibold text-navy-800 text-sm">Bank book (journal)</h3><p className="text-xs text-navy-500">Every approved receipt and payment posts a balanced journal entry. Debits equal credits.</p></div>
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600 text-xs"><tr><th className="text-left px-4 py-2">Date</th><th className="text-left px-2 py-2">Account</th><th className="text-left px-2 py-2">Type</th><th className="text-left px-2 py-2">Reference</th><th className="text-right px-2 py-2">Debit</th><th className="text-right px-4 py-2">Credit</th></tr></thead>
          <tbody>
            {(book.data??[]).map(e=>(
              <tr key={e.id} className="border-t border-navy-100">
                <td className="px-4 py-2 text-xs">{dateOnly(e.entryDate)}</td><td className="px-2 py-2 text-xs">{e.accountName}</td><td className="px-2 py-2 text-xs">{e.entryType}</td><td className="px-2 py-2 text-xs font-mono">{e.referenceNo ?? '—'}</td>
                <td className="px-2 py-2 text-right">{Number(e.debit)? inr(e.debit):'—'}</td><td className="px-4 py-2 text-right">{Number(e.credit)? inr(e.credit):'—'}</td>
              </tr>
            ))}
            {!book.data?.length && !book.isLoading && <tr><td colSpan={6} className="text-center py-6 text-navy-400 text-sm">No journal entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApprovalsTab({ approvals, qc, onError, onNotice }: { approvals: ReturnType<typeof useQuery<FinanceApproval[]>>, qc: ReturnType<typeof useQueryClient>, onError:(e:unknown)=>void, onNotice:(s:string)=>void }) {
  const approve = useMutation({
    mutationFn: (id:string)=> api.post(`/finance/approvals/${id}/approve`, {}),
    onSuccess: ()=>{onNotice('Approved.'); qc.invalidateQueries({queryKey:['finance-approvals']}); qc.invalidateQueries({queryKey:['finance-overview']}); qc.invalidateQueries({queryKey:['bank-book']});},
    onError,
  });
  const reject = useMutation({
    mutationFn: ({id,reason}:{id:string,reason:string})=> api.post(`/finance/approvals/${id}/reject`, { reason }),
    onSuccess: ()=>{onNotice('Rejected.'); qc.invalidateQueries({queryKey:['finance-approvals']});},
    onError,
  });
  const [rejectId,setRejectId]=useState<string|null>(null); const [reason,setReason]=useState('');
  return (
    <div className="space-y-3">
      <p className="text-xs text-navy-500">Receipts and vendor payments above ₹2,00,000 require a second person to approve. The requester cannot approve their own receipt.</p>
      {(approvals.data??[]).length===0 ? <div className="card p-6 text-sm text-navy-500">No pending approvals.</div> :
        <div className="space-y-2">
          {approvals.data?.map(a=>(
            <div key={a.id} className="card p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-navy-800">{a.approvalType.replace(/_/g,' ')} · {inr(a.amount)}</div>
                <div className="text-xs text-navy-500">{a.notes ?? ''} · {dateOnly(a.createdAt)}</div>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded ${a.status==='PENDING'?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-800'}`}>{a.status}</span>
              {a.status==='PENDING' && (
                <div className="flex gap-1">
                  <button className="btn-primary text-xs" disabled={approve.isPending} onClick={()=>approve.mutate(a.id)}>Approve</button>
                  <button className="btn-ghost text-xs" onClick={()=>setRejectId(a.id)}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>}
      {rejectId && (
        <div className="fixed inset-0 bg-navy-950/40 grid place-items-center p-4 z-30">
          <div className="card p-5 w-full max-w-md space-y-3">
            <h3 className="font-semibold">Reject approval</h3>
            <textarea className="input h-20" placeholder="Reason" value={reason} onChange={e=>setReason(e.target.value)} />
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={()=>setRejectId(null)}>Cancel</button><button className="btn-primary bg-red-600 hover:bg-red-700" disabled={!reason.trim()} onClick={()=>{reject.mutate({id:rejectId,reason}); setRejectId(null); setReason('');}}>Reject</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusTone(s:string){
  if(s==='PAID') return 'bg-emerald-100 text-emerald-800';
  if(s==='OVERDUE') return 'bg-red-100 text-red-700';
  if(s==='PARTIALLY_PAID') return 'bg-amber-100 text-amber-800';
  if(s==='CANCELLED') return 'bg-navy-100 text-navy-600';
  if(s==='SENT') return 'bg-sky-100 text-sky-800';
  return 'bg-navy-100 text-navy-700';
}
