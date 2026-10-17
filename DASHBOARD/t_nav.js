/* t_nav.js -- sidebar ke tab
   1. naya kram
   2. "Handles To Be Added" nav se hata (ab sirf profile menu me)
   3. "See more" -- neeche aur tab hon tabhi dikhe
   4. AI chat abhi chhupa hua */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRC = fs.readFileSync('./server.js', 'utf8');
var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var UTPL = fs.readFileSync('../UP-DASHBOARD/dashboard.template.html', 'utf8');

/* server ye code "a" + "b" + ... me likhta hai -- jod kar asli JS banao */
/* do alag tukde: nav wala, aur AI chhupane wala.
   (Beech me multi-desig aur heading ke block aa gaye hain -- unka apna test hai.) */
function slice(from, toAfter, endMark) {
  var a = SRC.indexOf(from);
  var b = SRC.indexOf(endMark, SRC.indexOf(toAfter, a));
  return (a < 0 || b < a) ? null : SRC.slice(a, b + endMark.length).replace(/^\s*\+\s*/, '');
}
var navSrc = slice('+ "try{"\n    +   "var _nv=document.getElementById(\'mainNav\')',
                   'setTimeout(_navMore,1200);', '+ "}catch(e){}"');
var aiSrc  = slice('+ "try{var AI_OFF=true;', 'ai-off-css', '+ "}}catch(e){}"');
ok(!!navSrc, 'nav wala block mila');
ok(!!aiSrc, 'AI chhupane wala block mila');
var js = new Function('return ' + navSrc + ';')() + new Function('return ' + aiSrc + ';')();
ok(js.indexOf("var _nv=") >= 0 && js.indexOf('ai-off-css') >= 0, 'tukde jud kar sahi JS bana');

/* ---------------- nakli DOM ---------------- */
function mkTab(key, label) {
  var o = { _k: key, label: label, parentNode: null,
    getAttribute: function (a) { return a === 'data-tab' ? key : null; } };
  return o;
}
var ALL = [['dashboard','Dashboard'],['top-leaders','Top Leaders'],['states-cm','States & CM'],
  ['mla-tracker','Elected Representatives'],['hashtags','Hashtags'],['sentiment','Sentiment'],
  ['parties','Parties'],['profiles','Profiles'],['reports','Reports'],
  ['tweets','Tweet Intelligence'],['breaking','Breaking News'],['wordcloud','Word Cloud'],
  ['handle-analytics','Handle Analytics'],['handle-req','Handles To Be Added']];

function mkNav() {
  var kids = ALL.map(function (x) { return mkTab(x[0], x[1]); });
  kids.forEach(function (k) { k.parentNode = null; });
  var nav = {
    id: 'mainNav', _kids: kids, scrollTop: 0, clientHeight: 400, scrollHeight: 900,
    _ev: {}, _scrolled: null,
    querySelectorAll: function (q) {
      if (q !== '.mnav-tab') return [];
      return nav._kids.filter(function (k) { return k._k !== undefined; });
    },
    appendChild: function (n) {
      var i = nav._kids.indexOf(n); if (i >= 0) nav._kids.splice(i, 1);
      nav._kids.push(n); n.parentNode = nav; return n;
    },
    removeChild: function (n) {
      var i = nav._kids.indexOf(n); if (i >= 0) nav._kids.splice(i, 1); n.parentNode = null;
    },
    addEventListener: function (e, fn) { nav._ev[e] = fn; },
    scrollBy: function (o) { nav._scrolled = o; nav.scrollTop += o.top; }
  };
  kids.forEach(function (k) { k.parentNode = nav; });
  return nav;
}

function run(nav) {
  var styles = [], made = {}, winEv = {};
  var doc = {
    getElementById: function (i) {
      if (i === 'mainNav') return nav;
      if (i === 'navMore') return made.navMore || null;
      return null;
    },
    head: { insertAdjacentHTML: function (_, h) { styles.push(h); } },
    createElement: function () {
      var cls = {};
      var el = { id: '', type: '', title: '', innerHTML: '', _ev: {},
        classList: { toggle: function (c, v) { if (v) cls[c] = 1; else delete cls[c]; },
                     contains: function (c) { return !!cls[c]; } },
        addEventListener: function (e, fn) { el._ev[e] = fn; },
        setAttribute: function (k, v) { el._attr = el._attr || {}; el._attr[k] = v; },
        getAttribute: function () { return null; } };
      made._last = el; return el;
    }
  };
  var win = { addEventListener: function (e, fn) { winEv[e] = fn; } };
  /* createElement ke baad id set hoti hai -> tab register karo */
  var origAppend = nav.appendChild;
  nav.appendChild = function (n) { if (n && n.id === 'navMore') made.navMore = n; return origAppend(n); };
  new Function('document', 'window', js)(doc, win);
  return { styles: styles.join(''), more: made.navMore, winEv: winEv };
}

sec('1. Tab ka naya kram');
var nav = mkNav();
var out = run(nav);
var order = nav._kids.filter(function (k) { return k._k; }).map(function (k) { return k._k; });
/* growth-off (13-Oct): Growth tab hata diya gaya -- na nav me button hai,
   na server.js ki kram wali list me. Isliye yahan bhi nahi. */
var WANT = ['dashboard','top-leaders','states-cm','mla-tracker','parties','handle-analytics',
            'profiles','tweets','breaking','hashtags','sentiment','reports','wordcloud'];
var LABEL = {}; ALL.forEach(function (x) { LABEL[x[0]] = x[1]; });
WANT.forEach(function (k, i) {
  ok(order[i] === k, (i + 1) + '. ' + LABEL[k] + (order[i] === k ? '' : '   (mila: ' + order[i] + ')'));
});
ok(order.length === 13, 'kul 13 tab (Growth hat gaya) (mila: ' + order.length + ')');

sec('1b. Growth tab kahin se khulta nahi');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var t = x[1];
  /* button comment ke andar daal diya gaya hai -- live markup me nahi hona chahiye */
  var live = t.replace(/<!--[\s\S]*?-->/g, '');
  /* sirf nav ka BUTTON dekho -- ek JS line me abhi bhi
     querySelector('.mnav-tab[data-tab="growth"]') hai, par wo if(nv) se
     bandha hai aur button na hone par kuch karta hi nahi. */
  ok(live.indexOf('<div class="mnav-tab" data-tab="growth"') < 0, x[0] + ': nav me Growth ka button nahi');
  ok(live.indexOf('onclick="switchTab(\'growth\')"') < 0, x[0] + ': kahin se switchTab(growth) nahi');
  ok(t.indexOf('growth-off (13-Oct)') > 0, x[0] + ': hatane ki wajah comment me likhi hai');
  /* section ka markup jaan-boojh kar chhoda gaya hai */
  ok(t.indexOf('id="sec-growth"') > 0, x[0] + ': section ka markup waise ka waisa (sirf khulta nahi)');
  /* purani parchi me growth pada ho to state-keep usme na jaaye */
  ok(/D\.querySelector\('\.mnav-tab\[data-tab="' \+ o\.tab \+ '"\]'\)/.test(t),
     x[0] + ': state-keep wahi tab kholta hai jiska button maujood hai');
});
ok(SRC.indexOf("'breaking','growth','hashtags'") < 0, 'server.js ki kram wali list me bhi growth nahi');

sec('2. Handles To Be Added nav se hat gaya');
ok(order.indexOf('handle-req') < 0, 'nav me ab nahi hai');
ok(nav._kids.filter(function (k) { return k._k === 'handle-req'; }).length === 0, 'DOM se bhi nikal gaya');
ok(/switchTab\('handle-req'\)/.test(SRC), 'par profile menu ka Request use ab bhi kholta hai');
ok(/<span>Request<\/span>/.test(SRC), 'menu me Request maujood');

sec('3. "See more" -- sirf zaroorat par');
ok(!!out.more, 'See more ka button bana');
ok(out.more.id === 'navMore', 'id navMore');
console.log('\n  --- banee hui CSS ---');
console.log(out.styles.replace(/<\/?style[^>]*>/g,'').replace(/\}/g,'}\n     ').replace(/^/gm,'     ').trim());
console.log('  --- button ka HTML ---\n     ' + out.more.innerHTML + '\n');
ok(!/See more/i.test(out.more.innerHTML), 'ab koi likhavat nahi -- sirf teer');
ok(/<svg/.test(out.more.innerHTML) && /polyline/.test(out.more.innerHTML), 'neeche ka teer (arrow) bhi');
ok(/#navMore\{[^}]*position:sticky/.test(out.styles), 'nav ke neeche chipka rehta hai');
ok(!/#mainNav\{padding-bottom/.test(out.styles),
   'nav par padding-bottom NAHI -- usi se teer upar uth kar tab kaat raha tha');
ok(/#navMore\{[^}]*bottom:-10px/.test(out.styles),
   'sabse neeche chipakta hai (09-Oct: thoda aur neeche -- bottom:-10px)');
ok(/margin:10px -12px -18px/.test(out.styles), 'aakhri tab se 10px ka faasla');
ok(!/rgba\(201,74,16/.test(out.styles) && !/rgba\(196,70,14/.test(out.styles),
   'koi orange rang nahi bacha');
ok(/rgba\(255,250,244,0\) 0%/.test(out.styles),
   'sidebar ka apna halka cream -- upar se paardarshi');
ok(/color:#F08A1A/.test(out.styles), 'teer saffron (bhagwa) rang ka');
ok(/#navMore:hover\{color:#D9661A\}/.test(out.styles), 'hover par thoda gehra saffron');
ok(/backdrop-filter:blur\(3px\)/.test(out.styles), 'peechhe halka blur');
ok(/#navMore\{[^}]*display:none/.test(out.styles), 'by default chhupa hai');
ok(/#navMore\.on\{display:flex\}/.test(out.styles), 'zaroorat par hi dikhta hai');
sec('3b. Neeche ka teer -- hilta hua ishaara');
ok(/navBob/.test(out.styles), 'teer hilta hai taaki nazar jaaye');
ok(/#navMore svg\{animation:navBob 1\.25s ease-in-out infinite/.test(out.styles),
   'bina ruke, aaram se (1.25s)');
ok(/@keyframes navBob\{0%\{transform:translateY\(-2px\);opacity:\.45\}/.test(out.styles),
   'upar se shuru, halka dhundhla');
ok(/55%\{transform:translateY\(4px\);opacity:\.95\}/.test(out.styles),
   'neeche jaakar saaf -- 6px ka safar');
ok(!/drop-shadow/.test(out.styles), 'koi chhaya nahi -- bilkul halka rakha hai');
ok(/width="26" height="26"/.test(out.more.innerHTML), 'teer bada -- 26px');
ok(/#navMore:hover svg\{animation-play-state:paused\}/.test(out.styles),
   'mouse le jaate hi hilna ruk jaata hai');
ok(/#navMore:hover/.test(out.styles), 'hover par rang badalta hai');

/* ab tak scroll nahi kiya -> neeche aur hai -> dikhna chahiye */
ok(out.more.classList.contains('on'), 'shuru me (900px content, 400px jagah) -> dikhta hai');

/* poora neeche scroll -> chhup jaaye */
nav.scrollTop = 500;
nav._ev.scroll();
ok(!out.more.classList.contains('on'), 'sabse neeche pahunchne par chhup jaata hai');

/* wapas upar -> phir dikhe */
nav.scrollTop = 0; nav._ev.scroll();
ok(out.more.classList.contains('on'), 'wapas upar aane par phir dikhta hai');

/* chhoti list (sab tab dikh rahe hain) -> kabhi na dikhe */
var nav2 = mkNav(); nav2.scrollHeight = 380; nav2.clientHeight = 400;
var out2 = run(nav2);
ok(!out2.more.classList.contains('on'), 'saare tab dikh rahe hon to See more aata hi nahi');

sec('4. Click karne par neeche le jaata hai');
ok(typeof out.more._ev.click === 'function', 'click lagta hai');
out.more._ev.click();
ok(nav._scrolled && nav._scrolled.top > 0, 'neeche scroll karta hai (' + (nav._scrolled || {}).top + 'px)');
ok(nav._scrolled.behavior === 'smooth', 'aaram se, jhatke se nahi');
ok(typeof out.winEv.resize === 'function', 'window resize par dobara sochta hai');

sec('4b. Baad me nav badle to bhi pakad le');
ok(/new ResizeObserver\(_navMore\)/.test(SRC), 'nav ka naap badle to dobara dekhta hai');
ok(/new MutationObserver\(_navMore\)/.test(SRC), 'tab jude/hate to dobara dekhta hai');
ok(/document\.fonts\.ready\.then\(_navMore\)/.test(SRC), 'font aane ke baad bhi (tab ki height badal jaati hai)');
ok(/setInterval\(function\(\)\{_navMore\(\);if\(\+\+_nc>30\)clearInterval/.test(SRC),
   'shuru ke ~7 second tak dekhta rehta hai, phir chhod deta hai');
ok(/scrollHeight-2\)/.test(SRC), 'sirf 2px ki chhoot -- thoda sa bhi bacha ho to dikhta hai');

sec('5. AI chat abhi chhupa hua');
ok(/#aiFab,#aiPanel\{display:none !important\}/.test(out.styles), 'AI ka button aur panel dono chhupe');
ok(/var AI_OFF=true/.test(js), 'ek hi switch se chalta hai: AI_OFF');
ok(/AI_OFF ko false kar do/.test(SRC), 'wapas kaise laana hai, likha hua hai');
ok(/id="aiFab"/.test(TPL), 'code hataya nahi gaya -- sirf chhupaya');

sec('6. Dono dashboard par');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(/id="mainNav"/.test(t), n + ': nav wahi hai');
  ok(/id="aiFab"/.test(t), n + ': AI fab wahi hai');
  WANT.forEach(function (k) {
    if (k === 'handle-analytics' || k === 'wordcloud') {
      ok(t.indexOf('data-tab="' + k + '"') >= 0, n + ': tab maujood -> ' + k);
    }
  });
});
ok(/scrollbar-width:none/.test(TPL), 'nav ki scrollbar chhupi hai -- isi liye See more chahiye tha');

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
