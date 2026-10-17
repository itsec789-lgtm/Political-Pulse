/* t_parties.js -- parties-v2 (10-Oct) + map-cache (10-Oct)
   Vyavhaar ki poori jaanch ASLI Chromium me hui, ASLI data ke saath:
   template me Mongo ka data bhar kar (SAMPLE_parties\_render_all.html,
   9.5 MB, 3289 handles) 71 jaanch chalayi gayi -- card ke numbers UNI/D
   se alag se ginkar milaye, cascading, Case A/B/C, chart, mobile, aur
   purane tab (Top Leaders / UP) bhi bina error ke khule.
   Yahan ye dekha jaata hai ki wahi code dono template me theek gaya hai.
   Chalao:  node t_parties.js                                            */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }
function blkOf(t, a, b) { const i = t.indexOf(a); return i < 0 ? '' : t.slice(i, t.indexOf(b, i)); }

const TPL  = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const SRV  = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. nishaan aur dhaancha');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* ===== parties-v2 (10-Oct)') > 0, n + ': CSS/JS ka nishaan');
  ok(t.indexOf('parties-v2 (10-Oct): poora tab naye sire se') > 0, n + ': markup ka nishaan');
  ok(t.indexOf('SACH KI EK HI JAGAH') > 0, n + ': ek hi shared filter state');
  ok(/var PF = \{ dmode:'all'[^}]*card:null[^}]*showAll:false \}/.test(t), n + ': PF me dropdown aur card dono');
  ok(t.indexOf("function selParty() { return PF.party || PF.card || null; }") > 0,
     n + ': dropdown ka hak card se upar');
});

sec('2. purana parties tab poora hat gaya');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ['id="partyCardsSection"', 'id="activePartyBanner"', 'id="pDateSelect"', 'id="pLevelSelect"',
   'id="pStateSelect"', 'id="pPartySelect"', 'id="pDailyChart"', 'id="pHourlyChart"',
   'id="pTopHandlesChart"', 'id="pPartyViewsChart"', 'id="partyTweetChart"', 'id="partySentChart2"'
  ].forEach(function (b) { ok(t.indexOf(b) < 0, n + ': markup se gaya -- ' + b); });
  ok(t.indexOf("setPartiesChartRange('all'") < 0, n + ": Daily ke local pill (All/7D/3D) hat gaye");
  ok(t.indexOf('window.pfRender&&window.pfRender()') > 0, n + ': switchTab ab naye renderer ko bulata hai');
  ok(t.indexOf("if(tab==='parties'){animateSentBarsAll();") < 0, n + ': purani switchTab line nahi bachi');
});

sec('3. Part 1 -- KPI card');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  /* naya card banane wale code me sentiment ka naam-o-nishaan nahi hona
     chahiye (purana pcard() abhi file me pada hai -- wo ab chalta nahi,
     use UP tab ka purana code abhi bhi chhoota hai). */
  const PV = blkOf(t, '/* ===== parties-v2 (10-Oct) : Parties tab ka naya dimaag', '</script>');
  ok(PV.indexOf('psent') < 0, n + ': naya card Sentiment Breakdown nahi banata');
  ok(PV.indexOf('Sentiment Breakdown') < 0, n + ': card me wo heading bhi nahi');
  ok(t.indexOf("box(nf(d.tw), 'Tweets') + box(F(d.vw), 'Views')") > 0, n + ': 4 stat box wahi');
  ok(t.indexOf("box(F(d.fo), 'Total Followers') + box(nf(d.fg), 'Total Following')") > 0,
     n + ': Followers/Following ki nayi patti');
  ok(t.indexOf('Handles by Designation') > 0, n + ': designation section');
  ok(t.indexOf('a handle can hold multiple designations') > 0, n + ': combined designation ka note');
  ok(/String\(q\.x\.desig\)\.split\(\/\[\\\/,\]\/\)/.test(t), n + ": designation '/' aur ',' par toot kar DONO me ginti");
  ok(t.indexOf('var DESIG_N = 8;') > 0, n + ': tile ki ginti seemit (card lamba na ho)');
  ok(t.indexOf('more roles (') > 0, n + ': baaki pad "+N more roles" me, tooltip me poori list');
  ok(t.indexOf('.pcard-spacer') > 0 && t.indexOf('.pcard{display:flex;flex-direction:column}') > 0,
     n + ': ek row ke card barabar unchai ke');
  /* Followers/Following date range par NAHI badalne chahiye */
  ok(t.indexOf('a.fo += q.x.fo; a.fg += q.x.fg;') > 0 &&
     t.indexOf('Followers/Following SNAPSHOT hain') > 0, n + ': followers snapshot hain, date se nahi bandhe');
});

sec('4. Part 2 -- Date Range ka kram');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  const i = t.indexOf('<select class="filter-select" id="pfDate"');
  const blk = t.slice(i, t.indexOf('</select>', i));
  const got = (blk.match(/value="([a-z0-9]+)"/g) || []).map(function (s) { return s.slice(7, -1); });
  ok(JSON.stringify(got) === JSON.stringify(['all', 'today', 'yest', '3d', '7d', 'custom']),
     n + ': kram all,today,yest,3d,7d,custom -> ' + got.join(','));
  ok(/>Full Range</.test(blk) && /">Today</.test(blk) && /">Yesterday</.test(blk) &&
     /">3 Days</.test(blk) && /">7 Days</.test(blk) && /">Custom</.test(blk), n + ': naam wahi jo manga tha');
  ok(t.indexOf("new Date(Date.now() + 5.5 * 3600 * 1000)") > 0, n + ': Today/Yesterday IST se gine jaate hain');
  ok(t.indexOf("if (PF.dmode === 'custom' && (!PF.from || !PF.to)) return;") > 0,
     n + ': Custom tabhi lagta hai jab dono date chuni ho');
});

sec('5. Part 3 -- cascading + khaali natija');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("Date -> Level -> State -> Party") > 0, n + ': kram wahi');
  ok(t.indexOf("var keepL = lv.indexOf(PF.level) >= 0 ? PF.level : '';") > 0,
     n + ': purana chunav valid ho to bachta hai, warna default');
  ok(t.indexOf("if (PF.card && pa.indexOf(PF.card) < 0) { PF.card = null;") > 0,
     n + ': card ka chunav valid na rahe to apne aap hat jaata hai');
  ok(t.indexOf('No data for this selection') > 0, n + ': khaali natija ka saaf message');
  ok(t.indexOf('.pf-busy{opacity:.55') > 0, n + ': data badalte waqt loading ka halka ishaara');
});

sec('6. Part 5 -- Case A / B / C');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("PF.card = (PF.card === p) ? null : p;") > 0, n + ': wahi card dobara -> deselect');
  ok(t.indexOf("if (PF.party) return;                       /* dropdown chalu -> card click bekaar */") > 0,
     n + ': dropdown chalu ho to card click bekaar');
  ok(t.indexOf("PF.party = this.value; PF.card = null;") > 0, n + ': dropdown badla -> card ka chunav saaf');
  ok(t.indexOf("var cardRows = byParty(handlesFor({ party: PF.party, range: r }));") > 0,
     n + ': Case B me sirf chuni party ka card');
  ok(t.indexOf("'Showing: ' + (sel || 'All Parties')") > 0, n + ': "Showing: ..." wali chip');
  ok(t.indexOf("tabindex=\"0\" role=\"button\"") > 0, n + ': card keyboard se bhi chun sakte hain');
  ok(t.indexOf("e.target.closest('.pcard')") > 0, n + ': stat box / designation tile par click bhi card hi chunta hai');
});

sec('7. Part 6 -- chart ke niyam');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('hourly = (span <= 3 && !!HOURLY)') > 0, n + ': chhote range (<=3 din) par x-axis ghante ka');
  ok(t.indexOf('hourly split uses the all-handles hourly shape') > 0,
     n + ': aur uska saaf label (ghante-war data asli me hai nahi)');
  ok(t.indexOf('maxTicksLimit: hourly ? 12 : 14') > 0, n + ': lambe range par label overlap nahi');
  ok(t.indexOf("rangeLabel()") > 0 && t.indexOf("$('pfDailyNote').innerHTML = '&#128197; <strong>' + rangeLabel()") > 0,
     n + ': subtitle ki date range se banti hai');
  ok(!/Apr.Jul 2026/.test(t.slice(t.indexOf('id="sec-parties"'), t.indexOf('<!-- 8. UP ANALYSIS -->'))),
     n + ': parties section me koi hardcoded date nahi');
  ok(t.indexOf('this chart does not change with the filters') > 0,
     n + ': Hourly chart par imaandaar label (data hi nahi hai)');
  ok(t.indexOf("function chartRows(all, key, sel)") > 0, n + ': chart me top-N + Others');
  ok(t.indexOf("if (sel && !keep.some(function (d) { return d.p === sel; }))") > 0,
     n + ': chuni party hamesha chart me, chaahe top-N me na ho');
  ok(t.indexOf("return (sel && d.p !== sel) ? '#cfcac2' : col(d.p);") > 0,
     n + ': ek party chuni ho to baaki grey (donut 100% ka ek tukda nahi banta)');
  ok(t.indexOf('var CATS = (W.SENTX && W.SENTX.CATS)') > 0, n + ': Sentiment chart me poori 8 category');
  ok(t.indexOf("c.dataset.label + ': ' + nf(c.raw) + ' (' + (tot ? (c.raw/tot*100).toFixed(1) : '0') + '%)'") > 0,
     n + ': sentiment tooltip me count aur % dono');
  ok(t.indexOf("var ANIM = { duration: 420, easing: 'easeOutQuart' };") > 0, n + ': data badalne par smooth animation');
});

sec('8. Part 7 -- general');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('var sc = W.scrollY;') > 0 && t.indexOf('W.scrollTo(0, sc);') > 0, n + ': scroll jahan hai wahin rehta hai');
  ok(t.indexOf('clearTimeout(rT);') > 0, n + ': debounce -- ek hi render chalta hai');
  ok(t.indexOf('_mc = Object.create(null)') > 0, n + ': ek range ke numbers ek hi baar gine jaate hain (cache)');
  ok(t.indexOf('@media(max-width:600px){.pdesig-grid{grid-template-columns:repeat(2,1fr)}}') > 0,
     n + ': mobile par tile 2 per row');
  ok(t.indexOf('try{window.AGG=AGG;}catch(e){}') > 0, n + ': AGG ab window par (poori ISO date ke liye)');
  ok(t.indexOf("var PCOL = { BJP:'#E65100', INC:'#0D47A1'") > 0,
     n + ': party ke rang dashboard wali list se hi (asli pc() IIFE me band hai)');
});

sec('9. purana kaam salaamat');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ['/* ===== table-scroll (10-Oct)', '/* ===== col-filter (09-Oct)', '/* ===== header-anim (10-Oct)',
   '/* donut-fix (09-Oct)', '/* si-compact (09-Oct)', 'hdr-layout (09-Oct)'
  ].forEach(function (k) { ok(t.indexOf(k) > 0, n + ': salaamat -- ' + k.replace('/* ===== ', '').replace('/* ', '')); });
  ok(t.indexOf('try{window.SENT_DAILY=SENT_DAILY;}catch(e){}') > 0, n + ': SENT_DAILY export salaamat');
  ok(t.lastIndexOf('</body>') > t.indexOf('/* ===== parties-v2 (10-Oct)'), n + ': script </body> se pehle');
});

sec('10. dono template me bilkul ek jaisa code');
function blk(t, a, b) { const i = t.indexOf(a); return t.slice(i, t.indexOf(b, i)); }
ok(blk(TPL, '/* ===== parties-v2 (10-Oct) : Parties tab ka naya dimaag', '</script>') ===
   blk(UTPL, '/* ===== parties-v2 (10-Oct) : Parties tab ka naya dimaag', '</script>'), 'JS byte-ke-byte ek jaisa');
ok(blk(TPL, '/* ===== parties-v2 (10-Oct) : sirf NAYA CSS', '/* ===== header-anim') ===
   blk(UTPL, '/* ===== parties-v2 (10-Oct) : sirf NAYA CSS', '/* ===== header-anim'), 'CSS byte-ke-byte ek jaisa');
/* up-terms (12-Oct): ab markup me JAAN-BOOJHKAR ek farak hai -- UP par
   location filter ka label "District" hai, All-India par "State"
   (UP me har handle ka state 'Uttar Pradesh' hi hai). Baaki markup
   bilkul ek jaisa rehna chahiye, isliye sirf us ek label ko barabar
   karke milate hain. */
(function () {
  var A = blk(TPL, '<div class="page-section" id="sec-parties">', '<!-- 8. UP ANALYSIS -->');
  var B = blk(UTPL, '<div class="page-section" id="sec-parties">', '<!-- 8. UP ANALYSIS -->');
  var LBL = '<span class="filter-label">';
  ok(A.indexOf(LBL + 'State</span>') >= 0, 'All-India par label "State"');
  ok(B.indexOf(LBL + 'District</span>') >= 0, 'UP par label "District"');
  ok(B.indexOf(LBL + 'State</span>') < 0, 'UP ke parties filter me "State" nahi bacha');
  ok(A.replace(LBL + 'State</span>', LBL + 'District</span>') === B,
     'baaki markup byte-ke-byte ek jaisa (sirf wo label alag)');
})();

sec('11b. mla-dup (10-Oct) -- "MLA / Chief Minister" ke neeche dobara MLA nahi');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* mla-dup (10-Oct)') > 0, n + ': nishaan');
  ok(t.indexOf("if(h.origLevel&&!/\\bMLA\\b/i.test(raw))") > 0,
     n + ': extra MLA chip tabhi jab designation me MLA pehle se na ho');
  ok(t.indexOf("if(h.origLevel){out+=") < 0, n + ': purani bina-shart wali line hat gayi');
  ok(t.indexOf("var raw=(window.roleOf?window.roleOf(h.h,h.origLevel||h.level)") > 0,
     n + ': jaanch escape se PEHLE wale asli text par hoti hai');
});
/* Asli Chromium me (asli data ke saath) 12 jaanch chali -- MLA tracker ki
   table me HROLE badal kar:
     "MLA / Chief Minister"  -> ek hi chip
     "Chief Minister / MLA"  -> ek hi chip (ulta kram)
     "mla / chief minister"  -> ek hi chip (chhote akshar)
     "MLA Contestant"        -> ek hi chip
     "Chief Minister"        -> do chip (MLA alag se -- purana kaam bacha)
     "Dy CM"                 -> do chip
   aur poori table me kahin dohri designation nahi. */

sec('11c. desig-wrap (10-Oct) -- lamba designation ab lipat jaata hai');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('/* desig-wrap (10-Oct)') > 0, n + ': nishaan');
  /* teeno jagah ke chip: States&CM ki table (.td-desig), MLA Tracker
     (_mlaDesigCell), aur Leader Board ka chip */
  ok(/\.td-desig\{[^}]*white-space:normal;word-break:break-word[^}]*max-width:132px/.test(t),
     n + ': States & CM ki table ka chip (.td-desig)');
  ok(t.indexOf("white-space:normal;word-break:break-word;max-width:124px;line-height:1.35;vertical-align:top;'") > 0,
     n + ': MLA Tracker ka chip');
  ok(t.indexOf("border-radius:6px;white-space:normal;word-break:break-word;display:inline-block;max-width:124px") > 0,
     n + ': Leader Board ka chip');
  ok(t.indexOf('white-space:nowrap}') < 0 || !/\.td-desig\{[^}]*white-space:nowrap/.test(t),
     n + ': kahin bhi designation par nowrap nahi bacha');
  /* Top Leaders pehle se hi wrap karta tha -- wo waisa hi rahe */
  ok(t.indexOf('white-space:normal;word-break:break-word;display:inline-block;max-width:110px') > 0,
     n + ': Top Leaders ka purana wrap waisa hi');
});
/* Asli Chromium me (asli data ke saath) 13 jaanch chali -- har handle ko
   lamba pad dekar (jaise "Chairman, Media & Publicity Dept / National
   Spokesperson") Top Leaders, States & CM, MLA Tracker aur Growth, chaaro
   tab me: chip ka white-space normal, koi chip 135px se chauda nahi, aur
   page kahin bhi daayein-baayein scroll nahi karta.
   Seedha naap bhi liya: 38 akshar ke pad par chip 81px chauda aur 3 line
   ka ho gaya, aur table ki chaudai 1403px se badli hi nahi. */

sec('11. map-cache (10-Oct) -- mapping badle to page bhi badle');
ok(SRV.indexOf('/* map-cache (10-Oct)') > 0, 'server.js me nishaan');
ok(SRV.indexOf("mp = fs.statSync(MAPL.MAP_FILE).mtimeMs;") > 0, 'handle_master.json ki tareekh dekhi jaati hai');
ok(SRV.indexOf("var key = scope + '|' + v + '|' + mt + '|' + mp;") > 0, 'wo tareekh cache ki key me hai');
ok(SRV.indexOf("dashCacheClear('mapping badli -- page dobara banega')") > 0, 'sync ke baad bana-banaya page phenk diya jaata hai');
ok(SRV.indexOf("try { MAPL._reset && MAPL._reset(); } catch (e) {}") > 0, 'MAPL ka cache bhi saaf (purana vyavhaar bacha)');
/* asli function nikaal kar chala kar dekhte hain: mapping ki tareekh
   badalte hi key badalni chahiye, baaki sab waisa hi rehne par bhi */
(function () {
  const i = SRV.indexOf('async function dashVersionKey');
  const j = SRV.indexOf('\n}', i) + 2;
  const src = SRV.slice(i, j);
  let mapMt = 1000;
  const ctx = {
    _dashVer: {}, SCOPE_DB: { all: 'a', up: 'u' }, TEMPLATE_ALL: 'T', TEMPLATE_UP: 'U',
    MAPL: { MAP_FILE: 'M' },
    fs: { statSync: function (p) { return { mtimeMs: p === 'M' ? mapMt : 5000 }; } },
    MP: { client: function () { return { connect: async function () {}, db: function () {
      return { collection: function () { return { findOne: async function () { return { value: 'v1' }; } }; } }; } }; } },
    Date: Date, console: console
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.__k = dashVersionKey;', ctx);
  (async function () {
    const k1 = await ctx.__k('all');
    ctx._dashVer = {};                 /* 5 second wala memo hata do */
    mapMt = 2000;                      /* mapping badal gayi */
    const k2 = await ctx.__k('all');
    ok(k1 !== k2, 'chala kar dekha: mapping ki tareekh badli -> key badli (' + k1 + ' -> ' + k2 + ')');
    ok(k1.indexOf('|1000') > 0 && k2.indexOf('|2000') > 0, 'key me wahi tareekh jaati hai');

    console.log('\n================ RESULT ================');
    console.log('PASS ' + P + '   FAIL ' + F);
    if (F) { console.log('\nFAILS:'); FAILS.forEach(function (m) { console.log(' - ' + m); }); process.exit(1); }
  })();
})();
