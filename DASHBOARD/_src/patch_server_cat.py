# -*- coding: utf-8 -*-
"""server.js: KPI strip ab CATEGORY se banegi, apne aap.

   PEHLE: Dashboard tab ki strip me 8 pakke card the (LS MP, RS MP, MLA, MLC,
   Chief Ministers, Dy. CMs, MLA Contestants, Others) aur unke number
   UNI.level se aate the -- yaani LEVEL se. Mapping me nayi Category jodne
   par strip me kuch nahi hota tha; code badalna padta tha.

   AB: server bhejte waqt UNI.catStats bana deta hai --
       { 'MLA': { tw, vw, map, live }, 'LS_MP': {...}, ... }
         tw / vw : us Category ke handle ke tweets / views (ASLI data se)
         map     : Mapping.xlsx me us Category ke KITNE ALAG Twitter URL hain
         live    : unme se kitne handle ka data humare paas hai
   Card isi se bante hain. Mapping me nayi Category aate hi naya card khud
   aa jaata hai, Category hat jaaye to card khud chala jaata hai.

   CM aur Dy CM Category nahi hain -- wo Admin Designation se aate hain.
   Unke do card UNI.admStats se banते hain, usi dhaanche me.

   Har handle par uski Category bhi chipka di jaati hai (r.cat) -- isse
   aage filter/chart banane me aasani rahegi.
"""
import io, os, shutil, sys

P = sys.argv[1] if len(sys.argv) > 1 else 'server.js'
s = io.open(P, encoding='utf-8').read()
assert 'cat-cards (13-Oct)' not in s, 'ALREADY'
if not os.path.exists(P + '.bak_catcards'):
    shutil.copyfile(P, P + '.bak_catcards')
n0 = len(s)

# ---- 1. mapping se category bhi uthao ----
A = """      var ls = rec.levels;
      if (!Array.isArray(ls) || !ls.length) return;"""
assert s.count(A) == 1
s = s.replace(A, """      /* cat-cards (13-Oct): har handle ki SAARI Category yaad rakho.
         Ek aadmi do Category me ho sakta hai (Yogi: MLA + Top Leaders),
         isliye list. Alias entry (wahi handle, doosre case me) ko ginti
         me nahi lete -- warna ek hi aadmi do baar gin jaata. */
      if (!rec.alias_of) {
        var _cs = Array.isArray(rec.categories) ? rec.categories.slice()
                : (_real(rec.category) ? [_real(rec.category)] : []);
        _cs = _cs.map(function (c) { return _real(c); }).filter(Boolean);
        if (_cs.length) _ct[low] = _cs;
      }

      var ls = rec.levels;
      if (!Array.isArray(ls) || !ls.length) return;""")

A = "    function _fix(a, key) {"
assert s.count(A) == 1
s = s.replace(A, "    function _fix(a, key) {")
A = "      var seat = _real(rec.pc_name) || _real(rec.ac_name) || _real(rec.ac_pc_name);"
assert s.count(A) == 1
s = s.replace(A, "      var seat = _real(rec.pc_name) || _real(rec.ac_name) || _real(rec.ac_pc_name);")

# _ct ka elaan -- _me/_lv ke saath
A = "    Object.keys(_mm).forEach(function (k) {\n      var rec = _mm[k] || {};\n      var low = String(k).toLowerCase();"
assert s.count(A) == 1
s = s.replace(A, "    var _ct = Object.create(null);     /* cat-cards (13-Oct) */\n" + A)

# ---- 2. har row par category chipka do ----
A = """        if (m.seat) {
          if (r.loc !== undefined && !_real(r.loc)) r.loc = m.seat;
          if (r.pcName !== undefined && !_real(r.pcName)) r.pcName = m.seat;
        }
      });
    }"""
assert s.count(A) == 1
s = s.replace(A, """        if (m.seat) {
          if (r.loc !== undefined && !_real(r.loc)) r.loc = m.seat;
          if (r.pcName !== undefined && !_real(r.pcName)) r.pcName = m.seat;
        }
      });
    }
    /* cat-cards (13-Oct): handle par uski Category bhi -- card, filter aur
       chart sab isi se ban sakte hain, bina mapping dobara padhe. */
    function _fixCat(a, key) {
      if (!Array.isArray(a)) return;
      a.forEach(function (r) {
        if (!r) return;
        var h = String(r[key] || r.h || '').trim().replace(/^@/, '').toLowerCase();
        var c = h && _ct[h];
        if (c && c.length) { r.cats = c.slice(); r.cat = c[0]; }
      });
    }""")

A = """    if (map.UNI) _fix(map.UNI.allHandles, 'h');
    _fix(map.HANDLES, 'h'); _fix(map.MLA_DATA, 'h'); _fix(map.PARTY_HANDLES, 'h');"""
assert s.count(A) == 1
s = s.replace(A, A + """
    if (map.UNI) _fixCat(map.UNI.allHandles, 'h');""")

# ---- 3. catStats / admStats ----
A = """    if (map.UNI && Array.isArray(map.UNI.allHandles)) {
      var _sum = {};
      map.UNI.allHandles.forEach(function (r) {
        var k = r.level || 'Others';
        _sum[k] = (_sum[k] || 0) + ((+r.tw) || 0);
      });
      map.UNI.level = _sum;
    }"""
assert s.count(A) == 1
s = s.replace(A, A + """

    /* ===== cat-cards (13-Oct): Dashboard ki strip ka saara hisaab =====
       map  : Mapping.xlsx me us Category ke kitne ALAG Twitter URL hain
              (jiska URL hai bas wahi -- handle_master me wahi aata hai)
       live : unme se kitne handle ka tweet-data humare paas hai
       tw/vw: unhi handle ke tweets / views
       Ginti mapping se hai, isliye kisi ka ek bhi tweet na ho tab bhi
       card sach bolta hai. */
    if (map.UNI && Array.isArray(map.UNI.allHandles)) {
      var _cs = Object.create(null);
      function _row(o, k) {
        if (!o[k]) o[k] = { tw: 0, vw: 0, map: 0, live: 0 };
        return o[k];
      }
      Object.keys(_ct).forEach(function (low) {
        _ct[low].forEach(function (c) { _row(_cs, c).map++; });
      });
      map.UNI.allHandles.forEach(function (r) {
        var cs = (r && r.cats) || [];
        cs.forEach(function (c) {
          var o = _row(_cs, c);
          o.live++; o.tw += (+r.tw) || 0; o.vw += (+r.vw) || 0;
        });
      });
      map.UNI.catStats = _cs;

      /* CM / Dy CM Category nahi hain -- Admin Designation se aate hain.
         Unka hisaab alag, par dhaancha wahi. */
      var _as = Object.create(null);
      Object.keys(_mm).forEach(function (k) {
        var rec = _mm[k] || {};
        if (rec.alias_of) return;
        var ls = rec.levels || [];
        if (ls.indexOf('CM') >= 0) _row(_as, 'Chief Minister').map++;
        if (ls.indexOf('Dy CM') >= 0) _row(_as, 'Dy CM').map++;
      });
      map.UNI.allHandles.forEach(function (r) {
        var L = r && r.level;
        var k = (L === 'Chief Minister' || L === 'CM') ? 'Chief Minister'
              : (L === 'Dy CM' || L === 'Deputy Chief Minister') ? 'Dy CM' : '';
        if (!k) return;
        var o = _row(_as, k);
        o.live++; o.tw += (+r.tw) || 0; o.vw += (+r.vw) || 0;
      });
      map.UNI.admStats = _as;
      console.log('  cat-cards: ' + Object.keys(_cs).length + ' category'
        + ' (' + Object.keys(_cs).sort(function (a, b) { return _cs[b].map - _cs[a].map; })
            .slice(0, 4).map(function (c) { return c + ':' + _cs[c].map; }).join(', ') + ')');
    }""")

# ---- BUILD stamp ----
import re
m = re.search(r"var BUILD = '([^']+)';", s)
assert m, 'BUILD nahi mila'
s = s.replace(m.group(0), "var BUILD = '2026-10-13a cat-cards + nayi mapping';")

io.open(P, 'w', encoding='utf-8').write(s)
print('PATCHED %s  %d -> %d' % (P, n0, len(s)))
