/* t_fin4.js -- Sentiment Insights sach me PARTY aur DATE filter maanta hai?
   Yahan asli template ka asli code, asli blob data par chalta hai.
   Chalao:  node t_fin4.js                                               */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL  = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const B = {}; require('./data/dashboard_data.json').forEach(x => { B[x.key] = x.value; });

sec('1. SENT_DAILY window par hai (warna date filter chup-chaap bekaar)');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/const SENT_DAILY = "__MONGO_SENT_DAILY__";/.test(t), n + ': blob waise hi aata hai');
  ok(t.indexOf('try{window.SENT_DAILY=SENT_DAILY;}catch(e){}') > 0,
     n + ': turant window par rakh diya jaata hai');
  const i = t.indexOf('const SENT_DAILY = "__MONGO_SENT_DAILY__";');
  const j = t.indexOf('try{window.SENT_DAILY=SENT_DAILY;}catch(e){}');
  ok(j > i && t.slice(i, j).indexOf('</scr' + 'ipt>') < 0,
     n + ': export USI script block me hai jahan const hai (warna kaam nahi karta)');
  /* D aur UNI ke saath bhi yahi jaal tha -- unka export bhi bana rahe */
  ok(t.indexOf('try{window.UNI=UNI;}catch(e){}') > 0, n + ': UNI ka export bhi salaamat');
  ok(t.indexOf('try{window.D=D;}catch(e){}') > 0, n + ': D ka export bhi salaamat');
  ok(t.indexOf('window.PHD=PHD;window.PHD_DATES=AD;') > 0, n + ': PHD ka export bhi salaamat');
});

sec('2. asli blob par chala kar dekho (All-India)');
const AD = B.D.AD, N = AD.length;
const SD = B.SENT_DAILY;
const CATS = ['probjp', 'antigovt', 'progovt', 'pos', 'neu', 'antibjp', 'neg', 'none'];

function mkSand(from, to, party) {
  const el = { dashParty: { value: party || 'all' }, dashFrom: { value: from }, dashTo: { value: to },
               siRows: null };
  const sand = {
    console: { log() {} }, Math: Math, Date: Date,
    setTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    document: { getElementById: id => el[id] || null, querySelector: () => null,
                querySelectorAll: () => [], addEventListener() {}, readyState: 'complete',
                createElement: () => ({ style: { cssText: '' } }) },
  };
  sand.window = sand; sand.addEventListener = function () {};
  sand.SENT_DAILY = SD;
  sand.UNI = B.UNI;
  sand.PHD_DATES = AD;
  /* PHD = har handle ka per-din tweet count. D.handles me wahi pada hai. */
  const PHD = {}; B.D.handles.forEach(h => { PHD[h.h] = { t: h.t }; });
  sand.PHD = PHD;
  vm.createContext(sand);
  vm.runInContext(TPL.slice(TPL.indexOf('window.SENTX = (function'),
                            TPL.indexOf('/* ---- sentiment cards (8)')), sand);
  const i = TPL.indexOf('<scr' + 'ipt>/* ===== sent-8 + dash-filter (09-Oct)');
  const j = TPL.indexOf('</scr' + 'ipt>', i);
  vm.runInContext(TPL.slice(TPL.indexOf('>', i) + 1, j), sand);
  return sand;
}
function tot(o) { let s = 0; CATS.forEach(k => { s += (+o[k]) || 0; }); return s; }

const FULL_F = AD[0], FULL_T = AD[N - 1];
const D3_F = AD[N - 3], D3_T = AD[N - 1];

/* --- (a) koi party nahi: poori range vs 3 din --- */
const sFull = mkSand(FULL_F, FULL_T).window.sentForFilter();
const s3    = mkSand(D3_F,   D3_T  ).window.sentForFilter();
ok(sFull.ranged === true, 'poori range: SENT_DAILY se gina gaya (UNI.sent wala fallback nahi)');
ok(s3.ranged === true, '3 din: bhi SENT_DAILY se');
ok(tot(s3.s) > 0, '3 din me kuch to hai: ' + tot(s3.s).toLocaleString('en-IN'));
ok(tot(s3.s) < tot(sFull.s),
   'DATE badalne par ginti BADAL gayi: 3 din ' + tot(s3.s).toLocaleString('en-IN')
   + '  vs  poori range ' + tot(sFull.s).toLocaleString('en-IN'));
/* sach me sahi joda? seedha blob se jod kar milao */
(function () {
  const ii = []; SD.dates.forEach((d, k) => { if (d >= D3_F && d <= D3_T) ii.push(k); });
  let want = 0; CATS.forEach(c => ii.forEach(k => { want += (+(SD.S.ALL[c] || [])[k]) || 0; }));
  ok(tot(s3.s) === want, '3 din ka jod blob se bilkul milta hai: ' + want.toLocaleString('en-IN'));
})();
ok(!sFull.approx && !s3.approx, 'party nahi chuni to koi andaza nahi -- seedhi ginti');

/* --- (b) party badalne par --- */
const pr = ['BJP', 'INC', 'SP'].map(p => ({ p: p, r: mkSand(FULL_F, FULL_T, p).window.sentForFilter() }));
pr.forEach(x => ok(tot(x.r.s) > 0, 'party ' + x.p + ' ka apna aankda: ' + tot(x.r.s).toLocaleString('en-IN')));
ok(tot(pr[0].r.s) !== tot(pr[1].r.s) && tot(pr[1].r.s) !== tot(pr[2].r.s),
   'PARTY badalne par ginti BADAL gayi  [' + pr.map(x => x.p + '=' + tot(x.r.s)).join(', ') + ']');
ok(tot(pr[0].r.s) < tot(sFull.s), 'ek party ka aankda poore All-India se chhota hai');
/* BJP poori range = UNI.party.BJP ka hi jod? */
(function () {
  const u = B.UNI.party.BJP; let want = 0; CATS.forEach(c => { want += (+u[c]) || 0; });
  const got = tot(pr[0].r.s);
  ok(Math.abs(got - want) <= Math.max(5, want * 0.02),
     'BJP ka poore daur ka jod UNI.party.BJP se milta hai: ' + got.toLocaleString('en-IN')
     + ' vs ' + want.toLocaleString('en-IN'));
})();

/* --- (c) party + chhoti date range --- */
const bjp3 = mkSand(D3_F, D3_T, 'BJP').window.sentForFilter();
ok(tot(bjp3.s) > 0, 'BJP + 3 din me bhi aankda hai: ' + tot(bjp3.s).toLocaleString('en-IN'));
ok(tot(bjp3.s) < tot(pr[0].r.s),
   'BJP par bhi DATE ka asar hai: 3 din ' + tot(bjp3.s).toLocaleString('en-IN')
   + '  vs  poora daur ' + tot(pr[0].r.s).toLocaleString('en-IN'));
ok(bjp3.approx === true, 'aur us par "approx." ka thappa lagta hai (per-din sentiment party-wise nahi hai)');
ok(pr[0].r.approx === false, 'poore daur par approx nahi (wo pakka aankda hai)');

sec('3. footer sach bolta hai');
(function () {
  function render(from, to, party) {
    const box = { innerHTML: '' };
    const el = { dashParty: { value: party || 'all' }, dashFrom: { value: from },
                 dashTo: { value: to }, siRows: box };
    const sand = {
      console: { log() {} }, Math: Math, Date: Date,
      setTimeout() {}, setInterval() { return 0; }, clearInterval() {},
      document: { getElementById: id => el[id] || null, querySelector: () => null,
                  querySelectorAll: () => [], addEventListener() {}, readyState: 'complete',
                  createElement: () => ({ style: { cssText: '' } }) },
    };
    sand.window = sand; sand.addEventListener = function () {};
    sand.SENT_DAILY = SD; sand.UNI = B.UNI; sand.PHD_DATES = AD;
    const PHD = {}; B.D.handles.forEach(h => { PHD[h.h] = { t: h.t }; });
    sand.PHD = PHD;
    vm.createContext(sand);
    vm.runInContext(TPL.slice(TPL.indexOf('window.SENTX = (function'),
                              TPL.indexOf('/* ---- sentiment cards (8)')), sand);
    const i = TPL.indexOf('<scr' + 'ipt>/* ===== sent-8 + dash-filter (09-Oct)');
    const j = TPL.indexOf('</scr' + 'ipt>', i);
    vm.runInContext(TPL.slice(TPL.indexOf('>', i) + 1, j), sand);
    sand.window.renderSentInsights();
    return box.innerHTML;
  }
  const hFull = render(FULL_F, FULL_T);
  const h3    = render(D3_F, D3_T);
  const hBjp  = render(FULL_F, FULL_T, 'BJP');
  const hBjp3 = render(D3_F, D3_T, 'BJP');
  ok(hFull.indexOf('All parties') > 0 && hFull.indexOf('Full period') > 0,
     'poori range: "All parties · Full period"');
  ok(h3.indexOf('Full period') < 0 && /\d\d \w\w\w – \d\d \w\w\w/.test(h3),
     '3 din: footer me asli tareekh  [' + (h3.match(/si-foot">([\s\S]{0,120})/) || [])[1] + ']');
  ok(hBjp.indexOf('BJP') > 0 && hBjp.indexOf('Full period') > 0, 'BJP + poori range');
  ok(hBjp.indexOf('approx.') < 0, 'poore daur par approx. nahi');
  ok(hBjp3.indexOf('approx.') > 0, 'BJP + 3 din par approx. likha hai');
  ok(hFull !== h3 && hBjp !== hBjp3 && hFull !== hBjp,
     'chaaron haalat ka card alag-alag dikhta hai (yahi asli shikayat thi)');
  ok((h3.match(/class="si-r"/g) || []).length === 7, '3 din par bhi 7 row');
})();

sec('4. dono template me ek jaisa code');
[['sentForFilter', 'window.sentForFilter=function(){', '  /* "2026-10-03" -> "03 Oct" */'],
 ['renderSentInsights', 'window.renderSentInsights=function(){', '  /* ---------- Tweet Share by Party']
].forEach(function (b) {
  function cut(t) { const i = t.indexOf(b[1]), j = t.indexOf(b[2], i); return (i < 0 || j < 0) ? null : t.slice(i, j); }
  const a = cut(TPL), c = cut(UTPL);
  ok(a && c && a === c, b[0] + ': All-India aur UP byte-to-byte ek jaisa');
});

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(m => console.log(' - ' + m)); process.exit(1); }
