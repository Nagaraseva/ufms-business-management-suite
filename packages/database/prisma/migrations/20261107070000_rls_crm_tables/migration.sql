-- Apply the same fail-closed tenant policy to the CRM flow tables added in
-- the crm_flow migration. Kept as a separate migration so the policy is
-- visible in history rather than hidden inside a schema change.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'lead_followups','surveys','quotations','quotation_items','quotation_versions'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
        WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid)
    $p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ufms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ufms_app;
