// Network Identifier Master types and pure helpers (docs/NETWORK_IDENTIFIER_MASTER.md). No network, no React.
// Callers: components/network-master/*, components/sensor-link.tsx, scripts/tests/network-master.test.cjs.
// Rehearsal link states are synthetic values set by an administrator. They only name the Resilient Sensor Link lanes and
// choose its starting scenario; they are never a measurement of any provider's network.
import type { ScenarioId } from "./patent";

export type ProviderKind = "satellite" | "terrestrial_mobile" | "terrestrial_fixed" | "tower_operator" | "public_reference";
export type RehearsalState = "up" | "degraded" | "down";
export type LogoKey = "spacex" | "airtel" | "jio";
export type ColourToken = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8";

export interface Provider {
  id: string; code: string; display_name: string; kind: ProviderKind; orbit_class: string | null; constellation_group: string | null;
  mcc_mnc: string[]; asn: number[]; bands: string[]; monogram: string; colour_token: ColourToken; logo_key: LogoKey | null;
  notes: string | null; doc_link_id: string | null; enabled: boolean; is_reference: boolean; rehearsal_state: RehearsalState;
  rehearsal_capacity_kbps: number; credential_fingerprint: string | null; has_credential: boolean; version: number;
  updated_at: string; updated_by: string | null; deleted_at: string | null;
}
export interface Asset {
  id: string; provider_id: string; asset_type: string; label: string; norad_id: number | null; latitude: number | null; longitude: number | null;
  synthetic: boolean; enabled: boolean; version: number; deleted_at: string | null;
}
export interface DocLink { kind: "api_docs" | "partner_portal" | "spec_document"; url: string; summary: string; access: string; sdk: { name: string; licence: string; url: string } | null }
export interface Catalogue { verified_on: string; links: Record<string, DocLink>; logo_keys: LogoKey[]; kinds: ProviderKind[]; orbit_classes: string[]; groups: string[]; bands: string[]; colours: ColourToken[]; asset_types: string[]; states: RehearsalState[] }
export interface Registry { providers: Provider[]; assets: Asset[]; catalogue: Catalogue; credential_store_ready: boolean; reference_adapter: { available: boolean; reason: string } }
export interface AuditRow { id: string; at: string; actor: string; entity: "provider" | "asset"; entity_id: string; action: string; from_version: number | null; to_version: number; changed_fields: string[] }
export interface Lane { code: string; display_name: string; kind: ProviderKind; monogram: string; colour_token: ColourToken; logo_key: LogoKey | null; rehearsal_state: RehearsalState; rehearsal_capacity_kbps: number }

/** Chip colours: white text on each passes WCAG AA (4.5:1) in light and dark themes. */
export const COLOURS: Record<ColourToken, string> = {
  c1: "#1d4ed8", c2: "#0f766e", c3: "#b45309", c4: "#7e22ce", c5: "#be123c", c6: "#334155", c7: "#15803d", c8: "#9a3412",
};

export const KIND_LABEL: Record<ProviderKind, string> = {
  satellite: "Satellite network", terrestrial_mobile: "Mobile network", terrestrial_fixed: "Fixed-line network",
  tower_operator: "Tower company", public_reference: "Public reference source",
};
export const STATE_LABEL: Record<RehearsalState, string> = { up: "Up (rehearsal)", degraded: "Degraded (rehearsal)", down: "Down (rehearsal)" };
export const DOC_KIND_LABEL: Record<DocLink["kind"], string> = {
  api_docs: "Public API documentation", partner_portal: "Partner portal or account needed", spec_document: "Published interface document",
};
export const SATELLITE_KINDS: readonly ProviderKind[] = ["satellite"];
export const TERRESTRIAL_KINDS: readonly ProviderKind[] = ["terrestrial_mobile", "terrestrial_fixed"];

export const isSatellite = (kind: ProviderKind) => kind === "satellite";
export const isTerrestrial = (kind: ProviderKind) => kind === "terrestrial_mobile" || kind === "terrestrial_fixed";

/** The provider that names each Sensor Link lane: the first enabled one of each family, in the order given. */
export function laneProviders(lanes: readonly Lane[]): { ground: Lane | null; satellite: Lane | null } {
  return { ground: lanes.find(lane => isTerrestrial(lane.kind)) ?? null, satellite: lanes.find(lane => isSatellite(lane.kind)) ?? null };
}

/** The Sensor Link scenario the configured rehearsal states describe. No configured provider: Normal. */
export function scenarioFromLanes(lanes: readonly Lane[]): ScenarioId {
  const { ground, satellite } = laneProviders(lanes);
  const g = ground?.rehearsal_state ?? "up", s = satellite?.rehearsal_state ?? "up";
  // The five Sensor Link scenarios only reduce the satellite once the ground link is cut, so a satellite problem while
  // the ground link works has no matching scenario; Normal (or Ground degraded) is shown and the page says so.
  if (g === "down") return s === "down" ? "both_down" : s === "degraded" ? "satellite_reduced" : "ground_cut";
  if (g === "degraded") return "ground_degraded";
  return "normal";
}

/** True when the configured satellite state is not shown by the chosen scenario (the ground link still works). */
export function satelliteStateUnshown(lanes: readonly Lane[]): boolean {
  const { ground, satellite } = laneProviders(lanes);
  return (ground?.rehearsal_state ?? "up") !== "down" && (satellite?.rehearsal_state ?? "up") !== "up";
}

/** Build-time form checks mirrored from the API (the server stays the control). */
export const CODE_PATTERN = /^[a-z0-9_]{2,40}$/;
export const MONOGRAM_PATTERN = /^[A-Z0-9]{1,3}$/;
export const MCC_MNC_PATTERN = /^[0-9]{3}-[0-9]{2,3}$/;
export function monogramFor(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const out = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "N").slice(0, 2);
  return out.slice(0, 3);
}
