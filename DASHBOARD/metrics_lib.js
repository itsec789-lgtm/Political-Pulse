/* ------------------------------------------------------------------
   metrics_lib (29-Oct) : ek hi definition, har endpoint ke liye.
   Same metric + same conditions = same number. Kisi bhi endpoint me
   tweet/retweet, date range, handle spelling ya number-sum ka apna
   tarika mat likho -- yahin se lo.
   ------------------------------------------------------------------ */
const HC = require('./hot_conf.js');

/* Tweet   = own post  -> 'Tweet Text' does NOT start with "RT @"
   Retweet = repost    -> 'Tweet Text' starts with "RT @"            */
const RT_RE = /^RT @/;
const NOT_RT = { $not: RT_RE };
const IS_RT = RT_RE;
function isRetweet(text) { return RT_RE.test(String(text == null ? '' : text)); }

/* 'Total *' fields kabhi string me aate hain ("1,234") -- plain $sum unhe 0 maan leta hai. */
function numExpr(field) {
  return { $convert: { input: '$' + field, to: 'double', onError: 0, onNull: 0 } };
}
function sumOf(field) { return { $sum: numExpr(field) }; }

/* Date range (IST). 'Tweet Date' = "YYYY-MM-DD HH:MM:SS IST", isliye end day
   ke liye  to + '~'  (har suffix se bada) -- ' 23:59:59' wala tarika
   23:59:59 IST ka tweet chhod deta tha.
   days=N  -> aaj (IST) samet pichhle N din;  days=today -> sirf aaj.        */
function addDays(ymd, n) {
  return new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
function resolveRange(q) {
  var from = String((q && q.from) || '').trim().slice(0, 10);
  var to = String((q && q.to) || '').trim().slice(0, 10);
  var days = q && q.days;
  if (!from && !to && days === 'today') { from = to = HC.todayIST(); }
  else if (!from && !to && days && days !== 'all') {
    var n = parseInt(days, 10);
    if (!isNaN(n) && n > 0) { to = HC.todayIST(); from = addDays(to, -(n - 1)); }
  }
  return { from: from, to: to };
}
function dateCond(from, to) {
  if (!from && !to) return null;
  var c = {};
  if (from) c.$gte = from;
  if (to) c.$lte = to + '~';
  return c;
}

/* Handle spelling: Mongo me ek hi account kai casing me hai (AmitShah / amitshah).
   Asli spellings DB ke distinct 'Handle' se (10 min cache) -- har jagah wahi set. */
function normHandle(h) { return String(h == null ? '' : h).trim().replace(/^@/, '').toLowerCase(); }
var _spCache = { t: 0, map: null, p: null };
async function spellingMap(MP, db, coll) {
  if (_spCache.map && Date.now() - _spCache.t < 600000) return _spCache.map;
  if (_spCache.p) return _spCache.p;
  _spCache.p = (async function () {
    var cl = MP.client();
    try {
      await cl.connect();
      var all = await cl.db(db).collection(coll).distinct('Handle');
      var m = Object.create(null);
      all.forEach(function (h) { var k = normHandle(h); if (k) (m[k] || (m[k] = [])).push(h); });
      _spCache = { t: Date.now(), map: m, p: null };
      return m;
    } catch (e) {
      _spCache.p = null;
      return _spCache.map || Object.create(null);
    } finally { try { await cl.close(); } catch (e) {} }
  })();
  return _spCache.p;
}
async function handleSpellings(MP, db, coll, handles) {
  var m = await spellingMap(MP, db, coll);
  var out = new Set();
  (handles || []).forEach(function (h) {
    var raw = String(h == null ? '' : h).trim().replace(/^@/, '');
    if (!raw) return;
    out.add(raw); out.add(raw.toLowerCase());
    (m[normHandle(raw)] || []).forEach(function (s) { out.add(s); });
  });
  return Array.from(out);
}

/* Ratios -- har jagah ek hi formula. */
function avgPerPost(total, posts) { return posts ? Math.round((+total || 0) / posts) : 0; }
function engagementRate(likes, rts, comments, views) {
  views = +views || 0;
  return views ? ((+likes || 0) + (+rts || 0) + (+comments || 0)) / views * 100 : 0;
}

module.exports = {
  RT_RE: RT_RE, NOT_RT: NOT_RT, IS_RT: IS_RT, isRetweet: isRetweet,
  numExpr: numExpr, sumOf: sumOf,
  addDays: addDays, resolveRange: resolveRange, dateCond: dateCond,
  normHandle: normHandle, handleSpellings: handleSpellings,
  avgPerPost: avgPerPost, engagementRate: engagementRate
};
