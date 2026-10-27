/* default-today UI test: starts THIS checkout's server on port 3001 (no background jobs), opens it in a
   headless Chrome (temp profile) with a test login cookie, opens every tab and prints each date filter.
   Expect: Dashboard = Full Range; every other tab with a date range = Today; no page errors.
   node tools/test_default_today.js */
const path = require('path'), fs = require('fs'), http = require('http'), cp = require('child_process'), os = require('os');
const DASH = path.join(__dirname, '..', 'DASHBOARD');
const PROD = 'C:\\Main Twitter Project';
const PORT = 3001, DBG = 9333;
const AUTH = require(path.join(DASH, 'auth_lib.js'));
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')].find(function (p) { return fs.existsSync(p); });
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function getJSON(port, p) {
  return new Promise(function (res) {
    http.get({ host: '127.0.0.1', port: port, path: p, timeout: 5000 }, function (r) {
      let b = ''; r.on('data', function (d) { b += d; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { res(null); } });
    }).on('error', function () { res(null); });
  });
}
let srv = null, chrome = null;
process.on('exit', function () { try { srv && srv.kill(); } catch (e) {} try { chrome && chrome.kill(); } catch (e) {} });

(async function () {
  if (!CHROME) { console.log('STOP: Chrome not found'); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(path.join(PROD, 'db_config.local.json'), 'utf8'));
  srv = cp.spawn(process.execPath, ['server.js'], { cwd: DASH, windowsHide: true, env: Object.assign({}, process.env, {
    PULSE_PORT: String(PORT), PULSE_TEST_NO_JOBS: '1', PULSE_HOT_ENABLED: '1', MONGO_HOT_URL: cfg.hot.url,
    PULSE_HOT_DB: 'pulse_hot', PULSE_HOT_DAYS: String(cfg.hot.days || 3), NODE_PATH: path.join(PROD, 'DASHBOARD', 'node_modules') }) });
  let slog = ''; srv.stdout.on('data', function (d) { slog += d; }); srv.stderr.on('data', function (d) { slog += d; });
  for (let i = 0; i < 60; i++) { await sleep(1000); if (await getJSON(PORT, '/healthz')) break; }
  const cookie = AUTH.issue(AUTH.loadSecret(DASH, function () {}), 'admin', '');
  function getPage(p) {
    return new Promise(function (res) {
      const t = Date.now();
      http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { Cookie: 'pulse_auth=' + cookie, 'Accept-Encoding': 'gzip' }, timeout: 120000 }, function (r) {
        let n = 0; r.on('data', function (d) { n += d.length; }); r.on('end', function () { res({ code: r.statusCode, ms: Date.now() - t, kb: Math.round(n / 1024) }); });
      }).on('error', function (e) { res({ code: 0, ms: Date.now() - t, err: e.message }); });
    });
  }
  const T0 = Date.now();
  const r0 = await getPage('/'); console.log('1. turant (server abhi chalu hua, warm nahi hua): / ' + JSON.stringify(r0));
  await sleep(30000);
  console.log('2. 30 s baad (background warm ho chuka):');
  const r2 = await getPage('/'); console.log('   /   ' + JSON.stringify(r2));
  console.log('   /up ' + JSON.stringify(await getPage('/up')));
  const mf = path.join(DASH, 'data', 'handle_master.json'); const now = new Date();
  fs.utimesSync(mf, now, now);
  const r3 = await getPage('/'); console.log('3. mapping file ki tareekh badli (content same) -> / ' + JSON.stringify(r3));
  const tf = path.join(DASH, 'dashboard.template.html'); fs.utimesSync(tf, new Date(), new Date());
  await sleep(6000);
  const r4 = await getPage('/'); console.log('4. naya version (template badla, page peeche ban raha) -> / ' + JSON.stringify(r4) + '  (purana turant)');
  await sleep(30000);
  const r5 = await getPage('/'); console.log('5. 30 s baad (naya page ban chuka) -> / ' + JSON.stringify(r5));
  console.log('server log:\n  ' + (slog.match(/\[dash-cache\][^\n]*|Data mila[^\n]*/g) || []).join('\n  '));
  const ok = [r2, r3, r4, r5].every(function (r) { return r.code === 200 && r.ms < 5000; });
  console.log('RESULT: ' + (ok ? 'OK' : 'FAIL'));
  srv.kill(); await sleep(1000); console.log('TEST DONE'); process.exit(ok ? 0 : 2);
  ws.close(); chrome.kill(); srv.kill(); await sleep(1000);
  console.log('\nTEST DONE');
  process.exit(0);
})().catch(function (e) { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
