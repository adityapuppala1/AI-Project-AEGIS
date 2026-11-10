/* AEGIS Alert Journey explainer — small three.js helpers (glow points, ribbons, canvas textures, line batches). */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};
  var G = AX.gfx = {};
  var rgbCache = {};

  G.rgb = function (hex) {
    if (rgbCache[hex]) return rgbCache[hex];
    var h = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
    return (rgbCache[hex] = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);
  };

  G.glowTex = function () {
    if (G._gt) return G._gt;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (G._gt = new THREE.CanvasTexture(c));
  };

  /* One draw call of additive, sized, coloured glow sprites. Call begin() / push()... / end() every frame. */
  G.glowBatch = function (max, depthTest) {
    var T = THREE, geo = new T.BufferGeometry();
    var pos = new Float32Array(max * 3), col = new Float32Array(max * 3), siz = new Float32Array(max), n = 0;
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new T.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new T.BufferAttribute(siz, 1));
    geo.setDrawRange(0, 0);
    var mat = new T.ShaderMaterial({
      uniforms: { uMap: { value: G.glowTex() }, uScale: { value: 600 }, uOpacity: { value: 1 } },
      vertexShader: 'attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;\n' +
        'void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(aSize*uScale/max(-mv.z,0.2),160.0); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D uMap; uniform float uOpacity; varying vec3 vC;\n' +
        'void main(){ float a=texture2D(uMap,gl_PointCoord).a*uOpacity; gl_FragColor=vec4(vC,a); }',
      transparent: true, depthWrite: false, depthTest: depthTest !== false, blending: T.AdditiveBlending
    });
    var pts = new T.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 20;
    return {
      obj: pts, mat: mat, max: max,
      begin: function () { n = 0; },
      push: function (x, y, z, r, gg, b, s) {
        if (n >= max) return; var i = n * 3;
        pos[i] = x; pos[i + 1] = y; pos[i + 2] = z; col[i] = r; col[i + 1] = gg; col[i + 2] = b; siz[n] = s; n++;
      },
      pushC: function (x, y, z, c, k, s) { if (n >= max) return; var i = n * 3; pos[i] = x; pos[i + 1] = y; pos[i + 2] = z; col[i] = c[0] * k; col[i + 1] = c[1] * k; col[i + 2] = c[2] * k; siz[n] = s; n++; },
      end: function () {
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true; geo.attributes.aColor.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
      },
      count: function () { return n; },
      setScale: function (v) { mat.uniforms.uScale.value = v; }
    };
  };

  /* Batch of line segments with per-vertex colour (additive). */
  G.lineBatch = function (maxSeg) {
    var T = THREE, geo = new T.BufferGeometry(), pos = new Float32Array(maxSeg * 6), col = new Float32Array(maxSeg * 6), n = 0;
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.setDrawRange(0, 0);
    var mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    var obj = new T.LineSegments(geo, mat); obj.frustumCulled = false; obj.renderOrder = 18;
    return {
      obj: obj, begin: function () { n = 0; },
      seg: function (ax, ay, az, bx, by, bz, c, k) {
        if (n >= maxSeg) return; var i = n * 6;
        pos[i] = ax; pos[i + 1] = ay; pos[i + 2] = az; pos[i + 3] = bx; pos[i + 4] = by; pos[i + 5] = bz;
        col[i] = col[i + 3] = c[0] * k; col[i + 1] = col[i + 4] = c[1] * k; col[i + 2] = col[i + 5] = c[2] * k; n++;
      },
      end: function () { geo.setDrawRange(0, n * 2); geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
    };
  };

  /* Ribbon that hugs the terrain. pts: [{x,z}] ; returns BufferGeometry with uv (u across, v = length / vScale). */
  G.ribbon = function (pts, width, yFn, step, vScale) {
    var T = THREE, s = step || 1.2, S = [], i, k, len = 0;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.z - a.z), m = Math.max(1, Math.ceil(d / s));
      for (k = 0; k < m; k++) S.push({ x: a.x + (b.x - a.x) * k / m, z: a.z + (b.z - a.z) * k / m });
    }
    S.push({ x: pts[pts.length - 1].x, z: pts[pts.length - 1].z });
    var pos = [], uv = [], idx = [];
    for (i = 0; i < S.length; i++) {
      var p0 = S[Math.max(0, i - 1)], p1 = S[Math.min(S.length - 1, i + 1)];
      var tx = p1.x - p0.x, tz = p1.z - p0.z, tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      var nx = -tz, nz = tx, w = (typeof width === 'function' ? width(i / (S.length - 1)) : width) / 2;
      if (i > 0) len += Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z);
      var lx = S[i].x + nx * w, lz = S[i].z + nz * w, rx = S[i].x - nx * w, rz = S[i].z - nz * w;
      pos.push(lx, yFn(lx, lz), lz, rx, yFn(rx, rz), rz);
      uv.push(0, len / (vScale || 6), 1, len / (vScale || 6));
      if (i < S.length - 1) { var q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    geo.userData.length = len; geo.userData.samples = S;
    return geo;
  };

  G.canvas = function (w, h, fn) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c;
  };

  G.asphaltTex = function () {
    if (G._as) return G._as;
    var c = G.canvas(64, 128, function (x, w, h) {
      x.fillStyle = '#3b3f48'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < 260; i++) { x.fillStyle = 'rgba(' + (i % 2 ? '255,255,255' : '0,0,0') + ',' + (0.03 + Math.random() * 0.05) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      x.fillStyle = '#d9d36a'; x.fillRect(w / 2 - 1.5, 6, 3, 44); x.fillRect(w / 2 - 1.5, 70, 3, 44);
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(3, 0, 2, h); x.fillRect(w - 5, 0, 2, h);
    });
    var t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return (G._as = t);
  };
  G.dirtTex = function () {
    if (G._dt) return G._dt;
    var c = G.canvas(32, 32, function (x, w, h) { x.fillStyle = '#9a8460'; x.fillRect(0, 0, w, h); for (var i = 0; i < 90; i++) { x.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.12 + ')'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
    var t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; return (G._dt = t);
  };

  /* top-down cyclone: eye, eyewall, spiral rain bands. alpha texture (white), dark variant made by material colour */
  G.spiralTex = function (size) {
    if (G._sp) return G._sp;
    var C = AX.core, n = size || 512, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data, i, j;
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      var u = (i + 0.5) / n * 2 - 1, v = (j + 0.5) / n * 2 - 1, r = Math.hypot(u, v), o = (j * n + i) * 4;
      if (r >= 1) { d[o + 3] = 0; continue; }
      var th = Math.atan2(v, u), s = th + 4.2 * Math.log(r + 0.06);
      var band = 0.5 + 0.5 * Math.sin(3 * s * 1.0 + 2.2);
      var band2 = 0.5 + 0.5 * Math.sin(7 * s + 1.3);
      var nz = C.fbm(u * 5 + 7, v * 5 + 3, 4);
      var dens = (0.35 + 0.65 * Math.pow(band, 1.4)) * (0.7 + 0.5 * band2 * 0.5) * (0.55 + 0.9 * nz);
      dens *= Math.pow(1 - r, 0.55);
      var wall = Math.exp(-Math.pow((r - 0.105) / 0.045, 2));      // eyewall
      var eye = r < 0.075 ? 0.0 : 1.0;
      var a = Math.min(1, (dens * 0.95 + wall * 1.0) * eye);
      if (r < 0.075) a = 0.04 * (r / 0.075);
      d[o] = 238; d[o + 1] = 244; d[o + 2] = 255; d[o + 3] = Math.floor(a * 255);
    }
    x.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return (G._sp = t);
  };

  /* instanced helper: set translation/scale/rotY in one call */
  /* Performance governor shared by both modes: caps the frame rate in power-saver mode or when the tab is hidden,
   * and lowers/raises the render resolution to hold a steady frame rate (less GPU load on weak machines). */
  G.governor = function (renderer, maxPr, onChange) {
    var top = function () { return Math.min(window.devicePixelRatio || 1, maxPr); }, acc = 0, n = 0, lastDraw = 0;
    var weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    var o = { fps: 60, pr: top(), saver: !!weak, auto: true,
      shouldDraw: function (ts) { var gap = document.hidden ? 1000 : o.saver ? 1000 / 30 : 0; if (gap && ts - lastDraw < gap - 2) return false; lastDraw = ts; return true; },
      sample: function (dt) {
        acc += dt; n++; if (acc < 1.5) return; o.fps = n / acc; acc = 0; n = 0; if (!o.auto || document.hidden) return;
        var want = o.pr, low = o.saver ? 22 : 40, high = o.saver ? 29 : 56;
        if (o.fps < low && o.pr > 0.6) want = Math.max(0.6, o.pr * 0.85); else if (o.fps > high && o.pr < top()) want = Math.min(top(), o.pr * 1.12);
        if (Math.abs(want - o.pr) > 0.01) { o.pr = want; renderer.setPixelRatio(want); if (onChange) onChange(); }
      } };
    return o;
  };
  G.inst = function (geo, mat, count) {
    var m = new THREE.InstancedMesh(geo, mat, count), dummy = new THREE.Object3D();
    m.userData.set = function (i, x, y, z, sx, sy, sz, ry) {
      dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry || 0, 0); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    };
    m.frustumCulled = false;
    return m;
  };

  /* tiny HTML-free text helper for canvas sprites (used for names painted in 3D) */
  G.textSprite = function (text, color, scale) {
    var c = G.canvas(256, 64, function (x, w, h) {
      x.font = '600 28px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = 'rgba(5,8,22,.72)'; var tw = x.measureText(text).width + 24; x.fillRect((w - tw) / 2, 10, tw, 44);
      x.fillStyle = color || '#fff'; x.fillText(text, w / 2, h / 2 + 1);
    });
    var tex = new THREE.CanvasTexture(c), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(4 * (scale || 1), 1, 1);
    return sp;
  };
}
