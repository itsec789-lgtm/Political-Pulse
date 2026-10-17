/* t_upterms.js -- Fix.md item 5: UP par "State" ki jagah "District".
   Ye test template ke ANDAR ka sach jaanchta hai (dono template padhkar).
   Asli browser me chalakar bhi jaancha gaya tha; wo harness container me
   hai (playwright chahiye), isliye yahan wo hissa nahi hai. */
const fs = require('fs'), path = require('path');
const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
let P = 0, F = 0; const bad = [];
function ok(c, n, x) {
  if (c) { P++; console.log('  ok   ' + n); }
  else { F++; bad.push(n); console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + x : '')); }
}
function sec(t) { console.log('\n== ' + t + ' =='); }

/* ek <table> ka block jisme ye tbody hai */
function tbl(s, body) {
  const k = s.indexOf('id="' + body + '"');
  if (k < 0) return null;
  const j = s.lastIndexOf('<table', k);
  return s.slice(j, s.indexOf('</table>', k));
}
function cfg(s, key) {
  const m = s.match(new RegExp('window\\.' + key + "\\s*=\\s*'([^']*)'"));
  return m ? m[1] : null;
}

sec('1. config -- yahi ek jagah dono template me farak hai');
ok(cfg(TPL, 'ROW_LOC_F') === 'state', 'All-India: ROW_LOC_F = state', cfg(TPL, 'ROW_LOC_F'));
ok(cfg(TPL, 'PF_LOCF') === 'state', 'All-India: PF_LOCF = state', cfg(TPL, 'PF_LOCF'));
ok(cfg(TPL, 'PF_ALL_LBL') === 'All India', 'All-India: PF_ALL_LBL = All India', cfg(TPL, 'PF_ALL_LBL'));
ok(cfg(UTPL, 'ROW_LOC_F') === 'loc', 'UP: ROW_LOC_F = loc', cfg(UTPL, 'ROW_LOC_F'));
ok(cfg(UTPL, 'PF_LOCF') === 'loc', 'UP: PF_LOCF = loc', cfg(UTPL, 'PF_LOCF'));
ok(cfg(UTPL, 'PF_ALL_LBL') === 'All Districts', 'UP: PF_ALL_LBL = All Districts', cfg(UTPL, 'PF_ALL_LBL'));
/* config <body> ke turant baad -- taaki baaki saara JS isse padh sake */
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const i = x[1].indexOf('<body>'), j = x[1].indexOf('window.ROW_LOC_F');
  ok(j > i && j - i < 500, x[0] + ': config <body> ke turant baad hai', 'body@' + i + ' cfg@' + j);
});

sec('2. location cell ek hi field se banti hai (JS dono me ek jaisa)');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf("${escH(h[window.ROW_LOC_F||'state']||h.state||'—')}") > 0,
     n + ': buildLeaderRow ROW_LOC_F se (state fallback ke saath)');
  ok(t.indexOf("esc(h[window.ROW_LOC_F||'state']||h.state||'—')") > 0,
     n + ': mlaRow bhi usi se');
  ok(/state: \(function \(\) \{[\s\S]{0,200}W\.PF_LOCF \|\| 'state'/.test(t),
     n + ': parties-v2 ka HS bhi PF_LOCF se');
  ok(t.indexOf("if (W.PF_LOCF === 'loc' && v === 'Uttar Pradesh') v = '';") > 0,
     n + ': loc me poore state ka naam district nahi maana jaata');
  ok(t.indexOf("(W.PF_ALL_LBL || 'All India')") > 0, n + ': pfState ka pehla option config se');
});
/* purana seedha h.state wala cell kahin bacha nahi */
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  ok(x[1].indexOf("${escH(h.state||'—')}") < 0, x[0] + ': purana seedha h.state cell nahi bacha');
});

sec('3. UP ke teen table: heading District, duplicate column chhupa');
['leadersBody', 'mlaBody', 'upHandlesBody'].forEach(function (b) {
  const t = tbl(UTPL, b);
  ok(!!t, 'UP: ' + b + ' ki table mili');
  if (!t) return;
  ok(t.indexOf('<th>District</th>') > 0, 'UP: ' + b + ' ka heading "District"');
  ok(t.indexOf('<th>State</th>') < 0, 'UP: ' + b + ' me "State" heading nahi bachi');
  ok(t.indexOf('id="tbl_' + b + '"') > 0, 'UP: ' + b + ' ki table ko id mili (CSS scope)');
  /* teesra column CSS se chhupa hua */
  ok(new RegExp('#tbl_' + b + ' th:nth-child\\(3\\)').test(UTPL),
     'UP: ' + b + ' ka teesra column chhupane ka rule maujood');
});
ok(/#tbl_leadersBody td:nth-child\(3\)[^{]*\{display:none\}|display:none\}/.test(UTPL),
   'UP: chhupane ka rule display:none hai');

sec('4. All-India ke wahi table waise ke waise');
['leadersBody', 'mlaBody'].forEach(function (b) {
  const t = tbl(TPL, b);
  ok(!!t && t.indexOf('<th>State</th>') > 0, 'All-India: ' + b + ' ka heading "State" hi hai');
  ok(!!t && t.indexOf('<th>District</th>') < 0, 'All-India: ' + b + ' me "District" nahi aaya');
});
ok(TPL.indexOf('#tbl_leadersBody') < 0, 'All-India me column chhupane wala CSS nahi gaya');
ok(TPL.indexOf('<th>PC / AC Name</th>') > 0, 'All-India: "PC / AC Name" column waisa hi');

sec('5. UP ke filter ke naam');
ok(UTPL.indexOf('<span class="filter-label">District</span>') > 0, 'UP: parties filter ka label "District"');
ok(UTPL.indexOf('<span class="filter-label">State</span>') < 0, 'UP: parties filter me "State" nahi bacha');
ok(TPL.indexOf('<span class="filter-label">State</span>') > 0, 'All-India: label "State" hi hai');
ok(UTPL.indexOf("fillStateSel('mlaStateFilter','All Districts')") > 0,
   'UP: INIT me mlaStateFilter ka label bhi "All Districts"');
ok(UTPL.indexOf("fillStateSel('mlaStateFilter','All States')") < 0,
   'UP: purana "All States" wala INIT nahi bacha');
ok(UTPL.indexOf('<option value="">All Districts</option>') > 0, 'UP: markup me bhi "All Districts"');
ok(UTPL.indexOf('var MLA_LOCF=\'loc\'') > 0, 'UP: Legislators ka filter loc par (item 3 se)');
ok(/id="tlState" class="filter-select" data-field="loc"/.test(UTPL),
   'UP: Top Leaders ka filter bhi loc par (item 4 se)');

sec('6. upHandlesTable me "Uttar Pradesh" likha hua nahi bacha');
ok(UTPL.indexOf('<td style="font-weight:600;font-size:11px">Uttar Pradesh</td>') < 0,
   'UP: hardcoded "Uttar Pradesh" cell hat gaya');
ok(/<td style="font-weight:600;font-size:11px">'\+esc\(h\.loc\|\|'—'\)\+'<\/td>/.test(UTPL),
   'UP: uski jagah loc aata hai');

sec('7. jo JAAN-BOOJHKAR "State" hi rehna chahiye (ye sach me state hai)');
[['India map ka title', 'CM Twitter Presence by State'],
 ['CM panel', 'State CMs &mdash; Twitter Stats'],
 ['map ka dropdown', 'id="stateSel"'],
 ['map se khuli table ka column', '<th>State</th>'],
 ['CM detail', "['State / UT',s.state]"],
 ['Handle-Request ka Excel column', '<span class="hrq-chip">State</span>'],
 ['manual rows ka Excel column', '"Handle","State"']
].forEach(function (x) {
  ok(UTPL.indexOf(x[1]) > 0, 'UP me waisa hi: ' + x[0]);
});

console.log('\n================ RESULT ================');
console.log('PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\nFAILS:'); bad.forEach(function (x) { console.log(' - ' + x); }); process.exitCode = 1; }
