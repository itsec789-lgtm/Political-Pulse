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

/* connect() kai jagah se bulaaya jaata hai -- ek hi baar asli connect ho. */
function ensure() {
  if (_ready) return _ready;
  _ready = raw().connect().then(function (c) {
    _since = Date.now(); _fail = null;
    return c;
  }).catch(function (e) {
    _ready = null;                 // agli request dobara koshish kar sake
    _fail = e;
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

module.exports = { client: client, ping: ping, shutdown: shutdown,
                   OPT: OPT, MONGO_URL: MONGO_URL,
                   lastError: function () { return _fail; } };
