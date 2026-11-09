<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Known Defects and Risks

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Summary

Mechanically detected from source; every item is reproducible by re-running `audit.mjs`.

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 3 |
| Medium | 4 |
| Low | 0 |
| **Total** | **10** |

## 2. Defects

### D2 — API actions reachable with a session but no explicit permission check

**Severity:** CRITICAL

389 action(s) rely on authentication only. Any signed-in user of any role can invoke them. The new API must attach an explicit permission to every route.

<details><summary>Evidence</summary>

```json
[
  "calendarReminders",
  "getUserNotes",
  "saveUserNote",
  "deleteUserNote",
  "getThemeState",
  "saveMyThemePref",
  "getChatMessages",
  "markChatRead",
  "postChatMessage",
  "exportStructuredData",
  "getSlaDraft",
  "generateSla",
  "momFormData",
  "momSiteOptions",
  "momListFor",
  "momDashboard",
  "listMoms",
  "searchMoms",
  "getMom",
  "saveMom",
  "finalizeMom",
  "archiveMom",
  "duplicateMom",
  "listMomActions",
  "listMyMomActions",
  "getOverdueMomActions",
  "updateMomActionStatus",
  "assignMomAction",
  "createFollowupFromAction",
  "uploadMomAttachment",
  "deleteMomAttachment",
  "listMomTemplates",
  "generateMomPdf",
  "emailMom",
  "momEmailSuggestions",
  "listInvoices",
  "getInvoice",
  "getInvoiceFromTender",
  "saveInvoice",
  "cancelInvoice",
  "recordReceipt",
  "approveReceipt",
  "rejectReceipt",
  "listBills",
  "getBill",
  "saveBill",
  "cancelBill",
  "recordVendorPayment",
  "approveVendorPayment",
  "rejectVendorPayment",
  "listBankAccounts",
  "saveBankAccount",
  "getBankBook",
  "getAccountsOverview",
  "getReceivableAgeing",
  "getPayableAgeing",
  "getGstrSummary",
  "getTdsSummary",
  "getProfitLoss",
  "listAccountsApprovals"
]
```

</details>

### D3 — Web app is published as ANYONE_ANONYMOUS with broad OAuth scopes

**Severity:** CRITICAL

The deployment is world-readable and executes as the deploying account. All authorisation therefore rests on the in-script token check. The new platform must use per-user authentication with scoped authorisation.

<details><summary>Evidence</summary>

```json
{
  "executeAs": "USER_DEPLOYING",
  "access": "ANYONE_ANONYMOUS"
}
```

</details>

### D6 — No tenant isolation: all data lives in one spreadsheet namespace

**Severity:** CRITICAL

Every record in the legacy system belongs to a single implicit organisation. There is no tenant_id concept anywhere in the schema, so sharing the application between customers is impossible without a redesign. This is the single largest change in the new platform and is why Part 5 mandates tenant_id on every tenant-owned table.

<details><summary>Evidence</summary>

```json
APP.SHEETS has no tenant-scoped keying
```

</details>

### D2b — State-changing operations reachable without authentication via email links

**Severity:** HIGH

6 action(s) (indent / purchase-request approve-reject, stock acknowledgement) execute on a URL token alone. Tokens travel in email, in link scanners and in browser history. The replacement keeps an explicit signed, single-use, expiring token endpoint — but scoped to one action, rate limited, and recorded in the audit log.

<details><summary>Evidence</summary>

```json
[
  "approveindent",
  "rejectindent",
  "approvepurchaserequest",
  "rejectpurchaserequest",
  "acknowledgedistribution",
  "ping"
]
```

</details>

### D4 — Full Drive scope granted to the application

**Severity:** HIGH

The app holds read/write over the entire Drive of the deploying account, which is far beyond what document generation needs. The replacement uses a scoped object-storage adapter plus per-tenant Google OAuth with least privilege.

<details><summary>Evidence</summary>

```json
oauthScopes contains .../auth/drive
```

</details>

### D8 — Insufficient critical-section protection

**Severity:** HIGH

Only 2 LockService usage(s) across 42 files while the app performs thousands of sheet writes, including payroll and invoice numbering. Two simultaneous users can interleave reads and writes. The replacement uses PostgreSQL transactions and row locks.

<details><summary>Evidence</summary>

```json
2 LockService references
```

</details>

### D5 — Configuration and secrets held in PropertiesService script properties

**Severity:** MEDIUM

75 uses of PropertiesService. Script properties are readable by anyone with editor access to the Apps Script project and are not versioned, auditable or rotatable. The replacement stores configuration in the database and secrets in a managed secret store.

<details><summary>Evidence</summary>

```json
PropertiesService across 20 files
```

</details>

### D10 — Monolithic single-file frontend

**Severity:** MEDIUM

Index.html is 2.14 MB and 23,101 lines with 18 script blocks and 21 style blocks. It cannot be code-split, tree-shaken, unit-tested or cached per-route, and every user downloads the whole application.

<details><summary>Evidence</summary>

```json
2240180 bytes
```

</details>

### D11 — Silent failure swallowing

**Severity:** MEDIUM

338 empty catch block(s) discard errors without logging. Failures in payroll or invoicing can pass unnoticed. The replacement uses a central exception filter and structured logging with correlation ids.

<details><summary>Evidence</summary>

```json
338 empty catch blocks
```

</details>

### D12 — Unstructured console logging in production paths

**Severity:** MEDIUM

16 console.* calls with no redaction layer. Apps Script logs are visible to project editors and may contain employee or client data. The replacement uses a structured logger with a mandatory redaction allow-list that refuses to serialise password, token, bank-account and employee-personal fields.

<details><summary>Evidence</summary>

```json
16 console calls
```

</details>


## 3. Risks that are not code defects

| Risk | Impact | Mitigation |
|---|---|---|
| Statutory rates may already be out of date in the legacy data | Payroll paid on stale rates; compliance exposure | Effective-dated rates + mandatory review gate before first production payroll; documented as a launch blocker |
| Legacy test kit not supplied ("2,389 checks, no failures" unverifiable) | No regression baseline can be trusted | Rebuild rule tests from source; reconcile migrated financial totals instead of trusting legacy assertions |
| Google Sheets is the system of record during cut-over | Dual-write divergence during migration | Read-only freeze window, reconciliation report, and a documented rollback that keeps Sheets authoritative until sign-off |
| Free-tier hosting used for testing (Part 14) | Sleeping services, expiring databases | Never hold real customer data on free tiers; documented in deployment guide |
| Single Drive scope over the deploying account | A compromise reaches every file the owner can see | Scoped storage + per-tenant OAuth; least-privilege review |
| Indian DPDP Act obligations not yet legally reviewed | Compliance risk at commercial launch | Privacy-by-design implemented; legal review flagged as a pre-launch gate |

