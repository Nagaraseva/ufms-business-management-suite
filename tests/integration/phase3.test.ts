/**
 * Phase 3 API integration tests — Tenders, Clients/Contracts, SLA & Client Care.
 *
 * Black box against the running NestJS server: HTTP in, HTTP out, real
 * PostgreSQL with Row Level Security underneath. Covers the Phase 3
 * acceptance criteria:
 *   - tender creation without any Lead, with TND-YYYY-NNNN allocation
 *   - the follow-up state machine and the FINANCIALLY_WON → order rule
 *   - submission-date ordering with undated tenders sorting last
 *   - client/contract lifecycle incl. mobilisation guards
 *   - SLA clock derivation and complaint breach detection
 *   - tenant isolation on every one of the new resources
 *
 * Prerequisite: API running, DB seeded (see tests/integration/api.test.ts).
 */

import { beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
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
/* TENDERS                                                            */
/* ================================================================== */

describe('Tenders — creation independent of Lead ID', () => {
  let tenderId = '';
  let tenderNo = '';

  it('creates a tender with no Lead reference at all', async () => {
    const r = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        tenderTitle: `Housekeeping services — ${stamp}`,
        portal: 'GeM',
        organization: 'Karnataka State Police Housing Corp',
        sector: 'Government',
        location: 'Bengaluru',
        tenderFee: 1000,
        emdAmount: 50000,
        tenderValue: 2400000,
        manpowerCount: '45',
        tenureMonths: 12,
        submissionDate: day(10),
        scope: 'Housekeeping and sanitation for 3 office blocks',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.status).toBe('NEW');
    // No column in the row, and no payload field, references a lead.
    expect(r.body.leadId).toBeUndefined();
    tenderId = r.body.id;
    tenderNo = r.body.tenderNo;
  });

  it('allocates a TND-YYYY-NNNN business number', async () => {
    expect(tenderNo).toMatch(/^TND-\d{4}-\d{4}$/);
    // Year segment follows the submission date's year.
    expect(tenderNo.slice(4, 8)).toBe(String(new Date(day(10)).getUTCFullYear()));
  });

  it('opens the first follow-up entry alongside the tender', async () => {
    const r = await api(`/api/v1/tenders/${tenderId}/followups`, { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].status).toBe('NEW');
  });

  it('rejects a second tender with the same manual number, case-insensitively', async () => {
    const base = {
      tenderTitle: 'Duplicate probe', portal: 'GeM', sector: 'Government',
      submissionDate: day(5), tenderNo: `portal-${stamp}`,
    };
    const first = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken, body: JSON.stringify(base),
    });
    expect(first.status).toBe(201);
    expect(first.body.tenderNo).toBe(`portal-${stamp}`);

    const dup = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ ...base, tenderNo: `PORTAL-${stamp}` }),
    });
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('DUPLICATE_TENDER_NO');
  });

  it('rejects a tender with no submission date or no title', async () => {
    const noTitle = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ portal: 'GeM', sector: 'Government', submissionDate: day(5) }),
    });
    expect(noTitle.status).toBe(400);

    const noDate = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ tenderTitle: 'No date', portal: 'GeM', sector: 'Government' }),
    });
    expect(noDate.status).toBe(400);
  });

  it('orders the list by submission date with undated tenders last', async () => {
    const r = await api('/api/v1/tenders?pageSize=100', { token: alphaToken });
    expect(r.status).toBe(200);
    const dates = r.body.items
      .filter((t: any) => t.submissionDate)
      .map((t: any) => String(t.submissionDate).slice(0, 10));
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('excludes DRAFT tenders from the list, search and metrics', async () => {
    const list = await api('/api/v1/tenders?q=DUPLICATE_PROBE_NEVER_MATCHES&pageSize=100', { token: alphaToken });
    expect(list.status).toBe(200);
    for (const t of list.body.items) expect(t.status).not.toBe('DRAFT');
  });

  it('reports dashboard metrics', async () => {
    const r = await api('/api/v1/tenders/metrics', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('totalOpen');
    expect(r.body).toHaveProperty('dueToday');
    expect(r.body).toHaveProperty('won');
    expect(typeof r.body.totalOpen).toBe('number');
  });
});

describe('Tender follow-ups — the status machine', () => {
  let tenderId = '';

  beforeAll(async () => {
    const r = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        tenderTitle: `Follow-up probe ${stamp}`,
        portal: 'CPPP', sector: 'Healthcare',
        submissionDate: day(20), tenderValue: 900000,
      }),
    });
    tenderId = r.body.id;
  });

  it('refuses to set the status back to NEW', async () => {
    const r = await api(`/api/v1/tenders/${tenderId}/followups`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ status: 'NEW', notes: 'should not be allowed' }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_STATUS');
  });

  it('refuses an unknown status', async () => {
    const r = await api(`/api/v1/tenders/${tenderId}/followups`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ status: 'MADE_UP', notes: 'x' }),
    });
    expect(r.status).toBe(400);
  });

  it('advances through the pipeline', async () => {
    const steps = ['DOCUMENTS_PENDING', 'READY_TO_SUBMIT', 'SUBMITTED', 'TECHNICALLY_QUALIFIED'];
    for (const status of steps) {
      const r = await api(`/api/v1/tenders/${tenderId}/followups`, {
        method: 'POST', token: alphaToken,
        body: JSON.stringify({ status, notes: `Moved to ${status}` }),
      });
      expect(r.status).toBe(201);
      expect(r.body.tender.status).toBe(status);
    }
    const detail = await api(`/api/v1/tenders/${tenderId}`, { token: alphaToken });
    expect(detail.body.status).toBe('TECHNICALLY_QUALIFIED');
  });

  it('auto-creates exactly one order on FINANCIALLY_WON', async () => {
    const win = await api(`/api/v1/tenders/${tenderId}/followups`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ status: 'FINANCIALLY_WON', notes: 'L1 — award received', amountQuoted: 875000 }),
    });
    expect(win.status).toBe(201);
    expect(win.body.orderId).toBeTruthy();

    // A repeated win must not create a second order.
    const again = await api(`/api/v1/tenders/${tenderId}/followups`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ status: 'FINANCIALLY_WON', notes: 'Award re-confirmed' }),
    });
    expect(again.status).toBe(201);
    expect(again.body.orderId).toBe(win.body.orderId);

    const detail = await api(`/api/v1/tenders/${tenderId}`, { token: alphaToken });
    expect(detail.body.order).toBeTruthy();
    expect(detail.body.order.contractValue).toBe('875000');
  });

  it('records a result reason when a tender is lost', async () => {
    const r = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        tenderTitle: `Lost probe ${stamp}`, portal: 'eProcure', sector: 'Education',
        submissionDate: day(3),
      }),
    });
    const lost = await api(`/api/v1/tenders/${r.body.id}/followups`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ status: 'LOST', notes: 'Outbid on price by 6%' }),
    });
    expect(lost.status).toBe(201);
    expect(lost.body.tender.resultReason).toBe('Outbid on price by 6%');
    expect(lost.body.orderId).toBeNull();
  });
});

/* ================================================================== */
/* CLIENTS + CONTRACTS                                                */
/* ================================================================== */

describe('Clients and contracts', () => {
  let clientId = '';
  let clientCode = '';
  let contractId = '';

  it('creates a client without a Lead', async () => {
    const r = await api('/api/v1/clients', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        companyName: `Meridian Facilities ${stamp}`,
        legalName: 'Meridian Facilities Pvt Ltd',
        gstin: '29aabcM1234n1z5',
        pan: 'AABCM1234N',
        primaryEmail: `ops-${stamp}@meridian.test`,
        primaryPhone: '+91 80 4123 5566',
        paymentTerms: 'Net 30',
      }),
    });
    expect(r.status).toBe(201);
    clientId = r.body.id;
    clientCode = r.body.clientCode;
    expect(clientCode).toMatch(/^CLT-\d{4}$/);
    // Stored normalised, not as typed.
    expect(r.body.gstin).toBe('29AABCM1234N1Z5');
    expect(r.body.pan).toBe('AABCM1234N');
  });

  it('adds a contact', async () => {
    const r = await api(`/api/v1/clients/${clientId}/contacts`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ name: 'Ravi Kumar', designation: 'Admin Head', mobile: '+91 98450 11223', isPrimary: true }),
    });
    expect(r.status).toBe(201);
    expect(r.body.isPrimary).toBe(true);

    const list = await api(`/api/v1/clients/${clientId}/contacts`, { token: alphaToken });
    expect(list.body.length).toBe(1);
  });

  it('rejects a duplicate client code', async () => {
    const r = await api('/api/v1/clients', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ companyName: 'Copycat', clientCode }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('DUPLICATE_CLIENT_CODE');
  });

  it('creates a contract in DRAFT', async () => {
    const r = await api('/api/v1/contracts', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        clientId,
        serviceType: 'Housekeeping',
        contractValue: 2400000,
        startDate: day(0),
        endDate: day(365),
        paymentTerms: 'Net 30',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.contractNo).toMatch(/^CTR-\d{4}-\d{4}$/);
    contractId = r.body.id;
  });

  it('rejects a contract whose end date precedes its start date', async () => {
    const r = await api('/api/v1/contracts', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ clientId, startDate: day(30), endDate: day(1) }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_PERIOD');
  });

  it('refuses to mobilise a DRAFT contract', async () => {
    const r = await api(`/api/v1/contracts/${contractId}/mobilise`, { method: 'POST', token: alphaToken });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('NOT_ACTIVE');
  });

  it('activates then mobilises exactly once', async () => {
    const act = await api(`/api/v1/contracts/${contractId}/status`, {
      method: 'PATCH', token: alphaToken, body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expect(act.status).toBe(200);
    expect(act.body.status).toBe('ACTIVE');

    const mob = await api(`/api/v1/contracts/${contractId}/mobilise`, { method: 'POST', token: alphaToken });
    expect(mob.status).toBe(201);
    expect(mob.body.mobilisedAt).toBeTruthy();
    expect(mob.body.mobilisedById).toBeTruthy();

    const again = await api(`/api/v1/contracts/${contractId}/mobilise`, { method: 'POST', token: alphaToken });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ALREADY_MOBILISED');
  });

  it('rejects an unknown contract status', async () => {
    const r = await api(`/api/v1/contracts/${contractId}/status`, {
      method: 'PATCH', token: alphaToken, body: JSON.stringify({ status: 'SIGNED_OFF' }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_STATUS');
  });

  it('lists contracts due for renewal', async () => {
    const r = await api('/api/v1/contracts/expiring', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

/* ================================================================== */
/* SLA + CLIENT CARE                                                  */
/* ================================================================== */

describe('SLA agreements and complaints', () => {
  let clientId = '';
  let slaId = '';
  let ticketId = '';

  beforeAll(async () => {
    const c = await api('/api/v1/clients', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ companyName: `Northgate Retail ${stamp}` }),
    });
    clientId = c.body.id;
  });

  it('creates an SLA agreement', async () => {
    const r = await api('/api/v1/sla', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        clientId, title: 'Housekeeping SLA 2026',
        responseHours: 4, resolutionHours: 24,
        uptimeTarget: 99.5, startDate: day(0),
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.agreementNo).toMatch(/^SLA-\d{4}$/);
    slaId = r.body.id;
  });

  it('attaches the active SLA automatically and derives the due time', async () => {
    const before = Date.now();
    const r = await api('/api/v1/complaints', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({
        clientId, subject: 'Washroom supplies not replenished',
        description: 'Third floor washrooms had no consumables this morning.',
        priority: 'HIGH', category: 'Consumables',
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.slaId).toBe(slaId);
    expect(r.body.ticketNo).toMatch(/^TKT-\d{4}-\d{4}$/);
    expect(r.body.status).toBe('OPEN');

    const due = new Date(r.body.dueAt).getTime();
    const expected = before + 24 * 3_600_000;
    expect(Math.abs(due - expected)).toBeLessThan(120_000); // within 2 minutes
    ticketId = r.body.id;
  });

  it('stamps the first response when the ticket moves off OPEN', async () => {
    const r = await api(`/api/v1/complaints/${ticketId}`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    expect(r.status).toBe(200);
    expect(r.body.firstResponseAt).toBeTruthy();
  });

  it('computes breach state live rather than trusting a stored flag', async () => {
    const list = await api('/api/v1/complaints?openOnly=true', { token: alphaToken });
    expect(list.status).toBe(200);
    const t = list.body.find((x: any) => x.id === ticketId);
    expect(t).toBeTruthy();
    expect(t.breached).toBe(false); // due in 24h, not yet breached
    expect(t.overdueHours).toBe(0);
  });

  it('resolves a ticket and accepts feedback only once resolved', async () => {
    const early = await api(`/api/v1/complaints/${ticketId}/feedback`, {
      method: 'POST', token: alphaToken, body: JSON.stringify({ rating: 5 }),
    });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('NOT_RESOLVED');

    const res = await api(`/api/v1/complaints/${ticketId}`, {
      method: 'PATCH', token: alphaToken,
      body: JSON.stringify({ status: 'RESOLVED', resolution: 'Consumables restocked and schedule fixed.' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.resolvedAt).toBeTruthy();

    const fb = await api(`/api/v1/complaints/${ticketId}/feedback`, {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ rating: 4, notes: 'Fixed quickly.' }),
    });
    expect(fb.status).toBe(201);
    expect(fb.body.feedbackRating).toBe(4);
  });

  it('rejects a rating outside 1..5', async () => {
    const r = await api(`/api/v1/complaints/${ticketId}/feedback`, {
      method: 'POST', token: alphaToken, body: JSON.stringify({ rating: 9 }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_RATING');
  });

  it('reports a client-care summary', async () => {
    const r = await api('/api/v1/client-care/summary', { token: alphaToken });
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body).toHaveProperty('breachRatePct');
    expect(r.body).toHaveProperty('avgResolutionHours');
    expect(r.body.byPriority).toHaveProperty('HIGH');
  });

  it('rejects an unknown complaint status', async () => {
    const r = await api(`/api/v1/complaints/${ticketId}`, {
      method: 'PATCH', token: alphaToken, body: JSON.stringify({ status: 'PENDING_VENDOR' }),
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_STATUS');
  });
});

/* ================================================================== */
/* TENANT ISOLATION                                                   */
/* ================================================================== */

describe('Phase 3 tenant isolation', () => {
  it("bravo cannot read alpha's tenders", async () => {
    const mine = await api('/api/v1/tenders?pageSize=100', { token: alphaToken });
    const theirs = await api('/api/v1/tenders?pageSize=100', { token: bravoToken });
    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);

    const alphaIds = new Set(mine.body.items.map((t: any) => t.id));
    for (const t of theirs.body.items) expect(alphaIds.has(t.id)).toBe(false);
  });

  it("bravo cannot open an alpha tender by id", async () => {
    const mine = await api('/api/v1/tenders?pageSize=1', { token: alphaToken });
    const id = mine.body.items[0].id;
    const r = await api(`/api/v1/tenders/${id}`, { token: bravoToken });
    expect(r.status).toBe(404);
  });

  it("bravo cannot read alpha's clients or contracts", async () => {
    const clients = await api('/api/v1/clients?pageSize=100', { token: alphaToken });
    const id = clients.body.items[0].id;

    const asBravo = await api(`/api/v1/clients/${id}`, { token: bravoToken });
    expect(asBravo.status).toBe(404);

    const bravoClients = await api('/api/v1/clients?pageSize=100', { token: bravoToken });
    const alphaIds = new Set(clients.body.items.map((c: any) => c.id));
    for (const c of bravoClients.body.items) expect(alphaIds.has(c.id)).toBe(false);
  });

  it("bravo cannot read alpha's complaints", async () => {
    const mine = await api('/api/v1/complaints', { token: alphaToken });
    const id = mine.body[0].id;
    const r = await api(`/api/v1/complaints/${id}`, { token: bravoToken });
    expect(r.status).toBe(404);
  });

  it('both tenants can create their own tender with the same format of number', async () => {
    const a = await api('/api/v1/tenders', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ tenderTitle: `Alpha isolation ${stamp}`, portal: 'GeM', sector: 'Gov', submissionDate: day(7) }),
    });
    const b = await api('/api/v1/tenders', {
      method: 'POST', token: bravoToken,
      body: JSON.stringify({ tenderTitle: `Bravo isolation ${stamp}`, portal: 'GeM', sector: 'Gov', submissionDate: day(7) }),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Numbers are allocated per company, so the two tenants do not collide.
    expect(a.body.id).not.toBe(b.body.id);
  });
});

/* ================================================================== */
/* RBAC                                                               */
/* ================================================================== */

describe('Phase 3 RBAC', () => {
  it('a tender-desk user sees only tenders assigned to them', async () => {
    const email = `tender-${stamp}@alpha.test`;
    const created = await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ email, name: 'Tender Desk', password: 'TenderDesk!2026', roles: ['tender_desk'] }),
    });
    expect(created.status).toBe(201);

    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'TenderDesk!2026' }),
    });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const list = await api('/api/v1/tenders?pageSize=100', { token });
    expect(list.status).toBe(200);
    // The owner created every tender so far, so a tender-desk user sees none.
    for (const t of list.body.items) expect(t.assignedToId).toBe(created.body.id);

    // And they cannot reach client care.
    const care = await api('/api/v1/complaints', { token });
    expect(care.status).toBe(403);
    expect(care.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('a client-care user can work tickets but cannot write tenders', async () => {
    const email = `care-${stamp}@alpha.test`;
    await api('/api/v1/users', {
      method: 'POST', token: alphaToken,
      body: JSON.stringify({ email, name: 'Client Care', password: 'ClientCare!2026', roles: ['client_care'] }),
    });
    const login = await api('/api/v1/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: 'ClientCare!2026' }),
    });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const tickets = await api('/api/v1/complaints', { token });
    expect(tickets.status).toBe(200);

    const noTender = await api('/api/v1/tenders', { token });
    expect(noTender.status).toBe(403);

    const noCreate = await api('/api/v1/tenders', {
      method: 'POST', token,
      body: JSON.stringify({ tenderTitle: 'X', portal: 'GeM', sector: 'Gov', submissionDate: day(1) }),
    });
    expect(noCreate.status).toBe(403);
  });

  it('rejects an unauthenticated request to every Phase 3 resource', async () => {
    for (const path of ['/api/v1/tenders', '/api/v1/clients', '/api/v1/contracts', '/api/v1/complaints', '/api/v1/sla']) {
      const r = await api(path);
      expect(r.status).toBe(401);
    }
  });
});
