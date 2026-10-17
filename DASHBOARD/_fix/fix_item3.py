# -*- coding: utf-8 -*-
"""Fix.md item 3 (+ item 5 ka ek hissa) -- Elected Representatives / Legislators Tracker

   DIKKAT JO THI:
     Table ka data poora tha (MLA_POOL = saare 3,289 handle) aur State
     filter bhi juda hua tha. Par sort ye tha --
         .sort(... localeCompare(a.state, b.state) ... )   // state A->Z
     -- aur page size 40. Isliye PAGE 1 hamesha Andhra Pradesh (pehla
     state) se hi bharta tha. Dekhne me lagta tha "sirf AP ka data hai".

     Doosri baat: upar jo "Showing 40 of 40 rows" likha aata tha, wo
     column-filter ki patti thi, jo sirf DOM me padi 40 rows ginti hai.
     Pager pehle se sach bolta hai: "Showing 1-40 of 3,289 legislators".

   AB:
     1. Default sort = Total Views (zyada se kam). Page 1 par poore desh
        ke sabse bade handle, har state mila-jula.
     2. col-filter ki jhooth bolne wali patti is table se hata di --
        pager ka sach wala count rehta hai. (Is table ke apne 5 filter
        pehle se hain: search, party, level, state, date.)
     3. All-India: "All States" -> "All States/UTs"
        UP        : State ki jagah DISTRICT ka filter (r.loc se)
"""
import io, os, shutil

R = os.environ['HOME'] + '/mnt/Main Twitter Project'

OLD_SORT = ("if(window._applyDate){all=all.map(function(r){return window._applyDate(r,_mf,_mt);})"
            ".sort(function(a,b){var ba=(function(x){x=String(x||'').trim();return(!x||x==='—')?1:0;});"
            "var xa=ba(a.state),xb=ba(b.state);if(xa!==xb)return xa-xb;"
            "var s=String(a.state||'').localeCompare(String(b.state||''));if(s)return s;"
            "return (b.vw||0)-(a.vw||0);});}")

NEW_SORT = ("if(window._applyDate){all=all.map(function(r){return window._applyDate(r,_mf,_mt);})"
            "/* fix-md (12-Oct): pehle yahan state ke NAAM se A->Z sort hota tha,\n"
            "     aur page size 40 hai -- isliye page 1 hamesha Andhra Pradesh se\n"
            "     bhar jaata tha aur lagta tha ki data hi sirf AP ka hai. Ab Total\n"
            "     Views se (zyada se kam), taaki pehle page par poore desh ke bade\n"
            "     handle aayein. State se dekhna ho to State filter maujood hai. */"
            ".sort(function(a,b){return (b.vw||0)-(a.vw||0);});}")


def one(folder, field, all_lbl):
    p = R + '/' + folder + '/dashboard.template.html'
    s = io.open(p, encoding='utf-8').read()
    assert 'fix-md (12-Oct)' not in s, 'ALREADY: ' + folder
    n0 = len(s)
    if not os.path.exists(p + '.bak_before_fixmd'):
        shutil.copyfile(p, p + '.bak_before_fixmd')

    # ---- 1. sort ----
    assert s.count(OLD_SORT) == 1, folder + ' :: purana sort nahi mila'
    s = s.replace(OLD_SORT, NEW_SORT)

    # ---- 2. col-filter ki patti is table par nahi ----
    a = "SKIP_TB = ['hrqManBody', 'haTwBody']"
    assert s.count(a) == 1, folder + ' :: SKIP_TB nahi mila'
    s = s.replace(a, "SKIP_TB = ['hrqManBody', 'haTwBody',\n"
                     "    /* fix-md (12-Oct): is table ka apna pager sach bolta hai\n"
                     "       (\"Showing 1-40 of 3,289\"). col-filter ki patti sirf is\n"
                     "       PAGE ki 40 rows ginti thi -> \"Showing 40 of 40 rows\",\n"
                     "       jo galat lagta tha. Yahan uski zaroorat bhi nahi: search,\n"
                     "       party, level, state/district aur date -- paanch filter\n"
                     "       pehle se hain. */\n"
                     "    'mlaBody']")

    # ---- 3. location filter ka field + label ----
    b = ("function dist(field,skip){var set={};MLA_POOL.forEach(function(r){"
         "if(skip!=='party'&&pf&&r.party!==pf)return;"
         "if(skip!=='state'&&sf&&sf!=='ALL'&&r.state!==sf)return;")
    assert s.count(b) == 1, folder + ' :: dist() nahi mila'
    s = s.replace(b, "/* fix-md (12-Oct): MLA_LOCF -- All-India par 'state', UP par 'loc'\n"
                     "     (UP me har handle ka state 'Uttar Pradesh' hi hai, isliye\n"
                     "     wahan District hi kaam ka filter hai). */\n"
                     "  var MLA_LOCF='" + field + "';\n"
                     "  function dist(field,skip){var set={};MLA_POOL.forEach(function(r){"
                     "if(skip!=='party'&&pf&&r.party!==pf)return;"
                     "if(skip!=='state'&&sf&&sf!=='ALL'&&r[MLA_LOCF]!==sf)return;")

    c = "_rebuildSel('mlaStateFilter','All States',dist('state','state'),sf);"
    assert s.count(c) == 1, folder + ' :: _rebuildSel(mlaStateFilter) nahi mila'
    s = s.replace(c, "_rebuildSel('mlaStateFilter','" + all_lbl + "',"
                     "dist(MLA_LOCF,'state').filter(function(v){"
                     "v=String(v||'').trim();"
                     "return v&&v!=='-'&&v!=='—'&&!(MLA_LOCF==='loc'&&v==='Uttar Pradesh');}),sf);")

    # renderMLA ka filter bhi usi field par
    d = "&&(!sf||sf==='ALL'||r.state===sf)"
    assert s.count(d) == 1, folder + ' :: renderMLA ka state filter nahi mila'
    s = s.replace(d, "&&(!sf||sf==='ALL'||r[(window.MLA_LOCF||'" + field + "')]===sf)")
    # MLA_LOCF ko window par bhi rakho -- renderMLA alag function hai
    e = "  var MLA_LOCF='" + field + "';\n"
    s = s.replace(e, e + "  try{window.MLA_LOCF=MLA_LOCF;}catch(e){}\n", 1)

    # markup ka pehla option
    f = '<select class="filter-select" id="mlaStateFilter" onchange="filterMLA()" style="min-width:150px"><option value="">All States</option></select>'
    assert s.count(f) == 1, folder + ' :: mlaStateFilter markup nahi mila'
    s = s.replace(f, '<select class="filter-select" id="mlaStateFilter" onchange="filterMLA()" '
                     'style="min-width:150px"><option value="">' + all_lbl + '</option></select>')

    io.open(p, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d  (+%d)  [%s / %s]' % (folder, n0, len(s), len(s) - n0, all_lbl, field))


one('DASHBOARD', 'state', 'All States/UTs')
one('UP-DASHBOARD', 'loc', 'All Districts')
print('done')
