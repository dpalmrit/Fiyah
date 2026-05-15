/* ════════════════════════════════════════════════════════
   Jigga Jerk Joint — Micro-animation layer v2
   Enhances: hero parallax, card reveals, stat count-up
   No external dependencies.
════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Navbar scroll tint ──────────────────────────────── */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.style.background = window.scrollY > 40
        ? 'rgba(26,10,0,0.98)'
        : 'rgba(26,10,0,0.90)';
    }, { passive: true });
  }

  /* ── Hero gradient follows mouse ─────────────────────── */
  const heroFallback = document.querySelector('.hero-bg-fallback');
  if (heroFallback) {
    document.addEventListener('mousemove', e => {
      const x = (e.clientX / window.innerWidth)  * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      heroFallback.style.background = `
        radial-gradient(ellipse at ${x}% ${y}%,   rgba(212,56,13,0.40)  0%, transparent 55%),
        radial-gradient(ellipse at ${100-x}% ${100-y}%, rgba(249,199,79,0.20) 0%, transparent 50%),
        linear-gradient(180deg, #1A0A00 0%, #261200 50%, #1A0A00 100%)
      `;
    }, { passive: true });
  }

  /* ── Mobile FAB visibility ───────────────────────────── */
  const fab = document.getElementById('mobile-fab');
  if (fab) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 200) fab.classList.add('visible');
      else                      fab.classList.remove('visible');
    }, { passive: true });
  }

  /* ── Generic scroll-reveal ───────────────────────────── */
  function makeObserver(threshold) {
    if (!('IntersectionObserver' in window)) return null;
    return new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity   = '1';
          entry.target.style.transform = 'translateY(0)';
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: threshold || 0.10 });
  }

  const revealObserver = makeObserver(0.10);

  function applyReveal(el) {
    if (!revealObserver) return;
    if (el.dataset.revealDone) return;
    el.dataset.revealDone = '1';
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(18px)';
    el.style.transition = 'opacity 0.48s ease, transform 0.48s ease';
    revealObserver.observe(el);
  }

  /* Initial reveal sweep for static elements */
  document.querySelectorAll('.card, .review-card, .info-card, .catering-banner').forEach(applyReveal);

  /* ── revealFresh — call after dynamic content renders ── */
  window.revealFresh = function (scope) {
    const root = scope || document;
    root.querySelectorAll('.card, .menu-item, .menu-select-item, .review-card, .info-card').forEach(applyReveal);
  };

  /* ── Stat count-up ───────────────────────────────────── */
  const statNums = document.querySelectorAll('.stat-number[data-count]');
  if (statNums.length && 'IntersectionObserver' in window) {
    const strip = document.querySelector('.stats-strip');
    if (strip) {
      const numObs = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        numObs.disconnect();
        statNums.forEach(el => {
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || '';
          const prefix = el.dataset.prefix || '';
          const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
          const duration = 1000;
          const start = performance.now();
          function tick(now) {
            const elapsed = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - elapsed, 3); // ease-out cubic
            const val = target * ease;
            el.textContent = prefix + (decimals ? val.toFixed(decimals) : Math.round(val)) + suffix;
            if (elapsed < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      }, { threshold: 0.5 });
      numObs.observe(strip);
    }
  }

})();
