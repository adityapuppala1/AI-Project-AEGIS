/* AEGIS Live Earth — UI shell: top bar, search, KPIs, layers, tabs, dock, consent, toasts. Panels live in live-panels.js. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {}, U = AX.LiveUI = {}, LV, S, L, M, $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var ICON = {
    globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', zoom: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5', layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5', satellite: 'M10 9h4v6h-4zM3 10h5v4H3zM16 10h5v4h-5zM12 9V5M12 19v-4',
    rain: 'M7 15a4 4 0 01-.5-8 5.5 5.5 0 0110.7 1A3.5 3.5 0 0117 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3', wind: 'M3 8h10a3 3 0 100-3M3 12h15a3 3 0 110 3M3 16h8a2.5 2.5 0 11-2.5 2.5', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
    snow: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M9 4l3 2 3-2M9 20l3-2 3 2', thermo: 'M10 14V5a2 2 0 114 0v9a4 4 0 11-4 0z', waves: 'M3 8c3-3 5 3 9 0s6 3 9 0M3 14c3-3 5 3 9 0s6 3 9 0M3 20c3-3 5 3 9 0s6 3 9 0', mountain: 'M2 20l7-12 4 6 3-4 6 10z', building: 'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18',
    home: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6', tower: 'M12 3v18M7 21l5-14 5 14M9 13h6M5 7a8 8 0 012-3M19 7a8 8 0 00-2-3', radio: 'M4.9 19.1a10 10 0 010-14.2M7.8 16.2a6 6 0 010-8.4M16.2 7.8a6 6 0 010 8.4M19.1 4.9a10 10 0 010 14.2M12 11a1 1 0 100 2 1 1 0 000-2z', phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
    shield: 'M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6z', alert: 'M12 3l10 18H2zM12 10v5M12 18v.5', info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5', x: 'M5 5l14 14M19 5L5 19', chevron: 'M8 5l8 7-8 7', check: 'M4 12l5 5L20 6', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', pin: 'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', help: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 4M12 17.5v.5', expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z', play: 'M7 4l13 8-13 8z', pause: 'M7 5v14M17 5v14', refresh: 'M20 11a8 8 0 10-2 6M20 5v6h-6',
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3', ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5', zap: 'M13 2L4 14h7l-1 8 9-12h-7z', cloud: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.7 1A3.5 3.5 0 0117 18z',
    hospital: 'M4 21V6h16v15M12 9v6M9 12h6M9 21v-4h6v4', route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6', target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z', crosshair: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 100 8 4 4 0 000-8z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', chart: 'M4 20V6M4 20h16M8 16v-4M12 16V9M16 16v-6', flame: 'M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z', quake: 'M3 12h3l2-6 3 12 3-9 2 3h5', send: 'M3 11l18-8-8 18-2-8z', ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8',
    cyclone: 'M12 10a2 2 0 100 4 2 2 0 000-4zM12 3c5 0 7 4 5 7M21 12c0 5-4 7-7 5M12 21c-5 0-7-4-5-7M3 12c0-5 4-7 7-5', school: 'M3 10l9-5 9 5-9 5zM7 12v5c0 1 2.5 2 5 2s5-1 5-2v-5', users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3 3 0 010 6M19 20c0-2.5-1-4.5-3-5.5', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z'
  };
  function ic(n, sz) { return '<svg class="ic" width="' + (sz || 16) + '" height="' + (sz || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICON[n] || ICON.info) + '"/></svg>'; }
  U.ic = ic; U.$ = $; U.$$ = $$;
  U.el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PRESETS = [['Hyderabad', 17.385, 78.4867, 'AEGIS pilot city'], ['Chennai', 13.0827, 80.2707, 'coast · cyclones'], ['Mumbai', 19.076, 72.8777, 'coast · monsoon'], ['Kolkata', 22.5726, 88.3639, 'delta · cyclones'], ['Visakhapatnam', 17.6868, 83.2185, 'coast'], ['Bhubaneswar', 20.2961, 85.8245, 'cyclone landfalls'], ['Guwahati', 26.1445, 91.7362, 'Brahmaputra floods'], ['Kochi', 9.9312, 76.2673, 'coast · floods'], ['Shimla', 31.1048, 77.1734, 'snow'], ['Leh', 34.1526, 77.5771, 'snow · cold'], ['Port Blair', 11.6234, 92.7265, 'tsunami 2004'], ['Delhi', 28.6139, 77.209, 'heat · smog']];
  U.PRESETS = PRESETS;

  U.init = function (lv) {
    LV = lv; S = LV.state; L = LV.L; M = LV.M;
    buildTop(); buildKpis(); buildLayers(); buildSide(); buildDock(); buildModals();
    var goLiveBtn = $('#goLive'); if (goLiveBtn) goLiveBtn.onclick = function () { openModal('consent'); };
    LV.on('live', onLive); LV.on('place', function () { updateKpis(); onPlace(); }); LV.on('data', function () { updateKpis(); U.refresh(); }); LV.on('board', function () { updateKpis(); U.refresh(); }); LV.on('quakes', function () { updateKpis(); U.refresh(); }); LV.on('events', function () { updateKpis(); U.refresh(); }); LV.on('sats', function () { updateKpis(); U.refresh(); });
    LV.on('select', function (h) { U.refresh(true); if (h) setTab(h.kind === 'sat' ? 'orbit' : 'earth'); }); LV.on('hover', onHover); LV.on('toast', function (t) { U.toast(t.title, t.text, t.color, t.icon); }); LV.on('mode', onMode); LV.on('busy', onBusy); LV.on('tab', setTab);
    LV.on('nogl', function () { $('#nogl').classList.add('on'); }); LV.on('autolive', function () { U.toast('Live data on', 'Enabled by the page address (?live=1). Read-only public sources only.', '#4be3a0', 'check'); });
    LV.on('frame', onFrame);
    var lastTh = 9, lastScale = '';
    LV.on('frame', function (F) {
      var cp = $('#compass'); if (!cp || !cp.firstChild) return; var th = LV.camTh || 0; if (Math.abs(th - lastTh) > 0.008) { lastTh = th; cp.firstChild.style.transform = 'rotate(' + th.toFixed(3) + 'rad)'; }
      var sb = $('#scalebar'), txt = ''; if (S.mode === 'place' && LV.place3d && LV.place3d.info.unit) { var mpp = 2 * (LV.camR || 100) * Math.tan(24 * Math.PI / 180) / F.H * LV.place3d.info.unit, nice = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000], pick = nice[0]; for (var q2 = 0; q2 < nice.length; q2++) if (nice[q2] / mpp <= 140) pick = nice[q2]; txt = Math.round(pick / mpp) + '|' + (pick >= 1000 ? pick / 1000 + ' km' : pick + ' m'); }
      if (txt !== lastScale) { lastScale = txt; if (!txt) sb.style.display = 'none'; else { var pr = txt.split('|'); sb.style.display = ''; sb.firstChild.style.width = pr[0] + 'px'; sb.lastChild.textContent = pr[1] + ' at the centre'; } }
    });
    var cpb = $('#compass'); if (cpb) { cpb.innerHTML = '<i><b>N</b></i>'; cpb.title = 'North. Click to face north.'; cpb.onclick = function () { LV.faceNorth(); }; }
    var sbb = $('#scalebar'); if (sbb) { sbb.innerHTML = '<i></i><span></span>'; sbb.style.display = 'none'; } LV.on('layers', function () { renderLayers(); });
    LV.on('gate', function (m) { U.toast('Live data not enabled', m === 'disabled' ? 'Public feeds are switched off for this deployment (start AEGIS with -PublicEarth).' : 'The AEGIS API could not confirm that public feeds are enabled.', '#ffb547', 'alert'); });
    LV.on('tx', function (e) { var box = $('#txlog'); if (!box) return; var s2 = L.SOURCES[e.src], row = U.el('div', 'tx' + (e.ok ? '' : ' bad'), (e.ok ? '↓ ' : '✕ ') + U.esc(s2 ? s2.name.split(' (')[0] : e.src) + ' · ' + (e.ok ? e.ms + ' ms' : 'failed')); box.insertBefore(row, box.firstChild); while (box.children.length > 4) box.removeChild(box.lastChild); setTimeout(function () { row.remove(); }, 5200); if (U.tab === 'sources') U.refresh(); }); L.onStatus = function () { updateAttr(); if (U.tab === 'sources') U.refresh(); if (U.tab === 'earth') U.markBusy(); };
    AX.on(document, 'keydown', onKey); onLive(); onMode(); updateKpis(); setTab(U.tab || 'earth'); AX.root.classList.add('ready');
  };

  /* ================= top ================= */
  function buildTop() {
    $('#top').innerHTML = '<a class="btn home" href="/" data-aj-exit title="Back to the AEGIS Command Center">' + ic('home', 15) + '<span>Home</span></a><a class="brand" href="/" data-aj-exit title="Back to the AEGIS Command Center">' + ic('globe', 18) + '<b>AEGIS</b><span>Alert Journey · Live Earth</span></a>' +
      '<button class="livechip" id="liveChip" title="Live public data (read-only)"><i class="dotlive"></i><span id="liveTxt">Live data: OFF</span></button>' +
      '<form class="search" id="searchForm" autocomplete="off">' + ic('zoom', 15) + '<input id="searchIn" placeholder="Search any place on Earth…" aria-label="Search a place"><div class="sugg" id="sugg"></div></form>' +
      '<div class="clockb" id="clockB"><div class="tl" id="clockT">--:--</div><div class="cl"><span id="clockP">UTC</span><small id="clockD"></small></div></div><div class="sp"></div>' +
      '<a class="btn" href="?mode=exercise" data-aj-mode="exercise" title="Back to the synthetic exercise (no live data)">' + ic('shield', 15) + '<span>Synthetic exercise</span></a>' +
      '<button class="btn icon" id="btnHelp" aria-label="Help">' + ic('help', 16) + '</button><button class="btn icon" id="btnFs" aria-label="Fullscreen">' + ic('expand', 16) + '</button>';
    $('#liveChip').onclick = function () { if (S.live) openModal('sources'); else openModal('consent'); };
    $('#btnHelp').onclick = function () { openModal('help'); }; $('#btnFs').onclick = function () { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function () { }); else document.exitFullscreen().catch(function () { }); };
    var inp = $('#searchIn'), timer = null;
    function showSugg(list, note) {
      var h = list.map(function (r, i) { return '<button type="button" class="sg" data-i="' + i + '">' + ic('pin', 14) + '<span><b>' + U.esc(r.name) + '</b><small>' + U.esc([r.admin, r.country].filter(Boolean).join(', ') || r.note || '') + '</small></span></button>'; }).join('') + (note ? '<div class="sgn">' + note + '</div>' : '');
      var box = $('#sugg'); box.innerHTML = h; box.classList.toggle('on', !!h); $$('.sg', box).forEach(function (b) { b.onclick = function () { var r = list[+b.dataset.i]; box.classList.remove('on'); inp.value = ''; LV.selectPlace(r); if (!S.live) U.toast('Place chosen', 'Turn live data on to load its real weather and map.', '#ffb547', 'info'); }; });
    }
    function presets() { return PRESETS.map(function (p) { return { name: p[0], lat: p[1], lon: p[2], admin: '', country: '', note: p[3] }; }); }
    inp.addEventListener('focus', function () { if (!inp.value) showSugg(presets(), 'Quick places · or type to search worldwide'); });
    inp.addEventListener('input', function () { clearTimeout(timer); var q = inp.value.trim(); if (!q) { showSugg(presets()); return; } timer = setTimeout(function () { if (!S.live) { var lo = q.toLowerCase(); showSugg(presets().filter(function (p) { return p.name.toLowerCase().indexOf(lo) > -1; }), 'Turn live data on to search worldwide'); return; } L.geocode(q).then(function (r) { showSugg(r, r.length ? '' : 'No match'); }).catch(function () { showSugg([], 'Search unavailable right now'); }); }, 320); });
    AX.on(document, 'click', function (e) { if (!e.target.closest('#searchForm')) $('#sugg').classList.remove('on'); });
    $('#searchForm').addEventListener('submit', function (e) { e.preventDefault(); var b = $('#sugg .sg'); if (b) b.click(); });
  }
  function onLive() { var on = S.live; $('#liveChip').classList.toggle('on', on); $('#liveTxt').textContent = on ? 'LIVE · public data' : 'Live data: OFF'; AX.root.classList.toggle('live', on); updateAttr(); if (U.refresh) U.refresh(true); var dv = $('#goLive'); if (dv) dv.classList.toggle('on', !on && S.mode === 'earth'); }

  /* ================= guided steps ================= */
  var GUIDE = ['Connect live data', 'Choose a place', 'Dive in', 'Play the forecast', 'Run the alert drill'];
  function renderGuide() {
    var box = $('#guide'); if (!box) return; if (U.guideOff) { box.style.display = 'none'; return; }
    var done = [S.live, !!S.place, S.mode === 'place', !!U.scrubbed, !!(LV.place3d && LV.place3d.drill && LV.place3d.drill.state !== 'idle')], cur = done.indexOf(false), key = done.join() + cur;
    if (key === U.guideKey) return; U.guideKey = key;
    box.innerHTML = GUIDE.map(function (label, i) { return '<button type="button" class="gs' + (done[i] ? ' done' : i === cur ? ' cur' : '') + '" data-step="' + (i + 1) + '"' + (i === cur ? ' aria-current="step"' : '') + '><i>' + (done[i] ? '✓' : i + 1) + '</i><span>' + label + '</span></button>'; }).join('<em></em>') + '<button type="button" class="gx" aria-label="Hide the guide">×</button>';
    $$('.gs', box).forEach(function (b) { b.onclick = function () { guideStep(+b.dataset.step); }; });
    $('.gx', box).onclick = function () { U.guideOff = true; renderGuide(); };
  }
  function guideStep(n) {
    if (n === 1) { if (S.live) openModal('sources'); else openModal('consent'); return; }
    if (!S.live) { U.needLive(); return; }
    if (n === 2) { $('#searchIn').focus(); return; }
    if (!S.place) { $('#searchIn').focus(); U.toast('Choose a place first', 'Search above, or click anywhere on the globe.', '#ffb547', 'pin'); return; }
    if (n === 3) { if (S.mode !== 'place') LV.enterPlace('region'); else setTab('place'); return; }
    if (n === 4) { if (S.mode !== 'place') LV.enterPlace('region'); else $('#bPlay').click(); return; }
    if (n === 5) { if (S.mode !== 'place' || S.scale !== 'city') LV.enterPlace('city'); setTab('comms'); }
  }
  U.renderGuide = renderGuide;

  /* ================= KPI strip ================= */
  var KP = [['place', 'pin', 'Place'], ['temp', 'thermo', 'Temperature'], ['gust', 'wind', 'Wind gust'], ['rain', 'rain', 'Rain 24 h'], ['river', 'waves', 'River flood'], ['att', 'alert', 'Attention'], ['quakes', 'quake', 'Quakes M5+ · 7 d'], ['events', 'cyclone', 'Open events'], ['sats', 'satellite', 'Satellites overhead']];
  function buildKpis() { var w = $('#kpis'); KP.forEach(function (k) { w.appendChild(U.el('div', 'kpi', ic(k[1], 15) + '<div><label>' + k[2] + '</label><b id="k_' + k[0] + '">—</b></div>')); w.lastChild.dataset.k = k[0]; }); }
  function setK(id, v, tone) { var e = $('#k_' + id); if (!e) return; if (e.textContent !== v) { e.textContent = v; var p = e.closest('.kpi'); p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse'); } e.closest('.kpi').dataset.tone = tone || ''; }
  function updateKpis() {
    var d = S.data, P = S.place, b = S.board, f = d.forecast, tone = ['', 'warn', 'warn', 'bad', 'bad'];
    setK('place', P ? P.name : 'none selected', '');
    if (f) { var c = f.current; setK('temp', c.temp.toFixed(0) + ' °C', ''); setK('gust', c.gust.toFixed(0) + ' km/h', c.gust >= 62 ? 'warn' : ''); var r24 = M.windowSum(f.hours, Date.now() - 24 * 3600000, 'precip', 24); setK('rain', r24.toFixed(0) + ' mm', M.rainClass(r24).level >= 2 ? 'warn' : ''); } else { setK('temp', '—'); setK('gust', '—'); setK('rain', '—'); }
    var fl = b && b.rows.filter(function (r) { return r.id === 'flood'; })[0]; setK('river', fl ? (fl.abstain ? 'no estimate' : M.LEVELS[fl.level]) : '—', fl ? tone[fl.level] : '');
    setK('att', b ? b.label : '—', b ? tone[b.level] : '');
    var q = d.quakes || []; setK('quakes', q.filter(function (x) { return x.mag >= 5; }).length + ' · max M' + (q.length ? Math.max.apply(null, q.map(function (x) { return x.mag; })).toFixed(1) : '—'), '');
    var ev = d.events || []; setK('events', ev.length ? ev.length + ' · ' + ev.filter(function (x) { return x.cat === 'storm'; }).length + ' storms' : '—', '');
    var sa = LV.globe ? LV.globe.sats() : []; setK('sats', S.place && sa.length ? U.overhead + ' of ' + sa.length : sa.length ? sa.length + ' tracked' : '—', '');
  }
  U.overhead = 0;

  /* ================= layers + cameras ================= */
  function buildLayers() {
    var h = '<div class="lhead"><span>' + ic('layers', 15) + 'Layers</span></div><div class="lbody"><div id="lyEarth"></div><div id="lyPlace"></div><div id="lyMotion"></div><h4>Cameras</h4><div class="cams" id="camList"></div><div class="btnstack" id="diveBtns"></div></div>';
    $('#layers').innerHTML = h; $('#layers .lhead').onclick = function () { $('#layers').classList.toggle('collapsed'); }; renderLayers();
  }
  function renderLayers() {
    var im = [['truecolor', 'sun', 'True colour (MODIS)'], ['rain', 'rain', 'Rain rate (IMERG)'], ['snow', 'snow', 'Snow cover (MODIS)'], ['sst', 'thermo', 'Sea temperature (MUR)'], ['none', 'globe', 'Blue Marble only']];
    var h = '<h4>Earth imagery (NASA GIBS)</h4>' + im.map(function (m) { return '<label class="lrow radio' + (S.imagery === m[0] ? ' on' : '') + '" data-im="' + m[0] + '">' + ic(m[1], 15) + '<span>' + m[2] + '</span><i class="sw"></i></label>'; }).join('');
    h += '<h4>Earth layers</h4>' + [['night', 'moon', 'Night lights'], ['sats', 'satellite', 'Satellites (live orbits)'], ['quakes', 'quake', 'Earthquakes (USGS)'], ['events', 'cyclone', 'Storms & events (EONET)'], ['borders', 'map', 'Graticule & India outline']].map(function (m) { return '<label class="lrow tg' + (S.layers[m[0]] ? ' on' : '') + '" data-ly="' + m[0] + '">' + ic(m[1] === 'moon' ? 'clock' : m[1], 15) + '<span>' + m[2] + '</span><i class="sw"></i></label>'; }).join('');
    $('#lyEarth').innerHTML = h;
    $('#lyPlace').innerHTML = '<h4>Place scene</h4>' + [['fx', 'rain', 'Rain · snow · lightning'], ['wind', 'wind', 'Wind streaks'], ['rainOverlay', 'rain', 'Rain overlay (IMERG)'], ['snowOverlay', 'snow', 'Snow overlay (MODIS)'], ['flood', 'waves', 'Flood scenario'], ['contours', 'mountain', 'Elevation contours' + (LV.place3d && LV.place3d.info.contour ? ' (' + LV.place3d.info.contour + ' m)' : '')], ['buildings', 'building', '3D buildings (OSM)'], ['towers', 'tower', 'Cell towers (OSM)'], ['pois', 'hospital', 'Hospitals · schools'], ['labels', 'pin', 'Labels']].map(function (m) { return '<label class="lrow tg' + (S.layers[m[0]] ? ' on' : '') + '" data-ly="' + m[0] + '">' + ic(m[1], 15) + '<span>' + m[2] + '</span><i class="sw"></i></label>'; }).join('');
    $$('#layers [data-im]').forEach(function (r) { r.onclick = function () { if (!S.live) return U.needLive(); LV.globe.setImagery(r.dataset.im); renderLayers(); }; });
    $$('#layers [data-ly]').forEach(function (r) { r.onclick = function () { S.layers[r.dataset.ly] = !S.layers[r.dataset.ly]; if (LV.place3d && LV.place3d.layerChanged) LV.place3d.layerChanged(r.dataset.ly); renderLayers(); LV.emit('layers'); }; });
    var views = (S.scale === 'region' ? [['modis', 'sun', 'Yesterday from space (MODIS)']] : []).concat([['s2', 'satellite', 'Satellite view (Sentinel-2)'], ['map', 'map', 'Street map (OpenStreetMap)']]);
    $('#lyMotion').innerHTML = (S.mode === 'place' ? '<h4>Ground view</h4>' + views.map(function (v) { return '<label class="lrow radio' + (S.view === v[0] ? ' on' : '') + '" data-view="' + v[0] + '">' + ic(v[1], 15) + '<span>' + v[2] + '</span><i class="sw"></i></label>'; }).join('') : '') +
      '<h4>Motion</h4>' + [[1, 'Full motion'], [0.5, 'Calm'], [0, 'Still (no parallax or flashes)']].map(function (m) { return '<label class="lrow radio' + (S.motion === m[0] ? ' on' : '') + '" data-mo="' + m[0] + '">' + ic('wind', 15) + '<span>' + m[1] + '</span><i class="sw"></i></label>'; }).join('') + '<label class="lrow tg' + (LV.gov && LV.gov.saver ? ' on' : '') + '" id="psRow">' + ic('zap', 15) + '<span>Power saver (30 fps)</span><i class="sw"></i></label>';
    var psr = $('#psRow'); if (psr) psr.onclick = function () { if (LV.gov) LV.gov.saver = !LV.gov.saver; renderLayers(); };
    $$('#lyMotion [data-view]').forEach(function (r) { r.onclick = function () { if (LV.place3d && LV.place3d.setImagery) LV.place3d.setImagery(r.dataset.view); renderLayers(); }; });
    $$('#lyMotion [data-mo]').forEach(function (r) { r.onclick = function () { S.motion = +r.dataset.mo; LV.reduced = S.motion === 0 || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); renderLayers(); }; });
    var cams = S.mode === 'earth' ? [['earth', 'globe', 'Earth'], ['india', 'map', 'India'], ['place', 'pin', 'Place']] : [['top', 'map', 'Top-down'], ['oblique', 'eye', 'Oblique'], ['low', 'users', 'Ground view'], ['orbitspin', 'refresh', 'Spin']];
    $('#camList').innerHTML = ''; cams.forEach(function (c) { var b = U.el('button', 'cam', ic(c[1], 14) + '<span>' + c[2] + '</span>'); b.onclick = function () { LV.camPreset(c[0]); }; $('#camList').appendChild(b); });
    var db = $('#diveBtns'); db.innerHTML = '';
    if (S.mode === 'earth') { [['region', 'Dive: region (satellite)'], ['city', 'Dive: city (real map)']].forEach(function (x) { var b = U.el('button', 'btn wide', ic('zoom', 14) + '<span>' + x[1] + '</span>'); b.disabled = !S.place; b.onclick = function () { LV.enterPlace(x[0]); }; db.appendChild(b); }); }
    else { var b1 = U.el('button', 'btn wide', ic('globe', 14) + '<span>Back to Earth</span>'); b1.onclick = LV.backToEarth; db.appendChild(b1); var other = S.scale === 'city' ? 'region' : 'city', b2 = U.el('button', 'btn wide', ic('zoom', 14) + '<span>Switch to ' + other + '</span>'); b2.onclick = function () { LV.enterPlace(other); }; db.appendChild(b2); }
    U.shut = U.shut || {};
    $$('#layers .lbody h4').forEach(function (h4) {
      var key = h4.textContent, n = h4.nextElementSibling; h4.classList.toggle('shut', !!U.shut[key]); h4.setAttribute('role', 'button'); h4.setAttribute('aria-expanded', U.shut[key] ? 'false' : 'true');
      while (n && n.tagName !== 'H4') { n.style.display = U.shut[key] ? 'none' : ''; n = n.nextElementSibling; }
      h4.onclick = function () { U.shut[key] = !U.shut[key]; renderLayers(); };
    });
    $('#lyPlace').style.display = S.mode === 'place' ? '' : 'none'; $('#lyEarth').style.display = S.mode === 'earth' ? '' : 'none';
  }
  U.renderLayers = renderLayers;
  U.needLive = function () { U.toast('Live data is off', 'Click “Live data: OFF” in the top bar to connect public sources.', '#ffb547', 'alert'); };

  /* ================= tabs ================= */
  var TABS = [['earth', 'globe', 'Earth'], ['place', 'pin', 'Place'], ['flood', 'waves', 'Flood'], ['impact', 'target', 'Impact'], ['comms', 'radio', 'Comms'], ['orbit', 'satellite', 'Orbit'], ['sources', 'database', 'Sources']];
  U.tab = 'earth';
  function buildSide() {
    var s = $('#side'); s.innerHTML = '<div class="tabs" role="tablist"></div><div class="panels"></div><button class="grab" id="sideToggle" aria-label="Collapse panel">' + ic('chevron', 14) + '</button>';
    TABS.forEach(function (t) { var b = U.el('button', 'tab', ic(t[1], 15) + '<span>' + t[2] + '</span>'); b.dataset.tab = t[0]; b.onclick = function () { setTab(t[0]); }; $('.tabs', s).appendChild(b); var p = U.el('section', 'aj-panel'); p.id = 'tab-' + t[0]; $('.panels', s).appendChild(p); });
    $('#sideToggle').onclick = function () { s.classList.toggle('collapsed'); };
  }
  function setTab(n) { U.tab = n; $$('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === n); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', b.dataset.tab === n ? 'true' : 'false'); }); $$('.aj-panel').forEach(function (p) { p.classList.toggle('on', p.id === 'tab-' + n); }); $('#side').classList.remove('collapsed'); U.refresh(true); }
  U.setTab = setTab;
  var rtimer = null;
  U.refresh = function (now) { if (!AX.LivePanels) return; clearTimeout(rtimer); rtimer = setTimeout(function () { var f = AX.LivePanels[U.tab]; if (f) f($('#tab-' + U.tab), LV, U); }, now ? 0 : 120); };
  U.markBusy = function () { };

  /* ================= dock (time) ================= */
  function buildDock() {
    $('#dock').innerHTML = '<div class="drow"><div class="ctl"><button class="btn play" id="bPlay"></button><button class="btn icon" id="bNow" title="Back to now">' + ic('clock', 16) + '</button><button class="btn" id="bMid" title="Jump to the next local midday (daylight view)">' + ic('sun', 15) + '<span>Midday</span></button></div><div class="speed" id="speedPlace"></div><div class="speed" id="speedEarth"></div><span class="dlabel" id="dLabel"></span><div class="sp"></div><span class="note" id="dNote"></span></div>' +
      '<div class="track" id="track"><canvas id="trackCv"></canvas><div id="nowMark"></div><div id="playhead"><i></i><b id="phLabel"></b></div><div class="hov" id="trackHov"></div></div>';
    $('#speedPlace').innerHTML = [1, 2, 6, 12].map(function (s) { return '<button data-s="' + s + '">' + s + ' h/s</button>'; }).join(''); $('#speedEarth').innerHTML = [1, 60, 600].map(function (s) { return '<button data-ts="' + s + '">×' + s + '</button>'; }).join('');
    $$('#speedPlace button').forEach(function (b) { b.onclick = function () { S.speed = +b.dataset.s; renderDock(); }; }); $$('#speedEarth button').forEach(function (b) { b.onclick = function () { LV.setTimeScale(+b.dataset.ts); renderDock(); }; });
    $('#bPlay').onclick = function () { if (S.mode === 'place') { S.playing = !S.playing; if (S.playing && S.offsetH >= 168) S.offsetH = -48; } else LV.setTimeScale(S.timeScale === 1 ? 60 : 1); renderDock(); }; $('#bNow').onclick = function () { S.offsetH = 0; S.playing = false; LV.setTimeScale(1); renderDock(); };
    $('#bMid').onclick = function () { var off = S.data.forecast ? S.data.forecast.utcOffset : 0, lt = new Date(Date.now() + off), h = lt.getUTCHours() + lt.getUTCMinutes() / 60, d = (11.5 - h + 24) % 24; if (d < 0.25) d += 24; S.offsetH = Math.round(d * 4) / 4; S.playing = false; renderDock(); };
    var tr = $('#track'), scrub = false; function setX(cx) { if (S.mode !== 'place') return; var r = tr.getBoundingClientRect(); S.offsetH = Math.round((-48 + M.clamp((cx - r.left) / r.width, 0, 1) * 216) * 4) / 4; S.playing = false; renderDock(); }
    tr.addEventListener('pointerdown', function (e) { scrub = true; tr.setPointerCapture(e.pointerId); setX(e.clientX); }); tr.addEventListener('pointermove', function (e) { var r = tr.getBoundingClientRect(), h = -48 + M.clamp((e.clientX - r.left) / r.width, 0, 1) * 216, hv = $('#trackHov'); if (S.mode === 'place') { hv.style.left = (e.clientX - r.left) + 'px'; hv.textContent = hourLabel(h); hv.classList.add('on'); } if (scrub) setX(e.clientX); }); tr.addEventListener('pointerup', function () { scrub = false; }); tr.addEventListener('pointerleave', function () { $('#trackHov').classList.remove('on'); });
    AX.on(g, 'resize', drawTrack); renderDock();
  }
  function hourLabel(h) { var t = new Date(Date.now() + h * 3600000), off = S.data.forecast ? S.data.forecast.utcOffset : 0, lt = new Date(t.getTime() + off), d = lt.toUTCString().slice(5, 11), hh = ('0' + lt.getUTCHours()).slice(-2) + ':00'; return (h >= 0 ? '+' : '−') + Math.abs(Math.round(h)) + ' h · ' + d + ' ' + hh; }
  U.hourLabel = hourLabel;
  function renderDock() {
    var place = S.mode === 'place'; $('#bMid').style.display = place ? '' : 'none'; $('#speedPlace').style.display = place ? '' : 'none'; $('#speedEarth').style.display = place ? 'none' : ''; $('#track').style.display = place ? '' : 'none';
    $('#bPlay').innerHTML = ic((place ? S.playing : S.timeScale > 1) ? 'pause' : 'play', 18) + '<span>' + ((place ? S.playing : S.timeScale > 1) ? 'Pause' : (place ? 'Play forecast' : 'Speed up orbits')) + '</span>';
    $$('#speedPlace button').forEach(function (b) { b.classList.toggle('on', +b.dataset.s === S.speed); }); $$('#speedEarth button').forEach(function (b) { b.classList.toggle('on', +b.dataset.ts === S.timeScale); });
    $('#dNote').textContent = place ? 'Real Open-Meteo hourly forecast drives the scene · scrub or press play' : 'Satellites move on their real orbits · ×60 / ×600 speeds them up';
    if (place) drawTrack(); else $('#dock').style.paddingBottom = '';
    var ds = $('#dock'); AX.root.style.setProperty('--dockH', ds.offsetHeight + 'px');
  }
  U.renderDock = renderDock;
  function drawTrack() {
    var tr = $('#track'), cv = $('#trackCv'); if (!tr || S.mode !== 'place') return; var W = tr.clientWidth, H = 52, dpr = devicePixelRatio > 1 ? 2 : 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    var f = S.data.forecast; if (!f) { x.fillStyle = '#93a0c8'; x.font = '11px system-ui'; x.fillText('loading forecast…', 10, 30); return; }
    var X = function (h) { return (h + 48) / 216 * W; }, now = Date.now(), maxP = 1, maxG = 40; f.hours.forEach(function (h2) { maxP = Math.max(maxP, h2.precip || 0); maxG = Math.max(maxG, h2.gust || 0); });
    f.hours.forEach(function (h2) { var hh = (h2.t - now) / 3600000; if (hh < -48 || hh > 168) return; var v = (h2.precip || 0) / maxP; x.fillStyle = hh < 0 ? 'rgba(110,168,255,.45)' : 'rgba(56,225,255,.85)'; x.fillRect(X(hh), H - 4 - v * 34, Math.max(1.5, W / 216 - 1), v * 34); });
    x.beginPath(); x.strokeStyle = '#ffb547'; x.lineWidth = 1.4; var st = false; f.hours.forEach(function (h2) { var hh = (h2.t - now) / 3600000; if (hh < -48 || hh > 168) return; var px = X(hh), py = H - 4 - (h2.gust || 0) / maxG * 34; st ? x.lineTo(px, py) : x.moveTo(px, py); st = true; }); x.stroke();
    x.fillStyle = 'rgba(147,160,200,.9)'; x.font = '9px system-ui'; x.fillText('rain mm/h (peak ' + maxP.toFixed(1) + ')', 4, 10); x.fillStyle = '#ffb547'; x.fillText('gust km/h (peak ' + maxG.toFixed(0) + ')', 130, 10);
    $('#nowMark').style.left = X(0) + 'px';
  }
  U.drawTrack = drawTrack;

  /* ================= modals ================= */
  function buildModals() {
    $('#consent').innerHTML = '<div class="dcard"><div class="dhead"><span class="big">' + ic('globe', 22) + '</span><div><small>OPT-IN · READ-ONLY PUBLIC DATA</small><h2>Connect the real Earth?</h2><em>Display only. AEGIS sends no alerts and writes nothing.</em></div></div>' +
      '<p>This page will call these free public services <b>directly from your browser</b>:</p><ul class="hosts"><li><b>Open-Meteo</b> · weather, river discharge, history, terrain, geocoding</li><li><b>NASA GIBS</b> · satellite imagery · <b>NASA EONET</b> · storms and events</li><li><b>USGS</b> · earthquakes</li><li><b>CelesTrak</b> · satellite orbits</li><li><b>OpenStreetMap</b> · map tiles (and, only if you press the button, building/tower data via Overpass)</li></ul>' +
      '<p class="muted">What leaves your browser: your IP address (as with any website) and the coordinates of places you choose. No keys, no sign-in, nothing stored on a server. Results are cached in this browser for a few hours.</p>' +
      '<p class="warn">Public reference only. Not an AEGIS assessment and not an official warning. For real alerts follow IMD, INCOIS, CWC and NDMA/SACHET.</p><p class="warn" id="cGate" role="status"></p><div class="dfoot"><button class="link" id="cNo">Stay offline</button><button class="btn big primary" id="cYes">Enable live data</button></div></div>';
    $('#cYes').onclick = function () { var g2 = $('#cGate'); g2.textContent = 'Checking that public feeds are enabled for this deployment…'; LV.requestLive().then(function () { g2.textContent = ''; $('#consent').classList.remove('on'); }, function (e) { g2.innerHTML = (e.message === 'disabled' ? 'Public data feeds are switched off for this AEGIS deployment.' : 'The AEGIS API could not be reached to confirm that public feeds are enabled.') + ' An administrator starts AEGIS with the public-reference switch (<code>start-windows.ps1 -PublicEarth</code>). See <a href="/admin/go-live">Go-Live Setup</a>.'; }); }; $('#cNo').onclick = function () { $('#consent').classList.remove('on'); };
    $('#help').innerHTML = '<div class="mwrap narrow"><button class="btn close" data-close>' + ic('x', 15) + 'Close</button><h2>How to explore</h2><div class="hgrid"><div><h4>Flow</h4><ul><li><b>1</b> Turn on live data (top bar).</li><li><b>2</b> Click the globe or search a place; read the <b>Place</b> tab.</li><li><b>3</b> Dive to <b>region</b> (satellite imagery on real terrain) or <b>city</b> (OpenStreetMap on real terrain).</li><li><b>4</b> Scrub the real forecast, try the flood scenario, run the mock alert drill.</li></ul></div><div><h4>Mouse</h4><ul><li><b>Drag</b> orbit · <b>wheel</b> zoom · <b>right-drag</b> pan (place)</li><li><b>Hover / click</b> quakes, storms, satellites, towers</li><li><b>Double-click</b> the globe to dive to a point</li></ul><h4>Keys</h4><ul><li><b>Space</b> play · <b>L</b> live panel · <b>H</b> help · <b>Esc</b> close</li></ul></div></div><p class="muted">This is a demonstration. Screening statistics use public data and fixed thresholds; they are not forecasts of record.</p></div>';
    $('#sources').innerHTML = '<div class="mwrap"><button class="btn close" data-close>' + ic('x', 15) + 'Close</button><div id="srcBody"></div></div>';
    $$('[data-close]').forEach(function (b) { b.onclick = closeModals; }); $$('.modal').forEach(function (m) { m.addEventListener('click', function (e) { if (e.target === m) closeModals(); }); });
  }
  function openModal(id) { closeModals(); $('#' + id).classList.add('on'); if (id === 'sources' && AX.LivePanels) AX.LivePanels.sources($('#srcBody'), LV, U, true); }
  function closeModals() { $$('.modal.on').forEach(function (m) { m.classList.remove('on'); }); }
  U.openModal = openModal; U.closeModals = closeModals;
  function onKey(e) { if (/input|textarea/i.test(e.target.tagName)) return; var k = e.key; if (k === 'Escape') { closeModals(); LV.select(null); } else if (k === ' ') { e.preventDefault(); $('#bPlay').click(); } else if (k === 'h' || k === 'H') openModal('help'); else if (k === 'l' || k === 'L') $('#liveChip').click(); }

  /* ================= toast / tooltip / busy / attribution ================= */
  U.toast = function (title, text, color, icon) { var box = $('#toasts'); if (!box) return; var t = U.el('div', 'toast', '<span class="ti" style="--c:' + (color || '#38e1ff') + '">' + ic(icon || 'info', 16) + '</span><div><b>' + U.esc(title) + '</b><p>' + U.esc(text) + '</p></div>'); box.appendChild(t); while (box.children.length > 3) box.removeChild(box.firstChild); setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 6500); };
  function onHover(h) {
    var tip = $('#tip'); if (!h || !h.hit) { tip.classList.remove('on'); return; } var r = h.hit.ref, title = '', sub = '';
    if (h.hit.kind === 'quake') { title = 'M' + r.mag.toFixed(1) + ' earthquake'; sub = r.place + ' · depth ' + Math.round(r.depth) + ' km · ' + ago(r.t); } else if (h.hit.kind === 'event') { title = r.title; sub = r.catTitle + (r.last.mag ? ' · ' + r.last.mag + ' ' + (r.last.unit || '') : '') + ' · ' + ago(r.last.t); } else if (h.hit.kind === 'sat') { title = r.name; sub = r.cat + ' · altitude ' + Math.round(r.alt) + ' km'; } else { title = r.title || r.name || 'Item'; sub = r.sub || ''; }
    tip.innerHTML = '<b>' + U.esc(title) + '</b><span>' + U.esc(sub) + '</span><small>click for details</small>'; tip.classList.add('on'); if (h.x != null) { tip.style.left = Math.min(innerWidth - 290, h.x + 16) + 'px'; tip.style.top = Math.min(innerHeight - 100, h.y + 14) + 'px'; }
  }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 90 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
  U.ago = ago;
  function onBusy(msg) { var b = $('#busy'); if (!b) return; if (msg) { b.innerHTML = '<div class="spin"></div><span>' + U.esc(msg) + '</span>'; b.classList.add('on'); } else b.classList.remove('on'); }
  function updateAttr() {
    var a = $('#attr'); if (!a) return; if (!S.live) { a.innerHTML = 'Live data off · synthetic fallback available'; return; }
    var used = Object.keys(L.status).filter(function (k) { return L.status[k].state === 'ok' || L.status[k].state === 'cached'; }); var seen = {}; var txt = used.map(function (k) { return L.SOURCES[k] ? L.SOURCES[k].attr : ''; }).filter(function (t) { if (!t || seen[t]) return false; seen[t] = 1; return true; });
    a.innerHTML = '<b>Sources:</b> ' + txt.map(function (x) { return U.esc(x); }).join(' · ') + ' · <i>Public reference, not an AEGIS assessment.</i>';
  }
  function onMode() { AX.root.dataset.mode = S.mode; renderLayers(); renderDock(); U.refresh(true); var dv = $('#goLive'); if (dv) dv.classList.toggle('on', !S.live && S.mode === 'earth'); }
  function onPlace() { renderLayers(); U.refresh(true); }
  var lastClk = 0;
  function onFrame(F) {
    var now = performance.now(); if (now - lastClk < 500) return; lastClk = now; if (S.playing || S.offsetH !== 0) U.scrubbed = true; renderGuide();
    var P = S.place, ms = S.mode === 'place' ? LV.placeMs() : LV.simMs(), off = (P && S.data.forecast) ? S.data.forecast.utcOffset : 0, d = new Date(ms + (P ? off : 0));
    $('#clockT').textContent = ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); $('#clockP').textContent = P ? (S.data.forecast ? S.data.forecast.tz.split('/').pop().replace('_', ' ') : 'local') : 'UTC'; $('#clockD').textContent = d.toUTCString().slice(5, 16);
    if (S.mode === 'place') { $('#playhead').style.left = ((S.offsetH + 48) / 216 * ($('#track').clientWidth || 600)) + 'px'; $('#phLabel').textContent = hourLabel(S.offsetH); $('#bPlay').classList.toggle('on', S.playing); }
    if (S.mode === 'earth' && LV.globe && P) { var n = 0, sats = LV.globe.sats(), date = new Date(ms); sats.forEach(function (s) { if (!s.shown || !s.ok || s.geo) return; var la = LV.globe.lookAngles(s, P.lat, P.lon, date); s.vis = !!(la && la.el > 5); if (s.vis) n++; }); U.overhead = n; setK('sats', n + ' of ' + sats.length, ''); }
    if (U.tab === 'place' || U.tab === 'orbit') { if (now - (U._pr || 0) > 4000) { U._pr = now; if (U.tab === 'orbit') U.refresh(); } }
  }
}
