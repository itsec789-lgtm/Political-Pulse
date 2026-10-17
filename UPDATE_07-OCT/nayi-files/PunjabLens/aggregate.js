/* ======================================================================
   AGGREGATE
   ----------------------------------------------------------------------
   The same arithmetic build_punjab_data.py does, but in JavaScript, so the
   server can produce fresh aggregates the moment a DATE RANGE is applied.

   Why it is needed: with no date filter the dashboard is served the
   pre-built, whole-corpus aggregates - the fastest path. But ask for "the
   last 7 days" and those numbers are simply wrong, and counting on the
   loaded sample is wrong too. So the tweets in that window are read from
   Mongo and fully recounted - exact, and cached afterwards.

   The output shape is IDENTICAL to build_punjab_data.py's, otherwise not a
   single chart on the frontend would work.
   ====================================================================== */
'use strict';

function n(v) { const x = Number(v); return isFinite(x) ? x : 0; }

/* In Indian political data one party arrives under several names. This
   list mirrors the one in build_punjab_data.py - if the two drifted apart,
   party counts would change the moment a date filter was applied. */
const PARTY_ALIAS = {
  'AAM AADMI PARTY': 'AAP',
  'INDIAN NATIONAL CONGRESS': 'INC', 'CONGRESS': 'INC',
  'SHIROMANI AKALI DAL': 'SAD', 'AKALI DAL': 'SAD',
  'SAD (B)': 'SAD', 'SAD(B)': 'SAD', 'SHIROMANI AKALI DAL (BADAL)': 'SAD',
  'SHIROMANI AKALI DAL (AMRITSAR)': 'SAD(A)', 'SAD (A)': 'SAD(A)',
  'BHARATIYA JANATA PARTY': 'BJP', 'BAHUJAN SAMAJ PARTY': 'BSP',
  'PUNJAB LOK CONGRESS': 'PLC', 'SANYUKT SAMAJ MORCHA': 'SSM',
  'COMMUNIST PARTY OF INDIA': 'CPI',
  'COMMUNIST PARTY OF INDIA (MARXIST)': 'CPM', 'CPI(M)': 'CPM', 'CPI (M)': 'CPM',
  'INDEPENDENT': 'IND'
};
function party(p) {
  const s = String(p || '').trim();
  return PARTY_ALIAS[s.toUpperCase()] || s;
}

const STOP = new Set((
  'the a an and or of to in on for is are was were be been with at by from this '
  + 'that these those it its as we you they he she his her our your their i me my not no will '
  + 'would can could should has have had do does did but if so than then there here what which '
  + 'who when where why how all any both each few more most other some such only own same very '
  + 'just also into over under again further once about against between during before after '
  + 'above below up down out off too don now am pe ka ki ke ko se me mein hai hain ho ye yeh wo '
  + 'woh aur par bhi tha the na nahi kar karo kiya raha rahe https http com www amp rt '
  + 'de da di nu vich naal ate ji sri').split(' '));

const TAG_RE = /#[\wऀ-ॿ਀-੿]+/g;
const URL_RE = /https?:\/\/\S+/g;
const SPLIT_RE = /[^a-z0-9ऀ-ॿ਀-੿]+/;

function inc(map, k, by) { map.set(k, (map.get(k) || 0) + (by === undefined ? 1 : by)); }

function topPairs(map, limit) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * @param {Array} rows  documents from political_lens.tweets
 * @param {Object} meta extra meta (state, date_from, date_to, ...)
 */
/* ===== SENT8 -- 8 sentiment categories =====
   Mongo ke 'Sentiment' (yahan field ka naam 'sn') me ye values aati hain:
   Neutral, Positive, Negative, Pro-BJP, Anti-BJP, Pro-Govt, Anti-Govt
   -- aur jahan khaali ho wo 'No-Sentiment'.
   Pehle sirf 3 gine jaate the (Positive/Negative, baaki sab Neutral) --
   yaani Pro-BJP/Pro-Govt jaise tweets galti se Neutral me chale jaate the.
   positive/negative/neutral key purane hi naam hain taaki purana code na toote. */
var SENT8 = (function () {
  var CATS = [
    { k: 'probjp',   label: 'Pro-BJP',      c: '#E65100' },
    { k: 'antigovt', label: 'Anti-Govt',    c: '#AD1457' },
    { k: 'progovt',  label: 'Pro-Govt',     c: '#1565C0' },
    { k: 'positive', label: 'Positive',     c: '#16A34A' },
    { k: 'neutral',  label: 'Neutral',      c: '#94A0B8' },
    { k: 'antibjp',  label: 'Anti-BJP',     c: '#6A1B9A' },
    { k: 'negative', label: 'Negative',     c: '#DC2626' },
    { k: 'nosent',   label: 'No-Sentiment', c: '#CBD5E1' }
  ];
  var MAP = {};
  CATS.forEach(function (o) { MAP[o.label.toLowerCase().replace(/[^a-z0-9]+/g, '')] = o.k; });
  MAP['nosentiment'] = 'nosent'; MAP['none'] = 'nosent'; MAP[''] = 'nosent';
  MAP['na'] = 'nosent'; MAP['null'] = 'nosent'; MAP['nan'] = 'nosent';
  function code(v) {
    return MAP[String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '')] || 'nosent';
  }
  function blank() { var o = {}; CATS.forEach(function (c) { o[c.k] = 0; }); return o; }
  function keys() { return CATS.map(function (c) { return c.k; }); }
  function colors() { return CATS.map(function (c) { return c.c; }); }
  function labels() { return CATS.map(function (c) { return c.label; }); }
  function n(o, k) { return (o && +o[k]) || 0; }
  function tot(o) { var t = 0; CATS.forEach(function (c) { t += n(o, c.k); }); return t; }
  function pick(o) { var r = {}; CATS.forEach(function (c) { r[c.k] = n(o, c.k); }); return r; }
  return { CATS: CATS, code: code, blank: blank, keys: keys, colors: colors,
           labels: labels, n: n, tot: tot, pick: pick };
})();
if (typeof module !== 'undefined' && module.exports) module.exports.SENT8 = SENT8;
if (typeof window !== 'undefined') window.SENT8 = SENT8;

function aggregate(rows, meta) {
  const kpi = Object.assign({
    total_tweets: 0, total_likes: 0, total_retweets: 0, total_comments: 0,
    total_views: 0, total_bookmarks: 0
  }, SENT8.blank());
  let sentSum = 0;

  const parties = new Map();      // party -> obj
  const cands = new Map();        // handle(lower) -> obj
  const geo = new Map();          // constituency -> obj
  const handles = new Map();      // handle(lower) -> obj
  const cats = new Map();         // category -> obj
  const daily = new Map();        // yyyy-mm-dd -> count
  const hourly = new Array(24).fill(0);
  const words = new Map();
  const tags = new Map();

  const blank = () => Object.assign({
    tweets: 0, handles: new Set(), followers: 0, likes: 0, retweets: 0,
    comments: 0, views: 0, bookmarks: 0, engagement: 0, ssum: 0
  }, SENT8.blank());
  const sdaily = new Map();       // yyyy-mm-dd -> {code: count}

  for (const t of rows) {
    const h = String(t.h || '');
    const key = h.toLowerCase();
    const pt = party(t.pt);
    /* PEHLE: sirf Positive/Negative dekhe jaate the, baaki SAB 'neutral' me
       daal diye jaate the -- isliye Pro-BJP / Pro-Govt / Anti-Govt / Anti-BJP
       chupchap Neutral ban jaate the. Ab har category apni ginti me jaati hai. */
    const sn = SENT8.code(t.sn);
    const likes = n(t.l), rts = n(t.r), cmts = n(t.c), views = n(t.v), bms = n(t.b);
    const eng = n(t.eng) || (likes + rts + cmts);
    const ss = n(t.ss);

    kpi.total_tweets++;
    kpi.total_likes += likes; kpi.total_retweets += rts; kpi.total_comments += cmts;
    kpi.total_views += views; kpi.total_bookmarks += bms;
    kpi[sn]++; sentSum += ss;

    if (pt) {
      let p = parties.get(pt); if (!p) { p = blank(); parties.set(pt, p); }
      p.tweets++; p.likes += likes; p.retweets += rts; p.comments += cmts;
      p.views += views; p.bookmarks += bms; p.engagement += eng; p.ssum += ss;
      p[sn]++; if (h) p.handles.add(key);
    }

    if (h) {
      let c = cands.get(key);
      if (!c) {
        c = Object.assign({ name: t.cn || h, handle: h, party: pt, designation: t.dg || '',
              followers: 0, posts: 0, tweets: 0, engagement: 0, ssum: 0 }, SENT8.blank());
        cands.set(key, c);
      }
      if (t.cn && (!c.name || c.name === h)) c.name = t.cn;
      if (pt) c.party = pt;
      if (t.dg) c.designation = t.dg;
      c.tweets++; c.engagement += eng; c.ssum += ss; c[sn]++;

      let hh = handles.get(key);
      if (!hh) {
        hh = Object.assign({ handle: h, followers: 0, followings: 0, posts: 0, party: pt,
               designation: t.dg || '', candidate: t.cn || '', state: t.st || '',
               pc: t.pc || '', ac: t.ac || '', cat: t.cat || '', tweets: 0,
               views: 0, engagement: 0 }, SENT8.blank());
        handles.set(key, hh);
      }
      hh.tweets++; hh.views += views; hh.engagement += eng; hh[sn]++;
      if (t.pc && !hh.pc) hh.pc = t.pc;
      if (t.cat && !hh.cat) hh.cat = t.cat;
    }

    const cname = t.cat || 'Uncategorised';
    let cb = cats.get(cname);
    if (!cb) { cb = blank(); cats.set(cname, cb); }
    cb.tweets++; cb.views += views; cb.engagement += eng; cb[sn]++;
    if (h) cb.handles.add(key);

    if (t.pc) {
      let g = geo.get(t.pc);
      if (!g) { g = Object.assign({ state: t.st || '', tweets: 0, ssum: 0 }, SENT8.blank()); geo.set(t.pc, g); }
      g.tweets++; g.ssum += ss; g[sn]++;
    }

    const d = String(t.d || '');
    if (d) {
      const _dk = d.slice(0, 10);
      inc(daily, _dk);
      let _sd = sdaily.get(_dk);
      if (!_sd) { _sd = SENT8.blank(); sdaily.set(_dk, _sd); }
      _sd[sn]++;
      const hr = parseInt(d.slice(11, 13), 10);
      if (!isNaN(hr) && hr >= 0 && hr < 24) hourly[hr]++;
    }

    const tx = String(t.tx || '');
    if (tx) {
      const tg = tx.match(TAG_RE);
      if (tg) tg.forEach(x => inc(tags, x.toLowerCase()));
      const low = tx.toLowerCase().replace(URL_RE, ' ').replace(/[।॥]/g, ' ');
      for (const w of low.split(SPLIT_RE)) {
        if (w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)) inc(words, w);
      }
    }
  }

  /* ---- followers/posts come from the handles only (max), so the follower
     count repeated on every tweet does not get summed into nonsense ---- */
  for (const t of rows) {
    const key = String(t.h || '').toLowerCase();
    if (!key) continue;
    const hh = handles.get(key), c = cands.get(key);
    const f = n(t.f), p = n(t.po);
    if (hh) { if (f > hh.followers) hh.followers = f; if (p > hh.posts) hh.posts = p; }
    if (c) { if (f > c.followers) c.followers = f; if (p > c.posts) c.posts = p; }
  }

  const partyFollowers = new Map();
  for (const hh of handles.values()) {
    if (hh.party) partyFollowers.set(hh.party, (partyFollowers.get(hh.party) || 0) + hh.followers);
  }

  const net = o => Math.round((o.ssum / (o.tweets || 1)) * 1000) / 1000;

  const party_list = Array.from(parties.entries()).map(([name, p]) => ({
    party: name, tweets: p.tweets, handles: p.handles.size,
    followers: partyFollowers.get(name) || 0,
    likes: p.likes, retweets: p.retweets, comments: p.comments, views: p.views,
    bookmarks: p.bookmarks, engagement: p.engagement,
    avg_sentiment: net(p), ...SENT8.pick(p)
  })).sort((a, b) => b.tweets - a.tweets);

  const cand_list = Array.from(cands.values()).map(c => {
    const tw = c.tweets || 1;
    const avg = Math.round((c.ssum / tw) * 1000) / 1000;
    const score = Math.min(100, (c.engagement / 1000) + (avg * 40)
      + (Math.log10(c.followers + 1) * 3));
    return Object.assign({
      name: c.name, party: c.party, designation: c.designation, handle: c.handle,
      followers: c.followers, posts: c.posts, tweets: c.tweets,
      engagement: c.engagement, avg_sentiment: avg,
      score: Math.round(Math.max(0, score) * 10) / 10
    }, SENT8.pick(c));
  }).sort((a, b) => b.score - a.score);

  const geo_list = Array.from(geo.entries()).map(([pc, g]) => ({
    pc: pc, ac: pc, state: g.state, tweets: g.tweets,
    avg_sentiment: net(g), ...SENT8.pick(g)
  })).sort((a, b) => b.tweets - a.tweets);

  const cat_list = Array.from(cats.entries()).map(([c, v]) => ({
    category: c, tweets: v.tweets, handles: v.handles.size, views: v.views,
    engagement: v.engagement, ...SENT8.pick(v)
  })).sort((a, b) => b.tweets - a.tweets);

  const timeline_daily = Array.from(daily.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1);
  /* Daily Sentiment Trend ab ASLI ginti se banta hai (pehle sirf volume line thi). */
  const timeline_sentiment = timeline_daily.map(([d]) => [d, SENT8.pick(sdaily.get(d) || {})]);
  const timeline_hourly = hourly.map((v, i) => [i, v]);

  const top = (k, limit) => rows.slice()
    .sort((a, b) => n(b[k]) - n(a[k])).slice(0, limit)
    .map(t => Object.assign({}, t));

  const totalFollowers = Array.from(handles.values()).reduce((s, h) => s + h.followers, 0);
  Object.assign(kpi, {
    total_candidates: cand_list.length, total_parties: party_list.length,
    total_handles: handles.size, total_followers: totalFollowers,
    total_engagement: kpi.total_likes + kpi.total_retweets + kpi.total_comments,
    avg_sentiment_score: Math.round((sentSum / (kpi.total_tweets || 1)) * 1000) / 1000,
    avg_followers: Math.round((totalFollowers / (handles.size || 1)) * 10) / 10,
    avg_engagement: Math.round(((kpi.total_likes + kpi.total_retweets + kpi.total_comments)
      / (kpi.total_tweets || 1)) * 100) / 100
  });

  return Object.assign({
    kpis: kpi,
    sent_cats: SENT8.CATS,
    timeline_sentiment: timeline_sentiment,
    parties: party_list,
    candidates: cand_list,
    geo: geo_list,
    categories: cat_list,
    states: [],
    timeline_daily: timeline_daily,
    timeline_hourly: timeline_hourly,
    word_cloud: topPairs(words, 150),
    hashtags: topPairs(tags, 80),
    trending: {
      views: top('v', 20), likes: top('l', 20), retweets: top('r', 20),
      comments: top('c', 20), engagement: top('eng', 20), bookmarks: top('b', 20)
    },
    handles: Array.from(handles.values()),
    explorer: rows
  }, { meta: meta || {} });
}

module.exports = { aggregate };
