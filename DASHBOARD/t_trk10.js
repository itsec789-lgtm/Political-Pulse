/* t_trk10.js -- aapke 8 label, aur "kaunsa python" wali madad */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SENT = require('./sentiment.js');
var TS = require('./tracker_section.js');
var XSRC = fs.readFileSync('./x_scraper.js', 'utf8');

sec('1. Package ke ASLI 8 label file me hain');
/* Ye naam sentiment_tagger 3.0.0 ke st.LABELS se hain -- haath se nahi likhe.
   User ne hyphen wale (PRO-BJP) bheje the; package space wale deta hai
   (Pro BJP, Pro Govt.). File me package wale hi rakhe hain, aur milaan
   dono shakal ko ek maanta hai. */
var WANT = ['Pro BJP', 'Anti BJP', 'Pro Govt.', 'Anti Govt.',
            'Positive', 'Negative', 'Neutral', 'No Sentiments'];
var got = SENT.expected();
ok(got.length === 8, 'poore 8 label: ' + got.length);
WANT.forEach(function (l) { ok(got.indexOf(l) >= 0, 'label maujood: ' + l); });

sec('2. Milaan: kya maaf hai, kya nahi');
function inList(x) { return SENT.unexpected([x]).length === 0; }
[['Pro BJP', true, 'package jo deta hai'],
 ['PRO-BJP', true, 'user ki hyphen wali shakl bhi chalti hai'],
 ['pro bjp', true, 'chhote akshar maaf'],
 ['Pro-BJP', true, 'purani 7-class wali shakl bhi'],
 ['Pro Govt.', true, 'point ke saath (package ka asli naam)'],
 ['PRO-GOVT', true, 'bina point, hyphen ke saath'],
 ['Pro Govt', true, 'bina point'],
 ['  Anti Govt.  ', true, 'aage-peeche ki space maaf'],
 ['No Sentiments', true, 'package ka naam'],
 ['NO- SENTIMENTS', true, 'user ki shakl'],
 ['NO-SENTIMENTS', true, 'hyphen bina space'],
 ['Negative', true, 'sahi spelling'],
 ['NEGETIVE', false, 'GALAT spelling pakdi gayi -- yahi to pakadni thi'],
 ['Pro SP', false, 'list se bahar ka label'],
 ['Mixed', false, 'anjaan label']
].forEach(function (t) {
  ok(inList(t[0]) === t[1], t[2] + ' -> ' + (inList(t[0]) ? 'list me' : 'BAHAR'));
});
ok(SENT.unexpected(['']).length === 0, 'khaali label par shor nahi');
ok(SENT.unexpected([]).length === 0, 'kuch na ho to kuch nahi');
ok(SENT.unexpected(WANT).length === 0, 'poori asli list ek saath paas');
ok(SENT.unexpected(WANT.concat(['X-Y'])).length === 1, 'ek galat ghusa to wahi ek pakda gaya');
ok(SENT.norm('Pro Govt.') === SENT.norm('PRO-GOVT'), 'norm() dono shakal ko ek karta hai');
ok(SENT.norm('Negative') !== SENT.norm('Negetive'), 'norm() spelling ki galti nahi chhipata');

sec('3. Scrape ke dauraan jaanch aur ginti');
ok(/STATE\.sentCounts\[res\[i\]\.label\]/.test(XSRC), 'har label ki ginti rakhi jaati hai');
ok(/const odd = SENT\.unexpected\(/.test(XSRC), 'har batch par jaanch hoti hai');
ok(/STATE\.oddLabels\.indexOf\(x\) >= 0\) return;/.test(XSRC), 'ek hi label par baar-baar shor nahi');
ok(/is not listed in sentiment_labels\.json/.test(XSRC), 'log me saaf wajah');
ok(/it will still be stored/.test(XSRC), 'batata hai ki data phir bhi save hota hai');
ok(/sentimentCounts: STATE\.sentCounts/.test(XSRC), 'ginti panel tak jaati hai');
ok(/sentimentOdd: STATE\.oddLabels/.test(XSRC), 'galat label panel tak jaate hain');

sec('4. "Kaunsa Python" wali madad');
ok(typeof SENT.pyInfo === 'function', 'pyInfo() export hui');
ok(/sentimentPython: SENT\.pyInfo\(\)/.test(XSRC), 'status me python ki jaankari');
var CLI = fs.readFileSync('./sentiment_cli.py', 'utf8');
ok(/'python': sys\.executable/.test(CLI), 'python ka poora path bheja jaata hai');
ok(/'version': platform\.python_version\(\)/.test(CLI), 'version bhi');
ok(/'why': why/.test(CLI), 'import kyun fail hua wo bhi');
ok(/import sentiment_tagger            # noqa/.test(CLI), 'asli import error pakda jaata hai');

var J = TS.script();
var fn = new Function('document', 'console',
  J.replace(/if\(document\.getElementById\('sec-tracker'\)\)\{[\s\S]*$/, '') +
  '\nreturn {h:trkSentHtml};');
var api = fn({ getElementById: function () { return null; } }, console);
var out = api.h({ sentimentEngine: 'wordlist', sentimentTrained: false, sentimentStrict: true,
  sentimentExpected: WANT,
  sentimentPython: { path: 'C:\\Users\\hp\\anaconda3\\python.exe', version: '3.13.5',
    why: "ModuleNotFoundError: No module named 'sentiment_tagger'" } });
ok(/anaconda3\\python\.exe/.test(out), 'python ka poora path banner me');
ok(/Python 3\.13\.5/.test(out), 'version bhi');
ok(/Install into <b>that<\/b> one/.test(out), 'saaf likha hai kis python me install karna hai');
ok(/ModuleNotFoundError/.test(out), 'asli error dikhaya gaya');
ok(/-m pip install /.test(out), 'command usi python ke saath bana');
ok(/sentiment_tagger-3\.0\.0-py3-none-any\.whl/.test(out), 'bundled wheel ka naam diya hai');
ok(/INSTALL_SENTIMENT\.bat/.test(out), 'ek-click wali .bat pehle suggest hui');
ok(out.indexOf('C:\\Users\\hp\\anaconda3\\python.exe" -m pip install') >= 0,
   'command me wahi python quote ke saath');
ok(/Pro BJP, Anti BJP/.test(out), 'aapke apne label banner me dikhte hain');

/* python hi na mile */
var out2 = api.h({ sentimentEngine: 'unavailable', sentimentTrained: false, sentimentStrict: true,
  sentimentPython: { why: 'Python mila hi nahi (python / py / python3 -- teeno)' } });
ok(/Python mila hi nahi/.test(out2), 'python hi na mile to wo bhi batata hai');
ok(/-m pip install /.test(out2) && /"python" -m pip/.test(out2),
   'path na ho to saadharan command dikhata hai');

sec('5. Trained model mil jaane par');
var good = api.h({ sentimentEngine: 'sentiment_tagger', sentimentTrained: true,
  sentimentLabels: WANT, sentimentExpected: WANT,
  sentimentCounts: { 'PRO-BJP': 9, 'NEUTRAL': 31, 'ANTI-GOVT': 2 }, sentimentOdd: [] });
ok(/your trained model/.test(good), 'hara banner');
ok(/Labels the model reports/.test(good), 'model ke label');
ok(/Labels expected/.test(good), 'file wali list');
ok(/NEUTRAL 31/.test(good), 'pichhle run ki ginti');
ok(good.indexOf('ad-err') < 0, 'sab theek ho to koi laal warning nahi');
var odd = api.h({ sentimentEngine: 'sentiment_tagger', sentimentTrained: true,
  sentimentLabels: WANT, sentimentExpected: WANT,
  sentimentCounts: { 'NEGATIVE': 4 }, sentimentOdd: ['NEGATIVE'] });
ok(/Labels not in your list: NEGATIVE/.test(odd), 'spelling na mile to turant pakda jaata hai');
ok(/do not\s*\n?\s*know about them|do not know about them/.test(odd.replace(/\s+/g, ' ')),
   'batata hai ki dashboard unhe nahi pehchanta');

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
