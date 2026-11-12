/** The five invented response teams (services/api/app/fixtures/synthetic_teams.v1.json). Not real units.
 * Shared allowlist for the signed `aegis_team_id` claim; scripts/tests/response-teams.test.cjs keeps it equal
 * to the API fixture. Display labels only; the API stays the control. */
export const RESPONSE_TEAMS = [
  { id: "syn-team-rescue-01", label: "Synthetic rescue team 01", kind: "rescue" },
  { id: "syn-team-rescue-02", label: "Synthetic rescue team 02", kind: "rescue" },
  { id: "syn-team-health-01", label: "Synthetic medical team 01", kind: "health" },
  { id: "syn-team-fire-01", label: "Synthetic fire team 01", kind: "rescue" },
  { id: "syn-team-municipal-01", label: "Synthetic municipal works team 01", kind: "municipal" },
] as const;
export type ResponseTeamId = (typeof RESPONSE_TEAMS)[number]["id"];
export const RESPONSE_TEAM_IDS: readonly string[] = RESPONSE_TEAMS.map(team => team.id);
export function isResponseTeamId(value: unknown): value is ResponseTeamId {
  return typeof value === "string" && RESPONSE_TEAM_IDS.includes(value);
}
export function responseTeamLabel(id: string): string | undefined {
  return RESPONSE_TEAMS.find(team => team.id === id)?.label;
}
