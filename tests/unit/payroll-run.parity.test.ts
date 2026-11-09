/**
 * Phase 5 parity — payroll run engine vs HR.gs.
 *
 * The oracle lifts `summarizePayrollRun_`, `buildPfEcrText_`,
 * `buildBankTransferCsv_` and `escCsv_` out of the real v5.6.61 source and runs
 * them unchanged. Every rupee total must match exactly.
 *
 * Where the new code deliberately diverges, the divergence is asserted
 * explicitly rather than skipped — see the "documented divergences" block.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  summarizePayrollRun, buildPfEcrText, buildBankTransferCsv, ecrField, csvField,
} from '@ufms/shared/payroll/run-rules';
import { LEGACY_STATUTORY_DEFAULTS } from '@ufms/shared/hr/employee-rules';
import { buildPayrollOracle } from './legacy-oracle.mjs';

let oracle: any = null;

beforeAll(() => {
  try {
    oracle = buildPayrollOracle();
  } catch {
    oracle = null;
  }
});

/** Deterministic PRNG so a failure is always reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Split a CSV body into rows of raw cell text, honouring quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; i++;
    } else {
      cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const employeesFixture = [
  { EmployeeID: 'E-1', EmployeeName: 'Asha Rao', UANNo: '101234567890', IFSC: 'ICIC0000101', BankAccountNo: '000111222333' },
  { EmployeeID: 'E-2', EmployeeName: 'Bilal Khan', UANNo: '', IFSC: 'HDFC0000123', BankAccountNo: '999888777666' },
  { EmployeeID: 'E-3', EmployeeName: 'Chitra S', UANNo: '109876543210', IFSC: 'SBIN0004567', BankAccountNo: '555444333222' },
];

/**
 * Freeze the legacy figures into a table once, so the parity test compares the
 * same numbers the oracle produced at the time of migration. Regenerate with
 * LEGACY_PRINT=1 npx vitest run tests/unit/payroll-run.parity.test.ts
 */
const FROZEN = [
  { basic: 15000, da: 2000, gross: 23000, esi: 172, pf: 2040, pt: 200, net: 20588 },
  { basic: 25000, da: 0, gross: 32000, esi: 0, pf: 3000, pt: 200, net: 28800 },
  { basic: 30000, da: 5000, gross: 41000, esi: 0, pf: 0, pt: 200, net: 40800 },
  { basic: 9000, da: 500, gross: 12000, esi: 90, pf: 1140, pt: 0, net: 10770 },
  { basic: 12000, da: 0, gross: 14000, esi: 105, pf: 1440, pt: 200, net: 12255 },
];

describe('payroll run summary — parity with summarizePayrollRun_', () => {
  it('has the legacy source available', () => {
    expect(oracle).toBeTruthy();
  });

  it('matches the legacy totals for the frozen fixture set', () => {
    const items = FROZEN.map((f, i) => ({
      employeeId: `E-${i + 1}`,
      employeeName: `Employee ${i + 1}`,
      basic: f.basic,
      da: f.da,
      grossEarnings: f.gross,
      esiEmployee: f.esi,
      pfEmployee: f.pf,
      pt: f.pt,
      tds: 0,
      adjustmentAmount: 0,
      totalDeductions: f.esi + f.pf + f.pt,
      netPay: f.net,
    }));

    const legacy = oracle.summarize(items, employeesFixture);
    const ours = summarizePayrollRun(items, LEGACY_STATUTORY_DEFAULTS);

    expect(ours.count).toBe(legacy.count);
    expect(ours.gross).toBe(legacy.gross);
    expect(ours.esiEmployee).toBe(legacy.esiEmployee);
    expect(ours.esiEmployer).toBe(legacy.esiEmployer);
    expect(ours.pfEmployee).toBe(legacy.pfEmployee);
    expect(ours.pfEmployerEPF).toBe(legacy.pfEmployerEPF);
    expect(ours.pfEmployerEPS).toBe(legacy.pfEmployerEPS);
    expect(ours.pfEmployerEDLIS).toBe(legacy.pfEmployerEDLIS);
    expect(ours.pt).toBe(legacy.pt);
    expect(ours.tds).toBe(legacy.tds);
    expect(ours.totalDeductions).toBe(legacy.totalDeductions);
    expect(ours.net).toBe(legacy.net);
  });

  it('matches the legacy totals over 300 randomised runs', () => {
    const rand = rng(20261107);
    for (let run = 0; run < 300; run++) {
      const n = 1 + Math.floor(rand() * 8);
      const items = [];
      for (let i = 0; i < n; i++) {
        const basic = Math.round(rand() * 60000);
        const da = Math.round(rand() * 8000);
        const gross = basic + da + Math.round(rand() * 15000);
        const esi = rand() > 0.5 ? Math.round(gross * 0.0075) : 0;
        const pf = Math.round(Math.min(basic + da, 25000) * 0.12);
        const pt = rand() > 0.25 ? 200 : 0;
        items.push({
          employeeId: `E-${i}`,
          employeeName: `Employee ${i}`,
          basic, da, grossEarnings: gross,
          esiEmployee: esi, pfEmployee: pf, pt, tds: 0,
          adjustmentAmount: 0,
          totalDeductions: esi + pf + pt,
          netPay: gross - esi - pf - pt,
        });
      }
      const legacy = oracle.summarize(items, employeesFixture);
      const ours = summarizePayrollRun(items, LEGACY_STATUTORY_DEFAULTS);
      expect({
        count: ours.count, gross: ours.gross, esiEmployee: ours.esiEmployee,
        esiEmployer: ours.esiEmployer, pfEmployee: ours.pfEmployee,
        pfEmployerEPF: ours.pfEmployerEPF, pfEmployerEPS: ours.pfEmployerEPS,
        pfEmployerEDLIS: ours.pfEmployerEDLIS, pt: ours.pt, tds: ours.tds,
        totalDeductions: ours.totalDeductions, net: ours.net,
      }).toEqual(legacy);
    }
  });

  it('caps the PF wage base at the configured cap, not a baked-in 25000', () => {
    // Legacy hardcodes 25000 inside hrPfWages_. The new engine takes the cap
    // from the effective-dated statutory set, so a revised cap flows through
    // without a code change (Rule 15).
    const items = [{
      employeeId: 'E-1', employeeName: 'Cap Test',
      basic: 40000, da: 0, grossEarnings: 40000,
      esiEmployee: 0, pfEmployee: 4800, pt: 200, tds: 0,
      adjustmentAmount: 0, totalDeductions: 5000, netPay: 35000,
    }];
    const at25k = summarizePayrollRun(items, LEGACY_STATUTORY_DEFAULTS);
    const at15k = summarizePayrollRun(items, { ...LEGACY_STATUTORY_DEFAULTS, pfWageCap: 15000 });

    expect(at25k.pfEmployerEPF).toBe(3000);
    expect(at15k.pfEmployerEPF).toBe(1800);
    expect(at25k.pfEmployerEPF).not.toBe(at15k.pfEmployerEPF);
  });

  it('includes adjustments in the totals but never in the legacy non-legacy fields', () => {
    const items = [{
      employeeId: 'E-1', employeeName: 'Adj',
      basic: 10000, da: 0, grossEarnings: 10000,
      esiEmployee: 0, pfEmployee: 1200, pt: 0, tds: 0,
      adjustmentAmount: -500, totalDeductions: 1200, netPay: 8300,
    }];
    const legacy = oracle.summarize(items, employeesFixture);
    const ours = summarizePayrollRun(items, LEGACY_STATUTORY_DEFAULTS);
    expect(ours.net).toBe(legacy.net);
    expect(ours.adjustments).toBe(-500);
  });
});

describe('PF ECR text — parity with buildPfEcrText_', () => {
  const items = [
    { employeeId: 'E-1', employeeName: 'Asha Rao', basic: 15000, da: 2000, grossEarnings: 23000, pfEmployee: 2040 },
    { employeeId: 'E-2', employeeName: 'Bilal Khan', basic: 9000, da: 500, grossEarnings: 12000, pfEmployee: 1140 },
    { employeeId: 'E-3', employeeName: 'Chitra S', basic: 30000, da: 0, grossEarnings: 41000, pfEmployee: 0 },
  ];

  it('produces byte-identical output to the legacy generator', () => {
    const run = { Month: '11', Year: '2026' };
    const legacy = oracle.ecrText(run, items, employeesFixture);

    const ours = buildPfEcrText(items.map((it) => {
      const pfBase = Math.min(it.basic + it.da, LEGACY_STATUTORY_DEFAULTS.pfWageCap);
      return {
        uan: employeesFixture.find((e) => e.EmployeeID === it.employeeId)!.UANNo,
        name: it.employeeName,
        gross: it.grossEarnings,
        epfWages: pfBase,
        eps: Math.round((pfBase * 8.33) / 100),
        edlis: Math.round((pfBase * 0.5) / 100),
        epf: it.pfEmployee,
        ncpDays: 0,
        refundAdvances: 0,
      };
    }).filter((l) => l.uan));

    expect(ours).toBe(legacy);
  });

  it('skips employees with no UAN, exactly as the legacy generator does', () => {
    const run = { Month: '11', Year: '2026' };
    const legacy = oracle.ecrText(run, items, employeesFixture);
    const lines = legacy.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(legacy).not.toContain('Bilal');
  });

  it('uses CRLF line endings and a # delimiter', () => {
    const text = buildPfEcrText([{
      uan: '101234567890', name: 'Asha', gross: 23000, epfWages: 17000,
      eps: 1416, edlis: 85, epf: 2040, ncpDays: 0, refundAdvances: 0,
    }]);
    expect(text).toBe('101234567890#Asha#23000#17000#1416#85#2040#0#0');
    expect(text).not.toContain('\n');
  });

  it('DOCUMENTED DIVERGENCE: keeps commas in names (safe in a #-file), strips only structure', () => {
    // legacy escCsv_ replaces both '#' and ',' with a space, mangling
    // "Rao, Asha" into "Rao  Asha". A comma is not structural in a
    // '#-delimited file, so the new implementation preserves it.
    const legacy = oracle.escCsv('Rao, Asha');
    expect(legacy).toBe('Rao  Asha');
    expect(ecrField('Rao, Asha')).toBe('Rao, Asha');
    // Structural characters are still removed.
    expect(ecrField('Bad#Name\nNext')).toBe('Bad Name Next');
  });
});

describe('bank transfer CSV — parity with buildBankTransferCsv_', () => {
  const items = [
    { employeeId: 'E-1', employeeName: 'Asha Rao', netPay: 20588 },
    { employeeId: 'E-3', employeeName: 'Chitra S', netPay: 40500 },
  ];
  const run = { Month: '11', Year: '2026' };

  const oursCsv = () => buildBankTransferCsv(items.map((it) => {
    const emp = employeesFixture.find((e) => e.EmployeeID === it.employeeId)!;
    return {
      beneficiaryName: it.employeeName,
      amount: it.netPay,
      ifsc: emp.IFSC,
      accountNo: emp.BankAccountNo,
      remarks: 'Salary November 2026',
    };
  }));

  it('carries the same header row', () => {
    const legacyRows = parseCsv(oracle.bankCsv(run, items, employeesFixture));
    const ourRows = parseCsv(oursCsv());
    expect(ourRows[0]).toEqual(legacyRows[0]);
    expect(ourRows[0]).toEqual([
      'Debit A/c No', 'Beneficiary Name', 'Amount', 'IFSC', 'Beneficiary A/c No', 'Remarks',
    ]);
  });

  it('carries the same cell values as the legacy file', () => {
    const legacyRows = parseCsv(oracle.bankCsv(run, items, employeesFixture));
    const ourRows = parseCsv(oursCsv());
    expect(ourRows).toEqual(legacyRows);
  });

  it('uses CRLF and leaves the debit account column empty, like the legacy file', () => {
    const text = oursCsv();
    expect(text).toContain('\r\n');
    expect(text.split('\r\n')[1].startsWith(',')).toBe(true);
  });

  it('DOCUMENTED DIVERGENCE (defect D-P5-3): quotes are escaped, not left to break the row', () => {
    // A beneficiary named  Rao "Asha"  produced a broken legacy CSV: the name
    // was wrapped in bare quotes but the inner quotes were never doubled.
    const nasty = [{ employeeId: 'E-1', employeeName: 'Rao "Asha"', netPay: 100 }];
    const legacyText = oracle.bankCsv(run, nasty, employeesFixture);
    // The legacy row is corrupt. It emits  ,"Rao "Asha"",100  — the inner
    // quotes close the field early, so a compliant reader returns a name with
    // the quotation marks silently deleted. The bank then sees a beneficiary
    // that does not match the account holder.
    expect(legacyText).toContain(',"Rao "Asha"",100,');
    expect(parseCsv(legacyText)[1][1]).toBe('Rao Asha');

    const ourText = buildBankTransferCsv([{
      beneficiaryName: 'Rao "Asha"', amount: 100, ifsc: 'ICIC0000101',
      accountNo: '000111222333', remarks: 'Salary November 2026',
    }]);
    expect(ourText).toContain('"Rao ""Asha"""');
    expect(parseCsv(ourText)[1][1]).toBe('Rao "Asha"');
  });

  it('DOCUMENTED DIVERGENCE (defect D-P5-3): neutralises spreadsheet formula injection', () => {
    // Never used to be considered: a name beginning = + - @ executes as a
    // formula when the bank file is opened in Excel / LibreOffice.
    expect(parseCsv(csvField('=HYPERLINK("http://evil")'))[0][0]).toBe('\t=HYPERLINK("http://evil")');
    expect(csvField('=HYPERLINK("http://evil")')).toBe('"\t=HYPERLINK(""http://evil"")"');
    expect(csvField('=1+1')).toBe('\t=1+1');
    expect(csvField('+1+1')).toBe('\t+1+1');
    expect(csvField('@SUM(A1)')).toBe('\t@SUM(A1)');
    expect(csvField('-cmd')).toBe('\t-cmd');
    // Harmless values are untouched.
    expect(csvField('Asha Rao')).toBe('Asha Rao');
    expect(csvField(20588)).toBe('20588');
  });

  it('escapes embedded commas and newlines in a name', () => {
    const text = buildBankTransferCsv([{
      beneficiaryName: 'Rao, Asha', amount: 1, ifsc: 'X', accountNo: '1',
      remarks: 'Salary November 2026',
    }]);
    const rows = parseCsv(text);
    expect(rows[1][1]).toBe('Rao, Asha');
    expect(rows[1]).toHaveLength(6);
  });
});
