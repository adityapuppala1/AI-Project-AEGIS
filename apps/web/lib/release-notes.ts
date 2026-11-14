// What changed in each release, in plain words for the people who use IndTrana. Newest first. The newest version must
// equal apps/web/package.json (scripts/tests/release-notes.test.cjs checks it), and CHANGELOG.md carries the same
// versions in developer wording. Every user-visible change adds an entry here in the same commit (docs/RELEASE_PROCESS.md).
// Text is English; the What's new page passes it through t(), and strings without a reviewed translation are listed in
// lib/translations-pending.ts until native review. No commit hashes, no secrets, no claims of real warnings or accuracy.
// 0.3.0 is the first tagged release; 0.1.0 and 0.2.0 summarise earlier work and were never tagged.
// No React or DOM imports.

export const RELEASE_GROUPS = ["New", "Improved", "Fixed", "Security"] as const;
export type ReleaseGroup = (typeof RELEASE_GROUPS)[number];
export interface ReleaseItem { group: ReleaseGroup; text: string }
/** `tagged` releases have a git tag and a release date. Earlier work was never tagged: it is a summary with a period instead of a date. */
export interface Release { version: string; tagged: boolean; /** ISO date, tagged releases only. */ date?: string; /** Plain-words period, untagged summaries only. */ period?: string; summary: string; items: ReleaseItem[] }

export const RELEASES: readonly Release[] = [
  {
    version: "0.3.0",
    tagged: true,
    date: "2026-11-14",
    summary: "Guided tours for every page, a Resilient Sensor Link rehearsal, this What's new page, and a round of security and defect fixes found in testing.",
    items: [
      { group: "New", text: "Guided tours. A Welcome tour explains the menu, search, language, theme, the EXERCISE strip and your account, and every page has its own tour that follows your role. Start them from the account menu: Tour this page, Restart welcome tour or Tour all my pages." },
      { group: "New", text: "What's new and release notes. The version number in the menu footer now opens this page, and the account menu marks it until you have looked at the current version." },
      { group: "New", text: "Resilient Sensor Link. A rehearsal page showing how 12 synthetic sensors share an internet link and a satellite link when bandwidth is scarce, with a five-step storm timeline and a strip saying what stays possible. Nothing is transmitted." },
      { group: "New", text: "Patent credit. Indian Patent No. 598835 is credited on the landing page, the About page and the Resilient Sensor Link page." },
      { group: "Improved", text: "The status message on Post-event Learning is now a clear notice at the top of the page instead of a small line pinned to the bottom of the window." },
      { group: "Improved", text: "The configured product name now also appears in the search dialog label and on the error page." },
      { group: "Improved", text: "Install helpers for macOS and Linux can move an older local sign-in address to the IndTrana address, with a backup and a way back." },
      { group: "Improved", text: "All walkthrough videos and screenshots were re-recorded with the IndTrana name and the current screens." },
      { group: "Fixed", text: "Signing out returns you to the IndTrana home page again, and the next person can sign in in the same window." },
      { group: "Fixed", text: "Ask grounded guide now answers, drill actions show a message, and Learning and Drills no longer show raw codes." },
      { group: "Fixed", text: "A rationale containing a hidden NUL character no longer causes a server error." },
      { group: "Fixed", text: "Approvals and Hazard Watch offer Retry when loading fails, and Approve and Reject no longer stay clickable on a stale proposal after a conflict." },
      { group: "Fixed", text: "Team and department accounts that are refused a page are now sent to their own page. Close rehearsal task is disabled while it is blocked, task dates read day-month-year, and Retry no longer squeezes its message on phones." },
      { group: "Fixed", text: "The Live Earth consent text now says that public data is fetched through the IndTrana server, which is what happens." },
      { group: "Security", text: "Added the missing origin check on the risk exercise request, limited platform-wide administration to the exercise agency's administrator, and added defensive headers to API replies." },
      { group: "Security", text: "Three public-feed values are now escaped before display, and request bodies reject unknown fields, non-finite numbers, over-long connector keys and hidden NUL characters." },
    ],
  },
  {
    version: "0.2.0",
    tagged: false,
    period: "Up to 13 November 2026",
    summary: "The product became IndTrana, with sign-in, administrator brand settings, department and team accounts, and one-step install. Everything is still a local exercise on synthetic data.",
    items: [
      { group: "New", text: "Renamed to IndTrana. Only the name people read changed; sign-in and existing installs keep working." },
      { group: "New", text: "Brand settings. An administrator can set the product name and a PNG, JPEG or WebP logo, or restore the defaults, with every change recorded. Staff email, alert drafts, exports and audit text keep the built-in name." },
      { group: "New", text: "Sign-in for every page and data route, with a local sign-in provider and demo accounts for the six roles, including department desks and response teams." },
      { group: "New", text: "Team response loop. A department desk can request an exercise team for an approved task, and the team answers in My Team. It reaches people signed in to IndTrana only; nobody is called or texted." },
      { group: "New", text: "Opt-in email notices to IndTrana's own signed-in staff, behind two switches that are off by default. Messages use fixed rehearsal wording and no case content." },
      { group: "New", text: "Communication channels on the Connectors page, for credentials only. SMS, WhatsApp, push and public warnings stay locked." },
      { group: "New", text: "One-step install, start, stop, status and doctor for Windows, macOS and Linux, with automatic port fallback." },
      { group: "Improved", text: "A merged menu that groups related pages as tabs, an account menu showing your role and agency, one shared set of screen parts, and a page instruction block on every page." },
      { group: "Improved", text: "Everything sent out now names IndTrana: alert drafts, staff email, download names and the local sign-in provider." },
      { group: "Security", text: "The API port now requires a verified signed-in operator, and the seeded exercise records are shown only to the agency that owns them." },
      { group: "Fixed", text: "Earth Watch now says when reference map tiles are unavailable." },
    ],
  },
  {
    version: "0.1.0",
    tagged: false,
    period: "October 2026",
    summary: "The first local synthetic demonstration of the alert path, from evidence to an approved exercise draft.",
    items: [
      { group: "New", text: "Incident registry, incident workspace with evidence and timeline, source freshness and the DataFusion replay, all on synthetic data." },
      { group: "New", text: "Proposals with independent two-person approval, an approved-only alert draft, and exercise tasks for departments." },
      { group: "New", text: "A model evaluation lab that reports synthetic holdout figures and states that they are not real forecasting accuracy." },
    ],
  },
];
