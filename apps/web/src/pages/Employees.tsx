import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, ArrowUpRight, Users, Lock, TrendingUp } from 'lucide-react';
import {
  api, ApiFailure, Employee, HrSummary, EMPLOYEE_STATUSES, inr, dateOnly,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

/**
 * Employee register.
 *
 * Statutory identifiers are shown only as masked hints. There is no code path
 * on this screen that can display a full Aadhaar, PAN or bank account: the API
 * does not return them, and the reveal endpoint is a separate audited action.
 */
export default function Employees() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const blank = {
    name: '', fatherName: '', mobile: '', email: '',
    designation: '', department: 'Operations',
    dateOfJoining: '', basic: '', hra: '', da: '', otherAllowances: '',
    ptState: 'KARNATAKA', esiApplicable: true, pfApplicable: true,
    aadhaarNo: '', panNo: '', bankAccountNo: '', ifsc: '', bankName: '',
  };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const list = useQuery({
    queryKey: ['employees', q, status],
    queryFn: () => api.get<{ items: Employee[]; total: number }>(
      `/employees?pageSize=200${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`,
    ),
  });

  const summary = useQuery({
    queryKey: ['employee-summary'],
    queryFn: () => api.get<HrSummary>('/employees/summary'),
  });

  const num = (v: string) => (v === '' ? undefined : Number(v));

  const create = useMutation({
    mutationFn: () => api.post<Employee>('/employees', {
      name: form.name,
      fatherName: form.fatherName || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      designation: form.designation || undefined,
      department: form.department || undefined,
      dateOfJoining: form.dateOfJoining || undefined,
      basic: num(form.basic), hra: num(form.hra), da: num(form.da),
      otherAllowances: num(form.otherAllowances),
      ptState: form.ptState || undefined,
      esiApplicable: form.esiApplicable,
      pfApplicable: form.pfApplicable,
      aadhaarNo: form.aadhaarNo || undefined,
      panNo: form.panNo || undefined,
      bankAccountNo: form.bankAccountNo || undefined,
      ifsc: form.ifsc || undefined,
      bankName: form.bankName || undefined,
    }),
    onSuccess: () => {
      setShowForm(false); setError(''); setForm(blank);
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employee-summary'] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save the employee'),
  });

  const s = summary.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Employees</h1>
          <p className="text-sm text-navy-500 mt-1">
            {list.data?.total ?? 0} on the register · {s?.onRolls ?? 0} on rolls
          </p>
        </div>
        {can('employee:write') && (
          <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> New employee
          </button>
        )}
      </div>

      {s && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Active', value: s.active, icon: Users },
            { label: 'Notice period', value: s.notice, icon: TrendingUp, warn: s.notice > 0 },
            { label: 'On hold', value: s.onHold, icon: Users, warn: s.onHold > 0 },
            { label: 'Left', value: s.left, icon: Users },
            { label: 'Monthly gross', value: inr(s.monthlyGrossEstimate), icon: TrendingUp },
          ].map(({ label, value, icon: Icon, warn }) => (
            <div key={label} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</div>
                <Icon size={15} className={warn ? 'text-amber-500' : 'text-navy-300'} />
              </div>
              <div className={`mt-1 text-xl font-semibold ${warn ? 'text-amber-600' : 'text-navy-800'}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-1">New employee</h2>
          <p className="text-xs text-navy-500 mb-4">
            The employee code is allocated automatically (EMP-YYYY-NNNN). Aadhaar, PAN and bank
            account are encrypted before they are stored and are never shown again.
          </p>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <label className="sm:col-span-2">
              <span className="label">Full name *</span>
              <input className="input" required value={form.name} onChange={set('name')} />
            </label>
            <label>
              <span className="label">Father's name</span>
              <input className="input" value={form.fatherName} onChange={set('fatherName')} />
            </label>
            <label>
              <span className="label">Mobile</span>
              <input className="input" placeholder="+91 98450 11223" value={form.mobile} onChange={set('mobile')} />
            </label>
            <label>
              <span className="label">Email</span>
              <input className="input" type="email" value={form.email} onChange={set('email')} />
            </label>
            <label>
              <span className="label">Designation</span>
              <input className="input" value={form.designation} onChange={set('designation')} />
            </label>
            <label>
              <span className="label">Department</span>
              <input className="input" value={form.department} onChange={set('department')} />
            </label>
            <label>
              <span className="label">Date of joining</span>
              <input className="input" type="date" value={form.dateOfJoining} onChange={set('dateOfJoining')} />
            </label>
            <label>
              <span className="label">PT state</span>
              <input className="input" placeholder="KARNATAKA" value={form.ptState} onChange={set('ptState')} />
            </label>

            <label>
              <span className="label">Basic (₹/month)</span>
              <input className="input" type="number" min="0" value={form.basic} onChange={set('basic')} />
            </label>
            <label>
              <span className="label">HRA (₹/month)</span>
              <input className="input" type="number" min="0" value={form.hra} onChange={set('hra')} />
            </label>
            <label>
              <span className="label">DA (₹/month)</span>
              <input className="input" type="number" min="0" value={form.da} onChange={set('da')} />
            </label>
            <label>
              <span className="label">Other allowances (₹/month)</span>
              <input className="input" type="number" min="0" value={form.otherAllowances} onChange={set('otherAllowances')} />
            </label>

            <label>
              <span className="label">Aadhaar</span>
              <input className="input font-mono" placeholder="12 digits" maxLength={14}
                     value={form.aadhaarNo} onChange={set('aadhaarNo')} />
            </label>
            <label>
              <span className="label">PAN</span>
              <input className="input font-mono" placeholder="AAAAA9999A" maxLength={10}
                     value={form.panNo} onChange={set('panNo')} />
            </label>
            <label>
              <span className="label">Bank account</span>
              <input className="input font-mono" value={form.bankAccountNo} onChange={set('bankAccountNo')} />
            </label>
            <label>
              <span className="label">Bank name</span>
              <input className="input" value={form.bankName} onChange={set('bankName')} />
            </label>
            <label>
              <span className="label">IFSC</span>
              <input className="input font-mono" value={form.ifsc} onChange={set('ifsc')} />
            </label>

            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm text-navy-600">
                <input type="checkbox" checked={form.esiApplicable}
                       onChange={(e) => setForm({ ...form, esiApplicable: e.target.checked })} />
                ESI applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-navy-600">
                <input type="checkbox" checked={form.pfApplicable}
                       onChange={(e) => setForm({ ...form, pfApplicable: e.target.checked })} />
                PF applicable
              </label>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
              <button className="btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create employee'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[220px]">
          <span className="label">Search</span>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input className="input pl-9" placeholder="Name, code, mobile, designation"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </label>
        <label className="w-52">
          <span className="label">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {EMPLOYEE_STATUSES.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="bg-navy-50 border-b border-navy-100">
            <tr>
              <th className="th">Code</th>
              <th className="th">Name</th>
              <th className="th">Designation</th>
              <th className="th">Mobile</th>
              <th className="th">Identifiers</th>
              <th className="th text-right">Monthly gross</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {(list.data?.items ?? []).map((e) => {
              const gross = Number(e.basic) + Number(e.hra) + Number(e.da) + Number(e.otherAllowances);
              return (
                <tr key={e.id} className="hover:bg-navy-50/60">
                  <td className="td font-mono text-xs">{e.employeeCode}</td>
                  <td className="td">
                    <div className="font-medium text-navy-800">{e.name}</div>
                    <div className="text-xs text-navy-500">
                      {e.department || 'Unassigned'} · joined {dateOnly(e.dateOfJoining)}
                    </div>
                  </td>
                  <td className="td text-sm">{e.designation || '—'}</td>
                  <td className="td text-xs">{e.mobile || '—'}</td>
                  <td className="td text-xs">
                    <div className="flex items-center gap-1 text-navy-500">
                      <Lock size={11} />
                      <span className="font-mono">{e.aadhaarHint ?? '—'}</span>
                    </div>
                    <div className="font-mono text-navy-400">{e.panHint ?? '—'}</div>
                  </td>
                  <td className="td text-right tabular-nums">{inr(gross)}</td>
                  <td className="td"><StatusBadge status={e.status} /></td>
                  <td className="td">
                    <Link to={`/employees/${e.id}`}
                          className="text-brand-500 hover:text-brand-600 inline-flex items-center gap-1 text-sm font-medium">
                      Open <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {list.data?.items.length === 0 && (
              <tr><td className="td text-center text-navy-500 py-10" colSpan={8}>No employees match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
