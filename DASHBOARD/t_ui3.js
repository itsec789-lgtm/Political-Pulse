/* t_ui3.js -- 07 Oct ke 4 kaam:
   1. "Today" ka button har jagah se hat gaya (dropdown ka option raha)
   2. har filter bar par "kab se kab tak" wali line
   3. Executive Summary ab date filter maanta hai (asli data par hisaab)
   4. Most Active chart sach me data se banta hai */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var UTPL = fs.readFileSync('../UP-DASHBOARD/dashboard.template.html', 'utf8');
var BLOBS = {}; require('./data/dashboard_data.json').forEach(function (b) { BLOBS[b.key] = b.value; });

sec('1. Today ka button');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(t.indexOf('Today</button>') < 0, n + ': ek bhi Today button nahi bacha');
  ok(!/p\.value='today';[^"]*">[^<]*Today<\/button>/.test(t), n + ': purana onclick bhi gaya');
  var opt = (t.match(/<option value="today">/g) || []).length;
  /* 10-Oct (5): parties tab ke naye Date Range me bhi Today aa gaya -> 9 se 10 */
  ok(opt === 10, n + ': dropdown me Today option ab bhi hai (' + opt + ' jagah)');
  ok(/function dashPresetChange/.test(t), n + ": dropdown se Today chunna ab bhi chalta hai");
});

sec('2. Har filter bar par date range likhi aati hai');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(/range-note :/.test(t), n + ': range-note laga hai');
  ok(/select\[id\$="Preset"\]/.test(t), n + ': har QUICK wale bar ko dhoondta hai');
  ok(/b\.pre\+'RangeNote'/.test(t), n + ': har bar ka apna note banta hai');
  ok(/Math\.round\(\(b-a\)\/86400000\)\+1/.test(t), n + ': dono din ginte hain (05->07 = 3 days)');
});
/* asli hisaab */
var S = (TPL.match(/function nice\(d\)\{[\s\S]*?\n  \}/) || [''])[0]
      + (TPL.match(/function days\(f,t\)\{[\s\S]*?\n  \}/) || [''])[0];
var H = new Function("var MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];"
  + S + '; return {nice:nice,days:days};')();
ok(H.days('2026-10-05', '2026-10-07') === 3, '05 Oct -> 07 Oct = 3 days: ' + H.days('2026-10-05', '2026-10-07'));
ok(H.days('2026-10-07', '2026-10-07') === 1, 'ek hi din = 1 day');
ok(H.days('2026-04-01', '2026-10-07') === 190, 'poori range = 190 days: ' + H.days('2026-04-01', '2026-10-07'));
ok(H.nice('2026-10-05') === '05 Oct 2026', 'saaf format: ' + H.nice('2026-10-05'));
ok(H.nice('2026-04-01') === '01 Apr 2026', 'mahina naam se: ' + H.nice('2026-04-01'));
ok(H.days('', '') === 0, 'khaali par crash nahi');

sec('3. Executive Summary date filter maanta hai');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(/function hExecRange\(f, t\)/.test(t), n + ': hExecRange() hai');
  ok(/try\{window\.hExecRange&&window\.hExecRange\(f,t\);\}catch\(e\)\{\}/.test(t),
     n + ': renderDashDate se bulaya jaata hai (yaani filter badalte hi chalta hai)');
  ok(/if \(AD\[i\] >= f && AD\[i\] <= t\) idx\.push\(i\)/.test(t), n + ': sirf chune hue din ginta hai');
  ok(/D\.handles\.forEach/.test(t), n + ': wahi per-din data use karta hai jisse KPI bante hain');
  /* si-compact (09-Oct): Sentiment Insights hExecRange ke haath se nikal kar
     renderSentInsights() ke paas chala gaya -- 7 sentiment, compact list. */
  ok((t.match(/if\(window\.renderSentInsights\) window\.renderSentInsights\(\);/g) || []).length === 2,
     n + ': Sentiment Insights ab renderSentInsights() se banta hai');
  ok(t.indexOf("document.getElementById('siCard')") < 0,
     n + ': purane exec function siCard par likhte nahi');
  ok(/X\.tot\(s\)/.test(t), n + ': sentiment % ab poore 8 bucket par (3-of-8 wali galti gayi)');
});

/* ---- asli data par chala kar dekho ---- */
var fn = (TPL.match(/function hExecRange\(f, t\) \{[\s\S]*?\n\}\nwindow\.hExecRange/) || [''])[0]
  .replace(/\nwindow\.hExecRange$/, '');
var rows = {};
function mkEl(id) {
  return { id: id, _r: [], querySelectorAll: function () { return this._r; },
           querySelector: function () { return null; } };
}
function run(from, to) {
  var cards = { khCard: mkEl('kh'), ppCard: mkEl('pp'), siCard: mkEl('si') };
  ['khCard', 'ppCard', 'siCard'].forEach(function (k) {
    for (var i = 0; i < 5; i++) cards[k]._r.push({ innerHTML: '' });
  });
  var doc = { getElementById: function (id) { return cards[id] || null; },
              createElement: function () { return { style: {}, className: '', appendChild: function () {} }; } };
  new Function('D', 'PHD', 'UNI', 'document', 'window',
    fn + '; hExecRange(' + JSON.stringify(from) + ',' + JSON.stringify(to) + ');')(
    BLOBS.D, PHDMAP, BLOBS.UNI, doc,
    { fmt: function (x) { return String(x); }, nd: function (d) { return d; }, SENTX: SENTX });
  return cards;
}
var PHDMAP = {}; require('./data/phd.json').forEach(function (r) { PHDMAP[r.h] = r; });
var SENTX = { tot: function (s) { var n = 0; Object.keys(s).forEach(function (k) { n += +s[k] || 0; }); return n; } };

var AD = BLOBS.D.AD;
var FULLF = AD[0], FULLT = AD[AD.length - 1];
var L3F = AD[AD.length - 3], L3T = AD[AD.length - 1];

var a = run(FULLF, FULLT), b = run(L3F, L3T);
function txt(c, i) { return String(c._r[i].innerHTML).replace(/<[^>]*>/g, ''); }

ok(txt(a.khCard, 0).length > 0, 'poori range par Key Highlights bhare');
ok(txt(b.khCard, 0).length > 0, '3 din par bhi bhare');
ok(txt(a.khCard, 0) !== txt(b.khCard, 0), 'top handle badla: \n        full: ' + txt(a.khCard, 0)
   + '\n        3din: ' + txt(b.khCard, 0));
/* peak day dono range me wahi ho sakta hai (agar sabse busy din pichhle
   3 din me hi pada ho) -- isliye sirf ye dekho ki line bhari hui hai. */
ok(/\d/.test(txt(a.khCard, 2)) && /\d/.test(txt(b.khCard, 2)),
   'peak day dono range me likha hua hai: \n        full: ' + txt(a.khCard, 2)
   + '\n        3din: ' + txt(b.khCard, 2));
ok(txt(a.ppCard, 0) !== txt(b.ppCard, 0), 'Party Performance badla: \n        full: ' + txt(a.ppCard, 0)
   + '\n        3din: ' + txt(b.ppCard, 0));
ok(/full range/.test(txt(b.khCard, 3)), 'peak HOUR par saaf likha hai ki wo poori range ka hai');
ok(!/full range/.test(txt(a.khCard, 3)), 'poori range par wo note nahi aata');

/* ginti sach me sahi hai? */
function sumRange(f, t) {
  var idx = []; AD.forEach(function (d, i) { if (d >= f && d <= t) idx.push(i); });
  var tot = 0; BLOBS.D.handles.forEach(function (h) { idx.forEach(function (i) { tot += (h.t && h.t[i]) || 0; }); });
  return { days: idx.length, tw: tot };
}
var r3 = sumRange(L3F, L3T), rf = sumRange(FULLF, FULLT);
ok(rf.tw === BLOBS.UNI.tot.tw, 'poori range ka jod UNI.tot se milta hai: ' + rf.tw);
ok(r3.days === 3, '3 din matlab 3 hi din');
ok(r3.tw > 0 && r3.tw < rf.tw, '3 din ka jod chhota hai: ' + r3.tw + ' vs ' + rf.tw);
/* siCard ki line ab hExecRange nahi likhta (si-compact 09-Oct) --
   wo card poora renderSentInsights() banata hai, jiski jaanch t_fin3.js
   me asli code chala kar hoti hai. Yahan sirf itna ki wo chhoota nahi. */
ok(txt(b.siCard, 3).indexOf('Loading') >= 0 || txt(b.siCard, 3) === '',
   'siCard ki line hExecRange ne chhoori hi nahi: ' + txt(b.siCard, 3));

sec('4. Most Active chart: sach me data se banta hai?');
ok(/var act=HF\.map/.test(TPL), 'Most Active HF (per-din data) se banta hai, kisi literal se nahi');
ok(/sr\(h\.t,idx\)/.test(TPL), 'chune hue dino ke tweets ginta hai');
(function () {
  var idx = []; AD.forEach(function (d, i) { if (d >= L3F && d <= L3T) idx.push(i); });
  function sr(a) { var s = 0; idx.forEach(function (i) { s += (a && a[i]) || 0; }); return s; }
  var R = BLOBS.D.handles.map(function (h) { return { n: h.n, h: h.h, t: sr(h.t) }; })
    .sort(function (x, y) { return y.t - x.t; });
  var modi = R.filter(function (r) { return /^narendramodi$/i.test(r.h); })[0];
  ok(!!modi, 'Modi data me maujood hain');
  /* asli ginti data ke saath badalti rehti hai -- isliye pakki number
     nahi, bas itna ki wo data se aa rahi hai aur top-6 se kam hai. */
  ok(modi.t > 0 && modi.t < R[0].t,
     'pichhle 3 din me Modi ke ' + modi.t + ' tweet hain (top wale se kam)');
  ok(R[0].t > modi.t, 'top par ' + R[0].n + ' hain (' + R[0].t + ' tweet) -- chart sahi hai');
  var rank = R.findIndex(function (r) { return r.h === modi.h; }) + 1;
  ok(rank > 6, 'Modi tweet-ginti me rank ' + rank + ' par hain, isliye top-6 me nahi aate');
  var V = BLOBS.D.handles.map(function (h) { return { h: h.h, v: sr(h.v) }; })
    .sort(function (x, y) { return y.v - x.v; });
  var vr = V.findIndex(function (r) { return /^narendramodi$/i.test(r.h); }) + 1;
  ok(vr <= 3, 'par VIEWS me Modi rank ' + vr + ' par hain -- wahan dikhte hain');
})();

sec('5. "May" ab hardcoded nahi -- asli mahina aata hai');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(!/May '\+f\.slice\(8\)/.test(t.replace(/\/\*[\s\S]*?\*\//g, '')),
     n + ": Executive Summary ka 'May' hat gaya");
  ok(!/Peak day: <b>May '\+\(bi\+1\)/.test(t), n + ": 'Peak day: May <number>' bhi hat gaya");
  ok(/function rngLabel\(f, t\)/.test(t), n + ': rngLabel() se naam banta hai');
  ok(/function pkDay\(i\)/.test(t), n + ': pkDay() se peak din ka date');
  ok(/_et\.textContent='Executive Summary \\u2014 '\+rngLabel\(f,t\)/.test(t)
     || t.indexOf("_et.textContent='Executive Summary — '+rngLabel(f,t)") >= 0,
     n + ': title ab rngLabel se bana hai');
});
var RL = new Function((TPL.match(/function rngLabel\(f, t\) \{[\s\S]*?\n\}/) || [''])[0]
  + '; return rngLabel;')();
ok(RL('2026-10-05', '2026-10-07') === '05–07 Oct 2026',
   'screenshot wali range: ' + RL('2026-10-05', '2026-10-07'));
ok(RL('2026-10-05', '2026-10-07').indexOf('May') < 0, 'usme May kahin nahi');
ok(RL('2026-10-07', '2026-10-07') === '07 Oct 2026', 'ek din: ' + RL('2026-10-07', '2026-10-07'));
ok(RL('2026-04-01', '2026-10-07') === '01 Apr – 07 Oct 2026',
   'poori range: ' + RL('2026-04-01', '2026-10-07'));
ok(RL('2026-09-28', '2026-10-07') === '28 Sep – 07 Oct 2026',
   'do mahine: ' + RL('2026-09-28', '2026-10-07'));
ok(RL('2025-12-30', '2026-01-02') === '30 Dec 2025 – 02 Jan 2026',
   'saal badle to dono saal: ' + RL('2025-12-30', '2026-01-02'));
ok(RL('', '') === '', 'khaali par khaali, crash nahi');
var PK = new Function('AGG', (TPL.match(/function pkDay\(i\) \{[\s\S]*?\n\}/) || [''])[0]
  + '; return pkDay;')({ dates: BLOBS.AGG.dates });
var A = BLOBS.AGG.S['ALL|ALL'].t, bi = 0;
for (var q = 1; q < A.length; q++) if (A[q] > A[bi]) bi = q;
(function () {
  var MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var d = String(BLOBS.AGG.dates[bi]).split('-');
  var want = d[2] + ' ' + MO[(+d[1] || 1) - 1];
  ok(PK(bi) === want, 'asli peak day: ' + PK(bi) + ' (' + A[bi].toLocaleString('en-IN') + ' tweets)');
})();
ok(PK(9999) === '—', 'galat index par crash nahi');

sec('6. Sentiment ab hardcoded ginti se nahi banta');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(!/var SENT=\{pos:28268,neu:165224,neg:3435\}/.test(t), n + ': purani hardcoded ginti hat gayi');
  ok(/var _S8=\(typeof UNI!=='undefined'&&UNI&&UNI\.sent\)\?UNI\.sent/.test(t), n + ': ab UNI.sent se');
  ok(/var ttt=\(_SALL\|\|\(SENT\.neu\+SENT\.pos\+SENT\.neg\)\)\|\|1;/.test(t),
     n + ': denominator poore 8 bucket ka');
});
(function () {
  var s = BLOBS.UNI.sent, all = 0;
  Object.keys(s).forEach(function (k) { all += +s[k] || 0; });
  var old3 = (s.pos + s.neu + s.neg) || 1;
  var oldPct = Math.round(s.neu / old3 * 100), newPct = Math.round(s.neu / all * 100);
  ok(all === BLOBS.UNI.tot.tw, '8 bucket ka jod = kul tweets: ' + all);
  ok(oldPct !== newPct, 'Neutral % pehle ' + oldPct + '% dikhta tha, ab ' + newPct + '%');
  ok(newPct > 0 && newPct < oldPct,
     'naya Neutral % chhota aur asli hai: ' + newPct + '% (pehle ' + oldPct + '%)');
})();

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
