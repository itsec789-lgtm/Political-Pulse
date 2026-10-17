/* t_meta.js -- 09-Oct ke 6 badlaav
     1 sidebar ka teer thoda aur neeche
     2 header se Download PDF button hata
     3 Parties tab ka Top 5 mapping se
     4 Leader Board ka Party column mapping se
     5 Breaking News wali safai-line hati
     6 Top Leaders me State dikhne laga
   Chalao:  node t_meta.js                                                  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. Sidebar ka teer thoda aur neeche');
ok(SRV.indexOf("#navMore{position:sticky;bottom:-10px;") > 0, 'sticky ab bottom:-10px par');
ok(SRV.indexOf("margin:10px -12px -18px;padding:13px 0 18px;") > 0, 'margin/padding bhi neeche khiska');
ok(SRV.indexOf("bottom:0;z-index:5;display:none") < 0, 'purana bottom:0 hat gaya');
ok(SRV.indexOf('#navMore.on{display:flex}') > 0, 'dikhne wala niyam waisa hi (sirf zaroorat par)');

sec('2. Header se Download PDF button hat gaya');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('class="download-btn"') < 0, n + ': button ka HTML nahi bacha');
  ok(t.indexOf('onclick="downloadPDF()"') < 0, n + ': uska click bhi nahi');
  const hd = t.slice(t.indexOf('<div class="hdr-right">'), t.indexOf('</header>'));
  ok(hd.indexOf('Download') < 0, n + ': header me kahin "Download" likha hi nahi');
  ok(t.indexOf('id="rpDownload"') > 0,
     n + ': Reports tab ka apna download button chhua nahi gaya (wo alag cheez hai)');
  ok(hd.indexOf('updPill') > 0 && hd.indexOf('dataPill') > 0,
     n + ': baaki dono pill header me waise hi hain');
});

sec('3. Breaking News wali safai-line hati');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('Media house') < 0, n + ': wo line nahi bachi');
  ok(t.indexOf('koi bahar ka news source nahi') < 0, n + ': uska doosra hissa bhi nahi');
  const bn = t.slice(t.indexOf('id="sec-breaking"'), t.indexOf('id="sec-breaking"') + 400);
  ok(bn.indexOf('Breaking News') > 0, n + ': tab ka heading waisa hi hai');
  ok(bn.indexOf('bnCats') > 0, n + ': category wali patti bhi waisi hi');
});

sec('4. party / state / seat ab MAPPING se (server.js)');
ok(SRV.indexOf('var seat = _real(rec.pc_name) || _real(rec.ac_name)') > 0, 'seat mapping se banti hai');
ok(SRV.indexOf('if (m.party && r.party !== undefined) r.party = m.party;') > 0, 'party theek hoti hai');
ok(SRV.indexOf('if (m.state && r.state !== undefined) r.state = m.state;') > 0, 'state theek hoti hai');
/* allmap (13-Oct): pehle seat/naam SIRF tab bharte the jab blob me khaali
   hon. Yaani Excel me seat sudhaarne par bhi purani seat dikhti rehti thi.
   Ab mapping hamesha jeetti hai -- "mapping hi sach hai" ka seedha matlab. */
ok(SRV.indexOf("if (r.loc !== undefined) r.loc = m.seat;") > 0, 'allHandles ka loc mapping se');
ok(SRV.indexOf("if (r.pcName !== undefined) r.pcName = m.seat;") > 0, 'HANDLES ka pcName bhi');
ok(SRV.indexOf("if (m.name && r.name !== undefined) r.name = m.name;") > 0, 'naam bhi mapping se');
ok(SRV.indexOf("_fix(map.CM_DATA, 'handle');") > 0, 'CM_DATA par bhi mapping chipakti hai');
ok(SRV.indexOf('function _real(v)') > 0, 'khaali/"-" ko khaali hi maanta hai');

sec('5. ASLI data par mapGate() chala kar dekho');
(function () {
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

  /* purane blob jaisa bigaad kar dekho */
  const spoil = map.UNI.allHandles.slice(0, 6);
  spoil.forEach(r => { r.party = 'PURANI'; r.state = ''; r.loc = ''; });
  const blankBefore = map.UNI.allHandles.filter(r => !r.state || r.state === '-').length;

  gate(map);

  const by = {}; map.UNI.allHandles.forEach(r => by[r.h] = r);
  ok(by['narendramodi'] && by['narendramodi'].party === 'BJP',
     'party theek hui  [' + (by['narendramodi'] || {}).party + ']');
  ok(by['RahulGandhi'] && by['RahulGandhi'].party === 'INC', 'doosri party bhi theek');
  ok(by['narendramodi'] && by['narendramodi'].state === 'Uttar Pradesh',
     'state bhar gaya  [' + (by['narendramodi'] || {}).state + ']');
  ok(by['narendramodi'] && by['narendramodi'].loc === 'Varanasi',
     'seat ka naam bhi  [' + (by['narendramodi'] || {}).loc + ']');
  const blankAfter = map.UNI.allHandles.filter(r => !r.state || r.state === '-').length;
  console.log('     state khaali: pehle ' + blankBefore + ' -> ab ' + blankAfter);
  ok(blankAfter < blankBefore, 'khaali state kam hue (Top Leaders me State dikhega)');
  ok(blankAfter === 0, 'ab ek bhi handle bina state ke nahi');

  /* Top 5 parties -- wahi jo partyRows() nikalta hai */
  const tw = {};
  map.UNI.allHandles.forEach(r => { const p = r.party || '-'; tw[p] = (tw[p] || 0) + (+r.tw || 0); });
  const top5 = Object.keys(tw).sort((a, b2) => tw[b2] - tw[a]).slice(0, 5);
  console.log('     Top 5: ' + top5.join(', '));
  ok(top5.indexOf('PURANI') < 0, 'Top 5 me koi purani/galat party nahi');
  ok(top5[0] === 'BJP', 'sabse upar BJP  [' + top5[0] + ']');
  ok(top5.every(p => p && p !== '-'), 'koi khaali party Top 5 me nahi');

  /* Leader Board (PROF) bhi inhi rows se banta hai */
  const cms = map.UNI.allHandles.filter(r => r.level === 'Chief Minister');
  ok(cms.length > 0 && cms.every(r => r.party && r.party !== '-'),
     'Leader Board ke har CM ki party bhari hui hai  [' + cms.length + ' CM]');
  ok(cms.every(r => r.state && r.state !== '-'), 'unka state bhi');
})();

sec('6. Leader Board / Top Leaders inhi fields ko dikhate hain');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* up-terms (12-Oct): ye cell ab seedha h.state nahi padhta. UP me har
     handle ka state 'Uttar Pradesh' hi hai, isliye wahan ye column
     District (h.loc) dikhata hai. Field window.ROW_LOC_F se aata hai --
     All-India par 'state', UP par 'loc' -- aur state fallback bana hua
     hai. Test ab wahi dhaancha jaanchta hai. */
  ok(/\$\{escH\(h\[window\.ROW_LOC_F\|\|'state'\]\|\|h\.state\|\|'—'\)\}/.test(t),
     n + ': Top Leaders ka location cell ROW_LOC_F se, state fallback ke saath');
  ok(/window\.ROW_LOC_F\s*=\s*'(state|loc)'/.test(t),
     n + ': us template ki ROW_LOC_F config maujood hai');
  ok(t.indexOf("if (o.pcName == null || o.pcName === '') o.pcName = h.loc || '';") > 0,
     n + ': seat ka naam loc se aata hai');
  /* prof-map (13-Oct): Leader Board ab CM_DATA (mapping) se banta hai --
     pehle sirf un CM ka tha jinke tweet aaye the, isliye wahan 30 aur
     States & CM table me 31 dikhte the. Number phir bhi allHandles se
     jodte hain (jiska data nahi uske 0). */
  ok(t.indexOf("(window.CM_DATA||[]).forEach(function(c){") > 0,
     n + ': Leader Board CM_DATA (mapping) se banta hai');
  ok(t.indexOf("var byH={};UNI.allHandles.forEach(") > 0,
     n + ': number asli data se jud jaate hain');
});

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
