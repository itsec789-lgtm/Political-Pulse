/* ======================================================================
   EXTRAS
     1. DATE RANGE BAR   - 7/30/90 days or custom; aggregates come from the server
     2. PROFILE MODAL    - click any handle -> its full record
     3. MEDIA & PRESS    - politicians vs media vs journalists, from Category

   These live in a separate file so app.js stays close to the original -
   only the minimum was changed there.
   ====================================================================== */
(function () {
  'use strict';

  var PL = window.PL || {};
  var q = function (s) { return document.querySelector(s); };
  var qa = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = PL.esc || function (v) { return String(v == null ? '' : v); };
  var fmt = PL.fmt || function (v) { return String(v); };
  var fmtFull = PL.fmtFull || fmt;
  var D = function () { return PL.DATA || {}; };

  function initialsOf(s) {
    if (PL.initials) return PL.initials(s);
    s = String(s || '').replace(/^@/, '').trim();
    var p = s.split(/\s+/).filter(Boolean);
    return (p.length >= 2 ? p[0][0] + p[1][0] : s.slice(0, 2)).toUpperCase();
  }
  function badge(sn) {
    var cls = sn === 'Positive' ? 'badge-pos' : sn === 'Negative' ? 'badge-neg' : 'badge-neu';
    return '<span class="badge ' + cls + '">' + esc(sn || 'Neutral') + '</span>';
  }

  /* ==================================================================
     1. DATE RANGE
     Counting on the loaded sample would have been easier, but the numbers
     would be wrong. So the range goes to the server, which re-aggregates
     every tweet in that window.
     ================================================================== */
  var busy = false;

  function iso(d) { return d.toISOString().slice(0, 10); }

  function setStatus(txt) { var el = q('#dateStatus'); if (el) el.textContent = txt || ''; }

  async function apply(from, to, label) {
    if (busy || !PL.setRange) return;
    busy = true;
    setStatus('Loading that window…');
    try {
      await PL.setRange(from, to);
      var m = D().meta || {};
      var k = D().kpis || {};
      setStatus(label
        ? (label + ' · ' + fmtFull(k.total_tweets || 0) + ' tweets · '
           + (m.date_from || '') + ' → ' + (m.date_to || ''))
        : (fmtFull(k.total_tweets || 0) + ' tweets · all time'));
      document.dispatchEvent(new CustomEvent('pl:data'));
    } catch (e) {
      setStatus('Could not load that range: ' + e.message);
      if (PL.toast) PL.toast('Date range failed: ' + e.message);
    }
    busy = false;
  }

  function initDateBar() {
    qa('#dateBar .date-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        qa('#dateBar .date-chip').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var f = q('#dateFrom'), t = q('#dateTo');
        if (f) f.value = ''; if (t) t.value = '';

        var days = Number(b.dataset.days) || 0;
        if (!days) return apply('', '', '');

        /* "Last 7 days" counts back from the last day in the data, not
           from today - if scraping is two days behind, counting from today
           returns an empty window and the dashboard looks blank. */
        var m = D().meta || {};
        var end = m.date_to ? new Date(m.date_to) : new Date();
        if (isNaN(end.getTime())) end = new Date();
        var start = new Date(end.getTime() - (days - 1) * 86400000);
        apply(iso(start), iso(end), 'Last ' + days + ' days');
      });
    });

    var btn = q('#dateApplyBtn');
    if (btn) btn.addEventListener('click', function () {
      var f = (q('#dateFrom') || {}).value || '';
      var t = (q('#dateTo') || {}).value || '';
      if (!f && !t) { if (PL.toast) PL.toast('Pick a date first'); return; }
      if (f && t && f > t) { if (PL.toast) PL.toast('The From date is after the To date'); return; }
      qa('#dateBar .date-chip').forEach(function (x) { x.classList.remove('active'); });
      apply(f, t, (f || 'start') + ' → ' + (t || 'today'));
    });
  }

  /* ==================================================================
     2. PROFILE MODAL
     Click a card or a table row -> that handle's full record. The tweets
     come from the server (/api/tweets?h=...) so posts outside the loaded
     sample show up too.
     ================================================================== */
  function findCandidate(handle) {
    var h = String(handle || '').replace(/^@/, '').toLowerCase();
    var list = D().candidates || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].handle || '').replace(/^@/, '').toLowerCase() === h) return list[i];
    }
    return null;
  }
  function findHandle(handle) {
    var h = String(handle || '').replace(/^@/, '').toLowerCase();
    var list = D().handles || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].handle || '').replace(/^@/, '').toLowerCase() === h) return list[i];
    }
    return null;
  }

  function statRow(pairs) {
    return '<div class="pf-stats">' + pairs.map(function (p) {
      return '<div class="pf-stat"><b>' + p[1] + '</b><span>' + esc(p[0]) + '</span></div>';
    }).join('') + '</div>';
  }

  function sparkline(daily) {
    if (!daily.length) return '';
    var max = Math.max.apply(null, daily.map(function (d) { return d[1]; })) || 1;
    return '<div class="pf-spark" title="daily tweets">' + daily.map(function (d) {
      return '<i style="height:' + Math.max(3, (d[1] / max * 100)) + '%" title="'
        + esc(d[0]) + ': ' + d[1] + '"></i>';
    }).join('') + '</div>';
  }

  function openProfile(handle) {
    var overlay = q('#profileModal'), body = q('#profileModalBody');
    if (!overlay || !body) return;
    var c = findCandidate(handle) || {};
    var hh = findHandle(handle) || {};
    var name = c.name || hh.candidate || handle;
    var party = c.party || hh.party || '';
    var colour = PL.partyColor ? PL.partyColor(party) : '#64748B';

    body.innerHTML =
      '<div class="profile-head">'
      + '<div class="pf-avatar" style="background:' + colour + '">' + esc(initialsOf(name)) + '</div>'
      + '<div style="min-width:0">'
      + '<div class="profile-name">' + esc(name) + '</div>'
      + '<div class="profile-handle"><a href="https://x.com/' + esc(String(handle).replace(/^@/, ''))
      + '" target="_blank" rel="noopener">@' + esc(String(handle).replace(/^@/, '')) + '</a>'
      + (party ? '<span class="party-dot" style="background:' + colour + '"></span>' + esc(party) : '')
      + (c.designation || hh.designation ? ' · ' + esc(c.designation || hh.designation) : '')
      + '</div>'
      + (hh.pc ? '<div class="profile-badges">' + esc(hh.pc) + '</div>' : '')
      + '</div></div>'
      + statRow([
        ['Lens Score', c.score != null ? c.score : '—'],
        ['Followers', fmt(c.followers || hh.followers || 0)],
        ['Tweets', fmt(c.tweets || hh.tweets || 0)],
        ['Engagement', fmt(c.engagement || hh.engagement || 0)],
        ['Avg sentiment', c.avg_sentiment != null ? c.avg_sentiment : '—']
      ])
      + '<div class="pf-sentbar" title="positive / neutral / negative">'
      + bar(c.positive, c.neutral, c.negative) + '</div>'
      + '<div id="pfTrendWrap"></div>'
      + '<div class="pf-loading" id="pfTweets">Loading tweets…</div>';

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    loadProfileTweets(handle);
  }

  function bar(p, n, g) {
    p = Number(p) || 0; n = Number(n) || 0; g = Number(g) || 0;
    var t = p + n + g || 1;
    return '<div style="width:' + (p / t * 100) + '%;background:#16A34A"></div>'
      + '<div style="width:' + (n / t * 100) + '%;background:#CBD5E1"></div>'
      + '<div style="width:' + (g / t * 100) + '%;background:#DC2626"></div>';
  }

  function tweetMini(t) {
    return '<div class="pf-tweet">'
      + '<div class="pf-tweet-top">' + esc(String(t.d || '').slice(0, 16)) + ' ' + badge(t.sn) + '</div>'
      + '<div class="pf-tweet-text">' + esc(t.tx || '') + '</div>'
      + '<div class="pf-tweet-foot">❤ ' + fmt(t.l) + ' · 🔁 ' + fmt(t.r)
      + ' · 👁 ' + fmt(t.v)
      + (t.u ? ' · <a href="' + esc(t.u) + '" target="_blank" rel="noopener">Open ↗</a>' : '')
      + '</div></div>';
  }

  function loadProfileTweets(handle) {
    var box = q('#pfTweets');
    var r = PL.RANGE || { from: '', to: '' };
    var url = '/api/tweets?limit=500&sort=eng&h=' + encodeURIComponent(String(handle).replace(/^@/, ''));
    if (r.from) url += '&from=' + encodeURIComponent(r.from);
    if (r.to) url += '&to=' + encodeURIComponent(r.to);

    fetch(url, { cache: 'no-store' })
      .then(function (x) { return x.json(); })
      .then(function (j) {
        var rows = j.rows || [];
        if (!box) return;
        if (!rows.length) { box.innerHTML = '<p class="ins-empty">No tweets in this window.</p>'; return; }

        /* daily trend */
        var days = {};
        rows.forEach(function (t) {
          var d = String(t.d || '').slice(0, 10);
          if (d) days[d] = (days[d] || 0) + 1;
        });
        var daily = Object.keys(days).sort().map(function (d) { return [d, days[d]]; });
        var tw = q('#pfTrendWrap');
        if (tw) tw.innerHTML = '<h4 class="pf-h">Activity</h4>' + sparkline(daily);

        var best = rows.slice(0, 3);
        var worst = rows.filter(function (t) { return t.sn === 'Negative'; })
          .sort(function (a, b) { return (b.eng || 0) - (a.eng || 0); }).slice(0, 2);

        box.classList.remove('pf-loading');
        box.innerHTML = '<h4 class="pf-h">Top tweets</h4>' + best.map(tweetMini).join('')
          + (worst.length ? '<h4 class="pf-h">Negative tweets that travelled furthest</h4>'
            + worst.map(tweetMini).join('') : '');
      })
      .catch(function (e) {
        if (box) box.innerHTML = '<p class="ins-empty">Could not load tweets: ' + esc(e.message) + '</p>';
      });
  }

  function closeProfile() {
    var o = q('#profileModal');
    if (o) o.classList.remove('open');
    document.body.classList.remove('modal-open');
  }

  function initProfile() {
    var close = q('#profileModalClose');
    if (close) close.addEventListener('click', closeProfile);
    var overlay = q('#profileModal');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeProfile();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeProfile();
    });

    /* Delegation - cards and rows are rebuilt on every render, so binding
       a listener to each element would be wasted work. */
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-handle]');
      if (el && el.dataset.handle) { openProfile(el.dataset.handle); return; }
      var card = e.target.closest('.cand-card');
      if (card) {
        var nm = card.querySelector('.cand-name');
        var c = nm && (D().candidates || []).filter(function (x) {
          return x.name === nm.textContent;
        })[0];
        if (c) openProfile(c.handle);
      }
    });
  }
  window.plOpenProfile = openProfile;

  /* ==================================================================
     3. MEDIA & PRESS
     ================================================================== */
  var MEDIA_RE = /media|journalist|press|news|anchor|reporter/i;

  function mediaCats() {
    return (D().categories || []).filter(function (c) { return MEDIA_RE.test(c.category); });
  }

  /* Same markup as app.js's kpiCard - otherwise the value and label run
     together, since the CSS keys off .kpi-value / .kpi-label. */
  function kpiTile(icon, colour, value, label, sub) {
    return '<div class="kpi-card">'
      + '<div class="kpi-icon" style="background:' + colour + '18;color:' + colour + '">' + icon + '</div>'
      + '<div class="kpi-value">' + value + '</div>'
      + '<div class="kpi-label">' + esc(label) + '</div>'
      + (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '')
      + '</div>';
  }
  var MICON = {
    news: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 9h6M7 13h10M7 16h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    mic: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    eye: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>',
    smile: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  function renderMedia() {
    var page = q('#media'); if (!page) return;
    var cats = D().categories || [];
    var intro = q('#mediaIntro');

    if (!cats.length || (cats.length === 1 && cats[0].category === 'Uncategorised')) {
      if (intro) intro.innerHTML = 'No <code>Category</code> column was found in your data (or it is all blank), '
        + 'so media and journalists cannot be separated. Fill Category in the master '
        + 'data and run <code>build_punjab_data.py --push</code> again.';
      ['#mediaKpis', '#mediaTable', '#mediaWords', '#polWords', '#mediaFeed'].forEach(function (s) {
        var el = q(s); if (el) el.innerHTML = '';
      });
      var cnt0 = q('#mediaCount'); if (cnt0) cnt0.textContent = '';
      return;
    }
    if (intro) intro.innerHTML = 'From the <code>Category</code> column in your data - '
      + 'politicians, media houses and journalists, separated.';

    var med = mediaCats();
    var medTweets = med.reduce(function (s, c) { return s + c.tweets; }, 0);
    var medHandles = med.reduce(function (s, c) { return s + c.handles; }, 0);
    var total = cats.reduce(function (s, c) { return s + c.tweets; }, 0) || 1;
    var medViews = med.reduce(function (s, c) { return s + c.views; }, 0);
    var medPos = med.reduce(function (s, c) { return s + c.positive; }, 0);
    var medNeg = med.reduce(function (s, c) { return s + c.negative; }, 0);

    var cnt = q('#mediaCount');
    if (cnt) cnt.textContent = '· ' + cats.length + ' categories';

    var kp = q('#mediaKpis');
    var netSent = (medPos + medNeg) ? ((medPos - medNeg) / (medPos + medNeg)) : null;
    if (kp) kp.innerHTML =
      kpiTile(MICON.news, '#0F766E', fmt(medTweets), 'Media / Press Tweets',
        (medTweets / total * 100).toFixed(1) + '% of all tweets')
      + kpiTile(MICON.mic, '#7C3AED', fmt(medHandles), 'Media Handles')
      + kpiTile(MICON.eye, '#2563EB', fmt(medViews), 'Media Views')
      + kpiTile(MICON.smile, netSent == null ? '#64748B' : (netSent >= 0 ? '#16A34A' : '#DC2626'),
        netSent == null ? '—' : netSent.toFixed(3), 'Media Net Sentiment',
        fmt(medPos) + ' positive · ' + fmt(medNeg) + ' negative');

    drawCatCharts(cats);
    fillCatSelect(cats);
    renderMediaTable();
    renderMediaWords();
    renderMediaFeed();
  }

  function drawCatCharts(cats) {
    var top = cats.slice(0, 8);
    /* app.js keeps its chart helpers inside an IIFE, so this file draws its
       own small bar chart rather than creating a dependency. */
    hbar('chartCatShare', top.map(function (c) { return [c.category, c.tweets]; }));
    hbar('chartCatSent', top.map(function (c) {
      var t = c.positive + c.negative || 1;
      return [c.category, Math.round((c.positive - c.negative) / t * 1000) / 1000];
    }), true);
  }

  function hbar(canvasId, pairs, signed) {
    var cv = document.getElementById(canvasId); if (!cv) return;
    var ratio = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var w = Math.max(rect.width, 320), h = 250;
    cv.width = w * ratio; cv.height = h * ratio;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!pairs.length) return;

    var dark = PL.isDark && PL.isDark();
    var label = dark ? '#A3AFC4' : '#54607A';
    var pad = 118, right = 58;
    var bh = Math.min(24, (h - 16) / pairs.length - 6);
    var max = Math.max.apply(null, pairs.map(function (p) { return Math.abs(p[1]); })) || 1;
    var css = getComputedStyle(document.documentElement);
    var primary = (css.getPropertyValue('--primary') || '#0F766E').trim();

    pairs.forEach(function (p, i) {
      var y = 10 + i * ((h - 16) / pairs.length);
      ctx.fillStyle = label;
      ctx.font = '600 11.5px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p[0]).slice(0, 17), pad - 10, y + bh / 2);

      var avail = w - pad - right;
      var len = Math.abs(p[1]) / max * avail;
      ctx.fillStyle = signed ? (p[1] >= 0 ? '#16A34A' : '#DC2626') : primary;
      ctx.beginPath();
      var r = Math.min(5, bh / 2);
      var x = pad, wd = Math.max(2, len);
      ctx.moveTo(x, y); ctx.arcTo(x + wd, y, x + wd, y + bh, r);
      ctx.arcTo(x + wd, y + bh, x, y + bh, r); ctx.lineTo(x, y + bh); ctx.closePath();
      ctx.fill();

      ctx.fillStyle = label; ctx.textAlign = 'left';
      ctx.fillText(signed ? p[1].toFixed(3) : fmt(p[1]), pad + wd + 8, y + bh / 2);
    });
  }

  function fillCatSelect(cats) {
    var sel = q('#mediaCatSel'); if (!sel) return;
    var cur = sel.value;
    var med = mediaCats();
    var opts = ['<option value="__media">Media &amp; journalists only</option>',
                '<option value="">All categories</option>']
      .concat(cats.map(function (c) {
        return '<option value="' + esc(c.category) + '">' + esc(c.category)
          + ' (' + fmt(c.tweets) + ')</option>';
      }));
    sel.innerHTML = opts.join('');
    sel.value = cur || (med.length ? '__media' : '');
  }

  function mediaHandles(pick) {
    var list = (D().handles || []).filter(function (h) { return h.cat; });
    if (pick === '__media' || !pick) {
      if (pick === '__media') list = list.filter(function (h) { return MEDIA_RE.test(h.cat); });
    } else {
      list = list.filter(function (h) { return h.cat === pick; });
    }
    return list.sort(function (a, b) { return (b.tweets || 0) - (a.tweets || 0); }).slice(0, 60);
  }

  function renderMediaTable() {
    var el = q('#mediaTable'); if (!el) return;
    var pick = (q('#mediaCatSel') || {}).value || '__media';
    var rows = mediaHandles(pick);
    if (!rows.length) {
      el.innerHTML = '<tbody><tr><td>No handles found in this category.</td></tr></tbody>';
      return;
    }
    el.innerHTML = '<thead><tr><th>Handle</th><th>Category</th><th>Tweets</th><th>Followers</th>'
      + '<th>Views</th><th>Engagement</th><th>Pos</th><th>Neg</th></tr></thead><tbody>'
      + rows.map(function (h) {
        return '<tr class="clickable-row" data-handle="' + esc(h.handle) + '">'
          + '<td><b>@' + esc(String(h.handle).replace(/^@/, '')) + '</b>'
          + (h.candidate ? '<br><span class="muted">' + esc(h.candidate) + '</span>' : '') + '</td>'
          + '<td>' + esc(h.cat || '—') + '</td>'
          + '<td>' + fmt(h.tweets) + '</td><td>' + fmt(h.followers) + '</td>'
          + '<td>' + fmt(h.views) + '</td><td>' + fmt(h.engagement) + '</td>'
          + '<td style="color:#16A34A">' + fmt(h.positive) + '</td>'
          + '<td style="color:#DC2626">' + fmt(h.negative) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  var STOPW = new Set(('the a an and or of to in on for is are was were be with at by from this that '
    + 'it its as we you they he she his her our your their not no will has have had do does did but '
    + 'so than then there here what which who when where why how all any some such only very just '
    + 'ka ki ke ko se me mein hai hain ho ye yeh wo woh aur par bhi tha the na nahi kar karo kiya '
    + 'raha rahe https http com www amp rt de da di nu vich naal ate ji sri').split(' '));

  function wordsFrom(rows, limit) {
    var m = {};
    rows.forEach(function (t) {
      String(t.tx || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ')
        .split(/[^a-z0-9ऀ-ॿ਀-੿#]+/).forEach(function (w) {
          if (w.length > 2 && !STOPW.has(w) && !/^\d+$/.test(w)) m[w] = (m[w] || 0) + 1;
        });
    });
    return Object.keys(m).map(function (k) { return [k, m[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, limit || 45);
  }

  function cloud(el, pairs) {
    if (!el) return;
    if (!pairs.length) { el.innerHTML = '<p class="ins-empty">No data found.</p>'; return; }
    var max = pairs[0][1], min = pairs[pairs.length - 1][1];
    el.innerHTML = pairs.map(function (p) {
      var size = 12 + ((p[1] - min) / ((max - min) || 1)) * 22;
      return '<span class="wc-word" style="font-size:' + size.toFixed(0) + 'px" title="'
        + p[1] + ' mentions">' + esc(p[0]) + '<sup class="wc-count">' + fmt(p[1]) + '</sup></span>';
    }).join(' ');
  }

  function renderMediaWords() {
    var rows = (D().explorer || []);
    cloud(q('#mediaWords'), wordsFrom(rows.filter(function (t) { return MEDIA_RE.test(t.cat || ''); })));
    cloud(q('#polWords'), wordsFrom(rows.filter(function (t) { return t.cat && !MEDIA_RE.test(t.cat); })));
  }

  function renderMediaFeed() {
    var el = q('#mediaFeed'); if (!el) return;
    var rows = (D().explorer || []).filter(function (t) { return MEDIA_RE.test(t.cat || ''); })
      .sort(function (a, b) { return (b.eng || 0) - (a.eng || 0); }).slice(0, 12);
    if (!rows.length) { el.innerHTML = '<p class="ins-empty">No media tweets found.</p>'; return; }
    el.innerHTML = rows.map(function (t) {
      return '<div class="tweet-card">'
        + '<div class="tweet-head clickable-row" data-handle="' + esc(t.h) + '">'
        + '<div class="tweet-avatar">' + esc(initialsOf(t.h)) + '</div><div>'
        + '<div class="tweet-handle">@' + esc(String(t.h).replace(/^@/, ''))
        + (t.cn ? ' · ' + esc(t.cn) : '') + '</div>'
        + '<div class="tweet-sub">' + esc(t.cat || '') + ' ' + badge(t.sn) + '</div></div></div>'
        + '<div class="tweet-text">' + esc(t.tx || '') + '</div>'
        + '<div class="tweet-foot"><span class="tweet-metric">❤ <b>' + fmt(t.l) + '</b></span>'
        + '<span class="tweet-metric">🔁 <b>' + fmt(t.r) + '</b></span>'
        + '<span class="tweet-metric">👁 <b>' + fmt(t.v) + '</b></span>'
        + (t.u ? '<a class="tweet-link" href="' + esc(t.u) + '" target="_blank" rel="noopener">Open Tweet ↗</a>' : '')
        + '</div></div>';
    }).join('');
  }
  window.renderMedia = renderMedia;

  /* ------------------------------------------------------------ init -- */
  function init() {
    initDateBar();
    initProfile();
    var sel = q('#mediaCatSel');
    if (sel) sel.addEventListener('change', renderMediaTable);
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-target="media"]')) setTimeout(renderMedia, 60);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
