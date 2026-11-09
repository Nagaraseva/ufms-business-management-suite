/**
 * Payroll run rules — the state machine, the maker-checker gate, the blocking
 * findings and the export formats.
 *
 * Legacy reference: HR.gs:787-1190. Everything here is pure so the parity and
 * rule tests can exercise it without a database or a clock.
 *
 * Three legacy defects are corrected here, each with the reason recorded:
 *   D-P5-1  `updatePayrollRun_` set `ApprovedBy = user.UserID` — the preparer
 *           could approve their own run. Rule 16 forbids this.
 *   D-P5-2  A salary slip could be recomputed after the run that used it was
 *           approved, leaving the run and the slip disagreeing. Slips are now
 *           frozen once attached to a run.
 *   D-P5-3  The bank transfer CSV wrapped names in bare quotes and never
 *           escaped them, so a name containing a quote, comma or newline broke
 *           the file, and a leading =+-@ was a spreadsheet-injection vector.
 */

import { calculateSalarySlip } from '../hr/employee-rules';
import type {
  StatutoryConfig,
  PtSlabRule,
  SalaryEmployee,
  SalaryAdjustments,
  SalarySlip,
} from '../hr/employee-rules';

/* ------------------------------------------------------------------ *
 * STATUS MACHINE
 * ------------------------------------------------------------------ */

/** Legacy PAYROLL_RUN_STATUSES_ (HR.gs:787) plus DRAFT as the preparer's state. */
export const PAYROLL_RUN_STATUSES = ['DRAFT', 'LOCKED', 'APPROVED', 'DISBURSED', 'CANCELLED'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const SALARY_SLIP_STATUSES = ['DRAFT', 'GENERATED', 'SENT', 'CANCELLED'] as const;
export type SalarySlipStatus = (typeof SALARY_SLIP_STATUSES)[number];

/** Allowed transitions. Anything absent is refused by the service. */
export const RUN_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  DRAFT: ['LOCKED', 'CANCELLED'],
  LOCKED: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['DISBURSED'],
  DISBURSED: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = RUN_TRANSITIONS[String(from ?? '').toUpperCase() as PayrollRunStatus];
  if (!allowed) return false;
  return allowed.includes(String(to ?? '').toUpperCase() as PayrollRunStatus);
}

/** A period is locked once the run leaves DRAFT. Only an APPROVED run may pay out. */
export function isPeriodLocked(status: string): boolean {
  return ['LOCKED', 'APPROVED', 'DISBURSED'].includes(String(status ?? '').toUpperCase());
}

/** Figures may only be recomputed while the run is still a draft. */
export function isEditable(status: string): boolean {
  return String(status ?? '').toUpperCase() === 'DRAFT';
}

/* ------------------------------------------------------------------ *
 * MAKER-CHECKER — Rule 16
 * ------------------------------------------------------------------ */

export interface ApproverIdentity {
  id: string;
  name?: string;
  permissions: string[];
}

export interface ApprovalDecision {
  allowed: boolean;
  code?: 'INVALID_TRANSITION' | 'SELF_APPROVAL' | 'MISSING_PERMISSION' | 'BLOCKING_FINDINGS';
  message?: string;
}

/**
 * Decide whether `approver` may approve this run.
 *
 * The preparer may never approve their own run. The single exception is an
 * explicit, configured opt-in that must state a reason and is recorded on the
 * run and in the audit log — it is not a silent by-pass.
 */
export function canApproveRun(input: {
  runStatus: string;
  preparedById: string | null | undefined;
  approver: ApproverIdentity;
  /** Tenant setting: allow a single-person payroll team to approve their own work. */
  selfApprovalAllowed?: boolean;
  selfApprovalReason?: string;
  blockingFindings?: number;
}): ApprovalDecision {
  const status = String(input.runStatus ?? '').toUpperCase();

  if (!input.approver.permissions.includes('payroll:approve')) {
    return {
      allowed: false,
      code: 'MISSING_PERMISSION',
      message: 'Approving a payroll run requires the payroll:approve permission.',
    };
  }
  if (!canTransition(status, 'APPROVED')) {
    return {
      allowed: false,
      code: 'INVALID_TRANSITION',
      message: `A run in status ${status} cannot be approved. Lock the draft first.`,
    };
  }
  if ((input.blockingFindings ?? 0) > 0) {
    return {
      allowed: false,
      code: 'BLOCKING_FINDINGS',
      message: `${input.blockingFindings} blocking finding(s) must be resolved before this run can be approved.`,
    };
  }

  const samePerson =
    !!input.preparedById && String(input.preparedById) === String(input.approver.id);
  if (samePerson) {
    const exempt =
      input.selfApprovalAllowed === true &&
      String(input.selfApprovalReason ?? '').trim().length >= 10;
    if (!exempt) {
      return {
        allowed: false,
        code: 'SELF_APPROVAL',
        message:
          'The person who prepared this run cannot approve it. ' +
          'A second approver is required, or a reasoned exception must be enabled in settings.',
      };
    }
  }

  return { allowed: true };
}

/* ------------------------------------------------------------------ *
 * BLOCKING FINDINGS
 * ------------------------------------------------------------------ */

export type FindingSeverity = 'BLOCKING' | 'WARNING';

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  employeeId?: string;
  employeeName?: string;
  amount?: number;
}

export interface FindingInput {
  items: Array<{
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    basic: NumericInput;
    da: NumericInput;
    netPay: NumericInput;
    pfEmployee: NumericInput;
  }>;
  /** Result of the minimum-wage floor check for the pay period. */
  floorCheck?: {
    compliant: boolean;
    breaches: Array<{ employeeId: string; employeeName?: string; shortfall: number; category: string }>;
    missingRates: string[];
  };
  /** The statutory set resolved for the period, or null if none covers it. */
  statutorySetCode?: string | null;
  /** Employees in the run who have no bank account on file. */
  missingBank?: Array<{ employeeId: string; employeeName: string }>;
  /** Employees with no UAN — they cannot be reported in the PF ECR. */
  missingUan?: Array<{ employeeId: string; employeeName: string; pfEmployee: NumericInput }>;
  adjustmentsPending?: number;
}

/**
 * Collect everything that should stop a run being approved.
 *
 * The legacy system performed none of these checks: `createPayrollRun_` locked
 * a run regardless of whether anyone was below minimum wage, had no bank
 * account, or whether a statutory set existed at all.
 */
export function collectFindings(input: FindingInput): Finding[] {
  const findings: Finding[] = [];

  if (!input.statutorySetCode) {
    findings.push({
      code: 'NO_STATUTORY_SET',
      severity: 'BLOCKING',
      message:
        'No CONFIRMED statutory rate set covers this pay period. Payroll cannot treat inherited ' +
        'constants as authoritative — confirm a rate set for the period first.',
    });
  }

  if (input.floorCheck) {
    for (const b of input.floorCheck.breaches) {
      findings.push({
        code: 'BELOW_MINIMUM_WAGE',
        severity: 'BLOCKING',
        message: `${b.employeeName ?? 'An employee'} is ₹${b.shortfall.toFixed(2)} below the ` +
          `minimum wage for ${b.category}. Statutory minimum violation.`,
        employeeId: b.employeeId,
        employeeName: b.employeeName,
        amount: b.shortfall,
      });
    }
    for (const cat of input.floorCheck.missingRates ?? []) {
      findings.push({
        code: 'MISSING_WAGE_RATE',
        severity: 'BLOCKING',
        message: `No minimum wage is configured for category ${cat}. The floor cannot be verified, ` +
          'so the run fails closed.',
      });
    }
  }

  for (const e of input.items) {
    const net = Number(e.netPay) || 0;
    if (net < 0) {
      findings.push({
        code: 'NEGATIVE_NET_PAY',
        severity: 'BLOCKING',
        message: `${e.employeeName} has a negative net pay of ₹${net.toFixed(2)}. ` +
          'Recoveries exceed earnings; this must be corrected or carried forward as an adjustment.',
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        amount: net,
      });
    }
  }

  for (const e of input.missingBank ?? []) {
    findings.push({
      code: 'MISSING_BANK_DETAILS',
      severity: 'BLOCKING',
      message: `${e.employeeName} has no bank account on file and cannot be paid.`,
      employeeId: e.employeeId,
      employeeName: e.employeeName,
    });
  }

  for (const e of input.missingUan ?? []) {
    // Only blocking when a PF deduction actually happened — otherwise there is
    // nothing to remit for this person and the ECR simply omits them.
    if ((Number(e.pfEmployee) || 0) > 0) {
      findings.push({
        code: 'MISSING_UAN',
        severity: 'BLOCKING',
        message: `${e.employeeName} has PF deducted but no UAN, so their contribution cannot be ` +
          'reported in the PF ECR.',
        employeeId: e.employeeId,
        employeeName: e.employeeName,
      });
    }
  }

  if ((input.adjustmentsPending ?? 0) > 0) {
    findings.push({
      code: 'ADJUSTMENTS_PENDING',
      severity: 'WARNING',
      message: `${input.adjustmentsPending} adjustment(s) are pending and will not be included in this run.`,
    });
  }

  return findings;
}

export const blockingCount = (findings: Finding[]): number =>
  findings.filter((f) => f.severity === 'BLOCKING').length;

/* ------------------------------------------------------------------ *
 * TOTALS — parity with summarizePayrollRun_ (HR.gs:807-830)
 * ------------------------------------------------------------------ */

export interface PayrollTotals {
  count: number;
  gross: number;
  esiEmployee: number;
  esiEmployer: number;
  pfEmployee: number;
  pfEmployerEPF: number;
  pfEmployerEPS: number;
  pfEmployerEDLIS: number;
  pt: number;
  tds: number;
  adjustments: number;
  totalDeductions: number;
  net: number;
}

/**
 * Any numeric value we can coerce: a plain number, a numeric string, or a
 * Prisma Decimal (which exposes toString/valueOf). Declared structurally so the
 * shared package stays free of any database dependency.
 */
export type NumericInput = number | string | { toString(): string };

export interface TotalsItem {
  basic: NumericInput;
  da: NumericInput;
  grossEarnings: NumericInput;
  esiEmployee: NumericInput;
  pfEmployee: NumericInput;
  pt: NumericInput;
  tds: NumericInput;
  totalDeductions: NumericInput;
  netPay: NumericInput;
  adjustmentAmount?: NumericInput;
}

/**
 * Employer PF split, exactly as `summarizePayrollRun_` computes it:
 *   EPS 8.33% and EDLI 0.5% of capped PF wages, EPF 12% of the same base.
 * The three are reported separately because the ECR needs them separately.
 */
export function summarizePayrollRun(
  items: TotalsItem[],
  cfg: StatutoryConfig,
  rates: { eps: number; edlis: number } = { eps: 8.33, edlis: 0.5 },
): PayrollTotals {
  const sum: PayrollTotals = {
    count: 0, gross: 0, esiEmployee: 0, esiEmployer: 0,
    pfEmployee: 0, pfEmployerEPF: 0, pfEmployerEPS: 0, pfEmployerEDLIS: 0,
    pt: 0, tds: 0, adjustments: 0, totalDeductions: 0, net: 0,
  };

  for (const it of items) {
    sum.count += 1;
    const gross = Number(it.grossEarnings) || 0;
    sum.gross += gross;
    sum.esiEmployee += Number(it.esiEmployee) || 0;
    sum.pfEmployee += Number(it.pfEmployee) || 0;
    sum.pt += Number(it.pt) || 0;
    sum.tds += Number(it.tds) || 0;
    sum.adjustments += Number(it.adjustmentAmount) || 0;
    sum.totalDeductions += Number(it.totalDeductions) || 0;
    sum.net += Number(it.netPay) || 0;

    const pfBase = Math.min((Number(it.basic) || 0) + (Number(it.da) || 0), cfg.pfWageCap);
    sum.pfEmployerEPF += Math.round((pfBase * cfg.pfEmployerPct) / 100);
    sum.pfEmployerEPS += Math.round((pfBase * rates.eps) / 100);
    sum.pfEmployerEDLIS += Math.round((pfBase * rates.edlis) / 100);

    // Legacy rule: employer ESI is added only for people who actually paid ESI.
    if ((Number(it.esiEmployee) || 0) > 0) {
      sum.esiEmployer += Math.round((gross * cfg.esiEmployerPct) / 100);
    }
  }

  return sum;
}

/* ------------------------------------------------------------------ *
 * ADJUSTMENTS — Rule 16 corrections
 * ------------------------------------------------------------------ */

/**
 * Apply pending adjustments on top of a computed slip.
 *
 * A REVERSAL is money owed back TO the employer (it reduces net pay); an
 * ADDITION is money owed TO the employee. The sign convention is fixed here so
 * it can never be ambiguous at the call site.
 */
export function applyAdjustments(
  baseNetPay: number,
  adjustments: Array<{ id?: string; type: string; amount: NumericInput }>,
): { adjustmentAmount: number; netPay: number; applied: string[] } {
  let delta = 0;
  const applied: string[] = [];
  for (const a of adjustments) {
    const amount = Math.abs(Number(a.amount) || 0);
    const type = String(a.type ?? '').toUpperCase();
    if (type === 'ADDITION') delta += amount;
    else if (type === 'REVERSAL') delta -= amount;
    else throw new Error(`Unknown adjustment type: ${a.type}`);
    if (a.id) applied.push(a.id);
  }
  const adjustmentAmount = Math.round(delta * 100) / 100;
  return { adjustmentAmount, netPay: Math.round((baseNetPay + adjustmentAmount) * 100) / 100, applied };
}

/* ------------------------------------------------------------------ *
 * ATTENDANCE → DAYS  (new capability; no legacy equivalent)
 * ------------------------------------------------------------------ */

export interface AttendanceRow {
  status: string;
  hoursWorked?: number | string;
  otHours?: number | string;
}

export interface DayCounts {
  daysInMonth: number;
  presentDays: number;
  payableDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  halfDays: number;
  weeklyOffs: number;
  holidays: number;
  otHours: number;
  otDays: number;
  /** Days worked = payable days. Drives proration in calculateSalarySlip. */
  daysWorked: number;
  /** Physically present days, clamped to daysWorked as the slip requires. */
  daysPresent: number;
  /** True when the month has no attendance at all — the caller must decide. */
  empty: boolean;
}

export const OT_HOURS_PER_DAY = 8;

/**
 * Fold a month of attendance into the two numbers the salary engine understands.
 *
 *   payable days  = days in month − (absent + unpaid leave)
 *   present days  = present + 0.5 × half days, clamped to payable days
 *
 * Paid leave and weekly offs are payable but are not "present", which matches
 * how the legacy slip reports DaysWorked and DaysPresent as different values.
 */
export function attendanceToDays(rows: AttendanceRow[], daysInMonth: number): DayCounts {
  const present = rows.filter((r) => r.status === 'PRESENT').length;
  const half = rows.filter((r) => r.status === 'HALF_DAY').length;
  const absent = rows.filter((r) => r.status === 'ABSENT').length;
  const paidLeave = rows.filter((r) => r.status === 'PAID_LEAVE').length;
  const unpaidLeave = rows.filter((r) => r.status === 'UNPAID_LEAVE').length;
  const weeklyOff = rows.filter((r) => r.status === 'WEEKLY_OFF').length;
  const holiday = rows.filter((r) => r.status === 'HOLIDAY').length;

  const otHours = rows.reduce((s, r) => s + (Number(r.otHours) || 0), 0);
  const absentDays = absent + unpaidLeave;
  const payableDays = Math.max(0, daysInMonth - absentDays);
  const presentDays = present + half * 0.5;

  return {
    daysInMonth,
    presentDays,
    payableDays,
    absentDays: absent,
    paidLeaveDays: paidLeave,
    unpaidLeaveDays: unpaidLeave,
    halfDays: half,
    weeklyOffs: weeklyOff,
    holidays: holiday,
    otHours: Math.round(otHours * 100) / 100,
    otDays: Math.round((otHours / OT_HOURS_PER_DAY) * 100) / 100,
    daysWorked: payableDays,
    daysPresent: Math.min(payableDays, presentDays),
    empty: rows.length === 0,
  };
}

/**
 * Compute a slip from an employee, a month of attendance and a statutory set.
 * This is the single place the run and the standalone slip both go through, so
 * the two can never disagree.
 */
export function computeSlip(input: {
  employee: SalaryEmployee & { id?: string; name?: string };
  month: number;
  year: number;
  days: DayCounts;
  adjustments?: SalaryAdjustments;
  cfg: StatutoryConfig;
  ptSlabs?: PtSlabRule[];
}): SalarySlip {
  const { days } = input;
  return calculateSalarySlip(
    input.employee,
    input.month,
    input.year,
    {
      daysWorked: days.daysWorked,
      daysPresent: days.daysPresent,
      otDays: days.otDays,
      ...input.adjustments,
    },
    input.cfg,
    input.ptSlabs,
  );
}

/* ------------------------------------------------------------------ *
 * EXPORT FORMATS
 * ------------------------------------------------------------------ */

/**
 * Legacy `escCsv_` replaced `#` and `,` with a space. That is not CSV escaping —
 * it silently corrupts the value. This produces a properly quoted field per
 * RFC 4180 and neutralises spreadsheet formula injection by prefixing a tab
 * when a value begins with = + - @.
 */
export function csvField(value: string | number | null | undefined): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `\t${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(csvField).join(',');
}

/** Legacy ECR sanitises the name for a `#`-delimited file. */
export function ecrField(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[#\r\n]/g, ' ').trim();
}

export interface EcrLine {
  uan: string;
  name: string;
  gross: number;
  epfWages: number;
  eps: number;
  edlis: number;
  epf: number;
  ncpDays: number;
  refundAdvances: number;
}

/**
 * Build the PF ECR text body.
 *
 * The legacy source explicitly labels its own format "simplified — actual ECR
 * has more columns; this is a working starting format" (HR.gs:1108). That
 * caveat is preserved: this reproduces the legacy layout for continuity, it is
 * not a certified EPFO upload file, and the caller must verify it against the
 * current portal specification before filing.
 */
export function buildPfEcrText(lines: EcrLine[]): string {
  return lines
    .map((l) =>
      [
        ecrField(l.uan),
        ecrField(l.name),
        l.gross,
        l.epfWages,
        l.eps,
        l.edlis,
        l.epf,
        l.ncpDays ?? 0,
        l.refundAdvances ?? 0,
      ].join('#'),
    )
    .join('\r\n');
}

export interface BankLine {
  beneficiaryName: string;
  amount: number;
  ifsc: string;
  accountNo: string;
  remarks: string;
}

export const BANK_CSV_HEADER = [
  'Debit A/c No', 'Beneficiary Name', 'Amount', 'IFSC', 'Beneficiary A/c No', 'Remarks',
];

/** Build the bank transfer CSV. Legacy left the debit account column empty. */
export function buildBankTransferCsv(lines: BankLine[], debitAccount = ''): string {
  const rows = [csvLine(BANK_CSV_HEADER)];
  for (const l of lines) rows.push(csvLine([debitAccount, l.beneficiaryName, l.amount, l.ifsc, l.accountNo, l.remarks]));
  return rows.join('\r\n');
}

/* ------------------------------------------------------------------ *
 * PERIOD MATHS
 * ------------------------------------------------------------------ */

export function daysInMonthOf(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodBounds(month: number, year: number): { start: string; end: string; days: number } {
  const days = daysInMonthOf(month, year);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${year}-${p(month)}-01`,
    end: `${year}-${p(month)}-${p(days)}`,
    days,
  };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(month: number, year: number): string {
  const idx = Number(month) - 1;
  return `${MONTH_NAMES[idx] ?? 'Unknown'} ${year}`;
}

/**
 * A run may only be created for a period that has already ended, or for the
 * current month once it is complete. Paying a month before it finishes would
 * freeze attendance nobody has recorded yet.
 */
export function isPeriodComplete(month: number, year: number, todayIso: string): boolean {
  const { end } = periodBounds(month, year);
  return end <= String(todayIso).slice(0, 10);
}
