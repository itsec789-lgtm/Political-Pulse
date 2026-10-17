/* ======================================================================
   WIRE  -  a small glue file
   ----------------------------------------------------------------------
   Two jobs:
     1. Open and close the assistant's floating button
     2. When data arrives from MongoDB (app.js fires the `pl:data` event),
        rebuild the map / insights / overview-plus panels

   It is a separate file because the module files (district-map.js and the
   rest) build their own DOM and have no idea when the data will land.
   ====================================================================== */
(function () {
  'use strict';
  var q = function (s) { return document.querySelector(s); };

  /* --------------------------------------------------------- assistant -- */
  function wireAssistant() {
    var fab = q('#aiFabBtn'), panel = q('#aiPanel'), close = q('#aiPanelClose');
    if (!fab || !panel) return;
    fab.addEventListener('click', function () {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        var i = q('#aiInput'); if (i) setTimeout(function () { i.focus(); }, 120);
      }
    });
    if (close) close.addEventListener('click', function () { panel.classList.remove('open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') panel.classList.remove('open');
    });
  }

  /* --------------------------------------------- re-render on new data --
   * Each module's render function is global. The try/catch is there so one
   * failing module does not take the rest of the dashboard with it - a
   * single error used to blank the whole page. */
  function rerenderModules() {
    ['loadDistrictMap', 'renderOverviewPlus', 'initCompare', 'renderInsights', 'renderMedia'].forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); }
      catch (e) { console.warn('[wire] ' + fn, e); }
    });
    // reports.js fills its own word/hashtag table - give it a nudge
    var wc = q('#wcSearch');
    if (wc) wc.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('pl:data', function () { setTimeout(rerenderModules, 60); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAssistant);
  } else {
    wireAssistant();
  }
})();
