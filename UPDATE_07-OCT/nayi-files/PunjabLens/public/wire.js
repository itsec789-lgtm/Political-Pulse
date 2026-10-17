/* ======================================================================
   WIRE  -  a small glue file
   ----------------------------------------------------------------------
   Two jobs:
     Jab data aata hai (app.js `pl:data` event firti hai) tab from MongoDB (app.js fires the `pl:data` event),
        rebuild the map / insights / overview-plus panels

   It is a separate file because the module files (district-map.js and the
   rest) build their own DOM and have no idea when the data will land.
   ====================================================================== */
(function () {
  'use strict';
  var q = function (s) { return document.querySelector(s); };


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

})();
