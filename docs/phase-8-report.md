# Phase 8 Report — Commercial SaaS, Worker, Storage, Production Readiness

**Date:** 2026-11-08
**Version:** v0.8.0-phase8
**Scope selected:** `both` (Phase 8 + 9 combined) — commercial SaaS + background worker + storage + E2E hardening + OpenAPI + deployment docs.

## Files changed

### Backend (API)

- `apps/api/src/queue/queue.service.ts` — NEW: in-process job queue, no Redis, tenant-scoped, exponential backoff, dead-letter, DB persistence when `jobs` table present.
- `apps/api/src/queue/queue.controller.ts` — NEW: `GET /api/v1/queue/jobs` (tenant-scoped), `GET /api/v1/queue/jobs/:id`.
- `apps/api/src/queue/worker-handlers.service.ts` — NEW: registers `marketing:send_campaign`, `social:publish_post`, `ai:execute_tool`, `report:generate_snapshot`.
- `apps/api/src/queue/queue.module.ts` — NEW: @Global module, wires QueueService + handlers.
- `apps/api/src/storage/storage.service.ts` — NEW: provider-agnostic adapter (console|s3|s3_compatible|gcs|azure), validates size/type, reserves tenant-scoped storageKey, never writes to local disk (Rule 4), signed URL mint/verify.
- `apps/api/src/storage/storage.controller.ts` — NEW: `POST /api/v1/storage/uploads/register`, `GET /api/v1/storage/preview/:storageKey`, `GET /api/v1/storage/assets/:id/url`.
- `apps/api/src/storage/storage.module.ts` — NEW: @Global.
- `apps/api/src/platform/platform.controller.ts` — NEW: `/api/v1/platform/*` — tenants list/create/status (SUSPENDED blocked at API), plans upsert, subscriptions list, branding upsert, platform audit. Guarded by `isPlatformAdmin` + audit rows (Rule 18).
- `apps/api/src/common/guards.ts` — modified: `SessionGuard` now checks `tenant.status` and returns `TENANT_SUSPENDED` (403) for SUSPENDED/CANCELLED — API-level, not UI-only.
- `apps/api/src/marketing/marketing.controller.ts` — modified: injects `QueueService`, enqueues `marketing:send_campaign` on SENDING/SCHEDULED and `social:publish_post` on PUBLISH/SCHEDULED.
- `apps/api/src/ai/ai.controller.ts` — modified: injects `QueueService`, enqueues `ai:execute_tool` on approval.
- `apps/api/src/app.module.ts` — modified: imports `QueueModule`, `StorageModule`, registers `PlatformController` + coverage set.
- `apps/api/src/main.ts` — modified: richer OpenAPI description (versioning, platform, worker, storage), tags, bearer scheme, writes `docs/openapi.json` on bootstrap.
- `packages/database/prisma/schema.prisma` — added `model Job` + indexes.
- `packages/database/prisma/migrations/20261108020000_phase8_jobs/migration.sql` — NEW: jobs table + RLS.

### Frontend (Web)

- `apps/web/src/pages/Platform.tsx` — NEW: Platform admin console (tenants provision + suspend, plans upsert, subscriptions, audit, queue inspector, storage register).
- `apps/web/src/App.tsx` — added `/platform` route.
- `apps/web/src/components/Shell.tsx` — added Platform nav item (Crown icon, shown to all, guarded server-side).

### Tests

- `tests/unit/phase8-queue-storage.parity.test.ts` — NEW: queue enqueue/pending filtering, storage provider/metadata/forbidden-ext/size-guard/signed-URL, schema suspension marker.
- `tests/integration/phase7-8-isolation.test.ts` — NEW: E2E isolation smoke (unauth → 401/403, cross-tenant → 404), contracts (openapi.json, jobs migration/schema), skipIf without live server.

### Docs

- `docs/deployment.md` — NEW: env vars, migrations, build, worker, storage, backups, monitoring, secrets rotation, tenant-suspension runbook.
- `docs/commercial-saas.md` — NEW: Plan/Module/Subscription/UsageRecord model, platform controls, suspension gate, white-label, billing adapter.
- `docs/phase-8-report.md` — this file.

## Features (per Task § required modules)

- Multi-tenant isolation: unchanged, now covers `jobs` table (RLS) + every Phase 7 table. `TenantIsolationGuard` + `withTenant`/`RLS` preserved.
- Commercial SaaS: plans/subscriptions/entitlements, platform super-admin, suspension at API (Rule 18, §18 non-backdoor).
- Marketing/AI already delivered Phase 7, now async via worker (approval-gated still enforced).
- Storage: object-storage adapter, presigned URLs, no local persistent files (Rule 4).
- OpenAPI: `/api/docs` + `docs/openapi.json` emitted on start.
- Worker: background queue with retry + dead-letter.

## DB changes

- New enum uses: none (reuses existing).
- New table: `jobs` (UUID, tenantId, type, payload JSONB, status, attempts, maxAttempts, lastError, runAt, RLS, indexes on tenant/status/runAt).
- No data migration (additive).

## Tests run

```
npx vitest run tests/unit/phase8 tests/integration/phase7-8
→ 2 passed, 12 passed | 3 skipped, exit 0

npx tsc --noEmit --project apps/api/tsconfig.json
→ 32 errors (pre-existing, 0 new)

npx tsc --noEmit --project apps/web/tsconfig.json
→ 0 errors

Full unit (excluding integration DB that needs postgres):
→ existing parity parity still 1 pre-existing failure (tender-rules parity) — unchanged
```

## Known issues

- No live Postgres in this environment — migrations generated but not applied; `npx prisma migrate deploy` needed with real DATABASE_URL.
- `openapi.json` only emitted when API process starts (`npm --workspace apps/api run dev`); CI that only runs tests will see the warning, not a failure.
- Billing webhook scaffold not wired to a provider (Stripe/Razorpay) — billing status transitions are manual via platform controller; webhook is next step.
- Worker is in-process; multi-instance needs Redis replacement (same interface, documented).

## Exact run commands

```bash
npm install
npx tsc --noEmit --project apps/api/tsconfig.json
npx tsc --noEmit --project apps/web/tsconfig.json
npm --workspace apps/web run build
npx vitest run tests/unit/phase8 tests/integration/phase7-8 --reporter=verbose
npx vitest run --exclude tests/integration --exclude tests/database  # full unit coverage
# with real DB:
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm --workspace apps/api run dev  # → http://localhost:3000/api/docs
```

## Next phase

- Wire billing provider webhook (Stripe/Razorpay), enforce subscription status → feature gate.
- Replace in-process queue with BullMQ/Redis for horizontal scale.
- Rehearsal: import legacy Sheets CSVs → reconcile counts, attach source IDs (`legacyTenderId`, `legacyEmployeeId`).
- Security review + pen-test (RLS bypass, token leak, storage presign), backup/restore drill sign-off.
- Tag `v1.0.0` and publish deployment runbook.
