-- Tenant isolation for the Phase 3 tables (tenders, clients, contracts, SLA,
-- client care). Same fail-closed policy as every earlier tenant-owned table:
-- no app.tenantId in the session => no rows visible, no rows writable.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'tenders','tender_followups','tender_orders','security_deposits',
    'clients','client_contacts','contracts',
    'sla_agreements','complaints'
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
