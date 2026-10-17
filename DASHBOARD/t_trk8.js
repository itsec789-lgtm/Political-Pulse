/* t_trk8.js -- "naya handle scrape karun to kya ye mujhse mapping maangega?"
   Isi sawaal ka seedha test. */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var TS = require('./tracker_section.js');
var SRV = fs.readFileSync('./server.js', 'utf8');
var J = TS.script(), H = TS.section('tracker');

sec('1. Sidebar par badge');
ok(/trkmap: trkPend \|\| 0/.test(SRV), 'badge me pending handle ki ginti jaati hai');
ok(/countDocuments\(\{\}\)/.test(SRV), 'ginti countDocuments se (halki query)');
ok(/catch \(e\) \{ trkPend = 0; \}/.test(SRV), 'Mongo gir jaaye to page phir bhi khulta hai');
(function () {
  var navSrc = SRV.match(/const NAV = \[[\s\S]*?\n\];/)[0];
  var NAV = eval('(' + navSrc.replace('const NAV = ', '').replace(/;$/, '') + ')');
  var ad = SRV.match(/function adminPage\(title, sections, role, opts\) \{[\s\S]*?\n\}/)[0];
  var adminPage = new Function('NAV', 'ADCSS', 'TRKUI', ad + '\nreturn adminPage;')(NAV, 'x{}', TS);
  var page = adminPage('P', TS.section('tracker'), 'admin',
    { tab: 'tracker', badges: { trkmap: 3 } });
  ok(/data-t="trkmap"[^<]*<span class="ic">[^<]*<\/span>Handle Mapping<span class="bg">3<\/span>/.test(page),
     'nav button par "3" ka badge dikhta hai');
  var page0 = adminPage('P', TS.section('tracker'), 'admin',
    { tab: 'tracker', badges: { trkmap: 0 } });
  ok(page0.indexOf('Handle Mapping<span class="bg">') < 0, 'kuch na ruka ho to badge nahi');
})();

sec('2. Handle Tracker tab par hi warning');
ok(/function trkWaitHtml\(st,extra\)/.test(J), 'warning banane wala function');
ok(/trkStatusHtml\(st,cfg\)\+trkWaitHtml\(st,d\)/.test(J), 'status ke saath dikhta hai');
ok(/pendingCount: pend/.test(SRV), '/state pendingCount deta hai');
(function () {
  var fn = new Function('document', 'console',
    J.replace(/if\(document\.getElementById\('sec-tracker'\)\)\{[\s\S]*$/, '') +
    '\nreturn {trkWaitHtml:trkWaitHtml};');
  var api = fn({ getElementById: function () { return null; } }, console);

  ok(api.trkWaitHtml({}, {}) === '', 'kuch na ruka ho to warning nahi');
  var w = api.trkWaitHtml({ heldCount: 0 }, { pendingCount: 2 });
  ok(/2 handles waiting for mapping/.test(w), 'ruke hue handle ki ginti: ' + /(\d+ handles?[^<]*)/.exec(w)[1]);
  ok(/Open the Handle Mapping tab/.test(w), 'seedha tab ka link');
  ok(/href="#trkmap"/.test(w), 'link sahi tab par');
  ok(/nothing is lost/.test(w), 'saaf likha hai ki data khoya nahi');
  ok(/ad-err/.test(w), 'laal me dikhta hai (dhyan jaaye)');

  var w1 = api.trkWaitHtml({}, { pendingCount: 1 });
  ok(/1 handle waiting/.test(w1) && !/1 handles/.test(w1), 'ek ke liye singular');

  var w2 = api.trkWaitHtml({ heldCount: 12 }, { pendingCount: 2 });
  ok(/2 handles waiting for mapping/.test(w2) && /12 tweets held in the last run/.test(w2),
     'dono ginti saath me');

  var w3 = api.trkWaitHtml({ heldCount: 5 }, {});
  ok(/5 tweets held in the last run/.test(w3), 'sirf run wali ginti bhi chalti hai');
})();

sec('3. Gate ka wada: naya handle = data roka jaata hai');
var XSRC = fs.readFileSync('./x_scraper.js', 'utf8');
ok(/const cols = MAP\.columnsFor\(d\['Handle'\]\);/.test(XSRC), 'har tweet par mapping dekhi jaati hai');
ok(/if \(cols\) \{ Object\.assign\(d, cols\); ready\.push\(d\); \}/.test(XSRC), 'mapped -> master_tweets');
ok(/else \{[\s\S]{0,200}held\.push\(d\);/.test(XSRC), 'unmapped -> held');
ok(/await registerPending\(db, counts, sample\);/.test(XSRC), 'handle waiting list me darj hota hai');
ok(/docs = ready;\s*\n\s*if \(!docs\.length\) return;/.test(XSRC),
   'sirf mapped tweet hi aage master_tweets me jaate hain');

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
