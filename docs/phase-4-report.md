# Phase 4 Report — HR & Workforce

**Product:** UFMS Business Management Suite
**Phase:** 4 of 9
**Date:** 2026-11-07
**Status:** ✅ COMPLETE — 215/215 tests passing; exit criterion verified end to end.

> **Exit criterion:** *"Site strength reconciles to allocations"* — proven by
> `GET /api/v1/workforce/strength`, tested for the current date, a historical
> date, after a replacement, and after a release.

---

## 1. Scope delivered

| Area | Legacy source | Phase 4 outcome |
|---|---|---|
| Employee master (44 columns) | `HR.gs:220-313` `saveEmployee_` | Full model; **PII encrypted at rest** |
| Employee documents | `HR.gs:348-428` | Register + expiry tracking; binary deferred (Rule 4) |
| Employee lifecycle | `HR.gs:314-332` `deactivateEmployee_` | Status→LEFT, leaving date, auto-releases deployment |
| HR summary | `HR.gs:429-459` `getHRSummary_` | Live counters, parity-tested |
| Salary slip calculation | `HR.gs:460-546` `calculateSalarySlip_` | Ported to shared domain, **statutory values injected** |
| Deployment | *(new)* legacy had loose `Site`/`ClientID` text columns | `EmployeeAllocation` with overlap protection |
| Manpower requirement | *(new)* headcount lived in quotations/tenders | `ManpowerRequirement`, effective-dated |
| Strength reconciliation | *(new)* no equivalent | `reconcileStrength()` — the exit criterion |
| Statutory configuration | `MinimumWages.gs` (151 functions) | Effective-dated rate sets + PT slabs + wage card |
| Minimum wage floor | `MinimumWages.gs` lookup family | `resolveWageFloor()` + `checkMinimumWageFloor()` |

### Scope correction (important)

The roadmap listed *attendance, leave and shifts* for this phase. **Those modules do not exist in the source.** Full evidence and the reasoning for the decision are in [`docs/phase-4-gap-analysis.md`](./phase-4-gap-analysis.md) (Finding P4-1). They are deferred to Phase 5 as a labelled *new capability*, not a migration — the deployment model built here is their prerequisite.

---

## 2. Files changed

### 2.1 Database

| File | Purpose |
|---|---|
| `packages/database/prisma/schema.prisma` | +8 models, +5 enums, +9 new fields on `Employee` |
| `migrations/20261107062832_phase4_hr_workforce/migration.sql` | Generated DDL |
| `migrations/20261107090000_rls_phase4/migration.sql` | Hand-written RLS + grants for all 8 tables |
| `packages/database/prisma/seed.mjs` | 12 new permissions, 2 new role templates |

### 2.2 Shared domain (pure, no I/O)

| File | Lines | Contents |
|---|---|---|
| `packages/shared/src/hr/employee-rules.ts` | 640 | Statuses, code allocation, validators (incl. Verhoeff), salary slip, HR summary, allocations, reconciliation, wage floor, effective dating |
| `packages/shared/package.json` | — | New `./hr/employee-rules` export |

### 2.3 API (3 controllers, 38 routes)

| File | Lines | Routes |
|---|---|---|
| `apps/api/src/hr/employees.controller.ts` | 470 | 12 |
| `apps/api/src/hr/workforce.controller.ts` | 400 | 10 |
| `apps/api/src/hr/statutory.controller.ts` | 430 | 16 |
| `apps/api/src/common/field-crypto.ts` | 150 | AES-256-GCM field encryption + masking |
| `apps/api/src/permissions/catalogue.ts` | — | 12 permission codes, 2 role templates |
| `apps/api/src/app.module.ts` | — | Registered 3 controllers |

### 2.4 Web (4 pages)

| File | Lines | Purpose |
|---|---|---|
| `apps/web/src/pages/Employees.tsx` | 305 | Register, live summary, masked identifiers |
| `apps/web/src/pages/EmployeeDetail.tsx` | 335 | Wage structure, deployment history, documents, gated PII reveal |
| `apps/web/src/pages/Workforce.tsx` | 400 | Strength board, deployment ledger, replace/release |
| `apps/web/src/pages/Statutory.tsx` | 390 | Rate sets, PT slabs, minimum wages, confirm workflow |
| `App.tsx`, `components/Shell.tsx` | — | 4 routes, 3 nav items |
| `lib/api.ts` | — | 12 interfaces + Phase 4 constants |

### 2.5 Tests

| File | Tests | Type |
|---|---|---|
| `tests/unit/hr-rules.parity.test.ts` | 34 | Parity vs lifted legacy functions |
| `tests/integration/phase4.test.ts` | 47 | Black-box HTTP + direct DB assertions |
| `tests/unit/legacy-oracle.mjs` | — | `buildHrOracle()` appended (6 legacy functions) |

---

## 3. Database changes

### 3.1 New models (8)

`Employee` · `EmployeeDocument` · `EmployeeAllocation` · `ManpowerRequirement` · `StatutoryRateSet` · `StatutoryRate` · `PtSlab` · `MinimumWageRate`

**Encryption columns.** `Employee` carries six AES-256-GCM ciphertext columns (`aadhaarEnc`, `panEnc`, `uanEnc`, `esiNoEnc`, `bankAccountEnc`) plus five `*Hint` columns for masked display. The ciphertext columns are never selected into a response — `shape()` destructures them out before serialisation, and an integration test asserts the response body contains neither the ciphertext nor the plaintext.

### 3.2 Row Level Security

```
tables with RLS enabled + forced : 42  (34 + 8 new)
policies                         : 42
```

Two tables deviate by design — `statutory_rate_sets` and `minimum_wage_rates` have a **nullable** `tenantId`, where `NULL` means a platform-wide default:

```sql
CREATE POLICY tenant_isolation ON "statutory_rate_sets"
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);
```

Read is wider than write on purpose: a tenant can *use* a shared rate card but can never *edit* it into something else, and can never touch a sibling tenant's override. This was the one place where a naive `USING` clause would have either hidden the shared data or allowed cross-tenant writes.

### 3.3 Seed

`permissions: 42 · roles: 18 (9 templates × 2 tenants)`

New role templates:

| Role | Grants | Deliberately excludes |
|---|---|---|
| `hr_manager` | employee/allocation/manpower read+write, payroll read+prepare | **`employee:pii:read`** — HR cannot decrypt Aadhaar/bank |
| `payroll_approver` | payroll read+approve, employee read, statutory read | **`payroll:prepare`** and **`employee:write`** — maker ≠ checker |

Both exclusions are asserted by integration tests.

---

## 4. Business rules preserved (with source evidence)

| Rule | Legacy source | Implementation | Test |
|---|---|---|---|
| Employee code `EMP-YYYY-NNNN`, pad 4, per year, max+1 | `Database.gs nextCodeFor_` | `nextEmployeeCode()` | parity ×5 |
| Non-matching codes ignored during allocation | `nextCode_` regex skip | regex filter | parity |
| Code unique per tenant, case-insensitive, among active only | `saveEmployee_` | `isDuplicateEmployeeCode()` | parity + HTTP 400 |
| Mobile normalised to last 10 digits | `normalizePhone_` | `normalizePhone()` | parity |
| Aadhaar must be 12 digits; PAN `AAAAA9999A` | `saveEmployee_` | `isValidAadhaar` / `isValidPan` | unit + HTTP 400 |
| ESI/PF applicable unless explicitly false | `saveEmployee_` `!== false` | `dto.esiApplicable !== false` | HTTP |
| Proration = `daysWorked / daysInMonth` on every component | `calculateSalarySlip_` | identical | parity ×400 randomised |
| One OT day = `basic/26` | `calculateSalarySlip_` | identical | parity |
| ESI only when flagged **and** `0 < gross ≤ ceiling` | `calculateSalarySlip_` | identical | parity |
| PF on `min(basic + DA, cap)`, only when flagged and > 0 | `hrPfWages_` | `pfWages()` | parity |
| Employer PF share shown equal to employee share | `pfEmployer = pfEmployee` | reproduced; honours a differing configured rate | parity |
| PT = first matching slab, **₹300 in February instead of ₹200** | `hrPtFor_` | `ptForGross()` with a structured override | parity ×6 |
| PT skipped entirely when no PT state configured | `calculateSalarySlip_` | identical | parity |
| Every money value `Math.round`ed | `calculateSalarySlip_` | identical | parity |
| HR gross estimate = Basic+HRA+DA+Other, ACTIVE only | `getHRSummary_` | `hrSummary()` | parity |
| Department blank → `"Unassigned"` in rollup | `getHRSummary_` | identical | parity |
| Deactivation sets LEFT + leaving date + Active false | `deactivateEmployee_` | identical, plus releases deployment | HTTP |

**Net salary is allowed to go negative** when recoveries exceed earnings. That is legacy behaviour and reversing it would silently change payroll output, so parity preserves it — but the payroll run in Phase 5 will surface such rows as a blocking finding before approval.

---

## 5. Tests run

### 5.1 Full suite

```
npx vitest run
 ✓ tests/integration/phase4.test.ts        (47 tests)  1631ms
 ✓ tests/unit/hr-rules.parity.test.ts      (34 tests)   130ms
 ✓ tests/integration/phase3.test.ts        (38 tests)  1413ms
 ✓ tests/integration/api.test.ts           (30 tests)   985ms
 ✓ tests/unit/wage-engine.parity.test.ts   (15 tests)   244ms
 ✓ tests/unit/tender-rules.parity.test.ts  (39 tests)     9ms
 ✓ tests/database/tenant-isolation.test.ts (12 tests)   133ms
 Test Files  7 passed (7)
      Tests  215 passed (215)
```

Zero regressions: every Phase 1–3 test still passes.

### 5.2 Parity method

`buildHrOracle()` lifts `calculateSalarySlip_`, `hrPtFor_`, `hrPfWages_`, `getHRSummary_`, `monthLabel_`, `nextCode_` and `nextCodeFor_` out of the real source and runs them with their **own** module constants (`HR_PF_BASIC_CAP_`, `HR_PT_KARNATAKA_SLABS_`, …). If the source changes, the suite fails.

The strongest test is **400 randomised salary-slip combinations** (basic/HRA/DA/allowances, ESI/PF flags, PT state, month 1–12, varying days worked, OT, bonus, loan recovery). Every single one matches legacy on earnings, deductions and net pay exactly.

### 5.3 Coverage of the 25 mandatory categories (Phase 4 slice)

| Category | Phase 4 evidence |
|---|---|
| Unit | 34 parity tests |
| Parity vs legacy | 6 legacy functions lifted verbatim |
| Integration | 47 HTTP tests |
| **Security / PII** | 6 tests incl. direct DB read asserting `v1:iv:tag:ct` format and unique IVs |
| Tenant isolation | 5 tests incl. cross-tenant 404 on PII reveal |
| RBAC | maker≠checker, HR cannot decrypt PII, HR cannot write statutory |
| Validation | mobile, Aadhaar, PAN, enum, UUID, date ordering, rate-code format |
| Business rules | slip maths, code allocation, overlap detection, replacement chain |
| Data integrity | duplicate codes, effective-date overlap, contract-must-be-active |
| Error hygiene | stable `error.code` values throughout |
| Regression | Phase 1–3 suites unchanged |

### 5.4 Encryption verification (beyond the test suite)

Read directly from PostgreSQL as the admin role:

```
aadhaarEnc, panEnc, bankAccountEnc all match /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/
None contain the plaintext value
All three have distinct IVs
```

And round-trip: `reveal-pii` returned `987654321098`, `XYZAB5678C`, `99887766554433` — exactly what was submitted.

---

## 6. Known issues / outstanding

1. **Document binary upload is not implemented.** The register records metadata, category and expiry; `storageKey` stays `null` and status is `PENDING_UPLOAD` until the object-storage adapter lands. This is deliberate: Rule 4 forbids writing files to the app server's disk, and faking an upload would be worse than an honest pending state.
2. **Attendance / leave / roster / shift are not built** — they do not exist in the source. Deferred to Phase 5 with prerequisites documented (see gap analysis P4-1).
3. **`saveWageZoneMap` is pending.** Mapping a free-text location ("Whitefield, Bengaluru") to a wage zone automatically is not implemented; callers pass the zone explicitly. Failure mode is safe — the floor check blocks on a missing rate rather than guessing.
4. **`saveClientWageProfile` is pending.** The per-client regime/zone profile is not modelled; `EmployeeAllocation.category` carries the category today.
5. **Wage notification PDFs are pending** (object storage). `sourceReference` text is captured now.
6. **No payroll run yet.** `calculateSalarySlip` is complete and parity-tested, but there is no `PayrollRun` entity, no period locking and no maker-checker workflow — that is Phase 5. `payroll:prepare` and `payroll:approve` permissions exist and are wired to roles but gate no route yet.
7. **Salary slip has no `daysWorked` source.** The value is an input; nothing produces it until attendance exists. Documented as the first task of Phase 5.
8. **Deliberate omissions from legacy:** `clearWageRateSets`, `resetMinimumWageSeed`, `seedMinimumWages`, `purgeBlankWageRows` and the `delete*Rate*` actions are marked `obsolete`, not `pending`. Destructive bulk operations and hardcoded gazette seeding are not carried into a multi-tenant product where one tenant's wipe would be irreversible.

---

## 7. Exact run commands

### 7.1 After an environment reset

```bash
cd /home/user/ufms-business-management-suite

sudo apt-get install -y postgresql postgresql-contrib
sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c "CREATE ROLE ufms LOGIN SUPERUSER PASSWORD 'ufms_dev_local_only';"
sudo -u postgres psql -c "CREATE DATABASE ufms_dev OWNER ufms;"

npm install
set -a; source .env; set +a
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
node packages/database/prisma/seed.mjs
```

> `prisma generate` is now required after a fresh `npm install` — without it the
> client throws *"@prisma/client did not initialize yet"* at seed time.

### 7.2 Servers

```bash
cd apps/api && npx ts-node -r tsconfig-paths/register src/main.ts   # :3000
cd apps/web && npx vite --host 0.0.0.0 --port 5173                  # :5173
```

### 7.3 Tests

```bash
npx vitest run                    # everything (servers must be up)
npx vitest run tests/unit         # fast lane, no server needed
npx vitest run tests/integration/phase4.test.ts
```

### 7.4 Type-check and build

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
cd apps/web && npx vite build     # 366.03 kB / 96.55 kB gzip
```

### 7.5 Required environment variable

```bash
# 32-byte base64 key for PII field encryption. Required — the API refuses to
# encrypt without it rather than falling back to plaintext.
PII_ENCRYPTION_KEY="$(openssl rand -base64 32)"   # falls back to CREDENTIAL_ENCRYPTION_KEY
```

---

## 8. Verification beyond the test suite

Every Phase 4 endpoint exercised through the browser's own path
(`browser → Vite :5173 → proxy → API :3000 → PostgreSQL`):

```
200  /api/v1/employees?pageSize=3          200  /api/v1/statutory/rate-sets
200  /api/v1/employees/summary             200  /api/v1/statutory/legacy-defaults
200  /api/v1/employees/options             200  /api/v1/statutory/minimum-wages
200  /api/v1/allocations                   200  /employees   (deep link)
200  /api/v1/manpower-requirements         200  /workforce   (deep link)
200  /api/v1/workforce/strength-by-contract 200 /statutory  (deep link)
```

Live strength report returned a real reconciliation:

```json
{ "contractNo": "CTR-2026-0001", "clientName": "Techpark Facilities",
  "required": 6, "deployed": 2, "variance": -4, "state": "SHORT",
  "lines": [{ "designation": "Housekeeping", "required": 5, "deployed": 2, "variance": -3 }] }
```

And a live employee payload confirmed PII hygiene: 5 rows returned, `contains aadhaarEnc: False`, hints present, plaintext absent.

---

## 9. Next phase

**Phase 5 — Payroll.**

Planned:

1. **Attendance capture (new capability)** — roster days against `EmployeeAllocation`; feeds `daysWorked`/`daysPresent` instead of manual entry. No legacy equivalent; see gap analysis.
2. `PayrollRun` + `PayrollRunItem` entities; the calculation core already exists and is parity-tested at 400 combinations.
3. **Effective-dated statutory resolution at run time** — a run for March 2026 reads the set in force in March 2026, not "today's" set. Requires sets to be CONFIRMED or the run refuses.
4. **Maker-checker** (Rule 16) — `payroll:prepare` creates, `payroll:approve` approves, and the same user cannot do both unless a configured, audited exception exists.
5. **Period locking** — an approved period is immutable; corrections go through a controlled reversal/adjustment, never an edit.
6. **Blocking findings before approval** — below-minimum-wage, negative net pay, missing statutory set, employees with no bank details.
7. **Statutory outputs** — PF ECR text file, ESI register, bank transfer CSV (legacy formats in `HR.gs:1087-1134`).

**Prerequisite:** re-run §7.1 after any environment reset; `prisma generate` is now mandatory.
