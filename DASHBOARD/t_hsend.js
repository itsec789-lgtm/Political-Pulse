/* t_hsend.js -- "No valid handle in that file." wala bug.
   /check se lauti row DOBARA /submit par jaanchi jaati hai.
   Pehle us row me 'Handle' key hoti hi nahi thi (sirf 'handle'),
   isliye har request "no valid handle" bolkar ruk jaati thi. */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRC = fs.readFileSync('./server.js', 'utf8');
var MAPL = require('./mapping_lib.js');
var TRK = require('./x_scraper.js');
var HREQ = require('./hreq_lib.js');

/* hreqRow ko server.js se nikaal kar waise ka waisa chalate hain */
var m = SRC.match(/function hreqRow\(o, line\) \{[\s\S]*?\n\}/);
var hreqRow = new Function('TRK', 'MAPL', 'HREQ',
  m[0] + '; return hreqRow;')(TRK, MAPL, HREQ);

sec('1. CSV/form wali kacchi row');
var raw = hreqRow({ 'Handle': '@Test_Handle_XYZ', 'Candidate Name': 'A B',
                    'Category': 'MLA', 'State': '-' }, 2);
ok(raw.handle === 'Test_Handle_XYZ', 'handle nikla: ' + raw.handle);
ok(raw.missing.length === 0, 'kuch missing nahi: ' + raw.missing);

sec('2. Wahi row DOBARA (jaise browser /check ke baad bhejta hai)  <-- asli bug');
var again = hreqRow(raw, raw.line);
ok(again.handle === 'Test_Handle_XYZ',
   'dobara jaanchne par bhi handle bacha: "' + again.handle + '"');
ok(again['Candidate Name'] === 'A B', 'baaki column bhi bache');
ok(again['Category'] === 'MLA', 'Category bachi');
ok(again.missing.length === 0, 'dobara bhi kuch missing nahi: ' + again.missing);

sec('3. Teen baar chalane par bhi na bigde (idempotent)');
var third = hreqRow(again, again.line);
ok(third.handle === 'Test_Handle_XYZ', 'teesri baar bhi wahi');

sec('4. Khaali handle ab bhi rukta hai');
var bad = hreqRow({ 'Candidate Name': 'X', 'Category': 'MLA' }, 3);
ok(!bad.handle, 'handle ke bina row ab bhi khaali');
ok(bad.missing.indexOf('Handle') >= 0, 'Handle missing me likha');
var badAgain = hreqRow(bad, 3);
ok(!badAgain.handle, 'dobara par bhi khaali hi rahi (jhoota pass nahi)');

sec('5. submit ka filter');
var clean = [raw, bad].map(function (r, i) { return hreqRow(r, r.line || (i + 2)); })
                      .filter(function (r) { return r.handle; });
ok(clean.length === 1, 'sirf sahi row gayi: ' + clean.length);
ok(clean[0].handle === 'Test_Handle_XYZ', 'wahi handle');

sec('6. Message aur Hindi');
ok(!/No valid handle in that file\./.test(SRC), 'purana "in that file" wala message hat gaya');
ok(/every row needs a handle in the Handle column/.test(SRC), 'naya saaf message');
ok(/get\('handle'\)/.test(SRC), "hreqRow ab 'handle' bhi padhta hai");

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
