/* IndTrana Alert Journey explainer — mission-control UI: HUD, timeline, copilot, teams, network, inspector, minimap, labels, decisions. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {}, C = AX.core, S = AX.story, U = AX.UI = {};
  var app, ctx, F, $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var ICON = {
    play: 'M7 4l13 8-13 8z', pause: 'M7 5v14M17 5v14', skipF: 'M5 5l10 7-10 7zM18 5v14', skipB: 'M19 5L9 12l10 7zM6 5v14', ff: 'M4 6l8 6-8 6zM12 6l8 6-8 6z', rewind: 'M20 6l-8 6 8 6zM12 6l-8 6 8 6z',
    layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z', satellite: 'M10 9h4v6h-4zM3 10h5v4H3zM16 10h5v4h-5zM12 9V5M12 19v-4',
    sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z', brain: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', check: 'M4 12l5 5L20 6',
    radio: 'M4.9 19.1a10 10 0 010-14.2M7.8 16.2a6 6 0 010-8.4M16.2 7.8a6 6 0 010 8.4M19.1 4.9a10 10 0 010 14.2M12 11a1 1 0 100 2 1 1 0 000-2z', siren: 'M7 18v-6a5 5 0 0110 0v6M5 18h14M12 3v2M4 7l1.5 1.5M20 7l-1.5 1.5',
    refresh: 'M20 11a8 8 0 10-2 6M20 5v6h-6', database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8', target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z', waves: 'M3 8c3-3 5 3 9 0s6 3 9 0M3 14c3-3 5 3 9 0s6 3 9 0M3 20c3-3 5 3 9 0s6 3 9 0',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3 3 0 010 6M19 20c0-2.5-1-4.5-3-5.5', truck: 'M2 7h11v9H2zM13 10h4l3 3v3h-7zM6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', shield: 'M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6z', signal: 'M4 20v-3M9 20v-7M14 20V9M19 20V4', phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
    ship: 'M3 16l2 4h14l2-4zM12 3v9M12 12H6l6-7zM12 12h5l-5-6', cyclone: 'M12 10a2 2 0 100 4 2 2 0 000-4zM12 3c5 0 7 4 5 7M21 12c0 5-4 7-7 5M12 21c-5 0-7-4-5-7M3 12c0-5 4-7 7-5', wrench: 'M14 6a4 4 0 005 5l-9 9a2 2 0 01-3-3l9-9a4 4 0 00-2-2z',
    chart: 'M4 20V6M4 20h16M8 16v-4M12 16V9M16 16v-6', map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', building: 'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18', mountain: 'M2 20l7-12 4 6 3-4 6 10z',
    home: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6', route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6', cloud: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.7 1A3.5 3.5 0 0117 18z',
    alert: 'M12 3l10 18H2zM12 10v5M12 18v.5', info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5', x: 'M5 5l14 14M19 5L5 19', chevron: 'M8 5l8 7-8 7', hospital: 'M4 21V6h16v15M12 9v6M9 12h6M9 21v-4h6v4',
    zap: 'M13 2L4 14h7l-1 8 9-12h-7z', radar: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 12l6-6M12 8a4 4 0 100 8 4 4 0 000-8z', compass: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15 9l-2 5-5 1 2-5z', gauge: 'M4 18a9 9 0 1116 0M12 18l4-6',
    tower: 'M12 3v18M7 21l5-14 5 14M9 13h6M5 7a8 8 0 012-3M19 7a8 8 0 00-2-3', server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', pin: 'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    ambulance: 'M2 16V8h12v8M14 11h4l3 3v2M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4zM8 10v4M6 12h4', flame: 'M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z',
    heli: 'M3 6h18M12 6v4M7 10h8a4 4 0 014 4v2H9a4 4 0 01-2-6zM8 19h8', drone: 'M12 10a2 2 0 100 4 2 2 0 000-4zM5 6h4M15 6h4M5 18h4M15 18h4M9 10L7 7M15 10l2-3M9 14l-2 3M15 14l2 3', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3', wind: 'M3 8h10a3 3 0 100-3M3 12h15a3 3 0 110 3M3 16h8a2.5 2.5 0 11-2.5 2.5', rain: 'M7 15a4 4 0 01-.5-8 5.5 5.5 0 0110.7 1A3.5 3.5 0 0117 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3',
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5', expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    help: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 4M12 17.5v.5', send: 'M3 11l18-8-8 18-2-8z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    crosshair: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 100 8 4 4 0 000-8z', globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
    pop: 'M5 20V10l7-6 7 6v10zM10 20v-6h4v6', dot: 'M12 10a2 2 0 100 4 2 2 0 000-4z', arrow: 'M5 12h14M13 6l6 6-6 6'
  };
  function ic(n, sz, cls) { return '<svg class="ic ' + (cls || '') + '" width="' + (sz || 16) + '" height="' + (sz || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICON[n] || ICON.dot) + '"/></svg>'; }
  U.ic = ic;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function fN(n) { return Math.round(n).toLocaleString('en-IN'); }
  function fP(x) { return Math.round(x * 100) + '%'; }
  var laneCol = {}; S.LANES.forEach(function (l) { laneCol[l.id] = l.color; });
  var tipEl, labelsEl, trackW = 600, rafT = 0, slow = { kpi: 0, side: 0, mini: 0, phone: 0, labels: 0 }, shownInsights = -1, lastPhase = null, curTab = 'story', labelEls = {}, hoverId = null, endShown = false;
  var kpiEls = {}, mini = null, askLog = null, lanesOn = false, minimapOn = true, selectedAction = {};

  /* ================= init ================= */
  U.init = function (a, c) {
    app = a; ctx = c; F = app.F;
    tipEl = $('#tip'); labelsEl = $('#labels');
    buildTop(); buildKpis(); buildLayers(); buildSide(); buildDock(); buildPhone(); buildModals(); if (ctx) buildMinimap();
    AX.on(document, 'keydown', onKey); AX.on(g, 'resize', layoutDock);
    var db = $('#diveBtn'); if (db) db.onclick = function () { app.director = false; U.onDirector(); app.goPreset('dive'); };
    if (app.nogl) { $('#nogl').classList.add('on'); }
    U.onPlayState(); U.onMode(); U.onDirector(); layoutDock(); refreshSide(true); U.onLayers();
    if (Q('tab')) setTab(Q('tab'));
    AX.root.classList.add('ready');
  };
  function Q(k) { return new URLSearchParams(location.search).get(k); }

  /* ================= top bar ================= */
  function buildTop() {
    $('#top').innerHTML = '<a class="btn home" href="/" data-aj-exit title="Back to the IndTrana Command Center">' + ic('home', 15) + '<span>Home</span></a><a class="brand" href="/" data-aj-exit title="Back to the IndTrana Command Center">' + ic('shield', 18) + '<b>IndTrana</b><span>Alert Journey</span></a>' +
      '<div class="incident"><span class="dotlive"></span><b>' + S.INCIDENT.title + '</b><em class="synth">' + S.INCIDENT.tag + ' · IndTrana sends nothing</em></div>' +
      '<div class="clockb"><div class="tl" id="tLabel">T−72h</div><div class="cl"><span id="clock">15:30</span><small id="dayLabel">Day −3</small></div></div>' +
      '<div class="sp"></div>' +
      '<a class="btn" href="?mode=live" data-aj-mode="live" title="Real map, real weather, real satellites (opt-in live public data)">' + ic('globe', 15) + '<span>Live Earth</span></a>' +
      '<button class="btn" id="btnReal" title="Can IndTrana send? Patents? Open data?">' + ic('alert', 15) + '<span>Reality check</span></button>' +
      '<button class="btn icon" id="btnHelp" aria-label="Help and shortcuts" title="Help (H)">' + ic('help', 16) + '</button>' +
      '<button class="btn icon" id="btnQ" aria-label="Quality" title="Quality">' + ic('gear', 16) + '</button>' +
      '<button class="btn icon" id="btnFs" aria-label="Fullscreen" title="Fullscreen (F)">' + ic('expand', 16) + '</button>';
    $('#btnReal').onclick = function () { openModal('reality'); }; $('#btnHelp').onclick = function () { openModal('help'); }; $('#btnFs').onclick = app.toggleFullscreen;
    $('#btnQ').onclick = function () { openModal('quality'); };
  }

  /* ================= KPI strip ================= */
  var KPI = [['rain', 'rain', 'Rain', 'mm/h'], ['wind', 'wind', 'Wind', 'km/h'], ['flood', 'waves', 'Flood level', 'm'], ['reach', 'phone', 'Alert reach', ''], ['shel', 'home', 'Sheltered', ''], ['danger', 'alert', 'In danger', ''], ['towers', 'tower', 'Towers up', ''], ['teams', 'truck', 'Teams on mission', ''], ['power', 'zap', 'City power', '']];
  function buildKpis() {
    var w = $('#kpis'); w.innerHTML = '';
    KPI.forEach(function (k) { var e = el('div', 'kpi', ic(k[1], 15) + '<div><label>' + k[2] + '</label><b id="k_' + k[0] + '">—</b></div>'); e.dataset.k = k[0]; w.appendChild(e); kpiEls[k[0]] = $('#k_' + k[0]); });
  }
  function setK(id, v, tone) { var e = kpiEls[id]; if (!e) return; if (e.textContent !== v) { e.textContent = v; var p = e.closest('.kpi'); p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse'); } e.closest('.kpi').dataset.tone = tone || ''; }

  /* ================= layers + cameras ================= */
  var LAYERS = [['Environment', [['water', 'waves', 'Water & flood'], ['weather', 'rain', 'Rain & clouds'], ['cyclone', 'cyclone', 'Cyclone'], ['wind', 'wind', 'Wind streaks'], ['radar', 'radar', 'Radar echoes']]],
    ['Places', [['buildings', 'building', 'Buildings & trees'], ['roads', 'route', 'Roads & traffic'], ['people', 'users', 'Residents'], ['labels', 'pin', 'Names & labels']]],
    ['Network', [['towers', 'tower', 'Cell towers'], ['coverage', 'signal', 'Coverage domes'], ['satellites', 'satellite', 'Satellites'], ['comms', 'radio', 'Comms streams']]],
    ['Operations', [['teams', 'truck', 'Response teams'], ['risk', 'target', 'Predicted flood'], ['cone', 'cyclone', 'Forecast cone']]]];
  function buildLayers() {
    var h = '<div class="lhead"><span>' + ic('layers', 15) + 'Layers</span><button class="mini" id="lpAll">All</button><button class="mini" id="lpW">Weather</button><button class="mini" id="lpN">Network</button><button class="mini" id="lpR">Response</button></div><div class="lbody">';
    LAYERS.forEach(function (gr) { h += '<h4>' + gr[0] + '</h4>'; gr[1].forEach(function (l) { h += '<label class="lrow" data-l="' + l[0] + '">' + ic(l[1], 15) + '<span>' + l[2] + '</span><i class="sw"></i></label>'; }); });
    h += '<h4>Cameras</h4><div class="cams" id="camList"></div><button class="btn wide" id="dirBtn"></button></div>';
    $('#layers').innerHTML = h;
    $$('.lrow').forEach(function (r) { r.onclick = function () { app.toggleLayer(r.dataset.l); }; });
    $('#lpAll').onclick = function () { app.layerPreset('all'); }; $('#lpW').onclick = function () { app.layerPreset('weather'); }; $('#lpN').onclick = function () { app.layerPreset('network'); }; $('#lpR').onclick = function () { app.layerPreset('response'); };
    var cams = [['orbit', 'globe', 'Orbit'], ['india', 'satellite', 'India'], ['dive', 'map', 'Dive in']].concat(Object.keys(S.PRESETS).filter(function (k) { return k !== 'region' || true; }).map(function (k) { return [k, S.PRESETS[k].icon, S.PRESETS[k].label]; }));
    var cl = $('#camList'); cams.forEach(function (c) { var b = el('button', 'cam', ic(c[1], 14) + '<span>' + c[2] + '</span>'); b.dataset.c = c[0]; b.onclick = function () { app.director = false; U.onDirector(); app.goPreset(c[0]); }; cl.appendChild(b); });
    $('#dirBtn').onclick = function () { app.director = !app.director; if (app.director) app.lastPreset = null; U.onDirector(); };
    $('#layers .lhead').onclick = function (e) { if (e.target.closest('.mini')) return; $('#layers').classList.toggle('collapsed'); };
  }
  U.onLayers = function () { $$('.lrow').forEach(function (r) { r.classList.toggle('on', !!(ctx && ctx.layerOn[r.dataset.l])); }); };
  U.onDirector = function () { var b = $('#dirBtn'); if (!b) return; b.innerHTML = ic('camera' in ICON ? 'camera' : 'eye', 15) + (app.director ? 'Director: ON (cinematic)' : 'Director paused · resume'); b.classList.toggle('on', app.director); };
  U.onMode = function () {
    AX.root.dataset.mode = app.mode; $$('.cam').forEach(function (c) { c.classList.toggle('dim', app.mode === 'space' && !(c.dataset.c === 'orbit' || c.dataset.c === 'india' || c.dataset.c === 'dive')); });
    var mm = $('#minimapWrap'); if (mm) mm.style.display = app.mode === 'ground' && minimapOn ? '' : 'none';
    if (app.mode === 'ground') { var d = $('#diveHint'); if (d) d.classList.remove('on'); }
  };

  /* ================= side panel ================= */
  var TABS = [['story', 'list', 'Story'], ['copilot', 'sparkles', 'AI Copilot'], ['teams', 'truck', 'Teams'], ['network', 'radio', 'Network'], ['inspect', 'target', 'Inspect']];
  function buildSide() {
    var s = $('#side'); s.innerHTML = '<div class="tabs" role="tablist"></div><div class="panels"></div><button class="grab" id="sideToggle" aria-label="Collapse panel">' + ic('chevron', 14) + '</button>';
    var tb = $('.tabs', s), pn = $('.panels', s);
    TABS.forEach(function (t) { var b = el('button', 'tab', ic(t[1], 15) + '<span>' + t[2] + '</span>'); b.dataset.tab = t[0]; b.setAttribute('role', 'tab'); b.onclick = function () { setTab(t[0]); }; tb.appendChild(b); var p = el('section', 'aj-panel'); p.id = 'tab-' + t[0]; pn.appendChild(p); });
    $('#sideToggle').onclick = function () { s.classList.toggle('collapsed'); };
    setTab('story');
    askLog = null;
  }
  function setTab(n) { curTab = n; $$('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === n); b.setAttribute('aria-selected', b.dataset.tab === n ? 'true' : 'false'); }); $$('.aj-panel').forEach(function (p) { p.classList.toggle('on', p.id === 'tab-' + n); }); $('#side').classList.remove('collapsed'); refreshSide(true); }
  U.setTab = setTab;
  function refreshSide(force) {
    if (!F) return;
    if (curTab === 'story') renderStory(force); else if (curTab === 'copilot') renderCopilot(force); else if (curTab === 'teams') renderTeams(force); else if (curTab === 'network') renderNetwork(force); else renderInspect(force);
  }

  /* ---- Story ---- */
  var lastStoryKey = '';
  function renderStory(force) {
    var t = F.t, ph = S.phaseAt(t), em = F.emergency, key = [ph.id, em, app.decision.staging, app.decision.cap, app.decision.escalate, t >= 10 ? 'end' : ''].join('|');
    if (!force && key === lastStoryKey) { updateNext(); return; } lastStoryKey = key;
    var p = $('#tab-story'), h = '<div class="phases">';
    S.PHASES.forEach(function (x) { h += '<button class="ph-chip' + (x.id === ph.id ? ' on' : '') + '" style="--c:' + x.color + '" data-t="' + x.t0 + '">' + ic(x.icon, 14) + '<span>' + x.name + '</span></button>'; });
    h += '</div><div class="card story" style="--c:' + ph.color + '"><div class="k">' + ph.name.toUpperCase() + ' · ' + C.fmtT(ph.t0) + ' → ' + C.fmtT(ph.t1) + '</div><h2>' + ph.title + '</h2><p>' + ph.blurb + '</p>';
    h += '<div class="cols"><div><h5>' + ic('sparkles', 13) + 'IndTrana AI does</h5><ul>' + ph.aegis.map(function (x) { return '<li class="ok">' + x + '</li>'; }).join('') + '</ul></div><div><h5>' + ic('users', 13) + 'Humans do</h5><ul>' + ph.humans.map(function (x) { return '<li class="hu">' + x + '</li>'; }).join('') + '</ul></div></div>';
    h += '<h5>' + ic('ban', 13) + 'IndTrana does not</h5><ul>' + ph.not.map(function (x) { return '<li class="no">' + x + '</li>'; }).join('') + '</ul>';
    h += '<div class="try">' + ic('crosshair', 14) + '<span>' + ph.tryIt + '</span></div></div>';
    if (em) h += cmdBoard();
    h += '<div class="card next" id="nextCard"></div>';
    if (t > 9) h += outcomeCard();
    h += '<div class="btnrow"><button class="btn" id="stFollow">' + ic('crosshair', 14) + 'Follow Lakshmi</button><button class="btn" id="stReal">' + ic('alert', 14) + 'Reality check</button><button class="btn" id="stRestart">' + ic('refresh', 14) + 'Restart</button></div>';
    p.innerHTML = h;
    $$('.ph-chip', p).forEach(function (b) { b.onclick = function () { app.setTime(parseFloat(b.dataset.t) + 0.01); app.sim.playing = false; U.onPlayState(); }; });
    $('#stFollow').onclick = function () { app.director = false; U.onDirector(); app.mode === 'ground' ? (app.follow('person', 'p0'), app.goPreset('cityLow', { keepFollow: true })) : app.goPreset('dive'); };
    $('#stReal').onclick = function () { openModal('reality'); }; $('#stRestart').onclick = function () { app.restart(); };
    $$('.cmd .go', p).forEach(function (b) { b.onclick = function () { b.parentNode.classList.add('done'); b.textContent = 'Recorded'; toast('Exercise action recorded', 'IndTrana logs the commander’s decision. Nothing is sent or dispatched.', '#4be3a0', 'check'); }; });
    updateNext();
  }
  function cmdBoard() {
    var items = [['Reroute the relief convoy via the NE ridge road', 'Road segment at Zone B edge closes in ~2 h', 'route'], ['Open the overflow wing at Shelter S2', 'Occupancy projected > 90 % by T−3h', 'home'], ['Keep the hospital generator fuelled', 'Substation at risk when water > 1.7 m', 'zap'], ['Send the second alert via satellite-capable channel', 'Coastal towers failing: reach drops there', 'satellite']];
    return '<div class="card cmdb"><div class="k red">COMMAND BOARD · AI-RANKED, HUMAN-DECIDED</div>' + items.map(function (x, i) { return '<div class="cmd"><span class="n">' + (i + 1) + '</span><div><b>' + x[0] + '</b><small>' + x[1] + '</small></div><button class="btn go">Approve</button></div>'; }).join('') + '<small class="muted">Approve = commander records the intent. Agencies carry out the action; IndTrana never dispatches.</small></div>';
  }
  function outcomeCard() {
    var a = ctx ? ctx.rescueTimes('A') : [], b = ctx ? ctx.rescueTimes('B') : []; if (!a.length) return '';
    return '<div class="card outcome"><div class="k">PLAN COMPARISON · HOTSPOT 1</div><div class="cmp"><div class="' + (F.plan === 'B' ? 'sel' : '') + '"><b>Plan B</b><span>AI high-ground sites</span><em>first boat on scene ' + C.fmtT(b[0]) + '</em></div><div class="' + (F.plan === 'A' ? 'sel' : '') + '"><b>Plan A</b><span>central yard</span><em>first boat on scene ' + C.fmtT(a[0]) + '</em></div></div><small class="muted">Rehearsal comparison on a synthetic scenario. Not an accuracy or performance claim. Switch plans in the Teams tab.</small></div>';
  }
  function updateNext() {
    var n = $('#nextCard'); if (!n) return; var t = F.t, nx = S.EVENTS.filter(function (e) { return e.t > t + 0.01; })[0], pv = S.EVENTS.filter(function (e) { return e.t <= t; }).pop();
    n.innerHTML = '<div class="k">NOW</div>' + (pv ? '<div class="ev" style="--c:' + laneCol[pv.lane] + '">' + ic(pv.icon, 15) + '<div><b>' + pv.title + '</b><small>' + C.fmtT(pv.t) + ' · ' + pv.text + '</small></div></div>' : '') + (nx ? '<div class="k">NEXT · in ' + (nx.t - t).toFixed(1) + ' h</div><div class="ev dim" style="--c:' + laneCol[nx.lane] + '">' + ic(nx.icon, 15) + '<div><b>' + nx.title + '</b><small>' + C.fmtT(nx.t) + ' · ' + nx.text + '</small></div></div>' : '');
  }

  /* ---- Copilot ---- */
  var BADGE = { observe: ['Observed', 'eye'], predict: ['Predicted', 'chart'], recommend: ['Recommends', 'sparkles'], abstain: ['Abstains', 'ban'], human: ['Human needed', 'users'], handoff: ['Hand-over', 'send'], alert: ['Alert', 'radio'], field: ['Field', 'truck'], learn: ['Learning', 'refresh'] };
  function renderCopilot(force) {
    var p = $('#tab-copilot'), list = S.INSIGHTS.filter(function (x) { return x.t <= F.t; });
    if (!p.firstChild) {
      p.innerHTML = '<div class="orb"><div class="orbv"><i></i><i></i><i></i></div><div><b>IndTrana Copilot</b><small id="tick">—</small></div></div><div class="legend2"><span class="lg ai">AI proposes</span><span class="lg hu">Human decides</span><span class="lg au">Authority acts</span></div><div id="feed"></div><div class="ask"><h5>' + ic('help', 13) + 'Ask IndTrana (grounded questions only)</h5><div class="chips" id="askChips"></div><form id="askForm"><input id="askIn" maxlength="140" placeholder="Ask about this exercise…" autocomplete="off"><button class="btn" aria-label="Ask">' + ic('send', 14) + '</button></form><div id="askOut"></div></div>';
      var ch = $('#askChips'); S.ASK.forEach(function (a) { var b = el('button', 'chip', a.q); b.onclick = function () { ask(a.id, a.q); }; ch.appendChild(b); });
      $('#askForm').onsubmit = function (e) { e.preventDefault(); var v = $('#askIn').value.trim(); if (!v) return; ask(null, v); };
    }
    $('#tick').textContent = S.tickerAt(F.t);
    if (!force && list.length === shownInsights) return; shownInsights = list.length;
    var f = $('#feed'); f.innerHTML = list.slice().reverse().map(function (x) {
      var b = BADGE[x.type], conf = x.conf !== null ? '<div class="conf"><span>confidence <b>' + Math.round(x.conf * 100) + '%</b> <em>(rehearsal)</em></span><i><u style="width:' + x.conf * 100 + '%"></u></i></div>' : '';
      var ev = x.ev.map(function (id) { var e = S.EVID[id]; return '<button class="evc" data-ent="' + (e.ent || '') + '" title="' + e.src + '">' + ic('database', 11) + e.label + '</button>'; }).join('');
      return '<article class="ins ' + x.type + '"><header><span class="bd">' + ic(b[1], 12) + b[0] + '</span><time>' + C.fmtT(x.t) + '</time></header><h4>' + x.title + '</h4><p>' + x.body + '</p>' + conf + '<div class="evs">' + ev + '</div><details><summary>Why this?</summary><ul>' + x.why.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul></details></article>';
    }).join('') || '<p class="muted pad">Press play. Insights appear as evidence arrives.</p>';
    $$('.evc', f).forEach(function (b) { b.onclick = function () { if (b.dataset.ent) { if (ctx.byId[b.dataset.ent]) { app.select(b.dataset.ent); app.focusEntity(b.dataset.ent); } } }; });
  }
  function tFlood(h) { for (var t = C.TMIN; t < C.TMAX; t += 0.1) if (C.floodAt(t) > h) return t; return Infinity; }
  function ask(id, text) {
    var out = $('#askOut'), a = null;
    if (id) a = S.ASK.filter(function (x) { return x.id === id; })[0];
    else if (/[\u0000-\u001f]/.test(text) || text.length > 140) a = null; else a = S.ASK.filter(function (x) { return x.re.test(text); })[0] || null;
    var t = F.t, html;
    if (!a) html = '<div class="ans abstain"><b>' + ic('ban', 14) + 'IndTrana abstains</b><p>I can only answer from validated exercise data and cited items. That question is outside what I can ground, so I will not guess. Try one of the suggested questions.</p></div>';
    else if (a.id === 'first') html = '<div class="ans"><b>' + ic('waves', 14) + 'Predicted order of flooding</b><p>' + S.HOTSPOTS.slice().sort(function (x, y) { return C.H(x.x, x.z) - C.H(y.x, y.z); }).map(function (h) { var tf = tFlood(C.H(h.x, h.z)); return '<span class="li">' + h.name + ' · water arrives ≈ ' + (isFinite(tf) ? C.fmtT(tf) : 'not in this scenario') + '</span>'; }).join('') + '</p><small>From the terrain grid and the current flood forecast (' + (F.st.pred.has ? F.st.pred.level.toFixed(1) + ' ± ' + F.st.pred.sigma.toFixed(2) + ' m' : 'no claim yet') + '). Synthetic.</small></div>';
    else if (a.id === 'stage') html = '<div class="ans"><b>' + ic('target', 14) + 'Recommended staging (a recommendation)</b><p>' + S.STAGING_SITES.map(function (s) { return '<span class="li">' + s.name + ' · ' + (C.H(s.x, s.z) - C.FLOOD_PEAK.level).toFixed(1) + ' m above predicted peak</span>'; }).join('') + '</p><small>The central yard is ≈0.9 m below the peak. A human commander chooses; IndTrana cannot task teams.</small></div>';
    else if (a.id === 'why') html = '<div class="ans"><b>' + ic('ban', 14) + 'Why I abstained at ' + C.fmtT(-60) + '</b><p>The track spread was too wide and gauge G-2 was 3 h stale. A flood-level number would have been a guess. The rule is fail-closed: stale or conflicting inputs lead to “not comparable”, not to a smoothed answer.</p></div>';
    else if (a.id === 'send') html = '<div class="ans no"><b>' + ic('lock', 14) + 'No. IndTrana cannot send alerts.</b><p>There is no send path: only a private draft CAP file that a different human checker approves. The authority (NDMA / SACHET) adds the area, signs and transmits through each operator’s Cell Broadcast Centre.</p></div>';
    else if (a.id === 'conf') html = '<div class="ans"><b>' + ic('chart', 14) + 'Forecast confidence now</b><p>' + (F.st.pred.has ? 'Peak flood level ' + F.st.pred.level.toFixed(2) + ' m, band ±' + F.st.pred.sigma.toFixed(2) + ' m. The band narrows as river and rain evidence arrive.' : 'No claim yet: evidence is too thin.') + '</p><small>Rehearsal statistics on a synthetic scenario. Not an accuracy claim.</small></div>';
    else if (a.id === 'towers') html = '<div class="ans"><b>' + ic('tower', 14) + 'Towers at risk (forecast)</b><p>' + S.TOWERS.filter(function (x) { return isFinite(x.fail); }).sort(function (x, y) { return x.fail - y.fail; }).map(function (x) { return '<span class="li">' + x.name + ' · water at cabinet ≈ ' + C.fmtT(x.fail) + '</span>'; }).join('') + '</p><small>Fail when water exceeds ground + 0.55 m.</small></div>';
    else html = '<div class="ans"><b>' + ic('phone', 14) + 'Alert reach so far</b><p>' + (F.kpi ? 'Alert 1 reached ' + fP(F.kpi.reached1) + ' of residents (cell broadcast, SMS, volunteers). Update 2 reached ' + fP(F.kpi.reached2) + '. Gaps: hill villages without towers, incompatible handsets, and failed towers.' : 'n/a') + '</p><small>Coverage is not delivery.</small></div>';
    out.innerHTML = html; out.classList.remove('pop'); void out.offsetWidth; out.classList.add('pop');
  }

  /* ---- Teams ---- */
  function renderTeams(force) {
    var p = $('#tab-teams'); if (force || !p.firstChild) {
      p.innerHTML = '<div class="card"><div class="k">STAGING PLAN · COMMANDER’S CHOICE</div><div class="seg" id="planSeg"><button data-p="B">' + ic('sparkles', 13) + 'Plan B · AI high-ground</button><button data-p="A">' + ic('home', 13) + 'Plan A · central yard</button></div><small class="muted" id="planNote"></small></div><div class="card"><div class="k" id="teamSum">—</div><div id="roster"></div></div><div class="card"><div class="k">HOTSPOTS (AI-RANKED)</div><div id="hotList"></div></div>';
      $$('#planSeg button').forEach(function (b) { b.onclick = function () { app.setPlan(b.dataset.p); }; });
      var r = $('#roster'); S.TEAMS.forEach(function (d) { var row = el('div', 'team', ''); row.id = 'tr_' + d.id; row.innerHTML = '<span class="ti" style="--c:' + d.color + '">' + ic({ boat: 'ship', ambulance: 'ambulance', truck: 'truck', firetruck: 'flame', van: 'wrench', police: 'shield', heli: 'heli', drone: 'drone' }[d.kind], 15) + '</span><div><b>' + d.name + '</b><small class="st">—</small><i class="pb"><u></u></i></div><button class="mini" data-act="focus">' + ic('crosshair', 13) + '</button><button class="mini" data-act="follow">' + ic('eye', 13) + '</button>'; row.querySelector('[data-act=focus]').onclick = function () { app.select(d.id); app.focusEntity(d.id); }; row.querySelector('[data-act=follow]').onclick = function () { app.director = false; U.onDirector(); app.select(d.id); app.focusEntity(d.id, true); }; row.onclick = function (e) { if (!e.target.closest('button')) app.select(d.id); }; r.appendChild(row); });
      $('#hotList').innerHTML = S.HOTSPOTS.map(function (h) { return '<div class="hs" data-id="' + h.id + '"><b>' + h.name + '</b><small></small></div>'; }).join('');
      $$('#hotList .hs').forEach(function (n) { n.onclick = function () { app.select(n.dataset.id); app.focusEntity(n.dataset.id); }; });
    }
    $$('#planSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === F.plan); });
    $('#planNote').textContent = F.plan === 'B' ? 'Teams wait on high ground and reach hotspots as water arrives.' : 'Teams wait in the central yard, which floods; they get cut off and arrive late.';
    var dep = 0;
    S.TEAMS.forEach(function (d) {
      var s = ctx.actorsTeamAt(d, F.t, F.plan), row = $('#tr_' + d.id), w = F.plan === 'A' ? d.wpA : d.wpB; if (s.status === 'Deployed' || s.status === 'Moving to hotspot') dep++;
      var st = $('.st', row); st.textContent = s.status; st.dataset.s = s.status; $('.pb u', row).style.width = fP(C.clamp((F.t - w[0][0]) / (w[w.length - 1][0] - w[0][0]), 0, 1)); row.classList.toggle('sel', F.selected === d.id);
    });
    $('#teamSum').textContent = 'TEAMS · ' + dep + ' of ' + S.TEAMS.length + ' on mission · tasked by agency, not IndTrana';
    S.HOTSPOTS.forEach(function (h) { var depth = Math.max(0, F.st.flood - C.H(h.x, h.z)); $('.hs[data-id=' + h.id + '] small').textContent = depth > 0.05 ? 'flooded ' + depth.toFixed(2) + ' m' : 'predicted peak depth ' + Math.max(0, (F.st.pred.has ? F.st.pred.level : C.FLOOD_PEAK.level) - C.H(h.x, h.z)).toFixed(2) + ' m'; });
  }

  /* ---- Network ---- */
  var NET = [
    { id: 'n_src', x: 8, y: 6, w: 92, label: 'Satellites\n& open APIs', ent: 'hub_open', act: function (t) { return t > -72; } },
    { id: 'n_ai', x: 8, y: 52, w: 92, label: 'IndTrana AI\ningest · predict', ent: 'fac_eoc', act: function (t) { return t > -66; } },
    { id: 'n_hum', x: 8, y: 98, w: 92, label: 'Maker →\nChecker', ent: 'fac_eoc', act: function (t) { return t > -20 && t < -17; }, human: true },
    { id: 'n_auth', x: 128, y: 98, w: 92, label: 'NDMA / SACHET\n(authority)', ent: 'hub_ndma', act: function (t) { return t > -17.6; } },
    { id: 'n_cbc', x: 128, y: 144, w: 92, label: 'Operator CBCs\nAirtel·Jio·BSNL·Vi', ent: 'hub_cbc_jio', act: function (t) { return t > -17.4; } },
    { id: 'n_twr', x: 128, y: 190, w: 92, label: 'Cell towers\n(BTS)', ent: 'T03', act: function (t, F2) { return F2.bc; } },
    { id: 'n_ph', x: 8, y: 190, w: 92, label: 'Phones &\npeople', ent: 'person_lakshmi', act: function (t) { return t > -16.9; } },
    { id: 'n_sat', x: 128, y: 236, w: 92, label: 'Satellite fallback\nNavIC · D2C', ent: 'sat_d2c', act: function (t, F2) { return t > -2.4 && t < 6; } }
  ];
  var EDGES = [['n_src', 'n_ai'], ['n_ai', 'n_hum'], ['n_hum', 'n_auth'], ['n_auth', 'n_cbc'], ['n_cbc', 'n_twr'], ['n_twr', 'n_ph'], ['n_auth', 'n_sat'], ['n_sat', 'n_ph']];
  function renderNetwork(force) {
    var p = $('#tab-network');
    if (!p.firstChild) {
      var w = 228, svg = '<svg viewBox="0 0 ' + w + ' 280" class="netsvg"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0l8 4-8 4z" fill="currentColor"/></marker></defs>';
      var byId = {}; NET.forEach(function (n) { byId[n.id] = n; });
      EDGES.forEach(function (e, i) { var a = byId[e[0]], b = byId[e[1]], ax = a.x + a.w / 2, ay = a.y + 20, bx = b.x + b.w / 2, by = b.y + 20, dx = bx - ax, dy = by - ay, x1 = ax + (Math.abs(dx) > 10 ? Math.sign(dx) * a.w / 2 : 0), y1 = ay + (Math.abs(dx) > 10 ? 0 : Math.sign(dy) * 20), x2 = bx - (Math.abs(dx) > 10 ? Math.sign(dx) * b.w / 2 : 0), y2 = by - (Math.abs(dx) > 10 ? 0 : Math.sign(dy) * 20); svg += '<path id="e' + i + '" class="edge" d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + '" marker-end="url(#ah)"/>'; });
      svg += '<line x1="108" y1="86" x2="108" y2="262" class="bound"/><text x="112" y="82" class="btxt">IndTrana stops here ▸</text>';
      NET.forEach(function (n) { var ls = n.label.split('\n'); svg += '<g class="node" id="' + n.id + '" data-ent="' + n.ent + '" transform="translate(' + n.x + ',' + n.y + ')"><rect width="' + n.w + '" height="40" rx="9"/><text x="' + n.w / 2 + '" y="17">' + ls[0] + '</text><text x="' + n.w / 2 + '" y="31" class="sub">' + (ls[1] || '') + '</text></g>'; });
      svg += '</svg>';
      p.innerHTML = '<div class="card"><div class="k">ALERT PATH · CLICK A NODE TO SEE IT IN 3D</div>' + svg + '<small class="muted">Left column = inside IndTrana / humans. Right column = outside IndTrana: authority, operators, towers. Dashed line = boundary.</small></div><div class="card"><div class="k">HOW EACH PERSON WAS REACHED</div><div id="reachBars"></div><small class="muted">Coverage ≠ delivery. Hill villages without towers, incompatible handsets and failed towers leave gaps that sirens, volunteers and satellite messaging only partly fill.</small></div>';
      $$('.node', p).forEach(function (n) { n.onclick = function () { var id = n.dataset.ent; if (ctx.byId[id]) { app.select(id); if (app.mode === 'ground') app.focusEntity(id); } }; });
    }
    NET.forEach(function (n) { var e = $('#' + n.id), on = n.act(F.t, F); e.classList.toggle('act', !!on); e.classList.toggle('hum', !!n.human && !!on); e.classList.toggle('fail', n.id === 'n_twr' && F.kpi && F.kpi.towersUp < F.kpi.towersTotal && F.t > -2.4); });
    EDGES.forEach(function (e, i) { var a = NET.filter(function (n) { return n.id === e[0]; })[0], b = NET.filter(function (n) { return n.id === e[1]; })[0]; $('#e' + i).classList.toggle('act', !!(a.act(F.t, F) && b.act(F.t, F))); });
    var pe = ctx.actorsPeople, cnt = { cb: 0, sms: 0, volunteer: 0, sat: 0, none: 0 }; if (pe) pe.forEach(function (q) { if (F.t >= q.recv1) cnt[q.via1] = (cnt[q.via1] || 0) + 1; else if (F.t > -16) cnt.none++; if (F.t >= q.recv2 && q.via2 === 'sat') cnt.sat++; });
    var tot = pe ? pe.length : 1, rows = [['Cell broadcast', cnt.cb, '#ffb547'], ['SMS', cnt.sms, '#f6e65a'], ['Volunteers / sirens', cnt.volunteer, '#4be3a0'], ['Satellite (update #2)', cnt.sat, '#b98cff'], ['Not reached yet', cnt.none, '#ff5d6c']];
    $('#reachBars').innerHTML = rows.map(function (r) { return '<div class="rb"><span>' + r[0] + '</span><i><u style="width:' + (r[1] / tot * 100) + '%;background:' + r[2] + '"></u></i><b>' + fP(r[1] / tot) + '</b></div>'; }).join('');
  }

  /* ---- Inspect ---- */
  function renderInspect(force) {
    var p = $('#tab-inspect'), id = F.selected, e = id && ctx && ctx.byId[id];
    if (!e) { if (p._id !== null) { p.innerHTML = '<div class="empty">' + ic('target', 28) + '<h3>Nothing selected</h3><p>Hover or click any tower, satellite, team, shelter, gauge, hospital or the cyclone in the 3D view. Double-click to fly to it.</p></div>'; p._id = null; } return; }
    var d = e.describe(F), key = id + '|' + (d.status && d.status.text);
    if (p._id === id) {               // same entity: update values in place (keeps buttons clickable, no flicker)
      var pill = $('.pill', p); if (pill && d.status) { pill.className = 'pill ' + d.status.tone; if (pill.textContent !== d.status.text) pill.textContent = d.status.text; }
      var tds = $$('td', p); d.rows.forEach(function (r, i) { if (tds[i] && tds[i].innerHTML !== r[1]) tds[i].innerHTML = r[1]; });
      if (d.spark) drawSpark($('#spark')); return;
    }
    p._id = id;
    var h = '<div class="card insp"><header style="--c:' + e.color + '"><span class="big">' + ic(e.icon || 'target', 20) + '</span><div><h3>' + e.name + '</h3><small>' + e.kind + (e.space ? ' · in orbit view' : '') + '</small></div></header>';
    if (d.status) h += '<div class="pill ' + d.status.tone + '">' + d.status.text + '</div>';
    h += '<table>' + d.rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>';
    if (d.spark) h += '<canvas id="spark" width="320" height="70"></canvas>';
    if (d.ev && d.ev.length) h += '<div class="evs">' + d.ev.map(function (x) { var q = S.EVID[x]; return '<span class="evc" title="' + q.src + '">' + ic('database', 11) + q.label + '</span>'; }).join('') + '</div>';
    if (d.note) h += '<p class="note">' + ic('info', 13) + d.note + '</p>';
    h += '<div class="btnrow">' + (e.space || app.mode === 'ground' ? '<button class="btn" data-a="focus">' + ic('crosshair', 14) + 'Fly to</button>' : '') + (d.actions || []).map(function (a) { return '<button class="btn" data-a="' + a.id + '">' + a.label + '</button>'; }).join('') + '<button class="btn" data-a="clear">' + ic('x', 14) + 'Clear</button></div></div>';
    p.innerHTML = h; p._key = key;
    $$('[data-a]', p).forEach(function (b) { b.onclick = function () {
      var a = b.dataset.a; if (a === 'focus') app.focusEntity(id); else if (a === 'clear') app.select(null); else if (a === 'follow') { app.director = false; U.onDirector(); app.focusEntity(id, true); } else if (a === 'route') { F.showRoutes = !F.showRoutes; toast('Planned routes', F.showRoutes ? 'Showing all team routes.' : 'Routes hidden except the selected team.', '#38e1ff', 'route'); } else if (a === 'coverage') app.toggleLayer('coverage'); else if (a === 'followPerson') { app.director = false; U.onDirector(); app.follow('person', 'p0'); app.goPreset('street', { keepFollow: true }); }
    }; });
    if (d.spark) drawSpark($('#spark'));
  }
  function drawSpark(cv) {
    if (!cv) return; var x = cv.getContext('2d'), w = cv.width, h = cv.height, n = 90; x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(120,160,255,.25)'; x.strokeRect(0.5, 0.5, w - 1, h - 1); x.beginPath(); x.strokeStyle = '#38e1ff'; x.lineWidth = 2;
    for (var i = 0; i <= n; i++) { var tt = C.TMIN + (C.TMAX - C.TMIN) * i / n, v = C.qnAt(tt), px = i / n * w, py = h - 6 - v * (h - 14); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    var cx = (F.t - C.TMIN) / (C.TMAX - C.TMIN) * w; x.strokeStyle = '#ffb547'; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, h); x.stroke();
    x.fillStyle = '#93a0c8'; x.font = '10px system-ui'; x.fillText('discharge vs time (synthetic)', 8, 12);
  }
  U.onSelect = function (id) { renderInspect(true); if (id) { if (curTab !== 'inspect') setTab('inspect'); } };
  U.onHover = function (id, pos) {
    hoverId = id;
    if (!id || !ctx.byId[id]) { tipEl.classList.remove('on'); return; }
    var e = ctx.byId[id], d = e.describe(F);
    tipEl.innerHTML = '<b>' + ic(e.icon || 'target', 13) + e.name + '</b><span class="' + (d.status ? d.status.tone : '') + '">' + (d.status ? d.status.text : e.kind) + '</span><small>click to inspect · double-click to fly</small>';
    tipEl.classList.add('on'); if (pos) { tipEl.style.left = Math.min(innerWidth - 270, pos.x + 16) + 'px'; tipEl.style.top = Math.min(innerHeight - 90, pos.y + 14) + 'px'; }
  };

  /* ================= timeline dock ================= */
  function buildDock() {
    var d = $('#dock');
    d.innerHTML = '<div class="drow"><div class="ctl"><button class="btn icon" id="bPrevE" title="Previous event ( [ )">' + ic('skipB', 16) + '</button><button class="btn icon" id="bBack" title="−1 h ( ← )">' + ic('rewind', 16) + '</button><button class="btn play" id="bPlay" title="Play / pause ( Space )"></button><button class="btn icon" id="bFwd" title="+1 h ( → )">' + ic('ff', 16) + '</button><button class="btn icon" id="bNextE" title="Next event ( ] )">' + ic('skipF', 16) + '</button></div><div class="speed" id="speed">' +
      [0.5, 1, 2, 4].map(function (s) { return '<button data-s="' + s + '">' + s + '×</button>'; }).join('') + '</div><div class="phasechips" id="phaseChips"></div><span class="slowchip" id="slowChip">' + ic('clock', 13) + 'slow motion</span><div class="sp"></div><button class="btn" id="bEm">' + ic('siren', 14) + '<span>Emergency mode</span></button><button class="btn" id="bLanes">' + ic('list', 14) + '<span>Who acts when</span></button><button class="btn" id="bMap">' + ic('map', 14) + '<span>Minimap</span></button></div>' +
      '<div class="track" id="track"><canvas id="trackCv"></canvas><div class="bands" id="bands"></div><div class="marks" id="marks"></div><div id="playhead"><i></i><b id="phLabel"></b></div><div class="hov" id="trackHov"></div></div><div class="lanes" id="lanes"></div>';
    S.PHASES.forEach(function (x) { var b = el('button', 'pc', x.name); b.style.setProperty('--c', x.color); b.dataset.t = x.t0; b.onclick = function () { app.setTime(x.t0 + 0.01); }; $('#phaseChips').appendChild(b); });
    $('#bPlay').onclick = function () { app.play(); }; $('#bBack').onclick = function () { app.setTime(F.t - 1); }; $('#bFwd').onclick = function () { app.setTime(F.t + 1); };
    $('#bPrevE').onclick = function () { var e = S.EVENTS.filter(function (x) { return x.t < F.t - 0.05; }).pop(); app.setTime(e ? e.t + 0.001 : C.TMIN); }; $('#bNextE').onclick = function () { var e = S.EVENTS.filter(function (x) { return x.t > F.t + 0.05; })[0]; if (e) app.setTime(e.t - 0.001); };
    $$('#speed button').forEach(function (b) { b.onclick = function () { app.setSpeed(parseFloat(b.dataset.s)); }; });
    $('#bEm').onclick = function () { app.emergencyManual = !emergencyNow(); U.onPlayState(); }; $('#bLanes').onclick = function () { lanesOn = !lanesOn; $('#dock').classList.toggle('lanesOn', lanesOn); $('#bLanes').classList.toggle('on', lanesOn); layoutDock(); };
    $('#bMap').onclick = function () { minimapOn = !minimapOn; $('#bMap').classList.toggle('on', minimapOn); U.onMode(); }; $('#bMap').classList.add('on');
    var tr = $('#track'), scrub = false;
    function setFromX(cx) { var r = tr.getBoundingClientRect(), t = C.TMIN + C.clamp((cx - r.left) / r.width, 0, 1) * (C.TMAX - C.TMIN); app.setTime(t); }
    tr.addEventListener('pointerdown', function (e) { if (e.target.closest('.mk')) return; scrub = true; tr.setPointerCapture(e.pointerId); app.sim.playing = false; U.onPlayState(); setFromX(e.clientX); });
    tr.addEventListener('pointermove', function (e) { var r = tr.getBoundingClientRect(), t = C.TMIN + C.clamp((e.clientX - r.left) / r.width, 0, 1) * (C.TMAX - C.TMIN), hv = $('#trackHov'); hv.style.left = (e.clientX - r.left) + 'px'; hv.textContent = C.fmtT(t) + ' · ' + C.fmtClock(t); hv.classList.add('on'); if (scrub) setFromX(e.clientX); });
    tr.addEventListener('pointerup', function () { scrub = false; }); tr.addEventListener('pointerleave', function () { $('#trackHov').classList.remove('on'); });
    S.EVENTS.forEach(function (ev) { var m = el('button', 'mk', ic(ev.icon, 12)); m.style.setProperty('--c', laneCol[ev.lane]); m.dataset.t = ev.t; m.title = C.fmtT(ev.t) + ' · ' + ev.title; m.onclick = function (e) { e.stopPropagation(); app.setTime(ev.t - 0.001); app.sim.playing = false; U.onPlayState(); }; $('#marks').appendChild(m); });
    var ln = $('#lanes'); S.LANES.forEach(function (l) { var r = el('div', 'lane', '<label style="--c:' + l.color + '">' + l.name + '</label><div class="lt" data-l="' + l.id + '"></div>'); ln.appendChild(r); });
    S.EVENTS.forEach(function (ev) { var dot = el('i', 'ld'); dot.style.setProperty('--c', laneCol[ev.lane]); dot.dataset.t = ev.t; dot.title = C.fmtT(ev.t) + ' · ' + ev.title; $('.lt[data-l=' + ev.lane + ']', ln).appendChild(dot); });
  }
  function emergencyNow() { return !!F.emergency; }
  function layoutDock() {
    var tr = $('#track'); if (!tr) return; trackW = tr.clientWidth; var cv = $('#trackCv'); cv.width = trackW * (devicePixelRatio > 1 ? 2 : 1); cv.height = 52 * (devicePixelRatio > 1 ? 2 : 1); cv.style.width = trackW + 'px'; cv.style.height = '52px';
    var x = cv.getContext('2d'), sc = cv.width / trackW; x.setTransform(sc, 0, 0, sc, 0, 0); x.clearRect(0, 0, trackW, 52);
    var W = trackW, X = function (t) { return (t - C.TMIN) / (C.TMAX - C.TMIN) * W; };
    $('#bands').innerHTML = S.PHASES.map(function (p) { return '<i style="left:' + X(p.t0) + 'px;width:' + (X(p.t1) - X(p.t0)) + 'px;--c:' + p.color + '"><em>' + p.name + '</em></i>'; }).join('');
    function curve(fn, col, a) { x.beginPath(); x.strokeStyle = col; x.globalAlpha = a; x.lineWidth = 1.6; for (var i = 0; i <= 160; i++) { var tt = C.TMIN + (C.TMAX - C.TMIN) * i / 160, v = fn(tt), px = i / 160 * W, py = 46 - v * 28; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.globalAlpha = 1; }
    curve(function (t) { return C.weatherAt(t, C.CITY.x, C.CITY.z).rain; }, '#6ea8ff', 0.9); curve(function (t) { return C.floodAt(t) / 2.4; }, '#38e1ff', 0.9); curve(function (t) { return C.weatherAt(t, C.CITY.x, C.CITY.z).wind; }, '#ffb547', 0.7);
    x.fillStyle = 'rgba(147,160,200,.9)'; x.font = '9px system-ui'; x.fillText('rain', 4, 50); x.fillStyle = '#38e1ff'; x.fillText('flood', 30, 50); x.fillStyle = '#ffb547'; x.fillText('wind', 62, 50);
    $$('#marks .mk').forEach(function (m) { m.style.left = X(parseFloat(m.dataset.t)) + 'px'; });
    $$('#lanes .ld').forEach(function (m) { m.style.left = X(parseFloat(m.dataset.t)) + 'px'; });
    var dk = $('#dock'); AX.root.style.setProperty('--dockH', dk.offsetHeight + 'px');
  }
  U.onPlayState = function () {
    var b = $('#bPlay'); if (!b) return; b.innerHTML = ic(app.sim.playing ? 'pause' : 'play', 18) + '<span>' + (app.sim.playing ? 'Pause' : (app.sim.t >= C.TMAX - 0.05 ? 'Replay' : 'Play')) + '</span>'; b.classList.toggle('on', app.sim.playing);
    $$('#speed button').forEach(function (x) { x.classList.toggle('on', parseFloat(x.dataset.s) === app.sim.speed); });
    var em = F && F.emergency; AX.root.classList.toggle('emergency', !!em); $('#bEm').classList.toggle('on', !!em);
  };
  U.onPlanChange = function () { refreshSide(true); };

  /* ================= phone widget ================= */
  var lang = 'en';
  function buildPhone() {
    var w = $('#phoneW'); w.innerHTML = '<div class="phone" id="phone"><div class="notch"></div><div class="sbar"><span id="pNet">4G</span><span id="pOp">Citizen · Lakshmi</span></div><div class="pclock" id="pClock">06:42</div><div class="pmsgs" id="pMsgs"></div><div class="langs" id="pLang"><button data-l="en" class="on">EN</button><button data-l="hi">हि</button><button data-l="te">తె</button></div></div><button class="phtoggle" id="phT">' + ic('phone', 14) + '<span>Citizen phone</span></button>';
    $$('#pLang button').forEach(function (b) { b.onclick = function () { lang = b.dataset.l; $$('#pLang button').forEach(function (x) { x.classList.toggle('on', x === b); }); lastPhoneKey = ''; }; });
    $('#phT').onclick = function () { U.phoneManual = true; w.classList.toggle('closed'); };
  }
  var lastPhoneKey = '';
  function updatePhone() {
    var pw = $('#phoneW'); if (!U.phoneManual) pw.classList.toggle('closed', F.t < -17.7 || app.mode === 'space');
    var k = F.kpiP; if (!k) return; var m1 = S.PHONE_MSGS[lang], m2 = S.PHONE_MSGS2[lang];
    $('#pNet').textContent = k.net === 'No service' ? 'No service' : k.net === 'Satellite' ? '🛰 SOS / sat' : '▮▮▮ 4G'; $('#pNet').className = k.net === 'No service' ? 'bad' : '';
    $('#pClock').textContent = C.fmtClock(F.t);
    var show1 = F.t >= k.recv1, show2 = isFinite(k.recv2) && F.t >= k.recv2, route = k.ag1 < 0.5 ? 'Cell broadcast · no phone number needed' : '', via2 = k.via2 === 'sat' ? 'Delivered via satellite (compatible handset)' : 'Cell broadcast';
    var key = [show1, show2, lang, k.mode, k.net].join('|'); if (key === lastPhoneKey) { $('#phone').classList.toggle('buzz', (k.ag1 >= 0 && k.ag1 < 0.15) || (k.ag2 >= 0 && k.ag2 < 0.12)); return; } lastPhoneKey = key;
    var h = '';
    if (show2) h += '<div class="msg m2"><b>' + m2.head + '</b><p>' + m2.body + '</p><em>' + via2 + '</em></div>';
    if (show1) h += '<div class="msg"><b>' + m1.head + '</b><p>' + m1.body + '</p><em>Cell broadcast · ' + m1.lang + ' · wording pending native sign-off</em></div>';
    if (!show1) h = '<div class="idle">Standing by…<br><small>No alert yet. The draft is private; IndTrana cannot send it.</small></div>';
    if (show1 && k.mode === 'walk') h += '<div class="state">' + ic('route', 13) + 'Walking to the shelter</div>'; else if (k.mode === 'sheltered') h += '<div class="state ok">' + ic('home', 13) + 'Safe at the shelter</div>';
    $('#pMsgs').innerHTML = h;
  }

  /* ================= modals, toasts ================= */
  function buildModals() {
    $('#reality').innerHTML = '<div class="mwrap"><button class="btn close" data-close>' + ic('x', 15) + 'Close</button><h2>Reality check</h2><p class="muted">Answers drawn from this repository’s rules and licence register. Not legal advice.</p><div class="rgrid" id="rgrid"></div><p class="muted foot">Operator names describe the real-world ecosystem only; no affiliation, endorsement or integration exists. Timings and the flood shape are schematic, not a forecast and not an accuracy claim.</p></div>';
    $('#rgrid').innerHTML = S.REALITY.map(function (c) {
      return '<div class="rc"><h3>' + c.h + '</h3><span class="v ' + c.k + '">' + c.v + '</span>' + (c.p ? '<p>' + c.p + '</p>' : '') + (c.li ? '<ul>' + c.li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '') + (c.table ? '<table>' + c.table.map(function (r) { return '<tr><td>' + r[0] + '</td><td><span class="tag ' + r[1] + '">' + r[2] + '</span></td></tr>'; }).join('') + '</table>' : '') + '</div>';
    }).join('');
    $('#help').innerHTML = '<div class="mwrap narrow"><button class="btn close" data-close>' + ic('x', 15) + 'Close</button><h2>How to explore</h2><div class="hgrid"><div><h4>Mouse</h4><ul><li><b>Drag</b> orbit · <b>right-drag / Shift-drag</b> pan · <b>wheel</b> zoom</li><li><b>Hover</b> names anything · <b>click</b> inspect · <b>double-click</b> fly to</li><li>Move the mouse for a gentle parallax</li></ul><h4>Keyboard</h4><ul><li><b>Space</b> play/pause · <b>← →</b> ±1 h (Shift ±6 h) · <b>[ ]</b> prev/next event</li><li><b>1–9</b> camera presets · <b>L</b> labels · <b>M</b> minimap · <b>E</b> emergency · <b>D</b> director · <b>F</b> fullscreen · <b>R</b> reality · <b>H</b> help</li></ul></div><div><h4>Reading the scene</h4><ul><li><span class="sw2" style="background:#9b7bff"></span> AI forecast tracks and cone</li><li><span class="sw2" style="background:#ff9d4a"></span> Orange ground = predicted flood zone (AI)</li><li><span class="sw2" style="background:#8b7a55"></span> Brown water = observed flooding</li><li><span class="sw2" style="background:#ffb547"></span> Amber streams = official alert path</li><li><span class="sw2" style="background:#4be3a0"></span> Green = field teams reporting</li><li><span class="sw2" style="background:#b98cff"></span> Violet = satellite fallback</li></ul><h4>Rules this mock-up keeps</h4><ul><li>Synthetic exercise: no live data, warning, dispatch or message.</li><li>AI recommends; humans decide; authority transmits.</li></ul></div></div></div>';
    $('#quality').innerHTML = '<div class="mwrap narrow"><button class="btn close" data-close>' + ic('x', 15) + 'Close</button><h2>Display</h2><p class="muted">Current: <b id="qCur"></b>' + ' · fps <b id="qFps">—</b></p><div class="btnrow"><button class="btn" data-q="high">High</button><button class="btn" data-q="med">Medium</button><button class="btn" data-q="low">Low (fast)</button></div><label class="chk"><input type="checkbox" id="psChk"> Power saver (30 frames per second, lower GPU and battery use)</label><label class="chk"><input type="checkbox" id="rmChk"> Reduce motion (no parallax, shake or lightning)</label></div>';
    $$('[data-q]').forEach(function (b) { b.onclick = function () { app.setQuality(b.dataset.q); }; });
    if (app.gov) { $('#psChk').checked = app.gov.saver; $('#psChk').onchange = function () { app.gov.saver = this.checked; }; }
    $('#rmChk').checked = app.reduced; $('#rmChk').onchange = function () { app.reduced = this.checked; };
    $$('[data-close]').forEach(function (b) { b.onclick = closeModals; });
    $$('.modal').forEach(function (m) { m.addEventListener('click', function (e) { if (e.target === m && m.id !== 'decision') closeModals(); }); });
  }
  function openModal(id) { closeModals(); $('#' + id).classList.add('on'); if (id === 'quality') { $('#qCur').textContent = app.quality; } }
  function closeModals() { $$('.modal.on').forEach(function (m) { if (m.id !== 'decision') m.classList.remove('on'); }); }
  U.openDecision = function (d) {
    var m = $('#decision'); revision = revision || 0; var h = '<div class="dcard"><div class="dhead"><span class="big">' + ic(d.icon, 22) + '</span><div><small>DECISION NEEDED · ' + C.fmtT(d.t) + ' · playback paused</small><h2>' + d.title + '</h2><em>' + d.who + '</em></div></div><p>' + d.intro + '</p>';
    if (d.id === 'cap') h += capPreview();
    h += '<div class="opts">' + d.options.map(function (o, i) { return '<label class="opt' + (i === 0 ? ' pick' : '') + '"><input type="radio" name="opt" value="' + o.id + '"' + (i === 0 ? ' checked' : '') + '><div><b>' + o.label + (o.badge ? ' <u class="bdg ' + o.badge + '">' + o.badge + '</u>' : '') + '</b><p>' + o.text + '</p>' + (o.cites.length ? '<ul>' + o.cites.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' : '') + '</div></label>'; }).join('') + '</div>';
    if (d.id === 'cap') h += '<label class="why">Reviewer rationale (recorded in the audit; required)<input id="why" maxlength="160" placeholder="e.g. Evidence is cited, wording is a fixed template, area left to the authority" value="Cited evidence checked; fixed template wording; area and severity left to the authority"></label>';
    h += '<div class="dfoot"><button class="link" id="dSkip">Skip (explore mode: assume recommended)</button><button class="btn big primary" id="dOk">Confirm decision</button></div></div>';
    m.innerHTML = h; m.classList.add('on');
    $$('.opt', m).forEach(function (o) { o.onclick = function () { $$('.opt', m).forEach(function (x) { x.classList.remove('pick'); }); o.classList.add('pick'); }; });
    $('#dOk').onclick = function () { var v = $('input[name=opt]:checked', m).value, why = d.id === 'cap' ? ($('#why').value || '').trim() : ''; if (d.id === 'cap' && v === 'approve' && !why) { $('#why').focus(); $('#why').classList.add('err'); return; } app.decide(d.id, v, why); };
    $('#dSkip').onclick = function () { app.decide(d.id, d.id === 'staging' ? 'B' : d.id === 'cap' ? 'approve' : 'go', ''); };
    app.sim.playing = false;
  };
  var revision = 0;
  function capPreview() {
    return '<div class="cap"><div class="caph">' + ic('lock', 14) + 'PRIVATE DRAFT · CAP 1.2 · status=Draft · scope=Private' + (revision ? ' · v2 (maker revised)' : ' · v1') + '</div><table><tr><th>Event</th><td>EXERCISE · flood and cyclone landfall (fixed template)</td></tr><tr><th>Urgency / Severity / Certainty</th><td><b class="unk">Unknown</b> · set by the authority, not IndTrana</td></tr><tr><th>Area</th><td>Not set · the authority defines cells and polygons</td></tr><tr><th>Instruction</th><td>“Move to higher ground. Leave the river bank and low roads.” (integer/closed-code placeholders only)</td></tr><tr><th>Evidence</th><td>3 cited items · forecast ±0.31 m · no model-generated text</td></tr><tr><th>Sender / addressee</th><td>aegis@exercise.invalid → none (never transmitted)</td></tr></table></div>';
  }
  U.closeDecision = function () { var m = $('#decision'); if (m) { m.classList.remove('on'); m.innerHTML = ''; } };
  U.makerRevising = function () { var m = $('#decision'); m.innerHTML = '<div class="dcard revise"><div class="spinner"></div><h2>Changes requested</h2><p>Returned to the maker with your rationale. A revised draft (v2) will come back for a new decision. This is the loop a single person cannot shortcut.</p></div>'; revision = 1; setTimeout(function () { if (!AX.alive) return; var d = S.DECISIONS.filter(function (x) { return x.id === 'cap'; })[0]; U.openDecision(d); }, 2600); };
  U.toast = function (title, text, color, icon) {
    var box = $('#toasts'); if (!box) return; var t = el('div', 'toast', '<span class="ti" style="--c:' + (color || '#38e1ff') + '">' + ic(icon || 'info', 16) + '</span><div><b>' + title + '</b><p>' + text + '</p></div>'); box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild); setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 6200);
  };
  function toast(a, b, c, d) { U.toast(a, b, c, d); }
  U.onEnd = function () {
    var m = $('#decision'); m.innerHTML = '<div class="dcard"><div class="dhead"><span class="big">' + ic('check', 22) + '</span><div><small>EXERCISE COMPLETE · ' + C.fmtT(C.TMAX) + '</small><h2>What this showed</h2></div></div><ul class="sum"><li>Satellites and open data gave days of warning; the AI abstained when evidence was thin.</li><li>Two humans (maker ≠ checker) approved the draft; IndTrana never sent anything.</li><li>The authority and operators carried the alert; towers failed in the flood and satellite fallback covered only compatible phones.</li><li>Staging on high ground (Plan B) reached hotspots hours earlier than the central yard (Plan A).</li></ul><div class="dfoot"><button class="link" id="eRev">Reality check</button><button class="btn big" id="eAgain">Replay</button></div></div>'; m.classList.add('on'); $('#eAgain').onclick = function () { U.closeDecision(); app.restart(); }; $('#eRev').onclick = function () { U.closeDecision(); openModal('reality'); };
  };
  U.suggestQuality = function () { toast('Running slowly?', 'Open Display (gear icon) and choose Medium or Low for smoother motion.', '#ffb547', 'gear'); };

  /* ================= keyboard ================= */
  function onKey(e) {
    if (/input|textarea/i.test(e.target.tagName)) return; var k = e.key;
    if ($('.modal.on#decision')) return;
    if (k === 'Escape') { closeModals(); app.select(null); return; }
    if (k === ' ') { e.preventDefault(); app.play(); } else if (k === 'ArrowRight') app.setTime(F.t + (e.shiftKey ? 6 : 1)); else if (k === 'ArrowLeft') app.setTime(F.t - (e.shiftKey ? 6 : 1));
    else if (k === '[') $('#bPrevE').click(); else if (k === ']') $('#bNextE').click();
    else if (k === 'l' || k === 'L') app.toggleLayer('labels'); else if (k === 'm' || k === 'M') $('#bMap').click(); else if (k === 'e' || k === 'E') $('#bEm').click(); else if (k === 'd' || k === 'D') $('#dirBtn').click();
    else if (k === 'f' || k === 'F') app.toggleFullscreen(); else if (k === 'r' || k === 'R') openModal('reality'); else if (k === 'h' || k === 'H' || k === '?') openModal('help');
    else if (/^[1-9]$/.test(k)) { var cams = $$('.cam'); var c = cams[parseInt(k, 10) - 1]; if (c) c.click(); }
  }

  /* ================= events from main ================= */
  U.onJump = function (prev, t) { shownInsights = -1; lastStoryKey = ''; lastPhoneKey = ''; refreshSide(true); };
  U.onTick = function (prev, t) {
    S.EVENTS.forEach(function (ev) { if (prev < ev.t && t >= ev.t && t - prev < 3 && !ev.decision) toast(C.fmtT(ev.t) + ' · ' + ev.title, ev.text, laneCol[ev.lane], ev.icon); });
    if (prev < 10 && t >= 10) lastStoryKey = '';
  };

  /* ================= minimap ================= */
  function buildMinimap() {
    var w = $('#minimapWrap'); w.innerHTML = '<canvas id="mm" width="336" height="336"></canvas><div class="mmcap">' + ic('map', 12) + '<span id="mmCap">Minimap</span></div>'; mini = { cv: $('#mm'), x: $('#mm').getContext('2d'), N: 112, base: null, hts: null };
    var N = mini.N, hts = new Float32Array(N * N), img = document.createElement('canvas'); img.width = img.height = N; var ix = img.getContext('2d'), id = ix.createImageData(N, N), i, j;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var x = -70 + (i + 0.5) / N * 140, z = -70 + (j + 0.5) / N * 140, h = ctx.hAt(x, z); hts[j * N + i] = h; var c = C.colorAt(x, z, h, 0.1), k = (j * N + i) * 4; var sh = 0.78 + 0.22 * Math.min(1, Math.max(0, (h) / 14));
      id.data[k] = c[0] * 255 * sh; id.data[k + 1] = c[1] * 255 * sh; id.data[k + 2] = c[2] * 255 * sh; id.data[k + 3] = 255;
    }
    ix.putImageData(id, 0, 0); mini.base = img; mini.hts = hts; mini.ov = document.createElement('canvas'); mini.ov.width = mini.ov.height = N; mini.ovx = mini.ov.getContext('2d'); mini.lastKey = '';
    mini.cv.addEventListener('click', function (e) { var r = mini.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 140 - 70, z = (e.clientY - r.top) / r.height * 140 - 70; app.panTo(x, z); app.director = false; U.onDirector(); });
  }
  function updateMinimap() {
    if (!mini || app.mode !== 'ground' || !minimapOn) return; var x = mini.x, W = mini.cv.width, N = mini.N, st = F.st, key = Math.round(st.flood * 40) + '|' + Math.round((st.pred.has ? st.pred.level : 0) * 20) + '|' + (ctx.layerOn.risk ? 1 : 0);
    if (key !== mini.lastKey) {
      mini.lastKey = key; var id = mini.ovx.createImageData(N, N), fl = st.flood, pr = st.pred.has && ctx.layerOn.risk ? st.pred.level : -9;
      for (var k = 0; k < N * N; k++) { var h = mini.hts[k], o = k * 4; if (h >= 0 && h < fl) { id.data[o] = 120; id.data[o + 1] = 90; id.data[o + 2] = 50; id.data[o + 3] = 220; } else if (h >= 0 && h < pr) { id.data[o] = 255; id.data[o + 1] = 150; id.data[o + 2] = 60; id.data[o + 3] = 120; } else if (h < 0) { id.data[o] = 20; id.data[o + 1] = 70; id.data[o + 2] = 130; id.data[o + 3] = 230; } }
      mini.ovx.putImageData(id, 0, 0);
    }
    x.imageSmoothingEnabled = true; x.clearRect(0, 0, W, W); x.drawImage(mini.base, 0, 0, W, W); x.drawImage(mini.ov, 0, 0, W, W);
    function M(px, pz) { return [(px + 70) / 140 * W, (pz + 70) / 140 * W]; }
    x.lineWidth = 2; x.strokeStyle = 'rgba(155,123,255,.9)'; x.beginPath(); for (var tau = 0; tau <= 56; tau += 4) { var e = C.eyeAt(F.t + tau), p = M(e.x, e.z); tau ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); } x.stroke();
    var ey = M(st.eye.x, st.eye.z), er = st.radius / 140 * W;
    if (ey[0] > -er && ey[0] < W + er && ey[1] > -er && ey[1] < W + er) { x.strokeStyle = 'rgba(232,238,255,.85)'; x.lineWidth = 1.5; x.beginPath(); x.arc(ey[0], ey[1], er, 0, 7); x.stroke(); x.fillStyle = '#e8eeff'; x.beginPath(); x.arc(ey[0], ey[1], 4, 0, 7); x.fill(); }
    else { var ang = Math.atan2(ey[1] - W / 2, ey[0] - W / 2); x.fillStyle = '#e8eeff'; x.save(); x.translate(W / 2 + Math.cos(ang) * (W / 2 - 10), W / 2 + Math.sin(ang) * (W / 2 - 10)); x.rotate(ang); x.beginPath(); x.moveTo(8, 0); x.lineTo(-6, -6); x.lineTo(-6, 6); x.fill(); x.restore(); }
    S.TOWERS.forEach(function (t) { var p = M(t.x, t.z), s = S.towerStatus(t, F.t); x.fillStyle = s === 'down' ? '#ff5d6c' : s === 'degraded' ? '#ffb547' : '#4be3a0'; x.beginPath(); x.arc(p[0], p[1], 3.4, 0, 7); x.fill(); });
    S.SHELTERS.forEach(function (t) { var p = M(t.x, t.z); x.fillStyle = '#e8eeff'; x.fillRect(p[0] - 4, p[1] - 4, 8, 8); x.fillStyle = '#2e9e6b'; x.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5); });
    S.HOTSPOTS.forEach(function (t) { var p = M(t.x, t.z); x.strokeStyle = '#ff5d6c'; x.lineWidth = 1.5; x.beginPath(); x.arc(p[0], p[1], 5, 0, 7); x.stroke(); });
    if (ctx.layerOn.teams && ctx.actorsTeams) ctx.actorsTeams.forEach(function (tm) { var p = M(tm.root.position.x, tm.root.position.z); x.fillStyle = tm.d.color; x.fillRect(p[0] - 3, p[1] - 3, 6, 6); });
    var ci = app.camInfo(), cp = M(ci.target.x, ci.target.z), a = ci.th + Math.PI, fov = 0.6, L = 52;
    x.fillStyle = 'rgba(255,255,255,.14)'; x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cp[0] + Math.sin(ci.th) * 22, cp[1] + Math.cos(ci.th) * 22); x.lineTo(cp[0] + Math.sin(ci.th + fov) * 0, cp[1]); x.lineTo(cp[0] - Math.sin(ci.th + fov) * L * 0, cp[1]); x.closePath();
    var ox = cp[0] + Math.sin(ci.th) * Math.min(60, ci.r * 0.5), oz = cp[1] + Math.cos(ci.th) * Math.min(60, ci.r * 0.5); x.beginPath(); x.moveTo(ox, oz); x.lineTo(cp[0] + Math.sin(ci.th + 0.9) * 18 * 0 + (cp[0] - ox) * 0.0 + 0, cp[1]); x.stroke();
    x.beginPath(); x.moveTo(ox, oz); x.lineTo(cp[0] - (oz - cp[1]) * 0.5, cp[1] + (ox - cp[0]) * 0.5); x.lineTo(cp[0] + (oz - cp[1]) * 0.5, cp[1] - (ox - cp[0]) * 0.5); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cp[0], cp[1], 3, 0, 7); x.fill();
    var lbl = $('#mmCap'); if (lbl) lbl.textContent = 'Flood ' + st.flood.toFixed(2) + ' m' + (st.pred.has ? ' · forecast peak ' + st.pred.level.toFixed(1) + '±' + st.pred.sigma.toFixed(2) : '');
  }

  /* ================= labels ================= */
  var _v;
  function updateLabels(cam) {
    if (!ctx || !cam) return; _v = _v || new THREE.Vector3(); var show = ctx.layerOn.labels, mode = app.mode === 'space', cands = [], W = innerWidth, H = innerHeight;
    ctx.entities.forEach(function (e) {
      var elx = labelEls[e.id]; if (!show || !!e.space !== mode || !ctx.layerOn[e.layer] && e.layer !== 'labels') { if (elx) elx.style.display = 'none'; return; }
      e.anchor.getWorldPosition(_v); _v.y += e.lblY || 0; var d = _v.distanceTo(cam.position), lim = e.kind === 'place' ? 520 : e.kind === 'tower' || e.kind === 'hotspot' || e.kind === 'staging' || e.kind === 'gauge' ? 85 : e.kind === 'team' ? 140 : e.kind === 'person' ? 30 : e.kind === 'facility' || e.kind === 'shelter' ? 110 : 1e5;
      if (d > lim && F.selected !== e.id && F.hover !== e.id) { if (elx) elx.style.display = 'none'; return; }
      if (e.kind === 'place' && d < 28 && !mode) { if (elx) elx.style.display = 'none'; return; }
      _v.project(cam); if (_v.z > 1 || _v.x < -1.05 || _v.x > 1.05 || _v.y < -1.05 || _v.y > 1.05) { if (elx) elx.style.display = 'none'; return; }
      if (mode && e.kind !== 'place' && e.anchor.getWorldPosition(new THREE.Vector3()).dot(cam.position) < 0 && false) { }
      cands.push({ e: e, x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, d: d, p: (e.prio || 1) * 1000 - d + (F.selected === e.id ? 1e6 : 0) + (F.hover === e.id ? 1e6 : 0) });
    });
    cands.sort(function (a, b) { return b.p - a.p; });
    var keep = {}, placed = [];
    cands.forEach(function (c) { if (placed.length >= 30) return; for (var i = 0; i < placed.length; i++) if (Math.abs(placed[i].x - c.x) < 62 && Math.abs(placed[i].y - c.y) < 17 && c.p < 1e5) return; placed.push(c); keep[c.e.id] = c; });
    ctx.entities.forEach(function (e) {
      var c = keep[e.id], elx = labelEls[e.id]; if (!c) { if (elx) elx.style.display = 'none'; return; }
      if (!elx) { elx = el('div', 'lbl ' + e.kind + (e.style ? ' ' + e.style : ''), '<i class="ldot"></i>' + ic(e.icon || 'pin', 12) + '<span class="ln"></span><em class="ls"></em>'); elx.style.setProperty('--c', e.color || '#fff'); elx.onclick = function () { app.select(e.id); }; elx.ondblclick = function () { app.focusEntity(e.id); }; labelsEl.appendChild(elx); labelEls[e.id] = elx; $('.ln', elx).textContent = e.name; }
      elx.style.display = ''; elx.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px) translate(-50%,-100%)'; elx.classList.toggle('sel', F.selected === e.id); elx.classList.toggle('hov', F.hover === e.id);
      elx.style.opacity = e.kind === 'place' ? C.clamp(1.2 - c.d / 520, 0.45, 1) : 1;
    });
  }
  var lastLblTxt = 0;
  function updateLabelTexts() {
    ctx.entities.forEach(function (e) {
      var elx = labelEls[e.id]; if (!elx || elx.style.display === 'none') return; var s = '', dot = '';
      if (e.kind === 'tower') { var st = S.towerStatus(S.TOWERS.filter(function (x) { return x.id === e.id; })[0], F.t); dot = st; s = st === 'down' ? 'DOWN' : st === 'degraded' ? 'degraded' : ''; }
      else if (e.kind === 'team') { var tm = S.TEAMS.filter(function (x) { return x.id === e.id; })[0], r = ctx.actorsTeamAt(tm, F.t, F.plan); s = r.status; dot = r.status === 'Cut off' ? 'down' : r.status === 'Deployed' || r.status === 'Moving to hotspot' ? 'ok' : ''; }
      else if (e.kind === 'shelter') { s = fN(ctx.shelterOcc[e.id] || 0) + ' sheltered'; }
      else if (e.kind === 'gauge') { s = Math.round(F.st.qn * 100) + '% of peak'; dot = F.st.qn > 0.75 ? 'down' : F.st.qn > 0.45 ? 'degraded' : 'ok'; }
      else if (e.kind === 'place') s = e.sub || ''; else if (e.kind === 'cyclone') s = F.st.category;
      else if (e.id === 'fac_sub') { dot = S.powerOutage(F.t) ? 'down' : 'ok'; s = S.powerOutage(F.t) ? 'tripped' : ''; }
      var sp = $('.ls', elx); if (sp.textContent !== s) sp.textContent = s; var dd = $('.ldot', elx); if (dd.dataset.s !== dot) { dd.dataset.s = dot; }
    });
  }

  /* ================= per-frame ================= */
  var lastT = 0, lastPh = null;
  U.update = function (f, cam) {
    F = f; var now = performance.now(), st = F.st;
    $('#playhead').style.left = ((F.t - C.TMIN) / (C.TMAX - C.TMIN) * trackW) + 'px';
    if (now - slow.kpi > 120) {
      slow.kpi = now; $('#tLabel').textContent = st.tLabel; $('#clock').textContent = st.clock; $('#dayLabel').textContent = C.dayLabel(F.t); $('#phLabel').textContent = st.tLabel;
      setK('rain', st.rainMmh + ' mm/h', st.rain > 0.6 ? 'bad' : st.rain > 0.2 ? 'warn' : ''); setK('wind', st.windKmh + ' km/h', st.wind > 0.7 ? 'bad' : st.wind > 0.4 ? 'warn' : ''); setK('flood', st.flood.toFixed(2) + ' m', st.flood > 1.3 ? 'bad' : st.flood > 0.5 ? 'warn' : '');
      var k = F.kpi; if (k) { setK('reach', F.t < -17 ? '—' : fP(Math.max(k.reached1, 0)) + (k.reached2 > 0 ? ' → ' + fP(k.reached2) : ''), F.t > -17 && k.reached1 < 0.85 ? 'warn' : ''); setK('shel', fN(k.sheltered), ''); setK('danger', fN(k.danger), k.danger > 0 ? 'bad' : ''); setK('towers', k.towersUp + '/' + k.towersTotal, k.towersUp < k.towersTotal ? 'bad' : ''); setK('teams', k.teamsDeployed + '/' + k.teamsTotal, ''); setK('power', k.power ? 'On' : 'OUT', k.power ? '' : 'bad'); }
      var slowNow = S.rateFactor(F.t) < 1; $('#slowChip').classList.toggle('on', slowNow && app.sim.playing);
      var em = !!F.emergency; if (AX.root.classList.contains('emergency') !== em) { AX.root.classList.toggle('emergency', em); $('#bEm').classList.toggle('on', em); if (em) { lastStoryKey = ''; } }
      var ph = S.phaseAt(F.t).id; if (ph !== lastPh) { lastPh = ph; $$('#phaseChips .pc').forEach(function (b, i) { b.classList.toggle('on', S.PHASES[i].id === ph); }); lastStoryKey = ''; }
      $$('#marks .mk').forEach(function (m) { m.classList.toggle('past', parseFloat(m.dataset.t) <= F.t); });
      var ec = $('#emBanner'); if (em) { var dl = -F.t; ec.innerHTML = ic('siren', 16) + '<b>EMERGENCY MODE</b><span>' + (dl > 0 ? 'Landfall in ' + Math.floor(dl) + 'h ' + ('0' + Math.floor((dl % 1) * 60)).slice(-2) + 'm' : 'Landfall +' + Math.floor(-dl) + 'h ' + ('0' + Math.floor((-dl % 1) * 60)).slice(-2) + 'm ago') + '</span><small>Synthetic exercise · no live action</small>'; ec.classList.add('on'); } else ec.classList.remove('on');
      var dv = $('#diveHint'); if (dv) dv.classList.toggle('on', app.mode === 'space' && !app.nogl);
      $$('.cam').forEach(function (c) { c.classList.toggle('on', c.dataset.c === app.lastPreset); });
      $('#qFps') && ($('#qFps').textContent = F.fps ? Math.round(F.fps) : '—');
    }
    if (now - slow.side > 250) { slow.side = now; if (curTab === 'copilot') renderCopilot(false); else if (curTab !== 'story') refreshSide(false); else renderStory(false); if (!ctx.actorsTeamAt && app.actors) { ctx.actorsTeamAt = app.actors.teamAt; ctx.actorsPeople = app.actors.people; ctx.actorsTeams = app.actors.teams; } updatePhone(); updateLabelTexts(); if (curTab === 'inspect' && F.selected) renderInspect(false); }
    if (now - slow.mini > 160) { slow.mini = now; updateMinimap(); }
    if (cam) updateLabels(cam);
  };
  U.suggest = function () { };
}
