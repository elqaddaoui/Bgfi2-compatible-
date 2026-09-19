/* ============================================================
   BGFIBank — Actus Newsletter · S1 2026
   finale.js — animated BGFI star-particle field for the closing
   section: slow orbital drift around a central attractor,
   parallax depth layers, twinkle, and pointer micro-interaction.

   Palette is restricted to the BGFI identity: white, sage green
   (#9db49a / #c2d2bc / #d9e4d2) and blue highlights (#1a4b8f).
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var section = document.querySelector('.finale');
  if (!section) return;

  var canvas = section.querySelector('.finale-canvas');

  /* ----------------------------------------------------------
     Reveal observer — drives every CSS entrance animation
     ---------------------------------------------------------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          section.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.22, rootMargin: '0px 0px -8% 0px' });
    io.observe(section);
  } else {
    section.classList.add('is-visible');
  }

  if (reduce || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var stars = [];
  var raf = null, running = false, lastTs = 0, tGlobal = 0;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };

  /* ----------------------------------------------------------
     8-point BGFI star path (identical geometry to the hero)
     ---------------------------------------------------------- */
  var CARD = 1, DIAG = 0.58, VALL = 0.135;

  function starPath(c, x, y, r, rot) {
    c.beginPath();
    for (var i = 0; i < 8; i++) {
      var tipA = rot + i * Math.PI / 4;
      var tipR = r * (i % 2 === 0 ? CARD : DIAG);
      var vA = tipA + Math.PI / 8;
      var vR = r * VALL;
      if (i === 0) c.moveTo(x + Math.cos(tipA) * tipR, y + Math.sin(tipA) * tipR);
      else c.lineTo(x + Math.cos(tipA) * tipR, y + Math.sin(tipA) * tipR);
      c.lineTo(x + Math.cos(vA) * vR, y + Math.sin(vA) * vR);
    }
    c.closePath();
  }

  /* ----------------------------------------------------------
     Palette — BGFI identity only
     ---------------------------------------------------------- */
  var TINTS = [
    { r: 255, g: 255, b: 253 },   /* ivory white  */
    { r: 217, g: 228, b: 210 },   /* pale sage    */
    { r: 194, g: 210, b: 188 },   /* sage light   */
    { r: 157, g: 180, b: 154 },   /* sage         */
    { r: 138, g: 174, b: 226 }    /* soft BGFI blue highlight */
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ----------------------------------------------------------
     Star model
     Each star orbits the section centre on its own ellipse at
     its own angular speed, so the whole field reads as a slow,
     coherent celestial rotation rather than random noise.
     ---------------------------------------------------------- */
  function makeStar() {
    /* depth 0 = far (small, dim, slow parallax) → 1 = near */
    var depth = Math.pow(Math.random(), 1.5);
    var tint = TINTS[Math.floor(Math.random() * TINTS.length)];
    /* keep the vivid blue rare so the palette stays disciplined */
    if (tint === TINTS[4] && Math.random() > 0.35) tint = TINTS[2];

    return {
      depth: depth,
      /* orbital parameters (normalised to the shorter side) */
      a: rand(0.10, 0.78),                 /* semi-major   */
      ecc: rand(0.62, 1.0),                /* squash ratio */
      ang: rand(0, Math.PI * 2),
      spd: rand(0.008, 0.032) * (Math.random() < 0.28 ? -1 : 1),
      tilt: rand(-0.42, 0.42),
      /* drift so orbits are not perfect circles */
      wobA: rand(0.006, 0.03),
      wobS: rand(0.15, 0.55),
      wobP: rand(0, Math.PI * 2),
      /* look */
      r: (0.8 + depth * 2.9) * rand(0.75, 1.35),
      spin: rand(0, Math.PI * 2),
      spinSpd: rand(-0.22, 0.22),
      tint: tint,
      base: 0.14 + depth * 0.62,
      twS: rand(0.5, 1.7),
      twP: rand(0, Math.PI * 2),
      glow: depth > 0.72 && Math.random() < 0.55
    };
  }

  function build() {
    var area = W * H / (dpr * dpr);
    var count = Math.round(Math.min(190, Math.max(52, area / 8200)));
    stars = [];
    for (var i = 0; i < count; i++) stars.push(makeStar());
  }

  function resize() {
    var rect = section.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = w * dpr;
    H = h * dpr;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    build();
  }

  /* ----------------------------------------------------------
     Draw
     ---------------------------------------------------------- */
  function draw(dt) {
    tGlobal += dt;
    ctx.clearRect(0, 0, W, H);

    var cx = W * 0.5;
    var cy = H * 0.47;
    var unit = Math.min(W, H) * 0.62;

    /* eased pointer follow → gentle parallax of the whole field */
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.2);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3.2);

    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];

      s.ang += s.spd * dt;
      s.spin += s.spinSpd * dt;

      var wob = Math.sin(tGlobal * s.wobS + s.wobP) * s.wobA;
      var a = (s.a + wob) * unit;
      var b = a * s.ecc;

      var ox = Math.cos(s.ang) * a;
      var oy = Math.sin(s.ang) * b;

      /* rotate the orbit by its tilt */
      var ct = Math.cos(s.tilt), st = Math.sin(s.tilt);
      var px = cx + ox * ct - oy * st;
      var py = cy + ox * st + oy * ct;

      /* parallax: nearer stars react more to the pointer */
      var par = 6 + s.depth * 26;
      px += pointer.x * par * dpr;
      py += pointer.y * par * dpr;

      /* fade out beyond the frame instead of hard-clipping */
      var margin = 40 * dpr;
      if (px < -margin || px > W + margin || py < -margin || py > H + margin) continue;

      var twinkle = 0.62 + 0.38 * Math.sin(tGlobal * s.twS + s.twP);
      var alpha = s.base * twinkle;
      /* soften stars sitting behind the headline block */
      var dcx = (px - cx) / (W * 0.5);
      var dcy = (py - cy) / (H * 0.5);
      var core = Math.sqrt(dcx * dcx + dcy * dcy);
      if (core < 0.44) alpha *= 0.24 + core * 1.7;

      if (alpha <= 0.004) continue;

      var r = s.r * dpr;
      var t = s.tint;
      var rgb = t.r + ',' + t.g + ',' + t.b;

      if (s.glow) {
        var g = ctx.createRadialGradient(px, py, 0, px, py, r * 6.5);
        g.addColorStop(0, 'rgba(' + rgb + ',' + (alpha * 0.5).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r * 6.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')';
      starPath(ctx, px, py, r, s.spin);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    var now = ts * 0.001;
    var dt = lastTs ? now - lastTs : 0.016;
    lastTs = now;
    if (dt > 0.1) dt = 0.1;               /* tab-switch guard */
    draw(dt);
  }

  function start() {
    if (running) return;
    running = true;
    lastTs = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  /* ----------------------------------------------------------
     Wiring
     ---------------------------------------------------------- */
  resize();

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 180);
  }, { passive: true });

  /* only animate while the section is on screen */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.isIntersecting ? start() : stop(); });
    }, { threshold: 0.02 }).observe(section);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', function () {
    document.hidden ? stop() : (isOnScreen() && start());
  });

  function isOnScreen() {
    var r = section.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  /* pointer micro-interaction (desktop only) */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    section.addEventListener('mousemove', function (e) {
      var r = section.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      pointer.active = true;
    }, { passive: true });

    section.addEventListener('mouseleave', function () {
      pointer.tx = 0;
      pointer.ty = 0;
      pointer.active = false;
    }, { passive: true });
  }
})();
