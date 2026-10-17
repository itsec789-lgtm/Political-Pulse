/* t_hdr.js -- naya layout: fixed header + header wala hamburger
   Chalao:  node t_hdr.js                                                   */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. Header fixed, poori chaudai');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/header\{[^}]*position:fixed;top:0;left:0;right:0;z-index:500/.test(t), n + ': header fixed hai (z-index 500)');
  ok(!/(^|[;}\s])header\{[^}]*position:sticky/.test(t),
     n + ': purana sticky hat gaya (.rp-header jaise doosre elements chhue nahi)');
  ok(t.indexOf('--header-h:66px') > 0, n + ': --header-h variable hai');
  ok(t.indexOf("style.setProperty('--header-h'") > 0, n + ': JS asli unchai bharta hai');
});

sec('2. Hamburger header me, sabse baayein');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('id="appBurger"') > 0, n + ': hamburger maujood hai');
  /* 10-Oct: dono par aur class lag gayi hain (hdr-fade / logo-coin),
     isliye poora class attribute match karne ki jagah naam dhoondhte hain. */
  ok(t.indexOf('hdr-burger') > 0 && t.indexOf('smt-emblem') > 0
     && t.indexOf('hdr-burger') < t.indexOf('smt-emblem'), n + ': emblem se PEHLE');
  ok(t.indexOf('class="smt-emblem"') < t.indexOf('class="logo-text"'), n + ': phir logo, phir title');
  ok(t.indexOf('aria-label="Toggle menu"') > 0 && t.indexOf('title="Toggle menu"') > 0, n + ': tooltip + aria-label');
  ok(t.indexOf('aria-controls="appSidebar"') > 0, n + ': aria-controls sidebar par');
  ok(t.indexOf('.hdr-burger:hover') > 0 && t.indexOf('.hdr-burger:focus-visible') > 0, n + ': hover + keyboard focus');
  ok((t.match(/id="appBurger"/g) || []).length === 1, n + ': sirf EK hamburger (dohra nahi)');
});

sec('3. Purane control aur sidebar ki branding hat gayi');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('id="sbPinBtn"') < 0, n + ': pin button nahi');
  ok(t.indexOf('class="sb-trigger"') < 0, n + ': kinare wali hover-patti nahi');
  ok(t.indexOf('class="sb-brand"') < 0, n + ': sidebar me branding nahi');
  ok(t.indexOf('India Political<br>Pulse') < 0, n + ': sidebar me naam nahi');
  ok(t.indexOf('class="sb-wave"') < 0, n + ': sidebar ka kesari band nahi');
  ok(t.indexOf('id="sbBand"') < 0 && t.indexOf('id="sbBright"') < 0, n + ': band ke dono tukde bhi nahi');
  ok(t.indexOf('mob-burger') < 0 || t.indexOf("burger.className = 'mob-burger'") < 0,
     n + ': purana mobile-only hamburger block hat gaya');
  ok(t.indexOf('toggleSidebarPin') < 0, n + ': purana pin wala function nahi');
  /* header ki apni wave bachi rehni chahiye */
  ok(t.indexOf('class="hdr-wh"') > 0, n + ': HEADER ki orange wave waisi hi hai');
});
ok(SRV.indexOf("classList.add('sb-pinned')") < 0, 'server.js ab sb-pinned nahi thopta');

sec('4. Sidebar header ke neeche + content khiskta hai');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/\.sidebar\{position:fixed;left:0;top:var\(--header-h\)/.test(t), n + ': sidebar header ke neeche se');
  ok(t.indexOf('body.sb-open .sidebar{transform:translateX(0)}') > 0, n + ': khulne ka niyam');
  ok(t.indexOf('body.sb-open .page-section{padding-left:var(--sb-w)}') > 0,
     n + ': khula ho to content daayein (page-section par)');
  ok(t.indexOf('.page-section{padding-top:var(--header-h)') > 0,
     n + ': page header jitna neeche se shuru');
  ok(t.indexOf('transition:padding-left .25s ease') > 0, n + ': content smooth khiskta hai');
  ok(/transition:transform \.26s ease/.test(t) || /transition:transform \.25s ease/.test(t),
     n + ': sidebar ka slide transition');
});

sec('5. Naya JS asli DOM par chala kar dekho');
(function () {
  const m = TPL.match(/<script>\/\* ===== hdr-layout \(09-Oct\)[\s\S]*?<\/script>/);
  ok(!!m, 'naya script block mila');
  if (!m) return;
  const js = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

  function mkEl(id) {
    return {
      id: id || '', _cls: {}, style: { cssText: '', display: '' },
      classList: {
        _o: null,
        add(c) { this._o._cls[c] = 1; },
        remove(c) { delete this._o._cls[c]; },
        toggle(c, v) { if (v) this._o._cls[c] = 1; else delete this._o._cls[c]; },
        contains(c) { return !!this._o._cls[c]; },
      },
      _attr: {},
      setAttribute(k, v) { this._attr[k] = v; },
      getAttribute(k) { return this._attr[k]; },
      addEventListener(ev, fn) { (this._ev || (this._ev = {}))[ev] = fn; },
      getBoundingClientRect() { return { height: 72 }; },
      appendChild() {}, closest() { return null; },
    };
  }
  function wire(e) { e.classList._o = e; return e; }

  const body = wire(mkEl('body')), head = wire(mkEl('header')),
        sbEl = wire(mkEl('appSidebar')), bg = wire(mkEl('appBurger'));
  const added = [];
  const root = { style: { _v: {}, setProperty(k, v) { this._v[k] = v; } } };
  const byId = { appSidebar: sbEl, appBurger: bg };
  const sb = {
    console: { log() {} },
    document: {
      body: body, documentElement: root,
      readyState: 'complete',
      getElementById: id => byId[id] || null,
      querySelector: q => (q === 'header' ? head : (q === '.sidebar' ? sbEl : null)),
      createElement: () => { const e = wire(mkEl('')); added.push(e); return e; },
      addEventListener() {},
    },
    localStorage: { _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
                    setItem(k, v) { this._d[k] = v; } },
    setTimeout() {},
  };
  sb.window = sb;
  sb.window.matchMedia = q => ({ matches: false });          /* desktop */
  sb.window.addEventListener = function () {};
  sb.window.dispatchEvent = function () {};
  sb.Event = function () {};
  vm.createContext(sb);
  vm.runInContext(js, sb);

  ok(root.style._v['--header-h'] === '72px',
     'header ki asli unchai --header-h me gayi  [' + root.style._v['--header-h'] + ']');
  ok(typeof sb.window.setSidebarOpen === 'function', 'toggle function bana');
  ok(body.classList.contains('sb-open'), 'desktop par shuru me sidebar KHULA');
  ok(bg.getAttribute('aria-expanded') === 'true', 'aria-expanded true');

  /* hamburger dabao -> band */
  bg._ev.click({ preventDefault() {}, stopPropagation() {} });
  ok(!body.classList.contains('sb-open'), 'ek click par band');
  ok(bg.getAttribute('aria-expanded') === 'false', 'aria-expanded false');
  ok(sb.localStorage._d['ipp_sbopen'] === '0', 'band hona yaad rakha gaya');
  /* dobara -> khula */
  bg._ev.click({ preventDefault() {}, stopPropagation() {} });
  ok(body.classList.contains('sb-open'), 'dobara click par wapas khula');
  ok(sb.localStorage._d['ipp_sbopen'] === '1', 'khula hona bhi yaad');
  ok(added.length >= 1 && added[0].id === 'sbBackdrop', 'phone ke liye parda ban gaya');
})();

sec('6. Phone par: shuru me band + drawer');
(function () {
  const m = TPL.match(/<script>\/\* ===== hdr-layout \(09-Oct\)[\s\S]*?<\/script>/);
  const js = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  function mkEl(id) {
    return { id: id || '', _cls: {}, style: { cssText: '', display: '' },
      classList: { _o: null, add(c) { this._o._cls[c] = 1; }, remove(c) { delete this._o._cls[c]; },
        toggle(c, v) { if (v) this._o._cls[c] = 1; else delete this._o._cls[c]; },
        contains(c) { return !!this._o._cls[c]; } },
      _attr: {}, setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k]; },
      addEventListener(ev, fn) { (this._ev || (this._ev = {}))[ev] = fn; },
      getBoundingClientRect() { return { height: 60 }; }, appendChild() {}, closest() { return null; } };
  }
  function wire(e) { e.classList._o = e; return e; }
  const body = wire(mkEl('body')), head = wire(mkEl('header')),
        sbEl = wire(mkEl('appSidebar')), bg = wire(mkEl('appBurger'));
  const byId = { appSidebar: sbEl, appBurger: bg };
  const made = [];
  const sb = {
    console: { log() {} },
    document: { body, documentElement: { style: { setProperty() {} } }, readyState: 'complete',
      getElementById: id => byId[id] || null,
      querySelector: q => (q === 'header' ? head : null),
      createElement: () => { const e = wire(mkEl('')); made.push(e); return e; },
      addEventListener(ev, fn) { (this._ev || (this._ev = {}))[ev] = fn; } },
    localStorage: { _d: { ipp_sbopen: '1' }, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } },
    setTimeout(fn) { fn && fn(); },
  };
  sb.window = sb;
  sb.window.matchMedia = () => ({ matches: true });          /* phone */
  sb.window.addEventListener = function () {};
  sb.window.dispatchEvent = function () {};
  sb.Event = function () {};
  vm.createContext(sb); vm.runInContext(js, sb);
  ok(!body.classList.contains('sb-open'),
     'phone par shuru me BAND (chaahe pehle khula save tha)');
  bg._ev.click({ preventDefault() {}, stopPropagation() {} });
  ok(body.classList.contains('sb-open'), 'hamburger se drawer khula');
  const scrim = made[0];
  ok(scrim && scrim.style.display === 'block', 'parda dikhne laga');
  scrim._ev.click();
  ok(!body.classList.contains('sb-open'), 'parde par tap karte hi band');
})();

sec('7. Dono template ka naya hissa ek jaisa');
(function () {
  const a = (TPL.match(/<script>\/\* ===== hdr-layout \(09-Oct\)[\s\S]*?<\/script>/) || [''])[0];
  const b = (UTPL.match(/<script>\/\* ===== hdr-layout \(09-Oct\)[\s\S]*?<\/script>/) || [''])[0];
  ok(a.length > 500 && a === b, 'All-India aur UP ka script bilkul same');
})();


sec('8. Har tab ka upar wala filter header ke peeche na chhupe');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('.page-section{padding-top:var(--header-h);transition:padding-left .25s ease}') > 0,
     n + ': header ka faasla PAGE-SECTION par hai (sirf main par nahi)');
  ok(t.indexOf('body.sb-open .page-section{padding-left:var(--sb-w)}') > 0,
     n + ': sidebar khula ho to poora section daayein khiskta hai');
  ok(t.indexOf('main{padding:16px 24px;max-width:1600px;margin:0 auto}') > 0,
     n + ': main ka apna padding saada (dohra faasla nahi)');
  ok(t.indexOf('body.sb-open main{padding-left:') < 0,
     n + ': purana sirf-main wala khiskaav hat gaya');
  ok(t.indexOf('height:calc(100vh - var(--header-h))') > 0,
     n + ': map wali grid bhi asli header unchai se (66px hardcoded nahi)');
  ok(t.indexOf('body.sb-open .page-section{padding-left:0}') > 0,
     n + ': phone par drawer content ko dhakka nahi deta');
});

sec('9. Jin tab ka filter <main> se BAHAR hai, unka khaas dhyaan');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  const re = /<div class="page-section"[^>]*id="sec-([\w-]+)"[^>]*>/g;
  let m, outside = [], inside = 0;
  while ((m = re.exec(t))) {
    const id = m[1], from = m.index + m[0].length;
    const nextSec = t.indexOf('<div class="page-section"', from);
    const end = nextSec < 0 ? t.length : nextSec;
    const mainAt = t.indexOf('<main>', from);
    const pre = t.slice(from, (mainAt > 0 && mainAt < end) ? mainAt : end).trim();
    if (pre.length > 50) outside.push(id); else inside++;
  }
  console.log('     ' + n + ': <main> se bahar wale tab -> ' + (outside.join(', ') || 'koi nahi'));
  ok(outside.length > 0, n + ': aise tab sach me hain (' + outside.length + ')');
  ok(inside > 5, n + ': baaki tab seedhe <main> se shuru hote hain (' + inside + ')');
  /* ab offset dono tarah ke tab ko milta hai, kyunki wo page-section par hai */
  ok(t.indexOf('.page-section{padding-top:var(--header-h)') > 0,
     n + ': dono tarah ke tab ko faasla milta hai');
});

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
