/* t_colf.js -- Explorer jaisa column header filter (09-Oct)
   Vyavhaar ki poori jaanch asli browser me hui hai
   (SAMPLE_col_filters\check2.py -- 38 jaanch, sab paas).
   Yahan ye dekha jaata hai ki wahi code dono template me theek se
   gaya hai aur kuch toota nahi.
   Chalao:  node t_colf.js                                            */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL  = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. CSS dono template me');
['th.cf-h{', '.cf-btn{', 'th.cf-on{', '.cf-pop{', '.cf-pop.show{', '.cf-list{', '.cf-it{',
 '.cf-bar{', '.cf-chip{', '.cf-clr{', '.cf-sort button.on{', '.cf-none{', '.cf-sortmark{'
].forEach(function (k) {
  PAIRS.forEach(function (x) { ok(x[1].indexOf(k) > 0, x[0] + ': CSS ' + k.replace('{', '')); });
});
PAIRS.forEach(function (x) {
  ok(/@media\(max-width:600px\)\{\.cf-pop\{/.test(x[1]), x[0] + ': phone ke liye popup ki chaudai');
  ok(x[1].indexOf('.cf-pop{position:fixed;z-index:9999') > 0,
     x[0] + ': popup fixed + sabse upar (table ke scroll se nahi kat-ta)');
  /* dark theme is baar nahi chahiye thi */
  ok(!/body\.dark\s+\.cf-/.test(x[1]), x[0] + ': col-filter ke liye koi dark-theme rule nahi');
});

sec('2. JS block dono me, aur bilkul ek jaisa');
PAIRS.forEach(function (x) {
  ok(x[1].indexOf('/* ===== col-filter (09-Oct)') > 0, x[0] + ': block maujood');
  ok(x[1].indexOf('W.enableColumnFilters = enable;') > 0, x[0] + ': function bahar mila');
  ok((x[1].match(/W\.enableColumnFilters = enable;/g) || []).length === 1, x[0] + ': sirf ek baar');
  ok(x[1].indexOf('if (W.enableColumnFilters) return;') > 0, x[0] + ': do baar load ho to dubara nahi chalta');
});
(function () {
  function cut(t) {
    var i = t.indexOf('<scr' + 'ipt>/* ===== col-filter (09-Oct)');
    var j = t.indexOf('</scr' + 'ipt>', i);
    return (i < 0 || j < 0) ? null : t.slice(i, j);
  }
  var a = cut(TPL), b = cut(UTPL);
  ok(a && b && a === b, 'All-India aur UP me byte-to-byte ek jaisa');
  ok(a && a.length > 9000, 'block poora gaya (' + (a ? a.length : 0) + ' bytes)');
  /* JS sach me chalne layak hai? */
  var js = a.replace(/^<scr' + 'ipt>/, '').replace(/^<script>/, '');
  var okParse = true;
  try { new vm.Script(js); } catch (e) { okParse = false; console.log('     ' + e.message); }
  ok(okParse, 'JavaScript sahi hai (vm parse)');
})();

sec('3. kaunsi table chhodni hai -- woh list');
PAIRS.forEach(function (x) {
  var n = x[0], t = x[1];
  ['rpPreview', 'sec-handle-req', 'profileModal', 'aiPanel', 'hrqCheck', 'hrqMine']
    .forEach(function (k) { ok(t.indexOf("'" + k + "'") > 0, n + ': skip list me ' + k); });
  /* 12-Oct: mlaBody bhi jud gayi -- uska apna pager sach bolta hai,
     col-filter ki patti sirf is page ki rows ginti thi. */
  ok(/var SKIP_TB = \['hrqManBody', 'haTwBody',[\s\S]*?'mlaBody'\]/.test(t),
     n + ': form, server-paginated aur legislators table chhodi gayi');
  ok(t.indexOf("'mlaBody'") > 0, n + ': legislators table skip list me');
  ok(t.indexOf("tb.querySelector('input,textarea,select')") > 0,
     n + ': jis table me input ho usey haath nahi lagata');
  ok(t.indexOf('return real >= 3;') > 0, n + ': 2-3 row wali chhoti table par filter nahi');
});

sec('4. Indian number (Cr / L / K) samajhta hai');
(function () {
  var i = TPL.indexOf('  function num(v) {'), j = TPL.indexOf('  var MON =', i);
  var src = TPL.slice(i, j);
  ok(src.indexOf('Cr|L|Lac|Lakh|K|M|B') > 0, 'regex me Cr/L/K sab');
  var sand = {}; vm.createContext(sand);
  vm.runInContext(src + '\nthis.f = num;', sand);
  var f = sand.f;
  [['2.35 Cr', 23500000], ['1.80 L', 180000], ['4.2K', 4200], ['12,345', 12345],
   ['1.2M', 1200000], ['-', NaN], ['—', NaN], ['', NaN], ['0', 0], ['987', 987]
  ].forEach(function (c) {
    var got = f(c[0]);
    var good = isNaN(c[1]) ? isNaN(got) : got === c[1];
    ok(good, 'num(' + JSON.stringify(c[0]) + ') = ' + got + (good ? '' : ' (chahiye ' + c[1] + ')'));
  });
})();

sec('5. tareekh (jo table me dikhti hai) samajhta hai');
(function () {
  var i = TPL.indexOf('  var MON = { jan:1'), j = TPL.indexOf('  function esc(s) {', i);
  var sand = {}; vm.createContext(sand);
  vm.runInContext(TPL.slice(i, j) + '\nthis.f = iso;', sand);
  var f = sand.f;
  [['2026-10-09', '2026-10-09'], ['09 Oct 2026', '2026-10-09'], ['9 October 2026', '2026-10-09'],
   ['09/10/2026', '2026-10-09'], ['BJP', ''], ['', '']].forEach(function (c) {
    ok(f(c[0]) === c[1], 'iso(' + JSON.stringify(c[0]) + ') = ' + JSON.stringify(f(c[0])));
  });
})();

sec('6. purani cheezein waise ki waisi');
PAIRS.forEach(function (x) {
  var n = x[0], t = x[1];
  ok(t.indexOf('id="leadersBody"') > 0 && t.indexOf('id="mainTableBody"') > 0, n + ': dono badi table waise hi');
  ok(t.indexOf('/* donut-fix (09-Oct)') > 0, n + ': donut-fix bacha hua');
  ok(t.indexOf('/* si-compact (09-Oct)') > 0, n + ': Sentiment Insights bacha hua');
  ok(t.indexOf('try{window.SENT_DAILY=SENT_DAILY;}catch(e){}') > 0, n + ': SENT_DAILY export bacha hua');
  ok(t.lastIndexOf('</body>') > t.indexOf('col-filter (09-Oct)'), n + ': block </body> se pehle');
});

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(function (m) { console.log(' - ' + m); }); process.exit(1); }
