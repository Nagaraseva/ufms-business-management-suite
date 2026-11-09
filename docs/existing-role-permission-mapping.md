<!-- GENERATED FILE — do not edit by hand.
     Produced by migration/source-inventory/generate-docs.mjs from audit.json.
     Re-run the generator after any change to the legacy source. -->

# Existing Role and Permission Mapping

> Source: `United Sales CRM` **v5.6.61-options** &nbsp;·&nbsp; audited 2026-11-07 &nbsp;·&nbsp; auditor v1.0.0

## 1. Roles as defined in source

- `SUPER_ADMIN`
- `ADMIN`
- `ACCOUNTS`
- `HR`
- `COORDINATOR`
- `EXECUTIVE`
- `TENDER_USER`
- `MANAGEMENT`
- `BDM_MANAGER`

That is **9 roles**, defined in `ROLE_ENUM_V4_` in `Database.gs`.

## 2. What the roles mean (derived from source behaviour)

| Role | Intended function | Evidence in source |
|---|---|---|
| `SUPER_ADMIN` | Owner. Bypasses every guard (`assertAccessV4_` returns early). | `Database.gs:1082` |
| `ADMIN` | Office administrator; most write access. | Named explicitly in many `assertRole_` lists |
| `MANAGEMENT` | **Read-only across the entire application** plus an approvals widget. | `mgmtAllowed` allow-list in `api()` |
| `ACCOUNTS` | Invoicing, receipts, vendor payments, bank book. | `Accounts.gs` guards |
| `HR` | Employees, salary slips, payroll runs, ESI/PF registers. | `HR.gs` guards |
| `COORDINATOR` | Operations coordination; surveys, deployments, wage breakups. | Guards + navigation |
| `EXECUTIVE` | Sales executive; own leads and follow-ups. | `assertRole_(user, ['EXECUTIVE'])` on marketing-lead actions |
| `TENDER_USER` | Tender desk; tenders, AI analysis, tender orders. | `assertTender_` (64 actions) |
| `BDM_MANAGER` | Business development manager; sales + marketing oversight. | Guards + navigation |

## 3. How authorisation is actually enforced

Three mechanisms coexist:

1. **`assertAccessV4_(user, allowedRoles)`** — SUPER_ADMIN short-circuits; everyone else is
   checked against an explicit array. An optional `ReadAccess` column grants cross-role *read*
   but is parsed and then **not enforced**: the source comment says
   *"ReadAccess gives read-only on those modules. We don't enforce read-only here — the caller decides."*
   That is a latent privilege-escalation path.
2. **The `MANAGEMENT` allow-list** — a hand-maintained object of ~90 action names inside `api()`.
   Any action added later is denied to MANAGEMENT until someone remembers to add it. The source
   even contains a fix note about a dead `listReminders` entry that had drifted.
3. **Frontend navigation filtering** — `navigationItems(role)` decides which pages render.

Mechanism 3 is cosmetic; mechanism 2 is a denylist-by-omission; mechanism 1 is the real control
but covers only 145 of 537 actions.

## 4. Role → action count (explicitly named)

| Role | Actions naming this role |
|---|---|
| `SUPER_ADMIN` | 24 |
| `ADMIN` | 25 |
| `ACCOUNTS` | 1 |
| `HR` | 0 |
| `COORDINATOR` | 7 |
| `EXECUTIVE` | 2 |
| `TENDER_USER` | 7 |
| `MANAGEMENT` | 1 |
| `BDM_MANAGER` | 9 |

## 5. Target permission model

The new platform replaces role-name checks with **permission codes** attached to routes, so
authorisation cannot be forgotten when a route is added.

| Legacy concept | New concept | Rationale |
|---|---|---|
| `Role` string column on Users | `roles` + `user_roles` (many-to-many, tenant-scoped) | A user may need more than one role; roles become tenant-owned data |
| Hard-coded role arrays in case arms | `permissions` table + `role_permissions` + `@RequirePermission('x:y')` decorator | Declared next to the route; enforced by a global guard that fails closed |
| `ReadAccess` column (parsed, unenforced) | `read` vs `write` vs `approve` `export` scopes | Makes the intent enforceable instead of advisory |
| `MANAGEMENT` allow-list object | A `viewer` role granted `*:read` only | Positive grant, no maintenance-by-omission |
| Frontend nav filtering | Backend permission check **and** nav filtering driven by the same `/auth/me` payload | UI stays a convenience; the server is the authority |
| `SUPER_ADMIN` bypass | Platform super-admin is **separate** from tenant roles and has no tenant-data access without a time-boxed, audited support grant | Part 15: "must not become an unrestricted backdoor" |

## 6. Mapped starter roles for new tenants

| New role | Derived from | Scope |
|---|---|---|
| `tenant_owner` | SUPER_ADMIN | Everything within the tenant (never across tenants) |
| `tenant_admin` | ADMIN | Configuration, users, all business modules |
| `viewer` | MANAGEMENT | Read-only, plus approvals inbox |
| `accounts` | ACCOUNTS | Finance module |
| `hr` | HR | HR + payroll preparation (cannot approve own run) |
| `operations` | COORDINATOR | Manpower, attendance, surveys |
| `sales_executive` | EXECUTIVE | Own leads only (row-level ownership check) |
| `tender_desk` | TENDER_USER | Tender module |
| `bd_manager` | BDM_MANAGER | Sales + marketing oversight |

