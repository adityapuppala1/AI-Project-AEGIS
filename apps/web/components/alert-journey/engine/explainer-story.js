/* AEGIS Alert Journey explainer — scenario data (phases, events, AI insights, decisions, towers, teams, hubs).
 * SYNTHETIC EXERCISE. Names are fictional or generic; operator names only describe the real-world ecosystem
 * (no affiliation, no integration). Nothing here is a forecast, an accuracy claim, or a live message. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};
  var C = AX.core;

  var INCIDENT = {
    title: "Exercise Cyclone ‘Tarang’", tag: 'SYNTHETIC EXERCISE',
    region: 'Nadipur river basin (fictional) · coastal east India style terrain'
  };

  /* ---------- operators (illustrative colours; towers are shared infrastructure) ---------- */
  var OPERATORS = [
    { id: 'airtel', name: 'Airtel', color: '#ff5d6c' },
    { id: 'jio', name: 'Jio', color: '#38a0ff' },
    { id: 'bsnl', name: 'BSNL', color: '#ffd34d' },
    { id: 'vi', name: 'Vi', color: '#b98cff' }
  ];

  /* ---------- phases ---------- */
  var PHASES = [
    { id: 'detect', name: 'Detect', t0: -72, t1: -54, color: '#38e1ff', icon: 'satellite',
      title: 'Space keeps watch', blurb: 'Weather, rain-radar and SAR satellites see a depression form over the Bay. AEGIS may only read licence-checked public feeds.',
      aegis: ['Reads public satellite and model data', 'Stamps every record with source, time and licence'], humans: ['Duty analyst watches the feed'],
      not: ['Does not predict yet: evidence is thin and AEGIS says so'], tryIt: 'Drag the globe, then press “Dive to region”.' },
    { id: 'predict', name: 'Predict', t0: -54, t1: -30, color: '#9b7bff', icon: 'brain',
      title: 'AI predicts, with citations', blurb: 'An ensemble of tracks narrows into a cone. A flood-risk map appears with an uncertainty band that shrinks as new evidence arrives.',
      aegis: ['Fuses tracks, rainfall and river data', 'Shows cited evidence and honest uncertainty', 'Abstains where data is stale'], humans: ['Analysts review the cited briefing'],
      not: ['Statistics are rehearsal numbers, never “accuracy”', 'Recommendation only: nothing is tasked'], tryIt: 'Turn on “Predicted flood” and “Forecast cone” in Layers.' },
    { id: 'decide', name: 'Decide', t0: -30, t1: -17.8, color: '#4be3a0', icon: 'check',
      title: 'Humans decide', blurb: 'AI recommends where to stage teams and drafts the public message. A different person must approve. AEGIS cannot send anything.',
      aegis: ['Recommends pre-positioning (greedy + exact bound)', 'Drafts a private CAP 1.2 XML (status=Draft)'], humans: ['Commander approves staging', 'Maker drafts, a different checker approves'],
      not: ['No send button exists (level L4 = never)', 'Urgency/severity/certainty stay “Unknown” in the draft'], tryIt: 'Make the checker decision when the clock pauses.' },
    { id: 'alert', name: 'Alert', t0: -17.8, t1: -14, color: '#ffb547', icon: 'radio',
      title: 'Official hand-over', blurb: 'An authorised officer takes the approved draft to the government channel. NDMA/SACHET adds the area, signs and pushes cell broadcast through each operator.',
      aegis: ['Exports the approved draft file', 'Records approval and rationale in the audit'], humans: ['Authority sets area and severity, signs, transmits'],
      not: ['AEGIS stops at the dashed line', 'Operators act on the authority, not on AEGIS'], tryIt: 'Open the Network tab and click a node.' },
    { id: 'respond', name: 'Respond', t0: -14, t1: 6, color: '#ff5d6c', icon: 'siren',
      title: 'Evacuate, deploy, adapt', blurb: 'Phones buzz, people move, roads flood, towers fail and satellites carry the second alert. Teams act on agency orders; AEGIS tracks the exercise.',
      aegis: ['Re-forecasts as new data lands', 'Flags closed roads and failing towers', 'Suggests reroutes and relief priorities'], humans: ['Commander tasks teams', 'Field crews decide on the ground'],
      not: ['Does not dispatch or notify anyone itself', 'Satellite messaging is operator-side, not an AEGIS API'], tryIt: 'Click any tower, team or vehicle to inspect it.' },
    { id: 'recover', name: 'Recover', t0: 6, t1: 24, color: '#6ea8ff', icon: 'refresh',
      title: 'Recover and learn', blurb: 'Water recedes, crews restore power and towers, and rehearsal statistics feed a reviewed learning loop.',
      aegis: ['Compares plan vs outcome (rehearsal basis)', 'Proposes threshold changes as stats-only diffs'], humans: ['Maker/checker review changes', 'Platform admin applies, with audit'],
      not: ['Approval never changes the engine by itself', 'Not an accuracy claim'], tryIt: 'Scrub back and compare Plan A vs Plan B outcomes.' }
  ];
  function phaseAt(t) {
    for (var i = PHASES.length - 1; i >= 0; i--) if (t >= PHASES[i].t0) return PHASES[i];
    return PHASES[0];
  }

  /* ---------- lanes (who acts) ---------- */
  var LANES = [
    { id: 'space', name: 'Satellites & data', color: '#38e1ff' },
    { id: 'ai', name: 'AEGIS AI', color: '#9b7bff' },
    { id: 'human', name: 'Humans (maker · checker · commander)', color: '#4be3a0' },
    { id: 'auth', name: 'Authority (NDMA / SACHET)', color: '#ffb547' },
    { id: 'telco', name: 'Telcos & towers', color: '#ff7ab0' },
    { id: 'field', name: 'Field teams', color: '#ffffff' },
    { id: 'public', name: 'Citizens', color: '#8fd3ff' }
  ];

  /* ---------- timeline events (also drive toasts) ---------- */
  var EVENTS = [
    { t: -72, lane: 'space', icon: 'satellite', title: 'Depression detected', text: 'Weather-satellite IR and scatterometer passes show a closed circulation in the Bay.' },
    { t: -66, lane: 'ai', icon: 'database', title: 'Open data ingested', text: 'Open-Meteo, NASA GIBS and Copernicus reads begin; every record keeps source, time and licence.' },
    { t: -60, lane: 'ai', icon: 'ban', title: 'AI abstains', text: 'Track spread is too wide and the river gauge feed is stale: no flood-level claim is published.' },
    { t: -48, lane: 'ai', icon: 'target', title: 'Track ensemble & cone', text: 'Eight ensemble tracks fan out; the cone of uncertainty narrows toward the Nadipur coast.' },
    { t: -36, lane: 'ai', icon: 'waves', title: 'Flood-risk map v1', text: 'Predicted inundation zone with an uncertainty band appears on the terrain.' },
    { t: -30, lane: 'human', icon: 'users', title: 'Commander: staging plan', text: 'AI recommends 3 high-ground staging sites. A human commander must choose.', decision: 'staging' },
    { t: -26, lane: 'field', icon: 'truck', title: 'Teams roll to staging', text: 'Agency-tasked teams move to the approved staging sites (outside AEGIS).' },
    { t: -20, lane: 'human', icon: 'edit', title: 'Maker drafts CAP', text: 'Private draft message prepared from the cited briefing. Status = Draft.' },
    { t: -18, lane: 'human', icon: 'shield', title: 'Checker decision', text: 'A different person reviews and approves, or requests changes.', decision: 'cap' },
    { t: -17.5, lane: 'auth', icon: 'radio', title: 'Hand-over to authority', text: 'Approved file leaves AEGIS. The authority adds area and severity, signs and transmits.' },
    { t: -17.2, lane: 'telco', icon: 'signal', title: 'Operators’ CBCs push', text: 'Cell Broadcast Centres of each operator send to towers in the target cells.' },
    { t: -16.9, lane: 'public', icon: 'phone', title: 'Phones buzz', text: 'Compatible phones in the area show the alert in local languages within minutes.' },
    { t: -16, lane: 'public', icon: 'users', title: 'Evacuation begins', text: 'Residents walk and drive to shelters on high ground; traffic control reroutes.' },
    { t: -12, lane: 'ai', icon: 'refresh', title: 'Forecast refreshed', text: 'River gauges rising; flood forecast re-run, uncertainty now ±0.24.' },
    { t: -6.2, lane: 'human', icon: 'siren', title: 'Escalate: emergency mode', text: 'Commander is asked to expand the evacuation to Zone B and open emergency mode.', decision: 'escalate' },
    { t: -3, lane: 'field', icon: 'ship', title: 'Crews move to hotspots', text: 'Ambulances and fire crews move up; boats launch the moment water reaches the streets.' },
    { t: -2.2, lane: 'auth', icon: 'radio', title: 'Update #2 alert', text: 'Surge warning pushed. Coastal towers are already failing.' },
    { t: -1.8, lane: 'telco', icon: 'satellite', title: 'Satellite fallback', text: 'Where towers are down, only compatible handsets can receive via operator-side satellite messaging.' },
    { t: 0, lane: 'space', icon: 'cyclone', title: 'Landfall', text: 'Eye crosses the coast; surge and river overtop the banks.' },
    { t: 1.9, lane: 'ai', icon: 'waves', title: 'Flood peak', text: 'Observed level meets the forecast band (synthetic).' },
    { t: 10, lane: 'field', icon: 'wrench', title: 'Crews restore towers & power', text: 'Telecom and power crews re-enter as water falls below equipment level.' },
    { t: 16, lane: 'ai', icon: 'chart', title: 'Post-event learning', text: 'Rehearsal statistics compared with outcome; threshold changes proposed as reviewed diffs.' }
  ];

  /* ---------- decisions (playback pauses until you decide) ---------- */
  var DECISIONS = [
    { id: 'staging', t: -30, title: 'Commander decision · where to stage teams?', who: 'Incident commander (human)', icon: 'users',
      intro: 'AEGIS recommends. It cannot task teams. The agency commander chooses.',
      options: [
        { id: 'B', label: 'Plan B · AI-recommended high-ground sites', badge: 'recommended', text: '3 staging sites on high ground (NE ridge, SW ridge, rural school). Roads stay open longest.', cites: ['Predicted zone ≥ 1.4 m above these sites', 'Route risk lowest for 3 of 3 sites'] },
        { id: 'A', label: 'Plan A · Central depot at City Hall', badge: 'convenient', text: 'One central yard near the river. Short drives now, but it sits inside the predicted flood zone.', cites: ['Yard ≈0.9 below the predicted peak', 'Road cut-off likely ≈ T+0h'] }
      ] },
    { id: 'cap', t: -18, title: 'Checker decision · approve the draft alert?', who: 'Checker (must differ from the maker)', icon: 'shield',
      intro: 'You are the independent checker. The maker prepared this draft from cited evidence.',
      options: [
        { id: 'approve', label: 'Approve and export the draft', badge: 'approve', text: 'Records your rationale in the audit and unlocks the file for an authorised officer.', cites: [] },
        { id: 'changes', label: 'Request changes', badge: 'reject', text: 'Returns to the maker with a rationale; a revised draft comes back for a new decision.', cites: [] }
      ] },
    { id: 'escalate', t: -6.2, title: 'Commander decision · escalate to emergency mode?', who: 'Incident commander (human)', icon: 'siren',
      intro: 'Forecast confidence is ±0.16 m and rain bands are arriving. Expand the evacuation zone?',
      options: [
        { id: 'go', label: 'Escalate: emergency mode + expand Zone B', badge: 'recommended', text: 'Opens the command board, prioritises relief and reroutes traffic.', cites: ['Roads on the predicted zone edge closing', 'Two coastal towers at risk'] },
        { id: 'hold', label: 'Hold for the next forecast run', badge: 'wait', text: 'Keeps the current plan one more cycle (not recommended).', cites: [] }
      ] }
  ];

  /* ---------- evidence chips ---------- */
  var EVID = {
    ir: { label: 'Weather-sat IR composite', src: 'INSAT-class GEO', ent: 'sat_wx' },
    sar: { label: 'SAR flood-extent pass', src: 'Sentinel-1 class', ent: 'sat_sar' },
    gpm: { label: 'Rain-radar swath', src: 'GPM class', ent: 'sat_gpm' },
    om: { label: 'Open-Meteo forecast', src: 'CC BY 4.0 · non-commercial', ent: 'hub_open' },
    glofas: { label: 'GloFAS-derived discharge', src: 'model output, not gauge data', ent: 'hub_open' },
    g1: { label: 'Gauge G-1 upstream', src: 'synthetic gauge', ent: 'gauge_1' },
    g2: { label: 'Gauge G-2 mid-reach', src: 'synthetic gauge', ent: 'gauge_2' },
    g3: { label: 'Gauge G-3 city', src: 'synthetic gauge', ent: 'gauge_3' },
    dem: { label: 'Terrain / DEM grid', src: 'synthetic', ent: null },
    osm: { label: 'Roads & facilities', src: 'ODbL extract (local)', ent: null },
    pop: { label: 'Population grid', src: 'CC BY 4.0 · local file', ent: null },
    cbc: { label: 'Cell-broadcast delivery log', src: 'operator report (synthetic)', ent: 'hub_cbc' },
    tw: { label: 'Tower health feed', src: 'operator NOC (synthetic)', ent: null }
  };

  /* ---------- AI insights (copilot feed). type: observe predict recommend abstain human handoff alert field learn ---------- */
  var INSIGHTS = [
    { t: -72, type: 'observe', title: 'Closed circulation detected', body: 'Satellite IR and scatterometer agree on a closed low in the Bay. Intensity: Depression. No impact claim is made.', ev: ['ir'], conf: 0.62, why: ['Two independent passes agree on position (±1.5°)', 'Intensity is a classification, not a forecast'] },
    { t: -66, type: 'observe', title: 'Open data online', body: 'Ingestion running on 3 licence-checked sources. IMD and India-WRIS are excluded until written terms exist, so gaps are shown, not filled.', ev: ['om', 'glofas'], conf: null, why: ['Allow-listed HTTPS sources only', 'Excluded sources are never silently replaced'] },
    { t: -60, type: 'abstain', title: 'AEGIS abstains on flood level', body: 'Track spread is ±1,000 km-equivalent and gauge G-2 is 3 h stale. Publishing a flood number now would be a guess, so none is shown.', ev: ['g2', 'ir'], conf: null, why: ['Fail-closed rule: stale or conflicting inputs → “not comparable”', 'Agreement between models is not corroboration'] },
    { t: -48, type: 'predict', title: 'Track cone published', body: 'Eight ensemble tracks converge on the Nadipur coast within ±60 km-equivalent. Landfall window: T−6h to T+6h.', ev: ['ir', 'om'], conf: 0.55, why: ['Ensemble spread narrows as new passes arrive', 'Uncertainty cone drawn from the spread, not from a claimed accuracy'] },
    { t: -36, type: 'predict', title: 'Flood-risk map v1', body: 'Predicted inundation of the river plain and coast with a wide band. Estimated peak is shown as a range, and it will move.', ev: ['om', 'glofas', 'dem'], conf: 0.5, why: ['Model discharge, not gauge data', 'Band is wide because upstream rain has not arrived'] },
    { t: -30, type: 'recommend', title: 'Pre-position teams (recommendation)', body: 'Greedy plan with exact bound suggests 3 staging sites on high ground, and abstains on a 4th site (no road data). It does not move or notify anyone.', ev: ['dem', 'osm', 'pop'], conf: 0.7, why: ['Synthetic teams and cited exposure only', 'The commander’s decision is required next'] },
    { t: -20, type: 'handoff', title: 'Draft alert prepared', body: 'Private CAP 1.2 draft assembled from templates: fixed wording, integer and closed-code placeholders only. No model text is rendered into it.', ev: ['om', 'g3'], conf: null, why: ['Urgency/severity/certainty stay “Unknown”: the authority decides', 'Translations remain pending native sign-off'] },
    { t: -17.4, type: 'handoff', title: 'Hand-over recorded', body: 'Approved file exported with the checker’s rationale. From here the authority, operators and field teams act. AEGIS only observes.', ev: [], conf: null, why: ['Audit keeps maker, checker, time and rationale'] },
    { t: -16.5, type: 'alert', title: 'Delivery observed (exercise)', body: 'Cell-broadcast delivery in the target cells: reported reach is shown with its coverage gaps, not rounded up. Hill villages without towers rely on sirens and volunteers.', ev: ['cbc', 'tw'], conf: null, why: ['Coverage ≠ delivery', 'Incompatible handsets are listed as unreached'] },
    { t: -12, type: 'predict', title: 'Forecast refreshed: ±0.24', body: 'River gauges rising on schedule. Predicted peak moved and the uncertainty band narrowed. New evidence is cited.', ev: ['g1', 'g2', 'gpm'], conf: 0.74, why: ['Re-run on every new ingest', 'Previous estimates stay in the audit trail'] },
    { t: -8, type: 'recommend', title: 'Roads at the zone edge closing', body: 'Three arterial segments will be under water within ~6 h. Suggested reroute shown in green; traffic control is a human task.', ev: ['osm', 'g3'], conf: 0.68, why: ['Closure = predicted depth > 0.3 m on road cells'] },
    { t: -6.2, type: 'human', title: 'Escalation needs a human', body: 'Forecast confidence ±0.16 and rain bands arriving. Commander is asked to expand Zone B and open emergency mode.', ev: ['gpm', 'g3'], conf: 0.8, why: ['AI can recommend, never escalate'] },
    { t: -4.5, type: 'field', title: 'Hotspots ranked', body: 'Six hotspots ranked by exposed population × predicted depth × access. Agency teams are tasked by their commander; AEGIS records the exercise.', ev: ['pop', 'sar'], conf: 0.72, why: ['Ranking is explainable: each factor is shown'] },
    { t: -2.2, type: 'alert', title: 'Update #2 · surge', body: 'Second alert prepared and approved. Coastal towers are already down, so reach there falls back to satellite-capable phones only.', ev: ['tw', 'cbc'], conf: null, why: ['Satellite path = operator-side, compatible handsets only'] },
    { t: 0, type: 'observe', title: 'Landfall observed', body: 'Eye crossing the coast. Observed surge consistent with the forecast band (synthetic rehearsal).', ev: ['ir', 'g3'], conf: null, why: ['Observation, not a claim of forecast accuracy'] },
    { t: 1.9, type: 'observe', title: 'Peak flood in the band', body: 'Observed peak level is inside the predicted band. Rehearsal statistics only, not accuracy.', ev: ['sar', 'g3'], conf: null, why: ['Basis: this synthetic scenario'] },
    { t: 10, type: 'field', title: 'Safe to re-enter equipment sites', body: 'Water below equipment level at 3 tower sites; crews can restore power and radio. Access by agency decision.', ev: ['tw', 'g3'], conf: 0.7, why: ['Depth < 0.3 m at the cabinet'] },
    { t: 16, type: 'learn', title: 'Learning loop', body: 'Plan vs outcome compared on a rehearsal basis. Proposed threshold changes are stats-only diffs: maker submits, a different checker decides, only an admin can apply.', ev: [], conf: null, why: ['Approval never changes the engine by itself'] }
  ];

  /* ---------- "now doing" ticker ---------- */
  var TICKER = [
    [-72, 'Fusing 2 satellite passes…'], [-66, 'Checking source licences and freshness…'], [-60, 'Abstaining: not enough evidence for a flood claim'],
    [-54, 'Running 8-member track ensemble…'], [-42, 'Estimating flood depth per terrain cell…'], [-32, 'Ranking staging sites by access and exposure…'],
    [-24, 'Re-running forecast with new river data…'], [-20, 'Filling the draft from fixed templates…'], [-18, 'Waiting for a human decision'],
    [-17, 'Watching delivery reports (read-only)…'], [-12, 'Narrowing the uncertainty band…'], [-8, 'Checking which roads will close…'],
    [-4.5, 'Ranking hotspots by exposed people × depth…'], [-1, 'Tracking tower health and fallback paths…'], [3, 'Comparing observed water with the forecast…'],
    [9, 'Looking for safe re-entry windows…'], [14, 'Building the rehearsal learning report…']
  ];
  function tickerAt(t) { var s = TICKER[0][1]; for (var i = 0; i < TICKER.length; i++) if (t >= TICKER[i][0]) s = TICKER[i][1]; return s; }

  /* ---------- playback pacing: slow motion around the moments worth watching ---------- */
  var SLOWMO = [
    { t0: -17.9, t1: -16.4, f: 0.07, label: 'cell broadcast' },
    { t0: -2.4, t1: -1.5, f: 0.1, label: 'update #2' },
    { t0: -0.4, t1: 0.9, f: 0.28, label: 'landfall' }
  ];
  function rateFactor(t) { for (var i = 0; i < SLOWMO.length; i++) if (t >= SLOWMO[i].t0 && t < SLOWMO[i].t1) return SLOWMO[i].f; return 1; }

  /* ---------- places (labels) ---------- */
  var PLACES = [
    { id: 'place_city', name: 'Nadipur City', sub: 'synthetic · ≈44,000 modelled residents', x: 14, z: 12, kind: 'city' },
    { id: 'place_rural', name: 'Kheti Nagar', sub: 'rural farmland', x: -22, z: 8, kind: 'rural' },
    { id: 'place_hill', name: 'Pahadgaon', sub: 'hill village · coverage gap', x: -40, z: -26, kind: 'hill' },
    { id: 'place_coast', name: 'Sagar Tat', sub: 'coast & harbour', x: 36, z: 38, kind: 'coast' },
    { id: 'place_river', name: 'Nadi river', sub: 'floods first', x: 0, z: -2, kind: 'river' },
    { id: 'place_ridge', name: 'Paschim ranges', sub: 'catchment', x: -48, z: 14, kind: 'hill' }
  ];

  /* ---------- infrastructure ---------- */
  var TOWER_DEFS = [
    { id: 'T01', name: 'BTS-01 Old Town', x: 4, z: 18 }, { id: 'T02', name: 'BTS-02 Riverside', x: 24, z: 16 },
    { id: 'T03', name: 'BTS-03 Market', x: 18, z: -2 }, { id: 'T04', name: 'BTS-04 Harbour Jetty', x: 47, z: 33 },
    { id: 'T05', name: 'BTS-05 Coastal Road', x: 40, z: 29 }, { id: 'T06', name: 'BTS-06 South Delta', x: 26, z: 39 },
    { id: 'T07', name: 'BTS-07 Rural Hub', x: -10, z: 8 }, { id: 'T08', name: 'BTS-08 Hill Link', x: -30, z: -12 },
    { id: 'T09', name: 'BTS-09 NE Ridge', x: 30, z: -2 }, { id: 'T10', name: 'BTS-10 SW Ridge', x: 2, z: 30 },
    { id: 'T11', name: 'BTS-11 North Gate', x: 8, z: -8 }, { id: 'T12', name: 'BTS-12 South Fields', x: 12, z: 34 }
  ];
  var SHELTER_DEFS = [
    { id: 'S1', name: 'Hill School Shelter', x: 36, z: -13, cap: 900, route: 'NE' },
    { id: 'S2', name: 'Community Hall Shelter', x: -5, z: 33, cap: 700, route: 'SW' },
    { id: 'S3', name: 'Rural School Shelter', x: -18, z: 15, cap: 600, route: 'NW' }
  ];
  var GAUGE_DEFS = [
    { id: 'gauge_1', name: 'Gauge G-1 upstream', x: -26, z: -26, bias: 0 },
    { id: 'gauge_2', name: 'Gauge G-2 mid-reach', x: -4, z: -5, bias: 0.04 },
    { id: 'gauge_3', name: 'Gauge G-3 city', x: 21, z: 13, bias: 0.07 }
  ];
  var FACILITY_DEFS = [
    { id: 'fac_hosp', name: 'District Hospital', kind: 'hospital', x: 6, z: 10 },
    { id: 'fac_sub', name: 'Power substation', kind: 'substation', x: 24, z: 12 },
    { id: 'fac_eoc', name: 'State EOC · AEGIS Ops Desk', kind: 'eoc', x: 2, z: 6 },
    { id: 'fac_gs', name: 'Satellite ground station', kind: 'dish', x: -36, z: -4 },
    { id: 'fac_radar', name: 'Weather radar (synthetic)', kind: 'radar', x: -12, z: -21 },
    { id: 'fac_light', name: 'Lighthouse', kind: 'lighthouse', x: 50, z: 30 }
  ];
  /* off-map communication nodes drawn floating in the sky */
  var HUB_DEFS = [
    { id: 'hub_open', name: 'Open data · Open-Meteo · NASA · Copernicus', short: 'Open APIs', x: -72, y: 54, z: 24, color: '#38e1ff', icon: 'cloud' },
    { id: 'hub_ndma', name: 'NDMA / SACHET (C-DOT) · New Delhi', short: 'NDMA · SACHET', x: -62, y: 62, z: -70, color: '#ffb547', icon: 'building' },
    { id: 'hub_cbc_airtel', name: 'Airtel · Cell Broadcast Centre', short: 'CBC Airtel', x: 78, y: 46, z: -34, color: '#ff5d6c', icon: 'server', op: 'airtel' },
    { id: 'hub_cbc_jio', name: 'Jio · Cell Broadcast Centre', short: 'CBC Jio', x: 88, y: 50, z: -52, color: '#38a0ff', icon: 'server', op: 'jio' },
    { id: 'hub_cbc_bsnl', name: 'BSNL · Cell Broadcast Centre', short: 'CBC BSNL', x: 98, y: 46, z: -70, color: '#ffd34d', icon: 'server', op: 'bsnl' },
    { id: 'hub_cbc_vi', name: 'Vi · Cell Broadcast Centre', short: 'CBC Vi', x: 108, y: 50, z: -88, color: '#b98cff', icon: 'server', op: 'vi' }
  ];
  var SAT_DEFS = [
    { id: 'sat_sar', name: 'SAR satellite (Sentinel-1 class)', kind: 'leo', color: '#38e1ff', alt: 96, period: 62, ph: 0.1, inc: 0.35, role: 'Radar sees through cloud → flood extent', product: 'SAR flood-extent pass' },
    { id: 'sat_gpm', name: 'Rain-radar satellite (GPM class)', kind: 'leo', color: '#4be3a0', alt: 108, period: 85, ph: 0.55, inc: -0.5, role: 'Measures rainfall rate under the storm', product: 'Rain-rate swath' },
    { id: 'sat_wx', name: 'Weather satellite (INSAT class, GEO)', kind: 'geo', color: '#ffb547', pos: [-150, 190, 120], role: 'Infrared cloud tracking every 30 min', product: 'IR composite' },
    { id: 'sat_navic', name: 'Nav/messaging satellite (NavIC class)', kind: 'geo', color: '#9b7bff', pos: [140, 200, -160], role: 'One-way alert broadcast to compatible receivers', product: 'Messaging (operator/agency-side)' },
    { id: 'sat_d2c', name: 'Direct-to-cell satellite (D2C class)', kind: 'leo', color: '#ff7ab0', alt: 88, period: 48, ph: 0.8, inc: 0.0, role: 'Reaches compatible handsets without towers', product: 'D2C emergency alert (operator-side)' }
  ];

  /* ---------- evacuation routes (polylines; the world snaps them to the terrain) ---------- */
  var ROUTES = {
    NE: [[24, 6], [28, 1], [31, -4], [34, -9], [36, -13]],
    SW: [[2, 24], [1, 28], [-2, 31], [-5, 33]],
    NW: [[2, 8], [-4, 9], [-10, 11], [-14, 13], [-18, 15]]
  };
  /* road polylines (besides the city grid) */
  var ARTERIALS = [
    [[32, 6], [32, 0], [34, -8], [36, -13]],             // NE hill road
    [[-4, 24], [-2, 31], [-5, 33]],                      // SW road
    [[-4, 6], [-12, 10], [-18, 15], [-24, 10], [-30, 4]],  // rural road
    [[32, 24], [38, 27], [44, 30], [47, 33]],             // harbour road
    [[34, 18], [42, 22], [47, 27], [50, 30]]              // coast road
  ];

  /* staging sites shown as recommendation markers (Plan B) */
  var STAGING_SITES = [
    { id: 'st_ne', name: 'Staging NE ridge', x: 32, z: -6 }, { id: 'st_sw', name: 'Staging SW ridge', x: 1, z: 30 }, { id: 'st_nw', name: 'Staging rural school', x: -16, z: 12 }
  ];
  var HOTSPOTS = [
    { id: 'hs1', name: 'HS-1 Riverside colony', x: 22, z: 13 }, { id: 'hs2', name: 'HS-2 Market quarter', x: 10, z: 20 },
    { id: 'hs3', name: 'HS-3 South fields', x: 10, z: 26 }, { id: 'hs4', name: 'HS-4 Harbour', x: 42, z: 31 }
  ];

  /* ---------- phone message templates (illustrative; translations pending native sign-off) ---------- */
  var PHONE_MSGS = {
    en: { head: 'FLOOD ALERT · EXERCISE', body: 'Cyclone Tarang landfall expected. Move to higher ground now. Leave the river bank and low roads.', lang: 'English' },
    hi: { head: 'बाढ़ चेतावनी · अभ्यास', body: 'चक्रवात तरंग का भूस्खलन अपेक्षित है। अभी ऊँचे स्थान पर जाएँ। नदी तट और निचली सड़कें खाली करें।', lang: 'हिन्दी' },
    te: { head: 'వరద హెచ్చరిక · సాధన', body: 'తరంగ్ తుఫాను తీరం దాటనుంది. ఇప్పుడే ఎత్తైన ప్రదేశానికి వెళ్లండి. నది ఒడ్డు, లోతట్టు రోడ్లు ఖాళీ చేయండి.', lang: 'తెలుగు' }
  };
  var PHONE_MSGS2 = {
    en: { head: 'UPDATE · SURGE WARNING', body: 'Storm surge rising. Stay at the shelter. Do not return home.', lang: 'English' },
    hi: { head: 'अपडेट · सर्ज चेतावनी', body: 'तूफ़ानी लहरें बढ़ रही हैं। आश्रय में रहें। घर न लौटें।', lang: 'हिन्दी' },
    te: { head: 'అప్‌డేట్ · ఉప్పెన హెచ్చరిక', body: 'తుఫాను అలలు పెరుగుతున్నాయి. ఆశ్రయంలోనే ఉండండి. ఇంటికి తిరగవద్దు.', lang: 'తెలుగు' }
  };

  /* ---------- "Ask AEGIS" (grounded intents; anything else → abstain) ---------- */
  var ASK = [
    { id: 'first', q: 'Which areas flood first?', re: /(flood\w*|inundat\w*).*(first|early|where)|(first|early).*(flood|area)|which area/i },
    { id: 'stage', q: 'Where should teams stage?', re: /(stage|staging|position|pre-?position|deploy|where.*team)/i },
    { id: 'why', q: 'Why did you abstain?', re: /(abstain|why.*(no|not)|refus|can.?t.*(say|tell))/i },
    { id: 'send', q: 'Can AEGIS send the alert?', re: /(send|transmit|broadcast|push).*(alert|message|sms|phone)|can you (send|alert)/i },
    { id: 'conf', q: 'How confident is the forecast?', re: /(confiden|uncertain|accura|sure|reliab)/i },
    { id: 'towers', q: 'Which towers are at risk?', re: /(tower|bts|network|signal|telecom|coverage)/i },
    { id: 'reach', q: 'How many people were reached?', re: /(reach|deliver|receiv|how many.*(people|phone))/i }
  ];

  /* ---------- tower schedule from the flood model (fail when water reaches the cabinet, restore after crews) ---------- */
  function towerSchedule(h) {
    var fail = Infinity, clear = Infinity, t;
    for (t = C.TMIN; t <= C.TMAX; t += 0.05) {
      if (fail === Infinity && C.floodAt(t) > h + 0.55) fail = t;
      if (fail !== Infinity && t > fail && C.floodAt(t) < h + 0.3) { clear = t; break; }
    }
    return { fail: fail, restore: clear === Infinity ? Infinity : clear + 2.2 };
  }
  var TOWERS = TOWER_DEFS.map(function (d, i) {
    var h = C.H(d.x, d.z), s = towerSchedule(h);
    var hosts = OPERATORS.filter(function (o, k) { return (i + k) % 4 !== 3 || i % 3 === 0; }).map(function (o) { return o.id; });
    return { id: d.id, name: d.name, x: d.x, z: d.z, h: h, fail: s.fail, restore: s.restore, hosts: hosts, battery: 4 + (i % 3) * 2, radius: 17 };
  });
  var SUB = FACILITY_DEFS.filter(function (f) { return f.kind === 'substation'; })[0];
  var SUB_H = C.H(SUB.x, SUB.z), SUB_SCHED = towerSchedule(SUB_H - 0.1);
  function towerStatus(tw, t) {
    if (t >= tw.fail && t < tw.restore) return 'down';
    if (C.floodAt(t) > tw.h + 0.15 || C.weatherAt(t, tw.x, tw.z).wind > 0.82) return 'degraded';
    return 'ok';
  }
  function powerOutage(t) { return t >= SUB_SCHED.fail && t < SUB_SCHED.restore + 1.5; }

  /* ---------- teams: waypoints [t, x, z, status]; Plan A = central yard (floods), Plan B = AI high-ground sites ---------- */
  var DEPOT = [58, -34], YARD = [16, 4], NE = [32, -6], NE2 = [30, -2], SW = [1, 30], NW = [-16, 12], HOSP = [7, 11], S1P = [34, -11], HS1 = [22, 13], HS2 = [10, 20], HS3 = [10, 26], HS4 = [42, 31];
  function wp(t, p, st) { return [t, p[0], p[1], st]; }
  function mk(id, name, kind, color, wpB, wpA, info) { return { id: id, name: name, kind: kind, color: color, wpB: wpB, wpA: wpA || wpB, info: info }; }
  function crewPath(site, stops) {
    stops = stops.filter(function (s) { return isFinite(s.at); }).sort(function (a, b) { return a.at - b.at; });
    var first = stops.length ? stops[0].at - 2.2 : 12, out = [wp(-60, DEPOT, 'Depot'), wp(first - 9, DEPOT, 'Depot'), wp(first - 7, site, 'Staged')];
    stops.forEach(function (s) { out.push(wp(s.at - 2.2, s.p, 'Deployed'), wp(s.at, s.p, 'Deployed')); });
    out.push(wp((stops.length ? stops[stops.length - 1].at : 20) + 2.5, site, 'Returning'));
    return out;
  }
  var towerStops = TOWERS.map(function (tw) { return { at: tw.restore, p: [tw.x, tw.z] }; });
  var teamsB = {
    R1: [wp(-60, DEPOT, 'Depot'), wp(-27, DEPOT, 'Depot'), wp(-24, NE, 'En route'), wp(-22, NE, 'Staged'), wp(-2, NE, 'Staged'), wp(-0.2, HS1, 'Deployed'), wp(9, HS1, 'Deployed'), wp(11, NE, 'Returning'), wp(13, NE, 'Staged')],
    R2: [wp(-60, DEPOT, 'Depot'), wp(-27, DEPOT, 'Depot'), wp(-24, SW, 'En route'), wp(-22, SW, 'Staged'), wp(-1.5, SW, 'Staged'), wp(0.4, HS2, 'Deployed'), wp(9, HS2, 'Deployed'), wp(11, SW, 'Returning'), wp(13, SW, 'Staged')],
    M1: [wp(-60, DEPOT, 'Depot'), wp(-26, DEPOT, 'Depot'), wp(-23, NW, 'En route'), wp(-20, NW, 'Staged'), wp(-3, NW, 'Staged'), wp(-1.5, HOSP, 'Deployed'), wp(12, HOSP, 'Deployed'), wp(14, NW, 'Returning')],
    F1: [wp(-60, DEPOT, 'Depot'), wp(-26, DEPOT, 'Depot'), wp(-23, SW, 'En route'), wp(-21, SW, 'Staged'), wp(-4, SW, 'Staged'), wp(-3, HS3, 'Deployed'), wp(9, HS3, 'Deployed'), wp(11, SW, 'Returning')]
  };
  var teamsA = {
    R1: [wp(-60, DEPOT, 'Depot'), wp(-27, DEPOT, 'Depot'), wp(-24, YARD, 'En route'), wp(-22, YARD, 'Staged'), wp(0.4, YARD, 'Staged'), wp(0.8, YARD, 'Cut off'), wp(3.6, HS1, 'Deployed'), wp(10, HS1, 'Deployed'), wp(14, NE, 'Returning')],
    R2: [wp(-60, DEPOT, 'Depot'), wp(-27, DEPOT, 'Depot'), wp(-24, YARD, 'En route'), wp(-22, YARD, 'Staged'), wp(0.4, YARD, 'Staged'), wp(0.8, YARD, 'Cut off'), wp(4.2, HS2, 'Deployed'), wp(10, HS2, 'Deployed'), wp(14, SW, 'Returning')],
    M1: [wp(-60, DEPOT, 'Depot'), wp(-26, DEPOT, 'Depot'), wp(-23, YARD, 'En route'), wp(-20, YARD, 'Staged'), wp(0.4, YARD, 'Staged'), wp(0.8, YARD, 'Cut off'), wp(4.6, HOSP, 'Deployed'), wp(12, HOSP, 'Deployed'), wp(16, NW, 'Returning')],
    F1: [wp(-60, DEPOT, 'Depot'), wp(-26, DEPOT, 'Depot'), wp(-23, YARD, 'En route'), wp(-21, YARD, 'Staged'), wp(0.4, YARD, 'Staged'), wp(0.8, YARD, 'Cut off'), wp(5, HS3, 'Deployed'), wp(10, HS3, 'Deployed'), wp(14, SW, 'Returning')]
  };
  var TEAM_DEFS = [
    mk('R1', 'Rescue boats Alpha', 'boat', '#ff9d3c', teamsB.R1, teamsA.R1, { crew: 8, mission: 'Water rescue in Riverside colony', hotspot: 'HS-1 Riverside colony' }),
    mk('R2', 'Rescue boats Bravo', 'boat', '#ffb547', teamsB.R2, teamsA.R2, { crew: 8, mission: 'Water rescue in the market quarter and old town', hotspot: 'HS-2 Market quarter' }),
    mk('M1', 'Ambulance convoy', 'ambulance', '#ffffff', teamsB.M1, teamsA.M1, { crew: 6, mission: 'Hospital access and patient transfer', hotspot: 'District Hospital' }),
    mk('M2', 'Mobile field hospital', 'truck', '#ff5d6c', [wp(-60, DEPOT, 'Depot'), wp(-24, DEPOT, 'Depot'), wp(-21, S1P, 'En route'), wp(-18, S1P, 'Staged'), wp(20, S1P, 'Staged')], null, { crew: 14, mission: 'Medical post beside Hill School Shelter', hotspot: 'Shelter S1' }),
    mk('F1', 'Fire & rescue', 'firetruck', '#ff4040', teamsB.F1, teamsA.F1, { crew: 10, mission: 'Pumping and rescue from damaged structures', hotspot: 'HS-3 South fields' }),
    mk('L1', 'Relief supplies convoy', 'truck', '#4be3a0', [wp(-60, DEPOT, 'Depot'), wp(-22, DEPOT, 'Depot'), wp(-18, [36, -13], 'En route'), wp(-15, [36, -13], 'Staged'), wp(-1, [36, -13], 'Staged'), wp(1.5, [-5, 33], 'Deployed'), wp(12, [-5, 33], 'Deployed'), wp(15, [36, -13], 'Returning')], null, { crew: 6, mission: 'Water, food and blankets to shelters S1 and S2', hotspot: 'Shelters S1, S2' }),
    mk('T1', 'Telecom restoration crew', 'van', '#ff7ab0', crewPath(NE2, towerStops), null, { crew: 4, mission: 'Restore towers as soon as water falls below the equipment', hotspot: 'Flooded BTS sites' }),
    mk('T2', 'Power restoration crew', 'van', '#ffd34d', crewPath([28, 2], [{ at: SUB_SCHED.restore, p: [24, 12] }]), null, { crew: 5, mission: 'Re-energise the flooded substation', hotspot: 'Power substation' }),
    mk('P1', 'Traffic control', 'police', '#6ea8ff', [wp(-60, DEPOT, 'Depot'), wp(-18, DEPOT, 'Depot'), wp(-16.5, [20, 6], 'Deployed'), wp(-9, [8, 20], 'Deployed'), wp(-3, [26, 4], 'Deployed'), wp(10, [26, 4], 'Deployed'), wp(14, NE2, 'Returning')], null, { crew: 6, mission: 'Contraflow on evacuation roads; closures at flooded segments', hotspot: 'Evacuation roads' }),
    mk('A1', 'Air rescue helicopter', 'heli', '#ffffff', [wp(-60, [120, -120], 'Depot'), wp(-8, [120, -120], 'Depot'), wp(-4, [40, -12], 'En route'), wp(-0.5, HS1, 'Deployed'), wp(2, HS2, 'Deployed'), wp(5, HS4, 'Deployed'), wp(10, [26, -8], 'Deployed'), wp(14, [120, -120], 'Returning')], null, { crew: 4, mission: 'Winch rescue from roofs and spotting isolated groups', hotspot: 'HS-4 Harbour' }),
    mk('D1', 'Drone scouts', 'drone', '#38e1ff', [wp(-60, NE2, 'Staged'), wp(-12, NE2, 'Staged'), wp(-9, HS1, 'Deployed'), wp(0, HS2, 'Deployed'), wp(4, HS4, 'Deployed'), wp(9, [12, 6], 'Deployed'), wp(12, NE2, 'Returning')], [wp(-60, YARD, 'Staged'), wp(-12, YARD, 'Staged'), wp(-9, HS1, 'Deployed'), wp(0, HS2, 'Deployed'), wp(4, HS4, 'Deployed'), wp(9, [12, 6], 'Deployed'), wp(12, YARD, 'Returning')], { crew: 2, mission: 'Live flood mapping and finding stranded people', hotspot: 'All zones' }),
    mk('D2', 'Drone relay', 'drone', '#9b7bff', [wp(-60, SW, 'Staged'), wp(-3, SW, 'Staged'), wp(-1, HS3, 'Deployed'), wp(4, HS4, 'Deployed'), wp(10, HS2, 'Deployed'), wp(13, SW, 'Returning')], null, { crew: 2, mission: 'Radio relay for crews where towers are down', hotspot: 'Coast & harbour' })
  ];

  /* ---------- "reality check" panel ---------- */
  var REALITY = [
    { h: 'Can AEGIS send alerts to Airtel / Jio / BSNL / Vi users?', v: 'NO · by design', k: 'no',
      p: 'Repo rules (AGENTS.md, roadmap level L4 “never”): no SMTP, webhook, CAP feed or telco transport. AEGIS can only export a private draft CAP 1.2 XML after a different human checker approves.',
      li: ['In India public alerts run through the government channel: NDMA / SACHET (built by C-DOT on CAP), which instructs operators’ Cell Broadcast Centres.', 'Telcos do not take commands from a private platform; a formal agreement with the authority would be required.'] },
    { h: 'What AEGIS legitimately does', v: 'YES · prepare & hand over', k: 'yes',
      li: ['Watches licence-checked sources and shows cited evidence; abstains when data is stale.', 'Recommends staging and drafts a message; humans decide (maker ≠ checker).', 'Hands the approved file to an authorised officer.', 'Rehearses the whole chain in exercises and drills.'] },
    { h: 'Public / open API access', v: 'PARTLY · per source', k: 'mix', table: [
      ['Open-Meteo (weather, GloFAS-derived flood)', 'y', 'usable · CC BY 4.0, non-commercial'], ['USGS quakes · NASA EONET · GIBS imagery', 'y', 'usable · credit required'],
      ['Copernicus ERA5 / GloFAS', 'm', 'free account / token'], ['NASA GPM IMERG', 'm', 'Earthdata login'], ['Google Flood Forecasting', 'm', 'waitlist · key pending'],
      ['GDACS', 'm', 'terms to confirm'], ['IMD rainfall · India-WRIS / CWC', 'n', 'excluded until written terms']],
      p: 'From research/real-data/LICENCES.md (checked 2026-11-02). No key entered, no live source called.' },
    { h: 'Patent for satellite-to-ground-team communication?', v: 'UNLIKELY as a broad idea', k: 'mix',
      p: 'Not legal advice; the repo holds no patent search. The broad concept is crowded prior art: CAP, SACHET, NavIC messaging, ETWS/WEA cell broadcast, direct-to-cell alerts.',
      li: ['Narrower combinations might be protectable (fail-closed cited gating + independent maker-checker + signed-scope hand-over).', 'India’s Patents Act s.3(k) restricts software “per se”; a technical effect must be shown.', 'See an Indian patent attorney and run a prior-art search before any public disclosure (demos can affect novelty).'] },
    { h: 'Real path to end users', v: 'Needs authority + operators', k: 'mix',
      li: ['Partnership with the state SDMA / NDMA for an authorised CAP feed.', 'Operator onboarding: Cell Broadcast Centre per operator.', 'Satellite fallback is operator/agency-side (NavIC messaging, direct-to-cell), not an API AEGIS can call.', 'Message wording needs native-speaker sign-off.'] }
  ];

  /* ---------- director (auto camera) and camera presets ---------- */
  var DIRECTOR = [
    [-72, 'orbit'], [-62, 'india'], [-56, 'dive'], [-48, 'cone'], [-38, 'region'], [-31, 'cityTop'], [-24, 'comms'], [-19, 'ops'], [-17.6, 'comms'],
    [-16.6, 'cityLow'], [-14.5, 'roads'], [-9, 'river'], [-5, 'cityTop'], [-2.8, 'coast'], [0, 'cityLow'], [2.5, 'floodCity'], [5, 'teams'], [9, 'street'],
    [13, 'cityTop'], [20, 'region']
  ];
  function directorAt(t) { var p = DIRECTOR[0][1]; for (var i = 0; i < DIRECTOR.length; i++) if (t >= DIRECTOR[i][0]) p = DIRECTOR[i][1]; return p; }
  /* theta: azimuth (0 looks north from the south, π/2 from the east…), phi: polar (0 = top-down, π/2 = horizon) */
  var PRESETS = {
    region: { label: 'Region', icon: 'map', target: [0, 0, 4], r: 190, theta: 0.75, phi: 0.98 },
    cone: { label: 'Sea & cone', icon: 'cyclone', target: [105, 0, 105], r: 240, theta: -2.3, phi: 0.95 },
    cityTop: { label: 'Bird’s eye', icon: 'eye', target: [14, 0, 12], r: 64, theta: 0.4, phi: 0.45 },
    city: { label: 'City', icon: 'building', target: [14, 0.5, 12], r: 34, theta: 0.9, phi: 1.12 },
    cityLow: { label: 'Ground view', icon: 'users', target: [16, 1.4, 14], r: 24, theta: 1.1, phi: 1.24 },
    street: { label: 'Street', icon: 'users', target: [15, 1.4, 14], r: 8, theta: 2.3, phi: 1.43 },
    ops: { label: 'Ops centre', icon: 'shield', target: [2, 2.4, 6], r: 15, theta: 0.7, phi: 1.2 },
    comms: { label: 'Comms net', icon: 'radio', target: [10, 22, -10], r: 165, theta: 1.35, phi: 1.05 },
    river: { label: 'River', icon: 'waves', target: [-6, 1, -4], r: 46, theta: -0.7, phi: 1.0 },
    coast: { label: 'Coast', icon: 'cloud', target: [34, 0, 36], r: 46, theta: 1.35, phi: 1.2 },
    hills: { label: 'Hills', icon: 'mountain', target: [-34, 6, -22], r: 74, theta: 2.0, phi: 1.05 },
    rural: { label: 'Rural', icon: 'home', target: [-20, 3, 10], r: 30, theta: 0.55, phi: 1.1 },
    roads: { label: 'Roads', icon: 'route', target: [20, 1, 4], r: 44, theta: 0.2, phi: 0.95 },
    floodCity: { label: 'Flood', icon: 'waves', target: [16, 1.2, 14], r: 30, theta: 1.4, phi: 1.1 },
    teams: { label: 'Teams', icon: 'truck', target: [18, 1, 12], r: 50, theta: -0.4, phi: 0.82 },
    top: { label: 'Map', icon: 'map', target: [0, 0, 0], r: 200, theta: 0, phi: 0.001 }
  };

  AX.story = {
    INCIDENT: INCIDENT, OPERATORS: OPERATORS, PHASES: PHASES, phaseAt: phaseAt, LANES: LANES, EVENTS: EVENTS, DECISIONS: DECISIONS, EVID: EVID,
    INSIGHTS: INSIGHTS, tickerAt: tickerAt, SLOWMO: SLOWMO, rateFactor: rateFactor, PLACES: PLACES,
    TOWERS: TOWERS, towerStatus: towerStatus, powerOutage: powerOutage, SUB_SCHED: SUB_SCHED, SHELTERS: SHELTER_DEFS, GAUGES: GAUGE_DEFS,
    FACILITIES: FACILITY_DEFS, HUBS: HUB_DEFS, SATS: SAT_DEFS, ROUTES: ROUTES, ARTERIALS: ARTERIALS, TEAMS: TEAM_DEFS, STAGING_SITES: STAGING_SITES,
    HOTSPOTS: HOTSPOTS, DEPOT: DEPOT, PHONE_MSGS: PHONE_MSGS, PHONE_MSGS2: PHONE_MSGS2, ASK: ASK, REALITY: REALITY,
    DIRECTOR: DIRECTOR, directorAt: directorAt, PRESETS: PRESETS
  };
}
