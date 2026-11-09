# Commercial SaaS — Plans, Subscriptions & Platform Controls

## Model

- `Plan` (code, name, monthly/annual price, trialDays, userLimit, whiteLabel, modules via `PlanModule`)
- `Module` (crm, tenders, hr, payroll, accounts, assets, marketing, ai, sla, …)
- `Subscription` (tenantId, planId, status TRIALING|ACTIVE|PAST_DUE|GRACE|SUSPENDED|CANCELLED, billingCycle, period, trialEndsAt, graceEndsAt)
- `UsageRecord` (tenantId, metric, value) — for metering (users, storage_mb, ai_tokens, emails_sent)

Tenant's effective entitlement = latest subscription's plan → `PlanModule`s. Future enforcement point: middleware that checks `featureFlags` + `planModules` before routing to module controllers (currently advisory — billing adapter is interface-ready, not enforced blocking).

## Platform admin (Rule 18)

- Only users with `roles.code = platform_admin` AND `isPlatformAdmin` flag may call `/api/v1/platform/*`.
- Every state change writes `audit_logs` with actor, entity, before/after, reason.
- No unrestricted backdoor into customer data: platform admin's ability to read tenant business rows is via RLS-bypass `auth` client, which is instrumented and auditable; UI surfaces empty unless `?all=true` and is logged.
- Seeding: `packages/database/prisma/seed.mjs` creates the platform tenant + platform_admin user + baseline plans.

## Suspension gate

`Tenant.status` in (`SUSPENDED`,`CANCELLED`) causes `SessionGuard` to reject with `TENANT_SUSPENDED` (403). This is API-level, not frontend-only (Task §5, Rule 18). Client should redirect to billing/support page.

## White-label

`TenantBranding` (logoUrl, faviconUrl, primary/secondary/accent colors, loginHeadline, footerText). Frontend `Shell` reads `me.tenant.branding` and applies CSS variables; `Platform → tenants/:id/branding` allows per-tenant override.

## Billing adapter

`Subscription.billingCycle` + `UsageRecord` feed an external biller (Stripe/Razorpay). Adapter interface is `billing.adapter.ts` (to be implemented per provider) — no vendor lock. Webhook endpoint validates signatures at `POST /api/v1/platform/billing/webhook` (scaffold — enable per provider).
