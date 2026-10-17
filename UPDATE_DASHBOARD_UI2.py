# -*- coding: utf-8 -*-
r"""
UPDATE_DASHBOARD_UI2.py  --  doosra round (sab English + table column)
================================================================================
  1. SIDEBAR ka tab text ab cut nahi hota
     "Elected Representativ..." dikh raha tha. Ab lamba naam do line me
     aa jaata hai (white-space:normal), chhote naam waise ke waise.

  2. SAARA TIME ANGREZI ME
     "2 min pehle"     -> "2 min ago"
     "9 ghante pehle"  -> "9 hours ago"
     "3 din pehle"     -> "3 days ago"
     "DELAYED · 9 ghante pehle" -> "DELAYED · 9 hours ago"
     "koi khabar nahi" -> "NO NEWS"
     (Breaking News ka bnAgo bhi, aur header/table wala bhi.)

  3. HAR TABLE ME "LAST UPDATED" COLUMN
     Pehle table ke upar chhoti chip thi. Ab har table me sabse aakhri
     column jud jaata hai -- header "LAST UPDATED", har row me "20 min ago".
     JS se judta hai, isliye jo table filter badalne par dobara banti hain
     unme bhi apne aap wapas aa jaata hai (MutationObserver).

  4. BREAKING NEWS card me bhi
     Har tweet card ke neeche "updated 20 min ago" aa jaata hai -- yaani
     dashboard ka data kab taaza hua.

Time kahan se: /api/version -> meta.lastUpdate (pipeline har push par likhta
hai). All India = india_Pulse, UP = up_pulse -- scope apne aap pakadta hai.

SURAKSHA
  * Backup: dashboard.template.html.bak_ui2
  * Dobara chalao to kuch nahi hota
  * Anchor na mile to file ko haath nahi lagata (safe abort)
  * Server restart ki zaroorat nahi -- bas Ctrl+F5

CHALAO:
    python UPDATE_DASHBOARD_UI2.py
    python UPDATE_DASHBOARD_UI2.py --dry-run
    python UPDATE_DASHBOARD_UI2.py --undo
================================================================================
"""
import io
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
UNDO = "--undo" in sys.argv

MARK = "LAST UPDATED (upd v2)"
BAK = ".bak_ui2"

TARGETS = [
    ("All India", os.path.join(HERE, "DASHBOARD", "dashboard.template.html")),
    ("UP", os.path.join(HERE, "UP-DASHBOARD", "dashboard.template.html")),
]

# ---------------------------------------------------------------- CSS
CSS = """<style>
/* ---- """ + MARK + """ ---- */
/* sidebar: lamba naam ("Elected Representatives") cut ho raha tha.
   Ab wo do line me aa jaata hai; chhote naam ek hi line me rehte hain. */
.main-nav .mnav-tab{white-space:normal;line-height:1.2}

/* har table ka aakhri column */
.lu-th{font-size:9px;white-space:nowrap;text-align:right;opacity:.75}
.lu-td{font-size:9.5px;color:var(--muted);white-space:nowrap;text-align:right;
  font-variant-numeric:tabular-nums}
/* breaking news card ke andar */
.bn-upd{color:var(--muted);font-variant-numeric:tabular-nums}
.upd-pill{font-variant-numeric:tabular-nums}
@media print{.upd-pill,.lu-th,.lu-td,.bn-upd{display:none!important}}
</style>
"""

# ---------------------------------------------------------------- JS (v2)
JS = """<script>
/* ---------- """ + MARK + """ ----------
   "Data kab update hua" -- header pill, har table ka aakhri column, aur
   breaking-news card ke andar. Sab angrezi me.

   Time /api/version se: meta.lastUpdate, jo pipeline har push ke baad
   likhta hai (push_all_scopes.py ka _stamp). All India = india_Pulse,
   UP = up_pulse, isliye scope URL se pakadte hain.

   Ye module sirf text likhta hai -- kisi maujooda cheez ko chhedta nahi.
   Sab try/catch me hai, page kabhi nahi tootega. */
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

  /* "2026-10-01 07:26:13" -> Date (local) */
  function parseTs(v) {
    if (!v) return null;
    var d = new Date(String(v).trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function ago(d) {
    if (!d) return '\\u2014';
    var sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 0) sec = 0;
    if (sec < 45) return 'just now';
    var min = Math.round(sec / 60);
    if (min < 60) return min === 1 ? '1 min ago' : min + ' min ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? '1 hour ago' : hr + ' hours ago';
    var day = Math.floor(hr / 24);
    return day === 1 ? '1 day ago' : day + ' days ago';
  }

  function tip(d) {
    try { return d ? ('Data last updated: ' + d.toLocaleString('en-IN')) : 'Not known yet'; }
    catch (e) { return ''; }
  }

  function fill(sel, txt, t) {
    try {
      var e = document.querySelectorAll(sel);
      for (var i = 0; i < e.length; i++) { e[i].textContent = txt; e[i].title = t; }
    } catch (e2) {}
  }

  function render() {
    var txt = ago(LAST), t = tip(LAST);
    try {
      var p = document.getElementById('updPill');
      if (p) { p.textContent = '\\u21BB ' + txt; p.title = t; }
    } catch (e) {}
    fill('.lu-td', txt, t);
    fill('.bn-upd', '\\u21BB updated ' + txt, t);
  }

  /* har table me aakhri column "LAST UPDATED".
     Idempotent hai -- pehle se laga ho to kuch nahi karta. */
  function addCol() {
    try {
      var ts = document.querySelectorAll('.tbl-box table');
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i], th = t.tHead;
        if (!th || !th.rows.length) continue;
        var hr = th.rows[th.rows.length - 1];
        if (!hr.querySelector('.lu-th')) {
          var c = document.createElement('th');
          c.className = 'lu-th';
          c.textContent = 'LAST UPDATED';
          hr.appendChild(c);
        }
        var cols = hr.cells.length;
        for (var b = 0; b < t.tBodies.length; b++) {
          var rows = t.tBodies[b].rows;
          for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            /* "kuch nahi mila" wali ek-cell row -- usko sirf chaura kar do */
            if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
              row.cells[0].colSpan = cols;
              continue;
            }
            if (!row.querySelector('.lu-td')) {
              var td = document.createElement('td');
              td.className = 'lu-td';
              td.textContent = '\\u2014';
              row.appendChild(td);
            }
          }
        }
      }
    } catch (e) {}
  }

  function poll() {
    try {
      fetch('/api/version?scope=' + scopeOf(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var d = parseTs(j && j.v);
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

  /* table filter badalne par rows dobara banti hain -- tab column wapas lagao */
  var pending = null;
  function watch() {
    try {
      var mo = new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; addCol(); render(); }, 150);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  function boot() {
    addCol(); render(); poll(); watch();
    setInterval(poll, 60000);
    setInterval(function () { addCol(); render(); }, 20000);
    try {
      var orig = window.switchTab;
      if (typeof orig === 'function') {
        window.switchTab = function () {
          var out = orig.apply(this, arguments);
          setTimeout(function () { addCol(); render(); }, 60);
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

# ---------------------------------------------------------------- news: English
BNAGO_OLD = """    if (s < 90) return Math.round(s) + ' sec pehle';
    if (s < 5400) return Math.round(s / 60) + ' min pehle';
    if (s < 172800) return Math.round(s / 3600) + ' ghante pehle';
    return Math.round(s / 86400) + ' din pehle';"""
BNAGO_NEW = """    if (s < 90) return Math.round(s) + ' sec ago';
    if (s < 5400) { var m = Math.round(s / 60); return m === 1 ? '1 min ago' : m + ' min ago'; }
    if (s < 172800) { var h = Math.round(s / 3600); return h === 1 ? '1 hour ago' : h + ' hours ago'; }
    var dd = Math.round(s / 86400); return dd === 1 ? '1 day ago' : dd + ' days ago';"""

NONEWS_OLD = "tx.textContent = 'koi khabar nahi'; return; }"
NONEWS_NEW = "tx.textContent = 'NO NEWS'; return; }"

BNCARD_OLD = ("""      +   '<span title="' + esc(r.date) + '">' + esc(bnAgo(r.date.replace(' ', 'T'))) + '</span>'""")
BNCARD_NEW = ("""      +   '<span title="' + esc(r.date) + '">' + esc(bnAgo(r.date.replace(' ', 'T'))) + '</span>'
      +   '<span class="bn-upd" title="Dashboard data refresh">&#8635; updated &mdash;</span>'""")

# header pill (agar pehle se na ho)
PILL_OLD = '''  <div class="hdr-right">
    <div class="data-pill" id="dataPill">'''
PILL_NEW = '''  <div class="hdr-right">
    <div class="data-pill upd-pill" id="updPill" title="Data last updated">&#8635; &mdash;</div>
    <div class="data-pill" id="dataPill">'''


def say(m=""):
    print(m, flush=True)


MAXCUT = 25000   # itne se bada tukda kaatna = kuch galat hai, haath mat lagao


def _cut(s, marker, otag, ctag):
    """otag ... marker ... ctag  ka poora tukda. Na mile to (None, None)."""
    i = s.find(marker)
    if i < 0:
        return None, None
    a = s.rfind(otag, 0, i)
    b = s.find(ctag, i)
    if a < 0 or b < 0:
        return None, None
    b += len(ctag)
    if (b - a) > MAXCUT:        # suraksha: galti se aadha page kat na jaaye
        return None, None
    return a, b


def cut_block(s, marker):
    return _cut(s, marker, "<script>", "</script>")


def cut_style(s, marker):
    return _cut(s, marker, "<style>", "</style>")


def _report(label, steps, fail, path, s, orig):
    say("  %s" % label)
    for st, m in steps:
        say("     [%-7s] %s" % (st, m))
    if fail:
        say("     -> is file ko HAATH NAHI LAGAYA (safe abort)")
        return False
    return True


def patch_one(label, path):
    if not os.path.isfile(path):
        say("  [NAHI MILA]  %s" % label)
        return None

    s = io.open(path, encoding="utf-8", newline="").read()
    orig = s
    steps = []
    fail = False

    if MARK in s:
        steps.append(("already", "sab pehle se laga hai (v2)"))
        say("  %s" % label)
        for st, m in steps:
            say("     [%-7s] %s" % (st, m))
        return True

    # ---- 1+3. purana v1 block hatao / naya v2 lagao ----
    # v1 ka JS comment 10 dash ka hai, CSS ka 4 dash ka -- isliye alag dhoondte hain
    a, b = cut_block(s, "/* ---------- LAST UPDATED (upd v1) ----------")
    if a is not None:
        s = s[:a] + s[b:]
        steps.append(("OK", "purana v1 script hata diya"))
    a, b = cut_style(s, "/* ---- LAST UPDATED (upd v1) ---- */")
    if a is not None:
        s = s[:a] + s[b:]
        steps.append(("OK", "purana v1 CSS hata diya"))
    # header me v1 ka HTML comment bhi tha
    s = s.replace("    <!-- LAST UPDATED (upd v1) -->\n", "")
    if "upd v1" in s:
        steps.append(("FAIL", "v1 ka koi hissa abhi bhi bacha hai"))
        return _report(label, steps, True, path, s, orig)

    # header pill
    if 'id="updPill"' not in s:
        if s.count(PILL_OLD) != 1:
            steps.append(("FAIL", "header pill ka anchor nahi mila"))
            fail = True
        else:
            s = s.replace(PILL_OLD, PILL_NEW, 1)
            steps.append(("OK", "header pill laga"))

    # naya CSS + JS
    i = s.find("</style>")
    if i < 0:
        steps.append(("FAIL", "</style> nahi mila"))
        fail = True
    else:
        s = s[:i + 8] + "\n" + CSS + s[i + 8:]
        steps.append(("OK", "CSS: sidebar wrap + LAST UPDATED column"))

    j = s.rfind("</body>")
    if j < 0:
        steps.append(("FAIL", "</body> nahi mila"))
        fail = True
    else:
        s = s[:j] + JS[:-len("</body>")] + s[j:]
        steps.append(("OK", "JS v2: angrezi time + har table me column"))

    # ---- 2. breaking news ka time angrezi me ----
    if BNAGO_OLD in s:
        s = s.replace(BNAGO_OLD, BNAGO_NEW, 1)
        steps.append(("OK", "breaking news: time ab angrezi me"))
    elif "' min ago'" in s:
        steps.append(("already", "breaking news ka time pehle se angrezi"))
    else:
        steps.append(("FAIL", "bnAgo nahi mila"))
        fail = True

    if NONEWS_OLD in s:
        s = s.replace(NONEWS_OLD, NONEWS_NEW, 1)
        steps.append(("OK", "'koi khabar nahi' -> 'NO NEWS'"))
    elif "'NO NEWS'" in s:
        steps.append(("already", "NO NEWS pehle se"))

    # ---- 4. news card me "updated X ago" ----
    if 'class="bn-upd"' in s:
        steps.append(("already", "news card me updated-line pehle se"))
    elif s.count(BNCARD_OLD) == 1:
        s = s.replace(BNCARD_OLD, BNCARD_NEW, 1)
        steps.append(("OK", "news card me 'updated X ago' juda"))
    else:
        steps.append(("FAIL", "bnCard ka anchor nahi mila (%d)" % s.count(BNCARD_OLD)))
        fail = True

    say("  %s" % label)
    for st, m in steps:
        say("     [%-7s] %s" % (st, m))

    if fail:
        say("     -> is file ko HAATH NAHI LAGAYA (safe abort)")
        return False
    if s == orig or DRY:
        say("     -> dry-run, file nahi badli" if DRY else "     -> kuch badla nahi")
        return True

    bak = path + BAK
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    say("     -> save ho gaya (backup: %s)" % os.path.basename(bak))
    return True


def undo():
    say("=" * 70); say("  UNDO -- backup se purana wapas"); say("=" * 70)
    n = 0
    for label, path in TARGETS:
        bak = path + BAK
        if not os.path.exists(bak):
            say("  [backup nahi]  %s" % label); continue
        shutil.copy2(bak, path); say("  [wapas aaya]   %s" % label); n += 1
    say("\n  %d file wapas purani. Browser Ctrl+F5." % n)


def main():
    if UNDO:
        undo(); return
    say("=" * 70)
    say("  DASHBOARD UI -- ROUND 2")
    say("     1. Sidebar ka lamba tab name cut nahi hoga")
    say("     2. Saara time ANGREZI me (min/hours/days ago)")
    say("     3. Har table me 'LAST UPDATED' column")
    say("     4. Breaking news card me bhi 'updated X ago'")
    if DRY:
        say("     *** DRY RUN ***")
    say("=" * 70); say()
    res = [patch_one(l, p) for l, p in TARGETS]
    say(); say("=" * 70)
    if any(r is False for r in res):
        say("  Kuch file me dikkat -- upar dekho."); say("=" * 70); sys.exit(1)
    say("  SAB HO GAYA")
    if not DRY:
        say(); say("  Server restart ki zaroorat nahi -- bas Ctrl+F5.")
        say("  Wapas purana chahiye to:  python UPDATE_DASHBOARD_UI2.py --undo")
    say("=" * 70)


if __name__ == "__main__":
    main()
