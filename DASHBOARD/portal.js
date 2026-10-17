/*  DATA PORTAL  --  MongoDB se date-range wise CSV download (port 4000)
 *
 *  Alag server hai. Dashboard (3000) ko chhuta nahi.
 *  Login zaroori. Sirf DOWNLOAD hota hai -- koi delete/edit nahi.
 *
 *  Chalao:   node portal.js        (ya START_PORTAL.bat)
 *  Public:   ngrok http 4000
 */
const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 4000;
const MONGO_URL = require('./mongo_conf.js');   // <- central: db_config.json
const DB = 'pulse_master', COLL = 'master_tweets';
// Mongo band ho to 5 sec me saaf error do (30 sec latakne ke bajaye)
const MONGO_OPT = { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 };

// ------------------------------------------------------------------
//  USERS  --  yahan naam/password add ya hata sakte ho
//  (kisi ka access band karna ho to uski line delete kar do + server restart)
// ------------------------------------------------------------------
const USERS = {
  'admin@jarvis.consulting':  { pw: 'admin@Jarvis',  name: 'Admin',      cap: 2000000 },
  'datateam@jarvis.consulting': { pw: 'Data@Jarvis', name: 'Data Team',  cap: 2000000 },
  'client1@jarvis.consulting': { pw: 'Client@2026',  name: 'Client 1',   cap: 500000 },
  'client2@jarvis.consulting': { pw: 'Client@2026',  name: 'Client 2',   cap: 500000 }
};

const SECRET = 'pulse-portal-' + crypto.randomBytes(6).toString('hex'); // restart = sabko dobara login
const COLS = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
  'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets','Total Views',
  'Total Bookmark Tweets Times','Sentiment','Sentiment Score','State','Locations','AC/PC No',
  'AC Name','PC Name','Designation','Candidate Name','Category','Party','Status'];

// ---------------- auth ----------------
function sign(email) {
  return email + '.' + crypto.createHmac('sha256', SECRET).update(email).digest('hex').slice(0, 24);
}
function whoIs(req) {
  const raw = String(req.headers.cookie || '').split(';')
    .map(s => s.trim()).find(s => s.startsWith('portal_auth='));
  if (!raw) return null;
  const val = decodeURIComponent(raw.slice(12));
  // email me khud dot hote hain (jarvis.consulting) -> AAKHRI dot par todo
  const cut = val.lastIndexOf('.');
  if (cut < 1) return null;
  const email = val.slice(0, cut);
  if (!USERS[email] || sign(email) !== val) return null;
  return { email, ...USERS[email] };
}
function guard(req, res, next) {
  const u = whoIs(req);
  if (!u) return res.redirect('/login');
  req.user = u; next();
}
app.use(express.urlencoded({ extended: false }));

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#f4f6fa;color:#16324F}
.wrap{max-width:900px;margin:0 auto;padding:22px 18px 60px}
.top{background:linear-gradient(90deg,#12305C,#1d4a8a);color:#fff;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.top h1{margin:0;font-size:19px;letter-spacing:.4px}.top .sub{font-size:11px;opacity:.8;margin-top:2px}
.who{font-size:12px}.who a{color:#ffd28a;text-decoration:none;font-weight:600;margin-left:10px}
.card{background:#fff;border:1px solid #e3e8f0;border-radius:12px;padding:20px;margin-top:18px;box-shadow:0 1px 3px rgba(16,40,80,.06)}
.card h2{margin:0 0 4px;font-size:15px;color:#12305C}
.hint{font-size:12px;color:#6b7789;margin:0 0 16px}
label{display:block;font-size:11.5px;font-weight:700;color:#54627a;margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px}
input,select{width:100%;padding:9px 11px;border:1px solid #cfd8e6;border-radius:8px;font-size:14px;font-family:inherit;background:#fff}
input:focus,select:focus{outline:none;border-color:#1d4a8a;box-shadow:0 0 0 3px rgba(29,74,138,.12)}
.row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:15px}.col{flex:1;min-width:170px}
.btn{background:#12305C;color:#fff;border:none;padding:11px 26px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
.btn:hover{background:#1d4a8a}.btn.g{background:#1B6B45}.btn.g:hover{background:#178055}
.note{font-size:11.5px;color:#6b7789;margin-top:14px;line-height:1.65;background:#f7f9fc;border-left:3px solid #c9962e;padding:9px 12px;border-radius:0 6px 6px 0}
.err{background:#fdecea;border:1px solid #f5c2bd;color:#a83224;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
th{background:#12305C;color:#fff;padding:8px;text-align:left;font-size:11.5px}
td{padding:7px 8px;border-bottom:1px solid #eef1f6}`;

function page(title, body, user) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${CSS}</style></head><body>
<div class="top"><div><h1>India Political Pulse &mdash; Data Portal</h1>
<div class="sub">MongoDB se date-range wise data download</div></div>
${user ? `<div class="who">${user.name} &nbsp;&middot;&nbsp; ${user.email}<a href="/logout">Logout</a></div>` : ''}
</div><div class="wrap">${body}</div></body></html>`;
}

// ---------------- login ----------------
app.get('/login', (req, res) => {
  const bad = req.query.e ? '<div class="err">Email ya password galat hai.</div>' : '';
  res.send(page('Login', `<div class="card" style="max-width:420px;margin:60px auto">
    <h2>Login</h2><p class="hint">Access ke liye apna email aur password daalo.</p>${bad}
    <form method="post" action="/login">
      <div style="margin-bottom:14px"><label>Email</label><input name="email" type="email" required autofocus></div>
      <div style="margin-bottom:8px"><label>Password</label><input name="pw" type="password" id="pw" required></div>
      <label style="text-transform:none;font-weight:500;font-size:12px;color:#6b7789;margin-bottom:16px">
        <input type="checkbox" style="width:auto;margin-right:6px" onclick="pw.type=this.checked?'text':'password'">Show password</label>
      <button class="btn" style="width:100%">Login</button>
    </form></div>`));
});
app.post('/login', (req, res) => {
  const e = String(req.body.email || '').trim().toLowerCase();
  const u = USERS[e];
  if (!u || u.pw !== String(req.body.pw || '')) return res.redirect('/login?e=1');
  res.set('Set-Cookie', 'portal_auth=' + encodeURIComponent(sign(e)) + '; Path=/; HttpOnly; SameSite=Lax');
  res.redirect('/');
});
app.get('/logout', (req, res) => {
  res.set('Set-Cookie', 'portal_auth=; Max-Age=0; Path=/'); res.redirect('/login');
});

// ---------------- dropdown values (cached 30 min) ----------------
let _opt = null;
async function options() {
  if (_opt && Date.now() - _opt.at < 18e5) return _opt;
  const cli = new MongoClient(MONGO_URL, MONGO_OPT); await cli.connect();
  try {
    const c = cli.db(DB).collection(COLL);
    const clean = a => a.map(x => String(x || '').trim()).filter(x => x && x !== '-').sort();
    const [st, pt, ct] = await Promise.all([
      c.distinct('State'), c.distinct('Party'), c.distinct('Category')]);
    const lo = await c.find({ 'Tweet Date': { $ne: '' } }, { projection: { 'Tweet Date': 1, _id: 0 } })
      .sort({ 'Tweet Date': 1 }).limit(1).toArray();
    const hi = await c.find({ 'Tweet Date': { $ne: '' } }, { projection: { 'Tweet Date': 1, _id: 0 } })
      .sort({ 'Tweet Date': -1 }).limit(1).toArray();
    _opt = { at: Date.now(), states: clean(st), parties: clean(pt), cats: clean(ct),
      total: await c.estimatedDocumentCount(),
      min: lo.length ? String(lo[0]['Tweet Date']).slice(0, 10) : '',
      max: hi.length ? String(hi[0]['Tweet Date']).slice(0, 10) : '' };
    return _opt;
  } finally { await cli.close(); }
}

// ---------------- home ----------------
app.get('/', guard, async (req, res) => {
  try {
    const o = await options();
    const sel = (arr, name, lbl) => `<div class="col"><label>${lbl}</label><select name="${name}">
      <option value="">— sab —</option>${arr.map(v => `<option>${v}</option>`).join('')}</select></div>`;
    res.send(page('Data Portal', `<div class="card">
      <h2>Data download</h2>
      <p class="hint">Database me abhi <b>${o.total.toLocaleString('en-IN')}</b> tweets hain
        (${o.min} se ${o.max} tak). Date range chuno, filter lagao, CSV download karo.</p>
      <form method="get" action="/download">
        <div class="row">
          <div class="col"><label>Kab se</label><input type="date" name="from" value="${o.min}" min="${o.min}" max="${o.max}" required></div>
          <div class="col"><label>Kab tak</label><input type="date" name="to" value="${o.max}" min="${o.min}" max="${o.max}" required></div>
        </div>
        <div class="row">${sel(o.states, 'state', 'State')}${sel(o.parties, 'party', 'Party')}</div>
        <div class="row">${sel(o.cats, 'category', 'Category')}
          <div class="col"><label>Keyword (tweet text me)</label><input name="q" placeholder="jaise: paper leak"></div>
        </div>
        <button class="btn g">&#x2B07;&nbsp; Download CSV</button>
        <a href="/count" style="margin-left:14px;font-size:13px;color:#1d4a8a">pehle ginti dekho</a>
      </form>
      <div class="note">
        <b>Limit:</b> ek baar me zyada se zyada <b>${req.user.cap.toLocaleString('en-IN')}</b> rows.
        Usse zyada chahiye to date range chhota karke do-teen baar nikaal lo.<br>
        File CSV hai (UTF-8) — Excel me seedha khul jaayegi, column nahi phatenge.
      </div></div>
      <div class="card"><h2>Kya milega file me</h2>
      <p class="hint">${COLS.length} column, wahi jo master database me hain:</p>
      <div style="font-size:12px;color:#4a5568;line-height:1.9">${COLS.map(c =>
        `<span style="background:#eef2f8;border-radius:5px;padding:3px 8px;margin-right:5px;white-space:nowrap;display:inline-block">${c}</span>`).join('')}</div>
      </div>`, req.user));
  } catch (e) { res.status(500).send(page('Error', `<div class="card"><div class="err">${e.message}</div></div>`, req.user)); }
});

// ---------------- query banane wala ----------------
function buildQuery(q) {
  const f = {};
  const from = String(q.from || '').trim(), to = String(q.to || '').trim();
  if (from || to) {
    f['Tweet Date'] = {};
    if (from) f['Tweet Date'].$gte = from;
    if (to) f['Tweet Date'].$lte = to + '~';     // 'YYYY-MM-DD HH:MM' bhi aa jaaye
  }
  ['State', 'Party', 'Category'].forEach(k => {
    const v = String(q[k.toLowerCase()] || '').trim();
    if (v) f[k] = v;
  });
  const kw = String(q.q || '').trim();
  if (kw) f['Tweet Text'] = { $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  return f;
}
const nameFor = q => 'PulsePulse_' + [String(q.from || 'start'), 'to', String(q.to || 'today'),
  q.state, q.party, q.category].filter(Boolean).join('_').replace(/[^A-Za-z0-9_\-]/g, '') + '.csv';

// ---------------- count ----------------
app.get('/count', guard, async (req, res) => {
  const cli = new MongoClient(MONGO_URL, MONGO_OPT); await cli.connect();
  try {
    const n = await cli.db(DB).collection(COLL).countDocuments(buildQuery(req.query));
    res.send(page('Ginti', `<div class="card"><h2>Is filter par ${n.toLocaleString('en-IN')} rows milengi</h2>
      <p class="hint">${n > req.user.cap ? 'Limit se zyada hai — sirf pehli ' + req.user.cap.toLocaleString('en-IN') + ' rows aayengi. Date range chhota kar lo.' : 'Limit ke andar hai, poora data mil jaayega.'}</p>
      <a class="btn" href="/" style="text-decoration:none;display:inline-block">&larr; Wapas</a></div>`, req.user));
  } finally { await cli.close(); }
});

// ---------------- CSV download (stream) ----------------
const BAD = /[\r\n\t ​]+/g;
const cell = v => '"' + String(v === undefined || v === null ? '' : v).replace(BAD, ' ').replace(/"/g, '""').trim() + '"';

app.get('/download', guard, async (req, res) => {
  const cli = new MongoClient(MONGO_URL, MONGO_OPT);
  try {
    await cli.connect();
    const f = buildQuery(req.query);
    const fname = nameFor(req.query);
    console.log('[' + new Date().toLocaleString() + '] ' + req.user.email + ' -> ' + JSON.stringify(f));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
    res.write('﻿' + COLS.map(cell).join(',') + '\r\n');       // BOM = Excel me Hindi sahi
    const cur = cli.db(DB).collection(COLL)
      .find(f, { projection: Object.fromEntries(COLS.map(c => [c, 1])) })
      .limit(req.user.cap).batchSize(2000);
    let n = 0;
    for await (const d of cur) {
      res.write(COLS.map(c => cell(d[c])).join(',') + '\r\n');
      n++;
    }
    res.end();
    console.log('   -> ' + n.toLocaleString('en-IN') + ' rows: ' + fname);
  } catch (e) {
    if (!res.headersSent) res.status(500).send(page('Error',
      `<div class="card"><div class="err">${e.message}</div><a class="btn" href="/">Wapas</a></div>`, req.user));
    else res.end();
  } finally { await cli.close(); }
});

app.listen(PORT, () => {
  console.log('\n  DATA PORTAL  ->  http://localhost:' + PORT);
  console.log('  Public karne ke liye alag window me:  ngrok http ' + PORT);
  console.log('  Users: ' + Object.keys(USERS).join(', '));
  console.log('  (server restart = sabko dobara login karna padega)\n');
});
