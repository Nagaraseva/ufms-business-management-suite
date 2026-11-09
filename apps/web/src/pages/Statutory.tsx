import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, AlertTriangle, Lock, Info } from 'lucide-react';
import {
  api, ApiFailure, StatutoryRateSet, MinimumWageRate, LegacyStatutoryDefaults,
  WAGE_CATEGORIES, rateLabel, dateOnly, today,
} from '../lib/api';
import { useAuth } from '../lib/auth';

const statusTone = (s: string) =>
  s === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700'
    : s === 'CONTESTED' ? 'bg-red-50 text-red-700'
    : 'bg-amber-50 text-amber-700';

/**
 * Statutory configuration — Rule 15.
 *
 * Every PF/ESI/PT number and every minimum wage is a dated row with a source.
 * Nothing here is compiled into the payroll engine. A set starts PROVISIONAL,
 * cannot be edited once CONFIRMED, and cannot be confirmed without naming the
 * notification it came from.
 */
export default function Statutory() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'rates' | 'wages'>('rates');
  const [rowError, setRowError] = useState('');
  const [showSet, setShowSet] = useState(false);
  const [showWage, setShowWage] = useState(false);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [setForm, setSetForm] = useState({
    code: '', name: '', jurisdiction: 'CENTRAL',
    effectiveFrom: today(), effectiveTo: '',
    pfWageCap: '25000', pfEePct: '12', pfErPct: '12',
    esiCeiling: '21000', esiEePct: '0.75', esiErPct: '3.25',
    ptFrom: '25000', ptAmount: '200', ptFebAmount: '300',
  });

  const [wageForm, setWageForm] = useState({
    regime: 'KARNATAKA', zone: 'Zone 1', category: 'UNSKILLED',
    monthlyWage: '', effectiveFrom: today(), sourceReference: '',
  });

  const sets = useQuery({
    queryKey: ['rate-sets'],
    queryFn: () => api.get<StatutoryRateSet[]>('/statutory/rate-sets'),
  });
  const wages = useQuery({
    queryKey: ['minimum-wages'],
    queryFn: () => api.get<MinimumWageRate[]>('/statutory/minimum-wages'),
  });
  const defaults = useQuery({
    queryKey: ['legacy-defaults'],
    queryFn: () => api.get<LegacyStatutoryDefaults>('/statutory/legacy-defaults'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rate-sets'] });
    qc.invalidateQueries({ queryKey: ['minimum-wages'] });
  };

  const createSet = useMutation({
    mutationFn: () => api.post<StatutoryRateSet>('/statutory/rate-sets', {
      code: setForm.code,
      name: setForm.name,
      jurisdiction: setForm.jurisdiction,
      effectiveFrom: setForm.effectiveFrom,
      effectiveTo: setForm.effectiveTo || undefined,
      rates: [
        { code: 'PF_WAGE_CAP', label: 'EPF wage ceiling', value: Number(setForm.pfWageCap), unit: 'AMOUNT' },
        { code: 'PF_EE_PCT', label: 'Employee EPF share', value: Number(setForm.pfEePct), unit: 'PERCENT' },
        { code: 'PF_ER_PCT', label: 'Employer EPF share', value: Number(setForm.pfErPct), unit: 'PERCENT' },
        { code: 'ESI_GROSS_CEILING', label: 'ESI gross ceiling', value: Number(setForm.esiCeiling), unit: 'AMOUNT' },
        { code: 'ESI_EE_PCT', label: 'Employee ESI share', value: Number(setForm.esiEePct), unit: 'PERCENT' },
        { code: 'ESI_ER_PCT', label: 'Employer ESI share', value: Number(setForm.esiErPct), unit: 'PERCENT' },
      ],
      slabs: [
        { fromGross: 0, toGross: Number(setForm.ptFrom) - 0.01, amount: 0 },
        {
          fromGross: Number(setForm.ptFrom), toGross: 999999999,
          amount: Number(setForm.ptAmount),
          overrideMonth: 2, overrideAmount: Number(setForm.ptFebAmount),
        },
      ],
    }),
    onSuccess: () => { setRowError(''); setShowSet(false); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not create the rate set'),
  });

  const confirmSet = useMutation({
    mutationFn: (id: string) => api.post(`/statutory/rate-sets/${id}/confirm`, { sourceReference: source }),
    onSuccess: () => { setRowError(''); setConfirmFor(null); setSource(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not confirm'),
  });

  const createWage = useMutation({
    mutationFn: () => api.post<MinimumWageRate>('/statutory/minimum-wages', {
      regime: wageForm.regime,
      zone: wageForm.zone,
      category: wageForm.category,
      monthlyWage: Number(wageForm.monthlyWage),
      effectiveFrom: wageForm.effectiveFrom,
      sourceReference: wageForm.sourceReference || undefined,
    }),
    onSuccess: () => { setRowError(''); setShowWage(false); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not add the wage rate'),
  });

  const confirmWage = useMutation({
    mutationFn: (id: string) => api.post(`/statutory/minimum-wages/${id}/confirm`, { sourceReference: source }),
    onSuccess: () => { setRowError(''); setConfirmFor(null); setSource(''); refresh(); },
    onError: (e) => setRowError(e instanceof ApiFailure ? e.message : 'Could not confirm'),
  });

  const canWrite = can('statutory:write');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Statutory configuration</h1>
        <p className="text-sm text-navy-500 mt-1">
          Effective-dated rates. Payroll reads these; nothing is hardcoded.
        </p>
      </div>

      {defaults.data && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800">
            <div className="font-semibold mb-1">Fallback values inherited from v5.6.61</div>
            <div className="font-mono">
              PF cap ₹{defaults.data.pfWageCap.toLocaleString('en-IN')} ·
              PF {defaults.data.pfEmployeePct}% · ESI ceiling ₹{defaults.data.esiGrossCeiling.toLocaleString('en-IN')} ·
              ESI {defaults.data.esiEmployeePct}% / {defaults.data.esiEmployerPct}%
            </div>
            <p className="mt-1.5">{defaults.data.warning}</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-navy-100 rounded-lg p-1 w-fit">
        {(['rates', 'wages'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition
                    ${tab === t ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'}`}>
            {t === 'rates' ? 'Rate sets (PF / ESI / PT)' : 'Minimum wages'}
          </button>
        ))}
      </div>

      {rowError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{rowError}</div>}

      {tab === 'rates' && (
        <>
          {canWrite && (
            <button className="btn-primary" onClick={() => setShowSet((v) => !v)}>
              <Plus size={15} /> New rate set
            </button>
          )}

          {showSet && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-1">New rate set</h2>
              <p className="text-xs text-navy-500 mb-4">
                Created as PROVISIONAL. A set covering days already covered by another set is refused.
              </p>
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                    onSubmit={(e) => { e.preventDefault(); createSet.mutate(); }}>
                <label>
                  <span className="label">Code *</span>
                  <input className="input font-mono" required placeholder="EPFO-CENTRAL-2026"
                         value={setForm.code} onChange={(e) => setSetForm({ ...setForm, code: e.target.value })} />
                </label>
                <label className="sm:col-span-2">
                  <span className="label">Name *</span>
                  <input className="input" required value={setForm.name}
                         onChange={(e) => setSetForm({ ...setForm, name: e.target.value })} />
                </label>
                <label>
                  <span className="label">Jurisdiction</span>
                  <input className="input" value={setForm.jurisdiction}
                         onChange={(e) => setSetForm({ ...setForm, jurisdiction: e.target.value })} />
                </label>
                <label>
                  <span className="label">Effective from *</span>
                  <input className="input" type="date" required value={setForm.effectiveFrom}
                         onChange={(e) => setSetForm({ ...setForm, effectiveFrom: e.target.value })} />
                </label>
                <label>
                  <span className="label">Effective to</span>
                  <input className="input" type="date" value={setForm.effectiveTo}
                         onChange={(e) => setSetForm({ ...setForm, effectiveTo: e.target.value })} />
                </label>
                {([
                  ['pfWageCap', 'PF wage ceiling (₹)'],
                  ['pfEePct', 'PF employee %'],
                  ['pfErPct', 'PF employer %'],
                  ['esiCeiling', 'ESI gross ceiling (₹)'],
                  ['esiEePct', 'ESI employee %'],
                  ['esiErPct', 'ESI employer %'],
                  ['ptFrom', 'PT applies from gross (₹)'],
                  ['ptAmount', 'PT amount (₹)'],
                  ['ptFebAmount', 'PT in February (₹)'],
                ] as Array<[keyof typeof setForm, string]>).map(([k, label]) => (
                  <label key={k}>
                    <span className="label">{label}</span>
                    <input className="input" type="number" step="0.01" value={setForm[k]}
                           onChange={(e) => setSetForm({ ...setForm, [k]: e.target.value })} />
                  </label>
                ))}
                <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                  <button className="btn-primary" disabled={createSet.isPending}>
                    {createSet.isPending ? 'Saving…' : 'Create as provisional'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setShowSet(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-3">
            {(sets.data ?? []).map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-navy-500">{s.code}</span>
                      <span className={`badge ${statusTone(s.status)}`}>{s.status}</span>
                      {s.status === 'CONFIRMED' && <Lock size={12} className="text-emerald-600" />}
                    </div>
                    <div className="font-medium text-navy-800 mt-0.5">{s.name}</div>
                    <div className="text-xs text-navy-500">
                      {s.jurisdiction} · {dateOnly(s.effectiveFrom)} → {s.effectiveTo ? dateOnly(s.effectiveTo) : 'open-ended'}
                      {s.sourceReference && ` · ${s.sourceReference}`}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button className="btn-ghost" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                      {expanded === s.id ? 'Hide rates' : 'View rates'}
                    </button>
                    {canWrite && s.status !== 'CONFIRMED' && (
                      <button className="btn-primary" onClick={() => { setConfirmFor(s.id); setSource(s.sourceReference ?? ''); }}>
                        <ShieldCheck size={14} /> Confirm
                      </button>
                    )}
                  </div>
                </div>

                {confirmFor === s.id && (
                  <form className="mt-3 pt-3 border-t border-navy-100 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end"
                        onSubmit={(e) => { e.preventDefault(); confirmSet.mutate(s.id); }}>
                    <label>
                      <span className="label">Source notification *</span>
                      <input className="input" required placeholder="EPFO circular G.S.R. … dated …"
                             value={source} onChange={(e) => setSource(e.target.value)} />
                    </label>
                    <button className="btn-primary" disabled={confirmSet.isPending}>Confirm set</button>
                    <button type="button" className="btn-ghost" onClick={() => setConfirmFor(null)}>Cancel</button>
                  </form>
                )}

                {expanded === s.id && (
                  <div className="mt-3 pt-3 border-t border-navy-100 grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 mb-2">Rates</div>
                      <ul className="space-y-1">
                        {(s.rates ?? []).map((r) => (
                          <li key={r.id} className="flex justify-between text-sm">
                            <span className="text-navy-600">{r.label || rateLabel(r.code)}</span>
                            <span className="font-mono text-navy-800">
                              {Number(r.value)}{r.unit === 'PERCENT' ? '%' : ''}
                            </span>
                          </li>
                        ))}
                        {(s.rates ?? []).length === 0 && <li className="text-sm text-navy-400">No rates recorded.</li>}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 mb-2">PT slabs</div>
                      <ul className="space-y-1">
                        {(s.slabs ?? []).map((sl) => (
                          <li key={sl.id} className="text-sm text-navy-600">
                            ₹{Number(sl.fromGross).toLocaleString('en-IN')} – ₹{Number(sl.toGross).toLocaleString('en-IN')}
                            <span className="font-mono text-navy-800 ml-2">₹{Number(sl.amount)}</span>
                            {sl.overrideMonth && (
                              <span className="text-xs text-navy-500 ml-1">(month {sl.overrideMonth}: ₹{Number(sl.overrideAmount)})</span>
                            )}
                          </li>
                        ))}
                        {(s.slabs ?? []).length === 0 && <li className="text-sm text-navy-400">No slabs recorded.</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {(sets.data ?? []).length === 0 && (
              <div className="card p-8 text-center text-sm text-navy-500">
                No rate sets yet. Payroll will fall back to the legacy defaults shown above.
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'wages' && (
        <>
          {canWrite && (
            <button className="btn-primary" onClick={() => setShowWage((v) => !v)}>
              <Plus size={15} /> Add minimum wage
            </button>
          )}

          {showWage && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-3">Add a minimum wage</h2>
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end"
                    onSubmit={(e) => { e.preventDefault(); createWage.mutate(); }}>
                <label>
                  <span className="label">Regime</span>
                  <input className="input" value={wageForm.regime}
                         onChange={(e) => setWageForm({ ...wageForm, regime: e.target.value })} />
                </label>
                <label>
                  <span className="label">Zone</span>
                  <input className="input" value={wageForm.zone}
                         onChange={(e) => setWageForm({ ...wageForm, zone: e.target.value })} />
                </label>
                <label>
                  <span className="label">Category</span>
                  <select className="input" value={wageForm.category}
                          onChange={(e) => setWageForm({ ...wageForm, category: e.target.value })}>
                    {WAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">Monthly wage (₹) *</span>
                  <input className="input" type="number" min="0" required value={wageForm.monthlyWage}
                         onChange={(e) => setWageForm({ ...wageForm, monthlyWage: e.target.value })} />
                </label>
                <label>
                  <span className="label">Effective from *</span>
                  <input className="input" type="date" required value={wageForm.effectiveFrom}
                         onChange={(e) => setWageForm({ ...wageForm, effectiveFrom: e.target.value })} />
                </label>
                <label>
                  <span className="label">Source reference</span>
                  <input className="input" value={wageForm.sourceReference}
                         onChange={(e) => setWageForm({ ...wageForm, sourceReference: e.target.value })} />
                </label>
                <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
                  <button className="btn-primary" disabled={createWage.isPending}>Add as provisional</button>
                  <button type="button" className="btn-ghost" onClick={() => setShowWage(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-navy-50 border-b border-navy-100">
                <tr>
                  <th className="th">Regime</th>
                  <th className="th">Zone</th>
                  <th className="th">Category</th>
                  <th className="th text-right">Monthly wage</th>
                  <th className="th">Effective from</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {(wages.data ?? []).map((w) => (
                  <tr key={w.id}>
                    <td className="td font-medium">{w.regime}</td>
                    <td className="td text-sm">{w.zone}</td>
                    <td className="td text-xs">{w.category.replace(/_/g, ' ')}</td>
                    <td className="td text-right tabular-nums font-medium">₹{Number(w.monthlyWage).toLocaleString('en-IN')}</td>
                    <td className="td text-xs">{dateOnly(w.effectiveFrom)}</td>
                    <td className="td"><span className={`badge ${statusTone(w.status)}`}>{w.status}</span></td>
                    <td className="td">
                      {canWrite && w.status !== 'CONFIRMED' && (
                        <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                                onClick={() => { setConfirmFor(w.id); setSource(w.sourceReference ?? ''); }}>
                          Confirm
                        </button>
                      )}
                      {confirmFor === w.id && (
                        <form className="mt-2 flex gap-2"
                              onSubmit={(e) => { e.preventDefault(); confirmWage.mutate(w.id); }}>
                          <input className="input text-xs" placeholder="Source notification"
                                 value={source} onChange={(e) => setSource(e.target.value)} />
                          <button className="btn-primary text-xs">OK</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {(wages.data ?? []).length === 0 && (
                  <tr><td className="td text-center text-navy-500 py-10" colSpan={7}>
                    No minimum wages recorded. Floor checks will block rather than guess.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="rounded-xl bg-navy-50 border border-navy-100 p-4 text-xs text-navy-500 flex gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          These figures must be reviewed against the current official notifications before production
          payroll. A CONFIRMED set is locked; supersede it with a new set rather than editing history.
        </span>
      </div>
    </div>
  );
}
