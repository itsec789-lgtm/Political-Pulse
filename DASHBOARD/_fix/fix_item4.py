# -*- coding: utf-8 -*-
"""Fix.md item 4 -- Top Leaders:
     a) Location filter: All-India par State, UP par District
     b) Default sort = Avg Views/Post (zyada se kam)
     c) Heading usi sort ka naam bole (titleFix pehle se karta hai)
     d) Reset -> filter saaf + sort wapas default

   Dono template me JS byte-ke-byte ek jaisa rehta hai. Farak sirf markup
   me hai: select par data-field="state" (All-India) ya "loc" (UP), aur
   label/“All ...” ka text.
"""
import io, os, shutil

R = os.environ['HOME'] + '/mnt/Main Twitter Project'
FILES = [('DASHBOARD', 'state', 'State', 'All States/UTs'),
         ('UP-DASHBOARD', 'loc', 'District', 'All Districts')]

JS = '''<script>/* ===== tl-loc (12-Oct) : Top Leaders ka location filter + naya default sort
   -----------------------------------------------------------------------
   1. Party ke baad ek aur dropdown -- All-India par State, UP par District.
      Kaun sa field padhna hai, wo markup me select par data-field se aata
      hai (state / loc), isliye dono template ka JS bilkul ek jaisa hai.
      Ye Party aur Quick ke SAATH chalta hai -- teeno ek saath lagte hain.
   2. Default sort ab "Avg Views/Post" hai (pehle Total Views tha).
      User ne khud koi sort chuna ho to wahi chalta rahega (localStorage).
   3. Reset -> location saaf + sort wapas default.
   ===================================================================== */
(function () {
  'use strict';
  var W = window;
  function el(id) { return document.getElementById(id); }
  function fieldOf() {
    var s = el('tlState');
    return (s && s.getAttribute('data-field')) || 'state';
  }
  var JUNK = { '': 1, '-': 1, '\\u2014': 1, 'Unknown': 1, 'None': 1, 'nan': 1,
               'Uttar Pradesh': 0 };   /* UP me "Uttar Pradesh" loc bekaar hai, neeche hata dete hain */

  /* dropdown ek hi baar bharte hain -- data se, kisi fixed list se nahi */
  W.tlLocFill = function () {
    var sel = el('tlState');
    if (!sel || sel.options.length > 1) return;
    var f = fieldOf(), pool = [];
    try { pool = (typeof leaderPool === 'function') ? leaderPool() : (W.UNI && W.UNI.allHandles) || []; }
    catch (e) { pool = (W.UNI && W.UNI.allHandles) || []; }
    var seen = {};
    pool.forEach(function (h) {
      var v = String((h && h[f]) || '').trim();
      if (!v || JUNK[v] === 1) return;
      if (f === 'loc' && v === 'Uttar Pradesh') return;   /* poore state ka naam district nahi hai */
      seen[v] = 1;
    });
    Object.keys(seen).sort().forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  };

  /* renderLeaders ke upar ek parat -- usme haath lagaye bina location
     filter lag jaata hai. (Ek hi baar lipta jaata hai.) */
  function wrap() {
    if (W._tlLocWrapped || typeof W.renderLeaders !== 'function') return;
    W._tlLocWrapped = 1;
    var orig = W.renderLeaders;
    W.renderLeaders = function () {
      try { W.tlLocFill(); } catch (e) {}
      var sel = el('tlState'), v = (sel && sel.value) || '';
      if (!v) return orig.apply(this, arguments);
      var f = fieldOf(), realPool = W.leaderPool;
      try {
        /* sirf is ek call ke liye pool ko chhaan dete hain -- isse date,
           party aur sort ka saara purana hisaab waise ka waisa chalta hai */
        W.leaderPool = function () {
          return realPool().filter(function (h) { return String((h && h[f]) || '').trim() === v; });
        };
        return orig.apply(this, arguments);
      } finally { W.leaderPool = realPool; }
    };
  }

  /* Reset: location saaf + sort wapas default */
  function wrapReset() {
    if (W._tlResetWrapped || typeof W.tlReset !== 'function') return;
    W._tlResetWrapped = 1;
    var orig = W.tlReset;
    W.tlReset = function () {
      var s = el('tlState'); if (s) s.value = '';
      try { W.tlSortReset && W.tlSortReset(); } catch (e) {}
      return orig.apply(this, arguments);
    };
  }

  function boot() {
    wrap(); wrapReset();
    try { W.tlLocFill(); } catch (e) {}
    var s = el('tlState');
    if (s && !s._tlBound) { s._tlBound = 1; s.addEventListener('change', function () { W.renderLeaders(); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 600);     /* renderLeaders baad me bhi ban sakta hai */
  setTimeout(boot, 1800);
})();
</script>
'''


def one(folder, field, label, allLbl):
    p = R + '/' + folder + '/dashboard.template.html'
    s = io.open(p, encoding='utf-8').read()
    assert 'tl-loc (12-Oct)' not in s, 'ALREADY: ' + folder
    n0 = len(s)
    if not os.path.exists(p + '.bak_before_fixmd'):
        shutil.copyfile(p, p + '.bak_before_fixmd')

    # --- markup: Party ke baad naya dropdown ---
    a = ('<select id="tlParty" class="filter-select" onchange="renderLeaders()" '
         'style="min-width:120px"><option value="">All Parties</option></select>')
    assert s.count(a) == 1, folder + ' :: tlParty select nahi mila'
    s = s.replace(a, a + '\n    <span class="filter-label">' + label + '</span>\n'
                  '    <select id="tlState" class="filter-select" data-field="' + field + '"\n'
                  '            onchange="renderLeaders()" style="min-width:160px">'
                  '<option value="">' + allLbl + '</option></select>')

    # --- default sort: vw -> avgv ---
    b = "window.tlSortKey=window.tlSortKey||'vw';"
    assert s.count(b) == 1, folder + ' :: tlSortKey default nahi mila'
    s = s.replace(b, "/* tl-loc (12-Oct): default ab Avg Views/Post. User ka apna chunav\n"
                     "     localStorage se neeche boot() me wapas aa jaata hai. */\n"
                     "  window.tlSortKey=window.tlSortKey||'avgv';")

    c = "function lbl(k){for(var i=0;i<OPTS.length;i++)if(OPTS[i][0]===k)return OPTS[i][1];return 'Total Views';}"
    assert s.count(c) == 1, folder + ' :: lbl() nahi mila'
    s = s.replace(c, "function lbl(k){for(var i=0;i<OPTS.length;i++)if(OPTS[i][0]===k)return OPTS[i][1];return 'Avg Views/Post';}")

    # --- button ka pehla label ---
    d = 'tlSortLbl">Total Views</b>'
    assert s.count(d) == 1, folder + ' :: tlSortLbl nahi mila'
    s = s.replace(d, 'tlSortLbl">Avg Views/Post</b>')

    # --- sort ko default par laane ka raasta (Reset ke liye) ---
    e = "  window.tlTitleFix=titleFix;"
    assert s.count(e) == 1, folder + ' :: tlTitleFix nahi mila'
    s = s.replace(e, "  window.tlTitleFix=titleFix;\n"
                     "  /* tl-loc (12-Oct): Reset isi se sort wapas default par laata hai */\n"
                     "  window.tlSortReset=function(){window.tlSortKey='avgv';\n"
                     "    try{localStorage.removeItem('ipp_tlsort');}catch(e){}\n"
                     "    paint();titleFix();};")

    # --- naya script block, </body> se pehle ---
    i = s.rfind('</body>')
    assert i > 0
    s = s[:i] + JS + s[i:]

    io.open(p, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d  (+%d)  [%s / %s]' % (folder, n0, len(s), len(s) - n0, label, field))


for f, fl, lb, al in FILES:
    one(f, fl, lb, al)
print('done')
