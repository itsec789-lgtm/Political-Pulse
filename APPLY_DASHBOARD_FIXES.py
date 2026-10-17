# -*- coding: utf-8 -*-
"""
APPLY_DASHBOARD_FIXES.py   (v2)
================================================================================
HOST system par wahi SAARE changes lagata hai jo humne main laptop par kiye the.

Poori template file replace karne ki jagah ye script HOST wali file par hi
edit karta hai. Faayda: host ka template chahe purani generation ka ho
(kam tabs, alag data), uska apna content waisa hi rehta hai -- sirf ye
5 cheezein badalti/judti hain:

  1. STICKY HEADER      chhoti screen par header scroll ho kar gayab ho jaata
                        tha (overflow-x:hidden 'position:sticky' ko tod deta hai)

  2. SIDEBAR FREEZE     side panel scroll karne par upar ka profile/logo bhi
                        scroll ho jaata tha; ab sirf menu scroll hoga

  3. ENGLISH TEXT       Hinglish caption hataana + 15 label/hint English me

  4. MLA CONTESTANTS    filter lagate hi card 0 ho jaata tha. Wajah: filter wala
                        code purane 'GROWTH' blob se level padhta tha, jise
                        pipeline kabhi dobara banati hi nahi -- usme
                        'MLA Contestent' level kisi handle par tha hi nahi.
                        Ab UNI.allHandles (taaza roster) se padhta hai.

  5. LIVE INDICATOR     har KPI / count / card / table value badhne par uske
                        aage hara "↑ +1K", saath me halka count-up + pulse.
                        (naya CSS+JS </body> se pehle jodta hai)

Har change ALAG hai. Jo cheez host ke template me nahi milti, use chhod kar
aage badh jaata hai (SKIP likh dega) -- kuch tutega nahi.
Do baar chala do to bhi surakshit -- pehle se laga hua change pehchaan kar
"pehle se hai" bol dega, dobara nahi lagayega.

CHALAO (host system par, project ki JAD me -- jahan DASHBOARD aur
        UP-DASHBOARD dono folder hain):

    python APPLY_DASHBOARD_FIXES.py                 <- sirf REPORT (kuch nahi badlega)
    python APPLY_DASHBOARD_FIXES.py --apply         <- backup lekar changes lagao

Backup apne aap banta hai:  dashboard.template.html.bak_YYYYMMDD_HHMM
Server restart karne ki zaroorat NAHI -- server har page load par template
disk se padhta hai. Bas browser me Ctrl + Shift + R.
================================================================================
"""
import datetime
import io
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv

TARGETS = [
    os.path.join(HERE, "DASHBOARD", "dashboard.template.html"),
    os.path.join(HERE, "UP-DASHBOARD", "dashboard.template.html"),
]

# =============================================================================
# 1. STICKY HEADER
# =============================================================================
FIX_STICKY = [(
    "html,body{overflow-x:hidden;max-width:100%}",
    "html,body{overflow-x:hidden;overflow-x:clip;max-width:100%}",
)]

# =============================================================================
# 2. SIDEBAR FREEZE
# =============================================================================
FIX_SIDEBAR = [
    ("z-index:300;overflow-y:auto;overscroll-behavior:contain;transform:translateX(-100%)",
     "z-index:300;overflow:hidden;transform:translateX(-100%)"),

    (".main-nav{background:transparent;border:none;box-shadow:none;display:flex;"
     "flex-direction:column;gap:3px;padding:6px 12px 10px;position:relative;"
     "z-index:3;margin-top:14px;overflow:visible}",
     ".main-nav{background:transparent;border:none;box-shadow:none;display:flex;"
     "flex-direction:column;gap:3px;padding:6px 12px 10px;position:relative;"
     "z-index:3;margin-top:14px;flex:1 1 auto;min-height:0;overflow-y:auto;"
     "overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:none}"),

    (".sidebar::-webkit-scrollbar{width:0}",
     ".sidebar::-webkit-scrollbar{width:0}\n.main-nav::-webkit-scrollbar{width:0}",
     ".main-nav::-webkit-scrollbar{width:0}"),      # iska apna marker (old, new ka hissa hai)

    ('(function(){var sb=document.querySelector(".sidebar");if(!sb)return;sb.addEventListener("wheel"',
     '(function(){var sb=document.querySelector("#mainNav")||document.querySelector(".sidebar");'
     'if(!sb)return;sb.addEventListener("wheel"'),
]

# =============================================================================
# 3. ENGLISH TEXT
# =============================================================================
FIX_TEXT = [
    (' <span style="font-size:11px;font-weight:500;color:var(--muted)">'
     '— badi number = total tweets posted (Apr–Jul 2026) · chhoti = handles tracked</span>',
     '', 'Total Tweets by Level / Category</div>'),

    ('<div class="chart-sub-note">Naam pe click karo</div>',
     '<div class="chart-sub-note">Click a name</div>'),
    ('Select a person from the list (ya dot chart pe click) to see analysis.',
     'Select a person from the list (or click a dot on the chart) to see analysis.'),
    ('Topic/keyword daalo &rarr; preview &rarr; Word download',
     'Enter a topic/keyword &rarr; preview &rarr; Word download'),
    ('Search dabao ya filter badlo&hellip;',
     'Press Search or change a filter&hellip;'),
    ('<div class="chart-sub-note">Tweet text me sabse zyada aane wale shabd '
     '(link, @mention aur hashtag hata kar)</div>',
     '<div class="chart-sub-note">Most frequent words in tweet text '
     '(links, @mentions and hashtags excluded)</div>'),
    ('<div class="chart-sub-note">Kitni baar istemal hua &mdash; bade shabd zyada baar</div>',
     '<div class="chart-sub-note">How often used &mdash; bigger words appear more often</div>'),
    ('<span class="filter-label">Dikhao</span>', '<span class="filter-label">Show</span>'),
    ('<option value="both">Dono</option>', '<option value="both">Both</option>'),
    ('<option value="words">Sirf Words</option>', '<option value="words">Words only</option>'),
    ('<option value="tags">Sirf Hashtags</option>', '<option value="tags">Hashtags only</option>'),
    ('<small>Sirf is dashboard ke aankdon par</small>',
     '<small>Based only on this dashboard&rsquo;s data</small>'),
    ('<button>Sabse aage kaun si party hai?</button>', '<button>Which party is leading?</button>'),
    ('<button>Sentiment kaisa chal raha hai?</button>', '<button>How is sentiment trending?</button>'),
    ('<button>Top 5 handles kaun se hain?</button>', '<button>Which are the top 5 handles?</button>'),
    ('<button>Is hafte kya badla?</button>', '<button>What changed this week?</button>'),
]

# =============================================================================
# 4. MLA CONTESTANTS  (filter lagate hi 0 ho jaata tha)
# =============================================================================
FIX_CONT = [(
    "Object.keys(GROWTH.H).forEach(function(h){var m=GROWTH.H[h];"
    "if(dp!=='all'&&m.p!==dp)return;var k=lvk(m.l);lvH[k]=(lvH[k]||0)+1;"
    "var o=PHD[h];var s=0;if(o&&o.t){for(var i=0;i<idx.length;i++)s+=o.t[idx[i]]||0;}"
    "lvT[k]=(lvT[k]||0)+s;});",

    "/* Roster ab UNI.allHandles se -- ye har pipeline run me refresh hota hai. "
    "GROWTH blob purana hai (pipeline use dobara kabhi banati hi nahi), isliye usme "
    "'MLA Contestent' level kisi handle par tha hi nahi -> filter lagate hi wo card 0 "
    "dikhane lagta tha. GROWTH ab sirf fallback hai. */"
    "var _ROS=(typeof UNI!=='undefined'&&UNI&&UNI.allHandles&&UNI.allHandles.length)"
    "?UNI.allHandles.map(function(o){return {h:o.h,p:o.party,l:o.level};})"
    ":Object.keys((typeof GROWTH!=='undefined'&&GROWTH&&GROWTH.H)||{}).map(function(h){"
    "return {h:h,p:GROWTH.H[h].p,l:GROWTH.H[h].l};});"
    "_ROS.forEach(function(m){if(dp!=='all'&&m.p!==dp)return;var k=lvk(m.l);"
    "lvH[k]=(lvH[k]||0)+1;var o=PHD[m.h];var s=0;"
    "if(o&&o.t){for(var i=0;i<idx.length;i++)s+=o.t[idx[i]]||0;}lvT[k]=(lvT[k]||0)+s;});",

    "var _ROS=(typeof UNI!=='undefined'",
)]

GROUPS = [
    ("1. STICKY HEADER   (chhoti screen par header tika rahe)", FIX_STICKY),
    ("2. SIDEBAR FREEZE  (side panel scroll par upar ka hissa na hile)", FIX_SIDEBAR),
    ("3. ENGLISH TEXT    (Hinglish hataana / English karna)", FIX_TEXT),
    ("4. MLA CONTESTANTS (filter par 0 ho jaana)", FIX_CONT),
]

# =============================================================================
# 5. LIVE UPDATE INDICATOR  --  ye REPLACE nahi, JOD-NE wala change hai
# =============================================================================
RT_MARK = "===== LIVE UPDATE INDICATOR (rt-delta v3) ====="
RT_ANY  = "===== LIVE UPDATE INDICATOR (rt-delta"

RT_CSS = r"""/* LIVE UPDATE INDICATOR -- sirf jud kar dikhta hai, kisi maujooda style ko
   chhedta nahi. Badge alag <span> hai, isliye value ka apna text saaf rehta
   hai (baaki code textContent padhta/likhta hai). */
.rt-up{
  display:inline-block;margin-left:6px;vertical-align:middle;
  font-size:.72em;font-weight:700;line-height:1;white-space:nowrap;
  color:#16a34a;
  animation:rtIn .45s ease both;
}
[data-theme="dark"] .rt-up,body.dark .rt-up{color:#4ade80;}
@keyframes rtIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}

/* value par halka pulse -- background flash, layout hilta nahi */
.rt-pulse{animation:rtPulse 1.35s ease-out 1;border-radius:5px;}
@keyframes rtPulse{
  0%{background-color:rgba(22,163,74,.22)}
  70%{background-color:rgba(22,163,74,.07)}
  100%{background-color:transparent}
}
@media (prefers-reduced-motion:reduce){
  .rt-up{animation:none}
  .rt-pulse{animation:none}
}
"""

RT_JS = r"""/* ==========================================================================
   LIVE UPDATE INDICATOR  (rt-delta)
   --------------------------------------------------------------------------
   Har KPI / count / card / table value ke saath, agar wo PICHHLI baar se
   BADHA hai, to uske aage hara "↑ +1K" dikhata hai, aur value par halka
   count-up + pulse chalata hai.

   Kaise kaam karta hai (aur kyun aise):

   * Naya data aane par server page ko RELOAD kar deta hai
     (/api/version -> location.reload()). Isliye "pichhla value" memory me
     nahi bach sakta -- use localStorage me rakhna padta hai.

   * Value filter badalne par bhi badalti hai, par wo "badhna" nahi hai.
     Isliye har snapshot ek CONTEXT ke saath judta hai:
         scope | tab | party | range
     Filter badla -> context badla -> us context ka apna purana snapshot
     use hota hai. Kabhi bhi BJP ka number All-Parties se compare nahi hota.

   * Date range default (poori range) ho to use "FULL" maana jaata hai --
     kyunki naya data aane par aakhri date apne aap aage badh jaati hai,
     aur agar use context me ginte to har update par context badal jaata
     aur indicator kabhi dikhta hi nahi.

   Sirf BADHNE par dikhta hai (spec ke mutabik). Ghatne par kuch nahi.
   Sab kuch try/catch me hai -- ye module kabhi page ko nahi todega.
   ========================================================================== */
(function () {
  'use strict';

  var STORE = 'ipp_rt_snap_v2';   /* v2: purani (galat rank-based) baseline apne aap chhod di jaati hai */
  var MAXCTX = 24;                 // itne context tak yaad, phir purane hat jaate hain

  /* jin jagah number dikhta hai -- inhi ko track karte hain */
  var SEL = [
    '.kpi-val', '.lv-val', '.lv-sub', '.pstat-val', '.sent-card-val',
    '.cm-stat-val', '.cm-tnum', '.cm-count', '.sh-kpi-val', '.sh-sent-val',
    '.tt-val', '.psent-cnt', '.sbar-cnt', '.td-num', '.pcard-handles',
    '.tbl-box tbody td', '.num'
  ].join(',');

  /* ---------------------------------------------------------------- number */
  var UNITS = [
    [/\bcr\b|crore/i, 1e7], [/\bl\b|lakh/i, 1e5],
    [/\bk\b/i, 1e3], [/\bm\b|million/i, 1e6], [/\bb\b|billion/i, 1e9]
  ];

  // "12,34,567" -> 1234567 | "13K" -> 13000 | "1.2 Cr" -> 12000000
  function parseVal(txt) {
    if (txt == null) return null;
    var t = String(txt).trim();
    if (!t || t === '—' || t === '-') return null;
    if (t.indexOf('%') >= 0) return null;          // percent chhod do
    if (/\d{4}-\d{2}-\d{2}|\d{1,2}[:/]\d{2}/.test(t)) return null;  // date/time chhod do

    var m = t.match(/-?\d[\d,]*(\.\d+)?/);
    if (!m) return null;
    var base = parseFloat(m[0].replace(/,/g, ''));
    if (!isFinite(base)) return null;

    var after = t.slice(m.index + m[0].length, m.index + m[0].length + 6);
    for (var i = 0; i < UNITS.length; i++) {
      if (UNITS[i][0].test(after)) { base *= UNITS[i][1]; break; }
    }
    return base;
  }

  // sample jaisi hi shakl me number wapas -- taaki count-up me format na toote
  function fmtLike(n, sample) {
    var t = String(sample);
    var m = t.match(/-?\d[\d,]*(\.\d+)?/);
    if (!m) return t;
    var numTxt = m[0];
    var pre = t.slice(0, m.index), post = t.slice(m.index + numTxt.length);

    var unit = 1, dec = (numTxt.split('.')[1] || '').length;
    var head = post.slice(0, 6);
    for (var i = 0; i < UNITS.length; i++) {
      if (UNITS[i][0].test(head)) { unit = UNITS[i][1]; break; }
    }
    var v = n / unit, out;
    if (unit > 1) {
      out = v.toFixed(dec);
    } else if (numTxt.indexOf(',') >= 0) {
      out = Math.round(v).toLocaleString('en-IN');
    } else {
      out = dec ? v.toFixed(dec) : String(Math.round(v));
    }
    return pre + out + post;
  }

  // delta ko chhoti shakl me: 1000 -> "1K", 250000 -> "2.5L"
  function fmtDelta(d) {
    d = Math.abs(d);
    if (d >= 1e7) return (d / 1e7).toFixed(d % 1e7 ? 2 : 0).replace(/\.00$/, '') + 'Cr';
    if (d >= 1e5) return (d / 1e5).toFixed(d % 1e5 ? 1 : 0).replace(/\.0$/, '') + 'L';
    if (d >= 1e3) return (d / 1e3).toFixed(d % 1e3 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return Math.round(d).toLocaleString('en-IN');
  }

  /* ------------------------------------------------------------- context */
  function txt(el) { return el ? (el.textContent || '').trim() : ''; }

  /* Value ka apna text -- badge (.rt-up) chhod kar. Badge value ke ANDAR
     lagta hai taaki wo USI line me dikhe ("13K ↑ +1K"), isliye parse karte
     waqt use hata dena zaroori hai. */
  function pureText(el) {
    if (!el) return '';
    var out = '', c = el.childNodes;
    for (var i = 0; i < c.length; i++) {
      if (c[i].nodeType === 3) out += c[i].nodeValue;
      else if (c[i].nodeType === 1 && !(c[i].classList && c[i].classList.contains('rt-up'))) out += c[i].textContent;
    }
    return out.trim();
  }

  /* sirf number wala text node badlo -- badge ko haath mat lagao */
  function setNum(el, str) {
    var c = el.childNodes;
    for (var i = 0; i < c.length; i++) {
      if (c[i].nodeType === 3 && c[i].nodeValue.trim()) { c[i].nodeValue = str; return; }
    }
    el.insertBefore(document.createTextNode(str), el.firstChild);
  }
  function val(id) { var e = document.getElementById(id); return e ? (e.value || '') : ''; }

  /* Date range default ho to "FULL" -- naya data aane par aakhri date
     apne aap badhti hai, use context me ginenge to indicator marr jayega. */
  function rangeSig() {
    var f = val('dashFrom'), t = val('dashTo');
    if (!f && !t) return 'FULL';
    var el = document.getElementById('dashFrom');
    var lo = el ? (el.getAttribute('min') || '') : '';
    var el2 = document.getElementById('dashTo');
    var hi = el2 ? (el2.getAttribute('max') || '') : '';
    if (f === lo && t === hi) return 'FULL';
    return f + '..' + t;
  }

  /* CONTEXT me TAB nahi hai -- jaan-boojh kar.
     Pehle tha, aur wahi bug tha: app page load ke thodi der baad
     '.page-section.active' set karti hai (aur har tab switch par badalti
     hai). Us se context badal jaata tha -> badge saaf ho jaate the aur
     nayi baseline likh di jaati thi, isliye indicator do second me gayab
     ho jaata tha. Tab ek FILTER hai hi nahi -- alag tab ke element ki
     apni alag key hoti hai (key me section id already hai). */
  function sig() {
    var scope = (window.DASH_SCOPE || 'all');
    return [scope, val('dashParty') || 'all', rangeSig()].join('|');
  }

  /* ----------------------------------------------------------------- key */
  function labelFor(el) {
    var p = el.parentElement;
    if (!p) return '';
    var lb = p.querySelector('.kpi-lbl,.lv-lbl,.pstat-lbl,.sent-card-lbl,.cm-stat-lbl,.sh-kpi-lbl,.psent-lbl');
    return lb ? txt(lb).slice(0, 40) : '';
  }

  /* ROW ki asli pehchan.
     PEHLE yahan row.cells[0] use hota tha -- par pehla column '#' (rank) hai.
     Sort/filter badalne par rank #1 par koi DUSRA handle aa jaata tha, aur
     uska number purane handle se compare hota tha -> "12.17 L  ↑ +10.58Cr"
     jaisa bakwaas delta. Isliye ab pehchan @handle se hoti hai (aur wo na
     mile to pehle asli text wale cell se), rank se nahi. */
  function rowKey(row) {
    var m = (row.textContent || '').match(/@[A-Za-z0-9_]{2,}/);
    if (m) return m[0].toLowerCase();
    var cells = row.cells;
    for (var i = 0; i < cells.length; i++) {
      var c = txt(cells[i]);
      // rank / number / date wale cell chhod do -- wo pehchan nahi hain
      if (c && c.length > 1 && !/^[\d.,%+\-↑↓\s]+$/.test(c)) return c.slice(0, 40);
    }
    return null;
  }

  function keyOf(el) {
    if (el.id) return 'id:' + el.id;
    var td = el.closest ? el.closest('td') : null;
    if (td && td.parentElement && td.parentElement.cells) {
      var row = td.parentElement;
      var first = rowKey(row);
      var col = td.cellIndex;
      var tb = td.closest('table');
      var tid = (tb && (tb.id || (tb.className || '').slice(0, 20))) || 't';
      if (first) return 'td:' + tid + ':' + first + ':' + col;
      return null;                                  // bina naam ki row -> chhod do
    }
    var lb = labelFor(el);
    if (lb) {
      var sec = el.closest ? el.closest('.page-section') : null;
      return 'lb:' + ((sec && sec.id) || 'main') + ':' + lb + ':' + (el.className || '');
    }
    return null;
  }

  /* --------------------------------------------------------------- store */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function save(o) {
    try {
      var k = Object.keys(o);
      if (k.length > MAXCTX) {                       // purane context hata do
        k.sort(function (a, b) { return (o[a]._t || 0) - (o[b]._t || 0); });
        for (var i = 0; i < k.length - MAXCTX; i++) delete o[k[i]];
      }
      localStorage.setItem(STORE, JSON.stringify(o));
    } catch (e) { /* private mode / quota -- chhod do */ }
  }

  /* --------------------------------------------------------------- paint */
  function clearBadges() {
    var b = document.querySelectorAll('.rt-up');
    for (var i = 0; i < b.length; i++) if (b[i].parentNode) b[i].parentNode.removeChild(b[i]);
  }

  function countUp(el, from, to, sample) {
    var dur = 700, t0 = 0;
    var target = fmtLike(to, sample);
    /* "13K" jaisi compact value me 0 decimal hote hain -- beech ke frame
       bhi 13K hi bante hain aur count-up dikhta hi nahi. Isliye animation
       ke dauraan ek decimal jod dete hain, aakhir me asli shakl wapas. */
    var anim = sample;
    var m = String(sample).match(/-?\d[\d,]*(\.\d+)?/);
    if (m && !m[1]) {
      var tail = String(sample).slice(m.index + m[0].length, m.index + m[0].length + 6);
      if (/\bcr\b|crore|\bl\b|lakh|\bk\b|\bm\b|\bb\b/i.test(tail)) {
        anim = String(sample).slice(0, m.index) + m[0] + '.0' + String(sample).slice(m.index + m[0].length);
      }
    }
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);               // ease-out
      if (p < 1) { setNum(el, fmtLike(from + (to - from) * e, anim)); requestAnimationFrame(step); }
      else setNum(el, target);                      // aakhir me bilkul sahi text
    }
    requestAnimationFrame(step);
  }

  function badge(el, d) {
    if (!el) return;
    var s = document.createElement('span');
    s.className = 'rt-up';
    s.setAttribute('aria-label', 'increased by ' + fmtDelta(d));
    s.textContent = '↑ +' + fmtDelta(d);
    el.appendChild(s);                              // usi line me: "13K ↑ +1K"
  }

  /* ---------------------------------------------------------------- main */
  /* ctx ka record: { t, b:{key:number}, d:{key:[delta, kab]} }
     b = baseline (aakhri dekha hua value)
     d = jo delta dikhana hai -- ye localStorage me bhi jaata hai, isliye
         page dobara reload ho (server naya data aane par reload karta hai)
         to bhi badge dikhta rehta hai, jab tak value phir se na badle. */
  var DELTA_TTL = 6 * 60 * 60 * 1000;      // 6 ghante baad purana badge hata do
  var CUR = null;                          // abhi ke context ka record
  var CTX = null;
  var SEEN = {};                           // is session me kaunsi key process ho chuki
  var painting = false, dirty = false, saveT = null;

  /* Baseline turant nahi likhte (har scan par localStorage likhna mehnga hai),
     par zyada der bhi nahi ruk sakte -- server naya data aane par page RELOAD
     kar deta hai, aur agar tab tak baseline likhi hi nahi gayi to agli baar
     delta nikalne ke liye kuch hota hi nahi. Isliye chhota debounce +
     page band/chhupte waqt turant flush. */
  function flush() {
    if (!dirty || !CTX || !CUR) return;
    clearTimeout(saveT);
    var st = load(); CUR.t = Date.now(); st[CTX] = CUR; save(st); dirty = false;
  }

  function persist() {
    dirty = true;
    clearTimeout(saveT);
    saveT = setTimeout(flush, 400);
  }

  function scan() {
    var out = [];
    var els;
    try { els = document.querySelectorAll(SEL); } catch (e) { return out; }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList && el.classList.contains('rt-up')) continue;
      if (el.offsetParent === null && el.getClientRects().length === 0) continue;  // chhupa hua
      var t = pureText(el);
      var n = parseVal(t);
      if (n === null) continue;
      var k = keyOf(el);
      if (!k) continue;
      out.push({ el: el, key: k, n: n, txt: t });
    }
    return out;
  }

  function run(animate) {
    if (painting) return;
    painting = true;
    try {
      var ctx = sig();

      /* Context SIRF tab badalta hai jab asli filter badle (party/range/scope).
         Tab switch se ab kuch nahi hota. */
      if (ctx !== CTX) {
        clearBadges();
        CTX = ctx; SEEN = {};
        var st = load();
        CUR = st[ctx] || { t: 0, b: {}, d: {} };
        if (!CUR.b) CUR.b = {};
        if (!CUR.d) CUR.d = {};
        var now0 = Date.now();
        for (var dk in CUR.d) {                       // bahut purane badge hata do
          if (!CUR.d[dk] || (now0 - (CUR.d[dk][1] || 0)) > DELTA_TTL) delete CUR.d[dk];
        }
      }

      var items = scan();
      if (!items.length) { painting = false; return; }
      var now = Date.now(), justUp = {};

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (SEEN[it.key]) continue;                   // is session me pehle hi dekh liya
        SEEN[it.key] = 1;

        var old = CUR.b[it.key];
        if (typeof old === 'number') {
          if (it.n > old) {                           // BADHA -> naya delta
            /* SANITY: ek update me value 3 guna se zyada nahi badhti.
               Itna bada "jump" matlab hum galti se do alag cheezein compare
               kar rahe hain (row dobara sort ho gayi, ya key takra gayi).
               Aise me badge mat dikhao -- chupchap nayi baseline le lo. */
            if (old >= 100 && it.n > old * 3) {
              delete CUR.d[it.key];
              CUR.b[it.key] = it.n;
              persist();
              continue;
            }
            CUR.d[it.key] = [it.n - old, now];
            justUp[it.key] = old;
            CUR.b[it.key] = it.n;
            persist();
          } else if (it.n < old) {                    // ghata -> purana badge hatao
            delete CUR.d[it.key];
            CUR.b[it.key] = it.n;
            persist();
          }
          // barabar hai -> baseline aur purana delta dono waise hi rehne do
        } else {
          CUR.b[it.key] = it.n;                       // pehli baar dikha (lazy tab bhi)
          persist();
        }
      }

      /* badge lagao -- naye bhi, aur pichhle update wale bhi (reload ke baad) */
      for (var k = 0; k < items.length; k++) {
        var itm = items[k], rec = CUR.d[itm.key];
        if (!rec) continue;
        if ((now - (rec[1] || 0)) > DELTA_TTL) { delete CUR.d[itm.key]; continue; }
        if (itm.el.querySelector && itm.el.querySelector('.rt-up')) continue;   // pehle se laga hai
        badge(itm.el, rec[0]);
        if (animate && itm.key in justUp) {           // animation sirf abhi badhe hue par
          itm.el.classList.add('rt-pulse');
          (function (e) { setTimeout(function () { e.classList.remove('rt-pulse'); }, 1400); })(itm.el);
          countUp(itm.el, justUp[itm.key], itm.n, itm.txt);
        }
      }
    } catch (e) { /* kabhi page mat todo */ }
    painting = false;
  }

  /* ------------------------------------------------------------- trigger */
  var timer = null;
  function schedule(animate) {
    clearTimeout(timer);
    timer = setTimeout(function () { run(animate); }, 220);
  }

  function boot() {
    run(true);                                     // pehli baar -- animation ke saath
    try {
      var mo = new MutationObserver(function () { schedule(false); });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { }
    // filter / tab badle -> naya context
    ['dashParty', 'dashFrom', 'dashTo', 'dashPreset'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) e.addEventListener('change', function () { schedule(true); });
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest('.mnav-tab,.ptab')) schedule(false);
    }, true);
  }

  /* page band ho / tab chhupe -> baseline turant likh do */
  try {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
  } catch (e) { }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 700); });
  else setTimeout(boot, 700);

  window.rtDeltaRescan = function () { CTX = null; SEEN = {}; schedule(true); };
  window.rtDeltaReset = function () {
    try { localStorage.removeItem(STORE); } catch (e) { }
    CTX = null; CUR = null; SEEN = {}; clearBadges();
  };
})();
"""


def rt_block():
    return ("\n<!-- " + RT_MARK + " -->\n"
            "<style>\n" + RT_CSS + "</style>\n"
            "<script>\n" + RT_JS + "</script>\n")


def strip_old_indicator(s):
    """Purana (v1) indicator block poora nikaal do -- taaki uski jagah naya lag sake."""
    i = s.find("<!-- " + RT_ANY)
    if i < 0:
        return s, False
    try:
        j = s.index("</script>", s.index("<script>", i)) + len("</script>")
    except ValueError:
        return s, False
    return s[:i].rstrip("\n") + "\n" + s[j:].lstrip("\n"), True


def add_indicator(s):
    """(naya_html, status) -- </body> ke theek pehle CSS+JS jod deta hai.

    DHYAN 1: template me DO </body> hote hain. Pehla wala ek JS string ke
    andar hai (Save-as-PDF wala popup document banata hai). Isliye hamesha
    AAKHRI </body> par jodna hai, warna script us popup me chali jayegi.

    DHYAN 2: agar PURANA (v1) indicator pehle se laga hai to use nikaal kar
    naya lagate hain -- purane version me bug the (badge gayab ho jaana,
    aur table me galat-badhe hue delta).
    """
    if RT_MARK in s:
        return s, "already"
    s, upgraded = strip_old_indicator(s)
    i = s.rfind("</body>")
    if i < 0 or i < len(s) - 400:             # aakhri </body> document ke ant me hona chahiye
        return s, "noplace"
    return s[:i] + rt_block() + s[i:], ("upgraded" if upgraded else "added")


# =============================================================================
def short(t):
    t = " ".join(t.split())
    return (t[:60] + "...") if len(t) > 60 else t


def process(path):
    name = os.path.join(os.path.basename(os.path.dirname(path)), os.path.basename(path))
    print("\n" + "=" * 76)
    print("  " + name)
    print("=" * 76)

    if not os.path.isfile(path):
        print("  [X] file nahi mili -- chhod diya")
        print("      %s" % path)
        return 0

    s = io.open(path, encoding="utf-8", newline="").read()
    orig = s
    done = already = skipped = 0

    for title, subs in GROUPS:
        print("\n  " + title)
        for rule in subs:
            old, new = rule[0], rule[1]
            marker = rule[2] if len(rule) > 2 else (new or None)
            # pehle "pehle se laga hai" check -- warna jis rule me `old`,
            # `new` ka hissa hai wo dobara lag jaata hai
            if marker and marker in s:
                already += 1
                print("     [--]   pehle se hai : %s" % short(marker))
            elif old in s:
                s = s.replace(old, new, 1)
                done += 1
                print("     [OK]   laga diya   : %s" % short(old))
            else:
                skipped += 1
                print("     [SKIP] nahi mila   : %s" % short(old))

    print("\n  5. LIVE INDICATOR  (badhne par hara ↑ +delta)")
    s, st = add_indicator(s)
    if st == "added":
        done += 1
        print("     [OK]   jod diya    : CSS + JS (</body> se pehle)")
    elif st == "upgraded":
        done += 1
        print("     [OK]   UPGRADE     : purana indicator hata kar naya laga diya")
    elif st == "already":
        already += 1
        print("     [--]   pehle se hai : live indicator")
    else:
        skipped += 1
        print("     [SKIP] </body> nahi mila -- indicator nahi juda")

    print("\n  ---- %s: %d naya, %d pehle se, %d nahi mila ----"
          % (name, done, already, skipped))

    if not APPLY:
        print("  (REPORT mode -- kuch nahi badla. Lagane ke liye: --apply)")
        return done

    if s == orig:
        print("  Kuch badla nahi -- file waisi hi chhod di.")
        return done

    bak = path + ".bak_" + datetime.datetime.now().strftime("%Y%m%d_%H%M")
    shutil.copy2(path, bak)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print("  BACKUP    : %s" % os.path.basename(bak))
    print("  LIKH DIYA : %s" % os.path.basename(path))
    return done


def main():
    print("\n" + "#" * 76)
    print("#  DASHBOARD FIXES  v2  --  %s"
          % ("APPLY (files badlenge)" if APPLY else "REPORT ONLY (kuch nahi badlega)"))
    print("#  Folder: %s" % HERE)
    print("#" * 76)

    if not any(os.path.isfile(p) for p in TARGETS):
        print("\n  [X] Yahan koi dashboard.template.html nahi mila.")
        print("      Is script ko project ki JAD me rakho -- jahan DASHBOARD aur")
        print("      UP-DASHBOARD dono folder hain. Abhi yahan hoon:")
        print("      %s" % HERE)
        return 1

    total = sum(process(p) for p in TARGETS)

    print("\n" + "=" * 76)
    if APPLY:
        print("  HO GAYA -- %d change lage." % total)
        print()
        print("  Ab browser me Ctrl + Shift + R.")
        print("  (Server restart ki zaroorat nahi -- server har page load par")
        print("   template disk se padhta hai.)")
        print()
        print("  Kuch galat lage to backup se wapas:")
        print("     copy /Y dashboard.template.html.bak_XXXX dashboard.template.html")
    else:
        print("  Ye sirf REPORT thi. Lagane ke liye:")
        print("     python APPLY_DASHBOARD_FIXES.py --apply")
    print("=" * 76)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n  Rok diya.")
        sys.exit(1)
