<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Source Project Inventory

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Purpose

This is the verified inventory of the legacy `United Sales CRM` Google Apps Script
project at version **v5.6.61-options**. It is produced mechanically from the files
themselves. It supersedes any count in the handover documentation where the two disagree —
see §5.

## 2. Verified counts

| Measure | Verified value | Method |
|---|---|---|
| Application name (from source) | United Sales CRM | `APP.NAME` in `Database.gs` |
| Application version (from source) | `v5.6.61-options` | `buildVersion_()` in `Database.gs` |
| Apps Script files (`.gs`) | 42 | filesystem |
| Server-side functions | 1,723 | AST-style scan of `function` declarations |
| Server-side lines of code | 45,284 | line count of all `.gs` |
| HTML files | 3 | filesystem |
| Sheet tabs declared in `APP.SHEETS` enum | 107 | object literal scan |
| Sheet tab schemas declared in `SCHEMA` | 118 | object literal scan |
| **Physical sheet tabs created by setup** | **118** | `Object.keys(SCHEMA)` in `Setup.gs:19` |
| Roles | 9 | `ROLE_ENUM_V4_` |
| Authenticated API actions | 537 | switch cases inside `api()` |
| Public token-based email-link actions | 6 | switch cases inside `handleEmailLinkAction_()` |
| **Total unique dispatch labels** | **542** | 537 + 6 − 1 duplicate (`ping`) |
| Public `doGet` query parameters | 8 | parameter scan of `doGet` |
| Scheduled trigger installers | 14 | `ScriptApp.newTrigger` with resolved handler |
| Frontend RPC actions used | 373 | `rpc('x')` call scan in `Index.html` |
| Navigation pages defined | 84 | `navigationItems()` tuples |

## 3. File inventory (largest first)

| File | LOC | Functions | Public | KB | Product module(s) | Google services |
|---|---|---|---|---|---|---|
| `TenderAI.gs` | 6,011 | 162 | 1 | 275 | Tender Management, AI Assistant | SpreadsheetApp, DriveApp, Drive, PropertiesService, CacheService, UrlFetchApp, Utilities, DocumentApp |
| `MinimumWages.gs` | 4,392 | 151 | 0 | 242 | Manpower & Operations, Payroll & Statutory Compliance | SpreadsheetApp, DriveApp, MailApp, PropertiesService, CacheService, UrlFetchApp, Utilities |
| `Assets.gs` | 2,712 | 92 | 0 | 139 | Assets & Inventory | SpreadsheetApp, MailApp, PropertiesService, CacheService, Utilities, ScriptApp |
| `Quotations.gs` | 2,048 | 79 | 0 | 149 | Quotations | DriveApp, GmailApp, MailApp, Drive, Utilities |
| `ServiceLevelAgreements.gs` | 2,034 | 59 | 0 | 164 | SLA & Client Care, Document Generation | DriveApp, UrlFetchApp, Utilities, ScriptApp, DocumentApp |
| `EmailMarketing.gs` | 1,791 | 102 | 1 | 111 | Marketing & Communication | SpreadsheetApp, MailApp, HtmlService, ContentService, PropertiesService, LockService, UrlFetchApp, Utilities, Session, ScriptApp |
| `SocialMedia.gs` | 1,779 | 82 | 0 | 112 | Marketing & Communication | SpreadsheetApp, DriveApp, MailApp, HtmlService, PropertiesService, UrlFetchApp, Utilities, ScriptApp |
| `HR.gs` | 1,725 | 61 | 0 | 87 | HR Management, Manpower & Operations, Payroll & Statutory Compliance | SpreadsheetApp, DriveApp, MailApp, PropertiesService, Utilities |
| `Moms.gs` | 1,648 | 77 | 0 | 99 | Reports & Dashboards, Collaboration | DriveApp, MailApp, Drive, Utilities |
| `AuthAndApi.gs` | 1,560 | 50 | 3 | 113 | User & Access Management | SpreadsheetApp, DriveApp, MailApp, HtmlService, ContentService, PropertiesService, CacheService, Utilities |
| `Marketing.gs` | 1,407 | 74 | 0 | 80 | Marketing & Communication | SpreadsheetApp, HtmlService, PropertiesService, UrlFetchApp, Utilities, Session, ScriptApp |
| `CrmAssistant.gs` | 1,340 | 35 | 1 | 80 | AI Assistant | PropertiesService, CacheService, ScriptApp |
| `Reports.gs` | 1,273 | 45 | 6 | 92 | Reports & Dashboards | MailApp, PropertiesService, Utilities |
| `Clients.gs` | 1,264 | 50 | 0 | 95 | Client & Contract Management | DriveApp, Utilities, Session |
| `TakeHomeSalary.gs` | 1,219 | 41 | 0 | 53 | Quotations, Payroll & Statutory Compliance | SpreadsheetApp, DriveApp, PropertiesService, UrlFetchApp, Utilities, ScriptApp |
| `LeadsAndSurveys.gs` | 1,213 | 57 | 0 | 89 | Sales CRM, Site Survey | SpreadsheetApp, DriveApp, MailApp, PropertiesService, CacheService, UrlFetchApp, Utilities, ScriptApp |
| `Accounts.gs` | 1,162 | 54 | 0 | 54 | Accounts & Finance | SpreadsheetApp, PropertiesService, Utilities, Session |
| `Database.gs` | 1,091 | 49 | 0 | 72 | Platform Administration, User & Access Management | SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities |
| `WonHandover.gs` | 1,050 | 41 | 0 | 58 | Client & Contract Management | DriveApp, MailApp, Utilities |
| `EmailDirectory.gs` | 980 | 27 | 1 | 48 | Marketing & Communication | SpreadsheetApp, MailApp, PropertiesService, UrlFetchApp, Session, ScriptApp |
| `TenderOrdersAndSD.gs` | 906 | 29 | 0 | 60 | Tender Management | DriveApp, MailApp, Utilities |
| `CreativeStudio.gs` | 871 | 49 | 0 | 51 | Creative Studio & Templates | DriveApp, PropertiesService, UrlFetchApp, Utilities |
| `MarketingTemplates.gs` | 781 | 22 | 0 | 314 | Marketing & Communication | — |
| `BulkImport.gs` | 653 | 10 | 0 | 36 | Accounts & Finance | SpreadsheetApp, PropertiesService |
| `Presentation.gs` | 625 | 10 | 0 | 29 | Creative Studio & Templates, Document Generation | Utilities |
| `Tenders.gs` | 552 | 23 | 1 | 37 | Tender Management | DriveApp, MailApp, PropertiesService, UrlFetchApp, Utilities |
| `DailyReports.gs` | 520 | 28 | 0 | 34 | Reports & Dashboards | SpreadsheetApp, DriveApp, UrlFetchApp, Utilities, ScriptApp |
| `ClientCare.gs` | 497 | 52 | 0 | 35 | Client & Contract Management, SLA & Client Care | Utilities |
| `ProfileAndBulkEmail.gs` | 407 | 22 | 0 | 23 | User & Access Management, Sales CRM | DriveApp, MailApp, Utilities |
| `Setup.gs` | 398 | 15 | 7 | 27 | Platform Administration, Organisation Management | SpreadsheetApp, DriveApp, MailApp, PropertiesService, Utilities, ScriptApp |
| `GmailDownloader.gs` | 318 | 10 | 0 | 13 | Marketing & Communication | UrlFetchApp, Utilities, ScriptApp |
| `Theme.gs` | 222 | 15 | 0 | 10 | Platform Administration | — |
| `Exports.gs` | 202 | 7 | 0 | 22 | Reports & Dashboards, Document Generation | SpreadsheetApp, DriveApp, UrlFetchApp, Utilities, ScriptApp |
| `Collaboration.gs` | 158 | 12 | 0 | 7 | Collaboration | — |
| `EmailTemplates.gs` | 153 | 10 | 0 | 7 | Marketing & Communication | DriveApp, Utilities |
| `Companies.gs` | 134 | 15 | 0 | 8 | Platform Administration, Organisation Management, Tender Management | — |
| `ManualDrive.gs` | 65 | 3 | 1 | 3 | Document Generation | DriveApp, PropertiesService, Utilities |
| `PresentationImages.gs` | 60 | 2 | 0 | 179 | Creative Studio & Templates | — |
| `ManpowerHeroes.gs` | 29 | 1 | 0 | 432 | HR Management, Manpower & Operations | — |
| `ServiceTemplateImages.gs` | 24 | 0 | 0 | 401 | Creative Studio & Templates | — |
| `Logo.gs` | 6 | 0 | 0 | 55 | Creative Studio & Templates | — |
| `ProposalTemplates.gs` | 4 | 0 | 0 | 414 | Creative Studio & Templates, Document Generation | — |

### Observations

- The eight largest files hold 22,492 lines between them —
  **50% of the backend** —
  and each mixes several business domains. `TenderAI.gs` alone is 6,011 lines.
  This is why the new architecture splits by domain module rather than by file.
- `Index.html` is a single 2.14 MB document containing
  23,101 lines, 18 script blocks and
  21 style blocks. There is no component boundary, no module system and
  no route-level code splitting.
- Six files declare **zero** top-level functions and consist only of literal data
  (logo data-URIs, template images). These must become tenant-scoped asset storage, not source code:
  `Logo.gs` (55 KB), `ProposalTemplates.gs` (414 KB), `ServiceTemplateImages.gs` (401 KB).

## 4. Frontend inventory

| Measure | Value |
|---|---|
| Single app page | `Index.html` — 23,101 lines, 2.14 MB |
| Direct `google.script.run` references | 2 (all inside the `rpc()` wrapper) |
| Distinct backend actions invoked by the UI | 373 |
| Total `rpc()` call-sites | 524 |
| Navigation pages | NaN |
| Modal / screen render functions | 185 |

The navigation is generated per role inside `navigationItems(role)`. The NaN
distinct pages are listed in [existing-module-mapping.md](existing-module-mapping.md).

## 5. Reconciliation against the handover documentation

Part 3 instructs that documented counts be verified rather than assumed. Results:

| Claim | Status | Evidence |
|---|---|---|
| "42 server files" (README) | ✅ **CONFIRMED** | 42 `.gs` files on disk |
| "118 sheets" | ✅ **CONFIRMED — with a caveat** | `SCHEMA` declares 118 sheet schemas and `setupUnitedCRM` creates a tab for every key (`Object.keys(SCHEMA)` at `Setup.gs:19`). The `APP.SHEETS` enum names only 107. The 11-sheet difference is the Accounts/back-office group, which is addressed by string literal: Invoices, InvoiceItems, InvoicePayments, WorkingSheets, WorkingSheetItems, VendorBills, VendorBillItems, VendorPayments, BankAccounts, JournalEntries, ManagementApprovals. **The true physical tab count is 118.** |
| "542 server actions" | ✅ **CONFIRMED — with a caveat** | 537 cases inside the authenticated `api()` switch, plus 6 cases in the public `handleEmailLinkAction_` switch, minus one duplicated label (`ping`) = **542 unique labels**. Only 537 are reachable through the authenticated API. |
| "27 test suites, 2,389 checks, no failures" | ⚠️ **UNVERIFIABLE** | The test kit is explicitly not included in the bundle ("The test kit is not needed to run the CRM and is not part of this bundle"). No claim about legacy test coverage can be validated, so **no legacy correctness is assumed**; every business rule used by the new payroll and quotation engines is re-derived from source and re-tested. |
| Minimum wages / statutory rates | ⚠️ **HARD CODED, NEUTRALISED** | Statutory logic exists in `MinimumWages.gs`, `TakeHomeSalary.gs` and `HR.gs` but includes literal rate constants. See [business-rules-and-calculations.md](business-rules-and-calculations.md). None are carried into production defaults without review. |

## 6. What is *not* in this bundle

- The database spreadsheet itself (no data, therefore **no real customer, employee or
  financial records were seen or copied** during this audit — Part 1 rule 16 satisfied by construction).
- The developer's automated test kit.
- Any deployment credentials or script properties.

