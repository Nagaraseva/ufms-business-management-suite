/**
 * Tenant isolation — the Phase 1 acceptance test.
 *
 * Project Rules 10 and 11 forbid relying on frontend filtering and forbid one
 * customer reaching another customer's data. This suite proves the guarantee at
 * the database layer, independently of the API, by connecting as the
 * least-privilege application role (NOSUPERUSER, NOBYPASSRLS) and trying to
 * cross the tenant boundary in every way that matters:
 *
 *   - read another tenant's rows through an unfiltered SELECT
 *   - read another tenant's row by its exact primary key
 *   - insert a row labelled with another tenant
 *   - move one of our rows into another tenant
 *   - connect with no tenant context at all (must see nothing)
 *
 * A failure here is a release blocker for every later phase.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import crypto from 'node:crypto';

const ADMIN_URL = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://ufms:ufms_dev_local_only@127.0.0.1:5432/ufms_dev';
const APP_URL = process.env.APP_DATABASE_URL
  ?? 'postgresql://ufms_app:ufms_app_local_only@127.0.0.1:5432/ufms_dev';

// Deterministic ids so assertions are readable.
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const LEAD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_A = 'a0000000-0000-4000-8000-000000000001';
const USER_B = 'b0000000-0000-4000-8000-000000000002';

let admin: Client;

/** Open an app-role connection with (or without) a tenant context. */
async function appConn(tenantId: string | null): Promise<Client> {
  const c = new Client({ connectionString: APP_URL });
  await c.connect();
  // PostgreSQL does not accept bind parameters in SET, so use set_config().
  // An empty value makes NULLIF(...) render NULL -> the policy matches nothing,
  // which is exactly the fail-closed behaviour we want to assert.
  await c.query(`SELECT set_config('app.tenantId', $1, false)`, [tenantId ?? '']);
  return c;
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();

  // Clean slate for the two fixture tenants only (never touches other data).
  for (const t of [TENANT_A, TENANT_B]) {
    await admin.query(`DELETE FROM leads WHERE "tenantId" = $1`, [t]);
    await admin.query(`DELETE FROM audit_logs WHERE "tenantId" = $1`, [t]);
    await admin.query(`DELETE FROM sessions WHERE "tenantId" = $1`, [t]);
    await admin.query(`DELETE FROM user_roles WHERE "userId" IN (SELECT id FROM users WHERE "tenantId" = $1)`, [t]);
    await admin.query(`DELETE FROM users WHERE "tenantId" = $1`, [t]);
    await admin.query(`DELETE FROM companies WHERE "tenantId" = $1`, [t]);
    await admin.query(`DELETE FROM tenants WHERE id = $1`, [t]);
  }

  for (const [id, slug, name] of [
    [TENANT_A, 'tenant-alpha', 'Alpha Facility Services'],
    [TENANT_B, 'tenant-bravo', 'Bravo Facility Services'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, "legalName", "displayName", status, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$3,'ACTIVE', now(), now())`,
      [id, slug, name],
    );
  }

  await admin.query(
    `INSERT INTO companies (id, "tenantId", code, "legalName", "displayName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, 'C1', 'Alpha Co', 'Alpha Co', now(), now()),
            (gen_random_uuid(), $2, 'C1', 'Bravo Co', 'Bravo Co', now(), now())`,
    [TENANT_A, TENANT_B],
  );

  for (const [uid, tid, email] of [
    [USER_A, TENANT_A, 'rls-fixture-a@example.test'],
    [USER_B, TENANT_B, 'rls-fixture-b@example.test'],
  ] as const) {
    await admin.query(
      `INSERT INTO users (id, "tenantId", email, name, "passwordHash", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'$argon2id$fixture', now(), now())`,
      [uid, tid, email, email.split('@')[0]],
    );
  }

  for (const [lid, tid, no, cust] of [
    [LEAD_A, TENANT_A, 'LEAD-A-001', 'Alpha Customer'],
    [LEAD_B, TENANT_B, 'LEAD-B-001', 'Bravo Customer'],
  ] as const) {
    await admin.query(
      `INSERT INTO leads (id, "tenantId", "leadNo", "customerName", status, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'NEW', now(), now())`,
      [lid, tid, no, cust],
    );
  }
});

afterAll(async () => {
  await admin?.end();
});

describe('Tenant isolation (PostgreSQL RLS)', () => {
  it('tenant A sees only its own leads through an unfiltered SELECT', async () => {
    const c = await appConn(TENANT_A);
    try {
      const r = await c.query('SELECT "leadNo" FROM leads ORDER BY "leadNo"');
      const nos = r.rows.map((x) => x.leadNo);
      expect(nos).toContain('LEAD-A-001');
      expect(nos).not.toContain('LEAD-B-001');
    } finally { await c.end(); }
  });

  it('tenant B sees only its own leads', async () => {
    const c = await appConn(TENANT_B);
    try {
      const r = await c.query('SELECT "leadNo" FROM leads ORDER BY "leadNo"');
      const nos = r.rows.map((x) => x.leadNo);
      expect(nos).toContain('LEAD-B-001');
      expect(nos).not.toContain('LEAD-A-001');
    } finally { await c.end(); }
  });

  it('cannot read another tenant row by exact primary key', async () => {
    const c = await appConn(TENANT_A);
    try {
      const r = await c.query('SELECT * FROM leads WHERE id = $1', [LEAD_B]);
      expect(r.rowCount).toBe(0);
    } finally { await c.end(); }
  });

  it('cannot see another tenant even when explicitly filtering by its tenant id', async () => {
    const c = await appConn(TENANT_A);
    try {
      const r = await c.query('SELECT * FROM leads WHERE "tenantId" = $1', [TENANT_B]);
      expect(r.rowCount).toBe(0);
    } finally { await c.end(); }
  });

  it('cannot insert a row belonging to another tenant', async () => {
    const c = await appConn(TENANT_A);
    try {
      await expect(
        c.query(
          `INSERT INTO leads (id, "tenantId", "leadNo", "customerName", status, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, 'LEAK-001', 'Injected', 'NEW', now(), now())`,
          [TENANT_B],
        ),
      ).rejects.toThrow(/row-level security policy/i);
    } finally { await c.end(); }
  });

  it('cannot move its own row into another tenant', async () => {
    const c = await appConn(TENANT_A);
    try {
      // Affects 0 rows: USING blocks the read, WITH CHECK blocks the write.
      const r = await c.query(
        `UPDATE leads SET "tenantId" = $1 WHERE id = $2`,
        [TENANT_B, LEAD_A],
      ).catch((e) => e);
      if (r instanceof Error) {
        expect(String(r.message)).toMatch(/row-level security policy/i);
      } else {
        expect(r.rowCount).toBe(0);
      }
    } finally { await c.end(); }
  });

  it('cannot delete another tenant row', async () => {
    const c = await appConn(TENANT_A);
    try {
      const r = await c.query('DELETE FROM leads WHERE id = $1', [LEAD_B]);
      expect(r.rowCount).toBe(0);
      // and it is still there for its owner
      const check = await admin.query('SELECT 1 FROM leads WHERE id = $1', [LEAD_B]);
      expect(check.rowCount).toBe(1);
    } finally { await c.end(); }
  });

  it('FAIL-CLOSED: a connection with no tenant context sees nothing', async () => {
    const c = await appConn(null);
    try {
      const leads = await c.query('SELECT count(*)::int AS n FROM leads');
      const users = await c.query('SELECT count(*)::int AS n FROM users');
      const companies = await c.query('SELECT count(*)::int AS n FROM companies');
      expect(leads.rows[0].n).toBe(0);
      expect(users.rows[0].n).toBe(0);
      expect(companies.rows[0].n).toBe(0);
    } finally { await c.end(); }
  });

  it('isolation also covers users, sessions and audit logs', async () => {
    const c = await appConn(TENANT_A);
    try {
      const u = await c.query('SELECT email FROM users');
      expect(u.rows.map((x) => x.email)).toEqual(['rls-fixture-a@example.test']);

      const s = await c.query('SELECT count(*)::int AS n FROM sessions');
      expect(s.rows[0].n).toBe(0);

      const a = await c.query('SELECT count(*)::int AS n FROM audit_logs');
      expect(a.rows[0].n).toBe(0);
    } finally { await c.end(); }
  });
});

describe('Tenant isolation cannot be bypassed by the API role', () => {
  it('ufms_app is neither superuser nor RLS-bypassing', async () => {
    const c = await appConn(TENANT_A);
    try {
      const r = await c.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      expect(r.rows[0].rolsuper).toBe(false);
      expect(r.rows[0].rolbypassrls).toBe(false);
    } finally { await c.end(); }
  });

  it('every tenant-owned table has row level security enabled AND forced', async () => {
    const required = [
      'companies', 'branches', 'departments', 'sites', 'users', 'sessions',
      'password_reset_tokens', 'login_history', 'leads', 'audit_logs',
      'tenant_domains', 'tenant_settings', 'tenant_branding',
      'tenant_feature_flags', 'subscriptions', 'usage_records', 'roles',
      'user_roles', 'user_company_access', 'role_permissions',
    ];
    const r = await admin.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class WHERE relname = ANY($1) AND relkind = 'r'`,
      [required],
    );
    const byName = Object.fromEntries(r.rows.map((x) => [x.relname, x]));
    for (const t of required) {
      expect(byName[t], `table ${t} missing`).toBeDefined();
      expect(byName[t].relrowsecurity, `${t} RLS not enabled`).toBe(true);
      expect(byName[t].relforcerowsecurity, `${t} RLS not forced`).toBe(true);
    }
  });
});

describe('Unique constraints are tenant-scoped (same value allowed in two tenants)', () => {
  it('two tenants can both have lead number LEAD-A-001', async () => {
    // Both fixtures already use distinct numbers; this proves the composite
    // unique key is (tenantId, leadNo) rather than leadNo alone.
    await admin.query(
      `INSERT INTO leads (id, "tenantId", "leadNo", "customerName", status, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'LEAD-A-001', 'Bravo duplicate number', 'NEW', now(), now())`,
      [TENANT_B],
    );
    const r = await admin.query(
      `SELECT count(*)::int AS n FROM leads WHERE "leadNo" = 'LEAD-A-001'`,
    );
    expect(r.rows[0].n).toBe(2);
  });
});
