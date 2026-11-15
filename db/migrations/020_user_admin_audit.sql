-- User administration audit (docs/USER_MANAGEMENT.md). Additive and idempotent; nothing is removed or emptied.
-- Accounts live in the identity provider; IndTrana stores only this append-only record of what an administrator did.
-- Never a password, never an email address: changed fields are recorded as closed codes only.
CREATE TABLE IF NOT EXISTS user_admin_audit (
  id UUID PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'enable', 'disable', 'reset_password', 'sign_out')),
  outcome TEXT NOT NULL CHECK (outcome IN ('done', 'incomplete')),
  target_id TEXT NOT NULL CHECK (target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  target_username TEXT NOT NULL CHECK (length(target_username) BETWEEN 1 AND 255),
  changed TEXT[] NOT NULL DEFAULT '{}'
    CHECK (changed <@ ARRAY['first_name', 'last_name', 'email', 'role', 'department', 'team']::TEXT[]),
  role_after TEXT CHECK (role_after IS NULL OR role_after IN ('incident_operator', 'incident_checker', 'incident_auditor',
                                                              'department_operator', 'response_team', 'platform_admin')),
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 256),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_admin_audit_at_idx ON user_admin_audit (at DESC);

CREATE OR REPLACE FUNCTION user_admin_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'user_admin_audit is append-only';
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_admin_audit_no_change'
                 AND tgrelid = 'user_admin_audit'::regclass) THEN
    CREATE TRIGGER user_admin_audit_no_change BEFORE UPDATE OR DELETE ON user_admin_audit
      FOR EACH ROW EXECUTE FUNCTION user_admin_audit_append_only();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_admin_audit_no_truncate'
                 AND tgrelid = 'user_admin_audit'::regclass) THEN
    CREATE TRIGGER user_admin_audit_no_truncate BEFORE TRUNCATE ON user_admin_audit
      FOR EACH STATEMENT EXECUTE FUNCTION user_admin_audit_append_only();
  END IF;
END;
$$;
