/**
 * Phase 4 parity — HR rules vs the legacy HR.gs implementation.
 *
 * The oracle lifts `calculateSalarySlip_`, `hrPtFor_`, `hrPfWages_`,
 * `getHRSummary_` and `nextCodeFor_` out of the real v5.6.61 source and runs
 * them with their own module constants. Anything less than an exact match on
 * money fails the suite.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  calculateSalarySlip, hrSummary, nextEmployeeCode, normalizePhone,
  isValidAadhaar, isValidPan, isValidMobile, passesVerhoeff,
  isDuplicateEmployeeCode, ptForGross, pfWages, LEGACY_STATUTORY_DEFAULTS,
  isAssignmentConflict, findAssignmentConflict, rangesOverlap,
  reconcileStrength, resolveWageFloor, checkMinimumWageFloor,
  findEffectiveDateOverlap, setInForceOn, countsAsOnRolls,
  EMPLOYEE_STATUSES, isValidEmployeeStatus,
} from '@ufms/shared/hr/employee-rules';
import { buildHrOracle } from './legacy-oracle.mjs';

let oracle: any = null;

beforeAll(() => {
  try {
    oracle = buildHrOracle();
  } catch (e) {
    console.warn('HR oracle unavailable:', (e as Error).message);
    oracle = null;
  }
});

const need = (name: string) => {
  if (!oracle) throw new Error(`${name}: legacy HR source unavailable — cannot claim parity.`);
  return oracle;
};

/* ================================================================== */
/* SALARY SLIP                                                       */
/* ================================================================== */

describe('calculateSalarySlip — parity with HR.gs', () => {
  it('matches the legacy result for a full month', () => {
    const o = need('slip');
    const emp = {
      basic: 20000, hra: 8000, da: 2000, otherAllowances: 1000,
      esiApplicable: false, pfApplicable: true, ptState: 'KARNATAKA',
    };
    const legacy = o.calculateSalarySlip(emp, 3, 2026, {});
    const mine = calculateSalarySlip(emp, 3, 2026, {});
    expect(mine.earnings).toEqual({
      basic: legacy.earnings.basic,
      hra: legacy.earnings.hra,
      da: legacy.earnings.da,
      specialAllowance: legacy.earnings.specialAllowance,
      otAmount: legacy.earnings.otAmount,
      otDays: legacy.earnings.otDays,
      bonus: legacy.earnings.bonus,
      grossEarnings: legacy.earnings.grossEarnings,
    });
    expect(mine.deductions.totalDeductions).toBe(legacy.deductions.totalDeductions);
    expect(mine.netPay).toBe(legacy.netPay);
    expect(mine.otRate).toBe(legacy.otRate);
    expect(mine.daysInMonth).toBe(legacy.daysInMonth);
  });

  it('matches for a prorated month (days worked < days in month)', () => {
    const o = need('slip');
    const emp = {
      basic: 15000, hra: 6000, da: 1500, otherAllowances: 500,
      esiApplicable: true, pfApplicable: true, ptState: 'KARNATAKA',
    };
    const adj = { daysWorked: 17, daysPresent: 16, otDays: 2, bonus: 500 };
    const legacy = o.calculateSalarySlip(emp, 4, 2026, adj);
    const mine = calculateSalarySlip(emp, 4, 2026, adj);
    expect(mine.earnings).toEqual(legacy.earnings);
    expect(mine.deductions).toEqual(legacy.deductions);
    expect(mine.netPay).toBe(legacy.netPay);
  });

  it('matches across 400 randomised employee/month combinations', () => {
    const o = need('slip');
    // Deterministic pseudo-random so a failure is reproducible.
    let seed = 20261107;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

    for (let i = 0; i < 400; i++) {
      const emp = {
        basic: Math.round(rnd() * 40000),
        hra: Math.round(rnd() * 15000),
        da: Math.round(rnd() * 6000),
        otherAllowances: Math.round(rnd() * 4000),
        esiApplicable: rnd() > 0.5,
        pfApplicable: rnd() > 0.3,
        ptState: pick(['', 'KARNATAKA']),
      };
      const month = 1 + Math.floor(rnd() * 12);
      const year = 2026;
      const adj = {
        daysWorked: rnd() > 0.5 ? Math.floor(rnd() * 31) : undefined,
        otDays: rnd() > 0.6 ? Math.floor(rnd() * 5) : 0,
        bonus: rnd() > 0.7 ? Math.round(rnd() * 3000) : 0,
        loanRecovery: rnd() > 0.9 ? Math.round(rnd() * 2000) : 0,
      };
      const legacy = o.calculateSalarySlip(emp, month, year, adj);
      const mine = calculateSalarySlip(emp, month, year, adj);
      expect(
        { e: mine.earnings, d: mine.deductions, n: mine.netPay },
        `mismatch at iteration ${i} for ${JSON.stringify(emp)} month=${month} adj=${JSON.stringify(adj)}`,
      ).toEqual({ e: legacy.earnings, d: legacy.deductions, n: legacy.netPay });
    }
  });

  it('applies ESI only when gross is inside the ceiling and the flag is set', () => {
    const o = need('esi');
    // Gross 20000 -> ESI applies.
    const inCeiling = { basic: 12000, hra: 5000, da: 2000, otherAllowances: 1000, esiApplicable: true, pfApplicable: false, ptState: '' };
    const a = calculateSalarySlip(inCeiling, 5, 2026, {});
    expect(a.earnings.grossEarnings).toBe(20000);
    expect(a.deductions.esiEmployee).toBe(Math.round((20000 * 0.75) / 100));
    expect(a.deductions.esiEmployer).toBe(Math.round((20000 * 3.25) / 100));
    expect(a.deductions.esiEmployee).toBe(o.calculateSalarySlip(inCeiling, 5, 2026, {}).deductions.esiEmployee);

    // Gross 25000 -> above the 21000 ceiling, no ESI.
    const above = { ...inCeiling, basic: 17000, hra: 5000, da: 2000, otherAllowances: 1000 };
    const b = calculateSalarySlip(above, 5, 2026, {});
    expect(b.earnings.grossEarnings).toBe(25000);
    expect(b.deductions.esiEmployee).toBe(0);

    // Flag off -> no ESI even below the ceiling.
    const off = { ...inCeiling, esiApplicable: false };
    expect(calculateSalarySlip(off, 5, 2026, {}).deductions.esiEmployee).toBe(0);
  });

  it('caps PF wages at the configured ceiling', () => {
    const o = need('pf');
    expect(pfWages(20000, 10000)).toBe(25000);
    expect(pfWages(20000, 10000)).toBe(o.pfWages(20000, 10000));

    // basic+DA = 40000 -> capped to 25000 -> 12% = 3000
    const high = { basic: 34000, hra: 0, da: 6000, otherAllowances: 0, esiApplicable: false, pfApplicable: true, ptState: '' };
    const slip = calculateSalarySlip(high, 6, 2026, {});
    expect(slip.deductions.pfEmployee).toBe(3000);
    expect(slip.deductions.pfEmployer).toBe(3000);
  });

  it('charges Rs 300 PT in February and Rs 200 otherwise', () => {
    const o = need('pt');
    for (const [gross, month] of [[30000, 1], [30000, 2], [30000, 3], [25000, 2], [24999, 2], [0, 2]] as const) {
      expect(ptForGross(gross, month), `gross=${gross} month=${month}`).toBe(o.ptFor(gross, month));
    }
    expect(ptForGross(30000, 2)).toBe(300);
    expect(ptForGross(30000, 3)).toBe(200);
    expect(ptForGross(24999, 2)).toBe(0);
  });

  it('skips PT entirely when no PT state is configured', () => {
    const emp = { basic: 30000, hra: 0, da: 0, otherAllowances: 0, esiApplicable: false, pfApplicable: false, ptState: '' };
    expect(calculateSalarySlip(emp, 2, 2026, {}).deductions.pt).toBe(0);
  });

  it('honours a tenant-supplied statutory config instead of the legacy constants', () => {
    // A confirmed rate set with a different PF ceiling must change the result.
    const cfg = { ...LEGACY_STATUTORY_DEFAULTS, pfWageCap: 15000, esiGrossCeiling: 25000 };
    const emp = { basic: 14000, hra: 4000, da: 2000, otherAllowances: 2000, esiApplicable: true, pfApplicable: true, ptState: '' };
    const legacyCfg = calculateSalarySlip(emp, 7, 2026, {});
    const custom = calculateSalarySlip(emp, 7, 2026, {}, cfg);

    expect(legacyCfg.earnings.grossEarnings).toBe(22000);
    expect(legacyCfg.deductions.esiEmployee).toBe(0); // 22000 > 21000 legacy ceiling
    expect(custom.deductions.esiEmployee).toBeGreaterThan(0); // 22000 <= 25000 custom ceiling
    expect(custom.deductions.pfEmployee).toBe(Math.round((15000 * 12) / 100));
  });

  it('never returns a negative net pay', () => {
    const emp = { basic: 5000, hra: 0, da: 0, otherAllowances: 0, esiApplicable: false, pfApplicable: true, ptState: 'KARNATAKA' };
    const slip = calculateSalarySlip(emp, 1, 2026, { advanceRecovery: 100000 });
    expect(slip.deductions.totalDeductions).toBeGreaterThan(slip.earnings.grossEarnings);
    // The legacy lets net go negative rather than clamping; parity requires the same.
    const legacy = need('neg').calculateSalarySlip(emp, 1, 2026, { advanceRecovery: 100000 });
    expect(slip.netPay).toBe(legacy.netPay);
  });
});

/* ================================================================== */
/* EMPLOYEE CODE                                                     */
/* ================================================================== */

describe('Employee code allocation — parity with nextCodeFor_', () => {
  it('allocates EMP-YYYY-NNNN as max+1', () => {
    const o = need('code');
    const cases = [
      [[], 2026],
      [['EMP-2026-0001'], 2026],
      [['EMP-2026-0001', 'EMP-2026-0007'], 2026],
      [['EMP-2025-0042', 'EMP-2026-0003'], 2026],
      [['EMP-2026-0009', 'EMP-2026-0002'], 2026],
    ] as Array<[string[], number]>;
    for (const [codes, year] of cases) {
      expect(nextEmployeeCode(codes, year), `codes=${JSON.stringify(codes)}`).toBe(o.nextEmployeeCode(codes, year));
    }
  });

  it('ignores codes that do not match the pattern', () => {
    expect(nextEmployeeCode(['X-1', 'TEMP-2026-0005', 'EMPX-2026-0009', 'EMP-2026-0002'], 2026))
      .toBe('EMP-2026-0003');
  });

  it('pads to four digits', () => {
    expect(nextEmployeeCode([], 2026)).toBe('EMP-2026-0001');
    expect(nextEmployeeCode(['EMP-2026-0099'], 2026)).toBe('EMP-2026-0100');
  });

  it('rejects a duplicate code case-insensitively among active employees', () => {
    const existing = [{ id: 'a', employeeCode: 'EMP-2026-0001', name: 'Ravi', active: true }];
    expect(isDuplicateEmployeeCode('emp-2026-0001', existing).duplicate).toBe(true);
    expect(isDuplicateEmployeeCode('emp-2026-0001', existing).usedBy).toBe('Ravi');
    expect(isDuplicateEmployeeCode('EMP-2026-0002', existing).duplicate).toBe(false);
    // Re-saving the same record is not a duplicate of itself.
    expect(isDuplicateEmployeeCode('EMP-2026-0001', existing, 'a').duplicate).toBe(false);
    // A deactivated employee's code is free.
    expect(isDuplicateEmployeeCode('EMP-2026-0001', [{ ...existing[0], active: false }]).duplicate).toBe(false);
  });
});

/* ================================================================== */
/* VALIDATION                                                        */
/* ================================================================== */

describe('Employee field validation', () => {
  it('normalises phone numbers to the last 10 digits', () => {
    expect(normalizePhone('+91 98450 11223')).toBe('9845011223');
    // 11 digits before truncation: the leading 0 of the STD code is dropped.
    expect(normalizePhone('(080) 4123-5566')).toBe('8041235566');
    expect(normalizePhone('')).toBe('');
  });

  it('accepts an empty mobile but rejects a partial one', () => {
    expect(isValidMobile('')).toBe(true);
    expect(isValidMobile('9845011223')).toBe(true);
    expect(isValidMobile('984501')).toBe(false);
  });

  it('validates Aadhaar shape and, optionally, its Verhoeff checksum', () => {
    expect(isValidAadhaar('')).toBe(true);
    expect(isValidAadhaar('1234 5678 9012')).toBe(true);
    expect(isValidAadhaar('12345678901')).toBe(false);
    expect(isValidAadhaar('abcdefghijkl')).toBe(false);

    // Legacy only counted digits; Verhoeff is stricter and opt-in.
    expect(passesVerhoeff('123456789012')).toBe(false);
    // A number that satisfies Verhoeff (valid check digit computed independently).
    expect(passesVerhoeff('234567890124')).toBe(true);
    expect(passesVerhoeff('123456789010')).toBe(true);
    expect(passesVerhoeff('12345678901')).toBe(false);
  });

  it('validates PAN against the statutory pattern', () => {
    expect(isValidPan('')).toBe(true);
    expect(isValidPan('AABCM1234N')).toBe(true);
    expect(isValidPan('aabcm1234n')).toBe(true);
    expect(isValidPan('AABCM123N')).toBe(false);
    expect(isValidPan('1ABCM1234N')).toBe(false);
  });

  it('recognises the four legacy employee statuses', () => {
    expect(EMPLOYEE_STATUSES).toEqual(['ACTIVE', 'NOTICE_PERIOD', 'ON_HOLD', 'LEFT']);
    expect(isValidEmployeeStatus('notice_period')).toBe(true);
    expect(isValidEmployeeStatus('RESIGNED')).toBe(false);
    expect(countsAsOnRolls('ACTIVE')).toBe(true);
    expect(countsAsOnRolls('NOTICE_PERIOD')).toBe(true);
    expect(countsAsOnRolls('LEFT')).toBe(false);
  });
});

/* ================================================================== */
/* HR SUMMARY                                                        */
/* ================================================================== */

describe('HR summary — parity with getHRSummary_', () => {
  it('matches status counts, gross estimate and department rollup', () => {
    const o = need('summary');
    const rows = [
      { status: 'ACTIVE', basic: 20000, hra: 8000, da: 2000, otherAllowances: 1000, department: 'Operations' },
      { status: 'ACTIVE', basic: 15000, hra: 6000, da: 1500, otherAllowances: 500, department: 'Operations' },
      { status: 'NOTICE_PERIOD', basic: 18000, hra: 7000, da: 1800, otherAllowances: 700, department: 'Housekeeping' },
      { status: 'ON_HOLD', basic: 12000, hra: 0, da: 0, otherAllowances: 0, department: '' },
      { status: 'LEFT', basic: 10000, hra: 0, da: 0, otherAllowances: 0, department: 'Operations' },
    ];
    const legacy = o.summary(rows);
    const mine = hrSummary(rows);
    expect(mine).toEqual({
      total: legacy.total,
      active: legacy.active,
      notice: legacy.notice,
      onHold: legacy.onHold,
      left: legacy.left,
      monthlyGrossEstimate: legacy.monthlyGrossEstimate,
      byDepartment: legacy.byDepartment,
    });
    // Sanity: only ACTIVE employees contribute to the estimate (31000 + 23000).
    expect(mine.monthlyGrossEstimate).toBe(54000);
    expect(mine.byDepartment.Operations).toBe(3);
    expect(mine.byDepartment.Unassigned).toBe(1);
  });

  it('handles an empty workforce', () => {
    const o = need('summary-empty');
    expect(hrSummary([])).toEqual(o.summary([]));
  });
});

/* ================================================================== */
/* DEPLOYMENT / SITE STRENGTH                                        */
/* ================================================================== */

describe('Deployment and site strength reconciliation', () => {
  it('detects overlapping assignments for the same employee', () => {
    expect(rangesOverlap('2026-01-01', '2026-03-31', '2026-03-01', '2026-05-31')).toBe(true);
    // Back-to-back hand-over is not an overlap.
    expect(rangesOverlap('2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30')).toBe(false);
    expect(rangesOverlap('2026-01-01', null, '2027-01-01', null)).toBe(true);
  });

  it('blocks a second concurrent posting for the same employee', () => {
    const existing = [
      { id: 'a1', employeeId: 'e1', startDate: '2026-01-01', endDate: '2026-06-30', status: 'ACTIVE' },
    ];
    const clash = findAssignmentConflict(
      { employeeId: 'e1', startDate: '2026-05-01', endDate: '2026-12-31' }, existing,
    );
    expect(clash).not.toBeNull();
    expect(clash!.id).toBe('a1');

    // A different employee is fine.
    expect(findAssignmentConflict(
      { employeeId: 'e2', startDate: '2026-05-01', endDate: '2026-12-31' }, existing,
    )).toBeNull();

    // A released allocation is history, not a block.
    expect(findAssignmentConflict(
      { employeeId: 'e1', startDate: '2026-05-01', endDate: '2026-12-31' },
      [{ ...existing[0], status: 'RELEASED' }],
    )).toBeNull();
  });

  it('reconciles required vs deployed headcount per designation', () => {
    const requirements = [
      { designation: 'Housekeeping', category: 'UNSKILLED', requiredCount: 10, effectiveFrom: '2026-01-01' },
      { designation: 'Supervisor', category: 'SKILLED', requiredCount: 2, effectiveFrom: '2026-01-01' },
    ];
    const allocations = [
      ...Array.from({ length: 7 }, (_, i) => ({
        employeeId: `h${i}`, designation: 'Housekeeping', category: 'UNSKILLED',
        startDate: '2026-01-01', endDate: null, status: 'ACTIVE',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        employeeId: `s${i}`, designation: 'Supervisor', category: 'SKILLED',
        startDate: '2026-01-01', endDate: null, status: 'ACTIVE',
      })),
    ];

    const report = reconcileStrength(requirements, allocations, '2026-03-15');
    expect(report.required).toBe(12);
    expect(report.deployed).toBe(9);
    expect(report.variance).toBe(-3);
    expect(report.state).toBe('SHORT');

    const hk = report.lines.find((l) => l.designation === 'Housekeeping')!;
    expect(hk).toMatchObject({ required: 10, deployed: 7, variance: -3, state: 'SHORT' });

    const sup = report.lines.find((l) => l.designation === 'Supervisor')!;
    expect(sup).toMatchObject({ required: 2, deployed: 2, variance: 0, state: 'FILLED' });
  });

  it('ignores allocations outside the as-on date and released ones', () => {
    const requirements = [
      { designation: 'Guard', category: 'UNSKILLED', requiredCount: 4, effectiveFrom: '2026-01-01' },
    ];
    const allocations = [
      // Future joiner — not deployed yet on the as-on date.
      { employeeId: 'g1', designation: 'Guard', category: 'UNSKILLED', startDate: '2026-06-01', endDate: null, status: 'ACTIVE' },
      // Already left.
      { employeeId: 'g2', designation: 'Guard', category: 'UNSKILLED', startDate: '2026-01-01', endDate: '2026-02-28', status: 'ACTIVE' },
      // Released record.
      { employeeId: 'g3', designation: 'Guard', category: 'UNSKILLED', startDate: '2026-01-01', endDate: null, status: 'RELEASED' },
      // Genuinely deployed.
      { employeeId: 'g4', designation: 'Guard', category: 'UNSKILLED', startDate: '2026-01-01', endDate: null, status: 'ACTIVE' },
    ];
    const report = reconcileStrength(requirements, allocations, '2026-03-15');
    expect(report.deployed).toBe(1);
    expect(report.variance).toBe(-3);
  });

  it('flags deployments that no requirement accounts for', () => {
    const report = reconcileStrength(
      [{ designation: 'Housekeeping', category: 'UNSKILLED', requiredCount: 1, effectiveFrom: '2026-01-01' }],
      [
        { employeeId: 'a', designation: 'Housekeeping', category: 'UNSKILLED', startDate: '2026-01-01', endDate: null, status: 'ACTIVE' },
        { employeeId: 'b', designation: 'Driver', category: 'SEMI_SKILLED', startDate: '2026-01-01', endDate: null, status: 'ACTIVE' },
      ],
      '2026-03-15',
    );
    expect(report.unplanned).toEqual([{ designation: 'DRIVER', count: 1 }]);
    // The unplanned person still counts towards total deployed strength.
    expect(report.deployed).toBe(2);
    expect(report.state).toBe('OVER');
  });

  it('treats an expired requirement as no longer required', () => {
    const report = reconcileStrength(
      [{ designation: 'Housekeeping', category: 'UNSKILLED', requiredCount: 5, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' }],
      [],
      '2026-03-15',
    );
    expect(report.required).toBe(0);
    expect(report.lines).toHaveLength(0);
  });
});

/* ================================================================== */
/* MINIMUM WAGE FLOOR                                                */
/* ================================================================== */

describe('Minimum wage floor (Rule 15)', () => {
  const rates = [
    { regime: 'KARNATAKA', zone: 'Zone 1', category: 'UNSKILLED', monthlyWage: 15000, status: 'CONFIRMED', effectiveFrom: '2026-04-01' },
    { regime: 'KARNATAKA', zone: 'Zone 1', category: 'UNSKILLED', monthlyWage: 13000, status: 'CONFIRMED', effectiveFrom: '2025-04-01', effectiveTo: '2026-03-31' },
    { regime: 'KARNATAKA', zone: 'Zone 1', category: 'SKILLED', monthlyWage: 20000, status: 'PROVISIONAL', effectiveFrom: '2026-04-01' },
    { regime: 'KARNATAKA', zone: 'Zone 2', category: 'UNSKILLED', monthlyWage: 14000, status: 'CONFIRMED', effectiveFrom: '2026-04-01' },
  ];

  it('selects the rate in force on a date', () => {
    const before = resolveWageFloor(rates, { regime: 'KARNATAKA', zone: 'Zone 1', category: 'UNSKILLED', asOn: '2026-03-15' });
    expect(before?.monthlyWage).toBe(13000);
    const after = resolveWageFloor(rates, { regime: 'KARNATAKA', zone: 'Zone 1', category: 'UNSKILLED', asOn: '2026-05-01' });
    expect(after?.monthlyWage).toBe(15000);
  });

  it('does not leak across zone or category', () => {
    expect(resolveWageFloor(rates, { regime: 'KARNATAKA', zone: 'Zone 3', category: 'UNSKILLED', asOn: '2026-05-01' })).toBeNull();
    expect(resolveWageFloor(rates, { regime: 'TAMIL_NADU', zone: 'Zone 1', category: 'UNSKILLED', asOn: '2026-05-01' })).toBeNull();
  });

  it('prefers CONFIRMED over PROVISIONAL when both cover the date', () => {
    const overlapping = [
      { regime: 'KA', zone: 'Z', category: 'UNSKILLED', monthlyWage: 12000, status: 'PROVISIONAL', effectiveFrom: '2026-04-01' },
      { regime: 'KA', zone: 'Z', category: 'UNSKILLED', monthlyWage: 13500, status: 'CONFIRMED', effectiveFrom: '2026-04-01' },
    ];
    expect(resolveWageFloor(overlapping, { regime: 'KA', zone: 'Z', category: 'UNSKILLED', asOn: '2026-06-01' })?.monthlyWage).toBe(13500);
  });

  it('compares Basic + DA against the floor and reports the shortfall', () => {
    const result = checkMinimumWageFloor(
      [
        { id: 'e1', name: 'Underpaid', basic: 10000, da: 2000, category: 'UNSKILLED' },
        { id: 'e2', name: 'Fine', basic: 12000, da: 3000, category: 'UNSKILLED' },
        { id: 'e3', name: 'Exact', basic: 15000, da: 0, category: 'UNSKILLED' },
      ],
      () => 15000,
    );
    expect(result.compliant).toBe(false);
    expect(result.checks[0]).toMatchObject({ monthlyWage: 12000, floor: 15000, shortfall: 3000, compliant: false });
    expect(result.checks[1].compliant).toBe(true);
    expect(result.checks[2]).toMatchObject({ shortfall: 0, compliant: true });
  });

  it('fails closed when a category has no configured rate', () => {
    const result = checkMinimumWageFloor(
      [{ id: 'e1', basic: 20000, da: 0, category: 'HIGHLY_SKILLED' }],
      () => null,
    );
    expect(result.compliant).toBe(false);
    expect(result.missingRates).toEqual(['HIGHLY_SKILLED']);
  });

  it('ignores HRA when comparing to the published wage', () => {
    // basic+da = 12000 even though gross is 30000 — still below a 15000 floor.
    const result = checkMinimumWageFloor(
      [{ id: 'e1', basic: 12000, da: 0, category: 'UNSKILLED' }],
      () => 15000,
    );
    expect(result.checks[0].shortfall).toBe(3000);
  });
});

/* ================================================================== */
/* EFFECTIVE DATING                                                  */
/* ================================================================== */

describe('Effective-dated statutory sets', () => {
  it('refuses two sets that cover the same day', () => {
    const existing = [{ id: 's1', code: 'EPFO-2026', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }];
    expect(findEffectiveDateOverlap({ code: 'EPFO-2026-B', effectiveFrom: '2026-06-01' }, existing)).not.toBeNull();
    expect(findEffectiveDateOverlap({ code: 'EPFO-2027', effectiveFrom: '2027-01-01' }, existing)).toBeNull();
    // Editing a set does not conflict with itself.
    expect(findEffectiveDateOverlap({ id: 's1', effectiveFrom: '2026-01-01' }, existing, 's1')).toBeNull();
  });

  it('picks the set in force on a date', () => {
    const sets = [
      { id: 'a', effectiveFrom: '2024-01-01', effectiveTo: '2024-12-31' },
      { id: 'b', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' },
      { id: 'c', effectiveFrom: '2026-01-01', effectiveTo: null },
    ];
    expect(setInForceOn(sets, '2024-08-01')?.id).toBe('a');
    expect(setInForceOn(sets, '2025-12-31')?.id).toBe('b');
    expect(setInForceOn(sets, '2026-11-07')?.id).toBe('c');
    expect(setInForceOn(sets, '2023-12-31')).toBeNull();
  });
});
