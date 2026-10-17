/* t_statekeep.js -- Fix.md item 2 (phase 1): ghante wale reload par
   tab / filter / sort / scroll wapas apni jagah.

   Vyavhaar ki poori jaanch asli Chromium me hui (page banakar, sach me
   reload karke -- 13 jaanch: tab, filter, rows, table ka scroll, sort,
   aur ye ki user ke khud chhoone par restore ruk jaata hai). Wo harness
   container me hai kyunki usme playwright chahiye. Yahan ye dekha jaata
   hai ki wahi block dono template me theek-theek gaya hai.
   Chalao:  node t_statekeep.js                                          */
'use strict';
const fs = require('fs'), path = require('path');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];
let P = 0, F = 0; const bad = [];
function ok(c, n, x) {
  if (c) { P++; console.log('  ok   ' + n); }
  else { F++; bad.push(n); console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + x : '')); }
}
function sec(t) { console.log('\n== ' + t + ' =='); }
function blk(s) {
  const i = s.indexOf('<script>/* ===== state-keep (12-Oct)');
  return i < 0 ? '' : s.slice(i, s.indexOf('</script>', i));
}

sec('1. block dono template me, byte-ke-byte ek jaisa');
PAIRS.forEach(function (x) { ok(blk(x[1]).length > 2000, x[0] + ': block maujood (' + blk(x[1]).length + ' bytes)'); });
ok(blk(TPL) === blk(UTPL), 'dono me bilkul ek jaisa');
PAIRS.forEach(function (x) {
  ok((x[1].match(/state-keep \(12-Oct\)/g) || []).length === 1, x[0] + ': ek hi baar laga hai');
  ok(x[1].lastIndexOf('state-keep (12-Oct)') < x[1].lastIndexOf('</body>'), x[0] + ': </body> se pehle hai');
});

sec('2. kya-kya yaad rakha jaata hai');
const B = blk(TPL);
[['tab', 'tab: curTab()'],
 ['scroll (page)', "y: W.scrollY ||"],
 ['har filter/date/search', "'select[id], input[id][type=\"date\"]"],
 ['Top Leaders ka sort', 'o.sort = W.tlSortKey'],
 ['table ke andar ka scroll', 'o.s[skey(e)] = [e.scrollTop | 0, e.scrollLeft | 0]']
].forEach(function (x) { ok(B.indexOf(x[1]) > 0, 'yaad rehta hai: ' + x[0], x[1]); });

sec('3. nazuk jagah -- yahi cheezein pehle tod chuki hain');
ok(B.indexOf('function curTab()') > 0 && B.indexOf('.page-section.active') > 0,
   'tab DOM se padha jaata hai (currentTab ek script ka let hai, window par nahi aata)');
ok(B.indexOf('W.currentTab') < 0, 'window.currentTab par bharosa nahi kiya gaya');
ok(B.indexOf('function skey(e)') > 0 && B.indexOf("tbody[id]") > 0,
   'scroll-box apni tbody id se pehchana jaata hai (sirf ginti se nahi)');
ok(/if \(!has\) return false;/.test(B),
   'dropdown me value tabhi lagti hai jab wo option sach me maujood ho');
ok(B.indexOf('if (touched) return;') > 0, 'user khud kuch chhue to restore ruk jaata hai');
ok(B.indexOf('var busy = false;') > 0 && B.indexOf('if (busy) return;') > 0,
   'wapas lagate waqt parchi dobara nahi likhti (loop nahi banta)');
ok(B.indexOf("sessionStorage") > 0 && B.indexOf('localStorage') < 0,
   'sessionStorage -- naye tab me saaf page milta hai');
ok(/MAX_AGE = 30 \* 60 \* 1000/.test(B), 'adhe ghante purani parchi phaad di jaati hai');
ok(B.indexOf("e.closest('#sec-handle-req')") > 0,
   'Handle-Request form chhoda gaya hai (bhara hua form wapas nahi bharte)');
ok(/setTimeout\(function \(\) \{ restore\(o\); \}, 500\)/.test(B) &&
   /setTimeout\(function \(\) \{ restore\(o\); \}, 3200\)/.test(B),
   'restore ke kai chakkar (kuch table baad me bharti hain)');

sec('4. ghante wala reload abhi bhi waise ka waisa');
ok(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').indexOf('location.reload();') > 0,
   'server ka version-check wahi reload karta hai (phase 2 me ye hatega)');

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); bad.forEach(function (x) { console.log(' - ' + x); }); process.exitCode = 1; }
