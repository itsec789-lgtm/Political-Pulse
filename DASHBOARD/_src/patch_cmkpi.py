# -*- coding: utf-8 -*-
"""States & CM ka KPI ab MAPPING se -- 50 ki jagah 52.

   DIKKAT:
     CM_DATA ek IIFE ke andar 'const' hai, window par nahi aata. hCM() ek
     ALAG script block me hai, isliye wahan "typeof CM_DATA" hamesha
     "undefined" nikalta tha aur ginti chupke se doosre raaste par chali
     jaati thi -- UNI.allHandles me se sirf un handle ki jinke TWEET aaye
     hain. Isi se "50 (30 CMs . 20 Dy CMs)" dikhta tha, jabki mapping me
     31 CM aur 21 Dy CM hain. (Jinke tweet abhi nahi aaye wo ginti se bahar
     ho jaate the -- par table me unki row "No tweets yet" ke saath aati
     hai. Do jagah do ginti.)

   ILAAJ (wahi purana sabak):
     const ko usi block me window par rakh do, aur hCM pehle window.CM_DATA
     dekhe. Ab ginti wahi hai jo mapping kehti hai aur jo table dikhati hai.
"""
import io, os, shutil

R = os.environ.get('TPLROOT', '.')

A = 'const CM_DATA="__MONGO_CM_DATA__";'
B = ('const CM_DATA="__MONGO_CM_DATA__";\n'
     '/* cm-kpi (13-Oct): ye const IIFE ke andar hai -- window par apne aap\n'
     '   nahi aata. hCM() alag block me hai aur usi se KPI ki ginti banti\n'
     '   hai, isliye yahan se bahar rakhna zaroori hai. */\n'
     'try{window.CM_DATA=CM_DATA;}catch(e){}')

C = 'function hCM(){var n=0,cm=0,dy=0,tw=0,vw=0,lk=0,rt=0,ok=false;if(typeof CM_DATA!=="undefined"&&Array.isArray(CM_DATA)&&CM_DATA.length){n=CM_DATA.length;CM_DATA.forEach(function(c){'
D = ('function hCM(){var n=0,cm=0,dy=0,tw=0,vw=0,lk=0,rt=0,ok=false;'
     '/* cm-kpi (13-Oct): pehle yahan sirf "typeof CM_DATA" dekha jaata tha.\n'
     '   Wo const doosre block me hai, isliye yahan kabhi mila hi nahi aur\n'
     '   ginti neeche wale raaste se banti thi -- sirf un CM ki jinke tweet\n'
     '   aaye the (50), mapping ke 52 nahi. Ab window.CM_DATA pehle. */\n'
     'var _CM=(window.CM_DATA||(typeof CM_DATA!=="undefined"?CM_DATA:null));'
     'if(Array.isArray(_CM)&&_CM.length){n=_CM.length;_CM.forEach(function(c){')


def one(folder):
    P = R + '/' + folder + '/dashboard.template.html'
    s = io.open(P, encoding='utf-8').read(); n0 = len(s)
    assert 'cm-kpi (13-Oct)' not in s, 'ALREADY: ' + folder
    if not os.path.exists(P + '.bak_cmkpi'): shutil.copyfile(P, P + '.bak_cmkpi')
    assert s.count(A) == 1, folder + ' :: CM_DATA const nahi mila'
    s = s.replace(A, B)
    assert s.count(C) == 1, folder + ' :: hCM nahi mila'
    s = s.replace(C, D)
    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d' % (folder, n0, len(s)))


one('DASHBOARD')
one('UP-DASHBOARD')
