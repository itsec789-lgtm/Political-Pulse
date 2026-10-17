/* t_trk4.js -- "24 hours chuna phir bhi 2 October dikh raha hai" wali
   shikayat ka test: Tweet Database ka apna date filter, aur Run button
   screen wala window bhejta hai. */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var TS = require('./tracker_section.js');
var XS = require('./x_scraper.js');
var HTML = TS.section('trkdb');
var JS = TS.script();
var SRV = fs.readFileSync('./server.js', 'utf8');
var XSRC = fs.readFileSync('./x_scraper.js', 'utf8');

sec('1. tweetQuery date range lagata hai');
(function () {
  var q = XS.tweetQuery({ handle: 'myogiadityanath', from: '2026-10-05', to: '2026-10-05' });
  ok(!!q['Tweet Date'], 'date filter query me aaya');
  ok(q['Tweet Date'].$gte === '2026-10-05', '$gte: ' + q['Tweet Date'].$gte);
  ok(q['Tweet Date'].$lte === '2026-10-05 23:59:59 IST', '$lte poore din ko cover karta hai: ' + q['Tweet Date'].$lte);

  /* asli row ke saath -- yahi screenshot wali shikayat hai */
  var lo = q['Tweet Date'].$gte, hi = q['Tweet Date'].$lte;
  var rows = [
    ['2026-10-05 13:04:38 IST', true], ['2026-10-05 07:30:00 IST', true],
    ['2026-10-05 00:00:00 IST', true], ['2026-10-05 23:59:59 IST', true],
    ['2026-10-04 20:33:50 IST', false], ['2026-10-04 08:00:35 IST', false],
    ['2026-10-03 19:36:30 IST', false], ['2026-10-02 20:38:28 IST', false],
    ['2026-10-02 13:15:48 IST', false]
  ];
  rows.forEach(function (r) {
    ok(((r[0] >= lo) && (r[0] <= hi)) === r[1],
       r[0] + ' -> ' + (r[1] ? 'andar' : 'BAHAR') + ' (string compare)');
  });

  ok(XS.tweetQuery({ from: '2026-10-04' })['Tweet Date'].$lte === undefined, 'sirf from bhi chalta hai');
  ok(XS.tweetQuery({ to: '2026-10-04' })['Tweet Date'].$gte === undefined, 'sirf to bhi chalta hai');
  ok(XS.tweetQuery({ handle: 'a' })['Tweet Date'] === undefined, 'date na do to koi date filter nahi');
  ok(XS.tweetQuery({ from: '2026-10-05T00:00:00Z' })['Tweet Date'].$gte === '2026-10-05',
     'lamba timestamp bhi 10 char par kat jaata hai');
})();

sec('2. recentTweets aur CSV dono date maante hain');
(function () {
  var seen = {};
  var db = { collection: function () { return { find: function (q, o) { seen.q = q; return {
    sort: function () { return this; }, skip: function () { return this; },
    limit: function () { return this; }, maxTimeMS: function () { return this; },
    toArray: async function () { return []; } }; } }; } };
  XS.recentTweets(db, { handle: 'x', from: '2026-10-05', to: '2026-10-05' }).then(function () {
    ok(!!seen.q['Tweet Date'], 'table ki query me date filter');
  });
  var s2 = {};
  var db2 = { collection: function () { return { find: function (q) { s2.q = q; return {
    sort: function () { return this; }, limit: function () { return this; } }; } }; } };
  XS.tweetCursor(db2, { handle: 'x', from: '2026-10-05', to: '2026-10-05' });
  ok(!!s2.q['Tweet Date'], 'CSV ki query me bhi wahi date filter');
  ok(JSON.stringify(s2.q) === JSON.stringify(XS.tweetQuery({ handle: 'x', from: '2026-10-05', to: '2026-10-05' })),
     'CSV aur table ki query bilkul ek jaisi hai');
})();
ok(/from: String\(req\.query\.from \|\| ''\)\.slice\(0, 10\)/.test(SRV), '/tweets route from padhta hai');
ok((SRV.match(/from: String\(req\.query\.from/g) || []).length === 2,
   'dono route (table + csv) from padhte hain');
ok((SRV.match(/to: String\(req\.query\.to/g) || []).length === 2, 'dono route to padhte hain');

sec('3. UI: date filter aur quick range');
ok(HTML.indexOf('id="tdbFrom"') >= 0 && HTML.indexOf('id="tdbTo"') >= 0, 'From/To date box');
ok(HTML.indexOf('type="date" id="tdbFrom"') >= 0, 'asli date picker hai');
['Last 24 hours', 'Last 3 days', 'Last 7 days', 'Last 30 days', 'All dates'].forEach(function (b) {
  ok(HTML.indexOf('>' + b + '</button>') >= 0, 'quick range: ' + b);
});
ok(JS.indexOf('function tdbDays(n)') >= 0, 'tdbDays() maujood');
ok(JS.indexOf('function tdbIstDay(back)') >= 0, 'IST ke hisaab se din nikalta hai');
ok(/5\.5\*3600\*1000/.test(JS), 'IST offset (+5:30) laga hai -- browser kisi aur TZ me ho to bhi theek');
ok(JS.indexOf("+'&from='+f.from+'&to='+f.to") >= 0, 'table ki request me date jaate hain');
ok(/export\.csv\?[\s\S]{0,200}'&from='\+f\.from/.test(JS), 'CSV link me bhi date jaate hain');

/* note me saaf likha ho ki window aur date filter alag cheez hain */
ok(HTML.indexOf('two different things') >= 0, 'note me saaf likha hai ki dono alag hain');
ok(/only decides how far back a <i>new<\/i> run/.test(HTML), 'window ka asli matlab likha hai');
ok(/they are not\s*'\s*\+\s*'deleted when you narrow the window/.test(HTML) || HTML.indexOf('deleted when you narrow the window') >= 0,
   'likha hai ki window chhota karne se purana data mitta nahi');

/* tdbDays ka asli hisaab */
(function () {
  var els = { tdbFrom: { value: '' }, tdbTo: { value: '' }, tdbHandle: { value: '' },
    tdbQ: { value: '' }, tdbOnly: { checked: true }, tdbLimit: { value: '50' },
    tdbTable: { style: {}, innerHTML: '', dataset: {} }, tdbCsv: { href: '' },
    tdbInfo: { textContent: '' }, tdbPrev: {}, tdbNext: {} };
  var calls = [];
  var fn = new Function('document', 'console', 'fetch',
    JS.replace(/if\(document\.getElementById\('sec-tracker'\)\)\{[\s\S]*$/, '') +
    '\nreturn {tdbDays:tdbDays,tdbIstDay:tdbIstDay,tdbCsvLink:tdbCsvLink,f:tdbFilters};');
  var api = fn({ getElementById: function (i) { return els[i] || null; } }, console,
    function (u) { calls.push(u); return Promise.resolve({ json: function () { return Promise.resolve({ rows: [] }); } }); });

  var today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  api.tdbDays(1);
  ok(els.tdbFrom.value === today && els.tdbTo.value === today,
     '"Last 24 hours" aaj par set karta hai: ' + els.tdbFrom.value + ' .. ' + els.tdbTo.value);
  ok(calls.length === 1 && calls[0].indexOf('from=' + today) >= 0, 'turant search bhi chal gayi');

  api.tdbDays(3);
  ok(els.tdbTo.value === today, '"Last 3 days" ka to aaj hai');
  ok(els.tdbFrom.value === api.tdbIstDay(2), '"Last 3 days" ka from 2 din peeche: ' + els.tdbFrom.value);
  ok(els.tdbFrom.value < els.tdbTo.value, 'from pehle, to baad me');

  api.tdbDays(0);
  ok(els.tdbFrom.value === '' && els.tdbTo.value === '', '"All dates" filter hata deta hai');

  api.tdbDays(7);
  api.tdbCsvLink();
  ok(els.tdbCsv.href.indexOf('from=' + api.tdbIstDay(6)) >= 0, 'CSV link wahi range le gaya');
  ok(els.tdbCsv.href.indexOf('to=' + today) >= 0, 'CSV link ka to bhi sahi');
})();

sec('4. Run button screen wala window bhejta hai');
ok(/var w=document\.getElementById\('trkWin'\),body=only\?\{only:only\}:\{\};/.test(JS),
   'run se pehle chuna hua window padha jaata hai');
ok(/if\(w&&w\.value\)body\.windowHours=w\.value;/.test(JS), 'window request me jaata hai');
ok(/var wh = Number\(req\.body && req\.body\.windowHours\);/.test(SRV), 'server window padhta hai');
ok(/if \(wh > 0\) opts\.windowHours = Math\.max\(1, Math\.min\(2160, Math\.round\(wh\)\)\);/.test(SRV),
   'server window ko clamp karta hai');
ok(XSRC.indexOf('const forcedWin = Number(opts.windowHours) > 0;') >= 0, 'forced window flag');
ok(/forcedWin \? windowHours : \(Number\(hs\[i\]\.windowHours\) \|\| windowHours\)/.test(XSRC),
   'manual run par per-handle override bhi us run ke liye hat jaata hai');

sec('5. forced window ka asli vyavhaar (end-to-end)');
(function () {
  var https = require('https'), XL = require('./x_live.js');
  var PAGES = [], HITS = [];
  function tw(id, hoursAgo) {
    var d = new Date(Date.now() - hoursAgo * 3600 * 1000);
    return { entryId: 'tweet-' + id, content: { itemContent: { tweet_results: { result: {
      legacy: { id_str: String(id), created_at: d.toUTCString(), full_text: 't' + id,
        reply_count: 1, favorite_count: 2, retweet_count: 3, bookmark_count: 4 },
      views: { count: '5' },
      core: { user_results: { result: { legacy: { screen_name: 'testee', followers_count: 1,
        friends_count: 1, statuses_count: 1, created_at: 'Mon Jan 01 00:00:00 +0000 2020' } } } }
    } } } } };
  }
  function page(e, cur) { var x = e.slice();
    if (cur) x.push({ entryId: 'cursor-bottom-1', content: { value: cur } });
    return { data: { user: { result: { timeline: { timeline: { instructions: [
      { type: 'TimelineAddEntries', entries: x } ] } } } } } }; }
  https.request = function (opt, cb) {
    var n = HITS.length; HITS.push(opt.path);
    var body = JSON.stringify(PAGES[Math.min(n, PAGES.length - 1)] || page([]));
    var r = { statusCode: 200, setEncoding: function () {}, destroy: function () {},
      on: function (ev, f) { if (ev === 'data') f(body); if (ev === 'end') setImmediate(f); return r; } };
    setImmediate(function () { cb(r); });
    return { setTimeout: function () {}, on: function () {}, end: function () {}, destroy: function () {} };
  };
  XL.ready = function () { return true; };
  XL.headersFor = function () { return { a: 1 }; };
  XL.fetchProfile = async function () { return { ok: true, prof: { userId: '1', name: 'T' } }; };

  function mkDb(handles, cfg) {
    var saved = [];
    var db = { collection: function (n) {
      if (n === 'tracker_cfg') return { findOne: async function () { return cfg; }, updateOne: async function () {} };
      if (n === 'tracked_handles') return {
        find: function () { return { sort: function () { return { toArray: async function () { return handles; } }; } }; },
        updateOne: async function () {} };
      return { find: function () { return { toArray: async function () { return []; } }; },
        bulkWrite: async function (ops) { ops.forEach(function (o) { saved.push(o.updateOne.filter._id); }); },
        updateOne: async function () {} };
    } };
    return { getDb: async function () { return { db: db, close: async function () {} }; }, saved: saved };
  }

  /* handle ka apna window 168 hai, par user ne panel par 24 chun kar Run dabaya */
  PAGES = [page([tw(1, 2), tw(2, 100)], 'C1'), page([tw(3, 200)], 'C2'), page([tw(4, 201)], null)];
  var m = mkDb([{ _id: 'testee', active: true, windowHours: 168 }],
               { _id: 'tracker', windowHours: 168, intervalMin: 30 });
  XS.runOnce(m.getDb, { windowHours: 24 }).then(function () {
    ok(m.saved.indexOf('1') >= 0, '2 ghante purana tweet aaya');
    ok(m.saved.indexOf('2') < 0,
       '100 ghante purana tweet NAHI aaya -- panel ka 24h, handle ke 168h par bhaari pada');

    /* bina forced window ke per-handle 168 phir se chalta hai */
    HITS = [];
    PAGES = [page([tw(1, 2), tw(2, 100)], 'C1'), page([tw(3, 900)], 'C2'), page([tw(4, 901)], null)];
    var m2 = mkDb([{ _id: 'testee', active: true, windowHours: 168 }],
                  { _id: 'tracker', windowHours: 24, intervalMin: 30 });
    XS.runOnce(m2.getDb, {}).then(function () {
      ok(m2.saved.indexOf('2') >= 0, 'bina forced window ke handle ka apna 168h phir chalta hai');
      done();
    });
  });

  function done() {
    console.log('\n' + '='.repeat(56));
    console.log('  PASS ' + P + '   FAIL ' + F);
    if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
    console.log('='.repeat(56));
    process.exit(F ? 1 : 0);
  }
})();
