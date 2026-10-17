/*  report_lib.js  --  Keyword/Hashtag report ka DEEP analysis engine.
 *  Tweets array par kaam karta hai (Mongo 'tweets' collection se).
 *  Har tweet: {h,name,text,party,level,sent,date,lk,rt,vw,followers,url}
 *  level in {cm,dcm,mp,mla,''}
 */
'use strict';

function _num(x) { x = parseInt(x, 10); return isNaN(x) ? 0 : x; }

function sentLabel(pos, neu, neg) {
  var tot = pos + neu + neg || 1;
  var pp = pos / tot, np = neg / tot;
  if (pp >= 0.15 && pp > np * 1.5) return 'Positive';
  if (np >= 0.15 && np > pp * 1.5) return 'Negative';
  if (pos > 0 && neg > 0 && Math.min(pp, np) >= 0.10) return 'Mixed';
  return 'Neutral';
}

// keywords: array (with/without #).
//  - "#tag"        -> hashtag match
//  - "ram mandir"  -> poora phrase match
//  - "ram"         -> WORD-boundary match (taaki "program"/"gram" jaise galat match NA hon)
var _esc_re = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
var _W = 'A-Za-z0-9_\\u0900-\\u097F';   // english + hindi letters (word chars)
function _kw_regexes(keywords) {
  return (keywords || []).map(function (k) { return String(k).trim().toLowerCase(); }).filter(Boolean)
    .map(function (k) {
      if (k.charAt(0) === '#') return new RegExp(_esc_re(k) + '(?![' + _W + '])');            // hashtag
      return new RegExp('(^|[^' + _W + '])' + _esc_re(k) + '(?![' + _W + '])');                // whole word/phrase
    });
}
function matchTweets(tweets, keywords) {
  var res = _kw_regexes(keywords);
  if (!res.length) return [];
  return tweets.filter(function (t) {
    var tx = String(t.text || '').toLowerCase();
    for (var i = 0; i < res.length; i++) { if (res[i].test(tx)) return true; }
    return false;
  });
}

var _M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function _fd(s) { if (!s) return ''; var p = String(s).split('-'); return (+p[2]) + ' ' + _M[(+p[1]) - 1] + ' ' + p[0]; }

function aggregate(tweets, opts) {
  opts = opts || {};
  var matched = matchTweets(tweets, opts.keywords);

  // ---- accumulators ----
  var users = {}, rt = 0, lk = 0, pos = 0, neu = 0, neg = 0, vwT = 0;
  var hInfo = {}, tagCount = {}, menCount = {}, dMin = null, dMax = null;
  var daily = {};                       // date -> {c,vw}
  var top = [];                          // top tweets by views
  matched.forEach(function (t) {
    users[t.h] = 1; vwT += _num(t.vw); rt += _num(t.rt); lk += _num(t.lk);
    var s = String(t.sent || '').toLowerCase();
    if (s === 'positive') pos++; else if (s === 'negative') neg++; else neu++;
    var hi = hInfo[t.h] || (hInfo[t.h] = { h: t.h, name: t.name || '', party: t.party || '', count: 0, vw: 0, lk: 0 });
    hi.count++; hi.vw += _num(t.vw); hi.lk += _num(t.lk);
    var dt = String(t.date || '').slice(0, 10);
    if (dt) {
      if (!dMin || dt < dMin) dMin = dt;
      if (!dMax || dt > dMax) dMax = dt;
      var dd = daily[dt] || (daily[dt] = { c: 0, vw: 0 });
      dd.c++; dd.vw += _num(t.vw);
    }
    var mm = String(t.text || '').match(/#[^\s#.,!?;:()\[\]"'…]+/g);
    if (mm) mm.forEach(function (tg) { tg = tg.toLowerCase(); if (tg.length > 1) tagCount[tg] = (tagCount[tg] || 0) + 1; });
    var me = String(t.text || '').match(/@[A-Za-z0-9_]{2,20}/g);
    if (me) me.forEach(function (m) { m = m.toLowerCase(); menCount[m] = (menCount[m] || 0) + 1; });
    // top tweets (chhota heap-jaisa: 40 rakh ke baad me sort)
    // Top Tweets me SIRF political handles (media/journalist ka apna alag section hai)
    var _c = String(t.cat || '').toLowerCase();
    if (_c !== 'media house' && _c !== 'journalist') {
      top.push({ h: t.h, name: t.name || '', party: t.party || '', vw: _num(t.vw), lk: _num(t.lk), rt: _num(t.rt),
                 sent: t.sent || '', date: dt, url: t.url || '', text: String(t.text || '').replace(/\s+/g, ' ').slice(0, 160) });
      if (top.length > 600) {
        // trim karte waqt bhi har handle ka best rakho (diversity na khoye)
        top.sort(function (a, b) { return b.vw - a.vw; });
        var _s = {}, _k = [];
        for (var _j = 0; _j < top.length && _k.length < 80; _j++) {
          if (_s[top[_j].h]) continue;
          _s[top[_j].h] = 1; _k.push(top[_j]);
        }
        top = _k;
      }
    }
  });
  top.sort(function (a, b) { return b.vw - a.vw; });
  // har HANDLE ka sirf sabse bada tweet (warna ek hi bande ke 5 tweets aa jaate the)
  var _seenH = {}, topTweets = [];
  for (var _i = 0; _i < top.length && topTweets.length < 6; _i++) {
    var _t = top[_i];
    if (_seenH[_t.h]) continue;
    _seenH[_t.h] = 1; topTweets.push(_t);
  }

  var handles = Object.keys(hInfo).map(function (k) { return hInfo[k]; }).sort(function (a, b) { return b.count - a.count; });
  var hashtags = Object.keys(tagCount).map(function (k) { return { tag: k, count: tagCount[k] }; }).sort(function (a, b) { return b.count - a.count; });
  var mentions = Object.keys(menCount).map(function (k) { return { m: k, count: menCount[k] }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);

  // ---- ALGO: co-occurring words (matched tweets me keyword ke saath kaunse shabd chal rahe) ----
  var STOP = {};
  ('the a an is are was were and or of to in on for with by at from ka ki ke ko se me par hai hain tha the thi bhi aur ya nahi na ek do it this that be as has had will would rt amp http https t co www com'
   + ' का की के को से में पर है हैं था थे थी भी और या नहीं ना एक जो कि यह वह उनके उनकी अपने आज तक हम आप').split(/\s+/).forEach(function (w) { STOP[w] = 1; });
  var kwset = {}; (opts.keywords || []).forEach(function (k) { String(k).toLowerCase().replace(/^#/, '').split(/\s+/).forEach(function (w) { kwset[w] = 1; }); });
  var wc = {};
  matched.forEach(function (t) {
    var ws = String(t.text || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[a-zऀ-ॿ]{3,}/g);
    if (ws) ws.forEach(function (w) { if (!STOP[w] && !kwset[w]) wc[w] = (wc[w] || 0) + 1; });
  });
  var topWords = Object.keys(wc).map(function (w) { return { w: w, count: wc[w] }; })
    .sort(function (a, b) { return b.count - a.count; }).slice(0, 12);

  // ---- ALGO: concentration (top-5 handles ka share) + engagement rate ----
  var top5h = handles.slice(0, 5).reduce(function (a, h) { return a + h.count; }, 0);
  var concentration = matched.length ? Math.round(top5h * 100 / matched.length) : 0;
  var engagement = vwT > 0 ? +((lk + rt) * 100 / vwT).toFixed(2) : 0;   // (likes+rt) per 100 views
  var topicRange = dMin ? (_fd(dMin) + ' – ' + _fd(dMax)) : (opts.trackingWindow || opts.dateRange || '');

  // ---- daily trend + peak + momentum ----
  var days = Object.keys(daily).sort();
  var dailyArr = days.map(function (d) { return { d: d, label: _fd(d), c: daily[d].c, vw: daily[d].vw }; });
  var peak = null;
  dailyArr.forEach(function (x) { if (!peak || x.c > peak.c) peak = x; });
  var momentum = null;
  if (days.length >= 4) {
    var half = Math.floor(days.length / 2), a1 = 0, a2 = 0;
    dailyArr.forEach(function (x, i) { if (i < half) a1 += x.c; else a2 += x.c; });
    var r1 = a1 / half, r2 = a2 / (days.length - half);
    momentum = r1 > 0 ? Math.round(((r2 - r1) / r1) * 100) : null;   // % change (2nd half vs 1st)
  }

  // ---- MEDIA HOUSES & JOURNALISTS (alag coverage view) ----
  function _isMedia(t) {
    var c = String(t.cat || '').toLowerCase();
    return c === 'media house' || c === 'journalist';
  }
  var medT = matched.filter(_isMedia);
  var polT = matched.filter(function (t) { return !_isMedia(t); });
  var media = null;
  if (medT.length) {
    var mh = {}, mpos = 0, mneu = 0, mneg = 0, mvw = 0, mlk = 0, mrt = 0;
    var mtop = [];
    medT.forEach(function (t) {
      var k = t.h;
      var e = mh[k] || (mh[k] = { h: k, name: t.name || '', type: (String(t.cat||'').toLowerCase()==='journalist'?'Journalist':'Media House'), count: 0, vw: 0 });
      e.count++; e.vw += _num(t.vw);
      mvw += _num(t.vw); mlk += _num(t.lk); mrt += _num(t.rt);
      var s = String(t.sent || '').toLowerCase();
      if (s === 'positive') mpos++; else if (s === 'negative') mneg++; else mneu++;
      mtop.push({ h: t.h, name: t.name || '', type: e.type, vw: _num(t.vw), lk: _num(t.lk),
                  sent: t.sent || '', date: String(t.date || '').slice(0, 10), url: t.url || '',
                  text: String(t.text || '').replace(/\s+/g, ' ').slice(0, 150) });
    });
    mtop.sort(function (a, b) { return b.vw - a.vw; });
    // media me bhi: har handle ka sabse bada tweet
    var _sm = {}, _mt2 = [];
    mtop.forEach(function (t) { if (!_sm[t.h]) { _sm[t.h] = 1; _mt2.push(t); } });
    mtop = _mt2;
    var mhl = Object.keys(mh).map(function (k) { return mh[k]; }).sort(function (a, b) { return b.count - a.count; });
    media = {
      tweets: medT.length,
      houses: mhl.filter(function (x) { return x.type === 'Media House'; }).length,
      journalists: mhl.filter(function (x) { return x.type === 'Journalist'; }).length,
      views: mvw, likes: mlk, retweets: mrt,
      sentiment: sentLabel(mpos, mneu, mneg),
      sent: { pos: mpos, neu: mneu, neg: mneg },
      handles: mhl.slice(0, 15),
      top: mtop.slice(0, 8),
      sharePct: matched.length ? Math.round(medT.length * 100 / matched.length) : 0,
      politicalTweets: polT.length
    };
  }

  // ---- PUBLIC OVERVIEW: tweet TEXT padh kar "log kya keh rahe hain" ----
  var publicView = null;
  if (matched.length) {
    // 1) themes = do-shabd wale phrases (bigrams), stopwords hata kar
    var bg = {};
    matched.forEach(function (t) {
      var ws = String(t.text || '').toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ').replace(/[@#]\w+/g, ' ')
        .match(/[a-zऀ-ॿ]{3,}/g) || [];
      ws = ws.filter(function (w) { return !STOP[w]; });
      for (var i = 0; i < ws.length - 1; i++) {
        var k = ws[i] + ' ' + ws[i + 1];
        bg[k] = (bg[k] || 0) + 1;
      }
    });
    var themes = Object.keys(bg).map(function (k) { return { p: k, count: bg[k] }; })
      .filter(function (x) { return x.count >= 2; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 10);

    // 2) representative quotes -- har sentiment ka sabse zyada dekha gaya tweet
    function pick(sent, n) {
      return matched.filter(function (t) { return String(t.sent || '').toLowerCase() === sent; })
        .sort(function (a, b) { return _num(b.vw) - _num(a.vw); }).slice(0, n)
        .map(function (t) {
          return { h: t.h, name: t.name || '', cat: t.cat || '', party: t.party || '',
                   vw: _num(t.vw), date: String(t.date || '').slice(0, 10), url: t.url || '',
                   text: String(t.text || '').replace(/\s+/g, ' ').slice(0, 220) };
        });
    }
    // 3) sawal / maang -- jisme '?' ho ya sawal wale shabd
    var QW = /(\?|kyun|kyon|kab tak|kaun|kaise|jawab|sawal|maang|chahiye|kyu\b|क्यों|कब|कौन|कैसे|जवाब|सवाल|मांग|चाहिए)/i;
    var questions = matched.filter(function (t) { return QW.test(String(t.text || '')); })
      .sort(function (a, b) { return _num(b.vw) - _num(a.vw); }).slice(0, 4)
      .map(function (t) {
        return { h: t.h, cat: t.cat || '', vw: _num(t.vw), url: t.url || '',
                 text: String(t.text || '').replace(/\s+/g, ' ').slice(0, 200) };
      });

    var st2 = pos + neu + neg || 1;
    publicView = {
      themes: themes,
      positive: pick('positive', 2),
      negative: pick('negative', 2),
      neutral: pick('neutral', 2),
      questions: questions,
      mood: (neg > pos * 1.3) ? 'Zyadatar aalochna / sawal'
          : (pos > neg * 1.3) ? 'Zyadatar samarthan / prashansa'
          : 'Mila-jula (dono taraf ki baatein)',
      posPct: Math.round(pos * 100 / st2), negPct: Math.round(neg * 100 / st2)
    };
  }

  // ---- party-wise by position (SIRF political handles; media/journalist ka alag section hai) ----
  var P = {};
  polT.forEach(function (t) {
    var party = (t.party && String(t.party).trim()) || '—';
    var pr = P[party] || (P[party] = { party: party, cm: 0, dcm: 0, mp: 0, mla: 0, total: 0, rt: 0, likes: 0, vw: 0, pos: 0, neu: 0, neg: 0, top: null });
    var lv = t.level; if (lv === 'cm' || lv === 'dcm' || lv === 'mp' || lv === 'mla') pr[lv]++;
    pr.total++; pr.rt += _num(t.rt); pr.likes += _num(t.lk); pr.vw += _num(t.vw);
    var s = String(t.sent || '').toLowerCase();
    if (s === 'positive') pr.pos++; else if (s === 'negative') pr.neg++; else pr.neu++;
    if (!pr.top || _num(t.vw) > _num(pr.top.vw)) pr.top = t;
  });
  var parties = Object.keys(P).map(function (k) { return P[k]; }).sort(function (a, b) { return b.total - a.total; });
  parties.forEach(function (pr) {
    pr.sentiment = sentLabel(pr.pos, pr.neu, pr.neg);
    pr.topHandle = pr.top ? ('@' + pr.top.h) : '';
    pr.topText = pr.top ? String(pr.top.text || '').replace(/\s+/g, ' ').slice(0, 300) : '';
    pr.topUrl = pr.top ? (pr.top.url || '') : '';
  });
  var totals = { cm: 0, dcm: 0, mp: 0, mla: 0, total: 0, rt: 0, likes: 0 };
  parties.forEach(function (p) { ['cm','dcm','mp','mla','total','rt','likes'].forEach(function (k) { totals[k] += p[k]; }); });

  // ---- SMART insights (sab data se; koi guess nahi) ----
  var insights = [];
  var T = matched.length;
  if (T) {
    if (parties.length) {
      var tp = parties[0], share = Math.round(tp.total * 100 / T);
      insights.push(tp.party + ' is topic par sabse aage — ' + tp.total.toLocaleString('en-IN') + ' tweets (' + share + '% share), sentiment ' + tp.sentiment + '.');
      if (parties.length > 1) {
        var p2 = parties[1];
        insights.push('Doosre number par ' + p2.party + ' (' + p2.total.toLocaleString('en-IN') + ' tweets). Gap ' + (tp.total - p2.total).toLocaleString('en-IN') + ' tweets ka hai.');
      }
    }
    if (peak) insights.push('Sabse zyada activity ' + peak.label + ' ko rahi (' + peak.c.toLocaleString('en-IN') + ' tweets' + (peak.vw ? ', ' + (peak.vw >= 1e7 ? (peak.vw/1e7).toFixed(1)+' Cr' : (peak.vw/1e5).toFixed(1)+' L') + ' views' : '') + ') — us din kya hua, uske top tweets neeche table me hain.');
    if (momentum !== null) {
      if (momentum > 25) insights.push('Topic PAKAD raha hai: window ke doosre hisse me tweets ~' + momentum + '% badhe (trend upar).');
      else if (momentum < -25) insights.push('Topic THANDA pad raha hai: doosre hisse me tweets ~' + Math.abs(momentum) + '% kam hue (trend neeche).');
      else insights.push('Topic ki raftar window bhar lagbhag sthir rahi (koi bada spike/drop nahi).');
    }
    var st = pos + neu + neg || 1;
    var pp = Math.round(pos*100/st), np = Math.round(neg*100/st);
    insights.push('Sentiment mix: ' + pp + '% positive, ' + np + '% negative, baaki neutral. ' +
      (np > pp ? 'Negative bhari hai — counter-messaging par dhyaan dein.' :
       pp > np ? 'Narrative positive jhukav me hai.' : 'Narrative santulit/neutral hai.'));
    if (topTweets.length) {
      var t0 = topTweets[0];
      insights.push('Sabse bada tweet @' + t0.h + (t0.party ? ' (' + t0.party + ')' : '') + ' ka raha — ' +
        (t0.vw >= 1e7 ? (t0.vw/1e7).toFixed(2)+' Cr' : (t0.vw/1e5).toFixed(2)+' L') + ' views. Isi framing ko amplify/counter karna sabse zyada asar karega.');
    }
    var negP = parties.filter(function (p) { return p.sentiment === 'Negative' && p.total >= T*0.05; }).map(function (p) { return p.party; });
    if (negP.length) insights.push('Negative narrative mukhya roop se: ' + negP.join(', ') + ' ki taraf se.');
    if (hashtags.length) insights.push('Chal rahe hashtags: ' + hashtags.slice(0,5).map(function(x){return x.tag;}).join(' ') + ' — inhi par engage karna effective rahega.');
    if (concentration >= 60) insights.push('Ye conversation CONCENTRATED hai — top-5 handles ne hi ' + concentration + '% tweets kiye (organic kam, coordinated zyada lagta hai).');
    else if (concentration <= 30 && handles.length >= 10) insights.push('Ye conversation WIDE hai — top-5 handles ka sirf ' + concentration + '% share (topic broadly phaila hua hai).');
    if (engagement >= 2) insights.push('Engagement rate high hai (' + engagement + ' likes+RT per 100 views) — content resonate kar raha hai.');
    if (topWords.length >= 3) insights.push('Keyword ke saath sabse zyada chal rahe shabd: "' + topWords.slice(0,5).map(function(x){return x.w;}).join('", "') + '" — narrative ka asli angle yahi hai.');
    if (media) {
      insights.push('MEDIA COVERAGE: ' + media.houses + ' media house + ' + media.journalists + ' journalist ne is topic par ' +
        media.tweets.toLocaleString('en-IN') + ' tweets kiye (' + media.sharePct + '% conversation), sentiment ' + media.sentiment + '.');
      if (media.sharePct >= 40) insights.push('Ye topic MEDIA-DRIVEN hai (aadhe se zyada coverage media/journalist ki taraf se) — press narrative pehle set ho raha hai.');
      else if (media.sharePct <= 10) insights.push('Media coverage kam hai (' + media.sharePct + '%) — topic mostly political handles chala rahe hain; press pickup badhane ka scope hai.');
      if (media.sentiment === 'Negative') insights.push('Media ka tone NEGATIVE hai — press briefing/rebuttal turant zaroori.');
    } else {
      insights.push('Is topic par kisi media house ya journalist ka tweet nahi mila — press pickup abhi zero hai.');
    }
    if (publicView) {
      insights.push('LOG KYA KEH RAHE HAIN: ' + publicView.mood + ' (' + publicView.posPct + '% positive, ' + publicView.negPct + '% negative).' +
        (publicView.themes.length ? ' Sabse zyada dohrayi ja rahi baatein: "' + publicView.themes.slice(0, 3).map(function (x) { return x.p; }).join('", "') + '".' : ''));
      if (publicView.questions.length) insights.push('Topic par ' + publicView.questions.length + '+ tweets me seedhe SAWAL/MAANG uthaye gaye hain — inka jawab dena zaroori (neeche quotes me hain).');
    }
  } else {
    insights.push('Is keyword par koi tweet nahi mila — spelling badal kar ya related keyword (comma se alag-alag) daal kar dekhein.');
  }

  return {
    topic: opts.topic || '',
    keywords: (opts.keywords || []).filter(Boolean),
    trackingWindow: topicRange,
    dateRange: opts.dateRange || '',
    reportDate: opts.reportDate || '',
    handles: handles,
    hashtags: hashtags,
    mentions: mentions,
    topWords: topWords,
    concentration: concentration,
    engagement: engagement,
    daily: dailyArr,
    peak: peak,
    momentum: momentum,
    topTweets: topTweets,
    media: media,
    publicView: publicView,
    sent: { pos: pos, neu: neu, neg: neg },
    volume: {
      totalTweets: T, retweets: rt, likes: lk,
      uniqueHandles: Object.keys(users).length,
      totalViews: vwT,
      sentiment: sentLabel(pos, neu, neg)
    },
    parties: parties, totals: totals, insights: insights
  };
}

module.exports = { aggregate: aggregate, matchTweets: matchTweets };
