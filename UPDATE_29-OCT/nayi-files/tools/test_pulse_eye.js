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
  const prof = path.join(os.tmpdir(), 'pulse_today_test_profile');
  chrome = cp.spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, '--no-first-run',
    '--window-size=1440,900', 'about:blank'], { windowsHide: true });
  let tgt = null;
  for (let i = 0; i < 30 && !tgt; i++) { await sleep(500); const l = await getJSON(DBG, '/json/list'); tgt = l && l.find(function (t) { return t.type === 'page'; }); }
  if (!tgt) { console.log('STOP: Chrome debug port not reachable'); process.exit(1); }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(function (r) { ws.onopen = r; });
  let id = 0; const pend = {}; const errors = [];
  ws.onmessage = function (m) {
    const j = JSON.parse(m.data);
    if (j.id && pend[j.id]) { pend[j.id](j); delete pend[j.id]; }
    if (j.method === 'Runtime.exceptionThrown') errors.push((j.params.exceptionDetails.exception || {}).description || j.params.exceptionDetails.text);
    if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errors.push('console.error: ' + j.params.args.map(function (a) { return a.value || a.description || ''; }).join(' ').slice(0, 200));
  };
  function cmd(method, params) { return new Promise(function (r) { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: method, params: params || {} })); }); }
  async function ev(expr) { const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : r; }
  await cmd('Runtime.enable'); await cmd('Network.enable');
  await cmd('Network.setCookie', { name: 'pulse_auth', value: cookie, url: 'http://localhost:' + PORT + '/' });

  const out = path.join(PROD, 'DASHBOARD', 'scratch', 'hotcold');
  for (const scope of ['/', '/up']) {
    errors.length = 0;
    await cmd('Page.navigate', { url: 'http://localhost:' + PORT + scope });
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) { await sleep(1000); ok = await ev("!!(window.PHD_DATES&&window.PHD_DATES.length&&document.readyState==='complete')"); }
    await sleep(2500);
    const info = await ev("(function(){var a=document.getElementById('pulseEyeBtn');if(!a)return 'MISSING';var r=a.getBoundingClientRect(),s=document.getElementById('appSidebar').getBoundingClientRect();" +
      "return {href:a.href,target:a.target,rel:a.rel,text:a.innerText.replace(/\\s+/g,' '),btn:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]," +
      "sidebar:[Math.round(s.left),Math.round(s.top),Math.round(s.width),Math.round(s.height)],insideSidebar:(r.left>=s.left&&r.right<=s.right&&r.bottom<=s.bottom)," +
      "overflow:a.scrollWidth>a.clientWidth+1,visible:getComputedStyle(a).visibility,anim:document.getAnimations().filter(function(x){return a.contains(x.effect&&x.effect.target)}).length};})()");
    console.log('=== ' + scope + ' loaded=' + ok + ' ' + JSON.stringify(info));
    if (info && info.sidebar) {
      const s = info.sidebar;
      const shot = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: s[0], y: Math.max(0, info.btn[1] - 160), width: s[2], height: Math.min(360, s[3]), scale: 2 } });
      fs.writeFileSync(path.join(out, 'pulse_eye' + (scope === '/' ? '_all' : '_up') + '.png'), Buffer.from(shot.result.data, 'base64'));
    }
    console.log('  page errors: ' + (errors.length ? errors.slice(0, 5).join(' | ') : 'none'));
  }
  ws.close(); chrome.kill(); srv.kill(); await sleep(1000);
  console.log('\nTEST DONE');
  process.exit(0);
})().catch(function (e) { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
