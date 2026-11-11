// The "How this page works" block. Every page uses the same three parts, in the same order, so instructions read
// the same way everywhere: what the page shows, what you can do here, what it will never do. AppShell looks the
// entry up by path. Text is English; t() translates it where a reviewed translation exists.

export interface PageHelp { shows: string; can: string; never: string }

export const PAGE_HELP: Record<string, PageHelp> = {
  "/": {
    shows: "The exercise incidents on a map and in a queue, with source freshness and the workload of each desk.",
    can: "Pick an incident to read its evidence, switch the map between 2D and schematic 3D, and open any case in the registry.",
    never: "It never sends a warning, dispatches anyone or shows live operations. Map locators are symbols, not flood extent or severity.",
  },
  "/about": {
    shows: "What AEGIS is for, the six steps an alert takes, and the limits of this exercise build.",
    can: "Read how the steps fit together and jump to the page that serves each step.",
    never: "It never describes real capability or real accuracy. Everything named here is rehearsal on synthetic data.",
  },
  "/demo": {
    shows: "A guided walk through one exercise, with a check of the local services it depends on.",
    can: "Follow the steps in order and open each page as you reach it.",
    never: "It never resets data, and a passing check is not proof of readiness for real use.",
  },
  "/incidents": {
    shows: "Every exercise incident with its hazard, status, place and evidence.",
    can: "Search, sort and filter the list, then open a case to read its evidence and readiness.",
    never: "It never creates or changes a case. The records are synthetic.",
  },
  "/sources": {
    shows: "How fresh each synthetic data feed is, and which feeds are late or missing.",
    can: "Filter by state and open a feed to see its recent history.",
    never: "It never contacts a real agency feed, and agreement between feeds is not proof that they are right.",
  },
  "/ingestion": {
    shows: "The synthetic ingestion run: what was accepted, what was a duplicate and what was quarantined.",
    can: "Read the counts and the reasons records were set aside.",
    never: "It never ingests live data or releases a quarantined record.",
  },
  "/watch": {
    shows: "Hazard triggers that have crossed a threshold and need a person to look, with their evidence.",
    can: "Read each candidate and its history. A maker can refresh the watch and start a proposal-linked run.",
    never: "It never issues a warning or acts on its own. Automation stops and hands over to a person.",
  },
  "/earth-watch": {
    shows: "Public reference feeds from USGS and NASA: earthquakes, natural events and satellite imagery.",
    can: "Browse the feeds and the map layers, and see how old each item is.",
    never: "It never saves these records or uses them in cases, proposals or alerts. It is public reference, not an AEGIS assessment.",
  },
  "/public-intake": {
    shows: "Reports sent in by the public, held in quarantine for review.",
    can: "Submit a test report and read the ones already held.",
    never: "It never creates a case or notifies a responder. Reports stay unverified.",
  },
  "/model-lab": {
    shows: "How the synthetic model scored on held-out exercise data, with calibration and known limits.",
    can: "Compare the figures and read the limitations before relying on any estimate.",
    never: "It never claims real forecasting accuracy. These are rehearsal figures on synthetic data.",
  },
  "/approvals": {
    shows: "Proposals for your agency and where each stands between its maker and its checker.",
    can: "A maker drafts and submits. A different person, the checker, approves or rejects with a reason.",
    never: "It never lets one person both submit and approve, and an approval never sends a warning. It produces a draft for the alerting authority.",
  },
  "/department-tasks": {
    shows: "Approved tasks assigned to your department.",
    can: "Acknowledge a task and close it with a note.",
    never: "It never shows another department's tasks or dispatches anyone. Time targets are rehearsal targets, not contractual.",
  },
  "/agency-sync": {
    shows: "Fictional acknowledgements and timelines from the departments in the exercise.",
    can: "Follow each task through acknowledgement and closure.",
    never: "It never messages a real agency.",
  },
  "/response-teams": {
    shows: "The workload of each fictional response desk.",
    can: "See which desks are busy before a task is planned.",
    never: "It never moves, tasks or notifies a team.",
  },
  "/handover": {
    shows: "What changed for your agency in the chosen window, each line with the records it comes from.",
    can: "Choose the window, then download or print the brief for the next shift.",
    never: "It never writes, saves or sends anything. It is not a forecast, an approval or a dispatch.",
  },
  "/copilot": {
    shows: "Answers to a fixed set of questions about your agency's records, each with the records it comes from.",
    can: "Ask one question at a time or pick an example.",
    never: "It never acts, approves, notifies or forecasts, and it ignores instructions typed into a question.",
  },
  "/drills": {
    shows: "Timed tabletop drills that run on a simulated clock.",
    can: "A maker starts a drill; makers and checkers respond to its injects.",
    never: "It never touches real records or sends anything. Scores are rehearsal targets.",
  },
  "/audit": {
    shows: "The provenance of one exercise case, with a checksum.",
    can: "Download the bounded export and verify its checksum.",
    never: "It never exports credentials, checker notes or records of another agency.",
  },
  "/playbooks": {
    shows: "The exercise procedures for each hazard.",
    can: "Read the steps and the review options they allow.",
    never: "It never starts a procedure. A person decides every action.",
  },
  "/learning": {
    shows: "How earlier estimates compared with what happened in the exercise, by basis.",
    can: "A maker proposes a threshold change; a different checker reviews it; only an administrator applies it.",
    never: "It never changes the engine on approval alone, and these statistics are never accuracy.",
  },
  "/help": {
    shows: "Guides, keyboard shortcuts and fixes for common problems.",
    can: "Search the topics and follow the links to each page.",
    never: "It never replaces your agency's own procedures.",
  },
  "/admin": {
    shows: "The server policy and the safety switches of this exercise node.",
    can: "Read every setting. An administrator can engage or release the kill switch.",
    never: "It never enables live warnings or dispatch from this page.",
  },
  "/admin/connectors": {
    shows: "Each data-source connector, whether it is on, and its last test.",
    can: "An administrator enters keys, switches a connector on and tests it.",
    never: "It never shows a saved secret again, and it never sends data to a source.",
  },
  "/admin/users": {
    shows: "The five roles, what each one can do, and the account you are signed in with.",
    can: "Check what your role allows and where accounts are managed.",
    never: "It never creates, changes or removes an account. That is done in your agency's identity provider.",
  },
  "/admin/go-live": {
    shows: "Every key, switch and agreement that real use would need.",
    can: "Read what is missing and where each item is obtained.",
    never: "It never switches real use on. This build stays an exercise.",
  },
};

export const PAGE_HELP_HEADINGS = { shows: "What it shows", can: "What you can do here", never: "What it will never do" } as const;

/** Help for a path: the most specific entry wins, so /incidents/<id> reads the registry's help. */
export function helpFor(pathname: string): PageHelp | null {
  let best: string | null = null;
  for (const href of Object.keys(PAGE_HELP)) {
    const under = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    if (under && (!best || href.length > best.length)) best = href;
  }
  return best ? PAGE_HELP[best] : null;
}
