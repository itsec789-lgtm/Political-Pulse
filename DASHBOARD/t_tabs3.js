/* t_tabs3.js -- teen badlaav:
     1. Profiles tab ka naam "Leader Board"
     2. Admin Panel ka hak tick se (profile menu me direct switch)
     3. Top Leaders table ke upar sorting button
   Chalao:  node t_tabs3.js                                                */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

/* ---------------- 1 ---------------- */
sec('1. Profiles tab ka naam ab "Leader Board"');
PAIRS.forEach(function (x) {
  var n = x[0], t = x[1];
  var m = t.match(/data-tab="profiles"[\s\S]{0,400}?<\/div>/);
  ok(!!m && /Leader Board/.test(m[0]), n + ': nav par "Leader Board" likha hai');
  ok(!!m && !/>\s*Profiles\s*</.test(m[0]), n + ': purana "Profiles" hat gaya');
  ok(/data-tab="profiles"/.test(t) && /switchTab\('profiles'\)/.test(t),
     n + ': andar ka naam (profiles) waisa hi -- purana link/tab nahi toota');
});
ok(/'handle-analytics','profiles','tweets'/.test(SRV), 'tab ka kram waisa hi hai');

/* ---------------- 2 ---------------- */
sec('2. Admin Panel ka hak -- panel me tick');
ok(/name="adminPanel" value="1"/.test(SRV), 'har user ke saamne tick ka box hai');
ok(SRV.indexOf("(u.adminPanel ? ' checked' : '')") > 0, 'pehle se diya hua hak tick dikhata hai');
ok(SRV.indexOf('var adm = !!req.body.adminPanel;') > 0, 'save karne par tick padha jaata hai');
ok(/\$set: \{ role: role, adminPanel: adm \}/.test(SRV), 'hak Mongo me likha jaata hai (restart nahi chahiye)');
ok(SRV.indexOf('function hasAdminPanel(') > 0, 'hak jaanchne ka function hai');
ok(SRV.indexOf("if (r !== 'backend' && !hasAdminPanel(req))") > 0,
   'panel ka pehra ab hak wale ko bhi andar aane deta hai');
ok(SRV.indexOf("role === 'backend' || (_dbu && _dbu.adminPanel)") > 0,
   'profile menu me "Admin Panel" sirf hak walon ko');
ok(SRV.indexOf('<span>Admin Panel</span></a>') > 0, 'menu item ka naam "Admin Panel"');
ok(SRV.indexOf('+   hpAdmin') > 0 && SRV.indexOf('+   hpOther') > 0, 'menu me jud bhi gaya hai');
ok(SRV.indexOf("'<span>Request</span></button>'") < SRV.indexOf('+   hpAdmin'),
   'Request ke theek neeche aata hai');

/* hasAdminPanel ko ASLI me chala kar dekho */
(function () {
  const b = SRV.indexOf('function hasAdminPanel(');
  let i = SRV.indexOf('{', b), d = 0, e = -1;
  for (let j = i; j < SRV.length; j++) {
    if (SRV[j] === '{') d++; else if (SRV[j] === '}') { d--; if (!d) { e = j + 1; break; } }
  }
  const sb = {
    _dbUsers: {
      'rohit@jarvis.consulting': { adminPanel: true },
      'sita@jarvis.consulting': { adminPanel: false },
      'ram@jarvis.consulting': {},
    },
    emailOf: function (r) { return r && r.em; },
  };
  vm.createContext(sb);
  vm.runInContext(SRV.slice(b, e) + '\nthis.f = hasAdminPanel;', sb);
  ok(sb.f('rohit@jarvis.consulting') === true, 'tick wale ko haan');
  ok(sb.f('ROHIT@Jarvis.Consulting') === true, 'chhote-bade akshar se farak nahi padta');
  ok(sb.f('sita@jarvis.consulting') === false, 'tick hata diya to naa');
  ok(sb.f('ram@jarvis.consulting') === false, 'kabhi tick nahi laga to naa');
  ok(sb.f('koi@nahi.com') === false, 'anjaan email ko naa');
  ok(sb.f({ em: 'rohit@jarvis.consulting' }) === true, 'request object se bhi chalta hai');
  ok(sb.f(null) === false, 'khaali par gir nahi jaata');
})();

/* ---------------- 3 ---------------- */
sec('3. Top Leaders -- sorting button table ke upar');
PAIRS.forEach(function (x) {
  var n = x[0], t = x[1];
  ok(t.indexOf('id="tlSortBtn"') > 0, n + ': button maujood hai');
  ok(t.indexOf('id="tlSortMenu"') > 0, n + ': click par khulne wali list hai');
  ok(t.indexOf('id="tlSortWrap"') < t.indexOf('Handles by Views'),
     n + ': button table/heading ke UPAR hai');
  ['Followers', 'Following', 'Tweets', 'Total Views', 'Avg Views/Post', 'Avg Likes/Post']
    .forEach(function (o) { ok(t.indexOf("'" + o + "'") > 0, n + ': option "' + o + '"'); });
  ok(/window\.tlSortKey\|\|'vw'/.test(t), n + ': bina chune Total Views hi default');
  ok(t.indexOf('rows.sort(function(a,b){return _G(b)-_G(a);});') > 0, n + ': table usi se chhantta hai');
  ok(t.indexOf('var _SK=(window.tlSortKey') < t.indexOf('rows=rows.slice(0,LEAD_N);'),
     n + ': chhantna slice se PEHLE (Top 15 sahi aayein)');
  ok(t.indexOf('ipp_tlsort') > 0, n + ': chuna hua agli baar bhi yaad rehta hai');
});

sec('4. Sorting ka hisaab asli me chala kar dekho');
(function () {
  const t = TPL;
  const beg = t.indexOf('  var _SK=(window.tlSortKey');
  const end = t.indexOf('rows.sort(function(a,b){return _G(b)-_G(a);});') +
              'rows.sort(function(a,b){return _G(b)-_G(a);});'.length;
  const code = t.slice(beg, end);
  const ROWS = [
    { h: 'a', followers: 100, followings: 9, tw: 5, vw: 50, lk: 10 },
    { h: 'b', followers: 900, followings: 1, tw: 50, vw: 20, lk: 500 },
    { h: 'c', followers: 500, followings: 5, tw: 1, vw: 40, lk: 5 },
  ];
  function run(key) {
    const sb = {
      rows: ROWS.slice(),
      perPost: function (tot, cnt) { cnt = +cnt || 0; return cnt > 0 ? Math.round((+tot || 0) / cnt) : 0; },
    };
    sb.window = { tlSortKey: key };
    vm.createContext(sb);
    vm.runInContext(code + '\nthis.out = rows.map(function(r){return r.h;}).join("");', sb);
    return sb.out;
  }
  ok(run('vw') === 'acb', 'Total Views se: a,c,b  [mila ' + run('vw') + ']');
  ok(run('followers') === 'bca', 'Followers se: b,c,a  [mila ' + run('followers') + ']');
  ok(run('followings') === 'acb', 'Following se: a,c,b  [mila ' + run('followings') + ']');
  ok(run('tw') === 'bac', 'Tweets se: b,a,c  [mila ' + run('tw') + ']');
  ok(run('avgv') === 'cab', 'Avg Views/Post se: c(40),a(10),b(0.4)  [mila ' + run('avgv') + ']');
  ok(run('avgl') === 'bca', 'Avg Likes/Post se: b(10),c(5),a(2)  [mila ' + run('avgl') + ']');
  ok(run('koi-bhi-galat') === 'acb', 'galat key par purana hi (Total Views)');
  ok(run(undefined) === 'acb', 'bina key ke bhi Total Views');
})();

sec('5. Button ka apna JS -- asli DOM par');
(function () {
  const m = TPL.match(/<script>\/\* ===== sort-btn[\s\S]*?<\/script>/);
  ok(!!m, 'script block mila');
  if (!m) return;
  const js = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  const els = {
    tlSortMenu: { style: { display: 'none' }, innerHTML: '', contains: () => false,
                  querySelectorAll: function () { return this._btns || []; } },
    tlSortBtn: { contains: () => false },
    tlSortLbl: { textContent: '' },
  };
  const made = [];
  const sb = {
    document: {
      getElementById: id => els[id] || null,
      addEventListener: function () {},
      readyState: 'complete',
      querySelector: function () { return null; },
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    setTimeout: function () {},
    console: { log() {} },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(js, sb);
  /* 12-Oct (Fix.md item 4): default ab Avg Views/Post hai */
  ok(sb.window.tlSortKey === 'avgv', 'shuru me Avg Views/Post');
  ok(typeof sb.window.tlSortMenu === 'function', 'button ka handler bana');
  ok(typeof sb.window.tlTitleFix === 'function', 'heading theek karne wala bhi bana');
  /* menu kholo */
  sb.window.tlSortMenu();
  ok(els.tlSortMenu.style.display === 'block', 'click par list khulti hai');
  ok(els.tlSortMenu.innerHTML.indexOf('Followers') > 0, 'list me Followers dikhta hai');
  ok(els.tlSortMenu.innerHTML.indexOf('✓') > 0, 'jo chuna hai uspar tick');
  ok(els.tlSortLbl.textContent === 'Avg Views/Post', 'button par chuna hua naam');
  sb.window.tlSortMenu();
  ok(els.tlSortMenu.style.display === 'none', 'dobara click par band');
})();


sec('6. BUILD stamp -- purana server pakadne ke liye');
ok(/var BUILD = /.test(SRV), 'BUILD line hai');
ok(SRV.indexOf('var BUILD') < SRV.indexOf('Server build: '), 'panel me dikhane se PEHLE ban jaata hai');
ok(SRV.indexOf('var BUILD') < SRV.indexOf("app.get('/api/build'"), '/api/build se pehle ban jaata hai');
ok(SRV.indexOf("const fs = require('fs')") < SRV.indexOf('var BUILD'), 'fs pehle se maujood hai');
ok(SRV.indexOf('Server build: ') > 0, 'Active Logins ke upar build dikhta hai');
ok(SRV.indexOf("app.get('/api/build'") > 0, '/api/build endpoint bhi hai');

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
