-- Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md). Additive and idempotent; nothing is removed or emptied.
-- A platform_admin registry of satellite, mobile, fixed-line and tower providers plus synthetic assets. Seeded rows are
-- reference entries, not partnerships, and start disabled. Nothing here connects to or sends through any provider.
-- Rehearsal link states only label and preselect the Resilient Sensor Link simulation.
CREATE TABLE IF NOT EXISTS network_provider (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('satellite', 'terrestrial_mobile', 'terrestrial_fixed', 'tower_operator', 'public_reference')),
  orbit_class TEXT CHECK (orbit_class IS NULL OR orbit_class IN ('leo', 'meo', 'geo', 'mixed')),
  constellation_group TEXT CHECK (constellation_group IS NULL OR constellation_group IN
    ('starlink', 'oneweb', 'iridium-NEXT', 'globalstar', 'orbcomm', 'intelsat', 'ses', 'gnss', 'geo')),
  mcc_mnc TEXT[] NOT NULL DEFAULT '{}',
  asn BIGINT[] NOT NULL DEFAULT '{}',
  bands TEXT[] NOT NULL DEFAULT '{}',
  monogram TEXT NOT NULL CHECK (monogram ~ '^[A-Z0-9]{1,3}$'),
  colour_token TEXT NOT NULL CHECK (colour_token IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8')),
  logo_key TEXT CHECK (logo_key IS NULL OR logo_key IN ('spacex', 'airtel', 'jio')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  doc_link_id TEXT CHECK (doc_link_id IS NULL OR doc_link_id ~ '^[a-z0-9_]{2,40}$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  is_reference BOOLEAN NOT NULL DEFAULT false,
  rehearsal_state TEXT NOT NULL DEFAULT 'up' CHECK (rehearsal_state IN ('up', 'degraded', 'down')),
  rehearsal_capacity_kbps INTEGER NOT NULL DEFAULT 400 CHECK (rehearsal_capacity_kbps BETWEEN 0 AND 100000),
  credential_ciphertext BYTEA,
  credential_nonce BYTEA,
  credential_fingerprint TEXT CHECK (credential_fingerprint IS NULL OR credential_fingerprint ~ '^[0-9a-f]{8}$'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT CHECK (updated_by IS NULL OR length(updated_by) BETWEEN 1 AND 256),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT network_provider_credential_shape CHECK (
    (credential_ciphertext IS NULL) = (credential_nonce IS NULL) AND (credential_ciphertext IS NULL) = (credential_fingerprint IS NULL))
);

CREATE TABLE IF NOT EXISTS network_asset (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES network_provider(id),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('constellation', 'satellite', 'gateway', 'tower', 'cell', 'fibre_node')),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  norad_id INTEGER CHECK (norad_id IS NULL OR norad_id BETWEEN 1 AND 999999999),
  latitude NUMERIC(8, 5) CHECK (latitude IS NULL OR latitude BETWEEN 6 AND 38),
  longitude NUMERIC(8, 5) CHECK (longitude IS NULL OR longitude BETWEEN 68 AND 98),
  synthetic BOOLEAN NOT NULL DEFAULT true CHECK (synthetic),
  enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT CHECK (updated_by IS NULL OR length(updated_by) BETWEEN 1 AND 256),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT network_asset_location_shape CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX IF NOT EXISTS network_asset_provider_idx ON network_asset (provider_id) WHERE deleted_at IS NULL;

-- Append-only: one row per change. Field names only; never a credential or its ciphertext.
CREATE TABLE IF NOT EXISTS network_registry_audit (
  id UUID PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 256),
  agency_id TEXT NOT NULL CHECK (length(agency_id) BETWEEN 1 AND 64),
  entity TEXT NOT NULL CHECK (entity IN ('provider', 'asset')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'enable', 'disable', 'delete', 'restore',
                                         'credential_set', 'credential_clear', 'rehearsal_state')),
  from_version INTEGER,
  to_version INTEGER NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS network_registry_audit_at_idx ON network_registry_audit (at DESC);

CREATE OR REPLACE FUNCTION network_registry_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'network_registry_audit is append-only';
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'network_registry_audit_no_change'
                 AND tgrelid = 'network_registry_audit'::regclass) THEN
    CREATE TRIGGER network_registry_audit_no_change BEFORE UPDATE OR DELETE ON network_registry_audit
      FOR EACH ROW EXECUTE FUNCTION network_registry_audit_append_only();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'network_registry_audit_no_truncate'
                 AND tgrelid = 'network_registry_audit'::regclass) THEN
    CREATE TRIGGER network_registry_audit_no_truncate BEFORE TRUNCATE ON network_registry_audit
      FOR EACH STATEMENT EXECUTE FUNCTION network_registry_audit_append_only();
  END IF;
END;
$$;

-- Seed: reference entries only (is_reference, disabled). Fixed ids so a re-run inserts nothing new.
INSERT INTO network_provider (id, code, display_name, kind, orbit_class, constellation_group, bands, monogram,
                              colour_token, logo_key, doc_link_id, is_reference) VALUES
  ('6e570000-0000-4000-8000-000000000001', 'starlink', 'Starlink (SpaceX)', 'satellite', 'leo', 'starlink', '{Ku,Ka}', 'SL', 'c1', 'spacex', 'starlink_support', true),
  ('6e570000-0000-4000-8000-000000000002', 'eutelsat_oneweb', 'Eutelsat OneWeb', 'satellite', 'leo', 'oneweb', '{Ku,Ka}', 'OW', 'c2', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000003', 'isro_navic', 'ISRO NavIC messaging', 'satellite', 'mixed', 'gnss', '{L,S}', 'NV', 'c3', NULL, 'navic_icd', true),
  ('6e570000-0000-4000-8000-000000000004', 'isro_gsat', 'ISRO GSAT', 'satellite', 'geo', 'geo', '{C,Ku,Ka}', 'GS', 'c3', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000005', 'jio_ses', 'Jio-SES (JioSpaceFiber)', 'satellite', 'mixed', 'ses', '{Ku,Ka}', 'JS', 'c4', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000006', 'hughes_india', 'Hughes Communications India', 'satellite', 'geo', 'geo', '{Ku,Ka}', 'HI', 'c5', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000007', 'inmarsat_viasat', 'Inmarsat (Viasat) IsatData Pro', 'satellite', 'geo', 'geo', '{L}', 'IN', 'c6', NULL, 'inmarsat_idp', true),
  ('6e570000-0000-4000-8000-000000000008', 'iridium', 'Iridium', 'satellite', 'leo', 'iridium-NEXT', '{L}', 'IR', 'c7', NULL, 'iridium_cloudconnect', true),
  ('6e570000-0000-4000-8000-000000000009', 'globalstar', 'Globalstar', 'satellite', 'leo', 'globalstar', '{L,S}', 'GL', 'c8', NULL, 'globalstar_spot', true),
  ('6e570000-0000-4000-8000-00000000000a', 'skylo', 'Skylo (NB-NTN)', 'satellite', 'geo', NULL, '{L}', 'SK', 'c2', NULL, 'skylo_devices', true),
  ('6e570000-0000-4000-8000-000000000011', 'airtel', 'Bharti Airtel', 'terrestrial_mobile', NULL, NULL, '{900,1800,2100,2300,3300}', 'AT', 'c5', 'airtel', NULL, true),
  ('6e570000-0000-4000-8000-000000000012', 'jio', 'Reliance Jio', 'terrestrial_mobile', NULL, NULL, '{800,1800,2300,3300,26000}', 'JI', 'c1', 'jio', NULL, true),
  ('6e570000-0000-4000-8000-000000000013', 'vi', 'Vodafone Idea (Vi)', 'terrestrial_mobile', NULL, NULL, '{900,1800,2100,2500,3300}', 'VI', 'c6', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000014', 'bsnl', 'BSNL', 'terrestrial_mobile', NULL, NULL, '{900,2100}', 'BS', 'c4', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000015', 'act_fibernet', 'ACT Fibernet', 'terrestrial_fixed', NULL, NULL, '{fibre}', 'AC', 'c7', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000021', 'indus_towers', 'Indus Towers', 'tower_operator', NULL, NULL, '{}', 'IT', 'c8', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000031', 'celestrak', 'CelesTrak orbital data', 'public_reference', NULL, NULL, '{}', 'CT', 'c2', NULL, 'celestrak_gp', true),
  ('6e570000-0000-4000-8000-000000000032', 'opencellid', 'OpenCelliD', 'public_reference', NULL, NULL, '{}', 'OC', 'c3', NULL, 'opencellid_api', true),
  ('6e570000-0000-4000-8000-000000000033', 'space_track', 'Space-Track.org', 'public_reference', NULL, NULL, '{}', 'ST', 'c4', NULL, NULL, true),
  ('6e570000-0000-4000-8000-000000000034', 'trai_myspeed', 'TRAI MySpeed / Analytics', 'public_reference', NULL, NULL, '{}', 'TR', 'c5', NULL, 'trai_analytics', true),
  ('6e570000-0000-4000-8000-000000000035', 'ndma_sachet', 'NDMA SACHET (CAP alerts)', 'public_reference', NULL, NULL, '{}', 'SA', 'c6', NULL, 'ndma_sachet', true)
ON CONFLICT DO NOTHING;

INSERT INTO network_asset (id, provider_id, asset_type, label, latitude, longitude) VALUES
  ('6e57a000-0000-4000-8000-000000000001', '6e570000-0000-4000-8000-000000000001', 'constellation', 'Starlink constellation (reference)', NULL, NULL),
  ('6e57a000-0000-4000-8000-000000000002', '6e570000-0000-4000-8000-000000000002', 'constellation', 'OneWeb constellation (reference)', NULL, NULL),
  ('6e57a000-0000-4000-8000-000000000003', '6e570000-0000-4000-8000-000000000003', 'constellation', 'NavIC constellation (reference)', NULL, NULL),
  ('6e57a000-0000-4000-8000-000000000004', '6e570000-0000-4000-8000-000000000008', 'constellation', 'Iridium NEXT constellation (reference)', NULL, NULL),
  ('6e57a000-0000-4000-8000-000000000011', '6e570000-0000-4000-8000-000000000021', 'tower', 'Synthetic tower 1, Hyderabad rehearsal', 17.38500, 78.48670),
  ('6e57a000-0000-4000-8000-000000000012', '6e570000-0000-4000-8000-000000000021', 'tower', 'Synthetic tower 2, Hyderabad rehearsal', 17.44000, 78.49800),
  ('6e57a000-0000-4000-8000-000000000013', '6e570000-0000-4000-8000-000000000021', 'tower', 'Synthetic tower 3, Hyderabad rehearsal', 17.36100, 78.47400),
  ('6e57a000-0000-4000-8000-000000000014', '6e570000-0000-4000-8000-000000000011', 'tower', 'Synthetic tower 4, Hyderabad rehearsal', 17.44900, 78.38100),
  ('6e57a000-0000-4000-8000-000000000015', '6e570000-0000-4000-8000-000000000012', 'tower', 'Synthetic tower 5, Hyderabad rehearsal', 17.50400, 78.54200),
  ('6e57a000-0000-4000-8000-000000000016', '6e570000-0000-4000-8000-000000000014', 'tower', 'Synthetic tower 6, Hyderabad rehearsal', 17.24000, 78.42900),
  ('6e57a000-0000-4000-8000-000000000021', '6e570000-0000-4000-8000-000000000002', 'gateway', 'Synthetic satellite gateway A, rehearsal', 17.33000, 78.55000),
  ('6e57a000-0000-4000-8000-000000000022', '6e570000-0000-4000-8000-000000000006', 'gateway', 'Synthetic satellite gateway B, rehearsal', 17.47000, 78.33000)
ON CONFLICT DO NOTHING;
