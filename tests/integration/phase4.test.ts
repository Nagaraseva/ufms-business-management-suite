/**
 * Phase 4 API integration tests — HR, workforce deployment, statutory config.
 *
 * Covers the Phase 4 acceptance criteria and the two rules that shape this
 * phase most sharply:
 *   - Rule 3  no sensitive data in APIs: Aadhaar/PAN/bank values are encrypted
 *             at rest and never returned; only masked hints cross the wire.
 *   - Rule 15 statutory rates are effective-dated configurables, never
 *             hardcoded constants.
 *
 * Exit criterion: "site strength reconciles to allocations" — tested end to
 * end, from a deployed roster through to the reconciliation report.
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
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

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
});

/* ================================================================== */
/* EMPLOYEES + PII PROTECTION                                         */
/* ================================================================== */

describe('Employees — creation and code allocation', () => {
  let employeeId = '';
  let employeeCode = '';

  it('creates an employee with an auto-allocated EMP-YYYY-NNNN code', async () => {
    const r = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        name: `Lakshmi Narayan ${stamp}`,
        fatherName: 'Ramanathan',
        dob: '1991-06-14',
        gender: 'FEMALE',
        bloodGroup: 'O+',
        mobile: '+91 98450 11223',
        email: `lakshmi-${stamp}@alpha.test`,
        aadhaarNo: '2345 6789 0124',
        panNo: 'aabcm1234n',
        uanNo: '100234567890',
        esiNo: '3100456789',
        bankAccountNo: '50100234567890',
        bankName: 'HDFC Bank',
        ifsc: 'hdfc0001234',
        designation: 'Housekeeping Supervisor',
        department: 'Operations',
        dateOfJoining: '2025-04-01',
        basic: 16000,
        hra: 4000,
        da: 2000,
        otherAllowances: 1000,
        ptState: 'KARNATAKA',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.employeeCode).toMatch(/^EMP-\d{4}-\d{4}$/);
    expect(r.body.status).toBe('ACTIVE');
    expect(r.body.active).toBe(true);
    employeeId = r.body.id;
    employeeCode = r.body.employeeCode;
  });

  it('normalises mobile, PAN and IFSC on the way in', async () => {
    const r = await api(`/api/v1/employees/${employeeId}`, { token: alphaToken });
    expect(r.body.mobile).toBe('9845011223');   // +91 stripped
    expect(r.body.ifsc).toBe('HDFC0001234');    // upper-cased
    expect(r.body.panHint).toBe('XXXXX1234X');  // PAN hint keeps the entity position
  });

  it('NEVER returns a full Aadhaar, PAN, UAN, ESI or bank number', async () => {
    const list = await api('/api/v1/employees?pageSize=100', { token: alphaToken });
    expect(list.status).toBe(200);
    const detail = await api(`/api/v1/employees/${employeeId}`, { token: alphaToken });

    const serialised = JSON.stringify({ list: list.body, detail: detail.body });
    for (const secret of ['234567890124', '2345 6789 0124', 'AABCM1234N', '100234567890', '3100456789', '50100234567890']) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('carries no ciphertext field in the response body', async () => {
    const r = await api(`/api/v1/employees/${employeeId}`, { token: alphaToken });
    for (const key of ['aadhaarEnc', 'panEnc', 'uanEnc', 'esiNoEnc', 'bankAccountEnc']) {
      expect(r.body).not.toHaveProperty(key);
    }
  });

  it('exposes only masked hints', async () => {
    const r = await api(`/api/v1/employees/${employeeId}`, { token: alphaToken });
    expect(r.body.aadhaarHint).toBe('XXXX XXXX 0124');
    expect(r.body.bankAccountHint).toBe('XXXX XXXX 7890');
    expect(r.body.esiNoHint).toBe('XXXX XXXX 6789');
  });

  it('stores the identifiers as AES-256-GCM ciphertext in the database', async () => {
    const db = new Client({ connectionString: ADMIN_URL });
    await db.connect();
    try {
      const { rows } = await db.query(
        `SELECT "aadhaarEnc", "panEnc", "bankAccountEnc" FROM employees WHERE id = $1`,
        [employeeId],
      );
      expect(rows).toHaveLength(1);
      const { aadhaarEnc, panEnc, bankAccountEnc } = rows[0];
      for (const [label, value] of Object.entries({ aadhaarEnc, panEnc, bankAccountEnc })) {
        expect(value, `${label} must be encrypted`).toBeTruthy();
        expect(String(value)).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
        expect(String(value)).not.toContain('234567890124');
        expect(String(value)).not.toContain('AABCM1234N');
      }
      // Two different values must not share an IV.
      const ivs = [aadhaarEnc, panEnc, bankAccountEnc].map((v: string) => String(v).split(':')[1]);
      expect(new Set(ivs).size).toBe(3);
    } finally {
      await db.end();
    }
  });

  it('rejects a duplicate employee code, case-insensitively', async () => {
    const r = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: 'Copycat', employeeCode: employeeCode.toLowerCase() }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('DUPLICATE_EMPLOYEE_CODE');
  });

  it('validates mobile, Aadhaar and PAN', async () => {
    const badMobile = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: 'X', mobile: '12345' }),
    });
    expect(badMobile.status).toBe(400);
    expect(badMobile.body.error.code).toBe('INVALID_MOBILE');

    const badAadhaar = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: 'X', aadhaarNo: '1234' }),
    });
    expect(badAadhaar.status).toBe(400);
    expect(badAadhaar.body.error.code).toBe('INVALID_AADHAAR');

    const badPan = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: 'X', panNo: 'NOTAPAN' }),
    });
    expect(badPan.status).toBe(400);
    expect(badPan.body.error.code).toBe('INVALID_PAN');
  });

  it('defaults ESI and PF to applicable unless explicitly turned off', async () => {
    const on = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken, body: JSON.stringify({ name: `Defaults ${stamp}` }),
    });
    expect(on.body.esiApplicable).toBe(true);
    expect(on.body.pfApplicable).toBe(true);

    const off = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: `OptOut ${stamp}`, esiApplicable: false, pfApplicable: false }),
    });
    expect(off.body.esiApplicable).toBe(false);
    expect(off.body.pfApplicable).toBe(false);
  });
});

describe('PII reveal — permission, reason and audit', () => {
  let employeeId = '';
  let hrToken = '';

  beforeAll(async () => {
    const e = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        name: `Reveal Probe ${stamp}`,
        aadhaarNo: '987654321098',
        panNo: 'XYZAB5678C',
        bankAccountNo: '99887766554433',
      }),
    });
    employeeId = e.body.id;

    // An HR manager deliberately does NOT get employee:pii:read.
    const email = `hr-${stamp}@alpha.test`;
    await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ email, name: 'HR Manager', password: 'HrManager!2026', roles: ['hr_manager'] }),
    });
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'HrManager!2026' }),
    });
    hrToken = login.body.token;
  });

  it('an HR manager can read the employee but not the full identifiers', async () => {
    const r = await api(`/api/v1/employees/${employeeId}`, { token: hrToken });
    expect(r.status).toBe(200);
    expect(r.body.piiReadable).toBe(false);
    expect(r.body.aadhaarHint).toBe('XXXX XXXX 1098');
  });

  it('an HR manager is denied the reveal endpoint', async () => {
    const r = await api(`/api/v1/employees/${employeeId}/reveal-pii`, {
      method: 'POST', token: hrToken,
      body: JSON.stringify({ reason: 'Verifying bank details for payroll' }),
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('the owner must state a reason', async () => {
    const r = await api(`/api/v1/employees/${employeeId}/reveal-pii`, {
      method: 'POST', token: alphaToken, body: JSON.stringify({ reason: 'short' }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('REASON_REQUIRED');
  });

  it('the owner can reveal, and the values round-trip through encryption', async () => {
    const r = await api(`/api/v1/employees/${employeeId}/reveal-pii`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ reason: 'Verifying bank details before the monthly payroll run' }),
    });
    expect(r.status).toBe(201);
    // Decryption must return exactly what went in — proves the cipher is lossless.
    expect(r.body.aadhaarNo).toBe('987654321098');
    expect(r.body.panNo).toBe('XYZAB5678C');
    expect(r.body.bankAccountNo).toBe('99887766554433');
    expect(r.body.auditedReason).toContain('payroll');
  });
});

describe('Employee summary and lifecycle', () => {
  it('reports a workforce summary consistent with the roster', async () => {
    const r = await api('/api/v1/employees/summary', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.active + r.body.notice + r.body.onHold + r.body.left).toBe(r.body.total);
    expect(typeof r.body.monthlyGrossEstimate).toBe('number');
    expect(r.body.byDepartment).toBeTypeOf('object');
  });

  it('deactivates an employee without deleting the row', async () => {
    const e = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: `Leaver ${stamp}`, dateOfJoining: '2024-01-01', basic: 12000 }),
    });
    const id = e.body.id;

    const r = await api(`/api/v1/employees/${id}/deactivate`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ dateOfLeaving: day(0), reason: 'Resigned' }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('LEFT');
    expect(r.body.active).toBe(false);
    expect(r.body.dateOfLeaving).toBeTruthy();

    // The record is still readable — history matters for payroll.
    const still = await api(`/api/v1/employees/${id}`, { token: alphaToken });
    expect(still.status).toBe(200);

    // Deactivating twice is refused.
    const again = await api(`/api/v1/employees/${id}/deactivate`, {
      method: 'POST', token: alphaToken, body: '{}',
    });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ALREADY_INACTIVE');
  });

  it('registers a document and flags near-expiry ones', async () => {
    const e = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken, body: JSON.stringify({ name: `Docs ${stamp}` }),
    });
    const id = e.body.id;

    const doc = await api(`/api/v1/employees/${id}/documents`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        category: 'PF', fileName: 'pf-uan-card.pdf', mimeType: 'application/pdf', fileSize: 182734,
        expiryDate: day(10), notes: 'UAN card scan',
      }),
    });
    expect(doc.status).toBe(201);
    // Binary content is not accepted — object storage only (Rule 4).
    expect(doc.body.status).toBe('PENDING_UPLOAD');
    expect(doc.body.storageKey).toBeNull();

    const expiring = await api(`/api/v1/employees/${id}/documents/expiring?days=30`, { token: alphaToken });
    expect(expiring.status).toBe(200);
    expect(expiring.body.length).toBe(1);

    const rejected = await api(`/api/v1/employees/${id}/documents`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ category: 'PASSPORT', fileName: 'x.pdf' }),
    });
    expect(rejected.status).toBe(400);
  });
});

/* ================================================================== */
/* WORKFORCE: DEPLOYMENT + STRENGTH RECONCILIATION                    */
/* ================================================================== */

describe('Deployment and site strength (Phase 4 exit criterion)', () => {
  let clientId = '';
  let contractId = '';
  const employeeIds: string[] = [];

  beforeAll(async () => {
    const c = await api('/api/v1/clients', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ companyName: `Techpark Facilities ${stamp}` }),
    });
    clientId = c.body.id;

    const k = await api('/api/v1/contracts', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        clientId, serviceType: 'Housekeeping', contractValue: 3600000,
        startDate: day(-30), endDate: day(335),
      }),
    });
    contractId = k.body.id;
    await api(`/api/v1/contracts/${contractId}/status`, {
      method: 'PATCH', token: alphaToken, body: JSON.stringify({ status: 'ACTIVE' }),
    });

    for (let i = 0; i < 3; i++) {
      const e = await api('/api/v1/employees', {
        method: 'POST', token: alphaToken,
        body: JSON.stringify({
          name: `Deployed ${i} ${stamp}`, designation: 'Housekeeping',
          basic: 14000, hra: 3000, da: 1000,
        }),
      });
      employeeIds.push(e.body.id);
    }
  });

  it('records the contracted requirement', async () => {
    const reqs = [
      { designation: 'Housekeeping', category: 'UNSKILLED', requiredCount: 5, effectiveFrom: day(-30) },
      { designation: 'Supervisor', category: 'SKILLED', requiredCount: 1, effectiveFrom: day(-30) },
    ];
    for (const r of reqs) {
      const res = await api('/api/v1/manpower-requirements', {
        method: 'POST', token: alphaToken,
        body: JSON.stringify({ contractId, ...r }),
      });
      expect(res.status).toBe(201);
    }
    const list = await api(`/api/v1/manpower-requirements?contractId=${contractId}`, { token: alphaToken });
    expect(list.body.length).toBe(2);
  });

  it('rejects a requirement that names no target', async () => {
    const r = await api('/api/v1/manpower-requirements', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ designation: 'Guard', requiredCount: 2, effectiveFrom: day(0) }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('TARGET_REQUIRED');
  });

  it('deploys employees to the contract', async () => {
    for (const employeeId of employeeIds) {
      const r = await api('/api/v1/allocations', {
        method: 'POST', token: alphaToken,
        body: JSON.stringify({
          employeeId, contractId, clientId,
          designation: 'Housekeeping', category: 'UNSKILLED',
          startDate: day(-20),
        }),
      });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('ACTIVE');
    }
    const list = await api(`/api/v1/allocations?contractId=${contractId}`, { token: alphaToken });
    expect(list.body.length).toBe(3);
  });

  it('refuses to deploy the same person twice for an overlapping period', async () => {
    const r = await api('/api/v1/allocations', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        employeeId: employeeIds[0], contractId, startDate: day(-5),
      }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('ALREADY_DEPLOYED');
  });

  it('refuses to deploy onto a contract that is not active', async () => {
    const draft = await api('/api/v1/contracts', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ clientId, startDate: day(0), endDate: day(300) }),
    });
    const e = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken, body: JSON.stringify({ name: `DraftDeploy ${stamp}` }),
    });
    const r = await api('/api/v1/allocations', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId: e.body.id, contractId: draft.body.id, startDate: day(0) }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('CONTRACT_NOT_ACTIVE');
  });

  it('reconciles deployed strength against the requirement', async () => {
    const r = await api(`/api/v1/workforce/strength?contractId=${contractId}`, { token: alphaToken });
    expect(r.status).toBe(200);
    // 5 Housekeeping required, 3 deployed; 1 Supervisor required, 0 deployed.
    expect(r.body.required).toBe(6);
    expect(r.body.deployed).toBe(3);
    expect(r.body.variance).toBe(-3);
    expect(r.body.state).toBe('SHORT');

    const hk = r.body.lines.find((l: any) => l.designation === 'Housekeeping');
    expect(hk).toMatchObject({ required: 5, deployed: 3, variance: -2, state: 'SHORT' });
    const sup = r.body.lines.find((l: any) => l.designation === 'Supervisor');
    expect(sup).toMatchObject({ required: 1, deployed: 0, variance: -1, state: 'SHORT' });
  });

  it('reconciles correctly for a historical date', async () => {
    // Nothing was deployed 25 days ago (allocations started 20 days ago).
    const r = await api(`/api/v1/workforce/strength?contractId=${contractId}&asOn=${day(-25)}`, { token: alphaToken });
    expect(r.body.deployed).toBe(0);
    expect(r.body.variance).toBe(-6);
  });

  it('reports strength across every active contract', async () => {
    const r = await api('/api/v1/workforce/strength-by-contract', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const mine = r.body.find((x: any) => x.contractId === contractId);
    expect(mine).toBeTruthy();
    expect(mine.contractNo).toMatch(/^CTR-\d{4}-\d{4}$/);
    expect(mine).toHaveProperty('variance');
  });

  it('replacing an employee preserves the deployment history', async () => {
    const list = await api(`/api/v1/allocations?contractId=${contractId}`, { token: alphaToken });
    const original = list.body[0];

    const successor = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: `Successor ${stamp}`, designation: 'Housekeeping', basic: 14000 }),
    });

    const r = await api(`/api/v1/allocations/${original.id}/replace`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        replacementEmployeeId: successor.body.id, effectiveDate: day(0), reason: 'Attrition',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.replaced.status).toBe('REPLACED');
    expect(r.body.replacement.status).toBe('ACTIVE');

    // Headcount is unchanged: one out, one in.
    const after = await api(`/api/v1/workforce/strength?contractId=${contractId}`, { token: alphaToken });
    expect(after.body.deployed).toBe(3);

    // Replacing with the same employee is refused.
    const same = await api(`/api/v1/allocations/${r.body.replacement.id}/replace`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ replacementEmployeeId: successor.body.id }),
    });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('SAME_EMPLOYEE');
  });

  it('releasing an employee drops them from deployed strength', async () => {
    const list = await api(`/api/v1/allocations?contractId=${contractId}&status=ACTIVE`, { token: alphaToken });
    const target = list.body[0];

    const r = await api(`/api/v1/allocations/${target.id}/release`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ endDate: day(0), reason: 'Transferred' }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('RELEASED');

    const strength = await api(`/api/v1/workforce/strength?contractId=${contractId}`, { token: alphaToken });
    expect(strength.body.deployed).toBe(2);

    // Releasing twice is refused.
    const again = await api(`/api/v1/allocations/${target.id}/release`, {
      method: 'POST', token: alphaToken, body: '{}',
    });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('NOT_ACTIVE');
  });

  it('deactivating an employee closes their live deployment', async () => {
    const emp = await api('/api/v1/employees', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: `AutoRelease ${stamp}`, designation: 'Housekeeping' }),
    });
    const alloc = await api('/api/v1/allocations', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ employeeId: emp.body.id, contractId, startDate: day(-1) }),
    });
    expect(alloc.status).toBe(201);

    await api(`/api/v1/employees/${emp.body.id}/deactivate`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ reason: 'Absconded' }),
    });

    const list = await api(`/api/v1/allocations?employeeId=${emp.body.id}`, { token: alphaToken });
    expect(list.body[0].status).toBe('RELEASED');
  });
});

/* ================================================================== */
/* STATUTORY CONFIGURATION (Rule 15)                                  */
/* ================================================================== */

describe('Statutory rate sets — effective-dated, reviewed, never hardcoded', () => {
  let setId = '';

  it('exposes the legacy fallback values transparently', async () => {
    const r = await api('/api/v1/statutory/legacy-defaults', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.pfWageCap).toBe(25000);
    expect(r.body.esiGrossCeiling).toBe(21000);
    expect(r.body.warning).toContain('before running production payroll');
  });

  it('creates a rate set as PROVISIONAL', async () => {
    const r = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `EPFO-TEST-${stamp}`,
        name: 'EPFO contribution rules',
        jurisdiction: `CENTRAL-TEST-${stamp}`,
        effectiveFrom: '2026-04-01',
        effectiveTo: '2027-03-31',
        sourceReference: 'EPFO circular G.S.R. 123(E)',
        rates: [
          { code: 'PF_EE_PCT', label: 'Employee EPF share', value: 12, unit: 'PERCENT' },
          { code: 'PF_ER_PCT', label: 'Employer EPF share', value: 12, unit: 'PERCENT' },
          { code: 'PF_WAGE_CAP', label: 'EPF wage ceiling', value: 15000, unit: 'AMOUNT' },
          { code: 'ESI_GROSS_CEILING', label: 'ESI gross ceiling', value: 21000, unit: 'AMOUNT' },
        ],
        slabs: [
          { fromGross: 0, toGross: 24999.99, amount: 0 },
          { fromGross: 25000, toGross: 999999999, amount: 200, overrideMonth: 2, overrideAmount: 300 },
        ],
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PROVISIONAL');
    expect(r.body.rates).toHaveLength(4);
    expect(r.body.slabs).toHaveLength(2);
    setId = r.body.id;
  });

  it('refuses a second set covering the same days', async () => {
    const r = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `EPFO-OVERLAP-${stamp}`, name: 'Overlapping set',
        jurisdiction: `CENTRAL-TEST-${stamp}`,
        effectiveFrom: '2026-10-01', effectiveTo: '2027-06-30',
      }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('EFFECTIVE_DATE_OVERLAP');
  });

  it('refuses to confirm without naming a source', async () => {
    const r = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `EPFO-NOSRC-${stamp}`, name: 'No source',
        jurisdiction: `NOSRC-${stamp}`,
        effectiveFrom: '2026-04-01',
      }),
    });
    const confirm = await api(`/api/v1/statutory/rate-sets/${r.body.id}/confirm`, {
      method: 'POST', token: alphaToken, body: '{}',
    });
    expect(confirm.status).toBe(400);
    expect(confirm.body.error.code).toBe('SOURCE_REQUIRED');
  });

  it('confirms a reviewed set and then locks it', async () => {
    const confirm = await api(`/api/v1/statutory/rate-sets/${setId}/confirm`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ sourceReference: 'EPFO circular G.S.R. 123(E) dated 2026-03-28' }),
    });
    expect(confirm.status).toBe(201);
    expect(confirm.body.status).toBe('CONFIRMED');
    expect(confirm.body.reviewedAt).toBeTruthy();

    const edit = await api(`/api/v1/statutory/rate-sets/${setId}`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(edit.status).toBe(400);
    expect(edit.body.error.code).toBe('LOCKED');

    const addRate = await api(`/api/v1/statutory/rate-sets/${setId}/rates`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ code: 'EDLI_PCT', label: 'EDLI', value: 0.5 }),
    });
    expect(addRate.status).toBe(400);
    expect(addRate.body.error.code).toBe('LOCKED');
  });

  it('resolves the set in force for a date', async () => {
    const r = await api(
      `/api/v1/statutory/rate-sets/in-force?jurisdiction=CENTRAL-TEST-${stamp}&asOn=2026-09-15`,
      { token: alphaToken },
    );
    expect(r.status).toBe(200);
    expect(r.body.rateSet).toBeTruthy();
    const cap = r.body.rateSet.rates.find((x: any) => x.code === 'PF_WAGE_CAP');
    expect(Number(cap.value)).toBe(15000);

    const outside = await api(
      `/api/v1/statutory/rate-sets/in-force?jurisdiction=CENTRAL-TEST-${stamp}&asOn=2025-01-01`,
      { token: alphaToken },
    );
    expect(outside.body.rateSet).toBeNull();
    expect(outside.body.warning).toContain('legacy defaults');
  });

  it('rejects a rate code that is not UPPER_SNAKE_CASE', async () => {
    const r = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `BADCODE-${stamp}`, name: 'Bad codes', jurisdiction: `BAD-${stamp}`,
        effectiveFrom: '2026-04-01',
        rates: [{ code: 'pf-ee-pct', label: 'x', value: 12 }],
      }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_RATE_CODE');
  });

  it('a contested set carries the reason', async () => {
    const set = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        code: `CONTEST-${stamp}`, name: 'Disputed set', jurisdiction: `CONTEST-${stamp}`,
        effectiveFrom: '2026-04-01',
      }),
    });
    const r = await api(`/api/v1/statutory/rate-sets/${set.body.id}/contest`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ reason: 'Figures conflict with the state notification dated 2026-03-15' }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('CONTESTED');
    expect(r.body.reviewNotes).toContain('state notification');

    const tooShort = await api(`/api/v1/statutory/rate-sets/${set.body.id}/contest`, {
      method: 'POST', token: alphaToken, body: JSON.stringify({ reason: 'wrong' }),
    });
    expect(tooShort.status).toBe(400);
  });
});

describe('Minimum wage floor checks', () => {
  const regime = `KA-TEST-${stamp}`;

  it('records an effective-dated minimum wage as PROVISIONAL', async () => {
    const r = await api('/api/v1/statutory/minimum-wages', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        regime, zone: 'Zone 1', category: 'UNSKILLED', monthlyWage: 18000,
        effectiveFrom: '2026-04-01', sourceReference: 'Karnataka notification LD 2026',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PROVISIONAL');
  });

  it('resolves the rate in force', async () => {
    const r = await api(
      `/api/v1/statutory/minimum-wages/resolve?regime=${regime}&zone=Zone%201&category=UNSKILLED&asOn=2026-09-01`,
      { token: alphaToken },
    );
    expect(r.status).toBe(200);
    expect(Number(r.body.rate.monthlyWage)).toBe(18000);
  });

  it('returns null rather than guessing for an unconfigured combination', async () => {
    const r = await api(
      `/api/v1/statutory/minimum-wages/resolve?regime=${regime}&zone=Zone%209&category=SKILLED&asOn=2026-09-01`,
      { token: alphaToken },
    );
    expect(r.body.rate).toBeNull();
    expect(r.body.warning).toContain('block rather than guess');
  });

  it('blocks when eligible employees fall below the floor', async () => {
    // Housekeeping staff are at basic 16000 + da 2000 = 18000, exactly the floor.
    const r = await api(
      `/api/v1/statutory/minimum-wages/floor-check?regime=${regime}&zone=Zone%201&category=UNSKILLED&asOn=2026-09-01`,
      { token: alphaToken },
    );
    expect(r.status).toBe(200);
    expect(r.body.checked).toBeGreaterThan(0);
    expect(typeof r.body.compliant).toBe('boolean');
    expect(Array.isArray(r.body.breaches)).toBe(true);
    // Everyone under the floor must carry a positive shortfall.
    for (const b of r.body.breaches) {
      if (!r.body.missingRates.includes(b.category)) {
        expect(b.shortfall).toBeGreaterThan(0);
      }
    }
  });
});

/* ================================================================== */
/* TENANT ISOLATION                                                   */
/* ================================================================== */

describe('Phase 4 tenant isolation', () => {
  it("bravo cannot see alpha's employees", async () => {
    const mine = await api('/api/v1/employees?pageSize=100', { token: alphaToken });
    const theirs = await api('/api/v1/employees?pageSize=100', { token: bravoToken });
    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);

    const alphaIds = new Set(mine.body.items.map((e: any) => e.id));
    for (const e of theirs.body.items) expect(alphaIds.has(e.id)).toBe(false);
  });

  it("bravo cannot open an alpha employee by id, and cannot reveal its PII", async () => {
    const mine = await api('/api/v1/employees?pageSize=1', { token: alphaToken });
    const id = mine.body.items[0].id;

    const detail = await api(`/api/v1/employees/${id}`, { token: bravoToken });
    expect(detail.status).toBe(404);

    const reveal = await api(`/api/v1/employees/${id}/reveal-pii`, {
      method: 'POST', token: bravoToken,
      body: JSON.stringify({ reason: 'Trying to read another tenant, should be blocked' }),
    });
    expect(reveal.status).toBe(404);
  });

  it("bravo cannot see alpha's allocations or manpower requirements", async () => {
    const mine = await api('/api/v1/allocations?pageSize=100', { token: alphaToken });
    const theirs = await api('/api/v1/allocations?pageSize=100', { token: bravoToken });
    const alphaIds = new Set(mine.body.map((a: any) => a.id));
    for (const a of theirs.body) expect(alphaIds.has(a.id)).toBe(false);

    const reqs = await api('/api/v1/manpower-requirements', { token: alphaToken });
    const bravoReqs = await api('/api/v1/manpower-requirements', { token: bravoToken });
    const alphaReqIds = new Set(reqs.body.map((r: any) => r.id));
    for (const r of bravoReqs.body) expect(alphaReqIds.has(r.id)).toBe(false);
  });

  it("bravo's strength report never includes alpha's contracts", async () => {
    const mine = await api('/api/v1/workforce/strength-by-contract', { token: alphaToken });
    const theirs = await api('/api/v1/workforce/strength-by-contract', { token: bravoToken });
    const alphaIds = new Set(mine.body.map((x: any) => x.contractId));
    for (const row of theirs.body) expect(alphaIds.has(row.contractId)).toBe(false);
  });

  it("bravo cannot read alpha's statutory rate sets", async () => {
    const mine = await api('/api/v1/statutory/rate-sets', { token: alphaToken });
    const theirs = await api('/api/v1/statutory/rate-sets', { token: bravoToken });
    const alphaIds = new Set(mine.body.map((s: any) => s.id));
    for (const s of theirs.body) expect(alphaIds.has(s.id)).toBe(false);
  });
});

/* ================================================================== */
/* RBAC                                                               */
/* ================================================================== */

describe('Phase 4 RBAC', () => {
  it('a payroll approver can approve but cannot prepare payroll', async () => {
    const email = `approver-${stamp}@alpha.test`;
    const created = await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ email, name: 'Payroll Approver', password: 'Approver!2026', roles: ['payroll_approver'] }),
    });
    expect(created.status).toBe(201);

    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'Approver!2026' }),
    });
    const me = await api('/api/v1/auth/me', { token: login.body.token });
    expect(me.body.permissions).toContain('payroll:approve');
    expect(me.body.permissions).not.toContain('payroll:prepare');
    // An approver may see employees but not edit them.
    expect(me.body.permissions).toContain('employee:read');
    expect(me.body.permissions).not.toContain('employee:write');

    const list = await api('/api/v1/employees', { token: login.body.token });
    expect(list.status).toBe(200);

    const create = await api('/api/v1/employees', {
      method: 'POST', token: login.body.token,
      body: JSON.stringify({ name: 'Sneaky' }),
    });
    expect(create.status).toBe(403);
  });

  it('an HR manager cannot write statutory configuration', async () => {
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email: `hr-${stamp}@alpha.test`, password: 'HrManager!2026' }),
    });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const read = await api('/api/v1/statutory/rate-sets', { token });
    expect(read.status).toBe(200);

    const write = await api('/api/v1/statutory/rate-sets', {
      method: 'POST', token,
      body: JSON.stringify({ code: 'X', name: 'X', effectiveFrom: '2026-01-01' }),
    });
    expect(write.status).toBe(403);
  });

  it('rejects unauthenticated access to every Phase 4 resource', async () => {
    for (const path of [
      '/api/v1/employees', '/api/v1/employees/summary', '/api/v1/allocations',
      '/api/v1/manpower-requirements', '/api/v1/workforce/strength', '/api/v1/statutory/rate-sets',
    ]) {
      const r = await api(path);
      expect(r.status, path).toBe(401);
    }
  });
});
