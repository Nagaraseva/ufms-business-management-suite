<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Existing Integrations and Triggers

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Google service dependencies

These must each be replaced by an adapter interface so the product is not bound to one provider
(Part 8).

| Service | References | Replacement |
|---|---|---|
| Utilities | 259 | date-fns, crypto, Intl |
| DriveApp | 120 | Object storage adapter / Drive API v3 |
| PropertiesService | 75 | Database config + secret manager |
| SpreadsheetApp | 61 | Prisma + PostgreSQL |
| ScriptApp | 59 | Worker service + Postgres-backed job queue |
| MailApp | 32 | Email provider adapter |
| CacheService | 23 | Cache adapter (in-memory → Redis) |
| UrlFetchApp | 23 | Native fetch with timeout, retry and circuit breaker |
| DocumentApp | 18 | Document generation service |
| HtmlService | 15 | React SPA + REST |
| Drive | 8 | Object storage adapter / Drive API v3 |
| Session | 7 | Authenticated principal from session |
| ContentService | 6 | NestJS controllers returning JSON |
| GmailApp | 5 | Email provider adapter (Gmail API / SMTP / SES) |
| LockService | 2 | PostgreSQL transactions + SELECT … FOR UPDATE |

## 2. Scheduled jobs (14)

Every Apps Script time trigger found, with its resolved handler. All run against one spreadsheet
and share no tenant context — in the new worker each job must enqueue per-tenant work items.

| Handler | Schedule | Installer | Source | Resolution |
|---|---|---|---|---|
| `assistantBackgroundDaily` | every 1 day(s) (Asia/Kolkata) | `assistantBgEnsureTrigger_` | CrmAssistant.gs:1100 | constant |
| `runEmailDirectoryHourly` | every 1 h | `installEmailDirectoryTrigger_` | EmailDirectory.gs:804 | constant |
| `runEmailMarketingTick` | every 5 min | `emkInstallTrigger_` | EmailMarketing.gs:1519 | literal |
| `runEmailMarketingTick` | every 15 min | `emkInstallTrigger_` | EmailMarketing.gs:1521 | literal |
| `runEmailMarketingTick` | every 1 h | `emkInstallTrigger_` | EmailMarketing.gs:1523 | literal |
| `runMarketingScheduledSync_` | every 6 h | `installMarketingSyncTrigger_` | Marketing.gs:1346 | literal |
| `runMarketingScheduledSync_` | every 1 day(s) @ 06:30 | `installMarketingSyncTrigger_` | Marketing.gs:1347 | literal |
| `sendDailyManagementReport` | every 1 day(s) | `installEodTrigger` | Setup.gs:214 | local-variable |
| `sendDailyTenderManagementReport` | every 1 day(s) | `installTenderEodTrigger` | Setup.gs:223 | local-variable |
| `sendMonthlySalesReportIfDue \| sendMonthlyTenderReportIfDue` | every 1 day(s) (Asia/Kolkata) | `installMonthlyReportTriggers` | Setup.gs:235 | config-array |
| `sendDailyUserReminderEmails` | every 1 day(s) (Asia/Kolkata) | `installDailyUserReminderTrigger` | Setup.gs:244 | local-variable |
| `runCrmNightlyBackup` | every 1 day(s) @ 02:15 (Asia/Kolkata) | `setNightlyBackup_` | Setup.gs:337 | constant |
| `runSocialScheduler_` | every 15 min | `ensureSocialTrigger_` | SocialMedia.gs:1487 | literal |
| `runSocialScheduler_` | every 1 h | `ensureSocialTrigger_` | SocialMedia.gs:1491 | literal |

### Notes on scheduling risk

- Several triggers are installed **conditionally and repeatedly** (`runEmailMarketingTick` at
  5 / 15 / 60-minute fallbacks). Nothing prevents duplicate triggers accumulating; the source
  deletes by handler name before re-creating, which is a partial mitigation.
- The partial-failure modes are silent: if the Apps Script quota is exhausted, the trigger simply
  does not run and no alert is raised. **Part 12 requires that critical scheduled jobs not depend
  on a free service staying awake** — the new worker runs as a separate always-on process with a
  Postgres-backed queue, retries, idempotency keys and a dead-letter table.

## 3. Third-party HTTP integrations

| Host | References | Files |
|---|---|---|
| graph.facebook.com | 15 | SocialMedia.gs, Tenders.gs |
| graph.microsoft.com | 10 | EmailMarketing.gs, Marketing.gs |
| drive.google.com | 7 | CreativeStudio.gs, LeadsAndSurveys.gs, MinimumWages.gs, Quotations.gs … |
| gmail.googleapis.com | 7 | EmailDirectory.gs, EmailMarketing.gs, GmailDownloader.gs, Marketing.gs |
| login.microsoftonline.com | 6 | EmailMarketing.gs, Marketing.gs |
| api.x.com | 6 | SocialMedia.gs |
| docs.google.com | 5 | DailyReports.gs, Exports.gs, LeadsAndSurveys.gs, ServiceLevelAgreements.gs … |
| www.googleapis.com | 5 | EmailDirectory.gs, EmailMarketing.gs, Marketing.gs |
| oauth2.googleapis.com | 4 | EmailMarketing.gs, Marketing.gs |
| www.facebook.com | 4 | SocialMedia.gs |
| api.linkedin.com | 4 | SocialMedia.gs |
| api.openai.com | 4 | TenderAI.gs |
| www.linkedin.com | 3 | SocialMedia.gs |
| api.cloudflare.com | 3 | TenderAI.gs |
| accounts.google.com | 2 | EmailMarketing.gs, Marketing.gs |
| x.com | 2 | SocialMedia.gs |
| image.pollinations.ai | 1 | CreativeStudio.gs |
| openidconnect.googleapis.com | 1 | EmailMarketing.gs |
| clc.gov.in | 1 | MinimumWages.gs |
| karmikaspandana.karnataka.gov.in | 1 | MinimumWages.gs |
| www.instagram.com | 1 | SocialMedia.gs |
| generativelanguage.googleapis.com | 1 | TenderAI.gs |
| api.groq.com | 1 | TenderAI.gs |
| console.groq.com | 1 | TenderAI.gs |
| openrouter.ai | 1 | TenderAI.gs |
| api.z.ai | 1 | TenderAI.gs |
| api.deepseek.com | 1 | TenderAI.gs |

Classified by category:

| Category | Providers found | New implementation |
|---|---|---|
| Social publishing | graph.facebook.com (FB/Instagram), api.linkedin.com, api.x.com | OAuth per tenant + publish queue with per-platform adapter; approvals before publish |
| Email delivery | gmail.googleapis.com, graph.microsoft.com, login.microsoftonline.com | Email provider adapter; per-tenant OAuth; encrypted refresh tokens |
| AI providers | api.groq.com, api.openai.com, generativelanguage.googleapis.com (Gemini), api.deepseek.com, openrouter.ai, api.z.ai, image.pollinations.ai | AI provider adapter + per-tenant config + usage metering + approval gate |
| Image / effects | api.cloudflare.com | Adapter; credentials per tenant in secret storage |
| Indian statutory sources | clc.gov.in (Chief Labour Commissioner — minimum wages), karmikaspandana.karnataka.gov.in (Karnataka labour) | Reference data ingestion job + human review step before any rate becomes effective |
| Document links | drive.google.com, docs.google.com | Object storage + signed URLs |

## 4. Statutory data ingestion — important caveat

The source references official Indian wage portals. Part 4 §K forbids assuming statutory rates are
permanent. The new platform therefore treats **every** statutory figure as effective-dated
configuration seeded from a reviewed table, never as a constant in code. The ingestion job may
*suggest* new rates; a human must approve them before they can be used in a payroll run.

## 5. Secrets currently held in the script

`PropertiesService` appears 75 times. It stores provider
client ids/secrets, OAuth tokens, the website lead token and various toggles. There is no
encryption, rotation or per-tenant separation. The replacement:

- stores tenant configuration in the database,
- stores provider credentials encrypted with a KMS-managed key (`integration_credentials`),
- never returns a secret through any API (write-only fields),
- provides explicit **disconnect and revoke** controls (Part 8).

