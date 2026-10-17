/*  export_html.js  -  MongoDB ka data + template milaakr ek STANDALONE html banata hai.
 *  Ye file bina server/MongoDB ke chalti hai (data andar baked). Double-click karke kholo, share karo.
 *  Chalao:  node export_html.js
 *  (update_add.py --push ke baad ye apne aap bhi chal jaata hai.)
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URL  = require('./mongo_conf.js');   // <- central: db_config.json
const COLLECTION = 'dashboard_data';
const TEMPLATE   = path.join(__dirname, 'dashboard.template.html');
// output file name me aaj ki date (jab export chalega) -- sirf FILENAME me, content me nahi
const _MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _now = new Date();
const _stamp = String(_now.getDate()).padStart(2, '0') + '-' + _MONTHS[_now.getMonth()];
const OUTDIR     = path.join(__dirname, 'All Updated HTML Dashboard');
const OUT        = path.join(OUTDIR, 'India_Political_Dashboard_' + _stamp + ' Updated.html');

async function findDataDb(client) {
  const { databases } = await client.db().admin().listDatabases();
  for (const info of databases) {
    const db = client.db(info.name);
    const names = (await db.listCollections().toArray()).map(function (c) { return c.name; });
    if (names.includes(COLLECTION) && names.includes('phd')) return db;
  }
  for (const info of databases) {
    const db = client.db(info.name);
    const names = (await db.listCollections().toArray()).map(function (c) { return c.name; });
    if (names.includes(COLLECTION)) return db;
  }
  return null;
}

// SAME server-side KPI fill as server.js (numbers markup me daal do)
function fillKPIs(html, map) {
  const IN  = function (x) { return (Math.round((+x) || 0)).toLocaleString('en-IN'); };
  const fmt = function (x) { x = (+x) || 0; if (x >= 1e7) return (x / 1e7).toFixed(2) + ' Cr'; if (x >= 1e5) return (x / 1e5).toFixed(2) + ' L'; return IN(x); };
  const esc = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  const byId = function (id, val) { html = html.replace(new RegExp('(id="' + id + '"[^>]*>)[^<]*(<)'), function (m, a, b) { return a + val + b; }); };
  const byColor = function (cls, color, val) { html = html.replace(new RegExp('(class="[^"]*' + cls + '[^"]*" style="color:' + esc(color) + '">)[^<]*(<)'), function (m, a, b) { return a + val + b; }); };

  const UNI = map.UNI || {};
  const CM  = Array.isArray(map.CM_DATA) ? map.CM_DATA : [];

  if (CM.length) {
    let cm = 0, dy = 0, tw = 0, vw = 0, lk = 0, rt = 0;
    for (const c of CM) {
      const L = c.level || '';
      if (L === 'Chief Minister') cm++;
      else if (L === 'Deputy Chief Minister' || L === 'Dy CM') dy++;
      tw += (+c.tweets) || 0; vw += (+c.views) || 0; lk += (+c.likes) || 0; rt += (+c.rts) || 0;
    }
    byId('cmkCount', CM.length); byId('cmkSub', cm + ' CMs · ' + dy + ' Dy CMs');
    byId('cmkTweets', IN(tw)); byId('cmkTwSub', 'Across ' + CM.length + ' leaders');
    byId('cmkLikes', fmt(lk)); byId('cmkRt', fmt(rt)); byId('cmkViews', fmt(vw));
  }
  if (UNI.level && Array.isArray(UNI.allHandles)) {
    const cnt = {};
    for (const h of UNI.allHandles) { const k = h.level || 'Others'; cnt[k] = (cnt[k] || 0) + 1; }
    const lm = { 'LS MP': ['lvLSMP', 'lvLSMPh'], 'RS MP': ['lvRSMP', 'lvRSMPh'], 'MLA': ['lvMLA', 'lvMLAh'], 'MLC': ['lvMLC', 'lvMLCh'], 'Chief Minister': ['lvCM', 'lvCMh'], 'Dy CM': ['lvDyCM', 'lvDyCMh'], 'Others': ['lvOthers', 'lvOthersh'] };
    for (const L in lm) { byId(lm[L][0], IN(UNI.level[L] || 0)); byId(lm[L][1], IN(cnt[L] || 0)); }
  }
  if (UNI.sent) {
    const s = UNI.sent; const T = ((+s.pos) || 0) + ((+s.neu) || 0) + ((+s.neg) || 0) || 1;
    byColor('sent-card-val', '#FF8F00', IN(s.neu)); byColor('sent-card-pct', '#FF8F00', (s.neu * 100 / T).toFixed(1) + '%');
    byColor('sent-card-val', '#2E7D32', IN(s.pos)); byColor('sent-card-pct', '#2E7D32', (s.pos * 100 / T).toFixed(1) + '%');
    byColor('sent-card-val', '#C62828', IN(s.neg)); byColor('sent-card-pct', '#C62828', (s.neg * 100 / T).toFixed(1) + '%');
  }
  if (UNI.tot) {
    const nStates = CM.length ? new Set(CM.map(function (c) { return c.state; }).filter(function (s) { return s && s.length > 1; })).size : 0;
    const nHandles = Array.isArray(UNI.allHandles) ? UNI.allHandles.length : 0;
    const setSplash = function (label, val) { html = html.replace(new RegExp('(<div class="splash-stat-val">)[^<]*(</div><div class="splash-stat-lbl">' + label + '<)'), function (m, a, b) { return a + val + b; }); };
    setSplash('Tweets', fmt((+UNI.tot.tw) || 0)); setSplash('Handles', IN(nHandles));
    setSplash('Views', fmt((+UNI.tot.vw) || 0)); if (nStates) setSplash('States', IN(nStates));
  }
  if (Array.isArray(map.HASHTAGS)) {
    const htot = map.HASHTAGS.reduce(function (a, h) { return a + ((+h.count) || 0); }, 0);
    byId('hashTweetCount', IN(htot));
  }
  if (Array.isArray(UNI.allHandles)) {
    const up = UNI.allHandles.filter(function (h) { return h.state === 'Uttar Pradesh'; });
    const sum = function (k) { return up.reduce(function (a, h) { return a + ((+h[k]) || 0); }, 0); };
    byId('upKpiHandles', IN(up.length)); byId('upKpiTweets', IN(sum('tw')));
    byId('upKpiViews', fmt(sum('vw'))); byId('upKpiLikes', fmt(sum('lk'))); byId('upKpiRt', fmt(sum('rt')));
  }
  const DATES = Array.isArray((map.AGG || {}).dates) ? map.AGG.dates : (Array.isArray((map.D || {}).AD) ? map.D.AD : []);
  if (DATES.length) {
    const lo = DATES[0], hi = DATES[DATES.length - 1];
    html = html.split('min="2026-04-01"').join('min="' + lo + '"');
    html = html.split('max="2026-07-01"').join('max="' + hi + '"');
    html = html.split('value="2026-04-01"').join('value="' + lo + '"');
    html = html.split('value="2026-07-01"').join('value="' + hi + '"');
    html = html.split("f='2026-04-01',t='2026-07-01'").join("f='" + lo + "',t='" + hi + "'");
  }
  return html;
}

(async () => {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = await findDataDb(client);
    if (!db) throw new Error("Kisi database me '" + COLLECTION + "' collection nahi mili.");
    const docs = await db.collection(COLLECTION).find({}).toArray();
    const phdDocs = await db.collection('phd').find({}).toArray();
    if (!docs.length || !phdDocs.length) throw new Error('dashboard_data / phd khaali hai.');

    const map = {};
    for (const d of docs) map[d.key] = d.value;
    const PHD = {};
    for (const p of phdDocs) PHD[p.h] = { t: p.t, v: p.v, k: p.k, r: p.r };
    map['PHD'] = PHD;

    let html = fs.readFileSync(TEMPLATE, 'utf8');
    for (const key in map) {
      const token = '"__MONGO_' + key + '__"';
      html = html.replace(token, function () { return JSON.stringify(map[key]); });
    }
    html = fillKPIs(html, map);

    fs.mkdirSync(OUTDIR, { recursive: true });
    fs.writeFileSync(OUT, html, 'utf8');
    const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
    console.log('  Offline HTML ban gaya: ' + OUT + '  (' + mb + ' MB)');
    console.log('  Ise double-click karke kholo - server/MongoDB nahi chahiye.');
  } catch (e) {
    console.error('  Offline HTML export ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
