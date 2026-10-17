/* t_hprof.js -- header ka profile (top-right)
   1. gol avatar me LOGIN KARNE WALE ka pehla akshar
   2. uska naam bhi
   3. menu me Request -> Handles To Be Added, aur Logout
   4. sidebar me profile ab nahi (wahan dobara title) */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRC = fs.readFileSync('./server.js', 'utf8');
var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var UTPL = fs.readFileSync('../UP-DASHBOARD/dashboard.template.html', 'utf8');

/* buildHtml ka naam/akshar wala hissa nikaal kar asli jaisa chalao */
function identity(who, role, dbUsers) {
  var PROF = { admin: { n: 'Admin', e: 'admin@jarvis.consulting', i: 'A' },
               up:    { n: 'Uttar Pradesh', e: 'uttarpradesh@jarvis.consulting', i: 'U' },
               punjab:{ n: 'Punjab', e: 'punjab@jarvis.consulting', i: 'P' },
               all:   { n: 'India Pulse', e: 'indiapulse@jarvis.consulting', i: 'I' },
               backend: { n: 'Backend Admin', e: 'admin_1@jarvis.consulting', i: 'B' } };
  var body = SRC.slice(SRC.indexOf('var _mail = String(who'), SRC.indexOf('var _mailShown ='))
           + 'var _mailShown = _mail || me.e; return {name:_disp, ini:_ini, mail:_mailShown};';
  return new Function('who', 'PROF', 'me', '_dbUsers', body)(
    who, PROF, PROF[role] || PROF.admin, dbUsers || {});
}

sec('1. Login karne wale ka naam aur pehla akshar');
var r = identity('rohit@jarvis.consulting', 'all', {});
ok(r.ini === 'R', 'rohit -> avatar me "R" (mila: "' + r.ini + '")');
ok(r.name === 'Rohit', 'naam "Rohit" dikhta hai (mila: "' + r.name + '")');
ok(r.mail === 'rohit@jarvis.consulting', 'email bhi sahi');

var r2 = identity('rohit.sharma@x.com', 'all', {});
ok(r2.name === 'Rohit Sharma', 'rohit.sharma -> "Rohit Sharma" (mila: "' + r2.name + '")');
ok(r2.ini === 'R', 'akshar phir bhi R');

var r3 = identity('rohit@x.com', 'all', { 'rohit@x.com': { name: 'Rohit Kumar Verma' } });
ok(r3.name === 'Rohit Kumar Verma', 'portal_users ka poora naam use hota hai');
ok(r3.ini === 'R', 'akshar uske naam se');

var r4 = identity('INDIAPULSE@JARVIS.CONSULTING', 'all', {});
ok(r4.name === 'India Pulse', 'base account par achha label (mila: "' + r4.name + '")');
ok(r4.ini === 'I', 'base account ka akshar I');

var r5 = identity('', 'up', {});
ok(r5.name === 'Uttar Pradesh' && r5.ini === 'U', 'email na mile to role wala naam');

var r6 = identity('9rohit@x.com', 'all', {});
ok(r6.ini === '9', 'number se shuru ho to wahi akshar');
var r7 = identity('a@x.com', 'all', { 'a@x.com': { name: '  ' } });
ok(r7.ini && r7.name, 'khaali naam par bhi kuch to dikhta hai: "' + r7.name + '"');

sec('2. Naam me < > " ho to page na toote');
ok(/function hpEsc\(x\)/.test(SRC), 'hpEsc() escaper hai');
var hpEsc = new Function('return ' + (SRC.match(/function hpEsc\(x\) \{[\s\S]*?\n\}/) || [''])[0]
  + '; ' )() || new Function((SRC.match(/function hpEsc\(x\) \{[\s\S]*?\n\}/) || [''])[0] + '; return hpEsc;')();
ok(hpEsc('<script>') === '&lt;script&gt;', 'tag escape hota hai');
ok(hpEsc('a"b') === 'a&quot;b', 'quote bhi');
ok(hpEsc("O'Brien") === 'O&#39;Brien', 'single quote bhi');
ok(/hpEsc\(_disp\)/.test(SRC) && /hpEsc\(_ini\)/.test(SRC) && /hpEsc\(_mailShown\)/.test(SRC),
   'naam, akshar aur email -- teeno escape hokar jaate hain');

sec('3. Header me lagta hai, sidebar me nahi');
ok(/document\.querySelector\('\.hdr-right'\)/.test(SRC), 'header ke daayein kone (.hdr-right) me lagta hai');
ok(/_hr\.insertAdjacentHTML\('beforeend'/.test(SRC), 'sabse aakhir me -- yaani sabse daayein');
ok(!/_sb\.innerHTML=/.test(SRC), 'sidebar ka title ab overwrite NAHI hota');
ok(!/_pfWrap/.test(SRC) || !/sb-brand/.test(SRC), 'purana sidebar wala profile hat gaya');
ok(/\.sb-title/.test(TPL), 'sidebar me "India Political Pulse" wapas dikhega');

sec('4. Menu me kya-kya hai');
ok(/<span>Request<\/span>/.test(SRC), 'Request');
ok(/<span>Logout<\/span>/.test(SRC), 'Logout');
ok(/href="\/logout"/.test(SRC), 'Logout sach me /logout par le jaata hai');
ok(/switchTab\('handle-req'\)/.test(SRC), 'Request -> Handles To Be Added tab');
ok(/sec-handle-req/.test(SRC), 'wahan tak scroll bhi karta hai');
ok(/id="sec-handle-req"/.test(require('./hreq_lib.js').section()), 'section ka id sach me yahi hai');
ok(/aria-haspopup="true"/.test(SRC), 'menu button par aria-haspopup');
ok(/aria-expanded/.test(SRC), 'khula/band aria-expanded se bhi pata chalta hai');

sec('5. Jo code browser me jaata hai, wo chalta bhi hai');
var blk = SRC.match(/\+ "try\{"\n\s*\+\s*"var _hr=document\.querySelector[\s\S]*?\+ "\}catch\(e\)\{\}"\n/);
ok(!!blk, 'header wala block mila');
var hdrProfCss = '<style id="hp-css">.hp-av{}</style>';
var hdrProf = '<div class="hp-wrap" id="hpWrap">PROFILE</div>';
var js = new Function('hdrProfCss', 'hdrProf', 'return ""' + blk[0] + ';')(hdrProfCss, hdrProf);
ok(js.indexOf('var _hr=') >= 0, 'tukde jud kar sahi JS bana');
ok(js.indexOf('PROFILE') >= 0, 'widget ka HTML bhi andar gaya');

/* ---- nakli DOM ---- */
var LIVE = false, injected = { css: 0, html: 0 }, tabWent = null;
var bodyKids = [], docHandlers = {}, winHandlers = {};
function mkNode(id) {
  var cls = {};
  return { id: id, _attr: {}, style: {}, offsetWidth: 234, _kids: [],
    classList: {
      add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
      toggle: function (c, v) { if (v) cls[c] = 1; else delete cls[c]; },
      contains: function (c) { return !!cls[c]; } },
    setAttribute: function (k, v) { this._attr[k] = v; },
    addEventListener: function (ev, fn) { this['on_' + ev] = fn; },
    getBoundingClientRect: function () { return { bottom: 54, right: 1200, top: 20, left: 1100 }; },
    contains: function (n) { return n === this || this._kids.indexOf(n) >= 0; } };
}
var nodes = { hpWrap: mkNode('hpWrap'), hpBtn: mkNode('hpBtn'),
              hpMenu: mkNode('hpMenu'), hpReq: mkNode('hpReq') };
nodes.hpWrap._kids = [nodes.hpBtn];
nodes.hpMenu._kids = [nodes.hpReq];
var fakeDoc = {
  querySelector: function (q) {
    if (q === '.hdr-right') return { insertAdjacentHTML: function (_, h) { injected.html = h.length; LIVE = true; } };
    return null;
  },
  getElementById: function (i) { return LIVE ? (nodes[i] || null) : null; },
  head: { insertAdjacentHTML: function (_, h) { injected.css = h.length; } },
  body: { appendChild: function (n) { bodyKids.push(n); } },
  addEventListener: function (ev, fn) { docHandlers[ev] = fn; }
};
var fakeWin = { innerWidth: 1366, scrollTo: function () {},
                addEventListener: function (ev, fn) { winHandlers[ev] = fn; } };
new Function('document', 'switchTab', 'window',
  js)(fakeDoc, function (t) { tabWent = t; }, fakeWin);

ok(injected.css > 10, 'CSS head me jaati hai (' + injected.css + ' chars)');
ok(injected.html > 10, 'widget header me jaata hai (' + injected.html + ' chars)');

sec('5b. Menu header ke bahar nikalta hai  <-- yahi bug tha');
ok(/header\{[^}]*overflow:hidden/.test(TPL), 'header par overflow:hidden hai (isi se menu kat raha tha)');
ok(bodyKids.indexOf(nodes.hpMenu) >= 0, 'menu body me chala jaata hai, header ke andar nahi rehta');
ok(/\.hp-menu\{[^}]*position:fixed/.test(SRC), 'menu position:fixed hai');
ok(!/\.hp-menu\{[^}]*position:absolute/.test(SRC), 'purana position:absolute hat gaya');
ok(/z-index:2147483000/.test(SRC), 'sabse upar rehta hai');
ok(/\.hp-menu\.open\{display:block\}/.test(SRC), 'khulna ab menu ki apni class se');

sec('5c. Khulta-banda hai aur sahi jagah baithta hai');
ok(typeof nodes.hpBtn.on_click === 'function', 'button par click lagta hai');
nodes.hpBtn.on_click({ stopPropagation: function () {} });
ok(nodes.hpMenu.classList.contains('open'), 'ek click -> menu khula');
ok(nodes.hpWrap.classList.contains('open'), 'caret bhi ghoom gaya');
ok(nodes.hpBtn._attr['aria-expanded'] === 'true', 'aria-expanded true');
ok(nodes.hpMenu.style.top === '62px', 'button ke 8px neeche baitha: ' + nodes.hpMenu.style.top);
ok(nodes.hpMenu.style.left === '966px',
   'daayein kinare se line me (1200-234): ' + nodes.hpMenu.style.left);
nodes.hpBtn.on_click({ stopPropagation: function () {} });
ok(!nodes.hpMenu.classList.contains('open'), 'dobara click -> band');

sec('5d. Menu ke ANDAR click karne par band na ho');
nodes.hpBtn.on_click({ stopPropagation: function () {} });
docHandlers.click({ target: nodes.hpReq });
ok(nodes.hpMenu.classList.contains('open'),
   'menu ke andar click -> khula hi rehta hai (warna Request kabhi chalta hi nahi)');
docHandlers.click({ target: mkNode('kahin_aur') });
ok(!nodes.hpMenu.classList.contains('open'), 'bahar click -> band');
nodes.hpBtn.on_click({ stopPropagation: function () {} });
docHandlers.keydown({ key: 'Escape' });
ok(!nodes.hpMenu.classList.contains('open'), 'Escape se bhi band');

sec('5e. Scroll/resize par jagah theek rehti hai');
ok(typeof winHandlers.scroll === 'function', 'scroll par dobara naapta hai');
ok(typeof winHandlers.resize === 'function', 'resize par bhi');
nodes.hpBtn.on_click({ stopPropagation: function () {} });
nodes.hpMenu.style.top = '0px';
winHandlers.scroll();
ok(nodes.hpMenu.style.top === '62px', 'scroll ke baad phir button ke neeche: ' + nodes.hpMenu.style.top);
/* chhoti screen par screen se bahar na nikle */
fakeWin.innerWidth = 320;
winHandlers.resize();
ok(parseInt(nodes.hpMenu.style.left, 10) >= 8, 'chhoti screen par baayein kinare ke andar');
ok(parseInt(nodes.hpMenu.style.left, 10) + 234 <= 320, 'aur daayein se bhi bahar nahi');
fakeWin.innerWidth = 1366;

sec('5f. Request ab bhi kaam karta hai');
ok(typeof nodes.hpReq.on_click === 'function', 'Request par click lagta hai');
nodes.hpReq.on_click();
ok(tabWent === 'handle-req', 'Handles To Be Added khulta hai (mila: ' + tabWent + ')');
ok(!nodes.hpMenu.classList.contains('open'), 'aur menu band ho jaata hai');

sec('6. Login karne wala email server tak pahunchta hai');
ok(/async function buildHtml\(scope, role, who\)/.test(SRC), 'buildHtml ko email milta hai');
/* dash-cache (10-Oct): serveDash ko ab req bhi milta hai (Accept-Encoding ke liye) */
ok(/async function serveDash\(scope, res, role, who, req\)/.test(SRC), 'serveDash bhi aage bhejta hai');
ok(/serveDash\('all', res, r, emailOf\(req\), req\)/.test(SRC), 'All India route email bhejta hai');
ok(/serveDash\('up', res, r, emailOf\(req\), req\)/.test(SRC), 'UP route bhi');
ok(/buildHtml\(scope, role, who\)/.test(SRC), 'serveDash se buildHtml tak pahunchta hai');

sec('7. Dono dashboard par');
ok(/class="hdr-right"/.test(TPL) && /class="hdr-right"/.test(UTPL),
   'All-India aur UP, dono me header ka daayein kona hai');
ok(TPL.indexOf('id="sec-handle-req"') >= 0 && UTPL.indexOf('id="sec-handle-req"') >= 0,
   'dono me Handles To Be Added section hai');

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
