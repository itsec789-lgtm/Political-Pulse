/* t_hreq.js -- "Handles To Be Added" ka poora raasta */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var H = require('./hreq_lib.js');
var A = require('./hreq_admin.js');
var MAP = require('./mapping_lib.js');
var SRV = fs.readFileSync('./server.js', 'utf8');

sec('1. Columns wahi jo aapne maange');
/* 08-Oct: Mapping.xlsx ke column badle (9 -> 10), isliye request form bhi
   wahi 10 column maangta hai. Purane 'Locations', 'PC Name', 'Categories'
   aur 'Designation' hat gaye; 'Gender' aur 'Admin Designation' aa gaye. */
var WANT = ['Handle', 'State', 'AC/PC No', 'AC/PC NAME', 'Candidate Name',
  'Gender', 'Political Party', 'Category', 'Party Designation',
  'Admin Designation'];
ok(H.COLS.length === 10, '10 column (Mapping jitne): ' + H.COLS.length);
WANT.forEach(function (c, i) { ok(H.COLS[i] === c, 'column ' + (i + 1) + ' = ' + c); });
ok(H.REQUIRED.join(',') === 'Candidate Name,Category', 'zaroori sirf do: ' + H.REQUIRED.join(', '));

sec('2. Dashboard ka tab aur section');
var nav = H.navTab(), s = H.section(), js = H.script();
ok(/data-tab="handle-req"/.test(nav), 'sidebar me tab');
ok(/Handles To Be Added/.test(nav), 'tab ka naam');
ok(/switchTab\('handle-req'\)/.test(nav), 'click par switchTab');
ok(/id="sec-handle-req"/.test(s), 'page section');
ok(/\/api\/handle-request\/template\.csv/.test(s), 'template download link');
ok(/id="hrqFile"/.test(s), 'upload input');
ok(/id="hrqRemarks"/.test(s), 'remarks box');
ok(/Send request/.test(s), 'send button');
ok(/id="hrqMine"/.test(s), 'apni request ki list');
ok(/id="hrqSendCard"[^>]*display:none/.test(s), 'upload se pehle send card chhipa hai');
H.COLS.forEach(function (c) { ok(s.indexOf('>' + c) >= 0 || s.indexOf(c + ' *') >= 0,
  'column chip dikhta hai: ' + c); });

sec('3. Dono template me laga');
['./dashboard.template.html', '../UP-DASHBOARD/dashboard.template.html'].forEach(function (t) {
  var x = fs.readFileSync(t, 'utf8');
  var nm = t.indexOf('UP-') >= 0 ? 'UP' : 'All-India';
  ok((x.match(/data-tab="handle-req"/g) || []).length === 1, nm + ': nav tab ek baar');
  ok((x.match(/id="sec-handle-req"/g) || []).length === 1, nm + ': section ek baar');
  ok(x.indexOf('<style id="hrq-css">') >= 0, nm + ': CSS ka apna <style> block hai');
  var cs = x.indexOf('<style id="hrq-css">'), ce = x.indexOf('</style>', cs);
  ok(cs > 0 && x.indexOf('.hrq-card{') > cs && x.indexOf('.hrq-card{') < ce,
     nm + ': CSS usi block ke andar (kisi aur ke block me nahi)');
  ok((x.match(/<style id="hrq-css">/g) || []).length === 1, nm + ': block ek hi baar');
  ok(x.indexOf('LIVE UPDATE INDICATOR') >= 0, nm + ': rt-delta ka style block saabut');
  ok(x.indexOf('window.hrqUpload=function') >= 0, nm + ': JS laga');
  ok(x.indexOf('</nav>') >= 0 && x.indexOf('handle-req') < x.indexOf('</nav>'),
     nm + ': tab </nav> se pehle hai');
  /* purana kuch toota to nahi */
  /* doosra </body> ek JS string ke andar hai (PDF report builder) -- asli
     wahi hai jo file ke ant me hai. Dekhna ye hai ki humari script USI se
     pehle lagi hai, aur uske baad sirf </body></html> bacha ho. */
  var endBody = x.lastIndexOf('</body>');
  ok(x.slice(endBody).replace(/\s/g, '') === '</body></html>', nm + ': file theek se band hui');
  /* ab iske baad date-ui aur range-note wali script bhi lagti hain,
     isliye "theek pehle" nahi -- bas asli </body> se PEHLE hona chahiye,
     aur doosre (JS string wale) </body> se baad me. */
  ok(x.lastIndexOf('hrqMine();') < endBody, nm + ': humari JS asli </body> se pehle lagi');
  ok(x.lastIndexOf('hrqMine();') > x.indexOf('</body>'),
     nm + ': aur JS-string wale naqli </body> ke andar nahi gayi');
  ok((x.match(/id="sec-wordcloud"/g) || []).length === 1, nm + ': wordcloud section saabut');
  ok(x.indexOf('function switchTab(tab)') >= 0, nm + ': switchTab saabut');
});

sec('4. Routes');
[['get', '/api/handle-request/template.csv', 'userGuard'],
 ['post', '/api/handle-request/check', 'userGuard'],
 ['post', '/api/handle-request/submit', 'userGuard'],
 ['get', '/api/handle-request/mine', 'userGuard'],
 ['get', '/admin/hreq/list', 'adminGuard'],
 ['post', '/admin/hreq/decide', 'adminGuard']].forEach(function (r) {
  var pat = "app." + r[0] + "('" + r[1] + "'";
  ok(SRV.split(pat).length - 1 === 1, r[0].toUpperCase() + ' ' + r[1] + ' ek baar');
  ok(SRV.slice(SRV.indexOf(pat), SRV.indexOf(pat) + 120).indexOf(r[2]) >= 0,
     r[1] + ' -> ' + r[2]);
});
ok(/function userGuard\(req, res, next\)/.test(SRV), 'userGuard maujood');
ok(/dashGuard scope bhi jaanchta hai/.test(SRV), 'kyun alag guard -- comment me wajah');

sec('5. Server client par bharosa nahi karta');
ok(/var clean = rows\.map\(function \(r, i\) \{ return hreqRow\(r, r\.line \|\| \(i \+ 2\)\); \}\)/.test(SRV),
   'submit par har row dobara jaanchi jaati hai');
ok(/\.slice\(0, 500\)/.test(SRV), 'row ki ginti cap');
ok(/Too many rows \(max 500 per request\)/.test(SRV), 'check par bhi cap');
ok(/String\(b\.remarks \|\| ''\)\.slice\(0, 2000\)/.test(SRV), 'remarks ki lambai cap');
ok(/by: emailOf\(req\)/.test(SRV), 'request par user ka email darj hota hai');
ok(/\.find\(\{ by: me \}/.test(SRV), 'user sirf APNI request dekhta hai');

sec('6. Approve / reject ka asar');
ok(/if \(doc\.status !== 'pending'\) return res\.json\(\{ ok: false/.test(SRV),
   'ek hi request do baar decide nahi ho sakti');
ok(/!MAPL\.has\(r\.handle\) && !\(r\.missing && r\.missing\.length\)/.test(SRV),
   'sirf naye aur poore row hi mapping me jaate hain');
ok(/out = await runMappingAdd\(mrows\)/.test(SRV), 'wahi mapping_add raasta');
ok(/out\.released = await releaseAll\(doc\.handles/.test(SRV), 'roke hue tweet chhoot jaate hain');
ok(/status: 'rejected'/.test(SRV) && /status: 'approved'/.test(SRV), 'dono faisle');
ok(/adminNote: note/.test(SRV), 'admin ka note user tak jaata hai');

sec('7. Admin panel ka tab');
var as = A.section('hreq'), ajs = A.script();
ok(/id="sec-hreq"/.test(as), 'section bana');
ok(/Handle Requests/.test(as), 'heading');
ok(/id="hraStatus"/.test(as), 'status filter');
/* tab-merge : ab alag tab nahi -- Login Requests ke saath 'Requests' me */
ok(SRV.indexOf("{ id: 'hreq',") < 0, 'alag hreq tab nahi raha');
ok(/\{ id: 'requests',[^}]*label: 'Requests'/.test(SRV), 'ek hi "Requests" tab');
ok(/data-sec="requests" id="sec-hreq"/.test(A.section('requests')),
   'section us tab ke neeche hai');
ok(/requests: \(reqs\.length \|\| 0\) \+ \(hreqPend \|\| 0\)/.test(SRV),
   'badge me login + handle dono pending jud kar aate hain');
ok(/countDocuments\(\{ status: 'pending' \}\)/.test(SRV), 'badge sirf pending ginta hai');
ok(/HREQUI\.section\(tab\)/.test(SRV), 'section admin page me jud gaya');
ok(/trkJs \+= '\\n' \+ HREQUI\.script\(\)/.test(SRV), 'uski JS bhi');
ok(/function hraDecide\(id,act\)/.test(ajs), 'approve/reject ka function');
ok(/act==='reject'&&!note\.trim\(\)/.test(ajs), 'reject par wajah zaroori');
ok(/act==='approve'&&!confirm\(/.test(ajs), 'approve par confirm');
ok(/\\u2714 Approve/.test(ajs) && /\\u2716 Reject/.test(ajs), 'dono button');

sec('8. User ko nateeja dikhta hai');
ok(/Request successfully approved/.test(js) || /request successfully approved/i.test(js),
   '"Request successfully approved" user ko dikhta hai');
ok(/Request rejected/.test(js), 'reject bhi dikhta hai');
ok(/Waiting for review/.test(js), 'pending bhi');
ok(/Reviewer: /.test(js), 'admin ka note user ko dikhta hai');
ok(/Reason: /.test(js), 'reject ki wajah dikhti hai');

sec('9. Upload par "already in mapping" turant');
ok(/Already in mapping/.test(js), 'pehle se mapped handle ka nishan');
ok(/In the mapping:/.test(js), 'mapping me kya hai wo bhi dikhta hai');
ok(/row\.have = \[have\['Candidate Name'\], have\['Party'\], have\['State'\]/.test(SRV),
   'server AC/PC, party, state sab bhejta hai');
ok(/row\.exists = !!have/.test(SRV), 'exists flag');
(function () {
  /* hreqRow ka asli vyavhaar -- server se nikaal kar */
  var fn = SRV.match(/function hreqRow\(o, line\) \{[\s\S]*?\n\}/)[0];
  var mk = new Function('TRK', 'MAPL', 'HREQ', fn + '\nreturn hreqRow;')(
    { clean: function (x) { return String(x || '').replace(/^@+/, '').trim(); } }, MAP, H);
  var r1 = mk({ 'Handle': '@myogiadityanath', 'Candidate Name': '', 'Category': '' }, 2);
  ok(r1.exists === true, 'mapped handle pakda gaya');
  ok(/Yogi Adityanath/.test(r1.have || ''), 'uska naam bhi aaya: ' + r1.have);
  ok(r1.missing.length === 2, 'khaali column bhi batate hain: ' + r1.missing.join(', '));
  var r2 = mk({ 'Handle': 'koi_naya_xyz', 'Candidate Name': 'Test', 'Category': 'Page',
                'State': '-', 'Party': '-' }, 3);
  ok(r2.exists === false, 'naya handle "new" hai');
  ok(r2.missing.length === 0, 'sirf naam+category ke saath bhi poora maana gaya');
  ok(/Test/.test(r2.sent || ''), 'user ne kya bheja wo bhi: ' + r2.sent);
})();

sec('10. Manual entry (2-3 handle ke liye)');
ok(/id="hrqManTbl"/.test(s), 'manual table');
ok(/id="hrqManBody"/.test(s), 'rows ka body');
ok(/Or just type a few/.test(s), 'heading');
ok(/hrqManAdd\(\)/.test(s), '+ Add row button');
ok(/hrqManCheck\(\)/.test(s), 'Check these button');
ok(H.MAX_MANUAL === 5, 'haath se 5 row tak: ' + H.MAX_MANUAL);
ok(new RegExp('Up to ' + H.MAX_MANUAL + ' rows').test(s), 'limit UI me likhi hai');
ok(/var MANCOLS=\[/.test(js), 'column list JS me inject hui');
ok(/body\.rows\.length>=MANMAX/.test(js), 'limit lagti hai');
ok(/function mergeCheck\(d\)/.test(js), 'CSV aur manual saath chal sakte hain');
ok(/seen\[r\.handle\.toLowerCase\(\)\]/.test(js), 'handle par dedupe');
ok(/if\(window\.hrqManAdd\)hrqManAdd\(\);/.test(js), 'pehli row apne aap aati hai');
ok(/'Content-Type':'application\/json'\},body:JSON\.stringify\(\{rows:rows\}\)/.test(js),
   'manual row JSON me jaati hai');
/* server JSON bhi samajhta hai */
ok(/check-json/.test(SRV), 'check route JSON bhi leta hai');
ok(/if \(body\.trim\(\)\.charAt\(0\) === '\{'\)/.test(SRV), 'JSON ya CSV, dono');
ok(/Nothing typed yet\./.test(SRV), 'khaali manual par saaf message');

sec('11. Admin request ki row edit kar sakta hai');
ok(/app\.post\('\/admin\/hreq\/save', adminGuard/.test(SRV), 'save route');
ok(/function hraRows\(id\)/.test(ajs), 'screen se row padhne wala function');
ok(/function hraSave\(id\)/.test(ajs), 'Save edits ka function');
ok(/Save edits<\/button>/.test(ajs), 'Save edits button');
ok(/var edit=\(r\.status==='pending'\)/.test(ajs), 'sirf pending par edit khulta hai');
ok(/data-col="Handle"/.test(ajs), 'handle bhi badla ja sakta hai');
ok(/Every cell above can be edited/.test(ajs), 'saaf likha hai');
ok(/var rows=\(act==='approve'\)\?hraRows\(id\):null;/.test(ajs),
   'Approve screen wali values bhejta hai (Save dabaye bina bhi)');
ok(/if \(Array\.isArray\(b\.rows\) && b\.rows\.length\)/.test(SRV),
   'server edited row leta hai');
ok(/async function hreqCleanRows\(rows\)/.test(SRV), 'edited row dobara jaanchi jaati hai');
ok(/if \(!doc\.originalRows\)/.test(SRV), 'user ne jo bheja tha wo bhi sambhal kar rakha jaata hai');
ok(/editedBy: emailOf\(req\)/.test(SRV), 'kisne badla wo bhi darj');
ok(/if \(doc\.status !== 'pending'\) return res\.json\(\{ ok: false, error: 'faisla ho chuka hai' \}\)/.test(SRV),
   'faisle ke baad edit band');

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
