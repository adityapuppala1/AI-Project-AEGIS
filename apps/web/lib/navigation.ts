// The one list of pages. Related pages are grouped under one menu entry as tabs, which keeps the menu short. The side navigation and the Ctrl+K search both read it, so they cannot drift apart.
import {
  Activity, Archive, BarChart3, BookOpenCheck, BrainCircuit, ClipboardCheck, ClipboardList, Gauge, Globe2, GraduationCap, Inbox, Info, LayoutDashboard,
  KeyRound, LifeBuoy, ListChecks, MessagesSquare, Plug, Radar, RadioTower, Rocket, Route, Satellite, Settings2, UsersRound, Workflow, type LucideIcon,
} from "lucide-react";

/** The six steps of the alert chain. Pages that serve one step say so; support pages carry none. */
export const CHAIN = ["Sense", "Predict", "Decide", "Hand over", "Reach", "Learn"] as const;
export type ChainStep = (typeof CHAIN)[number];
export type NavPage = { href: string; label: string; description: string; icon: LucideIcon; chain?: ChainStep };
// A menu entry. Closely related pages share one entry and appear as tabs at the top of the page (the entry itself first).
export type NavItem = NavPage & { tabs?: NavPage[] };
export type NavGroup = { label: string; items: NavItem[] };

/** Which chain steps a menu group serves, shown beside the group name as wayfinding. */
export const GROUP_CHAIN: Record<string, readonly ChainStep[]> = { Observe: ["Sense", "Predict"], Coordinate: ["Decide", "Hand over", "Reach"], Govern: ["Learn"] };

export const navigation: NavGroup[] = [
  { label: "Overview", items: [
    { href: "/", label: "Command Center", description: "System overview and geospatial map", icon: LayoutDashboard },
    { href: "/about", label: "About AEGIS", description: "What AEGIS is, why it was built and how an alert travels", icon: Info },
    { href: "/demo", label: "Exercise Walkthrough", description: "Step-by-step guided exercise", icon: Route },
    { href: "/alert-journey", label: "Alert Journey", description: "3D story of an alert, and live public Earth data", icon: Satellite },
  ]},
  { label: "Observe", items: [
    { chain: "Sense", href: "/incidents", label: "Incident Registry", description: "Search, sort and filter exercise incidents", icon: Activity },
    { chain: "Sense", href: "/sources", label: "Source Freshness", description: "Inspect delayed and missing synthetic data feeds", icon: RadioTower, tabs: [
      { chain: "Sense", href: "/sources", label: "Source Freshness", description: "Inspect delayed and missing synthetic data feeds", icon: RadioTower },
      { chain: "Sense", href: "/ingestion", label: "DataFusion Replay", description: "Review synthetic ingestion, duplicates and quarantine", icon: Workflow },
    ] },
    { chain: "Sense", href: "/watch", label: "Hazard Watch", description: "Hazard triggers that need a human look", icon: Radar, tabs: [
      { chain: "Sense", href: "/watch", label: "Hazard Watch", description: "Hazard triggers that need a human look", icon: Radar },
      { chain: "Sense", href: "/earth-watch", label: "Earth Watch", description: "Public earthquakes, natural events and satellite imagery", icon: Globe2 },
    ] },
    { chain: "Sense", href: "/public-intake", label: "Public Intake", description: "Citizen reports held for review", icon: Inbox },
    { chain: "Predict", href: "/model-lab", label: "Model Evaluation Lab", description: "Synthetic holdout metrics, calibration and limitations", icon: BrainCircuit },
  ]},
  { label: "Coordinate", items: [
    { chain: "Decide", href: "/approvals", label: "Approval Workbench", description: "Authenticated maker-checker workflow", icon: ClipboardCheck },
    { chain: "Reach", href: "/department-tasks", label: "Department Inbox", description: "Approved tasks for your department", icon: ListChecks },
    { chain: "Reach", href: "/agency-sync", label: "AgencySync Tasks", description: "Fictional acknowledgements and department timelines", icon: UsersRound, tabs: [
      { chain: "Reach", href: "/agency-sync", label: "AgencySync Tasks", description: "Fictional acknowledgements and department timelines", icon: UsersRound },
      { chain: "Reach", href: "/response-teams", label: "Team Availability", description: "Workload of each response desk", icon: Gauge },
    ] },
    { href: "/handover", label: "Shift Handover", description: "What changed since the last shift, with sources", icon: ClipboardList },
    { href: "/copilot", label: "Operator Copilot", description: "Ask questions about agency records, read-only", icon: MessagesSquare },
    { chain: "Learn", href: "/drills", label: "Exercise Drills", description: "Timed tabletop drills", icon: GraduationCap },
  ]},
  { label: "Govern", items: [
    { chain: "Learn", href: "/audit", label: "Audit360 Export", description: "Download bounded synthetic case provenance and checksum", icon: Archive },
    { chain: "Decide", href: "/playbooks", label: "Response Playbooks", description: "Emergency exercise procedures", icon: BookOpenCheck },
    { chain: "Learn", href: "/learning", label: "Post-event Learning", description: "Compare estimates with outcomes and propose changes", icon: BarChart3 },
    { href: "/help", label: "Help & Learning", description: "Guides, shortcuts and troubleshooting", icon: LifeBuoy },
    { href: "/admin", label: "Administration", description: "Server policy and safety switches", icon: Settings2, tabs: [
      { href: "/admin", label: "Administration", description: "Server policy and safety switches", icon: Settings2 },
      { href: "/admin/connectors", label: "Connectors", description: "Enter data-source keys and switch connectors on", icon: Plug },
      { href: "/admin/users", label: "Users and access", description: "Roles, what each can do, and who is signed in", icon: KeyRound },
      { href: "/admin/go-live", label: "Go-Live Setup", description: "Every key, switch and agreement needed before real use", icon: Rocket },
    ] },
  ]},
];

/** Every page, including the ones shown as tabs, for search. */
export const allPages: NavPage[] = navigation.flatMap(group => group.items.flatMap(item => item.tabs ?? [item]));

const under = (pathname: string, href: string) => href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
/** The menu entry a path belongs to, and the tab within it if the entry has tabs. The most specific match wins. */
export function locate(pathname: string): { group: string; item: NavItem; tab: NavPage | null } | null {
  let best: { group: string; item: NavItem; tab: NavPage | null; length: number } | null = null;
  for (const group of navigation) for (const item of group.items) for (const page of item.tabs ?? [item]) {
    if (under(pathname, page.href) && (!best || page.href.length > best.length)) best = { group: group.label, item, tab: item.tabs ? page : null, length: page.href.length };
  }
  return best && { group: best.group, item: best.item, tab: best.tab };
}
