<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Implementation Roadmap

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Reality check on scope

The verified source is **45,284 lines** of backend across **1,723 functions**
and **537 authenticated actions**, plus a **2.14 MB**
single-page frontend. Modules A (Platform Administration) and much of B/J/K are **new build**, not
migration. Treating this as a "convert the files" job would produce a system with the same
architectural defects.

The roadmap below is therefore ordered by **risk retired per unit of work**, not by module
numbering.

## 2. Phase plan

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| **0 — Audit** | This document set | Every count reproduced from source; defects recorded; module coverage known | ✅ **COMPLETE** |
| **1 — Foundation** | Monorepo, Prisma tenancy schema, auth (Argon2id + sessions), RBAC with permission codes, audit log, tenant isolation tests, tenant onboarding, login UI | Two tenants provably isolated by automated test; login works; audit rows written | ✅ **COMPLETE** |
| **2 — Core CRM** | Organisation (companies/branches/sites/departments), users, leads, follow-ups, surveys, quotations with full wage maths | Quotation totals reproduce legacy figures on fixture data | ✅ **COMPLETE** |
| **3 — Tender & client ops** | Tenders (+AI analysis), clients, contracts, mobilisation, SLA, client care (complaints) | Tender lifecycle works with **no** LeadID dependency | ✅ **COMPLETE** |
| **4 — HR & workforce** | Employees, documents, deployment, statutory config. *(Attendance/leave/shifts do not exist in the source — see `phase-4-gap-analysis.md`; deferred to Phase 5 as new capability.)* | Site strength reconciles to allocations | ✅ **COMPLETE** |
| **5 — Payroll** | Salary structures, effective-dated statutory config, payroll engine, maker-checker, locking, payslips, ECR/bank files | Payroll totals reproduce legacy fixture exactly; below-minimum-wage blocks approval | Pending |
| **6 — Finance & assets** | Invoices, receipts, vendor bills, bank book, assets, stock, exports | Financial reports reconcile to migrated totals | Pending |
| **7 — Marketing, AI, integrations** | Email marketing, social, AI assistant, templates, provider adapters | Every outbound action passes an approval gate | Pending |
| **8 — Commercial SaaS** | Plans, subscriptions, entitlements, billing adapter, white-label branding, custom domains | Suspended tenant is blocked at the API, not just the UI | Pending |
| **9 — Production readiness** | Migration rehearsal, reconciliation, security review, backup/restore drill, deployment | Signed reconciliation + security review | Pending |

## 3. Why Phase 1 before any business module

Every business module needs the same five things: a tenant boundary, an authenticated principal,
a permission check, an audit row and a validated input. Building a module before those exist
guarantees rework across 537 operations. Phase 1 therefore implements the horizontal
concerns once, with tests, and every later module is thin by comparison.

## 4. Sequencing risk register

| Risk | Where it bites | Mitigation |
|---|---|---|
| Payroll engine built before statutory config is effective-dated | Phase 5 | Statutory tables designed in Phase 1 schema, even though the engine lands in Phase 5 |
| Quotation maths rebuilt from release notes rather than code | Phase 2 | Port the calculation functions directly from `TakeHomeSalary.gs` then refactor under test |
| Frontend scope underestimated | Phases 2–8 | Design-system components built in Phase 1; each module reuses them |
| Tenant isolation added late | Everything | RLS policies + isolation tests land in Phase 1 and are re-run for every new table |

