/* t_exec.js -- Executive Summary ke chaaron card date filter maante hain
     Key Highlights / Sentiment Insights / Party Performance / Top Performers
   Chalao:  node t_exec.js                                                  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const TPL = fs.readFileSync(path.join(__dirname, 'dashboard.template.html'), 'utf8');
const UTPL = fs.readFileSync(path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html'), 'utf8');

sec('1. Page par koi hardcoded aankda nahi bacha');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  const a = t.indexOf('<div class="summary-grid">');
  const b = t.indexOf('</div>\n  </div>\n', t.indexOf('id="execTop"'));
  const seg = t.slice(a, b);
  const rows = seg.match(/<div class="insight-text">(.*?)<\/div>/g) || [];
  /* 09-Oct: Sentiment Insights card ab JS se banta hai (8 sentiment +
     unke matlab), isliye uski 5 baked line hat gayi -- 3 card x 5 = 15 */
  ok(rows.length === 15, n + ': teen card me 5-5 line (kul 15)  [mila ' + rows.length + ']');
  ok(t.indexOf('id="siRows"') > 0, n + ': Sentiment Insights ab JS se bharta hai');
  ok(rows.every(r => r.indexOf('Loading') > 0), n + ': shuru me sab "Loading…" (purana aankda nahi)');
  ok(!/narendramodi<\/strong> tops with <strong>1/.test(seg), n + ': purana "113 Cr" wala text hat gaya');
  ok(!/85\.2%|86,865,755|498,914/.test(seg), n + ': purane sentiment/party ke number hat gaye');
});

sec('2. hExecRange() ko asli me chala kar dekho');
function getFn(t) {
  const b = t.indexOf('function hExecRange(f, t) {');
  let i = t.indexOf('{', b), d = 0, e = -1;
  for (let j = i; j < t.length; j++) {
    if (t[j] === '{') d++; else if (t[j] === '}') { d--; if (!d) { e = j + 1; break; } }
  }
  return t.slice(b, e);
}
const FN = getFn(TPL);
ok(FN.length > 500, 'hExecRange mil gaya');

const DATES = ['2026-04-01', '2026-04-02', '2026-04-03'];
function mkDom() {
  function card(id, n) {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ innerHTML: 'Loading…' });
    return {
      id: id, _rows: rows,
      querySelectorAll: function (q) { return q === '.insight-text' ? rows : []; },
      querySelector: function (q) {
        if (q === '.sum-card-title') return this._ttl || (this._ttl = {
          _kids: [], querySelector: function () { return this._note || null; },
          appendChild: function (el) { this._note = el; this._kids.push(el); },
        });
        if (q === '.si-note') return (this._ttl && this._ttl._note) || null;
        return null;
      },
    };
  }
  const els = { khCard: card('khCard', 5), siCard: card('siCard', 5), ppCard: card('ppCard', 5) };
  return {
    els: els,
    document: {
      getElementById: id => els[id] || null,
      createElement: () => ({ style: { cssText: '' }, textContent: '', className: '' }),
    },
  };
}
function run(f, t) {
  const dom = mkDom();
  const sb = {
    document: dom.document,
    console: { log() {} },
    D: {
      AD: DATES,
      HOURLY: [0, 0, 5],
      handles: [
        { h: 'modi', n: 'Modi', p: 'BJP', s: 'Uttar Pradesh', t: [10, 0, 0], v: [1000, 0, 0] },
        { h: 'rahul', n: 'Rahul', p: 'INC', s: 'Kerala', t: [0, 7, 0], v: [0, 9000, 0] },
        { h: 'akhilesh', n: 'Akhilesh', p: 'SP', s: 'Uttar Pradesh', t: [0, 0, 3], v: [0, 0, 50] },
        { h: 'tdp1', n: 'TDP ji', p: 'TDP', s: 'Andhra Pradesh', t: [1, 1, 1], v: [5, 5, 5] },
        { h: 'dmk1', n: 'DMK ji', p: 'DMK', s: 'Tamil Nadu', t: [1, 1, 1], v: [4, 4, 4] },
        { h: 'aap1', n: 'AAP ji', p: 'AAP', s: 'Delhi', t: [1, 1, 1], v: [3, 3, 3] },
      ],
    },
    PHD: { modi: { k: [5, 0, 0] }, rahul: { k: [0, 50, 0] }, akhilesh: { k: [0, 0, 1] },
           tdp1: { k: [0, 0, 0] }, dmk1: { k: [0, 0, 0] }, aap1: { k: [0, 0, 0] } },
    UNI: { sent: { neu: 999, pos: 999, neg: 999, none: 0 } },
    SENT_DAILY: {
      dates: DATES,
      S: { ALL: { neu: [8, 0, 0], pos: [2, 0, 0], neg: [0, 0, 0], probjp: [0, 0, 0],
                  antibjp: [0, 0, 0], progovt: [0, 0, 0], antigovt: [0, 0, 0], none: [0, 0, 0] } },
    },
    HTFULL: { all: [
      { tag: '#modi', c: 100, d: [100, 0, 0] },
      { tag: '#inc', c: 60, d: [0, 60, 0] },
      { tag: '#sp', c: 1, d: [0, 0, 1] },
    ] },
    fmt: x => String(x),
    nd: x => x,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(FN + '\nthis.f = hExecRange;', sb);
  sb.f(f, t);
  return {
    kh: dom.els.khCard._rows.map(r => r.innerHTML),
    si: dom.els.siCard._rows.map(r => r.innerHTML),
    pp: dom.els.ppCard._rows.map(r => r.innerHTML),
    note: (dom.els.siCard._ttl && dom.els.siCard._ttl._note
            && dom.els.siCard._ttl._note.textContent) || '',
  };
}

sec('3. Key Highlights');
const d1 = run('2026-04-01', '2026-04-01');
const d2 = run('2026-04-02', '2026-04-02');
const all = run('2026-04-01', '2026-04-03');
ok(/@modi/.test(d1.kh[0]), 'din-1 par top handle @modi  [' + d1.kh[0].slice(0, 46) + ']');
ok(/@rahul/.test(d2.kh[0]), 'din-2 par top handle @rahul (badal gaya)');
ok(/BJP/.test(d1.kh[1]) && /INC/.test(d2.kh[1]), 'top party bhi range ke saath badalti hai');
ok(/2026-04-01/.test(d1.kh[2]) && /2026-04-02/.test(d2.kh[2]), 'peak day chuni hui range ka');
ok(/Uttar Pradesh/.test(d1.kh[4]) && /Kerala/.test(d2.kh[4]), 'top state bhi badalta hai');
ok(/full range/.test(d1.kh[3]), 'peak hour par saaf likha hai ki wo poori range ka hai');
ok(!/full range/.test(all.kh[3]), 'poori range chuno to wo note hat jaata hai');

sec('4. Sentiment Insights ab hExecRange ka kaam nahi (si-compact 09-Oct)');
/* Pehle ye card hExecRange likhta tha -- 3 sentiment + likes + hashtag.
   Ab poora card renderSentInsights() banata hai (7 sentiment, compact),
   isliye hExecRange usey chhoota bhi nahi. */
ok(d1.si.every(function (r) { return r === 'Loading\u2026'; }),
   'hExecRange siCard ki line chhoota hi nahi  [' + d1.si[0].slice(0, 30) + ']');
ok(d1.si.join('') === all.si.join(''), 'date badalne par bhi wahan se kuch nahi likha jaata');
ok((TPL.match(/if\(window\.renderSentInsights\) window\.renderSentInsights\(\);/g) || []).length === 2,
   'uski jagah dono exec function renderSentInsights() bulate hain');
ok(TPL.indexOf('var si = null') > 0, 'purana siCard code dead hai (si = null)');
ok(TPL.indexOf('<div id="siRows"></div>') > 0, 'card ki poori body renderSentInsights bharta hai');
ok(d1.note === '', 'title par koi chetawni (si-note) nahi chipkti');

sec('6. Party Performance');
ok(/BJP/.test(d1.pp[0]) && !/INC/.test(d1.pp[0]), 'din-1 par sabse upar BJP');
ok(/INC/.test(d2.pp[0]), 'din-2 par sabse upar INC');
ok(/10 tweets/.test(d1.pp[0]), 'ginti range ki hai  [' + d1.pp[0].slice(0, 44) + ']');
ok(/1 handles/.test(d1.pp[0]), 'handle ki ginti bhi range ki');
ok(/Others/.test(all.pp[4]), 'baaki sab "Others" me jud jaate hain');
ok(/\u2014/.test(run('2026-04-03', '2026-04-03').pp[4]) || /Others/.test(run('2026-04-03','2026-04-03').pp[4]),
   'party kam hon to khaali line par "\u2014" (purana aankda nahi)');
ok(!/Loading/.test(d1.pp.join('')) && !/Loading/.test(d1.kh.join('')),
   'Key Highlights / Party Performance me kahin "Loading..." nahi reh jaata');

sec('7. Top Performers date ke saath banta hai');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  ok(/_etop.innerHTML=top\.slice\(0,5\)/.test(t), n + ': list har baar range ke "top" se banti hai');
  ok(t.indexOf('var _pmap={};try{(D.handles||[])') > 0, n + ': party ka naam taaze D.handles se');
  ok(t.indexOf('No handle posted in this date range') > 0, n + ': khaali range par saaf message');
  ok(/window\.hExecRange&&window\.hExecRange\(f,t\)/.test(t), n + ': date badalte hi dobara banta hai');
});

sec('8. UP template me bhi wahi hisaab');
ok(getFn(UTPL).indexOf('SENT_DAILY') > 0, 'UP: sentiment SENT_DAILY se');
ok(getFn(UTPL).indexOf('HTFULL') > 0, 'UP: hashtag HTFULL ke per-din se');


sec('9. ASLI dikkat : D global par tha hi nahi');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  ok(t.indexOf('try{window.D=D;}catch(e){}') > 0, n + ': D ab window par hai');
  ok(t.indexOf('const D="__MONGO_D__"') < t.indexOf('try{window.D=D;}catch(e){}'),
     n + ': declare hone ke turant baad expose hota hai');
  /* hExecRange D ko bahar se hi padhta hai -- isliye expose hona zaroori hai */
  const fn = (function () {
    const b = t.indexOf('function hExecRange(f, t) {');
    let i = t.indexOf('{', b), d = 0, e = -1;
    for (let j = i; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}') { d--; if (!d) { e = j + 1; break; } } }
    return t.slice(b, e);
  })();
  ok(/typeof D === 'undefined'/.test(fn), n + ': hExecRange pehle D ki maujoodgi dekhta hai');
  ok(fn.indexOf('D.handles') > 0, n + ': aur usi D se handle ka per-din data uthata hai');
});

sec('10. hExec (poori range wala) ab chuni hui range ko mitata nahi');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  const n = x[0], t = x[1];
  const b = t.indexOf('function hExec(){');
  const head = t.slice(b, b + 700);
  ok(head.indexOf('window.hExecRange(_hf,_ht);return;') > 0,
     n + ': range chuni ho to kaam hExecRange ko de kar laut jaata hai');
  ok(head.indexOf('window.hExecRange') < head.indexOf("if(!UNI"),
     n + ': ye jaanch poore hisaab se PEHLE hoti hai');
});
(function () {
  const b = TPL.indexOf('function hExec(){');
  let i = TPL.indexOf('{', b), d = 0, e = -1;
  for (let j = i; j < TPL.length; j++) { if (TPL[j] === '{') d++; else if (TPL[j] === '}') { d--; if (!d) { e = j + 1; break; } } }
  const fn = TPL.slice(b, e);
  let called = null;
  const sb = {
    document: { getElementById: id => ({ dashFrom: { value: '2026-10-02' }, dashTo: { value: '2026-10-08' } })[id] || null,
                querySelectorAll: () => [] },
    console: { log() {} },
    UNI: { tot: {}, allHandles: [], party: {}, sent: {} },
  };
  sb.window = sb;
  sb.window.PHD_DATES = ['2026-04-01', '2026-10-08'];
  sb.window.hExecRange = function (f, t) { called = f + '..' + t; };
  vm.createContext(sb);
  vm.runInContext(fn + '\nthis.f = hExec;', sb);
  sb.f();
  ok(called === '2026-10-02..2026-10-08',
     'range chuni hui ho to hExec ne hExecRange ko hi bulaya  [' + called + ']');
  called = null;
  sb.document.getElementById = id => ({ dashFrom: { value: '2026-04-01' }, dashTo: { value: '2026-10-08' } })[id] || null;
  sb.f();
  ok(called === null, 'poori range par hExec apna hi (poora) hisaab likhta hai');
})();

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(m => console.log('   - ' + m)); }
console.log('========================================================');
process.exit(F ? 1 : 0);
