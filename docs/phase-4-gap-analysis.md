# Phase 4 Gap Analysis — what the source does *not* contain

**Date:** 2026-11-07
**Method:** direct inspection of the v5.6.61 source in `_incoming/source-v5.6.61/`, cross-checked against `audit.json` and the SCHEMA block in `Database.gs`.

This document exists because Rule 1 requires verifying documentation claims against actual source code, and Phase 4 is where the handover documentation diverges most sharply from the code.

---

## Finding P4-1 — Attendance, leave, roster and shift management do not exist

The implementation roadmap (written in Phase 0 from the handover documents) states Phase 4 covers:

> "Employees, documents, deployment, **attendance, leave, shifts**"

**None of those last three exist in the source.** Evidence:

| Search | Result |
|---|---|
| Sheets named `*Attendance*`, `*Leave*`, `*Roster*`, `*Shift*` in `Database.gs` SCHEMA | **zero** |
| Server actions matching `attendance\|leave\|shift\|roster` in the 537-action dispatch table | **zero** |
| `Attendance*`, `Leave*`, `Roster*` functions across all 42 `.gs` files | **zero** |
| Any SQL-free write path that records "who was present on which day" | **none** |

The only related strings are:

1. **`ShiftPattern`** — a column on the `Surveys` sheet (`Database.gs:137`) describing the *client's* operating pattern ("2 shifts / 24×7"). It is a survey input, not a roster.
2. **"attendance" in prose** — a line in `Presentation.gs:240` (a marketing slide) and in `ServiceLevelAgreements.gs:66,98` (generated SLA contract text that promises the client "attendance records … by biometric or register").

### Why this matters

The legacy product **contracts to deliver** attendance records in its SLA text, but has **no system to capture them**. Site supervisors keep a paper or spreadsheet register outside the product. This means:

- Any migration that claims to "migrate attendance" would be inventing data or inventing a module.
- The payroll engine's `daysWorked` / `daysPresent` inputs (`HR.gs:429-460`) are typed in by hand at salary-slip time, with no source of truth behind them.

### Decision (Rule 12 — document the assumption, continue safely)

**Not built in Phase 4.** Reasons:

1. It is not a migration — there is nothing to port, so it cannot be validated against legacy behaviour the way every other Phase 4 rule was (see the 34 parity tests).
2. The correct prerequisite is the deployment model, which Phase 4 *did* build: an employee now has dated `EmployeeAllocation` rows tying them to a contract and site. A roster cannot be designed without that.
3. Attendance is the input to payroll `daysWorked`, so it belongs beside the payroll run rather than before it.

**Recorded as new capability, scheduled in Phase 5**, under the label *"Attendance capture (new — no legacy equivalent)"*. It will be designed to:

- attach roster days to `EmployeeAllocation` rows (which now carry contract + site + date range),
- feed `daysWorked` / `daysPresent` into the payroll run instead of manual entry,
- reconcile against the SLA attendance KPI (`ServiceLevelAgreements.gs:66` — "98% or more in the month"),
- and support the invoice deduction rule in `ServiceLevelAgreements.gs:98`: *"Manpower shortfall beyond the allowance stated in the commercial summary is deducted from the invoice"* — a Phase 6 finance rule that needs attendance data to compute.

The migration traceability matrix records these as **not migrated (no source module)** rather than silently dropping them.

---

## Finding P4-2 — PF wage ceiling: the "15000" in older release notes is stale

`Quotations.gs:897` carries an explicit comment:

```js
pfCap: 25000, // P.F. wage ceiling — ₹25,000 (was 15000; fixed so stored payloads recalc at the new cap)
```

`HR.gs:48` independently sets `HR_PF_BASIC_CAP_ = 25000`.

**Both paths now agree on ₹25,000.** There is no discrepancy to reconcile, and the ported engines match. Recorded here because the earlier Phase 2 notes referenced ₹15,000 — that value was historical, and the source has since been changed.

The only related switch that still behaves differently by design: the quotation wage breakup honours `pfNoCap`, which removes the ceiling entirely. Payroll (`calculateSalarySlip_`) has no such switch and always applies the cap. That asymmetry is preserved rather than "fixed", because a quotation is a costing tool where an uncapped variant may legitimately be modelled, while a payroll deduction must follow the statute.

---

## Finding P4-3 — Statutory values are hardcoded constants, not configuration

`HR.gs:48-52` hardcodes five statutory values:

```js
const HR_PF_BASIC_CAP_      = 25000;
const HR_PF_EMPLOYEE_PCT_   = 12;
const HR_ESI_THRESHOLD_     = 21000;
const HR_ESI_EMPLOYEE_PCT_  = 0.75;
const HR_ESI_EMPLOYER_PCT_  = 3.25;
```

and `HR.gs:23-31` hardcodes the Karnataka PT slabs, including the February surcharge as a literal `300` inside `hrPtFor_`.

Every one of these changes when a government notifies a change, and each change requires a code edit and redeploy. **Rule 15 forbids this.**

Phase 4 replaces them with `StatutoryRateSet` → `StatutoryRate` / `PtSlab`, effective-dated, with the legacy values preserved as an explicit, labelled fallback (`GET /api/v1/statutory/legacy-defaults`). Parity tests prove the defaults reproduce v5.6.61 exactly, and a separate test proves that a tenant-supplied set changes the result.

---

## Finding P4-4 — Personal identifiers are stored in plaintext

`Employees` schema (`Database.gs:224`) includes `AadhaarNo`, `PANNo`, `UANNo`, `ESINo`, `BankAccountNo` as ordinary text columns in a Google Sheet. Anyone the sheet is shared with — or anyone who obtains the script's Drive scope (defect **D4**, full Drive scope) — reads all of it. This compounds defect **D5** (secrets in PropertiesService).

Phase 4 addresses this: the five identifiers are encrypted with AES-256-GCM before storage, the API returns only masked hints, and full values require `employee:pii:read` plus a recorded reason, and are audited. Verified by integration test against the actual database rows.

---

## Summary

| # | Finding | Type | Action taken |
|---|---|---|---|
| P4-1 | Attendance/leave/roster/shift absent from source | Documentation error in roadmap | Documented; deferred to Phase 5 as new capability with prerequisites named |
| P4-2 | PF ceiling ₹15,000 referenced in old notes | Stale note, no live defect | Corrected in documentation; both engines verified at ₹25,000 |
| P4-3 | Statutory values hardcoded | Rule 15 violation | Replaced with effective-dated configuration |
| P4-4 | PII in plaintext sheet columns | Rule 3 / privacy violation | Encrypted at rest, masked in API, gated reveal |
