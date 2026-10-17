/* ======================================================================
   HOST SWITCH  —  main dashboard ke andar chalte waqt hi dikhta hai
   ----------------------------------------------------------------------
   Punjab ka dashboard ek alag SPA hai, isliye main wale ka sidebar yahan
   nahi hai. Ye chhoti file navbar me "All India / Uttar Pradesh / Logout"
   ke button jod deti hai.

   Do baatein:
     - PL_BASE khaali ho (yaani PunjabLens akela chal raha hai, START.bat se)
       to ye kuch nahi karti. Standalone build waisa hi rehta hai.
     - Button sirf 'admin' ko dikhte hain. 'punjab' role wale ko sirf
       Logout milta hai — wo doosre dashboard dekh hi nahi sakta.
   ====================================================================== */
(function () {
  'use strict';

  var BASE = (typeof window !== 'undefined' && window.PL_BASE) || '';
  if (!BASE) return;                       // akela chal raha hai — kuch mat karo

  var HOST = BASE.replace(/\/punjab$/, '') || '';   // main dashboard ki jad

  function css() {
    if (document.getElementById('hostSwitchCss')) return;
    var s = document.createElement('style');
    s.id = 'hostSwitchCss';
    s.textContent =
      '.hs-wrap{display:flex;align-items:center;gap:6px;margin-right:8px}' +
      '.hs-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;' +
      'font:600 12px Inter,system-ui,sans-serif;text-decoration:none;white-space:nowrap;' +
      'background:rgba(20,184,166,.14);color:#0F766E;border:1px solid rgba(20,184,166,.35);' +
      'transition:.15s}' +
      '.hs-btn:hover{background:rgba(20,184,166,.26)}' +
      '.hs-btn.out{background:rgba(185,28,28,.10);color:#B91C1C;border-color:rgba(185,28,28,.3)}' +
      '.hs-btn.out:hover{background:rgba(185,28,28,.2)}' +
      '[data-theme="dark"] .hs-btn{color:#5EEAD4;background:rgba(20,184,166,.18);' +
      'border-color:rgba(20,184,166,.4)}' +
      '[data-theme="dark"] .hs-btn.out{color:#FCA5A5;background:rgba(185,28,28,.18)}' +
      '@media(max-width:860px){.hs-wrap .hs-lbl{display:none}}';
    document.head.appendChild(s);
  }

  function draw(role) {
    var right = document.querySelector('.nav-right');
    if (!right || document.querySelector('.hs-wrap')) return;
    css();

    var wrap = document.createElement('div');
    wrap.className = 'hs-wrap';

    var html = '';
    if (role === 'admin') {                // sirf admin doosre dashboard dekh sakta hai
      html += '<a class="hs-btn" href="' + HOST + '/" title="All India dashboard">'
           +  '<span>&#8962;</span><span class="hs-lbl">All India</span></a>'
           +  '<a class="hs-btn" href="' + HOST + '/up" title="Uttar Pradesh dashboard">'
           +  '<span>UP</span><span class="hs-lbl">Uttar Pradesh</span></a>';
    }
    html += '<a class="hs-btn out" href="' + HOST + '/logout" title="Logout">Logout</a>';
    wrap.innerHTML = html;

    right.insertBefore(wrap, right.firstChild);
  }

  function start() {
    fetch(BASE + '/_me', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { draw(String((j && j.role) || '')); })
      .catch(function () { draw(''); });   // pata na chale to bas Logout dikha do
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
