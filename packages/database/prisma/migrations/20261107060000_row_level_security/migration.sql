-- ===========================================================================
-- Tenant isolation — PostgreSQL Row Level Security
-- ===========================================================================
-- Defence in depth. The API already scopes every query by tenant_id in the
-- service layer; RLS guarantees that a *forgotten* WHERE clause, a raw query or
-- a compromised ORM call still cannot read another tenant's rows.
--
-- The application sets the tenant for each transaction:
--     SET LOCAL app.tenantId = '<uuid>';
-- A connection with no tenant set sees NOTHING (fail-closed):
--     NULLIF(current_setting('app.tenantId', true), '')::uuid -> NULL
--     and `tenant_id = NULL` is never true.
--
-- FORCE ROW LEVEL SECURITY makes the policy apply even to the table owner, so
-- the guarantee does not depend on who the connection authenticates as.
-- ===========================================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'companies','branches','departments','sites',
    'users','sessions','password_reset_tokens','login_history',
    'leads','audit_logs',
    'tenant_domains','tenant_settings','tenant_branding','tenant_feature_flags',
    'subscriptions','usage_records'
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

-- ---------------------------------------------------------------------------
-- roles: tenant_id is nullable because platform-level role templates exist.
-- A tenant must see its own roles AND the shared platform templates, but must
-- never see another tenant's custom roles.
-- ---------------------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON roles;
CREATE POLICY tenant_isolation ON roles
  USING (
    "tenantId" IS NULL
    OR "tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid
  );

-- ---------------------------------------------------------------------------
-- Child tables without their own tenant_id inherit isolation through the
-- parent foreign key (user_roles -> users, role_permissions -> roles,
-- user_company_access -> users, plan_modules -> plans). Restrict them by
-- subquery so they cannot leak either.
-- ---------------------------------------------------------------------------
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON user_roles;
CREATE POLICY tenant_isolation ON user_roles
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_roles."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid
    )
  );

ALTER TABLE user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_access FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON user_company_access;
CREATE POLICY tenant_isolation ON user_company_access
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_company_access."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid
    )
  );

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON role_permissions;
CREATE POLICY tenant_isolation ON role_permissions
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions."roleId"
        AND (
          r."tenantId" IS NULL
          OR r."tenantId" = NULLIF(current_setting('app.tenantId', true), '')::uuid
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Least-privilege application role.
-- The migration owner (superuser) bypasses RLS, which is correct for
-- migrations and backups; the API connects as this role instead so that the
-- policies are actually enforced in normal operation and in tests.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ufms_app') THEN
    CREATE ROLE ufms_app LOGIN PASSWORD 'ufms_app_local_only' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ufms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ufms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ufms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ufms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ufms_app;
