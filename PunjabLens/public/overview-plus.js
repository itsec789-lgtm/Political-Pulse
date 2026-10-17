/* ======================================================================
   OVERVIEW PLUS
     1. Level strip   — kis level par kitna data (big numbers)
     2. Exec summary  — 4 categories me narrative insights
     3. Header PDF    — kahin se bhi report nikalo
   ====================================================================== */

const PLO = window.PL || {};
const $o  = PLO.$  || (s => document.querySelector(s));
const escO = PLO.esc || (v => String(v == null ? '' : v));
const pcO  = PLO.partyColor || (() => '#64748B');

function OD(){ return PLO.DATA || {}; }
function oRows(){
  const all = (OD().explorer) || [];
  return PLO.tweetPassesFilters ? all.filter(PLO.tweetPassesFilters) : all;
}
function nO(n){
  const s = String(Math.round(Number(n)||0));
  if(s.length <= 3) return s;
  let h = s.slice(0,-3), t = s.slice(-3), p = [];
  while(h.length > 2){ p.unshift(h.slice(-2)); h = h.slice(0,-2); }
  if(h) p.unshift(h);
  return p.join(',') + ',' + t;
}
function bO(n){
  n = Number(n)||0;
  if(n >= 1e7) return (n/1e7).toFixed(2)+' Cr';
  if(n >= 1e5) return (n/1e5).toFixed(2)+' L';
  return nO(n);
}

/* ------------------------------------------------------- level strip -- */

const BAD_PC = new Set(['','-','unknown','n/a','na','none','null','nan','unmapped','national']);

const LVL = [
  {id:'LS_MP',  label:'LS MP',   match:d=>/^ls_mp/i.test(d)},
  {id:'RS_MP',  label:'RS MP',   match:d=>/^rs_mp/i.test(d)},
  {id:'MLA',    label:'MLA',     match:d=>/^mla$/i.test(d)},
  {id:'MLC',    label:'MLC',     match:d=>/^mlc$/i.test(d)},
  {id:'CM',     label:'CM / Dy CM', match:d=>/chief\s*minister/i.test(d)},
];

function renderLevelStrip(){
  const host = $o('#lvlStrip'); if(!host) return;
  const rows = oRows();
  const agg = new Map();

  rows.forEach(r=>{
    const d = String(r.dg||'');
    const g = LVL.find(l=>l.match(d));
    const key = g ? g.id : 'OTH';
    let a = agg.get(key) || {tweets:0, handles:new Set()};
    a.tweets++; if(r.h) a.handles.add(String(r.h).toLowerCase());
    agg.set(key, a);
  });

  const items = LVL.map(l=>({label:l.label, ...(agg.get(l.id)||{tweets:0, handles:new Set()})}));
  const oth = agg.get('OTH');
  if(oth && oth.tweets) items.push({label:'Others', ...oth});

  const shown = items.filter(i=>i.tweets > 0);
  if(!shown.length){ host.innerHTML = ''; return; }
  const max = Math.max(...shown.map(i=>i.tweets));

  host.innerHTML = `<div class="lvl-head">Tweets by level
      <small>large number = tweets · small = handles tracked</small></div>
    <div class="lvl-row">` + shown.map(i=>`
      <div class="lvl-item">
        <b>${nO(i.tweets)}</b>
        <span class="lvl-name">${escO(i.label)}</span>
        <span class="lvl-h">${nO(i.handles.size)} handles</span>
        <span class="lvl-bar"><i style="width:${(i.tweets/max*100).toFixed(1)}%"></i></span>
      </div>`).join('') + '</div>';
}

/* ----------------------------------------------------- exec summary -- */

function execSummary(){
  const rows = oRows();
  if(!rows.length) return null;

  let likes=0, rts=0, views=0, eng=0, pos=0, neg=0, neu=0;
  const parties = new Map(), handles = new Map(), areas = new Map(), days = new Map(), hours = new Array(24).fill(0);

  rows.forEach(r=>{
    likes += +r.l||0; rts += +r.r||0; views += +r.v||0; eng += +r.eng||0;
    if(r.sn==='Positive') pos++; else if(r.sn==='Negative') neg++; else neu++;

    if(r.pt){ const a = parties.get(r.pt) || {n:0,v:0,pos:0,neg:0,h:new Set()};
      a.n++; a.v += +r.v||0; if(r.sn==='Positive')a.pos++; if(r.sn==='Negative')a.neg++;
      if(r.h) a.h.add(r.h); parties.set(r.pt,a); }

    if(r.h){ const a = handles.get(r.h) || {n:0,v:0,eng:0,cn:r.cn,pt:r.pt};
      a.n++; a.v += +r.v||0; a.eng += +r.eng||0; handles.set(r.h,a); }

    // Skip placeholder constituencies like "-" or "Unknown" - otherwise you
    // get a nonsense insight such as "- has the most activity"
    if(r.pc && !BAD_PC.has(String(r.pc).trim().toLowerCase())){
      areas.set(r.pc, (areas.get(r.pc)||0)+1);
    }

    const d = String(r.d||'').slice(0,10);
    if(d) days.set(d, (days.get(d)||0)+1);

    // IST hour (the data contains both UTC and IST timestamps)
    const raw = String(r.d||'');
    const tz = /IST\s*$/i.test(raw) ? 'IST' : 'UTC';
    const dt = new Date(raw.replace(/\s*(UTC|IST)\s*$/i,'').replace(' ','T') + 'Z');
    if(!isNaN(dt)){
      const ist = tz === 'UTC' ? new Date(dt.getTime()+5.5*3600000) : dt;
      hours[ist.getUTCHours()]++;
    }
  });

  const tot = pos+neg+neu || 1;
  const P = [...parties.entries()].map(([k,v])=>({name:k,...v})).sort((a,b)=>b.n-a.n);
  const H = [...handles.entries()].map(([k,v])=>({h:k,...v}));
  const topReach = H.slice().sort((a,b)=>b.v-a.v)[0];
  const topActive = H.slice().sort((a,b)=>b.n-a.n)[0];
  const bestRatio = H.filter(x=>x.n>=10).sort((a,b)=>(b.v/b.n)-(a.v/a.n))[0];
  const topArea = [...areas.entries()].sort((a,b)=>b[1]-a[1])[0];
  const peakDay = [...days.entries()].sort((a,b)=>b[1]-a[1])[0];
  const peakHr = hours.indexOf(Math.max(...hours));
  const posP = P.filter(p=>p.n>=20).sort((a,b)=>((b.pos-b.neg)/b.n)-((a.pos-a.neg)/a.n))[0];

  return {
    highlights: [
      topReach && `<b>@${escO(topReach.h)}</b> has the highest reach — ${bO(topReach.v)} views from ${nO(topReach.n)} tweets`,
      P[0] && `<b>${escO(P[0].name)}</b> ka ${(P[0].n/rows.length*100).toFixed(1)}% share — ${nO(P[0].n)} tweets, ${nO(P[0].h.size)} handles`,
      peakDay && `<b>${peakDay[0]}</b> was the busiest day — ${nO(peakDay[1])} tweets`,
      `Peak posting hour <b>${peakHr}:00–${peakHr+1}:00 IST</b> — ${nO(hours[peakHr])} tweets`,
      topArea && `<b>${escO(topArea[0])}</b> has the most activity — ${nO(topArea[1])} tweets`,
    ].filter(Boolean),

    sentiment: [
      `<b>${(neu/tot*100).toFixed(1)}%</b> of tweets are Neutral — communication is mostly factual`,
      `<b>${(pos/tot*100).toFixed(1)}%</b> Positive · <b>${(neg/tot*100).toFixed(1)}%</b> Negative`,
      `Net sentiment score <b>${((pos-neg)/tot).toFixed(3)}</b>`,
      posP && `<b>${escO(posP.name)}</b> has the most positive tone — net ${((posP.pos-posP.neg)/posP.n).toFixed(3)}`,
      `<b>${bO(likes)}</b> likes and <b>${bO(rts)}</b> retweets in total`,
    ].filter(Boolean),

    parties: P.slice(0,5).map(p=>
      `<b>${escO(p.name)}</b>: ${nO(p.n)} tweets · ${bO(p.v)} views · ${nO(p.h.size)} handles · net ${((p.pos-p.neg)/p.n).toFixed(3)}`),

    performers: [
      topActive && `<b>@${escO(topActive.h)}</b> is the most active — ${nO(topActive.n)} tweets`,
      bestRatio && `<b>@${escO(bestRatio.h)}</b> ka best reach ratio — ${nO(Math.round(bestRatio.v/bestRatio.n))} avg views per tweet`,
      ...H.slice().sort((a,b)=>b.eng-a.eng).slice(0,3).map((x,i)=>
        `${i+1}. <b>@${escO(x.h)}</b> — ${bO(x.eng)} engagement${x.pt?' · '+escO(x.pt):''}`),
    ].filter(Boolean),

    scale: {tweets: rows.length, handles: handles.size, views, eng},
  };
}

function renderExecSummary(){
  const host = $o('#execSum'); if(!host) return;
  const s = execSummary();
  if(!s){ host.innerHTML = '<p class="ins-empty">No data in this filter.</p>'; return; }

  const block = (icon, title, items, cls) => `
    <div class="es-block ${cls}">
      <h4><span>${icon}</span>${escO(title)}</h4>
      <ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>
    </div>`;

  host.innerHTML = `
    <div class="es-scale">
      <div><b>${nO(s.scale.tweets)}</b><span>Tweets</span></div>
      <div><b>${nO(s.scale.handles)}</b><span>Handles</span></div>
      <div><b>${bO(s.scale.views)}</b><span>Views</span></div>
      <div><b>${bO(s.scale.eng)}</b><span>Engagement</span></div>
    </div>
    <div class="es-grid">
      ${block('★','Key Highlights', s.highlights, 'es-hi')}
      ${block('◐','Sentiment Insights', s.sentiment, 'es-se')}
      ${block('▣','Party Performance', s.parties, 'es-pa')}
      ${block('▲','Top Performers', s.performers, 'es-tp')}
    </div>`;
}

/* ------------------------------------------------------- header PDF -- */

function initHeaderPDF(){
  const btn = $o('#hdrPdf'); if(!btn) return;
  btn.addEventListener('click', ()=>{
    const go = $o('.sidebar li[data-target="reports"]');
    if(go) go.click();
    setTimeout(()=>{ const p = $o('#rptPreview'); if(p) p.click(); }, 220);
  });
}

/* ------------------------------------------------------------- init -- */

function renderOverviewPlus(){
  try{ renderLevelStrip(); }catch(e){ console.warn('[lvl]', e); }
  try{ renderExecSummary(); }catch(e){ console.warn('[exec]', e); }
}

function initOverviewPlus(){
  initHeaderPDF();
  renderOverviewPlus();

  // Filter badalne par dobara banao
  ['#fParty','#fSentiment','#fDesignation','#fPC'].forEach(sel=>{
    const el = $o(sel); if(!el) return;
    el.addEventListener('change', ()=>setTimeout(renderOverviewPlus, 80));
  });
  const cl = $o('#clearFilters');
  if(cl) cl.addEventListener('click', ()=>setTimeout(renderOverviewPlus, 80));
  document.addEventListener('click', e=>{
    if(e.target.closest('.date-chip') || e.target.closest('#dateApplyBtn'))
      setTimeout(renderOverviewPlus, 140);
  });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initOverviewPlus);
else initOverviewPlus();
