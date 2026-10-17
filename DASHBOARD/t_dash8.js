/* t_dash8.js -- 09-Oct ke 7 badlaav (Breaking News chip se Sentiment Insights tak)
   Chalao:  node t_dash8.js                                                  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. Breaking News se "DELAYED 10 hours" wali chip hati');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('id="bnLive"') < 0, n + ': chip ka element nahi bacha');
  ok(t.indexOf('id="bnLiveTx"') < 0, n + ': uska text bhi nahi');
  ok(t.indexOf('id="bnDot"') < 0, n + ': rang wala dot bhi nahi');
  ok(t.indexOf("function bnFresh(") > 0 && t.indexOf("if (!dot || !tx) return;") > 0,
     n + ': bnFresh() khud chup ho jaata hai (gir nahi jaata)');
  ok(t.indexOf('id="bnFeed"') > 0 && t.indexOf('id="bnCats"') > 0, n + ': baaki Breaking News waisa hi');
});

sec('2. Tab badalte hi page sabse upar');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/function switchTab\(tab\)\{currentTab=tab;[\s\S]{0,400}window\.scrollTo\(0,0\)/.test(t),
     n + ': switchTab me sabse pehle scrollTo(0,0)');
  ok(t.indexOf('document.scrollingElement.scrollTop=0') > 0, n + ': purane browser ke liye bhi');
  ok(t.indexOf('if(document.body)document.body.scrollTop=0;}catch(e){}') > 0, n + ': try me lipta hai');
});

sec('3. Parties ka sentiment chart ab Hashtags wala hi');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  const i = t.indexOf('/* party-sent (09-Oct)');
  const j = t.indexOf('window.renderPartiesPartyViewsChart=function()', i);
  ok(i > 0 && j > i, n + ': naya chart function mila');
  const src = t.slice(i, j);
  ok(/X\.datasets\(r\)/.test(src), n + ': wahi X.datasets() jo Hashtag chart me hai');
  ok(/stacked:true/.test(src) && (src.match(/stacked:true/g) || []).length === 2,
     n + ': dono axis stacked (Hashtag wale jaisa)');
  ok(/datalabels:\{display:false\}/.test(src), n + ': datalabels band -- wahi settings');
  ok(src.indexOf("mk('Neutral','neu'") < 0, n + ': purana sirf-3-wala chart hat gaya');
  ok(/if\(selParty\)r=r\.filter/.test(src), n + ': party chuni ho to sirf wahi party');
  const hs = t.slice(t.indexOf('function renderHashSentChart()'), t.indexOf('function renderHashSentChart()') + 900);
  ok(/X\.datasets\(rows\)/.test(hs), n + ': Hashtag chart bhi wahi tareeka use karta hai');
});

sec('4. 8 sentiment + unke matlab');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('var DEF = {') > 0, n + ': har sentiment ka matlab likha hai');
  ok(t.indexOf('DEF: DEF, def: def') > 0, n + ': bahar se bhi mil jaata hai');
  ok(t.indexOf('id="siRows"') > 0, n + ': card ab JS se bharta hai');
  ok(t.indexOf('window.renderSentInsights=function()') > 0, n + ': banane wala function hai');
});
(function () {
  const i = TPL.indexOf('window.SENTX = (function');
  const j = TPL.indexOf('})();', i) + 5;
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext('(function(window){' + TPL.slice(i, j) + '})(this.window)', sb);
  const X = sb.window.SENTX;
  ok(X.CATS.length === 8, 'poore 8 sentiment  [' + X.CATS.length + ']');
  ok(X.CATS.every(c => (X.def(c.k) || '').length > 10), 'har ek ka matlab likha hai');
  console.log('     ' + X.CATS.map(c => c.label).join(', '));
})();

sec('5. Sentiment Insights ko ASLI me chala kar dekho');
(function () {
  const m = TPL.match(/<script>\/\* ===== sent-8 \+ dash-filter[\s\S]*?<\/script>/);
  ok(!!m, 'naya block mila');
  const js = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  /* SENTX bhi chahiye */
  const i = TPL.indexOf('window.SENTX = (function'), j = TPL.indexOf('})();', i) + 5;

  function mkBox() { return { innerHTML: '', querySelector: () => null, appendChild() {} }; }
  const siRows = mkBox();
  const AE = { addEventListener() {} };
  const els = { siRows: Object.assign(siRows, AE),
                dashParty: Object.assign({ value: 'all' }, AE),
                dashFrom: Object.assign({ value: '2026-04-02' }, AE),
                dashTo: Object.assign({ value: '2026-04-03' }, AE) };
  const sb = {
    console: { log() {} },
    document: {
      getElementById: id => els[id] || null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: { cssText: '' }, textContent: '', className: '' }),
      addEventListener() {}, readyState: 'complete',
    },
    setInterval() {}, clearInterval() {}, setTimeout() {},
  };
  sb.window = sb;
  sb.window.addEventListener = function () {};
  sb.SENT_DAILY = { dates: ['2026-04-01', '2026-04-02', '2026-04-03'],
    S: { ALL: { probjp: [1, 2, 0], antigovt: [0, 1, 0], progovt: [0, 0, 3], pos: [5, 0, 0],
                neu: [10, 4, 1], antibjp: [0, 0, 0], neg: [1, 0, 0], none: [0, 0, 0] } } };
  sb.UNI = { allHandles: [
    { h: 'a', party: 'BJP', probjp: 7, neu: 3, pos: 0, neg: 0, antigovt: 0, progovt: 0, antibjp: 0, none: 0 },
    { h: 'b', party: 'INC', probjp: 0, neu: 1, pos: 0, neg: 5, antigovt: 2, progovt: 0, antibjp: 0, none: 0 },
  ], sent: {} };
  sb.PHD_DATES = ['2026-04-01', '2026-04-02', '2026-04-03'];
  vm.createContext(sb);
  vm.runInContext('(function(window){' + TPL.slice(i, j) + '})(this)', sb);
  vm.runInContext(js, sb);
  sb.window.renderSentInsights();

  const html = siRows.innerHTML;
  /* si-compact (09-Oct): ab 8 nahi, 7 row -- "No-Sentiment" jaanbujh kar
     bahar, aur Sigma wali alag line bhi nahi (card chhota rakhna tha).  */
  ok((html.match(/class="si-r"/g) || []).length === 7, '7 sentiment row  [' +
     (html.match(/class="si-r"/g) || []).length + ']');
  ok(html.indexOf('Pro-BJP') > 0 && html.indexOf('No-Sentiment') < 0,
     'saat naam dikhte hain, "No-Sentiment" nahi');
  ok(html.indexOf('Informational or factual') > 0, 'matlab (English me) tooltip me');
  /* 02-03 Apr: neu 4+1=5, progovt 3, probjp 2, antigovt 1 -> kul 11 */
  ok(html.indexOf('<strong>11</strong> tweets carry a sentiment label') > 0,
     'sirf chuni hui DATE ka jod (11)  [' + (html.match(/<strong>([\d,]+)<\/strong> tweets carry/) || [])[1] + ']');
  ok(html.indexOf('>Neutral<') < html.indexOf('>Pro-Govt<'), 'sabse bada sentiment sabse upar');

  /* ab party chuno */
  els.dashParty.value = 'BJP';
  sb.window.renderSentInsights();
  const h2 = siRows.innerHTML;
  ok(h2.indexOf('<strong>10</strong> tweets carry a sentiment label') > 0,
     'BJP chunne par sirf BJP ka sentiment (7+3=10)');
  ok(h2.indexOf('&middot; BJP &middot; Full period') > 0, 'footer me likha hai ki sirf BJP ka hai');
})();

sec('6. Tweet Share by Party + Sentiment Mix par party filter');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('window.ovFilterCharts=function()') > 0, n + ': dono chart ko filter karne wala function');
  /* donut-fix (09-Oct): ov_party ka filter ovRefresh() ke andar chala gaya --
     yahan cache rakhne se donut ke arcs gayab ho jaate the. */
  ok(t.indexOf("chartBy('ov_party')") < 0, n + ': ov_party ko ovFilterCharts chhoota nahi');
  ok(t.indexOf('/* donut-fix (09-Oct)') > 0, n + ': Tweet Share by Party ovRefresh me chhanta hai');
  ok(t.indexOf("chartBy('ov_sent')") > 0, n + ': Sentiment Mix bhi');
  /* trigger-fix (09-Oct): wrapper ab ek hi helper wrap() se lagte hain,
     aur try/finally me -- andar kuch gir bhi jaaye to refreshAll chhoota
     nahi. Upar se ek 400ms ka pehredaar bhi hai. */
  ok(/wrap\('ovRefresh'\); wrap\('hExecRange'\); wrap\('renderDashDate'\); wrap\('updateLevelStrip'\);/.test(t),
     n + ': chaaron render function ke baad chalta hai');
  ok(t.indexOf('try{ return f.apply(this,arguments); } finally { refreshAll(); }') > 0,
     n + ': finally me, isliye kabhi chhootta nahi');
  ok(t.indexOf('setInterval(guard,400)') > 0, n + ': 400ms ka pehredaar bhi laga hai');
});
(function () {
  const m = TPL.match(/<script>\/\* ===== sent-8 \+ dash-filter[\s\S]*?<\/script>/);
  const js = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  const i = TPL.indexOf('window.SENTX = (function'), j = TPL.indexOf('})();', i) + 5;
  const ovParty = { data: { labels: ['BJP', 'INC', 'SP'], datasets: [{ data: [100, 50, 10], backgroundColor: ['a', 'b', 'c'] }] }, update() { this._u = (this._u || 0) + 1; } };
  const ovSent = { data: { labels: [], datasets: [{ data: [] }] }, update() {} };
  const AE2 = { addEventListener() {} };
  const els = { dashParty: Object.assign({ value: 'INC' }, AE2),
                dashFrom: Object.assign({ value: '' }, AE2),
                dashTo: Object.assign({ value: '' }, AE2),
                ov_party: 'EL1', ov_sent: 'EL2', siRows: null };
  const sb = {
    console: { log() {} },
    document: { getElementById: id => els[id] || null, querySelector: () => null,
                querySelectorAll: () => [], createElement: () => ({ style: {} }),
                addEventListener() {}, readyState: 'complete' },
    setInterval() {}, clearInterval() {}, setTimeout() {},
    Chart: { getChart: el => (el === 'EL1' ? ovParty : (el === 'EL2' ? ovSent : null)) },
  };
  sb.window = sb; sb.window.addEventListener = function () {};
  sb.UNI = { allHandles: [{ h: 'b', party: 'INC', neu: 4, pos: 1, probjp: 0, neg: 0, antigovt: 0, progovt: 0, antibjp: 0, none: 0 }], sent: {} };
  sb.SENT_DAILY = null; sb.PHD_DATES = [];
  vm.createContext(sb);
  vm.runInContext('(function(window){' + TPL.slice(i, j) + '})(this)', sb);
  vm.runInContext(js, sb);
  sb.window.ovFilterCharts();
  /* donut ko ovFilterCharts hilata hi nahi -- INC chuni ho ya na ho */
  ok(ovParty.data.labels.join() === 'BJP,INC,SP',
     'INC chunne par bhi ovFilterCharts donut ke label nahi badalta  [' + ovParty.data.labels.join(',') + ']');
  ok(ovParty.data.datasets[0].data.join() === '100,50,10',
     'donut ke aankde salaamat (arcs gayab nahi)  [' + ovParty.data.datasets[0].data + ']');
  ok(!ovParty._u, 'donut par update() bhi nahi chala');
  ok(ovSent.data.datasets[0].data.reduce((a, b) => a + b, 0) === 5,
     'Sentiment Mix bhi sirf INC ka (4+1=5)');
  /* ab "all" par wapas -- donut phir bhi waisa hi */
  els.dashParty.value = 'all';
  sb.window.ovFilterCharts();
  ok(ovParty.data.labels.join() === 'BJP,INC,SP', '"All" par bhi saari party');
  ok(ovParty.data.datasets[0].data.join() === '100,50,10', 'aankde waise ke waise');
})();

sec('7. Executive Summary par bhi party filter');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("_dp = (document.getElementById('dashParty') || {}).value") > 0,
     n + ': hExecRange party padhta hai');
  ok(t.indexOf('if (_dp && h.p !== _dp) return;') > 0, n + ': doosri party ke handle chhant jaate hain');
});

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
