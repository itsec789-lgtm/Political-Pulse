/* tw-rt-split UI + data test. Starts THIS checkout's server on port 3001 (no background jobs), opens / and /up
   in headless Chrome with a test login, and checks:
     - layout: TWEET SUMMARY bar + 6 cards, RETWEET SUMMARY bar + 5 cards, media note only on Total Tweets
     - numbers: for 4 date ranges x 3 party choices, the page's own-post totals (t/k/v/r) and repost totals (c/l/w)
       equal sums computed from the RAW master table (scratch/hotcold/tr_expect_*.json, made by tr_expect.py)
       for the same handles + days; card text = formatted number
     - collapse/expand of each section independently, also after a filter change
     - KPI detail panel opens under the clicked section; page errors
   node tools/test_tw_rt.js <dir with tr_expect_all.json / tr_expect_up.json> */
const path = require('path'), fs = require('fs'), http = require('http'), cp = require('child_process'), os = require('os');
const DASH = path.join(__dirname, '..', 'DASHBOARD');
const PROD = 'C:\\Main Twitter Project';
const EXP_DIR = process.argv[2] || path.join(PROD, 'DASHBOARD', 'scratch', 'hotcold');
const PORT = 3001, DBG = 9334;
const AUTH = require(path.join(DASH, 'auth_lib.js'));
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')].find(function (p) { return fs.existsSync(p); });
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function getJSON(port, p) {
  return new Promise(function (res) {
    http.get({ host: '127.0.0.1', port: port, path: p, timeout: 5000 }, function (r) {
      let b = ''; r.on('data', function (d) { b += d; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { res(r.statusCode ? {} : null); } });
    }).on('error', function () { res(null); });
  });
}
function fmt(n) { n = Math.round(n || 0); if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr'; if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return '' + n; }
let srv = null, chrome = null, FAIL = 0;
function check(ok, msg) { if (!ok) FAIL++; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + msg); }
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
  const prof = path.join(os.tmpdir(), 'pulse_twrt_test_profile');
  chrome = cp.spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, '--no-first-run',
    '--window-size=1400,900', 'about:blank'], { windowsHide: true });
  let tgt = null;
  for (let i = 0; i < 30 && !tgt; i++) { await sleep(500); const l = await getJSON(DBG, '/json/list'); tgt = l && l.find && l.find(function (t) { return t.type === 'page'; }); }
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

  /* page state for the current filters: handle set, raw sums, card texts */
  const READ = "(function(){var AD=window.PHD_DATES,f=document.getElementById('dashFrom').value,t=document.getElementById('dashTo').value,dp=(document.getElementById('dashParty')||{}).value||'all';"
    + "var G=(window.GROWTH&&GROWTH.H)||{},P=window.PHD,hs=Object.keys(P).filter(function(h){return dp==='all'||(G[h]||{}).p===dp;});"
    + "var s={t:0,k:0,v:0,r:0};hs.forEach(function(h){var o=P[h];AD.forEach(function(d,i){if(d>=f&&d<=t){s.t+=o.t[i]||0;s.k+=o.k[i]||0;s.v+=o.v[i]||0;s.r+=o.r[i]||0;}});});"
    + "function txt(sel){var o={};document.querySelectorAll(sel+' .kpi').forEach(function(c){o[c.dataset.kpi]=(c.querySelector('.kpi-val')||{}).textContent;});return o;}"
    + "return {f:f,t:t,dp:dp,hs:hs,own:s,rc:window._rtDaily({rt:'c'}).total,rl:window._rtDaily({rt:'l'}).total,rw:window._rtDaily({rt:'w'}).total,"
    + "tw:txt('#dashKpis'),rt:txt('#dashRtKpis'),hasLW:Object.keys(P).some(function(h){return !!P[h].l;}),lk:Object.keys(P).some(function(h){return (P[h].l||[]).some(function(x){return x>0;});})};})()";
  function setF(f, t, party) {
    return ev("(function(f,t,p){document.getElementById('dashFrom').value=f;document.getElementById('dashTo').value=t;var pr=document.getElementById('dashPreset');if(pr)pr.value='custom';"
      + "var ps=document.getElementById('dashParty');if(ps){ps.value=p;ps.dispatchEvent(new Event('change'));}window.renderDashDate();})('" + f + "','" + t + "','" + party + "')");
  }

  for (const scope of ['/', '/up']) {
    errors.length = 0;
    const EXP = JSON.parse(fs.readFileSync(path.join(EXP_DIR, scope === '/up' ? 'tr_expect_up.json' : 'tr_expect_all.json'), 'utf8'));
    let RAW_LK = 0; Object.keys(EXP).forEach(function (h) { Object.keys(EXP[h]).forEach(function (d) { RAW_LK += EXP[h][d][5]; }); });
    await cmd('Page.navigate', { url: 'http://localhost:' + PORT + scope });
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) { await sleep(1000); ok = await ev("!!(window.PHD_DATES&&window.PHD_DATES.length&&document.readyState==='complete'&&document.querySelectorAll('#dashRtKpis .kpi').length)"); }
    await sleep(3500);
    console.log('\n=== ' + scope + ' loaded=' + ok);
    const L = await ev("(function(){var a=document.getElementById('barTwSum'),b=document.getElementById('barRtSum'),k=document.getElementById('dashKpis'),g=document.getElementById('dashRtKpis');"
      + "return {order:!!(a&&b&&a.nextElementSibling===k&&k.compareDocumentPosition(b)&4&&b.nextElementSibling===g),tw:k.querySelectorAll('.kpi').length,rt:g.querySelectorAll('.kpi').length,"
      + "twKeys:[].map.call(k.querySelectorAll('.kpi'),function(c){return c.dataset.kpi;}).join(','),rtKeys:[].map.call(g.querySelectorAll('.kpi'),function(c){return c.dataset.kpi;}).join(','),"
      + "notes:[].map.call(document.querySelectorAll('._mjnote'),function(n){return n.closest('.kpi').dataset.kpi;}).join(',')};})()");
    await sleep(2000);
    const notes = await ev("[].map.call(document.querySelectorAll('._mjnote'),function(n){return n.closest('.kpi').dataset.kpi;}).join(',')");
    check(L.order, 'layout: Tweet bar > Tweet cards > Retweet bar > Retweet cards');
    check(L.tw === 6 && L.rt === 5, 'cards: tweet ' + L.tw + ' [' + L.twKeys + '], retweet ' + L.rt + ' [' + L.rtKeys + ']');
    check(scope === '/up' ? notes === '' : notes === 'tweets', 'media note only on Total Tweets: [' + notes + ']');

    const AD = await ev('window.PHD_DATES');
    const parties = await ev("(function(){var s=document.getElementById('dashParty');return s?[].map.call(s.options,function(o){return o.value;}).filter(function(v){return v&&v!=='all';}).slice(0,2):[];})()");
    const last = AD[AD.length - 1];
    const ranges = [['FULL', AD[0], last], ['LAST 7', AD[Math.max(0, AD.length - 7)], last], ['30 DAYS MID', AD[Math.max(0, AD.length - 70)], AD[Math.max(0, AD.length - 40)]], ['ONE OLD DAY', AD[Math.max(0, AD.length - 40)], AD[Math.max(0, AD.length - 40)]]];
    let hasLW = false;
    for (const pty of ['all'].concat(parties)) {
      for (const [lab, f, t] of ranges) {
        await setF(f, t, pty); await sleep(1200);
        const R = await ev(READ); hasLW = R.hasLW;
        const e = [0, 0, 0, 0, 0, 0, 0];
        R.hs.forEach(function (h) { const dd = EXP[h.trim().toLowerCase()] || {}; Object.keys(dd).forEach(function (d) { if (d >= f && d <= t) for (let i = 0; i < 7; i++) e[i] += dd[d][i]; }); });
        const own = [R.own.t, R.own.k, R.own.v, R.own.r], rep = [R.rc, R.rl, R.rw];
        const ownOk = own.every(function (x, i) { return x === e[i]; });
        const repOk = R.rc === e[4] && (!hasLW || (R.rl === e[5] && R.rw === e[6]));
        /* likes on reposts: the scraper stores 0 on every RT row -> page must say N/A, never a fake 0 */
        const lkTxt = function (v) { return R.lk ? fmt(v) : (RAW_LK === 0 ? 'N/A' : 'BAD'); };
        const cardOk = R.tw.tweets === fmt(e[0]) && R.tw.likes === fmt(e[1]) && R.tw.views === fmt(e[2]) && R.tw.rts === fmt(e[3])
          && R.tw.avgvpt === fmt(e[0] ? e[2] / e[0] : 0) && R.tw.avglpt === fmt(e[0] ? e[1] / e[0] : 0)
          && R.rt.rcount === fmt(e[4]) && (!hasLW || (R.rt.rlikes === lkTxt(e[5]) && R.rt.rviews === fmt(e[6])
          && R.rt.ravgv === fmt(e[4] ? e[6] / e[4] : 0) && R.rt.ravgl === lkTxt(e[4] ? e[5] / e[4] : 0)));
        check(ownOk && repOk && cardOk, (pty + ' / ' + lab).padEnd(22) + f + '..' + t + '  own t/k/v/r page ' + own.join('/') + ' raw ' + e.slice(0, 4).join('/')
          + ' | reposts c/l/w page ' + rep.join('/') + ' raw ' + e.slice(4).join('/') + ' | cards ' + JSON.stringify(R.rt));
      }
    }
    if (!hasLW) console.log('  NOTE: this build has no repost likes/views yet (cards show "—"); only the repost count was compared');

    /* collapse / expand */
    const C = "(function(){return [document.getElementById('dashKpis').style.display!=='none',document.getElementById('dashRtKpis').style.display!=='none']})()";
    await setF(AD[0], last, 'all'); await sleep(800);
    await ev("document.getElementById('barTwSum').click()"); const c1 = await ev(C);
    await ev("document.getElementById('barTwSum').click()"); const c2 = await ev(C);
    await ev("document.getElementById('barRtSum').click()"); const c3 = await ev(C);
    await setF(AD[Math.max(0, AD.length - 7)], last, 'all'); await sleep(800); const c4 = await ev(C);
    const rcAfter = await ev("(document.querySelector('#dashRtKpis [data-kpi=rcount] .kpi-val')||{}).textContent");
    await ev("document.getElementById('barRtSum').click()"); const c5 = await ev(C);
    check(JSON.stringify([c1, c2, c3, c4, c5]) === JSON.stringify([[false, true], [true, true], [true, false], [true, false], [true, true]]),
      'collapse: tweet-only, both, retweet-only, (filter change keeps it), both -> ' + JSON.stringify([c1, c2, c3, c4, c5]) + '; repost count after filter while collapsed = ' + rcAfter);
    /* detail panel follows the section */
    await ev("document.querySelector('#dashRtKpis [data-kpi=rcount]').click()"); await sleep(600);
    const p1 = await ev("(function(){var p=document.getElementById('kpiDetailPanel');return {open:p.classList.contains('kpi-dp-open'),under:p.previousElementSibling&&p.previousElementSibling.id,lbl:document.getElementById('kpiDpLabel').textContent,val:document.getElementById('kpiDpVal').textContent,rows:document.querySelectorAll('#kpiDpTbody tr').length};})()");
    await ev("document.querySelector('#dashKpis [data-kpi=tweets]').click()"); await sleep(600);
    const p2 = await ev("(function(){var p=document.getElementById('kpiDetailPanel');return {open:p.classList.contains('kpi-dp-open'),under:p.previousElementSibling&&p.previousElementSibling.id,lbl:document.getElementById('kpiDpLabel').textContent,val:document.getElementById('kpiDpVal').textContent};})()");
    await ev("document.querySelector('#dashKpis [data-kpi=tweets]').click()"); await sleep(400);
    const p3 = await ev("document.getElementById('kpiDetailPanel').classList.contains('kpi-dp-open')");
    check(p1.open && p1.under === 'dashRtKpis' && p2.open && p2.under === 'dashKpis' && !p3,
      'detail panel: retweet card -> ' + JSON.stringify(p1) + ' ; tweet card -> ' + JSON.stringify(p2) + ' ; click again closes=' + !p3);
    await ev("window.dashReset&&window.dashReset()"); await sleep(1500);
    const rs = await ev("[document.getElementById('dashFrom').value,document.getElementById('dashTo').value,(document.getElementById('dashParty')||{}).value,(document.querySelector('#dashRtKpis [data-kpi=rcount] .kpi-val')||{}).textContent]");
    check(rs[0] === AD[0] && rs[1] === last && rs[2] === 'all', 'Reset -> ' + JSON.stringify(rs));
    check(errors.length === 0, 'page errors: ' + (errors.length ? errors.slice(0, 5).join(' | ') : 'none'));
  }
  const se = (slog.match(/(Error|TypeError|ReferenceError)[^\n]*/g) || []).slice(0, 5);
  check(se.length === 0, 'server errors: ' + (se.join(' | ') || 'none'));
  ws.close(); chrome.kill(); srv.kill(); await sleep(1000);
  console.log('\nRESULT: ' + (FAIL ? 'FAIL (' + FAIL + ')' : 'OK'));
  process.exit(FAIL ? 1 : 0);
})().catch(function (e) { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
