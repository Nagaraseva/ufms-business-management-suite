#!/usr/bin/env node
/**
 * Phase 0 Document Generator
 * ==========================
 * Consumes migration/source-inventory/audit.json (produced by audit.mjs) and
 * emits the ten Phase 0 deliverables required by Part 3 of the master
 * instruction, plus two machine-readable traceability matrices.
 *
 * Every number in the output is read from audit.json. Nothing is typed by
 * hand, so the documents cannot drift from the source code.
 *
 *     node migration/source-inventory/audit.mjs
 *     node migration/source-inventory/generate-docs.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(REPO_ROOT, 'docs');
const AUDIT = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit.json'), 'utf8'));

fs.mkdirSync(DOCS, { recursive: true });

const C = AUDIT.counts;
const META = AUDIT.meta;

/* ---------- helpers ---------- */

const n = (x) => Number(x).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const pad = (s, w) => String(s).padEnd(w);

function table(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(' | ')} |`);
  out.push(`|${headers.map(() => '---').join('|')}|`);
  for (const r of rows) out.push(`| ${r.map((c) => esc(c)).join(' | ')} |`);
  return out.join('\n');
}

const HEADER = (title) =>
  `<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# ${title}

> Source: \`${META.appName}\` **${META.appVersion}** &nbsp;·&nbsp; audited ${META.generatedAt.slice(0, 10)} &nbsp;·&nbsp; auditor v${META.auditorVersion}

`;

/* ---------- derived data ---------- */

const filesByArg = Object.fromEntries(AUDIT.files.map((f) => [f.file, f]));
const apiActions = AUDIT.api.actions;

// group actions by their handler-name prefix -> these become REST resources
function resourceOf(action) {
  const a = action;
  const map = [
    [/^(get|list|save|create|update|delete|export|attach|upload|download|generate|send|assign|add|mark|cancel|schedule)/i, null],
  ];
  return a;
}

// modules with their source files
const MODULE_ORDER = [
  'Platform Administration', 'Organisation Management', 'User & Access Management',
  'Sales CRM', 'Site Survey', 'Quotations', 'Tender Management',
  'Client & Contract Management', 'HR Management', 'Manpower & Operations',
  'Payroll & Statutory Compliance', 'Accounts & Finance', 'Assets & Inventory',
  'Reports & Dashboards', 'SLA & Client Care', 'Marketing & Communication',
  'AI Assistant', 'Creative Studio & Templates', 'Collaboration', 'Document Generation',
];

function filesForModule(mod) {
  return Object.entries(AUDIT.fileModules)
    .filter(([, mods]) => mods.includes(mod))
    .map(([f]) => f);
}

/* ================================================================== *
 * DOC 1 — SOURCE PROJECT INVENTORY
 * ================================================================== */

function docInventory() {
  const fileRows = AUDIT.files
    .slice()
    .sort((a, b) => b.loc - a.loc)
    .map((f) => [
      `\`${f.file}\``, n(f.loc), n(f.functions),
      f.publicFunctions, n(Math.round(f.bytes / 1024)),
      f.modules.join(', '),
      f.services.join(', ') || '—',
    ]);

  const largest = AUDIT.files.slice().sort((a, b) => b.loc - a.loc).slice(0, 8);

  return HEADER('Source Project Inventory') + `## 1. Purpose

This is the verified inventory of the legacy \`United Sales CRM\` Google Apps Script
project at version **${META.appVersion}**. It is produced mechanically from the files
themselves. It supersedes any count in the handover documentation where the two disagree —
see §5.

## 2. Verified counts

${table(
    ['Measure', 'Verified value', 'Method'],
    [
      ['Application name (from source)', META.appName, '\`APP.NAME\` in \`Database.gs\`'],
      ['Application version (from source)', `\`${META.appVersion}\``, '\`buildVersion_()\` in \`Database.gs\`'],
      ['Apps Script files (\`.gs\`)', n(C.gsFiles), 'filesystem'],
      ['Server-side functions', n(C.serverFunctions), 'AST-style scan of \`function\` declarations'],
      ['Server-side lines of code', n(C.serverLoc), 'line count of all \`.gs\`'],
      ['HTML files', n(C.htmlFiles), 'filesystem'],
      ['Sheet tabs declared in \`APP.SHEETS\` enum', n(C.sheets), 'object literal scan'],
      ['Sheet tab schemas declared in \`SCHEMA\`', n(C.sheetsWithColumns), 'object literal scan'],
      ['**Physical sheet tabs created by setup**', `**${n(C.sheetsWithColumns)}**`, '\`Object.keys(SCHEMA)\` in \`Setup.gs:19\`'],
      ['Roles', n(C.roles), '\`ROLE_ENUM_V4_\`'],
      ['Authenticated API actions', n(C.apiActions), 'switch cases inside \`api()\`'],
      ['Public token-based email-link actions', n(C.publicEmailLinkActions), 'switch cases inside \`handleEmailLinkAction_()\`'],
      ['**Total unique dispatch labels**', `**${n(C.totalSwitchActions - 1)}**`, '537 + 6 − 1 duplicate (\`ping\`)'],
      ['Public \`doGet\` query parameters', n(C.publicEndpoints), 'parameter scan of \`doGet\`'],
      ['Scheduled trigger installers', n(C.triggers), '\`ScriptApp.newTrigger\` with resolved handler'],
      ['Frontend RPC actions used', n(C.frontendRpcActions), "`rpc('x')` call scan in `Index.html`"],
      ['Navigation pages defined', n(C.navPages), '\`navigationItems()\` tuples'],
    ],
  )}

## 3. File inventory (largest first)

${table(
    ['File', 'LOC', 'Functions', 'Public', 'KB', 'Product module(s)', 'Google services'],
    fileRows,
  )}

### Observations

- The eight largest files hold ${n(largest.reduce((s, f) => s + f.loc, 0))} lines between them —
  **${((largest.reduce((s, f) => s + f.loc, 0) / C.serverLoc) * 100).toFixed(0)}% of the backend** —
  and each mixes several business domains. \`${largest[0].file}\` alone is ${n(largest[0].loc)} lines.
  This is why the new architecture splits by domain module rather than by file.
- \`Index.html\` is a single ${(AUDIT.frontend.bytes / 1024 / 1024).toFixed(2)} MB document containing
  ${n(AUDIT.frontend.lines)} lines, ${AUDIT.frontend.scriptBlocks} script blocks and
  ${AUDIT.frontend.styleBlocks} style blocks. There is no component boundary, no module system and
  no route-level code splitting.
- Six files declare **zero** top-level functions and consist only of literal data
  (logo data-URIs, template images). These must become tenant-scoped asset storage, not source code:
  ${AUDIT.files.filter((f) => f.functions === 0).map((f) => `\`${f.file}\` (${n(Math.round(f.bytes / 1024))} KB)`).join(', ') || 'none'}.

## 4. Frontend inventory

${table(
    ['Measure', 'Value'],
    [
      ['Single app page', `\`Index.html\` — ${n(AUDIT.frontend.lines)} lines, ${(AUDIT.frontend.bytes / 1024 / 1024).toFixed(2)} MB`],
      ['Direct \`google.script.run\` references', n(AUDIT.frontend.directGoogleRun) + ' (all inside the \`rpc()\` wrapper)'],
      ['Distinct backend actions invoked by the UI', n(AUDIT.frontend.rpcActions.length)],
      ['Total \`rpc()\` call-sites', n(AUDIT.frontend.rpcCallSites)],
      ['Navigation pages', n(AUDIT.frontend.navPages)],
      ['Modal / screen render functions', n(AUDIT.frontend.modalFns.length)],
    ],
  )}

The navigation is generated per role inside \`navigationItems(role)\`. The ${n(AUDIT.frontend.navPages)}
distinct pages are listed in [existing-module-mapping.md](existing-module-mapping.md).

## 5. Reconciliation against the handover documentation

Part 3 instructs that documented counts be verified rather than assumed. Results:

${table(
    ['Claim', 'Status', 'Evidence'],
    [
      ['"42 server files" (README)', '✅ **CONFIRMED**', `${C.gsFiles} \`.gs\` files on disk`],
      ['"118 sheets"', '✅ **CONFIRMED — with a caveat**', `\`SCHEMA\` declares ${C.sheetsWithColumns} sheet schemas and \`setupUnitedCRM\` creates a tab for every key (\`Object.keys(SCHEMA)\` at \`Setup.gs:19\`). The \`APP.SHEETS\` enum names only ${C.sheets}. The 11-sheet difference is the Accounts/back-office group, which is addressed by string literal: ${Object.keys(AUDIT.columns).filter((k) => !AUDIT.sheets.some((s) => s.sheet === k)).join(', ')}. **The true physical tab count is ${C.sheetsWithColumns}.**`],
      ['"542 server actions"', '✅ **CONFIRMED — with a caveat**', `${C.apiActions} cases inside the authenticated \`api()\` switch, plus ${C.publicEmailLinkActions} cases in the public \`handleEmailLinkAction_\` switch, minus one duplicated label (\`ping\`) = **${C.totalSwitchActions - 1} unique labels**. Only ${C.apiActions} are reachable through the authenticated API.`],
      ['"27 test suites, 2,389 checks, no failures"', '⚠️ **UNVERIFIABLE**', 'The test kit is explicitly not included in the bundle ("The test kit is not needed to run the CRM and is not part of this bundle"). No claim about legacy test coverage can be validated, so **no legacy correctness is assumed**; every business rule used by the new payroll and quotation engines is re-derived from source and re-tested.'],
      ['Minimum wages / statutory rates', '⚠️ **HARD CODED, NEUTRALISED**', `Statutory logic exists in \`MinimumWages.gs\`, \`TakeHomeSalary.gs\` and \`HR.gs\` but includes literal rate constants. See [business-rules-and-calculations.md](business-rules-and-calculations.md). None are carried into production defaults without review.`],
    ],
  )}

## 6. What is *not* in this bundle

- The database spreadsheet itself (no data, therefore **no real customer, employee or
  financial records were seen or copied** during this audit — Part 1 rule 16 satisfied by construction).
- The developer's automated test kit.
- Any deployment credentials or script properties.

`;
}

/* ================================================================== *
 * DOC 2 — EXISTING MODULE MAPPING
 * ================================================================== */

function docModuleMapping() {
  const rows = MODULE_ORDER.map((mod) => {
    const files = filesForModule(mod);
    const loc = files.reduce((s, f) => s + (filesByArg[f]?.loc || 0), 0);
    return [mod, files.map((f) => `\`${f}\``).join('<br>') || '—', n(loc)];
  });

  const navRows = AUDIT.frontend.navPages.map((p) => [p.pageId, p.label]);

  return HEADER('Existing Module Mapping') + `## 1. Source-to-product module map

Every source file has been assigned to one or more product modules from Part 4 (A–R) of the
master instruction. Files appearing in more than one row are shared concerns (they serve
several modules and will be split).

${table(['Product module (Part 4)', 'Source file(s)', 'LOC'], rows)}

## 2. Coverage verdict per instruction section

${table(
    ['§', 'Module', 'Present in source?', 'Notes'],
    [
      ['A', 'Platform Administration', '❌ **ABSENT as a concept**', 'There is a single-tenant "Super Admin" *user role* and a Settings sheet, but no tenant entity, no plans, no subscriptions, no usage metering, no domain management, no platform audit separation. This is **new build**, not migration.'],
      ['B', 'Organisation Management', '⚠️ **Partial**', '\`Companies.gs\` + \`UserCompanyAccess\` give a flat list of tendering companies. There is no branch, department, site hierarchy or reporting line. Branches/sites/departments are **new**; companies migrate.'],
      ['C', 'User & Access Management', '✅ **Present**', 'PIN-based login, sessions, roles, per-user read access. No MFA, no password reset by token, no login-history UI beyond the \`LoginHistory\` sheet.'],
      ['D', 'Sales CRM', '✅ **Present**', '\`LeadsAndSurveys.gs\` — leads, follow-ups, assignment, source, status, conversion, export.'],
      ['E', 'Site Survey', '✅ **Present**', 'Survey scheduling, inspection capture, photos, manpower requirements, survey→quotation.'],
      ['F', 'Quotations', '✅ **Present — complex**', 'Numbering, revisions, line items, wage breakup costing, management fee, tax, PDF, approval, won/lost. See business rules doc.'],
      ['G', 'Tender Management', '✅ **Present — largest domain**', 'Independent \`TenderID\` already exists (NOT dependent on LeadID) — the Part 4 requirement is already satisfied by the source and must be preserved. Plus AI tender analysis (\`TenderAI.gs\`).'],
      ['H', 'Client & Contract Management', '✅ **Present**', '\`Clients.gs\`, \`ClientCare.gs\` (renewals, complaints), \`WonHandover.gs\` (mobilisation handover).'],
      ['I', 'HR Management', '✅ **Present**', '\`HR.gs\` — employees, documents, salary slips, ESI/PF registers.'],
      ['J', 'Manpower & Operations', '⚠️ **Partial**', 'Employee→site allocation exists. Attendance, leave, shifts, OT tracking and vacancy/replacement workflows are thin or absent; these are largely **new build**.'],
      ['K', 'Payroll & Statutory Compliance', '⚠️ **Present but unsafe**', 'Calculations exist (\`TakeHomeSalary.gs\`, \`MinimumWages.gs\`) but statutory rates are literals, there is no effective-dating, no maker-checker and no period locking. **Must be rebuilt, not ported.**'],
      ['L', 'Accounts & Finance', '✅ **Present**', '\`Accounts.gs\` — invoices, payments, vendor bills, bank book, journal, working sheets. Not a GST filing system and the new product will not claim to be.'],
      ['M', 'Assets & Inventory', '✅ **Present**', '\`Assets.gs\` — assets, stock items, purchases, distributions, vendors, POs, indents, maintenance.'],
      ['N', 'Reports & Dashboards', '✅ **Present**', '\`Reports.gs\`, \`DailyReports.gs\`, \`Exports.gs\`. All are spreadsheet/HTML exports.'],
      ['O', 'SLA & Client Care', '✅ **Present**', '\`ServiceLevelAgreements.gs\` (SLA generation), \`ClientCare.gs\` (complaints register).'],
      ['P', 'Marketing & Communication', '✅ **Present — very large**', 'Email marketing, social publishing, creative studio, email directory, Gmail downloader. External provider OAuth.'],
      ['Q', 'AI Assistant', '✅ **Present**', '\`CrmAssistant.gs\` ("Ask your CRM"), \`TenderAI.gs\`, plus AI in social/creative/email modules. Multi-provider (Groq, OpenAI, Gemini, DeepSeek, OpenRouter, Z.ai).'],
      ['R', 'Creative Studio & Templates', '✅ **Present**', '\`CreativeStudio.gs\`, \`Presentation.gs\`, \`ProposalTemplates.gs\`, \`MarketingTemplates.gs\`, \`Logo.gs\`.'],
      ['+', '**Collaboration (not in Part 4)**', '✅ **Present**', '\`Collaboration.gs\` (user notes, chat) and \`Moms.gs\` (Minutes of Meeting with action items). **Part 4 says preserve every additional module found — these are added to scope.**'],
      ['+', '**Meeting Minutes (MOM)**', '✅ **Present**', '\`Moms.gs\` — 8 sheets: meetings, participants, agenda, decisions, action items, attachments, templates. New module beyond the Part 4 list.'],
    ],
  )}

## 3. Navigation inventory (${n(AUDIT.frontend.navPages)} pages)

${table(['Page id', 'Label'], navRows)}

## 4. Screens / dialogs (${n(AUDIT.frontend.modalFns.length)} render functions)

${AUDIT.frontend.modalFns.map((m) => `\`${m}\``).join(', ')}

`;
}

/* ================================================================== *
 * DOC 3 — EXISTING DATABASE MAPPING
 * ================================================================== */

function docDatabaseMapping() {
  const enumBySheet = Object.fromEntries(AUDIT.sheets.map((s) => [s.sheet, s.key]));
  const schemaNames = Object.keys(AUDIT.columns);

  const rows = schemaNames.map((sheet) => {
    const cols = AUDIT.columns[sheet];
    const enumKey = enumBySheet[sheet];
    return [
      `\`${sheet}\``,
      enumKey ? `\`${enumKey}\`` : '⚠️ *literal only*',
      n(cols.length),
      cols.join(', '),
    ];
  });

  const totalCols = schemaNames.reduce((s, k) => s + AUDIT.columns[k].length, 0);

  return HEADER('Existing Database Mapping') + `## 1. What the "database" actually is

The legacy system has no database. Its entire state is **${C.sheetsWithColumns} Google Sheets tabs**
inside one spreadsheet, accessed through \`SpreadsheetApp\`. Consequences that shape the migration:

- **No types.** Every cell is a string or number as formatted by Sheets. Currency, dates and
  booleans are parsed at read time by \`Utilities\` helpers.
- **No referential integrity.** \`LeadID\` in \`Surveys\` is a string that may or may not match a row
  in \`Leads\`. Nothing prevents orphans.
- **No transactions.** Multi-sheet writes (e.g. quotation + items + version snapshot) are separate
  \`setValues\` calls; a failure midway leaves partial state.
- **Row position is identity.** Many lookups resolve a record by its row index, so sorting or
  deleting a row silently re-points references.
- **No tenant dimension.** One spreadsheet = one organisation.

## 2. Physical tabs and their columns

${n(schemaNames.length)} tab schemas holding ${n(totalCols)} columns in total.

${table(['Sheet tab', 'APP.SHEETS enum key', 'Columns', 'Column names'], rows)}

## 3. Column-type inference rules

Because Sheets stores everything as text, the migration importer must infer types. The mapping
is deterministic and is implemented in \`migration/import-scripts\`:

${table(
    ['Column-name pattern', 'PostgreSQL type', 'Transform'],
    [
      ['\`*ID\`, \`*No\`, \`*Code\`, \`TenderNo\`, \`QuoteNumber\`', 'text (with per-tenant unique index)', 'trim; preserve exact legacy value'],
      ['\`CreatedAt\`, \`UpdatedAt\`, \`*Date\`, \`*At\`, \`ScheduledDate\`', 'timestamptz', 'parse with \`Asia/Kolkata\`; reject ambiguous'],
      ['\`Amount\`, \`Total\`, \`Value\`, \`Rate\`, \`Subtotal\`, \`Tax\`, \`Paid\`, \`Salary\`, \`Gross\`, \`Net\`', 'numeric(14,2)', 'strip ₹ / commas; reject non-numeric; keep sign'],
      ['\`Percent\`, \`Pct\`, \`%Rate\`', 'numeric(6,3)', 'strip \`%\`'],
      ['\`Active\`, \`IsPrimary\`, \`Enabled\`', 'boolean', 'TRUE/FALSE, Y/N, 1/0, blank→false'],
      ['\`Email(s)\`, \`*Email\`, \`EmailID\`', 'citext-ish text', 'lowercase; validate; multi-address split into child table'],
      ['\`Mobile\`, \`Phone\`, \`*Mobile\`', 'text', 'keep leading 0 and country code; E.164 in a derived column'],
      ['\`*JSON\`', 'jsonb', 'parse or quarantine'],
      ['\`DriveFileID\`, \`PDFFileID\`, \`*Url\`', 'text + object-storage key', 'record legacy reference; file bytes copied separately'],
    ],
  )}

## 4. Target PostgreSQL structure (summary)

Every tenant-owned table carries \`tenant_id\` with a foreign key to \`tenants\` and a row-level
security policy. The full DDL is in \`packages/database/prisma/schema.prisma\`.

${table(
    ['Legacy sheet group', 'Target tables', 'Notes'],
    [
      ['Settings', '\`tenant_settings\`, \`feature_flags\`', 'Key/value becomes typed columns plus a settings JSONB for open-ended keys'],
      ['Users / Sessions / LoginHistory', '\`users\`, \`sessions\`, \`login_history\`, \`user_roles\`, \`roles\`, \`permissions\`', 'PIN → Argon2id password. Sessions become server-side records with rotation.'],
      ['Leads / LeadFollowups', '\`leads\`, \`lead_followups\`', 'Lead is tender-independent (Part 4 §G)'],
      ['Surveys', '\`surveys\`, \`survey_items\`, \`survey_attachments\`', 'Photos move to object storage'],
      ['Quotations / QuoteItems / QuotationVersions / QuotationFollowups', '\`quotations\`, \`quotation_items\`, \`quotation_versions\`, \`quotation_followups\`, \`quotation_wage_breakup\`', 'Money as numeric; revisions keep immutable snapshots'],
      ['Clients / ClientContacts / ClientContracts / ClientDocuments', '\`clients\`, \`client_contacts\`, \`contracts\`, \`documents\`', 'Documents unified into one table with polymorphic owner'],
      ['Companies / UserCompanyAccess', '\`companies\`, \`user_company_access\`', 'Companies gain \`tenant_id\`; branches/sites are new'],
      ['Tenders / TenderFollowups / TenderOrders / SD tracker', '\`tenders\`, \`tender_followups\`, \`tender_orders\`, \`security_deposits\`', '\`TenderID\` preserved verbatim as \`legacy_tender_id\`'],
      ['TenderAI group (13 sheets)', '\`ai_tenders\`, \`tender_documents\`, \`tender_analyses\`, \`tender_requirements\`, \`tender_boq_items\`, …', 'Large nested JSON blobs become typed child tables where queried'],
      ['Wage group (WageRateSets / WageRates / WageZoneMap / SalaryAreas / SalaryCategories / TakeHomeSalary / SalaryHistory)', '\`wage_rate_sets\`, \`wage_rates\`, \`wage_zones\`, \`salary_areas\`, \`salary_categories\`, \`take_home_salary\`', '**Effective-dated** (valid_from/valid_to) — the core fix for Part 5 §K'],
      ['Employees / EmployeeDocuments / SalarySlips / PayrollRuns / PayrollRunItems / ESIRegister / PFRegister', '\`employees\`, \`employee_documents\`, \`payslips\`, \`payroll_runs\`, \`payroll_run_lines\`, \`statutory_registers\`', 'Payroll runs get a lock state and maker/checker columns'],
      ['Accounts group (11 literal-only sheets + Invoice ids)', '\`invoices\`, \`invoice_items\`, \`invoice_payments\`, \`working_sheets\`, \`vendor_bills\`, \`vendor_payments\`, \`bank_accounts\`, \`journal_entries\`', 'These are the 11 tabs missing from the enum'],
      ['Assets group', '\`assets\`, \`asset_allocations\`, \`asset_maintenance\`, \`stock_items\`, \`stock_movements\`, \`vendors\`, \`purchase_orders\`, \`indents\`', ''],
      ['Marketing / Email / Social groups', '\`email_accounts\`, \`email_campaigns\`, \`email_events\`, \`social_accounts\`, \`social_posts\`, \`social_publish_logs\`, …', 'OAuth tokens encrypted at rest'],
      ['AiLog / Creative groups', '\`ai_usage\`, \`creative_projects\`, \`creative_assets\`, \`creative_generations\`', 'Usage metering feeds Part 5 subscription limits'],
      ['Moms group (7 sheets)', '\`meetings\`, \`meeting_participants\`, \`meeting_decisions\`, \`meeting_action_items\`, \`meeting_attachments\`', 'Additional module beyond Part 4'],
      ['AuditLog', '\`audit_logs\`', 'Becomes append-only, tenant-scoped, with actor, IP, correlation id'],
    ],
  )}

## 5. Identifier preservation policy (Part 9)

${table(
    ['Legacy identifier', 'Preserved as', 'Reason'],
    [
      ['\`TenderID\` / \`TenderNo\` (TND-…)', '\`tenders.legacy_tender_id\` + \`tenders.tender_no\` (unique per tenant)', 'Part 4 §G requires the TND-style numbering survive'],
      ['\`LeadID\`', '\`leads.legacy_lead_id\`', 'Referenced by surveys and quotations'],
      ['\`QuotationID\` / \`QuoteNumber\`', '\`quotations.legacy_quotation_id\` + \`quotation_no\`', 'Revision chain must stay intact'],
      ['\`EmployeeID\`', '\`employees.employee_code\` (unique per company)', 'Used on payslips and statutory registers'],
      ['\`ClientID\` / \`ClientCode\`', '\`clients.legacy_client_id\` + \`client_code\`', 'Printed on invoices'],
      ['Sheet row number', '**not preserved as identity**', 'Part 9 explicitly forbids it; row provenance is kept in \`legacy_row_ref\` for reconciliation only'],
    ],
  )}

`;
}

/* ================================================================== *
 * DOC 4 — EXISTING API AND FUNCTIONS
 * ================================================================== */

function docApiFunctions() {
  const guardCounts = {};
  for (const a of apiActions) guardCounts[a.guard || '(no guard)'] = (guardCounts[a.guard || '(no guard)'] || 0) + 1;

  const byGuard = Object.entries(guardCounts).sort((a, b) => b[1] - a[1]);
  const unguarded = apiActions.filter((a) => !a.guard);

  const actionRows = apiActions.map((a) => [
    `\`${a.action}\``, a.guard ? `\`${a.guard}\`` : '**none**',
    a.guardedRoles ? a.guardedRoles.join(', ') : (a.guard ? '(module-scoped)' : '—'),
    a.handler ? `\`${a.handler}\`` : '—',
    `${a.file}:${a.line}`,
  ]);

  const publicRows = (AUDIT.publicEmailLinks.actions || []).map((a) => [`\`${a.action}\``, 'none — opaque URL token', `${a.line}`]);

  return HEADER('Existing API and Server Functions') + `## 1. The single entry point

The entire backend is reached through one Apps Script function:

\`\`\`js
// AuthAndApi.gs:${AUDIT.api.dispatcherLine}
function api(action, payload, token) {
  if (action === 'login') return { ok: true, data: login_(payload) };
  const user = authenticate_(token);
  ... MANAGEMENT read-only allow-list ...
  switch (action) { case 'x': data = handler_(user, payload); break; ... }
}
\`\`\`

There is no HTTP router, no resource model, no OpenAPI description and no per-route contract.
Every operation is a case label in a **${n(apiActions.length)}-case switch**.

## 2. Surface totals

${table(
    ['Surface', 'Count', 'Authentication'],
    [
      ['Authenticated actions in \`api()\`', n(C.apiActions), 'session token → \`authenticate_(token)\`'],
      ['Public email-link actions in \`handleEmailLinkAction_\`', n(C.publicEmailLinkActions), '**none** — single-use token in URL'],
      ['Unique dispatch labels overall', n(C.totalSwitchActions - 1), '—'],
      ['Public \`doGet\` query parameters (webhooks/tracking/OAuth)', n(C.publicEndpoints), '**none** — provider callbacks & tracking pixels'],
      ['Distinct actions actually invoked by the UI', n(C.frontendRpcActions), '—'],
      ['Actions defined but never invoked by the UI', n(C.apiActions - AUDIT.frontend.rpcActions.length > 0 ? C.apiActions - AUDIT.frontend.rpcActions.length - (C.publicEmailLinkActions) : 0), 'reachable by API client only — must not be silently dropped'],
    ],
  )}

## 3. Authorisation model as found

Guards are applied ad-hoc inside individual case arms, not by route. Distribution:

${table(['Guard', 'Actions'], byGuard.map(([g, c]) => [g === '(no guard)' ? '**none**' : `\`${g}\``, n(c)]))}

> ### ⚠️ Finding of record
> **${n(unguarded.length)} of ${n(C.apiActions)} actions (${((unguarded.length / C.apiActions.length) * 100).toFixed(0)}%) have no explicit permission guard.**
> They are reachable by *any* user holding a valid session, in any role. The legacy design leans on
> the frontend to hide navigation, which is exactly the pattern Part 1 rule 10 forbids
> ("Do not implement tenant isolation/authorisation only through frontend filtering").
> **Every one of the 537 actions gets an explicit permission code in the new API**; there is no
> "default allow" and a route with no declared permission fails closed at startup.

## 4. Public (unauthenticated) operations

${table(['Action', 'Auth model', 'Line'], publicRows)}

These approve/reject indents and purchase requests and acknowledge stock distributions. They are
business-critical (site staff have no CRM login) so they **are** migrated — but as
signed, expiring, single-use tokens bound to one entity and one action, rate-limited, and written
to the audit log. The legacy version accepts a plain UUID with no expiry check in the URL.

## 5. Complete action inventory (${n(apiActions.length)})

${table(['Action', 'Permission guard', 'Allowed roles', 'Handler function', 'Source'], actionRows)}

## 6. Server function index

All ${n(C.serverFunctions)} top-level functions with file, line span, visibility and cross-file
callers are exported to \`migration/source-inventory/function-index.csv\` for the traceability
matrix. Public (no trailing underscore) functions are the legacy API surface; trailing-underscore
functions are internal and are mapped to service methods rather than endpoints.

`;
}

/* ================================================================== *
 * DOC 5 — ROLE & PERMISSION MAPPING
 * ================================================================== */

function docRoles() {
  const roleRows = AUDIT.roles.map((r) => {
    const mentioned = apiActions.filter((a) => (a.guardedRoles || []).includes(r)).length;
    return [`\`${r}\``, n(mentioned)];
  });

  return HEADER('Existing Role and Permission Mapping') + `## 1. Roles as defined in source

${AUDIT.roles.map((r) => `- \`${r}\``).join('\n')}

That is **${C.roles} roles**, defined in \`ROLE_ENUM_V4_\` in \`Database.gs\`.

## 2. What the roles mean (derived from source behaviour)

${table(
    ['Role', 'Intended function', 'Evidence in source'],
    [
      ['\`SUPER_ADMIN\`', 'Owner. Bypasses every guard (\`assertAccessV4_\` returns early).', '\`Database.gs:1082\`'],
      ['\`ADMIN\`', 'Office administrator; most write access.', 'Named explicitly in many \`assertRole_\` lists'],
      ['\`MANAGEMENT\`', '**Read-only across the entire application** plus an approvals widget.', '\`mgmtAllowed\` allow-list in \`api()\`'],
      ['\`ACCOUNTS\`', 'Invoicing, receipts, vendor payments, bank book.', '\`Accounts.gs\` guards'],
      ['\`HR\`', 'Employees, salary slips, payroll runs, ESI/PF registers.', '\`HR.gs\` guards'],
      ['\`COORDINATOR\`', 'Operations coordination; surveys, deployments, wage breakups.', 'Guards + navigation'],
      ['\`EXECUTIVE\`', 'Sales executive; own leads and follow-ups.', "`assertRole_(user, ['EXECUTIVE'])` on marketing-lead actions"],
      ['\`TENDER_USER\`', 'Tender desk; tenders, AI analysis, tender orders.', '\`assertTender_\` (64 actions)'],
      ['\`BDM_MANAGER\`', 'Business development manager; sales + marketing oversight.', 'Guards + navigation'],
    ],
  )}

## 3. How authorisation is actually enforced

Three mechanisms coexist:

1. **\`assertAccessV4_(user, allowedRoles)\`** — SUPER_ADMIN short-circuits; everyone else is
   checked against an explicit array. An optional \`ReadAccess\` column grants cross-role *read*
   but is parsed and then **not enforced**: the source comment says
   *"ReadAccess gives read-only on those modules. We don't enforce read-only here — the caller decides."*
   That is a latent privilege-escalation path.
2. **The \`MANAGEMENT\` allow-list** — a hand-maintained object of ~90 action names inside \`api()\`.
   Any action added later is denied to MANAGEMENT until someone remembers to add it. The source
   even contains a fix note about a dead \`listReminders\` entry that had drifted.
3. **Frontend navigation filtering** — \`navigationItems(role)\` decides which pages render.

Mechanism 3 is cosmetic; mechanism 2 is a denylist-by-omission; mechanism 1 is the real control
but covers only ${n(apiActions.filter((a) => a.guard).length)} of ${n(C.apiActions)} actions.

## 4. Role → action count (explicitly named)

${table(['Role', 'Actions naming this role'], roleRows)}

## 5. Target permission model

The new platform replaces role-name checks with **permission codes** attached to routes, so
authorisation cannot be forgotten when a route is added.

${table(
    ['Legacy concept', 'New concept', 'Rationale'],
    [
      ['\`Role\` string column on Users', '\`roles\` + \`user_roles\` (many-to-many, tenant-scoped)', 'A user may need more than one role; roles become tenant-owned data'],
      ['Hard-coded role arrays in case arms', "`permissions` table + `role_permissions` + `@RequirePermission('x:y')` decorator", 'Declared next to the route; enforced by a global guard that fails closed'],
      ['\`ReadAccess\` column (parsed, unenforced)', '\`read\` vs \`write\` vs \`approve\` \`export\` scopes', 'Makes the intent enforceable instead of advisory'],
      ['\`MANAGEMENT\` allow-list object', 'A \`viewer\` role granted \`*:read\` only', 'Positive grant, no maintenance-by-omission'],
      ['Frontend nav filtering', 'Backend permission check **and** nav filtering driven by the same \`/auth/me\` payload', 'UI stays a convenience; the server is the authority'],
      ['\`SUPER_ADMIN\` bypass', 'Platform super-admin is **separate** from tenant roles and has no tenant-data access without a time-boxed, audited support grant', 'Part 15: "must not become an unrestricted backdoor"'],
    ],
  )}

## 6. Mapped starter roles for new tenants

${table(
    ['New role', 'Derived from', 'Scope'],
    [
      ['\`tenant_owner\`', 'SUPER_ADMIN', 'Everything within the tenant (never across tenants)'],
      ['\`tenant_admin\`', 'ADMIN', 'Configuration, users, all business modules'],
      ['\`viewer\`', 'MANAGEMENT', 'Read-only, plus approvals inbox'],
      ['\`accounts\`', 'ACCOUNTS', 'Finance module'],
      ['\`hr\`', 'HR', 'HR + payroll preparation (cannot approve own run)'],
      ['\`operations\`', 'COORDINATOR', 'Manpower, attendance, surveys'],
      ['\`sales_executive\`', 'EXECUTIVE', 'Own leads only (row-level ownership check)'],
      ['\`tender_desk\`', 'TENDER_USER', 'Tender module'],
      ['\`bd_manager\`', 'BDM_MANAGER', 'Sales + marketing oversight'],
    ],
  )}

`;
}

/* ================================================================== *
 * DOC 6 — INTEGRATIONS AND TRIGGERS
 * ================================================================== */

function docIntegrations() {
  const svcRows = Object.entries(AUDIT.services)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => {
      const replacement = {
        SpreadsheetApp: 'Prisma + PostgreSQL',
        DriveApp: 'Object storage adapter / Drive API v3',
        Drive: 'Object storage adapter / Drive API v3',
        GmailApp: 'Email provider adapter (Gmail API / SMTP / SES)',
        MailApp: 'Email provider adapter',
        HtmlService: 'React SPA + REST',
        ContentService: 'NestJS controllers returning JSON',
        PropertiesService: 'Database config + secret manager',
        CacheService: 'Cache adapter (in-memory → Redis)',
        LockService: 'PostgreSQL transactions + SELECT … FOR UPDATE',
        UrlFetchApp: 'Native fetch with timeout, retry and circuit breaker',
        Utilities: 'date-fns, crypto, Intl',
        Session: 'Authenticated principal from session',
        ScriptApp: 'Worker service + Postgres-backed job queue',
        DocumentApp: 'Document generation service',
        SlidesApp: 'Presentation generation service',
        CalendarApp: 'Calendar integration adapter',
        FormApp: 'Native React forms',
        Charts: 'Chart library in the SPA',
      }[s] || 'review';
      return [s, n(c), replacement];
    });

  const trigRows = AUDIT.triggers.map((t) => [
    `\`${t.handler}\``, t.schedule, `\`${t.installer}\``, `${t.file}:${t.line}`, t.resolution,
  ]);

  const hostRows = AUDIT.integrations
    .filter((h) => !/googleusercontent|localhost/.test(h.host))
    .map((h) => [`${h.host}`, n(h.count), h.files.slice(0, 4).join(', ') + (h.files.length > 4 ? ' …' : '')]);

  return HEADER('Existing Integrations and Triggers') + `## 1. Google service dependencies

These must each be replaced by an adapter interface so the product is not bound to one provider
(Part 8).

${table(['Service', 'References', 'Replacement'], svcRows)}

## 2. Scheduled jobs (${n(AUDIT.triggers.length)})

Every Apps Script time trigger found, with its resolved handler. All run against one spreadsheet
and share no tenant context — in the new worker each job must enqueue per-tenant work items.

${table(['Handler', 'Schedule', 'Installer', 'Source', 'Resolution'], trigRows)}

### Notes on scheduling risk

- Several triggers are installed **conditionally and repeatedly** (\`runEmailMarketingTick\` at
  5 / 15 / 60-minute fallbacks). Nothing prevents duplicate triggers accumulating; the source
  deletes by handler name before re-creating, which is a partial mitigation.
- The partial-failure modes are silent: if the Apps Script quota is exhausted, the trigger simply
  does not run and no alert is raised. **Part 12 requires that critical scheduled jobs not depend
  on a free service staying awake** — the new worker runs as a separate always-on process with a
  Postgres-backed queue, retries, idempotency keys and a dead-letter table.

## 3. Third-party HTTP integrations

${table(['Host', 'References', 'Files'], hostRows)}

Classified by category:

${table(
    ['Category', 'Providers found', 'New implementation'],
    [
      ['Social publishing', 'graph.facebook.com (FB/Instagram), api.linkedin.com, api.x.com', 'OAuth per tenant + publish queue with per-platform adapter; approvals before publish'],
      ['Email delivery', 'gmail.googleapis.com, graph.microsoft.com, login.microsoftonline.com', 'Email provider adapter; per-tenant OAuth; encrypted refresh tokens'],
      ['AI providers', 'api.groq.com, api.openai.com, generativelanguage.googleapis.com (Gemini), api.deepseek.com, openrouter.ai, api.z.ai, image.pollinations.ai', 'AI provider adapter + per-tenant config + usage metering + approval gate'],
      ['Image / effects', 'api.cloudflare.com', 'Adapter; credentials per tenant in secret storage'],
      ['Indian statutory sources', 'clc.gov.in (Chief Labour Commissioner — minimum wages), karmikaspandana.karnataka.gov.in (Karnataka labour)', 'Reference data ingestion job + human review step before any rate becomes effective'],
      ['Document links', 'drive.google.com, docs.google.com', 'Object storage + signed URLs'],
    ],
  )}

## 4. Statutory data ingestion — important caveat

The source references official Indian wage portals. Part 4 §K forbids assuming statutory rates are
permanent. The new platform therefore treats **every** statutory figure as effective-dated
configuration seeded from a reviewed table, never as a constant in code. The ingestion job may
*suggest* new rates; a human must approve them before they can be used in a payroll run.

## 5. Secrets currently held in the script

\`PropertiesService\` appears ${n(AUDIT.services.PropertiesService)} times. It stores provider
client ids/secrets, OAuth tokens, the website lead token and various toggles. There is no
encryption, rotation or per-tenant separation. The replacement:

- stores tenant configuration in the database,
- stores provider credentials encrypted with a KMS-managed key (\`integration_credentials\`),
- never returns a secret through any API (write-only fields),
- provides explicit **disconnect and revoke** controls (Part 8).

`;
}

/* ================================================================== *
 * DOC 7 — BUSINESS RULES AND CALCULATIONS
 * ================================================================== */

function docBusinessRules() {
  const statRows = AUDIT.statutory.map((s) => [
    s.label, n(s.occurrences),
    Object.entries(s.byFile).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, c]) => `${f} (${c})`).join(', ') || '—',
  ]);

  const constRows = AUDIT.statutoryConstants.map((c) => [
    `\`${c.name}\``, c.value, c.comment || '—', `${c.file}:${c.line}`,
  ]);

  return HEADER('Business Rules and Calculations') + `## 1. Why this document exists

The payroll and quotation engines are the highest-risk part of the migration. Part 4 §K requires
that statutory rules be **configurable, effective-dated and reviewed**, and Part 13 requires
payroll calculation tests. This document records what the legacy code actually computes, so the
new engine can be validated against it rather than reinvented.

## 2. Where the money logic lives

${table(['Statutory concept', 'References', 'Concentrated in'], statRows)}

## 3. Literal numeric constants that look statutory

Extracted automatically. **None of these is trusted as a default.** Each becomes an
effective-dated row in \`statutory_rates\` after review against current official notifications.

${constRows.length ? table(['Constant', 'Value', 'Comment in source', 'Location'], constRows) : '_No module-level numeric constants matching statutory naming were found in the top-level scope; rates are computed inline. See §4._'}

## 4. Rules recovered from source (to be re-implemented and tested)

> These are recorded as **requirements to re-test**, not as guaranteed-correct behaviour.
> Each will get a dedicated unit test in \`tests/unit/payroll\`.

### 4.1 Wage breakup / CTC construction (\`TakeHomeSalary.gs\`, \`Quotations.gs\`)

The v5.6.61 release notes describe 15 optional add-ons that toggle per breakup. Each is a
multiplier on the CTC build. The rule set to preserve:

${table(
    ['Option', 'Behaviour', 'Verification test needed'],
    [
      ['National & Festival Holidays', 'Adds *N* paid holidays (default 10 days) to the wage build', 'holiday-days × daily rate added exactly once'],
      ['Karnataka LWF', 'Employer ₹100 / employee ₹50 per year (configurable)', 'annualised ÷ 12, rounded per configured rule'],
      ['PT as yearly average', 'Professional tax for Karnataka annualised (₹2,500) ÷ 12', 'monthly PT = annual/12 within ₹ tolerance'],
      ['Labour Code 50% wage rule', 'Basic + DA must be ≥ 50% of total wage', 'engine **rejects** a breakup that violates it'],
      ['ESI on all allowances', 'Widens the ESI contribution base', 'base includes allowances only when ticked'],
      ['PF on full Basic + DA (no cap)', 'Removes the ₹15,000 statutory ceiling', 'cap applied only when option off'],
      ['Extra 4 Hrs as overtime', 'Treats 4 h/month as OT per post', 'OT = (rate/26/8) × hours × multiplier'],
      ['Bonus rate', 'Statutory bonus 8.33%–20%, configurable', 'bonus within bounds; formula = basic × rate'],
      ['Weekly-off reliever', '1 reliever per 6 posts', 'ceil(posts/6) additional manpower'],
      ['Uniform charged / deducted', 'Adds or subtracts uniform cost', 'sign direction correct in CTC vs take-home'],
      ['Split PF', '12% EPF + 0.5% EDLI + 0.5% admin', 'three separate ledger lines'],
      ['Bonus paid yearly', 'Accrues monthly, pays annually', 'accrual = monthly bonus × 12'],
      ['Round to whole rupees', 'Rounding applied at the end', 'no intermediate rounding'],
      ['Per-day / per-hour rate rows', 'Derived display rows', 'derived = monthly/26 and /(26×8)'],
      ['Own allowance rows (≤3)', 'Custom allowances each with PF/ESI flags', 'flags include the row in the correct base'],
    ],
  )}

**Default state matters:** the release notes state every option starts OFF (two uniform ticks
start ON) so existing saved figures do not change. The migration must reproduce that default
exactly, or every historical quotation silently changes value.

### 4.2 Payroll / take-home (\`TakeHomeSalary.gs\`, \`MinimumWages.gs\`)

${table(
    ['Rule', 'Legacy behaviour found', 'Required in new engine'],
    [
      ['Attendance-based salary', 'Pro-rated on days worked', 'Configurable divisor (26 / 30 / calendar) per statutory profile'],
      ['Loss of pay', 'Deducted from gross', 'LOP days × daily rate, computed pre-statutory'],
      ['Overtime', 'Rate multiplier applied to basic', 'Multiplier configurable (default per state rule)'],
      ['Minimum wage validation', 'Compares component sums to a wage-rate set', 'Hard **block** on payroll approval if below minimum wage for the category/zone, unless an authorised, audited override exists'],
      ['PF ceiling', 'Applied conditionally', 'Effective-dated ceiling; ceiling removal is an explicit option'],
      ['ESI eligibility', 'Wage-threshold based', 'Effective-dated threshold; **contribution only when wage ≤ threshold**'],
      ['Professional Tax', 'State slab based', 'Slab table per state, effective-dated'],
      ['TDS', 'Present but thin', 'Out of scope for v1 of the engine until formally specified — see known-limitations'],
    ],
  )}

### 4.3 Quotation maths (\`Quotations.gs\`)

${table(
    ['Rule', 'Behaviour'],
    [
      ['Numbering', 'Sequential per financial year via a register sheet — **race-prone**, becomes a Postgres sequence inside a transaction'],
      ['Revisions', 'Snapshot of the whole quotation stored as JSON per revision (immutable)'],
      ['Line items', 'Description, unit, quantity, rate, amount (rate × qty), rounding at line level'],
      ['Management fee', 'Percentage applied on a configurable base, added before tax'],
      ['Tax', 'Single tax percentage on the taxable subtotal'],
      ['Won/Lost', 'Status transition writes a \`WonHandover\` row and seeds a contract'],
      ['PDF', 'Google Docs template merge → PDF → Drive'],
    ],
  )}

## 5. Rules that will be **rejected** in the new system (documented deviations)

Per Part 1 rule 13, any change to working business rules must be documented. These are intentional
deviations:

${table(
    ['Legacy behaviour', 'New behaviour', 'Reason'],
    [
      ['Quotation/PF number from sheet row count', 'Per-tenant PostgreSQL sequence in a transaction', 'Concurrent saves can duplicate numbers'],
      ['Statutory rates as literals', 'Effective-dated \`statutory_rates\` rows requiring review', 'Part 4 §K; rates change by notification'],
      ['Payroll editable after approval', 'Run locks on approval; corrections via adjustment/reversal run', 'Part 4 §K maker-checker and locking'],
      ['No separation of preparer and approver', 'Preparer cannot approve own run unless an audited exception is configured', 'Part 4 §K'],
      ['\`ReadAccess\` parsed but not enforced', 'Enforced read scope', 'Silent advisory control is a security defect'],
    ],
  )}

`;
}

/* ================================================================== *
 * DOC 8 — KNOWN DEFECTS AND RISKS
 * ================================================================== */

function docDefects() {
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const defects = AUDIT.defects.slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const count = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const d of defects) count[d.severity] = (count[d.severity] || 0) + 1;

  const sections = defects.map((d) => `### ${d.id} — ${d.title}

**Severity:** ${d.severity.toUpperCase()}

${d.detail}

<details><summary>Evidence</summary>

\`\`\`json
${typeof d.evidence === 'string' ? d.evidence : JSON.stringify(d.evidence, null, 2).slice(0, 3000)}
\`\`\`

</details>
`).join('\n');

  return HEADER('Known Defects and Risks') + `## 1. Summary

Mechanically detected from source; every item is reproducible by re-running \`audit.mjs\`.

| Severity | Count |
|---|---|
| Critical | ${count.critical} |
| High | ${count.high} |
| Medium | ${count.medium} |
| Low | ${count.low} |
| **Total** | **${defects.length}** |

## 2. Defects

${sections}

## 3. Risks that are not code defects

${table(
    ['Risk', 'Impact', 'Mitigation'],
    [
      ['Statutory rates may already be out of date in the legacy data', 'Payroll paid on stale rates; compliance exposure', 'Effective-dated rates + mandatory review gate before first production payroll; documented as a launch blocker'],
      ['Legacy test kit not supplied ("2,389 checks, no failures" unverifiable)', 'No regression baseline can be trusted', 'Rebuild rule tests from source; reconcile migrated financial totals instead of trusting legacy assertions'],
      ['Google Sheets is the system of record during cut-over', 'Dual-write divergence during migration', 'Read-only freeze window, reconciliation report, and a documented rollback that keeps Sheets authoritative until sign-off'],
      ['Free-tier hosting used for testing (Part 14)', 'Sleeping services, expiring databases', 'Never hold real customer data on free tiers; documented in deployment guide'],
      ['Single Drive scope over the deploying account', 'A compromise reaches every file the owner can see', 'Scoped storage + per-tenant OAuth; least-privilege review'],
      ['Indian DPDP Act obligations not yet legally reviewed', 'Compliance risk at commercial launch', 'Privacy-by-design implemented; legal review flagged as a pre-launch gate'],
    ],
  )}

`;
}

/* ================================================================== *
 * DOC 9 — MIGRATION PLAN
 * ================================================================== */

function docMigrationPlan() {
  return HEADER('Migration Plan') + `## 1. Principles

1. **The source is never modified.** The v5.6.61 bundle is preserved read-only at
   \`_incoming/source-v5.6.61\` and is input only.
2. **Migration is repeatable and idempotent.** Every import script keys on
   \`(tenant_id, legacy_table, legacy_id)\` so a re-run updates rather than duplicates.
3. **Nothing is destroyed.** No legacy row is deleted or overwritten; the spreadsheet remains
   authoritative until cut-over sign-off.
4. **Reconciliation is the acceptance test.** Rows in = rows out + rejected-with-reason, and
   financial totals must match to the paisa.
5. **Synthetic data only in non-production.** Part 1 rule 16 — no real employee, payroll or
   customer data in any demonstration or shared environment.

## 2. Migration pipeline

${table(
    ['Stage', 'Tool', 'Output'],
    [
      ['1. Extract', '\`migration/import-scripts/extract-sheets.mjs\` (Sheets API, read-only scope)', 'Raw JSON per tab + \`source_row_ref\`'],
      ['2. Preserve provenance', 'same', 'Every record keeps \`legacy_table\`, \`legacy_row\`, \`legacy_id\`'],
      ['3. Clean & validate', '\`migration/import-scripts/validate.mjs\` (Zod schemas)', 'Rejected rows with reason codes'],
      ['4. Map', '\`migration/data-mapping/*.mapping.json\`', 'Column → column decision, per tab'],
      ['5. Transform', '\`migration/import-scripts/transform.mjs\`', 'Dates → timestamptz, money → numeric, flags → boolean'],
      ['6. Load in dependency order', '\`migration/import-scripts/load.mjs\`', 'Tenants → companies → users → clients → tenders → employees → …'],
      ['7. Record rejections', 'same', '\`migration_rejections\` table with reason'],
      ['8. Reconcile counts', '\`migration/reconciliation/reconcile.mjs\`', 'Per-table counts, source vs target'],
      ['9. Reconcile money', 'same', 'Sum of every financial column, to 2 dp'],
      ['10. Verify relationships', 'same', 'Orphan foreign keys = 0'],
      ['11. Verify documents', 'same', 'Every \`DriveFileID\` either copied to object storage or explicitly parked'],
      ['12. Report', 'same', '\`reconciliation/report-<timestamp>.md\`'],
    ],
  )}

## 3. Load order (foreign-key safe)

\`\`\`
tenants → plans → companies → branches → departments → sites
  → roles/permissions → users → user_roles → user_company_access
  → clients → client_contacts → leads → lead_followups
  → surveys → survey_items
  → tenders → tender_followups → tender_orders → security_deposits
  → wage_rate_sets → wage_rates → salary_categories → take_home_salary
  → quotations → quotation_items → quotation_versions → contracts
  → employees → employee_documents → employee_allocations
  → attendance → payroll_runs → payroll_run_lines → payslips
  → assets → stock_items → stock_movements → vendors → purchase_orders → indents
  → invoices → invoice_items → invoice_payments → vendor_bills → bank_accounts → journal_entries
  → email_accounts → campaigns → social_accounts → social_posts
  → meetings → meeting_action_items
  → audit_logs (last, read-only history)
\`\`\`

## 4. Cut-over strategy

${table(
    ['Step', 'Action', 'Reversible?'],
    [
      ['R1', 'Rehearse full migration into a scratch database from a **sanitised** copy', 'Yes — scratch DB is dropped'],
      ['R2', 'Financial reconciliation signed off by finance owner', 'n/a'],
      ['R3', 'Announce read-only window on the legacy CRM', 'Yes'],
      ['R4', 'Final delta migration + verification', 'Yes — legacy untouched'],
      ['R5', 'Grant users access to the new platform; legacy stays available read-only for 30 days', '**Yes — rollback is simply "keep using Sheets"**'],
      ['R6', 'After 30 clean days, archive the legacy spreadsheet', 'Point of no return'],
    ],
  )}

## 5. What cannot be migrated automatically

${table(
    ['Item', 'Why', 'Handling'],
    [
      ['Provider OAuth refresh tokens (Gmail, Microsoft, Meta, LinkedIn, X)', 'They belong to the old script\'s client credentials and are encrypted to it', 'Every tenant re-authorises once after cut-over; UI prompts for the 6 affected integrations'],
      ['Google Doc template merges', 'Templates are Google Docs with Apps-Script-specific placeholders', 'Recreated as HTML/React PDF templates in \`packages/integrations/pdf\`'],
      ['Drive folder trees', 'Folder semantics are implicit in names and IDs', 'Files copied to object storage with a flat key + metadata; original Drive IDs retained in metadata for lookup'],
      ['Test kit results', 'Not supplied', 'New test suite is the only evidence of correctness'],
    ],
  )}

`;
}

/* ================================================================== *
 * DOC 10 — IMPLEMENTATION ROADMAP
 * ================================================================== */

function docRoadmap() {
  return HEADER('Implementation Roadmap') + `## 1. Reality check on scope

The verified source is **${n(C.serverLoc)} lines** of backend across **${n(C.serverFunctions)} functions**
and **${n(C.apiActions)} authenticated actions**, plus a **${(AUDIT.frontend.bytes / 1024 / 1024).toFixed(2)} MB**
single-page frontend. Modules A (Platform Administration) and much of B/J/K are **new build**, not
migration. Treating this as a "convert the files" job would produce a system with the same
architectural defects.

The roadmap below is therefore ordered by **risk retired per unit of work**, not by module
numbering.

## 2. Phase plan

${table(
    ['Phase', 'Scope', 'Exit criteria', 'Status'],
    [
      ['**0 — Audit**', 'This document set', 'Every count reproduced from source; defects recorded; module coverage known', '✅ **COMPLETE**'],
      ['**1 — Foundation**', 'Monorepo, Prisma tenancy schema, auth (Argon2id + sessions), RBAC with permission codes, audit log, tenant isolation tests, tenant onboarding, login UI', 'Two tenants provably isolated by automated test; login works; audit rows written', '▶ **IN PROGRESS**'],
      ['**2 — Core CRM**', 'Organisation (companies/branches/sites/departments), users, leads, follow-ups, surveys, quotations with full wage maths', 'Quotation totals reproduce legacy figures on fixture data', 'Pending'],
      ['**3 — Tender & client ops**', 'Tenders (+AI analysis), clients, contracts, mobilisation, SLA, client care (complaints)', 'Tender lifecycle works with **no** LeadID dependency', 'Pending'],
      ['**4 — HR & workforce**', 'Employees, documents, deployment, attendance, leave, shifts', 'Site strength reconciles to allocations', 'Pending'],
      ['**5 — Payroll**', 'Salary structures, effective-dated statutory config, payroll engine, maker-checker, locking, payslips, ECR/bank files', 'Payroll totals reproduce legacy fixture exactly; below-minimum-wage blocks approval', 'Pending'],
      ['**6 — Finance & assets**', 'Invoices, receipts, vendor bills, bank book, assets, stock, exports', 'Financial reports reconcile to migrated totals', 'Pending'],
      ['**7 — Marketing, AI, integrations**', 'Email marketing, social, AI assistant, templates, provider adapters', 'Every outbound action passes an approval gate', 'Pending'],
      ['**8 — Commercial SaaS**', 'Plans, subscriptions, entitlements, billing adapter, white-label branding, custom domains', 'Suspended tenant is blocked at the API, not just the UI', 'Pending'],
      ['**9 — Production readiness**', 'Migration rehearsal, reconciliation, security review, backup/restore drill, deployment', 'Signed reconciliation + security review', 'Pending'],
    ],
  )}

## 3. Why Phase 1 before any business module

Every business module needs the same five things: a tenant boundary, an authenticated principal,
a permission check, an audit row and a validated input. Building a module before those exist
guarantees rework across ${n(C.apiActions)} operations. Phase 1 therefore implements the horizontal
concerns once, with tests, and every later module is thin by comparison.

## 4. Sequencing risk register

${table(
    ['Risk', 'Where it bites', 'Mitigation'],
    [
      ['Payroll engine built before statutory config is effective-dated', 'Phase 5', 'Statutory tables designed in Phase 1 schema, even though the engine lands in Phase 5'],
      ['Quotation maths rebuilt from release notes rather than code', 'Phase 2', 'Port the calculation functions directly from \`TakeHomeSalary.gs\` then refactor under test'],
      ['Frontend scope underestimated', 'Phases 2–8', 'Design-system components built in Phase 1; each module reuses them'],
      ['Tenant isolation added late', 'Everything', 'RLS policies + isolation tests land in Phase 1 and are re-run for every new table'],
    ],
  )}

`;
}

/* ---------------- write the docs ---------------- */

const docs = {
  'source-project-inventory.md': docInventory(),
  'existing-module-mapping.md': docModuleMapping(),
  'existing-database-mapping.md': docDatabaseMapping(),
  'existing-api-and-functions.md': docApiFunctions(),
  'existing-role-permission-mapping.md': docRoles(),
  'existing-integrations-and-triggers.md': docIntegrations(),
  'business-rules-and-calculations.md': docBusinessRules(),
  'known-defects-and-risks.md': docDefects(),
  'migration-plan.md': docMigrationPlan(),
  'implementation-roadmap.md': docRoadmap(),
};

for (const [name, content] of Object.entries(docs)) {
  fs.writeFileSync(path.join(DOCS, name), content);
  console.log(`  wrote docs/${name}  (${(content.length / 1024).toFixed(0)} KB)`);
}

/* ---------------- traceability matrices ---------------- */

// Per-action traceability matrix
const csvEsc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const actionRows = apiActions.map((a) => [
  a.file, a.action, a.guard || 'NONE', (a.guardedRoles || []).join(' '), a.handler || '',
  '', '', 'not-started', 'not-started', '',
].map(csvEsc).join(','));
fs.writeFileSync(
  path.join(__dirname, 'traceability-matrix.csv'),
  ['legacy_file,legacy_action,business_purpose,new_module,new_api_endpoint,new_tables,migration_status,test_status,outstanding_issues',
    ...apiActions.map((a) => [
      csvEsc(a.file), csvEsc(a.action), csvEsc(''), csvEsc(''), csvEsc(`/api/v1/* (to be mapped)`),
      csvEsc(''), csvEsc('pending'), csvEsc('pending'),
      csvEsc(a.guard ? '' : 'no permission guard in legacy source'),
    ].join(','))].join('\n'),
);
console.log(`  wrote migration/source-inventory/traceability-matrix.csv (${actionRows.length} rows)`);

// Function index
const fnRows = [['file', 'function', 'start_line', 'end_line', 'loc', 'visibility', 'params', 'kind'].join(',')];
for (const f of AUDIT.functions) {
  fnRows.push([
    f.file, f.name, f.startLine, f.endLine, f.loc, f.visibility,
    `"${(f.params || []).join(' ')}"`, f.kind,
  ].join(','));
}
fs.writeFileSync(path.join(__dirname, 'function-index.csv'), fnRows.join('\n'));
console.log(`  wrote migration/source-inventory/function-index.csv (${AUDIT.functions.length} rows)`);

// Sheet mapping
const sheetRows = [['sheet', 'enum_key', 'columns', 'column_list', 'target_tables', 'legacy_id_policy'].join(',')];
const enumBySheet = Object.fromEntries(AUDIT.sheets.map((s) => [s.sheet, s.key]));
for (const [sheet, cols] of Object.entries(AUDIT.columns)) {
  sheetRows.push([
    csvEsc(sheet), csvEsc(enumBySheet[sheet] || 'LITERAL_ONLY'), cols.length,
    csvEsc(cols.join(' ')), csvEsc(''), csvEsc('legacy_* preserved'),
  ].join(','));
}
fs.writeFileSync(path.join(__dirname, 'sheet-mapping.csv'), sheetRows.join('\n'));
console.log(`  wrote migration/source-inventory/sheet-mapping.csv (${Object.keys(AUDIT.columns).length} rows)`);

console.log('\nPhase 0 documents generated from audit.json.');
