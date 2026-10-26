/* hot/cold plan, Phase 5.6 -- every moved route with HOT on, HOT off and a wrong Atlas URL.
   Starts THIS checkout's server.js on a test port (PULSE_PORT, default 3001) with
   PULSE_TEST_NO_JOBS=1 (no mapping sync / tracker), so the live server on 3000 is untouched.
   The Atlas URL is read from the production db_config.local.json and passed by env only;
   it is never printed or written anywhere.
   Pass rule: inside-window answers from HOT == answers with HOT off (cold), and the wrong-URL
   run == HOT off, with no errors.                                   node tools/test_routes_hot.js */
const path = require('path'), fs = require('fs'), http = require('http'), cp = require('child_process');
const DASH = path.join(__dirname, '..', 'DASHBOARD');
const PROD = process.env.PULSE_PROD_ROOT || 'C:\\Main Twitter Project';
const PORT = parseInt(process.env.TEST_PORT, 10) || 3001;
const AUTH = require(path.join(DASH, 'auth_lib.js'));
const HC = require(path.join(DASH, 'hot_conf.js'));

const prodCfg = JSON.parse(fs.readFileSync(path.join(PROD, 'db_config.local.json'), 'utf8'));
const URL_OK = ((prodCfg.hot || {}).url || '').trim();
if (!URL_OK || /<.*password.*>/i.test(URL_OK)) { console.log('STOP: no Atlas url in production db_config.local.json'); process.exit(1); }
const DAYS = String((prodCfg.hot || {}).days || 3);
const CUT = HC.windowCutoff(parseInt(DAYS, 10));
const groups = JSON.parse(fs.readFileSync(path.join(DASH, 'data', 'narrative_groups_config.json'), 'utf8'));
const G = groups[0], LEADER = ((G.leaders || [])[0] || {}).handle || (G.handles || [])[0];

const CASES = [
  ['ng-stats in window',      '/api/narrative-groups/stats?from=' + CUT, true],
  ['ng-stats old range',      '/api/narrative-groups/stats?from=2026-10-01', false],
  ['ng-leader in window',     '/api/narrative-groups/leader-analysis/' + encodeURIComponent(LEADER) + '?from=' + CUT, true],
  ['ng-leader old range',     '/api/narrative-groups/leader-analysis/' + encodeURIComponent(LEADER) + '?from=2026-10-01', false],
  ['ng-comparison in window', '/api/narrative-groups/comparison?group=' + G.id + '&from=' + CUT, true],
  ['ng-comparison old range', '/api/narrative-groups/comparison?group=' + G.id + '&from=2026-10-01', false],
  ['parties-cmp in window',   '/api/parties/comparison?party=BJP&from=' + CUT, true],
  ['parties-cmp old range',   '/api/parties/comparison?party=BJP&from=2026-10-01', false],
  ['live all',                '/api/live?scope=all&since=' + CUT + '%2000:00:00', true],
  ['live up',                 '/api/live?scope=up&since=' + CUT + '%2000:00:00', true],
  ['tw-list in window',       '/api/tw/list?from=' + CUT + '&sort=views&limit=50', true],
  ['tw-top in window',        '/api/tw/top?from=' + CUT + '&metric=views&limit=30', true]
];

function get(p, cookie) {
  return new Promise(function (res) {
    const t = Date.now();
    const rq = http.get({ host: '127.0.0.1', port: PORT, path: p, headers: cookie ? { Cookie: cookie } : {}, timeout: 240000 }, function (r) {
      let b = ''; r.setEncoding('utf8'); r.on('data', function (d) { b += d; });
      r.on('end', function () { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ code: r.statusCode, j: j, raw: b.slice(0, 200), ms: Date.now() - t }); });
    });
    rq.on('error', function (e) { res({ code: 0, j: null, raw: String(e.message), ms: Date.now() - t }); });
    rq.on('timeout', function () { rq.destroy(new Error('timeout')); });
  });
}
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
/* drop fields that legitimately differ between runs */
function norm(v) {
  if (Array.isArray(v)) {
    var a = v.map(norm);
    /* $group output ({_id, count}) has no defined order in MongoDB -- compare as a set */
    if (a.length && a.every(function (x) { return x && typeof x === 'object' && 'count' in x && '_id' in x && Object.keys(x).length === 2; }))
      a.sort(function (x, y) { var p = JSON.stringify(x), q = JSON.stringify(y); return p < q ? -1 : p > q ? 1 : 0; });
    return a;
  }
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(function (k) {
      if (['timestamp', 'now', 'source', 'store', 'ms', 'generatedAt', 'took', 'ts'].indexOf(k) >= 0 && typeof v[k] !== 'object') return;
      o[k] = norm(v[k]);
    });
    return o;
  }
  return v;
}
function sig(j) { return require('crypto').createHash('md5').update(JSON.stringify(norm(j))).digest('hex').slice(0, 10); }
function firstDiff(a, b, pfx) {
  a = norm(a); b = norm(b); pfx = pfx || '';
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ks = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    for (const k of ks) { const d = firstDiff(a[k], b[k], pfx + '.' + k); if (d) return d; }
  }
  return pfx + ': ' + JSON.stringify(a).slice(0, 120) + '  vs  ' + JSON.stringify(b).slice(0, 120);
}

async function runMode(name, env) {
  const e = Object.assign({}, process.env, env, {
    PULSE_PORT: String(PORT), PULSE_TEST_NO_JOBS: '1', PULSE_HOT_DAYS: DAYS, PULSE_HOT_DB: 'pulse_hot',
    NODE_PATH: path.join(PROD, 'DASHBOARD', 'node_modules') });
  if ((await get('/healthz')).code) { console.log('STOP: something already answers on port ' + PORT); process.exit(1); }
  const srv = cp.spawn(process.execPath, ['server.js'], { cwd: DASH, env: e, windowsHide: true });
  _srv = srv;
  let log = ''; srv.stdout.on('data', function (d) { log += d; }); srv.stderr.on('data', function (d) { log += d; });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await sleep(1000); up = (await get('/healthz')).code === 200; }
  if (!up) { srv.kill(); console.log('  [' + name + '] server did not start:\n' + log.slice(-1500)); return null; }
  /* warm-up: the Atlas health ping is cached and runs in the background */
  await get('/healthz'); await sleep(4000); await get('/healthz');
  const secret = AUTH.loadSecret(DASH, function () {});
  const cookie = 'pulse_auth=' + AUTH.issue(secret, 'admin', '');
  const out = {};
  for (const c of CASES) {
    const r = await get(c[1], cookie);
    out[c[0]] = r;
    const src = r.j ? (r.j.source || r.j.store || (Array.isArray(r.j.rows) ? '' : '')) : '';
    console.log('  [' + name + '] ' + c[0].padEnd(24) + ' http ' + r.code + '  ' + String(r.ms).padStart(6) + ' ms  source=' + (src || '-')
                + '  sig=' + (r.j ? sig(r.j) : '-')
                + ((r.code !== 200 || (r.j && r.j.ok === false)) ? '  ERROR ' + (r.j ? JSON.stringify(r.j).slice(0, 150) : r.raw) : ''));
  }
  const hz = await get('/healthz');
  console.log('  [' + name + '] healthz hot: ' + JSON.stringify(((hz.j || {}).checks || {}).hot));
  srv.kill(); await sleep(1500);
  return out;
}

process.on('exit', function () { try { _srv && _srv.kill(); } catch (e) {} });
var _srv = null;
(async function () {
  console.log('window cutoff ' + CUT + ' (days ' + DAYS + '), group ' + G.id + ', leader ' + LEADER + ', port ' + PORT);
  const ON  = await runMode('on ', { PULSE_HOT_ENABLED: '1', MONGO_HOT_URL: URL_OK });
  const OFF = await runMode('off', { PULSE_HOT_ENABLED: '0', MONGO_HOT_URL: URL_OK });
  const BAD = await runMode('bad', { PULSE_HOT_ENABLED: '1', MONGO_HOT_URL: 'mongodb://nobody:x@127.0.0.1:1/?serverSelectionTimeoutMS=2000&connectTimeoutMS=2000' });
  if (!ON || !OFF || !BAD) { console.log('RESULT: FAIL (a server did not start)'); process.exit(1); }
  let bad = 0;
  console.log('\nCompare (answers must be identical; only the store differs):');
  for (const c of CASES) {
    const k = c[0], a = ON[k], b = OFF[k], z = BAD[k];
    const ok1 = a.j && b.j && sig(a.j) === sig(b.j);
    const ok2 = z.j && b.j && sig(z.j) === sig(b.j);
    const err = [a, b, z].some(function (r) { return r.code !== 200 || (r.j && r.j.ok === false); });
    const wantHot = c[2], src = a.j && (a.j.source || '');
    const srcNote = (wantHot && src && src !== 'hot') ? '  (expected hot, got ' + src + ')' : (!wantHot && src && src !== 'archive') ? '  (expected archive, got ' + src + ')' : '';
    const pass = ok1 && ok2 && !err;
    if (!pass) bad++;
    console.log('  ' + k.padEnd(24) + ' on==off ' + (ok1 ? 'YES' : 'NO ') + ' | bad==off ' + (ok2 ? 'YES' : 'NO ') + ' | ' + (pass ? 'PASS' : 'FAIL') + srcNote);
    if (!ok1 && a.j && b.j) console.log('      first diff on/off: ' + firstDiff(a.j, b.j));
    if (!ok2 && z.j && b.j) console.log('      first diff bad/off: ' + firstDiff(z.j, b.j));
  }
  console.log('\nRESULT: ' + (bad ? 'FAIL (' + bad + ')' : 'OK'));
})();
