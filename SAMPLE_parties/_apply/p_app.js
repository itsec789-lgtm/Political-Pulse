/* ===== parties-v2 (10-Oct) : Parties tab ka naya dimaag =====
   EK shared filter state, EK render(). Har section wahi se data leta hai,
   isliye kahin purana (stale) data nahi bach sakta.

   Data kahan se:
     window.UNI.allHandles -> h,name,party,level,state,followers,followings,
                              tw,vw,lk,rt + 8 sentiment category
     window.D.handles      -> h + t[] aur v[]  (har din ke tweets/views)
     window.D.dayLabels    -> 'MM-DD',  window.AGG.dates -> poori ISO date
     window.HROLE[h][0]    -> designation (MAPPING se, serve ke waqt chipkta hai)
     window.D.HOURLY       -> 24 number, poore daur ka, saare handles ka

   Kya bilkul theek hai aur kya andaaza -- ye neeche har jagah likha hai,
   aur dashboard par bhi label se dikhta hai. */
(function () {
'use strict';

var W = window;
if (!W.UNI || !W.UNI.allHandles || !W.D || !W.D.handles) return;   /* data hi nahi -> chup rehna */

/* ---------- 0. chhote helpers ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function F(n) {
  if (typeof W.fmt === 'function') return W.fmt(n);
  n = Math.round(n || 0);
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-IN');
}
function nf(n) { return (Math.round(n) || 0).toLocaleString('en-IN'); }
/* Party ke rang -- dashboard ke baaki hisson se HU-BA-HU wahi map.
   (asli pc() ek IIFE ke andar band hai, isliye bahar se nahi dikhta --
   wahi list yahan dohrayi gayi hai, taaki rang kahin alag na pade.) */
var PCOL = { BJP:'#E65100', INC:'#0D47A1', SP:'#006400', DMK:'#C62828', AAP:'#1565C0',
  'SS':'#FF6F00', 'JD(U)':'#1A237E', TDP:'#FF8F00', AITC:'#1B5E20', BSP:'#1565C0',
  RLD:'#2E7D32', 'SS(UBT)':'#FF6F00', TMC:'#0D47A1', 'Apna Dal (S)':'#F9A825',
  'ASP (KR)':'#0277BD', IND:'#607d8b', NCP:'#F57F17', JMM:'#2E7D32', Unknown:'#9e9e9e' };
function col(p) {
  if (typeof W.pc === 'function') { var c = W.pc(p); if (c) return c; }
  return PCOL[p] || '#7e57c2';
}

var CATS = (W.SENTX && W.SENTX.CATS) ? W.SENTX.CATS : [
  { k:'probjp', label:'Pro-BJP', c:'#E65100' }, { k:'antigovt', label:'Anti-Govt', c:'#AD1457' },
  { k:'progovt', label:'Pro-Govt', c:'#1565C0' }, { k:'pos', label:'Positive', c:'#2E7D32' },
  { k:'neu', label:'Neutral', c:'#FF8F00' }, { k:'antibjp', label:'Anti-BJP', c:'#6A1B9A' },
  { k:'neg', label:'Negative', c:'#C62828' }, { k:'none', label:'No-Sentiment', c:'#9E9E9E' }
];
var PFULL = { BJP:'Bharatiya Janata Party', INC:'Indian National Congress', SP:'Samajwadi Party',
  DMK:'Dravida Munnetra Kazhagam', AAP:'Aam Aadmi Party', SS:'Shiv Sena', 'JD(U)':'Janata Dal (United)',
  TDP:'Telugu Desam Party', AITC:'All India Trinamool Congress', BSP:'Bahujan Samaj Party',
  RJD:'Rashtriya Janata Dal', TMC:'All India Trinamool Congress', NCP:'Nationalist Congress Party' };
var JUNK = { '-':1, 'Unknown':1, 'Nominated':1, '':1, 'None':1, 'nan':1, 'NaN':1, 'null':1 };

/* ---------- 1. din ki patti ---------- */
var DAYS = (W.AGG && W.AGG.dates && W.AGG.dates.length) ? W.AGG.dates.slice()
         : (W.SENT_DAILY && W.SENT_DAILY.dates ? W.SENT_DAILY.dates.slice() : []);
var DLBL = (W.D.dayLabels || []).slice();
var NDAY = Math.min(DLBL.length || 1e9, DAYS.length || 1e9);
if (!isFinite(NDAY)) NDAY = DLBL.length || DAYS.length;
if (!DAYS.length && DLBL.length) {
  /* AGG.dates na ho to MM-DD se ISO bana lete hain (saal badalne par +1) */
  var yr = new Date().getFullYear(), prev = 0, tmp = [];
  for (var q = 0; q < DLBL.length; q++) {
    var mm = +String(DLBL[q]).slice(0, 2);
    if (prev && mm < prev) yr++;
    prev = mm;
    tmp.push(yr + '-' + String(DLBL[q]));
  }
  DAYS = tmp;
}
NDAY = Math.min(DAYS.length, DLBL.length || DAYS.length);
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dayTxt(i) { var d = DAYS[i] || ''; return d.slice(8, 10) + ' ' + (MON[(+d.slice(5, 7) || 1) - 1] || ''); }

/* ---------- 2. handles: UNI + D ko jodna ---------- */
var DM = Object.create(null);
(W.D.handles || []).forEach(function (r) { if (r && r.h) DM[r.h] = r; });

var HS = [];
(W.UNI.allHandles || []).forEach(function (h) {
  if (!h || !h.party || JUNK[h.party]) return;
  var dd = DM[h.h];
  HS.push({
    h: h.h, name: h.name || h.h, party: h.party,
    level: (h.level && !JUNK[h.level]) ? h.level : 'Others',
    state: h.state || '',
    /* designation MAPPING se aata hai (server serve ke waqt HROLE par chipkata
       hai). Jiska mapping me pad nahi likha, uske liye level hi dikha dete
       hain -- tile kabhi khaali nahi rehta. */
    desig: (function () {
      var r = W.HROLE && W.HROLE[h.h];
      var t = (r && r[0]) ? String(r[0]) : '';
      return t && !JUNK[t] ? t : ((h.level && !JUNK[h.level]) ? h.level : 'Other / Party Official');
    })(),
    fo: +h.followers || 0, fg: +h.followings || 0,
    tw: +h.tw || 0, vw: +h.vw || 0, lk: +h.lk || 0, rt: +h.rt || 0,
    sent: (function () { var o = {}; CATS.forEach(function (c) { o[c.k] = +h[c.k] || 0; }); return o; })(),
    t: (dd && dd.t) || null, v: (dd && dd.v) || null
  });
});

/* ---------- 3. shared filter state (SACH KI EK HI JAGAH) ---------- */
var PF = { dmode:'all', from:null, to:null, level:'', state:'ALL', party:'', card:null, src:null, showAll:false };
var CARD_N = 12, CHART_N = 8;   /* card: top 12 + toggle | chart: top 8 + Others */
var DESIG_N = 8;                /* card par itne designation tile, baaki "+N more" me */
function selParty() { return PF.party || PF.card || null; }   /* dropdown ka hak pehle */

/* ---------- 4. date range -> din ke index ---------- */
function istToday() { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }
function clampIdx(iso) {
  var i = DAYS.indexOf(iso);
  if (i >= 0) return Math.min(i, NDAY - 1);
  if (!DAYS.length) return 0;
  if (iso < DAYS[0]) return 0;
  return NDAY - 1;                       /* aaj ki date data se aage -> aakhri din */
}
function range() {
  var last = clampIdx(istToday());
  switch (PF.dmode) {
    case 'today': return [last, last];
    case 'yest':  return [Math.max(0, last - 1), Math.max(0, last - 1)];
    case '3d':    return [Math.max(0, last - 2), last];
    case '7d':    return [Math.max(0, last - 6), last];
    case 'custom':
      if (!PF.from || !PF.to) return [0, NDAY - 1];
      var a = clampIdx(PF.from), b = clampIdx(PF.to);
      return a <= b ? [a, b] : [b, a];
    default:      return [0, NDAY - 1];
  }
}
function isFull() { var r = range(); return r[0] === 0 && r[1] === NDAY - 1; }
function rangeLabel() {
  var r = range();
  if (!DAYS.length) return '';
  var yr = (DAYS[r[1]] || '').slice(0, 4);
  return r[0] === r[1] ? (dayTxt(r[0]) + ' ' + yr) : (dayTxt(r[0]) + ' → ' + dayTxt(r[1]) + ' ' + yr);
}

/* ---------- 5. ek handle ke numbers, chune hue range me ----------
   Tweets aur Views: roz ka data hai -> BILKUL THEEK.
   Likes / Retweets / Sentiment: roz ka store hi nahi hota, isliye us range
   me handle ke tweet-share se baante jaate hain -> card par "approx.". */
var _mc = Object.create(null), _mk = '';
function metrics(x, r) {
  if (!x.t) {                             /* roz ka data nahi mila */
    return isFull() ? mkFull(x) : { tw:0, vw:0, lk:0, rt:0, _z:1 };
  }
  var key = x.h;
  var c = _mc[key];
  if (c) return c;
  var tw = 0, vw = 0, t = x.t, v = x.v || [];
  for (var i = r[0]; i <= r[1]; i++) { tw += (+t[i] || 0); vw += (+v[i] || 0); }
  var s = x.tw ? tw / x.tw : 0;
  var o = { tw: tw, vw: vw, lk: Math.round(x.lk * s), rt: Math.round(x.rt * s) };
  CATS.forEach(function (cc) { o[cc.k] = Math.round((x.sent[cc.k] || 0) * s); });
  _mc[key] = o;
  return o;
}
function mkFull(x) {
  var o = { tw:x.tw, vw:x.vw, lk:x.lk, rt:x.rt };
  CATS.forEach(function (cc) { o[cc.k] = x.sent[cc.k] || 0; });
  return o;
}
function newRange(r) { var k = r[0] + '-' + r[1]; if (k !== _mk) { _mk = k; _mc = Object.create(null); } }

/* ---------- 6. handles chhanna ---------- */
function handlesFor(o) {
  o = o || {};
  var lv = o.level !== undefined ? o.level : PF.level;
  var st = o.state !== undefined ? o.state : PF.state;
  var pa = o.party !== undefined ? o.party : PF.party;
  var r = o.range || range();
  var out = [];
  for (var i = 0; i < HS.length; i++) {
    var x = HS[i];
    if (lv && x.level !== lv) continue;
    if (st && st !== 'ALL' && x.state !== st) continue;
    if (pa && x.party !== pa) continue;
    var m = metrics(x, r);
    if (!m.tw) continue;
    out.push({ x: x, m: m });
  }
  return out;
}
function byParty(rows) {
  var agg = {};
  rows.forEach(function (q) {
    var a = agg[q.x.party];
    if (!a) {
      a = agg[q.x.party] = { p:q.x.party, n:0, tw:0, vw:0, lk:0, rt:0, fo:0, fg:0, desig:{} };
      CATS.forEach(function (c) { a[c.k] = 0; });
    }
    a.n++; a.tw += q.m.tw; a.vw += q.m.vw; a.lk += q.m.lk; a.rt += q.m.rt;
    /* Followers/Following SNAPSHOT hain -- date range se inka lena-dena nahi */
    a.fo += q.x.fo; a.fg += q.x.fg;
    CATS.forEach(function (c) { a[c.k] += (q.m[c.k] || 0); });
    /* ek handle ki ek se zyada designation ho sakti hai -> DONO me ginti */
    String(q.x.desig).split(/[\/,]/).forEach(function (d) {
      d = d.trim(); if (!d || JUNK[d]) return;
      a.desig[d] = (a.desig[d] || 0) + 1;
    });
  });
  return Object.keys(agg).map(function (k) { return agg[k]; })
              .sort(function (a, b) { return b.tw - a.tw; });
}

/* Chart ke liye top-N + "Others" ------------------------------------
   Asli data me 70+ party hain. Saari ek donut/bar me daal do to kuch
   padha hi nahi jaata. Isliye chart me top N party, aur baaki sab ek
   "Others" me jod diya jaata hai -- bilkul wahi tarika jo pehle bhi
   is dashboard me tha. Chuni hui party HAMESHA alag se dikhti hai,
   chaahe wo top N me na aati ho. */
function chartRows(all, key, sel) {
  var sorted = all.slice().sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
  var keep = sorted.slice(0, CHART_N);
  if (sel && !keep.some(function (d) { return d.p === sel; })) {
    var s2 = sorted.filter(function (d) { return d.p === sel; })[0];
    if (s2) { keep = keep.slice(0, CHART_N - 1); keep.push(s2); }
  }
  var inKeep = {}; keep.forEach(function (d) { inKeep[d.p] = 1; });
  var rest = sorted.filter(function (d) { return !inKeep[d.p]; });
  if (rest.length) {
    var o = { p: 'Others', n: 0, tw: 0, vw: 0, lk: 0, rt: 0, fo: 0, fg: 0, desig: {}, _other: 1 };
    CATS.forEach(function (c) { o[c.k] = 0; });
    rest.forEach(function (d) {
      o.n += d.n; o.tw += d.tw; o.vw += d.vw; o.lk += d.lk; o.rt += d.rt;
      CATS.forEach(function (c) { o[c.k] += (d[c.k] || 0); });
    });
    o._parties = rest.length;
    keep = keep.concat([o]);
  }
  return keep;
}
function cCol(d, sel) {
  if (d._other) return '#9e9e9e';
  return (sel && d.p !== sel) ? '#cfcac2' : col(d.p);
}

/* ---------- 7. cascading dropdowns: Date -> Level -> State -> Party ---------- */
function cascade() {
  var r = range();
  function uniq(rows, f) {
    var s = {}; rows.forEach(function (q) { var v = q.x[f]; if (v && !JUNK[v]) s[v] = 1; });
    return Object.keys(s).sort();
  }
  var lv = uniq(handlesFor({ level:'', state:'ALL', party:'', range:r }), 'level');
  var keepL = lv.indexOf(PF.level) >= 0 ? PF.level : '';
  $('pfLevel').innerHTML = '<option value="">All Levels</option>' +
    lv.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
  $('pfLevel').value = keepL; PF.level = keepL;

  var st = uniq(handlesFor({ state:'ALL', party:'', range:r }), 'state');
  var keepS = st.indexOf(PF.state) >= 0 ? PF.state : 'ALL';
  $('pfState').innerHTML = '<option value="ALL">All India</option>' +
    st.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
  $('pfState').value = keepS; PF.state = keepS;

  var pa = uniq(handlesFor({ party:'', range:r }), 'party');
  var keepP = pa.indexOf(PF.party) >= 0 ? PF.party : '';
  $('pfParty').innerHTML = '<option value="">All Parties</option>' +
    pa.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
  $('pfParty').value = keepP; PF.party = keepP;

  /* card se chuni party ab bhi data me hai? warna chup-chaap hata do */
  if (PF.card && pa.indexOf(PF.card) < 0) { PF.card = null; if (PF.src === 'card') PF.src = null; }
}

/* ---------- 8. KPI card ---------- */
function card(d, active) {
  var c = col(d.p), ap = isFull() ? '' : '<span class="pstat-ap">approx.</span>';
  var dz = Object.keys(d.desig).sort(function (a, b) { return d.desig[b] - d.desig[a] || (a < b ? -1 : 1); });
  var sum = dz.reduce(function (a, k) { return a + d.desig[k]; }, 0);
  /* Mapping me kai bar 20-25 alag-alag pad hote hain (ek-ek handle wale bhi).
     Sab tile bana do to card bahut lamba ho jaata hai. Isliye upar ke
     DESIG_N dikhte hain aur baaki ek "+N more roles" tile me chale jaate
     hain -- uske tooltip me poori list naam aur ginti ke saath hoti hai.
     Kuch chhupaya nahi jaata, sirf samet diya jaata hai. */
  var rest = dz.slice(DESIG_N), restN = 0, restTip = '';
  if (rest.length) {
    rest.forEach(function (k) { restN += d.desig[k]; });
    restTip = rest.map(function (k) { return k + ': ' + d.desig[k]; }).join('\n');
    dz = dz.slice(0, DESIG_N);
  }
  function box(val, lbl, extra) {
    return '<div class="pstat"><div class="pstat-val" style="color:' + c + '">' + val + (extra || '') +
           '</div><div class="pstat-lbl">' + lbl + '</div></div>';
  }
  return '<div class="pcard' + (active ? ' active-party' : '') + '" data-p="' + esc(d.p) + '"' +
    ' tabindex="0" role="button" aria-pressed="' + (active ? 'true' : 'false') + '"' +
    ' style="--pc:' + c + ';--pc-tint:' + c + '12;border-top-color:' + c + ';cursor:pointer">' +
    '<div class="pcard-head"><div class="pcard-logo" style="background:' + c + '18">' +
      '<span style="font-weight:900;color:' + c + ';font-size:12px">' + esc(d.p).slice(0, 4) + '</span></div>' +
      '<div><div class="pcard-name" style="color:' + c + '">' + esc(d.p) + '</div>' +
      '<div class="pcard-full">' + esc(PFULL[d.p] || d.p) + '</div>' +
      '<div class="pcard-handles" style="color:' + c + '">' + d.n + ' handles</div></div></div>' +
    '<div class="pstats">' + box(nf(d.tw), 'Tweets') + box(F(d.vw), 'Views') +
      box(F(d.lk), 'Likes', ap) + box(F(d.rt), 'Retweets', ap) + '</div>' +
    '<div class="pfol">' + box(F(d.fo), 'Total Followers') + box(nf(d.fg), 'Total Following') + '</div>' +
    '<div class="pdesig"><div class="pdesig-title">Handles by Designation</div><div class="pdesig-grid">' +
      dz.map(function (k) {
        var pct = d.n ? Math.round(d.desig[k] / d.n * 100) : 0;
        return '<div class="pdtile" title="' + esc(k) + ': ' + d.desig[k] + ' handles (' + pct + '% of ' + esc(d.p) + ')">' +
               '<div class="pdtile-val">' + d.desig[k] + '</div><div class="pdtile-lbl">' + esc(k) + '</div></div>';
      }).join('') +
      (rest.length ? '<div class="pdtile pdtile-more" title="' + esc(restTip) + '">' +
        '<div class="pdtile-val">+' + rest.length + '</div>' +
        '<div class="pdtile-lbl">more roles (' + restN + ')</div></div>' : '') +
      '</div>' +
      (sum > d.n ? '<div class="pdesig-note">a handle can hold multiple designations</div>' : '') +
    '</div><div class="pcard-spacer"></div></div>';
}

/* ---------- 9. chart helpers ---------- */
var CH = {};
function kill(id) { if (CH[id]) { try { CH[id].destroy(); } catch (e) {} CH[id] = null; } }
function blank(id, msg) {
  var el = $(id); if (!el) return;
  kill(id);
  var host = el.parentNode, e = host.querySelector('.chart-empty');
  if (!e) { e = document.createElement('div'); e.className = 'chart-empty'; host.appendChild(e); }
  e.textContent = msg; e.style.display = 'flex'; el.style.display = 'none';
}
function live(id) {
  var el = $(id); if (!el || !W.Chart) return null;
  var e = el.parentNode.querySelector('.chart-empty');
  if (e) e.style.display = 'none';
  el.style.display = ''; return el.getContext('2d');
}
var ANIM = { duration: 420, easing: 'easeOutQuart' };
var HOURLY = (W.D.HOURLY && W.D.HOURLY.length === 24) ? W.D.HOURLY : null;

/* ---------- 10. charts ---------- */
function drawDaily(rows) {
  var r = range(), span = r[1] - r[0] + 1, sel = selParty();
  if (!rows.length) { blank('pfDailyChart', 'No data for this selection'); $('pfDailyNote').innerHTML = '&nbsp;'; return; }
  var labels = [], tw = [], vw = [], hourly = (span <= 3 && !!HOURLY);
  if (hourly) {
    /* chhote range par x-axis GHANTE ka. Roz ka ghante-war data kahin store
       nahi hai, isliye din ka total global hourly shape se baanta jaata hai
       -- note me yahi saaf likha hai. */
    var hs = HOURLY.reduce(function (a, b) { return a + b; }, 0) || 1;
    for (var dI = r[0]; dI <= r[1]; dI++) {
      var dt = 0, dv = 0;
      rows.forEach(function (q) { if (q.x.t) { dt += (+q.x.t[dI] || 0); dv += (+(q.x.v || [])[dI] || 0); } });
      for (var hh = 0; hh < 24; hh++) {
        labels.push((span > 1 ? dayTxt(dI) + ' ' : '') + (hh < 10 ? '0' + hh : hh) + 'h');
        tw.push(+(dt * HOURLY[hh] / hs).toFixed(1));
        vw.push(+(dv * HOURLY[hh] / hs / 1e7).toFixed(3));
      }
    }
  } else {
    for (var i = r[0]; i <= r[1]; i++) {
      var t = 0, v = 0;
      rows.forEach(function (q) { if (q.x.t) { t += (+q.x.t[i] || 0); v += (+(q.x.v || [])[i] || 0); } });
      labels.push(dayTxt(i)); tw.push(t); vw.push(+(v / 1e7).toFixed(2));
    }
  }
  var ctx = live('pfDailyChart'); if (!ctx) return;
  kill('pfDailyChart');
  var g = ctx.createLinearGradient(0, 0, 0, 210);
  g.addColorStop(0, 'rgba(230,81,0,.55)'); g.addColorStop(1, 'rgba(255,143,0,.1)');
  CH.pfDailyChart = new W.Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { type:'bar', label:'Tweets', data:tw, backgroundColor:g, borderColor:'#E65100', borderWidth:1.5, borderRadius:3, yAxisID:'y' },
      { type:'line', label:'Views (Cr)', data:vw, borderColor:'#FF8F00', backgroundColor:'rgba(255,143,0,.08)', borderWidth:2.5, pointRadius:hourly?0:2, tension:.4, fill:true, yAxisID:'y1' } ] },
    options: { responsive:true, maintainAspectRatio:false, animation:ANIM,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#333', font:{size:10,weight:'600'}, padding:10, usePointStyle:true } }, datalabels:{ display:false } },
      scales:{ x:{ ticks:{ color:'#555', font:{size:9}, maxRotation:50, autoSkip:true, maxTicksLimit: hourly ? 12 : 14 }, grid:{ color:'#ece9e0' } },
               y:{ ticks:{ color:'#E65100', font:{size:9} }, grid:{ color:'#ece9e0' } },
               y1:{ position:'right', ticks:{ color:'#FF8F00', font:{size:9} }, grid:{ display:false } } } }
  });
  $('pfDailyNote').innerHTML = '&#128197; <strong>' + rangeLabel() + '</strong> &nbsp;|&nbsp; &#9632; Tweets &nbsp;|&nbsp; &#9679; Views (Cr)' +
    (sel ? ' &nbsp;|&nbsp; ' + esc(sel) + ' only' : '') +
    (hourly ? ' &nbsp;|&nbsp; <em>hourly split uses the all-handles hourly shape</em>' : '');
}

function drawHourly() {
  if (!HOURLY) { blank('pfHourChart', 'Hourly data not available'); return; }
  var ctx = live('pfHourChart'); if (!ctx) return;
  kill('pfHourChart');
  var pk = HOURLY.indexOf(Math.max.apply(null, HOURLY));
  CH.pfHourChart = new W.Chart(ctx, {
    type:'line',
    data:{ labels: HOURLY.map(function (_, i) { return (i < 10 ? '0' + i : i) + 'h'; }),
      datasets:[{ label:'Tweets', data:HOURLY, borderColor:'#E65100', backgroundColor:'rgba(230,81,0,.10)',
        borderWidth:2.5, pointRadius:2, tension:.4, fill:true }] },
    options:{ responsive:true, maintainAspectRatio:false, animation:ANIM,
      plugins:{ legend:{display:false}, datalabels:{display:false} },
      scales:{ x:{ ticks:{ color:'#555', font:{size:9}, maxTicksLimit:12 }, grid:{display:false} },
               y:{ ticks:{ color:'#555', font:{size:9}, callback:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;} }, grid:{ color:'#ece9e0' } } } }
  });
  /* IMAANDAAR label -- ye chart filters par nahi badalta, kyunki ghante ka
     data party/state/din ke hisaab se kahin store hi nahi hota. */
  $('pfHourNote').innerHTML = '&#9200; Peak: <strong>' + pk + ':00 – ' + (pk + 1) + ':00 IST</strong>' +
    ' &nbsp;|&nbsp; <em>all handles &middot; full period &mdash; this chart does not change with the filters</em>';
}

function drawTop(rows) {
  if (!rows.length) { blank('pfTopChart', 'No data for this selection'); $('pfTopNote').innerHTML = '&nbsp;'; return; }
  var top = rows.map(function (q) { return { h:q.x.h, p:q.x.party, avg: q.m.tw ? q.m.vw / q.m.tw : 0 }; })
                .sort(function (a, b) { return b.avg - a.avg; }).slice(0, 8);
  var ctx = live('pfTopChart'); if (!ctx) return;
  kill('pfTopChart');
  var cols = top.map(function (t) { return col(t.p); });
  CH.pfTopChart = new W.Chart(ctx, {
    type:'bar',
    data:{ labels: top.map(function (t) { return '@' + t.h; }),
      datasets:[{ data: top.map(function (t) { return Math.round(t.avg); }),
        backgroundColor: cols.map(function (c) { return c + '55'; }), borderColor: cols, borderWidth:2, borderRadius:6 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, animation:ANIM,
      layout:{ padding:{ right:46 } },
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:function(c){ return ' ' + F(c.raw) + ' avg views/post · ' + top[c.dataIndex].p; } } },
        datalabels:{ display:true, anchor:'end', align:'end', color:'#444', font:{size:9,weight:'700'}, formatter:F } },
      scales:{ x:{ ticks:{ color:'#555', font:{size:9}, callback:F }, grid:{ color:'#ece9e0' } },
               y:{ ticks:{ color:'#222', font:{size:10,weight:'700'} }, grid:{display:false} } } }
  });
  $('pfTopNote').innerHTML = '&#127942; Average views per post (Views &divide; Posts) &middot; <strong>' + rangeLabel() + '</strong> &middot; bar colour = party';
}

/* Ek party chuni ho to donut/bar bekaar ho jaata (100% ka ek tukda).
   Isliye tab bhi SAARI party dikhti hain -- chuni hui apne rang me,
   baaki halki grey. Tulna bani rehti hai. */
function drawViews(all0, sel) {
  var all = chartRows(all0, 'vw', sel);
  if (!all.length) { blank('pfViewsChart', 'No data for this selection'); $('pfViewsNote').innerHTML = '&nbsp;'; return; }
  var ctx = live('pfViewsChart'); if (!ctx) return;
  kill('pfViewsChart');
  var cols = all.map(function (d) { return cCol(d, sel); });
  var bg = all.map(function (d, i) { return cols[i] + ((sel && d.p !== sel) ? '55' : 'bb'); });
  CH.pfViewsChart = new W.Chart(ctx, {
    type:'doughnut',
    data:{ labels: all.map(function (d) { return d.p; }),
      datasets:[{ data: all.map(function (d) { return d.vw; }), backgroundColor:bg, borderColor:cols, borderWidth:2.5, hoverOffset:8 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', animation:ANIM,
      plugins:{ legend:{ display:true, position:'right', labels:{ color:'#333', font:{size:10,weight:'600'}, padding:10, usePointStyle:true,
          generateLabels:function(ch){ var ds=ch.data.datasets[0], tot=ds.data.reduce(function(a,b){return a+b;},0)||1;
            return ch.data.labels.map(function(l,i){ return { text:l+' '+(ds.data[i]/tot*100).toFixed(1)+'%', fillStyle:ds.backgroundColor[i], strokeStyle:ds.borderColor[i], lineWidth:2, index:i }; }); } } },
        tooltip:{ callbacks:{ label:function(c){ var tot=c.dataset.data.reduce(function(a,b){return a+b;},0)||1;
            var ex = (all[c.dataIndex] && all[c.dataIndex]._parties) ? ' (' + all[c.dataIndex]._parties + ' parties)' : '';
            return ' ' + c.label + ex + ': ' + F(c.raw) + ' views (' + (c.raw/tot*100).toFixed(1) + '%)'; } } },
        datalabels:{ display:true, color:'#fff', font:{size:9,weight:'700',family:"'Rajdhani'"},
          formatter:function(v,cx){ var tot=cx.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0)||1;
            var p=Math.round(v/tot*100); return p>3?p+'%':''; } } } }
  });
  $('pfViewsTitle').textContent = sel ? ('Views Share — ' + sel + ' vs all parties') : 'Views Share by Party';
  $('pfViewsNote').innerHTML = '&#128202; Share of total views &middot; <strong>' + rangeLabel() + '</strong>' +
    (sel ? ' &middot; <em>' + esc(sel) + ' highlighted, others greyed</em>' : '');
}

function drawTweets(all0, sel) {
  var all = chartRows(all0, 'tw', sel);
  if (!all.length) { blank('pfTweetChart', 'No data for this selection'); $('pfTweetNote').innerHTML = '&nbsp;'; return; }
  var ctx = live('pfTweetChart'); if (!ctx) return;
  kill('pfTweetChart');
  var cols = all.map(function (d) { return cCol(d, sel); });
  CH.pfTweetChart = new W.Chart(ctx, {
    type:'bar',
    data:{ labels: all.map(function (d) { return d.p; }),
      datasets:[{ data: all.map(function (d) { return d.tw; }),
        backgroundColor: cols.map(function (c) { return c + '55'; }), borderColor:cols, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, animation:ANIM, layout:{ padding:{ top:20 } },
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:function(c){ var tot=c.dataset.data.reduce(function(a,b){return a+b;},0)||1;
            return ' ' + nf(c.raw) + ' tweets (' + (c.raw/tot*100).toFixed(1) + '%)'; } } },
        datalabels:{ display:true, anchor:'end', align:'end', color:'#444', font:{size:10,weight:'700'},
          formatter:function(v){ return v>=1000?(v/1000).toFixed(0)+'K':v; } } },
      scales:{ x:{ ticks:{ color:'#222', font:{size:11,weight:'700'} }, grid:{display:false} },
               y:{ ticks:{ color:'#555', font:{size:9}, callback:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;} }, grid:{ color:'#ece9e0' } } } }
  });
  $('pfTweetTitle').textContent = sel ? ('Tweets — ' + sel + ' vs all parties') : 'Tweets by Party';
  $('pfTweetNote').innerHTML = '&#128202; Tweet volume &middot; <strong>' + rangeLabel() + '</strong>' +
    (sel ? ' &middot; <em>' + esc(sel) + ' highlighted</em>' : '');
}

/* Sentiment ab SIRF yahan hai (card se hata diya gaya) -- isliye poori 8
   category, legend, aur tooltip me count + % dono. */
function drawSent(all0, sel) {
  var all = chartRows(all0, 'tw', sel);
  if (!all.length) { blank('pfSentChart', 'No data for this selection'); $('pfSentNote').innerHTML = '&nbsp;'; return; }
  var ctx = live('pfSentChart'); if (!ctx) return;
  kill('pfSentChart');
  function dim(d) { return (sel && d.p !== sel && !d._other) ? '38' : (d._other ? '55' : 'cc'); }
  CH.pfSentChart = new W.Chart(ctx, {
    type:'bar',
    data:{ labels: all.map(function (d) { return d.p; }),
      datasets: CATS.map(function (c) {
        return { label:c.label, data: all.map(function (d) { return d[c.k] || 0; }),
                 backgroundColor: all.map(function (d) { return c.c + dim(d); }),
                 borderColor:c.c, borderWidth:1, borderRadius:3 }; }) },
    options:{ responsive:true, maintainAspectRatio:false, animation:ANIM,
      plugins:{ legend:{ display:true, position:'top', labels:{ font:{size:9}, usePointStyle:true, boxWidth:8, padding:8 } },
        tooltip:{ callbacks:{ label:function(c){ var tot=0;
            c.chart.data.datasets.forEach(function(ds){ tot += ds.data[c.dataIndex]; });
            return ' ' + c.dataset.label + ': ' + nf(c.raw) + ' (' + (tot ? (c.raw/tot*100).toFixed(1) : '0') + '%)'; } } },
        datalabels:{ display:false } },
      scales:{ x:{ stacked:true, ticks:{ color:'#222', font:{size:10,weight:'700'} }, grid:{display:false} },
               y:{ stacked:true, ticks:{ color:'#555', font:{size:9}, callback:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;} }, grid:{ color:'#ece9e0' } } } }
  });
  $('pfSentTitle').textContent = sel ? ('Sentiment — ' + sel + ' vs all parties') : 'Sentiment by Party';
  $('pfSentNote').innerHTML = '&#128269; All 8 categories &middot; <strong>' + rangeLabel() + '</strong>' +
    (isFull() ? '' : ' &middot; <em>over a date range sentiment is split by tweet share (approx.)</em>');
}

/* ---------- 11. ek hi render ---------- */
function render() {
  if (!$('pfCards')) return;
  var r = range(); newRange(r);
  var sel = selParty();

  var cardRows = byParty(handlesFor({ party: PF.party, range: r }));  /* Case B me sirf wahi */
  var allRows  = byParty(handlesFor({ party: '', range: r }));        /* chart me tulna */
  var selRows  = handlesFor({ party: sel || '', range: r });

  /* 70+ party ke 70+ card ek saath dikhana bekaar hai -- top 12 dikhate
     hain aur neeche "Show all" ka button. Kuch chhupaya nahi jaata. */
  var shown = PF.showAll ? cardRows : cardRows.slice(0, CARD_N);
  if (PF.card && !shown.some(function (d) { return d.p === PF.card; })) {
    var extra = cardRows.filter(function (d) { return d.p === PF.card; })[0];
    if (extra) shown = shown.concat([extra]);
  }
  $('pfCards').innerHTML = shown.length
    ? shown.map(function (d) { return card(d, d.p === PF.card); }).join('')
    : '<div class="pf-empty"><b>No data for this selection</b>No handle matched this Date Range / Level / State. Try changing a filter.</div>';
  var more = $('pfMore');
  if (more) {
    if (cardRows.length > CARD_N) {
      more.style.display = '';
      more.textContent = PF.showAll
        ? ('Show top ' + CARD_N + ' only')
        : ('Show all ' + cardRows.length + ' parties');
    } else { more.style.display = 'none'; PF.showAll = false; }
  }

  var chip = $('pfChip');
  $('pfChipTxt').textContent = 'Showing: ' + (sel || 'All Parties');
  chip.style.setProperty('--pc', sel ? col(sel) : '#E65100');
  $('pfChipX').style.display = sel ? '' : 'none';
  $('pfRangeTxt').innerHTML = rangeLabel() +
    (PF.level ? ' &middot; ' + esc(PF.level) : '') +
    (PF.state !== 'ALL' ? ' &middot; ' + esc(PF.state) : '') +
    (sel ? ' &middot; via ' + (PF.party ? 'dropdown' : 'card click') : '');

  var tw = 0, n = 0;
  (sel ? selRows : handlesFor({ party:'', range:r })).forEach(function (q) { tw += q.m.tw; n++; });
  $('pfInfo').innerHTML = '<span>' + nf(tw) + '</span> tweets &middot; <span>' + nf(n) + '</span> handles';
  var ttl = $('pfOverviewTitle');
  if (ttl && ttl.firstChild) ttl.firstChild.nodeValue = 'Party Overview — ' + rangeLabel() + ' ';

  drawDaily(selRows); drawHourly(); drawTop(selRows);
  drawViews(allRows, sel); drawTweets(allRows, sel); drawSent(allRows, sel);
}

/* page reload nahi, scroll nahi hilta, aur ek hi render (debounce) */
var rT = null;
function refresh() {
  var sc = W.scrollY;
  var host = $('pfCards'); if (host) host.classList.add('pf-busy');
  clearTimeout(rT);
  rT = setTimeout(function () {
    try { cascade(); render(); } catch (e) { console.warn('parties-v2', e); }
    if (host) { host.classList.remove('pf-busy'); host.classList.add('pf-ready'); }
    W.scrollTo(0, sc);
  }, 60);
}

/* ---------- 12. events ---------- */
function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }
on('pfDate', 'change', function () {
  PF.dmode = this.value;
  $('pfCustom').classList.toggle('show', PF.dmode === 'custom');
  if (PF.dmode === 'custom' && (!PF.from || !PF.to)) return;   /* dono date chunne par hi lagega */
  refresh();
});
['pfFrom', 'pfTo'].forEach(function (id) {
  on(id, 'change', function () {
    PF.from = $('pfFrom').value || null; PF.to = $('pfTo').value || null;
    if (PF.from && PF.to) refresh();
  });
});
on('pfLevel', 'change', function () { PF.level = this.value; refresh(); });
on('pfState', 'change', function () { PF.state = this.value || 'ALL'; refresh(); });
on('pfParty', 'change', function () {
  /* DROPDOWN KA HAK PEHLE -- card ka chunav saaf */
  PF.party = this.value; PF.card = null; PF.src = PF.party ? 'drop' : null; refresh();
});
on('pfChipX', 'click', function () {
  PF.party = ''; PF.card = null; PF.src = null;
  if ($('pfParty')) $('pfParty').value = '';
  refresh();
});
on('pfMore', 'click', function () { PF.showAll = !PF.showAll; render(); });
on('pfCards', 'click', function (e) {
  var c = e.target && e.target.closest ? e.target.closest('.pcard') : null;
  if (!c) return;
  if (PF.party) return;                       /* dropdown chalu -> card click bekaar */
  var p = c.getAttribute('data-p');
  PF.card = (PF.card === p) ? null : p;       /* wahi card dobara -> deselect */
  PF.src = PF.card ? 'card' : null;
  render();
});
on('pfCards', 'keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var c = e.target && e.target.closest ? e.target.closest('.pcard') : null;
  if (!c) return;
  e.preventDefault(); c.click();
});

/* ---------- 13. shuru ---------- */
function boot() {
  if (!$('pfCards') || !DAYS.length) return;
  var f = $('pfFrom'), t = $('pfTo');
  if (f && t) {
    f.min = t.min = DAYS[0]; f.max = t.max = DAYS[NDAY - 1];
    f.value = DAYS[Math.max(0, NDAY - 15)]; t.value = DAYS[NDAY - 1];
  }
  var dsel = $('pfDate');
  if (dsel) dsel.value = 'all';
  cascade(); render();
}
W.pfBoot = boot;
W.pfRender = function () { try { if (!CH.pfDailyChart) boot(); else render(); } catch (e) { console.warn('parties-v2', e); } };
W.pfRefresh = refresh;
/* sirf jaanch ke liye */
W.__PF = PF; W.__pfRange = range; W.__pfHandles = HS; W.__pfHandlesFor = handlesFor;
W.__pfByParty = byParty; W.__pfMetrics = metrics; W.__pfCATS = CATS; W.__pfDAYS = DAYS;
})();
