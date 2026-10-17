/* ======================================================================
   ASSISTANT - GEMINI
   ----------------------------------------------------------------------
   The offline engine in assistant.js is still there as the fallback.
   What happens here:

     1. A question comes in
     2. A small digest of the current (filtered) numbers is built
     3. That digest plus the question go to the server at /api/ask
     4. The server asks Gemini and returns the answer

   RAW TWEETS never reach the model - only our own aggregate numbers and
   the text of a handful of top tweets. That keeps the model from inventing
   facts and keeps the payload small.

   The API key never reaches the browser; it stays on the server.
   ====================================================================== */
(function () {
  'use strict';

  var PLX = window.PL || {};
  var qs = function (s) { return document.querySelector(s); };
  var escX = PLX.esc || function (v) { return String(v == null ? '' : v); };

  var AI = { enabled: false, model: '', checked: false };

  /* ------------------------------------------------------------ status -- */
  function setModeLine() {
    var el = qs('#aiModeLine');
    if (el) el.textContent = AI.enabled
      ? ('Gemini · ' + AI.model)
      : 'Offline mode · add a Gemini key in Settings';
    var tag = qs('#aiStatusTag');
    if (tag) {
      tag.textContent = AI.enabled ? ('On · ' + AI.model) : 'Off';
      tag.classList.toggle('tag-on', AI.enabled);
    }
  }

  function refreshStatus() {
    return fetch('/api/ai/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        AI.enabled = !!j.enabled; AI.model = j.model || ''; AI.checked = true;
        setModeLine();
        var st = qs('#aiKeyStatus');
        if (st) st.textContent = j.enabled
          ? ('Key saved (' + j.keyTail + ') · model ' + j.model)
          : 'No key set - the assistant is answering offline.';
        if (j.enabled) loadModels(j.model);
        else { var sel = qs('#aiModelSel'); if (sel && j.model) sel.value = j.model; }
        return j;
      })
      .catch(function () { AI.checked = true; setModeLine(); });
  }
  /* Model list straight from Google - a hardcoded list goes stale every
     few months and starts throwing "model no longer available". */
  function loadModels(current) {
    var sel = qs('#aiModelSel');
    if (!sel) return;
    fetch('/api/ai/models', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = j.models || [];
        if (!list.length) {                       // nothing came back - keep what is there
          if (current) {
            if (!Array.prototype.some.call(sel.options, function (o) { return o.value === current; })) {
              sel.insertAdjacentHTML('afterbegin',
                '<option value="' + escX(current) + '">' + escX(current) + '</option>');
            }
            sel.value = current;
          }
          return;
        }
        sel.innerHTML = list.map(function (m) {
          return '<option value="' + escX(m) + '">' + escX(m) + '</option>';
        }).join('');
        sel.value = (current && list.indexOf(current) >= 0) ? current : list[0];
      })
      .catch(function () { });
  }

  window.plAiRefresh = refreshStatus;
  window.plAiOn = function () { return AI.enabled; };

  /* ------------------------------------------------------------ digest --
   * The full data cannot go to the model (25,000 tweets is enormous and
   * pointless). Only the slice a question could be asked about is sent. */
  function activeFilters() {
    var f = {};
    ['fParty', 'fSentiment', 'fDesignation', 'fPC'].forEach(function (id) {
      var el = qs('#' + id);
      if (el && el.value) f[id.slice(1).toLowerCase()] = el.value;
    });
    return f;
  }

  function topN(map, n, keyName) {
    return Object.keys(map)
      .map(function (k) { var o = { }; o[keyName] = k; o.n = map[k]; return o; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, n);
  }

  function buildDigest() {
    var D = PLX.DATA || {};
    var filters = activeFilters();
    var hasFilter = Object.keys(filters).length > 0;
    var rows = (D.explorer || []);
    if (PLX.tweetPassesFilters) rows = rows.filter(PLX.tweetPassesFilters);

    var out = {
      state: 'Punjab',
      date_range: [(D.meta || {}).date_from || '', (D.meta || {}).date_to || ''],
      filters_applied: hasFilter ? filters : 'no filters - the whole Punjab dataset',
      scope: hasFilter
        ? ('a filtered sample of ' + rows.length + ' tweets')
        : 'the whole Punjab corpus'
    };

    if (!hasFilter) {
      var k = D.kpis || {};
      out.totals = {
        tweets: k.total_tweets, handles: k.total_handles, candidates: k.total_candidates,
        parties: k.total_parties, constituencies: (D.geo || []).length,
        views: k.total_views, likes: k.total_likes, retweets: k.total_retweets,
        comments: k.total_comments, followers: k.total_followers,
        positive: k.positive, negative: k.negative, neutral: k.neutral,
        avg_sentiment: k.avg_sentiment_score
      };
      out.parties = (D.parties || []).slice(0, 12).map(function (p) {
        return { party: p.party, tweets: p.tweets, handles: p.handles, views: p.views,
                 engagement: p.engagement, pos: p.positive, neg: p.negative,
                 sentiment: p.avg_sentiment, followers: p.followers };
      });
      out.top_candidates = (D.candidates || []).slice(0, 20).map(function (c) {
        return { name: c.name, handle: c.handle, party: c.party, level: c.designation,
                 tweets: c.tweets, followers: c.followers, engagement: c.engagement,
                 sentiment: c.avg_sentiment, score: c.score };
      });
      out.top_constituencies = (D.geo || []).slice(0, 15).map(function (g) {
        return { constituency: g.pc, tweets: g.tweets, pos: g.positive, neg: g.negative,
                 sentiment: g.avg_sentiment };
      });
      out.top_words = (D.word_cloud || []).slice(0, 20);
      out.top_hashtags = (D.hashtags || []).slice(0, 15);
      out.daily_last_30 = (D.timeline_daily || []).slice(-30);
      out.by_hour = D.timeline_hourly || [];
    } else {
      /* With filters on, the precomputed aggregates no longer apply -
         they have to be recounted from the filtered rows. */
      var parties = {}, handles = {}, constituencies = {}, days = {}, hours = {};
      var pos = 0, neg = 0, neu = 0, views = 0, likes = 0, rts = 0, cmts = 0, ssum = 0;
      rows.forEach(function (t) {
        if (t.pt) parties[t.pt] = (parties[t.pt] || 0) + 1;
        if (t.h) handles[t.h] = (handles[t.h] || 0) + 1;
        if (t.pc) constituencies[t.pc] = (constituencies[t.pc] || 0) + 1;
        if (t.d) { days[t.d.slice(0, 10)] = (days[t.d.slice(0, 10)] || 0) + 1;
                   var hh = +t.d.slice(11, 13); if (!isNaN(hh)) hours[hh] = (hours[hh] || 0) + 1; }
        if (t.sn === 'Positive') pos++; else if (t.sn === 'Negative') neg++; else neu++;
        views += +t.v || 0; likes += +t.l || 0; rts += +t.r || 0; cmts += +t.c || 0;
        ssum += +t.ss || 0;
      });
      out.totals = { tweets: rows.length, handles: Object.keys(handles).length,
                     views: views, likes: likes, retweets: rts, comments: cmts,
                     positive: pos, negative: neg, neutral: neu,
                     avg_sentiment: rows.length ? +(ssum / rows.length).toFixed(3) : 0 };
      out.parties = topN(parties, 12, 'party');
      out.top_handles = topN(handles, 15, 'handle');
      out.top_constituencies = topN(constituencies, 15, 'constituency');
      out.daily_last_30 = Object.keys(days).sort().slice(-30).map(function (d) { return [d, days[d]]; });
      out.by_hour = Object.keys(hours).map(function (h) { return [+h, hours[h]]; })
        .sort(function (a, b) { return a[0] - b[0]; });
    }

    out.top_tweets = rows.slice()
      .sort(function (a, b) { return (b.eng || 0) - (a.eng || 0); })
      .slice(0, 6)
      .map(function (t) {
        return { handle: t.h, name: t.cn, party: t.pt, date: (t.d || '').slice(0, 10),
                 views: t.v, likes: t.l, retweets: t.r, sentiment: t.sn,
                 text: String(t.tx || '').slice(0, 160) };
      });
    return out;
  }
  window.plAiDigest = buildDigest;

  /* ------------------------------------------------------ markdown-lite --
   * Gemini writes markdown. No need for a full markdown library here -
   * bold, bullets and line breaks cover it. */
  function mdToHtml(t) {
    var safe = escX(t);
    var lines = safe.split('\n');
    var html = '', inList = false;
    lines.forEach(function (raw) {
      var l = raw.trim();
      var isBullet = /^[-*•]\s+/.test(l);
      if (isBullet) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + l.replace(/^[-*•]\s+/, '') + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (l) html += '<p>' + l + '</p>';
      }
    });
    if (inList) html += '</ul>';
    return html
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  /* --------------------------------------------------------------- ask -- */
  function thinking() {
    var box = qs('#aiMessages'); if (!box) return null;
    var d = document.createElement('div');
    d.className = 'ai-msg ai-msg-bot ai-thinking';
    d.innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span>';
    box.appendChild(d); box.scrollTop = box.scrollHeight;
    return d;
  }

  function askAI(text) {
    if (typeof window.aiPush === 'function') window.aiPush('user', escX(text));
    var bubble = thinking();

    fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, stats: buildDigest() })
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
      })
      .then(function (res) {
        if (bubble) bubble.remove();
        if (res.ok && res.j.answer) {
          if (typeof window.aiPush === 'function') window.aiPush('assistant', mdToHtml(res.j.answer));
          return;
        }
        if (res.status === 409) {                 // no key configured
          AI.enabled = false; setModeLine();
          fallback(text, 'No Gemini key found - add one under Settings → AI. Built-in answer for now:');
          return;
        }
        fallback(text, 'The AI did not answer (' + escX(res.j.error || res.status) + '). Built-in answer:');
      })
      .catch(function (e) {
        if (bubble) bubble.remove();
        fallback(text, 'Could not reach the AI (' + escX(e.message) + '). Built-in answer:');
      });
  }

  function fallback(text, note) {
    if (typeof window.aiPush === 'function') {
      window.aiPush('assistant', '<p class="ai-warn">' + note + '</p>');
    }
    if (typeof window.askLocal === 'function') window.askLocal(text);
  }

  /* ------------------------------------------------------------- wiring -- */
  function takeOver() {
    var input = qs('#aiInput');
    var form = input && input.closest('form');
    if (!form) return;
    /* assistant.js has already bound its own handler. Cloning the form
       drops every old listener, then we attach ours. */
    var fresh = form.cloneNode(true);
    form.parentNode.replaceChild(fresh, form);
    fresh.addEventListener('submit', function (e) {
      e.preventDefault();
      var i = fresh.querySelector('#aiInput');
      var v = (i.value || '').trim();
      if (!v) return;
      i.value = '';
      if (AI.enabled) askAI(v);
      else if (typeof window.askLocal === 'function') window.askLocal(v);
    });
  }

  function wireSettings() {
    var save = qs('#aiKeySave'), clear = qs('#aiKeyClear');
    if (save) save.addEventListener('click', function () {
      var key = (qs('#aiKeyInput') || {}).value || '';
      var model = (qs('#aiModelSel') || {}).value || 'gemini-2.0-flash';
      save.disabled = true; save.textContent = 'Saving…';
      fetch('/api/ai/key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), model: model })
      }).then(function (r) { return r.json(); })
        .then(function () {
          var el = qs('#aiKeyInput'); if (el) el.value = '';
          return refreshStatus();
        })
        .then(function () { if (PLX.toast) PLX.toast('AI settings saved'); })
        .catch(function (e) { if (PLX.toast) PLX.toast('Save failed: ' + e.message); })
        .then(function () { save.disabled = false; save.textContent = 'Save'; });
    });
    if (clear) clear.addEventListener('click', function () {
      fetch('/api/ai/key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '' })
      }).then(refreshStatus).then(function () { if (PLX.toast) PLX.toast('Key removed'); });
    });
  }

  function init() {
    takeOver();
    wireSettings();
    refreshStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
