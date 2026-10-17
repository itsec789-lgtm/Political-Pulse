/* t_msbar.js -- mapping sync ruk jaaye to page par saaf patti dikhti hai
   Chalao:  node t_msbar.js                                               */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

sec('1. Patti banti hai (sirf tab jab sync FAIL hui ho)');
ok(SRV.indexOf('if (_ms && _ms.ok === false)') > 0, 'sirf fail par banti hai');
ok(SRV.indexOf('Mapping sync is stuck') > 0, 'seedhi baat likhi hai (ab English me)');
ok(SRV.indexOf('<b>old mapping</b>') > 0, 'batata hai ki ginti purani mapping ki hai');
ok(SRV.indexOf('FIX_EXCEL_READER.bat') > 0, 'openpyxl wala ilaaj likha hai');
ok(SRV.indexOf('Fix: run DASHBOARD\\\\RUN_MAPPING_UPDATE.bat') > 0, 'baaki haalat ka ilaaj bhi');
ok(SRV.indexOf('hpEsc(_why)') > 0, 'wajah escape karke dikhayi jaati hai');
ok(SRV.indexOf('last attempt:') > 0, 'aakhri koshish ka samay bhi');

sec('2. Banayi hui patti ko asli DOM par daal kar dekho');
(function () {
  const beg = SRV.indexOf("    + (msBar ? (\"try{if(!document.getElementById('msBar')){\"");
  const end = SRV.indexOf('}}catch(e){}") : "")', beg) + '}}catch(e){}") : "")'.length;
  ok(beg > 0 && end > beg, 'bheja jaane wala JS mil gaya');
  const expr = SRV.slice(beg, end).replace(/^\s*\+\s*/, '');
  const sample = '<div id="msBar">RUKI HUI HAI</div>';
  const js = new Function('msBar', 'JSON', 'return ' + expr + ';')(sample, JSON);
  ok(typeof js === 'string' && js.length > 20, 'string ban gayi');

  function mkEl(id) {
    return { id: id || '', children: [], firstChild: null,
      set innerHTML(h) {
        const m = h.match(/id="([^"]*)"/);
        this._kid = mkEl(m ? m[1] : '');
        this.firstChild = this._kid;
      },
      insertBefore: function (n2) { this.children.unshift(n2); this.firstChild = n2; },
      appendChild: function (n2) { this.children.push(n2); if (!this.firstChild) this.firstChild = n2; },
    };
  }
  const main = mkEl('main');
  const existing = mkEl('old');
  main.appendChild(existing);
  const byId = {};
  const sb = {
    document: {
      getElementById: id => byId[id] || null,
      querySelector: q => q === 'main' ? main : null,
      createElement: () => mkEl(''),
    },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(js, sb);
  ok(main.children.length === 2, 'patti page me jud gayi  [' + main.children.length + ']');
  ok(main.children[0].id === 'msBar', 'sabse UPAR judi hai  [' + main.children[0].id + ']');
  ok(main.children[1].id === 'old', 'purana content neeche waisa hi hai');

  /* dobara chalao -- do baar na dikhe */
  byId.msBar = main.children[0];
  vm.runInContext(js, sb);
  ok(main.children.length === 2, 'dobara chalne par do patti nahi banti');

  /* sync theek ho to kuch na jude */
  const js2 = new Function('msBar', 'JSON', 'return ' + expr + ';')('', JSON);
  ok(js2 === '', 'sync theek ho to koi JS bheja hi nahi jaata');
})();

sec('3. Python dhoondhna ab har system par chalta hai');
ok(SRV.indexOf('process.env.USERPROFILE') > 0, 'logged-in user ke folder me dhoondhta hai');
ok(SRV.indexOf("['Python313', 'Python312', 'Python311']") > 0, 'teeno version dekhta hai');
(function () {
  const b = SRV.indexOf('var PY_CANDIDATES');
  const e = SRV.indexOf('})();', b) + 5;
  const code = SRV.slice(b, e);
  const sb = { process: { env: { USERPROFILE: 'C:\\Users\\Lenovo' }, platform: 'win32' } };
  vm.createContext(sb);
  vm.runInContext(code + '\nthis.c = PY_CANDIDATES;', sb);
  const c = sb.c;
  ok(c.some(x => /Lenovo.*Python312/.test(x)), 'Lenovo wale system ka Python312 list me hai');
  ok(c.some(x => /Lenovo.*Python313/.test(x)), 'Python313 bhi');
  ok(c.indexOf('python') >= 0 && c.indexOf('py') >= 0, 'aam naam bhi bache hue hain');
  ok(c.every(x => !!x), 'koi khaali value nahi');
})();

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
