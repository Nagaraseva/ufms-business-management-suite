/**
 * UFMS wage-breakup / CTC engine
 * ==============================
 *
 * FAITHFUL PORT of the legacy `salaryBreakupCalc_()` in `Quotations.gs:902`
 * of United Sales CRM v5.6.61-options.
 *
 * WHY A LINE-BY-LINE PORT
 * -----------------------
 * Project Rule 3 forbids omitting existing behaviour and Rule 13 forbids
 * changing working business rules without documenting why. Quotation values
 * already sent to customers depend on this exact arithmetic, including its
 * quirks. So the order of operations, the rounding points, the conditional
 * bases and even the "management fee is never inside CTC" decision are
 * reproduced exactly.
 *
 * Documented deviations from the legacy implementation are listed in
 * docs/business-rules-and-calculations.md §5 and are limited to:
 *   - rate constants (PF 12%/13%, ESI 3.25%/0.75%, gratuity 4.81%,
 *     bonus 8.33%) are now *inputs* with the legacy values as defaults,
 *     so they can be effective-dated instead of hard-coded;
 *   - `NaN` inputs are rejected rather than silently coerced.
 *
 * LEGACY BEHAVIOURS DELIBERATELY PRESERVED (do not "fix" these):
 *   1. P.F employer is 13% of PF wage, and under `roundRupee` it is
 *      recomputed as `pf12 + edli + admin` (12% + 0.5% + 0.5%) rather than
 *      rounded independently — the two paths can differ by ₹1.
 *   2. `breakupFeePerHead559_` ignores the per-row headcount for all modes
 *      except PERCENTAGE and LUMPSUM.
 *   3. ESI is charged on `st1 + bonus + leaveWages + nfh` (not on gross)
 *      unless `esiOnGross` is set.
 *   4. `ptAverage` overrides `ptAmount` with 2500/12 regardless of the
 *      configured amount.
 *   5. `bonusRate === 8.33` is treated as exactly 0.0833, not 8.33/100
 *      (identical here, but the legacy comparison is an epsilon check).
 */

/* ------------------------------------------------------------------ *
 * TYPES
 * ------------------------------------------------------------------ */

export interface CustomAllowance {
  id: 'xa1' | 'xa2' | 'xa3';
  name: string;
  pf: boolean;
  esi: boolean;
}

/** Per-breakup option switches (legacy `salaryBreakupOpts561_`). */
export interface BreakupOptions {
  applyNfh: boolean;
  applyLwfKa: boolean;
  ptAverage: boolean;
  applyCodeWage: boolean;
  esiOnGross: boolean;
  pfNoCap: boolean;
  extra4Ot: boolean;
  applyReliever: boolean;
  pfSplit: boolean;
  bonusYearly: boolean;
  roundRupee: boolean;
  showDayRate: boolean;
  nfhDays: number;
  lwfEr: number;
  lwfEe: number;
  bonusRate: number;
  relieverDiv: number;
  customAllow: CustomAllowance[];
}

/** One wage column (a designation / category row). */
export interface WageColumnInput {
  name: string;
  headcount: number;
  basic: number;
  vda: number;
  hra: number;
  special: number;
  washing: number;
  conveyance: number;
  other: number;
  extra4: number;
  uniform: number;
  uniformEmployee: number;
  compliance: number;
  lwfYear: number;
  lwfDedYear: number;
  groupInsurance: number;
  xa1?: number;
  xa2?: number;
  xa3?: number;
}

/** Breakup-level switches that live beside the options. */
export interface BreakupSettings {
  applyBonus?: boolean;
  applyLeaveWages?: boolean;
  applyEsi?: boolean;
  applyInsurance?: boolean;
  applyPf?: boolean;
  applyPt?: boolean;
  applyGratuity?: boolean;
  ptOnGross?: boolean;
  ptAmount: number;
  ptThreshold: number;
  esiCap: number;
  pfCap: number;
  /**
   * Legacy reads these off the breakup record, not the options block, and
   * treats "not false" as ON — so both default to TRUE and every saved
   * breakup keeps its uniform figure until someone unticks it.
   */
  applyUniformCompany?: boolean;
  applyUniformEmployee?: boolean;
}

/** Effective-dated statutory rates, passed in rather than hard-coded. */
export interface StatutoryRates {
  esiEmployer: number; // 0.0325
  esiEmployee: number; // 0.0075
  pfEmployer: number;  // 0.13
  pfEmployee: number;  // 0.12
  edli: number;        // 0.005
  admin: number;       // 0.005
  gratuity: number;    // 0.0481
  ptAnnualAverage: number; // 2500
}

export const LEGACY_STATUTORY_RATES: StatutoryRates = {
  esiEmployer: 0.0325,
  esiEmployee: 0.0075,
  pfEmployer: 0.13,
  pfEmployee: 0.12,
  edli: 0.005,
  admin: 0.005,
  gratuity: 0.0481,
  ptAnnualAverage: 2500,
};

/** Params accepted by the calculation, mirroring the legacy signature. */
export interface CalcParams {
  rates?: Partial<StatutoryRates>;
  /** When omitted, calculated from the rows (legacy `null`). */
  ratesOnly?: boolean;
}

/* ------------------------------------------------------------------ *
 * OPTION NORMALISATION — legacy `salaryBreakupOpts561_`
 * ------------------------------------------------------------------ */

const BOOL_KEYS = [
  'applyNfh', 'applyLwfKa', 'ptAverage', 'applyCodeWage', 'esiOnGross',
  'pfNoCap', 'extra4Ot', 'applyReliever', 'pfSplit', 'bonusYearly',
  'roundRupee', 'showDayRate',
] as const;

function num(v: unknown, d: number, lo: number, hi: number): number {
  if (v === '' || v === null || v === undefined) return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Normalise raw breakup JSON into typed options.
 * Defaults match the legacy engine exactly: booleans off, the two uniform
 * switches ON, nfhDays 10, lwf ₹100/₹50, bonus 8.33%, relieverDiv 6.
 */
export function normaliseOptions(raw: Partial<BreakupOptions> | null | undefined): BreakupOptions {
  const s = raw || {};
  const o: any = {};
  for (const k of BOOL_KEYS) o[k] = (s as any)[k] === true;
  o.nfhDays = num((s as any).nfhDays, 10, 1, 31);
  o.lwfEr = num((s as any).lwfEr, 100, 0, 10000);
  o.lwfEe = num((s as any).lwfEe, 50, 0, 10000);
  o.bonusRate = num((s as any).bonusRate, 8.33, 8.33, 20);
  o.relieverDiv = num((s as any).relieverDiv, 6, 2, 30);

  const seen: Record<string, boolean> = {};
  const ca = Array.isArray((s as any).customAllow) ? (s as any).customAllow : [];
  o.customAllow = ca
    .filter((x: any) => {
      if (!x || ['xa1', 'xa2', 'xa3'].indexOf(x.id) < 0 || seen[x.id]) return false;
      seen[x.id] = true;
      return true;
    })
    .slice(0, 3)
    .map((x: any) => ({
      id: x.id,
      name: String(x.name || '').trim().slice(0, 40) || 'Allowance',
      pf: x.pf === true,
      esi: x.esi === true,
    }));
  return o as BreakupOptions;
}

/** Legacy `salaryBreakupXa561_`: sum of the enabled custom allowances. */
export function customAllowanceTotals(o: BreakupOptions, c: WageColumnInput) {
  let sum = 0, pf = 0, esi = 0;
  for (const x of o.customAllow) {
    const v = Number((c as any)[x.id] ?? 0) || 0;
    sum += v;
    if (x.pf) pf += v;
    if (x.esi) esi += v;
  }
  return { sum, pf, esi };
}

/** Legacy `salaryBreakupUp561_`: round UP to the whole rupee. */
export function roundUpRupee(v: number): number {
  return v > 0 ? Math.ceil(v - 1e-9) : 0;
}

/** Legacy `Math.round(x * 100) / 100` used for every quotation money field. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * PER-COLUMN CALCULATION
 * ------------------------------------------------------------------ */

export interface WageColumnResult extends WageColumnInput {
  st1: number;
  st2: number;
  bonus: number;
  leaveWages: number;
  gross: number;
  esiSkipped: boolean;
  esiEmployer: number;
  esiEmployee: number;
  pfEmployer: number;
  pfEmployee: number;
  pf12: number;
  edli: number;
  admin: number;
  gratuity: number;
  st3: number;
  lwfMonth: number;
  ctc: number;
  mgmtFee: number;
  totalCtc: number;
  totalBilling: number;
  mgmtFeeTotal: number;
  otRate: number;
  lwfDedMonth: number;
  takeHomeBeforePt: number;
  ptDed: number;
  totalDed: number;
  takeHome: number;
  nfh: number;
  grossPay: number;
  bonusYear: number;
  reliever: number;
  dayRate: number;
  hourRate: number;
  codeHit: boolean;
  codeBase: number | null;
  lwfYearEff: number;
  lwfDedYearEff: number;
  uniformCo: number;
  uniformDed: number;
  xaSum: number;
}

function calcColumn(
  c: WageColumnInput,
  b: BreakupSettings,
  O: BreakupOptions,
  R: StatutoryRates,
): WageColumnResult {
  const n = (v: unknown) => Number(v ?? 0) || 0;

  const st1 = n(c.basic) + n(c.vda) + n(c.extra4);
  const xa = customAllowanceTotals(O, c);
  const st2 = st1 + n(c.hra) + n(c.special) + n(c.washing) + n(c.conveyance) + n(c.other) + xa.sum;

  // Wage base for PF / Bonus / Leave Wages / NFH (legacy v5.6.61 semantics).
  const ad = n(c.basic) + n(c.vda);
  const half = st2 / 2;
  const wb0 = O.extra4Ot ? ad : st1;
  const codeHit = O.applyCodeWage && half > ad;
  const wb = O.applyCodeWage ? Math.max(wb0, half) : wb0;
  const gb = O.applyCodeWage ? Math.max(ad, half) : ad;

  // Legacy epsilon comparison: 8.33 -> 0.0833 exactly.
  const bf = Math.abs(O.bonusRate - 8.33) < 1e-9 ? 0.0833 : O.bonusRate / 100;

  const bonus = b.applyBonus === false ? 0 : wb * bf;
  const leaveWages = b.applyLeaveWages === false ? 0 : (wb / 26) * 1.5;
  const nfh = O.applyNfh ? (wb / 26) * O.nfhDays / 12 : 0;

  const esiWages =
    (O.esiOnGross ? st2 : st1 + xa.esi) + (O.bonusYearly ? 0 : bonus) + leaveWages + nfh;

  const uniformCo = b.applyUniformCompany === false ? 0 : n(c.uniform);
  const uniformEmp = b.applyUniformEmployee === false ? 0 : n(c.uniformEmployee);

  const gross = st2 + bonus + leaveWages + nfh + uniformCo;

  // ESI / Group Insurance decision table (mirrored from the legacy front-end).
  const useGi = b.applyEsi === false
    ? b.applyInsurance === true
    : (b.applyInsurance === true && esiWages > b.esiCap);
  const noEsi = useGi || b.applyEsi === false;

  let esiEmployer = noEsi ? 0 : esiWages * R.esiEmployer;
  let esiEmployee = noEsi ? 0 : esiWages * R.esiEmployee;
  if (O.roundRupee) {
    esiEmployer = roundUpRupee(esiEmployer);
    esiEmployee = roundUpRupee(esiEmployee);
  }

  const pfOn = b.applyPf !== false;
  const pfWage = O.pfNoCap ? wb + xa.pf : Math.min(wb + xa.pf, b.pfCap);
  let pf12 = pfOn ? pfWage * R.pfEmployee : 0;
  let edli = pfOn ? pfWage * R.edli : 0;
  let admin = edli;
  let pfEmployer = pfOn ? pfWage * R.pfEmployer : 0;
  let pfEmployee = pfOn ? pfWage * R.pfEmployee : 0;
  if (O.roundRupee && pfOn) {
    pf12 = Math.round(pf12);
    edli = Math.round(edli);
    admin = edli;
    pfEmployer = pf12 + edli + admin;
    pfEmployee = Math.round(pfEmployee);
  }

  const groupInsurance = useGi ? n(c.groupInsurance) : 0;
  const gratuity = b.applyGratuity === true ? gb * R.gratuity : 0;

  const st3 = gross + esiEmployer + pfEmployer + groupInsurance + gratuity;

  const lwfYearEff = O.applyLwfKa ? O.lwfEr : n(c.lwfYear);
  const lwfMonth = lwfYearEff / 12;
  const base561 = st3 + n(c.compliance) + lwfMonth;
  const reliever = O.applyReliever ? base561 / O.relieverDiv : 0;

  let ctc = base561 + reliever;
  if (O.roundRupee) ctc = Math.round(ctc);

  const headcount = Math.max(1, Math.floor(Number(c.headcount) || 1));
  const totalBilling = ctc * headcount;
  const otRate = (wb * 2) / 26 / 8;

  const lwfDedYearEff = O.applyLwfKa ? O.lwfEe : n(c.lwfDedYear);
  const lwfDedMonth = lwfDedYearEff / 12;

  const grossPay = O.bonusYearly ? gross - bonus : gross;
  const takeHomeBeforePt = grossPay - esiEmployee - pfEmployee - lwfDedMonth;

  const ptAmt = O.ptAverage ? R.ptAnnualAverage / 12 : b.ptAmount;
  const ptDed = !b.applyPt
    ? 0
    : b.ptOnGross === true
      ? (grossPay >= b.ptThreshold ? ptAmt : 0)
      : (takeHomeBeforePt > b.ptThreshold ? ptAmt : 0);

  const totalDed = esiEmployee + pfEmployee + lwfDedMonth + ptDed + uniformEmp;

  let takeHome = grossPay - totalDed;
  if (O.roundRupee) takeHome = Math.round(takeHome);

  return {
    ...c,
    st1, st2, bonus, leaveWages, gross,
    esiSkipped: useGi,
    esiEmployer, esiEmployee,
    pfEmployer, pfEmployee, pf12, edli, admin,
    gratuity, st3, lwfMonth, ctc,
    mgmtFee: 0, totalCtc: ctc, totalBilling, mgmtFeeTotal: 0,
    otRate, lwfDedMonth, takeHomeBeforePt, ptDed, totalDed, takeHome,
    nfh, grossPay, bonusYear: bonus * 12, reliever,
    dayRate: ctc / 26, hourRate: ctc / 26 / 8,
    codeHit, codeBase: codeHit ? half : null,
    lwfYearEff, lwfDedYearEff, uniformCo, uniformDed: uniformEmp, xaSum: xa.sum,
  };
}

/* ------------------------------------------------------------------ *
 * MANAGEMENT FEE PER HEAD — legacy `breakupFeePerHead559_`
 * ------------------------------------------------------------------ */

export type FeeMode = 'NONE' | 'PERCENTAGE' | 'LUMPSUM' | 'BASIC_VDA_PCT' | 'ST2_PCT' | 'CTC_PCT';

export interface FeeSpec {
  state: 'OK' | 'NONE';
  mode: FeeMode;
  value: number;
  amount: number;
  label?: string;
  headsByName?: Record<string, number>;
}

/**
 * Distribute a quotation's management fee across wage rows.
 * Returns null when there is no fee — matching the legacy contract so that
 * `mgmtFee` stays 0 and `totalCtc === ctc`.
 */
export function feePerHead(
  fee: FeeSpec | null,
  rows: Array<{ name?: string; headcount?: number; ctc: number; basic: number; vda: number; st2: number }>,
): number[] | null {
  if (!fee || fee.state !== 'OK' || !rows || !rows.length) return null;
  const v = Number(fee.value) || 0;
  const a = Number(fee.amount) || 0;
  const hm = fee.headsByName || {};

  const h = rows.map((r) => {
    const n = Number(hm[String(r.name || '')]) || 0;
    return n > 0 ? n : Math.max(1, Math.floor(Number(r.headcount) || 1));
  });

  if (fee.mode === 'CTC_PCT') return rows.map((r) => (Number(r.ctc) || 0) * v / 100);
  if (fee.mode === 'BASIC_VDA_PCT') return rows.map((r) => ((Number(r.basic) || 0) + (Number(r.vda) || 0)) * v / 100);
  if (fee.mode === 'ST2_PCT') return rows.map((r) => (Number(r.st2) || 0) * v / 100);
  if (fee.mode === 'PERCENTAGE') {
    const base = rows.reduce((s, r, i) => s + (Number(r.ctc) || 0) * h[i], 0);
    return rows.map((r) => (base > 0 ? (a * (Number(r.ctc) || 0)) / base : 0));
  }
  if (fee.mode === 'LUMPSUM') {
    const total = h.reduce((s, x) => s + x, 0);
    return rows.map(() => (total > 0 ? a / total : 0));
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * BREAKUP CALCULATION — legacy `salaryBreakupCalc_`
 * ------------------------------------------------------------------ */

export interface BreakupResult {
  options: BreakupOptions;
  cols: WageColumnResult[];
  totals: { billing: number; takeHome: number; headcount: number };
  mgmtFeeTotal: number;
}

export function calculateBreakup(
  input: {
    cols: WageColumnInput[];
    settings: BreakupSettings;
    options?: Partial<BreakupOptions>;
    fee?: FeeSpec | null;
  },
  rates?: Partial<StatutoryRates>,
): BreakupResult {
  const O = normaliseOptions(input.options);
  const b = input.settings;
  const R: StatutoryRates = { ...LEGACY_STATUTORY_RATES, ...(rates || {}) };

  const cols = input.cols.map((c) => calcColumn(c, b, O, R));

  const heads = feePerHead(input.fee ?? null, cols);
  let mgmtFeeTotal = 0;
  if (heads) {
    cols.forEach((c, i) => {
      c.mgmtFee = heads[i];
      c.totalCtc = c.ctc + heads[i];
      mgmtFeeTotal += heads[i] * Math.max(1, Math.floor(Number(c.headcount) || 1));
    });
  }
  cols.forEach((c) => { c.mgmtFeeTotal = mgmtFeeTotal; });

  return {
    options: O,
    cols,
    totals: {
      billing: cols.reduce((s, c) => s + c.totalBilling, 0),
      takeHome: cols.reduce((s, c) => s + c.takeHome * Math.max(1, Math.floor(Number(c.headcount) || 1)), 0),
      headcount: cols.reduce((s, c) => s + Math.max(1, Math.floor(Number(c.headcount) || 1)), 0),
    },
    mgmtFeeTotal,
  };
}

/* ------------------------------------------------------------------ *
 * QUOTATION TOTALS — legacy quotation save path (Quotations.gs:1211-1225)
 * ------------------------------------------------------------------ */

export interface QuotationTotalsInput {
  lineItemAmounts: number[];
  feeMode: FeeMode;
  feeValue: number;
  taxPercent: number;
  /** Bases required by the non-subtotal fee modes. */
  breakupBasis?: { basicVda: number; st2: number; ctc: number };
}

export interface QuotationTotals {
  subtotal: number;
  managementFee: number;
  amountBeforeTax: number;
  taxAmount: number;
  grandTotal: number;
}

/**
 * Reproduce the legacy quotation arithmetic exactly:
 *   fee    = mode-dependent base x value / 100   (or the lump sum)
 *   fee    = round2(fee)
 *   before = round2(subtotal + fee)
 *   tax    = round2(before * taxPercent / 100)
 *   grand  = round2(before + tax)
 */
export function computeQuotationTotals(input: QuotationTotalsInput): QuotationTotals {
  const subtotal = round2(input.lineItemAmounts.reduce((s, v) => s + (Number(v) || 0), 0));

  const mode = (input.feeMode || 'NONE').toUpperCase() as FeeMode;
  const value = Number(input.feeValue) || 0;
  const basis = input.breakupBasis;

  let fee = 0;
  switch (mode) {
    case 'PERCENTAGE':
      fee = (subtotal * value) / 100;
      break;
    case 'LUMPSUM':
      fee = value;
      break;
    case 'BASIC_VDA_PCT':
      fee = ((basis?.basicVda ?? 0) * value) / 100;
      break;
    case 'ST2_PCT':
      fee = ((basis?.st2 ?? 0) * value) / 100;
      break;
    case 'CTC_PCT':
      fee = ((basis?.ctc ?? 0) * value) / 100;
      break;
    default:
      fee = 0;
  }
  fee = round2(fee);

  const amountBeforeTax = round2(subtotal + fee);
  const taxAmount = round2((amountBeforeTax * (Number(input.taxPercent) || 0)) / 100);
  const grandTotal = round2(amountBeforeTax + taxAmount);

  return { subtotal, managementFee: fee, amountBeforeTax, taxAmount, grandTotal };
}
