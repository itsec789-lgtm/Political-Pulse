# -*- coding: utf-8 -*-
"""Live-update indicator do baar lag raha tha ("1537 up+2 up+2").

   ASLI WAJAH:
     Jis list se ye module number dhoondhta hai usme table ka cell AUR
     uske andar ka span, DONO hain --
         SEL = '... , .td-num, .tbl-box tbody td, .num'
     Table ka cell aise bana hai:  <td class="num"><span class="td-num">1537</span></td>
     Yaani EK hi number do baar pakda jaata tha: ek baar <td> ke roop me,
     ek baar <span> ke roop me.

     Badge do baar na lage, iske liye pehle se ek pehra tha --
         if (itm.el.querySelector('.rt-up')) continue;   // pehle se laga hai
     par wo sirf APNE ANDAR dekhta hai. querySelectorAll document ke kram
     me chalti hai, to pehle <td> aata hai (uske andar tab tak koi badge
     nahi -> badge lag gaya), phir uska <span> (uske ANDAR bhi koi badge
     nahi -> ek aur badge). Dono badge saath-saath dikhte the.

   ILAAJ:
     Jo element apne ANDAR koi aur trackable number rakhta ho, use chhod
     do -- number wahin ginna chahiye jahan wo sach me likha hai (sabse
     andar wala). Isse badge ek hi baar lagta hai, aur jahan lagna chahiye
     wahin lagta hai.
"""
import io, os, shutil

R = os.environ.get('TPLROOT', '.')

A = """      var t = pureText(el);
      var n = parseVal(t);
      if (n === null) continue;
      var k = keyOf(el);
      if (!k) continue;
      out.push({ el: el, key: k, n: n, txt: t });"""

B = """      var t = pureText(el);
      var n = parseVal(t);
      if (n === null) continue;
      /* rt-dup (13-Oct): EK number ko DO baar mat ginno.
         Table ka cell aisa hota hai:
             <td class="num"><span class="td-num">1537</span></td>
         aur SEL me '.num', '.tbl-box tbody td' AUR '.td-num' teeno hain --
         to wahi ek number do baar pakda jaata tha, aur badge do baar lagta
         tha ("1537 \\u2191+2 \\u2191+2"). Purana pehra (querySelector('.rt-up'))
         sirf APNE ANDAR dekhta tha, isliye kaam nahi karta: document ke
         kram me <td> pehle aata hai, uske andar tab tak badge hota hi
         nahi.
         Niyam: number wahin gino jahan wo sach me likha hai -- sabse andar
         wale element par. Jiske andar koi aur trackable number pada ho,
         use chhod do. */
      var _in = null;
      try { _in = el.querySelector(SEL); } catch (e3) {}
      if (_in && !(_in.classList && _in.classList.contains('rt-up'))
          && parseVal(pureText(_in)) !== null) continue;
      var k = keyOf(el);
      if (!k) continue;
      out.push({ el: el, key: k, n: n, txt: t });"""


def one(folder):
    P = R + '/' + folder + '/dashboard.template.html'
    s = io.open(P, encoding='utf-8').read(); n0 = len(s)
    assert 'rt-dup (13-Oct)' not in s, 'ALREADY: ' + folder
    if not os.path.exists(P + '.bak_rtdup'): shutil.copyfile(P, P + '.bak_rtdup')
    assert s.count(A) == 1, folder + ' :: scan() ka hissa nahi mila'
    s = s.replace(A, B)
    io.open(P, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d' % (folder, n0, len(s)))


one('DASHBOARD')
one('UP-DASHBOARD')
