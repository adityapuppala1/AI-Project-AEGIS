/* AEGIS Live Earth — a real place in 3D: Copernicus terrain + NASA MODIS (region) or OpenStreetMap (city) imagery,
 * driven by the real hourly forecast. Terrain-based flood scenario, optional OSM buildings/towers, mock alert drill. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};
  AX.buildPlace = function (LV, place, scale) {
    var T = THREE, M = AX.model, L = AX.live, G = AX.gfx, S = LV.state, U = AX.LiveUI, clamp = M.clamp, lerp = M.lerp;
    var region = scale === 'region', spanKm = region ? 120 : 4.7, N = 80, UNIT = region ? 1000 : 20, bb = M.bbox(place.lat, place.lon, spanKm), HALF = spanKm * 1000 / UNIT / 2, Z = 15;
    var out = { scene: new T.Scene(), info: { n: N, spanKm: spanKm, unit: UNIT }, osm: { state: 'idle', counts: null, note: '' }, towers: [], drill: { state: 'idle', step: 0, reached: 0, safe: 0, total: 0 }, pois: [], bcent: [] };
    var scene = out.scene, disposed = false, dem = null, base = 0, exag = 1, mesh = null, mat = null, handInfo = null, fieldArr = null, fieldTex = null, fieldMode = null, fieldVals = null, groups = {}, pickables = [], labelEls = {}, rnd = AX.core.rng(5);
    function toXZ(lat, lon) { var l = M.toLocal(place.lat, place.lon, lat, lon); return [l.x / UNIT, l.z / UNIT]; }
    function grp(name) { return groups[name] || (groups[name] = scene.add(new T.Group()) && scene.children[scene.children.length - 1]); }

    /* ---------------- terrain sampling ---------------- */
    function gridH(gx, gz) { var i = Math.min(N - 2, Math.max(0, Math.floor(gx))), j = Math.min(N - 2, Math.max(0, Math.floor(gz))), fx = gx - i, fz = gz - j; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz); var e = dem.elev, a = e[j * N + i], b = e[j * N + i + 1], c = e[(j + 1) * N + i], d = e[(j + 1) * N + i + 1]; return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz; }
    function yAt(x, z) { if (!dem) return 0; return (gridH(clamp((x + HALF) / (2 * HALF) * (N - 1), 0, N - 1), clamp((z + HALF) / (2 * HALF) * (N - 1), 0, N - 1)) - base) * exag / UNIT; }
    function cellOf(x, z) { return [clamp(Math.round((x + HALF) / (2 * HALF) * (N - 1)), 0, N - 1), clamp(Math.round((z + HALF) / (2 * HALF) * (N - 1)), 0, N - 1)]; }
    function fieldAt(x, z) { if (!fieldVals) return 99; var gx = clamp((x + HALF) / (2 * HALF) * (N - 1), 0, N - 1), gz = clamp((z + HALF) / (2 * HALF) * (N - 1), 0, N - 1), i = Math.min(N - 2, Math.floor(gx)), j = Math.min(N - 2, Math.floor(gz)), fx = gx - i, fz = gz - j, f = fieldVals; return (f[j * N + i] * (1 - fx) + f[j * N + i + 1] * fx) * (1 - fz) + (f[(j + 1) * N + i] * (1 - fx) + f[(j + 1) * N + i + 1] * fx) * fz; }
    out.yAt = yAt;

    /* ---------------- imagery: street map (OSM), real satellite view (Sentinel-2), yesterday from space (MODIS, region) ---------------- */
    var mapTex = null, meshM = 0;
    function tileGrid(z) { var g2 = { z: z, tx0: Math.floor(M.tileX(bb.lonMin, z)), tx1: Math.floor(M.tileX(bb.lonMax, z)), ty0: Math.floor(M.tileY(bb.latMax, z)), ty1: Math.floor(M.tileY(bb.latMin, z)) }; g2.tw = g2.tx1 - g2.tx0 + 1; g2.th = g2.ty1 - g2.ty0 + 1; return g2; }
    function loadTiles(src, urlFn, z, label) {
      var gr = tileGrid(z), cv = document.createElement('canvas'); cv.width = gr.tw * 256; cv.height = gr.th * 256; var x = cv.getContext('2d'); x.fillStyle = '#d9d6cf'; x.fillRect(0, 0, cv.width, cv.height);
      var t = new T.CanvasTexture(cv); t.anisotropy = 8; var loaded = 0, total = gr.tw * gr.th, jobs = [];
      for (var yy = gr.ty0; yy <= gr.ty1; yy++) for (var xx = gr.tx0; xx <= gr.tx1; xx++) (function (X, Y) { jobs.push(L.loadImage(src, urlFn(z, X, Y), label).then(function (im) { x.drawImage(im, (X - gr.tx0) * 256, (Y - gr.ty0) * 256); loaded++; t.needsUpdate = true; LV.emit('busy', 'Loading ' + label + ' ' + loaded + '/' + total + '…'); }).catch(function () { loaded++; })); })(xx, yy);
      return Promise.all(jobs).then(function () { t.needsUpdate = true; return { tex: t, grid: gr }; });
    }
    function loadView(kind) {
      if (kind === 'modis') { var yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10); return L.loadImage('gibs', L.gibsUrl({ layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', bbox: [bb.latMin, bb.lonMin, bb.latMax, bb.lonMax], w: 1024, h: 1024, time: yd }), 'MODIS regional ' + yd).then(function (im) { var t = new T.Texture(im); t.needsUpdate = true; t.anisotropy = 8; return { tex: t, grid: null }; }); }
      if (kind === 's2') return loadTiles('s2', L.s2Url, region ? 10 : 15, 'Sentinel-2 imagery');
      return loadTiles('osm', L.osmUrl, region ? 10 : 15, 'OpenStreetMap tiles');
    }
    function setUV(grid) {
      var m = meshM, uv = out.terrainGeo.attributes.uv.array, i, j, k = 0;
      for (j = 0; j < m; j++) for (i = 0; i < m; i++) {
        if (!grid) { uv[k * 2] = i / (m - 1); uv[k * 2 + 1] = 1 - j / (m - 1); }
        else { var lat = bb.latMax - (bb.latMax - bb.latMin) * j / (m - 1), lon = bb.lonMin + (bb.lonMax - bb.lonMin) * i / (m - 1); uv[k * 2] = (M.tileX(lon, grid.z) - grid.tx0) / grid.tw; uv[k * 2 + 1] = 1 - (M.tileY(lat, grid.z) - grid.ty0) / grid.th; }
        k++;
      }
      out.terrainGeo.attributes.uv.needsUpdate = true;
    }
    function applyView(v) { if (mapTex && mapTex.dispose) mapTex.dispose(); mapTex = v.tex; setUV(v.grid); mat.map = v.tex; mat.vertexColors = false; mat.needsUpdate = true; }
    if (!S.view || (S.view === 'modis' && !region)) S.view = region ? 'modis' : 'map';
    out.setImagery = function (kind) {
      if (!out.info.ready) return; S.view = kind; LV.emit('busy', 'Loading the ' + (kind === 's2' ? 'satellite view' : kind === 'modis' ? 'latest view from space' : 'street map') + '…');
      loadView(kind).then(function (v) { if (!disposed && mesh && S.view === kind) applyView(v); LV.emit('busy', null); LV.emit('layers'); }, function () { LV.emit('busy', null); });
    };

    /* ---------------- terrain mesh ---------------- */
    var uni = { uHand: { value: (function () { var t = new T.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, T.RGBAFormat); t.needsUpdate = true; return t; })() }, uLevel: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 }, uHalf: { value: HALF }, uContour: { value: 0 }, uY2M: { value: 1 }, uBaseM: { value: 0 }, uIv: { value: 20 } };
    function buildTerrain() {
      var m = (N - 1) * 3 + 1, pos = new Float32Array(m * m * 3), uv = new Float32Array(m * m * 2), col = new Float32Array(m * m * 3), idx = new Uint32Array((m - 1) * (m - 1) * 6), i, j, k = 0, q = 0;
      var mn = dem.min, mx = dem.max; base = mn <= 1 ? 0 : mn; var relief = Math.max(1, mx - base); exag = clamp(0.1 * spanKm * 1000 / relief, 1, region ? 25 : 3); out.info.exag = exag; uni.uY2M.value = UNIT / exag; uni.uBaseM.value = base; uni.uIv.value = relief < 60 ? 5 : relief < 300 ? 20 : relief < 1500 ? 100 : 250; out.info.contour = uni.uIv.value; out.info.relief = relief; out.info.elevMin = mn; out.info.elevMax = mx;
      for (j = 0; j < m; j++) for (i = 0; i < m; i++) {
        var gx = i / (m - 1) * (N - 1), gz = j / (m - 1) * (N - 1), e = gridH(gx, gz), p = k * 3;
        pos[p] = -HALF + i / (m - 1) * 2 * HALF; pos[p + 2] = -HALF + j / (m - 1) * 2 * HALF; pos[p + 1] = (e - base) * exag / UNIT;
        uv[k * 2] = i / (m - 1); uv[k * 2 + 1] = 1 - j / (m - 1);
        var f = clamp((e - base) / relief, 0, 1), c = e <= 0.5 ? [0.1, 0.28, 0.5] : f < 0.25 ? [0.35 + f, 0.55, 0.3] : f < 0.6 ? [0.55 + f * 0.2, 0.5, 0.33] : [0.7 + f * 0.25, 0.7 + f * 0.25, 0.72 + f * 0.25];
        col[p] = c[0]; col[p + 1] = c[1]; col[p + 2] = c[2]; k++;
      }
      for (j = 0; j < m - 1; j++) for (i = 0; i < m - 1; i++) { var a = j * m + i, b = a + 1, c2 = a + m, d = c2 + 1; idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d; }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeVertexNormals();
      mat = new T.MeshLambertMaterial({ vertexColors: true });
      mat.onBeforeCompile = function (sh) {
        for (var key in uni) sh.uniforms[key] = uni[key];
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ; varying float vYw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = position.xz; vYw = position.y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uHand; uniform float uLevel,uOn,uTime,uHalf,uContour,uY2M,uBaseM,uIv; varying vec2 vXZ; varying float vYw;').replace('#include <color_fragment>', '#include <color_fragment>\n' +
          'vec2 q=(vXZ+uHalf)/(2.0*uHalf); float F=texture2D(uHand,q).r*30.0; float inun=uOn*(1.0-smoothstep(uLevel-0.12,uLevel+0.12,F)); float depth=max(uLevel-F,0.0);\n' +
          'vec3 wc=mix(vec3(0.22,0.55,0.85),vec3(0.05,0.18,0.45),clamp(depth/4.0,0.,1.)); wc+=0.06*(0.5+0.5*sin((vXZ.x+vXZ.y)*(120.0/uHalf)+uTime*2.0)); float edge=uOn*(1.0-smoothstep(0.0,0.2,abs(F-uLevel)));\n' +
          'diffuseColor.rgb=mix(diffuseColor.rgb,wc,inun*0.8); diffuseColor.rgb+=edge*vec3(0.25,0.4,0.5);\n' +
          'float ce=(vYw*uY2M+uBaseM)/uIv; float cl=1.0-min(abs(fract(ce-0.5)-0.5)/max(fwidth(ce),1e-5),1.0); float cm=1.0-min(abs(fract(ce/5.0-0.5)-0.5)/max(fwidth(ce/5.0),1e-5),1.0); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.16,0.09,0.02),max(cl*0.45,cm*0.8)*uContour*(1.0-inun));');
      };
      mesh = new T.Mesh(geo, mat); scene.add(mesh); out.terrain = mesh; out.terrainGeo = geo; meshM = m;
      handInfo = M.hand(dem.elev, N, { threshold: Math.max(10, 0.01 * N * N) }); out.hand = handInfo;
      fieldArr = new Uint8Array(N * N * 4); fieldTex = new T.DataTexture(fieldArr, N, N, T.RGBAFormat); fieldTex.magFilter = T.LinearFilter; fieldTex.minFilter = T.LinearFilter; fieldTex.needsUpdate = true; uni.uHand.value = fieldTex; fieldVals = new Float32Array(N * N).fill(99);
      out.info.ready = true;
    }
    function setField(mode) {
      if (mode === fieldMode && fieldVals) return; fieldMode = mode; var v = fieldVals;
      if (mode === 'river') { for (var i = 0; i < N * N; i++) v[i] = handInfo.hand[i]; }
      else {   // coastal: minimax level needed to reach each cell from the sea
        var h = new M.Heap(), dist = new Float32Array(N * N).fill(99), seen = new Uint8Array(N * N), e = dem.elev, any = false;
        for (var k = 0; k < N * N; k++) if (e[k] <= 0.5) { dist[k] = 0; h.push(0, k); any = true; }
        while (h.size()) { var c = h.pop(), ci = c[1]; if (seen[ci]) continue; seen[ci] = 1; var cx = ci % N, cy = (ci / N) | 0; for (var d = 0; d < 8; d++) { var x = cx + [1, 1, 0, -1, -1, -1, 0, 1][d], y = cy + [0, 1, 1, 1, 0, -1, -1, -1][d]; if (x < 0 || y < 0 || x >= N || y >= N) continue; var q = y * N + x, nv = Math.max(e[q] - 0, c[0]); if (nv < dist[q]) { dist[q] = nv; h.push(nv, q); } } }
        for (var m2 = 0; m2 < N * N; m2++) v[m2] = any ? dist[m2] : 99;
      }
      for (var p = 0; p < N * N; p++) { fieldArr[p * 4] = Math.round(clamp(v[p] / 30, 0, 1) * 255); fieldArr[p * 4 + 3] = 255; } fieldTex.needsUpdate = true;
    }

    /* ---------------- scenario impact ---------------- */
    out.setScenario = function (level, mode) {
      if (!out.info.ready) return null; setField(mode); uni.uLevel.value = level; var land = 0, wet = 0, i;
      for (i = 0; i < N * N; i++) { if (dem.elev[i] > 0.5) { land++; if (fieldVals[i] <= level) wet++; } }
      function cnt(arr) { var ex = 0, names = []; arr.forEach(function (o) { var w = fieldAt(o.x, o.z) <= level; o.exposed = w; if (w) { ex++; if (o.name) names.push(o.name); } }); return { n: arr.length, exposed: ex, names: names }; }
      var hosp = out.pois.filter(function (p) { return p.kind === 'hospital'; }), sch = out.pois.filter(function (p) { return p.kind === 'school'; });
      return { level: level, mode: mode, areaPct: land ? wet / land * 100 : 0, buildings: cnt(out.bcent), hospitals: cnt(hosp), schools: cnt(sch), towers: Object.assign(cnt(out.towers), { real: out.towers.some(function (t) { return t.real; }) }) };
    };

    /* ---------------- weather FX (all driven by the real forecast) ---------------- */
    var noiseGLSL = 'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}float fbm4(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}\n';
    var skyU = { uTop: { value: new T.Color(0x2a6fdb) }, uHor: { value: new T.Color(0xbcd9ff) }, uSun: { value: new T.Vector3(0, 1, 0) }, uDay: { value: 1 }, uCover: { value: 0.3 }, uStorm: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 } };
    var sky = new T.Mesh(new T.SphereGeometry(HALF * 40, 32, 16), new T.ShaderMaterial({ uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false, vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uTop,uHor,uSun; uniform float uDay,uCover,uStorm,uTime,uFlash; varying vec3 vD;\n' + noiseGLSL + 'void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.,1.); vec3 col=mix(uHor,uTop,pow(h,0.5)); float sd=max(dot(d,normalize(uSun)),0.); col+=vec3(1.,.9,.7)*(pow(sd,700.)*4.+pow(sd,22.)*0.3)*uDay*(1.-uStorm*0.85);\n' +
        ' vec2 su=d.xz/(abs(d.y)+0.35)*70.; col+=vec3(step(0.988,h21(floor(su)))*(0.6+0.4*sin(uTime*3.+h21(floor(su))*40.)))*(1.-uDay)*(1.-uCover)*smoothstep(0.02,0.2,d.y);\n vec2 cu=d.xz/(d.y+0.16)*0.8+vec2(uTime*0.008,uTime*0.003); float n=fbm4(cu*1.4)*0.75+0.25*fbm4(cu*4.0); float cl=smoothstep(1.02-uCover*0.9,1.18-uCover*0.9,n+0.22)*smoothstep(0.0,0.12,d.y);\n' +
        ' vec3 cc=mix(vec3(1.)*(0.28+0.72*uDay),vec3(0.2,0.22,0.26)*(0.35+0.65*uDay),uStorm); col=mix(col,cc,cl*(0.55+0.4*uStorm)); col+=vec3(0.7,0.78,1.)*uFlash*(0.4+0.6*cl); if(d.y<0.) col=mix(uHor,uHor*0.7,clamp(-d.y*6.,0.,1.)); gl_FragColor=vec4(col,1.); }' }));
    sky.renderOrder = -20; scene.add(sky);
    var hemi = new T.HemisphereLight(0xbfd8ff, 0x4a4034, 0.9), sun = new T.DirectionalLight(0xfff2d8, 1), moon = new T.DirectionalLight(0x7f9bff, 0.3); scene.add(hemi, sun, sun.target, moon, moon.target); scene.fog = new T.Fog(0x9fc3ee, HALF * 1.2, HALF * 6);
    var q = LV.q || { rain: 4000 }, RN = q.rain, rb = new Float32Array(RN * 2 * 3), rr = new Float32Array(RN * 2), re = new Float32Array(RN * 2), i2;
    for (i2 = 0; i2 < RN; i2++) { var bx = Math.random(), by = Math.random(), bz = Math.random(), ra = Math.random(); for (var e2 = 0; e2 < 2; e2++) { var o = i2 * 2 + e2; rb[o * 3] = bx; rb[o * 3 + 1] = by; rb[o * 3 + 2] = bz; rr[o] = ra; re[o] = e2; } }
    var rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(rb, 3)); rg.setAttribute('aRnd', new T.BufferAttribute(rr, 1)); rg.setAttribute('aEnd', new T.BufferAttribute(re, 1));
    var ru = { uTime: { value: 0 }, uInt: { value: 0 }, uCenter: { value: new T.Vector3() }, uBox: { value: new T.Vector3(80, 40, 80) }, uWind: { value: new T.Vector2() }, uLen: { value: 1.5 }, uColor: { value: new T.Color(0.7, 0.8, 1) }, uFar: { value: 60 }, uSpeed: { value: 18 }, uSnow: { value: 0 } };
    var precip = new T.LineSegments(rg, new T.ShaderMaterial({ uniforms: ru, transparent: true, depthWrite: false, vertexShader: 'attribute float aRnd; attribute float aEnd; uniform float uTime,uInt,uLen,uFar,uSpeed,uSnow; uniform vec3 uCenter,uBox; uniform vec2 uWind; varying float vA;\n' +
      'void main(){ if(aRnd>uInt){ gl_Position=vec4(2.,2.,2.,1.); vA=0.; return; } vec3 b=position; float sp=uSpeed*(1.0-0.78*uSnow)*(0.6+0.8*aRnd); float fall=mod(b.y*uBox.y-uTime*sp,uBox.y);\n' +
      ' float x=uCenter.x+mod(b.x*uBox.x-uCenter.x+uBox.x*0.5,uBox.x)-uBox.x*0.5; float z=uCenter.z+mod(b.z*uBox.z-uCenter.z+uBox.z*0.5,uBox.z)-uBox.z*0.5; vec3 p=vec3(x+sin(uTime*1.3+aRnd*30.)*uSnow*0.6*uLen,uCenter.y+fall,z);\n' +
      ' p.xz+=uWind*(fall-uBox.y*0.5)*0.05; vec3 dir=normalize(vec3(uWind.x*0.6,-1.,uWind.y*0.6)); p-=dir*aEnd*uLen*mix(1.0,0.18,uSnow)*(0.7+0.6*aRnd); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; vA=(1.-aEnd*(1.0-uSnow))*mix(0.55,0.9,uSnow)*(1.-smoothstep(uFar*0.4,uFar,-mv.z)); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor=vec4(uColor,vA); }' }));
    precip.frustumCulled = false; precip.renderOrder = 15; scene.add(precip);
    var deckTex = new T.CanvasTexture(G.canvas(256, 256, function (x2, w, h) { var im = x2.createImageData(w, h), d = im.data, a, b; for (b = 0; b < h; b++) for (a = 0; a < w; a++) { var n2 = AX.core.fbm(a / 40, b / 40, 4), al = clamp((n2 - 0.4) * 2.6, 0, 1), o2 = (b * w + a) * 4; d[o2] = d[o2 + 1] = d[o2 + 2] = 255; d[o2 + 3] = al * 255; } x2.putImageData(im, 0, 0); })); deckTex.wrapS = deckTex.wrapT = T.RepeatWrapping; deckTex.repeat.set(3, 3);
    var deck = new T.Mesh(new T.PlaneGeometry(HALF * 8, HALF * 8).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: deckTex, color: 0x4a5566, transparent: true, opacity: 0, depthWrite: false, fog: false })); deck.position.y = region ? 22 : 36; deck.renderOrder = 8; scene.add(deck);
    var wind = G.lineBatch(500), wpos = new Float32Array(500 * 3), wlife = new Float32Array(500); scene.add(wind.obj); for (i2 = 0; i2 < 500; i2++) wlife[i2] = Math.random();
    var bolt = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xdfe8ff, fog: false })); bolt.visible = false; bolt.frustumCulled = false; scene.add(bolt); var nextBolt = 2, boltT = 0, flash = 0;
    var glow = G.glowBatch(3000, true); scene.add(glow.obj);

    /* ---------------- markers: real events / quakes in view, river cell ---------------- */
    var EMO = { storm: '🌀', flood: '🌊', snow: '❄️', fire: '🔥', volcano: '🌋', heat: '🌡️', dust: '🌫️', drought: '☀️', landslide: '⛰️', ice: '🧊', other: '•' }, iconCache = {};
    function icon(e) { return iconCache[e] || (iconCache[e] = new T.CanvasTexture(G.canvas(96, 96, function (x2) { x2.fillStyle = 'rgba(8,14,34,.85)'; x2.beginPath(); x2.arc(48, 48, 40, 0, 7); x2.fill(); x2.strokeStyle = 'rgba(255,255,255,.6)'; x2.lineWidth = 3; x2.stroke(); x2.font = '44px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(e, 48, 52); }))); }
    function pin(id, kind, ref, lat, lon, emo, name, sub, hgt) {
      var p = toXZ(lat, lon); if (Math.abs(p[0]) > HALF || Math.abs(p[1]) > HALF) return null; var y = yAt(p[0], p[1]), sp = new T.Sprite(new T.SpriteMaterial({ map: icon(emo), transparent: true, depthWrite: false })), sz = region ? 5 : 8;
      sp.scale.set(sz, sz, 1); sp.position.set(p[0], y + (hgt || sz * 0.9), p[1]); var stick = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(p[0], y, p[1]), new T.Vector3(p[0], y + (hgt || sz * 0.9), p[1])]), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      grp('markers').add(sp, stick); var rec = { id: id, kind: kind, ref: ref, pos: sp.position.clone(), name: name, sub: sub, x: p[0], z: p[1], y: y }; pickables.push(rec); return rec;
    }
    function buildMarkers() {
      (S.data.events || []).forEach(function (e) { pin(e.pid || ('event:' + e.id), 'event', e, e.last.lat, e.last.lon, EMO[e.cat] || '•', e.title, e.catTitle); });
      (S.data.quakes || []).filter(function (qk) { return qk.mag >= 4.5; }).forEach(function (qk) { pin(qk.id, 'quake', qk, qk.lat, qk.lon, '💥', 'M' + qk.mag.toFixed(1) + ' ' + qk.place, 'earthquake'); });
      var fl = S.data.flood; if (fl && fl.grid) pin('rivercell', 'river', fl, fl.grid[0], fl.grid[1], '🌊', 'River model cell (GloFAS)', 'discharge model grid ≈5 km');
    }

    /* ---------------- OpenStreetMap details (city, optional, user-triggered) ---------------- */
    var osmGroup = null;
    out.loadOsm = function () {
      if (region || out.osm.state === 'loading') return; out.osm.state = 'loading'; out.osm.note = ''; LV.emit('data', 'osm');
      var b = bb.latMin.toFixed(5) + ',' + bb.lonMin.toFixed(5) + ',' + bb.latMax.toFixed(5) + ',' + bb.lonMax.toFixed(5);
      var qy = '[out:json][timeout:40];(node["amenity"~"^(hospital|clinic|school|fire_station|police|shelter)$"](' + b + ');way["amenity"~"^(hospital|clinic|school|fire_station|police)$"](' + b + ');node["emergency"="assembly_point"](' + b + '););out center 400;' +
        '(node["man_made"~"^(mast|communications_tower)$"](' + b + ');node["communication:mobile_phone"="yes"](' + b + ');node["tower:type"="communication"](' + b + ');way["man_made"~"^(mast|communications_tower)$"](' + b + '););out center 300;' +
        '(way["natural"="water"](' + b + ');way["waterway"~"^(river|stream|canal)$"](' + b + '););out geom 250;way["building"](' + b + ');out geom 3500;';
      L.overpass(qy, 'buildings, hospitals, schools and masts').then(function (j) { if (disposed) return; processOsm(j.elements || []); }, function (e) { out.osm.state = 'error'; out.osm.err = String(e.message || e); LV.emit('data', 'osm'); });
    };
    function processOsm(els) {
      var bl = [], pois = [], towers = [], water = [], seen = {};
      ['towers', 'pois', 'buildings', 'water'].forEach(function (nm) { if (groups[nm]) { scene.remove(groups[nm]); delete groups[nm]; } }); pickables = pickables.filter(function (p) { return p.kind !== 'tower' && p.kind !== 'poi'; }); Object.keys(labelEls).forEach(function (id) { if (/^(tower|poi):/.test(id)) { labelEls[id].remove(); delete labelEls[id]; } });
      els.forEach(function (e) {
        var t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
        if (t.building && e.geometry) { bl.push(e); return; }
        if (t.amenity || t.emergency) { var k = /hospital|clinic/.test(t.amenity || '') ? 'hospital' : t.amenity === 'school' ? 'school' : /fire_station|police/.test(t.amenity || '') ? 'emergency' : 'assembly'; if (lat != null) { var p = toXZ(lat, lon); pois.push({ kind: k, name: t.name || ({ hospital: 'Hospital', school: 'School', emergency: t.amenity === 'police' ? 'Police station' : 'Fire station', assembly: 'Assembly point' })[k], x: p[0], z: p[1], lat: lat, lon: lon, tags: t }); } return; }
        if ((t.man_made === 'mast' || t.man_made === 'communications_tower' || t['tower:type'] === 'communication' || t['communication:mobile_phone'] === 'yes') && lat != null) { var key = Math.round(lat * 4000) + ':' + Math.round(lon * 4000); if (seen[key]) return; seen[key] = 1; var tp = toXZ(lat, lon); towers.push({ name: t.name || t.operator || 'Mast', operator: t.operator || t['operator:short'] || '', x: tp[0], z: tp[1], lat: lat, lon: lon, real: true, height: parseFloat(t.height) || 30, tags: t }); return; }
        if ((t.natural === 'water' || t.waterway) && e.geometry) water.push(e);
      });
      out.pois = pois.filter(function (p) { return Math.abs(p.x) <= HALF && Math.abs(p.z) <= HALF; }); out.towers = towers.filter(function (t) { return Math.abs(t.x) <= HALF && Math.abs(t.z) <= HALF; });
      out.osm.counts = { buildings: bl.length, hospitals: out.pois.filter(function (p) { return p.kind === 'hospital'; }).length, schools: out.pois.filter(function (p) { return p.kind === 'school'; }).length, towers: out.towers.length };
      if (!out.towers.length) { makePlaceholderTowers(); setTimeout(nearMasts, 4000); }
      buildPois(); buildTowers(); buildWater(water); buildBuildings(bl, function () { out.osm.state = 'ok'; if (handInfo && water.length) markWater(water); LV.emit('data', 'osm'); LV.toast('OpenStreetMap loaded', bl.length + ' buildings · ' + out.osm.counts.towers + ' mapped masts · ' + out.pois.length + ' facilities', '#4be3a0', 'check'); });
    }
    function nearMasts() {
      if (disposed) return; var a = place.lat + "," + place.lon, q = '[out:json][timeout:30];(node["man_made"~"^(mast|communications_tower)$"](around:12000,' + a + ');node["communication:mobile_phone"="yes"](around:12000,' + a + ');node["tower:type"="communication"](around:12000,' + a + '););out 40;';
      L.overpass(q, "looking for mapped masts within 12 km").then(function (j) { var els = j.elements || []; out.osm.near = { n: els.length, nearestKm: els.length ? Math.min.apply(null, els.map(function (e) { return M.haversine(place.lat, place.lon, e.lat, e.lon); })) : null }; LV.emit("data", "osm"); }).catch(function () { out.osm.near = { n: null }; LV.emit("data", "osm"); });
    }
    function makePlaceholderTowers() {
      out.towers = []; var ring = HALF * 0.55; [[0, 0], [1, 0], [-1, 0], [0.5, 0.87], [-0.5, 0.87], [0.5, -0.87], [-0.5, -0.87]].forEach(function (d, i) { out.towers.push({ name: 'Illustrative site ' + (i + 1), operator: '', x: d[0] * ring, z: d[1] * ring, real: false, height: 30 }); });
    }
    function markWater(water) { /* water polygons are drawn; drainage seeds stay terrain-derived (documented limit) */ }
    function buildBuildings(list, done) {
      var posA = [], norA = [], colA = [], idx = 0; out.bcent = []; var HM = 1.6;
      function chunk() {
        var end = Math.min(list.length, idx + 160);
        for (; idx < end; idx++) {
          var e = list[idx], t = e.tags || {}, ring = e.geometry; if (!ring || ring.length < 4) continue;
          var pts = ring.map(function (p) { return toXZ(p.lat, p.lon); }); if (pts.some(function (p) { return Math.abs(p[0]) > HALF + 2 || Math.abs(p[1]) > HALF + 2; })) continue;
          var cx = 0, cz = 0; pts.forEach(function (p) { cx += p[0]; cz += p[1]; }); cx /= pts.length; cz /= pts.length;
          var hm = parseFloat(t.height) || (parseFloat(t['building:levels']) ? parseFloat(t['building:levels']) * 3.2 : 6 + (e.id % 7) * 1.2), hh = Math.max(0.35, hm / UNIT * HM * 1.4), y0 = yAt(cx, cz);
          var sh = new T.Shape(); pts.forEach(function (p, k) { k ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]); });
          var gm; try { gm = new T.ExtrudeGeometry(sh, { depth: hh, bevelEnabled: false }); } catch (err) { continue; } gm.rotateX(-Math.PI / 2); var pa = gm.attributes.position.array, na = gm.attributes.normal.array, cc = /hospital|clinic/.test(t.amenity || '') ? [0.95, 0.4, 0.4] : t.amenity === 'school' ? [0.4, 0.7, 0.95] : [0.78 - (e.id % 5) * 0.03, 0.76 - (e.id % 3) * 0.03, 0.72];
          for (var q2 = 0; q2 < pa.length; q2 += 3) { posA.push(pa[q2], pa[q2 + 1] + y0, pa[q2 + 2]); norA.push(na[q2], na[q2 + 1], na[q2 + 2]); colA.push(cc[0], cc[1], cc[2]); } gm.dispose();
          out.bcent.push({ x: cx, z: cz });
        }
        LV.emit('busy', 'Extruding buildings ' + idx + '/' + list.length + '…');
        if (idx < list.length && !disposed) setTimeout(chunk, 8); else finish();
      }
      function finish() {
        if (disposed) return; var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(posA, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(norA, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(colA, 3));
        var m = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true })); m.frustumCulled = false; grp('buildings').add(m); LV.emit('busy', null); if (done) done();
      }
      chunk();
    }
    function buildPois() {
      out.pois.forEach(function (p, i) {
        var y = yAt(p.x, p.z), col = p.kind === 'hospital' ? 0xff5d6c : p.kind === 'school' ? 0x38a0ff : p.kind === 'assembly' ? 0x4be3a0 : 0xffb547, h = 6;
        var post = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, h, 6).translate(0, h / 2, 0), new T.MeshBasicMaterial({ color: col })), ball = new T.Mesh(new T.SphereGeometry(0.9, 12, 8), new T.MeshBasicMaterial({ color: col })); post.position.set(p.x, y, p.z); ball.position.set(p.x, y + h + 0.5, p.z); grp('pois').add(post, ball);
        var rec = { id: 'poi:' + i, kind: 'poi', ref: p, pos: ball.position.clone(), name: p.name, sub: p.kind, x: p.x, z: p.z, y: y }; pickables.push(rec);
      });
    }
    function buildTowers() {
      out.towers.forEach(function (t, i) {
        var y = yAt(t.x, t.z), h = Math.max(3.2, (t.height || 30) / UNIT * 3), gr = new T.Group(), lat = new T.Mesh(new T.CylinderGeometry(0.12, 0.5, h, 3, 6, true).translate(0, h / 2, 0), new T.MeshBasicMaterial({ color: t.real ? 0xcfd8e6 : 0x8d97a8, wireframe: true }));
        gr.add(lat); [0, 1, 2].forEach(function (k) { var pn = new T.Mesh(new T.BoxGeometry(0.28, 0.9, 0.12), new T.MeshBasicMaterial({ color: t.real ? 0xff7ab0 : 0x7788aa })); var an = k * 2.094; pn.position.set(Math.cos(an) * 0.35, h * 0.95, Math.sin(an) * 0.35); pn.rotation.y = -an; gr.add(pn); });
        gr.position.set(t.x, y, t.z); grp('towers').add(gr); t.y = y; t.h = h; t.group = gr; t.top = new T.Vector3(t.x, y + h, t.z); t.rings = [0, 1, 2].map(function () { var rg2 = new T.Mesh(new T.RingGeometry(0.96, 1, 56).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); rg2.position.set(t.x, y + 0.4, t.z); rg2.visible = false; grp('towers').add(rg2); return rg2; });
        pickables.push({ id: 'tower:' + i, kind: 'tower', ref: t, pos: t.top.clone(), name: t.name, sub: t.real ? 'OSM mast' + (t.operator ? ' · ' + t.operator : '') : 'illustrative site', x: t.x, z: t.z, y: y });
      });
      LV.emit('data', 'towers');
    }
    function buildWater(list) {
      list.forEach(function (e) {
        var pts = e.geometry.map(function (p) { return toXZ(p.lat, p.lon); }); if (pts.length < 3) return;
        if (e.tags.natural === 'water' && pts.length > 3) { var sh = new T.Shape(); pts.forEach(function (p, k) { k ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]); }); var gm; try { gm = new T.ShapeGeometry(sh); } catch (err) { return; } gm.rotateX(-Math.PI / 2); var cy = yAt(pts[0][0], pts[0][1]); var wm = new T.Mesh(gm, new T.MeshBasicMaterial({ color: 0x2d7fd0, transparent: true, opacity: 0.75, depthWrite: false })); wm.position.y = cy + 0.15; wm.renderOrder = 3; grp('water').add(wm); }
        else { var vs = pts.map(function (p) { return new T.Vector3(p[0], yAt(p[0], p[1]) + 0.2, p[1]); }); grp('water').add(new T.Line(new T.BufferGeometry().setFromPoints(vs), new T.LineBasicMaterial({ color: 0x3a8be0 }))); }
      });
    }

    /* ---------------- mock alert drill ---------------- */
    var people = [], hubs = null, lines = G.lineBatch(600); scene.add(lines.obj);
    function makeHubs() {
      if (hubs) return; hubs = {}; var items = [['auth', 'NDMA / SACHET (mock)', 0, 0, 0xffb547, 2.6], ['airtel', 'Operator CBC A', -1, 1, 0xff5d6c, 1.6], ['jio', 'Operator CBC B', -0.35, 1, 0x38a0ff, 1.6], ['bsnl', 'Operator CBC C', 0.35, 1, 0xffd34d, 1.6], ['vi', 'Operator CBC D', 1, 1, 0xb98cff, 1.6]];
      items.forEach(function (it) { var hy = HALF * 0.42, gm = new T.Mesh(new T.OctahedronGeometry(it[5] * (region ? 1 : 3), 0), new T.MeshBasicMaterial({ color: it[4], wireframe: true, fog: false })); var x = it[2] * HALF * 0.45, z = -HALF * 0.55 + it[3] * -HALF * 0.25; gm.position.set(x, hy + it[3] * 6, z); grp('hubs').add(gm); hubs[it[0]] = { mesh: gm, pos: gm.position.clone(), col: new T.Color(it[4]), name: it[1] }; });
    }
    out.resetDrill = function () { out.drill = { state: 'idle', step: 0, reached: 0, safe: 0, total: 0 }; people = []; lines.begin(); lines.end(); if (groups.hubs) groups.hubs.visible = false; out.towers.forEach(function (t) { if (t.rings) t.rings.forEach(function (r) { r.visible = false; }); }); };
    out.runDrill = function () {
      if (region || !out.info.ready) { LV.toast('City scene needed', 'The mock drill runs on the city map. Use “Dive: city”.', '#ffb547', 'alert'); return; }
      if (!out.towers.length) makePlaceholderTowers(), buildTowers(); makeHubs(); groups.hubs.visible = true;
      var assembly = out.pois.filter(function (p) { return p.kind === 'hospital' || p.kind === 'school' || p.kind === 'assembly'; }); if (!assembly.length) { assembly = [0, 1, 2, 3].map(function (k) { var best = null; for (var t2 = 0; t2 < 60; t2++) { var x = (rnd() - 0.5) * 1.6 * HALF, z = (rnd() - 0.5) * 1.6 * HALF, y = yAt(x, z); if (!best || y > best.y) best = { x: x, z: z, y: y, name: 'Assembly point ' + (k + 1) }; } return best; }); }
      var NP = 420; people = []; for (var i = 0; i < NP; i++) {
        var src = out.bcent.length ? out.bcent[Math.floor(rnd() * out.bcent.length)] : { x: (rnd() - 0.5) * 1.8 * HALF, z: (rnd() - 0.5) * 1.8 * HALF }, x = src.x + (rnd() - 0.5) * 6, z = src.z + (rnd() - 0.5) * 6, bt = null, bd = 1e9;
        out.towers.forEach(function (t) { var d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; bt = t; } }); var as = null, ad = 1e9; assembly.forEach(function (a) { var d = Math.hypot(a.x - x, a.z - z); if (d < ad) { ad = d; as = a; } });
        people.push({ x: x, z: z, hx: x, hz: z, tw: bt, td: bd, as: as, alert: -1, ra: 0.2 + rnd() * 0.8, st: 0, speed: 8 + rnd() * 6 });
      }
      out.drill = { state: 'running', step: 0, reached: 0, safe: 0, total: NP, t0: LV._time || 0, assembly: assembly }; out.drillStart = performance.now(); LV.toast('Mock drill started', 'Nothing is sent. This animates the real alert chain on a map.', '#ffb547', 'radio');
    };
    function drillUpdate(F) {
      var d = out.drill; if (d.state === 'idle') return; var t = (performance.now() - out.drillStart) / 1000;
      d.step = t < 2.5 ? 0 : t < 5 ? 1 : t < 9.5 ? 2 : t < 12 ? 3 : 4; var tk = Math.min(60, 1.2 + 9 * Math.min(1, Math.max(0, (t - 5) / 5)) * 1.0);
      var pulse = 1 + 0.25 * Math.sin(F.time * 8); Object.keys(hubs || {}).forEach(function (k) { var h = hubs[k]; h.mesh.rotation.y = F.time * 0.8; h.mesh.scale.setScalar(k === 'auth' && t < 5 ? pulse : 1); glow.push(h.pos.x, h.pos.y, h.pos.z, h.col.r, h.col.g, h.col.b, region ? 4 : 10); });
      lines.begin();
      if (t >= 2.5 && t < 9.5) { var k2 = Math.min(1, (t - 2.5) / 1.5); ['airtel', 'jio', 'bsnl', 'vi'].forEach(function (op) { var a = hubs.auth.pos, b = hubs[op].pos; lines.seg(a.x, a.y, a.z, lerp(a.x, b.x, k2), lerp(a.y, b.y, k2), lerp(a.z, b.z, k2), [1, 0.72, 0.28], 0.9); }); }
      if (t >= 4 && t < 12) { var k3 = Math.min(1, (t - 4) / 1.5), ops = ['airtel', 'jio', 'bsnl', 'vi']; out.towers.forEach(function (tw, i) { var hb = hubs[ops[i % 4]], b = tw.top; lines.seg(hb.pos.x, hb.pos.y, hb.pos.z, lerp(hb.pos.x, b.x, k3), lerp(hb.pos.y, b.y, k3), lerp(hb.pos.z, b.z, k3), [hb.col.r, hb.col.g, hb.col.b], 0.7); }); }
      out.towers.forEach(function (tw, i) { tw.rings.forEach(function (r, k) { var on = t >= 5.5 && t < 11; r.visible = on; if (!on) return; var u = ((t - 5.5) * 0.45 + k / 3) % 1; r.scale.setScalar(0.5 + u * 70); r.material.opacity = (1 - u) * 0.7; }); glow.push(tw.top.x, tw.top.y, tw.top.z, 1, 0.8, 0.4, (t >= 5.5 && t < 11 ? 6 : 2.2) * (region ? 1 : 1.4)); });
      var reached = 0, safe = 0;
      people.forEach(function (p) {
        if (p.alert < 0 && t >= 5.5) { var arrive = 5.5 + (p.td / 70) * 4.5 / 1 + p.ra * 0.8; if (p.td < 75 && t >= arrive) p.alert = t; }
        if (p.alert >= 0) reached++;
        if (p.alert >= 0 && t >= p.alert + 1.2 && p.as) { var dx = p.as.x - p.x, dz = p.as.z - p.z, dd = Math.hypot(dx, dz); if (dd > 1.5) { var st = Math.min(dd, p.speed * F.dt); p.x += dx / dd * st; p.z += dz / dd * st; } else p.st = 1; }
        if (p.st) safe++;
        var py = yAt(p.x, p.z) + 1.6, c = p.st ? [0.3, 1, 0.6] : p.alert >= 0 ? [1, 0.7, 0.2] : [0.55, 0.62, 0.8]; glow.push(p.x, py, p.z, c[0], c[1], c[2], p.alert >= 0 && t < p.alert + 1.5 ? 7 : 3.2);
      });
      lines.end(); d.reached = reached; d.safe = safe; if (t > 16) d.state = 'done'; if (AX.LivePanels && AX.LivePanels.drillTick && Math.floor(t * 4) !== d._lt) { d._lt = Math.floor(t * 4); AX.LivePanels.drillTick(); }
    }
    out.focusTower = function (t) { LV.flyFocus && LV.flyFocus(t.x, t.z); };

    /* ---------------- per-frame update ---------------- */
    var wx = null, labelBox = document.getElementById('labels'), lastChip = 0;
    function sunDir(date) { var s = M.sunPos(date, place.lat, place.lon), a = s.azimuth, al = s.altitude; return { v: new T.Vector3(Math.sin(a) * Math.cos(al), Math.sin(al), -Math.cos(a) * Math.cos(al)), alt: al }; }
    out.update = function (F) {
      var f = S.data.forecast, ms = F.placeMs, sd = sunDir(new Date(ms)), alt = sd.alt, day = clamp((Math.sin(alt) + 0.06) / 0.26, 0, 1), dusk = clamp(1 - Math.abs(Math.sin(alt)) * 5, 0, 1) * (alt > -0.2 ? 1 : 0), time = F.time;
      wx = f ? M.interp(f.hours, ms) : null; var cover = wx ? clamp((wx.cloud || 0) / 100, 0, 1) : 0.25, prec = wx ? (wx.precip || 0) : 0, snowF = wx ? (wx.snowfall || 0) : 0, gust = wx ? (wx.gust || 0) : 0, wspd = wx ? (wx.wind || 0) : 0, vis = wx && wx.vis != null ? wx.vis : 20000, storm = clamp(cover * 0.7 + Math.min(prec / 12, 1) * 0.5 + (wx && wx.code >= 95 ? 0.4 : 0), 0, 1);
      skyU.uSun.value.copy(sd.v); skyU.uDay.value = day; skyU.uCover.value = clamp(0.2 + cover * 0.85, 0, 1); skyU.uStorm.value = storm; skyU.uTime.value = time; skyU.uFlash.value = flash;
      var hc = new T.Color(lerp(0.02, 0.62, day) + dusk * 0.4, lerp(0.03, 0.78, day) + dusk * 0.12, lerp(0.07, 0.95, day) - dusk * 0.1), tc = new T.Color(lerp(0.005, 0.16, day), lerp(0.01, 0.4, day), lerp(0.04, 0.82, day)), gr = lerp(0.1, 0.36, day), sc = new T.Color(gr, gr * 1.06, gr * 1.18); hc.lerp(sc, storm * 0.85); tc.lerp(sc.clone().multiplyScalar(0.6), storm * 0.8); skyU.uHor.value.copy(hc); skyU.uTop.value.copy(tc); scene.fog.color.copy(hc);
      var vkm = vis / 1000; scene.fog.near = HALF * 0.9; scene.fog.far = clamp(HALF * (region ? 1.1 : 1.2) * (0.6 + vkm * 0.5), HALF * 1.4, HALF * 7) * (1 - 0.35 * storm);
      hemi.intensity = (0.62 + 0.42 * day) * (1 - 0.3 * storm) + flash * 0.8; hemi.color.setRGB(lerp(0.46, 0.78, day), lerp(0.56, 0.88, day), lerp(0.86, 1, day)); sun.position.copy(sd.v).multiplyScalar(HALF * 4); sun.intensity = 1.05 * day * (1 - 0.7 * storm) + flash * 1.4; sun.color.setRGB(1, 0.92 - dusk * 0.25, 0.8 - dusk * 0.4); moon.position.set(-sd.v.x * HALF * 3, HALF * 2, -sd.v.z * HALF * 3); moon.intensity = (1 - day) * 0.5 * (1 - storm * 0.5);
      uni.uTime.value = time; uni.uContour.value = S.layers.contours ? 1 : 0; uni.uOn.value = (S.layers.flood && out.info.ready) ? 1 : 0;
      // precipitation
      var snowy = snowF > 0.05 || (wx && wx.temp != null && wx.temp < 1 && prec > 0.1), intensity = snowy ? clamp(Math.max(snowF, prec * 0.4) / 1.2, 0, 1) : clamp(Math.pow(prec / 22, 0.55), 0, 1), box = clamp(F.camDist * 1.5, HALF * 0.2, HALF * 1.2);
      precip.visible = !!S.layers.fx && intensity > 0.01; ru.uInt.value = intensity; ru.uSnow.value = snowy ? 1 : 0; ru.uTime.value = time; var rcx = F.camera.position.x * 0.4, rcz = F.camera.position.z * 0.4; ru.uCenter.value.set(rcx, Math.max(0, yAt(rcx, rcz) - 1), rcz); ru.uBox.value.set(box, box * 0.55, box); ru.uLen.value = box * 0.02 + 0.2; ru.uFar.value = box * 1.0; ru.uColor.value.set(snowy ? 0xffffff : 0xb4cdff); ru.uSpeed.value = box * 0.5;
      var wd = wx ? ((wx.windDir || 0) + 180) * Math.PI / 180 : 0, wv = wx ? clamp(gust / 60, 0, 1.5) : 0; ru.uWind.value.set(Math.sin(wd) * wv * box * 0.12, -Math.cos(wd) * wv * box * 0.12);
      var cam = F.camera.position; deck.position.set(0, region ? 22 : 36, 0); deck.material.opacity = (S.layers.fx ? clamp((cover - 0.25) * 1.1, 0, 0.7) : 0) * (cam.y < deck.position.y ? 1 : 0.4); deck.visible = deck.material.opacity > 0.01; deckTex.offset.set(time * 0.0015 * (1 + wv * 2), time * 0.0008);
      // wind streaks
      wind.begin(); if (S.layers.wind && wx && wspd > 8) {
        var wr = clamp(F.camDist * 0.6, HALF * 0.2, HALF * 0.9), dx2 = Math.sin(wd), dz2 = -Math.cos(wd), spd = clamp(wspd / 25, 0.2, 2.2) * wr * 0.3;
        for (var k = 0; k < 500; k++) { wlife[k] -= F.dt * 0.5; if (wlife[k] <= 0) { wlife[k] = 0.6 + Math.random() * 0.8; wpos[k * 3] = (Math.random() - 0.5) * wr * 2; wpos[k * 3 + 2] = (Math.random() - 0.5) * wr * 2; wpos[k * 3 + 1] = yAt(wpos[k * 3], wpos[k * 3 + 2]) + 0.5 + Math.random() * wr * 0.08; } var ln = spd * 0.12; wind.seg(wpos[k * 3], wpos[k * 3 + 1], wpos[k * 3 + 2], wpos[k * 3] - dx2 * ln, wpos[k * 3 + 1], wpos[k * 3 + 2] - dz2 * ln, [0.55, 0.9, 1], Math.min(1, wlife[k] * 3) * 0.6); wpos[k * 3] += dx2 * spd * F.dt; wpos[k * 3 + 2] += dz2 * spd * F.dt; }
      } wind.end();
      // lightning
      var thunder = wx && (wx.code >= 95 || (wx.cape > 1500 && prec > 3)) && S.layers.fx && !LV.reduced;
      if (thunder) { nextBolt -= F.dt; if (nextBolt <= 0) { nextBolt = 1.2 + Math.random() * 4; flash = 1; boltT = 0.16; var bx2 = (Math.random() - 0.5) * HALF * 1.4, bz2 = (Math.random() - 0.5) * HALF * 1.4, pts = [], yy = deck.position.y, xx = bx2, zz = bz2, gy = yAt(bx2, bz2); while (yy > gy) { pts.push(new T.Vector3(xx, yy, zz)); yy -= HALF * 0.02 + Math.random() * HALF * 0.02; xx += (Math.random() - 0.5) * HALF * 0.03; zz += (Math.random() - 0.5) * HALF * 0.03; } bolt.geometry.setFromPoints(pts); bolt.visible = true; } }
      flash = Math.max(0, flash - F.dt * 4); if (boltT > 0) { boltT -= F.dt; if (boltT <= 0) bolt.visible = false; }
      // groups visibility
      if (groups.buildings) groups.buildings.visible = !!S.layers.buildings; if (groups.towers) groups.towers.visible = !!S.layers.towers; if (groups.pois) groups.pois.visible = !!S.layers.pois; if (groups.markers) groups.markers.visible = true;
      glow.begin(); if (out.towers.length && S.layers.towers) out.towers.forEach(function (tw) { if (tw.top) { glow.push(tw.top.x, tw.top.y + 0.4, tw.top.z, 1, 0.2, 0.2, (0.5 + 0.5 * Math.sin(time * 2 + tw.x)) * (region ? 2 : 3) + 0.6); } });
      drillUpdate(F); glow.end(); glow.setScale(F.glowScale);
      if (overlays.rain) overlays.rain.visible = !!S.layers.rainOverlay; if (overlays.snow) overlays.snow.visible = !!S.layers.snowOverlay;
      updateLabels(F); if (performance.now() - lastChip > 300) { lastChip = performance.now(); chip(f, wx, ms); }
    };
    function chip(f, w, ms) {
      var el = document.getElementById('wxchip'); if (!el) return; if (!f || !w) { el.innerHTML = '<b>Forecast loading…</b>'; return; } var info = M.wmo(w.code), lt = new Date(ms + f.utcOffset), hh = ('0' + lt.getUTCHours()).slice(-2) + ':00', tag = S.board ? S.board.label : '';
      el.innerHTML = '<span class="wxbig">' + w.temp.toFixed(0) + '°</span><span><b>' + info[0] + '</b><small>' + lt.toUTCString().slice(5, 11) + ' ' + hh + ' local · ' + (S.offsetH >= 0 ? '+' : '−') + Math.abs(Math.round(S.offsetH)) + ' h</small></span><span class="wxg">rain ' + (w.precip || 0).toFixed(1) + ' mm/h · snow ' + (w.snowfall || 0).toFixed(1) + ' cm/h · wind ' + (w.wind || 0).toFixed(0) + ' (gust ' + (w.gust || 0).toFixed(0) + ') km/h · cloud ' + Math.round(w.cloud || 0) + '% · vis ' + ((w.vis == null ? 20000 : w.vis) / 1000).toFixed(0) + ' km</span>' + (tag ? '<em class="att lv' + S.board.level + '">' + tag + '</em>' : '');
    }
    /* labels (DOM) */
    function updateLabels(F) {
      if (!labelBox) return; var cands = [], cam = F.camera, v = new T.Vector3(), W = F.W, H = F.H;
      pickables.forEach(function (p) { if (!S.layers.labels) return; if (p.kind === 'tower' && !S.layers.towers) return; if (p.kind === 'poi' && !S.layers.pois) return; v.copy(p.pos).project(cam); if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return; var d = cam.position.distanceTo(p.pos); if (d > (region ? 220 : 360) && p.kind !== 'event') return; cands.push({ p: p, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, pr: (p.kind === 'event' ? 3 : p.kind === 'tower' ? 2 : 1) * 1e4 - d + (LV.selection && LV.selection.id === p.id ? 1e6 : 0) }); });
      cands.sort(function (a, b) { return b.pr - a.pr; }); var keep = {}, placed = []; cands.forEach(function (c) { if (placed.length >= 18) return; for (var i = 0; i < placed.length; i++) if (Math.abs(placed[i].x - c.x) < 90 && Math.abs(placed[i].y - c.y) < 16 && c.pr < 1e5) return; placed.push(c); keep[c.p.id] = c; });
      Object.keys(labelEls).forEach(function (id) { if (!keep[id]) labelEls[id].style.display = 'none'; });
      Object.keys(keep).forEach(function (id) { var c = keep[id], e = labelEls[id]; if (!e) { e = document.createElement('div'); e.className = 'lbl ' + c.p.kind; e.innerHTML = '<span class="ln"></span><em class="ls"></em>'; e.querySelector('.ln').textContent = c.p.name; e.querySelector('.ls').textContent = c.p.sub || ''; e.style.setProperty('--c', c.p.kind === 'tower' ? '#ff7ab0' : c.p.kind === 'poi' ? '#4be3a0' : '#cfe2ff'); labelBox.appendChild(e); labelEls[id] = e; e.dataset.pl = '1'; } e.style.display = ''; e.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px) translate(-50%,-120%)'; e.classList.toggle('sel', !!(LV.selection && LV.selection.id === id)); });
    }
    out.pick = function (mx, my, camera, W, H) {
      var best = null, bd = 20, v = new T.Vector3(); pickables.forEach(function (p) { if (p.kind === 'tower' && !S.layers.towers) return; if (p.kind === 'poi' && !S.layers.pois) return; v.copy(p.pos).project(camera); if (v.z > 1) return; var d = Math.hypot((v.x + 1) / 2 * W - mx, (1 - v.y) / 2 * H - my); if (d < bd) { bd = d; best = { id: p.id, kind: p.kind, ref: p.ref, name: p.name, sub: p.sub }; } }); return best;
    };
    out.setSel = function () { }; out.layerChanged = function (name) { if (name === 'flood' && out.info.ready) out.setScenario(S.scenario.level, S.scenario.mode); };
    out.dispose = function () { disposed = true; Object.keys(labelEls).forEach(function (id) { labelEls[id].remove(); }); labelEls = {}; var chipEl = document.getElementById('wxchip'); if (chipEl) chipEl.innerHTML = ''; scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map.dispose) o.material.map.dispose(); o.material.dispose && o.material.dispose(); } }); };

    /* ---------------- overlays for region (IMERG rain, MODIS snow) ---------------- */
    var overlays = {}; function makeOverlay(key, layer, fmt, time, label) {
      L.loadImage('gibs', L.gibsUrl({ layer: layer, fmt: fmt, transparent: true, bbox: [bb.latMin, bb.lonMin, bb.latMax, bb.lonMax], w: 512, h: 512, time: time }), label).then(function (im) { if (disposed || !mesh) return; var t = new T.Texture(im); t.needsUpdate = true; var m = new T.Mesh(out.terrainGeo, new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.renderOrder = 2; m.visible = !!S.layers[key === 'rain' ? 'rainOverlay' : 'snowOverlay']; scene.add(m); overlays[key] = m; }).catch(function () { });
    }
    var origLayer = out.layerChanged; out.layerChanged = function (name) { origLayer(name); if (!region) return; var yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10); if (name === 'rainOverlay' && S.layers.rainOverlay && !overlays.rain) makeOverlay('rain', 'IMERG_Precipitation_Rate', 'image/png', null, 'IMERG rain (region)'); if (name === 'snowOverlay' && S.layers.snowOverlay && !overlays.snow) makeOverlay('snow', 'MODIS_Terra_NDSI_Snow_Cover', 'image/png', yd, 'MODIS snow cover (region)'); };

    /* ---------------- start ---------------- */
    LV.emit('busy', 'Reading the real terrain (SRTM tiles)…'); out.info.progress = 0;
    var demP = L.elevationGrid(place.lat, place.lon, spanKm, N, function (p) { LV.emit('busy', 'Reading the real terrain… ' + Math.round(p * 100) + '%'); });
    var texP = loadView(S.view);
    out.ready = demP.then(function (d) { if (disposed) return; dem = d; buildTerrain(); if (S.layers.flood) out.setScenario(S.scenario.level, S.scenario.mode); buildMarkers(); if (!region && !out.towers.length) { makePlaceholderTowers(); buildTowers(); } LV.emit('busy', region ? 'Loading NASA MODIS imagery…' : 'Loading OpenStreetMap tiles…'); LV.emit('data', 'terrain'); return texP; }).then(function (t) {
      if (disposed || !mesh) return; applyView(t); mesh.material.color.set(0xffffff); out.info.textured = true;
      if (S.layers.rainOverlay) out.layerChanged('rainOverlay'); if (S.layers.snowOverlay) out.layerChanged('snowOverlay'); LV.emit('data', 'place3d');
    }).catch(function (e) { LV.toast('Scene problem', String(e && e.message || e), '#ff5d6c', 'alert'); });
    return out;
  };
}
