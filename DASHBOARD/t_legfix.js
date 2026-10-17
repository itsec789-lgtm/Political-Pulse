/* t_legfix.js -- "operation exceeded time limit" wali do galtiyan */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var XS = require('./x_scraper.js');
var TS = require('./tracker_section.js');
var SRV = fs.readFileSync('./server.js', 'utf8');
var XSRC = fs.readFileSync('./x_scraper.js', 'utf8');

sec('1. Index -- asli wajah');
ok(/createIndex\(\{ 'Source Folders': 1 \}/.test(SRV), "'Source Folders' par index");
ok(/createIndex\(\{ 'Source Folders': 1, Handle: 1 \}/.test(SRV), 'compound index bhi');
ok(/operation exceeded time limit/.test(SRV), 'comment me asli error ka zikr');

sec('2. Aam raasta ab sasta hai');
ok(/async function legacyCheap\(db\)/.test(XSRC), 'legacyCheap() bana');
ok(/COLL_HANDLES\).find\(\{\}, \{ projection: \{ _id: 1 \} \}\)/.test(XSRC),
   'handle chhoti collection se aate hain');
ok(/countDocuments\(\s*\{ Handle: h, 'Source Folders': SOURCE_TAG \}/.test(XSRC),
   'har handle ki ginti Handle index se');
ok(/\.slice\(0, 80\)/.test(XSRC), 'kitne handle dekhne hain uski seema');
ok(/maxTimeMS: 8000/.test(XSRC), 'ek handle ki ginti par chhota timeout');
ok(!/\$first: '\$Tweet Text'/.test(XSRC), 'bada Tweet Text ab nahi kheencha jaata');

sec('3. Poora scan sirf maangne par');
ok(/async function legacyDeep\(db\)/.test(XSRC), 'legacyDeep() alag hai');
ok(/maxTimeMS: 120000/.test(XSRC), 'deep scan ko poora waqt');
ok(/legacyUnmapped\(db, force, deep\)/.test(XSRC) || /async function legacyUnmapped\(db, force, deep\)/.test(XSRC),
   'deep ek alag flag hai');
ok(/const out = deep \? await legacyDeep\(db\) : await legacyCheap\(db\);/.test(XSRC),
   'default me deep scan nahi chalta');
ok(/String\(req\.query\.deep \|\| ''\) === '1'/.test(SRV), 'deep sirf ?deep=1 par');

sec('4. Fail hone par ab back off hota hai  <-- asli bug');
ok(/const LEGACY_FAIL_TTL = 10 \* 60 \* 1000;/.test(XSRC), 'fail ke baad 10 min ka wait');
ok(/_legacyErr = msg; _legacyAt = Date\.now\(\);/.test(XSRC),
   'fail par bhi waqt stamp hota hai (pehle nahi hota tha)');
ok(/\(_legacyErr \? LEGACY_FAIL_TTL : LEGACY_TTL\)/.test(XSRC),
   'fail ke baad alag, lamba wait');
ok(/if \(_legacyErr !== msg\) \{/.test(XSRC), 'wahi error baar-baar log me nahi');
ok(/skipping this check for the next 10 minutes/.test(XSRC), 'log me saaf likha hai');

/* asli vyavhaar: fail hone par dobara query nahi chalti */
(function () {
  var calls = 0;
  var db = { collection: function (n) {
    if (n === 'tracked_handles') return { find: function () { return {
      toArray: async function () { calls++; throw new Error('operation exceeded time limit'); } }; } };
    return { find: function () { return { toArray: async function () { return []; } }; },
      countDocuments: async function () { return 0; } };
  } };
  XS._clearLegacy();
  /* legacyCheap khud try/catch karta hai, isliye seedha legacyDeep se jaanchte hain */
  var deepDb = { collection: function () { return {
    aggregate: function () { return { toArray: async function () {
      calls++; throw new Error('operation exceeded time limit'); } }; } }; } };
  XS.legacyUnmapped(deepDb, true, true).then(function (r1) {
    ok(Array.isArray(r1) && r1.length === 0, 'fail par khaali list lautti hai, crash nahi');
    ok(calls === 1, 'ek baar query chali');
    ok(XS.legacyState().error.indexOf('time limit') >= 0,
       'error yaad rakha gaya: ' + XS.legacyState().error.slice(0, 40));
    return XS.legacyUnmapped(deepDb, false, true);
  }).then(function () {
    ok(calls === 1, 'DOOSRI baar query DOBARA nahi chali (back off kaam kar raha hai)');
    /* force karne par phir chalni chahiye */
    return XS.legacyUnmapped(deepDb, true, true);
  }).then(function () {
    ok(calls === 2, 'force karne par phir chalti hai');
    XS._clearLegacy();
    ok(XS.legacyState().error === '', '_clearLegacy error bhi saaf karta hai');
    step5();
  });
})();

function step5() {
  sec('5. Panel par saaf batata hai');
  var J = TS.script();
  ok(/function tmpLoad\(deep\)/.test(J), 'tmpLoad deep le sakta hai');
  ok(/id="tmpDeepBtn"/.test(J), 'Scan the whole database ka button');
  ok(/'\/admin\/tracker\/pending'\+\(deep\?'\?deep=1&force=1':''\)/.test(J), 'deep=1 aur force=1 bhejta hai');
  ok(/This list normally only checks the/.test(J), 'samjhaya hai ki aam list kya dikhati hai');
  ok(/The full scan could not finish/.test(J), 'fail hone par saaf message');
  ok(/only\s*'\s*\+\s*'handles no longer being tracked could be missing/.test(J)
     || /handles no longer being tracked could be missing/.test(J),
     'batata hai ki kya chhoot sakta hai');
  ok(/legacy: TRK\.legacyState\(\)/.test(SRV), 'server legacy ka haal bhejta hai');
  ok(/typeof XS.legacyState === 'function'/.test('typeof XS.legacyState === \'function\'')
     && typeof XS.legacyState === 'function', 'legacyState() export hui');

  console.log('\n' + '='.repeat(56));
  console.log('  PASS ' + P + '   FAIL ' + F);
  if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
  console.log('='.repeat(56));
  process.exit(F ? 1 : 0);
}
