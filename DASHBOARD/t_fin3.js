/* t_fin3.js -- 09-Oct ka aakhri batch:
     1. Tweet Share by Party ka donut wapas aaya (arcs gayab nahi hote)
     2. Dashboard ka saara UI text English
     3. Sentiment Insights compact -- 7 row, "No-Sentiment" nahi, English
   Chalao:  node t_fin3.js                                                  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL  = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const SRV  = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

/* ------------------------------------------------------------------ */
sec('1. Donut: party filter ab ovRefresh() ke andar, cache nahi');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* donut-fix (09-Oct)') > 0, n + ': donut-fix nishaan maujood');
  ok(t.indexOf('_allLabels') < 0 && t.indexOf('_allData') < 0 && t.indexOf('_allBg') < 0,
     n + ': purana cache (_allLabels/_allData/_allBg) poori tarah hat gaya');
  const ovf = t.slice(t.indexOf('window.ovFilterCharts=function()'),
                      t.indexOf('function refreshAll()'));
  ok(ovf.length > 50, n + ': ovFilterCharts mila');
  ok(ovf.indexOf("chartBy('ov_party')") < 0, n + ': ovFilterCharts ov_party ko chhoota hi nahi');
  ok(ovf.indexOf("chartBy('ov_sent')") > 0, n + ': Sentiment Mix waise hi chalta hai');
});

sec('2. Donut ka asli code chala kar dekho (vm me)');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  const i = t.indexOf('if(chParty){var _pv=allKeys.map(');
  const j = t.indexOf('chParty.update();}', i);
  ok(i > 0 && j > i, n + ': chParty wala asli snippet mila');
  const snip = t.slice(i, j + 'chParty.update();}'.length);

  function run(party, bg) {
    const keys = ['BJP', 'INC', 'TDP', 'SP', 'AAP'];
    const ch = { data: { labels: keys.slice(), datasets: [{ data: [], backgroundColor: bg, offset: [] }] },
                 _upd: 0, update: function () { this._upd++; } };
    const sand = {
      chParty: ch, allKeys: keys, p: party,
      idx: [0, 1, 2],
      D: { partyDaily: { BJP: { t: [10, 10, 10] }, INC: { t: [5, 5, 5] }, TDP: { t: [3, 0, 0] },
                         SP: { t: [2, 0, 0] }, AAP: { t: [1, 0, 0] } } },
      sr: function (a, ix) { return ix.reduce(function (s, k) { return s + (a[k] || 0); }, 0); },
      pc: function (k) { return '#' + k.length + '00000'; }
    };
    vm.createContext(sand);
    vm.runInContext(snip, sand);
    return ch;
  }
  /* (a) backgroundColor ek asli array hai */
  let c = run('all', ['#1', '#2', '#3', '#4', '#5']);
  ok(c.data.labels.length === 5, n + ' (all/array): paanchon label bache');
  ok(c.data.datasets[0].data.join(',') === '30,15,3,2,1', n + ' (all/array): asli aankde bhare');
  ok(c.data.datasets[0].data.every(function (v) { return typeof v === 'number'; }),
     n + ' (all/array): koi khaali/undefined value nahi -- arcs dikhenge');
  ok(c.data.datasets[0].backgroundColor.length === 5, n + ' (all/array): paanchon rang');
  ok(c._upd === 1, n + ' (all/array): update() ek baar');

  /* (b) backgroundColor undefined -- pehle yahin arcs mit jaate the */
  c = run('all', undefined);
  ok(c.data.datasets[0].data.join(',') === '30,15,3,2,1', n + ' (all/undefined bg): aankde phir bhi bhare');
  ok(Array.isArray(c.data.datasets[0].backgroundColor) && c.data.datasets[0].backgroundColor.length === 5,
     n + ' (all/undefined bg): rang khud ban gaye');

  /* (c) backgroundColor ek function (Chart.js aisa bhi deta hai) */
  c = run('all', function () { return '#000'; });
  ok(c.data.datasets[0].data.join(',') === '30,15,3,2,1', n + ' (all/function bg): aankde bhare');
  ok(Array.isArray(c.data.datasets[0].backgroundColor), n + ' (all/function bg): array me badal gaya');

  /* (d) ek party chuni -- sirf wahi slice */
  c = run('INC', ['#1', '#2', '#3', '#4', '#5']);
  ok(c.data.labels.length === 1 && c.data.labels[0] === 'INC', n + ' (INC): sirf INC ka label');
  ok(c.data.datasets[0].data.length === 1 && c.data.datasets[0].data[0] === 15, n + ' (INC): uska aankda');
  ok(c.data.datasets[0].backgroundColor.length === 1, n + ' (INC): ek hi rang');
  ok(c.data.datasets[0].offset.join(',') === '0', n + ' (INC): offset 0 (slice bahar nahi nikla)');

  /* (e) party jo list me hi nahi -- khaali nahi, poora chart */
  c = run('XYZ', ['#1', '#2', '#3', '#4', '#5']);
  ok(c.data.labels.length === 5 && c.data.datasets[0].data[0] === 30,
     n + ' (anjaan party): chart khaali nahi hota, poora dikhta hai');

  /* (f) do baar chalne par bhi waisa hi (cache ka asar nahi) */
  const keys = ['BJP', 'INC'];
  const ch2 = { data: { labels: [], datasets: [{ data: [], backgroundColor: [], offset: [] }] },
                update: function () {} };
  const sand2 = { chParty: ch2, allKeys: keys, p: 'all', idx: [0],
    D: { partyDaily: { BJP: { t: [7] }, INC: { t: [4] } } },
    sr: function (a, ix) { return ix.reduce(function (s, k) { return s + (a[k] || 0); }, 0); },
    pc: function () { return '#abc'; } };
  vm.createContext(sand2);
  vm.runInContext(snip, sand2);            /* pehli baar: data khaali tha */
  vm.runInContext(snip, sand2);            /* doosri baar */
  ok(ch2.data.datasets[0].data.join(',') === '7,4',
     n + ': dobara chalne par bhi aankde bache (yehi purana bug tha)');
});

/* ------------------------------------------------------------------ */
sec('3. Sentiment Insights: compact list ka CSS');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* si-compact (09-Oct)') > 0, n + ': si-compact nishaan');
  ['.si-list{', '.si-r{', '.si-dot{', '.si-trk{', '.si-pc{', '.si-vl{', '.si-foot{'].forEach(function (c) {
    ok(t.indexOf(c) > 0, n + ': CSS ' + c.replace('{', '') + ' maujood');
  });
  ok(/@media\(max-width:620px\)\{\.si-r\{/.test(t), n + ': chhoti screen ke liye media query');
  ok(t.indexOf('.si-trk,.si-vl{display:none}') > 0, n + ': phone par bar/ginti chhup jaati hai');
  ok(t.indexOf('body.dark .si-trk{') > 0, n + ': dark theme ka bhi khayal');
  ok(t.indexOf('<div id="siRows"></div>') > 0, n + ': card khaali hai, JS bharta hai');
  ok(/\.si-r\{display:grid/.test(t), n + ': row grid hai (ek line me sab)');
});

sec('4. Purana 3-line wala siCard code band');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("var si = document.getElementById('siCard')") < 0,
     n + ': hExecRange ab siCard par likhta nahi');
  ok(t.indexOf("var si=document.getElementById('siCard')") < 0,
     n + ': hExec bhi nahi');
  ok((t.match(/if\(window\.renderSentInsights\) window\.renderSentInsights\(\);/g) || []).length === 2,
     n + ': dono jagah se renderSentInsights() bulaya jaata hai');
  ok(t.indexOf('of all tweets are Neutral') > 0 ? t.indexOf('var si = null') > 0 : true,
     n + ': purani lines dead code me hain');
});

sec('5. renderSentInsights() asli code chala kar dekho');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* SENTX aur sent-8 block -- dono asli file se */
  const sx = t.slice(t.indexOf('window.SENTX = (function ()'), t.indexOf('/* ---- sentiment cards (8)'));
  const i = t.indexOf("<script>/* ===== sent-8 + dash-filter (09-Oct)");
  const j = t.indexOf('</scr' + 'ipt>', i);
  ok(sx.length > 100 && i > 0 && j > i, n + ': dono block mile');
  const blk = t.slice(t.indexOf('>', i) + 1, j);

  function El() { this.children = []; this.innerHTML = ''; this.style = { cssText: '' }; this.className = ''; }
  El.prototype.querySelector = function () { return null; };
  El.prototype.querySelectorAll = function () { return []; };
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.removeChild = function (c) { return c; };
  El.prototype.addEventListener = function () {};
  const siRows = new El();
  const ids = { siRows: siRows, dashParty: { value: 'all', addEventListener: function () {} },
                dashFrom: { value: '' }, dashTo: { value: '' } };
  const sand = {
    console: console, setTimeout: function () {}, setInterval: function () { return 0; },
    clearInterval: function () {}, Math: Math, Date: Date,
    document: { getElementById: function (k) { return ids[k] || null; },
                querySelector: function () { return null; },
                querySelectorAll: function () { return []; },
                addEventListener: function () {}, readyState: 'complete',
                createElement: function () { return new El(); } }
  };
  sand.addEventListener = function () {};
  sand.window = sand;
  vm.createContext(sand);
  vm.runInContext(sx, sand);
  /* ek bana-banaya sentiment set -- none ki ginti jaanbujh kar badi */
  sand.UNI = { sent: { probjp: 400, antibjp: 100, progovt: 200, antigovt: 50,
                       pos: 150, neg: 60, neu: 40, none: 1000 } };
  vm.runInContext(blk, sand);
  ok(typeof sand.window.renderSentInsights === 'function', n + ': renderSentInsights bana');
  sand.window.renderSentInsights();
  const h = siRows.innerHTML;
  ok(h.indexOf('si-list') > 0, n + ': si-list wrapper bana');
  const rows = (h.match(/class="si-r"/g) || []).length;
  ok(rows === 7, n + ': theek 7 row (No-Sentiment chhod kar) -- mila ' + rows);
  ok(h.indexOf('No-Sentiment') < 0, n + ': "No-Sentiment" kahin nahi');
  ok(!/No sentiment/i.test(h), n + ': koi "No sentiment" jaisa empty-state bhi nahi');
  /* 1000 wala none hat gaya -> jod 1000 hona chahiye, na ki 2000 */
  ok(h.indexOf('<strong>1,000</strong> tweets carry a sentiment label') > 0,
     n + ': footer me sirf label wale tweet gine gaye (none bahar)');
  const pcs = (h.match(/>(\d+\.\d)%</g) || []).map(function (s) { return parseFloat(s.slice(1)); });
  ok(pcs.length === 7, n + ': saat percentage');
  const sum = pcs.reduce(function (a, b) { return a + b; }, 0);
  ok(Math.abs(sum - 100) < 0.5, n + ': percentage ka jod 100 (mila ' + sum.toFixed(1) + ')');
  ok(h.indexOf('>Pro-BJP<') > 0 && h.indexOf('40.0%') > 0, n + ': sabse bada Pro-BJP 40.0%');
  ok(h.indexOf('class="si-r" title="Pro-BJP — Speaks in favour of the BJP') > 0,
     n + ': matlab English tooltip me');
  ok(h.indexOf('hover a row for its definition') > 0, n + ': footer me hint');
  /* height ka sabse bada kaaran: do-line wala row. Ab ek hi line. */
  ok(h.indexOf('insight-row') < 0, n + ': purane mote insight-row nahi');
  ok(h.indexOf('&#931;') < 0, n + ': alag Sigma row bhi hat gaya (height bachi)');
});

/* ------------------------------------------------------------------ */
sec('6. UI text English -- koi Hinglish nahi bacha');
const HING = [
  'nayi khabrein', 'Aur dikhao', 'Kuch nahi mila', 'Is filter par koi',
  'Data nahi aaya', 'Abhi data nahi', 'Server purana chal raha',
  'Server ne JSON nahi bheja', 'Soch raha hoon', 'Namaste! Main is dashboard',
  'Neeche ke sujhav', 'Nahi ho paya', 'Koi jawaab nahi mila', 'Report ban raha hai',
  'Topic, keyword ya hashtag daalo', 'Sabse zyada dohrayi', 'Sawal / maang',
  'Samarthan me (positive)', 'Aalochna me (negative)', 'Neutral / khabar',
  'Public Overview &mdash; log is topic', 'Narrative Words (keyword ke saath',
  'isliye count nahi dikhaya gaya', 'koi viral tweet nahi mila',
  'Is keyword par koi tweet nahi mila', 'Is period me data nahi', 'Koi tweet nahi.',
  'Kuch bhi poochho', 'X se profile dobara uthao', 'X se profile nahi aayi',
  'Ye handle X par nahi mila', 'X ne abhi rate-limit', 'X ne cookie reject',
  'Abhi isi handle ki koshish', 'Photo / cover ke liye', '(auth_token, ct0, twid) bhar do',
  'Kuch column sirf kuch hi tweets', 'Aausat sirf unhi tweets', 'warna aausat patla',
  'ka data database me hai hi nahi', 'sabse zyada active', 'Dono ek hi tweet data',
  'Date filter lagao', 'banta jaayega', 'poora daur', 'chuni hui range',
  'chuni hui date range', 'tweets ka sentiment gina gaya', 'per-din sentiment party-wise',
  'BJP ya uske netao', 'Sarkar ke kaam/neeti', 'Aam taur par', 'Soochna/tathya',
  'Jinka sentiment tay nahi', 'Popup block ho gaya', 'live server band hai',
  'is context ki baseline mili', 'kitne number track ho rahe', 'abhi kitne badge banne',
  'chhupe hue element bhi gine', 'localStorage chal raha hai', 'tweets jinke Views',
  'tweets jinka data toota', 'har column me kitni row', '(abhi koi nahi)',
  'dikhaye', 'START_LIVE.bat dobara chalao'
];
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* comment hata kar dekho -- comment me Hinglish rehne do, UI me nahi */
  const noC = t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  HING.forEach(function (s) { ok(noC.indexOf(s) < 0, n + ': UI me "' + s + '" nahi bacha'); });
  ok(!/[ऀ-ॿ]/.test(t), n + ': Devanagari ka ek bhi akshar nahi');
  /* badle hue English text waqai maujood */
  ['New stories', 'Show more', 'Nothing found', 'No tweet matched this filter',
   'Thinking', 'Generating report', 'Supportive (positive)', 'Critical (negative)',
   'Most repeated themes', 'so no count is shown', 'Ask anything',
   'Reload profile from X', 'Speaks in favour of the BJP or its leaders',
   'Informational or factual'].forEach(function (s) {
    ok(t.indexOf(s) > 0, n + ': English text "' + s + '" aa gaya');
  });
});

sec('7. server.js ka browser-wala text bhi English');
[['Mapping sync is stuck', 'msBar ki heading'],
 ['the handle counts below come from the', 'msBar ki wajah'],
 ['Fix: run DASHBOARD\\\\RUN_MAPPING_UPDATE.bat', 'msBar ka ilaaj'],
 ['Dashboard could not be loaded', 'error page'],
 ['Your session has expired. Please refresh the page.', 'login khatm'],
 ['You do not have permission to view UP data.', 'UP ki ijazat'],
 ['This handle is not part of this dashboard.', 'anjaan handle'],
 ['Answer in ENGLISH, using only those figures.', 'AI ab English me jawaab deta hai'],
 ['write 5-7 sharp, actionable insights in ENGLISH', 'report ke insights bhi English']
].forEach(function (p) { ok(SRV.indexOf(p[0]) > 0, 'server.js: ' + p[1]); });
['Mapping sync ruki hui hai', 'Dashboard load nahi ho paya', 'Login khatm ho gaya',
 'ijazat nahi', 'HINGLISH me jawaab', 'HINGLISH me likh', 'Sawaal likho',
 'AI key nahi mili', 'Groq ka jawaab samajh nahi aaya', 'ruk kar dobara poochho'
].forEach(function (s) { ok(SRV.indexOf(s) < 0, 'server.js: "' + s + '" hat gaya'); });

/* ------------------------------------------------------------------ */
sec('8. Dono template ke naye block ek jaise');
[['si-compact CSS', '/* si-compact (09-Oct)', '@media(max-width:620px)'],
 ['renderSentInsights', 'window.renderSentInsights=function(){', '/* ---------- Tweet Share by Party'],
 ['donut-fix', '/* donut-fix (09-Oct)', 'chParty.update();}']
].forEach(function (b) {
  function cut(t) {
    const i = t.indexOf(b[1]), j = t.indexOf(b[2], i);
    return (i < 0 || j < 0) ? null : t.slice(i, j);
  }
  const a = cut(TPL), c = cut(UTPL);
  ok(a && c && a === c, b[0] + ': All-India aur UP me byte-to-byte ek jaisa');
});

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(function (m) { console.log(' - ' + m); }); process.exit(1); }
