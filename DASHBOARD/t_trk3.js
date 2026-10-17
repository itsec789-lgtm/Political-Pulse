/* t_trk3.js -- progress bar, CSV export, DONE line, aur "koi Hindi nahi" */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var TS = require('./tracker_section.js');
var XS = require('./x_scraper.js');
var HTML = TS.section('tracker') + TS.section('trklog') + TS.section('trkdb');
var JS = TS.script();
var SRV = fs.readFileSync('./server.js', 'utf8');
var XSRC = fs.readFileSync('./x_scraper.js', 'utf8');

/* ============ 1. PROGRESS BAR ============ */
sec('1. Scrape ke dauraan progress bar');
ok(HTML.indexOf('id="trkProg"') >= 0, 'Tracker tab par progress box');
ok(HTML.indexOf('id="tlgProg"') >= 0, 'Log tab par bhi wahi progress box');
['ProgIn', 'ProgPct', 'ProgL', 'ProgSub'].forEach(function (k) {
  ok(HTML.indexOf('id="trk' + k + '"') >= 0 && HTML.indexOf('id="tlg' + k + '"') >= 0,
     'dono tab par ' + k);
});
ok(JS.indexOf('function trkProg(p,st)') >= 0, 'trkProg() maujood');
ok(/trkProg\('trk',st\)/.test(JS), 'Tracker paint progress chalata hai');
ok(/trkProg\('tlg',st\)/.test(JS), 'Log paint bhi progress chalata hai');
ok(JS.indexOf("box.style.display='none'") >= 0, 'run na ho to bar chhip jaata hai');

/* status me naye counter */
ok(XSRC.indexOf('page: 0, pages: 0, tweets: 0') >= 0, 'STATE me page/pages/tweets counter');
ok(XSRC.indexOf('STATE.page = page + 1; STATE.pages = stats.pages;') >= 0, 'page counter live badhta hai');
ok(XSRC.indexOf('STATE.handleTweets = found;') >= 0, 'handle ke tweet live ginte hain');
ok(XSRC.indexOf('STATE.tweets = stats.newCount + stats.updatedCount;') >= 0,
   'naye/update ki ginti run ke BEECH me update hoti hai');
ok(/elapsedMs: STATE\.running \? \(Date\.now\(\) - STATE\.startedAt\) : 0/.test(XSRC),
   'status elapsed time deta hai');
var st0 = XS.status();
['page', 'pages', 'tweets', 'newCount', 'updatedCount', 'handleTweets', 'elapsedMs'].forEach(function (k) {
  ok(k in st0, 'status() me ' + k);
});

/* bar ka asli hisaab */
(function () {
  var el = {};
  ['trkProg', 'trkProgIn', 'trkProgPct', 'trkProgL', 'trkProgSub'].forEach(function (id) {
    el[id] = { style: {}, textContent: '', innerHTML: '' };
  });
  var fn = new Function('document', 'console',
    JS.replace(/if\(document\.getElementById\('sec-tracker'\)\)\{[\s\S]*$/, '') +
    '\nreturn {trkProg:trkProg};');
  var api = fn({ getElementById: function (i) { return el[i] || null; } }, console);

  api.trkProg('trk', { running: false });
  ok(el.trkProg.style.display === 'none', 'ruke hue scraper par bar nahi dikhta');

  api.trkProg('trk', { running: true, total: 1, done: 0, page: 0, current: 'modi',
    handleTweets: 0, newCount: 0, updatedCount: 0, pages: 0, elapsedMs: 0 });
  ok(el.trkProg.style.display === 'block', 'chalu scraper par bar dikhta hai');
  var p0 = parseInt(el.trkProgIn.style.width, 10);

  api.trkProg('trk', { running: true, total: 1, done: 0, page: 1, current: 'modi',
    handleTweets: 12, newCount: 12, updatedCount: 0, pages: 1, elapsedMs: 5000 });
  var p1 = parseInt(el.trkProgIn.style.width, 10);
  api.trkProg('trk', { running: true, total: 1, done: 0, page: 4, current: 'modi',
    handleTweets: 48, newCount: 40, updatedCount: 8, pages: 4, elapsedMs: 42000 });
  var p4 = parseInt(el.trkProgIn.style.width, 10);

  ok(p1 > p0 && p4 > p1, 'EK HI HANDLE par bhi bar aage badhta hai (' + p0 + '% -> ' + p1 + '% -> ' + p4 + '%)');
  ok(p4 < 100, 'poora hone se pehle 100% nahi dikhata: ' + p4 + '%');
  ok(el.trkProgPct.textContent === p4 + '%', 'percent likha hai: ' + el.trkProgPct.textContent);
  ok(/@modi/.test(el.trkProgL.innerHTML), 'abhi kaunsa handle chal raha hai');
  ok(/handle 1 of 1/.test(el.trkProgL.innerHTML), 'handle ki ginti');
  ok(/page 4/.test(el.trkProgL.innerHTML), 'page number');
  ok(/48 tweets from this handle/.test(el.trkProgSub.textContent), 'is handle ke tweet');
  ok(/40 new, 8 updated so far/.test(el.trkProgSub.textContent), 'live naya/update ginti');
  ok(/0:42 elapsed/.test(el.trkProgSub.textContent), 'beeta hua waqt: ' + el.trkProgSub.textContent);

  /* kai handle */
  api.trkProg('trk', { running: true, total: 5, done: 2, page: 1, current: 'yogi',
    handleTweets: 3, newCount: 90, updatedCount: 4, pages: 9, elapsedMs: 125000 });
  var pm = parseInt(el.trkProgIn.style.width, 10);
  ok(pm > 40 && pm < 50, '5 me se 2 handle poore -> ~42%: ' + pm + '%');
  ok(/handle 3 of 5/.test(el.trkProgL.innerHTML), 'teesre handle par hai');
  ok(/2:05 elapsed/.test(el.trkProgSub.textContent), 'minute:second format: ' + el.trkProgSub.textContent);

  /* XSS -- handle ka naam seedha innerHTML me jaata hai */
  api.trkProg('trk', { running: true, total: 1, done: 0, page: 1,
    current: '<img src=x onerror=alert(1)>', handleTweets: 0, newCount: 0,
    updatedCount: 0, pages: 1, elapsedMs: 0 });
  ok(el.trkProgL.innerHTML.indexOf('<img') < 0, 'handle ka naam escape hota hai (XSS band)');
})();

/* ============ 2. CSV DOWNLOAD ============ */
sec('2. Tweet Database ka CSV download');
ok(HTML.indexOf('id="tdbCsv"') >= 0, 'Download CSV button maujood');
ok(HTML.indexOf('Download CSV') >= 0, 'button par saaf likha hai');
ok(HTML.indexOf('/admin/tracker/export.csv') >= 0, 'button export.csv par jaata hai');
ok(JS.indexOf('function tdbCsvLink()') >= 0, 'link filter ke saath banta hai');
ok(/tdbGo\(p\)\{[\s\S]{0,400}tdbCsvLink\(\)/.test(JS), 'har search par CSV link bhi badalta hai');
ok(SRV.indexOf("app.get('/admin/tracker/export.csv', adminGuard") >= 0, 'route adminGuard ke peeche');
ok(typeof XS.tweetCursor === 'function', 'tweetCursor() export hui');
ok(typeof XS.tweetQuery === 'function', 'tweetQuery() export hui');
ok(SRV.indexOf("res.write('\\uFEFF' + COLS.join(',')") >= 0, 'UTF-8 BOM (Excel ke liye)');
ok(/while \(await cur\.hasNext\(\)\)/.test(SRV), 'row ek-ek karke stream hoti hain (memory safe)');
ok(/if \(\/\^\[=\+\\-@\]\/\.test\(t\)\) t = "'" \+ t;/.test(SRV), 'CSV-injection se bachav (= + - @)');
ok(/Content-Disposition', 'attachment; filename="' \+ name/.test(SRV), 'attachment ban kar download hota hai');
ok(/if \(res\.headersSent\)/.test(SRV), 'beech me fail ho to file ke ant me saaf likha jaata hai');

/* table aur CSV ek hi filter use karein */
ok(XSRC.indexOf('const q = tweetQuery(opts);') >= 0, 'recentTweets wahi tweetQuery use karta hai');
(function () {
  var a = XS.tweetQuery({ handle: '@Modi', only: true, q: 'x' });
  ok(a['Handle'] === 'Modi' && a['Source Folders'] === XS.SOURCE_TAG && a['Tweet Text'],
     'tweetQuery teeno filter lagata hai');
  var b = XS.tweetQuery({});
  ok(Object.keys(b).length === 0, 'bina filter ke query khaali hai');
})();
(function () {
  var seen = {};
  var db = { collection: function () { return { find: function (q, o) { seen.q = q; seen.proj = o.projection; return {
    sort: function () { return this; }, limit: function (l) { seen.limit = l; return this; } }; } }; } };
  XS.tweetCursor(db, { handle: 'a' }, 999999);
  ok(seen.limit === 500000, 'export cap 500000 par clamp: ' + seen.limit);
  XS.tweetCursor(db, {});
  ok(seen.limit === 200000, 'default cap 200000: ' + seen.limit);
  ok(seen.proj['Tweet Text'] === 1 && seen.proj['Sentiment'] === 1, 'CSV me zaroori column aate hain');
})();

/* ============ 3. DONE line ============ */
sec('3. Log me "DONE" dikhta hai');
ok(XSRC.indexOf("'\\u2714 DONE'") >= 0 || XSRC.indexOf('✔ DONE') >= 0, 'DONE line maujood');
ok(XSRC.indexOf('⏹ STOPPED') >= 0, 'beech me roka to STOPPED');
ok(XSRC.indexOf('✖ SCRAPE FAILED') >= 0, 'fail hua to SCRAPE FAILED');
ok(XSRC.indexOf('▶ SCRAPE STARTED') >= 0, 'shuru par SCRAPE STARTED');
/* comment me zikr theek hai -- dekhna ye hai ki koi log() line Hindi na bole */
ok(!/log\((['"`])[^)]*Poora hua/.test(XSRC), 'purani Hindi "Poora hua" log line gayi');
ok(/stats\.handles \+ '\/' \+ STATE\.total \+ ' handles, ' \+ stats\.pages \+ ' pages, '/.test(XSRC),
   'DONE line me handle aur page ki ginti bhi hai');
ok(/\\u2714 DONE\|\\u23F9 STOPPED\|\\u2716 SCRAPE FAILED/.test(JS),
   'log pane in teeno line ko alag se ubhaarta hai');
ok(/border-left:3px solid/.test(JS), 'DONE line par alag patti dikhti hai');

/* DONE line ka asli text */
(function () {
  var el = { tlgPane: { innerHTML: '' }, tlgCount: { textContent: '' },
             tlgOnly: { value: '' }, tlgQ: { value: '' } };
  var fn = new Function('document', 'console',
    JS.replace(/if\(document\.getElementById\('sec-tracker'\)\)\{[\s\S]*$/, '') +
    '\nTLG_LOGS=arguments[2];return {tlgPaint:tlgPaint};');
  var api = fn({ getElementById: function (i) { return el[i] || null; } }, console, [
    { t: '2026-10-05T10:00:09Z', k: 'info', m: '✔ DONE -- 12 new, 3 updated, 1/1 handles, 4 pages, 0 error(s), 9s' },
    { t: '2026-10-05T10:00:01Z', k: 'info', m: '▶ SCRAPE STARTED -- 1 handle(s)' }
  ]);
  api.tlgPaint();
  ok(/DONE/.test(el.tlgPane.innerHTML), 'DONE log me dikhta hai');
  ok(/font-weight:700/.test(el.tlgPane.innerHTML), 'DONE line mota dikhta hai');
  ok((el.tlgPane.innerHTML.match(/border-left:3px/g) || []).length === 1,
     'sirf DONE line ubhri hai, baaki normal');
})();

/* ============ 4. ADMIN PANEL ME HINDI NAHI ============ */
sec('4. Admin panel par koi Hindi nahi');
var HIN = /\b(nahi|karo|kro|hain|daalo|wahi|wali|wala|kuch|sirf|phir|dono|yahan|wahan|rakho|dekho|batao|purana|purani|naya|nayi|chaalu|khatam|hua|hui|gaya|gayi|mila|mile|jude|ghante|baar|jodo|hatao|roko|abhi|koi|poora|chuno|aaye|aayi|bhejo|likha|dikhta|lagao|chhod|banao|hoga|hogi|maujood|intezaar|surakshit|dikkat|ginti|pehle|peeche|seedha|thoda|zyada|wapas)\b/i;

function strings(src) {
  var out = [], inc = false;
  src.split('\n').forEach(function (l) {
    var t = l.trim();
    if (t.indexOf('/*') === 0) inc = true;
    if (inc) { if (t.indexOf('*/') >= 0) inc = false; return; }
    if (t.indexOf('*') === 0 || t.indexOf('//') === 0) return;
    (l.match(/'[^'\\\n]{5,400}'/g) || []).forEach(function (x) { out.push(x); });
  });
  return out;
}
var bad1 = strings(fs.readFileSync('./tracker_section.js', 'utf8')).filter(function (x) { return HIN.test(x); });
ok(bad1.length === 0, 'tracker_section.js ke visible string English me' + (bad1.length ? ' | ' + bad1.slice(0, 3).join(' ') : ''));

var bad2 = strings(XSRC).filter(function (x) { return HIN.test(x); });
ok(bad2.length === 0, 'x_scraper.js ke log message English me' + (bad2.length ? ' | ' + bad2.slice(0, 3).join(' ') : ''));

/* admin page ke sections */
var a = SRV.indexOf('// ================= 1. DATA EXPORT');
var b = SRV.indexOf("res.set('Cache-Control', 'no-store, no-cache, must-revalidate')", a);
var bad3 = strings(SRV.slice(a - 2600, b)).filter(function (x) { return HIN.test(x); });
ok(bad3.length === 0, 'server.js ke admin sections English me' + (bad3.length ? ' | ' + bad3.slice(0, 3).join(' ') : ''));

/* rendered page par bhi dekh lo (tags hata kar) */
var navSrc = SRV.match(/const NAV = \[[\s\S]*?\n\];/)[0];
var NAV = eval('(' + navSrc.replace('const NAV = ', '').replace(/;$/, '') + ')');
var ad = SRV.match(/function adminPage\(title, sections, role, opts\) \{[\s\S]*?\n\}/)[0];
var adminPage = new Function('NAV', 'ADCSS', 'TRKUI', ad + '\nreturn adminPage;')(NAV, 'x{}', TS);
var page = adminPage('Panel', TS.section('tracker') + TS.section('trklog') + TS.section('trkdb'),
  'admin', { tab: 'tracker', badges: {} });
var visible = page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ');
var hits = visible.match(new RegExp(HIN.source, 'gi'));
ok(!hits, 'rendered admin page par koi Hindi shabd nahi' + (hits ? ' | ' + [].concat(hits).slice(0, 6).join(', ') : ''));
ok(page.indexOf('Tracked Accounts') >= 0 && page.indexOf('Add a handle') >= 0, 'English labels aa rahe hain');
ok(page.indexOf('Scrape all now') >= 0, 'English buttons');

/* ============ 5. purana sab chalta rahe ============ */
sec('5. Pehle wale badlaav abhi bhi theek');
ok(JS.indexOf('TRK_DIRTY') >= 0 && /if\(TRK_DIRTY\[id\]\)return;/.test(JS), 'dropdown fix bacha hua hai');
ok(JS.indexOf('trkPg') < 0 && HTML.indexOf('trkPg') < 0, 'page-count control abhi bhi gayab');
ok(SRV.indexOf('maxPages') < 0, 'server.js me maxPages nahi');
['HANDLE', 'STATUS', 'SCRAPE WINDOW', 'LAST CHECKED', 'ACTIONS'].forEach(function (c) {
  ok(JS.indexOf('<th>' + c + '</th>') >= 0, 'column ' + c + ' bachi hui hai');
});
ok(HTML.indexOf('Filter by handle') >= 0, 'search placeholder bacha hua hai');
ok(XSRC.indexOf('page < pageCap') >= 0, 'window-driven paging bachi hui hai');

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
