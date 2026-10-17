var PL_BASE = (typeof window !== 'undefined' && window.PL_BASE) || '';
/* ======================================================================
   AI SETTINGS  (pehle assistant-ai.js ka hissa tha)
   ----------------------------------------------------------------------
   "Political Lens Assistant" (floating chat) 10-Oct ko hata diya gaya.
   Par Settings ka Gemini key/model panel wahin pada tha, aur Reports tab
   ka AI analysis (report-ai.js -> /api/ai/narrative) usi key par chalta
   hai. Isliye sirf chat wala hissa nikala gaya, ye panel bacha liya.

   Key kabhi browser me nahi aati -- server par ai_config.json me rehti hai.
   ====================================================================== */
(function () {
  'use strict';

  var PLX = window.PL || {};
  var qs = function (s) { return document.querySelector(s); };
  var escX = PLX.esc || function (v) { return String(v == null ? '' : v); };

  var AI = { enabled: false, model: '', checked: false };

  /* ------------------------------------------------------------ status -- */
  function setStatusTag() {
    var tag = qs('#aiStatusTag');
    if (tag) {
      tag.textContent = AI.enabled ? ('On \u00b7 ' + AI.model) : 'Off';
      tag.classList.toggle('tag-on', AI.enabled);
    }
  }


  function refreshStatus() {
    return fetch(PL_BASE + '/api/ai/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        AI.enabled = !!j.enabled; AI.model = j.model || ''; AI.checked = true;
        setStatusTag();
        var st = qs('#aiKeyStatus');
        if (st) st.textContent = j.enabled
          ? ('Key saved (' + j.keyTail + ') · model ' + j.model)
          : 'No key set - Reports ka AI analysis band rahega.';
        if (j.enabled) loadModels(j.model);
        else { var sel = qs('#aiModelSel'); if (sel && j.model) sel.value = j.model; }
        return j;
      })
      .catch(function () { AI.checked = true; setStatusTag(); });
  }
  /* Model list seedha Google se -- hardcoded list har kuch mahine me
     purani pad jaati hai aur "model no longer available" dene lagti hai. */
  function loadModels(current) {
    var sel = qs('#aiModelSel');
    if (!sel) return;
    fetch(PL_BASE + '/api/ai/models', { cache: 'no-store' })
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

  /* ------------------------------------------------------------- wiring -- */

  function wireSettings() {
    var save = qs('#aiKeySave'), clear = qs('#aiKeyClear');
    if (save) save.addEventListener('click', function () {
      var key = (qs('#aiKeyInput') || {}).value || '';
      var model = (qs('#aiModelSel') || {}).value || 'gemini-2.0-flash';
      save.disabled = true; save.textContent = 'Saving…';
      fetch(PL_BASE + '/api/ai/key', {
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
      fetch(PL_BASE + '/api/ai/key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '' })
      }).then(refreshStatus).then(function () { if (PLX.toast) PLX.toast('Key removed'); });
    });
  }
  function init() {
    wireSettings();
    refreshStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
