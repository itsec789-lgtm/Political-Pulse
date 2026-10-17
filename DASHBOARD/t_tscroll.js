/* t_tscroll.js -- table-scroll (10-Oct)
   Vyavhaar ki poori jaanch asli Chrome me hui hai
   (SAMPLE_table_scroll\check2.py -- 30 jaanch, template ka ASLI CSS+JS
   nikaal kar; table par scroll = sirf rows, bahar = page).
   Yahan ye dekha jaata hai ki wahi code dono template me theek gaya hai.
   Chalao:  node t_tscroll.js                                            */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL  = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. CSS dono template me');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* ===== table-scroll (10-Oct)') > 0, n + ': nishaan');
  ok(/\.table-scroll\{max-height:var\(--table-max-height,70vh\)/.test(t), n + ': max-height CSS variable se');
  ok(t.indexOf('overscroll-behavior:contain') > 0, n + ': overscroll contain (page nahi khiskta)');
  ok(/\.table-scroll\{[^}]*overflow:auto/.test(t), n + ': overflow auto (upar-neeche + dayein-bayein)');
  ok(/\.table-scroll\{[^}]*border-radius:inherit/.test(t), n + ': gol kone bache');
  ok(/\.table-scroll thead th\{position:sticky;top:0/.test(t), n + ': header chipka');
  ok(/\.table-scroll thead th\{[^}]*background:#f8f6f2/.test(t), n + ': header ka thos rang');
  ok(/\.table-scroll thead th\{[^}]*box-shadow:inset 0 -2px 0/.test(t),
     n + ': neeche ki line inset shadow se (sticky me border gayab ho jaata hai)');
  ok(t.indexOf('.table-scroll::-webkit-scrollbar{width:9px') > 0, n + ': patla scrollbar');
  ok(t.indexOf('scrollbar-width:thin') > 0, n + ': Firefox ke liye bhi');
  ok(t.indexOf('-webkit-overflow-scrolling:touch') > 0, n + ': mobile touch scroll');
  ok(/@media print\{\.table-scroll\{max-height:none/.test(t), n + ': print par poori table');
  ok(t.indexOf(':root{--table-max-height:70vh}') > 0, n + ': unchai ek hi jagah se badalti hai');
});

sec('2. JS block dono me, aur bilkul ek jaisa');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('W.tableScroll = { wrap: wrap, scan: scan };') > 0, n + ': component bahar mila');
  ok(t.indexOf('if (W.tableScroll) return;') > 0, n + ': do baar load ho to dubara nahi chalta');
  ok(t.indexOf("box.appendChild(t);") > 0, n + ': SIRF table andar jaata hai');
  ok(t.indexOf("if (ox === 'auto' || ox === 'scroll') host.style.overflowX = 'visible';") > 0,
     n + ': purane dibbe ka overflow hata deta hai (do-do scrollbar na aayein)');
  ok(t.indexOf("var SKIP_IN = ['rpPreview', 'sec-handle-req', 'profileModal', 'aiPanel', 'hrqCheck', 'hrqMine'];") > 0,
     n + ': form/report wali table chhodi gayi');
  ok(t.indexOf("p.classList.contains('table-scroll')") > 0, n + ': dobara nahi lapetta');
  ok(t.indexOf('new MutationObserver') > 0, n + ': baad me bani table bhi lapeti jaati hai');
});
(function () {
  function cut(t) {
    const i = t.indexOf('<scr' + 'ipt>/* ===== table-scroll (10-Oct)');
    const j = t.indexOf('</scr' + 'ipt>', i);
    return (i < 0 || j < 0) ? null : t.slice(i, j);
  }
  const a = cut(TPL), b = cut(UTPL);
  ok(a && b && a === b, 'All-India aur UP me byte-to-byte ek jaisa');
  let good = true;
  try { new vm.Script(a.replace(/^<scr' \+ 'ipt>/, '').replace(/^<script>/, '')); }
  catch (e) { good = false; console.log('     ' + e.message); }
  ok(good, 'JavaScript sahi hai (vm parse)');
})();
(function () {
  function cutCss(t) {
    const i = t.indexOf('/* ===== table-scroll (10-Oct): har table');
    const j = t.indexOf('@media print{.table-scroll{max-height:none;overflow:visible}}', i);
    return (i < 0 || j < 0) ? null : t.slice(i, j);
  }
  const a = cutCss(TPL), b = cutCss(UTPL);
  ok(a && b && a === b, 'CSS bhi dono me byte-to-byte ek jaisa');
})();

sec('3. col-filter ki patti dibbe ke BAHAR lagti hai');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("if (holder && holder.classList && holder.classList.contains('table-scroll')) {") > 0,
     n + ': patti lagate waqt wrapper ko pehchanta hai');
  ok(t.indexOf('anchor = holder; holder = holder.parentNode;') > 0,
     n + ': patti wrapper se PEHLE lagti hai');
  ok(t.indexOf('holder.insertBefore(bb, anchor);') > 0, n + ': purana seedha insert hat gaya');
  ok(t.indexOf('holder.insertBefore(bb, table);') < 0, n + ': purani line nahi bachi');
});

sec('4. purana kuch toota to nahi');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* ===== col-filter (09-Oct)') > 0, n + ': column filter salaamat');
  ok(t.indexOf('/* donut-fix (09-Oct)') > 0, n + ': donut-fix salaamat');
  ok(t.indexOf('/* si-compact (09-Oct)') > 0, n + ': Sentiment Insights salaamat');
  ok(t.indexOf('try{window.SENT_DAILY=SENT_DAILY;}catch(e){}') > 0, n + ': SENT_DAILY export salaamat');
  ok(t.lastIndexOf('</body>') > t.indexOf('table-scroll (10-Oct)'), n + ': block </body> se pehle');
  /* col-filter pehle chale, phir table-scroll -- taaki patti bahar bane */
  ok(t.indexOf('col-filter (09-Oct)') < t.indexOf('<scr' + 'ipt>/* ===== table-scroll (10-Oct)'),
     n + ': col-filter ka script table-scroll se PEHLE hai');
});

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(function (m) { console.log(' - ' + m); }); process.exit(1); }
