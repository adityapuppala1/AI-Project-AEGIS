/* IndTrana Alert Journey explainer — environment: sky, lights, terrain, sea/flood water, river, rain, wind, lightning, cyclone, forecast cone. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};

  AX.buildEnvironment = function (ctx) {
    var T = ctx.T, C = ctx.C, G = ctx.G, scene = ctx.scene, q = ctx.q, env = {};
    var clamp = C.clamp, lerp = C.lerp, sstep = C.sstep;

    /* ---------------- lights, fog ---------------- */
    var hemi = new T.HemisphereLight(0xbfd8ff, 0x4a4034, 0.9), sun = new T.DirectionalLight(0xfff2d8, 1), moon = new T.DirectionalLight(0x7f9bff, 0.2);
    scene.add(hemi, sun, sun.target, moon, moon.target);
    scene.fog = new T.Fog(0x9fc3ee, 110, 900);
    var sunDir = new T.Vector3(), tmpC = new T.Color();

    /* ---------------- sky dome ---------------- */
    var skyU = {
      uTop: { value: new T.Color(0x2a6fdb) }, uHor: { value: new T.Color(0xbcd9ff) }, uSunDir: { value: new T.Vector3(0, 1, 0) }, uMoonDir: { value: new T.Vector3(0, -1, 0) },
      uSunCol: { value: new T.Color(0xffe2a8) }, uDay: { value: 1 }, uCover: { value: 0.3 }, uStorm: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }
    };
    var noiseGLSL = 'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n' +
      'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}\n' +
      'float fbm4(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}\n';
    var sky = new T.Mesh(new T.SphereGeometry(2400, 32, 16), new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uTop,uHor,uSunDir,uMoonDir,uSunCol; uniform float uDay,uCover,uStorm,uTime,uFlash; varying vec3 vD;\n' + noiseGLSL +
        'void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.,1.);\n' +
        ' vec3 col=mix(uHor,uTop,pow(h,0.5));\n' +
        ' float sd=max(dot(d,uSunDir),0.); col+=uSunCol*(pow(sd,700.)*4.+pow(sd,22.)*0.3)*uDay*(1.-uStorm*0.85);\n' +
        ' float md=max(dot(d,uMoonDir),0.); col+=vec3(0.8,0.88,1.)*pow(md,1500.)*3.*(1.-uDay)*(1.-uStorm);\n' +
        ' vec2 su=d.xz/(abs(d.y)+0.35)*70.; float stv=step(0.988,h21(floor(su)))*(0.6+0.4*sin(uTime*3.+h21(floor(su))*40.)); col+=vec3(stv)*(1.-uDay)*(1.-uCover)*smoothstep(0.02,0.2,d.y);\n' +
        ' vec2 cu=d.xz/(d.y+0.16)*0.8+vec2(uTime*0.008,uTime*0.003); float n=fbm4(cu*1.4)*0.75+0.25*fbm4(cu*4.0);\n' +
        ' float cl=smoothstep(1.02-uCover*0.9,1.18-uCover*0.9,n+0.22)*smoothstep(0.0,0.12,d.y);\n' +
        ' vec3 cc=mix(vec3(1.)*(0.28+0.72*uDay),vec3(0.2,0.22,0.26)*(0.35+0.65*uDay),uStorm);\n' +
        ' col=mix(col,cc,cl*(0.55+0.4*uStorm));\n' +
        ' col+=vec3(0.7,0.78,1.)*uFlash*(0.4+0.6*cl);\n' +
        ' if(d.y<0.) col=mix(uHor,uHor*0.7,clamp(-d.y*6.,0.,1.));\n' +
        ' gl_FragColor=vec4(col,1.); }'
    }));
    sky.renderOrder = -20; sky.frustumCulled = false; scene.add(sky);

    /* ---------------- terrain ---------------- */
    var NI = q.terrainN, HALF = 70, HG = new Float32Array((NI + 1) * (NI + 1));
    function gridMesh(x0, x1, z0, z1, n, hole, skirt, store) {
      var dx = (x1 - x0) / n, dz = (z1 - z0) / n, W = n + 1, i, j, k;
      var hs = store || new Float32Array(W * W), pos = new Float32Array(W * W * 3), col = new Float32Array(W * W * 3), idx = [];
      for (j = 0; j <= n; j++) for (i = 0; i <= n; i++) { k = j * W + i; hs[k] = C.H(x0 + i * dx, z0 + j * dz); }
      for (j = 0; j <= n; j++) for (i = 0; i <= n; i++) {
        k = j * W + i; var x = x0 + i * dx, z = z0 + j * dz, h = hs[k];
        var sx = (hs[j * W + Math.min(n, i + 1)] - hs[j * W + Math.max(0, i - 1)]) / (dx * (i > 0 && i < n ? 2 : 1));
        var sz = (hs[Math.min(n, j + 1) * W + i] - hs[Math.max(0, j - 1) * W + i]) / (dz * (j > 0 && j < n ? 2 : 1));
        var c = C.colorAt(x, z, h, Math.hypot(sx, sz));
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      }
      for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
        if (hole) { var cx = x0 + (i + 0.5) * dx, cz = z0 + (j + 0.5) * dz; if (Math.abs(cx) < hole && Math.abs(cz) < hole) continue; }
        var a = j * W + i, b = a + 1, c2 = a + W, d = c2 + 1; idx.push(a, c2, b, b, c2, d);
      }
      var P = Array.prototype.slice.call(pos), Cc = Array.prototype.slice.call(col);
      if (skirt) {
        var edge = [], base = W * W;
        for (i = 0; i <= n; i++) edge.push(i);                                  // z = z0 row
        for (j = 1; j <= n; j++) edge.push(j * W + n);                          // x = x1 column
        for (i = n - 1; i >= 0; i--) edge.push(n * W + i);                      // z = z1 row
        for (j = n - 1; j >= 1; j--) edge.push(j * W);                          // x = x0 column
        edge.push(0);
        edge.forEach(function (e) { P.push(pos[e * 3], -3, pos[e * 3 + 2]); Cc.push(col[e * 3] * 0.7, col[e * 3 + 1] * 0.7, col[e * 3 + 2] * 0.7); });
        for (i = 0; i < edge.length - 1; i++) { var t0 = edge[i], t1 = edge[i + 1], s0 = base + i, s1 = base + i + 1; idx.push(t0, s0, t1, t1, s0, s1); }
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(Cc, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    }
    var tu = { uFlood: { value: 0 }, uPred: { value: 0 }, uSig: { value: 0 }, uRisk: { value: 0 }, uTime: { value: 0 } };
    var tmat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    tmat.onBeforeCompile = function (sh) {
      for (var k in tu) sh.uniforms[k] = tu[k];
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY; varying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = position.y; vWXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlood,uPred,uSig,uRisk,uTime; varying float vWY; varying vec2 vWXZ;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' +
          'float under=step(vWY,uFlood); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.36,0.30,0.20),under*0.55*step(0.02,uFlood));\n' +
          'float shore=1.0-smoothstep(0.0,0.1,abs(vWY-uFlood)); diffuseColor.rgb+=shore*0.22*step(0.05,uFlood)*step(0.0,vWY);\n' +
          'float damp=smoothstep(uFlood+0.4,uFlood,vWY)*(1.0-under); diffuseColor.rgb*=1.0-0.2*damp*step(0.05,uFlood);\n' +
          'float inP=step(uFlood,vWY)*step(vWY,uPred)*step(0.0,vWY); float pl=0.5+0.5*sin(uTime*2.0+(vWXZ.x+vWXZ.y)*0.35);\n' +
          'vec3 rk=mix(vec3(1.0,0.74,0.2),vec3(1.0,0.34,0.3),smoothstep(uPred-0.8,uPred,vWY));\n' +
          'diffuseColor.rgb=mix(diffuseColor.rgb,rk,uRisk*inP*(0.3+0.14*pl));\n' +
          'float ed=1.0-smoothstep(0.0,0.05,abs(vWY-uPred)); float el=1.0-smoothstep(0.0,0.05,abs(vWY-(uPred-uSig))); float eh=1.0-smoothstep(0.0,0.05,abs(vWY-(uPred+uSig)));\n' +
          'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0,0.42,0.36),uRisk*step(0.0,vWY)*clamp(ed+0.5*(el+eh),0.0,1.0));\n');
    };
    var inner = new T.Mesh(gridMesh(-HALF, HALF, -HALF, HALF, NI, 0, true, HG), tmat);
    var outer = new T.Mesh(gridMesh(-420, 420, -420, 420, 120, 70, false), tmat);
    outer.position.y = -0.04; ctx.add('terrain', inner); ctx.add('terrain', outer);
    ctx.hAt = function (x, z) {
      var u = (x + HALF) / (2 * HALF) * NI, v = (z + HALF) / (2 * HALF) * NI;
      if (u < 0 || v < 0 || u >= NI || v >= NI) return C.H(x, z);
      var i = u | 0, j = v | 0, fu = u - i, fv = v - j, W = NI + 1, a = HG[j * W + i], b = HG[j * W + i + 1], c = HG[(j + 1) * W + i], d = HG[(j + 1) * W + i + 1];
      return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
    };
    ctx.HG = HG; ctx.NI = NI; ctx.HALF = HALF;

    /* ---------------- sea / flood water ---------------- */
    var wu = T.UniformsUtils.merge([T.UniformsLib.fog, {
      uTime: { value: 0 }, uWave: { value: 0.06 }, uLevel: { value: 0 }, uMud: { value: 0 }, uSun: { value: new T.Vector3(0, 1, 0) },
      uSky: { value: new T.Color(0x9fc3ee) }, uLight: { value: new T.Color(1, 1, 1) }, uDay: { value: 1 }
    }]);
    var wmat = new T.ShaderMaterial({
      uniforms: wu, transparent: true, depthWrite: false, fog: true,
      vertexShader: '#include <fog_pars_vertex>\nuniform float uTime,uWave,uLevel; varying vec3 vW;\n' +
        'void main(){ vec3 p=position; p.y=uLevel; float w=sin(p.x*0.35+uTime*1.2)*0.5+sin(p.z*0.5+uTime*1.5)*0.35+sin((p.x+p.z)*0.8+uTime*2.2)*0.15; p.y+=w*uWave; vW=p;\n' +
        ' vec4 mvPosition=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: '#include <fog_pars_fragment>\nuniform float uTime,uWave,uMud,uDay; uniform vec3 uSun,uSky,uLight; varying vec3 vW;\n' +
        'void main(){ vec3 V=normalize(cameraPosition-vW);\n' +
        ' float dx=0.175*cos(vW.x*0.35+uTime*1.2)+0.12*cos((vW.x+vW.z)*0.8+uTime*2.2);\n float dz=0.175*cos(vW.z*0.5+uTime*1.5)+0.12*cos((vW.x+vW.z)*0.8+uTime*2.2);\n' +
        ' vec3 N=normalize(vec3(-dx*uWave*3.0+0.05*sin(vW.x*3.1+uTime*1.7)*sin(vW.z*2.7-uTime*1.3),1.,-dz*uWave*3.0+0.05*sin(vW.z*3.3+uTime*1.1)));\n' +
        ' float fres=pow(1.0-max(dot(N,V),0.0),3.0);\n' +
        ' vec3 deep=mix(vec3(0.015,0.16,0.30),vec3(0.30,0.23,0.13),uMud); vec3 shal=mix(vec3(0.05,0.36,0.50),vec3(0.50,0.40,0.24),uMud);\n' +
        ' vec3 col=mix(deep,shal,0.4+0.35*N.x*4.0); col=mix(col,uSky*1.15,fres*0.72);\n' +
        ' float spec=pow(max(dot(reflect(-uSun,N),V),0.0),140.0)*uDay*(1.0-uMud*0.7); col+=spec*vec3(1.,.95,.8);\n' +
        ' float flow=smoothstep(0.7,1.0,sin((vW.x+vW.z)*1.3-uTime*2.6+sin(vW.z*0.7)*2.0))*uMud*0.14; col+=flow; col+=smoothstep(0.82,1.0,sin(vW.x*2.2+uTime*1.8)*sin(vW.z*2.0-uTime*1.5))*0.14*(0.4+uMud);\n' +
        ' float crest=smoothstep(0.45,0.9,uWave*2.2)*smoothstep(0.6,1.0,sin(vW.x*0.9+vW.z*0.7+uTime*2.0)*0.5+0.5); col+=crest*0.18;\n' +
        ' col*=uLight; float al=mix(0.62,0.9,fres); al=mix(al,0.9,uMud*0.6); gl_FragColor=vec4(col,al);\n#include <fog_fragment>\n}'
    });
    var wIn = new T.Mesh(new T.PlaneGeometry(190, 190, 150, 150).rotateX(-Math.PI / 2), wmat);
    var wOut = new T.Mesh(new T.PlaneGeometry(1800, 1800, 60, 60).rotateX(-Math.PI / 2), wmat);
    wOut.position.y = -0.03; wIn.renderOrder = 5; wOut.renderOrder = 4; wOut.frustumCulled = wIn.frustumCulled = false;
    ctx.add('water', wIn); ctx.add('water', wOut);

    /* river ribbon (width and level follow discharge) */
    var rp = C.riverPoints(1.6), rpos = [], rside = [], rnrm = [], rhalf = [], ruv = [], ridx = [], rlen = 0, ii;
    for (ii = 0; ii < rp.length; ii++) {
      var p0 = rp[Math.max(0, ii - 1)], p1 = rp[Math.min(rp.length - 1, ii + 1)], tx = p1.x - p0.x, tz = p1.z - p0.z, tl = Math.hypot(tx, tz) || 1;
      if (ii > 0) rlen += Math.hypot(rp[ii].x - rp[ii - 1].x, rp[ii].z - rp[ii - 1].z);
      [-1, 1].forEach(function (s) { rpos.push(rp[ii].x, rp[ii].bed, rp[ii].z); rside.push(s); rnrm.push(-tz / tl, tx / tl); rhalf.push(rp[ii].half); ruv.push(s * 0.5 + 0.5, rlen / 6); });
      if (ii < rp.length - 1) { var kq = ii * 2; ridx.push(kq, kq + 1, kq + 2, kq + 1, kq + 3, kq + 2); }
    }
    var rgeo = new T.BufferGeometry();
    rgeo.setAttribute('position', new T.Float32BufferAttribute(rpos, 3)); rgeo.setAttribute('aSide', new T.Float32BufferAttribute(rside, 1));
    rgeo.setAttribute('aNrm', new T.Float32BufferAttribute(rnrm, 2)); rgeo.setAttribute('aHalf', new T.Float32BufferAttribute(rhalf, 1)); rgeo.setAttribute('uv', new T.Float32BufferAttribute(ruv, 2));
    rgeo.setIndex(ridx);
    var ru = T.UniformsUtils.merge([T.UniformsLib.fog, { uTime: { value: 0 }, uRise: { value: 0.4 }, uWS: { value: 1 }, uMud: { value: 0 }, uSpeed: { value: 2 }, uLight: { value: new T.Color(1, 1, 1) } }]);
    var rmat = new T.ShaderMaterial({
      uniforms: ru, transparent: true, depthWrite: false, fog: true, side: T.DoubleSide,
      vertexShader: '#include <fog_pars_vertex>\nattribute float aSide; attribute vec2 aNrm; attribute float aHalf; uniform float uRise,uWS; varying vec2 vUv;\n' +
        'void main(){ vec3 p=position; p.xz+=aNrm*aSide*(aHalf*uWS+1.1); p.y+=uRise; vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: '#include <fog_pars_fragment>\nuniform float uTime,uMud,uSpeed; uniform vec3 uLight; varying vec2 vUv;\n' +
        'void main(){ vec3 col=mix(vec3(0.10,0.42,0.56),vec3(0.36,0.28,0.16),uMud);\n' +
        ' float s=sin(vUv.y*5.0-uTime*uSpeed+sin(vUv.x*6.0)*1.3); col+=0.12*smoothstep(0.55,1.0,s)*(0.6+uMud);\n' +
        ' float e=smoothstep(0.7,1.0,abs(vUv.x*2.0-1.0)); col=mix(col,vec3(0.92),e*0.35*(0.35+uMud)); col*=uLight;\n' +
        ' float a=0.9*(1.0-smoothstep(0.88,1.0,abs(vUv.x*2.0-1.0))); gl_FragColor=vec4(col,a);\n#include <fog_fragment>\n}'
    });
    var river = new T.Mesh(rgeo, rmat); river.frustumCulled = false; river.renderOrder = 6; ctx.add('water', river);

    /* ---------------- rain (GPU streaks) ---------------- */
    var RN = q.rain, rb = new Float32Array(RN * 2 * 3), rrnd = new Float32Array(RN * 2), rend = new Float32Array(RN * 2);
    for (ii = 0; ii < RN; ii++) {
      var bx = Math.random(), by = Math.random(), bz = Math.random(), rr = Math.random();
      for (var e2 = 0; e2 < 2; e2++) { var o = (ii * 2 + e2); rb[o * 3] = bx; rb[o * 3 + 1] = by; rb[o * 3 + 2] = bz; rrnd[o] = rr; rend[o] = e2; }
    }
    var rageo = new T.BufferGeometry();
    rageo.setAttribute('position', new T.BufferAttribute(rb, 3)); rageo.setAttribute('aRnd', new T.BufferAttribute(rrnd, 1)); rageo.setAttribute('aEnd', new T.BufferAttribute(rend, 1));
    var rau = { uTime: { value: 0 }, uInt: { value: 0 }, uCenter: { value: new T.Vector3() }, uBox: { value: new T.Vector3(80, 40, 80) }, uWind: { value: new T.Vector2() }, uLen: { value: 1.5 }, uColor: { value: new T.Color(0.7, 0.8, 1) }, uFadeFar: { value: 60 } };
    var rainM = new T.LineSegments(rageo, new T.ShaderMaterial({
      uniforms: rau, transparent: true, depthWrite: false,
      vertexShader: 'attribute float aRnd; attribute float aEnd; uniform float uTime,uInt,uLen,uFadeFar; uniform vec3 uCenter,uBox; uniform vec2 uWind; varying float vA;\n' +
        'void main(){ if(aRnd>uInt){ gl_Position=vec4(2.,2.,2.,1.); vA=0.; return; }\n' +
        ' vec3 b=position; float fall=mod(b.y*uBox.y-uTime*(18.+10.*aRnd),uBox.y);\n' +
        ' float x=uCenter.x+mod(b.x*uBox.x-uCenter.x+uBox.x*0.5,uBox.x)-uBox.x*0.5; float z=uCenter.z+mod(b.z*uBox.z-uCenter.z+uBox.z*0.5,uBox.z)-uBox.z*0.5;\n' +
        ' vec3 p=vec3(x,uCenter.y+fall,z); p.xz+=uWind*(fall-uBox.y*0.5)*0.05; vec3 dir=normalize(vec3(uWind.x*0.6,-1.,uWind.y*0.6)); p-=dir*aEnd*uLen*(0.7+0.6*aRnd);\n' +
        ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; vA=(1.-aEnd)*0.55*(1.-smoothstep(uFadeFar*0.4,uFadeFar,-mv.z)); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor=vec4(uColor,vA); }'
    }));
    rainM.frustumCulled = false; rainM.renderOrder = 15; ctx.add('weather', rainM);

    /* ---------------- low storm deck + cyclone ---------------- */
    var deckTex = new T.CanvasTexture(G.canvas(256, 256, function (x, w, h) {
      var im = x.createImageData(w, h), d = im.data, i, j;
      for (j = 0; j < h; j++) for (i = 0; i < w; i++) { var n = C.fbm(i / 40, j / 40, 4), a = clamp((n - 0.38) * 2.6, 0, 1); var o = (j * w + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a * 255; }
      x.putImageData(im, 0, 0);
    }));
    deckTex.wrapS = deckTex.wrapT = T.RepeatWrapping; deckTex.repeat.set(3, 3);
    var deckMat = new T.MeshBasicMaterial({ map: deckTex, color: 0x4a5566, transparent: true, opacity: 0, depthWrite: false, fog: false });
    var deck = new T.Mesh(new T.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), deckMat); deck.position.y = 30; deck.renderOrder = 8; ctx.add('weather', deck);
    var deck2 = new T.Mesh(deck.geometry, deckMat.clone()); deck2.material.map = deckTex.clone(); deck2.material.map.repeat.set(2, 2); deck2.material.map.needsUpdate = true; deck2.position.y = 22; deck2.renderOrder = 8; ctx.add('weather', deck2);

    var spiral = G.spiralTex(q.spiral), cy = new T.Group();
    var topM = new T.MeshBasicMaterial({ map: spiral, color: 0xf2f6ff, transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: T.DoubleSide });
    var botM = new T.MeshBasicMaterial({ map: spiral, color: 0x39414f, transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: T.DoubleSide });
    var cyTop = new T.Mesh(new T.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), topM), cyBot = new T.Mesh(cyTop.geometry, botM), cyMid = new T.Mesh(cyTop.geometry, topM.clone());
    cyTop.position.y = 1.4; cyMid.position.y = 0.6; cyMid.material.opacity = 0.45; cyMid.rotation.y = 1.1; cyTop.renderOrder = cyMid.renderOrder = cyBot.renderOrder = 9;
    cy.add(cyBot, cyMid, cyTop);
    var eyeBeam = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), new T.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.16, depthWrite: false, fog: false, side: T.DoubleSide }));
    eyeBeam.position.y = -25; var eyeAnchor = new T.Object3D(); eyeAnchor.position.y = 12;
    ctx.add('cyclone', cy); ctx.add('cyclone', eyeBeam); scene.add(eyeAnchor);

    /* ---------------- forecast: cone + ensemble + past track ---------------- */
    var K = 15, cone = [], coneM = new T.MeshBasicMaterial({ color: 0xb59cff, transparent: true, opacity: 0.075, depthWrite: false, fog: false, side: T.DoubleSide });
    var cgeo = new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    for (ii = 0; ii < K; ii++) { var cm = new T.Mesh(cgeo, coneM); cm.renderOrder = 7; ctx.add('cone', cm); cone.push(cm); }
    var NE = 8, ens = [], ensGeo = [];
    for (ii = 0; ii < NE; ii++) {
      var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(new Float32Array(K * 3), 3));
      var el = new T.Line(eg, new T.LineBasicMaterial({ color: ii % 2 ? 0xc9b6ff : 0x9b7bff, transparent: true, opacity: 0.8, fog: false })); el.frustumCulled = false; el.renderOrder = 12;
      ctx.add('cone', el); ens.push(el);
    }
    var cgm = new T.BufferGeometry(); cgm.setAttribute('position', new T.BufferAttribute(new Float32Array(K * 3), 3));
    var centre = new T.Line(cgm, new T.LineBasicMaterial({ color: 0x38e1ff, fog: false })); centre.frustumCulled = false; centre.renderOrder = 13; ctx.add('cone', centre);
    var PH = 30, pgm = new T.BufferGeometry(); pgm.setAttribute('position', new T.BufferAttribute(new Float32Array(PH * 3), 3));
    var past = new T.Line(pgm, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false })); past.frustumCulled = false; ctx.add('cone', past);
    function trackPoints(t) {
      var out = [], k, tau, p, p1, p2, dx, dz, dl;
      for (k = 0; k < K; k++) {
        tau = k * 4; p = C.eyeAt(t + tau); p1 = C.eyeAt(t + tau - 1.5); p2 = C.eyeAt(t + tau + 1.5); dx = p2.x - p1.x; dz = p2.z - p1.z; dl = Math.hypot(dx, dz) || 1;
        out.push({ x: p.x, z: p.z, nx: -dz / dl, nz: dx / dl, tx: dx / dl, tz: dz / dl, s: C.trackSigma(t, tau), tau: tau });
      }
      return out;
    }

    /* ---------------- radar reflectivity overlay ---------------- */
    var radU = { uEye: { value: new T.Vector2() }, uRad: { value: 60 }, uInt: { value: 0.5 }, uTime: { value: 0 } };
    var radar = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.ShaderMaterial({
      uniforms: radU, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec2 vP; uniform vec2 uEye; uniform float uRad; void main(){ vec3 p=position*uRad*5.0; vP=p.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(p+vec3(uEye.x,0.,uEye.y),1.); }',
      fragmentShader: 'uniform float uRad,uInt,uTime; varying vec2 vP;\nvoid main(){ float d=length(vP)/uRad; float a=atan(vP.y,vP.x); float s=a+2.6*log(d+0.08)-uTime*0.25;\n' +
        ' float bands=0.5+0.5*sin(3.*s+1.2); float eyew=exp(-pow((d-0.14)/0.07,2.)); float body=exp(-pow(d/1.25,2.))*(0.35+0.6*pow(bands,1.5)); float eye=smoothstep(0.07,0.12,d);\n' +
        ' float r=clamp((eyew*1.0+body)*eye*uInt*1.1,0.,1.); if(r<0.12){ discard; }\n' +
        ' vec3 c=r<0.3?vec3(0.1,0.85,0.3):r<0.5?vec3(0.95,0.9,0.15):r<0.7?vec3(1.,0.55,0.1):r<0.88?vec3(1.,0.15,0.1):vec3(0.9,0.2,0.9); gl_FragColor=vec4(c,0.5*smoothstep(0.12,0.3,r)); }'
    }));
    radar.position.y = 3.4; radar.frustumCulled = false; radar.renderOrder = 10; ctx.add('radar', radar);

    /* ---------------- wind streaks (CPU, rotating around the eye) ---------------- */
    var WN = q.wind, wpos = new Float32Array(WN * 3), wlife = new Float32Array(WN), windLines = G.lineBatch(WN);
    ctx.add('wind', windLines.obj);
    function windAt(x, z, st) {
      var rx = x - st.eye.x, rz = z - st.eye.z, d = Math.hypot(rx, rz) || 1, Rm = st.radius * 0.2, Vm = st.I * 1.0;
      var v = d < Rm ? Vm * d / Rm : Vm * Math.pow(Rm / d, 0.55); v *= C.gauss(Math.max(0, d - Rm) / (st.radius * 1.6));
      return [(rz / d - rx / d * 0.35) * v, (-rx / d - rz / d * 0.35) * v, v];
    }
    env.windAt = windAt;
    for (ii = 0; ii < WN; ii++) wlife[ii] = Math.random();

    /* ---------------- lightning ---------------- */
    var bolt = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xdfe8ff, fog: false })); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
    var boltT = 0, nextBolt = 2, flash = 0;

    /* ---------------- entities ---------------- */
    ctx.reg({ id: 'cyclone', kind: 'cyclone', name: "Cyclone ‘Tarang’", icon: 'cyclone', color: '#e8eeff', anchor: eyeAnchor, lblY: 0, layer: 'cyclone', prio: 9, pick: [eyeBeam],
      describe: function (F) {
        var st = F.st, e = st.eye, dd = Math.hypot(e.x - C.CITY.x, e.z - C.CITY.z);
        return { status: { tone: st.I > 0.72 ? 'bad' : st.I > 0.45 ? 'warn' : 'info', text: st.category },
          rows: [['Max sustained wind', st.maxWindKmh + ' km/h'], ['Central pressure', st.pressure + ' hPa'], ['Distance to Nadipur', Math.round(dd * 4.5) + ' km (schematic)'], ['Rain at the city', st.rainMmh + ' mm/h'], ['Forecast cone width (24 h)', '±' + Math.round(C.trackSigma(st.t, 24) * 4.5) + ' km']],
          note: 'Synthetic exercise storm. Wind and pressure are illustrative, not a forecast.', ev: ['ir', 'gpm'] };
      } });

    /* ---------------- per-frame update ---------------- */
    var cH = new T.Color(), cT = new T.Color();
    env.update = function (F) {
      var st = F.st, t = F.t, dt = F.dt, time = F.time, day = st.sun.day, dusk = st.sun.dusk, cover = clamp(st.cloud, 0, 1);
      var stormK = clamp(cover * 0.85 + st.rain * 0.4, 0, 1);
      F.day = day; F.storm = stormK;
      // sky colours
      cH.setRGB(lerp(0.02, 0.62, day), lerp(0.03, 0.78, day), lerp(0.07, 0.95, day));
      cT.setRGB(lerp(0.005, 0.16, day), lerp(0.01, 0.4, day), lerp(0.04, 0.82, day));
      cH.r += dusk * 0.42; cH.g += dusk * 0.12; cH.b -= dusk * 0.1;
      var sg = lerp(0.1, 0.36, day); tmpC.setRGB(sg, sg * 1.06, sg * 1.18);
      cH.lerp(tmpC, stormK * 0.85); cT.lerp(tmpC.multiplyScalar(0.6), stormK * 0.8);
      skyU.uHor.value.copy(cH); skyU.uTop.value.copy(cT); scene.fog.color.copy(cH);
      scene.fog.near = lerp(130, 60, stormK); scene.fog.far = lerp(900, 420, stormK);
      sunDir.set(st.sun.dir[0], st.sun.dir[1], st.sun.dir[2]).normalize();
      skyU.uSunDir.value.copy(sunDir); skyU.uMoonDir.value.set(-sunDir.x, Math.abs(sunDir.y) * 0.6 + 0.35, -sunDir.z).normalize();
      skyU.uDay.value = day; skyU.uCover.value = clamp(0.25 + cover * 0.8, 0, 1); skyU.uStorm.value = stormK; skyU.uTime.value = time; skyU.uFlash.value = flash;
      sky.position.copy(F.cam);
      // lights
      hemi.intensity = (0.62 + 0.42 * day) * (1 - 0.3 * stormK) + flash * 0.8; hemi.color.setRGB(lerp(0.46, 0.78, day), lerp(0.56, 0.88, day), lerp(0.86, 1, day)); hemi.groundColor.setRGB(0.3 * (0.45 + day), 0.26 * (0.45 + day), 0.22 * (0.45 + day));
      sun.position.copy(sunDir).multiplyScalar(300).add(F.target); sun.target.position.copy(F.target);
      sun.intensity = 1.05 * day * (1 - 0.72 * stormK) + flash * 1.4; sun.color.setRGB(1, 0.92 - dusk * 0.25, 0.8 - dusk * 0.4);
      moon.position.set(-sunDir.x * 200, 160, -sunDir.z * 200).add(F.target); moon.target.position.copy(F.target); moon.intensity = (1 - day) * 0.5 * (1 - stormK * 0.5);
      var li = lerp(0.55, 1, day) * (1 - 0.3 * stormK); F.light = li; wu.uLight.value.setRGB(li, li, li * 1.04); ru.uLight.value.setRGB(li, li, li * 1.04);
      // terrain + water uniforms
      var Fl = Math.max(0, st.flood); tu.uFlood.value = Fl > 0.02 ? Fl : -5; tu.uTime.value = time;
      var pr = st.pred, riskOn = ctx.layerOn.risk && pr.has && F.showRisk;
      tu.uPred.value = pr.has ? pr.level : -5; tu.uSig.value = pr.sigma; tu.uRisk.value = riskOn ? 1 : 0;
      wu.uTime.value = time; wu.uLevel.value = Fl; wu.uMud.value = clamp(sstep(0.02, 0.9, Fl) * 0.9 + stormK * 0.25, 0, 1); wu.uWave.value = 0.05 + 0.5 * clamp(st.wind * 0.9 + st.surge * 0.3, 0, 1);
      wu.uSun.value.copy(sunDir); wu.uSky.value.copy(cH); wu.uDay.value = day;
      ru.uTime.value = time; ru.uRise.value = 0.38 + 0.95 * st.qn; ru.uWS.value = 1 + 0.9 * st.qn; ru.uMud.value = clamp(st.qn * 1.1, 0, 1); ru.uSpeed.value = 1.5 + 3.5 * st.qn;
      // rain
      var cam = F.cam, dist = F.camDist, box = clamp(dist * 1.5, 46, 150), rainK = ctx.layerOn.weather ? st.rain : 0;
      rau.uTime.value = time; rau.uInt.value = clamp(rainK * 1.15, 0, 1); rau.uCenter.value.set(F.target.x, Math.max(0, F.target.y - 4), F.target.z);
      rau.uBox.value.set(box, Math.min(70, box * 0.7), box); rau.uLen.value = 0.9 + box * 0.012; rau.uFadeFar.value = box * 0.9;
      var wv = windAt(C.CITY.x, C.CITY.z, st); F.windVec = wv; rau.uWind.value.set(wv[0] * 26, wv[1] * 26);
      rainM.visible = rainK > 0.01 && ctx.layerOn.weather;
      // decks
      deck.position.set(F.target.x, 30, F.target.z); deck2.position.set(F.target.x, 21, F.target.z);
      var below = cam.y < 30 ? 1 : 0.45;
      deckMat.opacity = clamp(cover * 0.8, 0, 0.78) * below * (ctx.layerOn.weather ? 1 : 0); deck2.material.opacity = clamp((cover - 0.45) * 1.2, 0, 0.7) * below * (ctx.layerOn.weather ? 1 : 0);
      deckTex.offset.set(time * 0.002 * (1 + st.wind * 3), time * 0.0012); deck2.material.map.offset.set(-time * 0.003 * (1 + st.wind * 3), time * 0.002);
      deck.visible = deckMat.opacity > 0.01; deck2.visible = deck2.material.opacity > 0.01;
      // cyclone disc
      var R = st.radius * 1.55, e = st.eye;
      cy.position.set(e.x, 54, e.z); cy.scale.set(R, 1, R); eyeBeam.position.set(e.x, 12, e.z); eyeAnchor.position.set(e.x, 16, e.z);
      var overT = Math.hypot(F.target.x - e.x, F.target.z - e.z) < R * 0.9, above = cam.y > 54 ? (overT ? 0.34 : 0.9) : 1; var fadeNear = clamp((F.camDist - 20) / 80, 0.25, 1);
      topM.opacity = (0.45 + 0.4 * st.I) * above * fadeNear; botM.opacity = cam.y > 54 ? 0 : (0.5 + 0.35 * st.I) * fadeNear; cyMid.material.opacity = 0.4 * above * fadeNear;
      cyTop.rotation.y = -time * (0.09 + 0.12 * st.I); cyMid.rotation.y = -time * (0.06 + 0.07 * st.I) + 1.1; cyBot.rotation.y = -time * 0.05;
      cy.visible = ctx.layerOn.cyclone; eyeBeam.visible = ctx.layerOn.cyclone;
      // forecast cone / ensemble
      var tp = trackPoints(t), cv = ctx.layerOn.cone && F.showCone && t > -70, k, m, a;
      for (k = 0; k < K; k++) {
        cone[k].visible = cv; if (!cv) continue; cone[k].position.set(tp[k].x, 6, tp[k].z); cone[k].scale.setScalar(Math.max(0.5, tp[k].s * 1.4));
      }
      var cpos = centre.geometry.attributes.position.array;
      for (k = 0; k < K; k++) { cpos[k * 3] = tp[k].x; cpos[k * 3 + 1] = 6.2; cpos[k * 3 + 2] = tp[k].z; }
      centre.geometry.attributes.position.needsUpdate = true; centre.visible = cv;
      for (m = 0; m < NE; m++) {
        var ep = ens[m].geometry.attributes.position.array, gk = Math.sin(m * 2.399 + 0.7) * 1.25, gl = Math.cos(m * 1.7) * 0.5;
        for (k = 0; k < K; k++) { a = tp[k]; ep[k * 3] = a.x + a.nx * a.s * gk + a.tx * a.s * gl; ep[k * 3 + 1] = 6.4; ep[k * 3 + 2] = a.z + a.nz * a.s * gk + a.tz * a.s * gl; }
        ens[m].geometry.attributes.position.needsUpdate = true; ens[m].visible = cv;
      }
      var pp = past.geometry.attributes.position.array, tt0 = Math.max(C.TMIN - 8, t - 40);
      for (k = 0; k < PH; k++) { var pe = C.eyeAt(tt0 + (t - tt0) * k / (PH - 1)); pp[k * 3] = pe.x; pp[k * 3 + 1] = 6.2; pp[k * 3 + 2] = pe.z; }
      past.geometry.attributes.position.needsUpdate = true; past.visible = cv;
      // radar
      radar.visible = ctx.layerOn.radar; radU.uEye.value.set(e.x, e.z); radU.uRad.value = st.radius; radU.uInt.value = st.I; radU.uTime.value = time;
      // wind streaks
      windLines.begin();
      if (ctx.layerOn.wind) {
        var wr = clamp(F.camDist * 0.7, 25, 90);
        for (k = 0; k < WN; k++) {
          wlife[k] -= dt * 0.5;
          if (wlife[k] <= 0) { wlife[k] = 0.6 + Math.random() * 0.8; wpos[k * 3] = F.target.x + (Math.random() - 0.5) * wr * 2; wpos[k * 3 + 2] = F.target.z + (Math.random() - 0.5) * wr * 2; wpos[k * 3 + 1] = 1.5 + Math.random() * 7; }
          var vv = windAt(wpos[k * 3], wpos[k * 3 + 2], st), sp = vv[2] * 30;
          if (sp < 0.2) continue;
          var nx2 = wpos[k * 3] + vv[0] * 30 * dt * 3, nz2 = wpos[k * 3 + 2] + vv[1] * 30 * dt * 3, bright = clamp(vv[2] * 1.6, 0.1, 1) * Math.min(1, wlife[k] * 3);
          windLines.seg(wpos[k * 3], wpos[k * 3 + 1], wpos[k * 3 + 2], wpos[k * 3] - vv[0] * 3.2, wpos[k * 3 + 1], wpos[k * 3 + 2] - vv[1] * 3.2, vv[2] > 0.5 ? [1, 0.85, 0.5] : [0.5, 0.9, 1], bright * 0.8);
          wpos[k * 3] = nx2; wpos[k * 3 + 2] = nz2;
        }
      }
      windLines.end();
      // lightning
      var thunder = st.rain > 0.45 && st.cloud > 0.85;
      if (thunder && !ctx.F.reduced) {
        nextBolt -= dt; if (nextBolt <= 0) {
          nextBolt = 1.5 + Math.random() * 5; flash = 1; boltT = 0.18;
          var bxp = F.target.x + (Math.random() - 0.5) * 90, bzp = F.target.z + (Math.random() - 0.5) * 90, pts = [], yy = 46, xx = bxp, zz = bzp;
          while (yy > ctx.hAt(bxp, bzp)) { pts.push(new T.Vector3(xx, yy, zz)); yy -= 3 + Math.random() * 3; xx += (Math.random() - 0.5) * 4; zz += (Math.random() - 0.5) * 4; }
          bolt.geometry.setFromPoints(pts); bolt.visible = true;
        }
      }
      flash = Math.max(0, flash - dt * 4); if (boltT > 0) { boltT -= dt; if (boltT <= 0) bolt.visible = false; }
      F.flash = flash;
    };
    env.sky = sky; env.skyU = skyU; env.tu = tu; env.wu = wu;
    return env;
  };
}
