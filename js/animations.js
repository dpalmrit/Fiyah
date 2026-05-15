/* ════════════════════════════════════════════════════════
   Jigga Jerk Joint — Micro-animation layer
   Enhances: hero parallax, card hover lift, scroll reveals
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
        radial-gradient(ellipse at ${x}% ${y}%,   rgba(212,56,13,0.38)  0%, transparent 55%),
        radial-gradient(ellipse at ${100-x}% ${100-y}%, rgba(249,199,79,0.18) 0%, transparent 50%),
        linear-gradient(180deg, #1A0A00 0%, #261200 50%, #1A0A00 100%)
      `;
    }, { passive: true });
  }

  /* ── Scroll-reveal for cards ─────────────────────────── */
  const revealEls = document.querySelectorAll('.card, .review-card, .info-card, .catering-banner');
  if (revealEls.length && 'IntersectionObserver' in window) {
    revealEls.forEach(el => {
      el.style.opacity  = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity   = '1';
          entry.target.style.transform = 'translateY(0)';
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealEls.forEach(el => io.observe(el));
  }

  /* ── Stat counter animate-up on scroll ───────────────── */
  const statNums = document.querySelectorAll('.stat-number');
  if (statNums.length && 'IntersectionObserver' in window) {
    const strip = document.querySelector('.stats-strip');
    if (strip) {
      const numObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          strip.style.transform = 'scaleX(1)';
          strip.style.opacity   = '1';
          numObs.disconnect();
        }
      }, { threshold: 0.4 });
      strip.style.transition = 'opacity 0.4s ease';
      strip.style.opacity    = '0.6';
      numObs.observe(strip);
    }
  }

})();
