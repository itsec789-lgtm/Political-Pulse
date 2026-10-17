/* t_en.js -- "data update hone" wale dono message English me hon.
   1. header pill ka tooltip (hover par aata hai)
   2. naya data aane par jo HARA banner aata hai */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRV = fs.readFileSync('./server.js', 'utf8');
var USRV = fs.readFileSync('../UP-DASHBOARD/server.js', 'utf8');
var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var UTPL = fs.readFileSync('../UP-DASHBOARD/dashboard.template.html', 'utf8');

sec('1. Header pill ka tooltip');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  var m = t.match(/id="updPill"[^>]*title="([^"]*)"/);
  ok(!!m, n + ': updPill par tooltip hai');
  ok(m && m[1] === 'When the data was last updated', n + ': tooltip = "' + (m && m[1]) + '"');
  ok(m && !/kab|hua|naya|pehle/i.test(m[1]), n + ': tooltip me Hinglish nahi');
});
ok(/'\\u21BB ' \+ txt/.test(TPL), 'pill par waqt ago() se aata hai (pehle se English)');
ok(/return day === 1 \? '1 day ago' : day \+ ' days ago'/.test(TPL), "ago() English deta hai: '1 day ago'");
ok(/hr === 1 \? '1 hour ago' : hr \+ ' hours ago'/.test(TPL), "ghante bhi English: '1 hour ago'");
ok(/'Data last updated: '/.test(TPL), 'hover ka poora waqt bhi English');
ok(/'Not known yet'/.test(TPL), 'pata na ho to bhi English');

sec('2. Naya data aane par hara banner');
[['All-India', SRV], ['UP', USRV]].forEach(function (x) {
  var n = x[0], s = x[1];
  var m = s.match(/toast\('([^']*)'\);/);
  ok(!!m, n + ': toast() bulaya jaata hai');
  var raw = m ? m[1] : '';
  /* server JS ko string ke andar likhta hai, isliye \\u -> \u karke padho */
  var txt = raw.replace(/\\\\u([0-9a-fA-F]{4})/g, function (_, h) {
    return String.fromCharCode(parseInt(h, 16));
  });
  ok(txt === '✓ New data is in — refreshing…',
     n + ': banner = "' + txt + '"');
  ok(!/Naya|naya|gaya|raha/.test(txt), n + ': banner me Hinglish nahi');
  ok(/background:#177245;color:#fff/.test(s), n + ': hara rang waisa hi hai');
});

sec('3. Jo code browser me jaata hai wo chalta bhi hai');
var blk = SRV.match(/"function toast\(m\)[\s\S]*?setInterval\(check,30000\);check\(\);"/);
ok(!!blk, 'toast + check wala block mila');
/* server ye code "a" + "b" + "c" ke tukdon me likhta hai.
   Har tukda apne aap me ek JSON string hai -- alag-alag padh kar jodo. */
var js = blk[0].split('\n').map(function (l) {
  l = l.trim().replace(/^\+\s*/, '');
  return JSON.parse(l);
}).join('');
ok(js.indexOf('function toast(m)') === 0, 'tukde jud kar sahi JS bana');
var ran = null, added = null;
var fakeDoc = {
  createElement: function () { return { style: { cssText: '' } }; },
  body: { appendChild: function (d) { added = d; } }
};
new Function('document', 'fetch', 'setInterval', 'setTimeout', 'scope', 'location',
  'var cur=null;' + js + '; toast("TEST"); check();')(
  fakeDoc,
  function () { return { then: function () { return { then: function () { return { catch: function () {} }; } }; } }; },
  function () {}, function () {}, 'all', { protocol: 'http:', reload: function () {} });
ok(!!added, 'toast() sach me ek div banata hai (code chalta hai)');
ok(added && added.textContent === 'TEST', 'div par wahi text lagta hai');
ok(added && /position:fixed/.test(added.style.cssText), 'screen par upar tairta hai');
ok(added && /#177245/.test(added.style.cssText), 'hara background lagta hai');

sec('4. Dono dashboard ek jaise');
ok(SRV.indexOf('New data is in') >= 0 && USRV.indexOf('New data is in') >= 0,
   'All-India aur UP, dono par ek hi message');
ok(TPL.indexOf('When the data was last updated') >= 0
   && UTPL.indexOf('When the data was last updated') >= 0,
   'tooltip bhi dono par ek jaisa');

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
