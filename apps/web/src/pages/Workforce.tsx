import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, Users, AlertTriangle, CheckCircle2, TrendingUp, ArrowRightLeft, UserMinus,
} from 'lucide-react';
import {
  api, ApiFailure, Allocation, Contract, Employee, ManpowerRequirement,
  StrengthByContract, StrengthReport, WAGE_CATEGORIES, dateOnly, today,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from './Dashboard';

const stateTone = (state: string) =>
  state === 'SHORT' ? 'text-red-600' : state === 'OVER' ? 'text-amber-600' : 'text-emerald-600';

/**
 * Workforce board — Phase 4's exit criterion, on screen.
 *
 * Left: contracted requirement per contract, reconciled against who is actually
 * deployed on the selected date. Right: the deployment ledger with release and
 * replacement actions. Shortfalls are the primary number because they are the
 * only ones anybody has to act on.
 */
export default function Workforce() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [asOn, setAsOn] = useState(today());
  const [selectedContract, setSelectedContract] = useState('');
  const [rowError, setRowError] = useState('');
  const [showDeploy, setShowDeploy] = useState(false);
  const [showReq, setShowReq] = useState(false);

  const [deploy, setDeploy] = useState({ employeeId: '', startDate: today(), designation: '', category: 'UNSKILLED' });
  const [req, setReq] = useState({ designation: 'Housekeeping', category: 'UNSKILLED', requiredCount: '5', effectiveFrom: today() });
  const [replaceFor, setReplaceFor] = useState<{ id: string; employeeId: string } | null>(null);
  const [replacementId, setReplacementId] = useState('');

  const board = useQuery({
    queryKey: ['strength-by-contract', asOn],
    queryFn: () => api.get<StrengthByContract[]>(`/workforce/strength-by-contract?asOn=${asOn}`),
  });

  const detail = useQuery({
    queryKey: ['strength', selectedContract, asOn],
    queryFn: () => api.get<StrengthReport>(`/workforce/strength?contractId=${selectedContract}&asOn=${asOn}`),
    enabled: !!selectedContract,
  });

  const contracts = useQuery({
    queryKey: ['contracts-picker'],
    queryFn: () => api.get<{ items: Contract[] }>('/contracts?pageSize=100'),
  });

  const employees = useQuery({
    queryKey: ['employee-options'],
    queryFn: () => api.get<Array<{ id: string; employeeCode: string; name: string; designation: string | null }>>(
      '/employees/options?status=ACTIVE',
    ),
  });

  const allocations = useQuery({
    queryKey: ['allocations', selectedContract],
    queryFn: () => api.get<Allocation[]>(
      `/allocations?pageSize=200${selectedContract ? `&contractId=${selectedContract}` : ''}`,
    ),
  });

  const requirements = useQuery({
    queryKey: ['requirements', selectedContract],
    queryFn: () => api.get<ManpowerRequirement[]>(
      `/manpower-requirements${selectedContract ? `?contractId=${selectedContract}` : ''}`,
    ),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['strength-by-contract'] });
    qc.invalidateQueries({ queryKey: ['strength'] });
    qc.invalidateQueries({ queryKey: ['allocations'] });
    qc.invalidateQueries({ queryKey: ['requirements'] });
  };

  const deployMutation = useMutation({
    mutationFn: () => api.post<Allocation>('/allocations', {
      employeeId: deploy.employeeId,
      contractId: selectedContract,
      designation: deploy.designation || undefined,
      category: deploy.category,
      startDate: deploy.startDate,
    }),
    onSuccess: () => { setRowError(''); setShowDeploy(false); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not deploy'),
  });

  const reqMutation = useMutation({
    mutationFn: () => api.post<ManpowerRequirement>('/manpower-requirements', {
      contractId: selectedContract,
      designation: req.designation,
      category: req.category,
      requiredCount: Number(req.requiredCount),
      effectiveFrom: req.effectiveFrom,
    }),
    onSuccess: () => { setRowError(''); setShowReq(false); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not save the requirement'),
  });

  const release = useMutation({
    mutationFn: (id: string) => api.post<Allocation>(`/allocations/${id}/release`, {
      endDate: today(), reason: 'Released from the workforce board',
    }),
    onSuccess: () => { setRowError(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not release'),
  });

  const replace = useMutation({
    mutationFn: () => api.post<{ replaced: Allocation; replacement: Allocation }>(
      `/allocations/${replaceFor!.id}/replace`,
      { replacementEmployeeId: replacementId, effectiveDate: today(), reason: 'Replaced on site' },
    ),
    onSuccess: () => { setRowError(''); setReplaceFor(null); setReplacementId(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not replace'),
  });

  const rows = board.data ?? [];
  const totalRequired = rows.reduce((s, r) => s + r.required, 0);
  const totalDeployed = rows.reduce((s, r) => s + r.deployed, 0);
  const shortContracts = rows.filter((r) => r.state === 'SHORT').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-800">Workforce</h1>
          <p className="text-sm text-navy-500 mt-1">Deployed strength reconciled to contracted headcount</p>
        </div>
        <label className="ml-auto">
          <span className="label">As on</span>
          <input className="input" type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Contracted headcount', value: totalRequired, icon: Users },
          { label: 'Deployed', value: totalDeployed, icon: CheckCircle2 },
          { label: 'Contracts short-staffed', value: shortContracts, icon: AlertTriangle, warn: shortContracts > 0 },
        ].map(({ label, value, icon: Icon, warn }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</div>
              <Icon size={15} className={warn ? 'text-red-500' : 'text-navy-300'} />
            </div>
            <div className={`mt-1 text-2xl font-semibold ${warn ? 'text-red-600' : 'text-navy-800'}`}>{value}</div>
          </div>
        ))}
      </div>

      {rowError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{rowError}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-navy-50 border-b border-navy-100">
            <tr>
              <th className="th">Contract</th>
              <th className="th">Client</th>
              <th className="th text-right">Required</th>
              <th className="th text-right">Deployed</th>
              <th className="th text-right">Variance</th>
              <th className="th">State</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map((r) => (
              <tr key={r.contractId}
                  className={`cursor-pointer hover:bg-navy-50/60 ${selectedContract === r.contractId ? 'bg-brand-50/40' : ''}`}
                  onClick={() => setSelectedContract(r.contractId)}>
                <td className="td">
                  <div className="font-mono text-xs">{r.contractNo}</div>
                  <div className="text-xs text-navy-500">{r.serviceType || 'General'}</div>
                </td>
                <td className="td text-sm">{r.clientName ?? '—'}</td>
                <td className="td text-right tabular-nums">{r.required}</td>
                <td className="td text-right tabular-nums">{r.deployed}</td>
                <td className={`td text-right tabular-nums font-semibold ${stateTone(r.state)}`}>
                  {r.variance > 0 ? `+${r.variance}` : r.variance}
                </td>
                <td className="td">
                  <span className={`badge ${r.state === 'SHORT' ? 'bg-red-50 text-red-700'
                    : r.state === 'OVER' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {r.state}
                  </span>
                </td>
                <td className="td text-xs text-navy-400">
                  {selectedContract === r.contractId ? 'viewing' : 'view'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="td text-center text-navy-500 py-10" colSpan={7}>
                No active contracts. <Link to="/contracts" className="text-brand-500">Create one</Link> first.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedContract && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-navy-800">Contract detail</h2>
            {can('allocation:write') && (
              <button className="btn-primary ml-auto" onClick={() => setShowDeploy((v) => !v)}>
                <Plus size={15} /> Deploy employee
              </button>
            )}
            {can('manpower:write') && (
              <button className="btn-ghost" onClick={() => setShowReq((v) => !v)}>
                <Plus size={15} /> Add requirement
              </button>
            )}
          </div>

          {detail.data && (
            <div className="card p-5">
              <div className="flex flex-wrap items-baseline gap-3 mb-4">
                <h3 className="font-semibold text-navy-800">Strength on {dateOnly(detail.data.asOn)}</h3>
                <span className={`text-sm font-semibold ${stateTone(detail.data.state)}`}>
                  {detail.data.deployed} deployed / {detail.data.required} required
                  ({detail.data.variance > 0 ? '+' : ''}{detail.data.variance})
                </span>
              </div>
              <table className="w-full">
                <thead className="border-b border-navy-100">
                  <tr>
                    <th className="th">Designation</th>
                    <th className="th">Category</th>
                    <th className="th text-right">Required</th>
                    <th className="th text-right">Deployed</th>
                    <th className="th text-right">Variance</th>
                    <th className="th">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {detail.data.lines.map((l) => (
                    <tr key={`${l.designation}-${l.category}`}>
                      <td className="td font-medium">{l.designation}</td>
                      <td className="td text-xs">{l.category.replace(/_/g, ' ')}</td>
                      <td className="td text-right tabular-nums">{l.required}</td>
                      <td className="td text-right tabular-nums">{l.deployed}</td>
                      <td className={`td text-right tabular-nums font-semibold ${stateTone(l.state)}`}>
                        {l.variance > 0 ? `+${l.variance}` : l.variance}
                      </td>
                      <td className="td">
                        <span className={`badge ${l.state === 'SHORT' ? 'bg-red-50 text-red-700'
                          : l.state === 'OVER' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {l.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {detail.data.lines.length === 0 && (
                    <tr><td className="td text-center text-navy-500 py-6" colSpan={6}>
                      No manpower requirement recorded for this contract.
                    </td></tr>
                  )}
                </tbody>
              </table>
              {detail.data.unplanned.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <div className="text-xs font-semibold text-amber-800">Deployed but not in the requirement</div>
                  <div className="text-xs text-amber-700 mt-1">
                    {detail.data.unplanned.map((u) => `${u.designation} × ${u.count}`).join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}

          {showDeploy && can('allocation:write') && (
            <div className="card p-5">
              <h3 className="font-semibold text-navy-800 mb-3">Deploy an employee</h3>
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end"
                    onSubmit={(e) => { e.preventDefault(); deployMutation.mutate(); }}>
                <label className="lg:col-span-2">
                  <span className="label">Employee *</span>
                  <select className="input" required value={deploy.employeeId}
                          onChange={(e) => setDeploy({ ...deploy, employeeId: e.target.value })}>
                    <option value="">Select an employee…</option>
                    {(employees.data ?? []).map((e) => (
                      <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Designation here</span>
                  <input className="input" value={deploy.designation}
                         onChange={(e) => setDeploy({ ...deploy, designation: e.target.value })} />
                </label>
                <label>
                  <span className="label">Wage category</span>
                  <select className="input" value={deploy.category}
                          onChange={(e) => setDeploy({ ...deploy, category: e.target.value })}>
                    {WAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">Start date *</span>
                  <input className="input" type="date" required value={deploy.startDate}
                         onChange={(e) => setDeploy({ ...deploy, startDate: e.target.value })} />
                </label>
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={deployMutation.isPending}>
                    {deployMutation.isPending ? 'Deploying…' : 'Deploy'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setShowDeploy(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {showReq && can('manpower:write') && (
            <div className="card p-5">
              <h3 className="font-semibold text-navy-800 mb-3">Add a manpower requirement</h3>
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end"
                    onSubmit={(e) => { e.preventDefault(); reqMutation.mutate(); }}>
                <label>
                  <span className="label">Designation *</span>
                  <input className="input" required value={req.designation}
                         onChange={(e) => setReq({ ...req, designation: e.target.value })} />
                </label>
                <label>
                  <span className="label">Category</span>
                  <select className="input" value={req.category}
                          onChange={(e) => setReq({ ...req, category: e.target.value })}>
                    {WAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">Required count *</span>
                  <input className="input" type="number" min="1" required value={req.requiredCount}
                         onChange={(e) => setReq({ ...req, requiredCount: e.target.value })} />
                </label>
                <label>
                  <span className="label">Effective from *</span>
                  <input className="input" type="date" required value={req.effectiveFrom}
                         onChange={(e) => setReq({ ...req, effectiveFrom: e.target.value })} />
                </label>
                <button className="btn-primary" disabled={reqMutation.isPending}>
                  {reqMutation.isPending ? 'Saving…' : 'Add'}
                </button>
              </form>
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-semibold text-navy-800 mb-3">Requirements</h3>
            <table className="w-full">
              <thead className="border-b border-navy-100">
                <tr>
                  <th className="th">Designation</th>
                  <th className="th">Category</th>
                  <th className="th text-right">Count</th>
                  <th className="th">From</th>
                  <th className="th">To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {(requirements.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.designation}</td>
                    <td className="td text-xs">{r.category.replace(/_/g, ' ')}</td>
                    <td className="td text-right tabular-nums">{r.requiredCount}</td>
                    <td className="td text-xs">{dateOnly(r.effectiveFrom)}</td>
                    <td className="td text-xs">{r.effectiveTo ? dateOnly(r.effectiveTo) : 'ongoing'}</td>
                  </tr>
                ))}
                {(requirements.data ?? []).length === 0 && (
                  <tr><td className="td text-center text-navy-500 py-6" colSpan={5}>No requirements recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-navy-800 mb-3">Deployment ledger</h3>
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-navy-100">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Designation</th>
                  <th className="th">Period</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {(allocations.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="td">
                      <div className="font-medium text-navy-800">{a.employee?.name ?? '—'}</div>
                      <div className="font-mono text-xs text-navy-500">{a.employee?.employeeCode}</div>
                    </td>
                    <td className="td text-sm">{a.designation || '—'}</td>
                    <td className="td text-xs whitespace-nowrap">
                      {dateOnly(a.startDate)} → {a.endDate ? dateOnly(a.endDate) : 'ongoing'}
                    </td>
                    <td className="td"><StatusBadge status={a.status} /></td>
                    <td className="td">
                      {can('allocation:write') && a.status === 'ACTIVE' && (
                        <div className="flex flex-wrap gap-2">
                          <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600"
                                  onClick={() => { setReplaceFor({ id: a.id, employeeId: a.employeeId }); setReplacementId(''); }}>
                            <ArrowRightLeft size={12} /> Replace
                          </button>
                          <button className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                                  onClick={() => release.mutate(a.id)} disabled={release.isPending}>
                            <UserMinus size={12} /> Release
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {(allocations.data ?? []).length === 0 && (
                  <tr><td className="td text-center text-navy-500 py-6" colSpan={5}>Nobody deployed yet.</td></tr>
                )}
              </tbody>
            </table>

            {replaceFor && (
              <form className="mt-4 pt-4 border-t border-navy-100 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end"
                    onSubmit={(e) => { e.preventDefault(); replace.mutate(); }}>
                <label>
                  <span className="label">Replacement employee *</span>
                  <select className="input" required value={replacementId}
                          onChange={(e) => setReplacementId(e.target.value)}>
                    <option value="">Select…</option>
                    {(employees.data ?? [])
                      .filter((e) => e.id !== replaceFor.employeeId)
                      .map((e) => <option key={e.id} value={e.id}>{e.employeeCode} — {e.name}</option>)}
                  </select>
                </label>
                <button className="btn-primary" disabled={replace.isPending}>
                  {replace.isPending ? 'Replacing…' : 'Replace'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setReplaceFor(null)}>Cancel</button>
              </form>
            )}
          </div>
        </>
      )}

      <div className="rounded-xl bg-navy-50 border border-navy-100 p-4 text-xs text-navy-500 flex gap-2">
        <TrendingUp size={14} className="mt-0.5 shrink-0" />
        <span>
          A shortfall is computed from who is contracted to be on site on the selected date versus who
          is actually deployed. Released and replaced allocations stay in the ledger as history and are
          never counted as current strength.
        </span>
      </div>
    </div>
  );
}
