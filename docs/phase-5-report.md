# Phase 5 — Attendance & Payroll with Statutory Compliance

**Status: COMPLETE.** Backend, frontend, permissions, database and tests all green.
`npx vitest run` → **335 / 335 passing across 11 files**.

Phase 5 replaces the legacy salary-slip and payroll-run code in `HR.gs` and closes the
largest functional gap found in Phase 4: the legacy suite computed payroll from a
**typed number of days** because it had no attendance module at all.

---

## 1. Headline outcomes

| Area | Outcome |
| --- | --- |
| Wage computation | Legacy `calculateSalarySlip_` ported unchanged to `packages/shared/src/hr/employee-rules.ts`; 34 parity assertions against the legacy oracle |
| Run arithmetic | Legacy `summarizePayrollRun_` reimplemented in `run-rules.ts`; parity-tested over randomised runs including the EPF/EPS/EDLI employer split |
| Exports | Bank NEFT CSV and PF ECR reproduce the legacy layouts byte-for-byte, with two security defects fixed (see §6) |
| Attendance | **New capability** — per-employee-per-day register, corrections ledger, bulk import, period lock |
| Maker-checker | Enforced in the domain layer, not the controller: the preparer cannot approve their own run unless a reasoned, audited exception is configured (Rule 16) |
| Period locking | A period consumed by a payroll run is read-only for attendance; slips carry a snapshot of the run that produced them |
| Adjustments | The only way to correct a closed period; ADDITION / REVERSAL only, mandatory reason, raiser cannot approve |
| Statutory rates | Effective-dated, per-tenant overrides with platform fallback; never hardcoded as permanent (Rule 15) |

---

## 2. Files

### 2.1 New — shared domain (`packages/shared/src/payroll/`)

| File | LOC | Contents |
| --- | --- | --- |
| `run-rules.ts` | 610 | Run state machine, period-lock policy, maker-checker policy, pre-flight findings, totals, export builders |

Exports: `canTransition`, `isPeriodLocked`, `isEditable`, `canApproveRun`,
`collectFindings`, `summarizePayrollRun`, `applyAdjustments`, `attendanceToDays`,
`computeSlip`, `csvField`, `csvLine`, `ecrField`, `buildPfEcrText`, `BANK_CSV_HEADER`,
`buildBankTransferCsv`, `daysInMonthOf`, `periodBounds`, `monthLabel`,
`isPeriodComplete`, type `NumericInput`.

`wage-engine.ts` (Phase 4) is unchanged and remains the single implementation of the
salary formula — `computeSlip` is a thin, attendance-aware wrapper around it.

### 2.2 New — API (`apps/api/src/hr/`)

| File | LOC | Contents |
| --- | --- | --- |
| `attendance.controller.ts` | 617 | Register, summary, calendar, single/bulk/import writes, corrections, history, lock status |
| `payroll.controller.ts` | 1314 | Slips, runs, adjustments, summary, both exports |

### 2.3 New — database

| Artifact | Contents |
| --- | --- |
| `migrations/20261107063957_phase5_attendance_payroll` | 5 tables, 6 enums |
| `migrations/20261107064335_phase5_attendance_corrections` | `attendance_corrections` (the `supersededById` design was impossible under RLS) |
| `migrations/20261107100000_rls_phase5` | RLS policies for the new tables |
| `migrations/20261107110000_rls_phase5_corrections` | Corrected policies |

### 2.4 New — frontend (`apps/web/src/pages/`)

| File | LOC | Contents |
| --- | --- | --- |
| `Attendance.tsx` | 426 | Month register with day-level marking, per-employee summary, lock banner, bulk actions |
| `Payroll.tsx` | 509 | Month/year picker, 4 position cards, 4-step pipeline, slip table, runs table, adjustments table |
| `PayrollRunDetail.tsx` | 447 | Status pills, lifecycle actions, maker-checker banner, pre-flight findings, totals, line items, exports |

### 2.5 Modified

`apps/api/src/app.module.ts` (Attendance + Payroll registered in `controllers:` **and** in
the `onModuleInit` permission-audit array) · `apps/api/src/permissions/catalogue.ts` ·
`apps/api/src/hr/statutory-config.ts` (precedence fix) ·
`packages/database/prisma/seed.mjs` (5 new permissions, `payroll_approver` and
`hr_manager` roles, statutory rate sets, minimum wages) ·
`apps/web/src/App.tsx` (3 routes) · `apps/web/src/components/Shell.tsx` (2 nav entries) ·
`apps/web/src/lib/api.ts` (Phase-5 types) · `migration/source-inventory/traceability-matrix.csv`.

---

## 3. Database changes

**5 new tables**, all carrying `tenant_id`, all under RLS:

| Table | Purpose |
| --- | --- |
| `attendance_records` | One row per employee per day: status, source, worked hours, OT, remarks. Allocates to branch/site. |
| `attendance_corrections` | Append-only before/after ledger; nothing is ever deleted or overwritten in place |
| `salary_slips` | Per employee-month, with `run_id` snapshot, status (`DRAFT`/`FINAL`/`CANCELLED`) and every component stored, not recomputed on read |
| `payroll_runs` | `DRAFT` → `LOCKED` → `APPROVED` → `DISBURSED` (+ `CANCELLED`), with `prepared_by` / `approved_by` / written reasons |
| `payroll_run_items` | Immutable snapshot of each slip as consumed by the run |

**6 new enums:** `AttendanceStatus`, `AttendanceSource`, `SalarySlipStatus`,
`PayrollRunStatus`, `AdjustmentType`, `AdjustmentStatus`.

Schema is now **53 models / 23 enums**; **48 tables have row-level security**.
Every new table was verified by `tests/database/tenant-isolation.test.ts`.

---

## 4. API surface (versioned, `/api/v1`)

### Attendance — 9 endpoints

```
GET    /api/v1/attendance                      list, filtered by month/employee/branch
GET    /api/v1/attendance/summary              per-employee totals + day counts
GET    /api/v1/attendance/calendar             month grid
POST   /api/v1/attendance                      mark one employee-day (idempotent)
POST   /api/v1/attendance/bulk                 mark many days in one transaction
POST   /api/v1/attendance/import               CSV/biometric import, all-or-nothing
PATCH  /api/v1/attendance/:id/correct          append a correction, reason ≥ 10 chars
GET    /api/v1/attendance/:id/history          full correction history
GET    /api/v1/attendance/lock-status          is this period consumed by a run?
```

### Payroll — 21 endpoints

```
GET    /api/v1/payroll/slips                   list
GET    /api/v1/payroll/slips/:id               one slip
POST   /api/v1/payroll/slips/generate          compute from attendance (DRAFT or final)
POST   /api/v1/payroll/slips/finalise          finalise a batch
PATCH  /api/v1/payroll/slips/:id/cancel        release a draft slip
GET    /api/v1/payroll/runs                    list
GET    /api/v1/payroll/runs/:id                detail + items + maker-checker state
POST   /api/v1/payroll/runs                    assemble a run (pre-flight findings returned)
POST   /api/v1/payroll/runs/:id/recompute      re-pull slips while DRAFT
POST   /api/v1/payroll/runs/:id/lock           DRAFT → LOCKED
POST   /api/v1/payroll/runs/:id/unlock         LOCKED → DRAFT (reason required)
POST   /api/v1/payroll/runs/:id/approve        LOCKED → APPROVED (maker-checker)
POST   /api/v1/payroll/runs/:id/disburse       APPROVED → DISBURSED
POST   /api/v1/payroll/runs/:id/cancel         reason required
GET    /api/v1/payroll/runs/:id/export/bank-csv
GET    /api/v1/payroll/runs/:id/export/ecr
GET    /api/v1/payroll/adjustments             list
POST   /api/v1/payroll/adjustments             raise (reason ≥ 10 chars)
POST   /api/v1/payroll/adjustments/:id/approve approve (not the raiser)
POST   /api/v1/payroll/adjustments/:id/void    void before application
GET    /api/v1/payroll/summary                 position cards
```

### Errors introduced

`RUN_EXISTS` · `PERIOD_LOCKED` · `MAKER_CHECKER_VIOLATION` · `CANNOT_CANCEL` ·
`NOT_APPROVED` · `ALREADY_APPLIED` · `PERIOD_INCOMPLETE` · `EFFECTIVE_DATE_OVERLAP` ·
`NO_STATUTORY_SET` · `PII_EXPORT_DENIED` · `IMPORT_REJECTED` · `INVALID_MONTH`

---

## 5. Permissions (Rule 6)

5 new codes bring the catalogue to **44**:

- `attendance:read`, `attendance:write`
- `payroll:read`, `payroll:prepare`, `payroll:approve`

Two roles change shape so that maker-checker cannot be self-granted:

| Role | Payroll permissions | Consequence |
| --- | --- | --- |
| `hr_manager` | `payroll:prepare` (no `payroll:approve`) | Can compute and lock, cannot approve |
| `payroll_approver` | `payroll:approve` (no `payroll:prepare`) | Can approve, cannot prepare |

Both controllers are registered in the `onModuleInit` permission-audit array, so a
missing guard fails the boot audit rather than silently shipping.

PII (bank account numbers) is decrypted only on the two export endpoints, behind
`employee:pii:read`, and each access writes an audit row via `recordPiiExport`.

---

## 6. Defects found in the legacy source and fixed

These were verified against `HR.gs` in the read-only oracle before being fixed. Rule 7
means each is recorded here with its reason.

**D-P5-1 — Self-approval was possible.**
`updatePayrollRun_` (HR.gs L943-965) wrote `ApprovedBy` unconditionally, so whoever
prepared a run could approve it. Fixed by `canApproveRun`: a `SELF_APPROVAL` violation
is raised unless the tenant has explicitly enabled the exception *and* a reason of at
least 10 characters is supplied; the exception is written to the audit log. Default is
refusal. Reason: Rule 16 is non-negotiable.

**D-P5-2 — No period lock; slips drifted from the run.**
Nothing in the legacy flow stopped attendance or slips changing after payment, and the
run did not write itself back onto the slips. Fixed with `isPeriodLocked` (a consumed
period rejects every attendance write) plus a `payroll_run_items` snapshot so a run is
reproducible forever. Reason: a paid month must be immutable.

**D-P5-3 — CSV injection and broken escaping.**
`escCsv_` (HR.gs L1135) replaced `#` and `,` with spaces — that is not escaping; a name
containing a quote produced a malformed bank file, and a cell starting `=` or `@` was
passed through to Excel. Replaced by `csvField` (RFC 4180 quoting) with a leading-tab
neutraliser on `= + - @`. Verified by a round-trip test that parses the generated file
back and compares cell by cell. Reason: the bank file is money-moving.

Additionally, the ECR builder now refuses to emit a line for an employee with PF deducted
but no UAN, and reports the omission count in the `x-ecr-omitted-count` header rather
than silently dropping the row.

---

## 7. Frontend

Three pages, all wired to real endpoints — no placeholder screens, no button without a
backend action (Rule 2).

- **`/attendance`** — month register, day cells, locking reflected in the UI, correction
  entry with a reason, live permission gating.
- **`/payroll`** — position cards (period, draft/ready slip counts, pending adjustments,
  last run net), a 4-step pipeline (record attendance → compute slips → publish →
  assemble run), slip table with per-component columns and a lock marker, runs table
  linking to detail, adjustments table where the approve button appears only for
  `payroll:approve` holders **and** only when the current user did not raise the row.
- **`/payroll/runs/:id`** — lifecycle buttons gated by status *and* permission, a
  maker-checker banner that names the preparer and explains a refusal in plain language
  ("you cannot approve your own run"), pre-flight findings grouped BLOCKING/WARNING,
  totals including the employer EPF/EPS/EDLI/ESI split, line items, and both exports
  fetched with an authenticated `fetch` → blob so the bearer token never lands in a URL.

`npx vite build` succeeds: 1,651 modules, 419.82 kB / 106.83 kB gzip.

---

## 8. Tests

`npx vitest run` → **335 passed / 0 failed, 11 files, 7.2 s**

| File | Tests | Kind |
| --- | --- | --- |
| `tests/integration/phase5.test.ts` | 53 | Attendance + payroll API, end to end |
| `tests/integration/phase4.test.ts` | 47 | HR/workforce regression |
| `tests/unit/hr-rules.parity.test.ts` | 34 | Wage engine vs legacy oracle |
| `tests/integration/phase3.test.ts` | 38 | Tender/client regression |
| `tests/integration/api.test.ts` | 30 | Auth, tenancy, envelope |
| `tests/unit/payroll-run.rules.test.ts` | 44 | New domain rules, state machine, exports |
| `tests/unit/tender-rules.parity.test.ts` | 39 | Tender regression |
| `tests/unit/payroll-run.parity.test.ts` | 15 | Run totals + ECR/CSV vs legacy |
| `tests/unit/wage-engine.parity.test.ts` | 15 | Statutory arithmetic |
| `tests/database/tenant-isolation.test.ts` | 12 | RLS across 48 tables |
| `tests/unit/web-pages.smoke.test.ts` | 8 | SSR render of the Phase 4/5 pages |

Coverage of the 25 mandatory test categories for this phase: unit, parity/golden,
integration, database isolation, permission matrix, audit trail, maker-checker negative
cases, period-lock negative cases, export format, CSV-injection, PII access control,
numeric edge cases (zero days, negative net, fractional paise), state machine, and UI
smoke rendering.

Live verification on the running stack: `/api/v1/payroll/{summary,runs,slips,adjustments}`
and `/api/v1/attendance/summary` all return 200 with a valid session; every payroll route
returns 401 without one; `attendance/lock-status` with no month returns `400 INVALID_MONTH`;
and the Bravo tenant's token sees `[]` for runs — it cannot read Alpha's payroll.

---

## 9. Assumptions recorded (Rule 12)

1. **Attendance is a new capability, not a migration.** The legacy suite had none, which
   is why slips took a typed day count. Adding it is a behaviour change for payroll input
   but not for the wage formula, which is untouched and parity-tested.
2. **`hr_manager` intentionally loses the ability to approve.** Any tenant that wants one
   person to do both must grant both roles; that is a policy decision, audited.
3. **ECR layout is reproduced as found.** The legacy source itself labels this format
   simplified. It is byte-compatible with v5.6.61 but must be checked against the current
   EPFO specification before any real filing (Rule 21).
4. **Seeded statutory values are demonstration data.** Every seeded rate set carries
   `sourceReference = "DEMONSTRATION DATA … must be reviewed … before production payroll"`.
   `EPFO-CENTRAL-2025` uses a ₹25,000 PF cap while the legacy code defaulted to ₹15,000 —
   deliberate, because the cap is now a configurable, effective-dated value rather than a
   constant (Rule 15), and the tenant can override it.
5. **TDS is out of scope for this phase** (`tds = 0`), matching the legacy engine. It is
   tracked as an open item for the accounts module, not silently invented.

---

## 10. Known issues / open items

| # | Item | Impact | Where it lands |
| --- | --- | --- | --- |
| P5-1 | Salary slip PDF/email not built | Employees cannot be sent slips from the new app | Phase 6 (documents/notifications) |
| P5-2 | Printable payroll register and bank advice (HTML) not built | Data is complete; only the printable view is missing | Phase 7 (reports) |
| P5-3 | ESI/PF register sheets not recreated | Run totals carry the figures; the separate registers are separate artefacts | Phase 6/7 |
| P5-4 | API responses still include `tenantId` on records | Opaque UUID, no cross-tenant access; cosmetic consistency issue carried over from Phases 2–4 | Phase 8 hardening pass |
| P5-5 | Attendance import accepts CSV only | Biometric device push needs an adapter | Phase 6 |
| P5-6 | No browser driver in this environment | Verification is SSR `renderToString` plus HTTP probes, not pixels | — |

---

## 11. Exact run commands

```bash
cd /home/user/ufms-business-management-suite
set -a; source .env; set +a

# 1. database
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
node packages/database/prisma/seed.mjs

# 2. typecheck
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json

# 3. tests (all)
npx vitest run
#    -> Test Files 11 passed (11) / Tests 335 passed (335)

#    phase 5 only
npx vitest run tests/integration/phase5.test.ts tests/unit/payroll-run.rules.test.ts \
               tests/unit/payroll-run.parity.test.ts tests/unit/web-pages.smoke.test.ts

# 4. run the stack
#    API  : cd apps/api && npx ts-node -r tsconfig-paths/register src/main.ts   (0.0.0.0:3000)
#    Web  : cd apps/web && npx vite --host 0.0.0.0 --port 5173                  (proxies /api -> 3000)

# 5. build
npx vite build
```

Demo logins (seed data only — no customer data, Rule 10):
`owner@alpha.test / AlphaOwner!2026` · `owner@bravo.test / BravoOwner!2026`

---

## 12. Traceability matrix

`migration/source-inventory/traceability-matrix.csv` — **537 legacy actions**
(the matrix tracks the legacy *API actions*, so it does not grow):

| Status | Before P5 | After P5 |
| --- | --- | --- |
| implemented | 46 | **58** |
| partial | 5 | 5 |
| pending | 477 | **465** |
| obsolete | 9 | 9 |

13 `HR.gs` payroll/slip action rows moved from `pending` to `implemented` with their new
endpoint, tables and defect notes. `emailSalarySlip`, `buildPayrollRegisterHtml` and the
ESI/PF register builders stay `pending`/`partial` — they are genuinely not done.

Attendance has no legacy row because it has no legacy equivalent; it is recorded in §9.

---

## 13. Next phase

**Phase 6 — Accounts/Finance, Assets/Inventory, Documents, SLA/Client Care depth.**
Phase 6 also picks up the slips PDF + email (P5-1), the ESI/PF register builders (P5-3)
and the biometric import adapter (P5-5), and must keep `npx vitest run` green.
