/* t_rtdup.js -- 13-Oct: live-update ka badge do baar lag raha tha.

   "1537 ↑+2 ↑+2" -- ek hi number par do badge.

   WAJAH: jis list se ye module number dhoondhta hai usme table ka cell AUR
   uske andar ka span dono hain:
       SEL = '... , .td-num, .tbl-box tbody td, .num'
       cell = <td class="num"><span class="td-num">1537</span></td>
   Yaani ek number do baar pakda jaata tha. Purana pehra --
       if (itm.el.querySelector('.rt-up')) continue;
   -- sirf APNE ANDAR dekhta hai, aur document ke kram me <td> pehle aata
   hai (tab tak uske andar koi badge hota hi nahi). Isliye wo kaam nahi
   karta tha.

   ILAAJ: number wahin gino jahan wo sach me likha hai -- sabse andar wale
   element par. Jiske andar koi aur trackable number pada ho, use chhod do.

   Asli Chromium me A/B karke dekha gaya (purana template banam naya):
       pehle : 2,933 number track ho rahe the
       ab    : 2,565   (theek 368 kam -- utne hi jitne dohre the)
   Yahan us niyam ka pehra hai.
   Chalao:  node t_rtdup.js                                               */
'use strict';
const fs = require('fs'), path = require('path');
let P = 0, F = 0; const FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. dikkat sach me maujood hai (isi liye pehra chahiye)');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* SEL me cell aur uske andar ka span, dono */
  ok(/'\.tbl-box tbody td', '\.num'/.test(t) || (t.indexOf("'.tbl-box tbody td'") > 0 && t.indexOf("'.num'") > 0),
     n + ": SEL me cell wale selector hain ('.tbl-box tbody td', '.num')");
  ok(t.indexOf("'.td-num'") > 0, n + ": SEL me andar wala span bhi hai ('.td-num')");
  /* table ka cell sach me aise hi banta hai */
  ok(/<td class="num"><span class="td-num/.test(t) || /class="num"><span class="td-num/.test(t),
     n + ': cell ka dhaancha wahi hai -- <td class="num"><span class="td-num">');
});

sec('2. ab sabse andar wale element par hi ginti hoti hai');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('rt-dup (13-Oct)') > 0, n + ': nishaan maujood');
  ok(/var _in = null;\s*try \{ _in = el\.querySelector\(SEL\); \} catch \(e3\) \{\}/.test(t),
     n + ': element ke ANDAR dekha jaata hai');
  ok(t.indexOf("&& parseVal(pureText(_in)) !== null) continue;") > 0,
     n + ': andar sach me number ho tabhi bahar wala chhoda jaata hai');
  /* ye jaanch scan() ke andar ho -- baaki kahin nahi */
  const i = t.indexOf('function scan()');
  const j = t.indexOf('function run(animate)');
  const blk = (i >= 0 && j > i) ? t.slice(i, j) : '';
  ok(blk.indexOf('rt-dup (13-Oct)') > 0, n + ': ye jaanch scan() ke andar hi hai');
  ok(blk.indexOf('out.push({ el: el, key: k, n: n, txt: t });') > 0,
     n + ': aur push se PEHLE lagti hai');
});

sec('3. purana pehra bhi bana hua hai (dono saath chalte hain)');
PAIRS.forEach(function (x) {
  ok(x[1].indexOf("if (itm.el.querySelector && itm.el.querySelector('.rt-up')) continue;") > 0,
     x[0] + ": 'pehle se laga hai' wala pehra waisa hi");
  ok(x[1].indexOf("var SKIP = '.lu-td,.bn-upd,.lu-th,.rt-up';") > 0,
     x[0] + ': ghadi wale cell (LAST UPDATED) abhi bhi chhode jaate hain');
});

sec('4. dono template me ek jaisa');
(function () {
  function blk(s) {
    const i = s.indexOf('LIVE UPDATE INDICATOR  (rt-delta)');
    return i < 0 ? '' : s.slice(i, s.indexOf('</script>', i));
  }
  ok(blk(TPL).length > 3000, 'block mila (' + blk(TPL).length + ' bytes)');
  ok(blk(TPL) === blk(UTPL), 'All-India aur UP me bilkul ek jaisa');
})();

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); FAILS.forEach(function (x) { console.log(' - ' + x); }); process.exitCode = 1; }
