/* t_hacat.js -- 13-Oct: Handle Analytics ki Category bhi MAPPING se.

   Pehle /api/ha/cats Mongo me hi { $group: { _id: '$level' } } karta tha --
   yaani LEVEL, Category nahi. Isliye dropdown me "Others (187)" aur
   "Chief Minister" jaise naam aate the, aur mapping ki asli Category
   (Top Leaders, NOB, Official Page, Media House, Journalist) kahin nahi thi.

   Mongo yahan se nahi milta, isliye server.js ka ASLI haCatOf() nikaal kar
   ASLI mapping par chalaya jaata hai, aur grouping ka wahi hisaab roster par
   dohraya jaata hai.
   Chalao:  node t_hacat.js                                                */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0; const FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'handle_master.json'), 'utf8'));

sec('1. purana level wala group hat gaya');
ok(SRV.indexOf("{ $group: { _id: '$level', n: { $sum: 1 }, tw: { $sum: '$tweets' } } }") < 0,
   "Mongo me '$level' par group nahi hota ab");
ok(SRV.indexOf('function haCatOf(h)') > 0, 'haCatOf() maujood (Category mapping se)');
ok(SRV.indexOf('if (cat && cat !== \'ALL\') find.level = cat;') < 0,
   'handles ki chhantai bhi level se nahi hoti');
ok(SRV.indexOf("rows = rows.filter(function (r) { return haCatOf(r._id) === cat; });") > 0,
   'chhantai ab Category se');
ok(SRV.indexOf('async function haExtraRows()') > 0,
   'Media House / Journalist ke liye alag rows ban jaati hain');
ok(SRV.indexOf('var ex = (await haExtraRows()).filter(function (r) {') > 0,
   'aise handle ka profile bhi khulta hai');

sec('2. asli haCatOf(), asli mapping');
function cut(name) {
  const i = SRV.indexOf('function ' + name + '(');
  let d = 0, j = i;
  for (;;) { const c = SRV[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { j++; break; } } j++; }
  return SRV.slice(i, j);
}
const sand = {
  console: { log() {}, warn() {} }, Object, Array, String, Number, Math, JSON,
  MAPL: { load: () => M }
};
sand.global = sand; vm.createContext(sand);
/* DHYAN: haCatOf akela nahi chalta -- wo _haCanonMap() ko bulata hai
   (ek hi Category ki do spelling ko ek karne ke liye). Sirf haCatOf
   nikaalne par wo andar hi andar fail ho kar khaali laut aata tha, aur
   test "sab theek" keh deta. Isliye dono saath nikalte hain. */
vm.runInContext('var _haCanon = { src: null, map: null };\n'
  + cut('_haCanonMap') + '\n' + cut('haCatOf') + '\nthis.f = haCatOf;', sand);
const catOf = sand.f;

[['narendramodi', 'LS_MP'], ['myogiadityanath', 'MLA'], ['BJP4India', null]].forEach(function (x) {
  const want = x[1] || ((M[x[0]] || {}).categories || [])[0];
  ok(catOf(x[0]) === want, '@' + x[0] + ' -> "' + catOf(x[0]) + '"  (mapping: "' + want + '")');
});
ok(catOf('ApOORVa_NaHi_HaI_Ye') === '', 'mapping me na ho to khaali (list me nahi aayega)');
/* bade-chhote akshar ka farak na pade */
const anyKey = Object.keys(M).find(k => /[A-Z]/.test(k) && !(M[k] || {}).alias_of && ((M[k] || {}).categories || []).length);
ok(catOf(String(anyKey).toLowerCase()) === catOf(anyKey),
   'chhote akshar me likhne par bhi wahi Category (@' + anyKey + ')');
ok(catOf('@' + anyKey) === catOf(anyKey), '"@" lagane par bhi wahi');

sec('3. list me kya-kya aayega (roster par wahi hisaab)');
const B = {};
JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'dashboard_data.json'), 'utf8'))
  .forEach(x => { B[x.key] = x.value; });
const agg = {};
(B.UNI.allHandles || []).forEach(h => {
  const c = catOf(h.h);
  if (!c) return;
  const o = agg[c] || (agg[c] = { n: 0, tw: 0 });
  o.n++; o.tw += (+h.tw) || 0;
});
const names = Object.keys(agg).sort((a, b) => agg[b].tw - agg[a].tw);
console.log('     ' + names.map(c => c + ' (' + agg[c].n + ')').join('  ·  '));
ok(names.length >= 6, 'kai Category aayengi (' + names.length + ')');
ok(names.indexOf('Others') < 0, '"Others" naam ki koi Category nahi (wo LEVEL tha)');
ok(names.indexOf('Chief Minister') < 0, '"Chief Minister" bhi nahi (wo bhi LEVEL hai)');
['MLA', 'LS_MP', 'RS_MP', 'MLC', 'MLA Contestent'].forEach(function (c) {
  ok(names.indexOf(c) >= 0, 'list me: ' + c);
});
/* mapping ki har Category jiska koi handle data me hai, list me honi chahiye */
(function () {
  const have = {};
  (B.UNI.allHandles || []).forEach(h => { const c = catOf(h.h); if (c) have[c] = 1; });
  const miss = Object.keys(have).filter(c => names.indexOf(c) < 0);
  ok(miss.length === 0, 'koi Category chhooti nahi' + (miss.length ? ' [' + miss.join(', ') + ']' : ''));
})();

sec('4. Media House / Journalist ke liye alag raasta');
(function () {
  const mh = Object.keys(M).filter(k => !(M[k] || {}).alias_of
    && ((M[k] || {}).categories || []).some(c => c === 'Media House' || c === 'Journalist'));
  ok(mh.length > 0, 'mapping me ' + mh.length + ' aise handle hain');
  const inRoster = mh.filter(h => (B.UNI.allHandles || [])
    .some(x => String(x.h).toLowerCase() === h.toLowerCase())).length;
  ok(inRoster === 0, 'roster me ek bhi nahi (pipeline inhe chhod deti hai) -- '
     + 'isliye haExtraRows() chahiye hi tha');
  ok(SRV.indexOf('var agg = await mjAgg();') > 0, 'wo rows mjAgg() (Mongo ke jod) se banti hain');
})();

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(x => console.log(' - ' + x)); process.exitCode = 1; }
