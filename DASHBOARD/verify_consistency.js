/* ------------------------------------------------------------------
   verify_consistency.js (29-Oct) -- same handle + same dates = same number?

   Seedha master_tweets se (sach) ginti nikalta hai, phir har us jagah se
   milata hai jahan dashboard wahi number dikhata hai:
     - PHD (Dashboard KPI, Top 50, Retweet Summary, Parties tab, Exec)
     - daily_summary own posts (Total Tweet by Category / cat-range)
     - /api/parties/comparison, /api/narrative-groups/leader-analysis (live)
     - ha_lib.analyse (Handle Analytics)
   Kuch nahi likhta. Chalao:
     node verify_consistency.js [from] [to] [port] [handle,handle,...]
   ------------------------------------------------------------------ */
const MP = require('./mongo_pool.js');
const ML = require('./metrics_lib.js');
const HA = require('./ha_lib.js');
const http = require('http');

const FROM = process.argv[2] || '2026-10-20';
const TO = process.argv[3] || '2026-10-26';
const PORT = process.argv[4] || '3999';
const HANDLES = (process.argv[5] || 'narendramodi,RahulGandhi,myogiadityanath,AmitShah,ArvindKejriwal,yadavakhilesh,MamataOfficial,BJP4India,INCIndia,priyankagandhi').split(',');

function get(path) {
  return new Promise(function (ok) {
    http.get({ host: 'localhost', port: PORT, path: path }, function (r) {
      var b = ''; r.on('data', function (c) { b += c; });
      r.on('end', function () { try { ok(JSON.parse(b)); } catch (e) { ok(null); } });
    }).on('error', function () { ok(null); });
  });
}

(async function () {
  var cl = MP.client(); await cl.connect();
  var master = cl.db('pulse_master').collection('master_tweets');
  var summ = cl.db('pulse_master').collection('daily_summary');
  var dash = cl.db('india_Pulse');
  var agg = await dash.collection('dashboard_data').findOne({ key: 'AGG' });
  var DATES = (agg && agg.value && agg.value.dates) || [];
  var phd = {};
  (await dash.collection('phd').find({}).toArray()).forEach(function (p) {
    var k = ML.normHandle(p.h); (phd[k] || (phd[k] = [])).push(p);
  });

  var rows = [], fails = 0;
  for (var h of HANDLES) {
    var sp = await ML.handleSpellings(MP, 'pulse_master', 'master_tweets', [h]);
    /* SACH: master_tweets, own posts, IST date string range */
    var q = { Handle: { $in: sp }, 'Tweet Date': ML.dateCond(FROM, TO) };
    var truth = (await master.aggregate([{ $match: q }, { $group: { _id: null,
      all: { $sum: 1 },
      tw: { $sum: { $cond: [{ $regexMatch: { input: { $toString: '$Tweet Text' }, regex: /^RT @/ } }, 0, 1] } },
      vw: { $sum: { $cond: [{ $regexMatch: { input: { $toString: '$Tweet Text' }, regex: /^RT @/ } }, 0, ML.numExpr('Total Views')] } },
      lk: { $sum: { $cond: [{ $regexMatch: { input: { $toString: '$Tweet Text' }, regex: /^RT @/ } }, 0, ML.numExpr('Total Likes')] } },
      rt: { $sum: { $cond: [{ $regexMatch: { input: { $toString: '$Tweet Text' }, regex: /^RT @/ } }, 0, ML.numExpr('Total Retweets')] } }
    } }], { allowDiskUse: true }).toArray())[0] || { all: 0, tw: 0, vw: 0, lk: 0, rt: 0 };
    truth.rc = truth.all - truth.tw;

    /* PHD (pipeline) */
    var P = { t: 0, v: 0, k: 0, r: 0, c: 0 };
    (phd[ML.normHandle(h)] || []).forEach(function (p) {
      DATES.forEach(function (d, i) { if (d >= FROM && d <= TO) {
        P.t += +(p.t || [])[i] || 0; P.v += +(p.v || [])[i] || 0; P.k += +(p.k || [])[i] || 0;
        P.r += +(p.r || [])[i] || 0; P.c += +(p.c || [])[i] || 0; } });
    });

    /* daily_summary own */
    var S = (await summ.aggregate([{ $match: { h: { $in: sp }, d: { $gte: FROM, $lte: TO } } },
      { $group: { _id: null, tw: { $sum: { $subtract: ['$tw', { $ifNull: ['$rc', 0] }] } }, rc: { $sum: '$rc' } } }]).toArray())[0] || { tw: 0, rc: 0 };

    /* live APIs */
    var la = await get('/api/narrative-groups/leader-analysis/' + encodeURIComponent(h) + '?from=' + FROM + '&to=' + TO);
    var pc = await get('/api/parties/comparison?handles=' + encodeURIComponent(h) + '&from=' + FROM + '&to=' + TO);
    var pcs = null;
    if (pc && pc.stats) { pcs = pc.stats[h.toLowerCase()] || pc.stats[h]; }
    if (!pcs && pc && pc.leaders && pc.leaders[0]) pcs = pc.leaders[0].stats;

    /* Handle Analytics logic, same rows server.js haRows leta hai */
    var haR = await master.find({ Handle: { $in: sp }, 'Tweet Text': ML.NOT_RT, 'Tweet Date': ML.dateCond(FROM, TO) }).toArray();
    var ha = null; try { ha = HA.analyse(haR, 'all'); } catch (e) {}

    var r = {
      handle: h, truthTw: truth.tw, truthRT: truth.rc, truthViews: Math.round(truth.vw),
      phdTw: P.t, phdRT: P.c, phdViews: P.v, summaryTw: S.tw, summaryRT: S.rc,
      leaderTw: la && la.kpis ? la.kpis.totalTweets : null,
      leaderViews: la && la.kpis ? Math.round(la.kpis.totalViews) : null,
      partyCmpTw: pcs ? (pcs.tweets != null ? pcs.tweets : pcs.totalTweets) : null,
      haTw: ha && ha.summary ? ha.summary.tweets : null,
      truthAvgV: ML.avgPerPost(truth.vw, truth.tw),
      phdAvgV: ML.avgPerPost(P.v, P.t),
      haAvgV: ha && ha.summary ? ha.summary.avgViews : null
    };
    var tws = [r.phdTw, r.summaryTw, r.leaderTw, r.partyCmpTw, r.haTw].filter(function (x) { return x != null; });
    r.ok = tws.every(function (x) { return x === r.truthTw; }) && r.phdRT === r.truthRT && r.summaryRT === r.truthRT;
    if (!r.ok) fails++;
    rows.push(r);
  }
  console.log('Range ' + FROM + ' -> ' + TO + '   (dashboard dates ' + DATES[0] + ' .. ' + DATES[DATES.length - 1] + ')');
  console.table(rows);
  console.log(fails ? ('MISMATCH in ' + fails + ' handle(s)') : 'ALL MATCH');
  await cl.close(); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
