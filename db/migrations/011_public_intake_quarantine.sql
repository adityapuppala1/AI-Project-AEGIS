-- Opt-in public report intake: quarantine only. Additive and idempotent.
-- Rows never become cases, evidence, tasks or notifications; UPDATE is blocked so a row
-- cannot be silently promoted. No contact or identity columns exist by design.
CREATE TABLE IF NOT EXISTS public_intake_reports (
  id UUID PRIMARY KEY,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  hazard_type TEXT NOT NULL CHECK (hazard_type IN ('flood','waterlogging','wildfire','landslide','cyclone','other')),
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN 5 AND 38),
  lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN 65 AND 100),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'quarantined' CHECK (status = 'quarantined')
);

CREATE UNIQUE INDEX IF NOT EXISTS public_intake_reports_content_idx ON public_intake_reports(content_sha256);
CREATE INDEX IF NOT EXISTS public_intake_reports_submitted_idx ON public_intake_reports(submitted_at DESC);

CREATE OR REPLACE FUNCTION public_intake_reports_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'public_intake_reports rows are quarantined and cannot be modified';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS public_intake_reports_no_update ON public_intake_reports;
CREATE TRIGGER public_intake_reports_no_update BEFORE UPDATE ON public_intake_reports
  FOR EACH ROW EXECUTE FUNCTION public_intake_reports_block_update();
