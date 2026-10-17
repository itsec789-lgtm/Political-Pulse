var PL_BASE = (typeof window !== 'undefined' && window.PL_BASE) || '';
/* ======================================================================
   REPORTS +  (deep topic search  &  AI analysis)
   ----------------------------------------------------------------------
   reports.js itself is untouched - three of its globals are swapped here:

     topicRows()  -> with deep search on, returns results from the whole
                     database rather than just the latest 25,000 sample
     openPrint()  -> the AI analysis block also goes into the PDF
     logoTag()    -> empty (no logo was wanted)

   The AI rule is the same as the assistant's: only NUMBERS go to the
   model, never raw tweets.
   ====================================================================== */
(function () {
  'use strict';

  var PLY = window.PL || {};
  var qs = function (s) { return document.querySelector(s); };
  var esc = PLY.esc || function (v) { return String(v == null ? '' : v); };

  /* Logo removed - the report header stays text-only. */
  window.logoTag = function () { return ''; };

  /* ----------------------------------------------------- deep topic -- */
  var deep = { term: '', rows: null, loading: false };

  function norm(t) { return String(t || '').toLowerCase().trim().replace(/^#/, ''); }

  var origTopicRows = window.topicRows;
  window.topicRows = function (term) {
    var t = norm(term);
    if (deep.rows && deep.term === t) return deep.rows;
    return origTopicRows ? origTopicRows(term) : [];
  };

  var _t = null;
  function onTopicInput() {
    var inp = qs('#rptTopic'), hint = qs('#rptTopicHint');
    var chk = qs('#rptDeep');
    if (!inp) return;
    clearTimeout(_t);
    _t = setTimeout(function () {
      var term = norm(inp.value);
      if (!term) { deep.rows = null; deep.term = ''; if (hint) hint.textContent = ''; return; }

      if (!chk || !chk.checked) {                 // loaded sample only
        deep.rows = null; deep.term = '';
        if (hint) {
          var n = origTopicRows ? origTopicRows(term).length : 0;
          hint.textContent = n.toLocaleString('en-IN') + ' tweets (in the loaded sample)';
        }
        return;
      }

      if (hint) hint.textContent = 'Searching the database…';
      deep.loading = true;
      fetch(PL_BASE + '/api/topic?q=' + encodeURIComponent(term), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          deep.loading = false;
          if (j.error) throw new Error(j.error);
          deep.term = term;
          deep.rows = j.rows || [];
          if (hint) hint.textContent = deep.rows.length.toLocaleString('en-IN')
            + ' tweets found (whole Punjab corpus)';
        })
        .catch(function (e) {
          deep.loading = false; deep.rows = null; deep.term = '';
          if (hint) hint.textContent = 'Deep search failed: ' + e.message + ' - falling back to the sample';
        });
    }, 350);
  }

  /* --------------------------------------------------- AI ka block -- */
  var aiBlockHtml = '';       // used in both the preview and the PDF

  /* The AI block belongs inside the report SHEET, just before the footer.
     Appended outside it, it hangs on the grey background and lands on a
     separate page in the PDF. */
  function injectIntoReport(html, block) {
    if (!block) return html;
    var i = html.lastIndexOf('<div class="rp-foot"');
    return i < 0 ? html + block : html.slice(0, i) + block + html.slice(i);
  }

  var origOpenPrint = window.openPrint;
  window.openPrint = function (html) {
    return origOpenPrint ? origOpenPrint(injectIntoReport(html, aiBlockHtml)) : undefined;
  };

  function paintInto(box) {
    if (!box || !aiBlockHtml) return;
    var old = box.querySelector('.rp-ai');
    if (old) old.remove();
    var foot = box.querySelector('.rp-foot');
    if (foot) foot.insertAdjacentHTML('beforebegin', aiBlockHtml);
    else box.insertAdjacentHTML('beforeend', aiBlockHtml);
  }

  /* Numbers are built straight from DATA rather than scraped back out of
     the report, so the AI sees exactly the slice the report shows. */
  function reportStats() {
    var kind = (document.querySelector('#rptTypes .rpt-type.active') || {}).dataset;
    kind = kind ? kind.r : 'exec';

    var base = (window.plAiDigest ? window.plAiDigest() : {});
    base.report_type = kind;

    if (kind === 'topic') {
      var term = (qs('#rptTopic') || {}).value || '';
      var rows = window.topicRows(term) || [];
      var pos = 0, neg = 0, neu = 0, views = 0, eng = 0;
      var parties = {}, handles = {}, constituencies = {}, days = {};
      rows.forEach(function (t) {
        if (t.sn === 'Positive') pos++; else if (t.sn === 'Negative') neg++; else neu++;
        views += +t.v || 0; eng += +t.eng || 0;
        if (t.pt) parties[t.pt] = (parties[t.pt] || 0) + 1;
        if (t.h) handles[t.h] = (handles[t.h] || 0) + 1;
        if (t.pc) constituencies[t.pc] = (constituencies[t.pc] || 0) + 1;
        if (t.d) days[t.d.slice(0, 10)] = (days[t.d.slice(0, 10)] || 0) + 1;
      });
      var top = function (m, n) {
        return Object.keys(m).map(function (k) { return [k, m[k]]; })
          .sort(function (a, b) { return b[1] - a[1]; }).slice(0, n);
      };
      base.topic = {
        term: term, tweets: rows.length, views: views, engagement: eng,
        positive: pos, negative: neg, neutral: neu,
        scope: (deep.rows && deep.term === norm(term))
          ? 'searched the whole Punjab corpus' : 'searched the loaded sample only',
        by_party: top(parties, 10), by_handle: top(handles, 10),
        by_constituency: top(constituencies, 10),
        daily: Object.keys(days).sort().slice(-30).map(function (d) { return [d, days[d]]; }),
        top_tweets: rows.slice().sort(function (a, b) { return (b.eng || 0) - (a.eng || 0); })
          .slice(0, 5).map(function (t) {
            return { handle: t.h, party: t.pt, views: t.v, likes: t.l,
                     date: (t.d || '').slice(0, 10), text: String(t.tx || '').slice(0, 160) };
          })
      };
    }
    return base;
  }

  function runAI() {
    var btn = qs('#rptAi'), box = qs('#rptPreviewBox');
    if (!btn) return;

    if (window.plAiOn && !window.plAiOn()) {
      if (PLY.toast) PLY.toast('Add a Gemini key in Settings first');
      var s = qs('li[data-target="settings"]'); if (s) s.click();
      return;
    }

    btn.disabled = true; btn.textContent = '✨ Thinking…';
    if (box) {
      box.hidden = false;
      if (!box.innerHTML.trim()) { var p = qs('#rptPreview'); if (p) p.click(); }
    }

    fetch(PL_BASE + '/api/ai/narrative', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: (document.querySelector('#rptTypes .rpt-type.active') || {}).dataset.r,
                             stats: reportStats() })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          if (res.status === 409) throw new Error('No Gemini key found - add one in Settings');
          throw new Error(res.j.error || ('HTTP ' + res.status));
        }
        var bullets = res.j.bullets || [];
        if (!bullets.length) throw new Error('The AI returned an empty answer');

        aiBlockHtml = '<section class="rp-sec rp-ai">'
          + '<h2>AI Analysis</h2>'
          + '<ul class="rp-ai-list">'
          + bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('')
          + '</ul>'
          + '<p class="rp-note">This analysis is based only on the numbers above - '
          + 'the model was never given raw tweets.</p></section>';

        paintInto(box);
        var el = box && box.querySelector('.rp-ai');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (PLY.toast) PLY.toast('AI analysis added - it will be included in the PDF');
      })
      .catch(function (e) {
        aiBlockHtml = '';
        if (PLY.toast) PLY.toast('AI failed: ' + e.message);
      })
      .then(function () { btn.disabled = false; btn.textContent = '✨ AI se analysis'; });
  }

  /* Changing the report type or a filter makes the old AI block stale */
  function invalidateAI() { aiBlockHtml = ''; }

  function init() {
    var inp = qs('#rptTopic');
    if (inp) inp.addEventListener('input', onTopicInput);
    var chk = qs('#rptDeep');
    if (chk) chk.addEventListener('change', onTopicInput);

    var ai = qs('#rptAi');
    if (ai) ai.addEventListener('click', runAI);

    document.querySelectorAll('#rptTypes .rpt-type').forEach(function (b) {
      b.addEventListener('click', invalidateAI);
    });
    ['#fParty', '#fSentiment', '#fDesignation', '#fPC', '#clearFilters'].forEach(function (sel) {
      var el = qs(sel); if (el) el.addEventListener('change', invalidateAI);
    });
    var prev = qs('#rptPreview');
    if (prev) prev.addEventListener('click', function () {
      /* A rebuilt preview does not contain the AI block, so it is put
         back rather than appearing to vanish. */
      setTimeout(function () {
        var box = qs('#rptPreviewBox');
        if (aiBlockHtml && box && !box.querySelector('.rp-ai')) paintInto(box);
      }, 40);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
