/* t_trk11.js -- (a) '-' har optional column me chalega,
                 (b) koi handle list ko rok nahi sakta (skip) */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var MAP = require('./mapping_lib.js');
var XS = require('./x_scraper.js');
var TS = require('./tracker_section.js');
var SRV = fs.readFileSync('./server.js', 'utf8');
var ADD = fs.readFileSync('./mapping_add.py', 'utf8');

sec('1. Sirf Candidate Name aur Category zaroori');
ok(MAP.REQUIRED.length === 2, 'do hi zaroori column: ' + MAP.REQUIRED.join(', '));
ok(MAP.REQUIRED.indexOf('Candidate Name') >= 0, 'Candidate Name zaroori');
ok(MAP.REQUIRED.indexOf('Category') >= 0, 'Category zaroori');
['State', 'Party', 'Designation', 'AC/PC No', 'AC Name', 'PC Name', 'Locations'].forEach(function (c) {
  ok(MAP.REQUIRED.indexOf(c) < 0, c + ' ab zaroori NAHI hai');
});
ok(/REQUIRED = \['Candidate Name', 'Category'\]/.test(ADD), 'mapping_add.py bhi wahi maanta hai');

sec('2. @PMOIndia jaisa official page ab save ho sakta hai');
var pmo = { 'State': '-', 'Locations': '-', 'AC/PC No': '-', 'AC Name': '-', 'PC Name': '-',
  'Designation': '-', 'Candidate Name': 'PMO India', 'Category': 'Page',
  'Categories': '', 'Party': '-' };
ok(MAP.validateRow(pmo).length === 0, 'sab "-" ke saath bhi paas ho gaya');
['State', 'Party', 'Designation', 'AC Name', 'PC Name', 'AC/PC No'].forEach(function (c) {
  var r = Object.assign({}, pmo); r[c] = '-';
  ok(MAP.validateRow(r).length === 0, c + ' = "-" chalta hai');
  r[c] = '';
  ok(MAP.validateRow(r).length === 0, c + ' khaali bhi chalta hai');
});
ok(MAP.validateRow(Object.assign({}, pmo, { 'Candidate Name': '' }))[0] === 'Candidate Name',
   'naam khaali ho to phir bhi rokta hai');
ok(MAP.validateRow(Object.assign({}, pmo, { 'Candidate Name': '-' }))[0] === 'Candidate Name',
   'naam "-" ho to bhi rokta hai (naam to chahiye hi)');
ok(MAP.validateRow(Object.assign({}, pmo, { 'Category': '-' }))[0] === 'Category',
   'Category "-" ho to rokta hai');

/* media house jaisa asli row */
var media = { 'State': '-', 'Party': '-', 'Designation': '-', 'AC Name': '-', 'PC Name': '-',
  'AC/PC No': '-', 'Candidate Name': 'Aaj Tak', 'Category': 'Media House' };
ok(MAP.validateRow(media).length === 0, 'aajtak jaisa row (jo mapping me pehle se hai) paas');

sec('3. Form me "-" pehle se bhara aata hai');
var H = TS.section('trkmap'), J = TS.script();
ok(/\+\(req\?'':'value="-" '\)/.test(J), 'optional text box me "-" pehle se');
ok(/<option value="-" selected>- \(not applicable\)<\/option>/.test(J),
   'optional dropdown me "- (not applicable)" chuna hua');
ok(/Only <b>Candidate Name<\/b> and <b>Category<\/b> are required/.test(H), 'note me saaf likha');
ok(/all 40 media houses and 26 journalists/.test(H), 'asli aankde se samjhaya gaya');

sec('4. Skip -- ek handle list ko rok nahi sakta');
ok(typeof XS.skipHandle === 'function', 'skipHandle() export hui');
ok(/app\.post\('\/admin\/tracker\/skip', adminGuard/.test(SRV), 'route adminGuard ke peeche');
ok(/\['hide', 'stop', 'drop'\]\.indexOf/.test(SRV), 'sirf teen tay mode chalte hain');
ok(J.indexOf('function tmpSkip(handle,mode)') >= 0, 'tmpSkip()');
ok(J.indexOf('Skip for now') >= 0, 'Skip for now button');
ok(J.indexOf('Skip &amp; stop tracking') >= 0, 'Skip + stop tracking button');
ok(J.indexOf('Discard held tweets') >= 0, 'held tweet mitane wala button');
ok(/mode==='drop'&&!confirm\(/.test(J), 'sirf data mitane par confirm maangta hai');
ok(!/mode==='hide'&&!confirm/.test(J), 'saadharan skip par confirm nahi');

/* teeno mode ka asli vyavhaar */
(function () {
  function mk() {
    var st = { pend: { 'PMOIndia': 1 }, held: { 'a': { handle: 'PMOIndia' } }, tracked: { 'PMOIndia': 1 } };
    var db = { collection: function (n) {
      if (n === 'pending_tweets') return {
        deleteMany: async function () { var k = Object.keys(st.held).length; st.held = {}; return { deletedCount: k }; } };
      if (n === 'tracked_handles') return { deleteOne: async function () { delete st.tracked['PMOIndia']; } };
      if (n === 'pending_handles') return { deleteOne: async function () { delete st.pend['PMOIndia']; } };
      return { deleteOne: async function () {}, deleteMany: async function () { return { deletedCount: 0 }; } };
    } };
    return { db: db, st: st };
  }
  var m1 = mk();
  XS.skipHandle(m1.db, 'PMOIndia', 'hide').then(function (r) {
    ok(r.ok === true, 'hide: ok');
    ok(!m1.st.pend['PMOIndia'], 'hide: waiting list se hat gaya');
    ok(!!m1.st.held['a'], 'hide: roke hue tweet SURAKSHIT hain');
    ok(!!m1.st.tracked['PMOIndia'], 'hide: handle abhi bhi track ho raha hai');
    ok(r.removedTweets === 0, 'hide: kuch mita nahi');

    var m2 = mk();
    XS.skipHandle(m2.db, 'PMOIndia', 'stop').then(function (r2) {
      ok(!m2.st.pend['PMOIndia'], 'stop: list se hata');
      ok(!!m2.st.held['a'], 'stop: tweet phir bhi surakshit');
      ok(!m2.st.tracked['PMOIndia'], 'stop: aage scrape nahi hoga');
      ok(r2.untracked === true, 'stop: untracked flag');

      var m3 = mk();
      XS.skipHandle(m3.db, 'PMOIndia', 'drop').then(function (r3) {
        ok(!m3.st.pend['PMOIndia'], 'drop: list se hata');
        ok(Object.keys(m3.st.held).length === 0, 'drop: roke hue tweet mit gaye');
        ok(!m3.st.tracked['PMOIndia'], 'drop: track bhi band');
        ok(r3.removedTweets === 1, 'drop: kitne mite wo bataya: ' + r3.removedTweets);

        XS.skipHandle(mk().db, '', 'hide').then(function (r4) {
          ok(r4.ok === false, 'khaali handle par mana');
          done();
        });
      });
    });
  });

  function done() {
    sec('5. CSV ki galti ab English me');
    ok(/why: 'empty: ' \+ miss\.join/.test(SRV), "'khaali:' ki jagah 'empty:'");
    ok(SRV.indexOf("'khaali: '") < 0, 'purana Hindi shabd gaya');
    ok(/These columns are empty: /.test(SRV), 'manual form ki galti bhi English me');
    ok(SRV.indexOf('ye column khaali hain') < 0, 'wo Hindi bhi gaya');

    console.log('\n' + '='.repeat(56));
    console.log('  PASS ' + P + '   FAIL ' + F);
    if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
    console.log('='.repeat(56));
    process.exit(F ? 1 : 0);
  }
})();
