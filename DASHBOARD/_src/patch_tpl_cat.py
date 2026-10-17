# -*- coding: utf-8 -*-
"""Dashboard tab ki strip ab apne aap banti hai -- Category se.

   PEHLE: 8 card markup me likhe hue the aur ek pakki list (lm) unme
   UNI.level ka number bharti thi. Mapping me nayi Category jodne par
   strip me kuch nahi hota tha.

   AB: ek khaali <div id="lvStrip"> hai. Card UNI.catStats (Category) aur
   UNI.admStats (CM / Dy CM -- ye Admin Designation se aate hain) se bante
   hain. Nayi Category mapping me aate hi naya card khud aa jaata hai;
   Category hat jaaye to card khud chala jaata hai.

   Card par:  bada number = us Category ke tweets (asli data se)
              neeche      = Mapping.xlsx me us Category ke unique handle,
                            aur unme se kitne ka data aa raha hai
"""
import io, os, shutil

R = os.environ.get('TPLROOT', '.')

OLD_MARK = '  <div class="sec-title">Total Tweets by Level / Category</div>'
NEW_MARK = ('  <!-- cat-cards (13-Oct): strip ab Category se apne aap banti hai.\n'
            '       Card ka markup JS likhta hai -- neeche wala block dekho. -->\n'
            '  <div class="sec-title">Total Tweets by Category</div>')

JS = '''<script>/* ===== cat-cards (13-Oct) : Dashboard ki strip -- Category se, apne aap
   -----------------------------------------------------------------------
   Pehle yahan 8 card markup me likhe hue the aur unme LEVEL ka number
   bharta tha. Mapping me nayi Category jodne par strip me kuch nahi hota
   tha -- code badalna padta tha.

   Ab server har baar bhejte waqt do cheezein bana deta hai:
     UNI.catStats = { 'MLA': {tw, vw, map, live}, 'LS_MP': {...}, ... }
     UNI.admStats = { 'Chief Minister': {...}, 'Dy CM': {...} }
   (map  = Mapping.xlsx me us Category ke kitne ALAG Twitter URL hain,
    live = unme se kitne ka tweet-data humare paas hai)

   Card inhi se bante hain. Nayi Category aate hi naya card, Category
   hatte hi card gaayab -- yahan kuch nahi badalna padta.

   CM aur Dy CM Category nahi hain (wo Admin Designation se aate hain),
   isliye wo admStats se aate hain -- par dikhte bilkul ek jaise hain.
   ===================================================================== */
(function () {
  'use strict';
  var W = window, D = document;

  /* jaane-pehchane naam ka dikhne wala roop aur rang. Jo yahan nahi hai
     uska naam waisa hi dikhta hai aur rang naam se hi bana liya jaata hai
     -- isi se nayi Category apne aap sambhal jaati hai. */
  var LBL = { 'LS_MP': 'LS MP', 'RS_MP': 'RS MP', 'MLA Contestent': 'MLA Contestants',
              'Media House': 'Media Houses', 'Chief Minister': 'Chief Ministers',
              'Dy CM': 'Dy. CMs', 'NOB': 'NOB' };
  var COL = { 'LS_MP': '#E65100', 'RS_MP': '#0D47A1', 'MLA': '#C62828', 'MLC': '#00838F',
              'Chief Minister': '#1B5E20', 'Dy CM': '#4A148C', 'MLA Contestent': '#795548',
              'Top Leaders': '#AD1457', 'Page': '#00695C', 'Journalist': '#5D4037',
              'Media House': '#37474F', 'NOB': '#6A1B9A', 'Others': '#607d8b' };
  /* kram: ye pehle, baaki (nayi Category) handle ki ginti se peechhe */
  var ORD = ['LS_MP', 'RS_MP', 'MLA', 'MLC', 'Chief Minister', 'Dy CM',
             'MLA Contestent', 'Top Leaders', 'NOB', 'Page', 'Media House', 'Journalist'];

  function col(k) {
    if (COL[k]) return COL[k];
    /* naam se hi ek pakka rang -- har baar wahi rang milta hai */
    var n = 0, i;
    for (i = 0; i < k.length; i++) n = (n * 31 + k.charCodeAt(i)) >>> 0;
    var H = ['#E65100', '#0D47A1', '#C62828', '#00838F', '#1B5E20', '#4A148C',
             '#795548', '#AD1457', '#00695C', '#5D4037', '#37474F', '#6A1B9A'];
    return H[n % H.length];
  }
  function N(x) { return (+x || 0).toLocaleString('en-IN'); }

  W.renderCatStrip = function () {
    var box = D.getElementById('lvStrip');
    if (!box) return;
    var U = W.UNI;
    if (!U || typeof U !== 'object') return;
    var cs = U.catStats || {}, as = U.admStats || {};
    var all = {};
    Object.keys(cs).forEach(function (k) { all[k] = cs[k]; });
    Object.keys(as).forEach(function (k) { all[k] = as[k]; });
    var keys = Object.keys(all).filter(function (k) {
      var o = all[k] || {};
      return (+o.map || 0) > 0 || (+o.live || 0) > 0;
    });
    if (!keys.length) return;     /* purana server -> strip chhod do */
    keys.sort(function (a, b) {
      var ia = ORD.indexOf(a), ib = ORD.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return (+all[b].map || 0) - (+all[a].map || 0);
    });
    box.style.gridTemplateColumns = 'repeat(' + Math.min(keys.length, 8) + ',1fr)';
    box.innerHTML = keys.map(function (k) {
      var o = all[k] || {}, lbl = LBL[k] || k;
      /* "3,794 handles" = Mapping.xlsx me is Category ke unique Twitter URL.
         Brackets me wo ginti jinke tweets sach me aa rahe hain. */
      var sub = N(o.map) + ' handles'
              + ((+o.live || 0) !== (+o.map || 0) ? ' \\u00b7 ' + N(o.live) + ' par data' : '');
      return '<div class="lv-card" style="--lc:' + col(k) + '" data-cat="' + String(k).replace(/"/g, '&quot;') + '">'
           + '<div class="lv-val">' + N(o.tw) + '</div>'
           + '<div class="lv-lbl">' + String(lbl).replace(/</g, '&lt;') + '</div>'
           + '<div class="lv-sub">' + sub + '</div></div>';
    }).join('');
  };

  function boot() { try { W.renderCatStrip(); } catch (e) {} }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 600); setTimeout(boot, 1800);
})();
</script>
'''


def one(folder):
    P = R + '/' + folder + '/dashboard.template.html'
    s = io.open(P, encoding='utf-8').read(); n0 = len(s)
    assert 'cat-cards (13-Oct)' not in s, 'ALREADY: ' + folder
    if not os.path.exists(P + '.bak_catcards'): shutil.copyfile(P, P + '.bak_catcards')

    # 1. purani strip ka markup -> ek khaali dabba
    i = s.index(OLD_MARK)
    j = s.index('</div>\n  <div class="sec-title">Overview', i)
    old = s[i:j]
    assert 'id="lvLSMP"' in old and 'id="lvOthers"' in old, folder + ' :: purani strip nahi mili'
    s = s[:i] + NEW_MARK + '\n  <div class="level-strip" id="lvStrip">' + s[j:]

    # 2. hMore ka purana level wala hisaab hata do
    a = ("  var lm={'LS MP':['lvLSMP','lvLSMPh'],'RS MP':['lvRSMP','lvRSMPh'],"
         "'MLA':['lvMLA','lvMLAh'],'MLC':['lvMLC','lvMLCh'],"
         "'Chief Minister':['lvCM','lvCMh'],'Dy CM':['lvDyCM','lvDyCMh'],"
         "'MLA Contestent':['lvCont','lvConth'],'Others':['lvOthers','lvOthersh']};\n"
         "  Object.keys(lm).forEach(function(k){var e1=document.getElementById(lm[k][0]);"
         "if(e1)e1.textContent=L(lvl[k]||0);var e2=document.getElementById(lm[k][1]);"
         "if(e2)e2.textContent=L(cnt[k]||0);});}catch(e){}")
    assert s.count(a) == 1, folder + ' :: hMore ka purana block nahi mila'
    s = s.replace(a, "  /* cat-cards (13-Oct): ye card ab yahan se nahi bharte -- strip\n"
                     "     Category se apne aap banti hai (neeche renderCatStrip). */\n"
                     "  if(window.renderCatStrip)window.renderCatStrip();}catch(e){}")

    # 3. naya block
    k = s.rfind('</body>')
    s = s[:k] + JS + s[k:]
    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d' % (folder, n0, len(s)))


one('DASHBOARD')
one('UP-DASHBOARD')
