/* ============================================================
   BGFIBank RDC · HERO ORBITAL SYSTEM — v6
   ------------------------------------------------------------
   Transparent orbital rings around the BGFI mark. Small white
   BGFI stars travel each ring at their own velocity. Now and
   then a star leaves its orbit, draws a shooting-star trail,
   and joins another ring — arriving tangentially, never abruptly.

   Depth is honoured: stars on the far side of an orbit are
   painted on a canvas *behind* the mark, stars on the near side
   on a canvas *in front* of it.

   Vanilla JS · single rAF · pauses off-screen · respects
   prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';

  const root = document.getElementById('heroOrbit');
  if (!root) return;

  const backCanvas  = root.querySelector('.orbit-canvas--back');
  const frontCanvas = root.querySelector('.orbit-canvas--front');
  if (!backCanvas || !frontCanvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bctx = backCanvas.getContext('2d');
  const fctx = frontCanvas.getContext('2d');

  /* ----------------------------------------------------------
     Palette — BGFI identity. Stars stay white/ivory; the rings
     carry the sage + navy accents at very low opacity.
     ---------------------------------------------------------- */
  const COLOR = {
    starCore:  '255, 255, 255',
    starWarm:  '217, 228, 210',   /* sage glow */
    ringSage:  '157, 180, 154',
    ringLight: '194, 210, 188',
    ringBlue:  '110, 160, 214'
  };

  /* ----------------------------------------------------------
     Orbits — radii/tilt expressed as a fraction of the stage
     half-size so the whole system scales with the hero.
     `speed` is radians per second (sign = direction).
     ---------------------------------------------------------- */
  const ORBITS = [
    { rx: .62, ry: .26, tilt: -14, speed:  .170, n: 3, w: 1.15, a: .58, hue: 'light' },
    { rx: .76, ry: .38, tilt:  10, speed: -.120, n: 3, w: 1.05, a: .48, hue: 'sage'  },
    { rx: .88, ry: .52, tilt: -30, speed:  .082, n: 4, w:  .95, a: .40, hue: 'sage'  },
    { rx: .70, ry: .66, tilt:  62, speed:  .058, n: 2, w:  .85, a: .30, hue: 'blue'  },
    { rx: .93, ry: .20, tilt:   5, speed: -.140, n: 2, w:  .90, a: .36, hue: 'light' }
  ];

  const TRANSFER = {
    minDelay: 4.2,     /* s — shortest gap between transfers */
    maxDelay: 8.6,
    minDur:   1.5,     /* s — flight time */
    maxDur:   2.4,
    trailAge: 0.40,    /* s — tail is trimmed by AGE, not by frame count, so
                          it looks identical on 60 Hz and 120 Hz displays */
    trailMax: 90       /* hard cap on samples (high-refresh safety) */
  };

  let dpr = 1, size = 0, half = 0;
  let stars = [], nextTransferIn = 3.2, running = false, rafId = 0, lastTs = 0;
  let inView = true;

  /* ==========================================================
     Geometry helpers
     ========================================================== */

  /* Point on a tilted ellipse. Returns position plus a depth
     value z ∈ [-1, 1] (−1 = far side, +1 = near side) and the
     unit tangent, used to leave/join orbits smoothly. */
  function orbitPoint(o, angle) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const lx = o.rx * half * ca;
    const ly = o.ry * half * sa;
    const ct = Math.cos(o.rad), st = Math.sin(o.rad);
    return {
      x: lx * ct - ly * st,
      y: lx * st + ly * ct,
      z: sa,
      /* d/dangle of the above, normalised later */
      tx: (-o.rx * half * sa) * ct - (o.ry * half * ca) * st,
      ty: (-o.rx * half * sa) * st + (o.ry * half * ca) * ct
    };
  }

  /* Cubic Hermite — gives a flight path that leaves the old
     orbit along its tangent and lands on the new one along
     that orbit's tangent. This is what makes the transfer read
     as elegant rather than as a straight sci-fi dash. */
  function hermite(p0, v0, p1, v1, t) {
    const t2 = t * t, t3 = t2 * t;
    const h00 =  2 * t3 - 3 * t2 + 1;
    const h10 =      t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 =      t3 -     t2;
    return {
      x: h00 * p0.x + h10 * v0.x + h01 * p1.x + h11 * v1.x,
      y: h00 * p0.y + h10 * v0.y + h01 * p1.y + h11 * v1.y
    };
  }

  const easeInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ==========================================================
     The BGFI mark, drawn as a path: eight points, long cardinal
     spikes, shorter diagonals, deep narrow valleys.
     ========================================================== */
  function starPath(ctx, x, y, r, rot) {
    const CARD = 1;        /* cardinal spike length      */
    const DIAG = .58;      /* diagonal spike length      */
    const VALL = .135;     /* valley radius (deep+narrow)*/
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const tipA = rot + i * Math.PI / 4;
      const tipR = r * (i % 2 === 0 ? CARD : DIAG);
      const vA   = tipA + Math.PI / 8;
      const vR   = r * VALL;
      if (i === 0) ctx.moveTo(x + Math.cos(tipA) * tipR, y + Math.sin(tipA) * tipR);
      else         ctx.lineTo(x + Math.cos(tipA) * tipR, y + Math.sin(tipA) * tipR);
      ctx.lineTo(x + Math.cos(vA) * vR, y + Math.sin(vA) * vR);
    }
    ctx.closePath();
  }

  /* ==========================================================
     Sizing
     ========================================================== */
  function resize() {
    const rect = root.getBoundingClientRect();
    size = Math.max(1, Math.round(rect.width));
    half = size / 2;
    dpr  = Math.min(window.devicePixelRatio || 1, 2);

    [backCanvas, frontCanvas].forEach((c) => {
      c.width  = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
      c.style.width  = size + 'px';
      c.style.height = size + 'px';
    });

    ORBITS.forEach((o) => { o.rad = o.tilt * Math.PI / 180; });
  }

  /* ==========================================================
     Population
     ========================================================== */
  function build() {
    const compact = window.innerWidth < 900;
    stars = [];
    ORBITS.forEach((o, oi) => {
      const n = compact ? Math.max(1, o.n - 1) : o.n;
      for (let i = 0; i < n; i++) {
        stars.push({
          orbit: oi,
          angle: (i / n) * Math.PI * 2 + Math.random() * .7,
          /* per-star velocity jitter so no two ever look paired */
          rate: o.speed * (0.82 + Math.random() * 0.36),
          rSeed: 0.85 + Math.random() * 0.42,
          spin: Math.random() * Math.PI * 2,
          spinRate: (Math.random() < .5 ? -1 : 1) * (0.10 + Math.random() * 0.22),
          twk: Math.random() * Math.PI * 2,
          transit: null,
          trail: []
        });
      }
    });
  }

  /* ==========================================================
     Transfers — one star at a time leaves its ring
     ========================================================== */
  function startTransfer() {
    const free = stars.filter((s) => !s.transit);
    if (free.length < 1 || ORBITS.length < 2) return;

    const s = free[(Math.random() * free.length) | 0];
    let to = (Math.random() * ORBITS.length) | 0;
    if (to === s.orbit) to = (to + 1 + ((Math.random() * (ORBITS.length - 1)) | 0)) % ORBITS.length;

    const from = ORBITS[s.orbit];
    const dest = ORBITS[to];
    const dur  = TRANSFER.minDur + Math.random() * (TRANSFER.maxDur - TRANSFER.minDur);

    /* Aim for a spot on the destination ring that is roughly
       opposite, so the arc sweeps visibly across the mark. */
    const destAngle = s.angle + Math.PI * (0.65 + Math.random() * 0.7);
    /* ...and pre-advance it by the flight time so the star lands
       exactly where its new phase should already be. */
    const destRate  = dest.speed * (0.82 + Math.random() * 0.36);
    const arriveAngle = destAngle + destRate * dur;

    const p0 = orbitPoint(from, s.angle);
    const p1 = orbitPoint(dest, arriveAngle);

    /* Tangents scaled by flight time → C1-continuous handoff */
    const v0 = { x: p0.tx * s.rate  * dur, y: p0.ty * s.rate  * dur };
    const v1 = { x: p1.tx * destRate * dur, y: p1.ty * destRate * dur };

    s.transit = {
      t: 0, dur, to, destRate, arriveAngle,
      p0, p1, v0, v1,
      z0: p0.z, z1: p1.z
    };
    s.trail.length = 0;
  }

  /* ==========================================================
     Painting
     ========================================================== */
  function ringGradient(ctx, o) {
    const rx = o.rx * half, ry = o.ry * half;
    const ct = Math.cos(o.rad), st = Math.sin(o.rad);
    const g = ctx.createLinearGradient(-rx * ct, -rx * st, rx * ct, rx * st);
    const c = o.hue === 'blue' ? COLOR.ringBlue : o.hue === 'light' ? COLOR.ringLight : COLOR.ringSage;
    g.addColorStop(0,    `rgba(${c}, 0)`);
    g.addColorStop(.22,  `rgba(${c}, ${(o.a * .55).toFixed(3)})`);
    g.addColorStop(.5,   `rgba(${c}, ${o.a.toFixed(3)})`);
    g.addColorStop(.78,  `rgba(${c}, ${(o.a * .55).toFixed(3)})`);
    g.addColorStop(1,    `rgba(${c}, 0)`);
    void ry;
    return g;
  }

  /* Ring drawn in two halves: far arc behind the mark, near arc
     in front of it — so the orbits genuinely wrap the logo. */
  function drawRings() {
    ORBITS.forEach((o) => {
      const rx = o.rx * half, ry = o.ry * half;
      [[bctx, Math.PI, Math.PI * 2, .78], [fctx, 0, Math.PI, 1]].forEach(([ctx, a0, a1, mul]) => {
        ctx.save();
        ctx.translate(half, half);
        ctx.strokeStyle = ringGradient(ctx, o);
        ctx.lineWidth = o.w;
        ctx.globalAlpha = mul;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, o.rad, a0, a1);
        ctx.stroke();
        ctx.restore();
      });
    });
  }

  /* Comet tail: a tapered ribbon that fades from the head backwards.
     `fade` lets the tail dissolve gracefully after the star has already
     rejoined its new ring, instead of being cut off. */
  function drawTrail(ctx, s, depthAlpha, fade) {
    const pts = s.trail;
    if (pts.length < 3) return;
    const scale = size / 520;
    const k0 = depthAlpha * (fade === undefined ? 1 : fade);
    if (k0 <= .01) return;

    ctx.save();
    ctx.translate(half, half);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* Two passes: a wide soft glow, then a tight bright core.
       Cheap, and it reads exactly like a shooting star. */
    const passes = [
      { wMul: 3.6, aMul: .30, col: COLOR.starWarm },
      { wMul: 1.0, aMul: .95, col: COLOR.starCore }
    ];

    for (let p = 0; p < passes.length; p++) {
      const ps = passes[p];
      for (let i = 1; i < pts.length; i++) {
        const k = i / (pts.length - 1);            /* 0 = tail tip → 1 = head */
        const a = Math.pow(k, 1.7) * ps.aMul * k0;
        if (a < .006) continue;
        ctx.strokeStyle = `rgba(${ps.col}, ${a.toFixed(3)})`;
        ctx.lineWidth = Math.max(.35, k * 2.6 * scale * ps.wMul);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStar(ctx, s, pos, z, t, flight) {
    /* Perspective: nearer = larger + brighter.
       `flight` (0→1→0) flares the head during a transfer. */
    const fl    = flight || 0;
    const depth = (z + 1) / 2;                            /* 0 far → 1 near */
    const base  = size * 0.026 * s.rSeed;                 /* readable mark, not a dot */
    const r     = base * (0.80 + depth * 0.38) * (1 + fl * 0.34);
    const twk   = 0.86 + 0.14 * Math.sin(t * 1.6 + s.twk);
    const alpha = Math.min(1, (0.52 + depth * 0.46) * twk + fl * 0.35);

    ctx.save();
    ctx.translate(half, half);

    /* Tight halo only — the mark must stay the hero, not the glow */
    const gr = r * 1.9;
    const g = ctx.createRadialGradient(pos.x, pos.y, r * .35, pos.x, pos.y, gr);
    g.addColorStop(0,   `rgba(${COLOR.starWarm}, ${(alpha * .20).toFixed(3)})`);
    g.addColorStop(.55, `rgba(${COLOR.starWarm}, ${(alpha * .07).toFixed(3)})`);
    g.addColorStop(1,   `rgba(${COLOR.starWarm}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, gr, 0, Math.PI * 2);
    ctx.fill();

    /* The BGFI mark — crisp white, faint sage rim light */
    ctx.shadowColor = `rgba(${COLOR.starWarm}, ${(alpha * .55).toFixed(3)})`;
    ctx.shadowBlur = r * .9;
    ctx.fillStyle = `rgba(${COLOR.starCore}, ${alpha.toFixed(3)})`;
    starPath(ctx, pos.x, pos.y, r, s.spin);
    ctx.fill();
    ctx.restore();
  }

  /* ==========================================================
     Frame
     ========================================================== */
  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const now = ts * 0.001;
    let dt = lastTs ? now - lastTs : 0.016;
    lastTs = now;
    if (dt > 0.1) dt = 0.1;                  /* tab-switch guard */

    bctx.clearRect(0, 0, backCanvas.width, backCanvas.height);
    fctx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawRings();

    /* schedule the next departure */
    nextTransferIn -= dt;
    if (nextTransferIn <= 0) {
      startTransfer();
      nextTransferIn = TRANSFER.minDelay + Math.random() * (TRANSFER.maxDelay - TRANSFER.minDelay);
    }

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.spin += s.spinRate * dt;

      let pos, z, flight = 0;

      if (s.transit) {
        const tr = s.transit;
        tr.t += dt / tr.dur;

        if (tr.t >= 1) {
          /* joined the new orbit */
          s.orbit = tr.to;
          s.angle = tr.arriveAngle;
          s.rate  = tr.destRate;
          s.transit = null;
          s.fade  = 1;                     /* begin dissolving the tail */
          const p = orbitPoint(ORBITS[s.orbit], s.angle);
          pos = p; z = p.z;
        } else {
          const e = easeInOut(Math.min(1, tr.t));
          pos = hermite(tr.p0, tr.v0, tr.p1, tr.v1, e);
          z   = tr.z0 + (tr.z1 - tr.z0) * e;
          /* the head flares as it departs and settles as it arrives */
          flight = Math.sin(Math.min(1, tr.t) * Math.PI);
          s.trail.push({ x: pos.x, y: pos.y, t: now });
          /* trim by age → refresh-rate independent tail length */
          while (s.trail.length > 2 && now - s.trail[0].t > TRANSFER.trailAge) s.trail.shift();
          if (s.trail.length > TRANSFER.trailMax) s.trail.shift();
        }
      } else {
        s.angle += s.rate * dt;
        const p = orbitPoint(ORBITS[s.orbit], s.angle);
        pos = p; z = p.z;
        /* dissolve any leftover tail instead of snapping it off */
        if (s.trail.length) {
          s.fade = Math.max(0, (s.fade === undefined ? 1 : s.fade) - dt * 2.2);
          if (s.fade <= 0.01) s.trail.length = 0;
          else if (s.trail.length > 2) s.trail.shift();
        }
      }

      const ctx = z < 0 ? bctx : fctx;
      const depthAlpha = z < 0 ? .7 : 1;
      if (s.trail.length) drawTrail(ctx, s, depthAlpha, s.transit ? 1 : s.fade);
      drawStar(ctx, s, pos, z, now, flight);
    }
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ==========================================================
     Static fallback for prefers-reduced-motion:
     one calm painted frame, no animation loop.
     ========================================================== */
  function paintStill() {
    bctx.clearRect(0, 0, backCanvas.width, backCanvas.height);
    fctx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRings();
    stars.forEach((s) => {
      const p = orbitPoint(ORBITS[s.orbit], s.angle);
      drawStar(p.z < 0 ? bctx : fctx, s, p, p.z, 0);
    });
  }

  /* ==========================================================
     Parallax — pointer (desktop) + scroll. Very restrained:
     this is a bank, not a parallax demo.
     ========================================================== */
  function bindParallax() {
    if (reduceMotion) return;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let px = 0, py = 0, tx = 0, ty = 0, ticking = false;

    if (finePointer) {
      window.addEventListener('pointermove', (e) => {
        const nx = (e.clientX / window.innerWidth  - .5) * 2;
        const ny = (e.clientY / window.innerHeight - .5) * 2;
        tx = nx * 14;
        ty = ny * 10;
        if (!ticking) { ticking = true; requestAnimationFrame(glide); }
      }, { passive: true });
    }

    function glide() {
      px += (tx - px) * .06;
      py += (ty - py) * .06;
      root.style.setProperty('--ox', px.toFixed(2) + 'px');
      root.style.setProperty('--oy', py.toFixed(2) + 'px');
      if (Math.abs(tx - px) > .1 || Math.abs(ty - py) > .1) requestAnimationFrame(glide);
      else ticking = false;
    }

    let sTicking = false;
    window.addEventListener('scroll', () => {
      if (sTicking) return;
      sTicking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < window.innerHeight * 1.4) {
          root.style.setProperty('--sy', (y * 0.14).toFixed(1) + 'px');
        }
        sTicking = false;
      });
    }, { passive: true });
  }

  /* ==========================================================
     Lifecycle
     ========================================================== */
  function init() {
    resize();
    build();

    if (reduceMotion) { paintStill(); return; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          inView = e.isIntersecting;
          if (inView && !document.hidden) start(); else stop();
        });
      }, { rootMargin: '80px' }).observe(root);
    } else {
      start();
    }
    start();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (inView) start();
    });

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const wasCompact = stars.length;
        resize();
        build();
        void wasCompact;
      }, 180);
    }, { passive: true });

    bindParallax();
  }

  /* Wait for the mark bitmap so the medallion and its orbits
     fade in together rather than popping in sequence. */
  const mark = root.querySelector('.orbit-logo');
  if (mark && !mark.complete) {
    mark.addEventListener('load', init, { once: true });
    mark.addEventListener('error', init, { once: true });
  } else {
    init();
  }
})();
