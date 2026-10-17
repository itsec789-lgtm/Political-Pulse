/* ===========================================================================
   x_live.js  --  ek handle ki X profile LIVE uthata hai (click ke waqt)

   Kaam kya hai:
     Handle Analytics me jab koi handle click hota hai, server yahin se
     us handle ka naam / photo / cover / bio / followers maangta hai.
     Phir server use pulse_master.x_profiles me save kar deta hai, taaki
     agli baar turant mile.

   Cookie kahan se:  DASHBOARD/x_config.json   (auth_token, ct0, twid)
     -- file na ho ya adhoori ho to ye module chup-chaap "off" ho jaata hai,
        koi exception nahi. Tab purana cached profile hi dikhega.

   X ko pareshan na karne ke liye teen guard:
     1. same-flight  : ek handle ki do request ek saath -> ek hi call
     2. fail cooldown: fail hone par us handle ko 10 min chhod dete hain
     3. rate lock    : 429 / 401 aane par 15 min poori fetching band

   Ye file sirf padhti hai, kuch likhti nahi. Mongo ka kaam server.js karta hai.
   =========================================================================== */
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CFG_FILE = path.join(__dirname, 'x_config.json');

const GQL_HOST = 'x.com';
const GQL_PATH = '/i/api/graphql/Yka-W8dz7RaEuQNkroPkYw/UserByScreenName';
const BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs' +
               '%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const FEATURES = {
  hidden_profile_likes_enabled: true,
  hidden_profile_subscriptions_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: true,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true
};

/* ---- config (har 30 sec me dobara padh lete hain, taaki cookie badalne par
        server restart na karna pade) ------------------------------------- */
var _cfg = null, _cfgAt = 0;

function cfg() {
  if (_cfg !== null && (Date.now() - _cfgAt) < 30000) return _cfg;
  _cfgAt = Date.now();
  _cfg = null;
  try {
    var c = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
    var ok = ['auth_token', 'ct0', 'twid'].every(function (k) {
      var v = String(c[k] || '').trim();
      return v && v.toUpperCase().indexOf('PASTE') < 0 && v.toUpperCase().indexOf('YAHA') < 0;
    });
    if (ok) _cfg = { auth_token: String(c.auth_token).trim(),
                     ct0: String(c.ct0).trim(),
                     twid: String(c.twid).trim() };
  } catch (e) { _cfg = null; }
  return _cfg;
}

/** Live fetch chaalu ho sakti hai ya nahi (cookie hai ya nahi). */
function ready() { return cfg() !== null; }

/* ---- guards ---------------------------------------------------------- */
var _flight   = {};   // handle -> Promise      (ek saath do call na jaayein)
var _cooldown = {};   // handle -> until-ms     (fail hua to thoda ruk jao)
var _lockTill = 0;    // 429/401 -> poori fetching band

const COOLDOWN_MS = 10 * 60 * 1000;
const LOCK_MS     = 15 * 60 * 1000;

function locked() { return Date.now() < _lockTill; }

/** Abhi is handle ko fetch karna theek hai? */
function allowed(handle) {
  if (!ready() || locked()) return false;
  var till = _cooldown[String(handle).toLowerCase()];
  return !(till && Date.now() < till);
}

/** Guards ki haalat -- UI me "kyun nahi aaya" dikhane ke liye. */
function state(handle) {
  if (!ready())  return 'NOCFG';
  if (locked())  return 'LOCKED';
  var till = _cooldown[String(handle || '').toLowerCase()];
  if (till && Date.now() < till) return 'COOLDOWN';
  return 'OK';
}

/* ---- banner URL ko size chahiye, warna load nahi hoti ---------------- */
function banner(u) {
  u = String(u || '');
  if (!u) return '';
  if (/\/\d+x\d+$|\/(web|web_retina|mobile|mobile_retina|ipad|ipad_retina)$/.test(u)) return u;
  return u + '/1500x500';
}

function pick(res) {
  var lg = (((res || {}).legacy) || {});
  var core = ((res || {}).core) || {};
  var av   = ((res || {}).avatar) || {};
  return {
    name: lg.name || core.name || '',
    image: String(av.image_url || lg.profile_image_url_https || '').replace('_normal', '_400x400'),
    cover: banner(lg.profile_banner_url),
    bio: String(lg.description || '').replace(/\n/g, ' '),
    followers: Number(lg.followers_count || 0) || 0,
    following: Number(lg.friends_count || 0) || 0,
    posts: Number(lg.statuses_count || 0) || 0
  };
}

/* ---- ek HTTP call ---------------------------------------------------- */
function callX(c, handle) {
  return new Promise(function (resolve) {
    var body = JSON.stringify({
      variables: { screen_name: handle, withSafetyModeUserFields: true },
      features: FEATURES,
      fieldToggles: { withAuxiliaryUserLabels: false }
    });
    var req = https.request({
      host: GQL_HOST, path: GQL_PATH, method: 'POST',
      headers: {
        authorization: BEARER,
        cookie: 'auth_token=' + c.auth_token + '; ct0=' + c.ct0 + '; twid=' + c.twid + '; lang=en; dnt=1',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-csrf-token': c.ct0,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
        referer: 'https://x.com/' + handle,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    }, function (r) {
      var buf = '';
      r.setEncoding('utf8');
      r.on('data', function (d) { buf += d; if (buf.length > 2e6) r.destroy(); });
      r.on('end', function () { resolve({ code: r.statusCode, text: buf }); });
    });
    req.setTimeout(20000, function () { req.destroy(); resolve({ code: 0, text: '', err: 'timeout' }); });
    req.on('error', function (e) { resolve({ code: 0, text: '', err: String(e.message || e).slice(0, 80) }); });
    req.end(body);
  });
}

/* ---- public: ek handle ki profile ------------------------------------
   wapas:  { ok:true, prof:{...} }   ya   { ok:false, why:'...' }
   why:  NOCFG | LOCKED | COOLDOWN | RATE | AUTH | NOTFOUND | HTTP nnn | <error>
   ------------------------------------------------------------------- */
function fetchProfile(handle) {
  handle = String(handle || '').trim().replace(/^@+/, '');
  if (!handle) return Promise.resolve({ ok: false, why: 'NOHANDLE' });

  var st = state(handle);
  if (st !== 'OK') return Promise.resolve({ ok: false, why: st });

  var key = handle.toLowerCase();
  if (_flight[key]) return _flight[key];

  var c = cfg();
  var p = callX(c, handle).then(function (r) {
    if (r.code === 429) { _lockTill = Date.now() + LOCK_MS; return { ok: false, why: 'RATE' }; }
    if (r.code === 401 || r.code === 403) { _lockTill = Date.now() + LOCK_MS; return { ok: false, why: 'AUTH' }; }
    if (r.code !== 200) {
      _cooldown[key] = Date.now() + COOLDOWN_MS;
      return { ok: false, why: r.err ? r.err : ('HTTP ' + r.code) };
    }
    var j;
    try { j = JSON.parse(r.text); } catch (e) {
      _cooldown[key] = Date.now() + COOLDOWN_MS;
      return { ok: false, why: 'BADJSON' };
    }
    var res = (((j.data || {}).user) || {}).result;
    if (!res) { _cooldown[key] = Date.now() + COOLDOWN_MS; return { ok: false, why: 'NOTFOUND' }; }
    var prof = pick(res);
    if (!prof.name && !prof.image) {
      _cooldown[key] = Date.now() + COOLDOWN_MS;
      return { ok: false, why: 'EMPTY' };
    }
    delete _cooldown[key];
    return { ok: true, prof: prof };
  }).catch(function (e) {
    _cooldown[key] = Date.now() + COOLDOWN_MS;
    return { ok: false, why: String(e.message || e).slice(0, 80) };
  }).then(function (out) {
    delete _flight[key];
    return out;
  });

  _flight[key] = p;
  return p;
}

/* testing ke liye */
function _reset() { _flight = {}; _cooldown = {}; _lockTill = 0; _cfg = null; _cfgAt = 0; }

/* Scraper (x_scraper.js) ko bhi wahi cookie aur wahi header chahiye --
   do jagah cookie padhne se ek jagah badalne par doosri reh jaati. */
function headersFor(handle) {
  var c = cfg();
  if (!c) return null;
  return {
    authorization: BEARER,
    cookie: 'auth_token=' + c.auth_token + '; ct0=' + c.ct0 + '; twid=' + c.twid + '; lang=en; dnt=1',
    'content-type': 'application/json',
    'x-csrf-token': c.ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en',
    referer: 'https://x.com/' + handle,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
  };
}

module.exports = { fetchProfile: fetchProfile, ready: ready, state: state,
                   banner: banner, pick: pick, _reset: _reset, CFG_FILE: CFG_FILE,
                   headersFor: headersFor, GQL_HOST: GQL_HOST };
