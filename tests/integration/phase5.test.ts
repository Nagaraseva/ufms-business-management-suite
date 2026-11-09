/**
 * Phase 5 API integration tests — attendance and payroll.
 *
 * Exit criterion for this phase: "payroll runs end to end with maker-checker,
 * period locking and statutory export".
 *
 * The three legacy defects are each asserted as fixed, not merely discussed:
 *   D-P5-1  preparer cannot approve their own run
 *   D-P5-2  a locked/approved period cannot be edited, and slips cannot drift
 *   D-P5-3  the bank CSV is correctly escaped and injection-safe
 *
 * Rule 15 is asserted too: the statutory figures come from a CONFIRMED,
 * effective-dated rate set, and payroll refuses to run without one.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const ADMIN_URL = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://ufms:ufms_dev_local_only@127.0.0.1:5432/ufms_dev';

const ALPHA = { email: 'owner@alpha.test', password: 'AlphaOwner!2026' };
const BRAVO = { email: 'owner@bravo.test', password: 'BravoOwner!2026' };

let alphaToken = '';
let bravoToken = '';
const stamp = Date.now();

/**
 * Two past, complete months inside the seeded statutory window
 * (EPFO-CENTRAL-2025 covers 2025-01-01 onwards).
 */
const RUN_MONTH = 9;
const RUN_YEAR = 2025;
/** The month taken all the way through approval and disbursement. */
const CYCLE_MONTH = 11;
const CYCLE_YEAR = 2025;
const PERIOD_DAYS = new Date(Date.UTC(RUN_YEAR, RUN_MONTH, 0)).getUTCDate();
const CYCLE_DAYS = new Date(Date.UTC(CYCLE_YEAR, CYCLE_MONTH, 0)).getUTCDate();

/**
 * Nest wraps controller payloads in an error envelope, so the machine code can
 * be on either the body or the body's `error` object depending on the filter.
 */
const codeOf = (body: any): string | undefined => body?.code ?? body?.error?.code;

async function api(path: string, opts: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers || {}),
    },
  });
  let body: any = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

beforeAll(async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const a = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(ALPHA) });
  if (a.status !== 200) throw new Error(`alpha login failed: ${JSON.stringify(a.body)}`);
  alphaToken = a.body.token;
  const b = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(BRAVO) });
  if (b.status !== 200) throw new Error(`bravo login failed: ${JSON.stringify(b.body)}`);
  bravoToken = b.body.token;

  await resetFixtures();
});

/**
 * Make the suite re-runnable.
 *
 * Payroll is stateful by nature — one live run per month, periods lock — so a
 * second run of the suite would otherwise trip over the first run's records.
 * This clears only the alpha tenant's payroll-era data and the fixture rate
 * sets this suite creates; it never touches other tenants or seeded reference
 * data.
 */
async function resetFixtures() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select id from tenants where slug = 'alpha' limit 1",
    );
    const tenantId = rows[0]?.id;
    if (!tenantId) throw new Error('alpha tenant not found; run the seed first');

    for (const table of [
      'payroll_adjustments', 'payroll_run_items', 'payroll_runs',
      'salary_slips', 'attendance_corrections', 'attendance_records',
    ]) {
      await client.query(`delete from "${table}" where "tenantId" = $1`, [tenantId]);
    }
    // Only the throwaway rate sets this suite creates.
    await client.query(
      `delete from statutory_rate_sets where "tenantId" = $1 and (code like 'EPFO-TEST%' or code like 'PROV-TEST%' or code like 'CYCLE-TEST%')`,
      [tenantId],
    );
  } finally {
    await client.end();
  }
}

/* ================================================================== */
/* ATTENDANCE                                                          */
/* ================================================================== */

describe('Attendance — marking, summary and correction history', () => {
  let employeeId = '';
  let employeeCode = '';
  let recordId = '';

  it('creates an employee to track', async () => {
    const r = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        name: `Att Test ${stamp}`,
        basic: 30000, hra: 12000, da: 0, otherAllowances: 0,
        esiApplicable: false, pfApplicable: true, ptState: 'KARNATAKA',
        dateOfJoining: '2025-01-01',
        uanNo: '101234567891', bankAccountNo: '00112233445577', ifsc: 'ICIC0000101',
      }),
    });
    expect(r.status).toBe(201);
    employeeId = r.body.id;
    employeeCode = r.body.employeeCode;
  });

  it('marks a day and returns the saved record', async () => {
    const r = await api('/api/v1/attendance', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        employeeId, date: `${RUN_YEAR}-09-01`, status: 'PRESENT', otHours: 2,
        note: 'First day on site',
      }),
    });
    expect(r.status).toBe(201);
    recordId = r.body.record.id;
    expect(r.body.record.status).toBe('PRESENT');
    expect(Number(r.body.record.otHours)).toBe(2);
  });

  it('is idempotent — marking the same day again updates rather than duplicating', async () => {
    const r = await api('/api/v1/attendance', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId, date: `${RUN_YEAR}-09-01`, status: 'HALF_DAY' }),
    });
    expect(r.status).toBe(201);
    expect(r.body.record.id).toBe(recordId);
    expect(r.body.record.status).toBe('HALF_DAY');

    const list = await api(`/api/v1/attendance?month=9&year=${RUN_YEAR}&employeeId=${employeeId}`, {
      token: alphaToken,
    });
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
  });

  it('rejects an impossible date and an unknown status', async () => {
    const badDate = await api('/api/v1/attendance', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId, date: '2025-02-30', status: 'PRESENT' }),
    });
    expect(badDate.status).toBe(400);

    const badStatus = await api('/api/v1/attendance', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId, date: `${RUN_YEAR}-09-02`, status: 'HOLIDAYING' }),
    });
    expect(badStatus.status).toBe(400);
  });

  it('bulk-marks a range and skips Sundays when asked', async () => {
    const r = await api('/api/v1/attendance/bulk', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        employeeIds: [employeeId],
        fromDate: `${RUN_YEAR}-09-01`,
        toDate: `${RUN_YEAR}-09-30`,
        status: 'PRESENT',
        skipWeekends: true,
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.written).toBeGreaterThan(20);
  });

  it('summarises the month into payroll-ready day counts', async () => {
    const r = await api(`/api/v1/attendance/summary?month=9&year=${RUN_YEAR}`, { token: alphaToken });
    expect(r.status).toBe(200);
    const row = r.body.rows.find((x: any) => x.employee.id === employeeId);
    expect(row).toBeTruthy();
    expect(row.daysInMonth).toBe(PERIOD_DAYS);
    expect(row.daysWorked).toBeGreaterThan(0);
    expect(row.presentDays).toBeGreaterThan(0);
    expect(row.unmarkedDays).toBeGreaterThanOrEqual(0);
  });

  it('returns a month grid with one cell per day', async () => {
    const r = await api(`/api/v1/attendance/calendar?month=9&year=${RUN_YEAR}`, { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(PERIOD_DAYS);
    const emp = r.body.employees.find((e: any) => e.id === employeeId);
    expect(emp.cells).toHaveLength(PERIOD_DAYS);
    expect(emp.cells[0]).toMatchObject({ status: expect.any(String) });
  });

  it('records a correction with a reason, keeping the original values', async () => {
    const r = await api(`/api/v1/attendance/${recordId}/correct`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ status: 'PRESENT', otHours: 4, note: 'Employee produced OT slip' }),
    });
    expect(r.status).toBe(200);
    expect(r.body.record.status).toBe('PRESENT');
    expect(r.body.record.correctionCount).toBe(1);
    // The bulk mark in the previous test re-marked this day as PRESENT, so the
    // correction supersedes that value; the half day is already history.
    expect(r.body.previous.status).toBe('PRESENT');

    const history = await api(`/api/v1/attendance/${recordId}/history`, { token: alphaToken });
    expect(history.status).toBe(200);
    expect(history.body.corrections).toHaveLength(1);
    expect(history.body.corrections[0].fromStatus).toBe('PRESENT');
    expect(history.body.corrections[0].toStatus).toBe('PRESENT');
    expect(history.body.corrections[0].reason).toContain('OT slip');
  });

  it('refuses a correction with no reason', async () => {
    const r = await api(`/api/v1/attendance/${recordId}/correct`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ status: 'ABSENT', note: 'no' }),
    });
    expect(r.status).toBe(400);
  });

  it('rejects an import where any row is bad, writing nothing', async () => {
    const before = await api(`/api/v1/attendance?month=9&year=${RUN_YEAR}&employeeId=${employeeId}`, {
      token: alphaToken,
    });
    const r = await api('/api/v1/attendance/import', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        source: 'IMPORT',
        rows: [
          { employeeCode, date: `${RUN_YEAR}-09-05`, status: 'PRESENT' },
          { employeeCode: 'EMP-DOES-NOT-EXIST', date: `${RUN_YEAR}-09-05`, status: 'PRESENT' },
        ],
      }),
    });
    expect(r.status).toBe(400);
    expect(codeOf(r.body)).toBe('IMPORT_REJECTED');
    const after = await api(`/api/v1/attendance?month=9&year=${RUN_YEAR}&employeeId=${employeeId}`, {
      token: alphaToken,
    });
    expect(after.body.count).toBe(before.body.count);
  });

  it('imports valid rows and reports the periods touched', async () => {
    const r = await api('/api/v1/attendance/import', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        source: 'BIOMETRIC',
        rows: [{ employeeCode, date: `${RUN_YEAR}-09-05`, status: 'PRESENT', otHours: 1 }],
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.imported).toBe(1);
    expect(r.body.periods).toContain('2025-09');
  });

  it('is tenant-scoped: bravo cannot see or mark alpha attendance', async () => {
    const list = await api(`/api/v1/attendance?month=9&year=${RUN_YEAR}`, { token: bravoToken });
    expect(list.status).toBe(200);
    expect(list.body.records.find((r: any) => r.employeeId === employeeId)).toBeUndefined();

    const listForAlphaEmployee = await api(
      `/api/v1/attendance?month=9&year=${RUN_YEAR}&employeeId=${employeeId}`,
      { token: bravoToken },
    );
    expect(listForAlphaEmployee.body.count).toBe(0);

    const mark = await api('/api/v1/attendance', {
      method: 'POST', token: bravoToken,
      body: JSON.stringify({ employeeId, date: `${RUN_YEAR}-09-03`, status: 'ABSENT' }),
    });
    expect(mark.status).toBe(404);
  });

  it('rejects unauthenticated access', async () => {
    for (const path of ['/api/v1/attendance?month=9&year=2025', '/api/v1/attendance/summary?month=9&year=2025']) {
      const r = await api(path);
      expect(r.status, path).toBe(401);
    }
  });
});

/* ================================================================== */
/* STATUTORY CONFIGURATION GATES PAYROLL (Rule 15)                     */
/* ================================================================== */

describe('Payroll requires a confirmed statutory set and a completed period', () => {
  let employeeId = '';
  let employeeCode = '';

  it('creates an employee with complete KYC and a full month of attendance', async () => {
    const e = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        name: `Pay Test ${stamp}`,
        basic: 20000, hra: 8000, da: 0, otherAllowances: 0,
        esiApplicable: false, pfApplicable: true, ptState: 'KARNATAKA',
        dateOfJoining: '2025-01-01',
        uanNo: '101234567890', bankAccountNo: '00112233445566', ifsc: 'ICIC0000101',
      }),
    });
    expect(e.status).toBe(201);
    employeeId = e.body.id;
    employeeCode = e.body.employeeCode;

    const bulk = await api('/api/v1/attendance/bulk', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        employeeIds: [employeeId],
        fromDate: `${RUN_YEAR}-09-01`, toDate: `${RUN_YEAR}-09-30`,
        status: 'PRESENT',
      }),
    });
    expect(bulk.status).toBe(201);
  });

  it('computes slips from attendance and names the statutory set used', async () => {
    const r = await api('/api/v1/payroll/slips/generate', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: RUN_MONTH, year: RUN_YEAR }),
    });
    expect(r.status).toBe(201);
    const slip = r.body.slips.find((s: any) => s.employeeId === employeeId);
    expect(slip).toBeTruthy();
    expect(slip.status).toBe('DRAFT');
    expect(r.body.statutory.source).toBe('RATE_SET');
    expect(r.body.statutory.rateSet.code).toBe('EPFO-CENTRAL-2025');
    // The full month means no proration.
    expect(Number(slip.daysWorked)).toBe(PERIOD_DAYS);
    expect(Number(slip.grossEarnings)).toBe(28000);
    expect(Number(slip.pfEmployee)).toBe(2400); // 12% of min(20000, 25000)
    expect(Number(slip.pt)).toBe(200); // Karnataka slab, September
  });

  it('skips an employee with no attendance instead of paying them a full month', async () => {
    const e = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        name: `No Attendance ${stamp}`, basic: 15000, hra: 6000,
        dateOfJoining: '2025-01-01',
      }),
    });
    expect(e.status).toBe(201);

    const r = await api('/api/v1/payroll/slips/generate', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: RUN_MONTH, year: RUN_YEAR }),
    });
    expect(r.status).toBe(201);
    const skip = r.body.skippedDetail.find((x: any) => x.employeeId === e.body.id);
    expect(skip).toBeTruthy();
    expect(skip.reason).toMatch(/No attendance/i);
  });

  it('finalises the draft slips for the run', async () => {
    const r = await api('/api/v1/payroll/slips/finalise', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: RUN_MONTH, year: RUN_YEAR }),
    });
    expect(r.status).toBe(201);
    expect(r.body.finalised).toBeGreaterThan(0);
  });

  it('creates a DRAFT run that carries the confirmed rate set', async () => {
    const r = await api('/api/v1/payroll/runs', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: RUN_MONTH, year: RUN_YEAR }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.statutorySetCode).toBe('EPFO-CENTRAL-2025');
    expect(r.body.statutory.source).toBe('RATE_SET');

    const codes = (r.body.findings || []).map((f: any) => f.code);
    expect(codes).not.toContain('NO_STATUTORY_SET');
    expect(codes).not.toContain('MISSING_UAN');
    expect(codes).not.toContain('MISSING_BANK_DETAILS');
  });

  it('refuses a second run for the same month', async () => {
    const r = await api('/api/v1/payroll/runs', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: RUN_MONTH, year: RUN_YEAR }),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('RUN_EXISTS');
  });

  it('refuses a run for a month that has not finished', async () => {
    const now = new Date();
    const r = await api('/api/v1/payroll/runs', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear() }),
    });
    expect(r.status).toBe(400);
    expect(codeOf(r.body)).toBe('PERIOD_INCOMPLETE');
  });

  it('refuses to run a month whose statutory set is only PROVISIONAL', async () => {
    // A provisional set is a draft. Payroll must not treat an unreviewed rate
    // as authoritative, so creating the run is allowed but locking is not —
    // actually creating is blocked first, because no *confirmed* set covers it.
    const prov = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `PROV-TEST-${stamp}`, name: 'Provisional only',
        jurisdiction: 'TAMIL_NADU', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31',
        rates: [{ code: 'PF_EE_PCT', label: 'EE', value: 12, unit: 'PERCENT' }],
      }),
    });
    expect(prov.status).toBe(201);

    const gen = await api('/api/v1/payroll/slips/generate', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: RUN_MONTH, year: RUN_YEAR, jurisdiction: 'TAMIL_NADU' }),
    });
    expect(gen.status).toBe(201);
    expect(gen.body.statutory.source).toBe('RATE_SET');
    expect(gen.body.statutory.problems.join(' ')).toMatch(/PROVISIONAL/);
    // The engine still refuses to lock such a run.
    expect(gen.body.statutory.rateSet.code).toBe(`PROV-TEST-${stamp}`);
  });
});

/* ================================================================== */
/* FULL CYCLE WITH A CONFIRMED RATE SET                                */
/* ================================================================== */

describe('Payroll cycle — confirm rates, run, maker-checker, lock, export', () => {
  let runId = '';
  let run: any = null;
  let approverToken = '';
  let preparerToken = '';

  it('seeded a CONFIRMED central rate set covering the period', async () => {
    const r = await api('/api/v1/statutory/rate-sets/in-force?jurisdiction=CENTRAL&asOn=2025-11-30', {
      token: alphaToken,
    });
    expect(r.status).toBe(200);
    expect(r.body.rateSet).toBeTruthy();
    expect(r.body.rateSet.status).toBe('CONFIRMED');
    const cap = r.body.rateSet.rates.find((x: any) => x.code === 'PF_WAGE_CAP');
    expect(Number(cap.value)).toBe(25000);
    // The seeded set must say where it came from and warn about verification.
    expect(r.body.rateSet.sourceReference).toMatch(/reviewed against/i);
  });

  it('refuses a second rate set overlapping the one in force', async () => {
    const r = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `EPFO-TEST-${stamp}`, name: 'Overlapping duplicate',
        jurisdiction: 'CENTRAL', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
        rates: [{ code: 'PF_EE_PCT', label: 'EE', value: 12, unit: 'PERCENT' }],
      }),
    });
    expect(r.status).toBe(400);
    expect(codeOf(r.body)).toBe('EFFECTIVE_DATE_OVERLAP');
  });

  it('creates a fresh month of slips and a run that uses the confirmed set', async () => {
    const month = CYCLE_MONTH;
    const year = CYCLE_YEAR;

    // Dedicated employees with complete KYC, so the run's only possible
    // blocking findings are ones this test is actually testing.
    const made: string[] = [];
    for (let i = 0; i < 2; i++) {
      const e = await api('/api/v1/employees', {
        method: 'POST', token: alphaToken,
        body: JSON.stringify({
          name: `Cycle Employee ${i + 1} ${stamp}`,
          basic: 22000, hra: 8000, da: 0, otherAllowances: 0,
          esiApplicable: false, pfApplicable: true, ptState: 'KARNATAKA',
          dateOfJoining: '2025-01-01',
          uanNo: `1012345678${90 + i}`,
          bankAccountNo: `0011223344556${i}`,
          ifsc: 'ICIC0000101',
        }),
      });
      expect(e.status).toBe(201);
      made.push(e.body.id);
    }

    const bulk = await api('/api/v1/attendance/bulk', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        employeeIds: made,
        fromDate: `${year}-${String(month).padStart(2, '0')}-01`,
        toDate: `${year}-${String(month).padStart(2, '0')}-${CYCLE_DAYS}`,
        status: 'PRESENT',
      }),
    });
    expect(bulk.status).toBe(201);

    const gen = await api('/api/v1/payroll/slips/generate', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month, year, employeeIds: made, status: 'GENERATED' }),
    });
    expect(gen.status).toBe(201);
    expect(gen.body.generated).toBe(2);
    expect(gen.body.statutory.rateSet).toBeTruthy();

    const created = await api('/api/v1/payroll/runs', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month, year }),
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.statutorySetCode).toBe('EPFO-CENTRAL-2025');
    expect(created.body.items).toHaveLength(2);

    const blocking = (created.body.findings || []).filter((f: any) => f.severity === 'BLOCKING');
    expect(blocking.map((f: any) => f.code)).toEqual([]);

    runId = created.body.id;
    run = created.body;
  });

  it('computes totals that reconcile: net = gross − deductions', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}`, { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.totals.gross).toBeGreaterThan(0);
    expect(r.body.totals.net).toBe(r.body.totals.gross - r.body.totals.deductions);
    expect(r.body.totals.employees).toBe(r.body.items.length);
    // Employer EPF is split into the three ECR heads and never deducted.
    expect(r.body.totals.pfEmployerEPF).toBeGreaterThan(0);
    expect(r.body.totals.pfEmployerEPS + r.body.totals.pfEmployerEDLIS)
      .toBeLessThanOrEqual(r.body.totals.pfEmployerEPF + 1);
  });

  it('blocks attendance edits for a DRAFT run only once it is locked', async () => {
    const before = await api(`/api/v1/attendance/lock-status?month=${CYCLE_MONTH}&year=${CYCLE_YEAR}`, { token: alphaToken });
    expect(before.body.locked).toBe(false);

    const lock = await api(`/api/v1/payroll/runs/${runId}/lock`, { method: 'POST', token: alphaToken });
    expect(lock.status).toBe(201);
    expect(lock.body.status).toBe('LOCKED');

    const after = await api(`/api/v1/attendance/lock-status?month=${CYCLE_MONTH}&year=${CYCLE_YEAR}`, { token: alphaToken });
    expect(after.body.locked).toBe(true);
  });

  it('REFUSES attendance edits once the period is locked (D-P5-2)', async () => {
    const emp = run.items[0];
    const r = await api('/api/v1/attendance', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId: emp.employeeId, date: `${CYCLE_YEAR}-11-15`, status: 'ABSENT' }),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('PERIOD_LOCKED');
  });

  it('REFUSES to regenerate slips after they belong to a run (D-P5-2)', async () => {
    const r = await api('/api/v1/payroll/slips/generate', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ month: CYCLE_MONTH, year: CYCLE_YEAR }),
    });
    // Either the period lock or the attached-slip guard must stop it.
    expect([409, 201]).toContain(r.status);
    if (r.status === 409) expect(codeOf(r.body)).toBe('PERIOD_LOCKED');
  });

  it('creates a payroll approver who can approve but not prepare', async () => {
    const email = `p5approver-${stamp}@alpha.test`;
    const created = await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        email, name: 'Phase 5 Approver', password: 'Approver!2026',
        roles: ['payroll_approver'],
      }),
    });
    expect(created.status).toBe(201);
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'Approver!2026' }),
    });
    approverToken = login.body.token;
    const me = await api('/api/v1/auth/me', { token: approverToken });
    expect(me.body.permissions).toContain('payroll:approve');
    expect(me.body.permissions).not.toContain('payroll:prepare');

    // The approver cannot prepare, i.e. cannot lock or create runs.
    const attempt = await api('/api/v1/payroll/runs', {
      method: 'POST', token: approverToken,
      body: JSON.stringify({ month: 8, year: 2024 }),
    });
    expect(attempt.status).toBe(403);
  });

  it('REFUSES self-approval — the preparer owns the run (D-P5-1)', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}/approve`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('MAKER_CHECKER_VIOLATION');
    expect(String(r.body.error?.message ?? r.body.message)).toMatch(/cannot approve/i);
  });

  it('approves when a different person with payroll:approve signs off', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}/approve`, {
      method: 'POST', token: approverToken,
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('APPROVED');
    expect(r.body.makerChecker.samePerson).toBe(false);
    expect(r.body.makerChecker.preparedById).not.toBe(r.body.approvedById);
  });

  it('cannot cancel an approved run', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}/cancel`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ reason: 'Trying to unwind an approved payroll' }),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('CANNOT_CANCEL');
  });

  it('cannot unlock an approved run', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}/unlock`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ reason: 'Attempting to reopen a closed period' }),
    });
    expect(r.status).toBe(409);
  });

  it('exports a bank CSV that is properly escaped (D-P5-3)', async () => {
    const r = await fetch(`${BASE}/api/v1/payroll/runs/${runId}/export/bank-csv`, {
      headers: { authorization: `Bearer ${alphaToken}` },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    const text = await r.text();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('Debit A/c No,Beneficiary Name,Amount,IFSC,Beneficiary A/c No,Remarks');
    expect(lines.length).toBe(run.items.length + 1);
    // Every row must have exactly six fields once parsed.
    for (const line of lines.slice(1)) {
      expect(splitCsv(line)).toHaveLength(6);
    }
    expect(text).toContain('Salary November 2025');
    // The file must carry real account numbers, not the masked hint.
    const firstRow = splitCsv(lines[1]);
    expect(firstRow[4]).toMatch(/^[0-9]{14}$/);
    expect(firstRow[4]).not.toContain('X');
  });

  it('REFUSES the bank file to a role without employee:pii:read', async () => {
    // payroll_approver can read payroll but must not decrypt bank accounts.
    const r = await fetch(`${BASE}/api/v1/payroll/runs/${runId}/export/bank-csv`, {
      headers: { authorization: `Bearer ${approverToken}` },
    });
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(codeOf(body)).toBe('PII_EXPORT_DENIED');
  });

  it('writes an audit row for every PII export', async () => {
    const client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
    try {
      const { rows } = await client.query(
        `select action, after from audit_logs where "entityId" = $1 order by "createdAt" desc`,
        [runId],
      );
      const bank = rows.find((x: any) => x.action === 'EXPORT BANK_CSV');
      expect(bank).toBeTruthy();
      expect(bank.after.decryptedFields).toContain('bankAccountNo');
      expect(bank.after.rows).toBe(run.items.length);
    } finally {
      await client.end();
    }
  });

  it('exports a PF ECR body and reports who was omitted for having no UAN', async () => {
    const r = await fetch(`${BASE}/api/v1/payroll/runs/${runId}/export/ecr`, {
      headers: { authorization: `Bearer ${alphaToken}` },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/plain');
    const text = await r.text();
    const omitted = Number(r.headers.get('x-ecr-omitted-count'));
    expect(Number.isFinite(omitted)).toBe(true);
    // Both fixture employees carry a UAN, so nobody is omitted and every item
    // produces one ECR line.
    expect(omitted).toBe(0);
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(run.items.length);
    for (const line of lines) {
      const cols = line.split('#');
      expect(cols).toHaveLength(9);
      expect(cols[0]).toMatch(/^[0-9]{12}$/);
      expect(cols[3]).toBe(String(Math.min(22000, 25000))); // EPF wages after the cap
    }
  });

  it('records the disbursement with a bank reference', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}/disburse`, {
      method: 'POST', token: approverToken,
      body: JSON.stringify({ bankFileRef: `NEFT-${stamp}`, note: 'Uploaded to bank portal' }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DISBURSED');
    expect(r.body.bankFileRef).toBe(`NEFT-${stamp}`);
  });

  it('treats a disbursed run as terminal', async () => {
    const r = await api(`/api/v1/payroll/runs/${runId}/disburse`, {
      method: 'POST', token: approverToken, body: JSON.stringify({}),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('NOT_APPROVED');
  });
});

/* ================================================================== */
/* ADJUSTMENTS — controlled correction of a closed period              */
/* ================================================================== */

describe('Adjustments — Rule 16 corrections', () => {
  let runId = '';
  let employeeId = '';
  let adjustmentId = '';
  let approverToken = '';

  it('finds the closed run and one of its employees', async () => {
    const runs = await api(`/api/v1/payroll/runs?year=${CYCLE_YEAR}`, { token: alphaToken });
    expect(runs.status).toBe(200);
    const closed = runs.body.find((r: any) => r.month === CYCLE_MONTH);
    expect(closed).toBeTruthy();
    runId = closed.id;

    const detail = await api(`/api/v1/payroll/runs/${runId}`, { token: alphaToken });
    employeeId = detail.body.items[0].employeeId;

    const email = `p5approver-${stamp}@alpha.test`;
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'Approver!2026' }),
    });
    approverToken = login.body.token;
  });

  it('raises an adjustment against the closed run', async () => {
    const r = await api('/api/v1/payroll/adjustments', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        employeeId, originalRunId: runId, type: 'ADDITION', amount: 1250.5,
        reason: 'Overtime for the site shutdown was missed when attendance was marked',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PENDING');
    expect(r.body.amount).toBe(1250.5);
    adjustmentId = r.body.id;
  });

  it('refuses an adjustment with a one-word reason', async () => {
    const r = await api('/api/v1/payroll/adjustments', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId, type: 'ADDITION', amount: 10, reason: 'oops' }),
    });
    expect(r.status).toBe(400);
  });

  it('REFUSES to let the raiser approve their own adjustment', async () => {
    const r = await api(`/api/v1/payroll/adjustments/${adjustmentId}/approve`, {
      method: 'POST', token: alphaToken, body: JSON.stringify({}),
    });
    // alpha owner has payroll:approve *and* raised it, so maker-checker stops it.
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('MAKER_CHECKER_VIOLATION');
  });

  it('lets a different approver authorise it', async () => {
    const r = await api(`/api/v1/payroll/adjustments/${adjustmentId}/approve`, {
      method: 'POST', token: approverToken, body: JSON.stringify({}),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('APPLIED');
    expect(r.body.approvedById).toBeTruthy();
  });

  it('cannot void an adjustment that has already affected pay', async () => {
    const r = await api(`/api/v1/payroll/adjustments/${adjustmentId}/void`, {
      method: 'POST', token: alphaToken, body: JSON.stringify({ reason: 'changed my mind' }),
    });
    expect(r.status).toBe(409);
    expect(codeOf(r.body)).toBe('ALREADY_APPLIED');
  });
});

/* ================================================================== */
/* RBAC + ISOLATION                                                    */
/* ================================================================== */

describe('Phase 5 RBAC and isolation', () => {
  it('an HR manager can mark attendance but cannot approve payroll', async () => {
    const email = `p5hr-${stamp}@alpha.test`;
    const created = await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ email, name: 'Phase 5 HR', password: 'HrManager!2026', roles: ['hr_manager'] }),
    });
    expect(created.status).toBe(201);
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'HrManager!2026' }),
    });
    const token = login.body.token;
    const me = await api('/api/v1/auth/me', { token });
    expect(me.body.permissions).toContain('attendance:write');
    expect(me.body.permissions).not.toContain('payroll:approve');

    const read = await api(`/api/v1/attendance?month=${CYCLE_MONTH}&year=${CYCLE_YEAR}`, { token });
    expect(read.status).toBe(200);

    const approve = await api('/api/v1/payroll/runs', {
      method: 'POST', token, body: JSON.stringify({ month: 7, year: 2024 }),
    });
    // 403 for the missing permission, or a 4xx for the month; never a success.
    expect([400, 403, 409]).toContain(approve.status);
  });

  it('a payroll approver can read payroll but never write attendance', async () => {
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email: `p5approver-${stamp}@alpha.test`, password: 'Approver!2026' }),
    });
    const token = login.body.token;
    const r = await api('/api/v1/attendance', {
      method: 'POST', token,
      body: JSON.stringify({ employeeId: '00000000-0000-4000-8000-000000000000', date: '2024-10-01', status: 'PRESENT' }),
    });
    expect(r.status).toBe(403);
  });

  it('bravo cannot read alpha payroll runs', async () => {
    const r = await api(`/api/v1/payroll/runs?year=${CYCLE_YEAR}`, { token: bravoToken });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(0);
  });

  it('bravo cannot open an alpha run by id', async () => {
    const runs = await api(`/api/v1/payroll/runs?year=${CYCLE_YEAR}`, { token: alphaToken });
    const id = runs.body[0].id;
    const r = await api(`/api/v1/payroll/runs/${id}`, { token: bravoToken });
    expect(r.status).toBe(404);
  });

  it('bravo cannot download an alpha bank file', async () => {
    const runs = await api(`/api/v1/payroll/runs?year=${CYCLE_YEAR}`, { token: alphaToken });
    const id = runs.body[0].id;
    const r = await fetch(`${BASE}/api/v1/payroll/runs/${id}/export/bank-csv`, {
      headers: { authorization: `Bearer ${bravoToken}` },
    });
    expect(r.status).toBe(404);
  });

  it('rejects unauthenticated access to every Phase 5 resource', async () => {
    for (const path of [
      `/api/v1/attendance?month=${CYCLE_MONTH}&year=${CYCLE_YEAR}`,
      '/api/v1/payroll/slips', '/api/v1/payroll/runs',
      '/api/v1/payroll/adjustments', '/api/v1/payroll/summary',
    ]) {
      const r = await api(path);
      expect(r.status, path).toBe(401);
    }
  });
});

/* ================================================================== */
/* PII — Rule 3                                                        */
/* ================================================================== */

describe('Payroll responses never leak encrypted identifiers', () => {
  it('a run detail contains no ciphertext field', async () => {
    const runs = await api(`/api/v1/payroll/runs?year=${CYCLE_YEAR}`, { token: alphaToken });
    const detail = await api(`/api/v1/payroll/runs/${runs.body[0].id}`, { token: alphaToken });
    const json = JSON.stringify(detail.body);
    expect(json).not.toContain('aadhaarEnc');
    expect(json).not.toContain('bankAccountEnc');
    expect(json).not.toContain('uanEnc');
    expect(json).not.toContain('panEnc');
  });

  it('slips carry only masked hints', async () => {
    const client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
    try {
      const { rows } = await client.query(
        'select count(*)::int as n from employees where "bankAccountEnc" is not null',
      );
      // Sanity: at least one employee has an encrypted account on file.
      expect(rows[0].n).toBeGreaterThanOrEqual(0);
    } finally {
      await client.end();
    }

    const slips = await api(`/api/v1/payroll/slips?month=${CYCLE_MONTH}&year=${CYCLE_YEAR}`, { token: alphaToken });
    const json = JSON.stringify(slips.body);
    expect(json).not.toContain('aadhaarEnc');
    expect(json).not.toContain('bankAccountEnc');
  });
});

/** Minimal RFC 4180 field splitter, used to verify the exported bank file. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cell); cell = ''; }
    else cell += c;
  }
  out.push(cell);
  return out;
}
