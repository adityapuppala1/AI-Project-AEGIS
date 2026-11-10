# Narration scripts

These walkthrough videos were made on 10 November 2026. Each was recorded from the locally running app with Playwright (headless Chromium, 1280x720), the voice-over was generated with the `edge-tts` Python package using the Indian English neural voice `en-IN-NeerjaNeural` (only the narration text is sent to Microsoft's speech service), and audio and video were joined with ffmpeg (H.264 + AAC). Each scene's audio is placed at the moment the matching scene appears on screen, and the same sentence is shown as an on-screen caption.

Signed-in screens are not included. The demo passwords were not available, so only the public, signed-out screens, the sign-in page and the identity provider's login form (not used) were recorded. Everything shown is synthetic exercise data from a prototype. AEGIS does not send warnings, and nothing here is real forecasting accuracy or government approval.

## 01-about-aegis.mp4: About AEGIS (the landing page)

1. This is AEGIS, an exercise only decision support prototype for India's disaster agencies. It gathers the evidence, estimates the risk, and makes sure two accountable officers approve an alert before it goes to the official channel.
2. Everything you will see uses synthetic exercise data. AEGIS does not send warnings. Let us follow one cyclone, from the first signal to the people it should reach.
3. Step one, sense. Weather satellites and coastal gauges follow a storm forming over the Bay of Bengal, days before landfall.
4. Step two, predict. Several possible storm tracks are compared. The districts most likely to flood are marked, with the evidence behind each one listed. And when there is not enough evidence, AEGIS says so, instead of guessing.
5. Step three, decide. One officer drafts the alert. A different officer checks it, and approves it or sends it back with a reason. No single person can approve alone, and software cannot approve at all.
6. Step four, hand over. The approved draft goes to the alerting authority, such as N D M A, the National Disaster Management Authority, in the standard Common Alerting Protocol format. AEGIS stops here. It has no way to send a public warning.
7. Step five, reach people. The authority's own system passes the warning to telecom operators, who broadcast it to phones in the affected area. Response teams receive their tasks from their departments.
8. Step six, learn. After the event, what was estimated is compared with what happened. Any change to a threshold goes through the same two person approval before it is used.
9. The page also lets you switch the hazard. Pick cyclone, river flood, earthquake or heatwave, and the globe and the story follow the hazard you choose.
10. Why was this built? Few countries face as many kinds of hazard as India. The hours before a disaster are when a clear, trusted warning saves the most lives, and they are also when information is most scattered.
11. Who does it help? Agencies get one desk that shows sources, how fresh they are, and every decision with its evidence and its two approvers. Response teams get tasks through their departments, with a handover note for the next shift. Citizens still hear only from the official channel, never from AEGIS.
12. The AI is used to read, compare and explain. It can watch many sources at once, flag stale or conflicting ones, and estimate how unusual a rainfall or river level is, with a range. It never approves, never sends a warning, and never dispatches teams. Decisions stay with named officers.
13. How does a warning reach a phone? AEGIS prepares and hands over. The official channel warns, and the line between the two is deliberate. Only an approved draft crosses it.
14. The system is built from open, widely used components, that a government team can audit, host in India, and maintain.
15. Finally, where the project stands. This is a prototype for rehearsal. It is not a live warning system, and it has no government approval. Thank you for watching.

## 02-sign-in.mp4: Sign-in

1. This is the AEGIS operator sign-in page. Operators sign in with their agency account, and AEGIS sends them to their own organisation's identity provider.
2. There are three steps. Leave for your identity provider. Enter your password and second factor there. Then return to AEGIS with a signed role.
3. Your password never reaches AEGIS. You type it only on your organisation's identity provider. AEGIS checks the provider's signature before it trusts the sign-in.
4. Role and agency come from the signed token. Nothing typed in the browser can grant a role. And the maker, who drafts an alert, and the checker, who approves it, must be two different people.
5. The session is short and sealed. It expires within fifteen minutes and is cleared on sign-out. Now we open the provider's sign-in form, and stop there. This recording does not sign in.
6. This is the identity provider's own login form, a separate system from AEGIS. Signed in screens are not part of this video.

## 03-alert-journey-exercise.mp4: Alert Journey exercise (synthetic cyclone)

1. This is the AEGIS Alert Journey. It is a synthetic exercise: a made up cyclone, played out from the first signal to people being warned. Nothing in it is real, and nothing is sent. It has five phases, and three points where a human has to decide.
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

## 04-live-earth.mp4: Live Earth (opt-in public reference data)

1. Live Earth is an optional mode of the AEGIS Alert Journey. It shows real public reference data, for context only. It is not an AEGIS assessment, and nothing here is used to create alerts.
2. The page asks first. Only after you agree does the AEGIS server fetch public data on your behalf. Nothing is stored, and the data is never used to create alerts.
3. Now the globe shows real satellite imagery, real satellite orbits, and public earthquake and storm reports. All of it comes through the AEGIS server relay, and is labelled as public reference data.
4. Pick any place. Here we pick Hyderabad. The panel shows the real forecast, the river discharge, and how unusual the rain is, with ranges rather than false precision, and a plain note when data is missing.
5. Entering the city scene shows real terrain and a street map, driven by the real hourly forecast. Again, this is public context for a person to look at. It is not a forecast of impact, and it does not create a case or an alert.
6. Back on the globe, the point to remember. Everything in Live Earth is public reference data, shown for context. It is fetched through the AEGIS server, never stored, and never used to create alerts. AEGIS itself still has no way to send a warning.

## 05-command-center-tour.mp4: Command Center tour (signed out, exercise data)

1. This is the AEGIS Command Center, as seen when nobody is signed in. Everything here is synthetic exercise data. The page describes itself as geospatial awareness, simulated hazard observations, and human controlled response coordination.
2. At the top is the decision path in three steps. One, observe and verify: sources, freshness and uncertainty. Two, focus and draft: a cited review and a human written action. Three, approve and rehearse: a checker gate, and scripted tasks.
3. The counters show five registered incidents, two awaiting human review, one exercise in progress, and zero public alerts issued, because operational alerting is disabled.
4. Further down are the map and the incident queue, a monitor of how fresh each simulated source is, a synthetic replay of data coming in, hazard telemetry, and response readiness. This is how input arrives: as evidence, with its age and uncertainty shown. A separate strip of public USGS and NASA reports is labelled reference only.
5. The Incident Registry lists the synthetic cases. You can search, sort and filter them. Urban waterlogging and road inundation are awaiting review. Opening a case shows evidence, chronology and readiness only. It cannot send warnings or dispatch responders.
6. This is one synthetic case, urban waterlogging in the Hyderabad training area. A banner says plainly that it is a simulation, not a real incident. Public USGS and NASA reports near the case are context only. They are never stored with the case and cannot change its assessment or approvals.
7. Below that is the geospatial context, and a four step guide: inspect time and origin, check for corroboration, document uncertainty, and submit for independent review. Only authorised identities can approve exercise proposals.
8. The spatial correlation explorer finds candidate sources near the case, and it is careful. It states that this is not an impact forecast, and it flags readings that are absent, outdated or anomalous. A grounded evidence guide at the bottom answers only from cited evidence.
9. Hazard Watch turns evidence into triggers for a person to review. Right now the queue is empty. The page explains that an empty queue does not mean an area is safe. It only means no evidence has been turned into a trigger yet.
10. Three steps are shown. A platform admin enables a data connector. An operator refreshes the evidence once, nothing runs in the background. Then a person reviews each trigger in the queue. AEGIS never sends warnings.
11. Team Availability shows seven fictional teams and their scripted tasks. Five tasks are open and three are past their demo due window. The three slot capacity is only a planning setting for this rehearsal. Nothing here assigns, notifies or dispatches anyone.
12. AgencySync lists the department tasks. Each one is a scripted example, tied to a case, with its state, such as prepared. Selecting a task opens its audit trail. Every message says that nothing was sent. In the full product, departments receive approved tasks in their own inbox, which needs a sign-in and is not shown here.
13. The Approval Workbench is where the maker and checker work. Signed out, it shows only that a verified operator sign-in is required. One officer submits a proposal, and a different officer decides on it. Approval records document simulated decisions. They never issue public warnings or dispatch responders.
14. The Go Live Setup page lists what going live would need. Sign-in and roles, platform secrets, feature switches that are all off by default, data source keys, and written agreements for government use. No secret is shown on this page.
15. Several items are marked as not available yet, or as not met by configuration. And sending real public alerts is outside AEGIS by design. This is a prototype for rehearsal, not a live warning system. Thank you for watching.

