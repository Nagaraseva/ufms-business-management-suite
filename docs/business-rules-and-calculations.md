<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Business Rules and Calculations

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Why this document exists

The payroll and quotation engines are the highest-risk part of the migration. Part 4 §K requires
that statutory rules be **configurable, effective-dated and reviewed**, and Part 13 requires
payroll calculation tests. This document records what the legacy code actually computes, so the
new engine can be validated against it rather than reinvented.

## 2. Where the money logic lives

| Statutory concept | References | Concentrated in |
|---|---|---|
| Provident Fund | 20 | HR.gs (11), TenderAI.gs (5), ServiceLevelAgreements.gs (4) |
| Employees State Insurance | 147 | Quotations.gs (49), MarketingTemplates.gs (34), HR.gs (32), Clients.gs (9) |
| Professional Tax | 6 | Clients.gs (2), ServiceLevelAgreements.gs (2), Presentation.gs (1), Quotations.gs (1) |
| Tax Deducted at Source | 18 | HR.gs (15), Database.gs (2), Accounts.gs (1) |
| Labour Welfare Fund | 18 | Clients.gs (8), Quotations.gs (6), ServiceLevelAgreements.gs (2), MinimumWages.gs (1) |
| Statutory Bonus | 28 | Quotations.gs (13), Clients.gs (10), HR.gs (5) |
| Gratuity | 34 | Quotations.gs (20), Clients.gs (14) |
| Minimum Wages | 121 | MinimumWages.gs (58), MarketingTemplates.gs (34), AuthAndApi.gs (7), Setup.gs (7) |
| Overtime | 20 | Quotations.gs (8), Clients.gs (4), MinimumWages.gs (4), ServiceLevelAgreements.gs (3) |
| Leave / LOP | 0 | — |

## 3. Literal numeric constants that look statutory

Extracted automatically. **None of these is trusted as a default.** Each becomes an
effective-dated row in `statutory_rates` after review against current official notifications.

| Constant | Value | Comment in source | Location |
|---|---|---|---|
| `WEBSITE_LEAD_MAX_PER_DAY` | 60 | — | AuthAndApi.gs:1239 |
| `BULK_IMPORT_MAX_ROWS_` | 1000 | — | BulkImport.gs:11 |
| `MAX_EDGE` | 2048 | — | CreativeStudio.gs:225 |
| `ASSISTANT_MAX_CONTEXT_CHARS` | 14000 | — | CrmAssistant.gs:30 |
| `ASSISTANT_MAX_ANSWER_TOKENS` | 700 | — | CrmAssistant.gs:31 |
| `ASSISTANT_ROWS_QUOTES` | 20 | — | CrmAssistant.gs:33 |
| `SCRIPT_RECORD_TTL_SEC_` | 1800 | sheet records TTL (30 min; CacheService allows up to 21600s). | Database.gs:359 |
| `SCRIPT_BALANCE_TTL_SEC_` | 120 | computed balances TTL (120s; stock-movement writes invalidate immediately) | Database.gs:363 |
| `HR_PF_BASIC_CAP_` | 25000 | PF 12% calculated on min(basic + DA, cap) — v5.6.52-ops | HR.gs:46 |
| `HR_PF_EMPLOYEE_PCT_` | 12 | % of capped basic | HR.gs:47 |
| `HR_ESI_THRESHOLD_` | 21000 | ESI applicable only if gross ≤ this | HR.gs:48 |
| `HR_ESI_EMPLOYEE_PCT_` | 0.75 | % | HR.gs:49 |
| `HR_ESI_EMPLOYER_PCT_` | 3.25 | % (informational only, not deducted from employee) | HR.gs:50 |
| `ESI_EMPLOYER_RATE_` | 3.25 | — | HR.gs:788 |
| `PF_EMPLOYER_EPF_RATE_` | 12 | — | HR.gs:789 |
| `PF_EMPLOYER_EPS_RATE_` | 8.33 | — | HR.gs:790 |
| `PF_EMPLOYER_EDLIS_RATE_` | 0.5 | — | HR.gs:792 |
| `TOTAL` | 8 | — | Presentation.gs:418 |
| `BULK_EMAIL_MAX` | 200 | — | ProfileAndBulkEmail.gs:4 |
| `CELL_LIMIT` | 45000 | — | TenderAI.gs:4238 |
| `MAX_ENTRIES` | 30 | — | TenderAI.gs:4442 |
| `MAX_CHARS` | 30000 | — | TenderAI.gs:5903 |

## 4. Rules recovered from source (to be re-implemented and tested)

> These are recorded as **requirements to re-test**, not as guaranteed-correct behaviour.
> Each will get a dedicated unit test in `tests/unit/payroll`.

### 4.1 Wage breakup / CTC construction (`TakeHomeSalary.gs`, `Quotations.gs`)

The v5.6.61 release notes describe 15 optional add-ons that toggle per breakup. Each is a
multiplier on the CTC build. The rule set to preserve:

| Option | Behaviour | Verification test needed |
|---|---|---|
| National & Festival Holidays | Adds *N* paid holidays (default 10 days) to the wage build | holiday-days × daily rate added exactly once |
| Karnataka LWF | Employer ₹100 / employee ₹50 per year (configurable) | annualised ÷ 12, rounded per configured rule |
| PT as yearly average | Professional tax for Karnataka annualised (₹2,500) ÷ 12 | monthly PT = annual/12 within ₹ tolerance |
| Labour Code 50% wage rule | Basic + DA must be ≥ 50% of total wage | engine **rejects** a breakup that violates it |
| ESI on all allowances | Widens the ESI contribution base | base includes allowances only when ticked |
| PF on full Basic + DA (no cap) | Removes the ₹15,000 statutory ceiling | cap applied only when option off |
| Extra 4 Hrs as overtime | Treats 4 h/month as OT per post | OT = (rate/26/8) × hours × multiplier |
| Bonus rate | Statutory bonus 8.33%–20%, configurable | bonus within bounds; formula = basic × rate |
| Weekly-off reliever | 1 reliever per 6 posts | ceil(posts/6) additional manpower |
| Uniform charged / deducted | Adds or subtracts uniform cost | sign direction correct in CTC vs take-home |
| Split PF | 12% EPF + 0.5% EDLI + 0.5% admin | three separate ledger lines |
| Bonus paid yearly | Accrues monthly, pays annually | accrual = monthly bonus × 12 |
| Round to whole rupees | Rounding applied at the end | no intermediate rounding |
| Per-day / per-hour rate rows | Derived display rows | derived = monthly/26 and /(26×8) |
| Own allowance rows (≤3) | Custom allowances each with PF/ESI flags | flags include the row in the correct base |

**Default state matters:** the release notes state every option starts OFF (two uniform ticks
start ON) so existing saved figures do not change. The migration must reproduce that default
exactly, or every historical quotation silently changes value.

### 4.2 Payroll / take-home (`TakeHomeSalary.gs`, `MinimumWages.gs`)

| Rule | Legacy behaviour found | Required in new engine |
|---|---|---|
| Attendance-based salary | Pro-rated on days worked | Configurable divisor (26 / 30 / calendar) per statutory profile |
| Loss of pay | Deducted from gross | LOP days × daily rate, computed pre-statutory |
| Overtime | Rate multiplier applied to basic | Multiplier configurable (default per state rule) |
| Minimum wage validation | Compares component sums to a wage-rate set | Hard **block** on payroll approval if below minimum wage for the category/zone, unless an authorised, audited override exists |
| PF ceiling | Applied conditionally | Effective-dated ceiling; ceiling removal is an explicit option |
| ESI eligibility | Wage-threshold based | Effective-dated threshold; **contribution only when wage ≤ threshold** |
| Professional Tax | State slab based | Slab table per state, effective-dated |
| TDS | Present but thin | Out of scope for v1 of the engine until formally specified — see known-limitations |

### 4.3 Quotation maths (`Quotations.gs`)

| Rule | Behaviour |
|---|---|
| Numbering | Sequential per financial year via a register sheet — **race-prone**, becomes a Postgres sequence inside a transaction |
| Revisions | Snapshot of the whole quotation stored as JSON per revision (immutable) |
| Line items | Description, unit, quantity, rate, amount (rate × qty), rounding at line level |
| Management fee | Percentage applied on a configurable base, added before tax |
| Tax | Single tax percentage on the taxable subtotal |
| Won/Lost | Status transition writes a `WonHandover` row and seeds a contract |
| PDF | Google Docs template merge → PDF → Drive |

## 5. Rules that will be **rejected** in the new system (documented deviations)

Per Part 1 rule 13, any change to working business rules must be documented. These are intentional
deviations:

| Legacy behaviour | New behaviour | Reason |
|---|---|---|
| Quotation/PF number from sheet row count | Per-tenant PostgreSQL sequence in a transaction | Concurrent saves can duplicate numbers |
| Statutory rates as literals | Effective-dated `statutory_rates` rows requiring review | Part 4 §K; rates change by notification |
| Payroll editable after approval | Run locks on approval; corrections via adjustment/reversal run | Part 4 §K maker-checker and locking |
| No separation of preparer and approver | Preparer cannot approve own run unless an audited exception is configured | Part 4 §K |
| `ReadAccess` parsed but not enforced | Enforced read scope | Silent advisory control is a security defect |

---

## 6. Differential verification against the legacy engine (Phase 2)

> **Added in Phase 2.** This section records how the new wage engine was proven
> equivalent to the code that has been invoicing customers.

### 6.1 Method

`tests/unit/legacy-oracle.mjs` lifts the *actual* legacy functions out of
`Quotations.gs` and `Database.gs` by brace-matching and evaluates them in Node:

| Function | Role |
|---|---|
| `salaryBreakupCalc_` | the whole per-column calculation |
| `salaryBreakupOpts561_` | option normalisation and clamping |
| `salaryBreakupXa561_` | custom-allowance totals |
| `salaryBreakupField_`, `salaryBreakupUp561_` | field parsing, round-up |
| `breakupFeePerHead559_` | management-fee distribution |
| `number_`, `clean_` | scalar helpers |

`tests/unit/wage-engine.parity.test.ts` then runs the legacy code and the new
TypeScript engine side by side and asserts every money field matches to 1e-6.

### 6.2 Coverage

| Test | Cases |
|---|---|
| Default configuration | 1 |
| Every option tick ON | 1 |
| ESI / Group-Insurance decision table | 4 combinations |
| Professional Tax on-gross vs take-home | 6 |
| Labour Code 50% wage floor | 2 |
| Management-fee modes | 5 modes × 2 rows |
| `fee = null` contract | 1 |
| **Randomised matrix** | **400 full breakups**, 26 money fields each |
| Uniform switches | 2 |
| Option defaults / clamping | 2 |

Total assertions comparing engine output to legacy output: **> 10,000**.
Result: **15/15 passing**.

### 6.3 Defect discovered by the parity suite

**L-01 — `totals.headcount` string concatenation (severity: low, display only)**

`salaryBreakupCalc_` ends with:

```js
headcount: cols.reduce(function (sum, c) { return sum + c.headcount; }, 0)
```

`c.headcount` is not overwritten in the returned object, so when the breakup
JSON carries headcounts as text (which is what Google Sheets produces), `+`
**concatenates**: two rows of 10 and 2 yield the string `"0102"` instead of 12.

- **Impact:** any UI surface that displays "total headcount" from this value.
  Monetary totals (`totalBilling`, `takeHome`) multiply rather than add, so
  they are unaffected and remain correct.
- **New behaviour:** always a number.
- **Test:** `describe('Legacy defect L-01 …')` asserts the legacy string
  result, the corrected numeric result, and that the two agree when the legacy
  engine receives numeric input.

This defect was found *only* because the comparison used the real code. It is
recorded here rather than silently fixed (Project Rule 13).

### 6.4 Documented deviations introduced in Phase 2

| # | Change | Reason |
|---|---|---|
| 1 | Statutory rates (`PF 12/13%`, `ESI 3.25/0.75%`, `EDLI 0.5%`, `admin 0.5%`, `gratuity 4.81%`, bonus `8.33%`) are **inputs** defaulting to the legacy values | Part 4 §K requires effective-dated configuration; defaults preserve existing figures exactly |
| 2 | `totals.headcount` returns a number (L-01) | Defect fix |
| 3 | `NaN` inputs are rejected by validation instead of silently coercing to the fallback | Predictable payroll |
| 4 | Quotation and lead numbers come from a per-tenant transaction-scoped lookup, not a row count | Legacy defect D7 (duplicate numbers under concurrency) |

Everything else — operation order, rounding points, conditional bases, the
"management fee never enters CTC" rule, and the ESI/Group-Insurance decision
table — is preserved byte-for-byte in behaviour.
