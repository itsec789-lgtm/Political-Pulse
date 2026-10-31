/* ===========================================================================
   mongo_pool.js  --  EK hi MongoDB connection pool, sab jagah ke liye

   Dikkat kya thi (audit A6 / A7):
     server.js me 35 jagah `new MongoClient(...)` tha -- yaani HAR request
     par ek NAYA client, naya TCP connection, naya handshake, aur phir
     close(). Node ka driver pooling CLIENT ke andar karta hai, isliye har
     baar naya client banane se pooling ka fayda poora khatam ho jaata tha.
     Thode se log ek saath aayein to Mongo par connection ka dher lag jaata.

     Saat jagah par timeout bhi set nahi tha -- wahan driver ka default
     30 SECOND lagta tha. Mongo band ho to main dashboard poore 30 second
     latka rehta tha, phir 500 deta tha.

     Aur jin jagah `finally` nahi tha, wahan error aane par client kabhi
     band hi nahi hota tha -- dheere-dheere connection leak hote the.

   Ab:
     Poore server me EK client, ek pool. Har call site ko wahi milta hai.
     close() jaanbujh kar kuch nahi karta -- warna ek request doosri ka
     pool band kar deti. Isse purana code bilkul waisa ka waisa chalta hai
     (`new MongoClient` ki jagah sirf `pool()` likhna hai), par andar se
     ek hi connection chalta hai.

     Mongo gir jaaye to driver khud background me dobara jodta rehta hai;
     beech ke requests 6 second me saaf error dete hain, latakte nahi.

   Use:
     const MP = require('./mongo_pool.js');
     var cli = MP.client();          // pehle: new MongoClient(MONGO_URL, OPT)
     await cli.connect();            // waise ka waisa
     ... cli.db('x').collection('y') ...
     finally { await cli.close(); }  // ab ye kuch nahi karta (pool zinda)
   =========================================================================== */
'use strict';

const { MongoClient } = require('mongodb');
const MONGO_URL = require('./mongo_conf.js');

/* Ek jagah se saare timeout. Pehle 28 jagah 6000 tha aur 7 jagah kuch bhi
   nahi (= 30000). Ab sab ek jaisa. */
const OPT = {
  serverSelectionTimeoutMS: 6000,   // Mongo band ho to itni der me haar maan lo
  connectTimeoutMS: 6000,
  socketTimeoutMS: 120000,          // bada export/report isse lamba nahi hota
  waitQueueTimeoutMS: 8000,         // pool bhara ho to anant intezaar mat karo
  maxPoolSize: 20,
  minPoolSize: 2,
  maxIdleTimeMS: 60000,
  retryReads: true,
  retryWrites: true
};

let _raw = null;        // asli MongoClient
let _ready = null;      // connect() ka promise (ek hi baar)
let _since = 0;
let _fail = null;       // aakhri connect error

function raw() {
  if (!_raw) _raw = new MongoClient(MONGO_URL, OPT);
  return _raw;
}

/* ---- mongo-heal (31-Oct) ------------------------------------------------
   Dikkat: is laptop par MongoDB ek console window me chalta tha (START_LOCAL.bat).
   Window band hui -> "consoleTerminate" -> Mongo band -> Handle Analytics par
   "connect ECONNREFUSED 127.0.0.1:27017" aur har request 6 s latakti thi.
   Ab: LOCAL Mongo se connect na ho (ECONNREFUSED) to server khud mongod.exe ko
   CHUPKE (bina window) chala deta hai -- START_LOCAL.bat wale hi path / data folder.
   Suraksha: sirf localhost URL, data folder pehle se bhara ho (khaali naya DB kabhi
   nahi), "MongoDB" Windows service na ho, 60 s me ek hi koshish.
   Band karna ho: env PULSE_NO_MONGO_AUTOSTART=1 */
const fs = require('fs');
const path = require('path');
let _healAt = 0;
function _isLocal() { return /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:27017)?(\/|$|\?)/i.test(String(MONGO_URL)); }
function _findMongod() {
  const cands = [];
  (process.env.PATH || '').split(path.delimiter).forEach(function (d) { if (d) cands.push(path.join(d, 'mongod.exe')); });
  if (process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'MongoDB', 'bin', 'mongod.exe'));
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  try {
    fs.readdirSync(path.join(pf, 'MongoDB', 'Server')).sort().reverse()
      .forEach(function (v) { cands.push(path.join(pf, 'MongoDB', 'Server', v, 'bin', 'mongod.exe')); });
  } catch (e) { }
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return c; } catch (e) { } }
  return '';
}
function _heal(err) {
  if (process.platform !== 'win32' || process.env.PULSE_NO_MONGO_AUTOSTART === '1') return;
  if (!/ECONNREFUSED/.test(String(err && err.message || err)) || !_isLocal()) return;
  if (Date.now() - _healAt < 60000) return;
  _healAt = Date.now();
  const cp = require('child_process');
  /* "MongoDB" service lagi ho to wahi sahi tareeka hai -- khud mongod mat chalao */
  cp.execFile('sc', ['query', 'MongoDB'], { windowsHide: true, timeout: 5000 }, function (scErr, out) {
    if (!scErr && /SERVICE_NAME/i.test(out || '')) {
      console.log('  [mongo-heal] MongoDB service hai par band hai -- admin se "net start MongoDB" chalao.');
      return;
    }
    const exe = _findMongod();
    if (!exe) { console.log('  [mongo-heal] mongod.exe nahi mila -- MongoDB install / START_LOCAL.bat dekho.'); return; }
    const root = path.resolve(path.dirname(exe), '..');
    let data = path.join(root, 'data'), log = path.join(root, 'mongod.log');
    if (!fs.existsSync(data)) { data = 'C:\\data\\db'; log = 'C:\\data\\mongod.log'; }
    /* sirf pehle se bhara data folder -- khaali folder par naya (khaali) DB kabhi nahi */
    let filled = false;
    try { filled = fs.readdirSync(data).some(function (f) { return /^WiredTiger|\.wt$/i.test(f); }); } catch (e) { }
    if (!filled) { console.log('  [mongo-heal] data folder khaali / nahi mila (' + data + ') -- khud nahi chalaya.'); return; }
    try {
      const ch = cp.spawn(exe, ['--dbpath', data, '--bind_ip', '127.0.0.1,::1', '--logpath', log, '--logappend'],
        { detached: true, stdio: 'ignore', windowsHide: true });
      ch.on('error', function (e) { console.log('  [mongo-heal] start fail: ' + e.message); });
      ch.unref();
      console.log('  [mongo-heal] MongoDB band tha -- bina window chala diya (' + exe + ')');
    } catch (e) { console.log('  [mongo-heal] start fail: ' + e.message); }
  });
}

/* Server chalte-chalte bhi Mongo gir sakta hai (window band) -- tab connect() dobara nahi
   hota, isliye har 30 s port 27017 ko halka sa chhoo kar dekh lo. */
if (process.platform === 'win32' && _isLocal() && process.env.PULSE_NO_MONGO_AUTOSTART !== '1') {
  setInterval(function () {
    const s = require('net').connect({ host: '127.0.0.1', port: 27017 });
    s.setTimeout(2000);
    s.on('connect', function () { s.destroy(); });
    s.on('timeout', function () { s.destroy(); });
    s.on('error', function (e) { s.destroy(); if (e && e.code === 'ECONNREFUSED') _heal(new Error('ECONNREFUSED (watchdog)')); });
  }, 30000).unref();
}

/* connect() kai jagah se bulaaya jaata hai -- ek hi baar asli connect ho. */
function ensure() {
  if (_ready) return _ready;
  _ready = raw().connect().then(function (c) {
    _since = Date.now(); _fail = null;
    return c;
  }).catch(function (e) {
    _ready = null;                 // agli request dobara koshish kar sake
    _fail = e;
    _heal(e);                      // mongo-heal: local Mongo band ho to chupke se chala do
    throw e;
  });
  return _ready;
}

/* Purane code jaisa dikhne wala handle. */
function client() {
  return {
    connect: ensure,
    db: function (n) { return raw().db(n); },
    /* Pool sab ka saanjha hai -- ek request use band nahi kar sakti.
       Isliye ye jaanbujh kar khaali hai. */
    close: async function () { }
  };
}

/* /healthz ke liye */
async function ping(timeoutMs) {
  const t0 = Date.now();
  try {
    await ensure();
    await raw().db('admin').command({ ping: 1 },
      { maxTimeMS: timeoutMs || 3000 });
    return { ok: true, ms: Date.now() - t0, since: _since };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 120) };
  }
}

/* Server band hote waqt saaf-safai (sirf yahin se asli close hota hai). */
async function shutdown() {
  try { if (_raw) await _raw.close(); } catch (e) { }
  _raw = null; _ready = null;
}

/* ---- HOT store (Atlas, last N days) -- hot/cold plan, Phase 1 ----------
   Alag pool, chhote timeout: Atlas door hai, wo atke to dashboard na atke.
   HOT band ho (ya URL na ho) to hotClient() = null aur hotHealthy() = false,
   yaani har route COLD (local) par chalta hai -- bilkul aaj jaisa.        */
const HC = require('./hot_conf.js');
const HOT_OPT = {
  compressors: ['zlib'],          // Atlas M0: 10 GB/week transfer -- wire compression
  serverSelectionTimeoutMS: 4000,
  connectTimeoutMS: 4000,
  socketTimeoutMS: 60000,
  waitQueueTimeoutMS: 6000,
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
  retryReads: true,
  retryWrites: true
};
let _hotRaw = null, _hotReady = null;
let _hotState = { ok: false, at: 0, ms: 0, error: HC.HOT.enabled ? 'not checked yet' : 'disabled' };
const HOT_RECHECK_MS = 30000;

function hotRaw() {
  if (!_hotRaw) _hotRaw = new MongoClient(HC.HOT.url, HOT_OPT);
  return _hotRaw;
}
function hotEnsure() {
  if (_hotReady) return _hotReady;
  _hotReady = hotRaw().connect().catch(function (e) { _hotReady = null; throw e; });
  return _hotReady;
}
/* null = HOT band. Warna client() jaisa hi handle. */
function hotClient() {
  if (!HC.HOT.enabled) return null;
  return {
    connect: hotEnsure,
    db: function (n) { return hotRaw().db(n || HC.HOT.db); },
    close: async function () { }
  };
}
/* Cached health: har 30 s me ek ping. Request kabhi ping par nahi rukti
   (purana jawab turant milta hai, naya ping peeche chalta hai). */
let _hotPinging = false;
async function _hotPing() {
  if (_hotPinging) return;
  _hotPinging = true;
  const t0 = Date.now();
  try {
    await hotEnsure();
    await hotRaw().db('admin').command({ ping: 1 }, { maxTimeMS: 3000 });
    _hotState = { ok: true, at: Date.now(), ms: Date.now() - t0, error: '' };
  } catch (e) {
    _hotState = { ok: false, at: Date.now(), ms: Date.now() - t0,
                  error: String(e && e.message || e).slice(0, 120) };
  } finally { _hotPinging = false; }
}
function hotHealthy() {
  if (!HC.HOT.enabled) return false;
  if (Date.now() - _hotState.at > HOT_RECHECK_MS) _hotPing();
  return _hotState.ok;
}
/* admin status ke liye (password kabhi nahi) */
function hotStatus() {
  return { enabled: HC.HOT.enabled, healthy: _hotState.ok, db: HC.HOT.db, days: HC.HOT.days,
           windowStart: HC.windowCutoff(), url: HC.masked(), lastCheck: _hotState.at,
           pingMs: _hotState.ms, error: _hotState.error };
}
async function hotShutdown() {
  try { if (_hotRaw) await _hotRaw.close(); } catch (e) { }
  _hotRaw = null; _hotReady = null;
}
if (HC.HOT.enabled) _hotPing();          // server start par pehla ping

module.exports = { client: client, ping: ping, shutdown: shutdown,
                   OPT: OPT, MONGO_URL: MONGO_URL,
                   lastError: function () { return _fail; },
                   hotClient: hotClient, hotHealthy: hotHealthy, hotStatus: hotStatus,
                   hotShutdown: hotShutdown, HOT: HC.HOT, windowCutoff: HC.windowCutoff };
