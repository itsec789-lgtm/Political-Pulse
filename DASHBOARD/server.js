/*  India Political Pulse - Dashboard served from MongoDB
 *  Ye server MongoDB se data laata hai aur dashboard me daal kar dikhata hai.
 *  Chalao:  npm install  ->  npm start  ->  http://localhost:3000
 */

const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URL  = require('./mongo_conf.js');   // <- central: db_config.json
/* ---- audit-fix T2 (A6/A7) ----------------------------------------
   Pehle is file me 35 jagah alag-alag Mongo client bante the -- har request par
   naya client, naya connection, phir close. Pooling client ke ANDAR hoti
   hai, isliye har baar naya banane se pooling bekaar ho jaati thi.
   7 jagah timeout bhi nahi tha -> Mongo band hone par 30 second ka latka.
   Ab sab ek hi pool se chalte hain (mongo_pool.js). */
const MP = require('./mongo_pool.js');
/* ---- tracker-tab : Handle Tracker (X se scrape -> master_tweets) ---- */
const TRK = require('./x_scraper.js');
const TRKUI = require('./tracker_section.js');
const COLLECTION = 'dashboard_data';
const PORT       = parseInt(process.env.PULSE_PORT, 10) || 3000;
/* PULSE_TEST_NO_JOBS=1 : sirf test ke liye doosra server (alag port) -- mapping
   sync, Mapping.xlsx watcher aur Tracker NAHI chalte, taaki test kuch likhe nahi. */
const NO_JOBS    = process.env.PULSE_TEST_NO_JOBS === '1';
// har scope apna template: All-India = yahi, UP = UP-DASHBOARD ka
const TEMPLATE_ALL = path.join(__dirname, 'dashboard.template.html');
const TEMPLATE_UP  = path.join(__dirname, '..', 'UP-DASHBOARD', 'dashboard.template.html');
const R = require('./report_lib.js');   // UP report tab
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

/* ---------- GZIP ----------
 * Dashboard ka HTML ~6 MB ka hai (saara data usi me bake hota hai).
 * Mobile data par ye bahut bhaari padta tha. Node ke apne zlib se dabaa dete hain
 * -- koi npm package nahi chahiye. ~6 MB -> ~1.6 MB.
 * CSV download (already stream) aur chhote responses chhod dete hain. */
const zlib = require('zlib');
app.use(function (req, res, next) {
  var ae = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/.test(ae)) return next();
  var _send = res.send.bind(res);
  res.send = function (body) {
    try {
      if (res.getHeader('Content-Encoding')) return _send(body);
      var buf = Buffer.isBuffer(body) ? body
              : (typeof body === 'string' ? Buffer.from(body, 'utf8') : null);
      if (!buf || buf.length < 2048) return _send(body);      // chhoti cheezon par faayda nahi
      /* audit-fix T2 (A8)
         Pehle yahan zlib.gzipSync() tha. Dashboard ka HTML ~6 MB ka hai,
         aur gzipSync poore waqt Node ka ikloata thread ROK deta hai --
         us dauraan baaki SAARI requests (dusre users, /api/version,
         Handle Analytics) ruki rehti hain. Teen-chaar log ek saath
         dashboard kholein to server atka hua lagta tha.
         Async gzip wahi kaam libuv ke threadpool par karta hai, main
         thread khaali rehta hai. */
      zlib.gzip(buf, { level: 6 }, function (err, gz) {
        if (err || res.headersSent) { try { _send(body); } catch (e2) {} return; }
        try {
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Vary', 'Accept-Encoding');
          res.removeHeader('Content-Length');
        } catch (e3) { try { _send(body); } catch (e4) {} return; }
        try { _send(gz); } catch (e5) {}
      });
      return res;
    } catch (e) { return _send(body); }
  };
  next();
});

// server kabhi na gire -- warna ngrok par white page aata hai
process.on('uncaughtException', function (e) { console.log('!! uncaughtException: ' + (e && e.stack || e)); });
process.on('unhandledRejection', function (e) { console.log('!! unhandledRejection: ' + (e && e.stack || e)); });

// ---------- LOGIN / roles ----------
/* ---- audit-fix T3 (A9/A10/A11) ------------------------------------------
   Password, session aur login-throttle ab auth_lib.js me hain.

   PEHLE KYA THA:
     * AUTH_SECRET seedha is file me likha tha (git/backup me chala jaata)
     * BOOT har start par naya banta tha -> HAR restart par sab log out.
       START_LIVE.bat har push par server restart karta hai, to ye roz
       kai baar hota tha.
     * cookie me waqt nahi tha, isliye account band karne par bhi uska
       cookie 12 ghante chalta rehta tha.

   AB:
     secret ek file me (auth_secret.json, pehli baar apne aap banti hai) --
     restart par koi log out nahi. Cookie me banne ka waqt likha hai aur har
     request par jaancha jaata hai, isliye account band / password badalte
     hi purani cookie usi pal mar jaati hai. */
const AUTH = require('./auth_lib.js');
const AUTH_SECRET = AUTH.loadSecret(__dirname, console.log);
/* ---- audit-fix T3 (A9): base account ke password ----------------------
   Ye 5 account code me hain (panel wale users Mongo me hote hain, unka
   password ab apne aap hash ho jaata hai).

   Yahan abhi bhi saada password likha hai -- matlab jisko ye file ya
   iska backup mil jaaye, use ye 5 password mil jaate hain.

   Hatane ka tarika (login bilkul waise hi chalta rahega):
       cd DASHBOARD
       node make_pw_hash.js
   password do baar daalo, jo line mile wo neeche purani `pw: '...'` ki
   jagah paste kar do. User wahi purana password daalega -- usse koi
   farak nahi padta, bas file me likha hua nahi rahega.

   auth_lib.js dono shakl samajhta hai, isliye ek-ek karke badal sakte ho. */
const USERS = {
  'uttarpradesh@jarvis.consulting': { pw: 'Up@Jarvis',    role: 'up'    },  // sirf UP
  'punjab@jarvis.consulting':       { pw: 'Punjab@Jarvis', role: 'punjab' }, // sirf Punjab
  'indiapulse@jarvis.consulting':   { pw: 'India@Jarvis', role: 'all'   },  // sirf All India
  'admin@jarvis.consulting':        { pw: 'admin@Jarvis', role: 'admin' },  // dono dashboard
  'admin_1@jarvis.consulting':      { pw: 'admin_1@Jarvis', role: 'backend' } // Backend Admin Panel (raw data + report)
};
// cookie = "role~email.signature"  (email chahiye taaki password change ho sake)
/* audit-fix T3 : cookie banana. Ab isme waqt bhi jaata hai. */
function _sign(role, email) { return AUTH.issue(AUTH_SECRET, role, email); }

/* Ye cookie ab bhi chalni chahiye? (A11)
   - account deactivate ho gaya          -> nahi
   - password cookie banne ke BAAD badla -> nahi
   _dbUsers/_dbOff pehle se memory me hain (har 60 sec refresh), isliye
   har request par DB query nahi hoti. */
function _revoked(email, iatSec) {
  try {
    var e = String(email || '').toLowerCase();
    if (!e) return false;
    if (_dbOff[e]) return true;                       // band kar diya gaya
    var u = _dbUsers[e];
    if (u && u.pwChangedAt) {
      var t = Date.parse(u.pwChangedAt);
      if (t && Math.floor(t / 1000) > iatSec) return true;   // password badla
    }
  } catch (x) {}
  return false;
}

function _parse(req) {
  return AUTH.parse(AUTH_SECRET, _cookie(req, 'pulse_auth'), _revoked);
}
// login ke baad kaunsa dashboard -- ek hi jagah, taaki har jagah ternary na likhni pade
function homeFor(role) {
  if (role === 'backend') return '/admin';
  if (role === 'up')      return '/up';
  if (role === 'punjab')  return '/punjab/';
  return '/';
}
function emailOf(req) { var u = _parse(req); return u ? u.email : ''; }
function _cookie(req, name) { var c = req.headers.cookie || ''; var m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
function roleOf(req) { var u = _parse(req); return u ? u.role : null; }

const MAIL = require('./mailer.js');
/* ---- BUILD stamp ----
   Ye batata hai ki JO server.js abhi chal raha hai wo kitna purana hai.
   server.js badalne par page apne aap nahi badalta -- server dobara
   chalana padta hai. Dikhta hai: Admin Panel -> Active Logins, aur
   http://localhost:3000/api/build par. */
var BUILD = '2026-10-13a cat-cards + nayi mapping';
try {
  BUILD += '  (server.js: ' + new Date(fs.statSync(__filename).mtime)
    .toLocaleString('en-IN') + ')';
} catch (e) {}

const LP = require('./login_page.js');
var loginPage = LP.loginPage;

/* ---------- Approve kiye hue users (MongoDB) ----------
 * USERS upar wale 4 base account hain (code me).
 * Ye wale panel se approve hone par bante hain -- server restart ki zaroorat nahi. */
const USER_DB = 'pulse_master', USER_COLL = 'portal_users';
const ROLE_LABEL = { all: 'All India', up: 'Uttar Pradesh', punjab: 'Punjab', admin: 'Sabhi dashboard', backend: 'Backend panel' };
var _dbUsers = {}, _dbOff = {}, _duAt = 0;

async function loadUsers(force) {
  if (!force && Date.now() - _duAt < 30000) return _dbUsers;
  var cli = MP.client();
  try {
    await cli.connect();
    var rows = await cli.db(USER_DB).collection(USER_COLL).find({}).toArray();
    var m = {}, off = {};
    rows.forEach(function (u) {
      var e = String(u.email).toLowerCase();
      if (u.active === false) off[e] = 1; else m[e] = u;   // login sirf active ko
    });
    _dbUsers = m; _dbOff = off; _duAt = Date.now();
  } catch (e) { console.log('  [USERS] load skip: ' + e.message); _duAt = Date.now(); }
  finally { try { await cli.close(); } catch (e2) {} }
  return _dbUsers;
}
loadUsers(true);
setInterval(function () { loadUsers(true); }, 60000);

function newToken() { return crypto.randomBytes(24).toString('hex'); }
function baseUrl() {
  var c = MAIL.config() || {};
  return String(c.url || 'http://localhost:3000').replace(/\/login\/?$/, '').replace(/\/$/, '');
}
// user ko set-password link do (naya account ya reset dono ke liye)
async function issueSetLink(cli, email, name, role, isReset) {
  var tok = newToken();
  await cli.db(USER_DB).collection(USER_COLL).updateOne({ email: email },
    { $set: { setToken: tok, setTokenExp: Date.now() + 7 * 24 * 3600 * 1000 } });
  var link = baseUrl() + '/set-password?t=' + tok;
  var rl = ROLE_LABEL[role] || '';
  await MAIL.sendMail(email,
    isReset ? 'Reset your India Political Pulse password' : 'Activate your India Political Pulse account',
    MAIL.inviteHtml(name || email, email, link, rl, isReset),
    MAIL.inviteText(name || email, email, link, rl, isReset));
  return link;
}

function newPassword() {
  var a = 'abcdefghjkmnpqrstuvwxyz', n = '23456789';
  var w = ''; for (var i = 0; i < 3; i++) w += a[Math.floor(Math.random() * a.length)];
  var d = ''; for (var j = 0; j < 4; j++) d += n[Math.floor(Math.random() * n.length)];
  return 'Pulse-' + d + '-' + w;
}

app.get('/login', function (req, res) {
  if (roleOf(req)) { return res.redirect(homeFor(roleOf(req))); }
  var sent = req.query.sent === '1';
  res.set('Cache-Control', 'no-store').set('Content-Type', 'text/html; charset=utf-8')
     .send(loginPage('', sent ? 'Request submitted. Once approved, your login details will be emailed to you.' : '',
                     req.query.req === '1'));
});
/* audit-fix T3 : asli IP (ngrok/proxy ke peeche bhi) */
function _ip(req) {
  var f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || String(req.ip || (req.connection && req.connection.remoteAddress) || '');
}

app.post('/login', async function (req, res) {
  /* ---- audit-fix T3 (A10): login par rok ----------------------------------
     Pehle yahan kuch nahi tha -- koi bhi unlimited password aazma sakta
     tha, aur server ngrok se public hai. Ab 15 minute me ek email par 8
     aur ek IP se 20 galat koshishon ke baad 10 minute ka viraam. Sahi
     login hote hi hisaab saaf ho jaata hai. */
  {
    var _g = AUTH.throttle.check(_ip(req), String(req.body.email || '').trim().toLowerCase());
    if (!_g.allowed) {
      var mins = Math.ceil(_g.retryAfterSec / 60);
      logLogin(req, String(req.body.email || '').trim().toLowerCase(), '', 'throttled', _g.why);
      return res.status(429).set('Retry-After', String(_g.retryAfterSec))
        .set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-store')
        .send(loginPage('Too many failed attempts. Please wait about '
              + mins + ' minute' + (mins === 1 ? '' : 's') + ' and try again.', '', false));
    }
  }
  var email = String(req.body.email || '').trim().toLowerCase();
  var pw = String(req.body.password || '');
  var u = USERS[email];
  var base = !!u;
  if (!u) { await loadUsers(); u = _dbUsers[email]; }   // panel se approve kiye hue users
  if (u && !u.pw) {
    logLogin(req, email, u.role, 'not-activated', '');
    return res.status(401).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control','no-store')
      .send(loginPage('This account is not activated yet. Please open the activation link we emailed you, or use "Forgot your password?" to get a new one.', '', false));
  }
  /* audit-fix T3 (A9/A10)
     Pehle: u.pw !== pw  -- saada text, aur timing bhi leak karta tha.
     Ab: scrypt verify (constant-time). Purane plain-text password bhi
     chalte hain, par pehli kaamyaab login par chupchap hash me badal
     jaate hain -- kisi user ko kuch karna nahi padta. */
  /* `u` ho hi na (aisa email hai hi nahi) -- purana code `!u ||` se ye
     sambhalta tha, nayi lineon me wo chhoot gaya tha aur u.pw padhne par
     route crash kar jaata. Ab pehle `u` dekh lete hain. */
  var vr = u ? AUTH.verifyPw(u.pw, pw) : { ok: false, legacy: false };
  if (!vr.ok) {
    AUTH.throttle.fail(_ip(req), email);
    logLogin(req, email, (u && u.role) || '',
      u ? 'bad-password' : (_dbOff[email] ? 'deactivated' : 'no-account'), '');
    return res.status(401).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control','no-store').send(loginPage('Incorrect email or password.', '', false));
  }
  AUTH.throttle.pass(_ip(req), email);

  /* purana saada password -> ab hash karke rakh do (sirf panel wale users;
     code wale 4 base account Mongo me hote hi nahi) */
  if (vr.legacy && !base) {
    try {
      var hc = MP.client(); await hc.connect();
      await hc.db(USER_DB).collection(USER_COLL).updateOne({ email: email },
        { $set: { pw: AUTH.hashPw(pw) } });
      await loadUsers(true);
      console.log('[AUTH] ' + email + ' ka purana password hash me badal diya');
    } catch (e) { console.log('[AUTH] hash upgrade skip: ' + e.message); }
  }
  logLogin(req, email, u.role, 'ok', base ? 'base account' : (u.name || ''));
  res.set('Set-Cookie', 'pulse_auth=' + encodeURIComponent(_sign(u.role, email)) + '; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax');
  res.redirect(homeFor(u.role));
});
// ---------- set / reset password (email ke link se) ----------
async function findByToken(tok) {
  if (!/^[a-f0-9]{20,80}$/.test(String(tok || ''))) return null;
  var cli = MP.client();
  try {
    await cli.connect();
    var u = await cli.db(USER_DB).collection(USER_COLL).findOne({ setToken: String(tok), active: true });
    if (!u) return null;
    if (u.setTokenExp && Date.now() > u.setTokenExp) return { expired: true };
    return u;
  } catch (e) { console.log('[SETPW] lookup fail: ' + e.message); return null; }
  finally { try { await cli.close(); } catch (e2) {} }
}

app.get('/set-password', async function (req, res) {
  var u = await findByToken(req.query.t);
  res.set('Cache-Control', 'no-store').set('Content-Type', 'text/html; charset=utf-8');
  if (!u) return res.send(LP.linkDeadPage('This link is not valid. It may have already been used.'));
  if (u.expired) return res.send(LP.linkDeadPage('This link has expired. Please request a new one.'));
  res.send(LP.setPasswordPage(u.email, !!u.pw, req.query.e || '', String(req.query.t)));
});

app.post('/set-password', async function (req, res) {
  var tok = String(req.body.t || '');
  var u = await findByToken(tok);
  if (!u || u.expired) return res.set('Content-Type', 'text/html; charset=utf-8')
    .send(LP.linkDeadPage('This link is no longer valid.'));
  var p1 = String(req.body.pw1 || ''), p2 = String(req.body.pw2 || '');
  var back = function (m) { return res.redirect('/set-password?t=' + encodeURIComponent(tok) + '&e=' + encodeURIComponent(m)); };
  if (p1.length < 8) return back('Password must be at least 8 characters.');
  if (p1 !== p2)     return back('The two passwords do not match.');
  var cli = MP.client();
  try {
    await cli.connect();
    await cli.db(USER_DB).collection(USER_COLL).updateOne({ email: u.email },
      { $set: { pw: AUTH.hashPw(p1), pwChangedAt: new Date(),      /* audit-fix T3 */
                setToken: '', setTokenExp: 0, mustChange: false } });
    await loadUsers(true);
    console.log('[SETPW] password set by ' + u.email);
  } catch (e) {
    console.log('[SETPW] save fail: ' + e.message);
    return back('Could not save. Please try again.');
  } finally { try { await cli.close(); } catch (e2) {} }
  // seedha login kar do
  res.set('Set-Cookie', 'pulse_auth=' + encodeURIComponent(_sign(u.role, u.email)) + '; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax');
  res.redirect(homeFor(u.role));
});

// ---------- forgot password ----------
var _fgLast = {};
app.get('/forgot', function (req, res) {
  res.set('Cache-Control', 'no-store').set('Content-Type', 'text/html; charset=utf-8')
     .send(LP.forgotPage(req.query.e || '', req.query.ok ? 'If that email is registered, a reset link has been sent to it.' : ''));
});
app.post('/forgot', async function (req, res) {
  var email = String(req.body.email || '').trim().toLowerCase();
  if (!/\S+@\S+\.\S+/.test(email)) return res.redirect('/forgot?e=' + encodeURIComponent('Enter a valid email address.'));
  var now = Date.now();
  if (_fgLast[email] && now - _fgLast[email] < 120000) return res.redirect('/forgot?ok=1');
  _fgLast[email] = now;
  if (USERS[email]) {                       // base account -- reset nahi hota
    console.log('[FORGOT] base account, skip: ' + email);
    return res.redirect('/forgot?ok=1');
  }
  var cli = MP.client();
  try {
    await cli.connect();
    var c = cli.db(USER_DB).collection(USER_COLL);
    var u = await c.findOne({ email: email, active: true });
    if (u) {
      await issueSetLink(cli, email, u.name, u.role, true);     // sirf link -- password nahi
      console.log('[FORGOT] reset link mailed -> ' + email);
    } else {
      console.log('[FORGOT] unknown email: ' + email);   // user ko nahi batate
    }
  } catch (e) { console.log('[FORGOT] fail: ' + e.message); }
  finally { try { await cli.close(); } catch (e2) {} }
  res.redirect('/forgot?ok=1');
});

app.get('/logout', function (req, res) {
  var u = _parse(req);
  if (u && u.email) logLogin(req, u.email, u.role, 'logout', '');
  res.set('Set-Cookie', 'pulse_auth=; Max-Age=0; Path=/');
  res.redirect('/login');
});

/* ---------- LOGIN ACTIVITY LOG ----------
 * Har login attempt (success + fail + logout) pulse_master.login_log me jaata hai.
 * Insert BACKGROUND me hota hai -- login kabhi Mongo ka intezaar nahi karta. */
const LOG_DB = 'pulse_master', LOG_COLL = 'login_log';

function _tidyIp(ip) {
  ip = String(ip || '').trim().replace(/^::ffff:/, '');
  if (ip === '::1' || ip === '127.0.0.1') return 'localhost';
  if (/^\[?[0-9a-f:]+\]?:\d+$/i.test(ip) && ip.indexOf('.') < 0) return ip;  // IPv6
  return ip.replace(/:\d+$/, '');            // port hata do
}

/* Asli client ka IP.
 * Sab log ek hi IP dikha rahe the -- ye aksar SAHI hota hai (ek hi office/WiFi
 * se aane wale sabka PUBLIC IP ek hi hota hai, NAT ki wajah se). Par pakka
 * karne ke liye ab kai header dekhte hain aur poori chain bhi save karte hain. */
function clientIp(req) {
  var h = req.headers || {};
  // ngrok / Cloudflare / nginx -- jo bhi beech me ho
  var cand = [h['cf-connecting-ip'], h['true-client-ip'], h['x-real-ip'],
              h['fly-client-ip'], h['x-client-ip']];
  for (var i = 0; i < cand.length; i++) {
    var c = _tidyIp(cand[i]);
    if (c && c !== 'localhost') return c;
  }
  // X-Forwarded-For = "asli-client, proxy1, proxy2"  -> pehla wala lo
  var xff = String(h['x-forwarded-for'] || '').split(',').map(_tidyIp).filter(Boolean);
  for (var j = 0; j < xff.length; j++) {
    if (xff[j] !== 'localhost') return xff[j];
  }
  return _tidyIp((req.socket && req.socket.remoteAddress) || '');
}

/* Raw chain -- isse pata chalega ki IP kahan se aaya aur beech me kaun tha */
function ipChain(req) {
  var h = req.headers || {};
  var bits = [];
  ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip',
   'x-forwarded-host'].forEach(function (k) {
    if (h[k]) bits.push(k + '=' + String(h[k]).slice(0, 90));
  });
  bits.push('socket=' + _tidyIp((req.socket && req.socket.remoteAddress) || ''));
  return bits.join(' | ');
}
// User-Agent ko chhote padhne-layak naam me badlo
function deviceOf(ua) {
  ua = String(ua || '');
  if (!ua) return '';
  var os = /Windows NT/i.test(ua) ? 'Windows'
         : /Android/i.test(ua) ? 'Android'
         : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad'
         : /Mac OS X/i.test(ua) ? 'Mac'
         : /Linux/i.test(ua) ? 'Linux' : '';
  var br = /Edg\//i.test(ua) ? 'Edge'
         : /OPR\/|Opera/i.test(ua) ? 'Opera'
         : /Chrome\//i.test(ua) ? 'Chrome'
         : /Firefox\//i.test(ua) ? 'Firefox'
         : /Safari\//i.test(ua) ? 'Safari' : '';
  var s = [br, os].filter(Boolean).join(' · ');
  return s || ua.slice(0, 40);
}

function logLogin(req, email, role, status, note) {
  (async function () {
    var cli = MP.client();
    try {
      await cli.connect();
      await cli.db(LOG_DB).collection(LOG_COLL).insertOne({
        at: new Date(),
        email: String(email || '').toLowerCase().slice(0, 120),
        role: String(role || ''),
        status: status,                       // ok | bad-password | no-account | not-activated | deactivated | logout
        ip: clientIp(req),
        ipChain: ipChain(req),          // debug ke liye poori chain
        device: deviceOf(req.headers['user-agent']),
        ua: String(req.headers['user-agent'] || '').slice(0, 250),
        note: String(note || '').slice(0, 120)
      });
    } catch (e) { console.log('  [LOGLOG] skip: ' + e.message); }
    finally { try { await cli.close(); } catch (e2) {} }
  })();
}

// panel ke filter -> Mongo filter
function logQuery(q) {
  var f = {};
  var from = String(q.lgfrom || '').trim(), to = String(q.lgto || '').trim();
  if (from || to) {
    f.at = {};
    if (from) f.at.$gte = new Date(from + 'T00:00:00');
    if (to)   f.at.$lte = new Date(to   + 'T23:59:59');
  }
  var em = String(q.lgemail || '').trim().toLowerCase();
  if (em) f.email = em;
  var st = String(q.lgstatus || '').trim();
  if (st === 'ok') f.status = 'ok';
  else if (st === 'fail') f.status = { $in: ['bad-password', 'no-account', 'not-activated', 'deactivated'] };
  else if (st === 'logout') f.status = 'logout';
  return f;
}

async function loginLogRows(q, limit) {
  var cli = MP.client();
  try {
    await cli.connect();
    var c = cli.db(LOG_DB).collection(LOG_COLL);
    try { await c.createIndex({ at: -1 }, { background: true }); } catch (e0) {}
    var rows = await c.find(logQuery(q)).sort({ at: -1 }).limit(limit || 300).toArray();
    var emails = await c.distinct('email');
    return { rows: rows, emails: (emails || []).filter(Boolean).sort(), ok: true };
  } catch (e) {
    console.log('  [LOGLOG] read skip: ' + e.message);
    return { rows: [], emails: [], ok: false, err: e.message };
  } finally { try { await cli.close(); } catch (e2) {} }
}

var STATUS_CHIP = {
  'ok':            ['#1B6B45', '#DFF3E8', 'SUCCESS'],
  'bad-password':  ['#A83224', '#FBE3DF', 'WRONG PASSWORD'],
  'no-account':    ['#A83224', '#FBE3DF', 'NO SUCH ACCOUNT'],
  'not-activated': ['#C2410C', '#FDEBD8', 'NOT ACTIVATED'],
  'deactivated':   ['#C2410C', '#FDEBD8', 'DEACTIVATED'],
  'logout':        ['#7A6A5E', '#EFEAE4', 'SIGNED OUT']
};
function fmtWhen(d) {
  try {
    return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) { return String(d || ''); }
}

// ---------- Request access -> MongoDB ----------
const REQ_DB = 'pulse_master', REQ_COLL = 'access_requests';
var _reqLast = {};                       // spam rok: ek email 60 sec me ek baar
app.post('/request-access', async function (req, res) {
  var d = {
    name:  String(req.body.name  || '').trim().slice(0, 80),
    email: String(req.body.email || '').trim().toLowerCase().slice(0, 120),
    org:   String(req.body.org   || '').trim().slice(0, 100),
    want:  String(req.body.want  || '').trim().slice(0, 40),
    reason:String(req.body.reason|| '').trim().slice(0, 300)
  };
  if (!d.name || !/\S+@\S+\.\S+/.test(d.email) || !d.org)
    return res.redirect('/login?req=1');
  var now = Date.now();
  if (_reqLast[d.email] && now - _reqLast[d.email] < 60000) return res.redirect('/login?sent=1');
  _reqLast[d.email] = now;
  d.at = new Date();
  d.status = 'pending';
  d.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  var cli = MP.client();
  try {
    await cli.connect();
    await cli.db(REQ_DB).collection(REQ_COLL).insertOne(d);
    console.log('[ACCESS REQUEST] ' + d.name + ' <' + d.email + '> ' + d.org + ' -> ' + d.want);
    try {                                     // admin ko turant khabar
      var amc = MAIL.config() || {};
      var to = amc.admin || amc.user;
      if (to) {
        await MAIL.sendMail(to, 'New access request - ' + d.name + ' (' + d.org + ')',
          MAIL.requestHtml(d, (amc.url || '').replace(/\/login\/?$/, '') + '/admin#requests'),
          MAIL.requestText(d));
        console.log('[MAIL] request alert -> ' + to);
      }
    } catch (ae) { console.log('[MAIL] request alert fail: ' + ae.message); }
  } catch (e) { console.log('[ACCESS REQUEST] save fail: ' + e.message); }
  finally { try { await cli.close(); } catch (e2) {} }
  res.redirect('/login?sent=1');
});

// scope -> mongodb database
const SCOPE_DB = { all: 'india_Pulse', up: 'up_pulse' };

async function findDataDb(client, dbName) {
  // pehle scope ka db try karo
  if (dbName) {
    const db = client.db(dbName);
    const names = (await db.listCollections().toArray()).map(function (c) { return c.name; });
    if (names.includes(COLLECTION) && names.includes('phd')) return db;
  }
  // fallback: auto-detect (purana behaviour)
  const { databases } = await client.db().admin().listDatabases();
  for (const info of databases) {
    const db = client.db(info.name);
    const names = (await db.listCollections().toArray()).map(function (c) { return c.name; });
    if (names.includes(COLLECTION) && names.includes('phd')) return db;
  }
  return null;
}

// server-side KPI fill - numbers seedha markup me daal do (client JS ke bina)
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
      tw += (+c.tweets) || 0;
      vw += (+c.views) || 0;
      lk += (+c.likes) || 0;
      rt += (+c.rts) || 0;
    }
    byId('cmkCount', CM.length);
    byId('cmkSub', cm + ' CMs · ' + dy + ' Dy CMs');
    byId('cmkTweets', IN(tw));
    byId('cmkTwSub', 'Across ' + CM.length + ' leaders');
    byId('cmkLikes', fmt(lk));
    byId('cmkRt', fmt(rt));
    byId('cmkViews', fmt(vw));
  }

  if (UNI.level && Array.isArray(UNI.allHandles)) {
    const cnt = {};
    for (const h of UNI.allHandles) { const k = h.level || 'Others'; cnt[k] = (cnt[k] || 0) + 1; }
    const lm = {
      'LS MP': ['lvLSMP', 'lvLSMPh'], 'RS MP': ['lvRSMP', 'lvRSMPh'], 'MLA': ['lvMLA', 'lvMLAh'],
      'MLC': ['lvMLC', 'lvMLCh'], 'Chief Minister': ['lvCM', 'lvCMh'], 'Dy CM': ['lvDyCM', 'lvDyCMh'],
      'Others': ['lvOthers', 'lvOthersh']
    };
    for (const L in lm) { byId(lm[L][0], IN(UNI.level[L] || 0)); byId(lm[L][1], IN(cnt[L] || 0)); }
  }

  if (UNI.sent) {
    const s = UNI.sent;
    const T = ((+s.pos) || 0) + ((+s.neu) || 0) + ((+s.neg) || 0) || 1;
    byColor('sent-card-val', '#FF8F00', IN(s.neu)); byColor('sent-card-pct', '#FF8F00', (s.neu * 100 / T).toFixed(1) + '%');
    byColor('sent-card-val', '#2E7D32', IN(s.pos)); byColor('sent-card-pct', '#2E7D32', (s.pos * 100 / T).toFixed(1) + '%');
    byColor('sent-card-val', '#C62828', IN(s.neg)); byColor('sent-card-pct', '#C62828', (s.neg * 100 / T).toFixed(1) + '%');
  }

  if (UNI.tot) {
    const nStates = CM.length ? new Set(CM.map(function (c) { return c.state; }).filter(function (s) { return s && s.length > 1; })).size : 0;
    const nHandles = Array.isArray(UNI.allHandles) ? UNI.allHandles.length : 0;
    /* fix-md (12-Oct): label ab regex me seedha nahi jaata. "States + UT"
       me '+' regex ka special character hai -- bina escape ke match hi
       nahi hota tha aur chip par '\u2014' hi reh jaata. */
    const rxEsc = function (x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    const setSplash = function (label, val) { html = html.replace(new RegExp('(<div class="splash-stat-val">)[^<]*(</div><div class="splash-stat-lbl">' + rxEsc(label) + '<)'), function (m, a, b) { return a + val + b; }); };
    setSplash('Tweets', fmt((+UNI.tot.tw) || 0));
    setSplash('Handles', IN(nHandles));
    setSplash('Views', fmt((+UNI.tot.vw) || 0));
    if (nStates) setSplash('States + UT', IN(nStates));   // All-India template
    // UP template: Districts stat (UNI.updist se). India template me ye label nahi -> no-op.
    const nDist = (UNI.updist && typeof UNI.updist === 'object') ? Object.keys(UNI.updist).length : 0;
    if (nDist) setSplash('Districts', IN(nDist));
  }

  if (Array.isArray(map.HASHTAGS)) {
    const htot = map.HASHTAGS.reduce(function (a, h) { return a + ((+h.count) || 0); }, 0);
    byId('hashTweetCount', IN(htot));
  }

  if (Array.isArray(UNI.allHandles)) {
    // parties-tab chip: "X tweets · Y handles" = top-5 parties ka FRESH sum (baked purana replace)
    var byP = {};
    UNI.allHandles.forEach(function (h) { var p = h.party || '—'; (byP[p] = byP[p] || { tw: 0, n: 0 }); byP[p].tw += (+h.tw) || 0; byP[p].n += 1; });
    var top5 = Object.keys(byP).map(function (p) { return byP[p]; }).sort(function (a, b) { return b.tw - a.tw; }).slice(0, 5);
    var t5t = top5.reduce(function (a, x) { return a + x.tw; }, 0), t5h = top5.reduce(function (a, x) { return a + x.n; }, 0);
    html = html.replace(/(<div class="filter-info"[^>]*><span>)[^<]*(<\/span> tweets · <span>)[^<]*(<\/span> handles<\/div>)/g,
      function (m, a, b, c) { return a + IN(t5t) + b + IN(t5h) + c; });
    const up = UNI.allHandles.filter(function (h) { return h.state === 'Uttar Pradesh'; });
    const sum = function (k) { return up.reduce(function (a, h) { return a + ((+h[k]) || 0); }, 0); };
    byId('upKpiHandles', IN(up.length));
    byId('upKpiTweets', IN(sum('tw')));
    byId('upKpiViews', fmt(sum('vw')));
    byId('upKpiLikes', fmt(sum('lk')));
    byId('upKpiRt', fmt(sum('rt')));
  }

  // date pickers ka range data ke ACTUAL dates se (naya month add ho to calendar/filter bhi extend)
  const DATES = Array.isArray((map.AGG || {}).dates) ? map.AGG.dates : (Array.isArray((map.D || {}).AD) ? map.D.AD : []);
  if (DATES.length) {
    const lo = DATES[0], hi = DATES[DATES.length - 1];
    html = html.split('min="2026-04-01"').join('min="' + lo + '"');
    html = html.split('max="2026-07-01"').join('max="' + hi + '"');
    html = html.split('value="2026-04-01"').join('value="' + lo + '"');
    html = html.split('value="2026-07-01"').join('value="' + hi + '"');
    html = html.split("f='2026-04-01',t='2026-07-01'").join("f='" + lo + "',t='" + hi + "'");
    // date-range text label ko actual data-range se (Apr-Jul 2026 hardcoded tha)
    var _mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var _loM = _mn[(+lo.slice(5,7)) - 1], _hiM = _mn[(+hi.slice(5,7)) - 1], _yr = hi.slice(0,4);
    html = html.split('Apr–Jul 2026').join(_loM + '–' + _hiM + ' ' + _yr);
    html = html.split('Apr–Jul').join(_loM + '–' + _hiM);
  }
  // "Today (1 Jul)" dropdown label -> sirf "Today" (dono templates)
  html = html.split('Today (1 Jul)').join('Today');
  html = html.split('Today (01 Jul)').join('Today');

  return html;
}

/* ===== mj-agg (13-Oct): un handle ka per-handle jod jo pipeline ne
   chhoda hua hai (Media House / Journalist).
   update_dashboard.py me EXCLUDE_CAT = {'media house','journalist'} hai --
   unke tweet Mongo me hain par roster me nahi aate, isliye card par 0
   dikhta tha. Yahan se SIRF card ke liye ginti laate hain; roster,
   chart aur grand total ko haath nahi lagta. */
var _mjaCache = { t: 0, v: null };
async function mjAgg() {
  if (_mjaCache.v && Date.now() - _mjaCache.t < 600000) return _mjaCache.v;
  var out = {};
  try {
    var cl = MP.client(); await cl.connect();
    var rows = await cl.db('pulse_master').collection('master_tweets').aggregate([
      { $match: { Category: { $in: ['Media House', 'Journalist'] } } },
      { $group: {
          _id: '$Handle',
          tw: { $sum: 1 },
          vw: { $sum: { $convert: { input: '$Total Views', to: 'long', onError: 0, onNull: 0 } } }
      } }
    ], { allowDiskUse: true }).toArray();
    await cl.close();
    rows.forEach(function (r) {
      var h = String(r._id == null ? '' : r._id).trim().replace(/^@/, '').toLowerCase();
      if (!h) return;
      out[h] = { tw: (+r.tw) || 0, vw: (+r.vw) || 0 };
    });
    _mjaCache = { t: Date.now(), v: out };
    console.log('  mj-agg: ' + Object.keys(out).length + ' media/journalist handle ka jod aaya');
  } catch (e) {
    console.log('  (mj-agg skip: ' + e.message + ')');
    return _mjaCache.v || {};
  }
  return out;
}

// media/journalist ka count (pulse_master se) - KPI note ke liye. 10 min cache.
var _mjCache = { t: 0, n: 0 };
async function mediaCount() {
  if (Date.now() - _mjCache.t < 600000) return _mjCache.n;
  try {
    var cl = MP.client(); await cl.connect();
    var n = await cl.db('pulse_master').collection('master_tweets')
      .countDocuments({ Category: { $in: ['Media House', 'Journalist'] } });
    await cl.close();
    _mjCache = { t: Date.now(), n: n };
    return n;
  } catch (e) { return _mjCache.n || 0; }
}

/* ------------------------------------------------------------------
   map-gate : dashboard ab Mapping ko maanta hai.

   Pehle har table SIRF master_tweets (Mongo) se banta tha. Mapping.xlsx
   se koi handle hata do, to uske purane tweet Mongo me pade rehte the,
   isliye wo handle table me dikhta hi rehta tha. Ab page banate waqt
   har handle ko handle_master.json ke saamne rakha jaata hai, aur jo
   mapping me nahi hai wo har table/chart se nikal diya jaata hai.

   Safety: mapping padhi hi na gayi ho (file gayab / adhoori), to kuch
   nahi chhanta -- warna ek kharab file poora dashboard khaali kar deti.
   ------------------------------------------------------------------ */
/* hataye gaye handle ki list -- data/mapping_removed.json.
   mtime par dobara padhi jaati hai, server restart ki zaroorat nahi. */
var REMOVED_FILE = path.join(__dirname, 'data', 'mapping_removed.json');
var _rm = null, _rmAt = 0;
function removedSet() {
  try {
    var mt = fs.statSync(REMOVED_FILE).mtimeMs;
    if (_rm && mt === _rmAt) return _rm;
    var j = JSON.parse(fs.readFileSync(REMOVED_FILE, 'utf8'));
    var set = Object.create(null);
    (j.handles || []).forEach(function (h) {
      h = String(h || '').trim().replace(/^@/, '').toLowerCase();
      if (h) set[h] = 1;
    });
    _rm = set; _rmAt = mt;
    return set;
  } catch (e) { return _rm || Object.create(null); }
}

function mapGate(map) {
  var st;
  try { st = MAPL.stats(); } catch (e) { st = null; }
  var nMap = st ? (st.handles || st.count || 0) : 0;
  if (nMap < 100 || (st && st.error)) {
    console.warn('  (map-gate: mapping padhi nahi gayi -- filter nahi lagaya)');
    return { on: false, dropped: 0, names: [] };
  }
  /* MAPPING HI SACH HAI (10-Oct).
     Pehle yahan sirf wo handle hatte the jo mapping se JAAN-BOOJHKAR hataye
     gaye the (mapping_removed.json). Wajah ye thi ki 84 handle aise the
     jinke tweets to the par wo kabhi Mapping.xlsx me aaye hi nahi --
     Narendra Modi jaise -- aur unhe hatana galat hota.

     08-Oct ke baad wo wajah khatam ho gayi: Category se bhi level banne
     laga, aur Modi, Rahul, Amit Shah, Yogi -- sab mapping me aa gaye. Ab
     jo 112 handle bache hain wo sach me Mapping.xlsx me hain hi nahi, aur
     unme se 31 ka to naam tak khaali ('nan') dikhta tha.

     Isliye ab seedha niyam: mapping me nahi = dashboard par nahi.
     Data MongoDB me waise ka waisa pada rehta hai -- kuch mitta nahi.
     Mapping.xlsx me jodte hi handle apne aap wapas dikhne lagta hai. */
  var dropped = {}, kept = 0;
  function ok(h) {
    h = String(h == null ? '' : h).trim().replace(/^@/, '');
    if (!h) return false;
    if (MAPL.has(h)) { kept++; return true; }
    dropped[h] = (dropped[h] || 0) + 1;
    return false;
  }
  function arr(a, key) {
    if (!Array.isArray(a)) return a;
    return a.filter(function (x) { return x && ok(x[key] || x.h || x.handle); });
  }
  function obj(o) {
    if (!o || typeof o !== 'object') return o;
    var out = {};
    Object.keys(o).forEach(function (k) { if (ok(k)) out[k] = o[k]; });
    return out;
  }
  ['HANDLES', 'PARTY_HANDLES', 'MLA_DATA'].forEach(function (k) {
    if (map[k]) map[k] = arr(map[k], 'h');
  });
  if (map.CM_DATA) map.CM_DATA = arr(map.CM_DATA, 'handle');
  if (map.UNI && Array.isArray(map.UNI.allHandles)) {
    map.UNI.allHandles = arr(map.UNI.allHandles, 'h');
  }
  /* Dashboard tab ka data bhi wahi handles dikhaye (10-Oct).
     D.handles se na hatao to Top Leaders me handle gayab hota tha par
     chart aur KPI me uske tweet shaamil -- do alag-alag jod. D.partyDaily
     pehle se juda hua aata hai, isliye hataye hue handle ka hissa PHD
     (per-handle per-din) se ghata dete hain. Ye PHD chhantne se PEHLE
     hona zaroori hai. */
  if (map.D && Array.isArray(map.D.handles)) {
    var _inMap = function (r) {
      return !!(r && MAPL.has(String(r.h || '').trim().replace(/^@/, '')));
    };
    var _gone = map.D.handles.filter(function (r) { return !_inMap(r); });
    map.D.handles = map.D.handles.filter(_inMap);
    if (_gone.length && map.D.partyDaily && map.PHD) {
      var _pk = Object.keys(map.D.partyDaily);
      _gone.forEach(function (r) {
        var d = map.PHD[r.h]; if (!d) return;
        var b = (_pk.indexOf(r.p) >= 0) ? r.p
              : (_pk.indexOf('Others') >= 0 ? 'Others' : null);
        var pd = b && map.D.partyDaily[b]; if (!pd) return;
        ['t', 'v', 'k', 'r'].forEach(function (m) {
          if (!Array.isArray(pd[m]) || !Array.isArray(d[m])) return;
          for (var i = 0; i < pd[m].length && i < d[m].length; i++)
            pd[m][i] = Math.max(0, pd[m][i] - ((+d[m][i]) || 0));
        });
      });
    }
  }
  if (map.PHD) map.PHD = obj(map.PHD);
  if (map.HROLE) map.HROLE = obj(map.HROLE);
  if (map.GROWTH && map.GROWTH.H) map.GROWTH.H = obj(map.GROWTH.H);
  /* ---- jod dobara karo ----
     Upar kuch handle nikal diye. UNI.tot ek PEHLE SE GINA HUA jod hai --
     use chhua na jaaye to KPI ("Total Tweets") aur neeche wala note
     ("20,39,825 politicians") alag-alag number dikhate hain. Bilkul yahi
     ho raha tha: KPI 20,21,948 aur note 20,39,825.
     Isliye jo handle bache hain, unhi se jod dobara bana dete hain. */
  if (map.UNI && map.UNI.tot && Array.isArray(map.UNI.allHandles)) {
    var t = map.UNI.tot, F = ['tw', 'vw', 'lk', 'rt', 'cm', 'bm'];
    var fresh = {};
    F.forEach(function (f) { fresh[f] = 0; });
    map.UNI.allHandles.forEach(function (r) {
      F.forEach(function (f) { fresh[f] += (+r[f]) || 0; });
    });
    F.forEach(function (f) { if (t[f] !== undefined) t[f] = fresh[f]; });
  }

  /* ---- level MAPPING se theek karo ----
     Level blob me pehle se likha hota hai, jo pipeline ke waqt ki mapping
     se bana tha. Mapping beech me badal jaaye to card galat dikhte hain
     (MLA Contestants 0, Narendra Modi "Others" me). Isliye bhejte waqt
     mapping ka pad upar rakh dete hain aur 'Total Tweets by Level' ka jod
     dobara bana dete hain -- pipeline ka intezaar kiye bina sahi.
     Jo handle mapping me nahi hai, uska purana level waisa hi rehta hai. */
  try {
    var _P = { 'CM': 0, 'Dy CM': 1, 'LS MP': 2, 'RS MP': 3, 'MLA': 4,
               'MLC': 5, 'MLA Contestent': 6, 'Others': 7 };
    var _CN = { 'CM': 'Chief Minister', 'Dy CM': 'Dy CM' };
    var _mm = MAPL.load() || {}, _lv = Object.create(null), _me = Object.create(null);
    function _real(v) {
      v = String(v == null ? '' : v).trim();
      return (!v || v === '-' || v === '\u2014' || v.toLowerCase() === 'nan'
              || v.toLowerCase() === 'na' || v.toLowerCase() === 'n/a') ? '' : v;
    }
    var _ct = Object.create(null);     /* cat-cards (13-Oct) */
    Object.keys(_mm).forEach(function (k) {
      var rec = _mm[k] || {};
      var low = String(k).toLowerCase();
      /* ---- party / state / seat / naam bhi mapping se ----
         Level to pehle se mapping se aa raha tha, par party-state purane
         blob se hi aate the. Isi wajah se Parties tab ka "Top 5", Leader
         Board ka Party column aur Top Leaders ka State column purane ya
         khaali dikh rahe the. Ab ye bhi bhejte waqt mapping se theek ho
         jaate hain -- pipeline ka intezaar kiye bina.
         Mapping me jo value khaali/'-' ho, usse kuch nahi badalta. */
      var seat = _real(rec.pc_name) || _real(rec.ac_name) || _real(rec.ac_pc_name);
      var m = {};
      if (_real(rec.party)) m.party = _real(rec.party);
      if (_real(rec.state)) m.state = _real(rec.state);
      if (_real(rec.name))  m.name  = _real(rec.name);
      if (seat)             m.seat  = seat;
      if (m.party || m.state || m.name || m.seat) _me[low] = m;

      /* cat-cards (13-Oct): har handle ki SAARI Category yaad rakho.
         Ek aadmi do Category me ho sakta hai (Yogi: MLA + Top Leaders),
         isliye list. Alias entry (wahi handle, doosre case me) ko ginti
         me nahi lete -- warna ek hi aadmi do baar gin jaata. */
      if (!rec.alias_of) {
        var _cs = Array.isArray(rec.categories) ? rec.categories.slice()
                : (_real(rec.category) ? [_real(rec.category)] : []);
        _cs = _cs.map(function (c) { return _real(c); }).filter(Boolean);
        /* allmap (13-Oct): ek hi handle Excel me do spelling me pada ho
           sakta hai (PRupala aur Prupala). Pehle baad wali spelling pichhli
           ko mita deti thi, isliye Category ki ginti is baat par nirbhar ho
           jaati thi ki Excel me kaun si row baad me hai. Ab dono ki Category
           jod di jaati hai -- ginti har baar wahi aati hai. */
        if (_cs.length) {
          var _old = _ct[low] || [];
          _cs.forEach(function (c) { if (_old.indexOf(c) < 0) _old.push(c); });
          _ct[low] = _old;
        }
      }

      var ls = rec.levels;
      if (!Array.isArray(ls) || !ls.length) return;
      var top = ls[0];
      ls.forEach(function (L) {
        if ((_P[L] === undefined ? 99 : _P[L]) < (_P[top] === undefined ? 99 : _P[top])) top = L; });
      if (top === 'Others') return;                 /* 'Others' se kuch nahi badalta */
      _lv[low] = _CN[top] || top;
    });
    function _fix(a, key) {
      if (!Array.isArray(a)) return;
      a.forEach(function (r) {
        if (!r) return;
        var h = String(r[key] || r.h || r.handle || '').trim().replace(/^@/, '').toLowerCase();
        if (!h) return;
        if (r.level !== undefined && _lv[h]) r.level = _lv[h];
        var m = _me[h];
        if (!m) return;
        if (m.party && r.party !== undefined) r.party = m.party;
        if (m.state && r.state !== undefined) r.state = m.state;
        /* allmap (13-Oct): pehle naam aur seat SIRF tab badalte the jab blob
           me khaali hon. Matlab Excel me naam sudhaarne par bhi dashboard
           purana naam dikhata rehta tha. Ab mapping hi sach hai -- uski
           value hamesha jeetti hai. (Mapping me khaali ho to kuch nahi
           badalta, _real() wahi dekhti hai.) */
        if (m.name && r.name !== undefined) r.name = m.name;
        /* seat ka naam har blob me alag hai: allHandles me 'loc',
           HANDLES/MLA_DATA me 'pcName', CM_DATA me kuch bhi nahi tha */
        if (m.seat) {
          if (r.loc !== undefined) r.loc = m.seat;
          if (r.pcName !== undefined) r.pcName = m.seat;
          r.seat = m.seat;
        }
      });
    }
    /* cat-cards (13-Oct): handle par uski Category bhi -- card, filter aur
       chart sab isi se ban sakte hain, bina mapping dobara padhe. */
    function _fixCat(a, key) {
      if (!Array.isArray(a)) return;
      a.forEach(function (r) {
        if (!r) return;
        var h = String(r[key] || r.h || '').trim().replace(/^@/, '').toLowerCase();
        var c = h && _ct[h];
        if (c && c.length) { r.cats = c.slice(); r.cat = c[0]; }
      });
    }
    if (map.UNI) _fix(map.UNI.allHandles, 'h');
    _fix(map.HANDLES, 'h'); _fix(map.MLA_DATA, 'h'); _fix(map.PARTY_HANDLES, 'h');
    /* allmap (13-Oct): CM_DATA chhoot gayi thi -- isi wajah se States & CM
       table me state/party/naam purane blob se aa rahe the. */
    _fix(map.CM_DATA, 'handle');
    if (map.UNI) _fixCat(map.UNI.allHandles, 'h');

    /* ---- designation ka CHIP bhi mapping se (10-Oct) ----
       Top Leaders ki table me pad wala chip HROLE blob se aata tha, jo
       pipeline banati hai. Mapping me @BJP4India ki Category 'Page' hai,
       par blob kehta tha 'Leader' -- aur chip 'Leader' dikhta tha.
       Ab mapping ka pad upar:
          1. Designation (kai hon to "Chief Minister / MLA")
          2. Designation na ho to Category  (@BJP4India -> 'Page')
       Jo mapping me hai par blob me nahi, uska chip bhi yahin jud jaata hai. */
    function _nice(x) {
      x = String(x == null ? '' : x).trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
      /* 'LS MP' waise hi rahe, par 'MLA CONTESTENT' padhne layak bane:
         3 ya kam akshar wale token ALL-CAPS hi rehte hain, lambe title-case. */
      return x.replace(/\S+/g, function (w) {
        if (w.length <= 3 || w !== w.toUpperCase()) return w;
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
    }
    function _pick(rec, listKey, oneKey) {
      var a = rec[listKey];
      var out = [], seen = {};
      if (Array.isArray(a)) a.forEach(function (x) {
        var v = _nice(_real(x)); if (!v) return;
        var k = v.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(v);
      });
      if (out.length) return out.join(' / ');
      return _nice(_real(rec[oneKey]));
    }
    var _ro = Object.create(null);
    Object.keys(_mm).forEach(function (k) {
      var rec = _mm[k] || {};
      var txt = _pick(rec, 'designations', 'designation_raw')
             || _pick(rec, 'categories', 'category');
      if (txt) _ro[String(k).toLowerCase()] = { t: txt, k: k };
    });
    if (map.HROLE && typeof map.HROLE === 'object') {
      var _cur = function (t) { return /contest/i.test(t) ? 0 : 1; };
      Object.keys(map.HROLE).forEach(function (h) {
        var e = _ro[String(h).toLowerCase()];
        if (!e) return;
        var was = map.HROLE[h];
        map.HROLE[h] = [e.t, (Array.isArray(was) && was[1]) ? 1 : _cur(e.t)];
      });
      Object.keys(_ro).forEach(function (low) {
        var e = _ro[low];
        if (map.HROLE[e.k] === undefined) map.HROLE[e.k] = [e.t, _cur(e.t)];
      });
    }

    /* ---- CM & Dy CM ka tab poori tarah MAPPING se ----
       Ye list pipeline banati hai, isliye usme wahi aate the jinke tweet
       mile. Mapping me 31 CM hain par @cm_nrangaswamy ka ek bhi tweet nahi
       aaya -> tab 30 dikhata tha. Aur ulta bhi: jinka pad mapping me badal
       gaya (ab sirf MLA) wo yahan Dy CM bane baithe the.
       Ab: pad mapping se, jo mapping me CM/Dy CM nahi wo hat jaate hain,
       aur jo mapping me hain par data me nahi -- unki row 0 ke saath
       jod di jaati hai (card par "No tweets yet"). */
    if (Array.isArray(map.CM_DATA)) {
      var _CMW = { 'CM': 'Chief Minister', 'Dy CM': 'Deputy Chief Minister' };
      var _mci = {};
      Object.keys(_mm).forEach(function (k) { _mci[String(k).toLowerCase()] = k; });
      function _cmLvl(h) {
        var rec = _mm[_mci[String(h || '').trim().replace(/^@/, '').toLowerCase()]];
        var ls = rec && rec.levels;
        if (!Array.isArray(ls)) return '';
        if (ls.indexOf('CM') >= 0) return 'Chief Minister';
        if (ls.indexOf('Dy CM') >= 0) return 'Deputy Chief Minister';
        return '';
      }
      var _uni = {};
      if (map.UNI && Array.isArray(map.UNI.allHandles)) {
        map.UNI.allHandles.forEach(function (r) {
          if (r && r.h) _uni[String(r.h).toLowerCase()] = r; });
      }
      var _seen = {};
      map.CM_DATA = map.CM_DATA.filter(function (r) {
        var L = _cmLvl(r && r.handle);
        if (!L) return false;
        r.level = L;
        _seen[String(r.handle).toLowerCase()] = 1;
        return true;
      });
      Object.keys(_mm).forEach(function (k) {
        var rec = _mm[k] || {};
        if (rec.alias_of) return;
        var lk = String(k).toLowerCase();
        if (_seen[lk]) return;
        var ls = rec.levels || [];
        var L = (ls.indexOf('CM') >= 0) ? 'Chief Minister'
              : (ls.indexOf('Dy CM') >= 0) ? 'Deputy Chief Minister' : '';
        if (!L) return;
        _seen[lk] = 1;
        /* number asli data se, agar us handle ke tweet maujood hain */
        var u = _uni[lk] || null;
        map.CM_DATA.push({
          state: rec.state || (u && u.state) || '-',
          name: rec.name || (u && u.name) || k,
          party: rec.party || (u && u.party) || '-',
          /* allmap (13-Oct): seat ka naam bhi -- table ka "PC / AC Name"
             column isi se bharta hai (pehle ek chhoti local list se bharta
             tha jisme zyadatar naam the hi nahi). */
          seat: _real(rec.pc_name) || _real(rec.ac_name) || _real(rec.ac_pc_name) || '',
          level: L, handle: k,
          tweets: (u && +u.tw) || 0, views: (u && +u.vw) || 0,
          likes: (u && +u.lk) || 0, rts: (u && +u.rt) || 0,
          followers: (u && +u.followers) || 0, followings: (u && +u.followings) || 0,
          pos: (u && +u.pos) || 0, neg: (u && +u.neg) || 0, neu: (u && +u.neu) || 0,
          probjp: (u && +u.probjp) || 0, antigovt: (u && +u.antigovt) || 0,
          progovt: (u && +u.progovt) || 0, antibjp: (u && +u.antibjp) || 0,
          none: (u && +u.none) || 0,
          noData: !u,
        });
      });
    }
    if (map.UNI && Array.isArray(map.UNI.allHandles)) {
      var _sum = {};
      map.UNI.allHandles.forEach(function (r) {
        var k = r.level || 'Others';
        _sum[k] = (_sum[k] || 0) + ((+r.tw) || 0);
      });
      map.UNI.level = _sum;
    }

    /* ===== cat-cards (13-Oct): Dashboard ki strip ka saara hisaab =====
       map  : Mapping.xlsx me us Category ke kitne ALAG Twitter URL hain
              (jiska URL hai bas wahi -- handle_master me wahi aata hai)
       live : unme se kitne handle ka tweet-data humare paas hai
       tw/vw: unhi handle ke tweets / views
       Ginti mapping se hai, isliye kisi ka ek bhi tweet na ho tab bhi
       card sach bolta hai. */
    if (map.UNI && Array.isArray(map.UNI.allHandles)) {
      var _cs = Object.create(null);
      function _row(o, k) {
        if (!o[k]) o[k] = { tw: 0, vw: 0, map: 0, live: 0 };
        return o[k];
      }
      /* cat-canon (13-Oct): ek hi Category kabhi-kabhi do spelling me milti
         hai -- 'MLA' aur 'Mla'. (Purani Excel se bache hue chand handle,
         jo ab Mapping.xlsx me nahi par roster me pade hain.) Bina ismein
         dhyan diye strip par do card ban jaate the: "MLA 3,794" aur
         "Mla 2". Isliye pehle gin lete hain ki kaun si spelling zyada
         chalti hai, aur usi ko sab jagah laga dete hain. */
      var _cnt = Object.create(null);
      Object.keys(_ct).forEach(function (low) {
        _ct[low].forEach(function (c) {
          var lc = String(c).toLowerCase();
          (_cnt[lc] = _cnt[lc] || Object.create(null));
          _cnt[lc][c] = (_cnt[lc][c] || 0) + 1;
        });
      });
      var _canon = Object.create(null);
      Object.keys(_cnt).forEach(function (lc) {
        var best = null, n = -1;
        Object.keys(_cnt[lc]).forEach(function (sp) {
          if (_cnt[lc][sp] > n) { n = _cnt[lc][sp]; best = sp; }
        });
        _canon[lc] = best;
      });
      function _cc(c) { return _canon[String(c).toLowerCase()] || c; }
      /* har handle ki category bhi usi spelling par le aao -- chart/filter
         bhi wahi naam dekhe jo card par likha hai */
      Object.keys(_ct).forEach(function (low) {
        var seen = {}, out = [];
        _ct[low].forEach(function (c) {
          var v = _cc(c); if (!seen[v]) { seen[v] = 1; out.push(v); }
        });
        _ct[low] = out;
      });
      if (map.UNI && Array.isArray(map.UNI.allHandles)) {
        map.UNI.allHandles.forEach(function (r) {
          if (r && r.cats) { r.cats = r.cats.map(_cc); r.cat = r.cats[0]; }
        });
      }
      Object.keys(_ct).forEach(function (low) {
        _ct[low].forEach(function (c) { _row(_cs, c).map++; });
      });
      var _seenH = {};
      map.UNI.allHandles.forEach(function (r) {
        var cs = (r && r.cats) || [];
        _seenH[String(r.h || '').toLowerCase()] = 1;
        cs.forEach(function (c) {
          var o = _row(_cs, c);
          o.live++; o.tw += (+r.tw) || 0; o.vw += (+r.vw) || 0;
        });
      });
      /* mj-agg (13-Oct): jo mapping me hai par roster me nahi (pipeline ne
         chhoda hua -- Media House / Journalist), uska jod Mongo se seedha
         yahan jud jaata hai. SIRF card ke liye: allHandles, party/state
         chart aur grand total pehle jaise hi rehte hain. */
      var _mj = map.MJAGG || {};
      var _mjN = 0;
      Object.keys(_ct).forEach(function (low) {
        if (_seenH[low]) return;
        var a = _mj[low];
        if (!a || (!a.tw && !a.vw)) return;
        _mjN++;
        _ct[low].forEach(function (c) {
          var o = _row(_cs, c);
          o.live++; o.tw += (+a.tw) || 0; o.vw += (+a.vw) || 0;
        });
      });
      if (_mjN) console.log('  mj-agg: ' + _mjN + ' handle ki ginti card par jud gayi');
      map.UNI.catStats = _cs;

      /* CM / Dy CM Category nahi hain -- Admin Designation se aate hain.
         Unka hisaab alag, par dhaancha wahi. */
      var _as = Object.create(null);
      Object.keys(_mm).forEach(function (k) {
        var rec = _mm[k] || {};
        if (rec.alias_of) return;
        var ls = rec.levels || [];
        if (ls.indexOf('CM') >= 0) _row(_as, 'Chief Minister').map++;
        if (ls.indexOf('Dy CM') >= 0) _row(_as, 'Dy CM').map++;
      });
      map.UNI.allHandles.forEach(function (r) {
        var L = r && r.level;
        var k = (L === 'Chief Minister' || L === 'CM') ? 'Chief Minister'
              : (L === 'Dy CM' || L === 'Deputy Chief Minister') ? 'Dy CM' : '';
        if (!k) return;
        var o = _row(_as, k);
        o.live++; o.tw += (+r.tw) || 0; o.vw += (+r.vw) || 0;
      });
      map.UNI.admStats = _as;
      try {
        var _cdFile = path.join(__dirname, 'data', 'cat_daily.json');
        if (fs.existsSync(_cdFile)) {
          map.UNI.catDaily = JSON.parse(fs.readFileSync(_cdFile, 'utf8'));
        }
      } catch (e) {}
      console.log('  cat-cards: ' + Object.keys(_cs).length + ' category'
        + ' (' + Object.keys(_cs).sort(function (a, b) { return _cs[b].map - _cs[a].map; })
            .slice(0, 4).map(function (c) { return c + ':' + _cs[c].map; }).join(', ') + ')');
    }
    if (Array.isArray(map.CM_DATA)) {
      var _c1 = 0, _d1 = 0;
      map.CM_DATA.forEach(function (r) {
        if (r.level === 'Chief Minister') _c1++;
        else if (r.level === 'Deputy Chief Minister') _d1++; });
      console.log('  CM tab: ' + map.CM_DATA.length + ' leaders ('
        + _c1 + ' CM + ' + _d1 + ' Dy CM)');
    }
  } catch (e) { console.log('  (level fix skip: ' + e.message + ')'); }

  var names = Object.keys(dropped);
  return { on: true, dropped: names.length, names: names, kept: kept };
}

/* ha-map : Handle Analytics ki har value MAPPING se.
   'handles' collection pipeline banata hai, aur wo tabhi banta hai jab
   pipeline chale. Mapping beech me badal jaaye to wahan purana naam/party
   pada rehta hai (@c_raveendranath par naam "-" aur party CPI(M) aise hi
   dikh rahe the). Isliye jawaab bhejte waqt mapping ki value upar rakh
   dete hain -- pipeline ka intezaar kiye bina sahi dikhta hai.
   Jo handle mapping me nahi hai, uska apna data waisa ka waisa rehta hai. */
function haMap(r) {
  var h = String(r && (r.h || r._id) || '').trim();
  if (!h) return r;
  var m = null;
  try { m = MAPL.columnsFor(h); } catch (e) { m = null; }
  if (!m) {
    /* mapping me nahi -- bas naam ki jagah "-" na dikhe */
    if (!r.name || String(r.name).trim() === '-') r.name = h;
    r.inMapping = false;
    return r;
  }
  var pick = function (v, old) {
    v = String(v == null ? '' : v).trim();
    return (v && v !== '-') ? v : old;
  };
  r.name  = pick(m['Candidate Name'], (r.name && r.name !== '-') ? r.name : h);
  r.party = pick(m['Party'], r.party || '');
  r.state = pick(m['State'], r.state || '');
  r.cat   = pick(m['Category'], r.cat || '');
  r.desig = pick(m['Designation'], pick(m['Party Designation'], r.desig || ''));
  r.pcName = pick(m['AC Name'], pick(m['PC Name'], r.pcName || ''));
  r.acpc  = pick(m['AC/PC No'], r.acpc || '');
  r.inMapping = true;
  /* Mapping.xlsx me likhi hui ASLI spelling kaun si hai -- @AmitShah,
     @amitshah nahi. 'amitshah' wali entry alias hai (rebuild_mapping
     Mongo me pade doosre case ke liye banata hai). */
  try {
    var mp = MAPL.load() || {};
    var ex = mp[h] || null;
    r.isAlias = !!(ex && ex.alias_of);
    r.canon = (ex && ex.alias_of) ? ex.alias_of : h;
  } catch (e) { r.isAlias = false; r.canon = h; }
  return r;
}

/* ==================================================================
 *  MAPPING SYNC  --  Mapping.xlsx hi sach hai
 *  ------------------------------------------------------------------
 *  Server chalu hote hi ek baar, aur uske baad har ghante auto_update
 *  ke saath, mapping_sync.py chalti hai:
 *      Mapping.xlsx -> handle_master.json -> master_tweets (Mongo)
 *  Yahan us sync ka HAAL rakha jaata hai taaki panel par dikh sake.
 * ================================================================== */
const MSYNC_FILE = path.join(__dirname, 'data', 'mapping_sync.json');

function msyncStatus() {
  try {
    var j = JSON.parse(fs.readFileSync(MSYNC_FILE, 'utf8'));
    return {
      ok: j.ok !== false, at: j.at || '', rows: j.rows || 0,
      added: j.added || 0, modified: j.modified || 0, removed: j.removed || 0,
      changed: !!j.changed, mongo: !!j.mongo, why: j.why || '',
      warnings: (j.warnings || []).slice(0, 20),
      addedList: (j.addedList || []).slice(0, 50),
      removedList: (j.removedList || []).slice(0, 50),
      modifiedList: (j.modifiedList || []).slice(0, 50)
    };
  } catch (e) {
    return { ok: null, at: '', rows: 0, added: 0, modified: 0, removed: 0,
             why: 'abhi tak ek baar bhi sync nahi hui', warnings: [],
             addedList: [], removedList: [], modifiedList: [] };
  }
}

/* Kaun sa python? RUN_MAPPING_UPDATE.bat ek KHAAS python chalati hai
   (Python313), kyunki usi me pandas/pymongo lage hain. Sirf 'python'
   likh dete to kisi aur python par chala jaata aur sync chup-chaap fail
   hoti. Isliye wahi kram yahan bhi: pehle jo .bat me likha hai, phir
   aam naam -- aur jo pandas sach me import kar le, wahi chuna jaata hai. */
var PY_CANDIDATES = (function () {
  var out = [process.env.PYTHON];
  /* Pehle yahan sirf 'C:\Users\hp\...' likha tha -- doosre system par
     (jaise C:\Users\Lenovo) wo milta hi nahi tha. Ab jo bhi user logged-in
     hai uske folder me Python313/312/311 dhoondhte hain. */
  var home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    ['Python313', 'Python312', 'Python311'].forEach(function (v) {
      out.push(home + '\\AppData\\Local\\Programs\\Python\\' + v + '\\python.exe');
    });
  }
  out.push('C:\\Users\\hp\\AppData\\Local\\Programs\\Python\\Python313\\python.exe');
  out.push(process.platform === 'win32' ? 'python' : 'python3', 'py', 'python3', 'python');
  return out.filter(Boolean);
})();
var _pyFound = null;
function findPython() {
  if (_pyFound) return _pyFound;
  var cp = require('child_process');
  for (var i = 0; i < PY_CANDIDATES.length; i++) {
    try {
      var r = cp.spawnSync(PY_CANDIDATES[i], ['-c', 'import pandas'],
                           { timeout: 20000, windowsHide: true });
      if (r.status === 0) {
        _pyFound = PY_CANDIDATES[i];
        console.log('[Mapping Sync] python mila: ' + _pyFound);
        return _pyFound;
      }
    } catch (e) {}
  }
  console.log('[Mapping Sync] pandas wala python nahi mila -- '
    + PY_CANDIDATES.join(', ') + ' me se koi nahi chala');
  return null;
}

var _msyncRunning = false;
function runMappingSync(why) {
  if (_msyncRunning) { console.log('[Mapping Sync] pehle se chal rahi hai -- chhoda'); return; }
  var py = findPython();
  if (!py) {
    console.log('[Mapping Sync] ruk gaya -- dashboard purani mapping par chalta rahega');
    return;
  }
  _msyncRunning = true;
  console.log('[Mapping Sync] ' + why);
  var cp = require('child_process').spawn(py, [path.join(__dirname, 'mapping_sync.py')],
    { cwd: __dirname });
  var out = '';
  cp.stdout.on('data', function (d) { out += d; });
  cp.stderr.on('data', function (d) { out += d; });
  cp.on('close', function (code) {
    _msyncRunning = false;
    String(out).trim().split('\n').slice(-25).forEach(function (l) {
      if (l.trim()) console.log('  ' + l);
    });
    if (code !== 0) {
      console.log('[Mapping Sync] FAIL -- dashboard PURANI mapping par chal raha hai');
    }
    try { MAPL._reset && MAPL._reset(); } catch (e) {}   // nayi mapping turant padho
    /* map-cache (10-Oct): sirf MAPL ka cache saaf karna kaafi nahi tha --
       bana-banaya page bhi phenkna padta hai, warna naya designation
       agle rebuild tak dikhta hi nahi. */
    try { dashCacheClear('mapping badli -- page dobara banega'); } catch (e) {}
  });
  cp.on('error', function (e) {
    _msyncRunning = false;
    console.log('[Mapping Sync] chalayi nahi ja saki: ' + e.message);
  });
}
/* ---- kab-kab chalti hai ----
   1. server chalu hone ke 8 second baad (port pehle khul jaaye)
   2. uske baad HAR GHANTE -- chaahe pipeline chale ya na chale
   3. jab bhi Mapping.xlsx ki tareekh badle (2 minute me pakad leta hai)
   4. panel ke "Sync mapping now" button se
   Pipeline (auto_update) bhi apni taraf se chalati hai -- do sync ek saath
   na chalein, iska dhyaan _msyncRunning rakhta hai. */
if (!NO_JOBS) {
setTimeout(function () { runMappingSync('server chalu -- Mapping jaanchi ja rahi hai'); }, 8000);
setInterval(function () { runMappingSync('har ghante ki jaanch'); }, 60 * 60 * 1000);
}

/* Mapping.xlsx haath se badli ja sakti hai -- uski tareekh par nazar.
   Badalte hi sync chala dete hain, ghante bhar ka intezaar nahi. */
var XLSX_FILE = path.join(__dirname, '..', 'Mapping', 'Mapping.xlsx');
var _xlsxAt = 0;
try { _xlsxAt = fs.statSync(XLSX_FILE).mtimeMs; } catch (e) {}
if (!NO_JOBS) setInterval(function () {
  try {
    var mt = fs.statSync(XLSX_FILE).mtimeMs;
    if (_xlsxAt && mt !== _xlsxAt) {
      _xlsxAt = mt;
      runMappingSync('Mapping.xlsx badli hai -- turant sync');
    } else if (!_xlsxAt) { _xlsxAt = mt; }
  } catch (e) {}
}, 2 * 60 * 1000);

/* hdr-prof : naam/email page me seedha chipkate hain, isliye escape zaroori.
   Ye naam user ne khud request form me bhara hota hai. */
function hpEsc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ===== dash-cache (10-Oct) =================================================
   Pehle HAR page load par poora kaam dobara hota tha: Mongo se ~8 MB data
   uthana, template padhna, 17 blob chipkaana, 7-9 MB ki string banana, phir
   gzip. Lagbhag 1.5-2 second CPU -- aur Node ek hi thread par, isliye log
   kataar me lag jaate the. 30 log ek saath aa jaayein to memory bhar kar
   server hi gir jaata tha (heap ~1.5 GB, har request ~130 MB ka kooda).

   Ab teen cheezein:
     1. BHAARI hissa -- jo har user ke liye BILKUL ek jaisa hai -- ek baar
        banta hai aur cache me rehta hai. Naya tabhi banta hai jab pipeline
        naya data laaye (meta.lastUpdate badle) ya template file badle.
        Isliye template edit karke Ctrl+F5 ab bhi kaam karta hai.
     2. Ek waqt me EK hi build. 200 request ek saath aa jaayein to build ek
        hi chalega, baaki usi ka intezaar karenge (pehle 200 build chalte the
        -- yahi crash ki jad thi).
     3. Taiyaar GZIP buffer bhi cache hota hai (har user-variant ka apna,
        kyunki header me uska naam/menu hota hai). Dobara kholne ya refresh
        par kaam lagbhag shoonya -- bas buffer bhej dena.

   Cache khud saaf hota hai: data ya template badla = key badli = naya page.
   =========================================================================== */
var DASH_GZ_MAX = 250 * 1024 * 1024;     // gzip cache ki hadd (bytes)
var _dashBase = {};        // scope -> {key, html, noteTxt, ms}
var _dashBaseWait = {};    // scope -> Promise  (single-flight)
var _dashVer = {};         // scope -> {key, at}
var _gzCache = new Map();  // variant -> {buf, at}
var _gzBytes = 0;
var _dashStat = { builds: 0, baseHits: 0, gzHits: 0, gzMiss: 0 };

/* Page ka "version": data kab badla + template kab badla.
   5 second ka chhota cache taaki burst me Mongo se baar-baar na poochhein. */
async function dashVersionKey(scope) {
  scope = (scope === 'up') ? 'up' : 'all';
  var c = _dashVer[scope];
  if (c && (Date.now() - c.at) < 5000) return c.key;
  var v = '';
  try {
    var cli = MP.client(); await cli.connect();
    var d = await cli.db(SCOPE_DB[scope]).collection('meta').findOne({ key: 'lastUpdate' });
    v = d ? String(d.value) : '';
  } catch (e) { v = 'nover'; }
  var mt = 0;
  try { mt = fs.statSync(scope === 'up' ? TEMPLATE_UP : TEMPLATE_ALL).mtimeMs; } catch (e) {}
  /* map-cache (10-Oct): handle_master.json ki tareekh bhi key me.
     Designation/party/level mapping se serve ke waqt chipakte hain, par
     cache ko iski khabar nahi thi -- isliye Mapping.xlsx badalne ke baad
     bhi purana page milta rehta tha (jab tak pipeline ya template na
     badle). Ab mapping badli = nayi key = naya page. */
  var mp = 0;
  try { mp = fs.statSync(MAPL.MAP_FILE).mtimeMs; } catch (e) {}
  var key = scope + '|' + v + '|' + mt + '|' + mp;
  _dashVer[scope] = { key: key, at: Date.now() };
  return key;
}

async function dashBase(scope) {
  scope = (scope === 'up') ? 'up' : 'all';
  var key = await dashVersionKey(scope);
  var c = _dashBase[scope];
  if (c && c.key === key) { _dashStat.baseHits++; return c; }
  if (_dashBaseWait[scope]) return _dashBaseWait[scope];       // koi aur pehle se bana raha hai
  _dashBaseWait[scope] = (async function () {
    var t0 = Date.now();
    var r = await buildDashBase(scope);
    r.key = key; r.ms = Date.now() - t0;
    _dashBase[scope] = r;
    _dashStat.builds++;
    console.log('  [dash-cache] ' + scope + ' ka naya page bana -- ' + r.ms + ' ms, '
      + (r.html.length / 1048576).toFixed(2) + ' MB');
    return r;
  })();
  try { return await _dashBaseWait[scope]; }
  finally { delete _dashBaseWait[scope]; }
}

function dashCacheClear(why) {
  _dashBase = {}; _dashVer = {};
  _gzCache.clear(); _gzBytes = 0;
  console.log('  [dash-cache] saaf kar diya' + (why ? ' (' + why + ')' : ''));
}

function _gzPut(k, buf) {
  var old = _gzCache.get(k);
  if (old) _gzBytes -= old.buf.length;
  _gzCache.set(k, { buf: buf, at: Date.now() });
  _gzBytes += buf.length;
  /* Map insertion order = sabse purana pehle. Hadd paar ho to purane hatao. */
  while (_gzBytes > DASH_GZ_MAX && _gzCache.size > 1) {
    var k0 = _gzCache.keys().next().value;
    var e0 = _gzCache.get(k0);
    _gzCache.delete(k0);
    if (e0) _gzBytes -= e0.buf.length;
  }
}
function dashCacheStats() {
  return { builds: _dashStat.builds, baseHits: _dashStat.baseHits,
           gzHits: _dashStat.gzHits, gzMiss: _dashStat.gzMiss,
           gzEntries: _gzCache.size,
           gzMB: +(_gzBytes / 1048576).toFixed(1),
           baseScopes: Object.keys(_dashBase),
           lastBuildMs: (_dashBase.all && _dashBase.all.ms) || null };
}

/* BHAARI hissa -- sab users ke liye ek jaisa. Iska natija cache hota hai. */
var DASH_HOT = { used: 0, local: 0, lastReason: '' };
async function dashFromHot(scope, client) {
  if (!MP.hotHealthy()) { DASH_HOT.local++; DASH_HOT.lastReason = MP.HOT.enabled ? 'hot unhealthy' : 'hot off'; return null; }
  const dbn = SCOPE_DB[scope];
  try {
    const loc = await client.db(dbn).collection('meta').findOne({ key: 'lastUpdate' });
    const h = MP.hotClient(); await h.connect();
    const hdb = h.db();
    const cur = await hdb.collection(dbn + '__meta').findOne({ _id: 'current' });
    if (!cur || !cur.lastUpdate || !loc || String(loc.value) !== String(cur.lastUpdate)) {
      DASH_HOT.local++; DASH_HOT.lastReason = 'Atlas copy is not the latest build'; return null;
    }
    const docs = await hdb.collection(dbn + '__' + COLLECTION + '__' + cur.slot).find({}).toArray();
    const phdDocs = await hdb.collection(dbn + '__phd__' + cur.slot).find({}).toArray();
    if (!docs.length || !phdDocs.length) { DASH_HOT.local++; DASH_HOT.lastReason = 'Atlas copy empty'; return null; }
    DASH_HOT.used++; DASH_HOT.lastReason = '';
    return { docs: docs, phdDocs: phdDocs, name: dbn + ' slot ' + cur.slot };
  } catch (e) {
    DASH_HOT.local++; DASH_HOT.lastReason = String(e.message || e).slice(0, 120);
    console.log('  [hot dashboard] ' + DASH_HOT.lastReason + ' -> local');
    return null;
  }
}

async function buildDashBase(scope) {
  scope = (scope === 'up') ? 'up' : 'all';
  const client = MP.client();
  await client.connect();

  /* hot/cold plan, Phase 5: Atlas copy tabhi jab uska lastUpdate local se
     bilkul mile (yaani isi build ka data hai). Warna / error par local. */
  let docs = null, phdDocs = null;
  const _hot = await dashFromHot(scope, client);
  if (_hot) {
    docs = _hot.docs; phdDocs = _hot.phdDocs;
    console.log("  Data mila Atlas (HOT) se: " + _hot.name + "  (scope=" + scope + ")");
  } else {
    const db = await findDataDb(client, SCOPE_DB[scope]);
    if (!db) { await client.close(); throw new Error("Kisi bhi database me '" + COLLECTION + "' collection nahi mili."); }
    console.log("  Data mila database me: '" + db.databaseName + "'  (scope=" + scope + ")");
    docs = await db.collection(COLLECTION).find({}).toArray();
    phdDocs = await db.collection('phd').find({}).toArray();
  }
  await client.close();

  if (!docs.length) throw new Error("'" + COLLECTION + "' collection khaali hai.");
  if (!phdDocs.length) throw new Error("'phd' collection khaali hai.");

  const map = {};
  for (const d of docs) map[d.key] = d.value;

  const PHD = {};
  for (const p of phdDocs) PHD[p.h] = { t: p.t, v: p.v, k: p.k, r: p.r };
  map['PHD'] = PHD;
  /* mj-agg (13-Oct): mapGate ise padhta hai (neeche catStats me) */
  try { map['MJAGG'] = await mjAgg(); } catch (e) { map['MJAGG'] = {}; }

  /* map-gate : Mapping.xlsx se hataye gaye handle yahan nikal jaate hain */
  var _gate = mapGate(map);
  if (_gate.on && _gate.dropped) {
    console.log('  map-gate: ' + _gate.dropped + ' handle mapping me nahi hain -- '
      + 'dashboard se hata diye (' + _gate.names.slice(0, 8).join(', ')
      + (_gate.dropped > 8 ? ', ...' : '') + ')');
  }

  // scope ke hisaab se sahi template (All-India = yahi, UP = UP-DASHBOARD ka)
  const tplFile = (scope === 'up') ? TEMPLATE_UP : TEMPLATE_ALL;
  let html = fs.readFileSync(tplFile, 'utf8');
  for (const key in map) {
    const token = '"__MONGO_' + key + '__"';
    html = html.replace(token, function () { return JSON.stringify(map[key]); });
  }

  const leftover = (html.match(/"__MONGO_[A-Z_]+__"/g) || []);
  if (leftover.length) console.warn('Warning: inko data nahi mila ->', leftover.join(', '));

  html = fillKPIs(html, map);

  // UP template me report tweets bake nahi karte (live) -> /api/report use hoga
  html = html.replace('"__RP_TWEETS__"', '[]').replace('"__RP_RANGE__"', '""');

  /* Word Cloud pipeline se aata hai. Pipeline abhi tak naye version se
     nahi chala to key hoti hi nahi -- tab khaali object bhar dete hain,
     warna page par "__MONGO_WORDCLOUD__" string reh jaati hai. */
  html = html.replace('"__MONGO_WORDCLOUD__"', '{"words":[],"tags":[]}');

  /* SENT_DAILY (8-category sentiment ka per-din data) bhi pipeline se aata hai.
     Purane build me ye key hoti hi nahi -- tab khaali daal dete hain, warna
     page par "__MONGO_SENT_DAILY__" string reh jaati hai. Chart khud hi
     "abhi data nahi hai" wala message dikha deta hai. */
  html = html.replace('"__MONGO_SENT_DAILY__"', '{"cats":[],"dates":[],"S":{}}');

  // ---- KPI note: politicians + media/journalist = grand total ----
  var _mj = await mediaCount();
  var _pol = (((map.UNI || {}).tot || {}).tw) || 0;
  var _IN2 = function (x) { return (Math.round((+x) || 0)).toLocaleString('en-IN'); };
  // note SIRF All-India par (UP me media/journalist ka jod matlab nahi rakhta)
  var noteTxt = (scope === 'all' && _mj)
    ? (_IN2(_pol) + ' politicians &nbsp;+&nbsp; ' + _IN2(_mj) + ' media house / journalist &nbsp;=&nbsp; <b>'
       + _IN2(_pol + _mj) + '</b> total in database')
    : '';

  return { html: html, noteTxt: noteTxt };
}

/* HALKA hissa -- sirf is user ka: header me naam/avatar/menu, kaun se doosre
   dashboard dikhane hain, Admin Panel ka link. Bhaari base upar cache se
   aata hai, isliye yahan sirf thodi si string jodni padti hai. */
async function buildHtml(scope, role, who) {
  scope = (scope === 'up') ? 'up' : 'all';
  role = role || 'admin';
  var _base = await dashBase(scope);
  let html = _base.html;
  var noteTxt = _base.noteTxt;

  // ---- profile SIDEBAR ke top me (title ki jagah) - pin/unpin ke saath dikhe/chhupe ----
  var A = (scope === 'all'), U2 = (scope === 'up');
  var PROF = { admin: { n: 'Admin', e: 'admin@jarvis.consulting', i: 'A' },
               up:    { n: 'Uttar Pradesh', e: 'uttarpradesh@jarvis.consulting', i: 'U' },
               punjab:{ n: 'Punjab', e: 'punjab@jarvis.consulting', i: 'P' },
               all:   { n: 'India Pulse', e: 'indiapulse@jarvis.consulting', i: 'I' },
               backend: { n: 'Backend Admin', e: 'admin_1@jarvis.consulting', i: 'B' } };
  var me = PROF[role] || PROF.admin;
  /* ---- hdr-prof : jo ADMI login hua hai, wahi dikhao ----
     Pehle sirf ROLE dikhta tha ("India Pulse"), chaahe login kisi ne bhi
     kiya ho. Ab email se asli aadmi nikalte hain:
       1. portal_users me naam ho to wahi  (panel se approve hue users)
       2. warna base account ka label      (admin / India Pulse / UP ...)
       3. warna email ka pehla hissa       (rohit@... -> Rohit)
     Gol avatar me naam ka PEHLA AKSHAR aata hai -- rohit -> R. */
  var _mail = String(who || '').trim();
  var _ulow = _mail.toLowerCase();
  var _base = null;
  for (var _k in PROF) { if (PROF[_k].e === _ulow) { _base = PROF[_k]; break; } }
  var _dbu = (_dbUsers && _dbUsers[_ulow]) || null;
  function _titleCase(x) {
    return String(x || '').replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\S+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
  }
  var _disp = (_dbu && String(_dbu.name || '').trim())
           || (_base && _base.n)
           || _titleCase(_mail.split('@')[0])
           || me.n;
  var _ini = (_disp.replace(/[^A-Za-z0-9]/g, '').charAt(0) || me.i).toUpperCase();
  var _mailShown = _mail || me.e;

  var btnCss = 'display:block;text-align:center;padding:9px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700;margin-bottom:7px';
  var other = '';
  if (role === 'admin') {   // sirf DOOSRE dashboard (jo khula nahi)
    var DASHES = [ { href: '/', label: 'All India', sc: 'all' },
                   { href: '/up', label: 'Uttar Pradesh', sc: 'up' },
                   { href: '/punjab/', label: 'Punjab', sc: 'punjab' } ];
    other = DASHES.filter(function (d) { return d.sc !== scope; })
      .map(function (d) {
        return '<a href="' + d.href + '" style="' + btnCss + ';background:#EA580C;color:#fff">' + d.label + '</a>';
      }).join('');
  }
  // default: sirf avatar+naam+email. click -> menu khule + nav hide
  var prof = '<div id="_pfWrap" style="width:100%;cursor:pointer">'
    + '<div style="display:flex;align-items:center;gap:9px">'
    + '<div style="width:40px;height:40px;border-radius:50%;background:#fff;color:#C0430D;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex:0 0 auto">' + me.i + '</div>'
    + '<div class="sb-text" style="min-width:0;flex:1">'
    + '<div style="color:#fff;font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + me.n + '</div>'
    + '<div style="color:#ffe7c9;font-weight:400;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + me.e + '</div></div></div></div>'
    + '<div id="_pfMenu" class="sb-text" style="display:none;margin-top:12px">'
    + other
    + '<a href="/logout" style="' + btnCss + ';background:#B91C1C;color:#fff;margin-bottom:0">Logout</a>'
    + '</div>';
  /* ---- header ka profile (sabse upar, daayein kone me) ----
     Gol avatar + naam. Click karne par menu khulta hai:
       Request  -> "Handles To Be Added" tab
       (admin ko doosre dashboard ke link bhi)
       Logout
     Pehle ye sidebar me tha -- ab wahan dobara title aa jaata hai. */
  var mi = 'display:flex;align-items:center;gap:9px;width:100%;padding:9px 12px;border:0;background:none;'
         + 'text-align:left;text-decoration:none;font:600 12.5px system-ui,-apple-system,sans-serif;'
         + 'color:#1A1A1A;cursor:pointer;border-radius:8px';
  function hpIcon(d) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">'
         + d + '</svg>';
  }
  /* Admin Panel ka raasta -- sirf unhe jinke paas hak hai */
  var hpAdmin = '';
  if (role === 'backend' || (_dbu && _dbu.adminPanel)) {
    hpAdmin = '<a href="/admin" class="hp-item" style="' + mi + '">'
      + hpIcon('<path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z"/>'
             + '<path d="M9 12l2 2 4-4"/>')
      + '<span>Admin Panel</span></a>';
  }

  var hpOther = '';
  if (role === 'admin') {
    hpOther = [ { href: '/', label: 'All India', sc: 'all' },
                { href: '/up', label: 'Uttar Pradesh', sc: 'up' },
                { href: '/punjab/', label: 'Punjab', sc: 'punjab' } ]
      .filter(function (d) { return d.sc !== scope; })
      .map(function (d) {
        return '<a href="' + d.href + '" class="hp-item" style="' + mi + '">'
          + hpIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>'
                 + '<rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>')
          + '<span>' + d.label + '</span></a>';
      }).join('');
  }
  var hdrProf = '<div class="hp-wrap" id="hpWrap">'
    + '<button type="button" class="hp-btn" id="hpBtn" aria-haspopup="true" aria-expanded="false" '
    +   'title="' + hpEsc(_mailShown) + '">'
    +   '<span class="hp-av">' + hpEsc(_ini) + '</span>'
    +   '<span class="hp-nm">' + hpEsc(_disp) + '</span>'
    +   '<svg class="hp-car" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    +     'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
    + '</button>'
    + '<div class="hp-menu" id="hpMenu" role="menu">'
    +   '<div class="hp-head"><span class="hp-av big">' + hpEsc(_ini) + '</span>'
    +     '<div style="min-width:0"><div class="hp-h-nm">' + hpEsc(_disp) + '</div>'
    +     '<div class="hp-h-em">' + hpEsc(_mailShown) + '</div></div></div>'
    +   '<button type="button" class="hp-item" id="hpReq" style="' + mi + '">'
    +     hpIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'
    +            '<line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>')
    +     '<span>Request</span></button>'
    +   hpAdmin
    +   hpOther
    +   '<div class="hp-sep"></div>'
    +   '<a href="/logout" class="hp-item hp-out" style="' + mi + '">'
    +     hpIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'
    +            '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>')
    +     '<span>Logout</span></a>'
    + '</div></div>';

  /* ---- multi-desig : ek aadmi ke kai pad ----
     Yogi CM bhi hain aur MLA bhi. Dashboard ab tak sirf EK pad dikhata tha
     (HROLE me ek hi aata hai). Mapping me dono pade hain, to wahi se utha
     kar bhej dete hain -- pipeline dobara chalane ki zaroorat nahi.
     Sirf un handles ke liye jinke 2+ pad hain (lagbhag 100, ~4 KB). */
  var HDESIG = {};
  try {
    var _mm = MAPL.load();
    Object.keys(_mm).forEach(function (k) {
      var d = (_mm[k] && _mm[k].designations) || [];
      if (!Array.isArray(d) || d.length < 2) return;
      var seen = {}, out = [];
      d.forEach(function (x) {
        x = String(x || '').trim();
        if (!x || x === '-') return;
        /* LS_MP -> LS MP, aur ALL-CAPS ko padhne layak banao */
        x = x.replace(/_/g, ' ').replace(/\s+/g, ' ');
        if (x === x.toUpperCase() && x.length > 3) {
          x = x.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        }
        var low = x.toLowerCase();
        if (seen[low]) return;
        seen[low] = 1; out.push(x);
      });
      if (out.length > 1) HDESIG[String(k).toLowerCase()] = out;
    });
  } catch (e) { console.log('  (multi-desig skip: ' + e.message + ')'); }

  /* ---- mapping sync ruki ho to page par saaf dikhao ----
     Ab tak ye baat sirf server ki black window me likhi aati thi. Kisi ne
     na dekhi to handle ki ginti chupchaap PURANI mapping ki dikhti rehti
     thi aur lagta tha "update hua hi nahi". Ab upar ek patti aa jaati hai
     jisme wajah aur ilaaj dono likhe hote hain. */
  var _ms = null;
  try { _ms = msyncStatus(); } catch (e) { _ms = null; }
  var msBar = '';
  if (_ms && _ms.ok === false) {
    var _why = String(_ms.why || '').slice(0, 300);
    var _fix = /openpyxl/i.test(_why)
      ? 'Fix: double-click DASHBOARD\\FIX_EXCEL_READER.bat, then run RUN_MAPPING_UPDATE.bat'
      : 'Fix: run DASHBOARD\\RUN_MAPPING_UPDATE.bat and read its window';
    msBar = '<div id="msBar" style="margin:0 0 12px;padding:10px 14px;border-radius:10px;'
      + 'background:#FFF4E5;border:1.5px solid #F0B37E;color:#7A3E00;'
      + 'font:600 12.5px system-ui,-apple-system,sans-serif;line-height:1.55">'
      + '<b>\u26A0 Mapping sync is stuck</b> \u2014 the handle counts below come from the '
      + '<b>old mapping</b>; the new Mapping.xlsx has not been applied yet.<br>'
      + '<span style="color:#8A5A2B">Reason: ' + hpEsc(_why) + '</span><br>'
      + '<span>' + hpEsc(_fix) + '</span>'
      + (_ms.at ? '<span style="color:#A07A55"> \u00b7 last attempt: '
                  + hpEsc(_ms.at) + '</span>' : '')
      + '</div>';
  }

  /* ---- level card ka handle count MAPPING se (poora count) ----
     Card ab tak sirf un handles ko ginta tha jinke tweet mile. Mapping me
     31 CM hain par @cm_nrangaswamy ka ek bhi tweet nahi aaya, isliye card
     30 dikhata tha. Ab ginti MAPPING se hoti hai (jo asli source of truth
     hai). Alias (ek hi handle ke chhote-bade akshar) do baar nahi ginte,
     aur jaan-boojhkar hataye handle ginti me nahi aate.
     Tweet ka number waisa hi rehta hai -- wo asli data se aata hai. */
  var MAPLVL = {};
  try {
    var _PRI = { 'CM': 0, 'Dy CM': 1, 'LS MP': 2, 'RS MP': 3, 'MLA': 4,
                 'MLC': 5, 'MLA Contestent': 6, 'Others': 7 };
    var _CARD = { 'CM': 'Chief Minister', 'Dy CM': 'Dy CM' };   // card ke naam
    var _gone = removedSet();
    var _m2 = MAPL.load() || {};
    Object.keys(_m2).forEach(function (k) {
      var rec = _m2[k] || {};
      if (rec.alias_of) return;                                  /* duplicate */
      if (_gone[String(k).toLowerCase()]) return;                /* hataya hua */
      var ls = rec.levels;
      if (!Array.isArray(ls) || !ls.length) ls = ['Others'];
      var top = ls[0];
      ls.forEach(function (L) {
        if ((_PRI[L] === undefined ? 99 : _PRI[L]) < (_PRI[top] === undefined ? 99 : _PRI[top])) top = L;
      });
      top = _CARD[top] || top;
      MAPLVL[top] = (MAPLVL[top] || 0) + 1;
    });
  } catch (e) { console.log('  (level count skip: ' + e.message + ')'); }

  var hdrProfCss = '<style id="hp-css">'
    + '.hp-wrap{position:relative;display:inline-flex;align-items:center;margin-left:4px}'
    + '.hp-btn{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E5E0D8;'
    +   'border-radius:999px;padding:4px 10px 4px 4px;cursor:pointer;font:700 12px system-ui,-apple-system,sans-serif;'
    +   'color:#1A1A1A;box-shadow:0 1px 2px rgba(0,0,0,.05)}'
    + '.hp-btn:hover{border-color:#EA580C;background:#FFF7F1}'
    + '.hp-av{width:28px;height:28px;border-radius:50%;background:#EA580C;color:#fff;display:flex;'
    +   'align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:0 0 auto;line-height:1}'
    + '.hp-av.big{width:38px;height:38px;font-size:17px}'
    + '.hp-nm{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.hp-car{opacity:.5;transition:transform .15s}'
    + '.hp-wrap.open .hp-car{transform:rotate(180deg)}'
    /* menu header ke ANDAR nahi rakhte: header par overflow:hidden hai,
       usse dropdown kat jaata tha. Isliye ye body me jaata hai aur
       position:fixed se button ke theek neeche bitha diya jaata hai. */
    + '.hp-menu{display:none;position:fixed;top:0;left:0;min-width:234px;background:#fff;'
    +   'border:1px solid #E5E0D8;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:6px;z-index:2147483000}'
    + '.hp-menu.open{display:block}'
    + '.hp-head{display:flex;align-items:center;gap:10px;padding:9px 10px 11px;border-bottom:1px solid #F0ECE5;margin-bottom:5px}'
    + '.hp-h-nm{font:700 13px system-ui,-apple-system,sans-serif;color:#1A1A1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.hp-h-em{font:400 10.5px system-ui,-apple-system,sans-serif;color:#8A8578;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.hp-item:hover{background:#FFF3EA}'
    + '.hp-out{color:#B91C1C}.hp-out:hover{background:#FEF2F2}'
    + '.hp-sep{height:1px;background:#F0ECE5;margin:5px 2px}'
    + '@media(max-width:760px){.hp-nm{display:none}}'
    + '</style>';

  var poll = "<script>(function(){"
    + "var scope='" + scope + "';window.DASH_SCOPE=scope;"   // naye tab isse jaante hain ki All India hai ya UP
    /* hdr-layout (09-Oct): sidebar ab header ke hamburger se chalta hai.
       Pehle yahan zabardasti 'sb-pinned' laga diya jaata tha -- ab wo class
       hai hi nahi, aur khula/band rakhna page ka apna code tay karta hai
       (desktop par khula, phone par band, aur jo user ne chuna wo yaad). */
    /* hdr-prof : profile ab sidebar me nahi, header ke daayein kone me hai.
       Sidebar ko haath nahi lagate -- wahan dobara "India Political Pulse" aa jaata hai. */
    + "try{"
    +   "var _hr=document.querySelector('.hdr-right');"
    +   "if(_hr&&!document.getElementById('hpWrap')){"
    +     "document.head.insertAdjacentHTML('beforeend'," + JSON.stringify(hdrProfCss) + ");"
    +     "_hr.insertAdjacentHTML('beforeend'," + JSON.stringify(hdrProf) + ");"
    +     "var _hw=document.getElementById('hpWrap'),_hb=document.getElementById('hpBtn'),"
    +       "_hm=document.getElementById('hpMenu');"
    +     "document.body.appendChild(_hm);"
    +     "function _hpPlace(){var r=_hb.getBoundingClientRect();"
    +       "_hm.style.top=(r.bottom+8)+'px';"
    +       "var w=_hm.offsetWidth||234;"
    +       "var L=Math.min(Math.max(8,r.right-w),(window.innerWidth||w)-w-8);"
    +       "_hm.style.left=L+'px';}"
    +     "function _hpShut(){_hw.classList.remove('open');_hm.classList.remove('open');"
    +       "_hb.setAttribute('aria-expanded','false');}"
    +     "function _hpOpen(){_hw.classList.add('open');_hm.classList.add('open');"
    +       "_hb.setAttribute('aria-expanded','true');_hpPlace();}"
    +     "_hb.addEventListener('click',function(ev){ev.stopPropagation();"
    +       "if(_hw.classList.contains('open'))_hpShut();else _hpOpen();});"
    +     "document.addEventListener('click',function(ev){"
    +       "if(!_hw.contains(ev.target)&&!_hm.contains(ev.target))_hpShut();});"
    +     "document.addEventListener('keydown',function(ev){if(ev.key==='Escape')_hpShut();});"
    +     "window.addEventListener('resize',function(){if(_hw.classList.contains('open'))_hpPlace();});"
    +     "window.addEventListener('scroll',function(){if(_hw.classList.contains('open'))_hpPlace();},true);"
    +     "var _rq=document.getElementById('hpReq');"
    +     "if(_rq)_rq.addEventListener('click',function(){_hpShut();"
    +       "try{if(typeof switchTab==='function')switchTab('handle-req');}catch(e){}"
    +       "try{var t=document.querySelector('.mnav-tab[data-tab=\"handle-req\"]');"
    +         "if(t&&!/\\bactive\\b/.test(t.className))t.click();}catch(e){}"
    +       "try{var sec=document.getElementById('sec-handle-req')||document.querySelector('[data-sec=\"handle-req\"]');"
    +         "if(sec&&sec.scrollIntoView)sec.scrollIntoView({behavior:'smooth',block:'start'});"
    +         "else window.scrollTo({top:0,behavior:'smooth'});}catch(e){}});"
    +   "}"
    + "}catch(e){}"
    /* ---------- nav-order : tab ka kram, neeche ka teer, AI chat chhupana ----------
       Teeno kaam yahin se hote hain taaki dono dashboard (All India + UP) par
       ek jaisa rahe aur template ko haath na lagana pade. */
    + "try{"
    +   "var _nv=document.getElementById('mainNav');"
    +   "if(_nv){"
    /* 1. kram -- jo yahan nahi hai wo apni jagah par peechhe lag jaata hai */
    +     "var _ORD=['dashboard','top-leaders','states-cm','mla-tracker','parties',"
    /* growth-off (13-Oct): 'growth' is list se nikal diya -- uska tab ab
       hai hi nahi. Ye list sirf kram lagati hai, isliye na hone par bhi
       kuch toot-ta nahi tha; saaf rakhne ke liye nikala. */
    +       "'narrative-groups','handle-analytics','profiles','tweets','breaking','hashtags',"
    +       "'sentiment','reports','wordcloud'];"
    +     "var _tabs=[].slice.call(_nv.querySelectorAll('.mnav-tab'));"
    /* 2. Handles To Be Added yahan se hat gaya -- ab wo sirf upar daayein
          profile ke menu me "Request" se khulta hai */
    +     "_tabs.forEach(function(t){if(t.getAttribute('data-tab')==='handle-req')"
    +       "{if(t.parentNode)t.parentNode.removeChild(t);}});"
    +     "_tabs=[].slice.call(_nv.querySelectorAll('.mnav-tab'));"
    +     "var _byKey={};_tabs.forEach(function(t){_byKey[t.getAttribute('data-tab')]=t;});"
    +     "_ORD.forEach(function(k){if(_byKey[k]){_nv.appendChild(_byKey[k]);delete _byKey[k];}});"
    +     "_tabs.forEach(function(t){var k=t.getAttribute('data-tab');"
    +       "if(_byKey[k]){_nv.appendChild(t);delete _byKey[k];}});"
    /* 3. Neeche ka hilta hua teer -- nav me scrollbar chhupi hui hai, isliye neeche aur tab
          hone ka koi ishaara nahi tha. Ye sirf tab dikhta hai jab sach me
          neeche aur bacha ho, aur click karne par neeche le jaata hai. */
    +     "if(!document.getElementById('navMore')){"
    /* see-more : pehle ye nav ke ANDAR sticky tha, isliye aakhri tab
       ("Breaking News") ke UPAR chadh jaata tha aur rang bhi bhadka lagta
       tha. Ab ye nav ke BAAHAR, sidebar me neeche apni alag jagah leta hai
       -- kisi tab ko dhakta nahi. Rang bhi halka: safed ki halki jhalak. */
    +       "document.head.insertAdjacentHTML('beforeend','<style id=\"navmore-css\">'"
    /* Ye nav ke ANDAR, sabse NEECHE chipka rehta hai.
       DHYAN: nav par padding-bottom MAT lagana -- sticky element apne
       parent ke content-box se neeche nahi ja sakta, isliye padding
       jitna wo UPAR uth jaata hai aur beech ke tab kaatne lagta hai.
       (Yahi pichhli baar hua tha.) Jagah ke liye neeche margin-top hai. */
    /* 09-Oct: teer aur thoda neeche -- sticky ko bottom se bahar khiska diya */
    +         "+'#navMore{position:sticky;bottom:-10px;z-index:5;display:none;'"
    +           "+'align-items:center;justify-content:center;gap:0;'"
    +           "+'margin:10px -12px -18px;padding:13px 0 18px;cursor:pointer;border:0;'"
    +           "+'width:calc(100% + 24px);color:#F08A1A;'"
    +           "+'font:0/0 a;'"
    /* koi rang nahi -- sidebar ka apna halka cream hi upar jaakar
       paardarshi ho jaata hai. Peechhe ka tab dhundhla dikhta hai,
       kata hua nahi, aur nazar sirf teer par jaati hai. */
    +           "+'background:linear-gradient(180deg,rgba(255,250,244,0) 0%,'"
    +             "+'rgba(255,250,244,.72) 45%,rgba(255,248,240,.95) 100%);'"
    +           "+'-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);'"
    +           "+'transition:color .15s}'"
    +         "+'#navMore.on{display:flex}'"
    +         "+'#navMore:hover{color:#D9661A}'"
    /* teer bina ruke upar-neeche hota hai -- yahi ishaara hai ki neeche
       aur tab bache hain. Mouse le jaate hi ruk jaata hai. */
    +         "+'#navMore svg{animation:navBob 1.25s ease-in-out infinite}'"
    +         "+'#navMore:hover svg{animation-play-state:paused}'"
    +         "+'@keyframes navBob{0%{transform:translateY(-2px);opacity:.45}'"
    +           "+'55%{transform:translateY(4px);opacity:.95}'"
    +           "+'100%{transform:translateY(-2px);opacity:.45}}'"
    +       "+'</style>');"
    +       "var _nm=document.createElement('button');_nm.id='navMore';_nm.type='button';"
    +       "_nm.title='More tabs below';_nm.setAttribute('aria-label','More tabs below');"
    /* sirf teer -- koi likhavat nahi, taaki tab ka naam na dhake */
    +       "_nm.innerHTML='<svg width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" '"
    +         "+'fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.75\" stroke-linecap=\"round\" '"
    +         "+'stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"/></svg>';"
    +       "_nv.appendChild(_nm);"
    +       "function _navMore(){try{"
    +         "var more=(_nv.scrollTop+_nv.clientHeight)<(_nv.scrollHeight-2);"
    +         "_nm.classList.toggle('on',more);}catch(e){}}"
    +       "_nm.addEventListener('click',function(){"
    +         "_nv.scrollBy({top:Math.max(120,_nv.clientHeight-90),behavior:'smooth'});});"
    +       "_nv.addEventListener('scroll',_navMore);"
    +       "window.addEventListener('resize',_navMore);"
    /* Nav kai baar baad me badalta hai (font aane par, tab jurne par,
       sidebar khulne par). Isliye ek baar dekh kar chhod nahi dete --
       thodi der tak dekhte rehte hain, aur badlaav par bhi dobara. */
    +       "try{if(window.ResizeObserver)new ResizeObserver(_navMore).observe(_nv);}catch(e){}"
    +       "try{if(window.MutationObserver)new MutationObserver(_navMore)"
    +         ".observe(_nv,{childList:true,subtree:true});}catch(e){}"
    +       "try{if(document.fonts&&document.fonts.ready)document.fonts.ready.then(_navMore);}catch(e){}"
    +       "var _nc=0,_ni=setInterval(function(){_navMore();if(++_nc>30)clearInterval(_ni);},250);"
    +       "_navMore();setTimeout(_navMore,300);setTimeout(_navMore,1200);"
    +     "}"
    +   "}"
    + "}catch(e){}"
    /* ---------- multi-desig : "Chief Minister / MLA" ----------
       roleOf() ko lapet dete hain. Jahan-jahan pad dikhta hai (Top Leaders
       ki table, Dashboard ka top box) wahan apne aap saare pad aa jaate
       hain. HROLE ko haath nahi lagaya -- usme ek hi pad aata hai. */
    + "try{var HD=" + JSON.stringify(HDESIG) + ";window.HDESIG=HD;"
    +   "if(typeof window.roleOf==='function'&&!window.roleOf._multi){"
    +     "var _ro=window.roleOf;"
    +     "window.roleOf=function(h,fb){"
    +       "var d=HD[String(h||'').toLowerCase()];"
    +       "if(d&&d.length)return d.join(' / ');"
    +       "return _ro(h,fb);};"
    +     "window.roleOf._multi=true;"
    +   "}"
    + "}catch(e){}"

    /* ---------- level card : handle count mapping se (poora count) ----------
       hMore() baar-baar chalta hai (BRUTE_HYDRATE_BOOT), isliye hum bhi
       thodi der tak dohraate hain. Dono me se JO BADA ho wahi dikhate hain:
       mapping ka count, ya jin handles ke tweet mile unka count (79 handle
       aise bhi hain jo mapping me nahi par tweet unke hain). */
    + (msBar ? ("try{if(!document.getElementById('msBar')){"
        + "var _mb=document.createElement('div');"
        + "_mb.innerHTML=" + JSON.stringify(msBar) + ";"
        + "var _mn=document.querySelector('main')||document.body;"
        + "if(_mn.firstChild)_mn.insertBefore(_mb.firstChild,_mn.firstChild);"
        + "else _mn.appendChild(_mb.firstChild);"
        + "}}catch(e){}") : "")
    + "try{var MLV=" + JSON.stringify(MAPLVL) + ";window.MAPLVL=MLV;"
    +   "var _lmap={'LS MP':'lvLSMPh','RS MP':'lvRSMPh','MLA':'lvMLAh','MLC':'lvMLCh',"
    +     "'Chief Minister':'lvCMh','Dy CM':'lvDyCMh','MLA Contestent':'lvConth','Others':'lvOthersh'};"
    /* Party chuni ho to wahi ginti sahi hai jo us party ki hai -- tab
       mapping ka poora count mat thopo. 'All parties' par hi poora count. */
    +   "function _lvAll(){try{var p=(document.getElementById('dashParty')||{}).value;"
    +     "return !p||p==='all';}catch(e){return true;}}"
    +   "function _lvFix(){try{"
    +     "if(!_lvAll())return;"
    +     "var live={};((window.UNI&&UNI.allHandles)||[]).forEach(function(h){"
    +       "var k=h.level||'Others';live[k]=(live[k]||0)+1;});"
    +     "Object.keys(_lmap).forEach(function(k){"
    +       "var n=Math.max(+MLV[k]||0,+live[k]||0);if(!n)return;"
    +       "var e=document.getElementById(_lmap[k]);if(!e)return;"
    +       "e.textContent=n.toLocaleString('en-IN')+' handles';});"
    +   "}catch(e){}}"
    +   "window._lvFix=_lvFix;"
    /* Asli likhne wala updateLevelStrip() hai (date/party badalne par chalta
       hai aur "476 handles" likh deta hai). Usi ko lapet dete hain, warna
       hamara number uske baad mit jaata tha. */
    +   "function _lvWrap(){try{"
    +     "var f=window.updateLevelStrip;"
    +     "if(typeof f!=='function'||f._mapcnt)return;"
    +     "var w=function(){var r=f.apply(this,arguments);_lvFix();return r;};"
    +     "w._mapcnt=true;window.updateLevelStrip=w;"
    +   "}catch(e){}}"
    +   "var _lvT=0;(function _lvP(){_lvWrap();_lvFix();if(++_lvT<40)setTimeout(_lvP,250);})();"
    +   "try{document.addEventListener('change',function(e){"
    +     "var id=(e.target||{}).id;"
    +     "if(id==='dashParty'||id==='dashFrom'||id==='dashTo'||id==='dashPreset')"
    +       "setTimeout(_lvFix,60);},true);}catch(e){}"
    + "}catch(e){}"

    /* ---------- range-title : heading me CHUNI HUI date ----------
       "Top 15 Handles by Views - Apr-Oct 2026" hamesha POORI range dikhata
       tha, chaahe upar 3 din chune hon. Ab renderLeaders ke baad heading
       chuni hui range se likh di jaati hai. Poori range par wahi purana
       text wapas aa jaata hai. */
    + "try{"
    +   "var _MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];"
    +   "function _d2(x){var p=String(x||'').split('-');"
    +     "if(p.length!==3)return '';return {y:p[0],m:+p[1],d:+p[2]};}"
    +   "function _rangeTxt(f,t){"
    +     "var a=_d2(f),b=_d2(t);if(!a||!b)return '';"
    +     "var pad=function(n){return (n<10?'0':'')+n;};"
    +     "if(a.y===b.y&&a.m===b.m&&a.d===b.d)return _MN[a.m-1]+' '+pad(a.d)+', '+a.y;"
    +     "if(a.y===b.y&&a.m===b.m)return _MN[a.m-1]+' '+pad(a.d)+'\\u2013'+pad(b.d)+', '+a.y;"
    +     "if(a.y===b.y)return _MN[a.m-1]+' '+pad(a.d)+' \\u2013 '+_MN[b.m-1]+' '+pad(b.d)+', '+a.y;"
    +     "return _MN[a.m-1]+' '+pad(a.d)+', '+a.y+' \\u2013 '+_MN[b.m-1]+' '+pad(b.d)+', '+b.y;}"
    +   "function _leadTitle(){try{"
    +     "var sec=document.getElementById('sec-top-leaders');if(!sec)return;"
    +     "var el=sec.querySelector('.sec-title');if(!el)return;"
    +     "if(!el._base)el._base=el.textContent;"
    +     "var f=(document.getElementById('tlFrom')||{}).value||'';"
    +     "var t=(document.getElementById('tlTo')||{}).value||'';"
    +     "var D=window.PHD_DATES||[];"
    +     "var full=(!f||!t)||(D.length&&f===D[0]&&t===D[D.length-1]);"
    +     "var head=el._base.split('\\u2014')[0].replace(/\\s+$/,'');"
    +     "el.textContent=full?el._base:(head+' \\u2014 '+_rangeTxt(f,t));"
    +   "}catch(e){}}"
    +   "window._leadTitle=_leadTitle;"
    +   "function _hookLead(){"
    +     "if(typeof window.renderLeaders!=='function'||window.renderLeaders._tt)return false;"
    +     "var _rl=window.renderLeaders;"
    +     "window.renderLeaders=function(){var r=_rl.apply(this,arguments);_leadTitle();return r;};"
    +     "window.renderLeaders._tt=true;return true;}"
    +   "if(!_hookLead()){var _n=0,_iv=setInterval(function(){"
    +     "if(_hookLead()||++_n>40)clearInterval(_iv);},150);}"
    +   "setTimeout(_leadTitle,700);setTimeout(_leadTitle,1800);"
    + "}catch(e){}"

    /* ---------- ai-off : AI chat abhi ke liye chhupa diya ----------
       Hataya nahi -- sirf chhupaya hai. Wapas chahiye to neeche wali
       AI_OFF ko false kar do, bas. */
    + "try{var AI_OFF=true;if(AI_OFF){"
    +   "document.head.insertAdjacentHTML('beforeend',"
    +     "'<style id=\"ai-off-css\">#aiFab,#aiPanel{display:none !important}</style>');"
    + "}}catch(e){}"
    + "setTimeout(function(){try{if(typeof _pRe==='function')_pRe();}catch(e){}},600);"   // parties chip fresh data se (baked purana number replace)
    // KPI ke neeche note: politicians + media/journalist = grand total
    // (KPI cards filter par dobara bante hain, isliye baar-baar check karte rehte hain)
    + "var NT=" + JSON.stringify(noteTxt) + ";"
    + "function _addNote(){if(!NT)return;try{var ns=document.querySelectorAll('.kpi-sub');"
    + "for(var i=0;i<ns.length;i++){var e=ns[i];"
    + "if(/tweets|Full Range/i.test(e.textContent)&&e.innerHTML.indexOf('_mjnote')<0){"
    + "e.insertAdjacentHTML('beforeend','<div class=\"_mjnote\" style=\"font-size:9.5px;color:#9aa3af;"
    + "margin-top:3px;line-height:1.35\">'+NT+'</div>');return;}}}catch(e){}}"
    + "setInterval(_addNote,1500);setTimeout(_addNote,400);setTimeout(_addNote,1200);"
    + "if(location.protocol==='file:')return;"
    + "var cur=null;"
    + "function toast(m){var d=document.createElement('div');d.textContent=m;"
    + "d.style.cssText='position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:999999;"
    + "background:#177245;color:#fff;padding:11px 20px;border-radius:9px;"
    + "font:600 14px system-ui,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.28)';"
    + "document.body.appendChild(d);}"
    + "function check(){fetch('/api/version?scope='+scope,{cache:'no-store'}).then(function(r){return r.json();})"
    + ".then(function(j){if(cur===null){cur=j.v;return;}"
    + "if(j.v&&j.v!==cur){cur=j.v;toast('\\u2713 New data is in \\u2014 refreshing\\u2026');"
    + "setTimeout(function(){location.reload();},1600);}}).catch(function(){});}"
    + "setInterval(check,30000);check();"
    + "})();</script>";
  var _bi = html.lastIndexOf('</body>');
  if (_bi >= 0) html = html.slice(0, _bi) + poll + html.slice(_bi);
  else html += poll;
  return html;
}

async function serveDash(scope, res, role, who, req) {
  try {
    /* Taiyaar gzip pada ho to seedha wahi bhej do -- yahi aam haalat hai. */
    var vkey = await dashVersionKey(scope);
    var variant = vkey + '||' + (role || 'admin') + '||' + String(who || '').toLowerCase();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
       .set('Content-Type', 'text/html; charset=utf-8');
    var hit = _gzCache.get(variant);
    if (hit) {
      _dashStat.gzHits++;
      hit.at = Date.now();
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', hit.buf.length);
      return res.end(hit.buf);
    }
    _dashStat.gzMiss++;
    const html = await buildHtml(scope, role, who);
    var _ae = String(((req || res.req || {}).headers || {})['accept-encoding'] || '');
    if (!/\bgzip\b/.test(_ae)) return res.send(html);
    zlib.gzip(Buffer.from(html, 'utf8'), { level: 6 }, function (err, gz) {
      if (err || res.headersSent) { try { res.send(html); } catch (e1) {} return; }
      try {
        _gzPut(variant, gz);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', gz.length);
        res.end(gz);
      } catch (e2) { try { res.send(html); } catch (e3) {} }
    });
  } catch (e) {
    res.status(500).send('<pre style="font:14px monospace;padding:20px;color:#b00">Dashboard could not be loaded:\n\n' + e.message + '</pre>');
  }
}
/* Kaun kaunsa dashboard khol sakta hai. 'admin' sab dekh sakta hai;
 * baaki sirf apna. Jo apna nahi hai, use uske apne ghar bhej dete hain. */
const SCOPE_ROLES = { all: ['all', 'admin'], up: ['up', 'admin'], punjab: ['punjab', 'admin'] };
function allowScope(scope, req, res) {
  var r = roleOf(req);
  if (!r) { res.redirect('/login'); return null; }
  if (SCOPE_ROLES[scope].indexOf(r) < 0) { res.redirect(homeFor(r)); return null; }
  return r;
}
app.get('/', function (req, res) {                       // All India
  var r = allowScope('all', req, res); if (!r) return;
  serveDash('all', res, r, emailOf(req), req);
});
app.get('/up', function (req, res) {                     // UP (filtered view)
  var r = allowScope('up', req, res); if (!r) return;
  serveDash('up', res, r, emailOf(req), req);
});

/* ==================================================================
 *  PUNJAB  (/punjab)
 *  ------------------------------------------------------------------
 *  Punjab ka dashboard alag dhaanche ka hai -- baked HTML nahi, balki
 *  ek chhota SPA jo apne hi /api/data se JSON kheenchta hai. Isliye use
 *  yahan SUB-APP ki tarah joda gaya hai: ek hi server, ek hi port 3000,
 *  ek hi login. PunjabLens/server.js ko chhua nahi gaya -- wo abhi bhi
 *  `node server.js` se akela chal sakta hai.
 *
 *  Data: build_punjab_data.py  pulse_master.master_tweets  ->  political_lens
 *  (wahi Mongo jisse All India aur UP chalte hain).
 * ================================================================== */
try {
  var punjabApp = require(path.join(__dirname, '..', 'PunjabLens', 'server.js'));

  app.use('/punjab', function (req, res, next) {
    /* Ek chhoot: /punjab/refresh sirf ISI laptop se, bina login ke.
       Ye run_pipeline.py maarta hai taaki naya data push hote hi Punjab
       ka cache saaf ho jaaye. Bahar se koi nahi maar sakta -- aur ye
       sirf cache khaali karta hai, data ko haath nahi lagata. */
    var ip = String(req.ip || req.connection.remoteAddress || '');
    var isLocal = /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(ip);
    if (isLocal && req.path === '/refresh') return next();

    // pehra: sirf 'punjab' aur 'admin'
    if (!allowScope('punjab', req, res)) return;
    /* /punjab -> /punjab/  -- bina slash ke andar ke app.js, style.css
       galat jagah dhoondhte hain. Yahan originalUrl dekhna zaroori hai:
       app.get('/punjab') likhne par Express '/punjab/' ko bhi pakad leta
       hai aur redirect apne aap par loop maar deta hai. */
    if (String(req.originalUrl || '').split('?')[0] === '/punjab') {
      return res.redirect(302, '/punjab/');
    }
    next();
  });
  /* Punjab ka page apna alag SPA hai -- usme sidebar wala switch nahi hai.
     Isse wo poochh leta hai "main kaun hoon", aur admin ko hi doosre
     dashboard ke button dikhata hai. (Mount se PEHLE, warna Punjab ka
     static 404 pakad lega.) */
  app.get('/punjab/_me', function (req, res) {
    res.set('Cache-Control', 'no-store').json({ role: roleOf(req) || '', email: emailOf(req) });
  });
  app.use('/punjab', punjabApp);

  if (typeof punjabApp.startBuildWatcher === 'function') punjabApp.startBuildWatcher();
  console.log('  Punjab dashboard juda: /punjab  (db: '
    + ((punjabApp.CFG && punjabApp.CFG.targetDb) || 'political_lens') + ')');
} catch (e) {
  // Punjab na chale to baaki dashboard band nahi hona chahiye
  console.log('  [PUNJAB] mount skip: ' + e.message);
}

app.get('/refresh', async function (req, res) {
  try { dashCacheClear('/refresh'); await buildHtml('all'); res.send('<h2 style="font-family:sans-serif;color:#177245">Refresh ho gaya! <a href="/">dashboard kholo</a></h2>'); }
  catch (e) { res.status(500).send('<pre>' + e.message + '</pre>'); }
});

/* ==================================================================
 *  BACKEND ADMIN PANEL  (/admin)
 *  - poora raw data MongoDB se date-wise CSV download
 *  - scraping (daily) report generate
 *  Sirf role 'backend' (admin_1@) aur 'admin' ke liye.
 * ================================================================== */
const fsp = fs.promises;
function _withTimeout(p, ms) {
  return Promise.race([p, new Promise(function (_, rej) {
    setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
}
const MASTER_DB = 'pulse_master', MASTER_COLL = 'master_tweets';
function _dmy(d) {   // 2026-08-18 -> 18 Aug 2026
  var p = String(d).split('-');
  return p.length === 3 ? (+p[2]) + ' ' + _MON[(+p[1]) - 1] + ' ' + p[0] : d;
}
const MONGO_OPT = { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 };
const RAW_COLS = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
  'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets','Total Views',
  'Total Bookmark Tweets Times','Sentiment','Sentiment Score','State','Locations','AC/PC No',
  'AC Name','PC Name','Designation','Candidate Name','Category','Categories','Party','Status','Source Folders'];
const ROW_CAP = 2000000;

/* ---- admin-access : panel ka hak sirf 'backend' tak seemit nahi ----
   Panel me har user ke saamne ek tick hai ("Admin panel"). Tick lagte hi
   us login ke paas panel ka hak aa jaata hai -- wo apne profile menu se
   seedha /admin par ja sakta hai. Hak Mongo (portal_users.adminPanel) me
   rakha hai, isliye server restart ki zaroorat nahi (list har 60 sec me
   taazi hoti hai, aur badalte hi turant). */
function hasAdminPanel(emailOrReq) {
  try {
    var e = (typeof emailOrReq === 'string') ? emailOrReq : emailOf(emailOrReq);
    var u = _dbUsers[String(e || '').trim().toLowerCase()];
    return !!(u && u.adminPanel);
  } catch (e2) { return false; }
}

function adminGuard(req, res, next) {
  var r = roleOf(req);
  if (!r) return res.redirect('/login');
  if (r !== 'backend' && !hasAdminPanel(req)) return res.status(403).set('Cache-Control', 'no-store').send(adminPage('Access',
    '<div class="pg-h">Access denied</div><div class="ad-card">'
    + '<div class="ad-err">This panel is only for the Backend Admin account.</div>'
    + '<a class="ad-btn" href="/">Back to dashboard</a></div>', r, {}));
  req.role = r; next();
}

/* Dashboard ke apne API (Trending / Explorer / AI) ke liye pehra.
   Login zaroori hai, par role koi bhi chalega -- kaunsa data dikhega wo
   scope se tay hota hai. Jawaab JSON me aata hai, redirect nahi, warna
   fetch() ko login page ka HTML mil jaata aur wo JSON parse par toot jaata. */
function dashGuard(req, res, next) {
  var r = roleOf(req);
  if (!r) return res.status(401).set('Cache-Control', 'no-store')
                    .json({ error: 'Your session has expired. Please refresh the page.' });
  if (req.query.scope === 'up' && ['up', 'admin'].indexOf(r) < 0) {
    return res.status(403).json({ error: 'You do not have permission to view UP data.' });
  }
  if (req.query.scope !== 'up' && ['all', 'admin'].indexOf(r) < 0) {
    return res.status(403).json({ error: 'You do not have permission to view All-India data.' });
  }
  req.role = r; next();
}

const ADCSS = '*{box-sizing:border-box}'
  + 'body{margin:0;font-family:Segoe UI,system-ui,sans-serif;color:#3A2418;background:#FBF6F1}'
  + '.ad-shell{display:flex;min-height:100vh;align-items:stretch}'
  + '.ad-main{flex:1;min-width:0;padding:26px 30px 60px;max-width:1020px}'
  // ---- LEFT sidebar ----
  + '.ad-side{width:250px;flex:0 0 250px;background:linear-gradient(165deg,#C0430D,#7A2A06);'
  + 'color:#fff;padding:24px 18px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column}'
  + '.ad-brand{display:flex;align-items:center;gap:10px;margin-bottom:26px}'
  + '.ad-brand .m{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.16);'
  + 'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex:0 0 auto}'
  + '.ad-brand .t{font-size:13px;font-weight:600;line-height:1.25}'
  + '.ad-brand .s{font-size:9.5px;letter-spacing:1.5px;color:rgba(255,255,255,.62)}'
  + '.nv{display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:none;'
  + 'color:rgba(255,255,255,.86);padding:11px 13px;border-radius:9px;font-size:13.5px;font-family:inherit;'
  + 'cursor:pointer;text-align:left;margin-bottom:4px;transition:.15s}'
  + '.nv:hover{background:rgba(255,255,255,.12);color:#fff}'
  + '.nv.on{background:#fff;color:#C0430D;font-weight:600}'
  + '.nv .ic{width:22px;text-align:center;font-size:15px;flex:0 0 auto}'
  + '.nv .bg{margin-left:auto;background:#fff;color:#C0430D;border-radius:9px;padding:1px 8px;font-size:11px;font-weight:700}'
  + '.nv.on .bg{background:#C0430D;color:#fff}'
  + '.ad-you{margin-top:auto;padding-top:16px;border-top:1px solid rgba(255,255,255,.2);font-size:11.5px;color:rgba(255,255,255,.75)}'
  + '.ad-you a{color:#FFD9BF;text-decoration:none;font-weight:600}'
  // ---- content ----
  + '.pg-h{font-size:21px;font-weight:600;color:#7A2A06;margin:0 0 3px}'
  + '.pg-s{font-size:13px;color:#9A7A63;margin:0 0 20px}'
  + '.ad-card{background:#fff;border:1px solid #F0E1D3;border-radius:12px;padding:20px 22px;margin-bottom:18px;'
  + 'box-shadow:0 1px 3px rgba(120,60,20,.05)}'
  + '.ad-card h2{margin:0 0 4px;font-size:15px;color:#7A2A06;font-weight:600}'
  + '.ad-h{font-size:12.5px;color:#9A7A63;margin:0 0 16px;line-height:1.6}'
  + 'label{display:block;font-size:10.5px;font-weight:700;color:#8C6B54;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}'
  + 'input,select{width:100%;padding:9px 11px;border:1px solid #EFDFD0;border-radius:8px;font-size:13.5px;'
  + 'font-family:inherit;background:#FDF8F3;color:#3A2418}'
  + 'input:focus,select:focus{outline:none;border-color:#F97316;background:#fff;box-shadow:0 0 0 3px rgba(249,115,22,.15)}'
  + '.ad-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}.ad-col{flex:1;min-width:165px}'
  + '.ad-btn{background:#EA580C;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;'
  + 'font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;font-family:inherit}'
  + '.ad-btn:hover{background:#C0430D}'
  + '.ad-btn.g{background:#1B6B45}.ad-btn.g:hover{background:#145436}'
  + '.ad-btn.o{background:#7A2A06}.ad-btn.o:hover{background:#5C1F04}'
  + '.ad-note{font-size:11.5px;color:#9A7A63;margin-top:14px;line-height:1.65;background:#FDF6EF;'
  + 'border-left:3px solid #F97316;padding:9px 12px;border-radius:0 6px 6px 0}'
  + '.ad-err{background:#FDECEA;border:1px solid #F5C2BD;color:#A83224;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px}'
  + '.ad-ok{background:#EAF7F0;border:1px solid #B9E0C9;color:#1B6B45;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px}'
  + 'table{width:100%;border-collapse:collapse;font-size:12.5px}'
  + 'th{background:#7A2A06;color:#fff;padding:8px;text-align:left;font-size:11.5px;font-weight:600}'
  + 'td{padding:7px 8px;border-bottom:1px solid #F5EBE2;vertical-align:top}'
  + 'tr:nth-child(even) td{background:#FDF8F3}'
  + '.chip{background:#FDF0E4;color:#8C4A16;border-radius:5px;padding:3px 8px;margin:0 5px 5px 0;'
  + 'white-space:nowrap;display:inline-block;font-size:12px}'
  + '.sec{display:none}.sec.on{display:block}'
  + '@media(max-width:900px){.ad-shell{flex-direction:column}.ad-side{width:100%;flex:none;height:auto;position:static}'
  + '.ad-main{padding:20px 16px 40px}}'
  /* ---- MOBILE (phone) ---- */
  + '@media(max-width:700px){'
  + '.ad-main{padding:14px 10px 40px}'
  /* nav upar chipki hui horizontal patti ban jaata hai -- lambi list scroll na karni pade */
  + '.ad-side{display:flex;flex-wrap:wrap;gap:6px;padding:10px;position:sticky;top:0;z-index:50}'
  + '.ad-brand{width:100%;margin-bottom:4px}'
  + '.nv{flex:1 1 auto;min-width:44%;min-height:44px;justify-content:center;font-size:12px;padding:9px 8px}'
  + '.ad-you{width:100%;font-size:11px;margin-top:6px}'
  /* filter form ek column me */
  + '.ad-row{display:block}.ad-col{width:100%;margin-bottom:10px}'
  + '.ad-card{padding:13px;border-radius:11px}'
  + 'input,select,textarea{font-size:16px;min-height:42px}'   /* 16px = iOS auto-zoom band */
  + '.ad-btn,button{min-height:42px}'
  /* tables side-scroll + pehla column tika hua */
  + '.ad-card table{display:block;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}'
  + '.ad-card th,.ad-card td{padding:7px 8px;font-size:11px}'
  + '.ad-card th:first-child,.ad-card td:first-child{position:sticky;left:0;background:#fff;z-index:2}'
  + '}';

/* admin-english : panel ka saara dikhne wala text English me */
/* admin-english2 */
const NAV = [
  { id: 'tracker',  ic: '&#x1F50E;', label: 'Handle Tracker' },   /* tracker-tab */
  { id: 'trklog',   ic: '&#x1F4DC;', label: 'Live Scrape Log' },  /* trk-tabs2 */
  { id: 'trkdb',    ic: '&#x1F5C4;', label: 'Tweet Database' },   /* trk-tabs2 */
  { id: 'trkmap',   ic: '&#x1F5FA;', label: 'Handle Mapping' },   /* map-tab */
  /* tab-merge : Login + Handle request ek tab me; Export + Report ek tab me */
  { id: 'requests', ic: '&#x1F4E5;', label: 'Requests' },
  { id: 'data',     ic: '&#x2B07;', label: 'Data & Reports' },
  { id: 'users',    ic: '&#x1F511;', label: 'Active Logins' },
  { id: 'activity', ic: '&#x1F553;', label: 'Login Activity' },
  { id: 'email',    ic: '&#x2709;', label: 'Email Settings' }
];

function adminPage(title, sections, role, opts) {
  opts = opts || {};
  /* tracker-tab : Tracker tab ki apni JS, sirf tab wo tab page par ho */
  var trkJs = (String(sections).indexOf('id="sec-tracker"') >= 0) ? TRKUI.script() : '';
  /* hreq-admin : Handle Requests tab ki apni JS */
  if (String(sections).indexOf('id="sec-hreq"') >= 0) trkJs += '\n' + HREQUI.script();
  var tab = opts.tab || 'export';
  var badges = opts.badges || {};
  var nav = NAV.map(function (n) {
    return '<button class="nv' + (n.id === tab ? ' on' : '') + '" data-t="' + n.id + '">'
      + '<span class="ic">' + n.ic + '</span>' + n.label
      + (badges[n.id] ? '<span class="bg">' + badges[n.id] + '</span>' : '') + '</button>';
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title + ' - Backend Admin Panel</title><style>' + ADCSS + '</style></head><body>'
    + '<div class="ad-shell">'
    + '<aside class="ad-side">'
    + '<div class="ad-brand"><div class="m">IP</div><div><div class="t">Backend Admin</div>'
    + '<div class="s">INDIA POLITICAL PULSE</div></div></div>'
    + nav
    + '<div class="ad-you">Signed in as<br><b style="color:#fff">admin_1@jarvis.consulting</b><br>'
    + '<a href="/logout">Sign out</a></div>'
    + '</aside>'
    + '<main class="ad-main">' + sections + '</main>'
    + '</div>'
    + '<script>(function(){'
    + 'var btns=document.querySelectorAll(".nv"),secs=document.querySelectorAll(".sec");'
    + 'function go(t){for(var i=0;i<btns.length;i++)btns[i].classList.toggle("on",btns[i].dataset.t===t);'
    /* tab-merge : ek tab ke neeche kai section ho sakte hain. Section
       apna data-sec batata hai; na ho to purani tarah id se kaam chalta
       hai, taaki baaki sab waise ka waisa rahe. */
    + 'for(var j=0;j<secs.length;j++){var k=secs[j].dataset.sec||secs[j].id.replace("sec-","");'
    + 'secs[j].classList.toggle("on",k===t);}'
    + 'try{location.hash=t;}catch(e){}}'
    + 'for(var k=0;k<btns.length;k++)btns[k].onclick=function(){go(this.dataset.t);};'
    + 'var h=(location.hash||"").replace("#","");if(h)go(h);'
    + 'var pm=document.querySelectorAll(".pwm");'
    + 'for(var q=0;q<pm.length;q++){(function(el){el.onclick=function(){'
    + 'if(el.dataset.on==="1"){el.textContent="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";el.dataset.on="0";}'
    + 'else{el.textContent=el.dataset.pw;el.dataset.on="1";}};})(pm[q]);}'
    + '})();<\/script><script>' + trkJs + '</script></body></html>';
}

// panel ke liye zaroori index (ek baar, background me)
var _idxDone = false;
function ensureIndexes() {
  if (_idxDone) return;
  _idxDone = true;
  (async function () {
    var cli = MP.client();
    try {
      await cli.connect();
      var c = cli.db(MASTER_DB).collection(MASTER_COLL);
      await c.createIndex({ 'Tweet Date': 1 }, { background: true });
      await c.createIndex({ State: 1 }, { background: true });
      await c.createIndex({ Party: 1 }, { background: true });
      await c.createIndex({ Category: 1 }, { background: true });
      await c.createIndex({ Category: 1, 'Tweet Date': -1 }, { background: true });
      await c.createIndex({ Handle: 1 }, { background: true });
      /* trk-tabs2 : Tweet Database tab Handle par filter karke
         'Tweet Date' par sort karta hai -- bina compound index ke
         4 lakh row par ye in-memory sort banta hai. */
      await c.createIndex({ Handle: 1, 'Tweet Date': -1 }, { background: true });
      /* legacy-fix-srv : Handle Mapping tab ye poochhta hai ki Tracker ne
         kaun-kaun se handle database me daale hain. Bina index ke wo sawaal
         poore collection ka scan ban jaata tha aur 30 second me bhi poora
         nahi hota tha ("operation exceeded time limit"). */
      await c.createIndex({ 'Source Folders': 1 }, { background: true });
      await c.createIndex({ 'Source Folders': 1, Handle: 1 }, { background: true });
      /* Trending tab in par sort karta hai. Bina index ke find().sort()
         32 MB par ruk jaata hai aur error de deta hai. */
      await c.createIndex({ 'Total Views': -1 }, { background: true });
      await c.createIndex({ 'Total Likes': -1 }, { background: true });
      await c.createIndex({ 'Total Retweets': -1 }, { background: true });
      await c.createIndex({ 'Total Comments': -1 }, { background: true });
      console.log('  [ADMIN] indexes ready');
    } catch (e) { console.log('  [ADMIN] index skip: ' + e.message); }
    finally { try { await cli.close(); } catch (e2) {} }
  })();
}

/* Panel ke dropdown MAPPING FILE se bante hain (handle_master.json -- chhoti, local).
 * Pehle ye MongoDB par distinct() chalate the: 15 lakh docs par 30-60 sec lagte the
 * aur ngrok 60 sec par connection kaat deta tha -> blank page.
 * Ab yahan koi bhaari query nahi hai, page turant banta hai. */
var _adOpt = null;
async function adminOptions(force) {
  if (_adOpt && !force && Date.now() - _adOpt.at < 6e5) return _adOpt;
  var states = [], parties = [], cats = [], total = 0, ok = false;
  // 1) dropdown -> mapping file (instant)
  try {
    var raw = await _withTimeout(fsp.readFile(path.join(__dirname, 'data', 'handle_master.json'), 'utf8'), 8000);
    var mp = JSON.parse(raw);
    var S = {}, P = {}, C = {};
    Object.keys(mp).forEach(function (h) {
      var v = mp[h] || {};
      var st = String(v.state || '').trim(), pt = String(v.party || '').trim();
      if (st && st !== '-') S[st] = 1;
      if (pt && pt !== '-') P[pt] = 1;
      /* admin-cat (13-Oct): pehle sirf 'category' (ek) padhta tha. Ek handle
         ki kai Category ho sakti hain (Yogi: MLA + Top Leaders), aur
         'MLA'/'Mla' do alag option ban jaate the. Ab saari Category, aur
         spelling wahi jo baaki dashboard par hai. */
      var cs = Array.isArray(v.categories) ? v.categories
             : (v.category ? [v.category] : []);
      cs.forEach(function (c) {
        c = String(c || '').trim();
        if (!c || c === '-') return;
        C[haCatOf(h) && String(haCatOf(h)).toLowerCase() === c.toLowerCase() ? haCatOf(h) : c] = 1;
      });
    });
    states = Object.keys(S).sort(); parties = Object.keys(P).sort(); cats = Object.keys(C).sort();
    ok = true;
  } catch (e) { console.log('  [ADMIN] mapping read fail: ' + e.message); }
  // scrape folder ki list -- run_pipeline / backfill_source_folder ye file likhte hain
  var folders = [];
  try {
    folders = JSON.parse(await _withTimeout(
      fsp.readFile(path.join(__dirname, 'data', 'source_folders.json'), 'utf8'), 4000));
    if (!Array.isArray(folders)) folders = [];
  } catch (e) { folders = []; }
  // 2) ginti BACKGROUND me -- page kabhi Mongo ka intezaar nahi karta
  total = _adOpt ? _adOpt.total : _tweetCount;
  refreshCount();
  _adOpt = { at: Date.now(), ok: ok, states: states, parties: parties, cats: cats,
             folders: folders, total: total,
             min: '2026-04-01', max: new Date().toISOString().slice(0, 10) };
  return _adOpt;
}

// total tweets -- background me update hota rehta hai
var _tweetCount = 0, _cntBusy = false;
function refreshCount() {
  if (_cntBusy) return;
  _cntBusy = true;
  (async function () {
    var cli = MP.client();
    try {
      await cli.connect();
      ensureIndexes();
      _tweetCount = await cli.db(MASTER_DB).collection(MASTER_COLL).estimatedDocumentCount();
      if (_adOpt) _adOpt.total = _tweetCount;
    } catch (e) { console.log('  [ADMIN] count skip: ' + e.message); }
    finally { _cntBusy = false; try { await cli.close(); } catch (e2) {} }
  })();
}
refreshCount();
setInterval(refreshCount, 3e5);

function adminQuery(q) {
  var f = {};
  var from = String(q.from || '').trim(), to = String(q.to || '').trim();
  if (from || to) {
    f['Tweet Date'] = {};
    if (from) f['Tweet Date'].$gte = from;
    if (to) f['Tweet Date'].$lte = to + '~';        // 'YYYY-MM-DD HH:MM' bhi cover
  }
  [['state', 'State'], ['party', 'Party'], ['handle', 'Handle'],
   // 'Source Folders' array hai -- Mongo me barabari ka matlab "isme ye naam hai kya?"
   ['folder', 'Source Folders']].forEach(function (p) {
    var v = String(q[p[0]] || '').trim();
    if (v) f[p[1]] = v;
  });
  // ---- Category ----
  // Excel me ek hi aadmi ki kai row hoti hai (Yogi: 'MLA' aur 'Top Leaders' dono).
  // 'Category' me sirf EK label aata hai (Level cards ke liye), aur usme
  // 'Top Leaders' sabse kam priority par hai -- isliye Yogi/Modi "Top Leaders"
  // filter me kabhi nahi aate the.
  // 'Categories' array me uske SAARE label hote hain. Dono me se kahin bhi
  // mil jaaye to row aani chahiye.
  var cv = String(q.category || '').trim();
  if (cv) f.$or = [{ 'Category': cv }, { 'Categories': cv }];
  var kw = String(q.q || '').trim();
  if (kw) f['Tweet Text'] = { $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  return f;
}

app.get('/admin/ping', function (req, res) {      // diagnosis: kuch bhi bhaari nahi
  res.set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', 'no-store')
     .send('PONG  ' + new Date().toLocaleString('en-IN')
       + '\nrole: ' + (roleOf(req) || 'no login')
       + '\nreports mile: ' + _rep.list.length
       + '\nmapping loaded: ' + (_adOpt ? _adOpt.states.length + ' states' : 'abhi nahi'));
});
app.get('/admin', adminGuard, async function (req, res) {
  try {
    var o = await adminOptions(req.query.fresh === '1');
    var reqs = await pendingRequests();
    var users = await allUsers();
    /* map-badge : kitne handle mapping ka intezaar kar rahe hain.
       Sirf ginti -- halki query hai (pending_handles chhoti collection hai).
       Mongo gir jaaye to badge 0, page phir bhi khulta hai. */
    var trkPend = 0;
    try {
      var _pc = await trkDb();
      trkPend = await _pc.db.collection(TRK.COLL_PENDHAND).countDocuments({});
    } catch (e) { trkPend = 0; }
    /* hreq-admin : kitni request faisle ka intezaar kar rahi hain */
    var hreqPend = 0;
    try {
      var _hc = await hreqDb();
      hreqPend = await _hc.db.collection(HREQ_COLL).countDocuments({ status: 'pending' });
    } catch (e) { hreqPend = 0; }
    var mc = MAIL.config();
    var nu = String(req.query.newuser || '').split('|');
    var mailSt = String(req.query.mail || '');
    var sel = function (arr, name, lbl) {
      return '<div class="ad-col"><label>' + lbl + '</label><select name="' + name + '">'
        + '<option value="">All</option>'
        + arr.map(function (v) { return '<option>' + LP.esc(v) + '</option>'; }).join('') + '</select></div>';
    };

    // ---------- kaunsa tab khule ----------
    var tab = 'data';          /* tab-merge */
    if (req.query.tab === 'activity' || req.query.lgfrom || req.query.lgto
        || req.query.lgemail || req.query.lgstatus) tab = 'activity';
    else if (req.query.newuser || req.query.rolesaved || req.query.made || req.query.toggled || req.query.pwset) tab = 'users';
    else if (req.query.done === 'report') tab = 'data';
    else if (req.query.mailtest) tab = 'email';
    else if (reqs.length) tab = 'requests';
    /* trk-tabs2 tabq : ?tab=<koi bhi NAV id> seedha kaam kare -- warna
       Live Scrape Log / Tweet Database ka direct link khulta hi nahi tha. */
    if (NAV.some(function (n) { return n.id === String(req.query.tab || ''); }))
      tab = String(req.query.tab);

    // ---------- banners ----------
    var top = '';
    if (req.query.err) top += '<div class="ad-err">' + LP.esc(String(req.query.err).slice(0, 300)) + '</div>';
    if (req.query.rolesaved) top += '<div class="ad-ok">Access level updated for <b>' + LP.esc(String(req.query.rolesaved)) + '</b>.</div>';
    if (req.query.pwset) top += '<div class="ad-ok">Password changed for <b>' + LP.esc(String(req.query.pwset))
      + '</b>. The old password and any old set-password link have stopped working.</div>';
    var tg = String(req.query.toggled || '').split('|');
    if (tg.length === 2) top += (tg[1] === 'on'
      ? '<div class="ad-ok"><b>' + LP.esc(tg[0]) + '</b> is active \u2014 they can sign in now.</div>'
      : '<div class="ad-err"><b>' + LP.esc(tg[0]) + '</b> has been deactivated \u2014 they can no longer sign in. '
        + 'The account and its password are kept as they are; switch it back on whenever you want.</div>');
    if (!o.ok) top += '<div class="ad-err">Could not read the mapping file — some dropdowns may be empty.</div>';
    if (mailSt) top += (mailSt === 'sent'
      ? '<div class="ad-ok"><b>Email sent.</b> The login details have gone to the user.</div>'
      : '<div class="ad-err"><b>Email could not be sent:</b> ' + LP.esc(mailSt.replace(/^fail:/, ''))
        + '<br>Send the details below yourself. Gmail needs an App Password.</div>');

    // ================= 1. DATA EXPORT =================
    var sExport = '<div class="sec' + (tab === 'data' ? ' on' : '')
      + '" data-sec="data" id="sec-export">'
      + '<div class="pg-h">Data Export</div>'
      + '<div class="pg-s">Export raw data from the master database as CSV, by date range.</div>'
      + top
      + '<div class="ad-card"><h2>Export builder</h2>'
      + '<p class="ad-h">The database holds <b>' + o.total.toLocaleString('en-IN') + '</b> tweets. '
      + '<a href="/admin?fresh=1#export" style="color:#C0430D">refresh this count</a></p>'
      + '<form method="get" action="/admin/download">'
      + '<div class="ad-row">'
      + '<div class="ad-col"><label>From date</label><input type="date" name="from" value="' + o.min + '" required></div>'
      + '<div class="ad-col"><label>To date</label><input type="date" name="to" value="' + o.max + '" required></div></div>'
      + '<div class="ad-row">' + sel(o.states, 'state', 'State') + sel(o.parties, 'party', 'Party') + '</div>'
      + '<div class="ad-row">' + sel(o.cats, 'category', 'Category')
      + '<div class="ad-col"><label>Handle</label><input name="handle" placeholder="RahulGandhi"></div></div>'
      + '<div class="ad-row">'
      + ((o.folders && o.folders.length)
          ? sel(o.folders, 'folder', 'Source folder (scrape folder)')
          : '<div class="ad-col"><label>Source folder (scrape folder)</label>'
            + '<input name="folder" placeholder="run backfill_source_folder.py first"></div>')
      + '<div class="ad-col"><label>Keyword in tweet text</label>'
      + '<input name="q" placeholder="paper leak"></div></div>'
      + '<button class="ad-btn g" formaction="/admin/download">&#x2B07;&nbsp; Download CSV</button>'
      + '<button class="ad-btn" style="margin-left:10px" formaction="/admin/hashtags">'
      + '&#x0023;&nbsp; Hashtag summary</button>'
      + '<button class="ad-btn" style="margin-left:10px" formaction="/admin/hashtag-detail">'
      + '&#x0023;&nbsp; Hashtag detail</button>'
      + '<button class="ad-btn" style="margin-left:10px" formaction="/admin/count">'
      + 'Row count</button>'
      + '</form>'
      + '<div class="ad-note"><b>Limit:</b> ' + ROW_CAP.toLocaleString('en-IN') + ' rows per file. '
      + 'The CSV is UTF-8 with a BOM, so Excel shows non-English text correctly and keeps the '
      + 'columns intact. Excel itself stops at 10,48,576 rows.</div>'
      + '<div class="ad-note"><b>Hashtag summary:</b> same filters, but <i>one row per handle per day</i> \u2014 '
      + 'how many tweets that day in total (Tweets all), how many of them carried a hashtag, how many '
      + 'DISTINCT hashtags, and which ones. <b>Only days that actually had a hashtag appear</b> \u2014 '
      + 'days with zero are left out of the file.<br>'
      + '<b>Hashtag detail:</b> one row per hashtag tweet, with its full Tweet Text and Tweet URL, so you '
      + 'can verify every row yourself. <b>Download CSV</b> still gives the plain raw data.<br>'
      + '<b>Note:</b> <i>Category</i> is the label on the handle (from the mapping), not the scrape folder. '
      + 'So if a handle in \u201cTop Leaders\u201d was scraped from some other folder, its tweets still show up here. '
      + 'For example Yogi Adityanath has Category <b>MLA</b> and Modi/Rahul have <b>LS_MP</b> \u2014 they will not '
      + 'appear under a \u201cTop Leaders\u201d filter even if the scrape came from the \u201cAll India Top Leaders\u201d folder.<br>'
      + '<b>Want it by folder?</b> use the <i>Source folder</i> dropdown above \u2014 that filters on the real scrape '
      + 'folder. On older tweets it only fills in once you have run <code>backfill_source_folder.py --apply</code>.</div></div>'
      + '<div class="ad-card"><h2>Columns in the file</h2>'
      + '<p class="ad-h">' + RAW_COLS.length + ' columns, exactly as in the master database:</p><div>'
      + RAW_COLS.map(function (c) { return '<span class="chip">' + c + '</span>'; }).join('') + '</div></div>'
      + '</div>';

    // ================= 2. SCRAPING REPORT =================
    var dates = reportDates();
    var sReport = '<div class="sec' + (tab === 'data' ? ' on' : '')
      + '" data-sec="data" id="sec-report">'
      + '<div class="pg-h">Scraping Report</div>'
      + '<div class="pg-s">The daily scraping report — with an All India / UP toggle and Save-as-PDF.</div>'
      + top
      + (req.query.done === 'report' ? '<div class="ad-ok">Report generated.</div>' : '')
      + '<div class="ad-card"><h2>Latest report</h2>'
      + '<p class="ad-h">Last generated: <b>' + reportStamp() + '</b></p>'
      + '<a class="ad-btn g" href="/admin/report/view" target="_blank">Open latest report</a>'
      + '<form method="post" action="/admin/report" style="display:inline;margin-left:12px">'
      + '<button class="ad-btn o">Regenerate now</button></form>'
      + '<div class="ad-note">The hourly auto-update regenerates this on its own. Only press the button '
      + 'when you need the very latest data (it takes 1\u20132 minutes).</div></div>'
      + '<div class="ad-card"><h2>Past reports</h2>'
      + (dates.length
        ? '<p class="ad-h">Reports available for ' + dates.length + ' days.</p>'
          + '<form action="/admin/report/view" method="get" target="_blank" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">'
          + '<div style="max-width:240px;flex:1"><label>Choose a date</label><select name="d">'
          + dates.map(function (x) { return '<option value="' + x.d + '">' + _dmy(x.d) + '</option>'; }).join('')
          + '</select></div><button class="ad-btn">Open that day</button></form>'
        : '<div class="ad-note" style="margin-top:0">No past reports yet.</div>')
      + '</div></div>';

    // ================= 3. LOGIN REQUESTS =================
    var roleSel = '<select name="role" style="height:32px;font-size:12px;padding:2px 6px;min-width:130px">'
      + '<option value="all">All India</option><option value="up">Uttar Pradesh</option>'
      + '<option value="punjab">Punjab</option>'
      + '<option value="admin">All dashboards</option></select>';
    var sReq = '<div class="sec' + (tab === 'requests' ? ' on' : '')
      + '" data-sec="requests" id="sec-requests">'
      + '<div class="pg-h">Login Requests</div>'
      + '<div class="pg-s">Access requests that came in from the login page. Pick a role and approve.</div>'
      + top
      + '<div class="ad-card">'
      + (reqs.length
        ? '<table><tr><th>Received</th><th>Name</th><th>Email</th><th>Organisation</th><th>Requested</th><th>Approve with role</th></tr>'
          + reqs.map(function (r) {
              return '<tr><td style="white-space:nowrap">' + new Date(r.at).toLocaleDateString('en-IN') + '</td>'
                + '<td><b>' + LP.esc(r.name) + '</b></td><td>' + LP.esc(r.email) + '</td><td>' + LP.esc(r.org) + '</td>'
                + '<td>' + LP.esc(r.want) + (r.reason ? '<div style="color:#B08D74;font-size:11px">' + LP.esc(r.reason) + '</div>' : '') + '</td>'
                + '<td><form method="post" action="/admin/request-approve" style="display:flex;gap:6px;align-items:center;margin:0">'
                + '<input type="hidden" name="id" value="' + r._id + '">' + roleSel
                + '<button class="ad-btn g" style="padding:7px 14px;font-size:12px">Approve</button></form>'
                + '<form method="post" action="/admin/request-done" style="margin:5px 0 0">'
                + '<input type="hidden" name="id" value="' + r._id + '">'
                + '<button style="background:none;border:none;color:#A83224;font-size:11px;cursor:pointer;padding:0;text-decoration:underline">reject</button>'
                + '</form></td></tr>';
            }).join('') + '</table>'
        : '<h2>No pending requests</h2><p class="ad-h" style="margin:0">New requests show up here, and the sidebar gets a count.</p>')
      + '</div></div>';

    // ================= 4. ACTIVE LOGINS =================
    var credBox = (nu.length >= 2 && nu[0]) ? '<div class="ad-card" style="border:2px solid #1B6B45">'
      + '<h2>' + (nu[2] === 'reset' ? 'Reset link sent' : 'Account created') + '</h2>'
      + '<p class="ad-h">This link has been emailed to the user; they set their own password. '
      + 'If the mail does not arrive, send them the link directly &mdash; it is valid for 7 days and works once.</p>'
      + '<table><tr><td style="width:130px;font-weight:600">Login ID</td><td>' + LP.esc(nu[0]) + '</td></tr>'
      + (nu[2] && nu[2] !== 'reset' ? '<tr><td style="font-weight:600">Access</td><td>' + (ROLE_LABEL[nu[2]] || nu[2]) + '</td></tr>' : '')
      + '</table>'
      + '<div class="ad-note" style="border-left-color:#1B6B45;word-break:break-all">'
      + '<b>Set-password link</b><br><span id="_lnk">' + LP.esc(nu[1]) + '</span><br>'
      + '<button class="ad-btn" style="margin-top:9px;padding:6px 14px;font-size:12px" '
      + 'onclick="navigator.clipboard.writeText(document.getElementById(\'_lnk\').textContent);'
      + 'this.textContent=\'Copied\'">Copy link</button></div></div>' : '';
    var made = String(req.query.made || '').split('|');
    var madeBox = (made.length >= 2 && made[0]) ? '<div class="ad-card" style="border:2px solid #1B6B45">'
      + '<h2>Account created</h2>'
      + '<table><tr><td style="width:130px;font-weight:600">Login ID</td><td>' + LP.esc(made[0]) + '</td></tr>'
      + '<tr><td style="font-weight:600">Password</td><td style="font-family:monospace;font-size:16px;'
      + 'color:#1B6B45;font-weight:700">' + LP.esc(made[1]) + '</td></tr>'
      + '<tr><td style="font-weight:600">Access</td><td>' + (ROLE_LABEL[made[2]] || made[2]) + '</td></tr></table>'
      + '<div class="ad-note">Send these details to the user — they can sign in with this password straight away.</div></div>' : '';

    var createCard = '<div class="ad-card"><h2>Create an account</h2>'
      + '<p class="ad-h">Create an account without waiting for a request. Leave the password blank and one is generated.</p>'
      + '<form method="post" action="/admin/user-create">'
      + '<div class="ad-row">'
      + '<div class="ad-col"><label>Email (login ID)</label><input name="email" type="email" placeholder="name@company.com" required></div>'
      + '<div class="ad-col"><label>Name</label><input name="name" placeholder="Ravi Sharma"></div></div>'
      + '<div class="ad-row">'
      + '<div class="ad-col"><label>Organisation</label><input name="org" placeholder="ABC Media"></div>'
      + '<div class="ad-col"><label>Access level</label><select name="role">'
      + ['all', 'up', 'punjab', 'admin'].map(function (rv) { return '<option value="' + rv + '">' + ROLE_LABEL[rv] + '</option>'; }).join('')
      + '</select></div></div>'
      + '<div class="ad-row"><div class="ad-col"><label>Password (blank = auto-generate)</label>'
      + '<input name="pw" placeholder="set one, or leave blank"></div>'
      + '<div class="ad-col"><label>Send an email?</label>'
      + '<label style="text-transform:none;font-weight:400;font-size:12.5px;color:#9A7A63;display:flex;'
      + 'align-items:center;gap:7px;height:38px;cursor:pointer">'
      + '<input type="checkbox" name="sendmail" value="1" style="width:auto;margin:0"> '
      + 'also email the set-password link</label></div></div>'
      + '<button class="ad-btn g">Create account</button></form></div>';

    var sUsers = '<div class="sec' + (tab === 'users' ? ' on' : '') + '" id="sec-users">'
      + '<div class="pg-h">Active Logins</div>'
      + '<div class="pg-s">Accounts created from this panel. The 4 base accounts live in the code and do not appear here.</div>'
      /* build stamp -- shak mit jaaye ki naya server chal raha hai ya purana.
         server.js badalne par page apne aap naya nahi hota; START_LIVE.bat
         dobara chalana padta hai. */
      + '<div class="pg-s" style="font-size:11px;color:#B08D74">Server build: '
      + LP.esc(BUILD) + '</div>'
      + top + credBox + madeBox + createCard
      + '<div class="ad-card"><h2>' + users.length + ' account' + (users.length === 1 ? '' : 's') + '</h2>'
      + (users.length
        ? '<table><tr><th>Login ID</th><th>Name</th><th>Password</th>'
          + '<th>Access <span style="font-weight:400;color:#B08D74">(tick = Admin Panel)</span></th>'
          + '<th>Created</th><th></th></tr>'
          + users.map(function (u) {
              /* audit-fix T3 (A9): yahan password SAADE TEXT me dikhta tha
                 (click karne par khul jaata). Ab password Mongo me bhi
                 hash me hai, isliye dikhane ko kuch hai hi nahi -- aur
                 dikhana chahiye bhi nahi. Naya password set karne wala
                 form neeche waise hi hai. */
              var pwCell = (u.pw
                ? '<span style="font-family:monospace;color:#1B6B45;font-size:11px"'
                  + ' title="The password is stored hashed and cannot be read back.'
                  + ' If it is forgotten, set a new one below.">set</span>'
                : '<span style="color:#C2410C;font-size:11px">not set</span>')
                + '<form method="post" action="/admin/user-password" style="display:flex;gap:4px;margin-top:5px">'
                + '<input type="hidden" name="email" value="' + LP.esc(u.email) + '">'
                + '<input name="pw" placeholder="new password" style="height:26px;font-size:11px;padding:2px 6px;width:118px">'
                + '<button style="background:#7A2A06;color:#fff;border:none;border-radius:5px;padding:3px 8px;'
                + 'font-size:10.5px;cursor:pointer">set</button></form>';
              var dim = (u.active === false) ? 'opacity:.55;' : '';
              return '<tr style="' + dim + '"><td><b>' + LP.esc(u.email) + '</b><div style="font-size:10.5px;color:#B08D74">'
                + LP.esc(u.org || '') + '</div></td><td>' + LP.esc(u.name || '') + '</td>'
                + '<td>' + pwCell + '</td>'
                + '<td><form method="post" action="/admin/user-role" style="display:flex;gap:5px;align-items:center;margin:0">'
                + '<input type="hidden" name="email" value="' + LP.esc(u.email) + '">'
                + '<select name="role" style="height:28px;font-size:11.5px;padding:1px 5px;width:auto;min-width:110px">'
                + ['all', 'up', 'punjab', 'admin'].map(function (rv) {
                    return '<option value="' + rv + '"' + (u.role === rv ? ' selected' : '') + '>' + ROLE_LABEL[rv] + '</option>';
                  }).join('')
                + '</select>'
                /* tick: is login ko Admin Panel ka hak dena hai ya nahi.
                   Tick lagakar "save" dabao -- us user ke profile menu me
                   "Admin Panel" aa jaayega aur wo seedha switch kar lega. */
                + '<label title="Is login ko Admin Panel ka hak do"'
                + ' style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;'
                + 'color:#7A2A06;font-weight:700;white-space:nowrap;cursor:pointer">'
                + '<input type="checkbox" name="adminPanel" value="1"'
                + (u.adminPanel ? ' checked' : '')
                + ' style="width:auto;margin:0;accent-color:#EA580C"> Admin panel</label>'
                + '<button style="background:#EA580C;color:#fff;border:none;border-radius:6px;'
                + 'padding:5px 9px;font-size:10.5px;cursor:pointer">save</button></form></td>'
                + '<td style="white-space:nowrap">' + (u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '')
                + (u.active === false
                    ? '<div style="font-size:10px;color:#A83224;font-weight:700">DEACTIVATED</div>'
                    : (u.pw ? '<div style="font-size:10px;color:#1B6B45">active</div>'
                            : '<div style="font-size:10px;color:#C2410C;font-weight:600">no password set</div>')) + '</td>'
                + '<td style="white-space:nowrap">'
                + '<form method="post" action="/admin/user-action" style="display:inline">'
                + '<input type="hidden" name="email" value="' + LP.esc(u.email) + '">'
                + '<input type="hidden" name="act" value="' + (u.active === false ? 'on' : 'off') + '">'
                + '<button style="background:' + (u.active === false ? '#1B6B45' : '#9A7A63') + ';color:#fff;border:none;'
                + 'border-radius:6px;padding:4px 10px;font-size:10.5px;cursor:pointer;font-weight:600">'
                + (u.active === false ? 'activate' : 'deactivate') + '</button></form>'
                + ' &nbsp;<form method="post" action="/admin/user-action" style="display:inline">'
                + '<input type="hidden" name="email" value="' + LP.esc(u.email) + '"><input type="hidden" name="act" value="reset">'
                + '<button style="background:none;border:none;color:#C0430D;font-size:11px;cursor:pointer;text-decoration:underline">resend link</button></form>'
                + ' &nbsp;<form method="post" action="/admin/user-action" style="display:inline" onsubmit="return confirm(\'Remove this login?\')">'
                + '<input type="hidden" name="email" value="' + LP.esc(u.email) + '"><input type="hidden" name="act" value="remove">'
                + '<button style="background:none;border:none;color:#A83224;font-size:11px;cursor:pointer;text-decoration:underline">remove</button></form>'
                + '</td></tr>';
            }).join('') + '</table>'
        : '<p class="ad-h" style="margin:0">No logins have been created yet.</p>')
      + '</div></div>';

    // ================= 5. LOGIN ACTIVITY =================
    var lg = await loginLogRows(req.query, 300);
    var qs = function (k) { return LP.esc(String(req.query[k] || '')); };
    var lgOk = lg.rows.filter(function (r) { return r.status === 'ok'; }).length;
    var lgBad = lg.rows.filter(function (r) {
      return ['bad-password', 'no-account', 'not-activated', 'deactivated'].indexOf(r.status) >= 0; }).length;
    var dlq = ['lgfrom', 'lgto', 'lgemail', 'lgstatus'].filter(function (k) { return req.query[k]; })
      .map(function (k) { return k + '=' + encodeURIComponent(req.query[k]); }).join('&');

    var sLog = '<div class="sec' + (tab === 'activity' ? ' on' : '') + '" id="sec-activity">'
      + '<div class="pg-h">Login Activity</div>'
      + '<div class="pg-s">Who signed in, with which login ID, when and from where — the full record. '
      + 'Failed password attempts show up here too.</div>'
      + top
      + (lg.ok ? '' : '<div class="ad-err">Could not read the log: ' + LP.esc(lg.err || '') + '</div>')
      + '<div class="ad-card"><h2>Filter</h2>'
      + '<form method="get" action="/admin"><input type="hidden" name="tab" value="activity">'
      + '<div class="ad-row">'
      + '<div class="ad-col"><label>From date</label><input type="date" name="lgfrom" value="' + qs('lgfrom') + '"></div>'
      + '<div class="ad-col"><label>To date</label><input type="date" name="lgto" value="' + qs('lgto') + '"></div>'
      + '<div class="ad-col"><label>Login ID</label><select name="lgemail"><option value="">All</option>'
      + lg.emails.map(function (e2) {
          return '<option' + (String(req.query.lgemail || '') === e2 ? ' selected' : '') + '>' + LP.esc(e2) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="ad-col"><label>Result</label><select name="lgstatus">'
      + [['', 'All'], ['ok', 'Successful logins'], ['fail', 'Failed attempts'], ['logout', 'Sign-outs']]
          .map(function (p) {
            return '<option value="' + p[0] + '"' + (String(req.query.lgstatus || '') === p[0] ? ' selected' : '')
              + '>' + p[1] + '</option>'; }).join('')
      + '</select></div>'
      + '</div>'
      + '<button class="ad-btn">Apply filter</button> &nbsp;'
      + '<a class="ad-btn" style="background:#7A2A06;text-decoration:none;display:inline-block" '
      + 'href="/admin/login-log.csv' + (dlq ? '?' + dlq : '') + '">Download CSV</a> &nbsp;'
      + '<a href="/admin#activity" style="color:#C0430D;font-size:12px">clear</a>'
      + '</form></div>'
      + '<div class="ad-card"><h2>' + lg.rows.length + ' record' + (lg.rows.length === 1 ? '' : 's')
      + ' <span style="font-weight:400;font-size:12px;color:#8B6B55">&nbsp;' + lgOk + ' successful · '
      + lgBad + ' failed</span></h2>'
      + (lg.rows.length
        ? '<table><tr><th>When</th><th>Login ID</th><th>Result</th><th>Access</th><th>IP address</th><th>Device / browser</th></tr>'
          + lg.rows.map(function (r) {
              var c = STATUS_CHIP[r.status] || ['#7A6A5E', '#EFEAE4', String(r.status || '').toUpperCase()];
              return '<tr><td style="white-space:nowrap">' + LP.esc(fmtWhen(r.at)) + '</td>'
                + '<td><b>' + LP.esc(r.email || '—') + '</b>'
                + (r.note ? '<div style="font-size:10.5px;color:#B08D74">' + LP.esc(r.note) + '</div>' : '') + '</td>'
                + '<td><span style="background:' + c[1] + ';color:' + c[0] + ';font-size:10px;font-weight:700;'
                + 'padding:3px 7px;border-radius:20px;white-space:nowrap">' + c[2] + '</span></td>'
                + '<td style="font-size:11.5px">' + LP.esc(ROLE_LABEL[r.role] || r.role || '—') + '</td>'
                + '<td style="font-family:monospace;font-size:11px">' + LP.esc(r.ip || '—')
                + (r.ipChain ? '<div style="font-size:9px;color:#B08D74;font-family:inherit;'
                    + 'max-width:230px;word-break:break-all;margin-top:2px">'
                    + LP.esc(String(r.ipChain).slice(0, 120)) + '</div>' : '')
                + '</td>'
                + '<td style="font-size:11.5px">' + LP.esc(r.device || '—') + '</td></tr>';
            }).join('') + '</table>'
          + (lg.rows.length >= 300
              ? '<div class="ad-note">Showing the latest 300 only — use the date filter, or download the CSV, '
                + 'to go further back.</div>' : '')
        : '<p class="ad-h" style="margin:0">No records match this filter.</p>')
      + '</div></div>';

    // ================= 6. EMAIL =================
    var sMail = '<div class="sec' + (tab === 'email' ? ' on' : '') + '" id="sec-email">'
      + '<div class="pg-h">Email Settings</div>'
      + '<div class="pg-s">As soon as you approve a request, the login details go out from this address.</div>'
      + top
      + (req.query.mailtest ? '<div class="ad-ok">' + LP.esc(String(req.query.mailtest)) + '</div>' : '')
      + '<div class="ad-card"><h2>Sender</h2>'
      + '<p class="ad-h">Currently sending from <b>' + LP.esc((mc && mc.user) || 'not configured') + '</b>'
      + (mc && mc.url ? '<br>Login link in email: <b>' + LP.esc(mc.url) + '</b>' : '') + '</p>'
      + '<form method="post" action="/admin/test-mail" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">'
      + '<div style="max-width:290px;flex:1"><label>Send a test to</label><input name="to" placeholder="you@company.com"></div>'
      + '<button class="ad-btn">Send test email</button></form>'
      + '<div class="ad-note">Gmail will not accept a normal password — it needs an <b>App Password</b>. '
      + 'The settings live in <code>mail_config.json</code>. If the ngrok link changes, update <code>url</code> there too.</div></div></div>';

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate').set('Pragma', 'no-cache')
       .set('Expires', '0').set('Content-Type', 'text/html; charset=utf-8')
       .send(adminPage('Panel', TRKUI.section(tab) + sExport + sReport + sReq + HREQUI.section(tab) + sUsers + sLog + sMail, req.role,
         { tab: tab, badges: { users: users.length || 0,
                               trkmap: trkPend || 0,
                               /* tab-merge : ek hi tab, isliye dono ki ginti jod kar */
                               requests: (reqs.length || 0) + (hreqPend || 0) } }));
  } catch (e) {
    res.status(500).set('Cache-Control', 'no-store').set('Content-Type', 'text/html; charset=utf-8')
      .send(adminPage('Error', '<div class="pg-h">Something went wrong</div><div class="ad-card">'
        + '<div class="ad-err">' + LP.esc(e.message) + '</div></div>', req.role, {}));
  }
});

async function pendingRequests() {
  var cli = MP.client();
  try {
    await cli.connect();
    return await cli.db(REQ_DB).collection(REQ_COLL)
      .find({ status: 'pending' }).sort({ at: -1 }).limit(40).toArray();
  } catch (e) { console.log('  [ADMIN] requests skip: ' + e.message); return []; }
  finally { try { await cli.close(); } catch (e2) {} }
}
// ---------- Login activity -> CSV ----------
app.get('/admin/login-log.csv', adminGuard, async function (req, res) {
  var lg = await loginLogRows(req.query, 50000);
  var q = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
  var out = '﻿' + ['Date & Time', 'Login ID', 'Result', 'Access Level', 'IP Address', 'Device / Browser', 'Note']
    .map(q).join(',') + '\r\n';
  lg.rows.forEach(function (r) {
    var c = STATUS_CHIP[r.status] || ['', '', String(r.status || '')];
    out += [fmtWhen(r.at), r.email, c[2], ROLE_LABEL[r.role] || r.role || '', r.ip, r.device, r.note]
      .map(q).join(',') + '\r\n';
  });
  res.set('Content-Type', 'text/csv; charset=utf-8')
     .set('Content-Disposition', 'attachment; filename="login_activity_'
        + new Date().toISOString().slice(0, 10) + '.csv"')
     .set('Cache-Control', 'no-store')
     .send(out);
});

app.post('/admin/request-done', adminGuard, async function (req, res) {
  var cli = MP.client();
  try {
    var ObjectId = require('mongodb').ObjectId;
    await cli.connect();
    await cli.db(REQ_DB).collection(REQ_COLL)
      .updateOne({ _id: new ObjectId(String(req.body.id)) },
                 { $set: { status: 'done', doneAt: new Date() } });
  } catch (e) { console.log('  [ADMIN] request-done fail: ' + e.message); }
  finally { try { await cli.close(); } catch (e2) {} }
  res.redirect('/admin');
});

// ---- request approve / reject ----
app.post('/admin/request-approve', adminGuard, async function (req, res) {
  var id = String(req.body.id || ''), role = String(req.body.role || 'all');
  if (['all', 'up', 'punjab', 'admin'].indexOf(role) < 0) role = 'all';
  var cli = MP.client();
  try {
    var ObjectId = require('mongodb').ObjectId;
    await cli.connect();
    var db = cli.db(REQ_DB);
    var r = await db.collection(REQ_COLL).findOne({ _id: new ObjectId(id) });
    if (!r) return res.redirect('/admin?err=' + encodeURIComponent('Request not found'));
    var email = String(r.email).toLowerCase();
    if (USERS[email]) return res.redirect('/admin?err=' + encodeURIComponent(email + ' is already a base account'));
    await cli.db(USER_DB).collection(USER_COLL).updateOne({ email: email },
      { $set: { email: email, name: r.name, org: r.org, role: role, pw: '', active: true,
                createdAt: new Date(), fromRequest: r._id } }, { upsert: true });
    await db.collection(REQ_COLL).updateOne({ _id: r._id },
      { $set: { status: 'approved', role: role, doneAt: new Date() } });
    await loadUsers(true);
    console.log('[USERS] approved ' + email + ' as ' + role);
    var mailNote = '', link = '';
    try {
      link = await issueSetLink(cli, email, r.name, role, false);
      mailNote = 'sent';
      console.log('[MAIL] invite -> ' + email);
    } catch (me) {
      mailNote = 'fail:' + me.message;
      console.log('[MAIL] invite fail (' + email + '): ' + me.message);
      try { link = baseUrl() + '/set-password?t=' + (await cli.db(USER_DB).collection(USER_COLL)
              .findOne({ email: email })).setToken; } catch (e3) {}
    }
    return res.redirect('/admin?newuser=' + encodeURIComponent(email + '|' + link + '|' + role)
      + '&mail=' + encodeURIComponent(mailNote));
  } catch (e) {
    console.log('  [ADMIN] approve fail: ' + e.message);
    return res.redirect('/admin?err=' + encodeURIComponent(e.message));
  } finally { try { await cli.close(); } catch (e2) {} }
});

app.post('/admin/user-create', adminGuard, async function (req, res) {
  var email = String(req.body.email || '').trim().toLowerCase();
  var name  = String(req.body.name || '').trim().slice(0, 80);
  var org   = String(req.body.org  || '').trim().slice(0, 100);
  var role  = String(req.body.role || 'all');
  var pw    = String(req.body.pw   || '').trim();
  var mail  = req.body.sendmail === '1';
  if (!/\S+@\S+\.\S+/.test(email)) return res.redirect('/admin?err=' + encodeURIComponent('Enter a valid email address'));
  if (['all', 'up', 'punjab', 'admin'].indexOf(role) < 0) role = 'all';
  if (USERS[email]) return res.redirect('/admin?err=' + encodeURIComponent(email + ' is a base account and cannot be created again'));
  if (pw && pw.length < 6) return res.redirect('/admin?err=' + encodeURIComponent('Password kam se kam 6 character ka rakho'));
  if (!pw) pw = newPassword();                       // khaali chhoda -> khud bana do
  var cli = MP.client();
  try {
    await cli.connect();
    var c = cli.db(USER_DB).collection(USER_COLL);
    if (await c.findOne({ email: email }))
      return res.redirect('/admin?err=' + encodeURIComponent(email + ' pehle se maujood hai'));
    await c.insertOne({ email: email, name: name || email, org: org, role: role,
      pw: pw ? AUTH.hashPw(pw) : '',                                 /* audit-fix T3 */
                        active: true, createdAt: new Date(), madeBy: 'admin' });
    await loadUsers(true);
    console.log('[USERS] admin ne banaya ' + email + ' as ' + role);
    var note = '';
    if (mail) {
      try { await issueSetLink(cli, email, name || email, role, false); note = '&mail=sent'; }
      catch (me) { note = '&mail=' + encodeURIComponent('fail:' + me.message); }
    }
    return res.redirect('/admin?made=' + encodeURIComponent(email + '|' + pw + '|' + role) + note);
  } catch (e) {
    console.log('[USERS] create fail: ' + e.message);
    return res.redirect('/admin?err=' + encodeURIComponent(e.message));
  } finally { try { await cli.close(); } catch (e2) {} }
});

app.post('/admin/user-password', adminGuard, async function (req, res) {
  var email = String(req.body.email || '').toLowerCase();
  var pw = String(req.body.pw || '').trim();
  if (pw.length < 6) return res.redirect('/admin?err=' + encodeURIComponent('Password kam se kam 6 character ka rakho'));
  if (USERS[email]) return res.redirect('/admin?err=' + encodeURIComponent('A base account password cannot be changed from here'));
  var cli = MP.client();
  try {
    await cli.connect();
    // purana set-password link bhi mar jaaye
    await cli.db(USER_DB).collection(USER_COLL).updateOne({ email: email },
      { $set: { pw: AUTH.hashPw(pw), pwChangedAt: new Date(),       /* audit-fix T3 */
                setToken: '', setTokenExp: 0 } });
    await loadUsers(true);
    console.log('[USERS] admin ne password badla: ' + email);
  } catch (e) {
    console.log('[USERS] password change fail: ' + e.message);
    return res.redirect('/admin?err=' + encodeURIComponent(e.message));
  } finally { try { await cli.close(); } catch (e2) {} }
  res.redirect('/admin?pwset=' + encodeURIComponent(email));
});

app.post('/admin/user-role', adminGuard, async function (req, res) {
  var email = String(req.body.email || '').toLowerCase();
  var role = String(req.body.role || '');
  if (['all', 'up', 'punjab', 'admin'].indexOf(role) < 0) return res.redirect('/admin#users');
  var cli = MP.client();
  try {
    await cli.connect();
    var adm = !!req.body.adminPanel;
    await cli.db(USER_DB).collection(USER_COLL).updateOne({ email: email },
      { $set: { role: role, adminPanel: adm } });
    await loadUsers(true);
    console.log('[USERS] role changed ' + email + ' -> ' + role
      + (adm ? '  + Admin Panel' : '  (Admin Panel nahi)'));
  } catch (e) { console.log('[USERS] role change fail: ' + e.message); }
  finally { try { await cli.close(); } catch (e2) {} }
  res.redirect('/admin?rolesaved=' + encodeURIComponent(email));
});

app.post('/admin/user-action', adminGuard, async function (req, res) {
  var email = String(req.body.email || '').toLowerCase(), act = String(req.body.act || '');
  var cli = MP.client();
  try {
    await cli.connect();
    var c = cli.db(USER_DB).collection(USER_COLL);
    if (act === 'remove') { await c.deleteOne({ email: email }); console.log('[USERS] removed ' + email); }
    else if (act === 'off' || act === 'on') {
      var on = (act === 'on');
      await c.updateOne({ email: email }, { $set: { active: on, activeAt: new Date() } });
      await loadUsers(true);
      console.log('[USERS] ' + email + ' -> ' + (on ? 'ACTIVE' : 'DEACTIVATED'));
      return res.redirect('/admin?toggled=' + encodeURIComponent(email + '|' + (on ? 'on' : 'off')));
    }
    else if (act === 'reset') {
      var u0 = await c.findOne({ email: email });
      if (!u0) return res.redirect('/admin?err=' + encodeURIComponent('User not found'));
      var mn = '', link2 = '';
      try {
        link2 = await issueSetLink(cli, email, u0.name, u0.role, !!u0.pw);
        mn = 'sent';
      } catch (me2) {
        mn = 'fail:' + me2.message;
        try { link2 = baseUrl() + '/set-password?t=' + (await c.findOne({ email: email })).setToken; } catch (e4) {}
      }
      return res.redirect('/admin?newuser=' + encodeURIComponent(email + '|' + link2 + '|reset')
        + '&mail=' + encodeURIComponent(mn));
    }
    await loadUsers(true);
  } catch (e) { console.log('  [ADMIN] user-action fail: ' + e.message); }
  finally { try { await cli.close(); } catch (e2) {} }
  res.redirect('/admin');
});

async function allUsers() {
  var cli = MP.client();
  try {
    await cli.connect();
    return await cli.db(USER_DB).collection(USER_COLL).find({})
      .sort({ active: -1, createdAt: -1 }).limit(80).toArray();
  } catch (e) { return []; }
  finally { try { await cli.close(); } catch (e2) {} }
}

app.post('/admin/test-mail', adminGuard, async function (req, res) {
  var to = String(req.body.to || '').trim();
  if (!/\S+@\S+\.\S+/.test(to)) return res.redirect('/admin?err=' + encodeURIComponent('Enter a valid email address'));
  try {
    await MAIL.sendMail(to, 'India Political Pulse - delivery test',
      '<div style="background:#f4f6fa;padding:26px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">'
      + '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e8f0;border-radius:10px;overflow:hidden">'
      + '<div style="background:#12305c;padding:18px 24px"><div style="font-size:11px;letter-spacing:2.5px;color:#a9bcd8">INDIA POLITICAL PULSE</div>'
      + '<div style="font-size:17px;color:#fff;font-weight:600;margin-top:4px">Delivery test</div></div>'
      + '<div style="padding:24px;font-size:14px;color:#3d4a5c;line-height:1.65">'
      + '<p style="margin:0 0 12px">This is a test message from the India Political Pulse platform.</p>'
      + '<p style="margin:0">If you have received it, account approval emails will be delivered correctly.</p>'
      + '<p style="margin:18px 0 0;color:#16324f">Regards,<br><b>Data Team</b></p>'
      + '</div></div></div>',
      'This is a test message from the India Political Pulse platform.\r\n'
      + 'If you have received it, account approval emails will be delivered correctly.\r\n\r\n'
      + 'Regards,\r\nData Team');
    res.redirect('/admin?mailtest=' + encodeURIComponent('Test mail bhej di -> ' + to));
  } catch (e) {
    res.redirect('/admin?err=' + encodeURIComponent('Mail fail: ' + e.message));
  }
});

app.get('/admin/count', adminGuard, async function (req, res) {
  var cli = MP.client();
  try {
    await cli.connect();
    var n = await cli.db(MASTER_DB).collection(MASTER_COLL).countDocuments(adminQuery(req.query));
    res.set('Cache-Control', 'no-store').set('Content-Type', 'text/html; charset=utf-8').send(adminPage('Row count',
      '<div class="pg-h">Row count</div><div class="ad-card"><h2>' + n.toLocaleString('en-IN') + ' rows match this filter</h2>'
      + '<p class="ad-h">' + (n > ROW_CAP
        ? 'Over the limit — only the first ' + ROW_CAP.toLocaleString('en-IN') + ' rows will be exported. Narrow the date range.'
        : (n > 1048575 ? 'Over Excel\u2019s 10,48,576 row limit — the CSV itself will be complete, but Excel will not show all of it.'
          : 'Within the limit — you will get the full data.')) + '</p>'
      + '<a class="ad-btn" href="/admin#export">&larr; Back</a></div>', req.role, { tab: 'export' }));
  } catch (e) {
    res.status(500).set('Content-Type', 'text/html; charset=utf-8')
      .send(adminPage('Error', '<div class="pg-h">Error</div><div class="ad-card"><div class="ad-err">'
        + LP.esc(e.message) + '</div><a class="ad-btn" href="/admin">Back</a></div>', req.role, {}));
  } finally { await cli.close(); }
});

var _BADCH = /[\r\n\t\u00a0\u200b]+/g;
function _cell(v) {
  return '"' + String(v === undefined || v === null ? '' : v).replace(_BADCH, ' ').replace(/"/g, '""').trim() + '"';
}
app.get('/admin/download', adminGuard, async function (req, res) {
  var cli = MP.client();
  try {
    await cli.connect();
    var f = adminQuery(req.query);
    var nm = 'PulseData_' + [String(req.query.from || 'start'), 'to', String(req.query.to || 'today'),
      req.query.state, req.query.party, req.query.category, req.query.handle]
      .filter(Boolean).join('_').replace(/[^A-Za-z0-9_\-]/g, '') + '.csv';
    console.log('[ADMIN] ' + new Date().toLocaleString() + '  download  ' + JSON.stringify(f));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nm + '"');
    res.write('\ufeff' + RAW_COLS.map(_cell).join(',') + '\r\n');   // BOM -> Excel me Hindi sahi
    var proj = {}; RAW_COLS.forEach(function (c) { proj[c] = 1; });
    var cur = cli.db(MASTER_DB).collection(MASTER_COLL).find(f, { projection: proj }).limit(ROW_CAP).batchSize(2000);
    var n = 0;
    while (await cur.hasNext()) {
      var d = await cur.next();
      res.write(RAW_COLS.map(function (c) { return _cell(d[c]); }).join(',') + '\r\n');
      n++;
    }
    res.end();
    console.log('[ADMIN]   -> ' + n.toLocaleString('en-IN') + ' rows: ' + nm);
  } catch (e) {
    if (!res.headersSent) res.redirect('/admin?err=' + encodeURIComponent(e.message));
    else res.end();
  } finally { await cli.close(); }
});

/* ================= HASHTAG EXPORT =================
 * Export builder ke wahi filter, do shakl me:
 *   summary  -> ek HANDLE ka ek DIN = ek row   (Tweets | Unique Hashtags | Hashtags)
 *   detail   -> ek hashtag-wala TWEET = ek row (Tweet Text + Tweet URL ke saath)
 *
 * NIYAM: row TABHI aati hai jab us tweet ke TEXT me sach me hashtag mila ho.
 *        Jis din tweet to hue par ek bhi hashtag nahi, wo din file me nahi aata.
 *        Yaani har ginti ke peeche asli tweet text maujood hai -- detail file se
 *        koi bhi row khud verify ki ja sakti hai.
 *
 * Hashtag master me alag column me hai hi nahi -- Tweet Text se nikaalte hain.
 * Regex report_lib wala: JS ka \w Devanagari nahi pakadta, isliye character-class,
 * taaki #पेपरलीक jaise Hindi tag bhi aayein. Link pehle hata dete hain warna
 * "t.co/abc#frag" ek jhootha tag ban jaata hai.
 */
const HT_RE  = /#[^\s#.,!?;:()\[\]"'…]+/g;
const HT_URL = /https?:\/\/\S+/g;
const HT_MAXG = 400000;                 // itne se zyada (handle x din) group -> ruk jao

function htOf(text) {                   // ek tweet ke unique tags (case-insensitive)
  var mm = String(text || '').replace(HT_URL, ' ').match(HT_RE);
  var o = new Map();
  if (mm) for (var i = 0; i < mm.length; i++) {
    var t = mm[i].replace(/[‘’“”]+$/, '');
    if (t.length > 1) { var lo = t.toLowerCase(); if (!o.has(lo)) o.set(lo, t); }
  }
  return o;
}

app.get(['/admin/hashtags', '/admin/hashtag-detail'], adminGuard, async function (req, res) {
  // GET form me action ki query string ud jaati hai, isliye detail ka apna route hai
  var detail = req.path === '/admin/hashtag-detail';
  var cli = MP.client();
  try {
    await cli.connect();
    var f = adminQuery(req.query);
    var nm = (detail ? 'PulseHashtagDetail_' : 'PulseHashtags_')
      + [String(req.query.from || 'start'), 'to', String(req.query.to || 'today'),
         req.query.state, req.query.party, req.query.category, req.query.handle]
        .filter(Boolean).join('_').replace(/[^A-Za-z0-9_\-]/g, '') + '.csv';
    console.log('[ADMIN] ' + new Date().toLocaleString() + '  hashtags'
      + (detail ? '(detail)' : '') + '  ' + JSON.stringify(f));

    var proj = { 'Handle': 1, 'Tweet Date': 1, 'Tweet Text': 1, 'Tweet URL': 1,
                 'Candidate Name': 1, 'Party': 1, 'State': 1, 'Category': 1,
                 'Categories': 1, 'Source Folders': 1, _id: 0 };
    var cur = cli.db(MASTER_DB).collection(MASTER_COLL)
                 .find(f, { projection: proj }).limit(ROW_CAP).batchSize(2000);

    var seen = 0, withTag = 0, skipped = 0, capped = false;

    if (detail) {
      /* ---- ek tweet = ek row (sirf jinme hashtag hai) ---- */
      var DCOLS = ['Handle', 'Candidate Name', 'Party', 'State', 'Category', 'Categories',
                   'Source Folders', 'Date', 'Hashtag Count', 'Hashtags', 'Tweet Text', 'Tweet URL'];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + nm + '"');
      res.write('﻿' + DCOLS.map(_cell).join(',') + '\r\n');
      while (await cur.hasNext()) {
        var d = await cur.next(); seen++;
        var dt = String(d['Tweet Date'] || '').slice(0, 10);
        var h = String(d['Handle'] || '').trim();
        if (!h || dt.length < 10) { skipped++; continue; }
        var tg = htOf(d['Tweet Text']);
        if (!tg.size) continue;                         // hashtag nahi -> row nahi
        withTag++;
        res.write([h, d['Candidate Name'] || '', d['Party'] || '', d['State'] || '',
                   d['Category'] || '', (d['Categories'] || []).join(', '),
                   (d['Source Folders'] || []).join(', '),
                   dt, tg.size, Array.from(tg.values()).join(', '),
                   String(d['Tweet Text'] || '').replace(/\s+/g, ' ').trim(),
                   d['Tweet URL'] || ''].map(_cell).join(',') + '\r\n');
      }
      res.end();
      console.log('[ADMIN]   -> ' + withTag.toLocaleString('en-IN') + ' hashtag-wale tweets / '
        + seen.toLocaleString('en-IN') + ' padhe: ' + nm);
      return;
    }

    /* ---- ek handle ka ek din = ek row ---- */
    var G = new Map();
    while (await cur.hasNext()) {
      var d2 = await cur.next(); seen++;
      var h2 = String(d2['Handle'] || '').trim();
      var dt2 = String(d2['Tweet Date'] || '').slice(0, 10);
      if (!h2 || dt2.length < 10) { skipped++; continue; }
      var k = h2 + '|' + dt2, g = G.get(k);
      if (!g) {
        if (G.size >= HT_MAXG) { capped = true; break; }
        g = { h: h2, d: dt2, nm: d2['Candidate Name'] || '', p: d2['Party'] || '',
              st: d2['State'] || '', c: d2['Category'] || '', sf: new Set(), cl: new Set(),
              tw: 0, twAll: 0, tags: new Map(), txt: [] };
        G.set(k, g);
      }
      // har tweet gino -- taaki "us din kul kitne tweet" bhi dikhe.
      // Warna log 'Tweets with hashtag' ko us din ka poora tweet count samajh lete hain.
      g.twAll++;
      var tg2 = htOf(d2['Tweet Text']);
      if (!tg2.size) continue;                          // hashtag nahi -> aage ka hisaab nahi
      withTag++;
      g.tw++;
      (d2['Source Folders'] || []).forEach(function (x) { g.sf.add(x); });
      (d2['Categories'] || []).forEach(function (x) { g.cl.add(x); });
      tg2.forEach(function (orig, lo) { if (!g.tags.has(lo)) g.tags.set(lo, orig); });
      // us din ke hashtag-wale tweets ka text bhi -- Excel ki cell limit 32,767 hai,
      // isliye 20,000 par rok dete hain
      if (g.txtLen === undefined) g.txtLen = 0;
      if (g.txtLen < 20000) {
        var tx = String(d2['Tweet Text'] || '').replace(/\s+/g, ' ').trim();
        if (tx) { g.txt.push(tx); g.txtLen += tx.length + 4; }
      } else if (!g.cut) { g.cut = true; g.txt.push('\u2026 (more tweets exist)'); }
    }

    // SIRF wahi din jinme sach me hashtag mila
    var rows = Array.from(G.values()).filter(function (g) { return g.tags.size > 0; })
      .sort(function (a, b) {
        var x = a.h.toLowerCase(), y = b.h.toLowerCase();
        return x < y ? -1 : x > y ? 1 : (a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
      });

    var COLS = ['Handle', 'Candidate Name', 'Party', 'State', 'Category', 'Categories',
                'Source Folders', 'Date', 'Tweets (all)', 'Tweets with hashtag',
                'Unique Hashtags', 'Hashtags', 'Tweet Text'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nm + '"');
    res.write('﻿' + COLS.map(_cell).join(',') + '\r\n');
    rows.forEach(function (g) {
      res.write([g.h, g.nm, g.p, g.st, g.c, Array.from(g.cl).join(', '),
                 Array.from(g.sf).join(', '), g.d, g.twAll, g.tw, g.tags.size,
                 Array.from(g.tags.values()).join(', '),
                 g.txt.join('  ||  ')].map(_cell).join(',') + '\r\n');
    });
    if (capped) res.write(_cell('(NOTE: ' + HT_MAXG.toLocaleString('en-IN')
      + ' handle-day groups, so it stopped here. Narrow the date range.)') + '\r\n');
    res.end();
    console.log('[ADMIN]   -> ' + rows.length.toLocaleString('en-IN') + ' rows | '
      + withTag.toLocaleString('en-IN') + ' hashtag-wale tweets / '
      + seen.toLocaleString('en-IN') + ' padhe: ' + nm);
  } catch (e) {
    if (!res.headersSent) res.redirect('/admin?err=' + encodeURIComponent(e.message));
    else res.end();
  } finally { await cli.close(); }
});

// ---- scraping report files ----
// NOTE: ye network folder (\\192.168.2.85\...) par hai. Synchronous fs call yahan
// poore server ko block kar deti hai (share slow ho to page blank aata hai).
// Isliye sab ASYNC hai aur background me cache hota rehta hai.
const REPORT_DIRS = ['\\\\192.168.2.85\\d\\Social Media\\Daily Report', path.join(__dirname, '..')];
var _rep = { at: 0, latest: null, stamp: null, list: [], busy: false };


async function scanReports() {                 // background me chalta hai, kisi request ko rokta nahi
  if (_rep.busy) return _rep;
  _rep.busy = true;
  var seen = {}, list = [], latest = null, stamp = null;
  try {
    for (var i = 0; i < REPORT_DIRS.length; i++) {
      var dir = REPORT_DIRS[i], files = [];
      try { files = await _withTimeout(fsp.readdir(dir), 4000); }
      catch (e) { continue; }                  // share off / folder nahi -> agla dir
      for (var j = 0; j < files.length; j++) {
        var m = /^daily_report_(\d{4}-\d{2}-\d{2})\.html$/.exec(files[j]);
        if (m && !seen[m[1]]) { seen[m[1]] = 1; list.push({ d: m[1], p: path.join(dir, files[j]) }); }
      }
      if (!latest && files.indexOf('daily_report_latest.html') >= 0) {
        latest = path.join(dir, 'daily_report_latest.html');
        try { var st = await _withTimeout(fsp.stat(latest), 4000);
              stamp = new Date(st.mtime).toLocaleString('en-IN'); } catch (e) {}
      }
    }
    list.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    if (!latest && list.length) { latest = list[0].p; stamp = list[0].d; }
    _rep = { at: Date.now(), latest: latest, stamp: stamp, list: list, busy: false };
  } catch (e) {
    console.log('  [ADMIN] report scan fail: ' + e.message);
    _rep.busy = false; _rep.at = Date.now();
  }
  return _rep;
}
scanReports();                                  // start par ek baar
setInterval(scanReports, 3e5);                  // phir har 5 min

function reportStamp() {
  if (!_rep.at) return 'check ho raha hai...';
  return _rep.stamp || 'no report yet — press "Regenerate now"';
}
function reportDates() { return _rep.list; }
function reportByDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return null;   // path traversal band
  var hit = _rep.list.filter(function (x) { return x.d === d; });
  return hit.length ? hit[0].p : null;
}

app.get('/admin/report/view', adminGuard, async function (req, res) {
  var d = String(req.query.d || '').trim();
  var f = d ? reportByDate(d) : _rep.latest;
  if (!f) { await scanReports(); f = d ? reportByDate(d) : _rep.latest; }   // ek retry
  if (!f) return res.redirect('/admin?err=' + encodeURIComponent(
    d ? ('No report found for ' + d + '.') : 'No report file found. Press "Regenerate now" first.'));
  try {
    var html = await _withTimeout(fsp.readFile(f, 'utf8'), 15000);
    res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-store').send(html);
  } catch (e) { res.redirect('/admin?err=' + encodeURIComponent('Could not read the report: ' + e.message)); }
});

app.post('/admin/report', adminGuard, function (req, res) {
  var cp = require('child_process');
  var PY = fs.existsSync('C:\\Users\\arpan\\anaconda3\\python.exe') ? 'C:\\Users\\arpan\\anaconda3\\python.exe' : 'python';
  console.log('[ADMIN] scraping report generate...');
  cp.execFile(PY, [path.join(__dirname, 'daily_report.py')], { cwd: __dirname, timeout: 600000 },
    function (err, so, se) {
      if (err) { console.log('[ADMIN] report FAIL: ' + err.message); return res.redirect('/admin?err=' + encodeURIComponent((se || err.message).slice(0, 300))); }
      console.log('[ADMIN] report done');
      scanReports().then(function () { res.redirect('/admin?done=report'); });
    });
});

/* ==================================================================
 *  LIVE TWEET API   --  Trending & Tweet Explorer ke liye
 *  ------------------------------------------------------------------
 *  Dashboard ka HTML aggregate se banta hai, usme ek bhi tweet nahi hota
 *  (All India me 16.9 lakh tweets hain -- HTML me daalna mumkin hi nahi).
 *  Isliye ye do tab seedha Mongo se live padhte hain.
 *
 *  Sort ke liye index chahiye: bina index ke find().sort() 32 MB par
 *  ruk jaata hai. Neeche startup par bana dete hain.
 * ================================================================== */
const TW_SORT = {
  views: 'Total Views', likes: 'Total Likes',
  retweets: 'Total Retweets', comments: 'Total Comments'
};

/* ---- hot/cold plan, Phase 5: kis store se padhein --------------------------
   HOT (Atlas, pichhle N din) tabhi jab: HOT on + healthy + range ka pehla din
   window ke andar. Warna COLD (local master_tweets) -- bilkul aaj jaisa.
   HOT par koi bhi error -> wahi kaam COLD par dobara (user ko error nahi). */
function twFrom(req) {
  var f = String((req && req.query && req.query.from) || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : '';
}
function hotAllowed(fromDate) {
  return !!fromDate && MP.hotHealthy() && String(fromDate).slice(0, 10) >= MP.windowCutoff();
}
var HOT_STATS = { hot: 0, cold: 0, fallback: 0, lastError: '' };
async function onTweets(fromDate, work, okFn) {
  if (hotAllowed(fromDate)) {
    try {
      var h = MP.hotClient(); await h.connect();
      var r = await work(h.db().collection('tweets'), 'hot');
      if (!okFn || okFn(r)) { HOT_STATS.hot++; return r; }
    } catch (e) {
      HOT_STATS.fallback++; HOT_STATS.lastError = String(e.message || e).slice(0, 150);
      console.log('  [hot] ' + HOT_STATS.lastError + ' -> cold');
    }
  }
  var cli = MP.client();
  try {
    await cli.connect();
    HOT_STATS.cold++;
    return await work(cli.db(MASTER_DB).collection(MASTER_COLL), (fromDate && MP.HOT.enabled) ? 'archive' : 'cold');
  } finally { try { await cli.close(); } catch (e) {} }
}

function twFilter(req) {
  var q = {};
  if (req.query.scope === 'up') q.State = 'Uttar Pradesh';

  var from = String(req.query.from || '').slice(0, 10);
  var to = String(req.query.to || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    q['Tweet Date'] = {};
    if (from) q['Tweet Date'].$gte = from;
    if (to) q['Tweet Date'].$lte = to + '~';   // us din ka poora waqt bhi aa jaye
  }
  var party = String(req.query.party || '').trim();
  if (party && party !== 'all') q.Party = party;

  var term = String(req.query.q || '').trim();
  if (term) {
    var rx = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.$or = [{ 'Tweet Text': { $regex: rx, $options: 'i' } },
             { 'Handle': { $regex: rx, $options: 'i' } },
             { 'Candidate Name': { $regex: rx, $options: 'i' } }];
  }
  return q;
}

const TW_PROJ = {
  _id: 1, Handle: 1, 'Candidate Name': 1, Party: 1, State: 1, Designation: 1,
  'Tweet Date': 1, 'Tweet Text': 1, 'Tweet URL': 1, Sentiment: 1,
  'Total Views': 1, 'Total Likes': 1, 'Total Retweets': 1, 'Total Comments': 1
};

function twRow(d) {
  return {
    id: d._id, h: d.Handle || '', cn: d['Candidate Name'] || '', pt: d.Party || '',
    st: d.State || '', dg: d.Designation || '', d: String(d['Tweet Date'] || '').slice(0, 10),
    tx: d['Tweet Text'] || '', u: d['Tweet URL'] || '', sn: d.Sentiment || '',
    vw: +d['Total Views'] || 0, lk: +d['Total Likes'] || 0,
    rt: +d['Total Retweets'] || 0, cm: +d['Total Comments'] || 0
  };
}

/* Chhota cache -- ek hi filter baar-baar khulta hai (tab switch, back button).
   60 second ka hai, isliye naya data zyada der chhupa nahi rehta. */
var _twCache = new Map();
function twCached(key, ms, make) {
  var hit = _twCache.get(key);
  if (hit && Date.now() - hit.t < ms) return Promise.resolve(hit.v);
  return make().then(function (v) {
    if (_twCache.size > 40) _twCache.delete(_twCache.keys().next().value);
    _twCache.set(key, { t: Date.now(), v: v });
    return v;
  });
}

/* ==================================================================
 *  BREAKING NEWS API   --  BREAKING NEWS API  (news v1)
 *  ------------------------------------------------------------------
 *  SOURCE: koi bahar ka news API NAHI. Wahi data jo network se scrape
 *  hokar pehle se Mongo me pada hai -- pulse_master.master_tweets me se
 *  Category = 'Media House' / 'Journalist' wale tweets.
 *
 *  Ye tweets dashboard ke charts me jaan-boojh kar nahi ginte, isliye ab
 *  tak inka koi upyog nahi tha. News channel aur patrakaar khabar wahin
 *  post karte hain -- yahi sabse imaandaar news source hai.
 *
 *  Teeno scope ek hi endpoint se chalte hain:
 *      /api/news?scope=all|up|punjab
 *  UP/Punjab me pehle us state ki khabar, phir national. Kisi TEESRE
 *  state ki khabar unme nahi aati.
 *
 *  Query Mongo par sirf ek hai (Category + date sort + limit), baaki
 *  chhaant-chunaav yahin hoti hai, aur 60 second cache me rehti hai.
 * ================================================================== */
const NEWS = require(path.join(__dirname, 'news_lib.js'));
const NEWS_WINDOW = 4000;      // itne sabse naye media/journalist tweet uthate hain
const NEWS_PROJ = {
  _id: 1, Handle: 1, 'Candidate Name': 1, Category: 1, State: 1,
  'Tweet Date': 1, 'Tweet Text': 1, 'Tweet URL': 1, Sentiment: 1,
  'Total Views': 1, 'Total Likes': 1, 'Total Retweets': 1, 'Total Comments': 1
};

/* Login guard -- dashGuard sirf all/up jaanta hai, yahan punjab bhi chahiye. */
function newsGuard(req, res, next) {
  var r = roleOf(req);
  if (!r) return res.status(401).set('Cache-Control', 'no-store')
                    .json({ error: 'Your session has expired. Please refresh the page.' });
  var sc = String(req.query.scope || 'all');
  var allowed = SCOPE_ROLES[sc] || SCOPE_ROLES.all;
  if (allowed.indexOf(r) < 0) {
    return res.status(403).json({ error: 'You do not have permission to view this dashboard.' });
  }
  req.role = r; next();
}

/* Mongo se kachcha window (60 sec cache -- teeno scope isi ko baantte hain,
   isliye tab badalne par dobara query nahi chalti). */
var _newsRaw = null;
async function newsWindow() {
  if (_newsRaw && Date.now() - _newsRaw.at < 60000) return _newsRaw.v;
  /* hot/cold Phase 5: pehle HOT (pichhle N din); agar wahan NEWS_WINDOW poore
     na milein (window chhota pad gaya) to COLD -- result hamesha wahi rehta hai. */
  var docs = await onTweets(MP.windowCutoff(), async function (c) {
    return await c.find({ Category: { $in: NEWS.MEDIA_CATS } },
                        { projection: NEWS_PROJ })
                  .sort({ 'Tweet Date': -1 }).limit(NEWS_WINDOW)
                  .maxTimeMS(60000).toArray();
  }, function (r) { return r && r.length >= NEWS_WINDOW; });
  var items = NEWS.toItems(docs);
  NEWS.score(items);
  _newsRaw = { at: Date.now(), v: items };
  return items;
}

/* ==================================================================
 *  LIVE DATA INDICATOR (live v1)
 *  ------------------------------------------------------------------
 *  Har dashboard apne AAP ke scope ki taazgi dikhata hai -- All India
 *  par All India ki, UP par sirf UP ki, Punjab par sirf Punjab ki.
 *
 *  Sab kuch MongoDB se aata hai (pulse_master.master_tweets):
 *      newest = us scope ka sabse naya 'Tweet Date'
 *      fresh  = client ke bheje 'since' ke baad aaye tweet ki ginti
 *  Koi hardcode nahi, koi nakli "LIVE" nahi -- agar data purana hai to
 *  status DELAYED/STALE hi aayega. LIVE/DELAYED/STALE ka faisla client
 *  isi newest se karta hai.
 * ================================================================== */
const LIVE_Q = { all: {}, up: { State: 'Uttar Pradesh' }, punjab: { State: 'Punjab' } };
var _liveCache = new Map();

app.get('/api/live', newsGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var scope = String(req.query.scope || 'all');
  var since = String(req.query.since || '').slice(0, 19);
  var q = LIVE_Q[scope] || LIVE_Q.all;
  try {
    var hit = _liveCache.get(scope);
    var base;
    if (hit && Date.now() - hit.at < 30000) {
      base = hit.v;
    } else {
      var cli = MP.client();
      try {
        await cli.connect();
        var c = cli.db(MASTER_DB).collection(MASTER_COLL);
        /* hot/cold Phase 5: sabse naya tweet Atlas (pichhle N din) se; wahan is
           scope ka koi tweet na ho to local se -- result wahi rehta hai. */
        var d = await onTweets(MP.windowCutoff(), function (cc) {
          return cc.find(q, { projection: { 'Tweet Date': 1 } })
                   .sort({ 'Tweet Date': -1 }).limit(1).maxTimeMS(20000).toArray();
        }, function (r) { return r && r.length > 0; });
        /* All India par countDocuments 18 lakh docs ginta hai -- mehnga hai,
           isliye wahan estimate. UP/Punjab chhote aur indexed hain. */
        var n = scope === 'all'
          ? await c.estimatedDocumentCount()
          : await c.countDocuments(q, { maxTimeMS: 20000 });
        base = { total: n, newest: d.length ? String(d[0]['Tweet Date'] || '').slice(0, 19) : '' };
        _liveCache.set(scope, { at: Date.now(), v: base });
      } finally { try { await cli.close(); } catch (e) {} }
    }
    var fresh = 0;
    if (since && base.newest && since < base.newest) {
      var q2 = Object.assign({}, q, { 'Tweet Date': { $gt: since } });
      /* 'since' window ke andar ho to ginti Atlas par (hot/cold Phase 5) */
      fresh = await onTweets(since.slice(0, 10), function (cc) {
        return cc.countDocuments(q2, { maxTimeMS: 20000 });
      });
    }
    res.json({ scope: scope, total: base.total, newest: base.newest || null,
               fresh: fresh, now: new Date().toISOString() });
  } catch (e) {
    console.log('  [/api/live] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/news', newsGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var scope = String(req.query.scope || 'all');
  var tab = String(req.query.tab || 'all');
  var cat = String(req.query.cat || 'All');
  var sort = String(req.query.sort || 'latest');
  var limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  var skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  try {
    var all = await newsWindow();
    var f = NEWS.forScope(all.slice(), scope);
    var deduped = NEWS.dedupe(NEWS.sortRows(f.rows, sort));

    // Tab counts across current scope
    var tabCounts = { national: 0, international: 0, intl_india: 0, all: deduped.length };
    deduped.forEach(function (r) {
      if (r.scopeTab === 'international') tabCounts.international++;
      else if (r.scopeTab === 'intl_india') tabCounts.intl_india++;
      else tabCounts.national++;
    });

    // Filter by tab if requested
    var rows = deduped;
    if (tab && tab !== 'all') {
      rows = rows.filter(function (r) { return r.scopeTab === tab; });
    }

    // Category counts within active tab
    var catCounts = {};
    rows.forEach(function (r) { catCounts[r.cat] = (catCounts[r.cat] || 0) + 1; });

    // Filter by category if requested
    if (cat && cat !== 'All') {
      rows = rows.filter(function (r) { return r.cat === cat; });
    }

    var newest = rows.reduce(function (m, r) { return r.ts > m ? r.ts : m; }, 0);
    res.json({
      scope: scope, tab: tab, cat: cat, sort: sort,
      total: rows.length,
      breaking: rows.filter(function (r) { return r.breaking; }).length,
      counts: catCounts,
      tabs: tabCounts,
      newest: newest ? new Date(newest).toISOString() : null,
      pool: all.length,
      rows: rows.slice(skip, skip + limit)
    });
  } catch (e) {
    console.log('  [/api/news] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

/* Sirf ginti -- "5 nayi khabar" wala chip isi ko poll karta hai (halka hai). */
app.get('/api/news/meta', newsGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var scope = String(req.query.scope || 'all');
  var tab = String(req.query.tab || 'all');
  var since = Date.parse(String(req.query.since || '')) || 0;
  try {
    var all = await newsWindow();
    var rows = NEWS.dedupe(NEWS.forScope(all.slice(), scope).rows);
    if (tab && tab !== 'all') {
      rows = rows.filter(function (r) { return r.scopeTab === tab; });
    }
    var newest = rows.reduce(function (m, r) { return r.ts > m ? r.ts : m; }, 0);
    res.json({
      scope: scope, tab: tab,
      total: rows.length,
      newest: newest ? new Date(newest).toISOString() : null,
      fresh: since ? rows.filter(function (r) { return r.ts > since; }).length : 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Trending & Viral: kisi ek metric par top tweets ----
app.get('/api/tw/top', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var metric = String(req.query.metric || 'views');
  var limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  var q = twFilter(req);
  var key = 'top|' + metric + '|' + limit + '|' + JSON.stringify(q);
  try {
    var rows = await twCached(key, 60000, async function () {
      return onTweets(twFrom(req), async function (c) {
        var out;
        if (metric === 'engagement') {
          /* Engagement = Likes + Retweets + Comments.
             27.7 Lakh tweets par unindexed aggregate sort 60s timeout karta tha.
             Indexed candidate pool (top Likes, RTs, Comments) se <50ms me nikalte hain. */
          var candLimit = Math.max(limit * 5, 200);
          var [topL, topR, topC] = await Promise.all([
            c.find(q, { projection: TW_PROJ }).sort({ 'Total Likes': -1 }).limit(candLimit).maxTimeMS(20000).toArray(),
            c.find(q, { projection: TW_PROJ }).sort({ 'Total Retweets': -1 }).limit(candLimit).maxTimeMS(20000).toArray(),
            c.find(q, { projection: TW_PROJ }).sort({ 'Total Comments': -1 }).limit(candLimit).maxTimeMS(20000).toArray()
          ]);
          var byId = new Map();
          [topL, topR, topC].forEach(function (list) {
            list.forEach(function (doc) {
              if (doc && doc._id) byId.set(String(doc._id), doc);
            });
          });
          function engScore(d) {
            return (+d['Total Likes'] || 0) + (+d['Total Retweets'] || 0) + (+d['Total Comments'] || 0);
          }
          out = Array.from(byId.values())
            .sort(function (a, b) { return engScore(b) - engScore(a); })
            .slice(0, limit);
        } else {
          var f = TW_SORT[metric] || TW_SORT.views;
          var s = {}; s[f] = -1;
          out = await c.find(q, { projection: TW_PROJ }).sort(s).limit(limit)
                       .maxTimeMS(60000).toArray();
        }
        return out.map(twRow);
      });
    });
    res.json({ n: rows.length, metric: metric, rows: rows });
  } catch (e) {
    console.log('  [/api/tw/top] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Tweet Explorer: search + sort + page ----
app.get('/api/tw/list', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var sort = String(req.query.sort || 'date');
  var limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);
  var skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  var q = twFilter(req);
  var key = 'list|' + sort + '|' + limit + '|' + skip + '|' + JSON.stringify(q);
  try {
    var out = await twCached(key, 60000, async function () {
      return onTweets(twFrom(req), async function (c, store) {
        var s = {};
        if (sort === 'date') s['Tweet Date'] = -1;
        else if (sort === 'eng') s['Total Likes'] = -1;      // engagement ka proxy
        else s[TW_SORT[sort] || TW_SORT.views] = -1;

        var rows = await c.find(q, { projection: TW_PROJ })
                          .sort(s).skip(skip).limit(limit).maxTimeMS(60000).toArray();
        /* Poori ginti bhaari padti hai, isliye 2 lakh tak hi gino --
           usse aage "2,00,000+" dikha dete hain. */
        var n = await c.countDocuments(q, { limit: 200000, maxTimeMS: 20000 })
                       .catch(function () { return -1; });
        return { n: n, capped: n >= 200000, rows: rows.map(twRow), source: store };
      });
    });
    res.json(out);
  } catch (e) {
    console.log('  [/api/tw/list] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---- AI assistant (right-bottom wala chat) ----
   Wahi free Groq key jo reports ka AI use karta hai (ai_config.json).
   Model ko RAW TWEET nahi bheje jaate -- sirf apne hi gine hue aankde,
   taaki wo naya fact bana hi na sake. */
app.post('/api/ask', dashGuard, express.json({ limit: '1mb' }), async function (req, res) {
  var cfg = aiConfig();
  if (!cfg || !cfg.key) {
    return res.json({ answer: '', error:
      'AI key not found. Rename DASHBOARD\\ai_config.sample.json to ai_config.json '
      + 'and put a free key from console.groq.com into it, then restart the server.' });
  }
  var question = String((req.body || {}).question || '').trim().slice(0, 500);
  var stats = (req.body || {}).stats || {};
  if (!question) return res.json({ answer: '', error: 'Please type a question.' });
  try {
    var sys = 'You are a political social-media analyst. You will be given a dashboard\'s COMPUTED '
      + 'figures (JSON) and a question. Answer in ENGLISH, using only those figures. '
      + 'STRICT RULES: (1) Never invent a fact, name, date or number that is not in the JSON. '
      + '(2) If the JSON does not hold the answer, say plainly "That is not in this data". '
      + '(3) Keep it short and direct -- 4-6 lines, bullets if needed.';
    var out = await groqChat(cfg, [
      { role: 'system', content: sys },
      { role: 'user', content: 'FIGURES:\n' + JSON.stringify(stats).slice(0, 60000)
        + '\n\nQUESTION: ' + question }
    ], 400);
    if (out.error) return res.json({ answer: '', error: out.error });
    res.json({ answer: out.text, model: _aiModel });
  } catch (e) {
    res.json({ answer: '', error: 'AI skip: ' + e.message });
  }
});

// data ka version (auto-refresh ke liye)
app.get('/api/version', async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var dbn = SCOPE_DB[req.query.scope === 'up' ? 'up' : 'all'];
  try {
    var client = MP.client(); await client.connect();
    var doc = await client.db(dbn).collection('meta').findOne({ key: 'lastUpdate' });
    await client.close();
    res.json({ v: doc ? String(doc.value) : '' });
  } catch (e) { res.json({ v: '' }); }
});

// Preview routes for Leader Comparison mockup
app.get('/sample_leader_comparison_preview.html', function (req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'sample_leader_comparison_preview.html'));
});
app.get('/sample_party_detail_preview.html', function (req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'sample_party_detail_preview.html'));
});
app.get('/sample_showcase_preview.html', function (req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  var f = fs.existsSync(path.join(__dirname, 'sample_showcase_preview.html'))
    ? 'sample_showcase_preview.html' : 'sample_leader_comparison_preview.html';
  res.sendFile(path.join(__dirname, f));
});
app.get('/leader_comparison_slides.html', function (req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'leader_comparison_slides.html'));
});

// ---------- Narrative Groups: LIVE MongoDB aggregation endpoint ----------
// ---------- Narrative Groups: LIVE MongoDB aggregation endpoint (Date Filter aware) ----------
app.get('/api/narrative-groups/stats', async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var cfgPath = path.join(__dirname, 'data', 'narrative_groups_config.json');
    if (!fs.existsSync(cfgPath)) return res.json({ ok: false, error: 'Config missing' });
    var groups = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    var allHandles = [];
    groups.forEach(function (g) {
      if (g.handles && g.handles.length) allHandles.push.apply(allHandles, g.handles);
    });

    // Date range support
    var matchCond = { Handle: { $in: allHandles } };
    var dFrom = String(req.query.from || '').trim().slice(0, 10);
    var dTo   = String(req.query.to   || '').trim().slice(0, 10);
    if (dFrom || dTo) {
      matchCond['Tweet Date'] = {};
      if (dFrom) matchCond['Tweet Date'].$gte = dFrom;
      if (dTo)   matchCond['Tweet Date'].$lte = dTo + ' 23:59:59';
    }

    var _src = 'cold';   /* hot | cold | archive -- kis store se aaya */
    var pipeline = [
      { $match: matchCond },
      {
        $group: {
          _id: '$Handle',
          tweets: { $sum: 1 },
          likes: { $sum: '$Total Likes' },
          rts: { $sum: '$Total Retweets' },
          views: { $sum: '$Total Views' }
        }
      }
    ];
    /* hot/cold Phase 5: range window ke andar -> Atlas, warna local (archive) */
    var results = await onTweets(dFrom, async function (coll, store) {
      _src = store; return coll.aggregate(pipeline).toArray();
    });

    var handleMap = {};
    results.forEach(function (r) {
      var obj = {
        tweets: r.tweets || 0,
        likes: r.likes || 0,
        rts: r.rts || 0,
        views: r.views || 0
      };
      handleMap[r._id] = obj;
      if (r._id) {
        handleMap[r._id.toLowerCase()] = obj;
      }
    });

    res.json({ ok: true, source: _src, stats: handleMap, from: dFrom, to: dTo, timestamp: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---------- Narrative Groups: LIVE MongoDB Leader Deep-Dive Analysis endpoint (Date Filter aware) ----------
app.get('/api/narrative-groups/leader-analysis/:handle', async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var rawHandle = String(req.params.handle || '').trim().replace(/^@/, '');
    if (!rawHandle) return res.json({ ok: false, error: 'Handle required' });

    var _src = 'cold';   /* hot | cold | archive -- kis store se aaya */

    // Fast indexed match (avoids full table scan on 2.8 million tweets)
    var handleVariations = Array.from(new Set([
      rawHandle,
      rawHandle.toLowerCase(),
      rawHandle.toUpperCase(),
      rawHandle.charAt(0).toUpperCase() + rawHandle.slice(1)
    ]));
    var filter = { Handle: { $in: handleVariations } };

    // Date range support (explicit from/to or days preset)
    var dFrom = String(req.query.from || '').trim().slice(0, 10);
    var dTo   = String(req.query.to   || '').trim().slice(0, 10);
    /* default-today (26-Oct): days=today -> sirf aaj (IST) */
    if (!dFrom && !dTo && req.query.days === 'today') { dFrom = dTo = require('./hot_conf.js').todayIST(); }
    if (!dFrom && !dTo && req.query.days && req.query.days !== 'all') {
      var numDays = parseInt(req.query.days, 10);
      if (!isNaN(numDays) && numDays > 0) {
        var now = new Date();
        dTo = now.toISOString().slice(0, 10);
        var past = new Date(now);
        past.setDate(past.getDate() - numDays);
        dFrom = past.toISOString().slice(0, 10);
      }
    }
    if (dFrom || dTo) {
      filter['Tweet Date'] = {};
      if (dFrom) filter['Tweet Date'].$gte = dFrom;
      if (dTo)   filter['Tweet Date'].$lte = dTo + ' 23:59:59';
    }

    // Unified parallel execution: 1 aggregation facet + top tweet + recents
    var pipeline = [
      { $match: filter },
      {
        $facet: {
          kpis: [
            {
              $group: {
                _id: null,
                totalTweets: { $sum: 1 },
                totalLikes: { $sum: '$Total Likes' },
                totalRetweets: { $sum: '$Total Retweets' },
                totalViews: { $sum: '$Total Views' },
                totalComments: { $sum: '$Total Comments' }
              }
            }
          ],
          timeline: [
            {
              $group: {
                _id: { $substr: ['$Tweet Date', 0, 10] },
                tweets: { $sum: 1 },
                likes: { $sum: '$Total Likes' },
                reposts: { $sum: '$Total Retweets' },
                views: { $sum: '$Total Views' }
              }
            },
            { $sort: { _id: 1 } }
          ],
          sentiment: [
            {
              $group: {
                _id: '$Sentiment',
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    /* hot/cold Phase 5: range window ke andar -> Atlas, warna local (archive) */
    var [aggResults, topTweets, recentTweets] = await onTweets(dFrom, async function (coll, store) {
      _src = store;
      return Promise.all([
        coll.aggregate(pipeline).toArray(),
        coll.find(filter).sort({ 'Total Views': -1 }).limit(1).toArray(),
        coll.find(filter).sort({ 'Tweet Date': -1 }).limit(5).toArray()
      ]);
    });

    var facet = (aggResults && aggResults.length) ? aggResults[0] : {};
    var kpiList = facet.kpis || [];
    var kpis = kpiList.length ? kpiList[0] : { totalTweets: 0, totalLikes: 0, totalRetweets: 0, totalViews: 0, totalComments: 0 };
    var timeline = facet.timeline || [];
    var sentiment = facet.sentiment || [];

    res.json({
      ok: true,
      source: _src,
      handle: rawHandle,
      from: dFrom,
      to: dTo,
      kpis: kpis,
      timeline: timeline,
      topTweet: topTweets.length ? topTweets[0] : null,
      recentTweets: recentTweets,
      sentiment: sentiment,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---------- Narrative Groups: LIVE MongoDB Leader Comparison Endpoint ----------
app.get('/api/narrative-groups/comparison', async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var groupId = String(req.query.group || 'cjp').trim().toLowerCase();
    var cfgPath = path.join(__dirname, 'data', 'narrative_groups_config.json');
    if (!fs.existsSync(cfgPath)) return res.json({ ok: false, error: 'Config missing' });
    var groups = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    var group = groups.find(function (g) { return g.id.toLowerCase() === groupId; }) || groups[0];
    if (!group) return res.json({ ok: false, error: 'Group not found' });

    var leaders = group.leaders || [];
    var leaderHandles = leaders.map(function (l) { return l.handle; }).filter(Boolean);
    if (!leaderHandles.length) leaderHandles = group.handles || [];

    var allHandleVars = [];
    leaderHandles.forEach(function (h) {
      allHandleVars.push(h, h.toLowerCase(), h.toUpperCase());
    });

    var matchCond = { Handle: { $in: Array.from(new Set(allHandleVars)) } };

    // Date range
    var dFrom = String(req.query.from || '').trim().slice(0, 10);
    var dTo   = String(req.query.to   || '').trim().slice(0, 10);
    /* default-today (26-Oct): days=today -> sirf aaj (IST) */
    if (!dFrom && !dTo && req.query.days === 'today') { dFrom = dTo = require('./hot_conf.js').todayIST(); }
    if (!dFrom && !dTo && req.query.days && req.query.days !== 'all') {
      var numDays = parseInt(req.query.days, 10);
      if (!isNaN(numDays) && numDays > 0) {
        var now = new Date();
        dTo = now.toISOString().slice(0, 10);
        var past = new Date(now);
        past.setDate(past.getDate() - numDays);
        dFrom = past.toISOString().slice(0, 10);
      }
    }
    if (dFrom || dTo) {
      matchCond['Tweet Date'] = {};
      if (dFrom) matchCond['Tweet Date'].$gte = dFrom;
      if (dTo)   matchCond['Tweet Date'].$lte = dTo + ' 23:59:59';
    }

    // Sentiment filter
    var sentFilter = String(req.query.sentiment || '').trim();
    if (sentFilter && sentFilter.toLowerCase() !== 'all') {
      matchCond['Sentiment'] = sentFilter;
    }

    var _src = 'cold';   /* hot | cold | archive -- kis store se aaya */

    var pipeline = [
      { $match: matchCond },
      {
        $facet: {
          leaderStats: [
            {
              $group: {
                _id: '$Handle',
                tweets: { $sum: 1 },
                likes: { $sum: '$Total Likes' },
                reposts: { $sum: '$Total Retweets' },
                views: { $sum: '$Total Views' },
                comments: { $sum: '$Total Comments' }
              }
            }
          ],
          leaderTimelines: [
            {
              $group: {
                _id: {
                  handle: '$Handle',
                  date: { $substr: ['$Tweet Date', 0, 10] }
                },
                tweets: { $sum: 1 },
                likes: { $sum: '$Total Likes' },
                reposts: { $sum: '$Total Retweets' },
                views: { $sum: '$Total Views' }
              }
            },
            { $sort: { '_id.date': 1 } }
          ],
          leaderSentiments: [
            {
              $group: {
                _id: {
                  handle: '$Handle',
                  sentiment: '$Sentiment'
                },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    /* hot/cold Phase 5: range window ke andar -> Atlas, warna local (archive) */
    var results = await onTweets(dFrom, async function (coll, store) {
      _src = store; return coll.aggregate(pipeline).toArray();
    });

    var facet = (results && results.length) ? results[0] : {};
    var rawStats = facet.leaderStats || [];
    var rawTimelines = facet.leaderTimelines || [];
    var rawSentiments = facet.leaderSentiments || [];

    var statsMap = {};
    rawStats.forEach(function (r) {
      var hKey = String(r._id || '').toLowerCase();
      statsMap[hKey] = {
        handle: r._id,
        tweets: r.tweets || 0,
        likes: r.likes || 0,
        reposts: r.reposts || 0,
        views: r.views || 0,
        comments: r.comments || 0
      };
    });

    var dateSet = new Set();
    rawTimelines.forEach(function (t) {
      if (t._id && t._id.date) dateSet.add(t._id.date);
    });
    var sortedDates = Array.from(dateSet).sort();

    var timelineMap = {};
    rawTimelines.forEach(function (t) {
      var hKey = String(t._id.handle || '').toLowerCase();
      if (!timelineMap[hKey]) timelineMap[hKey] = {};
      timelineMap[hKey][t._id.date] = {
        tweets: t.tweets || 0,
        likes: t.likes || 0,
        reposts: t.reposts || 0,
        views: t.views || 0
      };
    });

    var sentimentMap = {};
    rawSentiments.forEach(function (s) {
      var hKey = String(s._id.handle || '').toLowerCase();
      if (!sentimentMap[hKey]) sentimentMap[hKey] = {};
      var sName = s._id.sentiment || 'No-Sentiment';
      sentimentMap[hKey][sName] = (sentimentMap[hKey][sName] || 0) + (s.count || 0);
    });

    // Sort leaders by tweet count descending (highest to lowest)
    leaders.sort(function (a, b) {
      var sA = statsMap[String(a.handle || '').toLowerCase()] || { tweets: 0 };
      var sB = statsMap[String(b.handle || '').toLowerCase()] || { tweets: 0 };
      return (sB.tweets || 0) - (sA.tweets || 0);
    });

    res.json({
      ok: true,
      source: _src,
      group: { id: group.id, name: group.name, acronym: group.acronym, color: group.color },
      leaders: leaders,
      dates: sortedDates,
      stats: statsMap,
      timelines: timelineMap,
      sentiments: sentimentMap,
      from: dFrom,
      to: dTo,
      sentimentFilter: sentFilter,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ==============================================================================
// LIVE X PROFILE PHOTO SCRAPER & PROXY (/api/avatar/:handle)
// ==============================================================================
var _avatarCache = {};

// Pre-load known high-res avatars from scraped_avatars.json and media_avatars.json if available
try {
  var avPath = path.join(__dirname, '..', 'scraped_avatars.json');
  if (!fs.existsSync(avPath)) avPath = path.join(__dirname, 'scraped_avatars.json');
  if (fs.existsSync(avPath)) {
    var rawAv = JSON.parse(fs.readFileSync(avPath, 'utf8'));
    for (var kh in rawAv) {
      if (rawAv[kh]) {
        _avatarCache[kh.toLowerCase()] = { url: rawAv[kh], expires: Date.now() + 7 * 86400000 };
      }
    }
  }
  var medPath = path.join(__dirname, 'media_avatars.json');
  if (fs.existsSync(medPath)) {
    var rawMed = JSON.parse(fs.readFileSync(medPath, 'utf8'));
    for (var km in rawMed) {
      if (rawMed[km]) {
        _avatarCache[km.toLowerCase()] = { url: rawMed[km], expires: Date.now() + 7 * 86400000 };
      }
    }
  }
} catch (e) {}

function scrapeXAvatarLive(handle) {
  return new Promise(function (resolve) {
    var clean = String(handle || '').trim().replace(/^@/, '');
    if (!clean) return resolve(null);

    var https = require('https');
    var url = 'https://api.fxtwitter.com/' + encodeURIComponent(clean);
    var req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try {
          var j = JSON.parse(body);
          var av = (j.user && (j.user.avatar_url || j.user.profile_image_url_https)) || j.avatar_url;
          if (av) {
            av = av.replace('_normal.', '_400x400.');
            return resolve(av);
          }
        } catch (err) {}
        resolve(null);
      });
    });
    req.on('error', function () { resolve(null); });
    req.on('timeout', function () { req.destroy(); resolve(null); });
  });
}

// ---------- Parties: LIVE MongoDB Leader Comparison Endpoint ----------
app.get('/api/parties/comparison', async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var party = String(req.query.party || 'BJP').trim().toUpperCase();
    var hmPath = path.join(__dirname, 'data', 'handle_master.json');
    var handleMaster = {};
    if (fs.existsSync(hmPath)) {
      try { handleMaster = JSON.parse(fs.readFileSync(hmPath, 'utf8')); } catch (e) {}
    }

    // Find all party handles
    var partyHandleMap = {};
    Object.keys(handleMaster).forEach(function (hKey) {
      var info = handleMaster[hKey] || {};
      if ((info.party || '').toUpperCase() === party) {
        partyHandleMap[hKey.toLowerCase()] = info;
      }
    });

    var requestedHandles = String(req.query.handles || '').trim();
    var targetHandles = [];
    if (requestedHandles) {
      targetHandles = requestedHandles.split(',').map(function (h) { return h.trim().replace(/^@/, ''); }).filter(Boolean);
    } else {
      // Pick top 6 leaders of the party from mapping
      targetHandles = Object.keys(partyHandleMap).slice(0, 6);
    }

    var allHandleVars = [];
    targetHandles.forEach(function (h) {
      allHandleVars.push(h, h.toLowerCase(), h.toUpperCase());
    });

    var matchCond = { Handle: { $in: Array.from(new Set(allHandleVars)) } };

    // Date range
    var dFrom = String(req.query.from || '').trim().slice(0, 10);
    var dTo   = String(req.query.to   || '').trim().slice(0, 10);
    /* default-today (26-Oct): days=today -> sirf aaj (IST) */
    if (!dFrom && !dTo && req.query.days === 'today') { dFrom = dTo = require('./hot_conf.js').todayIST(); }
    if (!dFrom && !dTo && req.query.days && req.query.days !== 'all') {
      var numDays = parseInt(req.query.days, 10);
      if (!isNaN(numDays) && numDays > 0) {
        var now = new Date();
        dTo = now.toISOString().slice(0, 10);
        var past = new Date(now);
        past.setDate(past.getDate() - numDays);
        dFrom = past.toISOString().slice(0, 10);
      }
    }
    if (dFrom || dTo) {
      matchCond['Tweet Date'] = {};
      if (dFrom) matchCond['Tweet Date'].$gte = dFrom;
      if (dTo)   matchCond['Tweet Date'].$lte = dTo + ' 23:59:59';
    }

    // Sentiment filter
    var sentFilter = String(req.query.sentiment || '').trim();
    if (sentFilter && sentFilter.toLowerCase() !== 'all') {
      matchCond['Sentiment'] = sentFilter;
    }

    var _src = 'cold';   /* hot | cold | archive -- kis store se aaya */

    var pipeline = [
      { $match: matchCond },
      {
        $facet: {
          leaderStats: [
            {
              $group: {
                _id: '$Handle',
                tweets: { $sum: 1 },
                likes: { $sum: '$Total Likes' },
                reposts: { $sum: '$Total Retweets' },
                views: { $sum: '$Total Views' },
                comments: { $sum: '$Total Comments' }
              }
            }
          ],
          leaderTimelines: [
            {
              $group: {
                _id: {
                  handle: '$Handle',
                  date: { $substr: ['$Tweet Date', 0, 10] }
                },
                tweets: { $sum: 1 },
                likes: { $sum: '$Total Likes' },
                reposts: { $sum: '$Total Retweets' },
                views: { $sum: '$Total Views' }
              }
            },
            { $sort: { '_id.date': 1 } }
          ],
          leaderSentiments: [
            {
              $group: {
                _id: {
                  handle: '$Handle',
                  sentiment: '$Sentiment'
                },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    /* hot/cold Phase 5: range window ke andar -> Atlas, warna local (archive) */
    var results = await onTweets(dFrom, async function (coll, store) {
      _src = store; return coll.aggregate(pipeline).toArray();
    });

    var facet = (results && results.length) ? results[0] : {};
    var rawStats = facet.leaderStats || [];
    var rawTimelines = facet.leaderTimelines || [];
    var rawSentiments = facet.leaderSentiments || [];

    var statsMap = {};
    rawStats.forEach(function (r) {
      var hKey = String(r._id || '').toLowerCase();
      if (!statsMap[hKey]) {
        statsMap[hKey] = {
          handle: r._id,
          tweets: r.tweets || 0,
          likes: r.likes || 0,
          reposts: r.reposts || 0,
          views: r.views || 0,
          comments: r.comments || 0
        };
      } else {
        statsMap[hKey].tweets += (r.tweets || 0);
        statsMap[hKey].likes += (r.likes || 0);
        statsMap[hKey].reposts += (r.reposts || 0);
        statsMap[hKey].views += (r.views || 0);
        statsMap[hKey].comments += (r.comments || 0);
      }
    });

    var dateSet = new Set();
    rawTimelines.forEach(function (t) {
      if (t._id && t._id.date) dateSet.add(t._id.date);
    });
    var sortedDates = Array.from(dateSet).sort();

    var timelineMap = {};
    rawTimelines.forEach(function (t) {
      var hKey = String(t._id.handle || '').toLowerCase();
      if (!timelineMap[hKey]) timelineMap[hKey] = {};
      var cur = timelineMap[hKey][t._id.date] || { tweets: 0, likes: 0, reposts: 0, views: 0 };
      cur.tweets += (t.tweets || 0);
      cur.likes += (t.likes || 0);
      cur.reposts += (t.reposts || 0);
      cur.views += (t.views || 0);
      timelineMap[hKey][t._id.date] = cur;
    });

    var sentimentMap = {};
    rawSentiments.forEach(function (s) {
      var hKey = String(s._id.handle || '').toLowerCase();
      if (!sentimentMap[hKey]) sentimentMap[hKey] = {};
      var st = s._id.sentiment || 'Neutral';
      sentimentMap[hKey][st] = (sentimentMap[hKey][st] || 0) + (s.count || 0);
    });

    var leadersList = targetHandles.map(function (h) {
      var hKey = h.toLowerCase();
      var meta = partyHandleMap[hKey] || {};
      var stats = statsMap[hKey] || { tweets: 0, likes: 0, reposts: 0, views: 0, comments: 0 };
      var tl = timelineMap[hKey] || {};
      var sent = sentimentMap[hKey] || {};

      var dayPoints = sortedDates.map(function (d) {
        return tl[d] ? (tl[d].tweets || 0) : 0;
      });
      var dayLikes = sortedDates.map(function (d) {
        return tl[d] ? (tl[d].likes || 0) : 0;
      });
      var dayViews = sortedDates.map(function (d) {
        return tl[d] ? (tl[d].views || 0) : 0;
      });

      return {
        handle: meta.handle || h,
        name: meta.name || h,
        designation: (meta.designations && meta.designations[0]) || meta.level || 'Party Leader',
        state: meta.state || '',
        avatar: '/api/avatar/' + (meta.handle || h),
        stats: stats,
        timeline: {
          dates: sortedDates,
          tweets: dayPoints,
          likes: dayLikes,
          views: dayViews
        },
        sentiments: sent
      };
    });

    // Sort leaders descending by tweets
    leadersList.sort(function (a, b) {
      return (b.stats.tweets || 0) - (a.stats.tweets || 0);
    });

    res.json({
      ok: true,
      source: _src,
      party: party,
      dates: sortedDates,
      leaders: leadersList,
      totalPartyHandles: Object.keys(partyHandleMap).length
    });
  } catch (err) {
    console.error('Error in /api/parties/comparison:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/avatar/:handle', async function (req, res) {
  var handle = String(req.params.handle || '').trim().replace(/^@/, '');
  var lk = handle.toLowerCase();
  if (!handle) {
    return res.redirect(302, 'https://ui-avatars.com/api/?name=X&background=EA580C&color=fff&size=128');
  }

  // 1. Check in-memory cache
  var cached = _avatarCache[lk];
  if (cached && cached.url && cached.expires > Date.now()) {
    if (req.query.json === '1') {
      return res.json({ ok: true, handle: handle, avatar: cached.url, cached: true });
    }
    return res.redirect(302, cached.url);
  }

  // 2. Live scrape from X
  var liveUrl = await scrapeXAvatarLive(handle);
  if (liveUrl) {
    _avatarCache[lk] = { url: liveUrl, expires: Date.now() + 86400000 * 3 };
    if (req.query.json === '1') {
      return res.json({ ok: true, handle: handle, avatar: liveUrl, cached: false });
    }
    return res.redirect(302, liveUrl);
  }

  // 3. Fallback to initials avatar
  var fallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(handle) + '&background=EA580C&color=fff&size=128';
  if (req.query.json === '1') {
    return res.json({ ok: false, handle: handle, avatar: fallback, fallback: true });
  }
  return res.redirect(302, fallback);
});

// ---------- Report tab: ALL-INDIA + Media/Journalist, LIVE MongoDB query ----------
// Pehle poora collection memory me load hota tha (UP-only, chhota tha).
// Ab pool poora India hai (~15 lakh), isliye har report par MongoDB me
// ek query chalti hai aur sirf MATCHING tweets aate hain.
var _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function _fmtDate(s){ if(!s) return ''; var p=String(s).split('-'); return (+p[2])+' '+_MON[(+p[1])-1]+' '+p[0]; }
const REPORT_DB = 'up_pulse';          // collection wahi, data ab All-India
const REPORT_CAP = 120000;             // ek report me itne se zyada tweets nahi
var _upRange = '', _poolInfo = null;

function _rx(term){                     // keyword -> safe regex (word-ish match)
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* phase0-report-src (hot/cold plan, Phase 0.4 option b):
   Report pool ab seedha pulse_master.master_tweets se padha jaata hai --
   up_pulse.tweets (poore master ki 2.8 GB copy, har run me RAM me bana kar
   swap) ki zaroorat nahi. Rows wahi short shape me banti hain jo
   push_tweets.py banata tha, isliye report_lib.js bilkul nahi badla.
   Wapas purane pool par: env PULSE_REPORT_SRC=pool  (server restart). */
const REPORT_SRC = String(process.env.PULSE_REPORT_SRC || 'master').toLowerCase() === 'pool' ? 'pool' : 'master';
const RS = require('./report_src.js');
var _lastReportStore = 'cold';

// pool ka date-range + size (10 min cache) - report header me dikhta hai
async function reportPoolInfo(force){
  if (_poolInfo && !force && (Date.now() - _poolInfo.at) < 6e5) return _poolInfo;
  var client = MP.client(); await client.connect();
  try {
    var n, mn, mx, mj;
    if (REPORT_SRC === 'master') {
      var col = client.db(MASTER_DB).collection(MASTER_COLL);
      n = await col.estimatedDocumentCount();
      var lo = await col.find({'Tweet Date':{$gt:''}},{projection:{'Tweet Date':1,_id:0}}).sort({'Tweet Date':1}).limit(1).toArray();
      var hi = await col.find({'Tweet Date':{$gt:''}},{projection:{'Tweet Date':1,_id:0}}).sort({'Tweet Date':-1}).limit(1).toArray();
      mn = lo.length ? String(lo[0]['Tweet Date']).slice(0, 10) : '';
      mx = hi.length ? String(hi[0]['Tweet Date']).slice(0, 10) : '';
      mj = await col.countDocuments({ Category: { $in: ['Media House','Journalist'] } });
    } else {
      var db = client.db(REPORT_DB);
      var cols = (await db.listCollections().toArray()).map(function(c){return c.name;});
      if (!cols.includes('tweets')) throw new Error(REPORT_DB + " me 'tweets' nahi mili. Pehle push_tweets.py chalao.");
      var col = db.collection('tweets');
      n  = await col.estimatedDocumentCount();
      var lo = await col.find({date:{$ne:''}},{projection:{date:1,_id:0}}).sort({date:1}).limit(1).toArray();
      var hi = await col.find({date:{$ne:''}},{projection:{date:1,_id:0}}).sort({date:-1}).limit(1).toArray();
      mn = lo.length ? lo[0].date : ''; mx = hi.length ? hi[0].date : '';
      mj = await col.countDocuments({ cat: { $in: ['Media House','Journalist'] } });
    }
    _upRange = _fmtDate(mn) + ' – ' + _fmtDate(mx);
    _poolInfo = { at: Date.now(), n: n, mj: mj, pol: n - mj, range: _upRange };
    console.log('  Report pool [' + REPORT_SRC + ']: ' + n + ' tweets (All India ' + (n-mj) + ' + media/journalist ' + mj + ')  ' + _upRange);
    return _poolInfo;
  } finally { await client.close(); }
}

// SIRF matching tweets Mongo se lao (keywords + optional date range)
async function queryTweets(terms, dFrom, dTo){
  var client = MP.client(); await client.connect();
  try {
    var q, out, t0 = Date.now();
    if (REPORT_SRC === 'master') {
      q = RS.masterQuery(terms, dFrom, dTo);
      var docs = await onTweets(dFrom, async function (col, store) {
        _lastReportStore = store;
        return await col.find(q, { projection: RS.PROJ }).limit(REPORT_CAP).batchSize(5000).toArray();
      });
      out = docs.map(RS.toRow);
    } else {
      var col = client.db(REPORT_DB).collection('tweets');
      q = RS.poolQuery(terms, dFrom, dTo);
      out = await col.find(q, { projection: { _id: 0 } }).limit(REPORT_CAP).toArray();
    }
    console.log('  Mongo query [' + REPORT_SRC + ']: ' + out.length + ' tweets (' + (Date.now()-t0) + ' ms) terms=' + JSON.stringify(terms));
    return out;
  } finally { await client.close(); }
}
// ---- AI narrative (optional): free Groq API. Key: DASHBOARD\ai_config.json ----
function aiConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'ai_config.json'), 'utf8')); }
  catch (e) { return null; }
}

/* ------------------------------------------------------------------
 * Groq baar-baar apne model band karta rehta hai. ai_config.json me
 * likha naam ek din kaam karna chhod deta hai aur API sirf 404 deti
 * hai -- kahin ye nahi likha hota ki "model ab nahi raha".
 *
 * Isliye naam par bharosa nahi karte: pehli baar fail hone par Groq se
 * hi maujooda model ki list maangte hain, usme se ek chunte hain, aur
 * yaad rakh lete hain. Ek hi baar ki dikkat, phir apne aap chalta hai.
 * ------------------------------------------------------------------ */
var _aiModel = null;         // jo abhi chal raha hai
var _aiModels = [];          // aakhri baar Groq se aayi list

async function groqModels(key) {
  try {
    var r = await fetch('https://api.groq.com/openai/v1/models',
                        { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return [];
    var j = await r.json();
    return (j.data || []).map(function (m) { return m.id; });
  } catch (e) { return []; }
}

/* Chat ke liye theek model chuno. Whisper (audio), guard (moderation)
   aur TTS wale kaam ke nahi -- unhe pehle hi hata dete hain. */
function pickChatModel(ids) {
  var ok = ids.filter(function (m) {
    return !/whisper|guard|tts|embed|vision|distil/i.test(m);
  });
  var score = function (m) {
    var s = 0;
    if (/llama/i.test(m)) s += 40;
    if (/gpt-oss/i.test(m)) s += 30;
    if (/versatile|instruct/i.test(m)) s += 10;
    var b = (m.match(/(\d+)\s*b/i) || [])[1];
    if (b) s += Math.min(+b, 200) / 10;      // bada model behtar, par hadd me
    if (/instant|8b/i.test(m)) s -= 5;
    return s;
  };
  ok.sort(function (a, b) { return score(b) - score(a); });
  return ok[0] || ids[0] || null;
}

/* Groq se ek chat maango. Model band ho gaya ho to ek baar list
   mangwa kar dobara koshish karte hain. Jawaab: {text} ya {error}. */
async function groqChat(cfg, messages, maxTokens) {
  if (typeof fetch !== 'function') return { error: 'This Node build is too old (no fetch). Node 18+ is required.' };

  async function call(model) {
    var ctl = new AbortController();
    var tmr = setTimeout(function () { ctl.abort(); }, 30000);
    try {
      var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
        // max_tokens bhi TPM limit me ginta hai, isliye zyada mat maango
        body: JSON.stringify({ model: model, temperature: 0.2, max_tokens: maxTokens || 450, messages: messages })
      });
      var body = await r.text();
      return { ok: r.ok, status: r.status, body: body };
    } finally { clearTimeout(tmr); }
  }

  var model = _aiModel || cfg.model || 'llama-3.3-70b-versatile';
  var res = await call(model);

  // 404 / 400 = model ka naam galat ya band. Ek baar list se dobara koshish.
  if (!res.ok && (res.status === 404 || res.status === 400)) {
    var ids = await groqModels(cfg.key);
    if (ids.length) {
      _aiModels = ids;
      var alt = pickChatModel(ids);
      if (alt && alt !== model) {
        console.log('  [AI] "' + model + '" nahi chala -> "' + alt + '" try kar rahe hain');
        res = await call(alt);
        if (res.ok) { _aiModel = alt; console.log('  [AI] ab "' + alt + '" chal raha hai'); }
      }
    }
  }

  /* 429 = free tier ki token-per-minute limit. Bade model par limit tang
     hoti hai, chhote par khuli. Isliye ek baar chhote model se try karte
     hain -- 5 second ruk kar dobara poochhne se behtar hai. */
  if (!res.ok && res.status === 429) {
    var ids2 = _aiModels.length ? _aiModels : await groqModels(cfg.key);
    _aiModels = ids2;
    var small = ids2.filter(function (m) {
      return /instant|8b|20b|mini|scout/i.test(m) && !/whisper|guard|tts|embed/i.test(m);
    })[0];
    if (small && small !== model) {
      console.log('  [AI] "' + model + '" par limit lagi -> "' + small + '" try kar rahe hain');
      res = await call(small);
      if (res.ok) { _aiModel = small; console.log('  [AI] ab "' + small + '" chal raha hai'); }
    }
  }

  if (!res.ok) {
    var hint = '';
    try { hint = (JSON.parse(res.body).error || {}).message || ''; } catch (e) {}
    if (res.status === 401) hint = 'The key is wrong or has been revoked. Create a new one at console.groq.com.';
    if (res.status === 429) {
      // "Please try again in 5.09s" -- usme se sirf seconds nikal lo
      var wait = (String(hint).match(/try again in ([\d.]+)s/i) || [])[1];
      hint = 'The Groq free limit (8,000 tokens/minute) is used up. '
           + 'Please wait ' + (wait ? Math.ceil(+wait) + ' seconds' : 'a moment') + ' and ask again.';
    }
    if ((res.status === 404 || res.status === 400) && _aiModels.length) {
      hint = (hint ? hint + ' ' : '') + 'Models currently available on Groq: ' + _aiModels.slice(0, 6).join(', ');
    }
    return { error: 'The AI did not answer (HTTP ' + res.status + ')' + (hint ? ' — ' + hint : '') };
  }
  try {
    var j = JSON.parse(res.body);
    if (!_aiModel) _aiModel = model;
    return { text: (((j.choices || [])[0] || {}).message || {}).content || '' };
  } catch (e) { return { error: 'Could not understand the Groq response.' }; }
}

/* Groq par abhi kaun se model hain -- atak jaane par yahan dekh lo */
app.get('/api/ai/models', dashGuard, async function (req, res) {
  var cfg = aiConfig();
  if (!cfg || !cfg.key) return res.json({ error: 'ai_config.json has no key' });
  var ids = await groqModels(cfg.key);
  _aiModels = ids;
  res.json({ config_model: cfg.model || null, using: _aiModel, suggested: pickChatModel(ids), models: ids });
});
async function aiNarrative(rep) {
  var cfg = aiConfig();
  if (!cfg || !cfg.key || typeof fetch !== 'function') return null;
  // SIRF computed stats bhejte hain - model naya fact bana hi nahi sakta
  var stats = {
    topic: rep.topic, window: rep.trackingWindow,
    totals: { tweets: rep.volume.totalTweets, views: rep.volume.totalViews, likes: rep.volume.likes, retweets: rep.volume.retweets, handles: rep.volume.uniqueHandles },
    sentiment: rep.sent, momentum_pct: rep.momentum, peak_day: rep.peak,
    concentration_top5_handles_pct: rep.concentration, engagement_per100views: rep.engagement,
    parties: rep.parties.slice(0, 6).map(function (p) { return { party: p.party, tweets: p.total, cm: p.cm, dcm: p.dcm, mp: p.mp, mla: p.mla, pos: p.pos, neu: p.neu, neg: p.neg, sentiment: p.sentiment }; }),
    top_hashtags: rep.hashtags.slice(0, 8), top_words: (rep.topWords || []).slice(0, 8),
    top_handles: rep.handles.slice(0, 6).map(function (h) { return { h: h.h, party: h.party, tweets: h.count, views: h.vw }; }),
    top_tweets: (rep.topTweets || []).slice(0, 3).map(function (t) { return { h: t.h, party: t.party, views: t.vw, text: t.text.slice(0, 120) }; }),
    daily_last14: (rep.daily || []).slice(-14).map(function (d) { return { d: d.d, tweets: d.c }; })
  };
  var sys = 'You are a senior political social-media analyst. You will be given the COMPUTED figures (JSON) for a topic\'s tweets. '
    + 'Using only those figures, write 5-7 sharp, actionable insights in ENGLISH (one insight per line, each starting with "- "). '
    + 'STRICT RULES: (1) Never invent a fact, name, event, date or number that is not in the JSON. '
    + '(2) Tie every claim to a number from the JSON. (3) If something is an inference, say "appears to". '
    + '(4) Keep political advice objective - which narrative to amplify or counter, when to post (from peak/momentum), which hashtags to engage.';
  try {
    // wahi helper -- model band ho gaya to khud naya dhoondh lega
    var out = await groqChat(cfg, [{ role: 'system', content: sys },
                                   { role: "user", content: JSON.stringify(stats) }], 600);
    if (out.error) { console.log('  (AI skip: ' + out.error + ')'); return null; }
    var lines = String(out.text).split('\n').map(function (s) { return s.replace(/^[\s\-\*•]+/, '').trim(); }).filter(function (s) { return s.length > 15; });
    return lines.slice(0, 8);
  } catch (e) { console.log('  (AI skip: ' + e.message + ')'); return null; }
}

app.get('/api/report', async function (req, res) {
  try {
    var info = await reportPoolInfo(req.query.reload === '1');
    var kws = String(req.query.keywords || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
    var hts = String(req.query.hashtags || '').split(',').map(function(s){return s.trim();}).filter(Boolean)
                .map(function(h){ return h.charAt(0)==='#' ? h : '#'+h; });
    var topic = String(req.query.topic || '').trim();
    if (!kws.length && hts.length) kws = hts.slice();          // sirf hashtags diye -> wahi matcher
    if (!kws.length && topic) kws = [topic];
    if (!kws.length) return res.status(400).json({ error: 'Enter a topic, keyword or hashtag.' });
    var now = new Date();
    var rd = ('0'+now.getDate()).slice(-2)+'-'+_MON[now.getMonth()];

    // ---- DATE RANGE (from/to) ----
    var dFrom = String(req.query.from || '').trim();   // YYYY-MM-DD
    var dTo   = String(req.query.to   || '').trim();

    // ---- MongoDB QUERY: sirf matching tweets aate hain (poora data load nahi hota) ----
    // saare terms (topic + keywords + hashtags) ka OR -> superset, aage AND chain lagega
    var qTerms = kws.concat(hts);
    if (topic) qTerms = qTerms.concat([topic]);
    var tweets = await queryTweets(qTerms, dFrom, dTo);
    var dateNote = null;
    if (dFrom || dTo) {
      dateNote = 'Date filter: ' + (dFrom ? _fmtDate(dFrom) : 'shuru') + ' se ' + (dTo ? _fmtDate(dTo) : 'aaj') + ' tak.';
    }
    if (tweets.length >= REPORT_CAP) {
      dateNote = (dateNote ? dateNote + ' ' : '') + 'Note: match ' + REPORT_CAP.toLocaleString('en-IN') + ' se zyada the — sirf pehle ' + REPORT_CAP.toLocaleString('en-IN') + ' liye gaye. Keyword thoda specific karo ya date range lagao.';
    }

    // ---- TEEN-LEVEL AND: Topic AND Keywords AND Hashtags ----
    // Har diya hua level ek AND-shart hai. (jo level match na de use skip karke note)
    var pre = [];   // pre-filters (matcher = kws sabse aakhri shart)
    if (topic && kws.join(',').toLowerCase() !== topic.toLowerCase()) {
      pre.push({ terms: [topic].concat(topic.split(/\s+/).filter(function (w) { return w.length >= 3; })),
                 label: 'Topic "' + topic + '"' });
    }
    if (hts.length && kws.join(',') !== hts.join(',')) {
      pre.push({ terms: hts, label: 'Hashtags (' + hts.join(' ') + ')' });
    }
    var pool = tweets, applied = [], skipped = [];
    pre.forEach(function (pf) {
      var np = R.matchTweets(pool, pf.terms);
      if (R.matchTweets(np, kws).length > 0) { pool = np; applied.push(pf.label); }
      else skipped.push(pf.label);
    });
    var rep = R.aggregate(pool, { topic: topic||kws[0], keywords: kws, dateRange:_upRange, trackingWindow:_upRange, reportDate: rd });
    if (applied.length) rep.insights.unshift('AND filter applied: ' + applied.concat(['Keywords (' + kws.join(', ') + ')']).join(' + ') + ' — a tweet must match every condition.');
    if (skipped.length) rep.insights.unshift('Note: ' + skipped.join(' and ') + ' produced no COMBINED match, so that condition was dropped for this report.');
    if (dateNote) rep.insights.unshift(dateNote);
    rep.source = (REPORT_SRC === 'master') ? _lastReportStore : 'pool';
    if (rep.source === 'archive') rep.insights.unshift('Older date range -- loaded from the archive (local database).');
    rep.insights.unshift('Data source: ALL INDIA dataset + Media House + Journalist — '
      + info.n.toLocaleString('en-IN') + ' tweets ('
      + info.pol.toLocaleString('en-IN') + ' political + ' + info.mj.toLocaleString('en-IN')
      + ' media/journalist), ' + info.range + '.');
    if (rep.volume.totalTweets > 0) {
      var ai = await aiNarrative(rep);          // free Groq (optional) - fail ho to report waise hi
      if (ai && ai.length) rep.ai = ai;
    }
    res.json(rep);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- HANDLE ANALYTICS api (ha v1) ----------------------------------------
   Handle Analytics tab ka data. Sab kuch MONGO se:
     - category + handle list  ->  <scope-db>.handles   (chhoti collection,
       isme sirf wahi handle hain jinke tweets mile hain)
     - daily breakdown / charts / tweets  ->  pulse_master.master_tweets
       (ek handle ke saare tweets, Handle index par)
     - photo / cover / bio  ->  pulse_master.x_profiles  (fetch_x_profiles.py
       bharta hai; na ho to tab initials dikhata hai -- kuch tootega nahi)

   Hisaab-kitaab ha_lib.js me hai (alag file, taaki bina Mongo ke test ho sake). */
const HA = require('./ha_lib.js');
const XL = require('./x_live.js');   // click par X se live profile

/* ---- X LIVE PROFILE (xlive) --------------------------------------------
   Handle click hone par profile (naam/photo/cover/bio/followers) kahan se:
     1. pulse_master.x_profiles me taaza (<= PROF_STALE_DAYS din) ho -> wahi
     2. warna X se LIVE utha kar wahin save, phir bhejo
     3. X na de (cookie nahi / rate-limit / handle gaya) -> jo purana ho wahi,
        saath me 'why' bhej dete hain taaki tab khud bata de

   ?fresh=1  ->  taaza ho tab bhi dobara utha lo (UI ka refresh button)   */
const PROF_STALE_DAYS = 7;

function profAgeDays(p) {
  var t = p && p.fetchedAt ? Date.parse(p.fetchedAt) : NaN;
  if (!t) return 1e9;
  return (Date.now() - t) / 86400000;
}

async function haProfile(handle, force) {
  var out = { prof: null, live: false, why: '' };
  var cli = MP.client();
  var coll = null;
  try {
    await cli.connect();
    coll = cli.db(MASTER_DB).collection('x_profiles');
    try { out.prof = await coll.findOne({ _id: handle }); } catch (e) { out.prof = null; }

    var stale = !out.prof || profAgeDays(out.prof) > PROF_STALE_DAYS
                || !(out.prof.image || out.prof.cover);
    if (!force && !stale) { out.why = 'CACHE'; return out; }

    var r = await XL.fetchProfile(handle);
    if (!r.ok) {
      /* live nahi mili -- purani hi chalegi */
      out.why = r.why;
      return out;
    }

    var doc = {
      name: r.prof.name, image: r.prof.image, cover: r.prof.cover, bio: r.prof.bio,
      followers: r.prof.followers, following: r.prof.following, posts: r.prof.posts,
      fetchedAt: new Date().toISOString(), src: 'live'
    };
    try {
      await coll.updateOne({ _id: handle }, { $set: doc }, { upsert: true });
    } catch (e) { /* save na ho to bhi dikha dete hain */ }

    doc._id = handle;
    out.prof = doc;
    out.live = true;
    out.why = 'LIVE';
    return out;
  } catch (e) {
    out.why = out.why || String(e.message || e).slice(0, 80);
    return out;
  } finally { try { await cli.close(); } catch (e) {} }
}
/* ---- X LIVE PROFILE (xlive) end ---------------------------------------- */

var _haCache = {};                       // handle -> { at, rows }
var _haIdxDone = false;

/* Ek handle ke saare tweets -- 60 second cache, taaki analytics aur tweets
   dono route ek hi query par chalein. */
async function haRows(handle) {
  var key = String(handle).toLowerCase();
  var hit = _haCache[key];
  if (hit && (Date.now() - hit.at) < 60000) return hit.rows;

  var cli = MP.client();
  try {
    await cli.connect();
    var c = cli.db(MASTER_DB).collection(MASTER_COLL);

    /* Handle par index na ho to har query poori collection scan karti hai
       (21 lakh+ docs). Ek baar bana dete hain -- pehle se ho to Mongo khud
       kuch nahi karta. */
    if (!_haIdxDone) {
      _haIdxDone = true;
      try { await c.createIndex({ Handle: 1 }); } catch (e) {}
    }

    var rows = await c.find(
      { Handle: handle },
      { projection: {
          _id: 0, 'Handle': 1, 'Tweet ID': 1, 'Tweet URL': 1, 'Tweet Text': 1,
          'Tweet Date': 1, 'Followers': 1, 'Followings': 1, 'Total Posts': 1,
          'Total Comments': 1, 'Total Likes': 1, 'Total Retweets': 1,
          'Total Views': 1, 'Sentiment': 1
      } }).limit(20000).toArray();

    _haCache[key] = { at: Date.now(), rows: rows };
    /* cache ko badhne mat do */
    var ks = Object.keys(_haCache);
    if (ks.length > 40) delete _haCache[ks[0]];
    return rows;
  } finally { try { await cli.close(); } catch (e) {} }
}

function haDb(req) { return SCOPE_DB[req.query.scope === 'up' ? 'up' : 'all']; }

/* handle is scope ka hai ya nahi -- UP wale dashboard se All-India ka handle
   na khul jaaye, isliye har baar jaanch. */
async function haOwns(req, handle) {
  var cli = MP.client();
  try {
    await cli.connect();
    var d = await cli.db(haDb(req)).collection('handles').findOne({ _id: handle });
    if (d) return d;
    /* ha-cat (13-Oct): Media House / Journalist is collection me nahi hote,
       par mapping me hain aur Mongo me unke tweet bhi. Unhe bhi khulne do. */
    var ex = (await haExtraRows()).filter(function (r) {
      return String(r._id).toLowerCase() === String(handle || '').toLowerCase(); })[0];
    return ex || null;
  } finally { try { await cli.close(); } catch (e) {} }
}


/* ===== ha-cat (13-Oct): Handle Analytics ki Category bhi MAPPING se =====
   Pehle ye list 'handles' collection ke $level se banti thi -- yaani LEVEL,
   Category nahi. Ab mapping (handle_master.json) hi sach hai, bilkul waise
   hi jaise Dashboard ke card. */
/* ek hi Category do spelling me mil sakti hai ('MLA' aur 'Mla' -- purani
   Excel se bache do handle). Dashboard ke card par zyada chalne wali
   spelling laga di jaati hai; yahan bhi wahi, warna dropdown me
   "Mla (2)" naam ka ek aur option aa jaata hai. */
var _haCanon = { src: null, map: null };
function _haCanonMap(M) {
  if (_haCanon.src === M && _haCanon.map) return _haCanon.map;
  var cnt = Object.create(null);
  Object.keys(M).forEach(function (k) {
    var rec = M[k] || {};
    if (rec.alias_of) return;
    var cs = Array.isArray(rec.categories) ? rec.categories
           : (rec.category ? [rec.category] : []);
    cs.forEach(function (c) {
      c = String(c || '').trim(); if (!c || c === '-') return;
      var lc = c.toLowerCase();
      (cnt[lc] = cnt[lc] || Object.create(null));
      cnt[lc][c] = (cnt[lc][c] || 0) + 1;
    });
  });
  var out = Object.create(null);
  Object.keys(cnt).forEach(function (lc) {
    var best = null, n = -1;
    Object.keys(cnt[lc]).forEach(function (sp) {
      if (cnt[lc][sp] > n) { n = cnt[lc][sp]; best = sp; } });
    out[lc] = best;
  });
  _haCanon = { src: M, map: out };
  return out;
}
function haCatOf(h) {
  try {
    var M = MAPL.load() || {};
    var k = String(h || '').trim().replace(/^@/, '');
    var rec = M[k];
    if (!rec) {
      var low = k.toLowerCase();
      var kk = Object.keys(M).find(function (x) { return x.toLowerCase() === low; });
      rec = kk ? M[kk] : null;
    }
    if (!rec) return '';
    var cs = Array.isArray(rec.categories) ? rec.categories : [];
    var c = cs.length ? cs[0] : (rec.category || '');
    c = String(c || '').trim();
    if (!c || c === '-') return '';
    return _haCanonMap(M)[c.toLowerCase()] || c;
  } catch (e) { return ''; }
}

/* Media House / Journalist ki rows 'handles' collection me hain hi nahi
   (pipeline unhe chhod deti hai). Unke liye mapping + Mongo ke jod se
   rows bana lete hain, taaki list khaali na mile. */
async function haExtraRows() {
  var out = [];
  try {
    var agg = await mjAgg();
    var M = MAPL.load() || {};
    Object.keys(M).forEach(function (k) {
      var rec = M[k] || {};
      if (rec.alias_of) return;
      var a = agg[String(k).toLowerCase()];
      if (!a) return;
      out.push({ _id: k, name: rec.name || k, party: rec.party || '',
                 state: rec.state || '', level: (rec.levels || [])[0] || '',
                 tweets: a.tw || 0, views: a.vw || 0, likes: 0, followers: 0 });
    });
  } catch (e) {}
  return out;
}

/* ---- 1. category list (+ kitne handle) ---- */
app.get('/api/ha/cats', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var cli = MP.client();
  try {
    await cli.connect();
    /* ha-cat (13-Oct): pehle yahan Mongo me hi $group _id:'$level' hota tha.
       Ab rows la kar Category MAPPING se lagate hain -- wahi Category jo
       Dashboard ke card par dikhti hai. */
    var docs = await cli.db(haDb(req)).collection('handles')
      .find({}, { projection: { _id: 1, tweets: 1 } }).toArray();
    var extra = await haExtraRows();
    var seen = {};
    docs.forEach(function (d) { seen[String(d._id).toLowerCase()] = 1; });
    extra.forEach(function (d) {
      if (!seen[String(d._id).toLowerCase()]) docs.push({ _id: d._id, tweets: d.tweets });
    });
    var agg = {};
    docs.forEach(function (d) {
      var c = haCatOf(d._id);
      if (!c) return;                       /* mapping me nahi -> list me bhi nahi */
      var o = agg[c] || (agg[c] = { cat: c, n: 0, tw: 0 });
      o.n++; o.tw += (+d.tweets) || 0;
    });
    var out = Object.keys(agg).map(function (c) { return agg[c]; })
      .sort(function (a, b) { return b.tw - a.tw || b.n - a.n; });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally { try { await cli.close(); } catch (e) {} }
});

/* ---- 2. ek category ke handle ---- */
app.get('/api/ha/handles', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var cat = String(req.query.cat || '').trim();
  var q = String(req.query.q || '').trim();
  /* ha-cat (13-Oct): pehle yahan find.level = cat lagta tha. Category ab
     mapping se aati hai, isliye chhantai Mongo me nahi -- rows aane ke
     baad haCatOf() se hoti hai (neeche). */
  var find = {};
  if (q) {
    var rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    find.$or = [{ _id: rx }, { name: rx }];
  }
  var cli = MP.client();
  try {
    await cli.connect();
    var rows = await cli.db(haDb(req)).collection('handles')
      .find(find, { projection: { _id: 1, name: 1, party: 1, state: 1, level: 1,
                                  tweets: 1, views: 1, likes: 1, followers: 1 } })
      /* ha-sort : dropdown ab NAAM se A-Z aata hai (pehle tweet ki ginti se tha,
         isliye kram bemaani lagta tha aur handle dhoondhna mushkil).
         collation strength 1 = bada/chhota akshar aur matra ka farak nahi. */
      .collation({ locale: 'en', strength: 1 })
      .sort({ name: 1, _id: 1 })
      /* limit 600 thi -- MLA category me 2,274 handle hain, yaani A-Z karne par
         baaki sab kat jaate. Ab itni rakhi hai ki sabse badi category bhi poori aaye. */
      .limit(3000).toArray();
    /* ha-cat (13-Oct): Media House / Journalist ki rows is collection me
       hain hi nahi -- unhe mapping + Mongo ke jod se jod dete hain. */
    try {
      var _seen2 = {};
      rows.forEach(function (r) { _seen2[String(r._id).toLowerCase()] = 1; });
      (await haExtraRows()).forEach(function (r) {
        if (!_seen2[String(r._id).toLowerCase()]) rows.push(r);
      });
    } catch (e) {}
    /* extras baad me jude hain, isliye naam se kram dobara laga dete hain
       (Mongo ne sirf apni rows ka kram lagaya tha) */
    rows.sort(function (a, b) {
      var x = String(a.name || a._id || '').toLowerCase();
      var y = String(b.name || b._id || '').toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    /* Category se chhantai -- mapping ke hisaab se */
    if (cat && cat !== 'ALL') {
      rows = rows.filter(function (r) { return haCatOf(r._id) === cat; });
    }
    if (q) {
      var _rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      rows = rows.filter(function (r) { return _rx.test(String(r._id)) || _rx.test(String(r.name || '')); });
    }
    var out = rows.map(function (r) {
      return haMap({ h: r._id, name: r.name || '', party: r.party || '', state: r.state || '',
               cat: haCatOf(r._id) || r.level || '', pcName: r.pcName || '',
               tw: r.tweets || 0, vw: r.views || 0,
               lk: r.likes || 0, followers: r.followers || 0 });
    });
    /* ek hi handle, do spelling (@AmitShah / @amitshah) -> ek hi row.
       Pipeline bhi ye karta hai, par wo ghante me ek baar chalta hai --
       isliye yahan bhi jod dete hain, taaki list me kabhi do na dikhein.
       Tweet/views/likes jud jaate hain; naam/party mapping se aate hi hain. */
    /* ek hi handle, do spelling (@AmitShah / @amitshah) -> ek hi row.
       Pipeline bhi ye karta hai, par wo ghante me ek baar chalta hai --
       isliye yahan bhi jod dete hain, taaki list me kabhi do na dikhein.
       Tweet/views/likes jud jaate hain; jis spelling ka data MAPPING se
       aaya hai wahi rakhi jaati hai. */
    var _by = Object.create(null), _order = [];
    out.forEach(function (r) {
      var k = String(r.h || '').trim().toLowerCase();
      var old = _by[k];
      if (!old) { _by[k] = r; _order.push(k); return; }
      var tw = (old.tw || 0) + (r.tw || 0);
      var vw = (old.vw || 0) + (r.vw || 0);
      var lk = (old.lk || 0) + (r.lk || 0);
      var fo = Math.max(old.followers || 0, r.followers || 0);
      /* Kaun si spelling dikhegi, isi kram me:
           1. jo Mapping.xlsx me LIKHI hai (alias nahi)  <- @AmitShah
           2. jo mapping me hai
           3. warna jiske zyada tweet */
      var win = old;
      var realOld = old.inMapping && !old.isAlias;
      var realNew = r.inMapping && !r.isAlias;
      if (realNew && !realOld) win = r;
      else if (realOld === realNew) {
        if (!old.inMapping && r.inMapping) win = r;
        else if (old.inMapping === r.inMapping && (r.tw || 0) > (old.tw || 0)) win = r;
      }
      win.tw = tw; win.vw = vw; win.lk = lk; win.followers = fo;
      _by[k] = win;
    });
    out = _order.map(function (k) { return _by[k]; });

    /* jo LIKHA dikhta hai usi ke hisaab se kram -- naam khaali ho to handle se.
       (Mongo ne naam se chhanta hai; yahan wahi kram pakka kar dete hain.) */
    out.sort(function (a, b) {
      var x = (a.name || a.h || ''), y = (b.name || b.h || '');
      return x.localeCompare(y, 'en', { sensitivity: 'base', numeric: true })
          || String(a.h).localeCompare(String(b.h), 'en', { sensitivity: 'base' });
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally { try { await cli.close(); } catch (e) {} }
});

/* ---- 3. poora analysis: profile + summary + daily + top tweet ---- */
app.get('/api/ha/analytics', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var h = String(req.query.h || '').trim();
  if (!h) return res.status(400).json({ error: 'no handle supplied' });
  try {
    var meta = await haOwns(req, h);
    if (!meta) return res.status(404).json({ error: 'This handle is not part of this dashboard.' });

    var rows = await haRows(h);
    var out = HA.analyse(rows, req.query.days || 'all');

    /* photo/cover/bio -- cache me taaza ho to wahi, warna X se LIVE
       (dekho: X LIVE PROFILE (xlive)) */
    var pr = await haProfile(h, String(req.query.fresh || '') === '1');
    var prof = pr.prof;
    /* mapping ki value upar -- pipeline purana data de raha ho to bhi sahi dikhe */
    var _haM = haMap({ h: h, name: meta.name || '', party: meta.party || '',
                       state: meta.state || '', cat: meta.level || '',
                       pcName: meta.pcName || '' });

    res.json({
      profile: {
        h: h,
        name: _haM.name || (prof && prof.name) || meta.name || h,
        party: _haM.party || '', state: _haM.state || '', cat: _haM.cat || '',
        desig: _haM.desig || '', acpc: _haM.acpc || '', seat: _haM.pcName || '',
        inMapping: _haM.inMapping,
        pcName: meta.pcName || '',
        image: (prof && prof.image) || '', cover: (prof && prof.cover) || '',
        bio: (prof && prof.bio) || '',
        xFollowers: (prof && prof.followers) || 0,
        xFollowing: (prof && prof.following) || 0,
        xPosts: (prof && prof.posts) || 0,
        fetchedAt: (prof && prof.fetchedAt) || '',
        live: !!pr.live,          /* abhi X se aayi? */
        why: pr.why || '',        /* CACHE | LIVE | NOCFG | RATE | AUTH | ... */
        canLive: XL.ready()       /* cookie lagi hui hai ya nahi */
      },
      summary: out.summary,
      daily: out.daily,
      topTweet: out.topTweet,
      sent: HA.SENT_KEYS.reduce(function (o, k) { o[k] = meta[k] || 0; return o; }, {})
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---- 4. latest tweets (page by page) ---- */
app.get('/api/ha/tweets', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var h = String(req.query.h || '').trim();
  if (!h) return res.status(400).json({ error: 'no handle supplied' });
  try {
    var meta = await haOwns(req, h);
    if (!meta) return res.status(404).json({ error: 'This handle is not part of this dashboard.' });
    var rows = await haRows(h);
    res.json(HA.tweetPage(rows, req.query.offset, req.query.limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---- 5. sirf profile (refresh button / background) ---- X LIVE PROFILE (xlive) ---- */
app.get('/api/ha/profile', dashGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var h = String(req.query.h || '').trim();
  if (!h) return res.status(400).json({ error: 'no handle supplied' });
  try {
    var meta = await haOwns(req, h);
    if (!meta) return res.status(404).json({ error: 'This handle is not part of this dashboard.' });
    var pr = await haProfile(h, String(req.query.fresh || '') === '1');
    var p = pr.prof || {};
    res.json({
      h: h, name: p.name || meta.name || h,
      image: p.image || '', cover: p.cover || '', bio: p.bio || '',
      xFollowers: p.followers || 0, xFollowing: p.following || 0, xPosts: p.posts || 0,
      fetchedAt: p.fetchedAt || '', live: !!pr.live, why: pr.why || '', canLive: XL.ready()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ==================================================================
 *  HANDLE TRACKER  --  tracker-tab
 *  ------------------------------------------------------------------
 *  Admin Panel ka "Handle Tracker" tab yahan se chalta hai.
 *  Scrape ka saara kaam x_scraper.js karta hai; yahan sirf routes hain.
 *  Sab kuch adminGuard ke peeche -- sirf Backend Admin account.
 * ================================================================== */
function trkDb() {
  /* x_scraper ko ek chhota { db, close } chahiye -- pool se de dete hain.
     close() jaanbujh kar khaali hai (pool saanjha hai, MP.client() dekho). */
  return MP.client().connect().then(function () {
    return { db: MP.client().db(TRK.DB), close: async function () {} };
  });
}

app.get('/admin/tracker/state', adminGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var c = await trkDb();
    /* pending-count : kitne handle mapping ka intezaar kar rahe hain.
       Handle Tracker tab yahi ginti dikhata hai, taaki scrape ke baad user
       ko wahin pata chal jaaye -- doosra tab khole bina. */
    var pend = 0;
    try { pend = await c.db.collection(TRK.COLL_PENDHAND).countDocuments({}); } catch (e) {}
    /* probe-boot : panel "unknown" engine dikha raha tha kyunki probe kabhi
       chalta hi nahi tha -- ENGINE 'unknown' se shuru hota hai aur probe
       pehle scrape par hi hota tha. Yahan ek baar bula lete hain (probe
       khud ek hi baar chalta hai, baad me cache se lautta hai). */
    try { await SENTL.probeNow(); } catch (e) {}
    res.json({
      status: TRK.status(),
      cfg: await TRK.getCfg(c.db),
      /* handle-mapflag : har tracked handle ke saath bata do ki wo
         Mapping.xlsx me hai ya nahi -- Tracked Accounts table me
         MAPPING column isi se bharta hai. */
      handles: (await TRK.listHandles(c.db)).map(function (h) {
        var cm = MAPL.columnsFor(h._id);
        h.mapped = !!cm;
        h.mapInfo = cm ? [cm['Candidate Name'], cm['Party'], cm['State'], cm['Category']]
          .filter(Boolean).join(' \u00B7 ') : '';
        return h;
      }),
      pendingCount: pend,
      fresh: mappingFreshness(),
      msync: msyncStatus(),
      logs: TRK.logs(80)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* trk-tabs2 : Live Scrape Log tab ke liye halki route.
   /state handle list ke liye Mongo chhoota hai; log tab ko uski zaroorat
   nahi aur wo har 3 sec me poochhta hai -- isliye alag, bina Mongo wali. */
app.get('/admin/tracker/logs', adminGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var lim = Math.max(1, Math.min(400, Number(req.query.limit) || 200));
  var out = { status: TRK.status(), logs: TRK.logs(lim), cfg: {} };
  try { var c = await trkDb(); out.cfg = await TRK.getCfg(c.db); } catch (e) {}
  res.json(out);
});

/* trk-tabs2 : Tweet Database tab -- scrape hua data padho (paged) */
app.get('/admin/tracker/tweets', adminGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var c = await trkDb();
    res.json(await TRK.recentTweets(c.db, {
      handle: String(req.query.handle || '').slice(0, 40),
      q: String(req.query.q || '').slice(0, 80),
      only: String(req.query.only || '') === '1',
      /* tweet-date-filter : table apne date range par chalta hai */
      from: String(req.query.from || '').slice(0, 10),
      to: String(req.query.to || '').slice(0, 10),
      page: Number(req.query.page) || 0,
      limit: Number(req.query.limit) || 50
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================================================================
 *  HANDLE MAPPING  --  map-tab
 *  ------------------------------------------------------------------
 *  Jo handle Mapping.xlsx me nahi hai, uske scrape kiye tweet
 *  pending_tweets me RUKE rehte hain. Yahan se mapping bhari jaati hai;
 *  bharte hi wo tweet master_tweets me chale jaate hain.
 *
 *  Likhai Mapping.xlsx me hoti hai (mapping_add.py), JSON me nahi --
 *  rebuild_mapping.py saaf kehta hai "Mapping.xlsx hi MASTER hai,
 *  purani mapping ka koi data nahi uthaya jaata", yaani sirf JSON me
 *  likha hua agli rebuild par ud jaata.
 * ================================================================== */
const MAPL = require('./mapping_lib.js');
const HREQ = require('./hreq_lib.js');
const HREQUI = require('./hreq_admin.js');   /* hreq-admin */
const SENTL = require('./sentiment.js');

/* mapping_add.py chalao. rows -> temp json -> python -> JSON jawaab. */
async function runMappingAdd(rows, opts) {
  opts = opts || {};
  var os_ = require('os'), fsp = require('fs'), pathp = require('path');
  var py = await SENTL.pyCmd();
  if (!py) return { ok: false, error: 'Python not found. Writing Mapping.xlsx needs Python.' };

  var tmp = pathp.join(os_.tmpdir(), 'maprows_' + Date.now() + '_' + process.pid + '.json');
  fsp.writeFileSync(tmp, JSON.stringify({ rows: rows }), 'utf8');
  var args = [pathp.join(__dirname, 'mapping_add.py'), '--json', tmp];
  if (opts.dryRun) args.push('--dry-run');
  if (opts.noRebuild) args.push('--no-rebuild');

  return await new Promise(function (resolve) {
    var ch = require('child_process').spawn(py, args, { cwd: __dirname, windowsHide: true });
    var out = '', err = '', done = false;
    var fin = function (r) {
      if (done) return; done = true;
      try { fsp.unlinkSync(tmp); } catch (e) {}
      resolve(r);
    };
    /* rebuild 5,900 row padhta hai aur Mongo bhi chhoota hai -- 15 min do */
    var t = setTimeout(function () { try { ch.kill(); } catch (e) {} fin({ ok: false, error: 'mapping_add.py timeout' }); }, 900000);
    if (t.unref) t.unref();
    ch.stdout.on('data', function (d) { out += d; });
    ch.stderr.on('data', function (d) { err += String(d).slice(0, 4000); });
    ch.on('error', function (e) { clearTimeout(t); fin({ ok: false, error: String(e.message || e) }); });
    ch.on('close', function () {
      clearTimeout(t);
      try { fin(JSON.parse(String(out).trim())); }
      catch (e) { fin({ ok: false, error: 'Could not understand the mapping_add.py output: '
        + String(out).slice(0, 300) + (err ? ' | ' + err.slice(0, 300) : '') }); }
    });
  });
}

/* mapping bharne ke baad: cache taaza karo aur roke hue tweet chhodo */
async function releaseAll(handles) {
  MAPL._reset(); MAPL.load(true);
  var c = await trkDb(), out = [];
  for (var i = 0; i < handles.length; i++) {
    try { out.push(await TRK.releaseHandle(c.db, handles[i])); }
    catch (e) { out.push({ ok: false, handle: handles[i], why: e.message }); }
  }
  return out;
}

/* probe-boot : Mapping.xlsx aapne khud badli hai kya?
   handle_master.json rebuild_mapping.py se banta hai. Agar aap seedha Excel
   me row jod dein, to JSON purana reh jaata hai aur panel us handle ko abhi
   bhi "unmapped" samajhta hai. Isliye dono ki date dekh kar bata dete hain. */
/* haath se sync -- panel ka "Sync Mapping now" button */
app.post('/admin/mapping/sync', adminGuard, function (req, res) {
  runMappingSync('panel se maanga gaya');
  res.json({ ok: true, started: true });
});

/* sirf haal -- panel yahi poochta hai */
app.get('/admin/mapping/sync', adminGuard, function (req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(msyncStatus());
});

function mappingFreshness() {
  var fsp = require('fs'), pathp = require('path');
  var xlsx = pathp.join(__dirname, '..', 'Mapping', 'Mapping.xlsx');
  var out = { xlsx: xlsx, stale: false };
  try {
    var a = fsp.statSync(xlsx).mtimeMs;
    var b = fsp.statSync(MAPL.MAP_FILE).mtimeMs;
    out.xlsxAt = new Date(a).toISOString();
    out.jsonAt = new Date(b).toISOString();
    out.stale = a > b + 2000;          /* 2 sec ki chhoot */
  } catch (e) { out.error = e.message; }
  return out;
}

/* Mapping.xlsx se handle_master.json dobara banao (dono dashboard ke) */
app.post('/admin/tracker/rebuild-mapping', adminGuard, async function (req, res) {
  try {
    var py = await SENTL.pyCmd();
    if (!py) return res.json({ ok: false, error: 'Python not found -- a rebuild needs Python.' });
    var p = await new Promise(function (resolve) {
      var ch = require('child_process').spawn(py, [require('path').join(__dirname, 'rebuild_mapping.py'), '--apply'],
        { cwd: __dirname, windowsHide: true });
      var out = '', err = '';
      var t = setTimeout(function () { try { ch.kill(); } catch (e) {} resolve({ code: -1, out: out, err: 'timeout' }); }, 900000);
      if (t.unref) t.unref();
      ch.stdout.on('data', function (d) { out += d; });
      ch.stderr.on('data', function (d) { err += String(d).slice(0, 3000); });
      ch.on('error', function (e) { clearTimeout(t); resolve({ code: -1, out: out, err: String(e.message || e) }); });
      ch.on('close', function (code) { clearTimeout(t); resolve({ code: code, out: out, err: err }); });
    });
    MAPL._reset(); MAPL.load(true);
    TRK._clearLegacy();
    TRK.log('\u2699 Mapping rebuilt from Mapping.xlsx -- ' + MAPL.stats().handles + ' handles');
    res.json({ ok: p.code === 0, code: p.code, handles: MAPL.stats().handles,
               out: String(p.out).slice(-1800), err: String(p.err).slice(-600) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* Ek handle mapping me hai ya nahi -- Tracker tab me handle jodte waqt
   turant bata dene ke liye. */
app.get('/admin/tracker/mapcheck', adminGuard, function (req, res) {
  res.set('Cache-Control', 'no-store');
  var raw = String(req.query.handles || '');
  var names = raw.split(/[,\s]+/).map(function (x) { return TRK.clean(x); }).filter(Boolean);
  var out = names.map(function (h) {
    var c = MAPL.columnsFor(h);
    return { handle: h, mapped: !!c,
             name: c ? (c['Candidate Name'] || '') : '',
             state: c ? (c['State'] || '') : '',
             party: c ? (c['Party'] || '') : '',
             category: c ? (c['Category'] || '') : '' };
  });
  res.json({ handles: out, mapping: MAPL.stats(), fresh: mappingFreshness() });
});

/* kaun-kaunse handle mapping ka intezaar kar rahe hain + form ke dropdown */
app.get('/admin/tracker/pending', adminGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var c = await trkDb();
    var mp = MAPL.load();
    /* dropdown ke option mapping se hi banate hain -- nayi spelling
       ("Uttar Pradesh" vs "UP") dashboard ke filter tod deti hai. */
    var uniq = function (key) {
      var set = {};
      Object.keys(mp).forEach(function (k) {
        var v = MAPL.real(mp[k][key]);
        if (v) set[v] = (set[v] || 0) + 1;
      });
      return Object.keys(set).sort(function (a, b) { return set[b] - set[a] || a.localeCompare(b); });
    };
    res.json({
      handles: await TRK.pendingHandles(c.db, String(req.query.force || '') === '1',
                                        String(req.query.deep || '') === '1'),
      mapping: MAPL.stats(),
      legacy: TRK.legacyState(),      /* legacy-fix-srv */
      fresh: mappingFreshness(),
      msync: msyncStatus(),
      sentimentEngine: SENTL.engine(),
      cols: MAPL.FORM_COLS, required: MAPL.REQUIRED,
      options: { State: uniq('state'), Party: uniq('party'),
                 Category: uniq('category'), Designation: uniq('designation_raw') }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ek handle manually bharo */
app.post('/admin/tracker/map', adminGuard, express.json({ limit: '64kb' }), async function (req, res) {
  try {
    var b = req.body || {}, f = b.fields || {};
    var handle = String(b.handle || '').trim();
    if (!handle) return res.status(400).json({ ok: false, error: 'no handle supplied' });
    var miss = MAPL.validateRow(f);
    if (miss.length) return res.json({ ok: false, error: 'These columns are empty: ' + miss.join(', ') });

    var row = { 'Twitter Account': handle };
    MAPL.FORM_COLS.forEach(function (c) { row[c] = f[c] || ''; });
    var r = await runMappingAdd([row]);
    if (!r.ok) return res.json(r);
    r.released = await releaseAll([handle]);
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* ==================================================================
 *  HANDLES TO BE ADDED  --  hreq
 *  ------------------------------------------------------------------
 *  Dashboard ka user naye handle ki request bhejta hai; admin yahan se
 *  approve ya reject karta hai. Approve par wahi raasta chalta hai jo
 *  Handle Mapping tab ka hai -- Mapping.xlsx me row, phir rebuild, phir
 *  us handle ke roke hue tweet master_tweets me.
 *
 *  Request pulse_master.handle_requests me rehti hai.
 * ================================================================== */
const HREQ_COLL = 'handle_requests';

/* hreq : yahan sirf "login hai ya nahi" dekhna hai.
   dashGuard scope bhi jaanchta hai (all vs up) -- us hisaab se UP ka user
   bina ?scope=up ke block ho jaata, jabki handle ki request kisi ek scope
   ki cheez hai hi nahi. Isliye apna halka guard. */
function userGuard(req, res, next) {
  var r = roleOf(req);
  if (!r) return res.status(401).set('Cache-Control', 'no-store')
                   .json({ error: 'Your session has expired. Refresh the page.' });
  req.role = r;
  next();
}

function hreqDb() {
  return MP.client().connect().then(function () {
    return { db: MP.client().db(TRK.DB) };
  });
}

/* CSV ki ek row -> saaf object + mapping me hai ya nahi */
function hreqRow(o, line) {
  var get = o.__get || function (k) { return o[k] || ''; };
  /* 'Handle' CSV/form se aata hai; 'handle' tab aata hai jab yahi row
     /check se hokar wapas aayi ho (submit par dobara jaanch hoti hai). */
  var handle = TRK.clean(get('Handle') || get('Twitter Account') || get('handle'));
  var row = { line: line, handle: handle };
  HREQ.COLS.forEach(function (c) { if (c !== 'Handle') row[c] = String(get(c) || '').trim(); });

  var miss = [];
  if (!handle) miss.push('Handle');
  HREQ.REQUIRED.forEach(function (c) { if (!MAPL.real(row[c])) miss.push(c); });
  row.missing = miss;

  var have = handle ? MAPL.columnsFor(handle) : null;
  row.exists = !!have;
  if (have) {
    row.have = [have['Candidate Name'], have['Party'], have['State'],
                have['AC Name'] || have['PC Name'], have['Category']]
               .filter(function (x) { return x && x !== '-'; }).join(' \u00B7 ');
  }
  row.sent = [row['Candidate Name'], row['Party'], row['State'],
              row['AC Name'] || row['PC Name'], row['Category']]
             .filter(function (x) { return x && x !== '-'; }).join(' \u00B7 ');
  return row;
}

/* ---- user: template ---- */
app.get('/api/handle-request/template.csv', userGuard, function (req, res) {
  var body = '\uFEFF' + HREQ.COLS.map(MAPL.csvCell).join(',') + '\r\n'
    + HREQ.COLS.map(function (c) {
        return MAPL.csvCell(c === 'Handle' ? '' : (HREQ.REQUIRED.indexOf(c) >= 0 ? '' : '-'));
      }).join(',') + '\r\n';
  res.set('Content-Type', 'text/csv; charset=utf-8')
     .set('Content-Disposition', 'attachment; filename="handles-to-be-added.csv"')
     .set('Cache-Control', 'no-store').send(body);
});

/* ---- user: upload ki jaanch (kuch save nahi hota) ---- */
app.post('/api/handle-request/check', userGuard,
  express.text({ type: '*/*', limit: '4mb' }), function (req, res) {
  try {
    /* check-json : CSV upload aur haath se bhari row -- dono yahi route
       se guzarti hain, taaki jaanch ka niyam ek hi jagah rahe. JSON
       {rows:[...]} aaye to wahi, warna CSV samajh kar padho. */
    var body = String(req.body || '');
    var rows;
    if (body.trim().charAt(0) === '{') {
      var j = JSON.parse(body);
      rows = (Array.isArray(j.rows) ? j.rows : []).map(function (o) {
        var c = {};
        Object.keys(o).forEach(function (k) { c[k] = o[k]; });
        c.__get = function (k) { return c[k] === undefined ? '' : String(c[k]).trim(); };
        return c;
      });
      if (!rows.length) return res.json({ error: 'Nothing typed yet.' });
    } else {
      var parsed = MAPL.csvObjects(body);
      if (!parsed.rows.length) return res.json({ error: 'That file has no rows.' });
      rows = parsed.rows;
    }
    if (rows.length > 500) return res.json({ error: 'Too many rows (max 500 per request).' });
    res.json({ rows: rows.map(function (o, i) { return hreqRow(o, i + 2); }) });
  } catch (e) { res.json({ error: e.message }); }
});

/* ---- user: request bhejo ---- */
app.post('/api/handle-request/submit', userGuard,
  express.json({ limit: '4mb' }), async function (req, res) {
  try {
    var b = req.body || {};
    var rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
    if (!rows.length) return res.json({ ok: false, error: 'No rows to send.' });
    /* Client ka bheja hua sach nahi maante -- handle aur mapping ki
       jaanch yahan dobara hoti hai. */
    var clean = rows.map(function (r, i) { return hreqRow(r, r.line || (i + 2)); })
                    .filter(function (r) { return r.handle; });
    if (!clean.length) return res.json({ ok: false,
      error: 'No valid handle found -- every row needs a handle in the Handle column.' });

    var c = await hreqDb();
    var doc = {
      at: new Date(), by: emailOf(req) || '(unknown)', role: req.role || '',
      scope: String(req.query.scope || '') === 'up' ? 'up' : 'all',
      status: 'pending', remarks: String(b.remarks || '').slice(0, 2000),
      rows: clean, count: clean.length,
      handles: clean.map(function (r) { return r.handle; })
    };
    var r = await c.db.collection(HREQ_COLL).insertOne(doc);
    TRK.log('\u2709 Handle request from ' + doc.by + ' -- ' + doc.count + ' handle(s)');
    res.json({ ok: true, id: String(r.insertedId) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* ---- user: meri request ka haal ---- */
app.get('/api/handle-request/mine', userGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var c = await hreqDb();
    var me = emailOf(req) || '(unknown)';
    var rows = await c.db.collection(HREQ_COLL)
      .find({ by: me }, { projection: { rows: 0 } })
      .sort({ at: -1 }).limit(30).toArray();
    res.json({ requests: rows.map(function (r) {
      return { id: String(r._id), at: r.at, status: r.status || 'pending',
               count: r.count || 0, handles: r.handles || [], remarks: r.remarks || '',
               adminNote: r.adminNote || '', added: (r.result && r.result.added) || 0 };
    }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- admin: saari request ---- */
app.get('/admin/hreq/list', adminGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    var c = await hreqDb();
    var q = {};
    if (req.query.status) q.status = String(req.query.status);
    var rows = await c.db.collection(HREQ_COLL).find(q).sort({ at: -1 }).limit(100).toArray();
    res.json({ requests: rows.map(function (r) {
      r.id = String(r._id); delete r._id; return r; }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- admin-edit : bina faisla liye sirf edit save karo ----
   QC karte waqt aadha kaam chhod kar jaana aam baat hai. Isliye "Save
   edits" alag hai -- row sudhar kar rakh do, approve baad me. */
async function hreqCleanRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 500).map(function (r, i) {
    var o = {};
    Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o.__get = function (k) { return o[k] === undefined ? '' : String(o[k]).trim(); };
    return hreqRow(o, r.line || (i + 2));
  }).filter(function (r) { return r.handle; });
}

app.post('/admin/hreq/save', adminGuard, express.json({ limit: '4mb' }), async function (req, res) {
  try {
    var b = req.body || {};
    var id = String(b.id || '');
    if (!id) return res.json({ ok: false, error: 'id chahiye' });
    var rows = await hreqCleanRows(b.rows);
    if (!rows.length) return res.json({ ok: false, error: 'no valid row' });

    var ObjectId = require('mongodb').ObjectId;
    var c = await hreqDb();
    var doc = null;
    try { doc = await c.db.collection(HREQ_COLL).findOne({ _id: new ObjectId(id) }); } catch (e) {}
    if (!doc) return res.json({ ok: false, error: 'request not found' });
    if (doc.status !== 'pending') return res.json({ ok: false, error: 'faisla ho chuka hai' });

    /* User ne jo bheja tha wo pehli baar me alag sambhal lete hain --
       baad me pata rehna chahiye ki admin ne kya badla. */
    var set = { rows: rows, count: rows.length,
      handles: rows.map(function (r) { return r.handle; }),
      editedAt: new Date(), editedBy: emailOf(req) || 'admin' };
    var upd = { $set: set };
    if (!doc.originalRows) upd.$set.originalRows = doc.rows || [];

    await c.db.collection(HREQ_COLL).updateOne({ _id: doc._id }, upd);
    res.json({ ok: true, rows: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* ---- admin: approve / reject ---- */
app.post('/admin/hreq/decide', adminGuard, express.json({ limit: '64kb' }), async function (req, res) {
  try {
    var b = req.body || {};
    var id = String(b.id || '');
    var act = b.action === 'approve' ? 'approve' : (b.action === 'reject' ? 'reject' : '');
    if (!id || !act) return res.json({ ok: false, error: 'id aur action chahiye' });

    var ObjectId = require('mongodb').ObjectId;
    var c = await hreqDb();
    var coll = c.db.collection(HREQ_COLL);
    var doc = null;
    try { doc = await coll.findOne({ _id: new ObjectId(id) }); } catch (e) {}
    if (!doc) return res.json({ ok: false, error: 'request not found' });
    if (doc.status !== 'pending') return res.json({ ok: false, error: 'is request ka faisla ho chuka hai (' + doc.status + ')' });

    var note = String(b.note || '').slice(0, 1000);

    /* admin-edit : panel se badli hui row aayi ho to WAHI sach hai.
       Server par dobara jaanchte hain -- browser jo bheje uspar bharosa
       nahi, chahe bhejne wala admin hi kyun na ho. */
    if (Array.isArray(b.rows) && b.rows.length) {
      var edited = await hreqCleanRows(b.rows);
      if (edited.length) {
        var e$ = { rows: edited, count: edited.length,
          handles: edited.map(function (r) { return r.handle; }),
          editedAt: new Date(), editedBy: emailOf(req) || 'admin' };
        if (!doc.originalRows) e$.originalRows = doc.rows || [];
        await coll.updateOne({ _id: doc._id }, { $set: e$ });
        doc.rows = edited; doc.handles = e$.handles; doc.count = edited.length;
      }
    }

    if (act === 'reject') {
      await coll.updateOne({ _id: doc._id }, { $set: { status: 'rejected',
        decidedAt: new Date(), decidedBy: emailOf(req) || 'admin', adminNote: note } });
      TRK.log('\u2716 Handle request rejected (' + doc.count + ' handle) -- ' + (note || 'no reason given'), 'warn');
      return res.json({ ok: true, status: 'rejected' });
    }

    /* approve: sirf wahi row jo mapping me nahi hain aur poori bhari hain */
    var add = (doc.rows || []).filter(function (r) {
      return r.handle && !MAPL.has(r.handle) && !(r.missing && r.missing.length); });
    var out = { added: 0, skipped: [], errors: [] };
    if (add.length) {
      var mrows = add.map(function (r) {
        var row = { 'Twitter Account': r.handle };
        MAPL.FORM_COLS.forEach(function (col) { row[col] = r[col] || ''; });
        return row;
      });
      out = await runMappingAdd(mrows);
      if (!out.ok) return res.json({ ok: false, error: out.error || 'mapping update fail' });
      out.released = await releaseAll(doc.handles || []);
    } else {
      /* kuch naya nahi -- phir bhi approve, par mapping chhui tak nahi */
      MAPL._reset(); MAPL.load(true);
      out = { ok: true, added: 0, note: 'nothing new to add' };
      out.released = await releaseAll(doc.handles || []);
    }

    await coll.updateOne({ _id: doc._id }, { $set: { status: 'approved',
      decidedAt: new Date(), decidedBy: emailOf(req) || 'admin', adminNote: note,
      result: { added: out.added || 0, rowsWritten: out.rows_written || 0,
                skipped: out.skipped || [], errors: out.errors || [],
                released: out.released || [] } } });
    TRK.log('\u2714 Handle request approved -- ' + (out.added || 0) + ' handle(s) added to the mapping');
    res.json({ ok: true, status: 'approved', added: out.added || 0, result: out });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* skip-handle : jis handle ki mapping nahi bharni use list se hata do */
app.post('/admin/tracker/skip', adminGuard, express.json({ limit: '16kb' }), async function (req, res) {
  try {
    var b = req.body || {};
    var mode = ['hide', 'stop', 'drop'].indexOf(String(b.mode || '')) >= 0 ? String(b.mode) : 'hide';
    var c = await trkDb();
    res.json(await TRK.skipHandle(c.db, b.handle, mode));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* CSV template -- jo handle ruke hue hain wo pehle se bhare hue */
app.get('/admin/tracker/map-template.csv', adminGuard, async function (req, res) {
  try {
    var c = await trkDb();
    var pend = await TRK.pendingHandles(c.db);
    var COLS = ['Handle'].concat(MAPL.FORM_COLS);
    var body = '\uFEFF' + COLS.map(MAPL.csvCell).join(',') + '\r\n';
    pend.forEach(function (p) {
      body += COLS.map(function (col) {
        return MAPL.csvCell(col === 'Handle' ? p.handle : '');
      }).join(',') + '\r\n';
    });
    res.set('Content-Type', 'text/csv; charset=utf-8')
       .set('Content-Disposition', 'attachment; filename="new-handles-mapping.csv"')
       .set('Cache-Control', 'no-store')
       .send(body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* bhari hui CSV upload. check=1 -> sirf jaanch, kuch nahi likhta. */
app.post('/admin/tracker/map-upload', adminGuard,
  express.text({ type: '*/*', limit: '8mb' }), async function (req, res) {
  try {
    var parsed = MAPL.csvObjects(req.body || '');
    if (!parsed.rows.length) return res.json({ ok: false, error: 'The CSV is empty or could not be read' });

    var rows = [], bad = [];
    parsed.rows.forEach(function (o, i) {
      var h = o.__get('Handle') || o.__get('Twitter Account');
      if (!h) { bad.push({ line: i + 2, handle: '', why: 'Handle column khaali hai' }); return; }
      var row = { 'Twitter Account': h };
      MAPL.FORM_COLS.forEach(function (c) { row[c] = o.__get(c); });
      var miss = MAPL.validateRow(row);
      if (miss.length) { bad.push({ line: i + 2, handle: h, why: 'empty: ' + miss.join(', ') }); return; }
      rows.push(row);
    });

    /* Ek bhi adhoori row ho to KUCH BHI nahi likhte. Aadhi file lag jaane se
       user ko pata hi nahi chalta ki kaun bacha aur kaun gaya. */
    if (bad.length) {
      return res.json({ ok: false, incomplete: true, bad: bad.slice(0, 200),
        badCount: bad.length, goodCount: rows.length,
        error: bad.length + ' rows are incomplete -- nothing was written. Fill them in and upload again.' });
    }
    if (String(req.query.check || '') === '1') {
      var dry = await runMappingAdd(rows, { dryRun: true });
      dry.checkOnly = true;
      return res.json(dry);
    }
    var r = await runMappingAdd(rows);
    if (!r.ok) return res.json(r);
    r.released = await releaseAll((r.handles || []).concat(
      (r.skipped || []).map(function (x) { return x.handle; })));
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* trk-csv : Tweet Database tab ka "Download CSV".
   Row ek-ek karke response me behti hain -- 4 lakh row bhi memory me
   jama nahi hoti. Filter wahi hai jo table par laga hai (tweetQuery). */
app.get('/admin/tracker/export.csv', adminGuard, async function (req, res) {
  /* csv-fullcols : wahi 28 column jo master_tweets me hain (x_scraper.TWEET_COLS),
     na ki pehle wale 10. Scrape ke 16 + mapping ke 11 + Source Folders. */
  var COLS = TRK.TWEET_COLS;
  function cell(v) {
    /* Categories aur Source Folders Mongo me ARRAY hain -- unhe jod kar
       likhte hain, warna CSV me "[object Object]" aata. */
    if (Array.isArray(v)) v = v.join(', ');
    var t = (v === null || v === undefined) ? '' : String(v);
    /* = + - @ se shuru hone wala cell Excel formula ban jaata hai --
       uske aage ek quote laga dete hain (CSV injection). */
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
  }
  try {
    var c = await trkDb();
    var cur = TRK.tweetCursor(c.db, {
      handle: String(req.query.handle || '').slice(0, 40),
      q: String(req.query.q || '').slice(0, 80),
      only: String(req.query.only || '') === '1',
      /* tweet-date-filter : CSV wahi rows de jo table par dikh rahi hain */
      from: String(req.query.from || '').slice(0, 10),
      to: String(req.query.to || '').slice(0, 10)
    }, Number(req.query.cap) || 200000);

    var name = 'tracker-tweets-' + new Date().toISOString().slice(0, 10) + '.csv';
    res.set('Content-Type', 'text/csv; charset=utf-8')
       .set('Content-Disposition', 'attachment; filename="' + name + '"')
       .set('Cache-Control', 'no-store');
    /* BOM -- iske bina Excel me non-English text toot jaata hai */
    res.write('\uFEFF' + COLS.join(',') + '\r\n');

    var n = 0;
    while (await cur.hasNext()) {
      var d = await cur.next();
      res.write(COLS.map(function (k) { return cell(d[k]); }).join(',') + '\r\n');
      n++;
    }
    try { await cur.close(); } catch (e) {}
    TRK.log('\u2B07 CSV downloaded -- ' + n + ' row(s)');
    res.end();
  } catch (e) {
    /* header ja chuke ho to ab status nahi badal sakte -- file ke ant me
       saaf likh dete hain ki adhoori hai, taaki chup-chaap kat na jaaye. */
    if (res.headersSent) { res.end('\r\n"EXPORT FAILED: ' + String(e.message).replace(/"/g, "'") + '"\r\n'); }
    else res.status(500).json({ error: e.message });
    TRK.log('\u2716 CSV export failed: ' + e.message, 'err');
  }
});

/* trk-tabs2 : kisi ek handle ka apna scrape window (khaali = default) */
app.post('/admin/tracker/hwin', adminGuard, express.json({ limit: '16kb' }), async function (req, res) {
  try {
    var c = await trkDb();
    await TRK.setHandleWindow(c.db, req.body.handle, req.body.windowHours);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/tracker/add', adminGuard, express.json({ limit: '64kb' }), async function (req, res) {
  try {
    var c = await trkDb();
    res.json(await TRK.addHandles(c.db, (req.body && req.body.handles) || ''));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/tracker/toggle', adminGuard, express.json({ limit: '16kb' }), async function (req, res) {
  try {
    var c = await trkDb();
    await TRK.setActive(c.db, req.body.handle, !!req.body.active);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/tracker/remove', adminGuard, express.json({ limit: '16kb' }), async function (req, res) {
  try {
    var c = await trkDb();
    await TRK.removeHandle(c.db, req.body.handle);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/tracker/cfg', adminGuard, express.json({ limit: '16kb' }), async function (req, res) {
  try {
    var c = await trkDb();
    res.json(await TRK.setCfg(c.db, req.body || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Scrape lamba chal sakta hai -- isliye turant jawaab de dete hain aur
   kaam background me chalta rehta hai. Panel har 5 sec me haal poochhta hai. */
app.post('/admin/tracker/run', adminGuard, express.json({ limit: '16kb' }), function (req, res) {
  /* trk-tabs2 : body me only:"handle" ho to sirf wahi handle scrape hota hai
     (table me har row ka apna Scrape button). Bina body -> sab handle. */
  var only = (req.body && req.body.only) ? String(req.body.only).slice(0, 40) : null;
  if (TRK.status().running) return res.json({ started: false, skipped: true });
  /* tweet-date-filter : panel par jo window CHUNA hua hai wahi is run par
     lagta hai, chahe Save dabaya ho ya nahi. Pehle Save bhoolne par purana
     saved window chalta tha aur user ko lagta tha window maana hi nahi gaya. */
  var opts = only ? { only: only } : {};
  var wh = Number(req.body && req.body.windowHours);
  if (wh > 0) opts.windowHours = Math.max(1, Math.min(2160, Math.round(wh)));
  TRK.runOnce(trkDb, opts)
     .catch(function (e) { TRK.log('run error: ' + e.message, 'err'); });
  res.json({ started: true, only: only, windowHours: opts.windowHours || null });
});

app.post('/admin/tracker/stop', adminGuard, function (req, res) {
  TRK.stop();
  res.json({ ok: true });
});

/* ---- audit-fix T2 (A13): sehat ki jaanch -----------------------
   Pehle ye jaanne ka koi tarika nahi tha ki server zinda hai par Mongo se
   kat chuka hai, ya pipeline kab se nahi chala. uncaughtException handler
   process ko zinda rakhta hai, isliye "chal raha hai" ka matlab "theek hai"
   nahi hota. Ab ek line me sab pata:
       http://localhost:3000/healthz
   Login nahi maangta (sirf haalat batata hai, data nahi). */
/* hot/cold plan, Phase 5.5: HOT ka haal (admin). Password kabhi nahi dikhta. */
app.get('/admin/hot-status', adminGuard, async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var out = MP.hotStatus();
  out.reads = HOT_STATS; out.dashboards = DASH_HOT;
  try {
    var st = JSON.parse(fs.readFileSync(path.join(__dirname, '.hot_state.json'), 'utf8'));
    out.guard = st;
  } catch (e) { }
  out.resyncPending = fs.existsSync(path.join(__dirname, '.hot_resync'));
  try { out.lastResync = fs.readFileSync(path.join(__dirname, '.hot_resync_done'), 'utf8').trim(); } catch (e) { }
  if (MP.HOT.enabled && out.healthy) {
    try {
      var h = MP.hotClient(); await h.connect();
      var s = await h.db().command({ dbStats: 1 });
      out.sizeMB = Math.round(((s.dataSize || 0) + (s.indexSize || 0)) / 1e5) / 10;
      out.maxMB = MP.HOT.max_mb;
    } catch (e) { out.sizeError = String(e.message).slice(0, 120); }
  }
  res.json(out);
});

app.get('/healthz', async function (req, res) {
  res.set('Cache-Control', 'no-store');
  var out = { ok: true, uptimeSec: Math.round(process.uptime()), checks: {} };

  var m = await MP.ping(3000);
  out.checks.mongo = m;
  if (!m.ok) out.ok = false;

  /* har scope ka data kitna purana hai */
  try {
    var cli = MP.client(); await cli.connect();
    for (var k in SCOPE_DB) {
      var d = await cli.db(SCOPE_DB[k]).collection('meta').findOne({ key: 'lastUpdate' });
      var v = d ? String(d.value) : '';
      var ageMin = null;
      if (v) {
        var t = Date.parse(v.replace(' ', 'T'));
        if (t) ageMin = Math.round((Date.now() - t) / 60000);
      }
      out.checks[k] = { lastUpdate: v, ageMin: ageMin };
      /* pipeline har ghante chalta hai -- 3 ghante se purana matlab kuch atka hai */
      if (ageMin === null || ageMin > 180) out.ok = false;
    }
  } catch (e) {
    out.ok = false; out.checks.meta = { error: String(e.message).slice(0, 120) };
  }

  /* dashboard ki collection khaali to nahi (A1 wala purana daur) */
  try {
    var cli2 = MP.client(); await cli2.connect();
    var n = await cli2.db(SCOPE_DB.all).collection('dashboard_data').estimatedDocumentCount();
    out.checks.dashboardDocs = n;
    if (!n) out.ok = false;
  } catch (e) { out.ok = false; }

  /* hot/cold plan: HOT ka haal (sirf on/off/healthy + ginti -- koi data/password nahi).
     HOT down hone se ok=false NAHI hota: site cold par poori chalti hai. */
  try {
    var hs = MP.hotStatus();
    out.checks.hot = { enabled: hs.enabled, healthy: hs.healthy, windowStart: hs.windowStart,
                       reads: HOT_STATS, dashboards: DASH_HOT };
  } catch (e) { }
  res.status(out.ok ? 200 : 503).json(out);
});

/* ---- audit-fix T2 (A13): Express error middleware ----------------
   Ye file me kahin bhi nahi tha. Kisi bhi route se exception uthta to
   Express apna default 500 bhejta -- jisme poora stack trace user ko
   dikh jaata hai. Ab ek saaf jawaab jaata hai (API ko JSON, page ko HTML)
   aur asli wajah sirf server ke log me. Ye SAARE route ke BAAD hona
   zaroori hai, isliye yahan hai. */
app.use(function (err, req, res, next) {
  console.log('!! route error ' + req.method + ' ' + req.originalUrl + ' -> '
              + (err && err.stack || err));
  if (res.headersSent) return;
  var wantsJson = String(req.path || '').indexOf('/api/') === 0
                  || String(req.headers.accept || '').indexOf('json') >= 0;
  res.status(500).set('Cache-Control', 'no-store');
  if (wantsJson) return res.json({ error: 'Something went wrong on the server. Please try again in a moment.' });
  res.set('Content-Type', 'text/html; charset=utf-8')
     .send('<pre style="font:14px monospace;padding:20px;color:#b00">'
         + 'Something went wrong on the server.\n\nPlease refresh the page in a moment.</pre>');
});

app.get('/api/build', function (req, res) {
  res.set('Cache-Control', 'no-store').json({
    build: BUILD,
    started: new Date(Date.now() - process.uptime() * 1000).toLocaleString('en-IN'),
    uptime_min: Math.round(process.uptime() / 60),
    /* dash-cache (10-Oct): page cache sach me kaam kar raha hai ya nahi */
    cache: dashCacheStats(),
    rss_mb: Math.round(process.memoryUsage().rss / 1048576),
  });
});

var server = app.listen(PORT, function () {
  console.log('\n  BUILD: ' + BUILD);
  console.log('  Political Pulse - All India (/) + UP (/up) - MongoDB se');
  console.log('  Browser me kholo:  http://localhost:' + PORT);
  console.log('  Sehat ki jaanch:   http://localhost:' + PORT + '/healthz\n');
});

/* ---- audit-fix T2 (A12): HTTP timeouts -------------------------
   Pehle koi timeout set nahi tha. Server ngrok se public hai -- ek atki
   hui ya jaanbujh kar dheemi connection hamesha ke liye socket pakad kar
   baith sakti thi. Export/report bade hote hain isliye requestTimeout
   khula rakha hai (10 min), par headers aur idle par pehra laga diya. */
server.headersTimeout = 65000;      // headers bhejne ke liye 65s
server.requestTimeout = 600000;     // poori request 10 min (bade export)
server.keepAliveTimeout = 61000;

/* ---- tracker-tab : Tracker background me chaalu ---------------------
   x_config.json me cookie na ho to khud hi chup-chaap ruk jaata hai.
   Pehla scrape turant nahi -- server ko saans lene dete hain. */
if (!NO_JOBS) setTimeout(function () {
  TRK.getCfg(MP.client().db(TRK.DB)).then(function (c) {
    if (c.autoStart === false) { console.log('  [TRACKER] autoStart band hai'); return; }
    TRK.start(trkDb, false);
  }).catch(function (e) { console.log('  [TRACKER] start skip: ' + e.message); });
}, 15000).unref();
server.timeout = 0;                 // socket-level timeout driver par chhodo

/* ---- audit-fix T2 : saaf band hona ----------------------------- */
var _closing = false;
function bye(sig) {
  if (_closing) return; _closing = true;
  console.log('\n  (' + sig + ') band kar rahe hain...');
  try { server.close(); } catch (e) {}
  MP.shutdown().then(function () { process.exit(0); },
                     function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 5000).unref();
}
process.on('SIGINT', function () { bye('SIGINT'); });
process.on('SIGTERM', function () { bye('SIGTERM'); });
