/* t_trk2b.js -- server.js ki taraf ka test (static + NAV/adminPage eval).
   server.js ko require NAHI karte -- usse server chaalu ho jaata hai. */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var S = fs.readFileSync('./server.js', 'utf8');

sec('A. NAV me teen Tracker tab');
var navSrc = S.match(/const NAV = \[[\s\S]*?\n\];/);
ok(!!navSrc, 'NAV array mila');
var NAV = eval('(' + navSrc[0].replace('const NAV = ', '').replace(/;$/, '') + ')');
var ids = NAV.map(function (n) { return n.id; });
ok(ids.indexOf('tracker') === 0, 'Handle Tracker pehla tab hai');
ok(ids.indexOf('trklog') === 1, 'Live Scrape Log doosra');
ok(ids.indexOf('trkdb') === 2, 'Tweet Database teesra');
ok(NAV[1].label === 'Live Scrape Log', 'label: ' + NAV[1].label);
ok(NAV[2].label === 'Tweet Database', 'label: ' + NAV[2].label);
ok(NAV.every(function (n) { return n.ic && n.label && n.id; }), 'har NAV entry poori hai');
ok(ids.length === new Set(ids).size, 'koi duplicate NAV id nahi');

sec('B. naye routes');
[['get', '/admin/tracker/logs'], ['get', '/admin/tracker/tweets'],
 ['post', '/admin/tracker/hwin'], ['get', '/admin/tracker/state'],
 ['post', '/admin/tracker/add'], ['post', '/admin/tracker/run'],
 ['post', '/admin/tracker/stop'], ['post', '/admin/tracker/cfg'],
 ['post', '/admin/tracker/toggle'], ['post', '/admin/tracker/remove']].forEach(function (r) {
  var pat = "app." + r[0] + "('" + r[1] + "'";
  var n = S.split(pat).length - 1;
  ok(n === 1, r[0].toUpperCase() + ' ' + r[1] + ' ek baar register hui (' + n + ')');
});

sec('C. har tracker route adminGuard ke peeche');
var rx = /app\.(get|post)\('(\/admin\/tracker\/[a-z]+)',\s*([A-Za-z]+)/g, m, bad = [];
while ((m = rx.exec(S))) { if (m[3] !== 'adminGuard') bad.push(m[2] + ' -> ' + m[3]); }
ok(bad.length === 0, 'sabhi /admin/tracker/* par adminGuard' + (bad.length ? ' | kharab: ' + bad.join(', ') : ''));

sec('D. /run ek handle ka bhi chala sakta hai');
ok(/app\.post\('\/admin\/tracker\/run'[\s\S]{0,700}req\.body && req\.body\.only/.test(S),
   '/run body me only padhta hai');
ok(/var opts = only \? \{ only: only \} : \{\};/.test(S) && /TRK\.runOnce\(trkDb, opts\)/.test(S),
   'only runOnce ko jaata hai');
ok(/app\.post\('\/admin\/tracker\/run'[\s\S]{0,700}express\.json/.test(S),
   '/run par express.json laga (warna req.body undefined)');
ok(/TRK\.status\(\)\.running\) return res\.json\(\{ started: false, skipped: true \}\)/.test(S),
   'pehle se chal raha ho to saaf skipped jawaab');

sec('E. /tweets route theek se wired');
ok(/TRK\.recentTweets\(c\.db, \{/.test(S), 'recentTweets call hoti hai');
ok(/handle: String\(req\.query\.handle \|\| ''\)\.slice\(0, 40\)/.test(S), 'handle ki lambai cap');
ok(/q: String\(req\.query\.q \|\| ''\)\.slice\(0, 80\)/.test(S), 'search text ki lambai cap');
ok(/only: String\(req\.query\.only \|\| ''\) === '1'/.test(S), 'only flag padha jaata hai');

sec('F. /logs route halki hai');
var lg = S.slice(S.indexOf("app.get('/admin/tracker/logs'"), S.indexOf("app.get('/admin/tracker/tweets'"));
ok(lg.indexOf('TRK.listHandles') < 0, '/logs handle list nahi laata (har 3 sec par bojh nahi)');
ok(lg.indexOf('TRK.logs(lim)') >= 0, '/logs log deta hai');
ok(lg.indexOf('TRK.status()') >= 0, '/logs status bhi deta hai');
ok(/Math\.max\(1, Math\.min\(400, Number\(req\.query\.limit\)/.test(lg), 'limit clamp hui');
ok(/try \{ var c = await trkDb\(\); out\.cfg = await TRK\.getCfg\(c\.db\); \} catch \(e\) \{\}/.test(lg),
   'Mongo gir jaaye to bhi log dikhta rahega');

sec('G. ?tab= se seedha link');
ok(/NAV\.some\(function \(n\) \{ return n\.id === String\(req\.query\.tab \|\| ''\); \}\)/.test(S),
   '?tab=<koi bhi NAV id> chalta hai');

sec('H. index');
ok(/createIndex\(\{ Handle: 1, 'Tweet Date': -1 \}/.test(S),
   'Handle+Tweet Date compound index (Tweet Database ki sort ke liye)');

sec('I. adminPage teeno section aur nav deta hai');
var TS = require('./tracker_section.js');
var ad = S.match(/function adminPage\(title, sections, role, opts\) \{[\s\S]*?\n\}/);
ok(!!ad, 'adminPage mila');
var ADCSS_src = S.match(/const ADCSS = [\s\S]*?\n\s*\+ '\}';/);
ok(!!ADCSS_src, 'ADCSS mila');
var mk = new Function('NAV', 'ADCSS', 'TRKUI',
  ad[0] + '\nreturn adminPage;');
var adminPage = mk(NAV, 'x{}', TS);
var html = adminPage('Panel', TS.section('tracker'), 'admin', { tab: 'tracker', badges: {} });
['sec-tracker', 'sec-trklog', 'sec-trkdb'].forEach(function (id) {
  ok(html.indexOf('id="' + id + '"') >= 0, 'page me ' + id);
});
['tracker', 'trklog', 'trkdb'].forEach(function (id) {
  ok(html.indexOf('data-t="' + id + '"') >= 0, 'nav button data-t=' + id);
});
ok((html.match(/class="sec on"/g) || []).length === 1, 'ek hi section khula hai');
ok(html.indexOf('class="sec on" id="sec-tracker"') >= 0, 'tab=tracker par Handle Tracker khula');
ok(html.indexOf('function trkRenderTable') >= 0, 'Tracker ki JS inject hui');
ok(html.indexOf('function tlgPaint') >= 0, 'Log tab ki JS inject hui');
ok(html.indexOf('function tdbGo') >= 0, 'Database tab ki JS inject hui');
ok(html.lastIndexOf('</body></html>') === html.length - 14, 'page theek se band hua');

/* tab switching ka asli test -- page ki go() JS nikaal kar chalao */
var html2 = adminPage('Panel', TS.section('trkdb'), 'admin', { tab: 'trkdb', badges: {} });
ok(html2.indexOf('class="sec on" id="sec-trkdb"') >= 0, 'tab=trkdb par Database khula');
ok(html2.indexOf('class="nv on" data-t="trkdb"') >= 0, 'us tab ka nav button bhi on');
ok(html2.indexOf('class="sec on" id="sec-tracker"') < 0, 'baaki section band');

sec('J. maxPages kahin bacha nahi');
ok(S.indexOf('maxPages') < 0, 'server.js me maxPages ka koi zikr nahi');
ok(fs.readFileSync('./tracker_section.js', 'utf8').indexOf('maxPages') < 0,
   'tracker_section.js me maxPages nahi');
var XSS = fs.readFileSync('./x_scraper.js', 'utf8');
ok(!/ok\.maxPages =/.test(XSS), 'x_scraper setCfg maxPages nahi likhta');
ok(XSS.indexOf('delete c.maxPages') >= 0, 'purani stored key getCfg me chhip jaati hai');

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
