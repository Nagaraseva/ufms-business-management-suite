<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Migration Plan

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Principles

1. **The source is never modified.** The v5.6.61 bundle is preserved read-only at
   `_incoming/source-v5.6.61` and is input only.
2. **Migration is repeatable and idempotent.** Every import script keys on
   `(tenant_id, legacy_table, legacy_id)` so a re-run updates rather than duplicates.
3. **Nothing is destroyed.** No legacy row is deleted or overwritten; the spreadsheet remains
   authoritative until cut-over sign-off.
4. **Reconciliation is the acceptance test.** Rows in = rows out + rejected-with-reason, and
   financial totals must match to the paisa.
5. **Synthetic data only in non-production.** Part 1 rule 16 — no real employee, payroll or
   customer data in any demonstration or shared environment.

## 2. Migration pipeline

| Stage | Tool | Output |
|---|---|---|
| 1. Extract | `migration/import-scripts/extract-sheets.mjs` (Sheets API, read-only scope) | Raw JSON per tab + `source_row_ref` |
| 2. Preserve provenance | same | Every record keeps `legacy_table`, `legacy_row`, `legacy_id` |
| 3. Clean & validate | `migration/import-scripts/validate.mjs` (Zod schemas) | Rejected rows with reason codes |
| 4. Map | `migration/data-mapping/*.mapping.json` | Column → column decision, per tab |
| 5. Transform | `migration/import-scripts/transform.mjs` | Dates → timestamptz, money → numeric, flags → boolean |
| 6. Load in dependency order | `migration/import-scripts/load.mjs` | Tenants → companies → users → clients → tenders → employees → … |
| 7. Record rejections | same | `migration_rejections` table with reason |
| 8. Reconcile counts | `migration/reconciliation/reconcile.mjs` | Per-table counts, source vs target |
| 9. Reconcile money | same | Sum of every financial column, to 2 dp |
| 10. Verify relationships | same | Orphan foreign keys = 0 |
| 11. Verify documents | same | Every `DriveFileID` either copied to object storage or explicitly parked |
| 12. Report | same | `reconciliation/report-<timestamp>.md` |

## 3. Load order (foreign-key safe)

```
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
```

## 4. Cut-over strategy

| Step | Action | Reversible? |
|---|---|---|
| R1 | Rehearse full migration into a scratch database from a **sanitised** copy | Yes — scratch DB is dropped |
| R2 | Financial reconciliation signed off by finance owner | n/a |
| R3 | Announce read-only window on the legacy CRM | Yes |
| R4 | Final delta migration + verification | Yes — legacy untouched |
| R5 | Grant users access to the new platform; legacy stays available read-only for 30 days | **Yes — rollback is simply "keep using Sheets"** |
| R6 | After 30 clean days, archive the legacy spreadsheet | Point of no return |

## 5. What cannot be migrated automatically

| Item | Why | Handling |
|---|---|---|
| Provider OAuth refresh tokens (Gmail, Microsoft, Meta, LinkedIn, X) | They belong to the old script's client credentials and are encrypted to it | Every tenant re-authorises once after cut-over; UI prompts for the 6 affected integrations |
| Google Doc template merges | Templates are Google Docs with Apps-Script-specific placeholders | Recreated as HTML/React PDF templates in `packages/integrations/pdf` |
| Drive folder trees | Folder semantics are implicit in names and IDs | Files copied to object storage with a flat key + metadata; original Drive IDs retained in metadata for lookup |
| Test kit results | Not supplied | New test suite is the only evidence of correctness |

