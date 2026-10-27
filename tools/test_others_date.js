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
    '--window-size=1400,900', 'about:blank'], { windowsHide: true });
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

  const RD = "(function(){var o={};document.querySelectorAll('#lvOtherStrip .lv-card[data-cat]').forEach(function(c){o[c.getAttribute('data-cat')]=(c.querySelector('.lv-val')||{}).textContent+' | '+(c.querySelector('.lv-sub')||{}).textContent;});var m={};['lvLSMP','lvMLA'].forEach(function(i){var e=document.getElementById(i);if(e)m[i]=e.textContent;});return {others:o,main:m,range:(document.getElementById('dashFrom')||{}).value+'..'+(document.getElementById('dashTo')||{}).value};})()";
  function api(p) {
    return new Promise(function (res) { const t = Date.now();
      http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { Cookie: 'pulse_auth=' + cookie } }, function (r) { let b = ''; r.on('data', function (d) { b += d; }); r.on('end', function () { res({ code: r.statusCode, ms: Date.now() - t, body: b.slice(0, 600) }); }); }).on('error', function (e) { res({ err: e.message }); }); });
  }
  for (const scope of ['/', '/up']) {
    errors.length = 0;
    await cmd('Page.navigate', { url: 'http://localhost:' + PORT + scope });
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) { await sleep(1000); ok = await ev("!!(window.PHD_DATES&&window.PHD_DATES.length&&document.readyState==='complete'&&document.querySelectorAll('#lvOtherStrip .lv-card').length)"); }
    await sleep(3000);
    console.log('\n=== ' + scope + ' loaded=' + ok);
    const full0 = await ev(RD); console.log('  FULL      ' + JSON.stringify(full0));
    const last = await ev('(window.PHD_DATES||window.AD)[(window.PHD_DATES||window.AD).length-1]');
    const d7 = await ev('(function(D){return D[Math.max(0,D.length-7)]})(window.PHD_DATES||window.AD)');
    const old = await ev('(function(D){return D[Math.max(0,D.length-40)]})(window.PHD_DATES||window.AD)');
    for (const [lab, f, t] of [['LAST DAY', last, last], ['7 DAYS', d7, last], ['OLD DAY', old, old]]) {
      await ev("(function(f,t){var a=document.getElementById('dashFrom'),b=document.getElementById('dashTo');a.value=f;b.value=t;var p=document.getElementById('dashPreset');if(p)p.value='custom';window.renderDashDate();})('" + f + "','" + t + "')"); await sleep(4500);
      console.log('  ' + lab.padEnd(9) + ' ' + JSON.stringify(await ev(RD)));
    }
    await ev("(function(D){var a=document.getElementById('dashFrom'),b=document.getElementById('dashTo');a.value=D[0];b.value=D[D.length-1];var p=document.getElementById('dashPreset');if(p)p.value='all';window.renderDashDate();})(window.PHD_DATES||window.AD)"); await sleep(2500);
    const full1 = await ev(RD);
    console.log('  BACK FULL same as start: ' + (JSON.stringify(full0.others) === JSON.stringify(full1.others)));
    console.log('  page errors: ' + (errors.length ? errors.slice(0, 5).join(' | ') : 'none'));
    const sc = scope === '/up' ? 'up' : 'all';
    console.log('  api last day : ' + JSON.stringify(await api('/api/cat-range?scope=' + sc + '&from=' + last + '&to=' + last + '&party=all')));
    const first = await ev('(window.PHD_DATES||window.AD)[0]');
    const af = await api('/api/cat-range?scope=' + sc + '&from=' + first + '&to=' + last + '&party=all');
    try { const j = JSON.parse(af.body.length < 600 ? af.body : '{}'); } catch (e) {}
    const cmp = await ev("(function(){var o={};var cs=(window.UNI&&UNI.catStats)||{};Object.keys(cs).forEach(function(k){o[k]=cs[k].tw;});return o;})()");
    const full = await new Promise(function (res) { http.get({ host: '127.0.0.1', port: PORT, path: '/api/cat-range?scope=' + sc + '&from=' + first + '&to=' + last + '&party=all', headers: { Cookie: 'pulse_auth=' + cookie } }, function (r) { let b = ''; r.on('data', function (d) { b += d; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { res({}); } }); }); });
    const diff = []; Object.keys(cmp).forEach(function (k) { const a = cmp[k] || 0, b = ((full.cats || {})[k] || {}).tw || 0; if (a !== b) diff.push(k + ': page ' + a + ' / api ' + b); });
    console.log('  full-range api vs page card numbers: ' + (diff.length ? diff.join(' ; ') : 'ALL SAME'));
    console.log('  api bad range: ' + JSON.stringify(await api('/api/cat-range?scope=' + sc + '&from=xx&to=2026-10-01')));
  }
  console.log('  server errors: ' + ((slog.match(/\[\/api\/cat-range\][^\n]*|cat-range prep skip[^\n]*/g) || []).join(' | ') || 'none'));
  ws.close(); chrome.kill(); srv.kill(); await sleep(1000);
  console.log('\nTEST DONE');
  process.exit(0);
})().catch(function (e) { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
