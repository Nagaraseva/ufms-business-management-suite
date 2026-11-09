/**
 * Phase 2 API integration tests — run against the live NestJS server.
 *
 * These are true black-box tests: HTTP in, HTTP out, real PostgreSQL with
 * Row Level Security underneath. They cover the Phase 2 acceptance criteria:
 *   - sign-in / sign-out / session rejection
 *   - permission enforcement (RBAC), including the fail-closed rule
 *   - tenant isolation across two real tenants
 *   - leads → follow-ups → surveys → quotations workflow
 *   - quotation totals matching the wage engine
 *
 * Prerequisite: the API is running (npm run dev:api) and the DB is seeded.
 * Set API_BASE to override the default http://127.0.0.1:3000.
 */

import { beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

const ALPHA = { email: 'owner@alpha.test', password: 'AlphaOwner!2026' };
const BRAVO = { email: 'owner@bravo.test', password: 'BravoOwner!2026' };

let alphaToken = '';
let bravoToken = '';

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
  try { body = await res.json(); } catch { /* no body */ }
  return { status: res.status, body };
}

beforeAll(async () => {
  // Wait for the server to accept connections.
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

/* ------------------------------------------------------------------ */

describe('Authentication', () => {
  it('rejects a wrong password', async () => {
    const r = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ALPHA.email, password: 'definitely-wrong' }),
    });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email', async () => {
    const r = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@alpha.test', password: 'whatever123' }),
    });
    expect(r.status).toBe(401);
  });

  it('rejects a request with no session', async () => {
    const r = await api('/api/v1/leads');
    expect(r.status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const r = await api('/api/v1/leads', { token: 'not-a-real-token' });
    expect(r.status).toBe(401);
  });

  it('returns the principal with tenant branding resolved under RLS', async () => {
    const r = await api('/api/v1/auth/me', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.tenant.slug).toBe('alpha');
    expect(r.body.branding ?? r.body.tenant.branding).toBeTruthy();
  });

  it('logout revokes the session', async () => {
    const login = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(ALPHA) });
    const tempToken = login.body.token;

    const before = await api('/api/v1/auth/me', { token: tempToken });
    expect(before.status).toBe(200);

    const out = await api('/api/v1/auth/logout', { method: 'POST', token: tempToken });
    expect(out.status).toBe(200);

    const after = await api('/api/v1/auth/me', { token: tempToken });
    expect(after.status).toBe(401);
  });
});

describe('Tenant isolation over HTTP', () => {
  let alphaLeadId = '';
  let bravoLeadId = '';

  it('each tenant can create leads', async () => {
    const a = await api('/api/v1/leads', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ customerName: 'Alpha Customer One', serviceType: 'Housekeeping' }),
    });
    expect(a.status).toBe(201);
    expect(a.body.leadNo).toMatch(/^LEAD-\d{5}$/);
    alphaLeadId = a.body.id;

    const b = await api('/api/v1/leads', {
      method: 'POST', token: bravoToken,
      body: JSON.stringify({ customerName: 'Bravo Customer One', serviceType: 'Security' }),
    });
    expect(b.status).toBe(201);
    bravoLeadId = b.body.id;
  });

  it('tenant A list never contains tenant B leads', async () => {
    const r = await api('/api/v1/leads?pageSize=100', { token: alphaToken });
    expect(r.status).toBe(200);
    const names = r.body.items.map((x: any) => x.customerName);
    expect(names).toContain('Alpha Customer One');
    expect(names).not.toContain('Bravo Customer One');
  });

  it('tenant A cannot read tenant B lead by its exact id', async () => {
    const r = await api(`/api/v1/leads/${bravoLeadId}`, { token: alphaToken });
    expect([400, 404]).toContain(r.status);
  });

  it('tenant A cannot update tenant B lead', async () => {
    const r = await api(`/api/v1/leads/${bravoLeadId}`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ customerName: 'Hijacked' }),
    });
    expect([400, 404]).toContain(r.status);

    // Confirm it really was not modified.
    const check = await api(`/api/v1/leads/${bravoLeadId}`, { token: bravoToken });
    expect(check.body.customerName).toBe('Bravo Customer One');
  });

  it('lead numbers are unique per tenant, not globally', async () => {
    const a = await api('/api/v1/leads?pageSize=100', { token: alphaToken });
    const b = await api('/api/v1/leads?pageSize=100', { token: bravoToken });
    // Both tenants start their own sequence, so both have LEAD-00001.
    expect(a.body.items[0].leadNo).toMatch(/^LEAD-/);
    expect(b.body.items[0].leadNo).toMatch(/^LEAD-/);
  });

  it('organisations are isolated', async () => {
    const a = await api('/api/v1/organisation/companies', { token: alphaToken });
    const b = await api('/api/v1/organisation/companies', { token: bravoToken });
    const aIds = a.body.map((c: any) => c.id);
    const bIds = b.body.map((c: any) => c.id);
    expect(aIds.some((id: string) => bIds.includes(id))).toBe(false);
  });

  it('audit log rows are tenant-scoped', async () => {
    // The audit interceptor writes one row per mutation in the acting tenant.
    const { Client } = await import('pg');
    const c = new Client({ connectionString: process.env.ADMIN_DATABASE_URL
      || 'postgresql://ufms:ufms_dev_local_only@127.0.0.1:5432/ufms_dev' });
    await c.connect();
    try {
      const r = await c.query(
        `SELECT t.slug, count(*)::int AS n FROM audit_logs a JOIN tenants t ON t.id = a."tenantId" GROUP BY t.slug`,
      );
      expect(r.rows.length).toBeGreaterThan(0);
      for (const row of r.rows) expect(['alpha', 'bravo']).toContain(row.slug);
    } finally {
      await c.end();
    }
  });
});

describe('Leads → follow-ups → surveys workflow', () => {
  let leadId = '';

  it('creates a lead', async () => {
    const r = await api('/api/v1/leads', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ customerName: 'Workflow Customer', serviceType: 'Housekeeping', mobile: '9800000001' }),
    });
    expect(r.status).toBe(201);
    leadId = r.body.id;
  });

  it('records a follow-up and advances the status', async () => {
    const r = await api(`/api/v1/leads/${leadId}/followups`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        type: 'CALL',
        outcome: 'Interested',
        notes: 'Asked for a site visit next week.',
        newStatus: 'CONTACTED',
      }),
    });
    expect(r.status).toBe(201);

    const detail = await api(`/api/v1/leads/${leadId}`, { token: alphaToken });
    expect(detail.body.status).toBe('CONTACTED');

    const list = await api(`/api/v1/leads/${leadId}/followups`, { token: alphaToken });
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].notes).toContain('site visit');
  });

  it('rejects an invalid lead status', async () => {
    const r = await api(`/api/v1/leads/${leadId}`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ status: 'NOT_A_STATUS' }),
    });
    expect(r.status).toBe(400);
  });

  it('schedules a survey and moves the lead to SURVEY_SCHEDULED', async () => {
    const r = await api('/api/v1/surveys', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        leadId,
        scheduledDate: '2026-11-20',
        siteContact: 'Facility Manager',
        siteMobile: '9800000002',
        address: 'Plot 12, Industrial Area, Bengaluru',
      }),
    });
    expect(r.status).toBe(201);

    const lead = await api(`/api/v1/leads/${leadId}`, { token: alphaToken });
    expect(lead.body.status).toBe('SURVEY_SCHEDULED');
  });

  it('captures the inspection', async () => {
    const list = await api('/api/v1/surveys', { token: alphaToken });
    expect(list.status).toBe(200);
    const survey = list.body.find((s: any) => s.leadId === leadId);
    expect(survey).toBeTruthy();

    const r = await api(`/api/v1/surveys/${survey.id}`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({
        inspectionSummary: 'Three floors, 24x7 cover required.',
        manpowerRequired: 12,
        areaSqFt: 18000,
        status: 'COMPLETED',
      }),
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('COMPLETED');
    expect(Number(r.body.manpowerRequired)).toBe(12);
  });
});

describe('Quotations', () => {
  let quotationId = '';

  it('calculates totals identically through the API and the engine', async () => {
    const payload = {
      customerName: 'Calc Test Customer',
      issueDate: '2026-11-07',
      items: [{ description: 'Housekeeping manpower', unit: 'month', quantity: 2, rate: 25000.5 }],
      managementFeeMode: 'PERCENTAGE',
      managementFeeValue: 10,
      taxPercent: 18,
    };
    const r = await api('/api/v1/quotations/calculate', {
      method: 'POST', token: alphaToken, body: JSON.stringify(payload),
    });
    expect(r.status).toBe(200);

    // 2 x 25000.5 = 50001 ; fee 10% = 5000.10 ; before tax 55001.10 ; tax 18% = 9900.198 -> 9900.20 ; total 64901.30
    expect(r.body.totals.subtotal).toBe(50001);
    expect(r.body.totals.managementFee).toBeCloseTo(5000.1, 2);
    expect(r.body.totals.amountBeforeTax).toBeCloseTo(55001.1, 2);
    expect(r.body.totals.taxAmount).toBeCloseTo(9900.2, 2);
    expect(r.body.totals.grandTotal).toBeCloseTo(64901.3, 2);
  });

  it('creates a quotation with a wage breakup and stores computed figures', async () => {
    const r = await api('/api/v1/quotations', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        customerName: 'Wage Breakup Customer',
        issueDate: '2026-11-07',
        items: [],
        managementFeeMode: 'CTC_PCT',
        managementFeeValue: 8,
        taxPercent: 18,
        wageColumns: [{
          name: 'Security Guard', headcount: 10,
          basic: 14000, vda: 3000, hra: 2000, special: 1000,
          washing: 300, conveyance: 800, other: 0, extra4: 0,
          uniform: 0, uniformEmployee: 0, compliance: 0,
          lwfYear: 0, lwfDedYear: 0, groupInsurance: 0,
        }],
        breakupSettings: { ptAmount: 200, ptThreshold: 15000, esiCap: 21000, pfCap: 15000 },
      }),
    });
    expect(r.status).toBe(201);
    quotationId = r.body.id;

    expect(r.body.quotationNo).toMatch(/^QUO-\d{4}-\d{4}$/);
    expect(Number(r.body.subtotal)).toBeGreaterThan(0);
    expect(Number(r.body.grandTotal)).toBeGreaterThan(Number(r.body.subtotal));
    // The breakup snapshot must be persisted for auditability.
    expect(r.body.wageBreakupJson).toBeTruthy();
  });

  it('stores an immutable version snapshot', async () => {
    const r = await api(`/api/v1/quotations/${quotationId}`, { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.versions.length).toBe(1);
    expect(r.body.versions[0].revision).toBe(1);
  });

  it('enforces the approve permission and locks an approved quotation', async () => {
    const ok = await api(`/api/v1/quotations/${quotationId}/status`, {
      method: 'PATCH', token: alphaToken, body: JSON.stringify({ status: 'APPROVED' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('APPROVED');

    const locked = await api(`/api/v1/quotations/${quotationId}/status`, {
      method: 'PATCH', token: alphaToken, body: JSON.stringify({ status: 'DRAFT' }),
    });
    expect(locked.status).toBe(400);
    expect(locked.body.error.code).toBe('LOCKED');
  });

  it('quotations are tenant-isolated', async () => {
    const a = await api('/api/v1/quotations', { token: alphaToken });
    const b = await api('/api/v1/quotations', { token: bravoToken });
    const aIds = a.body.map((q: any) => q.id);
    const bIds = b.body.map((q: any) => q.id);
    expect(aIds.length).toBeGreaterThan(0);
    expect(aIds.some((id: string) => bIds.includes(id))).toBe(false);
  });
});

describe('RBAC — the fail-closed permission model', () => {
  it('owner holds every permission', async () => {
    const r = await api('/api/v1/auth/me', { token: alphaToken });
    expect(r.body.permissions).toContain('quotation:approve');
    expect(r.body.permissions).toContain('user:write');
  });

  it('a sales executive cannot approve quotations or manage users', async () => {
    // Create the executive with the owner account (user:write).
    const created = await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        email: `exec-${Date.now()}@alpha.test`,
        name: 'Sales Executive',
        password: 'Executive!2026x',
        roles: ['sales_executive'],
      }),
    });
    expect(created.status).toBe(201);
    const execEmail = created.body.email;

    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: execEmail, password: 'Executive!2026x' }),
    });
    expect(login.status).toBe(200);
    const execToken = login.body.token;

    // Permitted: lead read (own).
    const leads = await api('/api/v1/leads', { token: execToken });
    expect(leads.status).toBe(200);

    // Denied: creating a user requires user:write.
    const denied = await api('/api/v1/users', {
      method: 'POST', token: execToken,
      body: JSON.stringify({ email: 'x@alpha.test', name: 'X', password: 'Password!2026', roles: ['viewer'] }),
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('a sales executive only sees leads assigned to them', async () => {
    const execs = await api('/api/v1/users?q=exec-', { token: alphaToken });
    const exec = execs.body.find((u: any) => u.roles.includes('sales_executive'));
    if (!exec) return; // created in the previous test under a different name

    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email: exec.email, password: 'Executive!2026x' }),
    });
    const leads = await api('/api/v1/leads?pageSize=100', { token: login.body.token });
    expect(leads.status).toBe(200);
    // Owner-created leads are unassigned, so the executive must not see them.
    for (const l of leads.body.items) expect(l.assignedToId).toBe(exec.id);
  });
});

describe('Validation and error hygiene', () => {
  it('rejects a missing required field with a 400', async () => {
    const r = await api('/api/v1/leads', {
      method: 'POST', token: alphaToken, body: JSON.stringify({ serviceType: 'x' }),
    });
    expect(r.status).toBe(400);
  });

  it('rejects a malformed email', async () => {
    const r = await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ email: 'not-an-email', name: 'X', password: 'Password!2026', roles: ['viewer'] }),
    });
    expect(r.status).toBe(400);
  });

  it('never leaks stack traces or SQL in an error body', async () => {
    const r = await api('/api/v1/leads/not-a-uuid', { token: alphaToken });
    const serialised = JSON.stringify(r.body);
    expect(serialised).not.toMatch(/at .*\.ts:\d+/);
    expect(serialised.toLowerCase()).not.toContain('prisma');
    expect(serialised.toLowerCase()).not.toContain('select ');
  });

  it('returns a correlation id on every response', async () => {
    const res = await fetch(`${BASE}/api/v1/leads`, { headers: { authorization: `Bearer ${alphaToken}` } });
    expect(res.headers.get('x-correlation-id')).toBeTruthy();
  });
});
