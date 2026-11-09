# Security Review — UFMS Business Management Suite (v1.0.0 pre-release)

> Phase 9 — executed without public deploy (Task §11). Re-run after every auth/billing/RLS change.

## 1. Threat model

| Actor | Capability | Mitigated by |
|-------|-----------|--------------|
| Tenant A user → Tenant B data | Craft `tenantId` in body/query | SessionGuard + Prisma `withTenant` + PostgreSQL RLS on every tenant-owned table; cross-tenant `findFirst({id, tenantId})` asserted in 25 test categories |
| Suspended tenant continues via cached token | Use old session after billing suspension | `SessionGuard` checks `tenant.status` on every request → 403 `TENANT_SUSPENDED` |
| Bulk exfil | Paginate beyond UI | ThrottlerGuard 300 req/min, explicit `take` caps (200/100/50) on all list endpoints |
| Privilege escalation | Call undocumented admin route | `PermissionsGuard` fail-closed: no `@RequirePermission` → 403 `NO_PERMISSION_DECLARED`; catalogue coverage asserted at boot |
| Secrets leak in logs/UI | `console.log(dto.apiKey)`, `SELECT *` returning `apiKeyEnc` | `CREDENTIAL_ENCRYPTION_KEY` at-rest, `hasKey:boolean` only to browser, `audit_logs` redacts `before/after` via `field-crypto.ts`; `ApiFailure` never includes stack |
| Local disk persistence (Rule 4) | `fs.writeFileSync('/tmp/upload')` | `StorageService` adapter never touches local fs; `console` provider is metadata-only; `creative_assets.storageKey` validated against `..` and filesystem paths |
| AI backdoor (Rule 19) | `send_email` without approval | `isHighRiskTool` → `PENDING_APPROVAL` only, `ai:approve` required, worker also checks `approvedById` |

## 2. Automated checks (CI)

```
npx tsc --noEmit --project apps/api/tsconfig.json   # 32 pre-existing non-security TS2339s, 0 new
npx tsc --noEmit --project apps/web/tsconfig.json    # 0
npx vitest run --exclude tests/integration            # 199 passed
npx vitest run tests/integration/phase7-8-isolation   # 12 passed | 3 skipped (needs live API)
node migration/reconciliation/reconcile.mjs           # 10/10
./scripts/backup-restore.sh verify
```

## 3. Manual pen-test checklist (sign-off required before prod)

- [ ] Attempt login with `tenantSlug` of another tenant — must fail without valid credentials in that tenant.
- [ ] Create resource in tenant A, fetch by ID with tenant B token — must 404.
- [ ] Suspend tenant via Platform, verify subsequent API calls from that tenant return 403 `TENANT_SUSPENDED`.
- [ ] Try `POST /api/v1/platform/tenants` as `tenant_owner` — must 403.
- [ ] Upload `evil.exe` / 100 MB file → must 400.
- [ ] Call provider webhook without valid HMAC → must 400 `BAD_SIGNATURE`.
- [ ] Verify `audit_logs` contains entries for every platform suspension and `mom_actions` status change.
- [ ] Verify `app.tenantId` is set in `PrismaService.withTenant` via `EXPLAIN` / `pg_stat_activity`.

## 4. Secrets

- `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` via deployment secrets, never `.env` in repo.
- `.env.example` documents shape; `.env` is gitignored.
- `ALLOW_INSECURE_DEFAULTS=true` blocks prod boot.

## 5. Sign-off

| Role | Name | Date | Verdict |
|------|------|------|---------|
| Security reviewer | _pending_ |  |  |
| Platform owner | _pending_ |  |  |
| Tech lead | _pending_ |  |  |

_Re-run this document after production deploy and after every auth/billing/RLS migration._
