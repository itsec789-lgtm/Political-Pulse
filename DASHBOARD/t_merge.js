/* t_merge.js -- do tab jod diye gaye:
     Requests        = Login Requests + Handle Requests
     Data & Reports  = Data Export    + Scraping Report */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRV = fs.readFileSync('./server.js', 'utf8');
var TS = require('./tracker_section.js');
var HA = require('./hreq_admin.js');

sec('1. NAV: ab kaunse tab hain');
var navSrc = SRV.match(/const NAV = \[[\s\S]*?\n\];/)[0];
var NAV = eval('(' + navSrc.replace('const NAV = ', '').replace(/;$/, '') + ')');
var ids = NAV.map(function (n) { return n.id; });
console.log('   NAV: ' + ids.join(', '));
ok(ids.indexOf('requests') >= 0, '"requests" tab hai');
ok(ids.indexOf('data') >= 0, '"data" tab hai');
ok(ids.indexOf('hreq') < 0, 'alag "hreq" tab gaya');
ok(ids.indexOf('export') < 0, 'alag "export" tab gaya');
ok(ids.indexOf('report') < 0, 'alag "report" tab gaya');
ok(NAV.filter(function (n) { return n.id === 'requests'; })[0].label === 'Requests',
   'label "Requests"');
ok(NAV.filter(function (n) { return n.id === 'data'; })[0].label === 'Data & Reports',
   'label "Data & Reports"');
ok(ids.length === new Set(ids).size, 'koi duplicate id nahi');
/* pehle 11: tracker,trklog,trkdb,trkmap,hreq,export,report,requests,users,activity,email
   teen hate (hreq,export,report), ek juda (data) -> 9 */
ok(ids.length === 9, 'pehle 11 the, ab 9: ' + ids.length);
['tracker', 'trklog', 'trkdb', 'trkmap', 'users', 'activity', 'email'].forEach(function (k) {
  ok(ids.indexOf(k) >= 0, 'purana tab bacha: ' + k); });

sec('2. Tab-switch ab data-sec dekhta hai');
ok(/secs\[j\]\.dataset\.sec\|\|secs\[j\]\.id\.replace\("sec-",""\)/.test(SRV),
   'data-sec, warna id se kaam');
ok(!/secs\[j\]\.classList\.toggle\("on",secs\[j\]\.id==="sec-"\+t\)/.test(SRV),
   'purana sirf-id wala toggle gaya');

sec('3. Section par data-sec');
ok(/data-sec="data" id="sec-export"/.test(SRV), 'export -> data');
ok(/data-sec="data" id="sec-report"/.test(SRV), 'report -> data');
ok(/data-sec="requests" id="sec-requests"/.test(SRV), 'login requests -> requests');
ok(/data-sec="requests" id="sec-hreq"/.test(HA.section('requests')), 'handle requests -> requests');
ok(/tab === 'data' \? ' on'/.test(SRV), 'export/report "data" par khulte hain');
ok(SRV.indexOf("tab === 'export' ? ' on'") < 0, 'purana export condition gaya');
ok(SRV.indexOf("tab === 'report' ? ' on'") < 0, 'purana report condition gaya');
ok(/class="sec on"[^>]*id="sec-hreq"/.test(HA.section('requests')),
   'hreq section "requests" tab par khula render hota hai');
ok(/class="sec"[^>]*id="sec-hreq"/.test(HA.section('users')),
   'aur doosre tab par band');

sec('4. Default tab aur query');
ok(/var tab = 'data';/.test(SRV), "default ab 'data'");
ok(/req\.query\.done === 'report'\) tab = 'data'/.test(SRV), 'report banne ke baad data tab');
ok(/NAV\.some\(function \(n\) \{ return n\.id === String\(req\.query\.tab \|\| ''\); \}\)/.test(SRV),
   '?tab= abhi bhi NAV se jaancha jaata hai');

sec('5. Badge: dono request ki ginti ek saath');
ok(/requests: \(reqs\.length \|\| 0\) \+ \(hreqPend \|\| 0\)/.test(SRV),
   'login + handle pending jod kar');
ok((SRV.match(/badges: \{/g) || []).length === 1, 'badges ek hi jagah banta hai');
ok(SRV.indexOf('hreq: hreqPend') < 0, 'alag hreq badge gaya');

sec('6. Asli page render karke dekho');
var ad = SRV.match(/function adminPage\(title, sections, role, opts\) \{[\s\S]*?\n\}/)[0];
var adminPage = new Function('NAV', 'ADCSS', 'TRKUI', 'HREQUI',
  ad + '\nreturn adminPage;')(NAV, 'x{}', TS, HA);

/* "Requests" tab khula ho to DONO section .on hone chahiye */
var secs = '<div class="sec on" data-sec="requests" id="sec-requests">LOGIN</div>'
         + HA.section('requests');
var page = adminPage('P', secs, 'admin', { tab: 'requests', badges: { requests: 4 } });
ok((page.match(/class="sec on"/g) || []).length === 2,
   'Requests tab par dono section khule: ' + (page.match(/class="sec on"/g) || []).length);
ok(/data-t="requests"[^<]*<span class="ic">[^<]*<\/span>Requests<span class="bg">4<\/span>/.test(page),
   'Requests ka badge 4 dikha');
ok(page.indexOf('data-t="hreq"') < 0, 'alag Handle Requests button nahi raha');
ok(page.indexOf('data-t="export"') < 0 && page.indexOf('data-t="report"') < 0,
   'alag Export/Report button nahi rahe');
ok(page.indexOf('data-t="data"') >= 0, 'Data & Reports ka button hai');

/* toggle ka asli vyavhaar -- page ki apni JS nikaal kar chalao */
(function () {
  var js = page.match(/var btns=document\.querySelectorAll\("\.nv"\)[\s\S]*?var h=\(location\.hash/)[0];
  js = js.replace(/var h=\(location\.hash$/, '');
  var S = [
    { id: 'sec-requests', dataset: { sec: 'requests' }, cls: {} },
    { id: 'sec-hreq',     dataset: { sec: 'requests' }, cls: {} },
    { id: 'sec-export',   dataset: { sec: 'data' },     cls: {} },
    { id: 'sec-report',   dataset: { sec: 'data' },     cls: {} },
    { id: 'sec-users',    dataset: {},                  cls: {} }
  ];
  S.forEach(function (x) { x.classList = { toggle: function (c, on) { x.cls[c] = !!on; } }; });
  var B = [{ dataset: { t: 'requests' }, classList: { toggle: function () {} } }];
  var doc = { querySelectorAll: function (q) { return q === '.nv' ? B : S; } };
  var fn = new Function('document', 'location', js + '\nreturn go;');
  var go = fn(doc, { hash: '' });

  go('requests');
  ok(S[0].cls.on && S[1].cls.on, 'go("requests") -> login aur handle dono on');
  ok(!S[2].cls.on && !S[3].cls.on && !S[4].cls.on, 'baaki band');

  go('data');
  ok(S[2].cls.on && S[3].cls.on, 'go("data") -> export aur report dono on');
  ok(!S[0].cls.on && !S[1].cls.on, 'requests wale band');

  go('users');
  ok(S[4].cls.on, 'bina data-sec wala section id se chalta hai (purana vyavhaar bacha)');
  ok(!S[2].cls.on, 'data wale band');
})();

sec('7. Section ka order');
ok(SRV.indexOf('sReq + HREQUI.section(tab)') >= 0,
   'Requests tab me pehle Login, phir Handle');

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
