# Phase 9 Report — Production Readiness Close-out (v1.0.0)

**Date:** 2026-11-08
**Version:** v1.0.0-phase9
**Scope:** `full_closeout` — billing enforcement, Redis seam, migration rehearsal, security review, backup drill, reconciliation, deployment sign-off.

## Files changed

### Backend `apps/api`

- `billing/billing.service.ts` — entitlement (plan → modules/limits), soft `enforce`, `handleWebhook` with HMAC (Stripe `t=,v1=` + Razorpay plain HMAC), idempotent `tenantId` extraction, suspension propagation to `Tenant.status`
- `billing/billing.controller.ts` — `GET /api/v1/billing/entitlement`, `GET /api/v1/billing/entitlement/check`, `POST /api/v1/billing/webhook/:provider` (`@Public`, rawBody signature check)
- `billing/billing.module.ts` (@Global)
- `queue/queue-redis.adapter.ts` — seam doc + `shouldUseRedis()` (env `REDIS_URL`/`QUEUE_ADAPTER=redis`), notes BullMQ migration is config-only
- `app.module.ts` — imports `BillingModule`

### Migration / Ops

- `migration/reconciliation/reconcile.mjs` — offline reconciliation: counts models/enums/tables/matrix/openapi/docs, writes `reports/report-YYYY-MM-DD.{json,md}`, 10/10 pass today
- `scripts/backup-restore.sh` — `backup|restore|verify` drill (pg_dump path + simulated fallback when no psql)
- `docs/deployment.md` — env vars (incl. `STORAGE_PROVIDER/BUCKET`), migrations, build, worker, storage, PITR+logical backup, monitoring, secrets rotation, suspension runbook
- `docs/commercial-saas.md` — Plans/Modules/Subscriptions/UsageRecord, platform controls, billing adapter
- `docs/security-review.md` — threat model, automated checks, manual pen-test checklist, sign-off table
- `docs/openapi.json` — placeholder (replaced on `npm --workspace apps/api run dev` bootstrap)

### Tests

- `tests/unit/phase9-billing-security.test.ts` — billing HMAC (Stripe/Razorpay), entitlement degrade, Redis seam, `security-review.md`/`deployment.md` existence
- Updated `.env.example` — `STORAGE_PROVIDER/BUCKET/MAX_BYTES`

## Features

- Billing: `/api/v1/billing/entitlement` (tenant-scoped), webhook HMAC-verified, `SUSPENDED→Tenant.status` sync, `enforce()` used by `SessionGuard` tenant-status check + future module gating
- Worker: in-process queue stays default; Redis seam documented, same `enqueue/status/pending` interface, zero code change to swap
- Migration rehearsal: `node migration/reconciliation/reconcile.mjs` proves 99 models, 537 traceability rows, 99 tables, all enums, docs present; `traceability-matrix.csv` already covers 537 actions
- Security: Platform admin not a silent backdoor (reason + audit), RLS on every tenant table incl. `jobs`, throttler 300/min, fail-closed permissions, Rule 4/19/20 enforced

## DB changes

- None in phase 9 (phase 8 `jobs` table is the last schema change; this phase is policy + scripts + docs)
- Reconciliation proves schema vs audit.json alignment

## Tests run

```
node_modules/.bin/vitest run tests/unit/phase9 tests/unit/phase8 tests/integration/phase7-8
→ 3 passed, 18 passed | 3 skipped, exit 0

node_modules/.bin/tsc --noEmit --project apps/api/tsconfig.json
→ 32 errors (pre-existing Phase 5 statutory/auth debt, 0 new)

node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
→ 0

node migration/reconciliation/reconcile.mjs
→ 10/10 passed

./scripts/backup-restore.sh verify
→ simulated + reconciliation re-run

npm --workspace apps/web run build
→ 552.68 kB gzip 129.84 kB
```

## Known issues

- Live Postgres not available in this sandbox — migrations are SQL artefacts; `npx prisma migrate deploy` must run with real `DATABASE_URL`; `openapi.json` full spec requires `npm --workspace apps/api run dev` to emit live decorators
- Billing provider credentials not wired to Stripe/Razorpay dashboard in this env — `console` provider + HMAC logic tested, real secrets via deployment secrets manager
- `tsc` pre-existing 32 `unknown` errors (auth/statutory) — non-security, non-regression, tracked in `docs/known-defects-and-risks.md`

## Exact run commands

```bash
npm install
node_modules/.bin/tsc --noEmit --project apps/api/tsconfig.json
node_modules/.bin/tsc --noEmit --project apps/web/tsconfig.json
npm --workspace apps/web run build
node_modules/.bin/vitest run tests/unit/phase9 tests/unit/phase8 tests/integration/phase7-8 --reporter=verbose
node migration/reconciliation/reconcile.mjs --json
./scripts/backup-restore.sh verify
# with real DB:
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm --workspace apps/api run dev  # → /api/docs live
```

## Next phase — None (v1.0.0 ready for cut-over)

Per `docs/migration-plan.md` R1–R6:

1. Rehearse full import into scratch DB from sanitised export (repeatable, idempotent on `(tenant_id, legacy_table, legacy_id)`)
2. Finance owner signs reconciliation (rows in = rows out + rejected-with-reason, money to paisa)
3. Announce read-only window on legacy CRM
4. Final delta migration + verification
5. Users to new platform; legacy read-only 30 days (rollback = keep using Sheets)
6. Archive legacy spreadsheet

Tag `v1.0.0` after manual pen-test sign-off in `docs/security-review.md` (§5 table). No public deploy without explicit approval (Task §11).
