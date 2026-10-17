# -*- coding: utf-8 -*-
"""13-Oct (6): wahi galti poore dashboard me dhoondh kar theek ki.

   Jo galti Handle Analytics me thi (ginti kahin aur se aa rahi thi), uske
   do bhai aur mile. Teeno theek:

   -------------------------------------------------------------------
   1. BLOB EK BLOCK ME 'const', ISTEMAAL DOOSRE BLOCK ME
   -------------------------------------------------------------------
   Yahi CM_DATA (KPI 50 dikha raha tha) aur PROF (upar "30 Chief
   Ministers" likha reh gaya tha) ko tod chuka hai. Poora page chhan
   kar dekha -- 8 jagah aur yahi ho raha tha:

      aiStats()  (AI Assistant ko bheje jaane wale aankde)
         typeof PARTY_DATA  -> hamesha undefined  -> parties nahi gayi
         typeof DAILY_DATA  -> hamesha undefined  -> rozana ka data nahi
         typeof HASHTAGS    -> hamesha undefined  -> hashtag nahi gaye
         typeof STATE_DATA  -> hamesha undefined  -> states nahi gaye
      fillParties()  (Tracker / Export ka Party dropdown)
         typeof PARTY_DATA  -> undefined  -> dropdown KHAALI reh jaata tha
      Executive Summary ka range-wise hashtag
         typeof HTFULL      -> undefined  -> chuni hui date range ka
                                             hashtag hisaab lagta hi nahi tha

   Kuch kaam kar rahe the (UNI, D, AGG, PHD) -- sirf isliye ki unhe pehle
   se window par rakh diya gaya tha. Ab SAARE blob window par hain, to ye
   poori shreni ki galti dobara nahi ho sakti.

   -------------------------------------------------------------------
   2. PAKKI LIST SE CHHANTAI -- nayi value chup-chaap gayab
   -------------------------------------------------------------------
   Teen jagah level ki pakki list likhi thi aur usse FILTER hota tha:
        ORD / LORD / lvOrder = ['LS MP','RS MP','MLA',...,'Others']
        levels = LORD.filter(...)
   Jo level is list me nahi, wo kabhi dikhta hi nahi -- bilkul waise hi
   jaise Category ki jagah level dikhane se Top Leaders/NOB gayab the.
   Ab list sirf KRAM ke liye hai: jo isme nahi hai wo peechhe jud jaata
   hai, gayab nahi hota.

   -------------------------------------------------------------------
   3. ADMIN PANEL KA CATEGORY DROPDOWN
   -------------------------------------------------------------------
   Wo mapping se hi aata tha, par 'category' (ek) padhta tha, 'categories'
   nahi -- aur 'MLA'/'Mla' do alag option ban jaate the. Ab dono theek.
"""
import io, os, shutil

R = os.environ.get('TPLROOT', '.')

BLOBS = ['DAILY_DATA', 'HANDLES', 'PARTY_HANDLES', 'TWEETS', 'HASHTAGS',
         'MLA_DATA', 'PARTY_DATA', 'HTFULL', 'STATE_DATA', 'PHD', 'GROWTH']


def one(folder):
    P = R + '/' + folder + '/dashboard.template.html'
    s = io.open(P, encoding='utf-8').read(); n0 = len(s)
    assert 'blob-win (13-Oct)' not in s, 'ALREADY: ' + folder
    if not os.path.exists(P + '.bak_audit'): shutil.copyfile(P, P + '.bak_audit')

    # ---- 1. har blob window par ----
    done = []
    for b in BLOBS:
        a = 'const ' + b + '="__MONGO_' + b + '__";'
        if s.count(a) != 1:
            continue
        nxt = s[s.index(a) + len(a): s.index(a) + len(a) + 300]
        if ('window.' + b) in nxt:
            continue                      # pehle se hai
        s = s.replace(a, a + 'try{window.' + b + '=' + b + ';}catch(e){}')
        done.append(b)

    # nishaan + wajah (ek hi baar, pehle blob ke paas)
    if done:
        first = 'const ' + done[0] + '="__MONGO_' + done[0] + '__";'
        s = s.replace(first,
            '/* blob-win (13-Oct): ye saare blob apne-apne <script> block ke\n'
            '   ANDAR ka const hain -- window par apne aap nahi aate. Jo code\n'
            '   doosre block me "typeof PARTY_DATA" jaisa guard lagata hai,\n'
            '   usse hamesha undefined milta tha aur wo chup-chaap aadha-adhoora\n'
            '   chalta rehta tha (AI Assistant ke aankde, Tracker/Export ka\n'
            '   Party dropdown, range-wise hashtag). Isi galti se CM ka KPI 50\n'
            '   dikha raha tha aur Leader Board par "30 Chief Ministers".\n'
            '   Ab sab window par -- ye poori shreni ki galti band. */\n'
            + first, 1)

    # ---- 2. pakki list se chhantai -> sirf kram ----
    LVL_LIST = "['LS MP','RS MP','MLA','MLA Contestent','MLC','Chief Minister','Dy CM','Others']"

    a = ("const ORD=" + LVL_LIST + ";const labels=ORD.filter(k=>+LV[k]>0);")
    if s.count(a) == 1:
        s = s.replace(a, "const ORD=" + LVL_LIST + ";"
            "/* lvl-order (13-Oct): ye list ab sirf KRAM ke liye hai. Pehle isse"
            " FILTER hota tha, to jo level isme nahi likha wo chart me kabhi"
            " aata hi nahi tha (chup-chaap gayab). Ab anjaan level peechhe jud"
            " jaata hai. */"
            "const labels=ORD.filter(k=>+LV[k]>0)"
            ".concat(Object.keys(LV).filter(k=>ORD.indexOf(k)<0&&+LV[k]>0).sort());")

    a = (" var levels=LORD.filter(function(l){return lvPool.some(function(h){return h.level===l;});});")
    if s.count(a) == 1:
        s = s.replace(a,
            " /* lvl-order (13-Oct): LORD ab sirf kram batati hai -- jo level\n"
            "    usme nahi hai wo bhi dropdown me aata hai (pehle gayab tha). */\n"
            " var _lvAll=[];lvPool.forEach(function(h){if(h.level&&_lvAll.indexOf(h.level)<0)_lvAll.push(h.level);});\n"
            " var levels=LORD.filter(function(l){return _lvAll.indexOf(l)>=0;})\n"
            "   .concat(_lvAll.filter(function(l){return LORD.indexOf(l)<0;}).sort());")

    a = ("   hbar('hAvgLv',lvOrder.filter(function(l){return byLevel[l];})")
    if s.count(a) == 1:
        s = s.replace("   var lvOrder=" + LVL_LIST + ";",
            "   var lvOrder=" + LVL_LIST + ";\n"
            "   /* lvl-order (13-Oct): isme jo level nahi hai wo bhi dikhe */\n"
            "   lvOrder=lvOrder.concat(Object.keys(byLevel).filter(function(l){return lvOrder.indexOf(l)<0;}).sort());")

    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d   (window par: %s)' % (folder, n0, len(s), ', '.join(done) or 'koi nahi'))


one('DASHBOARD')
one('UP-DASHBOARD')

# ---- 3. admin panel ka Category dropdown ----
P = R + '/DASHBOARD/server.js'
s = io.open(P, encoding='utf-8').read(); n0 = len(s)
if 'admin-cat (13-Oct)' in s:
    print('server.js pehle se ho chuki')
else:
    if not os.path.exists(P + '.bak_audit'): shutil.copyfile(P, P + '.bak_audit')
    A = """      var st = String(v.state || '').trim(), pt = String(v.party || '').trim(), ct = String(v.category || '').trim();
      if (st && st !== '-') S[st] = 1;
      if (pt && pt !== '-') P[pt] = 1;
      if (ct && ct !== '-') C[ct] = 1;"""
    assert s.count(A) == 1, 'server :: admin dropdown nahi mila'
    s = s.replace(A, """      var st = String(v.state || '').trim(), pt = String(v.party || '').trim();
      if (st && st !== '-') S[st] = 1;
      if (pt && pt !== '-') P[pt] = 1;
      /* admin-cat (13-Oct): pehle sirf 'category' (ek) padhta tha. Ek handle
         ki kai Category ho sakti hain (Yogi: MLA + Top Leaders), aur
         'MLA'/'Mla' do alag option ban jaate the. Ab saari Category, aur
         spelling wahi jo baaki dashboard par hai. */
      var cs = Array.isArray(v.categories) ? v.categories
             : (v.category ? [v.category] : []);
      cs.forEach(function (c) {
        c = String(c || '').trim();
        if (!c || c === '-') return;
        C[haCatOf(h) && String(haCatOf(h)).toLowerCase() === c.toLowerCase() ? haCatOf(h) : c] = 1;
      });""")
    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED server.js    %d -> %d' % (n0, len(s)))
