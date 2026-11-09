# Phase 2 Report — Core CRM

Generated from actual command output. Nothing here is aspirational.

---

## 1. What was built

| Area | Delivered | Backed by |
|---|---|---|
| **Wage / CTC engine** | Faithful port of legacy `salaryBreakupCalc_` with 15 option switches, custom allowances, ESI/Group-Insurance decision table, Labour Code 50% floor, reliever, PF split, gratuity, `roundRupee` | `packages/shared/src/payroll/wage-engine.ts` |
| **Quotation maths** | Subtotal, five management-fee modes, tax, grand total with legacy 2-dp rounding | `computeQuotationTotals()` |
| **Authentication** | Argon2id passwords, opaque SHA-256-hashed sessions, lockout after 5 failures, login history, logout/revocation | `apps/api/src/auth/*` |
| **Tenant isolation** | Service-layer scoping **+** PostgreSQL RLS `FORCE` on 25 tables, fail-closed with no tenant context | `packages/database/prisma/migrations/*` |
| **RBAC** | Explicit permission per route, any-of support, **fail-closed** guard, startup catalogue assertion | `permissions/catalogue.ts`, `common/guards.ts` |
| **Organisation** | Companies, branches, sites, departments (CRUD) | `organisation.controller.ts` |
| **Users & roles** | List/create/update, role assignment, password reset that revokes sessions | `users.controller.ts` |
| **Leads** | Create with per-tenant sequential number, search/filter/pagination, row-level ownership for `lead:read:own` | `leads.controller.ts` |
| **Follow-ups** | History + status advance | `leads.controller.ts` |
| **Surveys** | Schedule (auto-advances lead), inspection capture | `surveys.controller.ts` |
| **Quotations** | Calculate preview, create with wage snapshot, immutable version records, approval separation, lock on approve | `quotations.controller.ts` |
| **Audit logging** | One tenant-scoped row per mutation, sensitive-field redaction, correlation ids | `common/interceptors.ts` |
| **Frontend** | Login, dashboard, leads list + detail, surveys, quotations list + builder, organisation, sites, users | `apps/web/src` |

---

## 2. Test results (executed)

```
$ npx vitest run

 ✓ tests/integration/api.test.ts            (30 tests) 1159ms
 ✓ tests/unit/wage-engine.parity.test.ts    (15 tests)  145ms
 ✓ tests/database/tenant-isolation.test.ts  (12 tests)  122ms

 Test Files  3 passed (3)
      Tests  57 passed (57)
```

### 2.1 Wage engine parity (15 tests)

Differential testing against the **real legacy code**, extracted from
`Quotations.gs` and executed as an oracle. Covers 400 randomised breakups ×
26 money fields, the ESI decision table, Professional Tax branches, the
Labour Code floor, all five fee modes, and option clamping. **> 10,000 field
comparisons, zero mismatches.**

Negative control: the suite is proven capable of failing — it found defect L-01
(legacy `totals.headcount` string concatenation) on its own.

### 2.2 API integration (30 tests)

Real HTTP against the running NestJS server and real PostgreSQL:

- authentication: wrong password, unknown email, no session, forged token, logout revocation
- tenant isolation: list, read-by-id, update, and uniqueness across two live tenants
- workflow: lead → follow-up → survey → inspection
- quotations: totals, wage snapshot persistence, immutable versions, approve + lock
- RBAC: owner vs. sales-executive, `lead:read:own` filtering, 403 on missing permission
- error hygiene: no stack traces, no SQL, no Prisma internals in responses; correlation id present

### 2.3 Database tenant isolation (12 tests)

Connecting as the least-privilege role (`NOSUPERUSER NOBYPASSRLS`) and attempting
every cross-tenant access route. **Negative control executed:** disabling RLS on
`leads` caused 10 of 12 to fail; restoring it returned 12/12.

---

## 3. Real bugs found and fixed during Phase 2

Every one of these was caught by a test or the compiler — none were known in advance.

| # | Bug | Found by | Fix |
|---|---|---|---|
| 1 | Login impossible: authentication must resolve a user before a tenant exists, but RLS correctly blocks that | integration test | Narrow, documented `auth` client; scoped to 4 enumerated query shapes |
| 2 | Tenant branding returned `null` | integration test | Read branding inside `withTenant()` |
| 3 | `applyUniformCompany/Employee` read from the wrong object (option switch was inert) | `tsc` | Moved to `BreakupSettings`, matching legacy `breakup.` |
| 4 | Nested quotation items missing `tenantId` | `tsc` | Added on create |
| 5 | Login returned HTTP 201 | integration test | `@HttpCode(200)` |
| 6 | `/auth/me` returned 403 (route declared no permission → correctly failed closed) | integration test | Added `@Authenticated()` for self-scoped routes only |
| 7 | Sales executive got 403 on leads | integration test | Any-of permission semantics |
| 8 | Survey INSERT failed: raw SQL omitted the NOT NULL `updatedAt` | integration test | Added `now()` |
| 9 | Survey status COALESCE type mismatch (text vs enum) | integration test | Explicit `::"SurveyStatus"` cast |
| 10 | Malformed UUID returned 500 | integration test | `ParseUUIDPipe` → 400 |
| 11 | Startup permission assertion crashed on array permissions | server boot | Flatten arrays before validating |

Bug 11 is worth noting: the fail-closed startup check caught *itself*, which is
the behaviour we want from a control.

---

## 4. Database changes

| Migration | Contents |
|---|---|
| `init_tenancy` | 28 core tables: tenants, domains, branding, settings, flags, companies, branches, departments, sites, users, roles, permissions, sessions, plans, subscriptions, usage, audit |
| `row_level_security` | RLS `ENABLE` + `FORCE` + fail-closed policy on 20 tables; `ufms_app` least-privilege role |
| `crm_flow` | `lead_followups`, `surveys`, `quotations`, `quotation_items`, `quotation_versions`, enums `SurveyStatus`, `QuotationStatus`, `FeeMode` |
| `rls_crm_tables` | Same tenant policy applied to the five new CRM tables |

Money is `Decimal(14,2)` throughout. Identifiers (`leadNo`, `quotationNo`) are
per-tenant unique and allocated inside the transaction.

---

## 5. Repository changes

```
apps/api/src/
  auth/            auth.service.ts, auth.controller.ts, auth.module.ts
  common/          guards.ts, decorators.ts, errors.ts, interceptors.ts
  database/        prisma.service.ts
  permissions/     catalogue.ts
  organisation/    organisation.controller.ts
  users/           users.controller.ts
  leads/           leads.controller.ts
  surveys/         surveys.controller.ts
  quotations/      quotations.controller.ts
  app.module.ts, main.ts, health.controller.ts
apps/web/src/
  lib/             api.ts, auth.tsx
  components/      Shell.tsx
  pages/           Login, Dashboard, Leads, LeadDetail, Surveys, Quotations,
                   QuotationNew, Organisation, Users
packages/shared/src/payroll/wage-engine.ts
packages/database/prisma/{schema.prisma, seed.mjs, migrations/}
tests/unit/legacy-oracle.mjs, wage-engine.parity.test.ts
tests/integration/api.test.ts
```

Frontend bundle: **257 KB (78 KB gzipped)**, versus **2.24 MB** for the legacy
single-file app — before any further code-splitting.

---

## 6. Commands to run

```bash
# 1. Database (Docker)
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres

# 2. Install + migrate + seed
npm install
cp .env.example .env          # fill AUTH_SECRET and CREDENTIAL_ENCRYPTION_KEY
npm run db:migrate
npm run db:seed

# 3. API  (http://localhost:3000 · Swagger at /api/docs)
npm --workspace @ufms/api run dev

# 4. Web  (http://localhost:5173)
npm --workspace @ufms/web run dev

# 5. Tests
npx vitest run                                   # all 57
npx vitest run tests/unit                        # wage parity
npx vitest run tests/database                    # RLS isolation
npx vitest run tests/integration                 # API (server must be running)
```

Demo credentials (development only): `owner@alpha.test / AlphaOwner!2026`,
`owner@bravo.test / BravoOwner!2026`.

---

## 7. Known gaps carried into Phase 3

| Gap | Impact | Planned |
|---|---|---|
| No browser E2E (Playwright) yet | UI verified by build + API-level flow, not by a driven browser | Phase 3 |
| Quotation PDF generation not implemented | `generateQuotePdf` still unmigrated | Phase 6 (with the PDF adapter) |
| Survey attachments / photos not implemented | Legacy used Drive | Phase 4 (object storage) |
| Quotation revision workflow (new revision on change) | Approve + lock works; creating R2 is not built | Phase 3 |
| No token refresh / sliding session | Sessions are fixed 12h | Phase 8 (hardening) |
| Rate limiting is global only | `@nestjs/throttler` at 300/min | Tighten per-route in Phase 8 |
| Only 14 of 537 legacy actions migrated | Expected — this is Phase 2 scope | Phases 3–8 |

Every gap above is also reflected in `migration/source-inventory/traceability-matrix.csv`
(`migration_status` column), so the matrix stays the single source of truth for
what is and is not done.
