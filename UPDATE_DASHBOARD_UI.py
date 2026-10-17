# -*- coding: utf-8 -*-
r"""
UPDATE_DASHBOARD_UI.py  --  dashboard ke 3 UI change, ek saath
================================================================================
  1. HASHTAG TAB me saare 8 sentiment
     Abhi sirf Neu / Pos / Neg dikhte the. Data me to saare 8 pehle se the
     (update_dashboard.py SENT_CODES ke saath hashtag bhi ginta hai) --
     bas dikhane wala code purana reh gaya tha. Ab SENTX se saare 8 aate hain.
     (Pipeline badalne ki zaroorat NAHI, data dobara banana bhi nahi padega.)

  2. UP DASHBOARD se STATE dropdown hat gaya
     Jab dashboard hi UP ka hai to "State: All India / Uttar Pradesh" wala
     dropdown wahan bekaar hai. Sirf UP-DASHBOARD se hatta hai.

  3. "KAB UPDATE HUA" har jagah
     - Header ke top-right me pill:  "2 min pehle"
     - Har table ke upar chhoti chip: "12 min pehle"
     Time /api/version se aata hai (india_Pulse / up_pulse ka meta.lastUpdate,
     jo pipeline har push par likhta hai). Har 60 second check, har 20 second
     text refresh -- isliye "abhi", "2 min pehle", "1 ghanta pehle" apne aap
     badalta rehta hai.

SURAKSHA
  * Badalne se pehle backup:   dashboard.template.html.bak_ui
  * Dobara chalao to kuch nahi hota (marker se pata chal jaata hai)
  * Koi anchor na mile to us file ko haath hi nahi lagata (safe abort)
  * Server RESTART ki zaroorat nahi -- bas browser Ctrl+F5

CHALAO (project folder ke andar se):
    python UPDATE_DASHBOARD_UI.py              <- laga do
    python UPDATE_DASHBOARD_UI.py --dry-run    <- sirf dikhao, badlo mat
    python UPDATE_DASHBOARD_UI.py --undo       <- backup se wapas purana
================================================================================
"""
import io
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
UNDO = "--undo" in sys.argv

MARK_HASH = "HASHTAG 8-SENT (hash8 v1)"
MARK_UPD = "LAST UPDATED (upd v1)"
MARK_NOSTATE = "UP: state dropdown hata diya (nostate v1)"

TARGETS = [
    ("All India", os.path.join(HERE, "DASHBOARD", "dashboard.template.html"), False),
    ("UP", os.path.join(HERE, "UP-DASHBOARD", "dashboard.template.html"), True),
]

# ---------------------------------------------------------------- 1. HASHTAG
HASH_TH_OLD = '<th>Sentiment (Neu / Pos / Neg)</th>'
HASH_TH_NEW = '<th>Sentiment &mdash; saare 8</th>'

HASH_FN_OLD = (
    "function renderHashtags(){const hColors=['#1a1a1a','#E65100','#0D47A1','#1B5E20',"
    "'#4A148C','#C62828','#BF6900','#1B7A4A'];var _hq=((document.getElementById('hashSearch')||{})"
    ".value||'').trim().toLowerCase();var _hsrc=(window.HV||HASHTAGS);try{var _htc="
    "document.getElementById('hashTweetCount');if(_htc&&_hsrc&&_hsrc.reduce)_htc.textContent="
    "(_hsrc.reduce(function(a,b){return a+(+b.count||0);},0)).toLocaleString('en-IN');}catch(e){}"
    "if(_hq)_hsrc=_hsrc.filter(function(_h){return String(_h.tag||'').toLowerCase().indexOf(_hq)>=0;});"
)

HASH_FN_NEW = (
    "/* " + MARK_HASH + " -- saare 8 category, SENTX se */\n"
    "function renderHashtags(){const hColors=['#1a1a1a','#E65100','#0D47A1','#1B5E20',"
    "'#4A148C','#C62828','#BF6900','#1B7A4A'];var _X=window.SENTX;"
    "var _hq=((document.getElementById('hashSearch')||{})"
    ".value||'').trim().toLowerCase();var _hsrc=(window.HV||HASHTAGS);try{var _htc="
    "document.getElementById('hashTweetCount');if(_htc&&_hsrc&&_hsrc.reduce)_htc.textContent="
    "(_hsrc.reduce(function(a,b){return a+(+b.count||0);},0)).toLocaleString('en-IN');}catch(e){}"
    "if(_hq)_hsrc=_hsrc.filter(function(_h){return String(_h.tag||'').toLowerCase().indexOf(_hq)>=0;});"
)

# poora sentiment <td> + uske pehle wala tot -- naya version
HASH_BODY_OLD = (
    "document.getElementById('hashBody').innerHTML=_hsrc.map((h,i)=>{const tot=(h.pos+h.neu+h.neg)||1;"
)
HASH_BODY_NEW = (
    "document.getElementById('hashBody').innerHTML=_hsrc.map((h,i)=>{const tot=_X.tot(h)||1;"
)

HASH_TD_OLD = (
    '<td><div class="sbar-wrap"><div class="sbar-row"><span class="sbar-lbl sl-n">Neu</span>'
    '<div class="sbar-track"><div class="sbar-fill sf-neu" data-w="${Math.round(h.neu/tot*100)}">'
    '</div></div><span class="sbar-cnt">${h.neu}</span></div><div class="sbar-row">'
    '<span class="sbar-lbl sl-p">Pos</span><div class="sbar-track">'
    '<div class="sbar-fill sf-p" data-w="${Math.round(h.pos/tot*100)}"></div></div>'
    '<span class="sbar-cnt">${h.pos}</span></div><div class="sbar-row">'
    '<span class="sbar-lbl sl-neg">Neg</span><div class="sbar-track">'
    '<div class="sbar-fill sf-neg" data-w="${Math.round(h.neg/tot*100)}"></div></div>'
    '<span class="sbar-cnt">${h.neg}</span></div></div></td>'
)
# 8 se zyada hashtag par hColors[i] undefined ho jaata tha (list me 18 tag aate
# hain, rang sirf 8) -> color:undefined. Ab list ghoom kar dobara shuru ho jaati hai.
HASH_COLOR_OLD = "${hColors[i]}"
HASH_COLOR_NEW = "${hColors[i%hColors.length]}"

HASH_TD_NEW = (
    '<td><div class="sbar-wrap">${_X.CATS.map(function(c){var v=_X.n(h,c.k);'
    'return \'<div class="sbar-row"><span class="sbar-lbl" style="color:\'+c.c+\'">\'+c.label+\'</span>\''
    '+\'<div class="sbar-track"><div class="sbar-fill" style="background:\'+c.c+\'" data-w="\''
    '+Math.round(v/tot*100)+\'"></div></div>\''
    '+\'<span class="sbar-cnt">\'+v.toLocaleString(\'en-IN\')+\'</span></div>\';}).join(\'\')}</div></td>'
)

HASH_CSS = """<style>
/* ---- """ + MARK_HASH + """ ---- */
/* 8 row aate hain to label/ginti ko thodi aur jagah chahiye.
   Sirf hashtag table par lagta hai -- baaki jagah ke sbar waise hi rehte hain. */
#hashBody .sbar-wrap{min-width:186px}
#hashBody .sbar-lbl{width:68px;letter-spacing:.2px}
#hashBody .sbar-cnt{width:48px}
</style>
"""

# ---------------------------------------------------------------- 2. UP dropdown
STATE_ROW_OLD = """  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <span class="filter-label">State</span>
    <select class="filter-select" id="sStateSelect" onchange="upSent(this.value)" style="min-width:180px"><option value="ALL">All India</option></select>
    <span style="font-size:10px;color:var(--muted)">Pick a state for its sentiment</span>
  </div>
"""
STATE_ROW_NEW = """  <!-- """ + MARK_NOSTATE + """ -->
"""

# ---------------------------------------------------------------- 3. last updated
UPD_PILL_OLD = '''  <div class="hdr-right">
    <div class="data-pill" id="dataPill">'''
UPD_PILL_NEW = '''  <div class="hdr-right">
    <!-- ''' + MARK_UPD + ''' -->
    <div class="data-pill upd-pill" id="updPill" title="Data kab update hua">&#8635; &mdash;</div>
    <div class="data-pill" id="dataPill">'''

UPD_CSS = """<style>
/* ---- """ + MARK_UPD + """ ---- */
.upd-pill{font-variant-numeric:tabular-nums}
.upd-chip{font-size:9.5px;font-weight:600;color:var(--muted);text-align:right;
  padding:7px 11px 0;letter-spacing:.3px;font-variant-numeric:tabular-nums}
@media print{.upd-pill,.upd-chip{display:none!important}}
</style>
"""

UPD_JS = """<script>
/* ---------- """ + MARK_UPD + """ ----------
   "Data kab update hua" -- header me aur har table ke upar.

   Time kahan se: /api/version  ->  meta.lastUpdate, jo pipeline har push ke
   baad likhta hai (push_all_scopes.py ka _stamp). All-India ke liye
   india_Pulse, UP ke liye up_pulse -- isliye scope URL se pakadte hain.

   Ye module sirf PADHTA hai aur sirf text likhta hai -- kisi maujooda
   cheez ko chhedta nahi. Sab try/catch me hai, page kabhi nahi tootega. */
(function () {
  'use strict';
  var LAST = null;

  function scopeOf() {
    try {
      var m = location.search.match(/[?&]scope=(up|all)\\b/);
      if (m) return m[1];
      if (/^\\/up(\\/|$)/.test(location.pathname)) return 'up';
    } catch (e) {}
    return 'all';
  }

  /* "2026-10-01 07:26:13" -> Date (local time me) */
  function parseTs(v) {
    if (!v) return null;
    var d = new Date(String(v).trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function ago(d) {
    if (!d) return '\\u2014';
    var sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 0) sec = 0;
    if (sec < 45) return 'abhi update hua';
    var min = Math.round(sec / 60);
    if (min < 60) return min + ' min pehle';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? '1 ghanta pehle' : hr + ' ghante pehle';
    var day = Math.floor(hr / 24);
    return day === 1 ? 'kal' : day + ' din pehle';
  }

  function tip(d) {
    try { return d ? ('Data update hua: ' + d.toLocaleString('en-IN')) : 'Abhi pata nahi'; }
    catch (e) { return ''; }
  }

  function render() {
    var txt = '\\u21BB ' + ago(LAST), t = tip(LAST);
    try {
      var p = document.getElementById('updPill');
      if (p) { p.textContent = txt; p.title = t; }
      var cs = document.querySelectorAll('.upd-chip');
      for (var i = 0; i < cs.length; i++) { cs[i].textContent = txt; cs[i].title = t; }
    } catch (e) {}
  }

  /* har table ke dibbe (.tbl-box) ke upar ek chhoti chip laga do */
  function inject() {
    try {
      var boxes = document.querySelectorAll('.tbl-box');
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        var f = b.firstElementChild;
        if (f && f.className === 'upd-chip') continue;
        var c = document.createElement('div');
        c.className = 'upd-chip';
        c.textContent = '\\u21BB \\u2014';
        b.insertBefore(c, b.firstChild);
      }
    } catch (e) {}
  }

  function poll() {
    try {
      fetch('/api/version?scope=' + scopeOf(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var d = parseTs(j && j.v);
          /* scope wala khaali nikla to bina scope ke ek baar aur dekh lo */
          if (!d) {
            return fetch('/api/version', { cache: 'no-store' })
              .then(function (r2) { return r2.json(); })
              .then(function (j2) { LAST = parseTs(j2 && j2.v); render(); });
          }
          LAST = d; render();
        })
        .catch(function () {});
    } catch (e) {}
  }

  function boot() {
    inject(); render(); poll();
    setInterval(poll, 60000);          // naya time server se
    setInterval(function () { inject(); render(); }, 20000);  // "X min pehle" aage badhta rahe
    /* tab badalne par naya table dikh sakta hai -- uspar bhi chip laga do */
    try {
      var orig = window.switchTab;
      if (typeof orig === 'function') {
        window.switchTab = function () {
          var out = orig.apply(this, arguments);
          setTimeout(function () { inject(); render(); }, 60);
          return out;
        };
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
</script>
</body>"""


def say(m=""):
    print(m, flush=True)


def patch_one(label, path, is_up):
    if not os.path.isfile(path):
        say("  [NAHI MILA]  %s  (%s)" % (label, path))
        return None

    s = io.open(path, encoding="utf-8", newline="").read()
    orig = s
    steps = []

    # ---- 1. hashtag 8 sentiment ----
    if MARK_HASH in s:
        steps.append(("already", "hashtag: 8 sentiment"))
    else:
        bad = None
        for name, old, want in (("header", HASH_TH_OLD, 1), ("function", HASH_FN_OLD, 1),
                                ("tot", HASH_BODY_OLD, 1), ("bars", HASH_TD_OLD, 1),
                                ("colors", HASH_COLOR_OLD, 2)):
            if s.count(old) != want:
                bad = "%s (mila %d baar, chahiye %d)" % (name, s.count(old), want)
                break
        if bad:
            steps.append(("FAIL", "hashtag: anchor nahi mila -> " + bad))
        else:
            s = s.replace(HASH_TH_OLD, HASH_TH_NEW, 1)
            s = s.replace(HASH_FN_OLD, HASH_FN_NEW, 1)
            s = s.replace(HASH_BODY_OLD, HASH_BODY_NEW, 1)
            s = s.replace(HASH_TD_OLD, HASH_TD_NEW, 1)
            s = s.replace(HASH_COLOR_OLD, HASH_COLOR_NEW)      # dono jagah
            i = s.find("</style>")
            s = s[:i + 8] + "\n" + HASH_CSS + s[i + 8:]
            steps.append(("OK", "hashtag: ab saare 8 sentiment"))

    # ---- 2. UP ka state dropdown ----
    if is_up:
        if MARK_NOSTATE in s:
            steps.append(("already", "UP: state dropdown hata hua hai"))
        elif s.count(STATE_ROW_OLD) != 1:
            steps.append(("FAIL", "UP: state dropdown ka block nahi mila (%d)" % s.count(STATE_ROW_OLD)))
        else:
            s = s.replace(STATE_ROW_OLD, STATE_ROW_NEW, 1)
            steps.append(("OK", "UP: state dropdown hata diya"))

    # ---- 3. last updated ----
    if MARK_UPD in s:
        steps.append(("already", "last-updated: pehle se laga hai"))
    else:
        if s.count(UPD_PILL_OLD) != 1:
            steps.append(("FAIL", "last-updated: header anchor nahi mila (%d)" % s.count(UPD_PILL_OLD)))
        elif s.count("</body>") < 1:
            steps.append(("FAIL", "last-updated: </body> nahi mila"))
        else:
            s = s.replace(UPD_PILL_OLD, UPD_PILL_NEW, 1)
            i = s.find("</style>")
            s = s[:i + 8] + "\n" + UPD_CSS + s[i + 8:]
            j = s.rfind("</body>")
            s = s[:j] + UPD_JS[:-len("</body>")] + s[j:]
            steps.append(("OK", "last-updated: header pill + har table par chip"))

    say("  %s" % label)
    failed = False
    for st, msg in steps:
        say("     [%-7s] %s" % (st, msg))
        if st == "FAIL":
            failed = True

    if failed:
        say("     -> is file ko HAATH NAHI LAGAYA (safe abort)")
        return False
    if s == orig:
        return True
    if DRY:
        say("     -> dry-run, file nahi badli")
        return True

    bak = path + ".bak_ui"
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    say("     -> save ho gaya (backup: %s)" % os.path.basename(bak))
    return True


def undo():
    say("=" * 70)
    say("  UNDO -- backup se purana wapas")
    say("=" * 70)
    n = 0
    for label, path, _ in TARGETS:
        bak = path + ".bak_ui"
        if not os.path.exists(bak):
            say("  [backup nahi]  %s" % label)
            continue
        shutil.copy2(bak, path)
        say("  [wapas aaya]   %s" % label)
        n += 1
    say("\n  %d file wapas purani ho gayi. Browser Ctrl+F5." % n)


def main():
    if UNDO:
        undo()
        return

    say("=" * 70)
    say("  DASHBOARD UI UPDATE")
    say("     1. Hashtag tab -> saare 8 sentiment")
    say("     2. UP dashboard -> state dropdown hatao")
    say("     3. 'Kab update hua' -> header + har table")
    if DRY:
        say("     *** DRY RUN -- koi file nahi badlegi ***")
    say("=" * 70)
    say()

    res = [patch_one(l, p, u) for l, p, u in TARGETS]
    say()
    say("=" * 70)
    if any(r is False for r in res):
        say("  Kuch file me dikkat -- upar dekho. Jo fail hui wo waisi ki waisi hai.")
        say("=" * 70)
        sys.exit(1)
    say("  SAB HO GAYA")
    if not DRY:
        say()
        say("  Server restart ki ZAROORAT NAHI -- bas browser Ctrl+F5.")
        say("  Wapas purana chahiye to:  python UPDATE_DASHBOARD_UI.py --undo")
    say("=" * 70)


if __name__ == "__main__":
    main()
