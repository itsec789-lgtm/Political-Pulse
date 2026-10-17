/* ======================================================================
   INSIGHTS  —  data health + patterns
   ----------------------------------------------------------------------
   Everything is derived from the data already loaded - no new source.
   ====================================================================== */

const PLI = window.PL || {};
const $i  = PLI.$  || (s => document.querySelector(s));
const $$i = PLI.$$ || (s => Array.from(document.querySelectorAll(s)));
const escI = PLI.esc || (v => String(v == null ? '' : v));
const pcI  = PLI.partyColor || (() => '#64748B');

function ID(){ return PLI.DATA || {}; }
function iRows(){
  const all = (ID().explorer) || [];
  return PLI.tweetPassesFilters ? all.filter(PLI.tweetPassesFilters) : all;
}
function nI(n){
  const s = String(Math.round(Number(n)||0));
  if(s.length <= 3) return s;
  let h = s.slice(0,-3), t = s.slice(-3), p = [];
  while(h.length > 2){ p.unshift(h.slice(-2)); h = h.slice(0,-2); }
  if(h) p.unshift(h);
  return p.join(',') + ',' + t;
}
function nB(n){
  n = Number(n)||0;
  if(n >= 1e7) return (n/1e7).toFixed(2)+' Cr';
  if(n >= 1e5) return (n/1e5).toFixed(2)+' L';
  return nI(n);
}
function tbl2(head, body, cls){
  if(!body.length) return '<p class="ins-empty">No data found.</p>';
  return `<div class="table-wrap"><table class="data-table ${cls||''}"><thead><tr>`
    + head.map(h=>`<th>${escI(h)}</th>`).join('') + '</tr></thead><tbody>'
    + body.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')
    + '</tbody></table></div>';
}

/* ------------------------------------------------------ data quality -- */

function renderDQ(){
  const el = $i('#dqBox'); if(!el) return;
  const D = ID(), rs = D.explorer || [];
  const n = rs.length || 1;

  const miss = f => rs.filter(r => r[f] == null || r[f] === '').length;
  const badPC = new Set(['','-','unknown','n/a','na','none','null','nan']);
  const noArea = rs.filter(r => badPC.has(String(r.pc||'').trim().toLowerCase())).length;
  const noParty = miss('pt'), noDesig = miss('dg'), noSent = miss('sn');

  // Duplicate tweets — same URL do baar
  const seen = new Set(); let dup = 0;
  rs.forEach(r=>{ const u = r.u; if(!u) return; if(seen.has(u)) dup++; else seen.add(u); });

  // How stale the data is
  const days = rs.map(r=>String(r.d||'').slice(0,10)).filter(Boolean).sort();
  const last = days[days.length-1] || '';
  const ageDays = last ? Math.floor((Date.now() - new Date(last).getTime())/86400000) : null;

  const row = (label, bad, note) => {
    const pct = bad/n*100;
    const cls = pct === 0 ? 'ok' : pct < 5 ? 'warn' : 'bad';
    return `<div class="dq-row">
      <span class="dq-label">${escI(label)}</span>
      <span class="dq-bar"><i class="${cls}" style="width:${Math.min(100,pct).toFixed(1)}%"></i></span>
      <span class="dq-val ${cls}">${nI(bad)} <small>${pct.toFixed(1)}%</small></span>
      <span class="dq-note">${escI(note||'')}</span>
    </div>`;
  };

  const tz = tzSplit(rs);
  let banner = '';
  if(tz.utc && tz.ist){
    banner += `<div class="dq-stale">Mixed timezones — <b>${nI(tz.utc)}</b> rows in UTC
      and <b>${nI(tz.ist)}</b> rows in IST. The dashboard converts both correctly,
      but the source export should really use a single timezone.</div>`;
  }
  if(ageDays != null && ageDays > 3){
    banner += `<div class="dq-stale">The newest tweet is from <b>${last}</b> —  data
      <b>${ageDays} days</b> old. These numbers do not reflect today.</div>`;
  }

  el.innerHTML = banner + `
    <p class="ins-note">Each row shows how much data is <b>missing or wrong</b>.
       The shorter the bar, the better.</p>
    ${row('Constituency not mapped', noArea, 'these rows are missing from area charts')}
    ${row('Party missing', noParty, 'excluded from the party breakdown')}
    ${row('Designation missing', noDesig, 'excluded from the MP/MLA filter')}
    ${row('Sentiment missing', noSent, 'treated as Neutral')}
    ${row('Duplicate tweets', dup, 'the same URL twice')}
    <div class="dq-foot">Total tracked tweets: <b>${nI(rs.length)}</b> ·
      ${escI(days[0]||'—')} se ${escI(last||'—')}</div>`;
}

/* ---------------------------------------------------------- heatmap -- */

const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* The data mixes TWO timezones:
     "2026-05-20 03:31:00 UTC"  -> 3,701 rows
     "2026-07-23 09:07:47 IST"  -> 6,113 rows
   Treating both the same and adding +5:30 would shift the IST rows five
   and a half hours forward and make the heatmap completely wrong.
   So the suffix is read before converting. This is an upstream problem -
   the export should use one timezone. */
function parseIST(v){
  if(!v) return null;
  const raw = String(v).trim();
  const tz = /IST\s*$/i.test(raw) ? 'IST' : /UTC\s*$/i.test(raw) ? 'UTC' : null;
  const s = raw.replace(/\s*(UTC|IST)\s*$/i, '').replace(' ', 'T');
  const d = new Date(s + 'Z');            // always parse as UTC first
  if(isNaN(d)) return null;
  // Convert UTC to IST; IST rows are already IST
  return tz === 'UTC' ? new Date(d.getTime() + 5.5*3600*1000) : d;
}

/* How many rows are in which timezone - for the data quality panel */
function tzSplit(rows){
  let utc = 0, ist = 0, bad = 0;
  rows.forEach(r=>{
    const s = String(r.d||'');
    if(/IST\s*$/i.test(s)) ist++;
    else if(/UTC\s*$/i.test(s)) utc++;
    else bad++;
  });
  return {utc, ist, bad};
}

function renderHeat(){
  const el = $i('#heatBox'); if(!el) return;
  const grid = Array.from({length:7}, ()=>new Array(24).fill(0));
  let max = 0, total = 0;

  iRows().forEach(r=>{
    const ist = parseIST(r.d);      // comes back already converted to IST
    if(!ist) return;
    const wd = ist.getUTCDay(), hr = ist.getUTCHours();
    grid[wd][hr]++; total++;
    if(grid[wd][hr] > max) max = grid[wd][hr];
  });

  if(!total){ el.innerHTML = '<p class="ins-empty">Dates could not be parsed.</p>'; return; }

  let peak = {n:0};
  grid.forEach((row,w)=>row.forEach((v,h)=>{ if(v>peak.n) peak = {n:v, w, h}; }));

  let html = '<div class="heat"><div class="heat-hours">' 
    + [0,4,8,12,16,20].map(h=>`<span style="left:${(h/24*100).toFixed(2)}%">${h}</span>`).join('')
    + '</div>';
  grid.forEach((row,w)=>{
    html += `<div class="heat-row"><span class="heat-wd">${WD[w]}</span><div class="heat-cells">`
      + row.map((v,h)=>{
          const t = max ? v/max : 0;
          return `<i style="background:rgba(var(--primary-rgb),${(0.06+t*0.94).toFixed(3)})"
                     title="${WD[w]} ${h}:00 — ${nI(v)} tweets"></i>`;
        }).join('')
      + '</div></div>';
  });
  html += '</div>';
  html += `<p class="ins-note">Busiest slot: <b>${WD[peak.w]} ${peak.h}:00–${peak.h+1}:00</b>
           — ${nI(peak.n)} tweets. Times are IST (converted from UTC where needed).</p>`;
  el.innerHTML = html;
}

/* --------------------------------------------------------- momentum -- */

function renderMomentum(){
  const el = $i('#momBox'); if(!el) return;
  const rs = iRows();
  const days = rs.map(r=>String(r.d||'').slice(0,10)).filter(Boolean).sort();
  if(!days.length){ el.innerHTML = '<p class="ins-empty">No date data available.</p>'; return; }

  const end = new Date(days[days.length-1]);
  const cut1 = new Date(end); cut1.setDate(cut1.getDate()-7);
  const cut2 = new Date(end); cut2.setDate(cut2.getDate()-14);
  const iso = d => d.toISOString().slice(0,10);

  const agg = (from, to) => {
    const out = {tweets:0, views:0, eng:0, pos:0, neg:0};
    rs.forEach(r=>{
      const d = String(r.d||'').slice(0,10);
      if(d > from && d <= to){
        out.tweets++; out.views += +r.v||0; out.eng += +r.eng||0;
        if(r.sn==='Positive') out.pos++; else if(r.sn==='Negative') out.neg++;
      }
    });
    return out;
  };
  const now = agg(iso(cut1), iso(end)), prev = agg(iso(cut2), iso(cut1));

  const delta = (a,b) => b ? ((a-b)/b*100) : (a ? 100 : 0);
  const row = (label, a, b, fmt) => {
    const d = delta(a,b);
    const cls = Math.abs(d) < 1 ? 'flat' : d > 0 ? 'up' : 'down';
    const arrow = cls === 'flat' ? '→' : cls === 'up' ? '▲' : '▼';
    return `<div class="mom-row">
      <span class="mom-l">${escI(label)}</span>
      <span class="mom-now">${fmt(a)}</span>
      <span class="mom-prev">was ${fmt(b)}</span>
      <span class="mom-d ${cls}">${arrow} ${Math.abs(d).toFixed(1)}%</span>
    </div>`;
  };

  const netNow = now.tweets ? (now.pos-now.neg)/now.tweets : 0;
  const netPrev = prev.tweets ? (prev.pos-prev.neg)/prev.tweets : 0;

  el.innerHTML = `
    ${row('Tweets', now.tweets, prev.tweets, nI)}
    ${row('Views', now.views, prev.views, nB)}
    ${row('Engagement', now.eng, prev.eng, nB)}
    ${row('Positive tweets', now.pos, prev.pos, nI)}
    ${row('Negative tweets', now.neg, prev.neg, nI)}
    <div class="mom-net">Net sentiment: <b>${netNow.toFixed(3)}</b>
      <small>(previously ${netPrev.toFixed(3)})</small></div>
    <p class="ins-note">Window: ${iso(cut1)} → ${iso(end)} vs ${iso(cut2)} → ${iso(cut1)}</p>`;
}

/* ---------------------------------------------------------- compare -- */

function cmpAgg(party){
  const out = {tweets:0, views:0, likes:0, rts:0, eng:0, pos:0, neg:0, neu:0, handles:new Set()};
  iRows().forEach(r=>{
    if(r.pt !== party) return;
    out.tweets++; out.views += +r.v||0; out.likes += +r.l||0;
    out.rts += +r.r||0; out.eng += +r.eng||0;
    if(r.sn==='Positive') out.pos++; else if(r.sn==='Negative') out.neg++; else out.neu++;
    if(r.h) out.handles.add(String(r.h).toLowerCase());
  });
  return out;
}

function renderCompare(){
  const box = $i('#cmpBox'), a = $i('#cmpA'), b = $i('#cmpB');
  if(!box || !a || !b) return;
  const A = a.value, B = b.value;
  if(!A || !B || A === B){
    box.innerHTML = '<p class="ins-empty">Pick two different parties.</p>'; return;
  }
  const x = cmpAgg(A), y = cmpAgg(B);
  const st = o => (o.pos+o.neg+o.neu) || 1;

  const rows = [
    ['Tweets', x.tweets, y.tweets, nI],
    ['Handles', x.handles.size, y.handles.size, nI],
    ['Views', x.views, y.views, nB],
    ['Likes', x.likes, y.likes, nB],
    ['Retweets', x.rts, y.rts, nB],
    ['Engagement', x.eng, y.eng, nB],
    ['Avg views/tweet', Math.round(x.views/(x.tweets||1)), Math.round(y.views/(y.tweets||1)), nI],
    ['Positive %', x.pos/st(x)*100, y.pos/st(y)*100, v=>v.toFixed(1)+'%'],
    ['Negative %', x.neg/st(x)*100, y.neg/st(y)*100, v=>v.toFixed(1)+'%'],
    ['Net sentiment', (x.pos-x.neg)/st(x), (y.pos-y.neg)/st(y), v=>v.toFixed(3)],
  ];

  box.innerHTML = `
    <div class="cmp-head">
      <span style="color:${pcI(A)}">${escI(A)}</span>
      <span></span>
      <span style="color:${pcI(B)}">${escI(B)}</span>
    </div>`
    + rows.map(([label, va, vb, f])=>{
        const tot = Math.abs(va) + Math.abs(vb) || 1;
        const pa = Math.abs(va)/tot*100;
        const win = va === vb ? '' : (va > vb ? 'a' : 'b');
        return `<div class="cmp-row">
          <span class="cmp-v ${win==='a'?'win':''}">${f(va)}</span>
          <span class="cmp-mid">
            <span class="cmp-label">${escI(label)}</span>
            <span class="cmp-bar">
              <i style="width:${pa.toFixed(1)}%;background:${pcI(A)}"></i>
              <i style="width:${(100-pa).toFixed(1)}%;background:${pcI(B)}"></i>
            </span>
          </span>
          <span class="cmp-v ${win==='b'?'win':''}">${f(vb)}</span>
        </div>`;
      }).join('');
}

function initCompare(){
  const a = $i('#cmpA'), b = $i('#cmpB');
  if(!a || !b) return;
  const P = (ID().parties||[]).slice().sort((p,q)=>(q.tweets||0)-(p.tweets||0));
  const opts = P.map(p=>`<option value="${escI(p.party)}">${escI(p.party)}</option>`).join('');
  a.innerHTML = opts; b.innerHTML = opts;
  if(P[0]) a.value = P[0].party;
  if(P[1]) b.value = P[1].party;
  a.addEventListener('change', renderCompare);
  b.addEventListener('change', renderCompare);
}

/* --------------------------------------------------------- language -- */

function renderLang(){
  const el = $i('#langBox'); if(!el) return;
  const buckets = {hi:{n:0,eng:0}, en:{n:0,eng:0}, mix:{n:0,eng:0}};
  iRows().forEach(r=>{
    const t = String(r.tx||'');
    const dev = (t.match(/[\u0900-\u097F]/g)||[]).length;
    const lat = (t.match(/[A-Za-z]/g)||[]).length;
    if(!dev && !lat) return;
    const k = !dev ? 'en' : !lat ? 'hi' : (dev/(dev+lat) > 0.7 ? 'hi' : dev/(dev+lat) < 0.25 ? 'en' : 'mix');
    buckets[k].n++; buckets[k].eng += +r.eng||0;
  });
  const total = buckets.hi.n + buckets.en.n + buckets.mix.n || 1;
  const NAME = {hi:'Hindi (Devanagari)', en:'English / Roman', mix:'Mixed'};

  el.innerHTML = tbl2(['Language','Tweets','Share','Avg engagement'],
    Object.entries(buckets).sort((a,b)=>b[1].n-a[1].n).map(([k,v])=>[
      NAME[k], nI(v.n), (v.n/total*100).toFixed(1)+'%',
      nI(Math.round(v.eng/(v.n||1)))
    ]))
    + `<p class="ins-note">Average engagement shows which language lands harder -
       volume alone does not tell you that.</p>`;
}

/* ----------------------------------------------- engagement quality -- */

function renderEQ(){
  const el = $i('#eqBox'); if(!el) return;
  const m = new Map();
  iRows().forEach(r=>{
    if(!r.h) return;
    let a = m.get(r.h) || {h:r.h, cn:r.cn, pt:r.pt, n:0, l:0, c:0, rt:0};
    a.n++; a.l += +r.l||0; a.c += +r.c||0; a.rt += +r.r||0;
    m.set(r.h, a);
  });
  const list = [...m.values()].filter(a=>a.n >= 5 && a.l > 0)
    .map(a=>({...a, ratio: a.c/(a.l||1)*100}))
    .sort((a,b)=>b.ratio-a.ratio).slice(0,10);

  el.innerHTML = tbl2(['Handle','Party','Tweets','Comments per 100 likes'],
    list.map(a=>[
      `<b>@${escI(a.h)}</b>`, escI(a.pt||'—'), nI(a.n),
      `<b>${a.ratio.toFixed(1)}</b>`
    ]))
    + `<p class="ins-note">A high comments-per-like ratio means the content is being
       <b>argued about</b>. A low one means people are quietly approving. Counting
       likes alone never surfaces that difference.</p>`;
}

/* ------------------------------------------------------- duplicates -- */

function renderDup(){
  const el = $i('#dupBox'); if(!el) return;
  const m = new Map();
  iRows().forEach(r=>{
    const t = String(r.tx||'').toLowerCase().replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
    if(t.length < 40) return;                    // short texts repeat naturally
    const key = t.slice(0, 160);
    let a = m.get(key) || {t:String(r.tx||'').slice(0,90), handles:new Set(), n:0};
    a.n++; if(r.h) a.handles.add(r.h);
    m.set(key, a);
  });
  const list = [...m.values()].filter(a=>a.handles.size > 1)
    .sort((a,b)=>b.handles.size-a.handles.size).slice(0,8);

  if(!list.length){
    el.innerHTML = '<p class="ins-empty">No text was repeated by more than one handle.</p>';
    return;
  }
  el.innerHTML = tbl2(['Text (shuruaat)','Handles','Total posts'],
    list.map(a=>[escI(a.t)+'…', `<b>${a.handles.size}</b>`, nI(a.n)]))
    + `<p class="ins-note">Ek hi text alag-alag handles se — aksar coordinated campaign ka
       is a signal. It is not wrong in itself, but it is worth knowing.</p>`;
}

/* ---------------------------------------------------- silent handles -- */

function renderQuiet(){
  const el = $i('#quietBox'); if(!el) return;
  const D = ID();
  const active = new Set(iRows().map(r=>String(r.h||'').toLowerCase()).filter(Boolean));
  const list = (D.handles||[])
    .filter(h=>h.handle && !active.has(String(h.handle).toLowerCase()))
    .sort((a,b)=>(b.followers||0)-(a.followers||0)).slice(0,10);

  if(!list.length){
    el.innerHTML = '<p class="ins-empty">Every tracked handle is active.</p>'; return;
  }
  el.innerHTML = tbl2(['Handle','Name','Party','Followers'],
    list.map(h=>[
      `<b>@${escI(h.handle)}</b>`, escI(h.candidate||'—'), escI(h.party||'—'), nB(h.followers)
    ]))
    + `<p class="ins-note">These handles are tracked but have no tweets in this filter or
       date range. A large account going quiet is a finding in itself.</p>`;
}

/* ------------------------------------------------------------- init -- */

function renderInsights(){
  try{ renderDQ(); }catch(e){ console.warn('[dq]', e); }
  try{ renderHeat(); }catch(e){ console.warn('[heat]', e); }
  try{ renderMomentum(); }catch(e){ console.warn('[mom]', e); }
  try{ renderCompare(); }catch(e){ console.warn('[cmp]', e); }
  try{ renderLang(); }catch(e){ console.warn('[lang]', e); }
  try{ renderEQ(); }catch(e){ console.warn('[eq]', e); }
  try{ renderDup(); }catch(e){ console.warn('[dup]', e); }
  try{ renderQuiet(); }catch(e){ console.warn('[quiet]', e); }
}

function initInsights(){
  initCompare();
  // Build only when the page opens - eight panels over ~10k rows is heavy,
  // so running this on every render is not worth it
  document.addEventListener('click', e=>{
    if(e.target.closest('[data-target="insights"]')) setTimeout(renderInsights, 60);
  });
  // On a filter change, rebuild only if the page is actually open
  ['#fParty','#fSentiment','#fDesignation','#clearFilters'].forEach(sel=>{
    const el = $i(sel); if(!el) return;
    el.addEventListener('change', ()=>{
      const p = $i('#insights');
      if(p && p.classList.contains('active')) setTimeout(renderInsights, 60);
    });
  });
  const p = $i('#insights');
  if(p && p.classList.contains('active')) renderInsights();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initInsights);
else initInsights();
