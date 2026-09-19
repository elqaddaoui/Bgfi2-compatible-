/* ============================================================
   BGFIBank RDC · Actus Newsletter · S1 · 2026
   LUXURY DIGITAL MAGAZINE — Premium interactions
   ============================================================ */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ============================================================
  //  Ambient particle canvas — floating sage-green stars (BGFI identity)
  // ============================================================
  (function particleField() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas || reduceMotion) return;

    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];

    function resize() {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      const count = window.innerWidth < 640 ? 22 : 48;
      particles = new Array(count).fill(0).map(makeParticle);
    }

    function makeParticle() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        size: (0.6 + Math.random() * 2.2) * dpr,
        vx: (Math.random() - 0.5) * 0.15 * dpr,
        vy: (-0.05 - Math.random() * 0.2) * dpr,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.8,
        opacity: 0.15 + Math.random() * 0.55
      };
    }

    // Draw an 8-point star at (cx, cy)
    function drawStar(x, y, s) {
      ctx.beginPath();
      const outer = s;
      const inner = s * 0.4;
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    function tick(now) {
      ctx.clearRect(0, 0, w, h);
      const t = now * 0.001;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        const twinkle = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase);
        const alpha = p.opacity * twinkle;
        ctx.fillStyle = `rgba(157, 180, 154, ${alpha.toFixed(3)})`;
        ctx.shadowColor = `rgba(217, 228, 210, ${(alpha * 0.6).toFixed(3)})`;
        ctx.shadowBlur = 6 * dpr;
        drawStar(p.x, p.y, p.size);
      }
      requestAnimationFrame(tick);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();
    requestAnimationFrame(tick);
  })();

  // ============================================================
  //  Hero: procedurally add glimmering stars
  // ============================================================
  (function heroStars() {
    const box = document.getElementById('heroStars');
    if (!box) return;

    const isMobile = window.innerWidth < 820;
    const n = isMobile ? 26 : 56;

    // Anchor of the main glowing star (matches the video framing target).
    // Density is boosted around this anchor and faded away from the text zone.
    const anchor = isMobile
      ? { x: 50, y: 21 }   // 9:16 — star centered near top
      : { x: 70, y: 34 };  // 16:9 — star upper-right

    // Text-safe zone (where density MUST fade toward zero)
    const safe = isMobile
      ? { x1: 6, y1: 55, x2: 94, y2: 96 }   // headline sits in the lower half
      : { x1: 3, y1: 28, x2: 55, y2: 92 };  // headline sits on the left

    function inSafe(px, py) {
      return px >= safe.x1 && px <= safe.x2 && py >= safe.y1 && py <= safe.y2;
    }

    let placed = 0, tries = 0;
    while (placed < n && tries < n * 40) {
      tries++;
      const px = Math.random() * 100;
      const py = Math.random() * 100;

      // 1) Hard-fade inside the safe zone (keep only faint distant stars)
      if (inSafe(px, py) && Math.random() > 0.08) continue;

      // 2) Weighted density around the star anchor — bias placement toward it
      const dx = (px - anchor.x) / 42;
      const dy = (py - anchor.y) / 42;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const attract = Math.exp(-d * d);          // 1 near star → 0 far away
      const keep = 0.28 + attract * 0.72;         // 28% baseline
      if (Math.random() > keep) continue;

      const s = document.createElement('span');
      s.className = 'hero-star';
      const size = 3 + Math.random() * (attract > 0.35 ? 11 : 6);
      s.style.width  = size + 'px';
      s.style.height = size + 'px';
      s.style.left = px + '%';
      s.style.top  = py + '%';
      s.style.animationDelay    = (-Math.random() * 6) + 's';
      s.style.animationDuration = (5 + Math.random() * 6) + 's';
      s.style.opacity = ''; // driven by twinkle animation
      // Fainter far from the anchor
      s.style.setProperty('--star-peak', (0.35 + attract * 0.55).toFixed(2));
      box.appendChild(s);
      placed++;
    }

    // Regenerate on breakpoint change to keep alignment tight
    let lastMobile = isMobile;
    window.addEventListener('resize', () => {
      const nowMobile = window.innerWidth < 820;
      if (nowMobile !== lastMobile) {
        lastMobile = nowMobile;
        box.innerHTML = '';
        heroStarsRebuild();
      }
    }, { passive: true });
    function heroStarsRebuild() { /* re-run */ setTimeout(() => location.reload(), 60); }

    // Mark hero as loaded for title animations
    const hero = document.querySelector('.hero');
    if (hero) requestAnimationFrame(() => hero.classList.add('loaded'));
  })();

  // ============================================================
  //  Reading progress + header state + back-to-top
  // ============================================================
  const progressBar = document.querySelector('#readingProgress span');
  const header = document.getElementById('siteHeader');
  const backTop = document.getElementById('backToTop');

  function onScroll() {
    const st = window.scrollY;
    const dh = document.documentElement.scrollHeight - window.innerHeight;
    const p = Math.min(100, (st / Math.max(1, dh)) * 100);
    if (progressBar) progressBar.style.width = p + '%';
    if (header) header.classList.toggle('scrolled', st > 40);
    if (backTop) backTop.classList.toggle('visible', st > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (backTop) {
    backTop.addEventListener('click', () =>
      window.scrollTo({ top: 0, behavior: 'smooth' })
    );

    const protectedSections = document.querySelectorAll('.testimonials-section, .family-section, .finale, .site-footer');
    const visibleProtected = new Set();
    const backTopIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.isIntersecting ? visibleProtected.add(entry.target) : visibleProtected.delete(entry.target);
      });
      backTop.classList.toggle('is-over-content', visibleProtected.size > 0);
    }, { threshold: 0.04 });
    protectedSections.forEach((section) => backTopIO.observe(section));
  }

  // ============================================================
  //  Reveal-on-scroll (up / left / right)
  // ============================================================
  const revealNodes = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right, .reveal');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  );
  revealNodes.forEach((r) => io.observe(r));

  // ============================================================
  //  Number counters (indicator-value + family-value)
  // ============================================================
  const counters = document.querySelectorAll('[data-target]');
  const cio = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseFloat(el.dataset.target);
        const suffix = el.dataset.suffix || '';
        const dec = (String(el.dataset.target).split('.')[1] || '').length;
        const dur = 1800;
        const start = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          const v = (target * eased).toFixed(dec);
          el.textContent = v.replace('.', ',') + suffix;
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        cio.unobserve(el);
      });
    },
    { threshold: 0.4 }
  );
  counters.forEach((c) => cio.observe(c));

  // ============================================================
  //  Indicator bars — grow when card enters view
  // ============================================================
  const bars = document.querySelectorAll('.indicator-bar span');
  const bio = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const s = e.target;
          const w = s.style.getPropertyValue('--w') || '100%';
          // trigger reflow
          s.style.width = '0';
          requestAnimationFrame(() => { s.style.width = w; });
          bio.unobserve(s);
        }
      });
    },
    { threshold: 0.4 }
  );
  bars.forEach((b) => bio.observe(b));

  // ============================================================
  //  Smooth anchor navigation
  // ============================================================
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const t = document.querySelector(id);
      if (t) {
        ev.preventDefault();
        // Clear the fixed masthead: read its live height so the compact
        // state (and the mobile breakpoint) are both handled correctly.
        const hdr = document.getElementById('siteHeader');
        const navH = hdr ? hdr.getBoundingClientRect().height : 76;
        const offset = navH + 14;
        const y = t.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });

  // ============================================================
  //  Hero parallax (background stars)
  // ============================================================
  (function heroParallax() {
    if (reduceMotion) return;
    const heroStars = document.getElementById('heroStars');
    const heroCurves = document.querySelector('.hero-curves');
    if (!heroStars) return;
    let ticking = false;
    function tick() {
      const y = window.scrollY;
      if (y < window.innerHeight * 1.2) {
        heroStars.style.transform = `translateY(${y * 0.35}px)`;
        if (heroCurves) heroCurves.style.transform = `translateY(${y * 0.15}px)`;
      }
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(tick); ticking = true; }
    }, { passive: true });
  })();

  // ============================================================
  //  Édito module (portrait parallax + curves reveal)
  // ============================================================
  (function editoModule() {
    const section = document.getElementById('edito');
    if (!section) return;

    section.querySelectorAll('[data-reveal-delay]').forEach((el) => {
      const d = parseInt(el.dataset.revealDelay || '0', 10);
      el.style.setProperty('--rd', d + 'ms');
    });

    const sectionIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            section.classList.add('is-visible');
            sectionIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    sectionIO.observe(section);

    if (reduceMotion) return;

    const stars = Array.from(section.querySelectorAll('.float-star[data-depth]'));
    const portraitImg = section.querySelector('.pc-img');

    let ticking = false;
    let active = false;

    const paraIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          active = e.isIntersecting;
          if (active) requestParallax();
        });
      },
      { rootMargin: '120px 0px' }
    );
    paraIO.observe(section);

    function applyParallax() {
      ticking = false;
      if (!active) return;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = Math.max(-1, Math.min(1, (vh / 2 - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2)));

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const depth = parseFloat(s.dataset.depth) || 0.15;
        s.style.setProperty('--py', (progress * depth * 120).toFixed(2) + 'px');
      }
      if (portraitImg) {
        portraitImg.style.setProperty('--pImgY', (progress * -14).toFixed(2) + 'px');
      }
    }

    function requestParallax() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(applyParallax);
    }

    window.addEventListener('scroll', requestParallax, { passive: true });
    window.addEventListener('resize', requestParallax, { passive: true });
    applyParallax();
  })();

  // ============================================================
  //  Chapter opener parallax (image slow scale on scroll)
  // ============================================================
  (function chapterMediaParallax() {
    if (reduceMotion) return;
    const medias = document.querySelectorAll('.chapter-media img, .kbm-banner-img');
    if (!medias.length) return;
    let ticking = false;
    function tick() {
      const vh = window.innerHeight;
      medias.forEach((img) => {
        const rect = img.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;
        const p = (rect.top + rect.height / 2 - vh / 2) / vh;
        img.style.transform = `scale(1.08) translateY(${(p * -20).toFixed(2)}px)`;
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(tick); ticking = true; }
    }, { passive: true });
    tick();
  })();

  // ============================================================
  //  Values testimonials — accessible slider
  // ============================================================
  (function testimonialSlider() {
    const root = document.querySelector('[data-testimonial-slider]');
    if (!root) return;

    const slides = Array.from(root.querySelectorAll('[data-slide]'));
    const dots = Array.from(root.querySelectorAll('[data-testimonial-dot]'));
    const prev = root.querySelector('[data-testimonial-prev]');
    const next = root.querySelector('[data-testimonial-next]');
    let index = 0;
    let timer = null;
    let paused = false;

    function show(nextIndex, focusDot) {
      index = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
        if ('inert' in slide) slide.inert = !active;
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', String(i === index));
        dot.setAttribute('tabindex', i === index ? '0' : '-1');
      });
      if (focusDot && dots[index]) dots[index].focus();
    }

    function restart() {
      if (timer) window.clearInterval(timer);
      timer = null;
      if (!reduceMotion && !paused && !document.hidden) {
        timer = window.setInterval(() => show(index + 1, false), 7000);
      }
    }

    prev?.addEventListener('click', () => { show(index - 1, false); restart(); });
    next?.addEventListener('click', () => { show(index + 1, false); restart(); });
    dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i, true); restart(); }));
    root.addEventListener('mouseenter', () => { paused = true; restart(); });
    root.addEventListener('mouseleave', () => { paused = false; restart(); });
    root.addEventListener('focusin', () => { paused = true; restart(); });
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) { paused = false; restart(); }
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1), true);
      restart();
    });
    document.addEventListener('visibilitychange', restart);
    show(0, false);
    restart();
  })();

  // ============================================================
  //  Subtle magnetic hover on premium CTAs
  // ============================================================
  (function magnetic() {
    if (reduceMotion) return;
    const els = document.querySelectorAll('.hero-cta');
    els.forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.12;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.12;
        el.style.transform = `translate(${dx}px, ${dy - 3}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  })();

})();
