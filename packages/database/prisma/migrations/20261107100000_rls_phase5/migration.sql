-- ---------------------------------------------------------------------------
-- Phase 5 — Row Level Security for attendance and payroll.
--
-- Every table here is strictly tenant-scoped: attendance, pay figures and
-- statutory identities are the most sensitive data the product holds. There is
-- no shared/platform row in any of these tables, so the simple USING clause is
-- correct and there is no read-wider-than-write exception.
-- ---------------------------------------------------------------------------

ALTER TABLE "attendance_records"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records"   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "salary_slips"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_slips"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "payroll_run_items"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_run_items"    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "payroll_adjustments"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_adjustments"  FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "attendance_records"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "salary_slips"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "payroll_runs"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "payroll_run_items"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

CREATE POLICY tenant_isolation ON "payroll_adjustments"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "attendance_records",
  "salary_slips",
  "payroll_runs",
  "payroll_run_items",
  "payroll_adjustments"
TO ufms_app;
