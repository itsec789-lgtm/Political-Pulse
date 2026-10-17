<script>/* ===== state-keep (12-Oct) : ghante wale refresh par jagah na chhoote
   -----------------------------------------------------------------------
   Server har ghante naya data banata hai; page us waqt location.reload()
   kar deta hai. Pehle reload ke baad sab kuch shuru se khul jaata tha --
   Dashboard tab, saare filter saaf, sort default, aur scroll sabse upar.
   Agar aap Legislators me Bihar chhaan kar 3 page neeche the, to sab gaya.

   Ab page band hone se pehle ek chhoti si parchi sessionStorage me rakh
   di jaati hai -- kaun sa tab khula tha, har filter/date/search ki value,
   Top Leaders ka sort, aur scroll kahan tha (page ka bhi, table ka bhi).
   Reload ke baad loader hatte hi wahi wapas laga di jaati hai.

   Kyun sessionStorage: ye sirf usi tab me, usi session me rehta hai. Naya
   tab kholne par saaf page milta hai -- yahi theek bhi hai.

   Ye asli ilaaj nahi hai -- asli ilaaj per-tab API hai (phase 2), jisme
   page reload hoga hi nahi. Tab tak ye jhatka kam kar deta hai.
   ===================================================================== */
(function () {
  'use strict';
  var W = window, D = document;
  var KEY = 'ipp_keep_' + (location.pathname || '/');
  var MAX_AGE = 30 * 60 * 1000;     /* adhe ghante se purani parchi phaad do */
  var busy = false;                  /* wapas lagate waqt save mat karo */
  var touched = false;               /* user ne khud kuch chhua -> ab dakhal mat do */

  function sels() {
    /* sirf wahi control jinki apni id hai -- unhi ko wapas dhoondh sakte hain */
    return [].slice.call(D.querySelectorAll(
      'select[id], input[id][type="date"], input[id][type="search"], input[id][type="text"]'
    )).filter(function (e) { return !e.closest('#sec-handle-req'); });
    /* Handle-Request form chhod dete hain -- wo bhara hua form hai, usme
       purani value wapas daalna ulta pad sakta hai. */
  }
  function scrollers() {
    return [].slice.call(D.querySelectorAll('.table-scroll'));
  }
  /* har scroll-box ko ek pehchaan: uske andar wali tbody ki id. Sirf
     ginti par bharosa nahi kar sakte -- table kabhi chhup bhi jaati hai. */
  function skey(e) {
    var tb = e.querySelector('tbody[id]');
    return tb ? tb.id : ('#' + scrollers().indexOf(e));
  }
  /* currentTab ek script ke andar ka let hai -- window par nahi aata.
     Isliye khuli hui section se hi padh lete hain. */
  function curTab() {
    var a = D.querySelector('.page-section.active');
    if (a && a.id) return a.id.replace(/^sec-/, '');
    var t = D.querySelector('.mnav-tab.active');
    return (t && t.dataset && t.dataset.tab) || '';
  }

  function snap() {
    if (busy) return;
    var o = { t: Date.now(), tab: curTab(), y: W.scrollY || (D.scrollingElement || {}).scrollTop || 0, f: {}, s: {} };
    try { o.sort = W.tlSortKey || ''; } catch (e) {}
    sels().forEach(function (e) { if (e.value) o.f[e.id] = e.value; });
    scrollers().forEach(function (e) {
      if (e.scrollTop || e.scrollLeft) o.s[skey(e)] = [e.scrollTop | 0, e.scrollLeft | 0];
    });
    try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function read() {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!o || !o.t || (Date.now() - o.t) > MAX_AGE) return null;
    return o;
  }

  /* ek control ki value wapas lagao -- tabhi jab wo value sach me maujood ho
     (cascading dropdown reload ke baad alag options la sakta hai) */
  function put(e, v) {
    if (!e || e.value === v) return false;
    if (e.tagName === 'SELECT') {
      var has = [].some.call(e.options, function (o) { return o.value === v; });
      if (!has) return false;
    }
    e.value = v;
    try { e.dispatchEvent(new Event('change', { bubbles: true })); } catch (x) {
      try { e.onchange && e.onchange(); } catch (y) {}
    }
    return true;
  }

  function restore(o) {
    if (touched) return;             /* user kaam kar raha hai -- beech me mat ghuso */
    busy = true;
    try {
      if (o.tab && W.switchTab && o.tab !== curTab()) { try { W.switchTab(o.tab); } catch (e) {} }
      if (o.sort && W.tlSortKey !== o.sort) {
        W.tlSortKey = o.sort;
        try { W.tlTitleFix && W.tlTitleFix(); } catch (e) {}
        try { W.renderLeaders && W.renderLeaders(); } catch (e) {}
      }
      /* do chakkar: pehle chakkar me Level/Date lagti hai, jisse State/Party
         ke options bante hain; doosre chakkar me wo bhi lag jaate hain */
      for (var pass = 0; pass < 2; pass++) {
        sels().forEach(function (e) {
          var v = o.f[e.id];
          if (v !== undefined) put(e, v);
        });
      }
    } finally { busy = false; }

    /* scroll sabse aakhir me -- rows ban jaane ke baad hi matlab hai */
    setTimeout(function () {
      busy = true;
      try {
        scrollers().forEach(function (e) {
          var p = (o.s || {})[skey(e)];
          if (p) { e.scrollTop = p[0]; e.scrollLeft = p[1]; }
        });
        if (o.y) { W.scrollTo(0, o.y); try { if (D.scrollingElement) D.scrollingElement.scrollTop = o.y; } catch (x) {} }
      } catch (e) {}
      busy = false;
    }, 260);
  }

  function boot() {
    /* jaise hi user khud kuch kare, baad wale restore chakkar rok do */
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      D.addEventListener(ev, function () { touched = true; }, { capture: true, passive: true });
    });
    var o = read();
    if (o) {
      /* loader ke peeche chup-chaap laga dete hain, phir ek-do baar aur --
         kuch table thodi der baad bhari jaati hain */
      setTimeout(function () { restore(o); }, 500);
      setTimeout(function () { restore(o); }, 1600);
      setTimeout(function () { restore(o); }, 3200);
    }
    /* badlav hote hi parchi taaza rakho -- unload par browser kabhi-kabhi
       mauka nahi deta */
    D.addEventListener('change', function () { setTimeout(snap, 120); }, true);
    D.addEventListener('click', function () { setTimeout(snap, 400); }, true);
    W.addEventListener('scroll', function () {
      clearTimeout(W._keepT); W._keepT = setTimeout(snap, 400);
    }, true);
    W.addEventListener('beforeunload', snap);
    W.addEventListener('pagehide', snap);
    setInterval(snap, 5000);
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* test ke liye bahar */
  W.keepSnap = snap; W.keepRead = read; W.keepRestore = restore; W.keepKey = KEY; W.keepTab = curTab;
})();
</script>
