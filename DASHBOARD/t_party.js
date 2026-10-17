/* t_party.js -- Parties tab ka "Top 5" ab sach me aankdo se banta hai
   Chalao:  node t_party.js                                                 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. HTML me likhe hue (hardcoded) party card hat gaye');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('id="pcard-') < 0, n + ': koi hardcoded card nahi bacha');
  ok(t.indexOf('class="pcard pc-bjp"') < 0, n + ': BJP wala bhi nahi');
  /* 10-Oct (5) parties-v2: card ab #pfCards me bante hain, purana
     #partyCardsSection poori tarah hata diya gaya. */
  ok(t.indexOf('id="pfCards"') > 0, n + ': card rakhne ki jagah maujood hai (#pfCards)');
  ok(t.indexOf('id="partyCardsSection"') < 0, n + ': purana #partyCardsSection hat gaya');
  const sec2 = t.slice(t.indexOf('id="pfCards"'), t.indexOf('id="pfCards"') + 400);
  ok(sec2.indexOf('Loading') > 0, n + ': shuru me sirf "Loading…" (purane naam nahi)');
});

sec('2. Tab khulte hi card dobara bante hain');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* 10-Oct (5): ab ek hi renderer -- window.pfRender() */
  ok(t.indexOf("if(tab==='parties'){/* parties-v2") > 0 && t.indexOf('window.pfRender&&window.pfRender()') > 0,
     n + ': switchTab("parties") par pfRender()');
  ok(t.indexOf("try{renderPartyCards();}catch(e){console.warn('partyCards',e);}\n") > 0,
     n + ': page khulte waqt bhi, apne try me');
  ok(t.indexOf("try{window.renderPartyTweetChart();}catch(e){}") > 0,
     n + ': ek chart gir jaaye to card phir bhi banein');
});

sec('3. Ranking se khaali/junk party hatt gayi');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('if(!h.party||JUNK[h.party])return;') > 0, n + ': "-", "Unknown", khaali -- ginti me nahi');
  ok(/const JUNK=\{'-':1,'Unknown':1,'Nominated':1,'':1,'None':1\}/.test(t), n + ': JUNK ki list maujood');
  ok(/sort\(function \(?x, ?y\)? ?\{ ?return y\.tw ?- ?x\.tw/.test(t) || t.indexOf('return y.tw-x.tw;') > 0,
     n + ': ranking tweets se (sabse zyada upar)');
  ok(t.indexOf("slice(0,(state==='ALL'&&!level)?5:6)") > 0, n + ': All-India par 5, state par 6');
});

sec('4. ASLI data par partyRows() chala kar dekho');
(function () {
  /* server jaisa: pehle mapGate (party/state mapping se) */
  const b = SRV.indexOf('function mapGate(map) {');
  let i = SRV.indexOf('{', b), d = 0, e = -1;
  for (let j = i; j < SRV.length; j++) { if (SRV[j] === '{') d++; else if (SRV[j] === '}') { d--; if (!d) { e = j + 1; break; } } }
  const MAPL = require('./mapping_lib.js');
  function removedSet() {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'mapping_removed.json'), 'utf8'));
      const s = Object.create(null);
      (j.handles || []).forEach(h => s[String(h).trim().replace(/^@/, '').toLowerCase()] = 1);
      return s;
    } catch (e2) { return Object.create(null); }
  }
  const gate = new Function('MAPL', 'removedSet', 'console', 'fs', 'path', '__dirname',
    SRV.slice(b, e) + ';return mapGate;')(MAPL, removedSet, { log() {}, warn() {} }, fs, path, __dirname);
  let blob = null;
  try { blob = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'dashboard_data.json'), 'utf8')); } catch (e3) {}
  if (!blob) { ok(false, 'dashboard_data.json padhi nahi gayi'); return; }
  const map = {}; blob.forEach(x => map[x.key] = x.value);
  gate(map);

  const src = TPL.match(/function partyRows\(state,level,party\)\{[\s\S]*?\n/)[0];
  const SX = { blank: () => ({ pos: 0, neu: 0, neg: 0, probjp: 0, antibjp: 0, progovt: 0, antigovt: 0, none: 0 }),
               CATS: [{ k: 'pos' }, { k: 'neu' }, { k: 'neg' }, { k: 'probjp' }, { k: 'antibjp' },
                      { k: 'progovt' }, { k: 'antigovt' }, { k: 'none' }],
               n: (o, k) => +o[k] || 0 };
  const sb = { UNI: map.UNI, console: { log() {} }, pParty: '',
               JUNK: { '-': 1, 'Unknown': 1, 'Nominated': 1, '': 1, 'None': 1 } };
  sb.window = { SENTX: SX };
  vm.createContext(sb);
  vm.runInContext(src + '\nthis.f=partyRows;', sb);

  /* asli ginti khud alag se nikaalo aur milao */
  const tw = {};
  map.UNI.allHandles.forEach(h => {
    const p = h.party;
    if (!p || sb.JUNK[p]) return;
    tw[p] = (tw[p] || 0) + (+h.tw || 0);
  });
  const truth = Object.keys(tw).sort((a, b2) => tw[b2] - tw[a]);

  const rows = sb.f('ALL', '');
  const got = rows.map(r => r.p);
  console.log('     partyRows: ' + got.join(', '));
  console.log('     asli top5 : ' + truth.slice(0, 5).join(', '));
  ok(got.length === 5, 'All-India par theek 5 party  [' + got.length + ']');
  ok(got.join('|') === truth.slice(0, 5).join('|'), 'wahi 5 jo aankdo me sabse upar hain');
  ok(got.indexOf('TDP') >= 0, 'TDP (asli #3) ab list me hai -- pehle HTML me tha hi nahi');
  ok(got.indexOf('DMK') < 0, 'DMK (asli #8) ab galat se upar nahi aata');
  ok(got.indexOf('OTHER') < 0, '"OTHER" naam ka koi card nahi');
  ok(rows.every(r => r.tw > 0 && r.h > 0), 'har card ke apne tweets aur handle hain');
  for (let k = 1; k < rows.length; k++) ok(rows[k - 1].tw >= rows[k].tw, 'kram theek: #' + k + ' >= #' + (k + 1));
  ok(got.every(p => !sb.JUNK[p]), 'koi khaali/"-" wali party list me nahi');

  /* ek state chuno -> us state ke andar ki ginti */
  const st = 'Uttar Pradesh';
  const upRows = sb.f(st, '');
  const twU = {};
  map.UNI.allHandles.forEach(h => {
    if (h.state !== st) return;
    const p = h.party; if (!p || sb.JUNK[p]) return;
    twU[p] = (twU[p] || 0) + (+h.tw || 0);
  });
  const truthU = Object.keys(twU).sort((a, b2) => twU[b2] - twU[a]).slice(0, 6);
  console.log('     UP me     : ' + upRows.map(r => r.p).join(', '));
  ok(upRows.map(r => r.p).join('|') === truthU.join('|'),
     'state chunne par USI state ki ginti se kram banta hai');
  ok(upRows.length <= 6, 'state par 6 tak');
})();


sec('5. State chunte hi usi state ki party (All-India list nahi)');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* 10-Oct (5) parties-v2: parties tab ka State ab #pfState hai aur
     onchange attribute ki jagah addEventListener se juda hai; uske baad
     cascade() + render() dono chalte hain. Neeche wala upParties() ab
     bhi UP tab ke liye zinda hai, isliye uski jaanch waisi hi rahi. */
  ok(t.indexOf('id="pfState"') > 0 &&
     t.indexOf("on('pfState', 'change', function () { PF.state = this.value || 'ALL'; refresh(); });") > 0,
     n + ': STATE badalte hi naya filter chalta hai');
  ok(t.indexOf('id="pStateSelect"') < 0, n + ': purana pStateSelect hat gaya');
  const i = t.indexOf('window.upParties=function');
  const fn = t.slice(i, i + 700);
  ok(fn.indexOf('pState=v') > 0, n + ': chuna hua state yaad rakhta hai');
  ok(fn.indexOf('renderPartyCards()') > 0, n + ': card turant dobara bante hain');
  ok(fn.indexOf('partyRows(pState,pLevel)') > 0, n + ': ginti usi state ki hoti hai');
  ok(t.indexOf("slice(0,(state==='ALL'&&!level)?5:6)") > 0,
     n + ': state par 6 tak (yaani kam se kam top 5 to aa hi jaayein)');
});

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
