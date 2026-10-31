/* ============================================================================
 * ha_lib.js  --  Handle Analytics ka dimaag (pure functions, koi Mongo nahi)
 * ----------------------------------------------------------------------------
 * server.js sirf master_tweets se rows laata hai aur yahan de deta hai.
 * Mongo yahan se chhua nahi jaata -- isliye ye poora module bina database ke
 * test ho sakta hai (test_ha_lib.js dekho).
 *
 * Ek tweet row wahi shakl me aati hai jo master_tweets me hai:
 *   Handle, Tweet URL, Tweet ID, Tweet Date, Tweet Text,
 *   Followers, Followings, Total Posts, Total Comments, Total Likes,
 *   Total Retweets, Total Views, Sentiment, Category, Party, State
 *
 * Tweet Date ka roop: "2026-09-25 14:05:28 IST"  (pehle 10 akshar = date)
 * ========================================================================== */
'use strict';

var SENT_KEYS = ['probjp', 'antigovt', 'progovt', 'pos', 'neu', 'antibjp', 'neg', 'none'];

function num(v) {
  var n = Number(String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
}

/* "2026-09-25 14:05:28 IST" -> "2026-09-25". Kuch aur mila to '' */
function dayOf(v) {
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/* days = 7 | 30 | 'all'. Sabse NAYE tweet se peeche ginte hain, aaj se nahi --
   warna purana data wale handle par har chart khaali dikhta. */
function cutoffDay(rows, days) {
  if (!days || days === 'all') return '';
  var n = Number(days);
  if (!n || n <= 0) return '';
  var maxDay = '';
  for (var i = 0; i < rows.length; i++) {
    var d = dayOf(rows[i]['Tweet Date']);
    if (d > maxDay) maxDay = d;
  }
  if (!maxDay) return '';
  var t = new Date(maxDay + 'T00:00:00Z').getTime() - (n - 1) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/* Retweet ka counts asli tweet ka hota hai -- "Top Tweet" me usse bahar rakhte
   hain, warna har baar koi RT hi top par aa jaata hai. */
function isRetweet(r) {
  return /^RT @/.test(String(r['Tweet Text'] || ''));
}

/* ---------------------------------------------------------------------------
 * daily breakdown + summary + top tweet
 * ------------------------------------------------------------------------- */
/* er-fix v2 : engagement rate.
   eng / views * 100, 2 decimal tak, aur 0..100 ke beech capped.
   100% se upar ka matlab hai engagement views se zyada -- wo ho hi nahi
   sakta, isliye wahan data galat hai; rokna hi theek hai. */
function rate(eng, views) {
  if (!(views > 0)) return null;
  var v = (eng / views) * 100;
  if (!isFinite(v) || v < 0) return null;
  if (v > 100) v = 100;
  return Math.round(v * 100) / 100;
}

/* bina cap ke asli value -- sirf batane ke liye ki data kitna bigda hua hai */
function rawRate(eng, views) {
  if (!(views > 0)) return null;
  var v = (eng / views) * 100;
  return isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/* opt.from / opt.to (YYYY-MM-DD) diye hon to wahi range -- AI Summary ki
   "pichhle 7 / 30 din se tulna" ke liye (prevWindow). */
function analyse(rows, days, opt) {
  rows = rows || [];
  var from = (opt && opt.from) || cutoffDay(rows, days);
  var to = (opt && opt.to) || '';

  var byDay = {};        // date -> counts
  var folByDay = {};     // date -> aakhri dekha gaya followers/following
  var top = null, topScore = -1;
  var used = 0;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var d = dayOf(r['Tweet Date']);
    if (!d) continue;
    if (from && d < from) continue;
    if (to && d > to) continue;
    used++;

    var m = byDay[d];
    if (!m) m = byDay[d] = { posts: 0, likes: 0, comments: 0, views: 0, shares: 0,
                             vPosts: 0, vViews: 0, vLikes: 0, vComments: 0, vShares: 0,
                             badPosts: 0, badShares: 0, badLikes: 0, badComments: 0 };
    m.posts += 1;
    m.likes += num(r['Total Likes']);
    m.comments += num(r['Total Comments']);
    m.views += num(r['Total Views']);
    m.shares += num(r['Total Retweets']);

    /* er-fix v2 : engagement rate ke liye alag jod.
       Rate = engagement / views. Agar kisi tweet ke VIEWS scrape hi nahi
       hue (0) par uske likes/shares bhare hain, to wo tweet upar to ginta
       hai neeche nahi -- aur rate 990% jaisa bekaar ho jaata hai.
       Isliye rate SIRF un tweets se banta hai jinke views maujood hain. */
    /* er-fix v3 : har tweet ki apni jaanch.
       Ek tweet ko utne hi log like/retweet kar sakte hain jitno ne use
       DEKHA ho. Isliye engagement > views wala tweet TOOTA hua data hai
       (is project me aksar 'Total Retweets' column galat bhara hota hai).
       Aise tweet rate ke hisaab se bahar, par ginti rakhte hain taaki
       dashboard saaf bata sake. */
    var _v = num(r['Total Views']);
    if (_v > 0) {
      var _e = num(r['Total Likes']) + num(r['Total Comments']) + num(r['Total Retweets']);
      if (_e <= _v) {
        m.vPosts += 1;
        m.vViews += _v;
        m.vLikes += num(r['Total Likes']);
        m.vComments += num(r['Total Comments']);
        m.vShares += num(r['Total Retweets']);
      } else {
        m.badPosts += 1;
        /* kaun sa column akela hi views se bada hai -- wahi mujrim hai */
        if (num(r['Total Retweets']) > _v) m.badShares += 1;
        if (num(r['Total Likes']) > _v) m.badLikes += 1;
        if (num(r['Total Comments']) > _v) m.badComments += 1;
      }
    }

    /* Followers us din ka -- har tweet row me scrape ke waqt ka count hota hai.
       Ek din ke kai tweets me sabse bada le lete hain (sabse naya scrape). */
    var f = num(r['Followers']), g = num(r['Followings']);
    if (f > 0 || g > 0) {
      var cur = folByDay[d];
      if (!cur) folByDay[d] = { followers: f, following: g };
      else { if (f > cur.followers) cur.followers = f; if (g > cur.following) cur.following = g; }
    }

    if (!isRetweet(r)) {
      var score = num(r['Total Likes']) + num(r['Total Comments']) + num(r['Total Retweets']);
      if (score > topScore) { topScore = score; top = r; }
    }
  }

  var dates = Object.keys(byDay).concat(Object.keys(folByDay))
    .filter(function (v, i, a) { return a.indexOf(v) === i; })
    .sort();

  /* Jis din ka apna followers-count nahi mila, us din pichhle din wala hi
     chalta rehta hai (line toot kar zero par nahi girti). */
  var runF = null, runG = null;
  var daily = dates.map(function (d) {
    if (folByDay[d]) { runF = folByDay[d].followers; runG = folByDay[d].following; }
    var m = byDay[d] || { posts: 0, likes: 0, comments: 0, views: 0, shares: 0,
                          vPosts: 0, vViews: 0, vLikes: 0, vComments: 0, vShares: 0,
                          badPosts: 0, badShares: 0, badLikes: 0, badComments: 0 };
    var eng = m.likes + m.comments + m.shares;
    /* er-fix v3 : sirf un tweets se jinka data theek hai.
       Denominator bhi wahi tweets ke views -- isliye kabhi 100% se upar
       ja hi nahi sakta, cap lagane ki zaroorat hi nahi. */
    var vEng = (m.vLikes || 0) + (m.vComments || 0) + (m.vShares || 0);
    return {
      date: d, posts: m.posts, likes: m.likes, comments: m.comments,
      views: m.views, shares: m.shares, engagement: eng,
      engagementRate: (m.vViews > 0) ? rate(vEng, m.vViews) : null,
      followers: runF, following: runG
    };
  });

  var sum = function (k) { return daily.reduce(function (a, d) { return a + d[k]; }, 0); };
  var posts = sum('posts'), likes = sum('likes'), comments = sum('comments');
  var views = sum('views'), shares = sum('shares');
  var eng = likes + comments + shares;

  /* er-fix v2 : rate ke liye sirf wahi tweets jinke views hain */
  var vSum = function (k) {
    var t = 0;
    for (var dd in byDay) t += (byDay[dd][k] || 0);
    return t;
  };
  var vPosts = vSum('vPosts'),
      vViews = vSum('vViews'),
      vEng = vSum('vLikes') + vSum('vComments') + vSum('vShares');

  /* er-fix v3 : kitne tweets ka data toota hua mila, aur kis column me */
  var badPosts = vSum('badPosts'),
      badShares = vSum('badShares'),
      badLikes = vSum('badLikes'),
      badComments = vSum('badComments');
  var withViews = vPosts + badPosts;                  // jinke views the
  /* aadhe se zyada toote hue -> rate ka koi matlab nahi */
  var erTrust = withViews > 0 && (vPosts / withViews) >= 0.5;
  var culprit = '';
  if (badShares >= badLikes && badShares >= badComments && badShares > 0) culprit = 'Shares (Total Retweets)';
  else if (badLikes >= badComments && badLikes > 0) culprit = 'Likes';
  else if (badComments > 0) culprit = 'Comments';
  var nDays = daily.length || 1;

  /* Kaun sa column database me asli me bhara hua hai -- kitni row me non-zero.
     Agar koi column khaali hai to dashboard uska "avg 0" dikhane ke bajaye
     saaf bata deta hai ki ye data scrape hi nahi hua. Isse "Avg Likes 0" jaisa
     bharam nahi hota. */
  /* avg-fix
     Pehle ye "value 0 se badi hai?" ginta tha. Ab "column bhara hua hai?"
     ginta hai -- scraper jab value nahi deta to field Mongo me aati hi
     nahi (master_to_mongo khaali value $set nahi karta), isliye
     "nahi aayi" aur "sach me 0 thi" me farak kiya ja sakta hai.
     Ye ginti hi aage aausat ka DENOMINATOR banti hai. */
  function has(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
  }
  var cov = { rows: used, likes: 0, comments: 0, views: 0, shares: 0, followers: 0 };
  var sumL = 0, sumC = 0, sumV = 0, sumS = 0;
  for (var ci = 0; ci < rows.length; ci++) {
    var rr = rows[ci];
    var dd2 = dayOf(rr['Tweet Date']);
    if (!dd2 || (from && dd2 < from) || (to && dd2 > to)) continue;
    if (has(rr['Total Likes']))    { cov.likes++;    sumL += num(rr['Total Likes']); }
    if (has(rr['Total Comments'])) { cov.comments++; sumC += num(rr['Total Comments']); }
    if (has(rr['Total Views']))    { cov.views++;    sumV += num(rr['Total Views']); }
    if (has(rr['Total Retweets'])) { cov.shares++;   sumS += num(rr['Total Retweets']); }
    if (has(rr['Followers']))      { cov.followers++; }
  }

  /* profile ke numbers = sabse naya non-zero value */
  var followers = 0, following = 0, totalPosts = 0;
  for (var j = daily.length - 1; j >= 0; j--) {
    if (daily[j].followers) { followers = daily[j].followers; following = daily[j].following || 0; break; }
  }
  for (var k = rows.length - 1; k >= 0; k--) {
    var tp = num(rows[k]['Total Posts']);
    if (tp > totalPosts) totalPosts = tp;
  }

  return {
    daily: daily,
    summary: {
      tweets: posts,
      postsPerDay: Math.round((posts / nDays) * 10) / 10,
      /* avg-fix
         Aausat ab SIRF un tweets par jinme wo column asli me maujood hai.
         Pehle jin tweets ka data hi nahi aaya tha unhe bhi 0 maan kar
         aausat nikalta tha -- isliye adhoore data wale handle par
         "AVG LIKES 0" dikhta tha.
         Poore data wale handle (Modi, Yogi) par koi farak nahi padega.
         Column bilkul khaali ho to null -> dashboard "--" dikhata hai.
         metrics_lib (29-Oct): denominator ab hamesha tweets (posts) -- Top 50 /
         Dashboard ke "Avg Views/Post" jaisa hi, warna ek handle ke do aausat dikhte the. */
      avgLikes:    cov.likes    ? Math.round(sumL / posts) : null,
      avgComments: cov.comments ? Math.round(sumC / posts) : null,
      avgViews:    cov.views    ? Math.round(sumV / posts) : null,
      avgShares:   cov.shares   ? Math.round(sumS / posts) : null,
      totalLikes: likes, totalComments: comments, totalViews: views, totalShares: shares,
      totalEngagement: eng,
      /* er-fix v2
         Engagement rate tabhi matlab rakhta hai jab VIEWS ka data ho.
         Views na hon to null -- dashboard "--" dikha deta hai.
         Jin tweets ke views nahi mile, wo rate ke hisaab se BAAHAR hain
         (warna 990% jaisa bekaar number aata hai).
         erRaw  = bina cap ke asli value (sirf batane ke liye)
         erCap  = kya 100% par roka gaya
         erRows = kitne tweets par ye rate bana (jinke views the)
         erMiss = kitne tweets ke views missing the */
      /* er-fix v3
         Rate sirf un tweets par jinka data theek hai (engagement <= views).
         Numerator aur denominator dono wahi tweets ke -- isliye 100% se
         upar ja hi nahi sakta.
         erTrust  = bharosa karne laayak hai ya nahi (aadhe se zyada theek?)
         erRows   = kitne tweets par bana
         erBad    = kitne tweets ka data toota hua mila
         erMiss   = kitne tweets ke Views hi nahi the
         erCulprit= kaun sa column galat lag raha hai */
      engagementRate: (erTrust && vViews > 0) ? rate(vEng, vViews) : null,
      erRaw: (views > 0) ? rawRate(eng, views) : null,
      erCap: false,
      erTrust: !!erTrust,
      erRows: vPosts,
      erBad: badPosts,
      erCulprit: culprit,
      erMiss: Math.max(0, posts - withViews),
      coverage: cov,
      followers: followers, following: following, totalPosts: totalPosts,
      days: daily.length, rowsUsed: used
    },
    topTweet: top ? slimTweet(top) : null
  };
}

/* bhejne ke liye chhota tweet object (poora row bhejne ka fayda nahi) */
function slimTweet(r) {
  return {
    id: String(r['Tweet ID'] || ''),
    url: String(r['Tweet URL'] || ''),
    text: String(r['Tweet Text'] || ''),
    date: String(r['Tweet Date'] || ''),
    likes: num(r['Total Likes']),
    comments: num(r['Total Comments']),
    views: num(r['Total Views']),
    shares: num(r['Total Retweets']),
    sent: String(r['Sentiment'] || '')
  };
}

/* newest-first, phir ek page */
function tweetPage(rows, offset, limit) {
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  var sorted = (rows || []).slice().sort(function (a, b) {
    var x = String(a['Tweet Date'] || ''), y = String(b['Tweet Date'] || '');
    return x < y ? 1 : (x > y ? -1 : 0);
  });
  return {
    items: sorted.slice(offset, offset + limit).map(slimTweet),
    total: sorted.length, offset: offset, pageSize: limit
  };
}

/* ---------------------------------------------------------------------------
 * tweet-table (31-Oct): Latest Tweets ab table hai.
 *   best  = pichhle 7 din (sabse naye tweet se peeche) ka sabse zyada engagement
 *           wala tweet (likes + comments + retweets; barabar ho to views) --
 *           har load par naye sire se, isliye naya tweet aage nikle to khud badalta hai.
 *   items = pichhle 3 din ke baaki tweets newest-first, page by page (best ko dobara nahi).
 *   folGain = us din followers kitne badhe. Followers har tweet par nahi, din me
 *           ek baar (scrape ke waqt) milte hain -- isliye ek din ke saare posts ka
 *           ek hi number: us din ka count - pichhle snapshot wale din ka count.
 *   folEst = us din ki badhat ka is post ka andaazan hissa (engagement ke hisaab se).
 *   gapMin = pichhle (purane) post ke kitne minute baad ye post hua.
 * ------------------------------------------------------------------------- */
function tsOf(v) {
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
}
function tweetTable(rows, offset, limit) {
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(Math.max(Number(limit) || 6, 1), 50);
  var seen = {}, sorted = [];
  (rows || []).slice().sort(function (a, b) {
    var x = String(a['Tweet Date'] || ''), y = String(b['Tweet Date'] || '');
    return x < y ? 1 : (x > y ? -1 : 0);
  }).forEach(function (r) {
    var id = String(r['Tweet ID'] || '');
    if (id && seen[id]) return;
    if (id) seen[id] = 1;
    sorted.push(r);
  });

  var fol = {}, perDay = {}, engDay = {};
  sorted.forEach(function (r) {
    var d = dayOf(r['Tweet Date']); if (!d) return;
    perDay[d] = (perDay[d] || 0) + 1;
    engDay[d] = (engDay[d] || 0) + eng(r);
    var f = num(r['Followers']);
    if (f > (fol[d] || 0)) fol[d] = f;
  });
  var snapDays = Object.keys(fol).sort(), gain = {};
  for (var i = 1; i < snapDays.length; i++) {
    gain[snapDays[i]] = { n: fol[snapDays[i]] - fol[snapDays[i - 1]], from: snapDays[i - 1] };
  }

  var idx = new Map();
  sorted.forEach(function (r, k) { idx.set(r, k); });
  function eng(r) { return num(r['Total Likes']) + num(r['Total Comments']) + num(r['Total Retweets']); }
  function row(r) {
    var t = slimTweet(r), d = dayOf(r['Tweet Date']), k = idx.get(r);
    var older = sorted[k + 1], a = tsOf(r['Tweet Date']), b = older ? tsOf(older['Tweet Date']) : null;
    t.eng = eng(r);
    t.folGain = gain[d] ? gain[d].n : null;
    t.folFrom = gain[d] ? gain[d].from : '';
    t.dayPosts = perDay[d] || 0;
    /* folEst = us din ki badhat ka is post ka andaazan hissa -- din ke engagement me
       iska jitna hissa, utna hi followers me (sab 0 ho to barabar baant). Sirf badhat
       par; ghate ko baanta nahi jaata. Ye ANDAAZA hai -- table "est." likh kar dikhata hai. */
    t.folEst = (t.folGain > 0 && t.dayPosts) ? Math.round(t.folGain * (engDay[d] > 0 ? t.eng / engDay[d] : 1 / t.dayPosts)) : null;
    t.gapMin = (a !== null && b !== null && a >= b) ? Math.round((a - b) / 60000) : null;
    return t;
  }

  var from = cutoffDay(sorted, 7), best = null, pool = 0;
  sorted.forEach(function (r) {
    var d = dayOf(r['Tweet Date']);
    if (!d || (from && d < from)) return;
    pool++;
    if (!best || eng(r) > eng(best) || (eng(r) === eng(best) && num(r['Total Views']) > num(best['Total Views']))) best = r;
  });
  /* ha-fast (31-Oct): list me sirf pichhle 3 din ke tweets (best upar alag) -- page halka */
  var from3 = cutoffDay(sorted, 3);
  var rest = sorted.filter(function (r) { return r !== best && (!from3 || dayOf(r['Tweet Date']) >= from3); });
  return {
    best: best ? row(best) : null,
    bestPool: pool, bestFrom: from, bestTo: sorted.length ? dayOf(sorted[0]['Tweet Date']) : '',
    recentFrom: from3,
    items: rest.slice(offset, offset + limit).map(row),
    total: rest.length, all: sorted.length, offset: offset, pageSize: limit
  };
}

/* pichhla barabar samay: '7' -> chuni range se theek pehle ke 7 din ('all' me null).
   Wahi chhota summary jo AI Summary ki tulna me lagta hai. */
function prevWindow(rows, days) {
  var n = Number(days);
  if (!n || days === 'all') return null;
  var from = cutoffDay(rows, days);
  if (!from) return null;
  var t = new Date(from + 'T00:00:00Z').getTime();
  var pTo = new Date(t - 86400000).toISOString().slice(0, 10);
  var pFrom = new Date(t - n * 86400000).toISOString().slice(0, 10);
  var s = analyse(rows, 'all', { from: pFrom, to: pTo }).summary;
  if (!s.tweets) return null;
  return { from: pFrom, to: pTo, tweets: s.tweets, postsPerDay: s.postsPerDay, avgViews: s.avgViews,
           avgLikes: s.avgLikes, avgShares: s.avgShares, avgComments: s.avgComments, totalEngagement: s.totalEngagement };
}

module.exports = {
  SENT_KEYS: SENT_KEYS,
  num: num, dayOf: dayOf, cutoffDay: cutoffDay, isRetweet: isRetweet,
  analyse: analyse, prevWindow: prevWindow, tweetPage: tweetPage, tweetTable: tweetTable, slimTweet: slimTweet
};
