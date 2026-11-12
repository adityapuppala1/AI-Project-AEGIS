# AEGIS demo guide for the presenter

A 25-minute walkthrough with the demo accounts. Written 11 November 2026 for the local laptop setup.
Everything shown is synthetic exercise data. AEGIS does not send warnings and has no government approval. Say that
once at the start and once at the end.

## Ten minutes before

1. Docker Desktop is running. In PowerShell, from the project folder:
   `powershell -ExecutionPolicy Bypass -File .\scripts\check-local-runtime.ps1 -RequireRunning` (should end with PASS).
   If the app is stopped: `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SignIn -PublicEarth -Proactive -StatisticalForecast -NoBuild`.
2. Open `%LOCALAPPDATA%\AEGIS\local-idp\demo-credentials.txt` in Notepad on a screen the audience cannot see.
3. Open two browser windows: a normal window (for the maker) and a private/incognito window (for the checker).
   Two windows let you show two people side by side without signing out.
4. Open http://localhost:3000 in the normal window. Check that the globe appears.
5. Internet is needed only for Live Earth. If the network is poor, skip part 4.

Sessions last 15 minutes. If you see "Your session ended", choose Sign in again; you return to the same page.

## The one-sentence story

"AEGIS gathers the evidence, estimates the risk, and makes sure two different officers approve an alert before it is
handed to the official warning channel. The software prepares and explains. People decide. The authority warns."

## Who is who

| Account | Shown as | Plays the part of |
|---|---|---|
| `demo-maker` | Maker | Duty officer who studies a case and drafts the proposal |
| `demo-checker` | Checker | Senior officer who independently approves or rejects |
| `demo-dept-control` | Department desk | Control-room desk that receives approved tasks |
| `demo-team-rescue` | Response team | Field team lead who answers a request and reports progress |
| `demo-auditor` | Auditor | Reviewer who reads who decided what, and why |
| `demo-admin` | Administrator | IT administrator who configures the platform |

Why separate logins matter: the central safety rule is that the person who drafts an alert can never approve it, and
every action is recorded against a named person. That only works if each person signs in as themselves.

## The walkthrough

### Part 1. Landing page, signed out (3 min) — http://localhost:3000

- Say: "This is what anyone sees before signing in. Nothing else opens without a login."
- Point at the globe: India seen from its own weather satellites, INSAT-3DR and INSAT-3DS.
- Click the hazard buttons: Cyclone (Bay of Bengal), River flood (Assam), Earthquake (Himalaya), Heatwave (plains).
- Scroll through the six steps: Sense, Predict, Decide, Hand over, Reach, Learn. Stop at "Decide": two officers.
- Say what the AI does and does not do: it reads, compares and explains; it never approves, sends or dispatches.

### Part 2. Sign in as the maker (2 min)

- Click **Sign in**, then **Continue to sign in**.
- Say: "AEGIS has no password box. You are sent to your own agency's sign-in. AEGIS only receives a signed
  statement of who you are and your role."
- Sign in as `demo-maker`. You land on the Command Center.
- Point at the top right: name and role "Maker". Open the menu: agency, session time left, sign out.
- Point at the orange EXERCISE strip: it can never be mistaken for live operation.

### Part 3. What the maker sees (5 min)

- **Command Center** (home): counts, the six-step chain, the incident list.
- **Exercise Walkthrough** (menu, Overview): the guided 11-stage exercise. Use it if you want the app to lead you.
- **Incident Registry** (Observe): open one case. Show the evidence list and that every finding cites its records.
- **Source Freshness** (Observe): each data source and how old its last reading is. Some show as stale; say that this
  is on purpose in the sample data, and that AEGIS flags stale sources instead of hiding them.
- Each page has **How this page works**: what it shows, what you can do, what it will never do.

### Part 4. Alert Journey and Live Earth (4 min, optional, needs internet) — menu: Alert Journey

- Exercise mode: play the story; it stops at three human decision gates.
- Switch to Live Earth, accept the notice, pick Hyderabad or Guwahati. Show earthquakes, storms and satellites.
- Flood tab: river forecast. If you press the statistical forecast button, call it "an optional statistical
  estimate", never "accuracy".
- Say: "These are public reference feeds for display only. They never create a case or an alert."
- Use the **Home** button to return.

### Part 5. Two people decide (5 min) — the heart of the demo

1. Normal window, as `demo-maker`: open **Approval Workbench** (Coordinate). Draft a proposal for a case and
   submit it. Show the two-key marker: Maker turned, Checker empty.
2. Say: "I cannot approve my own proposal. There is no approve button for me."
3. Private window: open http://localhost:3000, sign in as `demo-checker`. The top right says "Checker".
4. Open **Approval Workbench**. Open the submitted proposal, read the cited evidence, write a reason, approve.
5. Back in the maker window, refresh: both keys are turned.
6. Say: "Only now can anything go further, and what goes further is a draft handed to the alerting authority.
   AEGIS itself has no way to send a public warning."

### Part 6. After the decision (3 min)

- **Department Inbox**: in the private window, sign out from the account menu and sign in as `demo-dept-control`.
  It opens the inbox for the control-room desk. It lists tasks only after an approval and after the maker has
  prepared tasks; if it is empty, say exactly that.
- **Shift Handover** (as maker or checker): a read-only brief of what changed, every line citing record ids.
- **Operator Copilot**: click "Which incidents are open?". It answers only from records and cites them; it cannot act.
- **Audit360 Export**: sign in as `demo-auditor` if time allows: who did what, when, and why.

### Part 6b. Teams respond and the incident is updated (4 min)

This is a rehearsal inside AEGIS. Say it out loud: "Nobody is called, texted or radioed. The teams are invented."

1. As `demo-maker`, on the approved proposal in **Approval Workbench**, prepare the department tasks.
2. As `demo-dept-control`, open **Department Inbox** and acknowledge the task (write a short reason).
3. Still as the desk, under **Team response** choose **Request a team**. Show why a team is suggested: matching
   capability, free capacity, available now, estimated travel time (a planning estimate). Request
   "Synthetic rescue team 01".
4. On a phone-sized window, sign in as `demo-team-rescue`. It opens **My Team** with the request waiting and a count
   on the menu. Press **Accept**, then **I am en route**, **I am on site** (choose how the situation looks), and
   optionally **Ask for support**.
5. Back at the desk: the request shows the team's answers; a support request raises a flag the desk marks as handled.
   The desk can also record an answer for a team (as from a radio call) or stand the team down.
6. The team presses **Completed**. Only now can the desk close its task.
7. As `demo-maker`, open the incident: the timeline lists each team step, and the **Team response** panel shows the
   current state. The audit trail holds who recorded what.

### Part 7. Administration (1 min, optional)

- Sign in as `demo-admin`. Open **Administration**, tab **Users and access**: the table of what each role may do.
- Say: "Accounts are created and removed in the agency's identity provider, not inside AEGIS."

## Closing lines

- "This is a prototype for rehearsal with synthetic data."
- "It is not a live warning system and it has no government approval."
- "What it shows is the method: evidence with citations, two accountable people, and a full record."

## Likely questions

- **Does the AI predict disasters?** It estimates how unusual rainfall or river levels are and compares sources. The
  figures in this demo are rehearsal figures, not measured accuracy.
- **Can it send an alert to phones?** No. It prepares a draft in the standard Common Alerting Protocol format for the
  alerting authority, whose own system reaches phones.
- **Where is the data stored?** On this laptop, in a local database. Nothing leaves it except requests for public
  reference feeds when Live Earth is on.
- **Whose map boundary is that?** A schematic outline for illustration. It is not Survey of India data.
- **What would a real deployment need?** See [GOVT_DEPLOYMENT_READINESS.md](GOVT_DEPLOYMENT_READINESS.md).

## If something goes wrong

| Problem | Do this |
|---|---|
| "Your session ended" | Sign in again; you return to the same page. |
| Signed in as the wrong person | Account menu (top right), Sign out, then sign in again. |
| Sign-in page says it is not set up | The app was started without `-SignIn`. Run the start command in "Ten minutes before". |
| Browser warns about the certificate | Choose Advanced and continue; it is the local sign-in service on this laptop. |
| Live Earth is empty or slow | Internet problem. Say so and move on to Part 5. |
| A page shows an error | Press Retry once, then move on; do not debug in front of the audience. |
