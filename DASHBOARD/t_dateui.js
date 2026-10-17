/* t_dateui.js -- har date filter ek jaisa (Full Range/Today/Yesterday/3/7/Custom)
                  + Top Leaders table ab 50 handle ka
   Chalao:  node t_dateui.js                                                */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');
const PAIRS = [['All-India', TPL], ['UP', UTPL]];

sec('1. Ek hi jagah se hisaab (window.pRange)');
PAIRS.forEach(function (x) {
  ok(x[1].indexOf('window.pRange=function(v,DD){') > 0, x[0] + ': pRange maujood hai');
});
(function () {
  const m = TPL.match(/window\.pRange=function\(v,DD\)\{[\s\S]*?\n\};/);
  ok(!!m, 'pRange ka code nikal aaya');
  const sb = { window: {} };
  sb.window.PHD_DATES = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
                         '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  vm.createContext(sb);
  vm.runInContext(m[0] + '\nthis.f = window.pRange;', sb);
  const f = sb.f;
  const J = r => r ? (r.f + '..' + r.t) : 'null';
  ok(J(f('all')) === '2026-10-01..2026-10-08', 'Full Range = poora  [' + J(f('all')) + ']');
  ok(J(f('today')) === '2026-10-08..2026-10-08', 'Today = aakhri din');
  ok(J(f('yest')) === '2026-10-07..2026-10-07', 'Yesterday = ek din pehle (sirf wahi din)  [' + J(f('yest')) + ']');
  ok(J(f('3')) === '2026-10-06..2026-10-08', '3 Days = aakhri teen din  [' + J(f('3')) + ']');
  ok(J(f('7')) === '2026-10-02..2026-10-08', '7 Days = aakhri saat din  [' + J(f('7')) + ']');
  ok(f('custom') === null, 'Custom par hisaab nahi (user khud bharta hai)');
  ok(J(f('koi-aur')) === '2026-10-01..2026-10-08', 'anjaan value par poori range');
  ok(f('all', []) === null, 'date hi na hon to null (gir nahi jaata)');
  ok(J(f('yest', ['2026-10-08'])) === '2026-10-08..2026-10-08', 'ek hi din ho to Yesterday bhi wahi');
  ok(J(f('all', ['2026-01-01', '2026-01-02'])) === '2026-01-01..2026-01-02', 'apni list do to usi se');
})();

sec('2. Har handler ab pRange hi poochta hai');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ['_preset', 'hashPresetChange', 'cmPreset', 'upBarPreset', 'profPresetChange',
   'dashPresetChange', 'ntPreset'].forEach(function (fn) {
    ok(t.indexOf(fn) > 0, n + ': ' + fn + ' maujood hai');
  });
  ok(!/parseInt\(v,10\);f=DD\[Math\.max/.test(t), n + ': purana apna-apna hisaab hat gaya');
  ok(!/\(v==='today'\?DD\[DD\.length-1\]:DD\[Math\.max/.test(t), n + ': dusra purana hisaab bhi hat gaya');
  ok((t.match(/window\.pRange\(/g) || []).length >= 6, n + ': 6+ jagah pRange bulaya jaata hai');
});

sec('3. Sab dropdown me bilkul wahi 6 option');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/\['all','Full Range'\],\['today','Today'\],\['yest','Yesterday'\]/.test(t), n + ': pehle teen option');
  ok(/\['3','3 Days'\],\['7','7 Days'\],\['custom','Custom'\]/.test(t), n + ': baaki teen option');
  ok(t.indexOf('window.normDatePresets=normOpts') > 0, n + ': normOpts bahar se bhi bulaya ja sakta hai');
  ok(t.indexOf('select[id$="Preset"]') > 0, n + ': har "...Preset" dropdown par lagta hai');
  ok(t.indexOf('      normOpts();\n      bars()') > 0, n + ': sync() par har baar jaanchta hai');
});

sec('4. normOpts() ko asli me chala kar dekho');
(function () {
  const beg = TPL.indexOf('  var PRESETS=[');
  const end = TPL.indexOf('  window.normDatePresets=normOpts;') + '  window.normDatePresets=normOpts;'.length;
  const code = TPL.slice(beg, end);
  function mkSel(id, opts, val) {
    const o = opts.map(p => ({ value: p[0], textContent: p[1] }));
    return {
      id: id, options: o, _value: val, innerHTML: '',
      get value() { return this._value; },
      set value(v) { this._value = v; },
      set _html(x) {},
    };
  }
  /* innerHTML set hote hi options dobara banein -- asli browser jaisa */
  function wire(sel) {
    Object.defineProperty(sel, 'innerHTML', {
      get() { return sel.__h || ''; },
      set(h) {
        sel.__h = h;
        sel.options = (h.match(/<option value="([^"]*)">([^<]*)<\/option>/g) || []).map(function (s) {
          const m = s.match(/value="([^"]*)">([^<]*)</);
          return { value: m[1], textContent: m[2] };
        });
      },
    });
    return sel;
  }
  const a = wire(mkSel('tlPreset', [['today', 'Today (1 Jul)'], ['all', 'Full Range (Apr–Jul)'],
                                    ['3', 'Last 3 Days'], ['7', 'Last 7 Days'],
                                    ['14', 'Last 14 Days'], ['custom', 'Custom']], 'all'));
  const b = wire(mkSel('trPreset', [['today', 'Today'], ['all', 'Full Range'], ['3', 'Last 3 Days'],
                                    ['7', 'Last 7 Days'], ['30', 'Last 30 Days'], ['custom', 'Custom']], '30'));
  const sels = [a, b];
  const sb = { document: { querySelectorAll: () => sels }, console: { log() {} } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(code + '\nthis.n = normOpts;', sb);
  sb.n();
  const vals = a.options.map(o => o.value).join(',');
  const labs = a.options.map(o => o.textContent).join(',');
  ok(vals === 'all,today,yest,3,7,custom', 'option ka kram: ' + vals);
  ok(labs === 'Full Range,Today,Yesterday,3 Days,7 Days,Custom', 'naam: ' + labs);
  ok(a.value === 'all', 'jo pehle chuna tha (Full Range) wahi raha');
  ok(b.value === 'custom', '"Last 30 Days" ab list me nahi -> Custom ban gaya  [' + b.value + ']');
  /* dobara chalane par kuch na badle */
  b.value = 'yest';
  sb.n();
  ok(b.value === 'yest', 'dobara chalne par chuna hua mitta nahi');
  ok(b.options.length === 6, 'option dobara nahi jude  [' + b.options.length + ']');
})();

sec('5. Top Leaders table ab 50 ka');
PAIRS.forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/var LEAD_N = 50;/.test(t), n + ': LEAD_N = 50');
  ok(!/var LEAD_N = 15;/.test(t), n + ': purana 15 hat gaya');
  ok(t.indexOf('Top 50 Handles by Views') > 0, n + ': heading me bhi "Top 50"');
  ok(t.indexOf('rows=rows.slice(0,LEAD_N);') > 0, n + ': table usi ginti se katta hai');
  ok(t.indexOf('var _short=Math.max(0,LEAD_N-rows.length);') > 0,
     n + ': 50 se kam bache to neeche saaf likha aata hai');
});

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
