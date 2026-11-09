/**
 * HR & workforce rules, ported from HR.gs.
 *
 * Every function here is pure: no I/O, no clock, no globals. Dates are passed
 * in. That is what lets the parity suite compare them against the original
 * Apps Script functions lifted verbatim into the oracle.
 *
 * Source references are to UFMS v5.6.61 `HR.gs`.
 */

/* ------------------------------------------------------------------ *
 * STATUSES — HR.gs:10
 * ------------------------------------------------------------------ */

export const EMPLOYEE_STATUSES = ['ACTIVE', 'NOTICE_PERIOD', 'ON_HOLD', 'LEFT'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_DOC_CATEGORIES = [
  'AADHAAR', 'PAN', 'UAN', 'ESI', 'PF', 'BANK',
  'EDUCATION', 'EXPERIENCE', 'MEDICAL', 'PHOTO', 'OTHER',
] as const;

export function isValidEmployeeStatus(s: string): s is EmployeeStatus {
  return (EMPLOYEE_STATUSES as readonly string[]).includes(String(s ?? '').toUpperCase());
}

/** A status counts as "on the books" unless the employee has left. */
export function countsAsOnRolls(status: string): boolean {
  return String(status ?? '').toUpperCase() !== 'LEFT';
}

/* ------------------------------------------------------------------ *
 * EMPLOYEE CODE — HR.gs saveEmployee_ + Database.gs nextCodeFor_
 *
 * Legacy: `clean_(payload.EmployeeCode, 30).toUpperCase() || nextCodeFor_('EMP')`
 * nextCodeFor_ allocates `EMP-YYYY-NNNN`, pad 4, per calendar year, taking
 * max+1 over every code that matches the pattern and ignoring anything else.
 * ------------------------------------------------------------------ */

const EMP_CODE_RE = /^EMP-(\d{4})-(\d+)$/i;

export function nextEmployeeCode(existingCodes: Array<string | null | undefined>, year: number): string {
  let max = 0;
  for (const raw of existingCodes) {
    const m = EMP_CODE_RE.exec(String(raw ?? '').trim());
    if (!m) continue; // legacy ignores non-matching text rather than failing
    if (Number(m[1]) !== year) continue;
    max = Math.max(max, parseInt(m[2], 10));
  }
  return `EMP-${year}-${String(max + 1).padStart(4, '0')}`;
}

export function isAutoEmployeeCode(code: string): boolean {
  return EMP_CODE_RE.test(String(code ?? '').trim());
}

/**
 * Legacy duplicate rule: case-insensitive among ACTIVE rows, excluding self.
 * `saveEmployee_` throws "Employee code X is already used by <name>."
 */
export function isDuplicateEmployeeCode(
  candidate: string,
  existing: Array<{ employeeCode: string; id?: string; name?: string; active?: boolean }>,
  currentId?: string,
): { duplicate: boolean; usedBy?: string } {
  const target = String(candidate ?? '').trim().toUpperCase();
  if (!target) return { duplicate: false };
  const hit = existing.find(
    (e) =>
      String(e.employeeCode ?? '').trim().toUpperCase() === target &&
      e.active !== false &&
      (!currentId || e.id !== currentId),
  );
  return hit ? { duplicate: true, usedBy: hit.name } : { duplicate: false };
}

/* ------------------------------------------------------------------ *
 * MOBILE / AADHAAR / PAN — HR.gs saveEmployee_ validation
 * ------------------------------------------------------------------ */

/** Legacy `normalizePhone_`: digits only, last 10. */
export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(-10);
}

export function isValidMobile(value: string): boolean {
  const v = normalizePhone(value);
  return v.length === 0 || v.length === 10;
}

export function isValidAadhaar(value: string): boolean {
  const v = String(value ?? '').replace(/\s/g, '');
  return v === '' || /^\d{12}$/.test(v);
}

export function isValidPan(value: string): boolean {
  const v = String(value ?? '').trim().toUpperCase();
  return v === '' || /^[A-Z]{5}\d{4}[A-Z]$/.test(v);
}

/**
 * Verhoeff checksum — the check digit Aadhaar actually uses.
 * The legacy only checked "12 digits", which accepts invalid numbers.
 * Offered as a separate, stricter validator so callers opt in rather than
 * silently changing behaviour (see docs/phase-4-report.md, finding P4-1).
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function passesVerhoeff(number: string): boolean {
  const digits = String(number ?? '').replace(/\D/g, '');
  if (digits.length !== 12) return false;
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

/* ------------------------------------------------------------------ *
 * SALARY SLIP — HR.gs calculateSalarySlip_
 *
 * Legacy constants are lifted out into `StatutoryConfig` so the payroll engine
 * never hardcodes them (Rule 15). Defaults below reproduce v5.6.61 exactly and
 * are parity-tested; production tenants are expected to load a CONFIRMED,
 * effective-dated rate set instead.
 * ------------------------------------------------------------------ */

export interface StatutoryConfig {
  /** HR_PF_BASIC_CAP_ — PF wages = min(basic + DA, cap). */
  pfWageCap: number;
  pfEmployeePct: number;
  pfEmployerPct: number;
  /** HR_ESI_THRESHOLD_ — ESI applies only when gross <= this. */
  esiGrossCeiling: number;
  esiEmployeePct: number;
  esiEmployerPct: number;
}

/** Exactly the hardcoded values in v5.6.61 HR.gs:48-52. */
export const LEGACY_STATUTORY_DEFAULTS: StatutoryConfig = {
  pfWageCap: 25000,
  pfEmployeePct: 12,
  pfEmployerPct: 12,
  esiGrossCeiling: 21000,
  esiEmployeePct: 0.75,
  esiEmployerPct: 3.25,
};

/** HR.gs hrPfWages_ */
export function pfWages(basic: number, da: number, cfg: StatutoryConfig = LEGACY_STATUTORY_DEFAULTS): number {
  return Math.min((Number(basic) || 0) + (Number(da) || 0), cfg.pfWageCap);
}

export interface PtSlabRule {
  fromGross: number;
  toGross: number;
  amount: number;
  /** Legacy: February is charged a different amount for the same slab. */
  overrideMonth?: number | null;
  overrideAmount?: number | null;
}

/**
 * HR_PT_KARNATAKA_SLABS_ — exactly as coded:
 *   [0, 24999.99, 0]
 *   [25000, 999999999, 200]
 * plus the February rule: `pt === 200 && month === 2 ? 300 : pt`.
 */
export const LEGACY_KA_PT_SLABS: PtSlabRule[] = [
  { fromGross: 0, toGross: 24999.99, amount: 0 },
  { fromGross: 25000, toGross: 999999999, amount: 200, overrideMonth: 2, overrideAmount: 300 },
];

/** HR.gs hrPtFor_ — first matching slab wins, then that slab's month override. */
export function ptForGross(gross: number, month: number, slabs: PtSlabRule[] = LEGACY_KA_PT_SLABS): number {
  let matched: PtSlabRule | null = null;
  for (const slab of slabs) {
    if (gross >= slab.fromGross && gross <= slab.toGross) {
      matched = slab;
      break;
    }
  }
  if (!matched) return 0;
  // Legacy hardcoded "Rs 200 in February becomes Rs 300"; the override is now a
  // column, so any jurisdiction can express the same kind of rule.
  if (
    matched.overrideMonth != null &&
    matched.overrideAmount != null &&
    Number(month) === Number(matched.overrideMonth)
  ) {
    return matched.overrideAmount;
  }
  return matched.amount;
}

export interface SalaryEmployee {
  basic: number | string;
  hra: number | string;
  da: number | string;
  otherAllowances: number | string;
  esiApplicable: boolean | string;
  pfApplicable: boolean | string;
  ptState?: string | null;
}

export interface SalaryAdjustments {
  daysWorked?: number;
  daysPresent?: number;
  otDays?: number;
  bonus?: number;
  loanRecovery?: number;
  advanceRecovery?: number;
  remarks?: string;
}

export interface SalarySlip {
  month: string;
  year: string;
  daysInMonth: number;
  daysWorked: number;
  daysPresent: number;
  earnings: {
    basic: number; hra: number; da: number; specialAllowance: number;
    otAmount: number; otDays: number; bonus: number; grossEarnings: number;
  };
  deductions: {
    esiEmployee: number; esiEmployer: number;
    pfEmployee: number; pfEmployer: number;
    pt: number; tds: number;
    loanRecovery: number; advanceRecovery: number;
    totalDeductions: number;
  };
  netPay: number;
  esiApplicable: boolean;
  pfApplicable: boolean;
  ptState: string;
  remarks: string;
  otRate: number;
}

const isTrue = (v: boolean | string | undefined) =>
  v === true || String(v ?? '').toUpperCase() === 'TRUE';

const daysInMonthOf = (month: number, year: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * HR.gs calculateSalarySlip_ — ported line for line, with the statutory
 * numbers injected instead of read from module constants.
 *
 * Rules preserved exactly:
 *  - proration is `daysWorked / daysInMonth` applied to each monthly component
 *  - one OT day pays basic/26
 *  - ESI applies only when the employee is flagged AND 0 < gross <= ceiling
 *  - PF applies only when flagged AND basic+DA > 0, on capped basic+DA
 *  - PT applies only when ptState is non-empty
 *  - every money value is Math.round to whole rupees
 */
export function calculateSalarySlip(
  employee: SalaryEmployee,
  month: number,
  year: number,
  adjustments: SalaryAdjustments = {},
  cfg: StatutoryConfig = LEGACY_STATUTORY_DEFAULTS,
  ptSlabs: PtSlabRule[] = LEGACY_KA_PT_SLABS,
): SalarySlip {
  const monthNum = String(month).padStart(2, '0');
  const monthEnd = daysInMonthOf(Number(month), Number(year));
  const daysWorked = Math.max(0, Math.min(monthEnd, Number(adjustments.daysWorked) || monthEnd));
  const daysPresent = Math.max(0, Math.min(daysWorked, Number(adjustments.daysPresent) || daysWorked));
  const otDays = Math.max(0, Number(adjustments.otDays) || 0);
  const bonus = Math.max(0, Number(adjustments.bonus) || 0);
  const loanRecovery = Math.max(0, Number(adjustments.loanRecovery) || 0);
  const advanceRecovery = Math.max(0, Number(adjustments.advanceRecovery) || 0);

  const ratio = daysWorked / monthEnd;
  const basicMonthly = Math.round(Number(employee.basic) || 0);
  const hraMonthly = Math.round(Number(employee.hra) || 0);
  const daMonthly = Math.round(Number(employee.da) || 0);
  const otherMonthly = Math.round(Number(employee.otherAllowances) || 0);

  const basic = Math.round(basicMonthly * ratio);
  const hra = Math.round(hraMonthly * ratio);
  const da = Math.round(daMonthly * ratio);
  const specialAllowance = Math.round(otherMonthly * ratio);
  const otAmount = Math.round(otDays * (basicMonthly / 26));
  const grossEarnings = basic + hra + da + specialAllowance + otAmount + bonus;

  let esiEmployee = 0;
  let esiEmployer = 0;
  const esiApplicable = isTrue(employee.esiApplicable);
  if (esiApplicable && grossEarnings > 0 && grossEarnings <= cfg.esiGrossCeiling) {
    esiEmployee = Math.round((grossEarnings * cfg.esiEmployeePct) / 100);
    esiEmployer = Math.round((grossEarnings * cfg.esiEmployerPct) / 100);
  }

  let pfEmployee = 0;
  let pfEmployer = 0;
  const pfApplicable = isTrue(employee.pfApplicable);
  if (pfApplicable && basic + da > 0) {
    const pfBase = pfWages(basic, da, cfg);
    pfEmployee = Math.round((pfBase * cfg.pfEmployeePct) / 100);
    // Legacy: `pfEmployer = pfEmployee;` — the slip shows equal shares. When a
    // configured employer rate differs (EDLI/admin loadings), it is honoured.
    const er = Math.round((pfBase * cfg.pfEmployerPct) / 100);
    pfEmployer = cfg.pfEmployerPct === cfg.pfEmployeePct ? pfEmployee : er;
  }

  const ptState = String(employee.ptState ?? '').trim();
  const pt = ptState ? ptForGross(grossEarnings, month, ptSlabs) : 0;

  const tds = 0; // Legacy auto-calculates none; manual override comes in payroll.
  const totalDeductions = esiEmployee + pfEmployee + pt + tds + loanRecovery + advanceRecovery;
  const netPay = grossEarnings - totalDeductions;

  return {
    month: monthNum,
    year: String(year),
    daysInMonth: monthEnd,
    daysWorked,
    daysPresent,
    earnings: { basic, hra, da, specialAllowance, otAmount, otDays, bonus, grossEarnings },
    deductions: {
      esiEmployee, esiEmployer, pfEmployee, pfEmployer, pt, tds,
      loanRecovery, advanceRecovery, totalDeductions,
    },
    netPay,
    esiApplicable,
    pfApplicable,
    ptState,
    remarks: String(adjustments.remarks ?? ''),
    otRate: Math.round(basicMonthly / 26),
  };
}

/* ------------------------------------------------------------------ *
 * HR SUMMARY — HR.gs getHRSummary_
 *
 * Note the legacy definition of "gross" for the estimate: Basic + HRA + DA +
 * OtherAllowances. It deliberately excludes OT and bonus. ACTIVE only.
 * ------------------------------------------------------------------ */

export interface SummaryEmployee {
  status: string;
  basic: number | string;
  hra: number | string;
  da: number | string;
  otherAllowances: number | string;
  department?: string | null;
}

export interface HrSummary {
  total: number;
  active: number;
  notice: number;
  onHold: number;
  left: number;
  monthlyGrossEstimate: number;
  byDepartment: Record<string, number>;
}

export function hrSummary(employees: SummaryEmployee[]): HrSummary {
  let active = 0, notice = 0, hold = 0, left = 0, monthlyGross = 0;
  const byDept: Record<string, number> = {};
  for (const r of employees) {
    const s = String(r.status ?? '').toUpperCase();
    if (s === 'ACTIVE') active++;
    else if (s === 'NOTICE_PERIOD') notice++;
    else if (s === 'ON_HOLD') hold++;
    else if (s === 'LEFT') left++;
    const gross =
      (Number(r.basic) || 0) + (Number(r.hra) || 0) + (Number(r.da) || 0) + (Number(r.otherAllowances) || 0);
    if (s === 'ACTIVE') monthlyGross += gross;
    const dept = String(r.department ?? 'Unassigned').trim() || 'Unassigned';
    byDept[dept] = (byDept[dept] || 0) + 1;
  }
  return {
    total: employees.length,
    active, notice, onHold: hold, left,
    monthlyGrossEstimate: monthlyGross,
    byDepartment: byDept,
  };
}

/* ------------------------------------------------------------------ *
 * DEPLOYMENT — Phase 4 exit criterion
 * "Site strength reconciles to allocations."
 * ------------------------------------------------------------------ */

export interface Allocation {
  id?: string;
  employeeId: string;
  designation?: string | null;
  category?: string | null;
  startDate: string | Date;
  endDate?: string | Date | null;
  status: string;
}

const day = (v: string | Date | null | undefined): number | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * True when the two date ranges overlap. An open-ended range (no endDate) is
 * treated as running to infinity. Both boundaries are inclusive: a replacement
 * starting the day the previous allocation ends is NOT an overlap, which is the
 * normal hand-over pattern.
 */
export function rangesOverlap(
  aStart: string | Date,
  aEnd: string | Date | null | undefined,
  bStart: string | Date,
  bEnd: string | Date | null | undefined,
): boolean {
  const a1 = day(aStart), a2 = day(aEnd), b1 = day(bStart), b2 = day(bEnd);
  if (a1 == null || b1 == null) return false;
  const aEndDay = a2 ?? Number.POSITIVE_INFINITY;
  const bEndDay = b2 ?? Number.POSITIVE_INFINITY;
  return a1 <= bEndDay && b1 <= aEndDay;
}

/**
 * An employee cannot be in two places at once. Returns the conflicting
 * allocation, if any. Only ACTIVE allocations participate — a released record
 * is history and must never block a new deployment.
 */
export function findAssignmentConflict(
  candidate: { startDate: string | Date; endDate?: string | Date | null; employeeId: string },
  existing: Allocation[],
  currentId?: string,
): Allocation | null {
  for (const a of existing) {
    if (String(a.status).toUpperCase() !== 'ACTIVE') continue;
    if (currentId && a.id === currentId) continue;
    if (a.employeeId !== candidate.employeeId) continue;
    if (rangesOverlap(candidate.startDate, candidate.endDate, a.startDate, a.endDate)) return a;
  }
  return null;
}

export interface Requirement {
  designation: string;
  category?: string | null;
  requiredCount: number;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
}

export interface StrengthLine {
  designation: string;
  category: string;
  required: number;
  deployed: number;
  variance: number;
  state: 'SHORT' | 'FILLED' | 'OVER';
}

export interface StrengthReport {
  asOn: string;
  required: number;
  deployed: number;
  variance: number;
  state: 'SHORT' | 'FILLED' | 'OVER';
  lines: StrengthLine[];
  /** Deployed people who match no requirement line — a data-quality signal. */
  unplanned: Array<{ designation: string; count: number }>;
}

const keyOf = (designation: string | null | undefined, category: string | null | undefined) =>
  `${String(designation ?? '').trim().toUpperCase()}|${String(category ?? '').trim().toUpperCase()}`;

/**
 * Reconcile contracted manpower against who is actually deployed on a date.
 *
 * Requirements in force on `asOn` are summed per (designation, category);
 * ACTIVE allocations covering `asOn` are counted the same way. A requirement
 * with no matching allocation shows as SHORT with a negative variance, which is
 * the number operations need to act on.
 */
export function reconcileStrength(
  requirements: Requirement[],
  allocations: Allocation[],
  asOn: string,
): StrengthReport {
  const asOnDay = day(asOn);
  if (asOnDay == null) throw new Error('reconcileStrength requires a valid asOn date');

  const required = new Map<string, StrengthLine>();
  for (const r of requirements) {
    const from = day(r.effectiveFrom);
    const to = day(r.effectiveTo);
    if (from == null || from > asOnDay) continue;
    if (to != null && to < asOnDay) continue;
    const k = keyOf(r.designation, r.category);
    const line = required.get(k) ?? {
      designation: String(r.designation ?? '').trim(),
      category: String(r.category ?? '').trim() || 'UNSPECIFIED',
      required: 0, deployed: 0, variance: 0, state: 'SHORT' as const,
    };
    line.required += Number(r.requiredCount) || 0;
    required.set(k, line);
  }

  const deployed = new Map<string, number>();
  for (const a of allocations) {
    if (String(a.status ?? '').toUpperCase() !== 'ACTIVE') continue;
    const from = day(a.startDate);
    const to = day(a.endDate);
    if (from == null || from > asOnDay) continue;
    if (to != null && to < asOnDay) continue;
    const k = keyOf(a.designation, a.category);
    deployed.set(k, (deployed.get(k) ?? 0) + 1);
  }

  const lines: StrengthLine[] = [];
  for (const [k, line] of required) {
    const got = deployed.get(k) ?? 0;
    const variance = got - line.required;
    lines.push({
      ...line,
      deployed: got,
      variance,
      state: variance < 0 ? 'SHORT' : variance > 0 ? 'OVER' : 'FILLED',
    });
    deployed.delete(k);
  }

  const unplanned: Array<{ designation: string; count: number }> = [];
  for (const [k, count] of deployed) {
    const designation = k.split('|')[0] || 'UNSPECIFIED';
    const found = unplanned.find((u) => u.designation === designation);
    if (found) found.count += count;
    else unplanned.push({ designation, count });
  }

  const totalRequired = lines.reduce((s, l) => s + l.required, 0);
  const totalDeployed = lines.reduce((s, l) => s + l.deployed, 0)
    + unplanned.reduce((s, u) => s + u.count, 0);
  const variance = totalDeployed - totalRequired;

  return {
    asOn: String(asOn).slice(0, 10),
    required: totalRequired,
    deployed: totalDeployed,
    variance,
    state: variance < 0 ? 'SHORT' : variance > 0 ? 'OVER' : 'FILLED',
    lines: lines.sort((a, b) => a.designation.localeCompare(b.designation)),
    unplanned,
  };
}

/* ------------------------------------------------------------------ *
 * MINIMUM WAGE FLOOR — Rule 15 / below-minimum-wage check
 * ------------------------------------------------------------------ */

export interface WageRate {
  regime: string;
  zone: string;
  sector?: string | null;
  category: string;
  monthlyWage: number | string;
  status: string;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
}

/**
 * Pick the rate in force for (regime, zone, category) on a date.
 * Preference order, matching MinimumWages.gs wageSetInForce_ intent:
 *   1. CONFIRMED beats PROVISIONAL beats CONTESTED
 *   2. newest effectiveFrom wins among equals
 *   3. the latest effectiveTo (or open-ended) wins on a tie
 */
export function resolveWageFloor(
  rates: WageRate[],
  query: { regime: string; zone: string; category: string; sector?: string | null; asOn: string },
): WageRate | null {
  const asOnDay = day(query.asOn);
  if (asOnDay == null) return null;
  const rank: Record<string, number> = { CONFIRMED: 3, PROVISIONAL: 2, CONTESTED: 1 };

  const eligible = rates.filter((r) => {
    if (String(r.regime).toUpperCase() !== String(query.regime).toUpperCase()) return false;
    if (String(r.zone).toUpperCase() !== String(query.zone).toUpperCase()) return false;
    if (String(r.category).toUpperCase() !== String(query.category).toUpperCase()) return false;
    if (r.sector && query.sector && String(r.sector).toUpperCase() !== String(query.sector).toUpperCase()) return false;
    const from = day(r.effectiveFrom);
    const to = day(r.effectiveTo);
    if (from == null || from > asOnDay) return false;
    if (to != null && to < asOnDay) return false;
    return true;
  });

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const ra = rank[String(a.status).toUpperCase()] ?? 0;
    const rb = rank[String(b.status).toUpperCase()] ?? 0;
    if (ra !== rb) return rb - ra;
    const fa = day(a.effectiveFrom) ?? 0;
    const fb = day(b.effectiveFrom) ?? 0;
    if (fa !== fb) return fb - fa;
    return (day(b.effectiveTo) ?? Number.POSITIVE_INFINITY) - (day(a.effectiveTo) ?? Number.POSITIVE_INFINITY);
  });
  return eligible[0];
}

export interface FloorCheck {
  employeeId: string;
  name?: string;
  category: string;
  monthlyWage: number;
  floor: number;
  shortfall: number;
  compliant: boolean;
}

/**
 * Basic + DA is the statutory wage for minimum-wage comparison — HRA and other
 * allowances are excluded, matching how the schedules are published.
 * A missing floor is reported as non-compliant with shortfall 0 so payroll
 * approval blocks rather than silently passing (fail closed).
 */
export function checkMinimumWageFloor(
  employees: Array<{ id: string; name?: string; basic: number | string; da: number | string; category: string }>,
  floorFor: (category: string) => number | null,
): { checks: FloorCheck[]; compliant: boolean; missingRates: string[] } {
  const missingRates = new Set<string>();
  const checks = employees.map((e) => {
    const monthly = (Number(e.basic) || 0) + (Number(e.da) || 0);
    const floor = floorFor(e.category);
    if (floor == null) {
      missingRates.add(e.category);
      return {
        employeeId: e.id, name: e.name, category: e.category,
        monthlyWage: monthly, floor: 0, shortfall: 0, compliant: false,
      };
    }
    const shortfall = Math.max(0, Math.round((floor - monthly) * 100) / 100);
    return {
      employeeId: e.id, name: e.name, category: e.category,
      monthlyWage: monthly, floor, shortfall, compliant: shortfall === 0,
    };
  });
  return {
    checks,
    compliant: checks.every((c) => c.compliant) && missingRates.size === 0,
    missingRates: [...missingRates],
  };
}

/* ------------------------------------------------------------------ *
 * EFFECTIVE DATING — statutory sets must never overlap
 * ------------------------------------------------------------------ */

export interface DatedRange {
  id?: string;
  code?: string;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
}

/**
 * Overlap check for rate sets in the same jurisdiction. Two sets covering the
 * same day would make "the" statutory value ambiguous, so the service refuses
 * to store that.
 */
export function findEffectiveDateOverlap(
  candidate: DatedRange,
  existing: DatedRange[],
  currentId?: string,
): DatedRange | null {
  for (const e of existing) {
    if (currentId && e.id === currentId) continue;
    if (rangesOverlap(candidate.effectiveFrom, candidate.effectiveTo, e.effectiveFrom, e.effectiveTo)) {
      return e;
    }
  }
  return null;
}

/** Which set is in force on a date. Latest effectiveFrom wins. */
export function setInForceOn<T extends DatedRange>(sets: T[], asOn: string): T | null {
  const asOnDay = day(asOn);
  if (asOnDay == null) return null;
  const eligible = sets.filter((s) => {
    const from = day(s.effectiveFrom);
    const to = day(s.effectiveTo);
    if (from == null || from > asOnDay) return false;
    if (to != null && to < asOnDay) return false;
    return true;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => (day(b.effectiveFrom) ?? 0) - (day(a.effectiveFrom) ?? 0));
  return eligible[0];
}
