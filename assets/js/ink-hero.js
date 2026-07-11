/* 觅梦 ink-hero — 何江水墨原作 → 流体粒子 (raw WebGL, no deps)
   Paintings dissolve into a drifting ink cloud, then re-form.
   Sampling is paper-aware: photos of paintings have toned paper, vignettes
   and crease shadows — we estimate local paper colour per cell and keep
   only pixels that depart from it (real brush strokes).                  */
(function () {
  'use strict';

  var PAINTINGS = [
    { src: 'assets/wx/a1/01.jpg', cn: '《旗袍仕女》' },
    { src: 'assets/wx/a1/02.jpg', cn: '《荷塘双鲤》' },
    { src: 'assets/wx/a1/04.jpg', cn: '《奔马图》' },
    { src: 'assets/wx/a1/05.jpg', cn: '《国色天香》' }
  ];
  var WORLD_H = 1.6;          // formed painting height in world units

  var host = document.getElementById('inkHero');
  if (!host) return;
  var canvas = document.getElementById('inkCanvas');
  var creditEl = document.getElementById('inkCredit');

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = !reduced && canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { host.classList.add('ink-static'); return; }

  var isSmall = Math.min(window.innerWidth, window.innerHeight) < 640 || matchMedia('(pointer:coarse)').matches;
  var COUNT = isSmall ? 26000 : 62000;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ---------- shaders ---------- */
  var NOISE = [
    'vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
    '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i  = floor(v + dot(v, C.yyy));',
    '  vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz);',
    '  vec3 l = 1.0 - g;',
    '  vec3 i1 = min(g.xyz, l.zxy);',
    '  vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + C.xxx;',
    '  vec3 x2 = x0 - i2 + C.yyy;',
    '  vec3 x3 = x0 - D.yyy;',
    '  i = mod289(i);',
    '  vec4 p = permute(permute(permute(i.z + vec4(0.0,i1.z,i2.z,1.0)) + i.y + vec4(0.0,i1.y,i2.y,1.0)) + i.x + vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_ = 0.142857142857;',
    '  vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_ = floor(j*ns.z);',
    '  vec4 y_ = floor(j - 7.0*x_);',
    '  vec4 x = x_*ns.x + ns.yyyy;',
    '  vec4 y = y_*ns.x + ns.yyyy;',
    '  vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy);',
    '  vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0)*2.0 + 1.0;',
    '  vec4 s1 = floor(b1)*2.0 + 1.0;',
    '  vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;',
    '  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
    '  vec3 p0 = vec3(a0.xy, h.x);',
    '  vec3 p1 = vec3(a0.zw, h.y);',
    '  vec3 p2 = vec3(a1.xy, h.z);',
    '  vec3 p3 = vec3(a1.zw, h.w);',
    '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
    '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
    '  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
    '  m = m*m;',
    '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
    '}'
  ].join('\n');

  var VERT = [
    'precision highp float;',
    'attribute vec3 aTarget;',
    'attribute vec3 aColor;',
    'attribute vec2 aSeed;',
    'uniform float uTime;',
    'uniform float uMorph;',
    'uniform vec2  uMouse;',
    'uniform float uMouseW;',
    'uniform vec2  uView;',      // aspect, pointScale
    'uniform float uScale;',     // fit painting into viewport
    'uniform vec2 uOff;',        // painting offset: x on wide, y on portrait
    'uniform float uDrift;',
    'varying vec3 vColor;',
    'varying float vFade;',
    NOISE,
    'void main(){',
    '  float t = uTime;',
    '  float m = clamp(uMorph*1.45 - aSeed.x*0.45, 0.0, 1.0);',
    '  m = m*m*(3.0-2.0*m);',

    '  vec3 p = aTarget * uScale;',
    '  p.xy += uOff;',
    '  vec3 np = aTarget*1.35 + vec3(0.0, 0.0, aSeed.y*4.0);',
    '  float sp = 0.10 + aSeed.y*0.06;',
    '  vec3 flow = vec3(',
    '    snoise(np + vec3(t*sp, 0.0, 0.0)),',
    '    snoise(np + vec3(0.0, t*sp, 7.3)),',
    '    snoise(np*0.8 + vec3(3.1, t*sp*0.7, 0.0)) );',
    '  float amp = mix(0.85 + aSeed.y*0.5, 0.014, m);',
    '  p += flow * amp;',
    '  float ang = (1.0-m) * (0.35*sin(t*0.12) + aSeed.y*0.2);',
    '  float ca = cos(ang), sa = sin(ang);',
    '  p.xy = mat2(ca,-sa,sa,ca) * p.xy;',

    '  vec2 d = p.xy - uMouse;',
    '  float r = length(d);',
    '  float infl = uMouseW * smoothstep(0.42, 0.0, r);',
    '  vec2 dir = d / max(r, 0.001);',
    '  p.xy += (dir * 0.15 + vec2(-dir.y, dir.x) * 0.22) * infl;',

    '  float cd = cos(uDrift), sd = sin(uDrift);',
    '  p.xz = mat2(cd,-sd,sd,cd) * p.xz;',
    '  float persp = 1.6 / (1.6 + p.z);',

    '  gl_Position = vec4(p.x * persp / uView.x, p.y * persp, 0.0, 1.0);',
    '  float sz = uView.y * (0.7 + aSeed.x*1.0) * persp;',
    '  gl_PointSize = sz * mix(1.6, 0.9, m);',
    '  vColor = aColor;',
    '  vFade = mix(0.5, 1.0, m) * (0.6 + 0.4*aSeed.y);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'varying vec3 vColor;',
    'varying float vFade;',
    'void main(){',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float a = smoothstep(0.5, 0.06, length(uv)) * vFade;',
    '  gl_FragColor = vec4(vColor * a, a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch (e) { host.classList.add('ink-static'); return; }
  gl.useProgram(prog);

  var loc = {
    aTarget: gl.getAttribLocation(prog, 'aTarget'),
    aColor: gl.getAttribLocation(prog, 'aColor'),
    aSeed: gl.getAttribLocation(prog, 'aSeed'),
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uMorph: gl.getUniformLocation(prog, 'uMorph'),
    uMouse: gl.getUniformLocation(prog, 'uMouse'),
    uMouseW: gl.getUniformLocation(prog, 'uMouseW'),
    uView: gl.getUniformLocation(prog, 'uView'),
    uScale: gl.getUniformLocation(prog, 'uScale'),
    uOff: gl.getUniformLocation(prog, 'uOff'),
    uDrift: gl.getUniformLocation(prog, 'uDrift')
  };

  var bufTarget = gl.createBuffer(), bufColor = gl.createBuffer(), bufSeed = gl.createBuffer();
  var seeds = new Float32Array(COUNT * 2);
  for (var i = 0; i < COUNT * 2; i++) seeds[i] = Math.random();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufSeed);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(loc.aTarget);
  gl.enableVertexAttribArray(loc.aColor);
  gl.enableVertexAttribArray(loc.aSeed);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.078, 0.082, 0.094, 1.0);

  /* ---------- paper-aware sampling ---------- */
  function samplePainting(img) {
    var G = 460, w, h;
    if (img.width > img.height) { w = G; h = Math.round(G * img.height / img.width); }
    else { h = G; w = Math.round(G * img.width / img.height); }
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, h);
    var px = cx.getImageData(0, 0, w, h).data;

    function lumAt(o) { return 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]; }

    /* global paper colour: mean of the brightest 30% pixels */
    var lums = [];
    for (var o = 0; o < px.length; o += 16) lums.push(lumAt(o));
    lums.sort(function (a, b) { return a - b; });
    var cut = lums[Math.floor(lums.length * 0.7)];
    var gr = 0, gg = 0, gb = 0, gn = 0;
    for (o = 0; o < px.length; o += 16) {
      if (lumAt(o) >= cut) { gr += px[o]; gg += px[o + 1]; gb += px[o + 2]; gn++; }
    }
    gr /= gn; gg /= gn; gb /= gn;
    var gLum = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb;

    /* local paper estimate per cell (kills vignettes & crease shadows) */
    var CELL = 26;
    var cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL);
    var paper = new Float32Array(cw * ch * 3);
    for (var cy = 0; cy < ch; cy++) {
      for (var cxi = 0; cxi < cw; cxi++) {
        var arr = [];
        for (var y = cy * CELL; y < Math.min((cy + 1) * CELL, h); y += 2) {
          for (var x = cxi * CELL; x < Math.min((cxi + 1) * CELL, w); x += 2) {
            arr.push((y * w + x) * 4);
          }
        }
        arr.sort(function (a, b) { return lumAt(b) - lumAt(a); });
        var take = Math.max(1, Math.floor(arr.length * 0.2));
        var pr = 0, pg = 0, pb = 0;
        for (var k = 0; k < take; k++) { pr += px[arr[k]]; pg += px[arr[k] + 1]; pb += px[arr[k] + 2]; }
        pr /= take; pg /= take; pb /= take;
        var pl = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
        /* only a cell fully covered by ink falls back to global paper;
           shaded-but-real paper (vignette, crease) keeps its local estimate */
        if (pl < gLum * 0.62) { pr = gr; pg = gg; pb = gb; }
        var ci = (cy * cw + cxi) * 3;
        paper[ci] = pr; paper[ci + 1] = pg; paper[ci + 2] = pb;
      }
    }

    /* collect stroke pixels, white-balanced against local paper */
    var pts = [];
    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        var o2 = (y2 * w + x2) * 4;
        var ci2 = ((y2 / CELL | 0) * cw + (x2 / CELL | 0)) * 3;
        var r = Math.min(1, px[o2] / paper[ci2]);
        var g = Math.min(1, px[o2 + 1] / paper[ci2 + 1]);
        var b = Math.min(1, px[o2 + 2] / paper[ci2 + 2]);
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        var sat = Math.max(r, g, b) - Math.min(r, g, b);
        var ink = 1 - lum;
        if (ink < 0.2 && sat < 0.17) continue;
        var wgt = Math.min(1, ink * 1.15 + sat * 1.6);
        if (wgt < 0.24) continue;
        pts.push([x2, y2, r, g, b, ink, sat, wgt]);
      }
    }
    if (pts.length < 400) return null;

    var scale = WORLD_H / h;
    var ox = w / 2, oy = h / 2;
    var tgt = new Float32Array(COUNT * 3);
    var col = new Float32Array(COUNT * 3);
    for (var k2 = 0; k2 < COUNT; k2++) {
      var p = pts[(Math.random() * pts.length) | 0];
      for (var tri = 0; tri < 3; tri++) {
        if (Math.random() < p[7]) break;
        p = pts[(Math.random() * pts.length) | 0];
      }
      tgt[k2 * 3] = (p[0] - ox + Math.random() - 0.5) * scale;
      tgt[k2 * 3 + 1] = -(p[1] - oy + Math.random() - 0.5) * scale;
      tgt[k2 * 3 + 2] = (Math.random() - 0.5) * 0.14;

      var R = p[2], Gc = p[3], B = p[4], ink2 = p[5], sat2 = p[6];
      var cr, cg, cb;
      if (sat2 < 0.14) {
        /* ink stroke → moonlit ivory; darker stroke = brighter particle */
        var v = Math.pow(Math.min(1, ink2 * 1.5), 1.1);
        cr = 0.16 + 0.80 * v; cg = 0.17 + 0.78 * v; cb = 0.19 + 0.72 * v;
      } else {
        /* pigment → keep hue, glow on dark ground */
        var mx = Math.max(R, Gc, B, 0.001);
        var lift = 0.55 + 0.45 * Math.min(1, ink2 * 0.8 + sat2 * 1.4);
        cr = R / mx * lift; cg = Gc / mx * lift; cb = B / mx * lift;
        /* seal red / warm pigments get a cinnabar nudge */
        if (cr > 0.7 && cg < cr * 0.72 && cb < cr * 0.72) { cr = Math.min(1, cr * 1.12); }
      }
      col[k2 * 3] = cr; col[k2 * 3 + 1] = cg; col[k2 * 3 + 2] = cb;
    }
    return { tgt: tgt, col: col, aspect: w / h };
  }

  /* ---------- load paintings ---------- */
  var plates = [];
  PAINTINGS.forEach(function (P, idx) {
    var im = new Image();
    im.onload = function () {
      var s = samplePainting(im);
      if (s) plates[idx] = s;
      if (idx === startIdx) { if (s) start(s); else host.classList.add('ink-static'); }
    };
    im.onerror = function () { if (idx === startIdx) host.classList.add('ink-static'); };
    im.src = P.src;
  });

  /* ---------- render loop ---------- */
  var cur = 0, started = false;
  var phase = 'form', phaseT = 0;
  /* debug/QA: ?inkPhase=hold|flow jumps straight to that state */
  var forced = (location.search.match(/inkPhase=(\w+)/) || [])[1];
  if (forced === 'hold') { phase = 'hold'; }
  if (forced === 'flow') { phase = 'flow'; }
  if (forced) host.classList.add('ink-debug');
  var startIdx = Math.min(PAINTINGS.length - 1, +((location.search.match(/inkPlate=(\d)/) || [])[1] || 0));
  cur = startIdx;
  var T = { form: 3.2, hold: 6.5, dissolve: 2.6, flow: 1.6 };
  var morph = 0;
  var mouse = { x: 0, y: 0, tx: 0, ty: 0, w: 0, tw: 0 };
  var last = 0, time = 0, viewAspect = 1;

  function upload(s) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufTarget);
    gl.bufferData(gl.ARRAY_BUFFER, s.tgt, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufColor);
    gl.bufferData(gl.ARRAY_BUFFER, s.col, gl.DYNAMIC_DRAW);
    fit();
  }
  function fit() {
    var s = plates[cur]; if (!s) return;
    var wide = viewAspect > 1.15;
    var worldW = WORLD_H * s.aspect;
    var offX = 0, offY = 0, maxW, maxH;
    if (wide) {
      /* editorial split: copy left, painting right of centre */
      offX = Math.min(0.62, viewAspect * 0.33);
      maxW = 2 * (viewAspect - offX) * 0.92;
      maxH = 2 * 0.82;
    } else {
      /* portrait: copy sits in the top third, painting sinks below it */
      offY = -0.34;
      maxW = 2 * viewAspect * 0.9;
      maxH = 1.15;
    }
    gl.uniform1f(loc.uScale, Math.min(1, maxW / worldW, maxH / WORLD_H));
    gl.uniform2f(loc.uOff, offX, offY);
  }
  function setCredit() {
    if (creditEl) creditEl.textContent = '粒子取自何江水墨原作 ' + PAINTINGS[cur].cn;
  }
  function resize() {
    var w = host.clientWidth, h = host.clientHeight;
    canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    viewAspect = w / h;
    gl.uniform2f(loc.uView, viewAspect, (isSmall ? 2.4 : 3.0) * DPR);
    fit();
  }

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05); last = now; time += dt;
    phaseT += dt;
    if (phase === 'form') { morph = Math.min(1, phaseT / T.form); if (phaseT >= T.form) { phase = 'hold'; phaseT = 0; } }
    else if (phase === 'hold') { morph = 1; if (!forced && phaseT >= T.hold) { phase = 'dissolve'; phaseT = 0; } }
    else if (phase === 'dissolve') { morph = Math.max(0, 1 - phaseT / T.dissolve); if (phaseT >= T.dissolve) { phase = 'flow'; phaseT = 0; } }
    else { morph = 0;
      if (phaseT >= T.flow) {
        var next = (cur + 1) % PAINTINGS.length;
        if (plates[next]) { cur = next; upload(plates[cur]); setCredit(); }
        phase = 'form'; phaseT = 0;
      }
    }
    var e = morph * morph * (3 - 2 * morph);

    mouse.x += (mouse.tx - mouse.x) * 0.07;
    mouse.y += (mouse.ty - mouse.y) * 0.07;
    mouse.w += (mouse.tw - mouse.w) * 0.05;

    gl.uniform1f(loc.uTime, time);
    gl.uniform1f(loc.uMorph, e);
    gl.uniform2f(loc.uMouse, mouse.x, mouse.y);
    gl.uniform1f(loc.uMouseW, mouse.w);
    gl.uniform1f(loc.uDrift, Math.sin(time * 0.07) * 0.10);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufTarget);
    gl.vertexAttribPointer(loc.aTarget, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufColor);
    gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufSeed);
    gl.vertexAttribPointer(loc.aSeed, 2, gl.FLOAT, false, 0, 0);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, COUNT);
    requestAnimationFrame(frame);
  }

  function start(s) {
    if (started) return; started = true;
    resize(); upload(s); setCredit();
    host.classList.add('ink-live');
    requestAnimationFrame(function (n) { last = n; requestAnimationFrame(frame); });
  }

  window.addEventListener('resize', resize);
  host.addEventListener('pointermove', function (ev) {
    var r = host.getBoundingClientRect();
    mouse.tx = ((ev.clientX - r.left) / r.width * 2 - 1) * (r.width / r.height);
    mouse.ty = -((ev.clientY - r.top) / r.height * 2 - 1);
    mouse.tw = 1;
  });
  host.addEventListener('pointerleave', function () { mouse.tw = 0; });
})();
