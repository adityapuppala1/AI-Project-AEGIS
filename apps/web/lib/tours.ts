// The content of the guided tours: one Welcome tour for the shell and one tour per page and tab. Pure data plus a few
// pure helpers, no React or DOM imports (the engine is components/tour/). Each step points at an element by its
// data-tour attribute (never a CSS path). scripts/tests/tours.test.cjs checks that every route has a tour, every target
// exists in the components, every role sees at least one step on every page of its menu, and that no step promises a real
// warning, dispatch or forecast accuracy.
//
// Wording rules: say in one or two plain sentences what a thing is and how it is used; for a control some roles cannot
// use, say who can. This is a description only: lib/roles.ts and the server routes stay the control, and the closing
// "never" step of every page is taken word for word from lib/page-help.ts so the two cannot disagree.
import { ROLE_IDS, canOpenPage, knownRoles, pageRoles, type RoleId } from "./roles";
import { navigation, type NavPage } from "./navigation";
import { PAGE_HELP } from "./page-help";

export interface TourStep {
  id: string;
  /** The data-tour value of the element to point at. No target means a centred card. */
  target?: string;
  title: string;
  body: string;
  /** Shown only to people who hold at least one of these roles. No list means everyone. */
  roles?: readonly RoleId[];
  /** A different body for a role. The first match in the person's role order wins. */
  bodyByRole?: Partial<Record<RoleId, string>>;
  /** Shown only to roles that cannot open the page, in place of the page's own steps. */
  refusal?: boolean;
}
export interface Tour { id: string; title: string; route?: string; /** Roles that can use the page when lib/roles.ts has no entry for it (the brand page checks the role itself). */ needs?: readonly RoleId[]; /** The page has no app shell (full-screen story), so no tour can run on it. */ noShell?: boolean; steps: TourStep[] }
export interface ResolvedStep { id: string; target?: string; title: string; body: string }

const OP: RoleId = "incident_operator", CK: RoleId = "incident_checker", AU: RoleId = "incident_auditor", DE: RoleId = "department_operator", TM: RoleId = "response_team", AD: RoleId = "platform_admin";

const purpose = (body: string, bodyByRole?: Partial<Record<RoleId, string>>): TourStep => ({ id: "purpose", target: "page-header", title: "What this page is for", body, bodyByRole });
const tabs = (body: string): TourStep => ({ id: "tabs", target: "page-tabs", title: "The tabs on this page", body });
const neverFrom = (helpRoute: string): TourStep => ({
  id: "never", target: "page-help", title: "What it will never do",
  body: `${PAGE_HELP[helpRoute].never} "How this page works" lists what the page shows, what you can do and what it never does.`,
});
const refusal = (body: string): TourStep => ({ id: "refusal", target: "permission-state", title: "Why you cannot open this page", body, refusal: true });
const step = (id: string, target: string, title: string, body: string, extra: Partial<TourStep> = {}): TourStep => ({ id, target, title, body, ...extra });

export const WELCOME_TOUR_ID = "welcome";

export const TOURS: readonly Tour[] = [
  {
    id: WELCOME_TOUR_ID, title: "Welcome tour",
    steps: [
      step("menu", "nav-groups", "The menu follows an alert", "The groups run in the order an alert travels: Overview, then Observe (sense and predict), Coordinate (decide, hand over, reach) and Govern (learn). Related pages share one entry and appear as tabs at the top of the page.",
        { bodyByRole: { response_team: "The menu follows an alert, but your account works mainly in My Team under Coordinate. Entries your role cannot use are collected at the end under For other roles, each saying which role it needs.", department_operator: "The menu follows an alert, and your desk works mainly in Department Inbox under Coordinate. Entries your role cannot use are collected at the end under For other roles, each saying which role it needs." } }),
      step("find", "nav-find", "Find a page", "Type part of a page name to narrow the menu, press Enter to open the first match, or press the slash key from anywhere to jump here. Names match in the language you chose."),
      step("search", "topbar-search", "Search anything", "Opens a search box for pages and exercise incidents. Press Ctrl+K (Command+K on a Mac) from any page. It does not search private agency data."),
      step("language", "topbar-language", "Language", "Choose English, Telugu or Hindi. Text that has no reviewed translation yet stays in English instead of being machine-translated."),
      step("theme", "topbar-theme", "Light and dark theme", "Switches the whole interface between light and dark. The choice is remembered in this browser."),
      step("strip", "desk-strip", "The EXERCISE strip", "A standing reminder that this is a rehearsal on synthetic data. No real warning is issued, nobody is dispatched and no outside agency is contacted from IndTrana. It also shows the exercise node and the time in India."),
      step("account", "account-menu", "Your account", "Shows who you are signed in as, your role and your agency. The same menu holds Tours (this tour, a tour of the page you are on, or a tour of all your pages), What's new and Sign out."),
      step("help", "page-help", "How this page works", "Every page has this short block: what the page shows, what you can do, and what it will never do. Open it whenever you are unsure, or use Take the tour for a guided look at the page."),
    ],
  },
  {
    id: "page:/", route: "/", title: "Command Center",
    steps: [
      purpose("The Command Center is the home page of the exercise desk: a map and a queue of exercise incidents with the signals around them. Start here, then open a case to read its evidence."),
      step("map", "cc-map", "Geospatial overview", "Each marker is one synthetic exercise incident. Switch between the flat 2D map and the schematic 3D view. Markers are symbols, not flood extent or severity."),
      step("queue", "cc-queue", "Incident queue", "The same incidents as a list that works with a keyboard and a screen reader. Pick one to see its evidence summary, then open the full case."),
      step("telemetry", "cc-telemetry", "Hazard telemetry", "A synthetic rainfall trend with its values in a table. It is exercise data, not a weather forecast."),
      step("readiness", "cc-readiness", "Response readiness", "A summary of how fresh the sources are and how loaded each desk is, so you can tell before you start whether the picture is complete."),
      neverFrom("/"),
    ],
  },
  {
    id: "page:/about", route: "/about", title: "About IndTrana",
    steps: [
      purpose("A plain explanation of what IndTrana is for, how an alert travels, and where this exercise build stops."),
      step("steps", "about-steps", "The six steps of an alert", "Sense, Predict, Decide, Hand over, Reach and Learn. Each page in the menu serves one of these steps and shows its place under its title."),
      step("stops", "about-stops", "Where IndTrana stops", "Lists what happens outside IndTrana, such as issuing a public warning or sending responders. Those stay with the alerting authority and the agencies themselves."),
      step("limits", "about-limits", "Limits of this exercise build", "Read this before relying on any figure. Everything here is rehearsal on synthetic data."),
      neverFrom("/about"),
    ],
  },
  {
    id: "page:/demo", route: "/demo", title: "Exercise Walkthrough",
    steps: [
      purpose("A guided walk through one exercise from evidence to an approved draft, in order, with links to each page as you reach it."),
      step("diagnostics", "demo-diagnostics", "Local dependency diagnostics", "Checks the local services the exercise depends on and says which one is missing if something is wrong. A passing check is not proof of readiness for real use."),
      step("risk", "demo-risk", "Hazard-index calculator", "Enter synthetic values to see how an index is worked out. It illustrates the arithmetic only and is not a forecast."),
      neverFrom("/demo"),
    ],
  },
  {
    id: "page:/alert-journey", route: "/alert-journey", title: "Alert Journey", noShell: true,
    steps: [
      { id: "standalone", title: "A full-screen story", body: "Alert Journey is a full-screen 3D story of how an alert travels, with its own controls and a way back to the menu. It is an exercise story on synthetic data, and the optional live public Earth data is display only." },
    ],
  },
  {
    id: "page:/incidents", route: "/incidents", title: "Incident Registry",
    steps: [
      purpose("Every exercise incident in one searchable list. This is where you find a case before you read its evidence."),
      step("list", "registry-list", "Incident records", "Search by hazard or incident reference, filter by status, sort by any column heading and change how many rows show. Press Enter on a case name to open it."),
      step("selected", "registry-selected", "Selected case", "Hover over or focus a row to preview the case here without leaving the list."),
      neverFrom("/incidents"),
    ],
  },
  {
    id: "page:/incidents/[id]", route: "/incidents/[id]", title: "Incident case",
    steps: [
      purpose("One synthetic case: where it is, what evidence it rests on, what happened and when, and whether the evidence is ready for a human assessment."),
      step("overview", "case-overview", "Case overview", "The hazard, status and the time the case was opened, with a button to copy the case reference. Every case is labelled as a synthetic exercise."),
      step("tabs", "case-tabs", "Overview, Evidence, Timeline and Readiness", "Overview shows the map and the interpretation. Evidence and provenance lists each source record and where it came from. Timeline is the recorded sequence of events. Readiness checks whether the evidence is enough for a person to assess."),
      step("readiness", "case-readiness", "Human assessment readiness", "A checklist of the evidence a person would want before assessing the case. It prepares a human review and does not decide anything."),
      step("team", "case-team", "Team response", "Shows the exercise team requests that department desks made for this case. It is read-only here; requests are made from the Department Inbox."),
      neverFrom("/incidents"),
    ],
  },
  {
    id: "page:/sources", route: "/sources", title: "Source Freshness",
    steps: [
      purpose("Shows how fresh each synthetic data feed is, so you know which ones to trust today and which are late or missing."),
      tabs("Source Freshness is the feed list. DataFusion Replay shows how a batch of records was accepted, de-duplicated or set aside."),
      step("registry", "sources-registry", "Source registry", "Search or filter the feeds by health, then select one to see its details."),
      step("detail", "sources-detail", "Source detail and trends", "For the selected feed: its recent history, delay and quality notes. Two feeds agreeing is not proof that either is right."),
      neverFrom("/sources"),
    ],
  },
  {
    id: "page:/ingestion", route: "/ingestion", title: "DataFusion Replay",
    steps: [
      purpose("Shows one synthetic ingestion run: what was accepted, what was a duplicate and what was set aside, and why."),
      tabs("Source Freshness shows each feed's timeliness. DataFusion Replay, this page, shows how records moved through ingestion."),
      step("flow", "ingestion-flow", "How a replay moves through DataFusion", "The stages a record passes through, from arriving to being accepted, de-duplicated or quarantined."),
      step("quarantine", "ingestion-quarantine", "Quarantine reasons", "Counts of records set aside and the reason for each. The rejected raw content is never displayed."),
      step("replay", "ingestion-replay", "Reproducible local replay", "The command that repeats the replay on a local machine, so the numbers can be checked."),
      neverFrom("/ingestion"),
    ],
  },
  {
    id: "page:/sensor-link", route: "/sensor-link", title: "Resilient Sensor Link",
    steps: [
      purpose("A rehearsal of how sensor readings could share an internet link and a satellite link when bandwidth is scarce, with the most important readings served first."),
      step("scenario", "sensor-scenario", "Sensor traffic across two links", "Step through the five-point storm timeline, or choose a link scenario yourself. The picture, the status sentence and the tables change together."),
      step("sensors", "sensor-sensors", "Sensors", "Twelve synthetic sensors, which link each one uses and how much of its reporting is carried. Life-safety gauges come first."),
      step("communication", "sensor-communication", "Communication application", "Shows which link the control room, desks and teams would use in the chosen scenario."),
      step("limits", "sensor-limits", "Limits of this rehearsal", "What the simulation does not show. Its priority classes and switch-over rules are IndTrana's own choices."),
      neverFrom("/sensor-link"),
    ],
  },
  {
    id: "page:/watch", route: "/watch", title: "Hazard Watch",
    steps: [
      purpose("Lists hazard triggers that have crossed a threshold and need a person to look, with the evidence behind each.",
        { incident_operator: "Lists hazard triggers that need a person to look. As a maker you can refresh the watch and start a proposal-linked run; automation always stops and hands over to a person." }),
      tabs("Hazard Watch is the trigger list. Earth Watch shows public USGS and NASA reference feeds, kept separate from every case."),
      step("controls", "watch-controls", "Refresh and preview", "Refresh re-reads the watch. A maker or an administrator can do this; other roles read the result.", { bodyByRole: { incident_operator: "Refresh re-reads the watch and is yours to press as a maker. When connectors are off, Preview with sample data shows how the page looks with synthetic values." } }),
      step("map", "watch-map", "Trigger map", "Where each trigger sits. Position is the evidence location, not a hazard extent."),
      step("queue", "watch-queue", "Trigger queue", "The triggers in order. Open one to read its evidence and history. Nothing here is issued as a warning."),
      neverFrom("/watch"),
    ],
  },
  {
    id: "page:/earth-watch", route: "/earth-watch", title: "Earth Watch",
    steps: [
      purpose("A read-only view of public earthquakes, natural events and satellite imagery from USGS and NASA, kept apart from every IndTrana case."),
      tabs("Hazard Watch is IndTrana's own trigger list. Earth Watch, this page, shows public reference feeds only."),
      step("heartbeat", "earth-heartbeat", "Feed status", "Says whether public feeds are on and how old the latest data is. Stale data is labelled as stale."),
      step("map", "earth-map", "Earth Watch map", "Public reports on a map. This is public reference, not an IndTrana assessment."),
      step("layers", "earth-layers", "Hazard layers", "Switch the feeds and map layers on or off, and see how old each item is."),
      neverFrom("/earth-watch"),
    ],
  },
  {
    id: "page:/public-intake", route: "/public-intake", title: "Public Intake",
    steps: [
      purpose("A quarantine-only form for unverified public reports. Reports are held for a person to review and do not become cases."),
      step("form", "intake-form", "Report what you see", "Submit a test report to see how intake works. It is held as unverified."),
      step("queue", "intake-queue", "Quarantine queue", "The reports already held. Reading them is open to the incident desk and administrators; no report creates a case or notifies a responder."),
      neverFrom("/public-intake"),
      refusal("Public Intake is for the incident desk and administrators. Your role can read other pages; use the menu to go there."),
    ],
  },
  {
    id: "page:/model-lab", route: "/model-lab", title: "Model Evaluation Lab",
    steps: [
      purpose("Shows how the synthetic model scored on held-out exercise data, with its limits. Read it before relying on any estimate."),
      step("reliability", "model-reliability", "Score reliability", "Compares the model's scores with the synthetic outcomes in bins. These are rehearsal figures, not real accuracy."),
      step("matrix", "model-matrix", "Classification results", "The confusion matrix: what the model got right and wrong on the synthetic holdout, in a table you can read with a screen reader."),
      neverFrom("/model-lab"),
    ],
  },
  {
    id: "page:/my-team", route: "/my-team", title: "My Team",
    steps: [
      purpose("The requests that department desks made to your exercise team, where each stands and what has been reported."),
      step("requests", "myteam-requests", "Your requests", "Accept or decline a request, then report en route, on site and completed. A number on the menu shows how many wait for you."),
      neverFrom("/my-team"),
      refusal("My Team is for response-team accounts, which answer requests for one synthetic team. Other roles do not see another team's requests; open Department Inbox if you are a department desk."),
    ],
  },
  {
    id: "page:/approvals", route: "/approvals", title: "Approval Workbench",
    steps: [
      purpose("Proposals for your agency and where each stands between its maker and its checker.",
        { incident_operator: "Where you draft a proposal and submit it. A different person, the checker, decides; you can never approve your own.", incident_checker: "Where you decide proposals that a different person submitted. You approve or reject with a reason, and cannot draft or submit.", incident_auditor: "Where you read proposals, decisions and their audit trail. You cannot change anything here." }),
      step("create", "approvals-create", "Create proposal", "Saved as a draft. Nothing is submitted until the maker chooses to. Only makers see this form.", { roles: [OP] }),
      step("queue", "approvals-queue", "Agency approval queue", "Every proposal for your agency with its status. A proposal needs two keys: the maker's and a different person's.",
        { bodyByRole: { incident_checker: "Proposals waiting for a checker. Open one, read its evidence and approve or reject with a reason. The server refuses an approval from the person who submitted it.", incident_auditor: "Proposals and their decisions, read-only. Open one to read its audit trail." } }),
      neverFrom("/approvals"),
      refusal("Proposals are for makers, checkers and auditors. Administrators set up connectors and cannot draft, submit or approve proposals."),
    ],
  },
  {
    id: "page:/department-tasks", route: "/department-tasks", title: "Department Inbox",
    steps: [
      purpose("The approved rehearsal tasks assigned to your department. Only your own department's tasks appear here."),
      step("tasks", "dept-task", "A task", "Acknowledge a task, then close it with a note. On an acknowledged task you can request an exercise team and record its answer. Time targets are rehearsal targets, not contractual."),
      neverFrom("/department-tasks"),
      refusal("Department Inbox is for department desks, each seeing only its own department. Makers, checkers and auditors read the same tasks on the AgencySync Tasks page."),
    ],
  },
  {
    id: "page:/agency-sync", route: "/agency-sync", title: "AgencySync Tasks",
    steps: [
      purpose("Fictional acknowledgements and department timelines for approved exercise tasks. No real agency is messaged."),
      tabs("AgencySync Tasks follows each task. Team Availability shows how loaded each desk is."),
      step("registry", "sync-registry", "Task registry", "Search or filter by department, then select a task to see its scripted timeline."),
      step("timeline", "sync-timeline", "Scripted audit trail", "The acknowledgement steps of the selected task in order. They are scripted rehearsal steps."),
      neverFrom("/agency-sync"),
    ],
  },
  {
    id: "page:/response-teams", route: "/response-teams", title: "Team Availability",
    steps: [
      purpose("A read-only view of how loaded each fictional desk is, and what the five invented field teams have been asked to do."),
      tabs("AgencySync Tasks follows each task. Team Availability, this page, shows workload by desk."),
      step("filter", "teams-filter", "Filter by status", "Narrow the desks to the ones that are busy, free or waiting. Use it to see who has room before a task is planned."),
      neverFrom("/response-teams"),
    ],
  },
  {
    id: "page:/handover", route: "/handover", title: "Shift Handover",
    steps: [
      purpose("A cited brief of what changed for your agency since the last shift. Every line names the records it comes from."),
      step("window", "handover-window", "Handover window", "Choose how many hours to look back, from 1 to 72."),
      step("state", "handover-state", "State at handover", "Whether the kill switch is engaged, then the changes by section. Download or print the brief for the next shift."),
      neverFrom("/handover"),
      refusal("The handover brief is for makers, checkers, auditors and administrators. Department desks and response teams work from their own inbox."),
    ],
  },
  {
    id: "page:/copilot", route: "/copilot", title: "Operator Copilot",
    steps: [
      purpose("A read-only assistant that answers a fixed set of questions about your agency's records and cites each answer."),
      step("ask", "copilot-ask", "Ask a question", "Ask one question at a time or pick an example. Anything it cannot answer from your agency's records is declined, and instructions typed into a question are ignored."),
      step("answer", "copilot-answer", "Answer", "The reply with the records it comes from. It describes records and never acts."),
      neverFrom("/copilot"),
      refusal("The copilot is for makers, checkers, auditors and administrators. Department desks and response teams do not have access."),
    ],
  },
  {
    id: "page:/drills", route: "/drills", title: "Exercise Drills",
    steps: [
      purpose("Timed tabletop drills that run on a simulated clock, with injected events that exist only inside the drill."),
      step("start", "drills-start", "Start a drill", "Makers start a drill from a synthetic scenario. Makers and checkers then respond to its injects.", { bodyByRole: { incident_auditor: "Makers start drills and makers and checkers respond. As an auditor you read the results.", platform_admin: "Makers start drills and makers and checkers respond. As an administrator you read the results." } }),
      step("drill", "drills-drill", "The running drill", "The simulated clock and the injects so far. Responding is recorded against rehearsal targets."),
      step("report", "drills-report", "Coach report", "How timely each response was against synthetic targets, once the drill ends. These are rehearsal scores."),
      neverFrom("/drills"),
      refusal("Drills are for the incident desk and administrators. Department desks and response teams do not have access."),
    ],
  },
  {
    id: "page:/audit", route: "/audit", title: "Audit360 Export",
    steps: [
      purpose("The provenance of one exercise case, as a bounded download with a checksum so it can be verified."),
      step("snapshot", "audit-snapshot", "Traceable exercise snapshot", "Choose one of the synthetic incidents, download the export and verify its checksum. It never contains credentials, checker notes or another agency's records."),
      neverFrom("/audit"),
    ],
  },
  {
    id: "page:/playbooks", route: "/playbooks", title: "Response Playbooks",
    steps: [
      purpose("The exercise procedures for the urban flood scenario, step by step. A teaching reference, not an official procedure."),
      step("steps", "playbooks-steps", "Referenced steps", "Each step with what to check first and which review options are allowed. Search the steps to find one."),
      step("refs", "playbooks-refs", "Cross references", "Where each step connects to other pages, so you can open the page that serves it."),
      neverFrom("/playbooks"),
    ],
  },
  {
    id: "page:/learning", route: "/learning", title: "Post-event Learning",
    steps: [
      purpose("Compares earlier estimates with what happened in the exercise and lets threshold changes be proposed for independent review.",
        { incident_operator: "Compare estimates with outcomes and propose a threshold change. A different checker or an administrator reviews it and only an administrator can apply it.", incident_checker: "Review threshold proposals that a different person made. Approval alone never changes the engine.", platform_admin: "Review threshold proposals and, only when one is approved, apply it as a new versioned overlay with audit." }),
      step("config", "learning-config", "Engine configuration", "The trigger thresholds in force and where they come from."),
      step("window", "learning-window", "Close or replay an event window", "Close a window or replay a synthetic scenario to produce statistics. Only makers see this form.", { roles: [OP] }),
      step("windows", "learning-windows", "Closed event windows", "Rehearsal statistics for each closed window, labelled by their basis. They are never accuracy."),
      step("proposals", "learning-proposals", "Threshold proposals", "A maker proposes a change, a different checker or an administrator reviews it, and only an administrator applies it. Approval never changes the engine by itself."),
      neverFrom("/learning"),
      refusal("Learning is for the incident desk and administrators. Department desks and response teams do not have access."),
    ],
  },
  {
    id: "page:/help", route: "/help", title: "Help & Learning",
    steps: [
      purpose("Guides, keyboard shortcuts and fixes for common problems, written for this exercise build."),
      tabs("Help & Learning holds the guides. What's new lists what changed in each version."),
      step("articles", "help-articles", "Support articles", "Search the articles, then choose a category tab to narrow the list."),
      step("categories", "help-tabs", "Article categories", "Each tab is a topic. Arrow keys move between tabs."),
      step("trouble", "help-troubleshooting", "Troubleshooting steps", "Steps for the common problems, such as not being able to sign in or a page that will not load."),
      neverFrom("/help"),
    ],
  },
  {
    id: "page:/whats-new", route: "/whats-new", title: "What's new",
    steps: [
      purpose("What changed in each version of IndTrana, in plain words. The version number in the menu footer opens this page."),
      tabs("Help & Learning holds the guides. What's new, this page, lists the changes in each version."),
      step("current", "whatsnew-current", "The current version", "The version you are running, its date, a one-line summary and what is new, improved, fixed and secured."),
      step("earlier", "whatsnew-earlier", "Earlier versions", "Open an earlier version to read what it changed."),
      neverFrom("/whats-new"),
    ],
  },
  {
    id: "page:/admin", route: "/admin", title: "Administration",
    steps: [
      purpose("The server policy in force and the safety switches of this exercise node. Nothing on this page changes who may do what.",
        { platform_admin: "The server policy in force and the safety switches of this exercise node. As an administrator you can engage or release the kill switch." }),
      tabs("Administration is the policy. Connectors take data-source keys, Users and access explains the roles, and Go-Live Setup lists everything real use would need."),
      step("policy", "admin-policy", "Effective exercise policy", "The versioned policy in force. It is read-only here."),
      step("setup", "admin-setup", "Set up this server", "Where to set up data sources and other settings, with links to the pages that do it."),
      neverFrom("/admin"),
    ],
  },
  {
    id: "page:/admin/connectors", route: "/admin/connectors", title: "Connectors",
    steps: [
      purpose("Each data-source connector, whether it is on and its last test. Only administrators can change a connector."),
      tabs("Administration is the policy. Connectors, this page, holds the source keys. Users and access explains the roles."),
      step("bar", "connectors-bar", "Switches and tests", "Switch a connector on, enter its key and test it. A saved secret is never shown again and nothing is ever sent to a source."),
      step("progress", "connectors-progress", "Setup progress", "How far the set-up is, with the next thing to do."),
      neverFrom("/admin/connectors"),
      refusal("Connectors are for administrators. Other roles can read Administration and Go-Live Setup."),
    ],
  },
  {
    id: "page:/admin/users", route: "/admin/users", title: "Users and access",
    steps: [
      purpose("The six roles, what each can do and the account you are signed in with. Accounts are managed in your agency's identity provider, not here."),
      tabs("Administration is the policy. Users and access, this page, explains the roles."),
      step("signedin", "users-signed-in", "Signed in now", "Your name, role and agency for this session."),
      step("roles", "users-roles", "The roles", "Each role in one sentence."),
      step("matrix", "users-matrix", "What each role can do", "A table of what each role may do. It explains the server's rules and does not control them."),
      neverFrom("/admin/users"),
    ],
  },
  {
    id: "page:/admin/go-live", route: "/admin/go-live", title: "Go-Live Setup",
    steps: [
      purpose("Everything real use would need: keys, switches and agreements, where each is configured and what is still missing. Read-only."),
      tabs("Administration is the policy. Go-Live Setup, this page, lists what real use would need."),
      step("how", "golive-how", "How configuration works", "Explains where settings live and why no secret is shown or typed on this page."),
      step("start", "golive-start", "Start here", "The order to work through the list."),
      neverFrom("/admin/go-live"),
    ],
  },
  {
    id: "page:/admin/brand", route: "/admin/brand", title: "Brand", needs: [AD],
    steps: [
      purpose("The product name and logo people see in the browser, and every change made to them. Reached from Administration."),
      step("name", "brand-name", "Product name", "An administrator sets the name here. It appears as plain text in the browser only; staff email, alert drafts, exports and audit text keep the built-in name.", { roles: [AD] }),
      step("logo", "brand-logo", "Logo", "Upload a PNG, JPEG or WebP image up to 256 KB. Other formats are refused.", { roles: [AD] }),
      step("history", "brand-history", "Brand changes", "A record of each change, without the image itself.", { roles: [AD] }),
      neverFrom("/admin/brand"),
      refusal("Only an administrator can change the product name and logo."),
    ],
  },
];

const BY_ID = new Map(TOURS.map(tour => [tour.id, tour]));
export const tourById = (id: string): Tour | undefined => BY_ID.get(id);
/** The tour for a path. /incidents/<id> reads the case tour; any other unknown path has none. */
export function tourForPath(pathname: string): Tour | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return BY_ID.get("page:" + clean) ?? (/^\/incidents\/[^/]+$/.test(clean) ? BY_ID.get("page:/incidents/[id]") : undefined);
}

/**
 * The steps this person sees. Role filtering: a step with `roles` needs one of them; a page that needs a role (lib/roles.ts
 * pageRoles) shows its normal steps to those roles and only its refusal step to the rest; the body is the first role-specific
 * variant that matches the person's roles, in the menu's order of responsibility. `roles` unknown (still loading) shows the
 * normal steps.
 */
export function stepsFor(tour: Tour, roles: readonly string[] | null | undefined): ResolvedStep[] {
  const held = knownRoles(roles);
  const needs = tour.needs ?? (tour.route ? pageRoles(tour.route) : null);
  const allowed = !needs || !roles || needs.some(role => held.includes(role));
  return tour.steps.filter(item => {
    if (item.refusal) return !allowed;
    if (!allowed) return false;
    return !item.roles || item.roles.some(role => held.includes(role));
  }).map(item => {
    const variant = held.map(role => item.bodyByRole?.[role]).find((text): text is string => Boolean(text));
    return { id: item.id, target: item.target, title: item.title, body: variant ?? item.body };
  });
}

/** Whether the Welcome tour should start by itself: signed in, role known, on a page with an app shell, and never started, finished or skipped before in this browser. */
export function shouldAutoStartWelcome(state: { done: readonly string[]; dismissed: readonly string[]; all?: { active: boolean } | null }, context: { authenticated: boolean; hasRoles: boolean; pathname: string }): boolean {
  if (!context.authenticated || !context.hasRoles || state.all?.active) return false;
  if (state.done.includes(WELCOME_TOUR_ID) || state.dismissed.includes(WELCOME_TOUR_ID)) return false;
  if (["/welcome", "/sign-in"].includes(context.pathname) || tourForPath(context.pathname)?.noShell) return false;
  return true;
}

/** The pages in this person's menu, in menu order, that a tour can run on: usable by the role, with an app shell. */
export function tourPagesFor(roles: readonly string[] | null | undefined): NavPage[] {
  const pages: NavPage[] = [];
  for (const group of navigation) for (const item of group.items) for (const page of item.tabs ?? [item]) {
    if (!canOpenPage(page.href, roles) || tourForPath(page.href)?.noShell || !tourForPath(page.href)) continue;
    pages.push(page);
  }
  return pages;
}

/** Roles that are named by any step, for tests. */
export const ALL_ROLES: readonly RoleId[] = ROLE_IDS;
export { pageRoles };
