/* ===========================================================================
   auth_lib.js  --  password, session aur login-throttle

   Teen dikkatein theek karta hai (audit A9 / A10 / A11):

   A9  Password SAADE TEXT me rakhe the -- code me bhi, Mongo me bhi, aur
       admin panel unhe dikha bhi deta tha. Jisko database ka backup mil
       jaaye usko sabka password mil jaata tha.
       Ab: scrypt hash. Purane plain-text password apne aap hash me badal
       jaate hain jab user agli baar login karta hai -- kisi ko dobara
       password banane ki zaroorat nahi.

   A10 Login par koi rok nahi thi -- koi bhi unlimited password aazma sakta
       tha. Aur password/signature ki tulna `!==` se hoti thi, jo timing se
       kuch leak kar sakti hai.
       Ab: per-IP aur per-email throttle, aur constant-time tulna.

   A11 Cookie ka secret har server start par naya banta tha, isliye HAR
       restart par sab log out ho jaate the. Ulta, kisi account ko band
       karne par bhi uska cookie 12 ghante chalta rehta tha.
       Ab: secret file me rehta hai (restart par log out nahi), par cookie
       me waqt likha hota hai aur har request par jaancha jaata hai --
       account band / password badla to cookie usi pal mar jaati hai.
   =========================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ======================= 1. PASSWORD ======================= */

const SCRYPT_N = 16384, SCRYPT_r = 8, SCRYPT_p = 1, KEYLEN = 32;
const PREFIX = 'scrypt$';

/** plain password -> "scrypt$<salt-hex>$<hash-hex>" */
function hashPw(plain) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(plain), salt,
    KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return PREFIX + salt.toString('hex') + '$' + dk.toString('hex');
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.indexOf(PREFIX) === 0;
}

/** Do string constant-time me barabar hain ya nahi (lambai alag ho to bhi safe). */
function sameSecret(a, b) {
  const x = Buffer.from(String(a == null ? '' : a), 'utf8');
  const y = Buffer.from(String(b == null ? '' : b), 'utf8');
  /* timingSafeEqual barabar lambai maangta hai -- dono ko hash kar ke
     tulna karte hain, isse lambai se bhi kuch pata nahi chalta */
  const hx = crypto.createHash('sha256').update(x).digest();
  const hy = crypto.createHash('sha256').update(y).digest();
  return crypto.timingSafeEqual(hx, hy);
}

/** Password sahi hai ya nahi. Purane plain-text bhi chalte hain.
    wapas: { ok, legacy }  -- legacy=true matlab ise hash me badalna chahiye */
function verifyPw(stored, plain) {
  if (!stored || plain == null || plain === '') return { ok: false, legacy: false };
  if (!isHashed(stored)) {
    /* purana saada password -- chalne do, par upgrade ka ishaara do */
    return { ok: sameSecret(stored, plain), legacy: true };
  }
  const parts = String(stored).split('$');
  if (parts.length !== 3) return { ok: false, legacy: false };
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const want = Buffer.from(parts[2], 'hex');
    /* Kharab/adhoori hash string par dono buffer KHAALI ban jaate the, aur
       timingSafeEqual do khaali buffer ko BARABAR maanta hai -- yaani koi
       bhi password chal jaata. Isliye pehle lambai jaanchna zaroori hai. */
    if (salt.length !== 16 || want.length !== KEYLEN) return { ok: false, legacy: false };
    const got = crypto.scryptSync(String(plain), salt, KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
    return { ok: crypto.timingSafeEqual(got, want), legacy: false };
  } catch (e) {
    return { ok: false, legacy: false };
  }
}

/* ======================= 2. SECRET ======================= */

/* Pehle: const BOOT = crypto.randomBytes(6) -- har start par naya, isliye
   har restart par sab log out. START_LIVE.bat har push par server restart
   karta hai, to ye roz kai baar hota tha.
   Ab secret ek file me rehta hai. File na ban paaye (read-only folder) to
   purane jaisa hi chalta hai -- bas tab restart par log out hoga. */
function loadSecret(dir, log) {
  const p = path.join(dir, 'auth_secret.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && typeof j.secret === 'string' && j.secret.length >= 32) return j.secret;
  } catch (e) { /* pehli baar */ }
  const sec = crypto.randomBytes(32).toString('hex');
  try {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ secret: sec, madeAt: new Date().toISOString() }), { mode: 0o600 });
    fs.renameSync(tmp, p);
    if (log) log('  [AUTH] naya session secret bana: ' + path.basename(p) + ' (ise kisi ko mat bhejo)');
  } catch (e) {
    if (log) log('  [AUTH] secret file nahi bani (' + e.message + ') -- restart par sab log out honge');
  }
  return sec;
}

/* ======================= 3. SESSION TOKEN ======================= */

/* shakl:  role~email~iatSec . signature
   Pehle iat nahi tha, isliye server ke paas cookie ko jaldi khatm karne ka
   koi tarika hi nahi tha. */
const TTL_SEC = 12 * 3600;

function sign(secret, role, email, iat) {
  const payload = role + '~' + (email || '') + '~' + iat;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return payload + '.' + sig;
}

function issue(secret, role, email) {
  return sign(secret, role, email || '', Math.floor(Date.now() / 1000));
}

const ROLES = ['up', 'punjab', 'all', 'admin', 'backend'];

/**
 * Cookie padho aur jaancho.
 * revoked(email, iatSec) -> true matlab ye cookie ab nahi chalni chahiye
 *   (account band ho gaya, ya password badal gaya cookie banne ke baad)
 * wapas: { role, email, iat }  ya  null
 */
function parse(secret, value, revoked) {
  if (!value) return null;
  const i = String(value).lastIndexOf('.');
  if (i < 0) return null;
  const payload = String(value).slice(0, i);
  const parts = payload.split('~');
  if (parts.length !== 3) return null;                 // purani shakl -> dobara login
  const role = parts[0], email = parts[1], iat = parseInt(parts[2], 10);
  if (ROLES.indexOf(role) < 0) return null;
  if (!iat || !isFinite(iat)) return null;

  if (!sameSecret(sign(secret, role, email, iat), value)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - iat > TTL_SEC) return null;                 // server-side expiry
  if (iat - now > 300) return null;                     // ghadi se chhed-chhaad
  if (typeof revoked === 'function' && revoked(email, iat)) return null;

  return { role: role, email: email, iat: iat };
}

/* ======================= 4. LOGIN THROTTLE ======================= */

/* Pehle /login par koi rok nahi thi. Ye memory me rehta hai -- restart par
   saaf ho jaata hai, jo theek hai: maksad automated guessing ko dheema
   karna hai, na ki hamesha ke liye block karna. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_IP = 20;          // 15 min me ek IP se itne fail
const MAX_EMAIL = 8;        // 15 min me ek email par itne fail
const LOCK_MS = 10 * 60 * 1000;

const _hits = new Map();    // key -> { n, first, until }

function _k(kind, v) { return kind + ':' + String(v || '').toLowerCase(); }

function _get(key) {
  const h = _hits.get(key);
  if (!h) return null;
  if (h.until && Date.now() > h.until) { _hits.delete(key); return null; }
  if (!h.until && Date.now() - h.first > WINDOW_MS) { _hits.delete(key); return null; }
  return h;
}

/** Login aazmane se pehle poochho. wapas: { allowed, retryAfterSec, why } */
function check(ip, email) {
  for (const [kind, v, max] of [['ip', ip, MAX_IP], ['em', email, MAX_EMAIL]]) {
    const h = _get(_k(kind, v));
    if (h && h.until) {
      return { allowed: false, retryAfterSec: Math.ceil((h.until - Date.now()) / 1000),
               why: kind === 'ip' ? 'ip' : 'email' };
    }
    if (h && h.n >= max) {
      h.until = Date.now() + LOCK_MS;
      return { allowed: false, retryAfterSec: Math.ceil(LOCK_MS / 1000),
               why: kind === 'ip' ? 'ip' : 'email' };
    }
  }
  return { allowed: true };
}

/** Galat password par bulao. */
function fail(ip, email) {
  for (const [kind, v] of [['ip', ip], ['em', email]]) {
    const key = _k(kind, v);
    const h = _get(key);
    if (h) h.n++;
    else _hits.set(key, { n: 1, first: Date.now(), until: 0 });
  }
  if (_hits.size > 5000) {                 // memory par lagaam
    for (const k of _hits.keys()) { _hits.delete(k); if (_hits.size < 2500) break; }
  }
}

/** Sahi login par bulao -- us email/IP ka hisaab saaf. */
function pass(ip, email) {
  _hits.delete(_k('ip', ip));
  _hits.delete(_k('em', email));
}

function _reset() { _hits.clear(); }

module.exports = {
  hashPw, verifyPw, isHashed, sameSecret,
  loadSecret, issue, parse, sign, TTL_SEC, ROLES,
  throttle: { check, fail, pass, _reset, MAX_IP, MAX_EMAIL, LOCK_MS, WINDOW_MS }
};
