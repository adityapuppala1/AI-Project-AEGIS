# Narration scripts

These walkthrough videos were re-recorded on 14 November 2026 against the current app (videos 01 to 10, and the new video 11 on the Resilient Sensor Link page). They show the IndTrana name, the signed-in shell (sidebar, EXERCISE desk strip with IST clock, account menu, "How this page works", two-key maker/checker markers), the six-step decision path on the Command Center, the six Alert Journey phases, the Live Earth consent text, and the changed wording on the Exercise Walkthrough (stage 9 and stage 11). Each video was recorded from the locally running app (http://localhost:3000) with Playwright driving Google Chrome (headless, 1280x720). The voice-over was generated with the `edge-tts` Python package using the Indian English neural voice `en-IN-NeerjaNeural` (only the narration text is sent to Microsoft's speech service), and audio and video were joined with ffmpeg (H.264 + AAC). Each scene's audio is placed at the moment the matching scene appears on screen, and the same sentence is shown as an on-screen caption.

Videos 02 to 11 are signed in with the local demo accounts (demo-maker, demo-checker, demo-dept-control, demo-team-rescue). In videos 02, 08 and 09 sign-in is done on screen through the identity provider's own form: the user name is typed, the password box is masked, and no password appears in any frame, caption or narration. In the other videos the session was established beforehand in the background with the same accounts. Passwords were read from the local credentials file at run time and are not stored in this repository. The `exercise-*` accounts were not used.

Everything shown is synthetic exercise data from a prototype. IndTrana does not send warnings or dispatch teams, the India outline is schematic, and nothing here is real forecasting accuracy or government approval. The recordings created synthetic records in the local exercise database through the normal UI: video 08 saved one draft proposal that the maker submitted and the checker approved, and video 10 prepared that proposal's department tasks and ran the team request loop on them (every task and request closed or completed). Live Earth (video 04) was opt-in and fetched public data through the IndTrana server relay; if a public service is slow or down, the panel shows a gap, as the narration says.

Not covered: Hazard Watch, Public Intake, Earth Watch, Copilot, Drills, Handover, Learning, Model Lab and the Admin connector, brand and Go-Live pages (see docs/screenshots). The Drills success sentence, the "Open My Team" refusal link and the Retry button on error boxes are not shown in these videos. The Department Inbox in video 09 shows the department's tasks (it is no longer empty).


## 01-about-aegis.mp4: About IndTrana (landing page, signed out)

*Shown:* The landing page with the Earth centred on India, the hazard picker (cyclone, river flood, earthquake, heatwave) that flies to Indian regions, the six steps of how an alert travels, who it helps, what the AI does and never does, project status, and Sign in.

1. This is IndTrana, an exercise only decision support prototype for India's disaster agencies. It gathers the evidence, estimates the risk, and makes sure two accountable officers approve an alert before it goes to the official channel.
2. Everything you will see uses synthetic exercise data. IndTrana does not send warnings. You can follow a cyclone, a river flood, an earthquake or a heatwave. The hazard picker flies the globe to the matching Indian region. Let us pick river flood, and then earthquake.
3. Now scroll down to see how an alert travels, in six steps. Step one, sense. Weather satellites and coastal gauges follow a storm forming over the Bay of Bengal, days before landfall.
4. Step two, predict. Possible storm tracks are compared, and the districts most likely to flood are marked, with the evidence listed. When evidence is thin, IndTrana says so, instead of guessing.
5. Step three, decide. One officer drafts the alert. A different officer checks it, and approves it or sends it back with a reason. No single person can approve alone, and software cannot approve at all.
6. Step four, hand over. The approved draft goes to the alerting authority, such as N D M A, in the standard Common Alerting Protocol format. IndTrana stops here. It has no way to send a public warning.
7. Step five, reach people. The authority's own system passes the warning to telecom operators, who broadcast it to phones in the affected area. Response teams receive their tasks from their departments.
8. Step six, learn. After the event, what was estimated is compared with what happened. Any change to a threshold goes through the same two person approval before it is used.
9. Who does it help? Agencies get one desk with sources, their freshness, and every decision with its two approvers. Citizens still hear only from the official channel, never from IndTrana.
10. The AI reads, compares and explains. It flags stale or conflicting sources, and estimates how unusual a rainfall is, with a range. It never approves, never sends a warning, and never dispatches teams.
11. Where the project stands: this is a prototype for rehearsal. It is not a live warning system, and it has no government approval. To explore further, choose Sign in at the top. Thank you for watching.

## 02-sign-in.mp4: Sign-in, the identity provider form and the account menu

*Shown:* The sign-in page, Continue to sign in, the identity provider's own login form (user name typed, password masked), the signed-in Command Center and the account menu (user, role, agency, account, session time, Users and access, Sign out).

1. This is the IndTrana operator sign-in page. Operators sign in with their agency account, and IndTrana sends them to their own organisation's identity provider.
2. There are three steps. Leave for your identity provider. Enter your password and second factor there. Then return to IndTrana with a signed role.
3. Your password never reaches IndTrana. You type it only on your organisation's identity provider. IndTrana checks the provider's signature before it trusts the sign-in. Role and agency come from the signed token, and the maker and the checker must be two different people.
4. Now let us sign in for real, with the local demo account for an incident operator, the maker. We scroll back up and choose Continue to sign in.
5. This is the identity provider's own login form, a separate system from IndTrana, in the same look. We type the demo user name. The password box is masked, so what you see is only dots.
6. We submit the form. The provider checks the account, and sends the browser back to IndTrana with a signed sign-in result.
7. We are now signed in on the Command Center, inside the new portal shell. A strip says exercise, no live warnings or dispatch, with the time in India.
8. Top right is the account menu. It shows who is signed in, Demo maker, and the verified role, maker. It also shows the agency, the account, and how many minutes remain in the session. There is a link to Users and access, and a Sign out choice.
9. The session is short and sealed, and it is cleared on sign-out. Everything here is a synthetic exercise, and IndTrana sends nothing.

## 03-alert-journey-exercise.mp4: Alert Journey exercise (synthetic cyclone, signed in)

*Shown:* The Alert Journey at /alert-journey with its six phases (Detect, Predict, Decide, Alert, Respond, Recover) and its three human decision gates (staging plan, checker approval, escalation). Synthetic data only.

1. This is the IndTrana Alert Journey, opened after signing in. It is a synthetic exercise: a made up cyclone, played out from the first signal to people being warned. Nothing in it is real, and nothing is sent. It has six phases, and three points where a human has to decide.
2. Phase one, detect. Satellites and gauges watch the storm as it forms. In this exercise their readings are synthetic. IndTrana collects them, and shows where each reading came from.
3. Phase two, predict. IndTrana compares possible storm tracks and estimates which areas may flood, citing the evidence behind each estimate. When the evidence is thin, it says so and abstains, instead of guessing.
4. The first human gate. The commander must decide where response teams should wait. IndTrana recommends high ground sites, but it cannot task any team. The agency commander chooses. Here we pick plan B, and the exercise continues.
5. Phase three, decide. The estimate keeps updating as new evidence arrives, with the range of uncertainty shown. A draft alert is being prepared for review. It is still private.
6. The second gate, the most important one. A draft alert needs a checker who is a different person from the maker. The checker reads the cited evidence, then approves or sends the draft back, and records a reason. Software cannot approve.
7. Phase four, alert. The approved draft is passed to the official alerting authority. IndTrana stops here. It has no way to send a public warning. In the real world, the authority's own system passes the warning to telecom operators, who broadcast it to phones. Here, that path is only simulated, with towers and phones.
8. The third gate. The forecast has changed and rain bands are arriving. A human must decide whether to escalate to emergency mode. Playback stays paused until they do.
9. Phase five, respond. Field teams act on tasks from their departments, and every decision is kept in the audit trail, with who decided, and why.
10. Phase six, recover and learn. Water recedes, crews restore power and towers, and rehearsal statistics feed a reviewed learning loop.
11. That is the whole exercise. Evidence, a cited estimate, three human decisions, and a handover, with IndTrana never sending anything itself. It is a prototype, running on synthetic data.

## 04-live-earth.mp4: Live Earth (opt-in public reference data) and the Flood tab

*Shown:* Alert Journey in live mode: the consent step, public imagery, orbits, earthquake and storm reports, Hyderabad selected, the Flood tab and the city scene.

1. Live Earth is an optional mode of the IndTrana Alert Journey. It shows real public reference data, for context only. It is not an IndTrana assessment, and nothing here is used to create alerts.
2. The page asks first. Only after you agree does the IndTrana server fetch public data on your behalf, so the public services see the server and not your address. Nothing is stored, and the data is never used to create alerts.
3. Now the globe shows real satellite imagery, real satellite orbits, and public earthquake and storm reports. All of it comes through the IndTrana server relay, and is labelled as public reference data.
4. Pick any place. Here we pick Hyderabad. The panel shows the real forecast, the river discharge, and how unusual the rain is, with ranges rather than false precision, and a plain note when data is missing.
5. Now the Flood tab. It shows the river discharge for the chosen place, as public reference data. It is model discharge, not a gauge reading, and not a flood forecast made by IndTrana. It is context for a person to read, and a gap in the data is shown as a gap.
6. Entering the city scene shows a street map with illustrative sites, driven by the real hourly forecast. Again, this is public context for a person to look at. It is not a forecast of impact, and it does not create a case or an alert.
7. Back on the globe, the point to remember. Everything in Live Earth is public reference data, shown for context. It is fetched through the IndTrana server, never stored, and never used to create alerts. IndTrana itself still has no way to send a warning.

## 05-command-center-tour.mp4: Command Center tour (signed in as the demo maker)

*Shown:* The Command Center in the signed-in shell (sidebar, desk strip, account menu), the six-step decision path, counters, public reference signals, map and queue, the Incident Registry and one synthetic case.

1. This is the IndTrana Command Center, as seen after signing in. Everything here is synthetic exercise data, and a banner says so at the top.
2. The top right account menu shows who is signed in, and the verified role, maker. On the left, the sidebar groups the pages as overview, observe, coordinate and govern.
3. At the top is the decision path in six steps: sense, predict, decide, hand over, reach and learn. The counters show five registered incidents, two awaiting human review, and zero public alerts issued, because operational alerting is disabled.
4. Below are public signals, labelled reference only. These come from public earthquake and natural event feeds, shown for context. They are not an IndTrana assessment and they never create a case.
5. Further down are the map and the incident queue, and a monitor of how fresh each simulated source is. Scroll on to see the hazard telemetry and the response readiness.
6. The Incident Registry lists the five synthetic cases. You can search, sort and filter them. Two are awaiting review, and one is in progress.
7. Opening a case shows the evidence, the timeline and the readiness checks. A banner says plainly that this is a simulation and not a real incident.
8. Lower on the case page is the geospatial context. It finds candidate sources nearby, and it is careful. It states that this is not an impact forecast, and it flags readings that are missing, old or odd.
9. That is the Command Center. It shows what is known, how fresh it is, and what a person should review next. IndTrana prepares the evidence, and people decide. It sends nothing.

## 06-exercise-walkthrough.mp4: Exercise Walkthrough (/demo)

*Shown:* The 11-stage guided exercise: local dependency checks, then stages 1 to 11 selected in turn (stage 9 and stage 11 with their new wording).

1. This is the Exercise Walkthrough. It follows one made up urban waterlogging case in Hyderabad through eleven stages. It is a tabletop simulation. It cannot forecast real floods, contact departments, or issue warnings.
2. First, a set of local checks. They confirm that the exercise database, the sample incidents, the sources and the scripted tasks are present. A pass here does not mean sensors are connected, or that the public is safe.
3. Stage one is to confirm the simulated environment. Each stage explains what you will see, and moving between stages changes only what is shown on this page.
4. Stage two, inspect ingestion. Data comes in through validated contracts, duplicates are removed, and bad records are held back in quarantine.
5. Stage three, check source freshness. Each source shows how old its last reading is, so nobody relies on a stale signal by mistake.
6. Stage four, open the synthetic incident, and stage five, look at geographic candidates. Sources that are only nearby are candidates, never proof of cause.
7. Stages six and seven show an illustrative hazard index, and the limits of the model. The index is an exercise tool, with the limitations written beside it. It is not a calibrated forecast.
8. Stage eight, the response playbook. It lists review options for a person. It does not assign anyone to anything.
9. Stage nine, the independent checker gate. The person who drafts an action cannot be the person who approves it. You must be signed in, and an account that is not an operator or a checker cannot change a proposal.
10. Stages ten and eleven show the scripted department acknowledgements, and the audit trace. Every step is recorded, and nothing is sent to any real agency. Stage eleven points you to Approvals, and a proposal's audit link.
11. That is the walkthrough. Evidence, limits, an independent check, and an audit trail, all on synthetic data. Moving through the stages never approves, warns or dispatches anything.

## 07-inputs.mp4: Inputs: Source Freshness and DataFusion ingestion

*Shown:* Source Freshness (counts, registry, detail) and the DataFusion ingestion page (replay steps, counters, quarantine reasons).

1. This video is about inputs: where the evidence comes from. First, Source Freshness. These five sources are database fixtures for the exercise. They are not connected to the India Meteorological Department, N D M A, cameras or municipal devices.
2. The cards count the sources by freshness. Freshness is only a timestamp check. It does not prove that a signal is accurate or that any equipment is working. Here four sources are stale, because the sample readings are old, and one has no observations at all.
3. The registry lists each source with the time of its last observation. Selecting one opens its detail and trend, with quality notes, so a reviewer can see what a reading is based on.
4. Now the ingestion page. It shows how a replay moves through DataFusion. Records are checked against a contract, repeated records are dropped, and invalid ones are held in quarantine, as metadata only.
5. The counters show three accepted events, five quarantined records, and zero live ingest connections. This page is exercise only. The browser cannot send measurements, warnings or dispatch instructions.
6. Below, the quarantine reasons explain why each record was held back, and how to run the local replay again. In the real world, a person must check every source before IndTrana can use it. Nothing here is live.

## 08-approvals-maker-checker.mp4: Approvals: maker drafts, a different checker approves

*Shown:* The Approval Workbench with the two-key (maker, checker) markers. The maker drafts and submits, signs out in one step from the account menu, and a different person (demo checker) signs in through the provider form, writes a reason and approves. Synthetic records only; nothing is sent.

1. This is the Approval Workbench, where decisions are made and checked. We are signed in as the maker, an incident operator. Each proposal shows two keys, maker and checker. The page says it is a training environment, and that approvals never issue warnings or dispatch anyone.
2. The maker starts a proposal. We choose an exercise incident, road inundation, and an action, prepare a warning draft, which is marked never send. Then we write the rationale, with the evidence and the uncertainty.
3. We save the draft. The page keeps a cited review brief with it, taken from the saved evidence. The draft is still private, and nothing has been approved.
4. Now the maker submits the draft for independent review. The status changes to submitted, and the maker step is done. The maker cannot approve their own draft.
5. The maker opens the account menu and chooses Sign out. Sign-out now ends the identity provider session in one step, and returns to the sign-in page.
6. Now we sign in as a second person, the checker, with their own demo account. Again the password box is masked.
7. We open the Approval Workbench as the checker. The role at the top is now checker, and the two key markers show the maker key done and the checker key waiting. The form for new proposals is disabled for this role, and the submitted draft is waiting for review.
8. The checker reads the cited evidence and the rationale. Then they must write a reason for their decision, whether they approve or reject.
9. The checker approves the draft. Both keys are now turned, maker and checker, and the simulate step remains. Approval records a simulated decision only. IndTrana still sends no warning and dispatches no team.

## 09-team-response.mp4: Team response, Department Inbox, Users and access and governance

*Shown:* Team Availability, AgencySync with a task audit trail, Audit360, Administration, then a department account (demo-dept-control, Department desk) opening the Department Inbox and the Users and access page.

1. After a decision, work moves to the teams. This is Team Availability. It shows seven fictional teams and the scripted tasks they hold. This is an exercise board, not real staffing.
2. Five tasks are open, and three are past their demo due window. The three slot capacity is only a planning setting for this rehearsal. Nothing here assigns, notifies or dispatches anyone.
3. Now AgencySync. It lists the fictional department tasks, each tied to a case, with its state. Three are prepared, and never sent. Two have scripted acknowledgements, and two have scripted closures.
4. Selecting a task opens its audit trail. Every message says that nothing was sent. The trail shows who acted, and when, in the scripted exercise.
5. Each line of the trail carries its time in India Standard Time, so the order of events is plain. Every one of these is a scripted line in a synthetic exercise, and none was sent.
6. Audit360 lets you export one synthetic case as a traceable snapshot with a checksum. It is a demonstration. It is not a legally signed audit, and it leaves out private approval histories.
7. The Administration page shows the policy in force, set on the server. Independent checker is required, and live warnings and live dispatch are locked off. Nothing on this page can be edited from the browser.
8. Now a department account. The maker signs out from the account menu, and returns to the sign-in page.
9. We sign in as the demo account for the control room department. The user name is typed, and the password box is masked.
10. The Department Inbox now opens, because this account has a verified department role and a department, the control room. It shows only that department's approved tasks, each with its state, from prepared to closed, and its rehearsal target and events in India Standard Time. Tasks appear only after an independent checker approves a proposal and a maker prepares them.
11. Last, Users and access, under Administration. It shows who is signed in, the role, the department, and what each of the six roles can and cannot do. It is read only. Accounts are managed in the agency's identity provider, never in IndTrana.
12. That is the team response side. Tasks are scripted, every step is audited, and the controls that would send a real warning or dispatch a real team are locked off. This is a prototype for rehearsal.

## 10-team-response-loop.mp4: The team response loop (rehearsal)

*Shown:* The full loop through the real screens, each step by its own signed-in demo user: maker, control room desk, rescue team (phone-sized view on a dark background), then the incident. Sign-in for the second and later users is done off camera. Synthetic records only; nobody is called, texted or radioed.

1. This is a rehearsal inside IndTrana, with invented teams. It alerts only people who are signed in. Nobody is called, texted or radioed. Travel times are planning estimates. IndTrana never sends warnings or dispatches anyone, and it has no government approval. We start as the maker.
2. In the Approval Workbench, this proposal was approved by a second person. Its department tasks are not prepared yet.
3. The maker presses Prepare scripted department tasks. The tasks now exist for each department. They are only records. Nothing is sent.
4. Now the control room desk, signed in as its own user. The Department Inbox shows only this desk's tasks. Here is the new task from the proposal we just prepared. It is waiting for the desk.
5. The desk acknowledges the task, and writes a short reason. The reason goes into the audit trail.
6. A Team response section has appeared. The desk presses Request a team. IndTrana lists the invented teams, with the facts behind each suggestion: matching skills, free capacity, whether the team is available now, and an estimated travel time. The travel time is a planning estimate. The desk decides.
7. The desk chooses Synthetic rescue team 01, and writes a note for the team. Then it presses Request this team. The team is asked only through IndTrana.
8. The request now shows as waiting for an answer. Now the desk tries to close the task. The reason is written, but closing is blocked while a team request is open.
9. Now the rescue team, on a phone. Signed in as the team, it lands on My Team. The request from the desk is waiting. A request alerts only people signed in to IndTrana. Nobody is called, texted or radioed.
10. The menu shows a count of requests waiting for an answer. That count is the alert, and it exists only inside IndTrana.
11. The team presses Accept, writes a short note, and confirms.
12. Next, I am en route. The team reports that it is on the way. This is a rehearsal step. No one is moving.
13. Then, I am on site. The team chooses how the situation looks, here worse than expected, and adds a note.
14. The team can also ask for support. Here it chooses the kind of support, equipment, and writes a note. This raises a flag for the desk.
15. Back at the desk. The Team response section now shows the team's answers, step by step, each with who recorded it and when. A flag shows that the team asked for support.
16. The desk reads the request for support and deals with it outside this rehearsal. Then it presses Mark handled, writes a note, and confirms. The flag clears. Nobody is contacted by this.
17. The team presses Completed, chooses how the situation ended, and writes a note.
18. The request has moved to Finished. The team has nothing left waiting.
19. At the desk, the request now shows Completed. The team has finished.
20. Now the desk can close its task. It writes a reason, and presses Close rehearsal task. Closing was blocked before, and it works now.
21. Finally, the maker opens the incident. On the Overview tab, the Team response panel shows the completed request, and the team's answers.
22. On the Timeline tab, each team step is a line marked SIMULATION: requested, accepted, on the way, on site, asking for support, and completed. This is the record of the rehearsal on the incident.
23. The Response Teams page also has Field teams. These are the five invented teams, with their current requests. They are exercise teams, not real units.
24. To end, remember what this was. A rehearsal inside IndTrana, with invented teams. It alerts only people who are signed in. Nobody was called, texted or radioed. Travel times are planning estimates. IndTrana never sends warnings or dispatches anyone, and it has no government approval.

## 11-resilient-sensor-link.mp4: Resilient Sensor Link (/sensor-link)

*Shown:* The Resilient Sensor Link rehearsal page: storm timeline (five steps), link scenarios, the "Trigger near" toggle, the "What stays possible" strip, the two-lane schematic, the Sensors table, the Communication application panel, the Patented technology block (certificate PDF not opened) and Limits of this rehearsal. Synthetic data only; nothing is transmitted.

1. This is the Resilient Sensor Link page of IndTrana. It is a rehearsal simulation. Nothing is transmitted, and every number on this page is synthetic.
2. IndTrana's first step is Sense: readings from river gauges, rain gauges and other sensors. In a cyclone or a flood, the ground network is often the first thing to fail, just when those readings matter most.
3. The page applies the idea named in the title of Indian Patent No. 598835: a dynamic bandwidth system for sensor networks, over satellite and internet infrastructure.
4. Follow the storm timeline. Seventy two hours before landfall, all links are up, and every sensor reports.
5. Twelve hours before landfall, rain bands arrive and towers start to fail. Ground capacity is reduced, and the lowest priority feeds start to wait.
6. At landfall, the ground network is cut. Life safety gauges keep reporting over satellite, and lower priority feeds wait. The strip shows what stays possible: four of four life safety sensors are still reporting.
7. At the peak, satellite capacity is reduced. Life safety gauges are served first.
8. In recovery, ground links return, and held feeds catch up.
9. Bandwidth can also follow the hazard. When a trigger is near, this river gauge asks for more, and it is given the extra from capacity left after the other life safety gauges.
10. The table lists each synthetic sensor, its priority, the link it uses now, and whether its readings are delivered, reduced or held.
11. The same link management applies to communication. The control room, the department desks and the field teams would use the ground link while it is up, and then satellite. In IndTrana this stays an in-app rehearsal. Nothing is sent to any team.
12. The patent behind the idea: Indian Patent No. 598835, Dynamic Bandwidth System for IoT Networks via Satellite and Internet Infrastructure, granted on 12 August 2026. The patentee is Bharath Bejjarapu, a co-owner of IndTrana.
13. The limits are stated on the page. This is described from the patent's title and the public publication notice. No satellite or radio link is used here, and a field deployment would need dedicated hardware and licensed satellite capacity.
