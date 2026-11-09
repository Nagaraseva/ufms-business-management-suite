-- ---------------------------------------------------------------------------
-- Phase 4 — Row Level Security for the HR & workforce tables.
--
-- Every tenant-owned row is invisible without `app.tenantId` bound. Two tables
-- carry a deliberate deviation:
--
--   statutory_rate_sets   tenantId is NULLABLE: a NULL row is a platform-wide
--                         statutory default. Tenants may READ the platform set
--                         but may only WRITE rows where tenantId = theirs.
--   minimum_wage_rates    same shape, same rule.
--
-- Without that second clause a tenant could not see the shared rate card; and
-- without the write clause a tenant could EDIT another tenant's override.
-- ---------------------------------------------------------------------------

-- ------------------------- strictly tenant-scoped -------------------------
ALTER TABLE "employees"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees"             FORCE  ROW LEVEL SECURITY;
ALTER TABLE "employee_documents"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_documents"    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "employee_allocations"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_allocations"  FORCE  ROW LEVEL SECURITY;
ALTER TABLE "manpower_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manpower_requirements" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "statutory_rates"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "statutory_rates"       FORCE  ROW LEVEL SECURITY;
ALTER TABLE "pt_slabs"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pt_slabs"              FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "employees"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "employee_documents"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "employee_allocations"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "manpower_requirements"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "statutory_rates"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "pt_slabs"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

-- ------------------- platform defaults + tenant overrides -------------------
ALTER TABLE "statutory_rate_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "statutory_rate_sets" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "minimum_wage_rates"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "minimum_wage_rates"  FORCE  ROW LEVEL SECURITY;

-- Read: own tenant's rows, plus platform defaults (tenantId IS NULL).
-- Write: only rows that belong to the caller's tenant. A tenant can therefore
-- never UPDATE a platform default into something else, and can never touch a
-- sibling tenant's override.
CREATE POLICY tenant_isolation ON "statutory_rate_sets"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenantId', true)::uuid
  )
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "minimum_wage_rates"
  USING (
    "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenantId', true)::uuid
  )
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

-- ------------------------------- privileges -------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "employees",
  "employee_documents",
  "employee_allocations",
  "manpower_requirements",
  "statutory_rate_sets",
  "statutory_rates",
  "pt_slabs",
  "minimum_wage_rates"
TO ufms_app;
