// The one list of pages. The side navigation and the Ctrl+K search both read it, so they cannot drift apart.
import {
  Activity, Archive, BarChart3, BookOpenCheck, BrainCircuit, ClipboardCheck, ClipboardList, Gauge, Globe2, GraduationCap, Inbox, Info, LayoutDashboard,
  LifeBuoy, ListChecks, MessagesSquare, Plug, Radar, RadioTower, Rocket, Route, Satellite, Settings2, UsersRound, Workflow, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; description: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  { label: "Overview", items: [
    { href: "/", label: "Command Center", description: "System overview and geospatial map", icon: LayoutDashboard },
    { href: "/welcome", label: "About AEGIS", description: "What AEGIS is, why it was built and how an alert travels", icon: Info },
    { href: "/demo", label: "Exercise Walkthrough", description: "Step-by-step guided exercise", icon: Route },
    { href: "/alert-journey", label: "Alert Journey", description: "3D story of an alert, and live public Earth data", icon: Satellite },
  ]},
  { label: "Observe", items: [
    { href: "/incidents", label: "Incident Registry", description: "Search, sort and filter exercise incidents", icon: Activity },
    { href: "/sources", label: "Source Freshness", description: "Inspect delayed and missing synthetic data feeds", icon: RadioTower },
    { href: "/earth-watch", label: "Earth Watch", description: "Public earthquakes, natural events and satellite imagery", icon: Globe2 },
    { href: "/watch", label: "Hazard Watch", description: "Hazard triggers that need a human look", icon: Radar },
    { href: "/public-intake", label: "Public Intake", description: "Citizen reports held for review", icon: Inbox },
    { href: "/ingestion", label: "DataFusion Replay", description: "Review synthetic ingestion, duplicates and quarantine", icon: Workflow },
    { href: "/model-lab", label: "Model Evaluation Lab", description: "Synthetic holdout metrics, calibration and limitations", icon: BrainCircuit },
  ]},
  { label: "Coordinate", items: [
    { href: "/approvals", label: "Approval Workbench", description: "Authenticated maker-checker workflow", icon: ClipboardCheck },
    { href: "/department-tasks", label: "Department Inbox", description: "Approved tasks for your department", icon: ListChecks },
    { href: "/response-teams", label: "Team Availability", description: "Workload of each response desk", icon: Gauge },
    { href: "/agency-sync", label: "AgencySync Tasks", description: "Fictional acknowledgements and department timelines", icon: UsersRound },
    { href: "/handover", label: "Shift Handover", description: "What changed since the last shift, with sources", icon: ClipboardList },
    { href: "/copilot", label: "Operator Copilot", description: "Ask questions about agency records, read-only", icon: MessagesSquare },
    { href: "/drills", label: "Exercise Drills", description: "Timed tabletop drills", icon: GraduationCap },
  ]},
  { label: "Govern", items: [
    { href: "/audit", label: "Audit360 Export", description: "Download bounded synthetic case provenance and checksum", icon: Archive },
    { href: "/playbooks", label: "Response Playbooks", description: "Emergency exercise procedures", icon: BookOpenCheck },
    { href: "/learning", label: "Post-event Learning", description: "Compare estimates with outcomes and propose changes", icon: BarChart3 },
    { href: "/help", label: "Help & Learning", description: "Guides, shortcuts and troubleshooting", icon: LifeBuoy },
    { href: "/admin", label: "Administration", description: "Server policy and safety switches", icon: Settings2 },
    { href: "/admin/connectors", label: "Connectors", description: "Enter data-source keys and switch connectors on", icon: Plug },
    { href: "/admin/go-live", label: "Go-Live Setup", description: "Every key, switch and agreement needed before real use", icon: Rocket },
  ]},
];

export const allPages: NavItem[] = navigation.flatMap(group => group.items);
