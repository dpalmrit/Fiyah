/* ════════════════════════════════════════════════════════
   PitchScout AI — Motion.js Animation Layer
   Requires: motion@11 (window.Motion)
   Enhances: state transitions, 3D card tilt, staggered
             feedback cards, grade pop-in, micro-interactions
════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Wait for Motion to be available */
  if (typeof window.Motion === 'undefined') {
    console.warn('[PitchScout Animations] Motion.js not loaded — skipping.');
    return;
  }

  const { animate, stagger } = window.Motion;

  /* ── Easing presets ──────────────────────────────────── */
  const ease = {
    out:    [0.16, 1, 0.3, 1],
    smooth: [0.25, 0.1, 0.25, 1],
    snap:   [0.18, 0.89, 0.32, 1.28],
  };

  /* ── State visibility observer ───────────────────────── */
  // Watch each state element; when it becomes visible, animate it in.
  const stateIds = [
    'state-loading',
    'state-auth',
    'state-upload',
    'state-uploading',
    'state-success',
    'state-error',
  ];

  stateIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const obs = new MutationObserver(() => {
      const vis = el.style.display && el.style.display !== 'none';
      if (vis) animateStateIn(el);
    });

    obs.observe(el, { attributes: true, attributeFilter: ['style'] });
  });

  function animateStateIn(el) {
    // Fade + rise the container
    animate(el, { opacity: [0, 1], y: [18, 0] }, { duration: 0.42, easing: ease.out });

    // Stagger any glass cards inside it
    const cards = el.querySelectorAll('.glass-card');
    if (cards.length) {
      animate(
        cards,
        { opacity: [0, 1], y: [22, 0], scale: [0.97, 1] },
        { duration: 0.48, delay: stagger(0.07, { start: 0.06 }), easing: ease.out }
      );
    }

    // Animate the spinner wrap
    const spinner = el.querySelector('.spinner-wrap');
    if (spinner) {
      animate(spinner, { opacity: [0, 1], scale: [0.6, 1] }, { duration: 0.5, easing: ease.snap });
    }

    // Animate success icon
    const successIcon = el.querySelector('.success-icon');
    if (successIcon) {
      animate(successIcon,
        { opacity: [0, 1], scale: [0.4, 1.12, 1], rotate: [-20, 0] },
        { duration: 0.65, easing: ease.out }
      );
    }
  }

  /* ── Initial page entry ──────────────────────────────── */
  function pageEntry() {
    const nav = document.querySelector('nav');
    if (nav) {
      animate(nav, { opacity: [0, 1], y: [-8, 0] }, { duration: 0.5, easing: ease.out });
    }

    const footer = document.querySelector('.report-footer');
    if (footer) {
      animate(footer, { opacity: [0, 1] }, { duration: 0.6, delay: 0.3, easing: ease.smooth });
    }

    // Animate any already-visible state
    stateIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.style.display && el.style.display !== 'none') {
        animateStateIn(el);
      }
    });
  }

  /* ── 3D card tilt on hover ───────────────────────────── */
  function addTilt(card) {
    const MAX_TILT = 3.5;

    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width  / 2) / (rect.width  / 2);
      const y = (e.clientY - rect.top  - rect.height / 2) / (rect.height / 2);
      animate(card, {
        rotateX: -y * MAX_TILT,
        rotateY:  x * MAX_TILT,
      }, { duration: 0.12, easing: ease.smooth });
    });

    card.addEventListener('mouseleave', () => {
      animate(card, { rotateX: 0, rotateY: 0 },
        { duration: 0.55, easing: ease.out });
    });
  }

  /* ── Feedback card stagger (MutationObserver) ────────── */
  const feedbackGrid = document.getElementById('feedback-grid');
  if (feedbackGrid) {
    const gridObs = new MutationObserver(() => {
      const fresh = feedbackGrid.querySelectorAll('.obs-card:not([data-animated])');
      if (!fresh.length) return;

      animate(
        fresh,
        { opacity: [0, 1], y: [16, 0], scale: [0.97, 1] },
        { duration: 0.45, delay: stagger(0.055), easing: ease.out }
      );
      fresh.forEach(c => c.setAttribute('data-animated', '1'));
    });

    gridObs.observe(feedbackGrid, { childList: true });
  }

  /* ── Grade pop-in ────────────────────────────────────── */
  const reportContent = document.getElementById('report-content');
  if (reportContent) {
    const reportObs = new MutationObserver(() => {
      if (reportContent.style.display !== 'none' && reportContent.style.display !== '') {
        // Short delay so DOM is settled
        setTimeout(() => {
          animateReportIn();
        }, 80);
      }
    });
    reportObs.observe(reportContent, { attributes: true, attributeFilter: ['style'] });
  }

  function animateReportIn() {
    // Eyebrow
    const eyebrow = document.querySelector('.report-eyebrow');
    if (eyebrow) {
      animate(eyebrow, { opacity: [0, 1], x: [-12, 0] },
        { duration: 0.4, easing: ease.out });
    }

    // Report title
    const title = document.querySelector('.report-title');
    if (title) {
      animate(title, { opacity: [0, 1], y: [16, 0] },
        { duration: 0.5, delay: 0.08, easing: ease.out });
    }

    // Grade block — scale pop
    const gradeEl = document.getElementById('report-grade');
    if (gradeEl) {
      animate(gradeEl,
        { opacity: [0, 1], scale: [0.5, 1.1, 1] },
        { duration: 0.7, delay: 0.15, easing: ease.snap }
      );
    }

    // Summary card
    const summary = document.querySelector('.summary-card');
    if (summary) {
      animate(summary, { opacity: [0, 1], y: [14, 0] },
        { duration: 0.45, delay: 0.22, easing: ease.out });
    }

    // PDF button
    const pdfBtn = document.getElementById('btn-pdf');
    if (pdfBtn) {
      animate(pdfBtn, { opacity: [0, 1], y: [10, 0] },
        { duration: 0.4, delay: 0.5, easing: ease.out });
    }
  }

  /* ── Button micro-interactions ───────────────────────── */
  function addButtonEffects() {
    document.querySelectorAll('.btn-submit, .btn-pdf').forEach(btn => {
      btn.addEventListener('mousedown', () => {
        if (btn.disabled) return;
        animate(btn, { scale: 0.96 }, { duration: 0.08 });
      });
      btn.addEventListener('mouseup', () => {
        animate(btn, { scale: 1 }, { duration: 0.25, easing: ease.snap });
      });
      btn.addEventListener('mouseleave', () => {
        animate(btn, { scale: 1 }, { duration: 0.2 });
      });
    });
  }

  /* ── Input focus lift ────────────────────────────────── */
  function addInputEffects() {
    document.querySelectorAll('.form-input').forEach(input => {
      input.addEventListener('focus', () => {
        animate(input, { scale: [1, 1.008] }, { duration: 0.18, easing: ease.smooth });
      });
      input.addEventListener('blur', () => {
        animate(input, { scale: 1 }, { duration: 0.22, easing: ease.smooth });
      });
    });
  }

  /* ── File drop zone pulse ────────────────────────────── */
  const fileDrop = document.getElementById('file-drop');
  if (fileDrop) {
    fileDrop.addEventListener('dragover', () => {
      animate(fileDrop, { scale: 1.015 }, { duration: 0.2, easing: ease.smooth });
    });
    fileDrop.addEventListener('dragleave', () => {
      animate(fileDrop, { scale: 1 }, { duration: 0.25, easing: ease.out });
    });
    fileDrop.addEventListener('drop', () => {
      animate(fileDrop, { scale: [1.015, 0.98, 1] }, { duration: 0.4, easing: ease.snap });
    });
  }

  /* ── Nav logo hover ──────────────────────────────────── */
  const navLogo = document.querySelector('.nav-logo');
  if (navLogo) {
    navLogo.addEventListener('mouseenter', () => {
      animate(navLogo, { x: 2 }, { duration: 0.2, easing: ease.smooth });
    });
    navLogo.addEventListener('mouseleave', () => {
      animate(navLogo, { x: 0 }, { duration: 0.3, easing: ease.out });
    });
  }

  /* ── Auth screen crossfade ───────────────────────────── */
  // Watch all auth sub-screens for visibility changes
  const authScreenIds = ['auth-signin', 'auth-signup', 'auth-verify', 'auth-forgot'];
  authScreenIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const obs = new MutationObserver(() => {
      if (el.style.display && el.style.display !== 'none') {
        animate(el, { opacity: [0, 1], x: [16, 0] },
          { duration: 0.38, easing: ease.out });
      }
    });
    obs.observe(el, { attributes: true, attributeFilter: ['style'] });
  });

  /* ── Background orb subtle parallax ─────────────────── */
  document.addEventListener('mousemove', e => {
    const cx = (e.clientX / window.innerWidth  - 0.5) * 20;
    const cy = (e.clientY / window.innerHeight - 0.5) * 14;
    const orb1 = document.querySelector('.bg-orb-1');
    const orb2 = document.querySelector('.bg-orb-2');
    if (orb1) animate(orb1, { x: cx * 0.6, y: cy * 0.6 }, { duration: 1.2, easing: ease.smooth });
    if (orb2) animate(orb2, { x: -cx * 0.4, y: -cy * 0.4 }, { duration: 1.5, easing: ease.smooth });
  }, { passive: true });

  /* ── Progress bar glow pulse ─────────────────────────── */
  const uploadingState = document.getElementById('state-uploading');
  if (uploadingState) {
    const fillObs = new MutationObserver(() => {
      const fill = document.getElementById('progress-fill');
      if (fill && uploadingState.style.display !== 'none') {
        // Pulsing glow on the fill bar
        animate(fill, { boxShadow: [
          '0 0 8px rgba(0,230,118,0.4)',
          '0 0 18px rgba(0,230,118,0.7)',
          '0 0 8px rgba(0,230,118,0.4)',
        ]}, { duration: 1.5, repeat: Infinity, easing: ease.smooth });
      }
    });
    fillObs.observe(uploadingState, { attributes: true, attributeFilter: ['style'] });
  }

  /* ── Video background crossfade ─────────────────────── */
  (function initVideoBg() {
    const layer = document.getElementById('bg-layer');
    const vid1  = document.getElementById('bg-vid-1');
    const vid2  = document.getElementById('bg-vid-2');
    if (!vid1 || !vid2 || !layer) return;

    let current = 1; // which video is showing

    function crossfadeTo(next) {
      const incoming = next === 2 ? vid2 : vid1;
      const outgoing = next === 2 ? vid1 : vid2;

      // Start loading + playing the incoming video
      incoming.load();
      incoming.play().catch(() => {});

      // Crossfade
      incoming.classList.add('active');
      outgoing.classList.remove('active');
      current = next;
    }

    // Mark background as video-playing once first frame loads
    vid1.addEventListener('playing', () => {
      layer.classList.add('video-playing');
    }, { once: true });

    // After each full loop of vid1, crossfade to vid2 (and vice versa)
    vid1.addEventListener('ended', () => { if (current === 1) crossfadeTo(2); });
    vid2.addEventListener('ended', () => { if (current === 2) crossfadeTo(1); });

    // For looping videos, crossfade at the wrap point using timeupdate
    // Only swap once per loop to avoid rapid firing
    let swapped1 = false;
    let swapped2 = false;

    vid1.addEventListener('timeupdate', () => {
      if (!swapped1 && vid1.duration && vid1.currentTime >= vid1.duration - 0.5) {
        swapped1 = true;
        crossfadeTo(2);
        // Reset flag after swap
        setTimeout(() => { swapped1 = false; }, 3000);
      }
    });

    vid2.addEventListener('timeupdate', () => {
      if (!swapped2 && vid2.duration && vid2.currentTime >= vid2.duration - 0.5) {
        swapped2 = true;
        crossfadeTo(1);
        setTimeout(() => { swapped2 = false; }, 3000);
      }
    });
  })();

  /* ── Init ────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    // Apply tilt to all existing glass cards
    document.querySelectorAll('.glass-card').forEach(addTilt);

    // Button & input effects
    addButtonEffects();
    addInputEffects();

    // Page entry
    pageEntry();
  });

  // Also tilt any glass cards added dynamically (e.g. auth screens shown later)
  const tiltObs = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.classList && node.classList.contains('glass-card')) addTilt(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('.glass-card').forEach(addTilt);
        }
      });
    });
  });

  tiltObs.observe(document.body, { childList: true, subtree: true });

})();
