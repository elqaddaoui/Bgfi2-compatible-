/* ============================================================
   BGFIBank RDC · S1 2026
   chapter-slider.js — editorial 3-image slider used by every
   .chapter-opener section.

   · Auto-advances with a progress-filled dot indicator
   · Pauses on hover / focus, when the tab is hidden, and when
     the slider scrolls out of view (saves work + battery)
   · Full keyboard support (← / →), pointer swipe on touch
   · Honours prefers-reduced-motion (no autoplay, instant fades)
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var sliders = document.querySelectorAll('[data-chapter-slider]');
  if (!sliders.length) return;

  Array.prototype.forEach.call(sliders, function (root) {
    var slides = root.querySelectorAll('[data-chapter-slide]');
    if (slides.length < 2) return;

    var dots    = root.querySelectorAll('.chapter-dot');
    var counter = root.querySelector('[data-chapter-current]');
    var prevBtn = root.querySelector('[data-chapter-prev]');
    var nextBtn = root.querySelector('[data-chapter-next]');

    var interval = parseInt(root.getAttribute('data-interval'), 10) || 5500;
    root.style.setProperty('--chapter-duration', (interval / 1000) + 's');

    var index   = 0;
    var timer   = null;
    var hovered = false;
    var visible = true;

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function show(next, restart) {
      next = (next + slides.length) % slides.length;
      if (next === index && restart !== true) return;
      index = next;

      Array.prototype.forEach.call(slides, function (s, i) {
        s.classList.toggle('is-active', i === index);
        s.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      });

      /* Clearing every flag first, then re-flagging the active dot,
         makes the ::after progress keyframes restart from zero. */
      Array.prototype.forEach.call(dots, function (d) {
        d.setAttribute('aria-selected', 'false');
      });
      void root.offsetWidth;
      if (dots[index]) dots[index].setAttribute('aria-selected', 'true');

      if (counter) counter.textContent = pad(index + 1);
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (reduce || hovered || !visible || document.hidden) return;
      timer = setTimeout(function () { show(index + 1); }, interval);
    }

    /* ---- Controls ---- */
    if (nextBtn) nextBtn.addEventListener('click', function () { show(index + 1); });
    if (prevBtn) prevBtn.addEventListener('click', function () { show(index - 1); });

    Array.prototype.forEach.call(dots, function (d, i) {
      d.addEventListener('click', function () { show(i); });
    });

    /* ---- Pause interactions ---- */
    ['mouseenter', 'focusin'].forEach(function (ev) {
      root.addEventListener(ev, function () { hovered = true; clearTimeout(timer); });
    });
    ['mouseleave', 'focusout'].forEach(function (ev) {
      root.addEventListener(ev, function () { hovered = false; schedule(); });
    });
    document.addEventListener('visibilitychange', schedule);

    /* ---- Keyboard ---- */
    root.setAttribute('tabindex', '-1');
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    });

    /* ---- Touch swipe ---- */
    var sx = 0, sy = 0, tracking = false;
    root.addEventListener('touchstart', function (e) {
      if (!e.touches.length) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (!tracking || !e.changedTouches.length) return;
      tracking = false;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) {
        show(index + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    /* ---- Only run while on screen ---- */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible) schedule(); else clearTimeout(timer);
        });
      }, { rootMargin: '160px 0px' }).observe(root);
    }

    show(0, true);
  });
})();
