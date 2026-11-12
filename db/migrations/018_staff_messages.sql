-- Staff email notices (docs/COMMUNICATION_CHANNELS.md). Additive and idempotent; nothing is removed or emptied.
-- Owner decision, 12 November 2026: email notices to AEGIS's own signed-in staff who have opted in. Nothing else.
-- The address comes only from the verified identity token (email claim with email_verified true), never a browser.
CREATE TABLE IF NOT EXISTS staff_contacts (
  subject TEXT PRIMARY KEY CHECK (length(subject) BETWEEN 1 AND 256 AND subject NOT LIKE 'system:%'),
  agency_id UUID NOT NULL,
  email TEXT CHECK (email IS NULL OR length(email) BETWEEN 3 AND 254),
  roles TEXT[] NOT NULL DEFAULT '{}',
  consent_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An opted-in row always has an address; any other row keeps none.
  CONSTRAINT staff_contacts_consent_shape CHECK (
    (consent_at IS NOT NULL AND opted_out_at IS NULL AND email IS NOT NULL) OR (consent_at IS NULL AND email IS NULL))
);
CREATE INDEX IF NOT EXISTS staff_contacts_agency_idx ON staff_contacts (agency_id) WHERE consent_at IS NOT NULL;

-- Append-only: one or two rows per send attempt (see attempt_id). Never an address, a provider body, an exception text or a key.
CREATE TABLE IF NOT EXISTS staff_message_log (
  id UUID PRIMARY KEY,
  -- One send attempt writes a 'queued' row before the provider call and a second row with the outcome; both carry
  -- the same attempt_id. A suppressed attempt writes one row.
  attempt_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  recipient_subject TEXT NOT NULL CHECK (length(recipient_subject) BETWEEN 1 AND 256),
  template_id TEXT NOT NULL CHECK (template_id IN ('test_notice', 'approval_waiting')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL CHECK (state IN ('queued', 'sent', 'failed', 'suppressed')),
  provider_status INTEGER,
  reason TEXT CHECK (reason IS NULL OR reason ~ '^[a-z_]{1,48}$'),
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 256),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_message_log_recipient_idx ON staff_message_log (recipient_subject, at DESC);
CREATE INDEX IF NOT EXISTS staff_message_log_attempt_idx ON staff_message_log (attempt_id);
CREATE INDEX IF NOT EXISTS staff_message_log_agency_idx ON staff_message_log (agency_id, at DESC);

CREATE OR REPLACE FUNCTION staff_message_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'staff_message_log is append-only';
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'staff_message_log_no_change'
                 AND tgrelid = 'staff_message_log'::regclass) THEN
    CREATE TRIGGER staff_message_log_no_change BEFORE UPDATE OR DELETE ON staff_message_log
      FOR EACH ROW EXECUTE FUNCTION staff_message_log_append_only();
  END IF;
END;
$$;
