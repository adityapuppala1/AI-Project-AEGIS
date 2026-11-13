-- Brand settings (docs/BRANDING.md). Additive and idempotent; nothing is removed or emptied.
-- One row holds the product name and logo an administrator chose. NULL name or logo means "use the built-in default".
-- The configured name is display text in the browser only: staff email, CAP blocks, exports and audit text never use it.
CREATE TABLE IF NOT EXISTS brand_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT CHECK (name IS NULL OR (char_length(name) BETWEEN 2 AND 40 AND name ~ '^[A-Za-z0-9 .&''-]+$')),
  logo BYTEA CHECK (logo IS NULL OR octet_length(logo) BETWEEN 1 AND 262144),
  logo_media_type TEXT CHECK (logo_media_type IS NULL OR logo_media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT CHECK (updated_by IS NULL OR length(updated_by) BETWEEN 1 AND 256),
  CONSTRAINT brand_settings_logo_shape CHECK ((logo IS NULL) = (logo_media_type IS NULL))
);
INSERT INTO brand_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Append-only: one row per change. Never the logo bytes; only its size, type and SHA-256.
CREATE TABLE IF NOT EXISTS brand_audit (
  id UUID PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('name_set', 'logo_set', 'reset')),
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  name_after TEXT,
  logo_media_type TEXT,
  logo_size INTEGER,
  logo_sha256 TEXT CHECK (logo_sha256 IS NULL OR logo_sha256 ~ '^[0-9a-f]{64}$'),
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 256),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_audit_at_idx ON brand_audit (at DESC);

CREATE OR REPLACE FUNCTION brand_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'brand_audit is append-only';
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'brand_audit_no_change'
                 AND tgrelid = 'brand_audit'::regclass) THEN
    CREATE TRIGGER brand_audit_no_change BEFORE UPDATE OR DELETE ON brand_audit
      FOR EACH ROW EXECUTE FUNCTION brand_audit_append_only();
  END IF;
  -- Row triggers do not fire on TRUNCATE; a statement trigger refuses that too. Added on re-run where 019 already ran.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'brand_audit_no_truncate'
                 AND tgrelid = 'brand_audit'::regclass) THEN
    CREATE TRIGGER brand_audit_no_truncate BEFORE TRUNCATE ON brand_audit
      FOR EACH STATEMENT EXECUTE FUNCTION brand_audit_append_only();
  END IF;
END;
$$;
