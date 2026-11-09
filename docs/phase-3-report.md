# Phase 3 Report — Tender Management, Clients & Contracts, SLA / Client Care

**Product:** UFMS Business Management Suite
**Phase:** 3 of 9
**Date:** 2026-11-07
**Status:** ✅ COMPLETE — 134/134 tests passing, full stack verified through the browser path.

---

## 1. Scope delivered

Phase 3 migrates four legacy areas that the source couples tightly to the Sales CRM:

| Legacy area | What was actually in the source | Phase 3 outcome |
|---|---|---|
| Tender Management (`Tenders.gs`, `AuthAndApi.gs`) | 8 tender statuses, dual numbering, follow-up log, auto order on win, dashboard counters | Rebuilt as a standalone module with **no dependency on Lead ID** |
| Clients (`AuthAndApi.gs` 12 actions) | Client master + contacts + documents | Client master, contacts, `CLT-NNNN` codes |
| Contracts (`saveClientContract`, `getContractRenewals`) | Contract periods, renewals, mobilisation | Contract lifecycle with mobilisation hand-over |
| SLA / Client Care (`getOpenComplaints`, `saveComplaint`, `updateComplaint`) | Ticket log with SLA expectations | SLA agreements, tickets, derived breach clock, feedback |

**Rule 17 compliance:** tender creation, update, follow-up, search and reporting all work with **zero** Lead reference. No `leadId` column exists on `tenders`; the API surface accepts none.

---

## 2. Files changed

### 2.1 Database (2 migrations)

| File | Purpose |
|---|---|
| `packages/database/prisma/schema.prisma` | +9 models, +5 enums (see §3) |
| `packages/database/prisma/migrations/20261107061549_phase3_tenders_clients/migration.sql` | Generated DDL |
| `packages/database/prisma/migrations/20261107080000_rls_phase3/migration.sql` | Hand-written `ENABLE` + `FORCE` RLS on all 9 new tables + `ufms_app` grants |
| `packages/database/prisma/seed.mjs` | 12 new permissions, 2 new roles, phase-3 grants on existing roles |

### 2.2 Shared domain (pure, framework-free)

| File | Lines | Purpose |
|---|---|---|
| `packages/shared/src/tenders/tender-rules.ts` | 357 | Statuses, numbering, validation, duplicate rule, ordering, metrics, result reason, order rule |
| `packages/shared/package.json` | — | New `./tenders/tender-rules` export |

### 2.3 API (4 controllers, 42 routes)

| File | Lines | Routes |
|---|---|---|
| `apps/api/src/tenders/tenders.controller.ts` | 437 | 8 |
| `apps/api/src/clients/clients.controller.ts` | 205 | 6 |
| `apps/api/src/contracts/contracts.controller.ts` | 238 | 8 |
| `apps/api/src/client-care/client-care.controller.ts` | 347 | 8 |
| `apps/api/src/app.module.ts` | — | Registered 4 controllers + boot-time permission check |
| `apps/api/src/permissions/catalogue.ts` | — | 12 new permission codes, 2 new role templates |

### 2.4 Web (6 pages)

| File | Lines | Purpose |
|---|---|---|
| `apps/web/src/pages/Tenders.tsx` | 258 | Pipeline list, 8 live metric tiles, filters, create form |
| `apps/web/src/pages/TenderDetail.tsx` | 219 | Full record, follow-up timeline, follow-up composer |
| `apps/web/src/pages/Clients.tsx` | 176 | Client list + create |
| `apps/web/src/pages/ClientDetail.tsx` | 176 | Billing block, contract history, contacts |
| `apps/web/src/pages/Contracts.tsx` | 231 | Lifecycle actions, renewal alert panel |
| `apps/web/src/pages/ClientCare.tsx` | 383 | Summary tiles, ticket queue, SLA agreements, star feedback |
| `apps/web/src/App.tsx`, `components/Shell.tsx` | — | 7 routes, 4 nav items |
| `apps/web/src/lib/api.ts` | — | 10 interfaces + `TENDER_STATUSES`, `dateOnly`, IST-safe `today()` |
| `apps/web/src/pages/Dashboard.tsx` | — | `StatusBadge` extended to 22 new statuses |

### 2.5 Tests

| File | Tests | Type |
|---|---|---|
| `tests/unit/tender-rules.parity.test.ts` | 39 | Parity against the real legacy functions |
| `tests/integration/phase3.test.ts` | 38 | Black-box HTTP against live server + PostgreSQL |
| `tests/unit/legacy-oracle.mjs` | — | `buildTenderOracle()` appended (3 legacy functions lifted) |

---

## 3. Database changes

### 3.1 New models (9)

`Tender`, `TenderFollowup`, `TenderOrder`, `Client`, `ClientContact`, `Contract`, `SlaAgreement`, `Complaint` — plus `SecurityDepositForm` and 4 other enums.

Key design decisions:

- **`Tender.tenderNo`** — the business number. `TND-YYYY-NNNN` when auto-allocated; the operator's portal number when typed (`tenderNoIsManual = true`).
- **`Tender.legacyTenderId`** — preserves the distinct legacy `TenderID` shape `TND-yyyyMMdd-XXXXXXXX`. The two identifiers are **not** the same thing and both survive.
- **`Tender.@@unique([companyId, tenderNo])`** — matches the legacy per-company uniqueness scope; case-insensitivity is enforced in the service layer.
- **`Complaint`** has no FK to `Client` by design in this phase (client id is a plain uuid) so a deleted client cannot cascade a complaint away — retention matters for SLA disputes.

### 3.2 Row Level Security

```
tables with RLS enabled+forced : 34  (25 phase 0–2 + 9 phase 3)
policies                       : 34
ufms_app role                  : NOBYPASSRLS — policy cannot be skipped by the app
```

Every policy is `USING ("tenantId" = current_setting('app.tenantId')::uuid)`. `ufms` (migration role) is separate from `ufms_app` (runtime role).

### 3.3 Seed

`permissions: 30 · roles: 16 (8 templates × 2 tenants) · plans: 3`

New role templates: **`tender_desk`** (`tender:read:own` + `tender:write`, no client-care access) and **`client_care`** (tickets + SLA read, no tender access) — both verified by RBAC integration tests.

---

## 4. Business rules preserved (with source evidence)

| Rule | Legacy source | Implementation | Test |
|---|---|---|---|
| Number format `TND-YYYY-NNNN`, pad 4, per year, `max+1` | `Database.gs nextCode_/CODE_PREFIXES_` | `nextTenderNo()` | parity ×3 |
| Number ignores non-matching text | `nextCode_` regex skip | regex `^TND-(\d{4})-(\d+)$` | parity |
| Duplicate is per-company, case-insensitive | `saveTender` scan | `isDuplicateTenderNo()` + service check | parity + HTTP 400 |
| Follow-up may never set `NEW` | `addTenderFollowup` guard | `isValidFollowupStatus()` | parity + HTTP 400 |
| `FINANCIALLY_WON` → exactly one order | `addTenderFollowup` | `shouldCreateOrder()` + unique `tenderId` | parity + HTTP idempotency |
| Result reason falls back to notes for LOST/CANCELLED | `deriveResultReason_` | `deriveResultReason()` | parity |
| Ordering: submission date asc, **no date last** (`9999-12-31`), ties by `UpdatedAt` **desc** | `tenderSubmissionSort_` | DB `orderBy` + `sortTendersBySubmission()` | parity ×6 + HTTP |
| `DRAFT` invisible in lists/reports/search | `TenderStatus` comment + legacy filter | `where: { status: { not: 'DRAFT' } }` | HTTP |
| Dashboard counters | `tenderDashboardMetricsServer_` | `tenderMetrics(tenders, today)` | parity ×9 |

> **Note on `ON_HOLD`.** The legacy schema carries `ON_HOLD` but `TENDER_STATUSES` never included it, so the legacy UI could not reach it. The new enum keeps `ON_HOLD` for migrated rows but the follow-up API rejects it as a target — same reachable set as the legacy system.

No already-working business rule was changed. The one deliberate deviation — **no Lead dependency** — is mandated by Rule 17, not a behaviour change to an existing rule.

---

## 5. Tests run

### 5.1 Full suite

```
npx vitest run
 ✓ tests/integration/phase3.test.ts        (38 tests)  1011ms
 ✓ tests/integration/api.test.ts           (30 tests)   932ms
 ✓ tests/unit/wage-engine.parity.test.ts   (15 tests)   112ms
 ✓ tests/unit/tender-rules.parity.test.ts  (39 tests)    15ms
 ✓ tests/database/tenant-isolation.test.ts (12 tests)   115ms
 Test Files  5 passed (5)
      Tests  134 passed (134)
```

**Expected without the running server:** the 68 integration tests (api + phase3) fail on connection refused. They are live-server tests by design.

### 5.2 Coverage of the 25 mandatory categories (phase 3 slice)

| Category | Phase 3 evidence |
|---|---|
| Unit | `tender-rules.parity.test.ts` 39 tests |
| Parity vs legacy | 3 legacy functions lifted verbatim into the oracle |
| Integration | 38 HTTP tests |
| Tenant isolation | 5 tests incl. cross-tenant 404 on every resource |
| RBAC | tender_desk sees only own rows; client_care cannot touch tenders; 401 on all 5 resources unauthenticated |
| Validation | missing title/date, bad enum, bad UUID, negative amounts, out-of-range rating |
| Business rules | status machine, order idempotency, mobilisation guard, SLA clock |
| Data integrity | unique constraints exercised (duplicate tender no, duplicate client code) |
| Error hygiene | no stack traces; stable `error.code` values |
| Regression | phase 2 suite still 30/30 |

### 5.3 Database assertions

```
migrations applied          6
tables with RLS             34
policies                    34
permissions                 30
roles                       16
phase-3 rows  tenders 12 · followups 26 · orders 2 · clients 4 ·
              contacts 2 · contracts 2 · sla 2 · complaints 2
```

---

## 6. Known issues / outstanding

1. **`saveTenderOrder` is partial.** Orders are created automatically on win with the award value, but manual editing of order terms (payment schedule, breakup) is not exposed. Deferred to the Accounts phase, where the payment schedule belongs.
2. **Document upload is not implemented.** Five legacy document actions remain `pending` with reason *"object storage not yet provisioned"*. Rule 4 forbids local-disk storage, so this waits for the storage phase rather than being faked.
3. **PDF generation is not implemented** (5 legacy PDF actions). Deferred to the Creative Studio / Templates phase.
4. **`getTenderMonthlyReport`, `sendTenderReportNow`, `sendMonthlyTenderReportNow`** remain pending — reporting and scheduled email phases.
5. **`Complaint.clientId` has no FK.** Deliberate: keeps ticket history intact if a client record is archived. A reconciliation report is planned.
6. **`ON_HOLD` / `DRAFT` enum values are unreachable through the follow-up API.** Intentional parity with legacy; only AI draft tenders will use `DRAFT`.
7. **No SLA-sweep background job yet.** Breach state is computed on read, which is correct for display, but the worker phase must still emit breach notifications.
8. **`tender:approve` is declared but unused.** Reserved for the maker-checker work in the payroll/approval phase; the boot-time catalogue check accepts declared-but-unused codes.

---

## 7. Exact run commands

### 7.1 First run after an environment reset

```bash
cd /home/user/ufms-business-management-suite

# PostgreSQL (apt packages do not persist between sessions)
sudo apt-get install -y postgresql postgresql-contrib
sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c "CREATE ROLE ufms LOGIN SUPERUSER PASSWORD 'ufms_dev_local_only';"
sudo -u postgres psql -c "CREATE DATABASE ufms_dev OWNER ufms;"

# Dependencies + schema
npm install
set -a; source .env; set +a
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
node packages/database/prisma/seed.mjs
```

### 7.2 Run the API

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register src/main.ts
# → http://0.0.0.0:3000  (docs at /api/docs)
```

### 7.3 Run the web app

```bash
cd apps/web
npx vite --host 0.0.0.0 --port 5173
```

### 7.4 Run tests

```bash
# Everything (API + web servers must be running for integration files)
npx vitest run

# Fast lane — no server needed
npx vitest run tests/unit

# Database isolation only
npx vitest run tests/database
```

### 7.5 Type-check and build

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
cd apps/web && npx vite build      # 312.61 kB / 87.30 kB gzip
```

### 7.6 Dev credentials (development seed only)

| Tenant | Email | Password |
|---|---|---|
| alpha | `owner@alpha.test` | `AlphaOwner!2026` |
| bravo | `owner@bravo.test` | `BravoOwner!2026` |

---

## 8. Verification performed beyond the test suite

Every new endpoint was exercised **through the browser's own path** — `browser → Vite :5173 → proxy → API :3000 → PostgreSQL` — not by calling the API directly:

```
200  /api/v1/tenders?pageSize=3        200  /api/v1/complaints
200  /api/v1/tenders/metrics           200  /api/v1/sla
200  /api/v1/clients?pageSize=3        200  /api/v1/client-care/summary
200  /api/v1/contracts                 200  /api/v1/contracts/expiring
200  /                              (SPA shell)
200  /tenders                       (deep link)
```

A real tender row returned `tenderNo: "TND-2026-0007"` with `tenderNoIsManual: false` — the auto-allocation path confirmed end to end.

---

## 9. Next phase

**Phase 4 — HR, Manpower & Operations.**

Planned:

1. Employees, designations, departments, statutory identities (UAN/ESIC/PAN) with field-level encryption at rest.
2. Client wage profiles and site deployment/replacement ledger.
3. Attendance (biometric/import) and leave balances.
4. Manpower requisitions and deployment orders tied to `contracts`.
5. Statutory rate tables as **effective-dated configurables** (Rule 15) — no hardcoded PF/ESI/PT ceilings anywhere in code.
6. Payroll run scaffolding with maker-checker and period locking (Rule 16) — the calculation core already exists and is parity-tested; phase 4 wires it to real inputs.
7. Tests: HR + manpower integration suite, RLS coverage for the new tables, wage-engine parity re-run against generated payroll.

**Prerequisite before phase 4:** the environment reset note still applies — nothing installed persists, so re-run §7.1 first.
