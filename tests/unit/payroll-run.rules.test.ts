/**
 * Phase 5 rules — the payroll state machine, maker-checker gate, blocking
 * findings and attendance folding.
 *
 * These are the assertions behind Rules 15 and 16: statutory figures must be
 * configurable, the preparer must not approve their own run, and an approved
 * period must be immutable.
 */

import { describe, expect, it } from 'vitest';
import {
  PAYROLL_RUN_STATUSES, RUN_TRANSITIONS, canTransition, isPeriodLocked, isEditable,
  canApproveRun, collectFindings, blockingCount, attendanceToDays, applyAdjustments,
  computeSlip, periodBounds, daysInMonthOf, monthLabel, isPeriodComplete,
  csvField, buildPfEcrText, buildBankTransferCsv, ecrField,
} from '@ufms/shared/payroll/run-rules';
import { LEGACY_STATUTORY_DEFAULTS, LEGACY_KA_PT_SLABS } from '@ufms/shared/hr/employee-rules';

const APPROVER = { id: 'U-BOSS', name: 'Approver', permissions: ['payroll:read', 'payroll:approve'] };
const PREPARER = { id: 'U-PREP', name: 'Preparer', permissions: ['payroll:read', 'payroll:prepare'] };

describe('run status machine', () => {
  it('keeps the five legacy statuses and adds DRAFT as the preparer state', () => {
    expect(PAYROLL_RUN_STATUSES).toEqual(['DRAFT', 'LOCKED', 'APPROVED', 'DISBURSED', 'CANCELLED']);
  });

  it('follows DRAFT → LOCKED → APPROVED → DISBURSED', () => {
    expect(canTransition('DRAFT', 'LOCKED')).toBe(true);
    expect(canTransition('LOCKED', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'DISBURSED')).toBe(true);
  });

  it('refuses to skip the lock step (legacy jumped straight to LOCKED on create)', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('LOCKED', 'DISBURSED')).toBe(false);
  });

  it('allows a locked run to be sent back to the preparer for correction', () => {
    expect(canTransition('LOCKED', 'DRAFT')).toBe(true);
  });

  it('treats DISBURSED and CANCELLED as terminal', () => {
    expect(RUN_TRANSITIONS.DISBURSED).toEqual([]);
    expect(RUN_TRANSITIONS.CANCELLED).toEqual([]);
    expect(canTransition('DISBURSED', 'DRAFT')).toBe(false);
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('rejects unknown statuses instead of throwing', () => {
    expect(canTransition('WAT', 'APPROVED')).toBe(false);
    expect(canTransition('DRAFT', 'WAT')).toBe(false);
    expect(canTransition(undefined as any, undefined as any)).toBe(false);
  });

  it('locks the period from LOCKED onwards and allows edits only while DRAFT', () => {
    expect(isPeriodLocked('DRAFT')).toBe(false);
    expect(isPeriodLocked('LOCKED')).toBe(true);
    expect(isPeriodLocked('APPROVED')).toBe(true);
    expect(isPeriodLocked('DISBURSED')).toBe(true);
    expect(isPeriodLocked('CANCELLED')).toBe(false);

    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('LOCKED')).toBe(false);
  });
});

describe('maker-checker approval — Rule 16', () => {
  const base = { runStatus: 'LOCKED', preparedById: PREPARER.id, blockingFindings: 0 };

  it('allows a different person with payroll:approve', () => {
    const d = canApproveRun({ ...base, approver: APPROVER });
    expect(d.allowed).toBe(true);
  });

  it('REFUSES self-approval — legacy defect D-P5-1', () => {
    const d = canApproveRun({ ...base, approver: { ...PREPARER, permissions: ['payroll:prepare', 'payroll:approve'] } });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('SELF_APPROVAL');
    expect(d.message).toMatch(/cannot approve it/i);
  });

  it('refuses an approver without payroll:approve', () => {
    const d = canApproveRun({ ...base, approver: { id: 'U-X', permissions: ['payroll:read'] } });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('MISSING_PERMISSION');
  });

  it('refuses to approve a run that is still DRAFT', () => {
    const d = canApproveRun({ ...base, runStatus: 'DRAFT', approver: APPROVER });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('INVALID_TRANSITION');
  });

  it('refuses while blocking findings remain', () => {
    const d = canApproveRun({ ...base, blockingFindings: 2, approver: APPROVER });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('BLOCKING_FINDINGS');
  });

  it('permits self-approval only with the configured exception AND a real reason', () => {
    const self = { ...PREPARER, permissions: ['payroll:prepare', 'payroll:approve'] };

    expect(canApproveRun({ ...base, approver: self, selfApprovalAllowed: true }).allowed).toBe(false);
    expect(canApproveRun({ ...base, approver: self, selfApprovalAllowed: true, selfApprovalReason: 'short' }).allowed).toBe(false);
    expect(canApproveRun({
      ...base, approver: self, selfApprovalAllowed: true,
      selfApprovalReason: 'Single-person payroll team; owner approved the exception in writing.',
    }).allowed).toBe(true);
  });

  it('does not let the exception apply to a different approver', () => {
    const d = canApproveRun({
      ...base, approver: APPROVER, selfApprovalAllowed: true, selfApprovalReason: 'a long enough reason here',
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBeUndefined();
  });
});

describe('blocking findings', () => {
  const item = (over: Partial<any> = {}) => ({
    employeeId: 'E-1', employeeName: 'Asha', employeeCode: 'EMP-2026-0001',
    basic: 10000, da: 0, netPay: 8500, pfEmployee: 1200, ...over,
  });

  it('passes a clean run', () => {
    expect(collectFindings({ items: [item()], statutorySetCode: 'KA-2026' })).toEqual([]);
  });

  it('blocks when no confirmed statutory set covers the period', () => {
    const f = collectFindings({ items: [item()], statutorySetCode: null });
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe('NO_STATUTORY_SET');
    expect(f[0].severity).toBe('BLOCKING');
  });

  it('blocks a below-minimum-wage payment', () => {
    const f = collectFindings({
      items: [item()], statutorySetCode: 'KA-2026',
      floorCheck: { compliant: false, breaches: [{ employeeId: 'E-1', employeeName: 'Asha', shortfall: 1500, category: 'UNSKILLED' }], missingRates: [] },
    });
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe('BELOW_MINIMUM_WAGE');
    expect(f[0].message).toContain('1500.00');
    expect(f[0].severity).toBe('BLOCKING');
  });

  it('fails closed when a wage category has no configured rate', () => {
    const f = collectFindings({
      items: [item()], statutorySetCode: 'KA-2026',
      floorCheck: { compliant: true, breaches: [], missingRates: ['SEMI_SKILLED'] },
    });
    expect(f.map((x) => x.code)).toContain('MISSING_WAGE_RATE');
  });

  it('blocks a negative net pay (recoveries exceeding earnings)', () => {
    const f = collectFindings({ items: [item({ netPay: -450 })], statutorySetCode: 'KA-2026' });
    expect(f[0].code).toBe('NEGATIVE_NET_PAY');
    expect(f[0].amount).toBe(-450);
  });

  it('blocks an unpaid employee with no bank account', () => {
    const f = collectFindings({
      items: [item()], statutorySetCode: 'KA-2026',
      missingBank: [{ employeeId: 'E-1', employeeName: 'Asha' }],
    });
    expect(f[0].code).toBe('MISSING_BANK_DETAILS');
  });

  it('blocks PF deducted without a UAN, but not PF of zero', () => {
    const withPf = collectFindings({
      items: [item()], statutorySetCode: 'KA-2026',
      missingUan: [{ employeeId: 'E-1', employeeName: 'Asha', pfEmployee: 1200 }],
    });
    expect(withPf[0].code).toBe('MISSING_UAN');

    const noPf = collectFindings({
      items: [item({ pfEmployee: 0 })], statutorySetCode: 'KA-2026',
      missingUan: [{ employeeId: 'E-1', employeeName: 'Asha', pfEmployee: 0 }],
    });
    expect(noPf).toEqual([]);
  });

  it('warns, but does not block, on pending adjustments', () => {
    const f = collectFindings({ items: [item()], statutorySetCode: 'KA-2026', adjustmentsPending: 3 });
    expect(f[0].severity).toBe('WARNING');
    expect(blockingCount(f)).toBe(0);
  });

  it('counts only blocking findings', () => {
    const f = collectFindings({
      items: [item({ netPay: -1 })], statutorySetCode: null, adjustmentsPending: 1,
    });
    expect(f).toHaveLength(3);
    expect(blockingCount(f)).toBe(2);
  });
});

describe('attendance folding', () => {
  const rows = (spec: Record<string, number>, ot = 0) =>
    Object.entries(spec).flatMap(([status, n]) =>
      Array.from({ length: n }, (_, i) => ({ status, hoursWorked: 8, otHours: i === 0 ? ot : 0 })));

  it('treats a full present month as fully payable', () => {
    const d = attendanceToDays(rows({ PRESENT: 30 }), 30);
    expect(d.daysWorked).toBe(30);
    expect(d.daysPresent).toBe(30);
    expect(d.absentDays).toBe(0);
    expect(d.empty).toBe(false);
  });

  it('reduces payable days for absence and unpaid leave', () => {
    const d = attendanceToDays(rows({ PRESENT: 20, ABSENT: 2, UNPAID_LEAVE: 3, WEEKLY_OFF: 4, HOLIDAY: 1 }), 30);
    expect(d.payableDays).toBe(25);
    expect(d.daysWorked).toBe(25);
    expect(d.absentDays).toBe(2);
    expect(d.unpaidLeaveDays).toBe(3);
    expect(d.daysPresent).toBe(20);
  });

  it('keeps paid leave payable but not present', () => {
    const d = attendanceToDays(rows({ PRESENT: 24, PAID_LEAVE: 4 }), 30);
    expect(d.daysWorked).toBe(30);
    expect(d.daysPresent).toBe(24);
  });

  it('counts a half day as half present but fully payable', () => {
    const d = attendanceToDays(rows({ PRESENT: 21, HALF_DAY: 2 }), 30);
    expect(d.daysWorked).toBe(30);
    expect(d.daysPresent).toBe(22);
  });

  it('converts OT hours to OT days at 8 hours per day', () => {
    const d = attendanceToDays(rows({ PRESENT: 26 }, 20), 30);
    expect(d.otHours).toBe(20);
    expect(d.otDays).toBe(2.5);
  });

  it('flags an empty month so the caller can refuse to guess', () => {
    const d = attendanceToDays([], 30);
    expect(d.empty).toBe(true);
    expect(d.daysWorked).toBe(30);
  });

  it('never returns present days above payable days', () => {
    // Data anomaly: more present days recorded than the month has pay days.
    const d = attendanceToDays(rows({ PRESENT: 40 }), 30);
    expect(d.daysPresent).toBeLessThanOrEqual(d.daysWorked);
  });

  it('feeds computeSlip and prorates through the proven salary engine', () => {
    // 15 payable days out of a 30-day month against ₹30,000 basic.
    const days = attendanceToDays(rows({ PRESENT: 15, ABSENT: 15 }), 30);
    const slip = computeSlip({
      employee: {
        basic: 30000, hra: 12000, da: 0, otherAllowances: 0,
        esiApplicable: false, pfApplicable: false, ptState: '',
      },
      month: 4, year: 2026, days, cfg: LEGACY_STATUTORY_DEFAULTS, ptSlabs: LEGACY_KA_PT_SLABS,
    });
    expect(slip.daysWorked).toBe(15);
    expect(slip.earnings.basic).toBe(15000);
    expect(slip.earnings.grossEarnings).toBe(21000);
    expect(slip.netPay).toBe(21000);
  });
});

describe('adjustments — Rule 16 corrections', () => {
  it('adds an ADDITION and subtracts a REVERSAL', () => {
    const r = applyAdjustments(30000, [
      { id: 'a1', type: 'ADDITION', amount: 1500 },
      { id: 'a2', type: 'REVERSAL', amount: 500 },
    ]);
    expect(r.adjustmentAmount).toBe(1000);
    expect(r.netPay).toBe(31000);
    expect(r.applied).toEqual(['a1', 'a2']);
  });

  it('treats the sign as inherent to the type, ignoring a supplied minus sign', () => {
    const r = applyAdjustments(1000, [{ type: 'REVERSAL', amount: -250 }]);
    expect(r.adjustmentAmount).toBe(-250);
    expect(r.netPay).toBe(750);
  });

  it('throws on an unknown adjustment type rather than guessing', () => {
    expect(() => applyAdjustments(1000, [{ type: 'BONUS', amount: 100 }])).toThrow(/Unknown adjustment type/);
  });

  it('is a no-op with no adjustments', () => {
    const r = applyAdjustments(5000, []);
    expect(r.adjustmentAmount).toBe(0);
    expect(r.netPay).toBe(5000);
  });
});

describe('period maths', () => {
  it('computes month bounds including leap February', () => {
    expect(periodBounds(2, 2024)).toEqual({ start: '2024-02-01', end: '2024-02-29', days: 29 });
    expect(periodBounds(2, 2026)).toEqual({ start: '2026-02-01', end: '2026-02-28', days: 28 });
    expect(periodBounds(11, 2026)).toEqual({ start: '2026-11-01', end: '2026-11-30', days: 30 });
  });

  it('labels months for the bank remark line', () => {
    expect(monthLabel(11, 2026)).toBe('November 2026');
    expect(monthLabel(1, 2027)).toBe('January 2027');
  });

  it('only treats a month as complete once its last day has passed', () => {
    expect(isPeriodComplete(11, 2026, '2026-11-30')).toBe(true);
    expect(isPeriodComplete(11, 2026, '2026-11-29')).toBe(false);
    expect(isPeriodComplete(11, 2026, '2026-12-01T09:00:00+05:30')).toBe(true);
  });

  it('uses UTC maths so the server timezone cannot shift a date', () => {
    expect(daysInMonthOf(2, 2028)).toBe(29);
    expect(daysInMonthOf(12, 2026)).toBe(31);
  });
});

describe('export helpers', () => {
  it('drops structural characters from ECR fields', () => {
    expect(ecrField('A#B\r\nC')).toBe('A B  C');
  });

  it('emits an ECR body with CRLF and no trailing newline', () => {
    const t = buildPfEcrText([
      { uan: '1', name: 'A', gross: 100, epfWages: 100, eps: 8, edlis: 1, epf: 12, ncpDays: 0, refundAdvances: 0 },
      { uan: '2', name: 'B', gross: 200, epfWages: 200, eps: 17, edlis: 1, epf: 24, ncpDays: 1, refundAdvances: 0 },
    ]);
    expect(t.split('\r\n')).toHaveLength(2);
    expect(t.endsWith('\n')).toBe(false);
  });

  it('writes the bank header once, then one row per beneficiary', () => {
    const t = buildBankTransferCsv([
      { beneficiaryName: 'A', amount: 10, ifsc: 'I', accountNo: '1', remarks: 'Salary November 2026' },
      { beneficiaryName: 'B', amount: 20, ifsc: 'J', accountNo: '2', remarks: 'Salary November 2026' },
    ]);
    expect(t.split('\r\n')).toHaveLength(3);
    expect(t.startsWith('Debit A/c No,Beneficiary Name,Amount,IFSC,Beneficiary A/c No,Remarks')).toBe(true);
  });

  it('accepts an explicit debit account so the file can be complete', () => {
    const t = buildBankTransferCsv(
      [{ beneficiaryName: 'A', amount: 10, ifsc: 'I', accountNo: '1', remarks: 'r' }],
      '0044XXXXXXXX',
    );
    expect(t.split('\r\n')[1].startsWith('0044XXXXXXXX,')).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    expect(csvField('Asha Rao')).toBe('Asha Rao');
  });
});
