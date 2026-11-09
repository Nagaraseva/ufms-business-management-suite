-- Phase 8: worker jobs table (tenant-scoped, RLS)
CREATE TABLE "jobs" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastError" TEXT,
  "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "jobs_tenant_status_runAt_idx" ON "jobs"("tenantId","status","runAt");
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status","runAt");
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "jobs";
CREATE POLICY tenant_isolation ON "jobs"
  USING ("tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "jobs" TO ufms_app;
