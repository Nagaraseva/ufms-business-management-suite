-- Attendance corrections are as tenant-sensitive as attendance itself.
ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_corrections" FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "attendance_corrections"
  USING ("tenantId" = current_setting('app.tenantId', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenantId', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_corrections" TO ufms_app;
