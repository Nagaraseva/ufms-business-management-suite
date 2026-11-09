# Deployment Guide — UFMS Business Management Suite

> Generated Phase 8 — do not deploy to public production without explicit approval (Task §11).

## 1. Environments

| Name | DATABASE_URL | Branch | Deploy |
|------|--------------|--------|--------|
| local | `postgresql://ufms:ufms_dev_local_only@127.0.0.1:5432/ufms_dev` | any | `docker compose up` |
| staging | Neon/RDS (managed) | `develop` | CI → staging (manual approve) |
| production | managed Postgres + PITR + daily logical backup | `main` | tag `v*` + manual approve |

Never paste secrets into chat or source — use `env` / deployment-platform secret store (Task §3).

## 2. Required env vars

See `.env.example`. Production must set (fail-fast if missing):

```
DATABASE_URL, APP_DATABASE_URL, ADMIN_DATABASE_URL
AUTH_SECRET (>=32 bytes, `openssl rand -base64 48`)
CREDENTIAL_ENCRYPTION_KEY (32-byte base64, `openssl rand -base64 32`)
CORS_ORIGINS, TENANT_ROOT_DOMAINS
STORAGE_PROVIDER=s3  STORAGE_BUCKET=ufms-prod  STORAGE_MAX_BYTES=26214400
EMAIL_PROVIDER=ses|smtp  EMAIL_FROM=noreply@<domain>
# Platform only
PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD (one-time seeding)
```

`ALLOW_INSECURE_DEFAULTS=true` is forbidden in production (server refuses to start).

## 3. Migrations

```bash
# generate client (CI does this)
npx prisma generate --schema packages/database/prisma/schema.prisma

# apply all migrations (idempotent, ordered by timestamp prefix)
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# seed platform tenant + starter roles/permissions/plans
node packages/database/prisma/seed.mjs
```

RLS policies are in `*_rls_*` migrations; `migrate deploy` applies them.

## 4. Build & run

```bash
npm install
npm --workspace apps/api run build   # tsc
npm --workspace apps/web run build   # vite (→ apps/web/dist)

PORT=3000 node apps/api/dist/src/main.js
# or: docker build -f Dockerfile -t ufms:prod .
```

OpenAPI: `GET /api/docs` (Swagger UI) and `GET /docs/openapi.json` (generated on bootstrap).

## 5. Worker

Single-node: in-process `QueueService` (no Redis) — sufficient for low-volume campaign/social/AI jobs. For multi-instance, replace `QueueService.processNext` with BullMQ/Redis adapter behind same interface (`enqueue`/`status`). Worker logs to stdout; dead jobs surfaced at `GET /api/v1/queue/jobs` (audit:read).

## 6. Storage

`console` provider (default) is metadata-only — no local-disk writes (Rule 4). Production:

```
STORAGE_PROVIDER=s3
STORAGE_BUCKET=ufms-prod-XXXX
AWS_REGION=ap-south-1  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (via secrets manager, never env file)
# or GCS: STORAGE_PROVIDER=gcs GOOGLE_APPLICATION_CREDENTIALS
```

All uploads go through `POST /api/v1/storage/uploads/register` → signed PUT URL → direct-to-bucket.

## 7. Backups & restore drill

- PITR enabled on managed Postgres; test restore monthly.
- Logical backup: `pg_dump --schema=public | gzip` daily, retained 30d.
- Restore drill (staging, quarterly): `createdb ufms_restore && psql < dump && npx prisma migrate deploy --schema ... --preview-feature` + `SELECT count(*) FROM tenants` reconciliation.

## 8. Monitoring

- Health: `GET /api/v1/health` (liveness) — no auth.
- Audit log: `audit_logs` table, immutable append-only, queried at `/api/v1/platform/audit` (platform_admin) and embedded audit rows per tenant.
- Queue dead-letter: alert when `jobs.status=dead` unseen for >1h.

## 9. Secrets rotation

`CREDENTIAL_ENCRYPTION_KEY` rotation: decrypt with old key, re-encrypt with new, update `ai_provider_configs.apiKeyEnc`, `tenant_settings.value` rows. Zero-downtime via dual-key window.

## 10. Tenant suspension runbook

Platform admin sets `Tenant.status=SUSPENDED` at `/api/v1/platform/tenants/:id/status` with reason. SessionGuard rejects subsequent requests with `TENANT_SUSPENDED` (403) — enforced at API, not just UI (Task §18). Re-activate via same endpoint → `ACTIVE`.
