/* ===========================================================================
 *  breaking.js  --  PunjabLens ka BREAKING NEWS page.
 *  ---------------------------------------------------------------------------
 *  SOURCE: koi bahar ka news API NAHI. Wahi media house / journalist tweets
 *  jo pehle se scrape hokar MongoDB me pade hain. Data main dashboard ke
 *  /api/news se aata hai (scope=punjab) -- PunjabLens usi server ke andar
 *  /punjab par mounted hai, isliye ye path yahin se chal jaata hai.
 *
 *  Punjab me pehle Punjab ki khabar, phir zaroori national khabar.
 *  Kisi teesre state ki khabar yahan nahi aati.
 * =========================================================================== */
(function () {
  'use strict';

  var CAT_ALL = ['All', 'Politics', 'Government', 'Crime', 'Law & Order', 'Elections',
    'Economy', 'Business', 'Education', 'Health', 'Weather', 'Sports', 'International', 'Other'];

  var cat = 'All', sort = 'latest', skip = 0, busy = false, seen = null;
  var PAGE = 30;

  function q(id) { return document.getElementById(id); }
  function E(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function N(n) { return Number(n || 0).toLocaleString('en-IN'); }

  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return Math.round(s) + ' sec ago';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 172800) return Math.round(s / 3600) + ' hours ago';
    return Math.round(s / 86400) + ' days ago';
  }

  function card(r) {
    var loc = r.scope === 'punjab' ? 'Punjab' : (r.scope === 'national' ? 'National' : (r.st || 'India'));
    return '<div class="bn-card' + (r.breaking ? ' brk' : '') + '">'
      + '<div class="bn-hd">'
      + (r.breaking ? '<span class="bn-badge">&#128308; BREAKING</span>' : '')
      + '<span class="bn-cat">' + E(r.cat) + '</span>'
      + '<span class="bn-loc">' + E(loc) + '</span>'
      + '</div>'
      + '<div class="bn-h">' + E(r.head) + '</div>'
      + (r.sum ? '<div class="bn-s">' + E(r.sum) + '</div>' : '')
      + '<div class="bn-ft">'
      + '<span class="bn-src">' + E(r.src || r.h) + '</span>'
      + '<span>' + E(r.kind) + '</span>'
      + '<span title="' + E(r.date) + '">' + E(ago(String(r.date).replace(' ', 'T'))) + '</span>'
      + '<span>&#128065; <b>' + N(r.vw) + '</b></span>'
      + '<span>&#10084; <b>' + N(r.lk) + '</b></span>'
      + '<span>&#128257; <b>' + N(r.rt) + '</b></span>'
      + (r.url ? '<a href="' + E(r.url) + '" target="_blank" rel="noopener">Read full story &#8594;</a>' : '')
      + '</div></div>';
  }

  /* Freshness sabse nayi KHABAR ki umr se -- page khulne se nahi.
     Data purana hai to seedha DELAYED / STALE likhte hain. */
  function fresh(iso) {
    var dot = q('bnDot'), tx = q('bnLiveTx');
    if (!dot || !tx) return;
    var t = Date.parse(iso || '');
    if (!t) { dot.className = 'bn-dot bad'; tx.textContent = 'no news'; return; }
    var h = (Date.now() - t) / 3600000;
    dot.className = 'bn-dot' + (h <= 3 ? '' : (h <= 24 ? ' warn' : ' bad'));
    tx.textContent = (h <= 3 ? 'LIVE' : (h <= 24 ? 'DELAYED' : 'STALE')) + ' · ' + ago(iso);
  }

  function chips(counts, total) {
    var box = q('bnCats'); if (!box) return;
    box.innerHTML = CAT_ALL.map(function (n) {
      var c = n === 'All' ? total : (counts[n] || 0);
      if (n !== 'All' && !c) return '';
      return '<button class="bn-chip' + (n === cat ? ' on' : '') + '" data-c="' + E(n) + '">'
        + E(n) + '<b>' + c + '</b></button>';
    }).join('');
  }

  function jsonOf(r) {
    var ct = r.headers.get('content-type') || '';
    if (ct.indexOf('json') < 0) {
      throw new Error(r.status === 404
        ? 'Server is running an older build — restart it once.'
        : 'Server did not return JSON (HTTP ' + r.status + ').');
    }
    return r.json();
  }

  function load(reset) {
    var box = q('bnFeed'); if (!box || busy) return;
    busy = true;
    if (reset) { skip = 0; box.innerHTML = '<div class="bn-msg">Loading…</div>'; }
    fetch('/api/news?scope=punjab&cat=' + encodeURIComponent(cat) + '&sort=' + sort
          + '&limit=' + PAGE + '&skip=' + skip, { cache: 'no-store' })
      .then(jsonOf).then(function (j) {
        busy = false;
        if (j.error) throw new Error(j.error);
        fresh(j.newest);
        seen = j.newest || seen;
        var nb = q('bnNew'); if (nb) nb.classList.remove('show');
        if (skip === 0) chips(j.counts || {}, j.total || 0);
        var html = (j.rows || []).map(card).join('');
        if (skip === 0) box.innerHTML = html || '<div class="bn-msg">No news for this filter.</div>';
        else if (html) box.insertAdjacentHTML('beforeend', html);
        skip += (j.rows || []).length;
        var more = q('bnMore');
        if (more) more.style.display = (skip < (j.total || 0)) ? 'inline-block' : 'none';
      })
      .catch(function (e) {
        busy = false;
        box.innerHTML = '<div class="bn-msg">Could not load news — ' + E(e && e.message ? e.message : e) + '</div>';
      });
  }

  /* Har 60 sec sirf GINTI poochte hain -- feed apne aap nahi badalti,
     warna padhte waqt list khisak jaati hai. */
  function poll() {
    if (!seen || !document.getElementById('breaking') ||
        !document.getElementById('breaking').classList.contains('active')) return;
    fetch('/api/news/meta?scope=punjab&since=' + encodeURIComponent(seen), { cache: 'no-store' })
      .then(jsonOf).then(function (j) {
        fresh(j.newest);
        var b = q('bnNew'); if (!b) return;
        if (j.fresh > 0) { b.textContent = '🔴 ' + j.fresh + ' new stories'; b.classList.add('show'); }
      }).catch(function () {});
  }

  function boot() {
    var cb = q('bnCats');
    if (cb) cb.addEventListener('click', function (e) {
      var b = e.target.closest('.bn-chip'); if (!b) return;
      cat = b.dataset.c; load(true);
    });
    var ss = document.querySelectorAll('#breaking .bn-chip[data-s]');
    Array.prototype.forEach.call(ss, function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(ss, function (x) { x.classList.remove('on'); });
        b.classList.add('on'); sort = b.dataset.s; load(true);
      });
    });
    var m = q('bnMore'); if (m) m.addEventListener('click', function () { load(false); });
    var nb = q('bnNew'); if (nb) nb.addEventListener('click', function () { load(true); });

    /* switchPage PunjabLens ka apna hai -- usme lipat kar pehli baar load
       kar dete hain (har page par query chalane ka koi matlab nahi). */
    var done = false, orig = window.switchPage;
    if (typeof orig === 'function') {
      window.switchPage = function (t) {
        var r = orig.apply(this, arguments);
        if (t === 'breaking' && !done) { done = true; load(true); }
        return r;
      };
    }
    setInterval(poll, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);

  window.bnLoad = load;
})();
