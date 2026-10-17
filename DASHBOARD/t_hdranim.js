/* t_hdranim.js -- header-anim (10-Oct): swoosh wave + logo coin flip
   Vyavhaar ki poori jaanch ASLI Chromium me hui hai
   (SAMPLE_header_anim\_verify_all.html / _verify_up.html -- 45 jaanch
   har template ke liye, template ka ASLI CSS + markup + JS nikaal kar:
   intro -820 -> 0, drift <=6 unit, shimmer ka net motion 0, text hamesha
   upar, koi layout shift nahi, flip 3D aur dobara-click band, keyboard,
   mobile, aur reduced-motion).
   Yahan ye dekha jaata hai ki wahi code dono template me theek gaya hai.
   Chalao:  node t_hdranim.js                                           */
'use strict';
const fs = require('fs'), path = require('path');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL  = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. nishaan aur timing variables');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* ===== header-anim (10-Oct)') > 0, n + ': CSS ka nishaan');
  ok(t.indexOf('header-anim (10-Oct) : logo par click') > 0, n + ': JS ka nishaan');
  ['--swoosh-intro-duration:1.5s', '--swoosh-idle-duration:8s',
   '--swoosh-shimmer-duration:7s', '--logo-flip-duration:.9s',
   '--hdr-fade-duration:.65s'].forEach(function (v) {
    ok(t.indexOf(v) > 0, n + ': ' + v.split(':')[0] + ' maujood');
  });
  /* har timing SIRF variable se aaye -- kahin hard-coded number na ho */
  ok(/animation:whIntro var\(--swoosh-intro-duration\)/.test(t), n + ': intro variable se');
  ok(/animation:whDrift var\(--swoosh-idle-duration\) ease-in-out var\(--swoosh-intro-duration\)/.test(t),
     n + ': drift variable se, aur intro ke baad shuru');
  ok(/animation:coinFlip var\(--logo-flip-duration\)/.test(t), n + ': flip variable se');
});

sec('2. swoosh: wahi purana design, bas animate');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* asli curve ke control points bilkul nahi badle */
  ok(t.indexOf('C470,40 540,72 340,80') > 0, n + ': kesari shape ka curve jyon ka tyon');
  ok(t.indexOf('C540,72 470,40 600,0') > 0, n + ': golden line ka curve jyon ka tyon');
  ok(t.indexOf('C430,32 490,58 280,66') > 0, n + ': upar ki halki safed parat jyon ki tyon');
  ok(t.indexOf('stop-color="#E9701C"') > 0 && t.indexOf('stop-color="#C0430D"') > 0, n + ': kesari gradient wahi');
  ok(t.indexOf('stop-color="#FFE7B0"') > 0 && t.indexOf('stop-color="#F0871A"') > 0, n + ': golden gradient wahi');
  /* baayein -90 tak badhaya -- viewBox ke bahar, isliye dikhta nahi;
     drift ke waqt baayein kinare par khaali jagah nahi aati */
  ok(t.indexOf('d="M-90,0 L600,0') > 0, n + ': shape baayein se bahar tak (drift me gap nahi)');
  ok(/viewBox="0 0 900 80" preserveAspectRatio="none"/.test(t), n + ': viewBox wahi');
  ok(t.indexOf('<g class="wh-intro">') > 0 && t.indexOf('<g class="wh-drift">') > 0, n + ': intro aur drift alag layer');
  ok(/@keyframes whIntro\{from\{transform:translateX\(-820px\)\}to\{transform:translateX\(0\)\}\}/.test(t),
     n + ': intro baayein se andar');
  ok(/@keyframes whDrift\{0%,100%\{transform:translate\(0,0\) scaleY\(1\)\}50%\{transform:translate\(6px,0\) scaleY\(1\.014\)\}\}/.test(t),
     n + ': drift bas 6 unit + 1.4% morph');
  ok(/\.wh-intro\{transform-box:view-box;transform-origin:0 80px/.test(t), n + ': origin neeche-baayein (scaleY upar ko)');
});

sec('3. golden line ki chamak (sirf transform)');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('<clipPath id="hdwShimWin">') > 0, n + ': chalti hui khidki');
  ok(t.indexOf('class="wh-shim-win" clip-path="url(#hdwShimWin)"') > 0, n + ': khidki clip se juda');
  const win = t.match(/@keyframes whShimWin\{0%,14%\{transform:translateX\((-?\d+)px\)\}100%\{transform:translateX\((-?\d+)px\)\}\}/);
  const inn = t.match(/@keyframes whShimIn\{0%,14%\{transform:translateX\((-?\d+)px\)\}100%\{transform:translateX\((-?\d+)px\)\}\}/);
  ok(!!win && !!inn, n + ': dono keyframes maujood');
  if (win && inn) {
    ok(+win[1] === -(+inn[1]) && +win[2] === -(+inn[2]),
       n + ': khidki aur andar ka stroke bilkul ulta chalte hain -> stroke hilta hi nahi');
  }
  ok(t.indexOf('id="hdwSh"') > 0, n + ': chamak ka apna gradient');
});

sec('4. logo coin flip');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('class="smt-emblem logo-coin hdr-fade" id="logoCoin"') > 0, n + ': logo par coin class + id');
  ok(t.indexOf('role="button" tabindex="0"') > 0, n + ': keyboard se chun sakte hain');
  ok(t.indexOf('<div class="coin-inner">') > 0, n + ': ghoomne wali andar ki parat');
  ok(/\.logo-coin\{cursor:pointer;perspective:620px/.test(t), n + ': pointer cursor + 3D perspective');
  ok(/\.logo-coin \.coin-inner\{border-radius:50%;transform-style:preserve-3d/.test(t), n + ': gol shape + 3D');
  ok(/@keyframes coinFlip\{0%\{transform:rotateY\(0deg\) scale\(1\)\}50%\{transform:rotateY\(180deg\) scale\(1\.1\)\}100%\{transform:rotateY\(360deg\) scale\(1\)\}\}/.test(t),
     n + ': poora 360 + beech me halka uchhaal');
  ok(t.indexOf("if (el.classList.contains('flipping')) return;") > 0, n + ': flip ke dauraan dobara click band');
  ok(t.indexOf("inner.addEventListener('animationend'") > 0, n + ': khatam hote hi class hat jaati hai');
  ok(/e\.key === 'Enter' \|\| e\.key === ' '/.test(t), n + ': Enter aur Space dono');
  ok(t.indexOf('e.preventDefault(); flip();') > 0, n + ': Space se page scroll nahi hota');
  ok(t.indexOf('.logo-coin.flipping:hover{transform:none}') > 0, n + ': flip ke waqt hover-tilt band');
  ok(t.indexOf('.smt-emblem:hover{transform:rotate(-4deg) scale(1.05)}') > 0, n + ': purana hover effect salaamat');
});

sec('5. text hamesha padhne layak + fade');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/\.hdr-wh\{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none\}/.test(t),
     n + ': swoosh z-index 0 par aur click nahi kha sakta');
  ok(/\.logo\{[^}]*z-index:2\}/.test(t) && /\.hdr-right\{[^}]*z-index:2\}/.test(t), n + ': text aur chips z-index 2 par');
  ok(t.indexOf('<button class="hdr-burger hdr-fade" style="--d:0s"') > 0, n + ': hamburger fade');
  ok(t.indexOf('<div class="hdr-fade" style="--d:.12s">') > 0, n + ': title block fade');
  ok(t.indexOf('class="data-pill upd-pill hdr-fade" style="--d:.20s"') > 0, n + ': update pill fade');
  ok(t.indexOf('<div class="data-pill hdr-fade" style="--d:.26s" id="dataPill">') > 0, n + ': date pill fade');
  ok(t.indexOf('.hdr-right .hp-wrap{animation:hdrFade') > 0, n + ': Admin chip bhi fade (wo server.js se aata hai)');
  ok(/@keyframes hdrFade\{from\{opacity:0;transform:translateY\(-5px\)\}to\{opacity:1;transform:none\}\}/.test(t),
     n + ': fade sirf opacity + transform');
});

sec('6. performance / accessibility ke niyam');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  const i = t.indexOf('/* ===== header-anim (10-Oct)');
  const j = t.indexOf('@media (prefers-reduced-motion: reduce)', i);
  ok(j > i, n + ': reduced-motion block maujood');
  /* mere keyframes me SIRF transform/opacity -- ye Chromium me bhi jaancha gaya */
  const names = ['whIntro', 'whDrift', 'whShimWin', 'whShimIn', 'hdrFade', 'coinFlip', 'coinPop'];
  let bad = [];
  names.forEach(function (k) {
    const m = t.match(new RegExp('@keyframes ' + k + '\\{([^@]*?)\\}\\s*(?:\\n|@|\\.|header|/\\*)'));
    if (!m) return;
    const props = m[1].replace(/\d+%|from|to|\{|\}/g, ' ').split(';')
      .map(function (s) { return s.split(':')[0].trim(); })
      .filter(function (s) { return s && /^[a-z-]+$/.test(s); });
    props.forEach(function (pr) { if (pr !== 'transform' && pr !== 'opacity') bad.push(k + '->' + pr); });
  });
  ok(bad.length === 0, n + ': keyframes me sirf transform/opacity' + (bad.length ? ' [' + bad.join(',') + ']' : ''));
  ok(t.indexOf('.wh-shim-win{display:none}') > 0, n + ': reduced-motion me chamak band');
  ok(/@keyframes coinPop\{0%\{opacity:\.45\}100%\{opacity:1\}\}/.test(t), n + ': reduced-motion me flip ki jagah simple fade');
  ok((t.match(/will-change:transform/g) || []).length >= 1, n + ': will-change sirf ghoomne wali parat par');
  const wc = t.slice(i, t.indexOf('@media (prefers-reduced-motion', i));
  ok((wc.match(/will-change/g) || []).length === 1, n + ': will-change ek hi jagah (fijool nahi)');
});

sec('6b. splash-gate: intro loader hatne ke BAAD chale');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* -- splash-gate:') > 0, n + ': gate ka nishaan');
  ok(/\.wh-intro,\.wh-drift,\.wh-shim-win,\.wh-shim-in,\.hdr-fade,\.hdr-right \.hp-wrap\{\s*animation-play-state:paused\}/.test(t),
     n + ': shuru me saari animation ruki hui');
  ok(/body\.hdr-go [\s\S]*?\{\s*animation-play-state:running\}/.test(t), n + ': body.hdr-go lagte hi chalu');
  ok(t.indexOf("var ld = document.getElementById('loader');") > 0, n + ': loader ko dekhta hai');
  ok(t.indexOf("ld.classList.contains('hiding')") > 0, n + ': hiding class par chalu karta hai');
  ok(t.indexOf('new MutationObserver') > 0, n + ': MutationObserver se');
  ok(t.indexOf('mo.observe(ld, { attributes: true, attributeFilter: [\'class\', \'style\'] });') > 0,
     n + ': sirf class/style par nazar');
  ok(t.indexOf('setTimeout(go, 7000);') > 0, n + ': 7 second ka hard fallback (loader na hate to bhi header dikhe)');
  ok(t.indexOf("if (!ld || ld.classList.contains('hiding') || ld.style.display === 'none') { go(); return; }") > 0,
     n + ': loader na ho / pehle hi hat chuka ho -> turant chalu');
  /* hideLoader() ko haath nahi lagaya -- ye hona hi chahiye */
  ok(t.indexOf('function hideLoader(){if(_loaderHidden)return;') > 0, n + ': hideLoader() bilkul nahi chhua');
});

sec('7. PDF/report capture ke waqt freeze');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("hdr.classList.add('hdr-capturing')") > 0, n + ': capture se pehle freeze on');
  ok(t.indexOf("hdr.classList.remove('hdr-capturing')") > 0, n + ': capture ke baad freeze off');
  ok(t.indexOf('header.hdr-capturing .wh-drift') > 0, n + ': freeze CSS maujood');
  ok(t.indexOf("hdr.classList.add('hdr-capturing');const hc=await html2canvas") > 0,
     n + ': freeze theek html2canvas se pehle lagta hai');
});

sec('8. purana kaam salaamat');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* ===== table-scroll (10-Oct)') > 0, n + ': table-scroll salaamat');
  ok(t.indexOf('/* ===== col-filter (09-Oct)') > 0, n + ': column filter salaamat');
  ok(t.indexOf('/* donut-fix (09-Oct)') > 0, n + ': donut-fix salaamat');
  ok(t.indexOf('/* si-compact (09-Oct)') > 0, n + ': Sentiment Insights salaamat');
  ok(t.indexOf('try{window.SENT_DAILY=SENT_DAILY;}catch(e){}') > 0, n + ': SENT_DAILY export salaamat');
  ok(t.indexOf('hdr-layout (09-Oct)') > 0, n + ': fixed header wala kaam salaamat');
  /* header ka design naap-tol: ek bhi value nahi badli */
  ok(t.indexOf('header{background:linear-gradient(90deg,#fff1df 0%,#fff6ec 60%,#fff3e4 100%)') > 0, n + ': header ka background wahi');
  ok(t.indexOf('padding:10px 24px') > 0, n + ': padding wahi');
  ok(/\.logo-text\{font-family:'Rajdhani',sans-serif;font-size:17px;font-weight:700;color:#fff/.test(t), n + ': title ka font wahi');
  ok(/\.logo-sub\{font-size:10px/.test(t), n + ': subtitle wahi');
  ok(/\.data-pill\{font-size:11px[^}]*border-radius:7px/.test(t), n + ': chips wahi');
  ok(/\.logo\{display:flex;align-items:center;gap:12px/.test(t), n + ': logo ka gap wahi');
  ok(t.lastIndexOf('</body>') > t.indexOf('header-anim (10-Oct) : logo par click'), n + ': script </body> se pehle');
});

sec('9. dono template me bilkul ek jaisa code');
function block(t, a, b) { const i = t.indexOf(a); const j = t.indexOf(b, i); return t.slice(i, j); }
ok(block(TPL, '/* ===== header-anim (10-Oct)', '</style>') ===
   block(UTPL, '/* ===== header-anim (10-Oct)', '</style>'), 'CSS block byte-ke-byte ek jaisa');
ok(block(TPL, 'header-anim (10-Oct) : logo par click', '</script>') ===
   block(UTPL, 'header-anim (10-Oct) : logo par click', '</script>'), 'JS block byte-ke-byte ek jaisa');
const svg = function (t) { const i = t.indexOf('<svg class="hdr-wh"'); return t.slice(i, t.indexOf('</svg>', i)); };
ok(svg(TPL) === svg(UTPL), 'swoosh SVG byte-ke-byte ek jaisa');

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(function (m) { console.log(' - ' + m); }); process.exit(1); }
