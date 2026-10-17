/* t_dupcol.js -- 1) ek handle do spelling me na dikhe
                  2) Handle To Be Added me nayi mapping ke column */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }
var SRC = fs.readFileSync('./server.js', 'utf8');
var UD  = fs.readFileSync('./update_dashboard.py', 'utf8');
var UUD = fs.readFileSync('../UP-DASHBOARD/update_dashboard.py', 'utf8');
var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var UTPL = fs.readFileSync('../UP-DASHBOARD/dashboard.template.html', 'utf8');
var MA  = fs.readFileSync('./mapping_add.py', 'utf8');
var HREQ = require('./hreq_lib.js');

sec('1. Pipeline me hi jud jaate hain (sab jagah ek hi row)');
[['All-India', UD], ['UP', UUD]].forEach(function (x) {
  ok(/def case_merge\(acc, meta, daily\)/.test(x[1]), x[0] + ': case_merge() hai');
  ok(/acc, meta, daily = case_merge\(acc, meta, daily\)/.test(x[1]), x[0] + ': build() me chalta hai');
  /* CALL ka kram dekho, def ka nahi */
  ok(x[1].indexOf('    acc, meta, daily = case_merge(') < x[1].indexOf('    acc, meta, daily = map_gate('),
     x[0] + ': sabse pehle jodta hai, phir baaki kaam');
});
ok(/rec and not rec\.get\('alias_of'\) and k == h/.test(UD),
   'Mapping.xlsx me LIKHI hui spelling sabse pehle (alias nahi)');
ok(/mp_ci\.get\(low\)/.test(UD), 'warna jo mapping me hai wahi');
var RB = fs.readFileSync('./rebuild_mapping.py', 'utf8');
ok(/rec\['alias_of'\] = k/.test(RB), 'mapping me alias par nishaan lagta hai');
ok(/max\(hs, key=lambda h: acc\[h\]\.get\('tw', 0\)\)/.test(UD),
   'mapping me na ho to jiske zyada tweet, wo spelling');
ok(/a\[f\] = a\.get\(f, 0\) \+ v/.test(UD), 'tweet/views/likes jud jaate hain');
ok(/daily2\[\(k, d\)\] = \[x \+ y for x, y in zip/.test(UD), 'har din ka data bhi jud jaata hai');

sec('2. Handle Analytics ki list me bhi (pipeline ka intezaar nahi)');
ok(/var _by = Object\.create\(null\), _order = \[\];/.test(SRC), 'list me jodne wala hissa hai');
ok(/String\(r\.h \|\| ''\)\.trim\(\)\.toLowerCase\(\)/.test(SRC), 'chhote-bade akshar se farak nahi');
ok(/var tw = \(old\.tw \|\| 0\) \+ \(r\.tw \|\| 0\);/.test(SRC), 'ginti jud jaati hai, bantti nahi');
ok(/if \(!old\.inMapping && r\.inMapping\)/.test(SRC), 'mapping wali spelling ko tarjeeh');

/* sach me chala kar dekho */
var blk = SRC.slice(SRC.indexOf('var _by = Object.create(null)'), SRC.indexOf('/* jo LIKHA dikhta hai'));
var merge = new Function('out', blk + '; return out;');
var res = merge([
  { h: 'AmitShah', name: 'Amit Shah', party: 'BJP', tw: 695, vw: 100, lk: 10, followers: 50, inMapping: true },
  { h: 'amitshah', name: 'Amit Shah', party: 'BJP', tw: 626, vw: 50, lk: 5, followers: 40, inMapping: true },
  { h: 'RahulGandhi', name: 'Rahul Gandhi', party: 'INC', tw: 433, vw: 30, lk: 3, followers: 20, inMapping: true }
]);
ok(res.length === 2, 'teen me se do bache (Amit Shah ek baar): ' + res.length);
var a = res.filter(function (r) { return r.h.toLowerCase() === 'amitshah'; })[0];
ok(a.tw === 695 + 626, 'tweet jud gaye: ' + a.tw);
ok(a.vw === 150 && a.lk === 15, 'views/likes bhi jude');
ok(a.followers === 50, 'followers me jo zyada tha wahi');

sec('2b. ASLI spelling bachti hai -- @AmitShah, @amitshah nahi');
/* asli mapping se haMap chala kar dekho ki alias kaun hai */
var haMap = new Function('MAPL',
  (SRC.match(/function haMap\(r\) \{[\s\S]*?\n\}/) || [''])[0] + '; return haMap;')(require('./mapping_lib.js'));
var A = haMap({ h: 'AmitShah', tw: 695 });
var a2 = haMap({ h: 'amitshah', tw: 626 });
ok(A.isAlias === false, '@AmitShah  -> Mapping.xlsx me likha hua (alias nahi)');
ok(a2.isAlias === true, '@amitshah  -> alias hai');
ok(a2.canon === 'AmitShah', 'uska asli roop: ' + a2.canon);

/* chhota wala PEHLE aaye aur uske tweet ZYADA hon -- phir bhi bada jeete */
var res2 = merge([ haMap({ h: 'amitshah', name: 'Amit Shah', tw: 900, vw: 1, lk: 1, followers: 1 }),
                   haMap({ h: 'AmitShah', name: 'Amit Shah', tw: 20, vw: 2, lk: 2, followers: 9 }) ]);
ok(res2.length === 1, 'ek hi row bachi');
ok(res2[0].h === 'AmitShah',
   'zyada tweet chhote wale ke the, phir bhi ASLI spelling rahi: @' + res2[0].h);
ok(res2[0].tw === 920, 'dono ke tweet jud gaye: ' + res2[0].tw);

/* ulta kram bhi */
var res3 = merge([ haMap({ h: 'AmitShah', tw: 20 }), haMap({ h: 'amitshah', tw: 900 }) ]);
ok(res3.length === 1 && res3[0].h === 'AmitShah',
   'kram ulta ho to bhi wahi: @' + res3[0].h);

sec('3. Handle To Be Added -- nayi mapping ke column');
var WANT = ['Handle', 'State', 'AC/PC No', 'AC/PC NAME', 'Candidate Name',
            'Gender', 'Political Party', 'Category', 'Party Designation',
            'Admin Designation'];
ok(JSON.stringify(HREQ.COLS) === JSON.stringify(WANT),
   'column bilkul nayi Mapping jaise: ' + HREQ.COLS.join(', '));
['Locations', 'PC Name', 'Categories', 'Designation'].forEach(function (c) {
  ok(HREQ.COLS.indexOf(c) < 0, 'purana column hat gaya: ' + c);
});
ok(HREQ.COLS.indexOf('Gender') >= 0, 'Gender aa gaya');
ok(HREQ.COLS.indexOf('Admin Designation') >= 0, 'Admin Designation aa gaya');
ok(JSON.stringify(HREQ.REQUIRED) === JSON.stringify(['Candidate Name', 'Category']),
   'zaroori sirf do, baaki me "-" chalta hai');

sec('4. Form, template aur CSV -- teeno ek jaise');
var js = HREQ.script();
var mc = (js.match(/var MANCOLS=(\[[^\]]*\])/) || [])[1];
ok(JSON.stringify(JSON.parse(mc)) === JSON.stringify(WANT), 'haath se bharne wali row bhi wahi');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var m = (x[1].match(/var MANCOLS=(\[[^\]]*\])/) || [])[1];
  ok(m && JSON.stringify(JSON.parse(m)) === JSON.stringify(WANT),
     x[0] + ': template me bhi wahi column');
});
ok(/HREQ\.COLS\.map\(MAPL\.csvCell\)/.test(SRC), 'download wale template me bhi wahi');
ok(/HREQ\.COLS\.forEach/.test(SRC), 'server ki jaanch bhi usi list se');

sec('5. Approve karne par Excel me sahi jagah jaata hai');
ok(/'Political Party', 'Category', 'Party Designation'/.test(MA), 'naye column ki list');
ok(/if c in hdr:/.test(MA), 'sirf wahi column likhta hai jo sheet me sach me hain');
ok(/OLD_COLS = \[/.test(MA), 'purani 9-column Excel bhi chalti hai');
ok(/g\('Political Party', 'Party'\)/.test(MA), 'naya naam na mile to purana padh leta hai');
ok(/seat = g\('AC\/PC NAME', 'AC Name', 'PC Name'\)/.test(MA), 'seat ka naam dono taraf se');

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
