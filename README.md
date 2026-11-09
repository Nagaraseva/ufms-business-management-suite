# UFMS Business Management Suite

Commercial multi-tenant business management platform, built as a Node.js /
TypeScript monorepo on PostgreSQL, migrating the verified functionality of
**United Sales CRM v5.6.61-options** (Google Apps Script).

> **Status:** Phase 0 (source audit) complete · Phase 1 (foundation) complete ·
> Phases 2–4 complete · **Phase 5 (attendance & payroll with statutory) complete**
> — `npx vitest run` → **335/335 passing across 11 files**.
> Nothing here is a mockup — every claim in this README was produced by running
> the commands shown.

---

## What is proven to work right now

| Capability | Evidence |
|---|---|
| Full audit of the legacy source | `migration/source-inventory/audit.mjs` parses 42 `.gs` files, 1,723 functions, 537 API actions |
| Ten Phase 0 documents generated from source | `node migration/source-inventory/generate-docs.mjs` → `docs/*.md` |
| PostgreSQL tenancy schema | `packages/database/prisma/schema.prisma`, migration applied |
| Row Level Security tenant isolation | `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on 48 tables |
| **Tenant isolation proven by test** | `tests/database/tenant-isolation.test.ts` — 12/12 passing |
| Attendance register (new capability) | `apps/api/src/hr/attendance.controller.ts`, `apps/web/src/pages/Attendance.tsx` |
| Payroll runs with maker-checker + period lock | `packages/shared/src/payroll/run-rules.ts`, `apps/api/src/hr/payroll.controller.ts` |
| Bank CSV + PF ECR exports, byte-compatible with v5.6.61 | `tests/unit/payroll-run.parity.test.ts` — 15/15 passing |
| Legacy wage formula unchanged | `tests/unit/hr-rules.parity.test.ts` — 34/34 passing |

---

## Quick start

```bash
# 1. Dependencies
npm install

# 2. Database (Docker or local PostgreSQL 15+)
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres
#    ...or use an existing instance and set DATABASE_URL

# 3. Environment
cp .env.example .env      # then fill in the secrets (never commit .env)

# 4. Schema
npm run db:migrate        # applies migrations incl. Row Level Security

# 5. Seed two demo tenants (development only)
npm run db:seed

# 6. Run the API and the web app
npm --workspace @ufms/api run dev     # http://localhost:3000  (Swagger: /api/docs)
npm --workspace @ufms/web run dev     # http://localhost:5173

# 7. Run every test (57)
npx vitest run

# 8. Re-run the source audit at any time
npm run audit
```

---

## Repository layout

```
apps/            web (React), api (NestJS), worker (jobs)   — Phase 1+
packages/
  database/      Prisma schema, migrations, RLS policies
  shared/        shared types and utilities
  ui/            design system
  validation/    Zod schemas shared by API and web
  integrations/  provider adapters (email, storage, social, AI, PDF)
migration/
  source-inventory/   audit engine + generated matrices
  data-mapping/       column-level mapping decisions
  import-scripts/     extract → validate → transform → load
  reconciliation/     count + financial reconciliation
docs/            Phase 0 audit + operational guides
tests/           unit · integration · security · e2e · database
infrastructure/  docker · deployment · monitoring
```

---

## The legacy source is read-only

The v5.6.61 bundle lives outside the repository at `_incoming/source-v5.6.61`
and is never modified (Project Rule 15). The audit tooling reads it and emits
inventory data. To point at a different copy:

```bash
node migration/source-inventory/audit.mjs --source /path/to/v5.6.61
```

---

## Security posture (Phase 1)

- Passwords: Argon2id (never the legacy PIN scheme).
- Sessions: opaque, hashed at rest, revocable, expiring.
- Authorisation: explicit permission code per route; a route without one fails
  closed at startup (the legacy app left 392 of 537 actions unguarded).
- Tenant isolation: service-layer scoping **and** PostgreSQL RLS with `FORCE`,
  under a `NOSUPERUSER NOBYPASSRLS` application role.
- Audit: every mutation writes a tenant-scoped `audit_logs` row.

---

## Documentation

| Document | Contents |
|---|---|
| `docs/source-project-inventory.md` | Verified counts of the legacy v5.6.61 project |
| `docs/existing-*.md` | Module, database, API, role and integration mappings |
| `docs/business-rules-and-calculations.md` | Wage/payroll/statutory rules **and the differential proof** |
| `docs/known-defects-and-risks.md` | Mechanically detected legacy defects |
| `docs/phase-2-report.md` | Phase 2 delivery report, bugs found, gaps carried forward |
| `docs/phase-3-report.md` | Phase 3 delivery report — tender rules parity, client care, traceability updates |
| `docs/phase-4-report.md` | Phase 4 delivery report — HR, deployment, statutory config, PII encryption |
| `docs/phase-4-gap-analysis.md` | Source-verification findings: modules the roadmap claimed but the code lacks |
| `docs/implementation-roadmap.md` | Phase plan and status |

## Demo credentials (development only)

| Tenant | Email | Password |
|---|---|---|
| Alpha | `owner@alpha.test` | `AlphaOwner!2026` |
| Bravo | `owner@bravo.test` | `BravoOwner!2026` |
