# -*- coding: utf-8 -*-
"""13-Oct (3): "poora dashboard mapping se" + strip me Others ka section.

   PAANCH KAAM:

   1. STRIP DO HISSON ME
      Upar sirf chune hue pad: LS MP, RS MP, MLA, MLC, Chief Ministers,
      Dy. CMs, MLA Contestants.
      Neeche "Others" ka apna section: Top Leaders, NOB, Page, Media
      Houses, Journalist -- aur aage mapping me koi nayi Category aaye to
      wo bhi apne aap yahin aayegi (upar wali list pakki hai, baaki sab
      Others me).

   2. CM_DATA par bhi mapping chipakti hai
      _fix() HANDLES / MLA_DATA / PARTY_HANDLES / allHandles par chalti
      thi -- CM_DATA chhoot gayi thi. Isi wajah se States & CM table me
      state/party/naam purane blob se aa rahe the.

   3. MAPPING HI SACH -- naam aur seat par bhi
      Pehle naam aur seat tabhi badalte the jab blob me khaali hon
      ("!_real(r.name)"). Yaani Excel me naam sudhaarne par bhi purana
      naam dikhta rehta. Ab mapping ki value hamesha jeetti hai (khaali
      ho to kuch nahi badalta).

   4. States & CM table ka Designation aur AC/PC bhi mapping se
      Designation 'c.level' se banta tha ("Chief Minister"/"Deputy Chief
      Minister") aur AC/PC ka naam ek chhoti local list AC_MAP se.
      Ab dono mapping se: roleOf() aur mapping ki seat.
      Leader Board ka badge bhi -- wahan to 'PM'/'CM' likha hua tha.

   5. Designation wrap
      Dono designation (party aur admin) ek saath aa sakte hain --
      "Deputy Chief Minister / Minister of State" -- isliye har jagah
      wrap hona chahiye. .cm-badge aur Leader Board ke chip bache the.
"""
import io, os, shutil, sys

R = os.environ.get('TPLROOT', '.')

# ============================ server.js ============================
P = R + '/DASHBOARD/server.js'
s = io.open(P, encoding='utf-8').read(); n0 = len(s)
SKIP_SRV = 'allmap (13-Oct)' in s
if not os.path.exists(P + '.bak_allmap'): shutil.copyfile(P, P + '.bak_allmap')

# 3. mapping hamesha jeette (naam + seat)
A = """        if (m.name && r.name !== undefined && !_real(r.name)) r.name = m.name;
        /* seat ka naam har blob me alag hai: allHandles me 'loc',
           HANDLES/MLA_DATA me 'pcName' */
        if (m.seat) {
          if (r.loc !== undefined && !_real(r.loc)) r.loc = m.seat;
          if (r.pcName !== undefined && !_real(r.pcName)) r.pcName = m.seat;
        }"""
assert SKIP_SRV or s.count(A) == 1, 'server :: _fix ka naam/seat wala hissa nahi mila'
s = s.replace(A, """        /* allmap (13-Oct): pehle naam aur seat SIRF tab badalte the jab blob
           me khaali hon. Matlab Excel me naam sudhaarne par bhi dashboard
           purana naam dikhata rehta tha. Ab mapping hi sach hai -- uski
           value hamesha jeetti hai. (Mapping me khaali ho to kuch nahi
           badalta, _real() wahi dekhti hai.) */
        if (m.name && r.name !== undefined) r.name = m.name;
        /* seat ka naam har blob me alag hai: allHandles me 'loc',
           HANDLES/MLA_DATA me 'pcName', CM_DATA me kuch bhi nahi tha */
        if (m.seat) {
          if (r.loc !== undefined) r.loc = m.seat;
          if (r.pcName !== undefined) r.pcName = m.seat;
          r.seat = m.seat;
        }""")

# 2. CM_DATA par bhi overlay
A = """    if (map.UNI) _fix(map.UNI.allHandles, 'h');
    _fix(map.HANDLES, 'h'); _fix(map.MLA_DATA, 'h'); _fix(map.PARTY_HANDLES, 'h');"""
assert SKIP_SRV or s.count(A) == 1
s = s.replace(A, """    if (map.UNI) _fix(map.UNI.allHandles, 'h');
    _fix(map.HANDLES, 'h'); _fix(map.MLA_DATA, 'h'); _fix(map.PARTY_HANDLES, 'h');
    /* allmap (13-Oct): CM_DATA chhoot gayi thi -- isi wajah se States & CM
       table me state/party/naam purane blob se aa rahe the. */
    _fix(map.CM_DATA, 'handle');""")

# CM_DATA push me seat bhi
A = """          state: rec.state || (u && u.state) || '-',
          name: rec.name || (u && u.name) || k,
          party: rec.party || (u && u.party) || '-',"""
assert SKIP_SRV or s.count(A) == 1
s = s.replace(A, """          state: rec.state || (u && u.state) || '-',
          name: rec.name || (u && u.name) || k,
          party: rec.party || (u && u.party) || '-',
          /* allmap (13-Oct): seat ka naam bhi -- table ka "PC / AC Name"
             column isi se bharta hai (pehle ek chhoti local list se bharta
             tha jisme zyadatar naam the hi nahi). */
          seat: _real(rec.pc_name) || _real(rec.ac_name) || _real(rec.ac_pc_name) || '',""")

if SKIP_SRV:
    print('server.js pehle se ho chuki -- chhoda')
else:
    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED server.js    %d -> %d' % (n0, len(s)))


# ============================ template ============================
STRIP_JS_OLD_START = "  /* kram: ye pehle, baaki (nayi Category) handle ki ginti se peechhe */\n  var ORD = ['LS_MP', 'RS_MP', 'MLA', 'MLC', 'Chief Minister', 'Dy CM',\n             'MLA Contestent', 'Top Leaders', 'NOB', 'Page', 'Media House', 'Journalist'];"
STRIP_JS_NEW = """  /* MAIN = upar wali strip. Ye saat pakke hain aur isi kram me aate hain.
     Baaki SAB -- Top Leaders, NOB, Page, Media Houses, Journalist, aur
     aage mapping me koi bhi nayi Category -- neeche "Others" wale apne
     section me chale jaate hain. */
  var MAIN = ['LS_MP', 'RS_MP', 'MLA', 'MLC', 'Chief Minister', 'Dy CM', 'MLA Contestent'];
  var ORD = MAIN.slice();"""

RENDER_OLD = """    box.style.gridTemplateColumns = 'repeat(' + Math.min(keys.length, 8) + ',1fr)';
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
  };"""
RENDER_NEW = """    function card(k) {
      var o = all[k] || {}, lbl = LBL[k] || k;
      /* "3,789 handles" = Mapping.xlsx me is Category ke unique Twitter URL.
         Uske aage wo ginti jinke tweets sach me aa rahe hain. */
      var sub = N(o.map) + ' handles'
              + ((+o.live || 0) !== (+o.map || 0) ? ' \\u00b7 ' + N(o.live) + ' par data' : '');
      return '<div class="lv-card" style="--lc:' + col(k) + '" data-cat="' + String(k).replace(/"/g, '&quot;') + '">'
           + '<div class="lv-val">' + N(o.tw) + '</div>'
           + '<div class="lv-lbl">' + String(lbl).replace(/</g, '&lt;') + '</div>'
           + '<div class="lv-sub">' + sub + '</div></div>';
    }
    function fill(el, ks) {
      if (!el) return;
      el.style.gridTemplateColumns = 'repeat(' + Math.min(Math.max(ks.length, 1), 7) + ',1fr)';
      el.innerHTML = ks.map(card).join('');
    }
    var main = keys.filter(function (k) { return MAIN.indexOf(k) >= 0; });
    var rest = keys.filter(function (k) { return MAIN.indexOf(k) < 0; });
    fill(box, main);
    /* Others ka section -- card hon tabhi dikhta hai */
    var ob = D.getElementById('lvOtherStrip'), ow = D.getElementById('lvOtherWrap');
    fill(ob, rest);
    if (ow) ow.style.display = rest.length ? '' : 'none';
  };"""


def one(folder):
    P = R + '/' + folder + '/dashboard.template.html'
    s = io.open(P, encoding='utf-8').read(); n0 = len(s)
    assert 'allmap (13-Oct)' not in s, 'ALREADY: ' + folder
    if not os.path.exists(P + '.bak_allmap'): shutil.copyfile(P, P + '.bak_allmap')

    # ---- 1. strip: Others ka section ----
    a = '  <div class="level-strip" id="lvStrip">'
    assert s.count(a) == 1, folder + ' :: lvStrip nahi mila'
    s = s.replace(a, a + '</div>\n'
                  '  <!-- allmap (13-Oct): Top Leaders / NOB / Page / Media Houses /\n'
                  '       Journalist upar ki strip se hata kar yahan. Aage mapping me\n'
                  '       koi nayi Category aaye to wo bhi apne aap yahin aayegi. -->\n'
                  '  <div id="lvOtherWrap" style="display:none">\n'
                  '    <div class="sec-title">Others</div>\n'
                  '    <div class="level-strip" id="lvOtherStrip">')
    assert s.count(STRIP_JS_OLD_START) == 1, folder + ' :: ORD nahi mila'
    s = s.replace(STRIP_JS_OLD_START, STRIP_JS_NEW)
    assert s.count(RENDER_OLD) == 1, folder + ' :: render block nahi mila'
    s = s.replace(RENDER_OLD, RENDER_NEW)

    # ---- 4. States & CM table: designation + AC/PC mapping se ----
    a = ("  const desig=c.level==='Chief Minister'?'Chief Minister':"
         "c.level==='Deputy Chief Minister'?'Deputy Chief Minister':c.level;")
    assert s.count(a) == 1, folder + ' :: rowHTMLState ka desig nahi mila'
    s = s.replace(a, "  /* allmap (13-Oct): designation ab MAPPING se. Pehle yahan sirf\n"
                     "     'Chief Minister' / 'Deputy Chief Minister' likha jaata tha, to\n"
                     "     'Chief Minister / MLA' jaisa poora pad kabhi dikhta hi nahi tha. */\n"
                     "  const desig=(window.roleOf?window.roleOf(c.handle,c.level):'')||c.level;")
    # DHYAN: ye do jagah hai -- mainTable aur map se khuli state wali table.
    # Dono me seat ka naam mapping se aana chahiye.
    a = 'td-ac">${ac}'
    assert s.count(a) == 2, folder + ' :: td-ac (2 jagah) nahi mila -- mila ' + str(s.count(a))
    s = s.replace(a, 'td-ac">${c.seat||ac}')

    # mainTable wali jagah par bhi (rowHTML)
    a = "AC_MAP[c.name]||'—'"
    if s.count(a) == 1:
        s = s.replace(a, "c.seat||AC_MAP[c.name]||'—'")
    a = "(typeof AC_MAP!=='undefined'&&AC_MAP[c.name])||'—'"
    assert s.count(a) == 1, folder + ' :: AC_MAP fallback nahi mila'
    s = s.replace(a, "c.seat||(typeof AC_MAP!=='undefined'&&AC_MAP[c.name])||'—'")

    # ---- Leader Board ka badge bhi mapping se ----
    a = "var dz=(s.h==='narendramodi')?'PM':'CM';"
    assert s.count(a) == 1, folder + ' :: PROF ka dz nahi mila'
    s = s.replace(a, "/* allmap (13-Oct): yahan 'PM'/'CM' likha hua tha -- ab mapping se */\n"
                     "var dz=(window.roleOf?window.roleOf(s.h,''):'')||((s.h==='narendramodi')?'PM':'CM');")

    # ---- 5. designation chip har jagah wrap ----
    a = ('.cm-badge{font-size:9px;padding:2px 6px;border-radius:8px;font-weight:700;'
         'background:#f4f4f4;color:#555;margin-top:3px;display:inline-block}')
    assert s.count(a) == 1, folder + ' :: cm-badge CSS nahi mila'
    s = s.replace(a, a[:-1] + ';white-space:normal;word-break:break-word;max-width:150px;line-height:1.35}'
                  '\n/* allmap (13-Oct): dono designation (party + admin) ek saath aa sakte\n'
                  '   hain -- "Deputy Chief Minister / Minister of State" -- isliye har\n'
                  '   designation chip wrap hota hai, kahin bhi ek line me nahi khinchta. */\n'
                  '.cm-badge,.td-desig{white-space:normal !important;word-break:break-word}')

    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d' % (folder, n0, len(s)))


one('DASHBOARD')
one('UP-DASHBOARD')
