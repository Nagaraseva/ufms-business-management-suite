/**
 * Wage engine — differential parity against the legacy implementation.
 *
 * Phase 2 exit criterion: "Quotation totals reproduce legacy figures on
 * fixture data." This file proves it the hard way: it runs the *real* legacy
 * `salaryBreakupCalc_()` lifted from Quotations.gs side by side with the new
 * TypeScript engine over a randomised matrix of inputs plus targeted edge
 * cases, and asserts every money field matches to the paisa.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  calculateBreakup,
  computeQuotationTotals,
  normaliseOptions,
  type BreakupOptions,
  type BreakupSettings,
  type WageColumnInput,
  type FeeSpec,
} from '@ufms/shared/payroll/wage-engine';

const require = createRequire(import.meta.url);
const { buildOracle, oracleAvailable } = require('./legacy-oracle.mjs') as {
  buildOracle: () => { calc: (b: any, m: number, f: any) => any; opts: (s: any) => any };
  oracleAvailable: () => boolean;
};

const HAS_LEGACY = oracleAvailable();
/** Built once — buildOracle() parses the .gs source, so never call it per-case. */
const ORACLE = HAS_LEGACY ? buildOracle() : null;

const baseSettings: BreakupSettings = {
  applyBonus: true,
  applyLeaveWages: true,
  applyEsi: true,
  applyInsurance: false,
  applyPf: true,
  applyPt: true,
  applyGratuity: false,
  ptOnGross: false,
  ptAmount: 200,
  ptThreshold: 15000,
  esiCap: 21000,
  pfCap: 15000,
};

const baseColumn: WageColumnInput = {
  name: 'Security Guard',
  headcount: 1,
  basic: 12000,
  vda: 3000,
  hra: 2000,
  special: 1000,
  washing: 300,
  conveyance: 800,
  other: 0,
  extra4: 0,
  uniform: 0,
  uniformEmployee: 0,
  compliance: 0,
  lwfYear: 0,
  lwfDedYear: 0,
  groupInsurance: 0,
};

/**
 * Convert a SQL-friendly column into the shape the legacy object expects.
 * The legacy code reads every field directly off the record.
 */
function legacyColumn(c: WageColumnInput, opts: Partial<BreakupOptions>) {
  return {
    name: c.name,
    headcount: String(c.headcount),
    basic: c.basic, vda: c.vda, hra: c.hra, special: c.special,
    washing: c.washing, conveyance: c.conveyance, other: c.other,
    extra4: c.extra4, uniform: c.uniform, uniformEmployee: c.uniformEmployee,
    compliance: c.compliance, lwfYear: c.lwfYear, lwfDedYear: c.lwfDedYear,
    groupInsurance: c.groupInsurance,
    xa1: (c as any).xa1 ?? 0, xa2: (c as any).xa2 ?? 0, xa3: (c as any).xa3 ?? 0,
  };
}

const MONEY_FIELDS = [
  'st1', 'st2', 'bonus', 'leaveWages', 'gross',
  'esiEmployer', 'esiEmployee', 'pfEmployer', 'pfEmployee',
  'gratuity', 'st3', 'lwfMonth', 'ctc', 'totalBilling', 'otRate',
  'lwfDedMonth', 'takeHomeBeforePt', 'ptDed', 'totalDed', 'takeHome',
  'nfh', 'grossPay', 'bonusYear', 'reliever', 'dayRate', 'hourRate',
] as const;

function runLegacy(cols: WageColumnInput[], settings: BreakupSettings, options: Partial<BreakupOptions>, fee: FeeSpec | null, stringHeadcount = true) {
  const breakup: any = {
    ...settings,
    cols: cols.map((c) => legacyColumn(c, options)),
    ...options,
    // Legacy Sheet data usually arrives as text; keep both modes available.
    ...(stringHeadcount ? {} : {}),
  };
  if (!stringHeadcount) breakup.cols.forEach((c: any) => { c.headcount = Number(c.headcount); });
  return ORACLE!.calc(breakup, 0, fee);
}

function runNew(cols: WageColumnInput[], settings: BreakupSettings, options: Partial<BreakupOptions>, fee: FeeSpec | null) {
  return calculateBreakup({ cols, settings, options, fee });
}

describe.skipIf(!HAS_LEGACY)('Wage engine parity with legacy v5.6.61', () => {
  beforeAll(() => {
    expect(HAS_LEGACY).toBe(true);
  });

  it('matches on the default configuration (all option ticks OFF)', () => {
    const L = runLegacy([baseColumn], baseSettings, {}, null);
    const N = runNew([baseColumn], baseSettings, {}, null);
    for (const f of MONEY_FIELDS) {
      expect(N.cols[0][f as keyof typeof N.cols[0]], `field ${f}`).toBeCloseTo(L.cols[0][f], 6);
    }
  });

  it('matches when every option tick is ON', () => {
    const opts: Partial<BreakupOptions> = {
      applyNfh: true, applyLwfKa: true, ptAverage: true, applyCodeWage: true,
      esiOnGross: true, pfNoCap: true, extra4Ot: true, applyReliever: true,
      pfSplit: true, bonusYearly: true, roundRupee: true, showDayRate: true,
      nfhDays: 12, lwfEr: 100, lwfEe: 50, bonusRate: 10, relieverDiv: 6,
      customAllow: [
        { id: 'xa1', name: 'Site allowance', pf: true, esi: true },
        { id: 'xa2', name: 'Fuel', pf: false, esi: true },
      ],
    };
    const col = { ...baseColumn, xa1: 1500, xa2: 700, headcount: 7, gratuity: 0 } as WageColumnInput & { xa1: number; xa2: number };
    const settings = { ...baseSettings, applyGratuity: true };
    const L = runLegacy([col], settings, opts, null);
    const N = runNew([col], settings, opts, null);
    for (const f of MONEY_FIELDS) {
      expect(N.cols[0][f as keyof typeof N.cols[0]], `field ${f}`).toBeCloseTo(L.cols[0][f], 6);
    }
  });

  it('matches the ESI / Group-Insurance decision table in all four combinations', () => {
    const cases = [
      { applyEsi: false, applyInsurance: true },
      { applyEsi: false, applyInsurance: false },
      { applyEsi: true, applyInsurance: true },
      { applyEsi: true, applyInsurance: false },
    ];
    for (const c of cases) {
      const settings = { ...baseSettings, ...c };
      const col = { ...baseColumn, groupInsurance: 450 };
      const L = runLegacy([col], settings, {}, null);
      const N = runNew([col], settings, {}, null);
      expect(N.cols[0].esiEmployer, `esiEmployer ${JSON.stringify(c)}`).toBeCloseTo(L.cols[0].esiEmployer, 6);
      expect(N.cols[0].esiEmployee, `esiEmployee ${JSON.stringify(c)}`).toBeCloseTo(L.cols[0].esiEmployee, 6);
      expect(N.cols[0].esiSkipped).toBe(L.cols[0].esiSkipped);
    }
  });

  it('matches the Professional Tax on-gross vs take-home branches', () => {
    for (const ptOnGross of [true, false]) {
      for (const wage of [14000, 18000, 30000]) {
        const settings = { ...baseSettings, ptOnGross, applyGratuity: false };
        const col = { ...baseColumn, basic: wage - 4000, vda: 2000, hra: 2000 };
        const L = runLegacy([col], settings, {}, null);
        const N = runNew([col], settings, {}, null);
        expect(N.cols[0].ptDed, `pt ptOnGross=${ptOnGross} wage=${wage}`).toBeCloseTo(L.cols[0].ptDed, 6);
        expect(N.cols[0].takeHome).toBeCloseTo(L.cols[0].takeHome, 6);
      }
    }
  });

  it('matches the Labour Code 50% wage floor branch', () => {
    const settings = { ...baseSettings, applyGratuity: true };
    // deliberately lopsided: basic+vda far below half of sub total II
    const col = { ...baseColumn, basic: 5000, vda: 1000, hra: 9000, special: 5000 };
    for (const applyCodeWage of [true, false]) {
      const opts = { applyCodeWage };
      const L = runLegacy([col], settings, opts, null);
      const N = runNew([col], settings, opts, null);
      expect(N.cols[0].codeHit, `codeHit applyCodeWage=${applyCodeWage}`).toBe(L.cols[0].codeHit);
      for (const f of ['bonus', 'leaveWages', 'gratuity', 'ctc', 'takeHome'] as const) {
        expect(N.cols[0][f], `${f}`).toBeCloseTo(L.cols[0][f], 6);
      }
    }
  });

  it('matches every management-fee mode', () => {
    const rows: WageColumnInput[] = [
      { ...baseColumn, name: 'Guard', headcount: 10, basic: 14000, vda: 3000 },
      { ...baseColumn, name: 'Supervisor', headcount: 2, basic: 22000, vda: 4000 },
    ];
    const modes: FeeSpec['mode'][] = ['PERCENTAGE', 'LUMPSUM', 'BASIC_VDA_PCT', 'ST2_PCT', 'CTC_PCT'];
    for (const mode of modes) {
      const fee: FeeSpec = { state: 'OK', mode, value: 10, amount: 25000, label: mode };
      const L = runLegacy(rows, baseSettings, {}, fee);
      const N = runNew(rows, baseSettings, {}, fee);
      for (let i = 0; i < rows.length; i++) {
        expect(N.cols[i].mgmtFee, `${mode} row ${i} mgmtFee`).toBeCloseTo(L.cols[i].mgmtFee, 6);
        expect(N.cols[i].totalCtc, `${mode} row ${i} totalCtc`).toBeCloseTo(L.cols[i].totalCtc, 6);
      }
      expect(N.mgmtFeeTotal).toBeCloseTo(L.mgmtFeeTotal, 6);
      expect(N.totals.billing).toBeCloseTo(L.totals.billing, 6);
      expect(N.totals.takeHome).toBeCloseTo(L.totals.takeHome, 6);
      // DOCUMENTED DEVIATION (see docs/business-rules-and-calculations.md §5):
      // when headcount arrives as text (as it does from Google Sheets), the legacy
      // `reduce((sum,c) => sum + c.headcount)` STRING-CONCATENATES and returns e.g.
      // "0102" instead of 12. The new engine always returns a number. Compare
      // against the legacy numeric intent, not the defective value.
      const legacyNumeric = (L.cols as any[]).reduce((s, c) => s + Number(c.headcount), 0);
      expect(N.totals.headcount).toBe(legacyNumeric);
    }
  });

  it('matches the legacy fee=null contract (management fee never enters CTC)', () => {
    const L = runLegacy([baseColumn], baseSettings, {}, null);
    const N = runNew([baseColumn], baseSettings, {}, null);
    expect(N.cols[0].mgmtFee).toBe(0);
    expect(N.cols[0].totalCtc).toBe(N.cols[0].ctc);
    expect(N.mgmtFeeTotal).toBe(0);
    expect(L.cols[0].mgmtFee).toBe(0);
    expect(L.cols[0].totalCtc).toBeCloseTo(L.cols[0].ctc, 6);
  });

  it('matches across 400 randomised breakups', () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 123456789;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
    const money = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));

    let checked = 0;
    for (let iter = 0; iter < 400; iter++) {
      const cols: WageColumnInput[] = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({
        name: `Row${i}`,
        headcount: 1 + Math.floor(rnd() * 20),
        basic: money(6000, 30000),
        vda: money(0, 6000),
        hra: money(0, 8000),
        special: money(0, 8000),
        washing: money(0, 600),
        conveyance: money(0, 1600),
        other: money(0, 2000),
        extra4: rnd() > 0.8 ? money(0, 1500) : 0,
        uniform: rnd() > 0.5 ? money(0, 400) : 0,
        uniformEmployee: rnd() > 0.5 ? money(0, 200) : 0,
        compliance: money(0, 500),
        lwfYear: money(0, 300),
        lwfDedYear: money(0, 200),
        groupInsurance: rnd() > 0.6 ? money(0, 800) : 0,
        xa1: rnd() > 0.5 ? money(0, 2000) : 0,
      }) as WageColumnInput);

      const options: Partial<BreakupOptions> = {
        applyNfh: rnd() > 0.5, applyLwfKa: rnd() > 0.5, ptAverage: rnd() > 0.7,
        applyCodeWage: rnd() > 0.5, esiOnGross: rnd() > 0.6, pfNoCap: rnd() > 0.7,
        extra4Ot: rnd() > 0.7, applyReliever: rnd() > 0.5, pfSplit: rnd() > 0.5,
        bonusYearly: rnd() > 0.6, roundRupee: rnd() > 0.5, showDayRate: false,
        nfhDays: 1 + Math.floor(rnd() * 20),
        bonusRate: pick([8.33, 8.33, 10, 12, 15, 20]),
        relieverDiv: pick([4, 5, 6, 7]),
        customAllow: rnd() > 0.5
          ? [{ id: 'xa1' as const, name: 'Site', pf: rnd() > 0.5, esi: rnd() > 0.5 }]
          : [],
      };

      const settings: BreakupSettings = {
        applyBonus: rnd() > 0.15,
        applyLeaveWages: rnd() > 0.15,
        applyEsi: rnd() > 0.3,
        applyInsurance: rnd() > 0.6,
        applyPf: rnd() > 0.15,
        applyPt: rnd() > 0.3,
        applyGratuity: rnd() > 0.6,
        ptOnGross: rnd() > 0.5,
        ptAmount: pick([0, 200, 300]),
        ptThreshold: pick([10000, 15000, 20000]),
        esiCap: pick([21000, 25000]),
        pfCap: pick([15000, 25000]),
      };

      const fee: FeeSpec | null = rnd() > 0.5
        ? { state: 'OK', mode: pick(['PERCENTAGE', 'LUMPSUM', 'BASIC_VDA_PCT', 'ST2_PCT', 'CTC_PCT'] as FeeSpec['mode'][]), value: money(1, 25), amount: money(1000, 90000) }
        : null;

      const L = runLegacy(cols, settings, options, fee);
      const N = runNew(cols, settings, options, fee);

      for (let i = 0; i < cols.length; i++) {
        for (const f of MONEY_FIELDS) {
          const lv = L.cols[i][f];
          const nv = (N.cols[i] as any)[f];
          if (Math.abs(nv - lv) > 1e-6) {
            throw new Error(
              `Mismatch iter=${iter} col=${i} field=${f}: legacy=${lv} new=${nv}\n` +
              `options=${JSON.stringify(options)}\nsettings=${JSON.stringify(settings)}\ncol=${JSON.stringify(cols[i])}`,
            );
          }
        }
      }
      expect(N.totals.billing).toBeCloseTo(L.totals.billing, 6);
      expect(N.totals.takeHome).toBeCloseTo(L.totals.takeHome, 6);
      expect(N.mgmtFeeTotal).toBeCloseTo(L.mgmtFeeTotal, 6);
      checked++;
    }
    expect(checked).toBe(400);
  });
});

describe('Quotation totals (legacy Quotations.gs save path)', () => {
  it('computes subtotal, fee, tax and grand total with 2-dp rounding', () => {
    const t = computeQuotationTotals({
      lineItemAmounts: [100000, 25000.505, 4999.495],
      feeMode: 'PERCENTAGE',
      feeValue: 10,
      taxPercent: 18,
    });
    expect(t.subtotal).toBe(130000.0);
    expect(t.managementFee).toBe(13000);
    expect(t.amountBeforeTax).toBe(143000);
    expect(t.taxAmount).toBe(25740);
    expect(t.grandTotal).toBe(168740);
  });

  it('supports CTC-based fee using the wage engine basis', () => {
    const col = { ...baseColumn, headcount: 5 };
    const calc = calculateBreakup({ cols: [col], settings: baseSettings });
    const ctcPerHead = calc.cols[0].ctc;
    const t = computeQuotationTotals({
      lineItemAmounts: [ctcPerHead * 5],
      feeMode: 'CTC_PCT',
      feeValue: 8,
      taxPercent: 18,
      breakupBasis: { basicVda: 0, st2: 0, ctc: ctcPerHead * 5 },
    });
    expect(t.managementFee).toBeCloseTo((ctcPerHead * 5 * 8) / 100, 2);
  });

  it('mode NONE adds no fee', () => {
    const t = computeQuotationTotals({ lineItemAmounts: [1000], feeMode: 'NONE', feeValue: 99, taxPercent: 18 });
    expect(t.managementFee).toBe(0);
    expect(t.grandTotal).toBe(1180);
  });
});

describe('Option defaults preserve saved figures', () => {
  it('every tick is OFF except the two uniform switches, matching the release notes', () => {
    const o = normaliseOptions({});
    expect(o.applyNfh).toBe(false);
    expect(o.applyLwfKa).toBe(false);
    expect(o.ptAverage).toBe(false);
    expect(o.applyCodeWage).toBe(false);
    expect(o.esiOnGross).toBe(false);
    expect(o.pfNoCap).toBe(false);
    expect(o.extra4Ot).toBe(false);
    expect(o.applyReliever).toBe(false);
    expect(o.roundRupee).toBe(false);
    expect(o.nfhDays).toBe(10);
    expect(o.lwfEr).toBe(100);
    expect(o.lwfEe).toBe(50);
    expect(o.bonusRate).toBe(8.33);
    expect(o.relieverDiv).toBe(6);
  });

  it('uniform switches default to ON via the settings block (legacy "not false")', () => {
    // Absent => treated as ON, exactly like the legacy `!== false` check.
    const withDefaults = calculateBreakup({ cols: [{ ...baseColumn, uniform: 300 }], settings: baseSettings });
    expect(withDefaults.cols[0].uniformCo).toBe(300);

    // Explicitly false => the employer stops paying for uniform.
    const off = calculateBreakup({
      cols: [{ ...baseColumn, uniform: 300 }],
      settings: { ...baseSettings, applyUniformCompany: false },
    });
    expect(off.cols[0].uniformCo).toBe(0);
  });

  it('clamps out-of-range values exactly like the legacy engine', () => {
    const o = normaliseOptions({ nfhDays: 999 as any, bonusRate: 50 as any, relieverDiv: 1 as any, lwfEr: -5 as any });
    expect(o.nfhDays).toBe(31);
    expect(o.bonusRate).toBe(20);
    expect(o.relieverDiv).toBe(2);
    expect(o.lwfEr).toBe(0);
  });
});

/**
 * Regression guard for a defect found by differential testing.
 * Recorded in docs/business-rules-and-calculations.md §5.
 */
describe.skipIf(!HAS_LEGACY)('Legacy defect L-01: total headcount string concatenation', () => {
  it('legacy concatenates; the new engine sums numerically', () => {
    const rows: WageColumnInput[] = [
      { ...baseColumn, name: 'Guard', headcount: 10 },
      { ...baseColumn, name: 'Supervisor', headcount: 2 },
    ];
    const L = runLegacy(rows, baseSettings, {}, null, true);
    const N = runNew(rows, baseSettings, {}, null);

    // Legacy, with text headcounts, produces the string "0102".
    expect(typeof L.totals.headcount).toBe('string');
    expect(L.totals.headcount).toBe('0102');

    // New engine produces the correct number.
    expect(N.totals.headcount).toBe(12);

    // When legacy receives numeric headcounts it agrees with us.
    const Lnum = runLegacy(rows, baseSettings, {}, null, false);
    expect(N.totals.headcount).toBe(Lnum.totals.headcount);
  });
});
