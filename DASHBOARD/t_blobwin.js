/* t_blobwin.js -- 13-Oct: wo poori shreni ki galti jo bar-bar kaat rahi thi.

   DO TARAH KI GALTI, DONO KA PEHRA:

   1. BLOB EK BLOCK ME 'const', ISTEMAAL DOOSRE BLOCK ME
      Har blob (UNI, D, CM_DATA, PARTY_DATA...) apne <script> block ke
      ANDAR 'const' hai -- window par apne aap nahi aata. Doosre block ka
      code jab "typeof PARTY_DATA" poochta hai to use HAMESHA undefined
      milta hai, aur wo chup-chaap aadha-adhoora chalta rehta hai. Kabhi
      error nahi aata, isliye pakad me bhi nahi aata.
      Yahi galti thi: CM ka KPI 50 (52 ki jagah), Leader Board par
      "30 Chief Ministers", AI Assistant ko aadhe aankde, Tracker/Export
      ka Party dropdown khaali, aur range-wise hashtag ka hisaab.

   2. PAKKI LIST SE CHHANTAI
      Level/Category ki pakki list bana kar usse FILTER karna -- jo list
      me nahi, wo chup-chaap gayab. (Isi tarah Handle Analytics me
      Category ki jagah LEVEL dikh rahi thi.) List sirf KRAM ke liye honi
      chahiye.

   Chalao:  node t_blobwin.js                                            */
'use strict';
const fs = require('fs'), path = require('path');
let P = 0, F = 0; const FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. har blob window par hai (chaahe kisi bhi block se poocho)');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  const re = /(const|var|window\.)\s*([A-Za-z_0-9]+)\s*=\s*"__MONGO_([A-Z_]+)__"/g;
  let m, miss = [], all = 0;
  while ((m = re.exec(t))) {
    all++;
    const name = m[2];
    if (m[1] === 'window.') continue;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 400);
    if (after.indexOf('window.' + name) < 0) miss.push(name);
  }
  ok(all >= 14, n + ': ' + all + ' blob mile');
  ok(miss.length === 0, n + ': har blob window par'
     + (miss.length ? '  [chhoot gaye: ' + miss.join(', ') + ']' : ''));
});

sec('2. jahan "typeof BLOB" ka guard hai, wahan blob sach me mil sake');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* kaun-kaun blob hain */
  const blobs = [];
  const re = /(const|var|window\.)\s*([A-Za-z_0-9]+)\s*=\s*"__MONGO_/g;
  let m; while ((m = re.exec(t))) blobs.push(m[2]);
  const bad = [];
  blobs.forEach(function (b) {
    if (t.indexOf('typeof ' + b) < 0) return;          /* guard hi nahi */
    if (t.indexOf('window.' + b) < 0) bad.push(b);      /* guard hai par window par nahi */
  });
  ok(bad.length === 0, n + ': guard wale saare blob window par'
     + (bad.length ? '  [' + bad.join(', ') + ']' : ''));
});
/* wo do jo pehle tod chuke hain -- naam se */
PAIRS.forEach(function (x) {
  ok(x[1].indexOf('try{window.CM_DATA=CM_DATA;}catch(e){}') > 0, x[0] + ': CM_DATA (KPI 50 wali galti)');
  ok(x[1].indexOf('window.PROF=PROF;') > 0, x[0] + ': PROF ("30 Chief Ministers" wali galti)');
});

sec('3. pakki list se chhantai nahi -- sirf kram');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* level chart */
  ok(/const labels=ORD\.filter\(k=>\+LV\[k\]>0\)\s*\.concat\(Object\.keys\(LV\)\.filter\(k=>ORD\.indexOf\(k\)<0/.test(t),
     n + ': level chart me anjaan level bhi aata hai');
  /* parties ka level dropdown */
  ok(t.indexOf('var _lvAll=[];lvPool.forEach(') > 0,
     n + ': level dropdown data se banta hai, LORD sirf kram deti hai');
  ok(!/var levels=LORD\.filter\(function\(l\)\{return lvPool\.some/.test(t),
     n + ': purana "LORD se filter" wala hisaab hat gaya');
});

sec('4. Category har jagah mapping se');
ok(SRV.indexOf('function haCatOf(h)') > 0, 'Handle Analytics: haCatOf (mapping se)');
ok(SRV.indexOf("{ $group: { _id: '$level', n: { $sum: 1 }, tw: { $sum: '$tweets' } } }") < 0,
   'Handle Analytics: Mongo me level par group nahi');
ok(SRV.indexOf('admin-cat (13-Oct)') > 0, 'Admin panel: Category bhi mapping ki saari list se');
ok(SRV.indexOf('var cs = Array.isArray(v.categories) ? v.categories') > 0,
   "Admin panel: 'categories' padhta hai, akeli 'category' nahi");
ok(SRV.indexOf('map.UNI.catStats = _cs;') > 0, 'Dashboard ke card: catStats (Category se)');
ok(SRV.indexOf('_canon[lc]') > 0, "'MLA' / 'Mla' jaisi do spelling ek ki jaati hain");

sec('5. dono template me ye kaam ek jaisa hua hai');
['blob-win (13-Oct)', 'lvl-order (13-Oct)', 'cat-cards (13-Oct)'].forEach(function (k) {
  ok(TPL.indexOf(k) > 0 && UTPL.indexOf(k) > 0, 'dono me: ' + k);
});

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(function (x) { console.log(' - ' + x); }); process.exitCode = 1; }
