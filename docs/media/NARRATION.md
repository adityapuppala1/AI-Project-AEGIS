# Narration scripts

These walkthrough videos were refreshed on 11 November 2026 against the redesigned landing page, sign-in page and sidebar, and the sign-in gate (every page except the landing, welcome and sign-in pages needs a signed-in session). Each video was recorded from the locally running app (Docker, http://localhost:3000) with Playwright (headless Chromium, 1280x720). The voice-over was generated with the `edge-tts` Python package using the Indian English neural voice `en-IN-NeerjaNeural` (only the narration text is sent to Microsoft's speech service), and audio and video were joined with ffmpeg (H.264 + AAC). Each scene's audio is placed at the moment the matching scene appears on screen, and the same sentence is shown as an on-screen caption.

Videos 02 to 09 are signed in with the local demo accounts. In video 02 and 08 the sign-in is done on screen through the local identity provider's own form: the user name is typed visibly, the password box is masked, and no password appears in any frame, caption or narration. The passwords were read from the local credentials file at run time and are not stored in this repository. The `exercise-*` accounts were not used.

Everything shown is synthetic exercise data from a prototype. AEGIS does not send warnings or dispatch teams, and nothing here is real forecasting accuracy or government approval. The recordings created two synthetic approval records in the local exercise database through the normal UI (one draft that was submitted and approved on camera, plus one earlier test record).

Not covered: the Department Inbox with a department account (no demo department account exists, so the video shows the role-required message), Hazard Watch, Public Intake, Earth Watch, Copilot, Drills, Handover and Learning pages.

## 01-about-aegis.mp4: About AEGIS (landing page, signed out)

*Shown:* The redesigned public landing page: hero with the hazard selector (cyclone, river flood, earthquake, heatwave), the six steps of how an alert travels, the safeguards and project status sections, and the Sign in button.

1. This is AEGIS, an exercise only decision support prototype for India's disaster agencies. It gathers the evidence, estimates the risk, and makes sure two accountable officers approve an alert before it goes to the official channel.
2. Everything you will see uses synthetic exercise data. AEGIS does not send warnings. You can follow a cyclone, a river flood, an earthquake or a heatwave. Let us pick river flood, and then earthquake.
3. Now scroll down to see how an alert travels, in six steps. Step one, sense. Weather satellites and coastal gauges follow a storm forming over the Bay of Bengal, days before landfall.
4. Step two, predict. Possible storm tracks are compared, and the districts most likely to flood are marked, with the evidence listed. When evidence is thin, AEGIS says so, instead of guessing.
5. Step three, decide. One officer drafts the alert. A different officer checks it, and approves it or sends it back with a reason. No single person can approve alone, and software cannot approve at all.
6. Step four, hand over. The approved draft goes to the alerting authority, such as N D M A, in the standard Common Alerting Protocol format. AEGIS stops here. It has no way to send a public warning.
7. Step five, reach people. The authority's own system passes the warning to telecom operators, who broadcast it to phones in the affected area. Response teams receive their tasks from their departments.
8. Step six, learn. After the event, what was estimated is compared with what happened. Any change to a threshold goes through the same two person approval before it is used.
9. Who does it help? Agencies get one desk with sources, their freshness, and every decision with its two approvers. Citizens still hear only from the official channel, never from AEGIS.
10. The AI reads, compares and explains. It flags stale or conflicting sources, and estimates how unusual a rainfall is, with a range. It never approves, never sends a warning, and never dispatches teams.
11. Where the project stands: this is a prototype for rehearsal. It is not a live warning system, and it has no government approval. To explore further, choose Sign in at the top. Thank you for watching.

## 02-sign-in.mp4: Sign-in and first view after login

*Shown:* The sign-in page, then a real sign-in through the local identity provider with the demo maker account (an incident operator). The user name is typed on screen; the password field is masked and no password is shown or spoken. It ends on the signed-in Command Center.

1. This is the AEGIS operator sign-in page. Operators sign in with their agency account, and AEGIS sends them to their own organisation's identity provider.
2. There are three steps. Leave for your identity provider. Enter your password and second factor there. Then return to AEGIS with a signed role.
3. Your password never reaches AEGIS. You type it only on your organisation's identity provider. AEGIS checks the provider's signature before it trusts the sign-in. Role and agency come from the signed token, and the maker and the checker must be two different people.
4. Now let us sign in for real, with the local demo account for an incident operator, the maker. We scroll back up and choose continue with agency sign-in.
5. This is the identity provider's own login form, a separate system from AEGIS. We type the demo user name. The password box is masked, so what you see is only dots.
6. We submit the form. The provider checks the account, and sends the browser back to AEGIS with a signed sign-in result.
7. We are now signed in and on the Command Center. The top bar shows our verified role, incident operator, and a sign out button. The session is short and sealed. It expires within fifteen minutes, and is cleared on sign-out.

## 03-alert-journey-exercise.mp4: Alert Journey exercise (synthetic cyclone, signed in)

*Shown:* The globe-based Alert Journey exercise at /alert-journey, played in director mode with its three human decision gates (staging plan, checker approval, escalation). Synthetic data only.

1. This is the AEGIS Alert Journey, opened after signing in. It is a synthetic exercise: a made up cyclone, played out from the first signal to people being warned. Nothing in it is real, and nothing is sent. It has five phases, and three points where a human has to decide.
2. Phase one, sense. Satellites and gauges watch the storm as it forms. In this exercise their readings are synthetic. AEGIS collects them, and shows where each reading came from.
3. Phase two, predict. AEGIS compares possible storm tracks and estimates which areas may flood, citing the evidence behind each estimate. When the evidence is thin, it says so and abstains, instead of guessing.
4. The first human gate. The commander must decide where response teams should wait. AEGIS recommends high ground sites, but it cannot task any team. The agency commander chooses. Here we pick plan B, and the exercise continues.
5. The estimate keeps updating as new evidence arrives, with the range of uncertainty shown. A draft alert is being prepared for review. It is still private.
6. The second gate, the most important one. A draft alert needs a checker who is a different person from the maker. The checker reads the cited evidence, then approves or sends the draft back, and records a reason. Software cannot approve.
7. Phase three, approve and hand over. The approved draft is passed to the official alerting authority. AEGIS stops here. It has no way to send a public warning.
8. The third gate. The forecast has changed and rain bands are arriving. A human must decide whether to escalate to emergency mode. Playback stays paused until they do.
9. Phase four, deliver. In the real world, the authority's own system passes the warning to telecom operators, who broadcast it to phones in the affected area. Here, that path is only simulated, with towers and phones.
10. Phase five, respond. Field teams act on tasks from their departments, and every decision is kept in the audit trail, with who decided, and why.
11. That is the whole exercise. Evidence, a cited estimate, three human decisions, and a handover, with AEGIS never sending anything itself. It is a prototype, running on synthetic data.

## 04-live-earth.mp4: Live Earth (opt-in public reference data) and the Flood tab

*Shown:* Alert Journey in live mode: the consent step, public satellite imagery and orbits, public earthquake and storm reports, Hyderabad selected, the Flood tab (river discharge and rainfall extremes as public reference data), and the city scene. The optional statistical forecast button visible on the Flood tab was not used.

1. Live Earth is an optional mode of the AEGIS Alert Journey. It shows real public reference data, for context only. It is not an AEGIS assessment, and nothing here is used to create alerts.
2. The page asks first. Only after you agree does the AEGIS server fetch public data on your behalf. Nothing is stored, and the data is never used to create alerts.
3. Now the globe shows real satellite imagery, real satellite orbits, and public earthquake and storm reports. All of it comes through the AEGIS server relay, and is labelled as public reference data.
4. Pick any place. Here we pick Hyderabad. The panel shows the real forecast, the river discharge, and how unusual the rain is, with ranges rather than false precision, and a plain note when data is missing.
5. Now the Flood tab. It shows the river discharge for the chosen place, as public reference data. It is context for a person to read, not a flood forecast made by AEGIS, and a gap in the data is shown as a gap.
6. Entering the city scene shows real terrain and a street map, driven by the real hourly forecast. Again, this is public context for a person to look at. It is not a forecast of impact, and it does not create a case or an alert.
7. Back on the globe, the point to remember. Everything in Live Earth is public reference data, shown for context. It is fetched through the AEGIS server, never stored, and never used to create alerts. AEGIS itself still has no way to send a warning.

## 05-command-center-tour.mp4: Command Center tour (signed in as the demo maker)

*Shown:* The Command Center after sign-in (top bar role, menu groups, decision path, counters, public reference signals, map and queues), the Incident Registry, and one synthetic case with its geospatial context.

1. This is the AEGIS Command Center, as seen after signing in. Everything here is synthetic exercise data, and a banner says so at the top.
2. The top bar shows who is signed in. Here it is the incident operator role, taken from the signed sign-in, with a sign out button. On the left, the menu groups the pages as overview, observe, coordinate and govern.
3. At the top is the decision path in three steps. One, observe and verify. Two, focus and draft. Three, approve and rehearse. The counters show five registered incidents, two awaiting human review, and zero public alerts issued, because operational alerting is disabled.
4. Below are public signals, labelled reference only. These come from public earthquake and natural event feeds, shown for context. They are not an AEGIS assessment and they never create a case.
5. Further down are the map and the incident queue, and a monitor of how fresh each simulated source is. Scroll on to see the hazard telemetry and the response readiness.
6. The Incident Registry lists the five synthetic cases. You can search, sort and filter them. Two are awaiting review, and one is in progress.
7. Opening a case shows the evidence, the timeline and the readiness checks. A banner says plainly that this is a simulation and not a real incident.
8. Lower on the case page is the geospatial context. It finds candidate sources nearby, and it is careful. It states that this is not an impact forecast, and it flags readings that are missing, old or odd.
9. That is the Command Center. It shows what is known, how fresh it is, and what a person should review next. AEGIS prepares the evidence, and people decide. It sends nothing.

## 06-exercise-walkthrough.mp4: Exercise Walkthrough (/demo)

*Shown:* The 11-stage guided exercise page: local readiness checks, then stages 2 to 11 selected in turn (ingestion, source freshness, incident, geographic candidates, hazard index, model limits, playbook, checker gate, department acknowledgements, audit trace).

1. This is the Exercise Walkthrough. It follows one made up urban waterlogging case in Hyderabad through eleven stages. It is a tabletop simulation. It cannot forecast real floods, contact departments, or issue warnings.
2. First, a set of local checks. They confirm that the exercise database, the sample incidents, the sources and the scripted tasks are present. A pass here does not mean sensors are connected, or that the public is safe.
3. Stage one is to confirm the simulated environment. Each stage explains what you will see, and moving between stages changes only what is shown on this page.
4. Stage two, inspect ingestion. Data comes in through validated contracts, duplicates are removed, and bad records are held back in quarantine.
5. Stage three, check source freshness. Each source shows how old its last reading is, so nobody relies on a stale signal by mistake.
6. Stage four, open the synthetic incident, and stage five, look at geographic candidates. Sources that are only nearby are candidates, never proof of cause.
7. Stages six and seven show an illustrative hazard index, and the limits of the model. The index is an exercise tool, with the limitations written beside it. It is not a calibrated forecast.
8. Stage eight, the response playbook. It lists review options for a person. It does not assign anyone to anything.
9. Stage nine, the independent checker gate. The person who drafts an action cannot be the person who approves it.
10. Stages ten and eleven show the scripted department acknowledgements, and the audit trace. Every step is recorded, and nothing is sent to any real agency.
11. That is the walkthrough. Evidence, limits, an independent check, and an audit trail, all on synthetic data. Moving through the stages never approves, warns or dispatches anything.

## 07-inputs.mp4: Inputs: Source Freshness and DataFusion ingestion

*Shown:* The Source Freshness page (counts by freshness, source registry, source detail and quality notes) and the DataFusion ingestion page (replay steps, accepted and quarantined counts, quarantine reasons, local replay command).

1. This video is about inputs: where the evidence comes from. First, Source Freshness. These five sources are database fixtures for the exercise. They are not connected to the India Meteorological Department, N D M A, cameras or municipal devices.
2. The cards count the sources by freshness. Freshness is only a timestamp check. It does not prove that a signal is accurate or that any equipment is working. Here four sources are stale, because the sample readings are old.
3. The registry lists each source with the time of its last observation. Selecting one opens its detail and trend, with quality notes, so a reviewer can see what a reading is based on.
4. Now the ingestion page. It shows how a replay moves through DataFusion. Records are checked against a contract, repeated records are dropped, and invalid ones are held in quarantine, as metadata only.
5. The counters show three accepted events, five quarantined records, and zero live ingest connections. This page is exercise only. The browser cannot send measurements, warnings or dispatch instructions.
6. Below, the quarantine reasons explain why each record was held back, and how to run the local replay again. In the real world, a person must check every source before AEGIS can use it. Nothing here is live.

## 08-approvals-maker-checker.mp4: Approvals: maker drafts, a different checker approves

*Shown:* The Approval Workbench. The maker (demo maker) fills in and saves a draft and submits it. The maker signs out, the identity provider session is cleared, and a different person (demo checker, role incident checker, a different verified identity) signs in, writes a reason and approves. Synthetic exercise records only; nothing is sent.

1. This is the Approval Workbench, where decisions are made and checked. We are signed in as the maker, an incident operator. The page says it is a training environment, and that approvals never issue warnings or dispatch anyone.
2. The maker starts a proposal. We choose an exercise incident, road inundation, and an action, prepare a warning draft, which is marked never send. Then we write the rationale, with the evidence and the uncertainty.
3. We save the draft. The page keeps a cited review brief with it, taken from the saved evidence. The draft is still private, and nothing has been approved.
4. Now the maker submits the draft for independent review. The status changes to submitted, and the maker step is done. The maker cannot approve their own draft.
5. The maker signs out. Approval needs a different person, so we go back to the sign-in page.
6. Now we sign in as a second person, the checker, with their own demo account. Again the password box is masked.
7. We open the Approval Workbench as the checker. The role at the top is now incident checker. The form for new proposals is disabled for this role, and the submitted draft is waiting for review.
8. The checker reads the cited evidence and the rationale. Then they must write a reason for their decision, whether they approve or reject.
9. The checker approves the draft. All three steps are now done: maker, checker, and simulate. Approval records a simulated decision only. AEGIS still sends no warning and dispatches no team.

## 09-team-response.mp4: Team response and governance

*Shown:* Team Availability (fictional teams), AgencySync tasks and one task audit trail, the Department Inbox (which correctly refuses the incident operator account because it has no verified department role), Audit360 and the read-only Administration policy.

1. After a decision, work moves to the teams. This is Team Availability. It shows seven fictional teams and the scripted tasks they hold. This is an exercise board, not real staffing.
2. Five tasks are open, and three are past their demo due window. The three slot capacity is only a planning setting for this rehearsal. Nothing here assigns, notifies or dispatches anyone.
3. Now AgencySync. It lists the fictional department tasks, each tied to a case, with its state. Three are prepared, and never sent. Two have scripted acknowledgements, and two have scripted closures.
4. Selecting a task opens its audit trail. Every message says that nothing was sent. The trail shows who acted, and when, in the scripted exercise.
5. The Department Inbox is where a department sees its own approved tasks. It needs a verified department role. Our incident operator account does not have one, so the page says so, and shows no tasks. Roles come from the signed sign-in, never from the browser.
6. Audit360 lets you export one synthetic case as a traceable snapshot with a checksum. It is a demonstration. It is not a legally signed audit, and it leaves out private approval histories.
7. Finally, the Administration page. It shows the policy in force, set on the server. Independent checker is required, and live warnings and live dispatch are locked off. Nothing on this page can be edited from the browser.
8. That is the team response side. Tasks are scripted, every step is audited, and the controls that would send a real warning or dispatch a real team are locked off. This is a prototype for rehearsal.
