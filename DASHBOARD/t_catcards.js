/* t_catcards.js -- 13-Oct
     1. Dashboard ki strip ab CATEGORY se banti hai, apne aap
     2. card ke neeche ki ginti = Mapping.xlsx me us Category ke unique handle
     3. CM / Dy CM ke card Admin Designation se (wo Category hain hi nahi)
     4. Top Leaders me Category ka koi role nahi -- sirf data se rank

   server.js ka ASLI mapGate() nikaal kar ASLI blob par chalaya jaata hai,
   aur jo ginti wo banata hai use handle_master se dobara gin kar milaya
   jaata hai. Browser me bhi chalakar dekha gaya hai (alag harness).
   Chalao:  node t_catcards.js                                            */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0; const FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'handle_master.json'), 'utf8'));

sec('1. purani pakki strip hat gayi');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('id="lvStrip"') > 0, n + ': khaali dabba <div id="lvStrip"> maujood');
  ok(t.indexOf('id="lvLSMP"') < 0 && t.indexOf('id="lvOthers"') < 0,
     n + ': markup me likhe hue 8 card hat gaye');
  ok(t.indexOf('cat-cards (13-Oct)') > 0, n + ': naya block maujood');
  ok(t.indexOf('Total Tweets by Category') > 0, n + ': heading "Total Tweets by Category"');
  ok(t.indexOf("'LS MP':['lvLSMP','lvLSMPh']") < 0, n + ': hMore ka purana level wala hisaab hat gaya');
});
/* dono template me block byte-ke-byte ek jaisa */
function blk(s) {
  const i = s.indexOf('<script>/* ===== cat-cards (13-Oct)');
  return i < 0 ? '' : s.slice(i, s.indexOf('</script>', i));
}
ok(blk(TPL).length > 1500 && blk(TPL) === blk(UTPL), 'dono template me block bilkul ek jaisa');

sec('2. server.js catStats / admStats banata hai');
[['UNI.catStats', 'map.UNI.catStats = _cs;'],
 ['UNI.admStats', 'map.UNI.admStats = _as;'],
 ['har handle par uski category', 'function _fixCat(a, key)'],
 ['alias ko ginti me nahi lete', 'if (!rec.alias_of) {']
].forEach(function (x) { ok(SRV.indexOf(x[1]) > 0, x[0]); });

sec('3. asli mapGate, asli data -- ginti sach hai?');
function cutMapGate() {
  const i = SRV.indexOf('function mapGate(map) {');
  let d = 0, j = i;
  for (;;) { const c = SRV[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { j++; break; } } j++; }
  return SRV.slice(i, j);
}
const low = {}; Object.keys(M).forEach(k => { low[k.toLowerCase()] = M[k]; });
const B = {};
JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'dashboard_data.json'), 'utf8'))
  .forEach(x => { B[x.key] = JSON.parse(JSON.stringify(x.value)); });
B.PHD = {}; (B.D.handles || []).forEach(h => { B.PHD[h.h] = { t: h.t, v: h.v, k: [], r: [] }; });
const sand = {
  console: { log() {}, warn() {} }, Object, Array, String, Number, Math, JSON,
  MAPL: { stats: () => ({ handles: Object.keys(M).length }), load: () => M,
          has: h => !!low[String(h || '').toLowerCase()] },
  removedSet: () => ({})
};
sand.global = sand; vm.createContext(sand);
vm.runInContext(cutMapGate() + '\nthis.f = mapGate;', sand);
sand.f(B);
const CS = (B.UNI && B.UNI.catStats) || {}, AS = (B.UNI && B.UNI.admStats) || {};
ok(Object.keys(CS).length >= 5, 'catStats bani (' + Object.keys(CS).length + ' category)');
console.log('     ' + Object.keys(CS).sort().map(k => k + ':' + CS[k].map).join('  '));

/* mapping se dobara gin kar milao -- yahi card ki "N handles" wali ginti hai */
const want = {}, seenH = {};
Object.keys(M).forEach(k => {
  const rec = M[k] || {};
  if (rec.alias_of) return;
  /* EK handle, EK ginti. Mapping me 6 handle do spelling me pade hain
     (jaise PRupala aur Prupala, HukkeriGanesh aur hukkeriganesh) -- wo
     ek hi aadmi hai, do nahi. Server bhi chhote akshar wale naam par
     ginta hai; test bhi wahi kare, warna 3,794 banam 3,789 ka jhootha
     farak aata hai. */
  const lowk = String(k).toLowerCase();
  let cs = Array.isArray(rec.categories) ? rec.categories.slice()
         : (rec.category && rec.category !== '-' ? [rec.category] : []);
  cs = cs.filter(c => c && c !== '-');
  if (!cs.length) return;
  /* dono spelling ki Category JOD kar, phir ek baar ginti --
     bilkul wahi niyam jo server lagata hai */
  seenH[lowk] = seenH[lowk] || [];
  cs.forEach(c => { if (seenH[lowk].indexOf(c) < 0) seenH[lowk].push(c); });
});
/* cat-canon (13-Oct): ek hi Category do spelling me mil sakti hai
   ('MLA' aur 'Mla' -- purani Excel se bache hue chand handle). Server
   zyada chalne wali spelling sab par laga deta hai, taaki strip par do
   card na banein. Test bhi wahi niyam lagata hai. */
const spell = {};
Object.keys(seenH).forEach(lowk => {
  seenH[lowk].forEach(c => {
    const lc = c.toLowerCase();
    (spell[lc] = spell[lc] || {})[c] = (spell[lc][c] || 0) + 1;
  });
});
const canon = {};
Object.keys(spell).forEach(lc => {
  canon[lc] = Object.keys(spell[lc]).sort((a, b) => spell[lc][b] - spell[lc][a])[0];
});
Object.keys(seenH).forEach(lowk => {
  const done = {};
  seenH[lowk].forEach(c => {
    const v = canon[c.toLowerCase()] || c;
    if (done[v]) return;
    done[v] = 1;
    want[v] = (want[v] || 0) + 1;
  });
});
const miss = Object.keys(want).filter(c => (CS[c] || {}).map !== want[c]);
ok(miss.length === 0, 'har Category ki ginti mapping se milti hai'
   + (miss.length ? '  [' + miss.slice(0, 3).map(c => c + ': ' + (CS[c] || {}).map + ' vs ' + want[c]).join(', ') + ']' : ''));
ok(Object.keys(CS).length === Object.keys(want).length,
   'utni hi category jitni mapping me (' + Object.keys(want).length + ')');

/* live ginti aur tweets asli blob se */
const liveCnt = {}, liveTw = {};
(B.UNI.allHandles || []).forEach(h => {
  (h.cats || []).forEach(c => {
    liveCnt[c] = (liveCnt[c] || 0) + 1;
    liveTw[c] = (liveTw[c] || 0) + ((+h.tw) || 0);
  });
});
const badLive = Object.keys(CS).filter(c => (CS[c].live || 0) !== (liveCnt[c] || 0)
                                        || (CS[c].tw || 0) !== (liveTw[c] || 0));
ok(badLive.length === 0, 'har Category ke tweets/live handle blob se milte hain'
   + (badLive.length ? '  [' + badLive.slice(0, 3).join(', ') + ']' : ''));
ok(Object.keys(CS).every(c => CS[c].live <= CS[c].map),
   'data wale handle mapping wale se zyada kabhi nahi');

sec('4. CM / Dy CM ke card Admin Designation se');
let wCM = 0, wDy = 0;
Object.keys(M).forEach(k => {
  const rec = M[k] || {}; if (rec.alias_of) return;
  const ls = rec.levels || [];
  if (ls.indexOf('CM') >= 0) wCM++;
  if (ls.indexOf('Dy CM') >= 0) wDy++;
});
ok((AS['Chief Minister'] || {}).map === wCM, 'Chief Ministers = ' + wCM + '  [mila ' + (AS['Chief Minister'] || {}).map + ']');
ok((AS['Dy CM'] || {}).map === wDy, 'Dy CMs = ' + wDy + '  [mila ' + (AS['Dy CM'] || {}).map + ']');
ok(!CS['Chief Minister'] && !CS['Dy CM'], 'ye Category me nahi hain (wahi to baat hai)');

sec('5. nayi Category apne aap card ban jaayegi');
/* allmap (13-Oct): ab do list hain -- MAIN (upar ki strip) aur baaki sab
   Others ke section me. */
ok(TPL.indexOf("var MAIN = ['LS_MP', 'RS_MP', 'MLA', 'MLC', 'Chief Minister', 'Dy CM', 'MLA Contestent']") > 0,
   'upar ki strip ki pakki list (MAIN)');
ok(TPL.indexOf('id="lvOtherStrip"') > 0 && TPL.indexOf('id="lvOtherWrap"') > 0,
   'Others ka apna section maujood');
ok(/var rest = keys\.filter\(function \(k\) \{ return MAIN\.indexOf\(k\) < 0; \}\);/.test(TPL),
   'MAIN ke bahar ki har Category (nayi bhi) Others me chali jaati hai');
ok(/function col\(k\)/.test(TPL) && TPL.indexOf('naam se hi ek pakka rang') > 0,
   'anjaan Category ko bhi rang mil jaata hai');
ok(TPL.indexOf("var LBL = { 'LS_MP': 'LS MP'") > 0, 'dikhne wale naam ki list');
ok(TPL.indexOf('keys.length') > 0 && TPL.indexOf('gridTemplateColumns') > 0,
   'card jitne hon, strip utni chaudi ban jaati hai');

sec('5b. Top Leaders ka CARD kahin nahi, aur Media/Journalist Mongo se');
ok(TPL.indexOf("var HIDE = ['Top Leaders'];") > 0, 'Top Leaders ka card chhupa hua hai');
ok(/if \(HIDE\.indexOf\(k\) >= 0\) return false;/.test(TPL), 'HIDE strip me sach me lagta hai');
ok(!!CS['Top Leaders'], 'par Category khud mapping me bani hui hai (sirf card nahi banta)');
/* Media House / Journalist: pipeline inhe roster se chhod deti hai
   (update_dashboard.py me EXCLUDE_CAT), isliye card par 0 aata tha.
   Ab server Mongo se seedha jod laata hai -- sirf card ke liye. */
[['per-handle jod ka function', 'async function mjAgg()'],
 ['sirf in do Category', "Category: { $in: ['Media House', 'Journalist'] }"],
 ['page banate waqt map me', "map['MJAGG'] = await mjAgg();"],
 ['card me jud jaata hai', 'var _mj = map.MJAGG || {};'],
 ['roster me jo pehle se hai use dobara nahi ginte', 'if (_seenH[low]) return;']
].forEach(function (x) { ok(SRV.indexOf(x[1]) > 0, 'mj-agg: ' + x[0]); });
/* ye jod kisi aur ginti ko chhoota nahi */
(function () {
  const B2 = {};
  JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'dashboard_data.json'), 'utf8'))
    .forEach(x => { B2[x.key] = JSON.parse(JSON.stringify(x.value)); });
  B2.PHD = {}; (B2.D.handles || []).forEach(h => { B2.PHD[h.h] = { t: h.t, v: h.v, k: [], r: [] }; });
  /* nakli jod: har Media House / Journalist handle par 1000 tweet */
  B2.MJAGG = {};
  Object.keys(M).forEach(k => {
    const r = M[k] || {}; if (r.alias_of) return;
    const cs = r.categories || [];
    if (cs.indexOf('Media House') >= 0 || cs.indexOf('Journalist') >= 0)
      B2.MJAGG[k.toLowerCase()] = { tw: 1000, vw: 5000000 };
  });
  const sand2 = {
    console: { log() {}, warn() {} }, Object, Array, String, Number, Math, JSON,
    MAPL: { stats: () => ({ handles: Object.keys(M).length }), load: () => M,
            has: h => !!low[String(h || '').toLowerCase()] },
    removedSet: () => ({})
  };
  sand2.global = sand2; vm.createContext(sand2);
  vm.runInContext(cutMapGate() + '\nthis.f = mapGate;', sand2);
  sand2.f(B2);
  const C2 = B2.UNI.catStats || {};
  const mh = C2['Media House'] || {}, jr = C2['Journalist'] || {};
  ok((mh.tw || 0) > 0 && mh.live === mh.map,
     'Media House ab 0 nahi (' + mh.tw + ' tweets, ' + mh.live + '/' + mh.map + ' handle)');
  ok((jr.tw || 0) > 0, 'Journalist bhi (' + jr.tw + ' tweets)');
  /* sabse zaroori: roster aur grand total ko haath nahi laga */
  ok(B2.UNI.allHandles.length === B.UNI.allHandles.length,
     'roster waisa ka waisa (' + B2.UNI.allHandles.length + ')');
  const sum = a => a.reduce((s, h) => s + ((+h.tw) || 0), 0);
  ok(sum(B2.UNI.allHandles) === sum(B.UNI.allHandles),
     'kul tweets me koi farak nahi -- jod sirf card par lagta hai');
  ok((C2['MLA'] || {}).tw === (CS['MLA'] || {}).tw, 'MLA ka card bhi waisa hi');
})();

sec('6. Top Leaders -- Category ka koi role nahi');
ok(TPL.indexOf('_LPOOL') > 0 && /var src = \(typeof UNI !== 'undefined'[\s\S]{0,120}UNI\.allHandles/.test(TPL),
   'leaderPool poore roster se banta hai (UNI.allHandles)');
(function () {
  const i = TPL.indexOf('id="sec-top-leaders"');
  const j = TPL.indexOf('<div class="page-section"', i + 10);
  const b = TPL.slice(i, j);
  ok(b.indexOf('Top Leaders') < 0 || b.indexOf('category') < 0,
     'us tab ke markup me Category ka filter nahi');
  ok(b.indexOf('tlSortMenu') > 0, 'sort ka menu maujood (tweets / views / avg views)');
})();
/* asli blob par: table me kai Category mil-jul kar aati hain */
(function () {
  const pool = (B.UNI.allHandles || []).slice()
    .filter(h => (+h.tw || 0) > 0)
    .sort((a, b) => (+b.vw || 0) - (+a.vw || 0)).slice(0, 50);
  const cats = {}; pool.forEach(h => { (h.cats || ['-']).forEach(c => cats[c] = 1); });
  ok(Object.keys(cats).length > 1,
     'top 50 me kai Category mil-jul kar (' + Object.keys(cats).sort().join(', ') + ')');
  const tl = pool.filter(h => (h.cats || []).indexOf('Top Leaders') >= 0).length;
  ok(tl < pool.length, 'sirf "Top Leaders" Category wale nahi (' + tl + '/50)');
})();

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(x => console.log(' - ' + x)); process.exitCode = 1; }
