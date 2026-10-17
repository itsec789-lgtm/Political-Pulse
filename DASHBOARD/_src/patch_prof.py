# -*- coding: utf-8 -*-
"""Leader Board (CM Profiles) bhi poori tarah MAPPING se.

   PEHLE:
     const CMS = UNI.allHandles.filter(level==='Chief Minister') ...
     Yaani sirf wo CM jinke TWEET aaye hain. Jo mapping me CM hai par
     jiska abhi ek bhi tweet nahi -- wo Leader Board me tha hi nahi,
     jabki States & CM ki table use "No tweets yet" ke saath dikhati hai.
     Do jagah do ginti. Upar likha bhi hua tha: "30 Chief Ministers + PM".

   AB:
     List CM_DATA se banti hai -- wahi jo server MAPPING se banata hai --
     aur jiska data hai uske asli number allHandles se jud jaate hain.
     Upar ki line bhi ab khud ginti bata deti hai.
"""
import io, os, shutil

R = os.environ.get('TPLROOT', '.')

OLD = ("const CMS=UNI.allHandles.filter(c=>c.level==='Chief Minister'||c.h==='myogiadityanath')"
       ".sort((a,b)=>b.vw-a.vw);")
NEW = """/* prof-map (13-Oct): ab CM ki list MAPPING se (CM_DATA), sirf un se nahi
   jinke tweet aaye hain. Number asli data se jodte hain; jiska data nahi
   hai uske 0 rehte hain -- bilkul waise hi jaise States & CM table karti
   hai. Isi se dono jagah ek hi ginti dikhti hai. */
const CMS=(function(){
  var byH={};UNI.allHandles.forEach(function(x){byH[String(x.h).toLowerCase()]=x;});
  var out=[],seen={};
  (window.CM_DATA||[]).forEach(function(c){
    if(c.level!=='Chief Minister')return;
    var k=String(c.handle||'').toLowerCase();if(!k||seen[k])return;seen[k]=1;
    var u=byH[k];
    out.push(u||{h:c.handle,name:c.name,party:c.party,state:c.state,level:'Chief Minister',
      loc:c.seat||'',tw:+c.tweets||0,vw:+c.views||0,lk:+c.likes||0,rt:+c.rts||0,
      pos:0,neu:0,neg:0,followers:+c.followers||0,followings:+c.followings||0});
  });
  /* Yogi pehle se yahan aate the (CM hain, par mapping me pad badal bhi
     sakta hai) -- purana vyavhaar bana rehta hai */
  var y=byH['myogiadityanath'];
  if(y&&!seen['myogiadityanath']){seen['myogiadityanath']=1;out.push(y);}
  if(!out.length){  /* purana server (CM_DATA window par nahi) -- pehle jaisa */
    out=UNI.allHandles.filter(function(c){return c.level==='Chief Minister'||c.h==='myogiadityanath';});
  }
  return out.sort(function(a,b){return (b.vw||0)-(a.vw||0);});
})();"""

TOOL_OLD = ('<div class="cm-toolbar"><div class="cm-count"><b id="cmCount">31</b> profiles '
            '<span>· 30 Chief Ministers + PM</span></div>')
TOOL_NEW = ('<div class="cm-toolbar"><div class="cm-count"><b id="cmCount">—</b> profiles '
            '<span id="cmCountSub">· mapping se</span></div>')

SUB = """
/* prof-map (13-Oct): upar ki line bhi khud ginti bataye -- pehle "30 Chief
   Ministers + PM" likha hua tha aur mapping badalne par jhooth bolne lagta. */
(function(){
  function setSub(){
    var e=document.getElementById('cmCountSub');if(!e||typeof PROF==='undefined')return;
    var cm=0,pm=0;
    PROF.forEach(function(c){ if(c.h==='narendramodi')pm++; else cm++; });
    e.textContent='\\u00b7 '+cm+' Chief Minister'+(cm===1?'':'s')+(pm?' + PM':'');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setSub);
  else setSub();
  setTimeout(setSub,800);setTimeout(setSub,2000);
})();
"""


def one(folder):
    P = R + '/' + folder + '/dashboard.template.html'
    s = io.open(P, encoding='utf-8').read(); n0 = len(s)
    assert 'prof-map (13-Oct)' not in s, 'ALREADY: ' + folder
    if not os.path.exists(P + '.bak_profmap'): shutil.copyfile(P, P + '.bak_profmap')
    assert s.count(OLD) == 1, folder + ' :: CMS nahi mila'
    s = s.replace(OLD, NEW)
    assert s.count(TOOL_OLD) == 1, folder + ' :: cm-toolbar nahi mila'
    s = s.replace(TOOL_OLD, TOOL_NEW)
    i = s.rfind('</body>')
    s = s[:i] + '<script>' + SUB + '</script>\n' + s[i:]
    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d' % (folder, n0, len(s)))


one('DASHBOARD')
one('UP-DASHBOARD')
