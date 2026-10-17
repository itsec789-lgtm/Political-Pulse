/* t_3fix.js -- teen cheezein
   1. Top Leaders ka heading chuni hui date dikhaye
   2. ek aadmi ke kai pad (Yogi: CM aur MLA dono)
   3. "See more" kisi tab ke upar na chadhe, rang bhi halka */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRC = fs.readFileSync('./server.js', 'utf8');
var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var MAPL = require('./mapping_lib.js');

/* ---------- 1. heading ---------- */
sec('1. Heading me CHUNI HUI date');
var blk = SRC.match(/\+ "try\{"\n\s*\+\s*"var _MN=\[[\s\S]*?\+ "\}catch\(e\)\{\}"\n/);
ok(!!blk, 'range-title wala block mila');
var js = new Function('return ""' + blk[0] + ';')();

var titleEl = { textContent: 'Top 15 Handles by Views — Apr–Oct 2026' };
var vals = { tlFrom: '2026-04-01', tlTo: '2026-10-07' };
var doc = {
  getElementById: function (i) {
    if (i === 'sec-top-leaders') return { querySelector: function (q) { return q === '.sec-title' ? titleEl : null; } };
    if (vals[i] !== undefined) return { value: vals[i] };
    return null;
  }
};
var win = { PHD_DATES: ['2026-04-01', '2026-10-07'] };
new Function('document', 'window', 'setInterval', 'setTimeout', 'clearInterval', js)
  (doc, win, function () {}, function () {}, function () {});
ok(typeof win._leadTitle === 'function', '_leadTitle() ban gaya');

win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Apr–Oct 2026',
   'poori range par purana text waisa hi: "' + titleEl.textContent + '"');

vals.tlFrom = '2026-10-05'; vals.tlTo = '2026-10-07'; win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Oct 05–07, 2026',
   '3 din par: "' + titleEl.textContent + '"');

vals.tlFrom = '2026-09-28'; vals.tlTo = '2026-10-07'; win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Sep 28 – Oct 07, 2026',
   'do mahine par: "' + titleEl.textContent + '"');

vals.tlFrom = '2026-10-07'; vals.tlTo = '2026-10-07'; win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Oct 07, 2026',
   'ek hi din par: "' + titleEl.textContent + '"');

vals.tlFrom = '2025-12-30'; vals.tlTo = '2026-01-02'; win._leadTitle();
ok(/Dec 30, 2025 – Jan 02, 2026/.test(titleEl.textContent),
   'saal badalne par dono saal: "' + titleEl.textContent + '"');

vals.tlFrom = '2026-04-01'; vals.tlTo = '2026-10-07'; win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Apr–Oct 2026',
   'wapas poori range -> phir wahi purana text');

vals.tlFrom = ''; vals.tlTo = ''; win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Apr–Oct 2026', 'date khaali ho to bhi na bigde');
ok(/renderLeaders\._tt/.test(js), 'renderLeaders ke baad apne aap chalta hai');
ok(/_base/.test(js), 'asli heading yaad rakhta hai (baar-baar kaat kar chhota na ho)');

/* 2 baar chalane par bhi heading na bigde */
vals.tlFrom = '2026-10-05'; vals.tlTo = '2026-10-07';
win._leadTitle(); win._leadTitle(); win._leadTitle();
ok(titleEl.textContent === 'Top 15 Handles by Views — Oct 05–07, 2026',
   'teen baar chalane par bhi wahi: "' + titleEl.textContent + '"');

/* ---------- 2. kai pad ---------- */
sec('2. Ek aadmi ke kai pad');
ok(/var HDESIG = \{\};/.test(SRC), 'server HDESIG banata hai');
ok(/MAPL\.load\(\)/.test(SRC), 'mapping se hi uthata hai (pipeline dobara nahi chalani)');
ok(/d\.length < 2/.test(SRC), 'sirf jinke 2+ pad hain, unhi ke liye');

/* server ka HDESIG banane wala hissa nikaal kar chalao */
var hdBody = SRC.slice(SRC.indexOf('var HDESIG = {};'), SRC.indexOf("  var hdrProfCss ="));
var HD = new Function('MAPL', 'console', hdBody + '; return HDESIG;')(MAPL, { log: function () {} });
ok(HD['myogiadityanath'] && HD['myogiadityanath'].length === 2,
   'Yogi ke do pad mile: ' + JSON.stringify(HD['myogiadityanath']));
ok(HD['myogiadityanath'].indexOf('Chief Minister') >= 0, 'Chief Minister hai');
ok(HD['myogiadityanath'].indexOf('MLA') >= 0, 'MLA bhi hai');
/* newmap (13-Oct): pehle yahan naam gin-gin kar likhe the --
   @amitshah ka ek hi pad maana gaya tha (ab 'Cabinet Minister | LS_MP'
   do pad hain), aur @AtishiAAP par 'Former Chief Minister' (nayi Mapping
   me wo sirf MLA hain). Aise naam mapping ke saath badalte rehte hain,
   isliye ab NIYAM jaancha jaata hai -- HDESIG me THEEK wahi handle hon
   jinke mapping me ek se zyada pad hain, aur unka text saaf hokar aaye. */
(function () {
  var M = MAPL.load() || {};
  var want = {}, nSingle = 0, single = '';
  Object.keys(M).forEach(function (k) {
    var rec = M[k] || {};
    if (rec.alias_of) return;
    var d = Array.isArray(rec.designations) ? rec.designations : [];
    if (d.length > 1) want[String(k).toLowerCase()] = 1;
    else if (d.length === 1) { nSingle++; if (!single) single = String(k).toLowerCase(); }
  });
  var have = Object.keys(HD).map(function (k) { return String(k).toLowerCase(); });
  var extra = have.filter(function (k) { return !want[k]; });
  ok(extra.length === 0,
     'list me sirf multi-pad wale hain (' + have.length + ')'
     + (extra.length ? '  [bahar wale: ' + extra.slice(0, 4).join(', ') + ']' : ''));
  ok(nSingle > 0 && !HD[single] && !HD[single.toUpperCase()],
     'ek hi pad wala (@' + single + ') list me nahi -- payload chhota rehta hai');
  ok(have.length > 50 && have.length < Object.keys(M).length * 0.25,
     'itne handle multi-pad wale: ' + have.length + ' / ' + Object.keys(M).length);
  /* saaf hokar aana: koi pad POORA chillata hua (ALL-CAPS) na bacha ho.
     DHYAN: 'Secretary - AICC' ya 'MPCC Working Committee invitee' galat
     nahi hain -- AICC/MPCC asli sanstha ke naam hain. Isliye sirf wo pad
     pakde jaate hain jisme ek bhi chhota akshar na ho (jaise Excel me
     likha 'FORMER CHIEF MINISTER'), token-token nahi. */
  var caps = [];
  Object.keys(HD).forEach(function (k) {
    (HD[k] || []).forEach(function (t) {
      var x = String(t);
      if (x.length > 4 && /[A-Z]/.test(x) && !/[a-z]/.test(x)) caps.push(k + ': ' + x);
    });
  });
  ok(caps.length === 0, 'har pad saaf (ALL-CAPS nahi bacha)'
     + (caps.length ? '  [' + caps.slice(0, 3).join(' | ') + ']' : ''));
})();
ok(!JSON.stringify(HD).match(/LS_MP/), 'LS_MP -> "LS MP" ban jaata hai');

/* roleOf lapetne wala code sach me chalta hai */
var rblk = SRC.match(/\+ "try\{var HD=" \+ JSON\.stringify\(HDESIG\)[\s\S]*?\+ "\}catch\(e\)\{\}"\n/);
ok(!!rblk, 'roleOf lapetne wala block mila');
var rjs = new Function('HDESIG', 'JSON', 'return ""' + rblk[0] + ';')(
  { myogiadityanath: ['Chief Minister', 'MLA'] }, JSON);
var W = { roleOf: function (h, fb) { return fb || 'PURANA'; } };
new Function('window', rjs)(W);
ok(W.roleOf('myogiadityanath', 'MLA') === 'Chief Minister / MLA',
   'Yogi par dono pad: "' + W.roleOf('myogiadityanath', 'MLA') + '"');
ok(W.roleOf('MYOGIADITYANATH', 'MLA') === 'Chief Minister / MLA', 'bada-chhota akshar chalta hai');
ok(W.roleOf('kisi_aur', 'LS MP') === 'LS MP', 'baaki sab par pehle jaisa hi');
ok(W.roleOf._multi === true, 'dobara lapetne se bachta hai');
new Function('window', rjs)(W);
ok(W.roleOf('myogiadityanath', 'MLA') === 'Chief Minister / MLA', 'dobara chalane par bhi nahi bigda');
ok(/window\.roleOf\?window\.roleOf\(h\.h,h\.level\)/.test(TPL),
   'Top Leaders ki row isi roleOf se pad uthati hai');

/* ---------- 3. See more ---------- */
sec('3. "See more" -- dikhta hai, aur kisi tab ko dhakta nahi');
ok(/#navMore\{[^}]*position:sticky/.test(SRC), 'nav ke neeche chipka rehta hai (yahi theek se render hota hai)');
ok(!/#mainNav\{padding-bottom/.test(SRC),
   'nav par padding-bottom NAHI -- sticky uske content-box se neeche ja hi nahi sakta,'
   + ' isliye padding jitna teer UPAR uth kar beech ke tab kaat raha tha');
ok(/#navMore\{[^}]*bottom:-10px/.test(SRC),
   'teer sabse neeche chipakta hai (09-Oct: thoda aur neeche)');
ok(/margin:10px -12px -18px/.test(SRC), 'aakhri tab se 10px ka faasla');
var btnHtml = (SRC.match(/_nm\.innerHTML='([^']*)'/) || ['',''])[1];
ok(btnHtml.indexOf('<svg') === 0 && !/See more/i.test(btnHtml),
   'button me koi likhavat nahi -- sirf teer (tab ka naam na dhake)');
ok(!/rgba\(192,67,13,\.92\)/.test(SRC), 'purana bhadkeela gradient hat gaya');
ok(!/rgba\(201,74,16/.test(SRC) && !/rgba\(196,70,14/.test(SRC), 'koi orange rang nahi bacha');
ok(/rgba\(255,250,244,0\) 0%/.test(SRC), 'sidebar ka apna halka cream, upar se paardarshi');
ok(/color:#F08A1A/.test(SRC), 'teer saffron (bhagwa) rang ka');
ok(/backdrop-filter:blur\(3px\)/.test(SRC), 'peechhe halka blur');
ok(!/text-shadow/.test(SRC.slice(SRC.indexOf('#navMore{'), SRC.indexOf('#navMore.on'))),
   'koi text-shadow nahi -- bilkul halka');
ok(/#navMore:hover\{color:#D9661A\}/.test(SRC), 'hover par thoda gehra saffron');
ok(/#navMore\.on\{display:flex\}/.test(SRC), 'zaroorat par hi dikhta hai');
ok(/scrollHeight-2\)/.test(SRC), 'sirf 2px ki chhoot -- thoda sa bhi bacha ho to dikhta hai');

sec('3b. Teer: hilta hua ishaara');
ok(/animation:navBob 1\.25s/.test(SRC), 'bina ruke upar-neeche hota hai');
ok(/55%\{transform:translateY\(4px\);opacity:\.95\}/.test(SRC), '6px ka safar');
ok(/width=\\"26\\" height=\\"26\\"/.test(SRC), 'teer 26px ka (saaf dikhe)');
ok(/#navMore:hover svg\{animation-play-state:paused\}/.test(SRC), 'mouse le jaate hi ruk jaata hai');

sec('3c. Baad me nav badle to bhi pakad le');
ok(/new ResizeObserver\(_navMore\)/.test(SRC), 'naap badle to dobara dekhta hai');
ok(/new MutationObserver\(_navMore\)/.test(SRC), 'tab jude/hate to dobara');
ok(/document\.fonts\.ready\.then\(_navMore\)/.test(SRC), 'font aane ke baad bhi');
ok(/clearInterval\(_ni\)/.test(SRC), 'shuru ke kuch second dekhta hai, phir chhod deta hai');

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
