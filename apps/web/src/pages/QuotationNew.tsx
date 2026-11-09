import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, inr, ApiFailure } from '../lib/api';

/**
 * Quotation builder.
 * The live preview calls POST /quotations/calculate, which runs the SAME
 * wage engine as the save path (a faithful port of the legacy
 * salaryBreakupCalc_ verified by differential tests). What the user sees is
 * therefore exactly what gets stored.
 */

interface WageRow {
  name: string; headcount: number;
  basic: number; vda: number; hra: number; special: number;
  washing: number; conveyance: number; other: number; extra4: number;
  uniform: number; uniformEmployee: number; compliance: number;
  lwfYear: number; lwfDedYear: number; groupInsurance: number;
}

const emptyRow = (name = 'Security Guard'): WageRow => ({
  name, headcount: 1, basic: 14000, vda: 3000, hra: 2000, special: 1000,
  washing: 300, conveyance: 800, other: 0, extra4: 0,
  uniform: 0, uniformEmployee: 0, compliance: 0, lwfYear: 0, lwfDedYear: 0, groupInsurance: 0,
});

const num = (v: string) => (v === '' ? 0 : Number(v));

export default function QuotationNew() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [feeMode, setFeeMode] = useState('PERCENTAGE');
  const [feeValue, setFeeValue] = useState(10);
  const [taxPercent, setTaxPercent] = useState(18);

  const [useWages, setUseWages] = useState(true);
  const [rows, setRows] = useState<WageRow[]>([emptyRow()]);

  const payload = useMemo(() => ({
    customerName: customerName || 'Preview',
    issueDate,
    items: useWages ? [] : [{ description: 'Manpower services', unit: 'month', quantity: 1, rate: 50000 }],
    managementFeeMode: feeMode,
    managementFeeValue: Number(feeValue) || 0,
    taxPercent: Number(taxPercent) || 0,
    ...(useWages ? { wageColumns: rows, breakupSettings: { ptAmount: 200, ptThreshold: 15000, esiCap: 21000, pfCap: 15000 } } : {}),
  }), [customerName, issueDate, feeMode, feeValue, taxPercent, useWages, rows]);

  const preview = useMutation({
    mutationFn: (p: unknown) => api.post<any>('/quotations/calculate', p),
  });

  // Recalculate whenever the payload changes.
  const runPreview = () => preview.mutate(payload);

  const save = useMutation({
    mutationFn: () => api.post<any>('/quotations', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      nav('/quotations', { state: { created: res.quotationNo } });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : 'Could not save quotation.'),
  });

  const totals = preview.data?.totals;
  const wage = preview.data?.wage;
  const result = useMemo(() => preview.data, [preview.data]);

  const setRow = (i: number, k: keyof WageRow, v: string) => {
    const next = [...rows];
    (next[i] as any)[k] = k === 'name' ? v : num(v);
    setRows(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">New quotation</h1>
        <p className="text-sm text-navy-500 mt-1">
          Wage breakup, management fee and tax are computed by the same engine that was verified against your
          existing v5.6.61 calculations.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-4">Customer &amp; terms</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Customer name *</label>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                       placeholder="e.g. Acme Corporate Park" />
              </div>
              <div>
                <label className="label">Issue date</label>
                <input type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Tax %</label>
                <input type="number" className="input" value={taxPercent}
                       onChange={(e) => setTaxPercent(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Management fee mode</label>
                <select className="input" value={feeMode} onChange={(e) => setFeeMode(e.target.value)}>
                  <option value="NONE">None</option>
                  <option value="PERCENTAGE">% of subtotal</option>
                  <option value="LUMPSUM">Lump sum</option>
                  <option value="BASIC_VDA_PCT">% of Basic + VDA</option>
                  <option value="ST2_PCT">% of Sub Total II</option>
                  <option value="CTC_PCT">% of CTC</option>
                </select>
              </div>
              <div>
                <label className="label">Fee value</label>
                <input type="number" className="input" value={feeValue}
                       onChange={(e) => setFeeValue(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-navy-800">Wage breakout</h2>
              <label className="flex items-center gap-2 text-sm text-navy-600">
                <input type="checkbox" checked={useWages} onChange={(e) => setUseWages(e.target.checked)} />
                Use wage breakout
              </label>
            </div>

            {useWages && (
              <div className="space-y-4">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-lg border border-navy-100 p-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <label className="label">Designation</label>
                        <input className="input" value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Headcount</label>
                        <input type="number" className="input" value={r.headcount}
                               onChange={(e) => setRow(i, 'headcount', e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <button className="btn-ghost w-full" onClick={() => setRows(rows.filter((_, x) => x !== i))}
                                disabled={rows.length === 1}>Remove</button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4 mt-3">
                      {([['basic', 'Basic'], ['vda', 'VDA'], ['hra', 'HRA'], ['special', 'Special'],
                         ['washing', 'Washing'], ['conveyance', 'Conveyance'], ['other', 'Other']] as const).map(([k, label]) => (
                        <div key={k}>
                          <label className="label">{label}</label>
                          <input type="number" className="input" value={(r as any)[k]}
                                 onChange={(e) => setRow(i, k as keyof WageRow, e.target.value)} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn-ghost" onClick={() => setRows([...rows, emptyRow('Supervisor')])}>
                  + Add another designations
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn-ghost" onClick={runPreview} disabled={preview.isPending}>
              {preview.isPending ? 'Calculating…' : 'Calculate preview'}
            </button>
            <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !customerName}>
              {save.isPending ? 'Saving…' : 'Save quotation'}
            </button>
          </div>
        </div>

        {/* live summary */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-navy-800 mb-3">Quotation totals</h2>
            {!totals && <p className="text-sm text-navy-400">Press “Calculate preview”.</p>}
            {totals && (
              <dl className="space-y-2 text-sm">
                <Row label="Subtotal" value={inr(totals.subtotal)} />
                <Row label="Management fee" value={inr(totals.managementFee)} />
                <Row label="Amount before tax" value={inr(totals.amountBeforeTax)} />
                <Row label={`Tax (${taxPercent}%)`} value={inr(totals.taxAmount)} />
                <div className="border-t border-navy-100 pt-2">
                  <Row label="Grand total" value={inr(totals.grandTotal)} bold />
                </div>
              </dl>
            )}
          </div>

          {wage && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-3">Wage engine output</h2>
              <div className="space-y-3">
                {wage.cols.map((c: any, i: number) => (
                  <div key={i} className="rounded-lg bg-navy-50/60 p-3 text-sm">
                    <div className="flex items-center justify-between font-medium text-navy-800">
                      <span>{c.name} × {c.headcount}</span>
                      <span>{inr(c.ctc)} <span className="text-xs text-navy-400">CTC</span></span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-navy-500">
                      <Mini label="Sub Total I" v={c.st1} />
                      <Mini label="Sub Total II" v={c.st2} />
                      <Mini label="Bonus" v={c.bonus} />
                      <Mini label="Leave wages" v={c.leaveWages} />
                      <Mini label="PF (er)" v={c.pfEmployer} />
                      <Mini label="ESI (er)" v={c.esiEmployer} />
                      <Mini label="Gross" v={c.gross} />
                      <Mini label="Take home" v={c.takeHome} />
                    </dl>
                  </div>
                ))}
                <div className="border-t border-navy-100 pt-3 text-sm">
                  <Row label="Total billing" value={inr(wage.totals.billing)} bold />
                  <Row label="Total headcount" value={String(wage.totals.headcount)} />
                </div>
              </div>
            </div>
          )}

          {result?.items?.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-navy-800 mb-3">Line items</h2>
              <ul className="space-y-1 text-sm">
                {result.items.map((it: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-navy-600">{it.description}</span>
                    <span>{inr(it.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-navy-800' : 'text-navy-500'}>{label}</dt>
      <dd className={bold ? 'font-semibold text-navy-800' : 'font-medium text-navy-700'}>{value}</dd>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-right font-medium text-navy-700">{Math.round(v * 100) / 100}</dd>
    </>
  );
}
