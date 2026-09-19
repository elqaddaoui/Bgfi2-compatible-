/* ============================================================
   BGFIBank — Actus Newsletter · S1 2026
   navigation.js
   · Masthead compact state
   · Mobile "Sommaire" drawer (scrim, ESC, focus trap, scroll lock)
   · Scroll-spy for the desktop nav + the drawer list
   · Subscription form micro-interactions + success state
   · Section visibility flags (.is-visible) for the abonnement band
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var body    = document.body;
  var header  = document.getElementById('siteHeader');
  var toggle  = document.getElementById('navToggle');
  var drawer  = document.getElementById('navDrawer');
  var scrim   = document.getElementById('navScrim');
  var closeBt = document.getElementById('drawerClose');

  /* ==========================================================
     1 · Masthead compact state
     ========================================================== */
  function syncHeader() {
    var st = window.pageYOffset || document.documentElement.scrollTop;
    var compact = st > 40;
    if (header) header.classList.toggle('scrolled', compact);
    body.classList.toggle('nav-compact', compact);
  }
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

  /* ==========================================================
     2 · Drawer
     ========================================================== */
  var FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';
  var lastFocus = null;

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    if (scrim) scrim.hidden = false;
    /* force a frame so the scrim can transition in */
    requestAnimationFrame(function () {
      body.classList.add('drawer-open');
    });
    drawer.setAttribute('aria-hidden', 'false');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Fermer le sommaire');
    }
    var first = drawer.querySelector(FOCUSABLE);
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 260);
  }

  function closeDrawer() {
    if (!drawer) return;
    body.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Ouvrir le sommaire');
    }
    var delay = reduce ? 0 : 520;
    setTimeout(function () {
      if (!body.classList.contains('drawer-open') && scrim) scrim.hidden = true;
    }, delay);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  }

  function isOpen() { return body.classList.contains('drawer-open'); }

  if (toggle) {
    toggle.addEventListener('click', function () {
      isOpen() ? closeDrawer() : openDrawer();
    });
  }
  if (closeBt) closeBt.addEventListener('click', closeDrawer);
  if (scrim)   scrim.addEventListener('click', closeDrawer);

  /* any link inside the drawer closes it */
  if (drawer) {
    drawer.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (link) closeDrawer();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
      return;
    }

    /* focus trap */
    if (e.key === 'Tab' && drawer) {
      var nodes = Array.prototype.filter.call(
        drawer.querySelectorAll(FOCUSABLE),
        function (n) { return n.offsetParent !== null; }
      );
      if (!nodes.length) return;
      var first = nodes[0];
      var last  = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  /* close automatically when returning to the desktop layout */
  var mqDesktop = window.matchMedia('(min-width: 961px)');
  var onMq = function (e) { if (e.matches && isOpen()) closeDrawer(); };
  if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', onMq);
  else if (mqDesktop.addListener) mqDesktop.addListener(onMq);

  /* ==========================================================
     3 · Scroll-spy
     ========================================================== */
  var spyLinks = Array.prototype.slice.call(
    document.querySelectorAll('.main-nav a[href^="#"], .drawer-link[href^="#"]')
  );

  var targets = [];
  spyLinks.forEach(function (link) {
    var id = link.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (el && targets.indexOf(el) === -1) targets.push(el);
  });

  function markActive(id) {
    spyLinks.forEach(function (link) {
      var on = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function spy() {
    var probe = window.innerHeight * 0.32;
    var current = null;
    for (var i = 0; i < targets.length; i++) {
      var r = targets[i].getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { current = targets[i]; break; }
      if (r.top > probe) break;
      current = targets[i];
    }
    if (current) markActive(current.id);
  }

  if (targets.length) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { spy(); ticking = false; });
    }, { passive: true });
    spy();
  }

  /* ==========================================================
     4 · Section visibility flags
     ========================================================== */
  var flagged = document.querySelectorAll('.subscribe-section');
  if (flagged.length) {
    if ('IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('is-visible');
            vio.unobserve(en.target);
          }
        });
      }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
      Array.prototype.forEach.call(flagged, function (n) { vio.observe(n); });
    } else {
      Array.prototype.forEach.call(flagged, function (n) { n.classList.add('is-visible'); });
    }
  }

  /* ==========================================================
     5 · Subscription form
     ========================================================== */
  var form = document.getElementById('subForm');
  if (form) {
    var field = form.querySelector('.sub-input');

    /* floating-label helper: keeps the label lifted when filled */
    if (field) {
      var syncFilled = function () {
        field.classList.toggle('has-value', field.value.trim() !== '');
      };
      field.addEventListener('input', function () {
        syncFilled();
        form.classList.remove('is-error');
      });
      field.addEventListener('blur', syncFilled);
      syncFilled();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.classList.contains('is-done')) return;

      var value = field ? field.value.trim() : '';
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

      if (!valid) {
        form.classList.add('is-error');
        if (field) field.focus();
        return;
      }

      form.classList.remove('is-error');
      form.classList.add('is-sending');

      setTimeout(function () {
        form.classList.remove('is-sending');
        form.classList.add('is-done');
        var note = form.querySelector('.sub-note');
        if (note) {
          note.setAttribute('role', 'status');
          note.focus && note.focus({ preventScroll: true });
        }
      }, reduce ? 0 : 620);
    });
  }
})();
