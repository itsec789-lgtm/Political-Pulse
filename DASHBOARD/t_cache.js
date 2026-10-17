/* t_cache.js -- dash-cache (10-Oct)
   server.js ka ASLI cache code nikaal kar vm me chalaya jaata hai -- nakli
   Mongo aur nakli build ke saath. Dekhna ye hai ki 200 request ek saath
   aane par build SIRF EK baar chale (yahi crash ki jad thi).
   Chalao:  node t_cache.js                                              */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
let P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) { P++; console.log('  ok   ' + m); } else { F++; FAILS.push(m); console.log('  FAIL ' + m); } }
function sec(t) { console.log('\n== ' + t + ' =='); }

const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

sec('1. server.js me cache ka dhaancha');
[['/* ===== dash-cache (10-Oct)', 'nishaan'],
 ['async function buildDashBase(scope)', 'bhaari hissa alag function me'],
 ['async function dashBase(scope)', 'cache wala wrapper'],
 ['async function dashVersionKey(scope)', 'version key (data + template)'],
 ['if (_dashBaseWait[scope]) return _dashBaseWait[scope];', 'single-flight -- ek waqt me ek build'],
 ['function _gzPut(', 'gzip cache me daalne wala'],
 ['while (_gzBytes > DASH_GZ_MAX', 'hadd paar ho to purane hatao'],
 ['function dashCacheClear(', 'cache saaf karne wala'],
 ['dashCacheClear(\'/refresh\')', '/refresh cache saaf karta hai'],
 ['cache: dashCacheStats()', '/api/build par ginti dikhti hai'],
 ['return { html: html, noteTxt: noteTxt };', 'base sirf html+note lautata hai'],
 ['var _base = await dashBase(scope);', 'buildHtml cache se base leta hai']
].forEach(function (x) { ok(SRV.indexOf(x[0]) > 0, x[1]); });
ok(!/async function buildHtml\(scope, role, who\) \{\s*\n\s*scope = \(scope === 'up'\) \? 'up' : 'all';\s*\n\s*role = role \|\| 'admin';\s*\n\s*const client = MP\.client\(\);/.test(SRV),
   'purana "har baar Mongo" wala buildHtml nahi bacha');
ok(SRV.indexOf('serveDash(scope, res, role, who, req)') > 0, 'serveDash ko req milta hai');
ok((SRV.match(/serveDash\('(all|up)', res, r, emailOf\(req\), req\)/g) || []).length === 2,
   'dono route naye tarike se bulate hain');
/* 10-Oct (5): BUILD ab '2026-10-10c parties-v2 + map-cache' hai.
   Matlab wahi -- stamp badla hua ho aur dash-cache maujood ho. */
/* newmap (13-Oct): pehle yahan '2026-10-10' pakka likha tha, to har
   nayi tareekh par test jhootha fail deta tha. Stamp ka KAAM ye hai ki
   wo tareekh wala ho aur badalta rahe -- wahi jaancha jaata hai. */
ok(/var BUILD = '20\d\d-\d\d-\d\d[a-z]? /.test(SRV) && /dash-cache/.test(SRV),
   'BUILD stamp tareekh wala hai (restart ka pata chalega)');

/* ---------------- asli code vm me ---------------- */
function mkSand(opts) {
  opts = opts || {};
  const sand = {
    console: { log: function () {} },
    Date: Date, Math: Math, Map: Map, Buffer: Buffer, Object: Object,
    setTimeout: setTimeout, Promise: Promise, JSON: JSON, String: String,
    _calls: 0, _ver: opts.ver || 'V1', _mtime: 1000,
    SCOPE_DB: { all: 'pulse_master', up: 'up_pulse' },
    TEMPLATE_ALL: '/t/all.html', TEMPLATE_UP: '/t/up.html',
    fs: { statSync: function () { return { mtimeMs: sand._mtime }; } },
    MP: { client: function () { return {
      connect: function () { return Promise.resolve(); },
      db: function () { return { collection: function () { return {
        findOne: function () { return Promise.resolve({ value: sand._ver }); } }; } }; }
    }; } },
    /* nakli bhaari build -- 120 ms lagta hai, aur ginta hai ki kitni baar chala */
    buildDashBase: function (scope) {
      sand._calls++;
      return new Promise(function (r) {
        setTimeout(function () { r({ html: 'PAGE-' + scope + '-' + sand._ver + '-' + sand._calls,
                                     noteTxt: 'note' }); }, 120);
      });
    }
  };
  sand.global = sand;
  vm.createContext(sand);
  const i = SRV.indexOf('var DASH_GZ_MAX =');
  const j = SRV.indexOf('/* BHAARI hissa');
  vm.runInContext(SRV.slice(i, j), sand);
  return sand;
}

sec('2. 200 request EK SAATH -> build sirf EK baar');
(async function () {
  const S = mkSand();
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: 200 }, function () { return S.dashBase('all'); }));
  const ms = Date.now() - t0;
  ok(S._calls === 1, '200 request par buildDashBase sirf ' + S._calls + ' baar chala (chahiye 1)');
  ok(rs.every(function (r) { return r.html === rs[0].html; }), 'sabko wahi ek page mila');
  ok(ms < 400, 'poora kaam ' + ms + ' ms me (ek build jitna, 200 guna nahi)');

  /* ab dobara 200 -- ab to cache se hi aana chahiye */
  const t1 = Date.now();
  await Promise.all(Array.from({ length: 200 }, function () { return S.dashBase('all'); }));
  const ms2 = Date.now() - t1;
  ok(S._calls === 1, 'dobara 200 request par bhi build nahi chala (abhi bhi ' + S._calls + ')');
  ok(ms2 < 60, 'cache se jawaab ' + ms2 + ' ms me');

  sec('3. naya data aaya -> naya page banta hai');
  S._ver = 'V2';
  await new Promise(function (r) { setTimeout(r, 5100); });   // version cache 5 sec ka hai
  const r2 = await S.dashBase('all');
  ok(S._calls === 2, 'data badla to build dobara chala (' + S._calls + ')');
  ok(r2.html.indexOf('V2') > 0, 'naya page naye data ka hai: ' + r2.html);

  sec('4. template file badli -> wo bhi pakda jaata hai');
  S._mtime = 2000;
  await new Promise(function (r) { setTimeout(r, 5100); });
  await S.dashBase('all');
  ok(S._calls === 3, 'template badalne par bhi naya page bana (' + S._calls + ')');

  sec('5. All-India aur UP alag-alag');
  const S2 = mkSand();
  await Promise.all([S2.dashBase('all'), S2.dashBase('up'), S2.dashBase('all'), S2.dashBase('up')]);
  ok(S2._calls === 2, 'dono scope ka ek-ek build (' + S2._calls + ')');

  sec('6. gzip cache -- hadd paar ho to purane hat jaate hain');
  const S3 = mkSand();
  S3.DASH_GZ_MAX = 10 * 1024 * 1024;
  vm.runInContext('DASH_GZ_MAX = 10*1024*1024;', S3);
  for (var k = 0; k < 8; k++) vm.runInContext('_gzPut("u' + k + '", Buffer.alloc(2*1024*1024))', S3);
  const st = vm.runInContext('dashCacheStats()', S3);
  ok(st.gzMB <= 10.01, 'cache hadd me hai: ' + st.gzMB + ' MB (hadd 10)');
  ok(st.gzEntries === 5, 'sirf ' + st.gzEntries + ' naye entry bache (purane hat gaye)');
  ok(vm.runInContext('_gzCache.has("u7")', S3), 'sabse naya bacha hua hai');
  ok(!vm.runInContext('_gzCache.has("u0")', S3), 'sabse purana hat gaya');

  sec('7. cache saaf karna');
  vm.runInContext('_gzPut("x", Buffer.alloc(1024)); dashCacheClear("test");', S3);
  const st2 = vm.runInContext('dashCacheStats()', S3);
  ok(st2.gzEntries === 0 && st2.gzMB === 0, 'dashCacheClear() sab khaali kar deta hai');

  sec('8. build fail ho to agli baar dobara koshish');
  const S4 = mkSand();
  vm.runInContext('buildDashBase = function(){ _calls++; return Promise.reject(new Error("mongo band")); };', S4);
  let threw = 0;
  await Promise.all([0, 1, 2].map(function () {
    return S4.dashBase('all').then(function () {}, function () { threw++; });
  }));
  ok(threw === 3, 'teeno ko saaf error mila (' + threw + ')');
  ok(S4._calls === 1, 'fail hone par bhi build ek hi baar chala');
  vm.runInContext('buildDashBase = function(){ _calls++; return Promise.resolve({html:"OK",noteTxt:""}); };', S4);
  const r4 = await S4.dashBase('all');
  ok(r4.html === 'OK' && S4._calls === 2, 'Mongo wapas aaya to agli request bann gayi');


sec('9. auto-restart (START_LIVE + RUN_SERVER)');
(function () {
  const RS = fs.readFileSync(path.join(__dirname, 'RUN_SERVER.bat'), 'utf8');
  const SL = fs.readFileSync(path.join(__dirname, 'START_LIVE.bat'), 'utf8');
  ok(/:loop/.test(RS) && /goto loop/.test(RS), 'RUN_SERVER.bat me restart loop hai');
  ok(/node --max-old-space-size=%NODE_MEM% server\.js/.test(RS), 'node memory flag ke saath chalta hai');
  ok(/set NODE_MEM=\d+/.test(RS), 'memory hadd set hai (default 1.5 GB se zyada)');
  ok(/set UV_THREADPOOL_SIZE=\d+/.test(RS), 'gzip ke liye zyada background thread');
  ok(/netstat -ano \^\| findstr ":3000"/.test(RS), 'har baar purana port saaf karta hai');
  ok(/timeout \/t 5 \/nobreak/.test(RS), 'girne ke baad 5 sec ruk kar chalu (hot-loop nahi)');
  ok(SL.indexOf('start "All-India Dashboard Server" "%~dp0RUN_SERVER.bat"') > 0,
     'START_LIVE ab RUN_SERVER.bat chalati hai');
  ok(!SL.split('\n').some(function (l) {
       return l.indexOf('npm start') >= 0 && l.trim().toUpperCase().indexOf('REM') !== 0;
     }), 'purana seedha "npm start" ab chalta nahi (sirf comment me zikr hai)');
  ok(/taskkill \/F \/FI "WINDOWTITLE eq All-India Dashboard Server\*"/.test(SL),
     'purani server window bhi band hoti hai (do loop na ladein)');
})();

sec('10. PATCH_START_LIVE.bat -- user ki apni settings bachti hain');
(function () {
  const PS = fs.readFileSync(path.join(__dirname, 'PATCH_START_LIVE.bat'), 'utf8');
  ok(/RUN_SERVER\\\.bat/.test(PS), 'pehle se laga ho to dobara nahi chhedta');
  ok(PS.indexOf('bak_before_autorestart') > 0, 'badalne se pehle backup banata hai');
  ok(PS.indexOf('[char]37') > 0, '%~dp0 literal rehta hai (path hardcode nahi hota)');
  ok(PS.indexOf('WINDOWTITLE eq All-India Dashboard Server') > 0, 'purani window band karne wali line bhi jodta hai');
  ok(/if not exist "START_LIVE.bat"/.test(PS) && /if not exist "RUN_SERVER.bat"/.test(PS),
     'galat folder me chalao to saaf mana karta hai');

  /* asli START_LIVE.bat par wahi badlav chala kar dekho (PowerShell wala
     regex -- yahan JS me) */
  const SL0 = fs.readFileSync(path.join(__dirname, 'START_LIVE.bat.bak_10oct'), 'utf8');
  const pat = /^[ \t]*start "All-India Dashboard Server".*$/m;
  ok(pat.test(SL0), 'purani file me server chalane wali line mil jaati hai');
  const out = SL0.replace(pat, 'start "All-India Dashboard Server" "%~dp0RUN_SERVER.bat"');
  ok(out.indexOf('RUN_SERVER.bat') > 0, 'badal kar RUN_SERVER.bat ho jaati hai');
  ok(out.indexOf('npm start') < 0, '"npm start" nikal jaata hai');
  ok(out.indexOf('add-authtoken') > 0, 'ngrok ka token waise ka waisa (mita nahi)');
  ok(out.indexOf('Python313') > 0, 'Python ka path bhi waisa hi');
  ok(out.indexOf('goto loop') > 0, 'ghante wala auto-update loop bhi salaamat');
})();

sec('11. package me koi secret na chala jaaye');
(function () {
  const dir = path.join(__dirname, '..', 'UPDATE_07-OCT', 'nayi-files', 'DASHBOARD');
  const have = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  ok(have.indexOf('RUN_SERVER.bat') >= 0, 'RUN_SERVER.bat package me hai');
  ok(have.indexOf('PATCH_START_LIVE.bat') >= 0, 'PATCH_START_LIVE.bat package me hai');
  ok(have.indexOf('START_LIVE.bat') < 0,
     'START_LIVE.bat package me NAHI hai (usme ngrok token aur machine ka path hai)');
})();
  console.log('\n================ RESULT ================');
  console.log('PASS ' + P + '   FAIL ' + F);
  if (F) { console.log('\nFAILS:'); FAILS.forEach(function (m) { console.log(' - ' + m); }); process.exit(1); }
})();
