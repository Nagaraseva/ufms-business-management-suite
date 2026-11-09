-- Phase 7 RLS — tenant isolation for all new tables
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'marketing_contacts','marketing_lists','marketing_list_members','marketing_segments',
    'marketing_templates','marketing_campaigns','marketing_sends','marketing_suppressions',
    'marketing_mailboxes','social_accounts','social_posts',
    'daily_reports','mom_meetings','mom_participants','mom_agendas','mom_decisions','mom_actions',
    'report_snapshots','ai_conversations','ai_messages','ai_tool_calls','ai_provider_configs',
    'creative_projects','creative_assets'
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
GRANT USAGE ON TYPE "MarketingContactStatus","MarketingCampaignStatus","SocialPostStatus","MomStatus","AiToolStatus","CreativeStatus" TO ufms_app;
