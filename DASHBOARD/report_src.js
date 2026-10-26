/* report_src.js  --  Report tab ka data-source (hot/cold plan, Phase 0.4 option b)

   Pehle: UP-DASHBOARD/push_tweets.py har pipeline run me poore master
   (~29 lakh tweets) ki copy up_pulse.tweets me banata tha -- short field
   naam (h, text, lk ...) ke saath. Report tab usi copy par regex chalata tha.

   Ab: query seedhe pulse_master.master_tweets par, aur har milne wala doc
   yahan WAHI short shape me badal diya jaata hai jo push_tweets.py banata
   tha. report_lib.js ko kuch pata nahi chalta.

   server.js aur tools/compare_report_pool.js dono yahi file use karte hain,
   taaki jo test hota hai wahi code production me chalta hai.            */
'use strict';

const PROJ = { _id: 0, 'Handle': 1, 'Candidate Name': 1, 'Tweet Text': 1, 'Party': 1,
  'Designation': 1, 'Sentiment': 1, 'Tweet Date': 1, 'Total Likes': 1, 'Total Retweets': 1,
  'Total Views': 1, 'Followers': 1, 'Tweet URL': 1, 'Category': 1 };

function s(v) { return (v === undefined || v === null) ? '' : String(v); }

// push_tweets.num():  int(float(str(x).replace(',', '')))  -- galat ho to 0
function num(v) {
  var n = parseFloat(s(v).replace(/,/g, ''));
  return isFinite(n) ? Math.trunc(n) : 0;
}

// push_tweets.level_of()
function level(desig) {
  var x = s(desig).trim();
  if (x === 'Chief Minister') return 'cm';
  if (x === 'Deputy Chief Minister') return 'dcm';
  if (x === 'LS_MP' || x === 'RS_MP' || x === 'LS_MP CANDIDATE') return 'mp';
  if (x === 'MLA' || x === 'Mla' || x === 'MLC') return 'mla';
  return '';
}

// master_tweets doc  ->  up_pulse.tweets shape
function toRow(d) {
  return {
    h: s(d['Handle']).trim(), name: s(d['Candidate Name']), text: s(d['Tweet Text']),
    party: s(d['Party']).trim(), level: level(d['Designation']), sent: s(d['Sentiment']),
    date: s(d['Tweet Date']).slice(0, 10), lk: num(d['Total Likes']), rt: num(d['Total Retweets']),
    vw: num(d['Total Views']), followers: num(d['Followers']), url: s(d['Tweet URL']),
    cat: s(d['Category']).trim()
  };
}

function rx(term) {                    // keyword -> safe regex
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Master par wahi query jo pool par chalti thi.
   'Tweet Date' = "YYYY-MM-DD HH:MM:SS IST" -> string compare:
     date >= from   <=>  'Tweet Date' >= from
     date <= to     <=>  'Tweet Date' <= to + '~'   ('~' har digit/space se bada) */
function masterQuery(terms, dFrom, dTo) {
  var q = {};
  var ors = (terms || []).filter(Boolean).map(function (t) {
    return { 'Tweet Text': { $regex: rx(t), $options: 'i' } };
  });
  if (ors.length) q.$or = ors;
  if (dFrom || dTo) {
    q['Tweet Date'] = {};
    if (dFrom) q['Tweet Date'].$gte = dFrom;
    if (dTo)   q['Tweet Date'].$lte = dTo + '~';
  }
  return q;
}

// purane pool (up_pulse.tweets) wali query -- rollback aur comparison ke liye
function poolQuery(terms, dFrom, dTo) {
  var q = {};
  var ors = (terms || []).filter(Boolean).map(function (t) {
    return { text: { $regex: rx(t), $options: 'i' } };
  });
  if (ors.length) q.$or = ors;
  if (dFrom || dTo) {
    q.date = {};
    if (dFrom) q.date.$gte = dFrom;
    if (dTo)   q.date.$lte = dTo;
  }
  return q;
}

module.exports = { PROJ: PROJ, toRow: toRow, level: level, num: num, rx: rx,
                   masterQuery: masterQuery, poolQuery: poolQuery };
