/* ===== SENT8 -- 8 sentiment categories =====
   Mongo ke 'Sentiment' (yahan field ka naam 'sn') me ye values aati hain:
   Neutral, Positive, Negative, Pro-BJP, Anti-BJP, Pro-Govt, Anti-Govt
   -- aur jahan khaali ho wo 'No-Sentiment'.
   Pehle sirf 3 gine jaate the (Positive/Negative, baaki sab Neutral) --
   yaani Pro-BJP/Pro-Govt jaise tweets galti se Neutral me chale jaate the.
   positive/negative/neutral key purane hi naam hain taaki purana code na toote. */
var SENT8 = (function () {
  var CATS = [
    { k: 'probjp',   label: 'Pro-BJP',      c: '#E65100' },
    { k: 'antigovt', label: 'Anti-Govt',    c: '#AD1457' },
    { k: 'progovt',  label: 'Pro-Govt',     c: '#1565C0' },
    { k: 'positive', label: 'Positive',     c: '#16A34A' },
    { k: 'neutral',  label: 'Neutral',      c: '#94A0B8' },
    { k: 'antibjp',  label: 'Anti-BJP',     c: '#6A1B9A' },
    { k: 'negative', label: 'Negative',     c: '#DC2626' },
    { k: 'nosent',   label: 'No-Sentiment', c: '#CBD5E1' }
  ];
  var MAP = {};
  CATS.forEach(function (o) { MAP[o.label.toLowerCase().replace(/[^a-z0-9]+/g, '')] = o.k; });
  MAP['nosentiment'] = 'nosent'; MAP['none'] = 'nosent'; MAP[''] = 'nosent';
  MAP['na'] = 'nosent'; MAP['null'] = 'nosent'; MAP['nan'] = 'nosent';
  function code(v) {
    return MAP[String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '')] || 'nosent';
  }
  function blank() { var o = {}; CATS.forEach(function (c) { o[c.k] = 0; }); return o; }
  function keys() { return CATS.map(function (c) { return c.k; }); }
  function colors() { return CATS.map(function (c) { return c.c; }); }
  function labels() { return CATS.map(function (c) { return c.label; }); }
  function n(o, k) { return (o && +o[k]) || 0; }
  function tot(o) { var t = 0; CATS.forEach(function (c) { t += n(o, c.k); }); return t; }
  function pick(o) { var r = {}; CATS.forEach(function (c) { r[c.k] = n(o, c.k); }); return r; }
  return { CATS: CATS, code: code, blank: blank, keys: keys, colors: colors,
           labels: labels, n: n, tot: tot, pick: pick };
})();
if (typeof module !== 'undefined' && module.exports) module.exports.SENT8 = SENT8;
if (typeof window !== 'undefined') window.SENT8 = SENT8;

var PL_BASE = (typeof window !== 'undefined' && window.PL_BASE) || '';
/* ==========================================================================
   POLITICAL LENS — App Logic
   Pure vanilla JS. No frameworks, no chart libraries — all charts are
   hand-rolled on <canvas>. Data comes from data.js (DASHBOARD_DATA), a
   static snapshot exported from UP.xlsx (deduplicated by Tweet URL).

   TO GO LIVE WITH GOOGLE SHEETS:
   Replace the DASHBOARD_DATA constant with a call to a Google Apps Script
   Web App endpoint (google.script.run.getDashboardData() when hosted inside
   Apps Script HTML Service, or a fetch() to a deployed /exec URL otherwise),
   then call renderAll() once the payload arrives. Everything below is
   already written to run off a single in-memory DATA object, so swapping
   the source is a one-function change.
   ========================================================================== */

(function(){
"use strict";

const $ = (sel, ctx) => (ctx||document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx||document).querySelectorAll(sel));

const COLORS = {
  primary:'#2563EB', navy:'#0F172A', light:'#3B82F6',
  success:'#16A34A', danger:'#DC2626', warning:'#F59E0B',
  grid:'#E7EBF3', text:'#94A0B8'
};
const PARTY_COLORS = ['#2563EB','#DC2626','#16A34A','#F59E0B','#7C3AED','#0EA5E9','#EC4899','#14B8A6','#F97316','#64748B','#A855F7','#84CC16','#EAB308'];

/* ---------------------------------------------------------------------- */
/*  PARTY COLOURS — real-world party colours (BJP saffron, SP red, etc.)  */
/*  Falls back to a deterministic colour from PARTY_COLORS for any party  */
/*  name not in the map, so new/unknown parties still get a stable,      */
/*  distinct colour instead of grey.                                     */
/* ---------------------------------------------------------------------- */
const PARTY_COLOR_MAP = {
  'BJP':'#FF9933', 'BHARATIYA JANATA PARTY':'#FF9933',
  'INC':'#00A0E3', 'CONGRESS':'#00A0E3', 'INDIAN NATIONAL CONGRESS':'#00A0E3',
  'SP':'#DC2626', 'SAMAJWADI PARTY':'#DC2626',
  'BSP':'#22409A', 'BAHUJAN SAMAJ PARTY':'#22409A',
  'AAP':'#0072BC', 'AAM AADMI PARTY':'#0072BC',
  'RLD':'#006600', 'RASHTRIYA LOK DAL':'#006600',
  'NISHAD':'#F59E0B', 'NISHAD PARTY':'#F59E0B',
  'SBSP':'#8B4513', 'SUHELDEV BHARTIYA SAMAJ PARTY':'#8B4513',
  'AD(S)':'#00A651', 'APNA DAL (S)':'#00A651', 'APNA DAL(SONELAL)':'#00A651',
  'AD(K)':'#8E44AD', 'APNA DAL (K)':'#8E44AD', 'APNA DAL(KAMERAWADI)':'#8E44AD',
  'ASP (KR)':'#1F8A70', 'AZAD SAMAJ PARTY':'#1F8A70',
  'JDL':'#0EA5E9', 'JAN ADHIKAR PARTY':'#0EA5E9',
  'TMC':'#0A8B45', 'AIMIM':'#00695C', 'SHS':'#F97316', 'NCP':'#0E7C61',
  'IND':'#64748B', 'INDEPENDENT':'#64748B'
};
function partyColor(party){
  if(!party) return '#94A0B8';
  const key = String(party).trim().toUpperCase();
  if(PARTY_COLOR_MAP[key]) return PARTY_COLOR_MAP[key];
  let hash = 0;
  for(let i=0;i<key.length;i++) hash = (hash*31 + key.charCodeAt(i)) >>> 0;
  return PARTY_COLORS[hash % PARTY_COLORS.length];
}

/* ---------------------------------------------------------------------- */
/*  DATA CLEAN-UP                                                        */
/*  - de-duplicates tweets by Tweet URL / Tweet ID so the same tweet      */
/*    never appears twice anywhere in the dashboard                      */
/*  - drops blank / "-" / "Unknown" constituency rows so they never show  */
/*    up in filters, tables or charts                                    */
/* ---------------------------------------------------------------------- */
const BAD_PC_VALUES = new Set(['', '-', 'unknown', 'n/a', 'na', 'none', 'null', 'nan']);
function isBadPC(v){ return v==null || BAD_PC_VALUES.has(String(v).trim().toLowerCase()); }

function cleanData(d){
  if(Array.isArray(d.explorer)){
    const seen = new Set(); const out = [];
    for(const t of d.explorer){
      const key = t.u || t.id || t.tid;
      if(key){ if(seen.has(key)) continue; seen.add(key); }
      out.push(t);
    }
    d.explorer = out;
  }
  ['views','likes','retweets','comments','bookmarks','engagement'].forEach(k=>{
    if(Array.isArray(d.trending?.[k])){
      const seen = new Set(); const out = [];
      for(const t of d.trending[k]){
        const key = t.u || t.id || t.tid;
        if(key){ if(seen.has(key)) continue; seen.add(key); }
        out.push(t);
      }
      d.trending[k] = out;
    }
  });
  if(Array.isArray(d.geo)) d.geo = d.geo.filter(g=>!isBadPC(g.pc));
  return d;
}

/* ----------------------------------------------------------------------
   DATA SOURCE
   This used to be the DASHBOARD_DATA constant from data.js (a static
   snapshot). The data now comes from MongoDB - the server returns exactly
   the same shape on /api/data, so every chart below still works unchanged.
   DATA is a `let` so it can be swapped on reload.
   ---------------------------------------------------------------------- */
const EMPTY_DATA = {
  meta:{}, kpis:{total_tweets:0,total_likes:0,total_retweets:0,total_comments:0,
  total_views:0,total_bookmarks:0,...SENT8.blank(),total_candidates:0,
  total_parties:0,total_handles:0,total_followers:0,total_engagement:0,
  avg_sentiment_score:0,avg_followers:0,avg_engagement:0},
  parties:[], candidates:[], geo:[], states:[], timeline_daily:[],
  timeline_hourly:[], word_cloud:[], hashtags:[],
  trending:{views:[],likes:[],retweets:[],comments:[],engagement:[],bookmarks:[]},
  explorer:[], handles:[]
};
let DATA = cleanData(window.DASHBOARD_DATA || JSON.parse(JSON.stringify(EMPTY_DATA)));

/* Active state config (Punjab). Comes from state-config.js. */
function stateCfg(key){
  const cfgs = window.STATE_CONFIGS || {};
  return cfgs[key || window.DEFAULT_STATE || 'Punjab'] || null;
}
let ACTIVE_STATE = window.DEFAULT_STATE || 'Punjab';

function fmt(n){
  n = Number(n)||0;
  if(Math.abs(n)>=1e7) return (n/1e7).toFixed(2)+'Cr';
  if(Math.abs(n)>=1e5) return (n/1e5).toFixed(2)+'L';
  if(Math.abs(n)>=1000) return (n/1000).toFixed(1)+'K';
  return n.toLocaleString('en-IN');
}
function fmtFull(n){ return Number(n||0).toLocaleString('en-IN'); }
function esc(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
function initials(s){
  if(!s) return '??';
  s = String(s).trim().replace(/^@/,'');
  const parts = s.split(/\s+/).filter(Boolean);
  if(parts.length>=2) return (parts[0][0]+parts[1][0]).toUpperCase();
  return s.slice(0,2).toUpperCase();
}
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h); toast._h = setTimeout(()=>t.classList.remove('show'), 2400);
}
function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }
function themeVar(lightVal, darkVal){ return isDark()? darkVal : lightVal; }

/* ---------------------------------------------------------------------- */
/*  CANVAS CHART ENGINE (no external libs)                                */
/* ---------------------------------------------------------------------- */
function hiDPICanvas(canvas){
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, canvas.clientWidth, 300);
  const h = canvas.height ? canvas.height : 220;
  canvas.width = w*ratio; canvas.height = h*ratio;
  canvas.style.width = w+'px'; canvas.style.height = h+'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio,0,0,ratio,0,0);
  return {ctx, w, h};
}

function drawDonut(canvasId, segments, opts={}){
  const canvas = document.getElementById(canvasId); if(!canvas) return;
  const {ctx,w,h} = hiDPICanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const cx=w/2, cy=h/2, R=Math.min(w,h)/2-8, r=R*0.62;
  const total = segments.reduce((a,s)=>a+s.value,0) || 1;
  let start = -Math.PI/2;
  segments.forEach(seg=>{
    const angle = (seg.value/total)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,R,start,start+angle);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    start += angle;
  });
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation='source-over';
  if(opts.centerLabel){
    ctx.fillStyle = themeVar(COLORS.navy,'#F1F5F9');
    ctx.font='700 22px Fraunces, serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(opts.centerLabel, cx, cy-8);
    ctx.font='500 10.5px -apple-system, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(opts.centerSub||'', cx, cy+12);
  }
}

function drawGauge(canvasId, value01, opts={}){
  const canvas = document.getElementById(canvasId); if(!canvas) return;
  const {ctx,w,h} = hiDPICanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const cx=w/2, cy=h/2+20, R=Math.min(w,h*1.4)/2-14;
  // track
  ctx.lineWidth = 16; ctx.lineCap='round';
  ctx.strokeStyle = COLORS.grid;
  ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI,0,false); ctx.stroke();
  // value arc (0..1 mapped to PI..0)
  const val = Math.min(1,Math.max(0,value01));
  const grad = ctx.createLinearGradient(cx-R,cy,cx+R,cy);
  grad.addColorStop(0, COLORS.danger); grad.addColorStop(0.5, COLORS.warning); grad.addColorStop(1, COLORS.success);
  ctx.strokeStyle = grad;
  ctx.beginPath(); ctx.arc(cx,cy,R,Math.PI, Math.PI + val*Math.PI, false); ctx.stroke();
  // needle
  const needleAngle = Math.PI + val*Math.PI;
  ctx.lineWidth=2.4; ctx.strokeStyle = themeVar(COLORS.navy,'#fff');
  ctx.beginPath(); ctx.moveTo(cx,cy);
  ctx.lineTo(cx+Math.cos(needleAngle)*(R-24), cy+Math.sin(needleAngle)*(R-24));
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fillStyle=themeVar(COLORS.navy,'#fff'); ctx.fill();
  ctx.textAlign='center';
  ctx.fillStyle = themeVar(COLORS.navy,'#F1F5F9');
  ctx.font='700 20px Fraunces, serif';
  ctx.fillText(opts.label||'', cx, cy-30);
  ctx.font='500 10.5px -apple-system, sans-serif'; ctx.fillStyle=COLORS.text;
  ctx.fillText(opts.sub||'', cx, cy+18);
}

function drawLine(canvasId, labels, series, opts={}){
  const canvas = document.getElementById(canvasId); if(!canvas) return;
  const {ctx,w,h} = hiDPICanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const padL=40, padR=14, padT=16, padB=28;
  const plotW = w-padL-padR, plotH = h-padT-padB;
  const allVals = series.flatMap(s=>s.data);
  const maxV = Math.max(...allVals, 1);
  const n = labels.length;
  // grid
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth=1;
  ctx.font='10px -apple-system, sans-serif'; ctx.fillStyle = COLORS.text;
  for(let i=0;i<=4;i++){
    const y = padT + plotH - (plotH*i/4);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
    ctx.textAlign='right'; ctx.fillText(fmt(maxV*i/4), padL-8, y+3);
  }
  // x labels (sparse)
  const step = Math.max(1, Math.ceil(n/7));
  ctx.textAlign='center';
  for(let i=0;i<n;i+=step){
    const x = padL + (n<=1?0:(plotW*i/(n-1)));
    ctx.fillText(labels[i], x, h-8);
  }
  series.forEach(s=>{
    ctx.beginPath();
    s.data.forEach((v,i)=>{
      const x = padL + (n<=1?0:(plotW*i/(n-1)));
      const y = padT + plotH - (v/maxV*plotH);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.2; ctx.lineJoin='round'; ctx.stroke();
    // area fill
    const lastX = padL + plotW;
    ctx.lineTo(lastX, padT+plotH); ctx.lineTo(padL, padT+plotH); ctx.closePath();
    const grad = ctx.createLinearGradient(0,padT,0,padT+plotH);
    grad.addColorStop(0, s.color+'33'); grad.addColorStop(1, s.color+'02');
    ctx.fillStyle = grad; ctx.fill();
  });
}

function drawBarChart(canvasId, labels, values, opts={}){
  const canvas = document.getElementById(canvasId); if(!canvas) return;
  const {ctx,w,h} = hiDPICanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const padL=44, padR=14, padT=16, padB= opts.horizontal? 16 : 46;
  if(opts.horizontal){
    const labelW = 118;
    const plotW = w-labelW-padR-10, rowH = Math.min(28, (h-padT-padB)/labels.length);
    const maxV = Math.max(...values,1);
    labels.forEach((lab,i)=>{
      const y = padT + i*rowH;
      ctx.fillStyle = COLORS.text; ctx.font='11px -apple-system, sans-serif';
      ctx.textAlign='right'; ctx.textBaseline='middle';
      const shortLab = lab.length>16? lab.slice(0,15)+'…' : lab;
      ctx.fillText(shortLab, labelW-8, y+rowH/2-2);
      const bw = (values[i]/maxV)*plotW;
      const grad = ctx.createLinearGradient(labelW,0,labelW+bw,0);
      grad.addColorStop(0, opts.color||COLORS.primary); grad.addColorStop(1, opts.color2||COLORS.light);
      ctx.fillStyle = grad;
      roundRect(ctx, labelW, y, Math.max(bw,2), rowH-8, 5); ctx.fill();
      ctx.fillStyle = themeVar(COLORS.navy,'#F1F5F9'); ctx.textAlign='left'; ctx.font='700 10.5px -apple-system, sans-serif';
      ctx.fillText(fmt(values[i]), labelW+bw+8, y+rowH/2-2);
    });
    return;
  }
  const plotW = w-padL-padR, plotH=h-padT-padB;
  const maxV = Math.max(...values,1);
  const bw = plotW/labels.length;
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth=1; ctx.font='10px -apple-system, sans-serif'; ctx.fillStyle=COLORS.text;
  for(let i=0;i<=4;i++){
    const y = padT + plotH - (plotH*i/4);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
    ctx.textAlign='right'; ctx.fillText(fmt(maxV*i/4), padL-8, y+3);
  }
  labels.forEach((lab,i)=>{
    const x = padL + i*bw + bw*0.18;
    const bh = (values[i]/maxV)*plotH;
    const grad = ctx.createLinearGradient(0,padT+plotH-bh,0,padT+plotH);
    const c = opts.colors? opts.colors[i%opts.colors.length] : (opts.color||COLORS.primary);
    grad.addColorStop(0,c); grad.addColorStop(1,c+'99');
    ctx.fillStyle = grad;
    roundRect(ctx, x, padT+plotH-bh, bw*0.64, bh, 5); ctx.fill();
    ctx.fillStyle = COLORS.text; ctx.font='10px -apple-system, sans-serif'; ctx.textAlign='center';
    const shortLab = lab.length>10? lab.slice(0,9)+'…':lab;
    ctx.fillText(shortLab, x+bw*0.32, h-30);
  });
}

function drawStackedBar(canvasId, labels, seriesArr, colors, opts={}){
  // seriesArr: array (per label) of arrays [v1,v2,v3]
  const canvas = document.getElementById(canvasId); if(!canvas) return;
  const {ctx,w,h} = hiDPICanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const padL=140, padR=50, padT=14, padB=14;
  const plotW = w-padL-padR, rowH = Math.min(26,(h-padT-padB)/labels.length);
  labels.forEach((lab,i)=>{
    const y = padT+i*rowH;
    const vals = seriesArr[i];
    const total = vals.reduce((a,b)=>a+b,0)||1;
    ctx.fillStyle = COLORS.text; ctx.font='11px -apple-system, sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle';
    const shortLab = lab.length>20? lab.slice(0,19)+'…':lab;
    ctx.fillText(shortLab, padL-10, y+rowH/2-3);
    let x = padL;
    vals.forEach((v,vi)=>{
      const segW = (v/total)*plotW;
      ctx.fillStyle = colors[vi];
      ctx.fillRect(x,y,Math.max(segW,0),rowH-8);
      x += segW;
    });
  });
}

function roundRect(ctx,x,y,w,h,r){
  if(h<0){ y=y+h; h=Math.abs(h);}
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ---------------------------------------------------------------------- */
/*  FILTER STATE                                                          */
/* ---------------------------------------------------------------------- */
const filters = { party:'', sentiment:'', designation:'', pc:'', q:'' };

function populateFilterDropdowns(){
  const parties = DATA.parties.map(p=>p.party).sort();
  const designations = [...new Set(DATA.candidates.map(c=>c.designation).filter(Boolean))].sort();
  const pcs = DATA.geo.map(p=>p.pc).filter(v=>!isBadPC(v)).sort();
  fillSelect('#fParty', parties);
  fillSelect('#fDesignation', designations);
  fillSelect('#fPC', pcs.slice(0,400));
}
function fillSelect(sel, arr){
  const el = $(sel);
  /* Drop the old options when refilling on reload, otherwise the list
     doubles on every refresh. Keep the first option ("All ..."). */
  while(el.options.length > 1) el.remove(1);
  arr.forEach(v=>{
    const o = document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o);
  });
}

function candidatePassesFilters(c){
  if(filters.party && c.party!==filters.party) return false;
  if(filters.designation && c.designation!==filters.designation) return false;
  if(filters.q){
    const q = filters.q.toLowerCase();
    if(!(String(c.name).toLowerCase().includes(q) || String(c.handle).toLowerCase().includes(q))) return false;
  }
  return true;
}
function tweetPassesFilters(t){
  if(filters.party && t.pt!==filters.party) return false;
  if(filters.sentiment && t.sn!==filters.sentiment) return false;
  if(filters.designation && t.dg!==filters.designation) return false;
  if(filters.pc && t.pc!==filters.pc) return false;
  return true;
}

/* ---------------------------------------------------------------------- */
/*  RENDER: OVERVIEW                                                      */
/* ---------------------------------------------------------------------- */
function animateCounter(el, target, suffix=''){
  const dur = 900; const start = performance.now();
  function step(t){
    const p = Math.min(1,(t-start)/dur);
    const eased = 1-Math.pow(1-p,3);
    el.textContent = fmt(Math.round(target*eased))+suffix;
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function kpiCard(icon, color, value, label){
  return `<div class="kpi-card">
    <div class="kpi-icon" style="background:${color}18;color:${color}">${icon}</div>
    <div class="kpi-value">${fmt(value)}</div>
    <div class="kpi-label">${label}</div>
  </div>`;
}
const ICON = {
  tweet:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M22 5.9c-.7.3-1.5.6-2.3.7a4 4 0 001.7-2.2 8 8 0 01-2.5 1 4 4 0 00-6.9 3.6A11.4 11.4 0 014 4.6a4 4 0 001.2 5.3 4 4 0 01-1.8-.5v.05a4 4 0 003.2 3.9 4 4 0 01-1.8.07 4 4 0 003.7 2.8A8 8 0 012 17.5a11.3 11.3 0 006.1 1.8c7.3 0 11.3-6 11.3-11.3v-.5A8 8 0 0022 5.9z" fill="currentColor"/></svg>',
  users:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20c1-3.6 3.6-5.4 6.5-5.4s5.5 1.8 6.5 5.4M16 8.6a3 3 0 110-5.9M21.5 20c-.6-2.6-2-4.3-4-5.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  flag:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 3v18M5 4h13l-3 4 3 4H5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  eye:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>',
  heart:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7.5-4.6-9.8-9.3C.5 6.9 2.4 3.5 6 3c2-.3 3.8.6 5 2.3C12.2 3.6 14 2.7 16 3c3.6.5 5.5 3.9 3.8 7.7C19.5 15.4 12 20 12 20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  repeat:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4M3 12V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 12v3a3 3 0 01-3 3H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  comment:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.4 8.4 0 01-8.9 8.4 9 9 0 01-3.6-.7L3 20l1.06-3.6A8.3 8.3 0 013 11.5 8.4 8.4 0 0111.9 3a8.5 8.5 0 019.1 8.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  smile:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  bolt:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  bookmark:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 3h12v18l-6-4-6 4V3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chart:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  trend:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 17l6-6 4 4 8-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function renderKPIs(){
  const k = DATA.kpis;
  const grid = $('#kpiGrid');
  grid.innerHTML = [
    kpiCard(ICON.tweet, COLORS.primary, k.total_tweets, 'Total Tweets'),
    kpiCard(ICON.users, COLORS.light, k.total_handles, 'Total Handles'),
    kpiCard(ICON.flag, COLORS.navy, k.total_parties, 'Total Parties'),
    kpiCard(ICON.chart, COLORS.warning, DATA.candidates.length, 'Total Candidates'),
    kpiCard(ICON.eye, COLORS.primary, k.total_views, 'Total Views'),
    kpiCard(ICON.heart, COLORS.danger, k.total_likes, 'Total Likes'),
    kpiCard(ICON.repeat, COLORS.success, k.total_retweets, 'Total Retweets'),
    kpiCard(ICON.smile, COLORS.success, k.positive, 'Positive Tweets'),
  ].join('');
  $('#heroTweets').textContent='0'; $('#heroHandles').textContent='0'; $('#heroPC').textContent='0';
  animateCounter($('#heroTweets'), k.total_tweets);
  animateCounter($('#heroHandles'), k.total_handles);
  animateCounter($('#heroPC'), DATA.geo.length);

  const eg = $('#engKpiGrid');
  eg.innerHTML = [
    kpiCard(ICON.heart, COLORS.danger, k.total_likes, 'Total Likes'),
    kpiCard(ICON.repeat, COLORS.success, k.total_retweets, 'Total Retweets'),
    kpiCard(ICON.comment, COLORS.primary, k.total_comments, 'Total Comments'),
    kpiCard(ICON.eye, COLORS.light, k.total_views, 'Total Views'),
    kpiCard(ICON.bolt, COLORS.warning, k.total_engagement, 'Total Engagement'),
    kpiCard(ICON.trend, COLORS.navy, k.avg_engagement, 'Avg Engagement / Tweet'),
  ].join('');
}

function heroArt(){
  $('#heroArt').innerHTML = `<svg viewBox="0 0 220 220" width="220" height="220">
    <circle cx="110" cy="110" r="95" fill="rgba(59,130,246,.10)"/>
    <circle cx="110" cy="110" r="70" fill="rgba(59,130,246,.14)"/>
    <g transform="translate(110,110)">
      ${Array.from({length:8}).map((_,i)=>{
        const a = (i/8)*Math.PI*2;
        const r1=40, r2=70+ (i%3)*14;
        return `<line x1="${Math.cos(a)*r1}" y1="${Math.sin(a)*r1}" x2="${Math.cos(a)*r2}" y2="${Math.sin(a)*r2}" stroke="#3B82F6" stroke-width="2" opacity="0.55"/>
                <circle cx="${Math.cos(a)*r2}" cy="${Math.sin(a)*r2}" r="5" fill="#fff"/>`;
      }).join('')}
      <circle r="26" fill="#2563EB"/>
      <path d="M-9 2l6 6 12-14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

function renderSentimentDonut(canvasId){
  const k = DATA.kpis;
  drawDonut(canvasId, SENT8.CATS.map(c=>({value:SENT8.n(k,c.k), color:c.c})),
    {centerLabel: fmt(k.total_tweets), centerSub:'tweets'});
}
function renderSentimentLegend(){
  const k = DATA.kpis;
  const total = k.total_tweets||1;
  $('#sentimentLegend').innerHTML = SENT8.CATS
    .map(c=>`<div class="legend-item"><span class="legend-dot" style="background:${c.c}"></span>${c.label} · ${((SENT8.n(k,c.k)/total)*100).toFixed(1)}%</div>`).join('');
}

function renderTimeline(){
  const daily = DATA.timeline_daily;
  const labels = daily.map(d=>d[0].slice(5));
  const values = daily.map(d=>d[1]);
  drawLine('chartTimeline', labels, [{data:values, color:COLORS.primary}]);
}

function generateInsights(){
  const cands = DATA.candidates;
  const parties = DATA.parties;
  const geo = DATA.geo;
  const mostViral = [...cands].sort((a,b)=>b.engagement-a.engagement)[0];
  const mostPositiveParty = [...parties].filter(p=>p.tweets>200).sort((a,b)=>b.avg_sentiment-a.avg_sentiment)[0];
  const mostNegativePC = [...geo].filter(p=>p.tweets>30).sort((a,b)=>a.avg_sentiment-b.avg_sentiment)[0];
  const mostActiveHandle = DATA.handles[0];
  const mostActiveByTweets = [...DATA.handles].sort((a,b)=>b.tweets-a.tweets)[0];
  const topTweet = DATA.trending.engagement[0];
  const trendingWord = DATA.word_cloud[0];

  const items = [
    ['🔥','Most Viral Candidate', mostViral?.name, `${fmt(mostViral?.engagement)} total engagement`],
    ['🟢','Most Positive Party (200+ tweets)', mostPositiveParty?.party, `avg sentiment ${mostPositiveParty?.avg_sentiment}`],
    ['🔻','Most Negative Constituency', mostNegativePC?.pc, `avg sentiment ${mostNegativePC?.avg_sentiment}`],
    ['⚡','Most Active Handle', '@'+mostActiveByTweets?.handle, `${fmtFull(mostActiveByTweets?.tweets)} tweets`],
    ['💬','Highest Engagement Tweet', '@'+topTweet?.h, `${fmt(topTweet?.eng)} engagement`],
    ['🏷️','Trending Political Topic', trendingWord? trendingWord[0] : '-', `${fmtFull(trendingWord?.[1]||0)} mentions`],
  ];
  $('#insightGrid').innerHTML = items.map(([e,t,v,s])=>`
    <div class="insight-item">
      <span class="insight-emoji">${e}</span>
      <div><div class="insight-title">${t}</div><div class="insight-value">${esc(v||'—')}</div><div class="insight-sub">${esc(s||'')}</div></div>
    </div>`).join('');
}

function renderRecentActivity(){
  const recent = [...DATA.explorer].sort((a,b)=> (b.d||'').localeCompare(a.d||'')).slice(0,8);
  $('#recentActivity').innerHTML = recent.map(t=>`
    <div class="activity-item">
      <div class="activity-avatar">${initials(t.h)}</div>
      <div class="activity-body">
        <div class="activity-text">${esc(t.tx)}</div>
        <div class="activity-meta"><span>@${esc(t.h)}</span><span>${sentimentBadge(t.sn)}</span><span>${esc(t.d?.slice(0,16).replace('T',' ')||'')}</span></div>
      </div>
    </div>`).join('');
}

function sentimentBadge(s){
  const cls = s==='Positive'?'badge-pos': s==='Negative'?'badge-neg':'badge-neu';
  return `<span class="badge ${cls}">${esc(s||'Neutral')}</span>`;
}

/* ---------------------------------------------------------------------- */
/*  RENDER: ANALYTICS / ENGAGEMENT                                        */
/* ---------------------------------------------------------------------- */
function renderEngagementCharts(){
  const hourly = DATA.timeline_hourly;
  drawBarChart('chartHourly', hourly.map(h=>h[0]+':00'), hourly.map(h=>h[1]), {color:COLORS.light});
  const k = DATA.kpis;
  drawBarChart('chartEngBar', ['Likes','Retweets','Comments','Views÷10','Bookmarks'],
    [k.total_likes, k.total_retweets, k.total_comments, Math.round(k.total_views/10), k.total_bookmarks],
    {colors:[COLORS.danger, COLORS.success, COLORS.primary, COLORS.light, COLORS.warning]});
}

function renderTopEngagementTable(){
  const rows = DATA.trending.engagement.slice(0,15);
  $('#topEngTable').innerHTML = `<thead><tr><th>Handle</th><th>Candidate</th><th>Party</th><th>Tweet</th><th>Likes</th><th>RTs</th><th>Views</th><th>Engagement</th><th>Sentiment</th></tr></thead>
  <tbody>${rows.map(t=>`<tr>
    <td>@${esc(t.h)}</td><td>${esc(t.cn||'-')}</td><td>${esc(t.pt||'-')}</td>
    <td style="max-width:280px;white-space:normal;">${esc((t.tx||'').slice(0,90))}…</td>
    <td>${fmt(t.l)}</td><td>${fmt(t.r)}</td><td>${fmt(t.v)}</td><td><b>${fmt(t.eng)}</b></td><td>${sentimentBadge(t.sn)}</td>
  </tr>`).join('')}</tbody>`;
}
function renderTopEngagementCandidates(){
  const rows = [...DATA.candidates].sort((a,b)=>b.engagement-a.engagement).slice(0,12);
  const max = rows[0]?.engagement||1;
  $('#topEngCandTable').innerHTML = `<thead><tr><th>#</th><th>Candidate</th><th>Party</th><th>Engagement</th><th></th></tr></thead>
  <tbody>${rows.map((c,i)=>`<tr>
    <td>${i+1}</td><td>${esc(c.name)}</td><td>${esc(c.party)}</td><td><b>${fmt(c.engagement)}</b></td>
    <td><span class="bar-mini"><i style="width:${(c.engagement/max*100).toFixed(0)}%"></i></span></td>
  </tr>`).join('')}</tbody>`;
}

/* ---------------------------------------------------------------------- */
/*  RENDER: SENTIMENT PAGE                                                */
/* ---------------------------------------------------------------------- */
function renderSentimentPage(){
  renderSentimentDonut('chartSentimentDonut2');
  const k = DATA.kpis;
  const gaugeVal = (k.avg_sentiment_score+1)/2; // assume score range -1..1
  drawGauge('chartGauge', Math.min(1,Math.max(0,gaugeVal)), {label:k.avg_sentiment_score.toFixed(3), sub:'Avg Sentiment Score'});

  const daily = DATA.timeline_daily;
  /* Pehle yahan sirf tweet-volume ki line thi (sentiment ka data hi nahi tha).
     Ab pipeline ka asli timeline_sentiment use hota hai -- har category ki apni line. */
  const ST = DATA.timeline_sentiment || [];
  if(ST.length){
    drawLine('chartSentTrend', ST.map(d=>d[0].slice(5)),
      SENT8.CATS.map(c=>({data: ST.map(d=>SENT8.n(d[1],c.k)), color: c.c, label: c.label})));
  } else {
    drawLine('chartSentTrend', daily.map(d=>d[0].slice(5)), [{data: daily.map(d=>d[1]), color: COLORS.light}]);
  }

  const topParties = [...DATA.parties].sort((a,b)=>b.tweets-a.tweets).slice(0,10);
  drawStackedBar('chartPartySentiment', topParties.map(p=>p.party),
    topParties.map(p=>SENT8.keys().map(k=>SENT8.n(p,k))), SENT8.colors());

  const topPCs = [...DATA.geo].sort((a,b)=>b.tweets-a.tweets).slice(0,15);
  drawStackedBar('chartPCSentiment', topPCs.map(p=>p.pc),
    topPCs.map(p=>SENT8.keys().map(k=>SENT8.n(p,k))), SENT8.colors());

  // ---- 8 sentiment KPI cards ----
  const _sk = $('#sentKpiGrid');
  if(_sk) _sk.innerHTML = SENT8.CATS.map(c=>kpiCard(ICON.smile, c.c, SENT8.n(DATA.kpis, c.k), c.label)).join('');

  const cands = [...DATA.candidates].sort((a,b)=>b.tweets-a.tweets).slice(0,20);
  $('#sentCandCount').textContent = DATA.candidates.length+' candidates tracked';
  $('#candSentimentTable').innerHTML =
    `<thead><tr><th>Candidate</th><th>Party</th><th>Tweets</th>`
    + SENT8.CATS.map(c=>`<th>${c.label}</th>`).join('')
    + `<th>Avg Score</th></tr></thead>
  <tbody>${cands.map(c=>`<tr>
    <td>${esc(c.name)}</td><td>${esc(c.party)}</td><td>${fmt(c.tweets)}</td>`
    + SENT8.CATS.map(s=>`<td style="color:${s.c}">${fmt(SENT8.n(c,s.k))}</td>`).join('')
    + `<td>${c.avg_sentiment}</td>
  </tr>`).join('')}</tbody>`;
}

/* ---------------------------------------------------------------------- */
/*  RENDER: CANDIDATES                                                    */
/* ---------------------------------------------------------------------- */
let candRenderCount = 24;
function candidateSortedList(){
  const sortKey = $('#candSort').value;
  let list = DATA.candidates.filter(candidatePassesFilters);
  const sorters = {
    score:(a,b)=>b.score-a.score, followers:(a,b)=>b.followers-a.followers,
    engagement:(a,b)=>b.engagement-a.engagement, tweets:(a,b)=>b.tweets-a.tweets,
    sentiment:(a,b)=>b.avg_sentiment-a.avg_sentiment
  };
  return list.sort(sorters[sortKey]||sorters.score);
}
function renderCandidates(reset=true){
  if(reset) candRenderCount = 24;
  const list = candidateSortedList();
  $('#candCount').textContent = `· ${list.length} shown of ${DATA.candidates.length}`;
  const slice = list.slice(0, candRenderCount);
  $('#candGrid').innerHTML = slice.map(c=>{
    const total = SENT8.tot(c) || 1;
    const pColor = partyColor(c.party);
    return `<div class="cand-card" style="--cand-party-color:${pColor}">
      <div class="cand-top">
        <div class="cand-avatar">${initials(c.name)}</div>
        <div style="min-width:0;flex:1">
          <div class="cand-name" title="${esc(c.name)}">${esc(c.name)}</div>
          <div class="cand-meta"><span class="party-dot" style="background:${pColor}"></span>${esc(c.party)} · ${esc(c.designation||'—')}</div>
        </div>
        <div class="cand-score"><b>${c.score}</b><span>Lens Score</span></div>
      </div>
      <div class="cand-stats">
        <div class="cand-stat"><b>${fmt(c.followers)}</b><span>Followers</span></div>
        <div class="cand-stat"><b>${fmt(c.tweets)}</b><span>Tweets</span></div>
        <div class="cand-stat"><b>${fmt(c.engagement)}</b><span>Engage</span></div>
      </div>
      <div class="cand-sentbar">
        ${SENT8.CATS.map(s=>`<div style="width:${SENT8.n(c,s.k)/total*100}%;background:${s.c}" title="${s.label}"></div>`).join('')}
      </div>
    </div>`;
  }).join('');
  $('#loadMoreCand').style.display = candRenderCount>=list.length? 'none':'inline-flex';
}

/* ---------------------------------------------------------------------- */
/*  RENDER: PARTIES                                                       */
/* ---------------------------------------------------------------------- */
function renderPartiesPage(){
  const parties = [...DATA.parties].sort((a,b)=>b.tweets-a.tweets);
  drawBarChart('chartPartyTweets', parties.map(p=>p.party), parties.map(p=>p.tweets), {colors:parties.map(p=>partyColor(p.party))});
  const byFollowers = [...parties].sort((a,b)=>b.followers-a.followers);
  drawBarChart('chartPartyFollowers', byFollowers.map(p=>p.party), byFollowers.map(p=>p.followers), {colors:byFollowers.map(p=>partyColor(p.party))});

  $('#partyTable').innerHTML = `<thead><tr><th>Party</th><th>Tweets</th><th>Handles</th><th>Followers</th><th>Likes</th><th>Retweets</th><th>Engagement</th><th>Positive</th><th>Negative</th><th>Avg Sentiment</th></tr></thead>
  <tbody>${parties.map(p=>`<tr>
    <td><b style="display:flex;align-items:center;gap:7px"><span class="party-dot" style="background:${partyColor(p.party)}"></span>${esc(p.party)}</b></td><td>${fmt(p.tweets)}</td><td>${fmt(p.handles)}</td><td>${fmt(p.followers)}</td>
    <td>${fmt(p.likes)}</td><td>${fmt(p.retweets)}</td><td>${fmt(p.engagement)}</td>
    <td style="color:${COLORS.success}">${fmt(p.positive)}</td><td style="color:${COLORS.danger}">${fmt(p.negative)}</td>
    <td>${p.avg_sentiment}</td>
  </tr>`).join('')}</tbody>`;
}

/* ---------------------------------------------------------------------- */
/*  RENDER: GEO                                                           */
/* ---------------------------------------------------------------------- */
function renderGeoPage(){
  $('#pcCount').textContent = `· ${DATA.geo.length} constituencies`;
  const top = [...DATA.geo].sort((a,b)=>b.tweets-a.tweets).slice(0,15);
  drawBarChart('chartPCVolume', top.map(p=>p.pc), top.map(p=>p.tweets), {horizontal:true, color:COLORS.primary, color2:COLORS.light});

  const k = DATA.kpis;
  $('#stateSummary').innerHTML = `
    <div class="state-row"><span>Uttar Pradesh — Total Tweets</span><b>${fmtFull(k.total_tweets)}</b></div>
    <div class="state-row"><span>Constituencies Covered</span><b>${DATA.geo.length}</b></div>
    <div class="state-row"><span>Positive Sentiment Share</span><b style="color:${COLORS.success}">${((k.positive/k.total_tweets)*100).toFixed(1)}%</b></div>
    <div class="state-row"><span>Negative Sentiment Share</span><b style="color:${COLORS.danger}">${((k.negative/k.total_tweets)*100).toFixed(1)}%</b></div>
  `;
  renderGeoTable(DATA.geo);
  $('#geoSearch').oninput = (e)=>{
    const q = e.target.value.toLowerCase();
    renderGeoTable(DATA.geo.filter(p=>p.pc?.toLowerCase().includes(q)));
  };
}
function renderGeoTable(rows){
  rows = [...rows].sort((a,b)=>b.tweets-a.tweets).slice(0,150);
  $('#geoTable').innerHTML = `<thead><tr><th>Constituency (PC)</th><th>AC No.</th><th>Tweets</th><th>Positive</th><th>Negative</th><th>Neutral</th><th>Avg Sentiment</th></tr></thead>
  <tbody>${rows.map(p=>`<tr>
    <td><b>${esc(p.pc||'Unknown')}</b></td><td>${esc(p.ac||'-')}</td><td>${fmt(p.tweets)}</td>
    <td style="color:${COLORS.success}">${fmt(p.positive)}</td><td style="color:${COLORS.danger}">${fmt(p.negative)}</td><td>${fmt(p.neutral)}</td>
    <td>${p.avg_sentiment}</td>
  </tr>`).join('')}</tbody>`;
}

/* ---------------------------------------------------------------------- */
/*  RENDER: TRENDING                                                      */
/* ---------------------------------------------------------------------- */
function tweetCardHTML(t, metricLabel, metricValue){
  return `<div class="tweet-card">
    <div class="tweet-head">
      <div class="tweet-avatar">${initials(t.h)}</div>
      <div>
        <div class="tweet-handle">@${esc(t.h)} ${t.cn?('· '+esc(t.cn)):''}</div>
        <div class="tweet-sub">${esc(t.pt||'')} ${t.st?(' · '+esc(t.st)):''} ${sentimentBadge(t.sn)}</div>
      </div>
    </div>
    <div class="tweet-text">${esc(t.tx||'')}</div>
    <div class="tweet-foot">
      <span class="tweet-metric">❤ <b>${fmt(t.l)}</b></span>
      <span class="tweet-metric">🔁 <b>${fmt(t.r)}</b></span>
      <span class="tweet-metric">💬 <b>${fmt(t.c)}</b></span>
      <span class="tweet-metric">👁 <b>${fmt(t.v)}</b></span>
      ${metricLabel? `<span class="tweet-metric">${metricLabel} <b>${fmt(metricValue)}</b></span>`:''}
      <a class="tweet-link" href="${esc(t.u)}" target="_blank" rel="noopener">Open Tweet ↗</a>
    </div>
  </div>`;
}
function renderTrending(tab='views'){
  const rows = DATA.trending[tab] || DATA.trending.views;
  $('#trendingFeed').innerHTML = rows.map(t=>tweetCardHTML(t)).join('');
}

/* ---------------------------------------------------------------------- */
/*  RENDER: TWEET EXPLORER                                                */
/* ---------------------------------------------------------------------- */
let explorerRenderCount = 20;
function explorerFilteredSorted(){
  const q = $('#explorerSearch').value.toLowerCase();
  const sortKey = $('#explorerSort').value;
  let list = DATA.explorer.filter(t=>{
    if(!tweetPassesFilters(t)) return false;
    if(q && !((t.tx||'').toLowerCase().includes(q) || (t.h||'').toLowerCase().includes(q) || (t.cn||'').toLowerCase().includes(q))) return false;
    return true;
  });
  const sorters = { eng:(a,b)=>b.eng-a.eng, date:(a,b)=>(b.d||'').localeCompare(a.d||''), likes:(a,b)=>b.l-a.l, views:(a,b)=>b.v-a.v };
  return list.sort(sorters[sortKey]||sorters.eng);
}
function renderExplorer(reset=true){
  if(reset) explorerRenderCount = 20;
  const list = explorerFilteredSorted();
  $('#explorerCount').textContent = `· ${fmtFull(list.length)} tweets in current view (of ${fmtFull(DATA.explorer.length)} sampled)`;
  $('#explorerFeed').innerHTML = list.slice(0,explorerRenderCount).map(t=>tweetCardHTML(t)).join('');
  $('#loadMoreExplorer').style.display = explorerRenderCount>=list.length? 'none':'inline-flex';
}

/* ---------------------------------------------------------------------- */
/*  RENDER: WORD CLOUD                                                    */
/* ---------------------------------------------------------------------- */
function renderWordCloud(){
  const words = DATA.word_cloud;
  const max = words[0]?.[1]||1, min = words[words.length-1]?.[1]||1;
  $('#wordCloudBox').innerHTML = words.map(([w,c])=>{
    const size = 12 + ((c-min)/(max-min||1))*30;
    return `<span class="wc-word" style="font-size:${size.toFixed(0)}px" title="${c} mentions">${esc(w)}<sup class="wc-count">${fmt(c)}</sup></span>`;
  }).join(' ');
  const tags = DATA.hashtags;
  $('#hashtagBox').innerHTML = tags.map(([w,c])=>`<span class="wc-tag">${esc(w)} · ${fmt(c)}</span>`).join(' ');
}

/* ---------------------------------------------------------------------- */
/*  CSV EXPORT                                                            */
/* ---------------------------------------------------------------------- */
function toCSV(rows){
  if(!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc2 = v => `"${String(v==null?'':v).replace(/"/g,'""')}"`;
  return [headers.join(','), ...rows.map(r=>headers.map(h=>esc2(r[h])).join(','))].join('\n');
}
function downloadCSV(filename, rows){
  const csv = toCSV(rows);
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
  toast('Exported '+filename);
}

/* ---------------------------------------------------------------------- */
/*  NAVIGATION                                                            */
/* ---------------------------------------------------------------------- */
function switchPage(target){
  $$('.page').forEach(p=>p.classList.toggle('active', p.id===target));
  $$('.side-nav li').forEach(li=>li.classList.toggle('active', li.dataset.target===target));
  $('#filterBar').style.display = (target==='explorer')? 'flex':'none';
  requestAnimationFrame(()=>{
    if(target==='sentiment') renderSentimentPage();
    if(target==='parties') renderPartiesPage();
    if(target==='geo') renderGeoPage();
    if(target==='analytics'){ renderEngagementCharts(); renderTopEngagementTable(); renderTopEngagementCandidates(); }
    if(target==='overview'){ renderSentimentDonut('chartSentimentDonut'); renderTimeline(); }
  });
  if(window.innerWidth<=960) document.body.classList.remove('sidebar-open');
}

/* ---------------------------------------------------------------------- */
/*  INIT / EVENTS                                                         */
/* ---------------------------------------------------------------------- */
function initEvents(){
  $$('.side-nav li').forEach(li=>li.addEventListener('click', ()=>switchPage(li.dataset.target)));
  $('#sidebarToggle').addEventListener('click', ()=>{
    if(window.innerWidth<=960) document.body.classList.toggle('sidebar-open');
    else document.body.classList.toggle('sidebar-collapsed');
  });
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#settingsThemeBtn').addEventListener('click', toggleTheme);

  ['fParty','fSentiment','fDesignation','fPC'].forEach(id=>{
    $('#'+id).addEventListener('change', e=>{
      const map = {fParty:'party',fSentiment:'sentiment',fDesignation:'designation',fPC:'pc'};
      filters[map[id]] = e.target.value;
      applyFilters();
    });
  });
  $('#clearFilters').addEventListener('click', ()=>{
    filters.party=''; filters.sentiment=''; filters.designation=''; filters.pc=''; filters.q='';
    ['fParty','fSentiment','fDesignation','fPC'].forEach(id=>$('#'+id).value='');
    $('#globalSearch').value='';
    applyFilters();
  });

  $('#globalSearch').addEventListener('input', e=>{
    filters.q = e.target.value;
    $('#explorerSearch').value = filters.q;
    renderCandidates();
    renderExplorer();
    updateFilterCount();
  });

  $('#candSearch').addEventListener('input', e=>{ filters.q = e.target.value; renderCandidates(); });
  $('#candSort').addEventListener('change', ()=>renderCandidates());
  $('#loadMoreCand').addEventListener('click', ()=>{ candRenderCount+=24; renderCandidates(false); });

  $('#explorerSearch').addEventListener('input', ()=>renderExplorer());
  $('#explorerSort').addEventListener('change', ()=>renderExplorer());
  $('#loadMoreExplorer').addEventListener('click', ()=>{ explorerRenderCount+=20; renderExplorer(false); });

  $$('.tab', $('#trendTabs')).forEach(tab=>{
    tab.addEventListener('click', ()=>{
      $$('.tab', $('#trendTabs')).forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      renderTrending(tab.dataset.t);
    });
  });

  $$('.export-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const set = btn.dataset.set;
      const map = {
        candidates: ()=>DATA.candidates.map(c=>({Name:c.name,Party:c.party,Designation:c.designation,Handle:c.handle,Followers:c.followers,Tweets:c.tweets,Engagement:c.engagement,AvgSentiment:c.avg_sentiment,LensScore:c.score})),
        parties: ()=>DATA.parties.map(p=>({Party:p.party,Tweets:p.tweets,Handles:p.handles,Followers:p.followers,Likes:p.likes,Retweets:p.retweets,Engagement:p.engagement,Positive:p.positive,Negative:p.negative,AvgSentiment:p.avg_sentiment})),
        geo: ()=>DATA.geo.map(p=>({Constituency:p.pc,AC:p.ac,Tweets:p.tweets,Positive:p.positive,Negative:p.negative,Neutral:p.neutral,AvgSentiment:p.avg_sentiment})),
        explorer: ()=>explorerFilteredSorted().slice(0,2000).map(t=>({Handle:t.h,Candidate:t.cn,Party:t.pt,Date:t.d,Text:t.tx,Likes:t.l,Retweets:t.r,Comments:t.c,Views:t.v,Sentiment:t.sn,URL:t.u}))
      };
      downloadCSV(`political-lens-${set}.csv`, map[set]());
    });
  });

  document.addEventListener('keydown', e=>{
    if(e.key==='/' && document.activeElement.tagName!=='INPUT'){ e.preventDefault(); $('#globalSearch').focus(); }
  });

  window.addEventListener('resize', debounce(()=>{
    const active = $('.page.active');
    if(active) switchPage(active.id);
  }, 300));
}

function applyFilters(){
  updateFilterCount();
  renderCandidates();
  renderExplorer();
  if($('#geo').classList.contains('active')) renderGeoPage();
  if($('#parties').classList.contains('active')) renderPartiesPage();
}
function updateFilterCount(){
  const active = Object.values(filters).filter(Boolean).length;
  $('#filterCount').textContent = active? `${active} filter(s) active` : '';
}
function debounce(fn, ms){ let h; return (...a)=>{ clearTimeout(h); h=setTimeout(()=>fn(...a), ms); }; }

function toggleTheme(){
  const html = document.documentElement;
  const cur = html.getAttribute('data-theme');
  html.setAttribute('data-theme', cur==='dark'?'light':'dark');
  requestAnimationFrame(()=>{
    const active = $('.page.active');
    if(active) switchPage(active.id);
  });
}

function setNavDate(){
  const now = new Date();
  $('#navDate').textContent = now.toLocaleDateString('en-IN', {weekday:'short', year:'numeric', month:'short', day:'numeric'});
}

function updateDataSourceBadge(){
  const m = DATA.meta||{};
  const badge = $('#dataSourceBadge');
  const statusEl = $('#dataSourceStatus');
  if(!DATA.kpis.total_tweets){
    if(badge) badge.textContent = 'No data loaded — use Settings → Data Source';
    if(statusEl) statusEl.innerHTML = 'Nothing loaded yet — pick an Excel, CSV or JSON file above to build the dashboard.';
    return;
  }
  const label = m.source_label || m.generated || 'MongoDB';
  if(badge) badge.textContent = `${m.live? 'Live · MongoDB':'File Snapshot'} · ${label}`;
  if(statusEl){
    statusEl.innerHTML = `<span class="dot-live"></span> ${fmtFull(DATA.explorer.length)} sampled tweets loaded from <b>${esc(label)}</b>${m.duplicates_removed? ` · ${fmtFull(m.duplicates_removed)} duplicate Tweet ID(s) removed`:''}`;
  }
}

let eventsBound = false;
function renderAll(){
  populateFilterDropdowns();
  heroArt();
  renderKPIs();
  renderSentimentDonut('chartSentimentDonut');
  renderSentimentLegend();
  renderTimeline();
  generateInsights();
  renderRecentActivity();
  renderCandidates();
  renderExplorer();
  renderTrending('views');
  renderWordCloud();
  updateDataSourceBadge();
  setNavDate();
  if(!eventsBound){ initEvents(); eventsBound = true; }
  $('#filterBar').style.display='none';
}

/* ---------------------------------------------------------------------- */
/*  DYNAMIC DATA LOADER — load a fresh .xlsx / .csv / .json file straight */
/*  from disk (via the file picker in Settings → Data Source) and rebuild */
/*  every chart/table from it, client-side, no server round-trip.        */
/* ---------------------------------------------------------------------- */
const COLUMN_ALIASES = {
  id:       ['tweetid','tweet id','id','statusid','status id'],
  url:      ['tweeturl','tweet url','url','link','permalink'],
  handle:   ['handle','username','screenname','screen name','twitterhandle'],
  date:     ['date','createdat','created at','timestamp','postedon','posted on','tweetdate'],
  text:     ['text','tweettext','tweet text','content','fulltext'],
  likes:    ['likes','likecount','like count','favorites'],
  retweets: ['retweets','retweetcount','retweet count','rt'],
  comments: ['comments','replies','replycount','reply count'],
  views:    ['views','impressions','viewcount','view count'],
  bookmarks:['bookmarks','bookmarkcount'],
  sentiment:['sentiment','sentimentlabel','sentiment label'],
  sentimentScore:['sentimentscore','sentiment score','score'],
  state:    ['state'],
  pc:       ['pc','constituency','parliamentaryconstituency','parliamentary constituency'],
  ac:       ['ac','acno','ac no','assemblyconstituency','assembly constituency'],
  designation:['designation','role'],
  candidate:['candidate','candidatename','candidate name','name'],
  party:    ['party'],
  followers:['followers','followercount','follower count'],
  following:['following','followings','followingcount'],
  posts:    ['posts','postcount','post count']
};
function normHeader(h){ return String(h||'').trim().toLowerCase().replace(/[\s_]+/g,''); }
function buildColumnMap(headers){
  const normed = headers.map(h=>({raw:h, n:normHeader(h)}));
  const map = {};
  Object.entries(COLUMN_ALIASES).forEach(([field, aliases])=>{
    const aliasSet = aliases.map(a=>a.replace(/\s+/g,''));
    const hit = normed.find(h=>aliasSet.includes(h.n));
    if(hit) map[field] = hit.raw;
  });
  return map;
}
function tokenizeWords(text){
  return (text||'').split(/[^\p{L}\p{N}#@]+/u).map(w=>w.trim()).filter(w=>w.length>1);
}
const STOPWORDS = new Set(['the','a','an','is','are','was','were','and','or','but','of','to','in','on','for','with','at','by','this','that','it','as','from','be','have','has','will','not','we','you','he','she','they','i']);

async function loadDataFile(file){
  if(!file) return;
  const statusEl = $('#dataSourceStatus');
  if(statusEl) statusEl.innerHTML = `Reading <b>${esc(file.name)}</b>…`;
  try{
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, {defval:''});
    if(!rows.length) throw new Error('No rows found in the file.');
    const colMap = buildColumnMap(Object.keys(rows[0]));
    const get = (row, field) => colMap[field]!=null ? row[colMap[field]] : undefined;

    // ---- de-duplicate by Tweet ID (fallback to URL) ----
    const seen = new Set(); const clean = []; let dupCount = 0;
    rows.forEach(r=>{
      const key = String(get(r,'id') ?? get(r,'url') ?? '').trim();
      if(key){ if(seen.has(key)){ dupCount++; return; } seen.add(key); }
      clean.push(r);
    });

    // ---- aggregate ----
    const partyAgg = new Map(), candAgg = new Map(), geoAgg = new Map(), handleAgg = new Map();
    const dailyAgg = new Map(), hourlyAgg = new Map(), wordAgg = new Map(), tagAgg = new Map();
    const explorer = [];
    let kpi = Object.assign({total_tweets:0,total_likes:0,total_retweets:0,total_comments:0,total_views:0,total_bookmarks:0,sentSum:0},SENT8.blank());
    const sdailyC = new Map();

    clean.forEach(r=>{
      const party = String(get(r,'party')||'Unknown').trim() || 'Unknown';
      const pc = get(r,'pc');
      const likes=Number(get(r,'likes'))||0, retweets=Number(get(r,'retweets'))||0,
            comments=Number(get(r,'comments'))||0, views=Number(get(r,'views'))||0,
            bookmarks=Number(get(r,'bookmarks'))||0;
      const engagement = likes+retweets+comments+bookmarks;
      const sentLabel = String(get(r,'sentiment')||'Neutral').trim() || 'Neutral';
      const sentScore = Number(get(r,'sentimentScore'))||0;
      const dateStr = String(get(r,'date')||'');
      const candidate = String(get(r,'candidate')||'').trim();
      const handle = String(get(r,'handle')||'').trim();
      const followers = Number(get(r,'followers'))||0;

      kpi.total_tweets++; kpi.total_likes+=likes; kpi.total_retweets+=retweets;
      kpi.total_comments+=comments; kpi.total_views+=views; kpi.total_bookmarks+=bookmarks; kpi.sentSum+=sentScore;
      const _sc = SENT8.code(sentLabel);
      kpi[_sc]++;

      if(!partyAgg.has(party)) partyAgg.set(party,Object.assign({party,tweets:0,handles:new Set(),followers:0,likes:0,retweets:0,comments:0,views:0,bookmarks:0,engagement:0,sentSum:0},SENT8.blank()));
      const pa = partyAgg.get(party);
      pa.tweets++; if(handle) pa.handles.add(handle); pa.followers+=followers; pa.likes+=likes; pa.retweets+=retweets;
      pa.comments+=comments; pa.views+=views; pa.bookmarks+=bookmarks; pa.engagement+=engagement; pa.sentSum+=sentScore;
      pa[_sc]++;

      if(candidate){
        if(!candAgg.has(candidate)) candAgg.set(candidate,Object.assign({name:candidate,party,designation:String(get(r,'designation')||''),handle,followers,posts:Number(get(r,'posts'))||0,tweets:0,engagement:0,sentSum:0},SENT8.blank()));
        const ca = candAgg.get(candidate);
        ca.tweets++; ca.engagement+=engagement; ca.sentSum+=sentScore;
        ca[_sc]++;
      }

      if(!isBadPC(pc)){
        const pcKey = String(pc).trim();
        if(!geoAgg.has(pcKey)) geoAgg.set(pcKey,Object.assign({pc:pcKey, ac:String(get(r,'ac')||''), state:String(get(r,'state')||''), tweets:0, sentSum:0},SENT8.blank()));
        const ga = geoAgg.get(pcKey);
        ga.tweets++; ga.sentSum+=sentScore;
        ga[_sc]++;
      }

      if(handle){
        if(!handleAgg.has(handle)) handleAgg.set(handle,{handle,followers,followings:Number(get(r,'following'))||0,posts:Number(get(r,'posts'))||0,party,designation:String(get(r,'designation')||''),candidate,state:String(get(r,'state')||''),pc:isBadPC(pc)?'':String(pc||''),tweets:0});
        handleAgg.get(handle).tweets++;
      }

      if(dateStr){
        const day = dateStr.slice(0,10);
        if(day) dailyAgg.set(day,(dailyAgg.get(day)||0)+1);
        const hourMatch = dateStr.match(/(\d{2}):\d{2}/);
        if(hourMatch) hourlyAgg.set(hourMatch[1],(hourlyAgg.get(hourMatch[1])||0)+1);
      }

      const text = String(get(r,'text')||'');
      tokenizeWords(text).forEach(w=>{
        if(w.startsWith('#')){ tagAgg.set(w,(tagAgg.get(w)||0)+1); return; }
        const lw = w.toLowerCase();
        if(STOPWORDS.has(lw) || w.startsWith('@')) return;
        wordAgg.set(w,(wordAgg.get(w)||0)+1);
      });

      if(explorer.length<12000){
        explorer.push({h:handle,u:String(get(r,'url')||''),d:dateStr,tx:text.slice(0,320),l:likes,r:retweets,c:comments,v:views,b:bookmarks,
          sn: sentLabel.charAt(0).toUpperCase()+sentLabel.slice(1).toLowerCase(), ss:sentScore, st:String(get(r,'state')||''),
          pc:isBadPC(pc)?'':String(pc||''), ac:String(get(r,'ac')||''), dg:String(get(r,'designation')||''), cn:candidate, pt:party, eng:engagement});
      }
    });

    const parties = [...partyAgg.values()].map(p=>Object.assign({party:p.party,tweets:p.tweets,handles:p.handles.size,followers:p.followers,likes:p.likes,retweets:p.retweets,comments:p.comments,views:p.views,bookmarks:p.bookmarks,engagement:p.engagement,avg_sentiment:+(p.sentSum/(p.tweets||1)).toFixed(3)},SENT8.pick(p))).sort((a,b)=>b.tweets-a.tweets);
    const candidates = [...candAgg.values()].map(c=>{
      const avg_sentiment = +(c.sentSum/(c.tweets||1)).toFixed(3);
      const score = +Math.min(100, (c.engagement/1000) + (avg_sentiment*40) + Math.log10((c.followers||1)+1)*3).toFixed(1);
      return Object.assign({name:c.name,party:c.party,designation:c.designation,handle:c.handle,followers:c.followers,posts:c.posts,tweets:c.tweets,engagement:c.engagement,avg_sentiment,score},SENT8.pick(c));
    }).sort((a,b)=>b.score-a.score);
    const geo = [...geoAgg.values()].map(g=>Object.assign({pc:g.pc,ac:g.ac,state:g.state,tweets:g.tweets,avg_sentiment:+(g.sentSum/(g.tweets||1)).toFixed(3)},SENT8.pick(g)));
    const handles = [...handleAgg.values()].sort((a,b)=>b.tweets-a.tweets);
    const timeline_daily = [...dailyAgg.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const timeline_hourly = Array.from({length:24},(_,i)=>{const h=String(i).padStart(2,'0'); return [h, hourlyAgg.get(h)||0];});
    const word_cloud = [...wordAgg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,120);
    const hashtags = [...tagAgg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,60);
    const byEng = [...explorer].sort((a,b)=>b.eng-a.eng).slice(0,50);
    const trending = {
      views:[...explorer].sort((a,b)=>b.v-a.v).slice(0,50), likes:[...explorer].sort((a,b)=>b.l-a.l).slice(0,50),
      retweets:[...explorer].sort((a,b)=>b.r-a.r).slice(0,50), comments:[...explorer].sort((a,b)=>b.c-a.c).slice(0,50),
      bookmarks:[...explorer].sort((a,b)=>b.b-a.b).slice(0,50), engagement:byEng
    };
    const kpis = {
      total_tweets:kpi.total_tweets, total_candidates:candidates.length, total_parties:parties.length,
      total_handles:handles.length, total_followers:handles.reduce((s,h)=>s+h.followers,0),
      total_likes:kpi.total_likes, total_retweets:kpi.total_retweets, total_comments:kpi.total_comments,
      total_views:kpi.total_views, total_bookmarks:kpi.total_bookmarks,
      total_engagement:kpi.total_likes+kpi.total_retweets+kpi.total_comments+kpi.total_bookmarks,
      ...SENT8.pick(kpi),
      avg_sentiment_score:+(kpi.sentSum/(kpi.total_tweets||1)).toFixed(3),
      avg_followers:+(handles.reduce((s,h)=>s+h.followers,0)/(handles.length||1)).toFixed(1),
      avg_engagement:+((kpi.total_likes+kpi.total_retweets+kpi.total_comments+kpi.total_bookmarks)/(kpi.total_tweets||1)).toFixed(2)
    };

    const computed = {
      meta:{generated:`from ${file.name}`, source_label:file.name, live:false, total_rows_source:rows.length, unique_tweets:clean.length, duplicates_removed:dupCount},
      kpis, parties, candidates, geo, timeline_daily, timeline_hourly, word_cloud, hashtags, trending, explorer, handles
    };

    Object.keys(DATA).forEach(k=>delete DATA[k]);
    Object.assign(DATA, computed);
    filters.party=''; filters.sentiment=''; filters.designation=''; filters.pc=''; filters.q='';
    renderAll();
    document.dispatchEvent(new CustomEvent('pl:data'));   // refresh map/insights too
    const active = $('.page.active'); if(active) switchPage(active.id);
    toast(`Loaded ${fmtFull(clean.length)} tweets from ${file.name}${dupCount? ` (${dupCount} duplicate Tweet ID skipped)`:''}`);
  }catch(err){
    console.error(err);
    if(statusEl) statusEl.innerHTML = `Could not read that file — check it has the expected columns (Tweet ID/URL, Handle, Date, Text, Likes, Retweets, Comments, Views, Sentiment, State, Constituency, AC, Designation, Candidate, Party, Followers).`;
    toast('Failed to load file — see Data Source panel for details');
  }
}

/* ---------------------------------------------------------------------- */
/*  MONGODB LOADER                                                         */
/*  /api/data returns the pre-aggregated Punjab payload (the same shape    */
/*  data.js used to hold). On failure the dashboard does not go blank - it */
/*  shows a clear message and the file loader stays available.             */
/* ---------------------------------------------------------------------- */
function setLoaderText(t){ const el = $('#loaderText'); if(el) el.textContent = t; }

let dateRange = {from:'', to:''};      // empty = all time

async function loadFromMongo(showToast){
  const st = $('#dataSourceStatus');
  setLoaderText('Loading Punjab data from MongoDB…');
  if(st) st.textContent = 'Loading data from MongoDB…';
  const t0 = Date.now();
  let url = PL_BASE + '/api/data?t=' + Date.now();
  if(dateRange.from) url += '&from=' + encodeURIComponent(dateRange.from);
  if(dateRange.to)   url += '&to='   + encodeURIComponent(dateRange.to);
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const payload = await res.json();
  if(payload && payload.error) throw new Error(payload.error);
  DATA = cleanData(payload);
  applyStateBranding();     // theme first, then charts - else graphs draw in the old colours
  renderAll();
  if(st) st.innerHTML = `<span class="dot-live"></span> ${fmtFull(DATA.kpis.total_tweets)} tweets · `
    + `${fmtFull((DATA.handles||[]).length)} handles · loaded from MongoDB in ${((Date.now()-t0)/1000).toFixed(1)}s`;
  if(showToast) toast('Reloaded from MongoDB');
  document.dispatchEvent(new CustomEvent('pl:data'));
}

/* Punjab branding - hero tagline and short code come from state-config */
function applyStateBranding(){
  const cfg = stateCfg(ACTIVE_STATE);
  if(!cfg) return;
  document.documentElement.setAttribute('data-state', cfg.key);
  const tag = $('#heroTagline'); if(tag && cfg.tagline) tag.textContent = cfg.tagline;
  const av = $('#navAvatar'); if(av) av.textContent = cfg.short || 'PB';
  const th = cfg.theme || {};
  const r = document.documentElement.style;
  if(th.primary){ r.setProperty('--primary', th.primary); r.setProperty('--primary-rgb', th.primaryRgb||''); }
  if(th.accent) r.setProperty('--accent', th.accent);
  if(th.navy) r.setProperty('--navy', th.navy);
  if(th.heroFrom) r.setProperty('--hero-from', th.heroFrom);
  if(th.heroMid)  r.setProperty('--hero-mid',  th.heroMid);
  if(th.heroTo)   r.setProperty('--hero-to',   th.heroTo);
  if(th.heroGlow) r.setProperty('--hero-glow', th.heroGlow);

  /* Canvas charts cannot read CSS variables - their colours live in JS.
     So COLORS is set from the state config too, otherwise the whole
     dashboard turns teal while the graphs stay stubbornly blue. */
  if(th.primary) COLORS.primary = th.primary;
  if(th.accent)  COLORS.light   = th.accent;
  if(th.navy)    COLORS.navy    = th.navy;
}

/* Database status shown in Settings */
async function renderDataSourceMeta(){
  const box = $('#dsGrid'); if(!box) return;
  try{
    const r = await fetch(PL_BASE + '/api/status', {cache:'no-store'});
    const j = await r.json();
    const dbEl = $('#dsDb'); if(dbEl && j.db) dbEl.textContent = j.db;
    /* With login disabled (config.json -> authEnabled:false) the Account
       card has nothing to show, so it is hidden. */
    const acc = $('#accountCard'); if(acc) acc.hidden = !j.auth;
    const who = $('#whoAmI'); if(who) who.textContent = j.user ? ('Logged in as ' + j.user) : '—';
    box.innerHTML = [
      ['Database', j.db || '—'],
      ['Collections', (j.collections||[]).join(', ') || '—'],
      ['Tweets in Mongo', fmtFull(j.tweets||0)],
      ['Last build', j.lastBuild || 'never'],
      ['Mongo', j.ok ? 'Connected' : 'Not reachable']
    ].map(([k,v])=>`<div class="ds-cell"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  }catch(e){ box.innerHTML = '<div class="ds-cell"><span>Mongo</span><b>Not reachable</b></div>'; }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  applyStateBranding();
  renderAll();                       // empty shell - the layout appears instantly

  const fileInput = $('#dataFileInput');
  if(fileInput) fileInput.addEventListener('change', e=>{
    const f = e.target.files[0];
    if(f) loadDataFile(f);
    e.target.value = '';
  });

  const rb = $('#btnRefresh');
  if(rb) rb.addEventListener('click', async ()=>{
    rb.disabled = true; rb.textContent = 'Reloading…';
    try{ await fetch(PL_BASE + '/refresh', {cache:'no-store'}); await loadFromMongo(true); renderDataSourceMeta(); }
    catch(err){ toast('Reload fail: ' + err.message); }
    rb.disabled = false; rb.textContent = '🔄 Reload from MongoDB';
  });

  try{
    await loadFromMongo(false);
  }catch(err){
    console.error(err);
    const st = $('#dataSourceStatus');
    if(st) st.innerHTML = `No data came back from MongoDB (<b>${esc(err.message)}</b>). `
      + `Check that MongoDB is running and that <code>python build_punjab_data.py --push</code> has been run. `
      + `In the meantime you can load a file from Settings.`;
    const badge = $('#dataSourceBadge');
    if(badge) badge.textContent = 'MongoDB offline — see Settings';
    toast('Could not connect to MongoDB — details in Settings');
  }
  renderDataSourceMeta();
  $('#loadingScreen').classList.add('hidden');
});

/* ---------------------------------------------------------------------- */
/*  BRIDGE - the separate module files (map, insights, reports, assistant) */
/*  cannot reach inside this IIFE, so the helpers they need are exposed on */
/*  window.PL. The getters make sure a module always sees the current DATA */
/*  object, even after a reload swaps it.                                  */
/* ---------------------------------------------------------------------- */
window.PL = {
  $, $$, esc, fmt, fmtFull, isDark, stateCfg, partyColor, initials,
  tweetPassesFilters, applyFilters, toast, sentimentBadge,
  refreshAllViews: renderAll,
  /* Change the date range and pull a fresh (exact) payload from the server */
  setRange: async function(from, to){
    dateRange = {from: from || '', to: to || ''};
    await loadFromMongo(false);
  },
  get RANGE(){ return dateRange; },
  get DATA(){ return DATA; },
  get ACTIVE_STATE(){ return ACTIVE_STATE; },
};

})();
