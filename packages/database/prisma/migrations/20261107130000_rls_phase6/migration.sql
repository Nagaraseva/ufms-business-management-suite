-- Phase 6 RLS - tenant isolation for all new tables
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'vendors',
    'invoices','invoice_items','invoice_payments',
    'vendor_bills','vendor_bill_items','vendor_payments',
    'bank_accounts','journal_entries','finance_approvals',
    'assets','asset_history',
    'stock_items','stock_purchases','stock_purchase_items',
    'stock_distributions','stock_distribution_items',
    'purchase_orders','purchase_order_items',
    'indents','purchase_requests'
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
