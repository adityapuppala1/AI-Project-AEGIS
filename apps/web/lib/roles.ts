// Roles in plain words, and what each role can do. This file is a READ-ONLY DESCRIPTION for the interface (the
// account menu, the "Users and access" page and the side navigation). It is never the control: every route keeps its
// own server-side check. Each row names the file whose rule it describes, and scripts/tests/roles.test.cjs compares
// the rows with those files so the description cannot drift from the real rules. No React or DOM imports.

export const ROLE_IDS = ["incident_operator", "incident_checker", "incident_auditor", "department_operator", "platform_admin"] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export const isRoleId = (value: unknown): value is RoleId => typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);

export type RoleTone = "maker" | "checker" | "auditor" | "department" | "admin";
export interface RoleInfo { id: RoleId; label: string; tone: RoleTone; summary: string }

export const ROLE_INFO: Record<RoleId, RoleInfo> = {
  incident_operator: { id: "incident_operator", label: "Maker", tone: "maker", summary: "Drafts and submits proposals, runs the hazard watch and starts drills. Cannot approve." },
  incident_checker: { id: "incident_checker", label: "Checker", tone: "checker", summary: "Approves or rejects what a different person submitted. Cannot draft or submit." },
  incident_auditor: { id: "incident_auditor", label: "Auditor", tone: "auditor", summary: "Reads proposals, decisions and their audit trail. Cannot change anything." },
  department_operator: { id: "department_operator", label: "Department desk", tone: "department", summary: "Works the approved tasks of one department. Sees no other department's tasks." },
  platform_admin: { id: "platform_admin", label: "Administrator", tone: "admin", summary: "Sets up connectors and holds the kill switch. Cannot draft, submit or approve proposals." },
};

// When a person holds several roles, the menu leads with the one that carries the most responsibility.
const PRECEDENCE: RoleId[] = ["platform_admin", "incident_checker", "incident_operator", "incident_auditor", "department_operator"];
export function knownRoles(roles: readonly string[] | null | undefined): RoleId[] {
  const held = (roles ?? []).filter(isRoleId);
  return PRECEDENCE.filter(role => held.includes(role));
}
export function primaryRole(roles: readonly string[] | null | undefined): RoleId | null {
  return knownRoles(roles)[0] ?? null;
}

const ALL: RoleId[] = [...ROLE_IDS];
const READERS: RoleId[] = ["incident_operator", "incident_checker", "incident_auditor", "platform_admin"];

export type CapabilityGroup = "Sense and predict" | "Decide" | "Hand over and reach" | "Learn" | "Administer";
export interface Capability { id: string; group: CapabilityGroup; label: string; roles: RoleId[]; rule: string }

/** The permission matrix. `rule` is the file that enforces the row. */
export const CAPABILITIES: Capability[] = [
  { id: "read_exercise_records", group: "Sense and predict", label: "Open the Command Center, incidents, sources, model lab and audit export (the exercise agency only)", roles: ALL, rule: "middleware.ts" },
  { id: "read_watch", group: "Sense and predict", label: "Read the Hazard Watch and its history", roles: ALL, rule: "lib/proactive-proxy.ts" },
  { id: "refresh_watch", group: "Sense and predict", label: "Refresh the Hazard Watch", roles: ["incident_operator", "platform_admin"], rule: "lib/proactive-proxy.ts" },
  { id: "run_proactive", group: "Sense and predict", label: "Start, advance or cancel a proactive run", roles: ["incident_operator"], rule: "lib/proactive-proxy.ts" },
  { id: "read_scheduler", group: "Sense and predict", label: "See the scheduler status", roles: READERS, rule: "lib/proactive-proxy.ts" },
  { id: "read_forecast", group: "Sense and predict", label: "See the optional statistical forecast (display only)", roles: READERS, rule: "app/api/forecast/route.ts" },
  { id: "read_proposals", group: "Decide", label: "Read proposals and their audit trail", roles: ["incident_operator", "incident_checker", "incident_auditor"], rule: "lib/proposal-proxy.ts" },
  { id: "make_proposal", group: "Decide", label: "Draft and submit a proposal, simulate it, prepare tasks and run bounded assistance", roles: ["incident_operator"], rule: "lib/proposal-proxy.ts" },
  { id: "check_proposal", group: "Decide", label: "Approve or reject a submitted proposal (never one's own)", roles: ["incident_checker"], rule: "lib/proposal-proxy.ts" },
  { id: "department_inbox", group: "Hand over and reach", label: "Work the Department Inbox (own department only)", roles: ["department_operator"], rule: "lib/department-proxy.ts" },
  { id: "read_assist", group: "Hand over and reach", label: "Read the shift handover brief and ask the copilot (read-only)", roles: READERS, rule: "lib/assist-proxy.ts" },
  { id: "read_learning", group: "Learn", label: "Read post-event learning and drills", roles: READERS, rule: "lib/learning-proxy.ts" },
  { id: "propose_threshold", group: "Learn", label: "Propose a threshold change, start and run a drill", roles: ["incident_operator"], rule: "lib/learning-proxy.ts" },
  { id: "respond_drill", group: "Learn", label: "Respond in a drill", roles: ["incident_operator", "incident_checker"], rule: "lib/learning-proxy.ts" },
  { id: "review_threshold", group: "Learn", label: "Review a threshold proposal (never one's own)", roles: ["incident_checker", "platform_admin"], rule: "lib/learning-proxy.ts" },
  { id: "apply_threshold", group: "Learn", label: "Apply an approved threshold overlay", roles: ["platform_admin"], rule: "lib/learning-proxy.ts" },
  { id: "read_pause", group: "Administer", label: "See whether the kill switch is engaged", roles: ALL, rule: "lib/proactive-proxy.ts" },
  { id: "set_pause", group: "Administer", label: "Engage or release the kill switch", roles: ["platform_admin"], rule: "lib/proactive-proxy.ts" },
  { id: "connectors", group: "Administer", label: "View, change and test connector settings", roles: ["platform_admin"], rule: "lib/proactive-proxy.ts" },
];
export const CAPABILITY_GROUPS: CapabilityGroup[] = ["Sense and predict", "Decide", "Hand over and reach", "Learn", "Administer"];
export const can = (capability: string, roles: readonly string[] | null | undefined): boolean =>
  CAPABILITIES.some(item => item.id === capability && item.roles.some(role => (roles ?? []).includes(role)));

// Pages whose main content needs a particular role. Pages not listed here open for every signed-in role.
const PAGE_CAPABILITY: Record<string, string> = {
  "/approvals": "read_proposals", "/department-tasks": "department_inbox", "/handover": "read_assist", "/copilot": "read_assist",
  "/learning": "read_learning", "/drills": "read_learning", "/admin/connectors": "connectors",
};
/** Roles that can use a page, or null when any signed-in role can. */
export function pageRoles(href: string): RoleId[] | null {
  const capability = PAGE_CAPABILITY[href];
  return capability ? CAPABILITIES.find(item => item.id === capability)?.roles ?? null : null;
}
/** Convenience for menus only. An unknown role list (session still loading) is treated as "show everything". */
export function canOpenPage(href: string, roles: readonly string[] | null | undefined): boolean {
  const needed = pageRoles(href);
  if (!needed || !roles) return true;
  return needed.some(role => roles.includes(role));
}
export const GATED_PAGES: readonly string[] = Object.keys(PAGE_CAPABILITY);
