-- Defense in depth for exercise maker-checker and agency-scoped queries.
-- Idempotent: safe on an already initialized local development volume.
CREATE INDEX IF NOT EXISTS incidents_agency_idx ON incidents(agency_id);
CREATE INDEX IF NOT EXISTS incident_agency_created_idx ON incidents(agency_id, created_at DESC);

CREATE OR REPLACE FUNCTION aegis_enforce_independent_checker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    current_maker TEXT;
    proposal_state TEXT;
BEGIN
    SELECT maker_subject, status
    INTO current_maker, proposal_state
    FROM action_proposals
    WHERE id = NEW.proposal_id
    FOR UPDATE;

    IF current_maker IS NULL THEN
        RAISE EXCEPTION 'Exercise proposal not found' USING ERRCODE = '23503';
    END IF;
    IF current_maker = NEW.checker_subject THEN
        RAISE EXCEPTION 'Maker and checker must be different identities' USING ERRCODE = '23514';
    END IF;
    IF proposal_state <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted proposals can be reviewed' USING ERRCODE = '23514';
    END IF;
    IF BTRIM(NEW.rationale) = '' THEN
        RAISE EXCEPTION 'Checker must record rationale' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS aegis_check_independent_checker ON approvals;
CREATE TRIGGER aegis_check_independent_checker
BEFORE INSERT ON approvals
FOR EACH ROW EXECUTE FUNCTION aegis_enforce_independent_checker();
