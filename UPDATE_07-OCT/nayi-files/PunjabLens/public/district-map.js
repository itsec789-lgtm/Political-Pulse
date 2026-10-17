/* ======================================================================
   DISTRICT CHOROPLETH MAP
   ----------------------------------------------------------------------
   Builds an SVG map from GeoJSON and fills it with the dashboard's data.
   No external library - the projection is worked out here.

   The boundaries ship with the build (punjab-geo.js). If they are missing,
   the map card simply hides itself and the rest of the dashboard carries
   on as normal.
   ====================================================================== */

/* app.js lives inside an IIFE, so its helpers reach us through the
   window.PL bridge. Getters are used so DATA/ACTIVE_STATE are always fresh. */
const PL = window.PL || {};
const $  = PL.$  || (s => document.querySelector(s));
const esc = PL.esc || (v => String(v == null ? '' : v));
const fmt = PL.fmt || (n => Number(n||0).toLocaleString('en-IN'));
const isDark = PL.isDark || (() => document.documentElement.getAttribute('data-theme') === 'dark');
const stateCfg = PL.stateCfg || (k => (window.STATE_CONFIGS||{})[k]);
const tweetPassesFilters = PL.tweetPassesFilters || (() => true);
const partyColor = PL.partyColor || (() => '#64748B');

/* Embedded boundaries. To add another state, build its geo file and
   register it here - no fetch, no file picker. */
function MAP_DATA_LOOKUP(){
  return { 'Punjab': window.PUNJAB_GEO || null };
}

/* Which GeoJSON property holds the district name */
const NAME_KEYS = ['Dist_Name', 'DISTRICT', 'district', 'NAME_2', 'name'];

/* ----------------------------------------------------------------------
   NAME ALIASES
   District names in election data and in GeoJSON almost never match
   exactly. Without this list whole districts go missing - and nothing
   errors, they just sit there grey on the map.
   ---------------------------------------------------------------------- */
const DIST_ALIASES = {
  'FEROZEPUR': 'FIROZPUR',
  'FEROZPUR': 'FIROZPUR',
  'FIROZEPUR': 'FIROZPUR',
  'MOHALI': 'SAHIBZADA AJIT SINGH NAGAR',
  'SAS NAGAR': 'SAHIBZADA AJIT SINGH NAGAR',
  'S A S NAGAR': 'SAHIBZADA AJIT SINGH NAGAR',
  'NAWANSHAHR': 'SHAHID BHAGAT SINGH NAGAR',
  'NAWAN SHAHR': 'SHAHID BHAGAT SINGH NAGAR',
  'SBS NAGAR': 'SHAHID BHAGAT SINGH NAGAR',
  'S B S NAGAR': 'SHAHID BHAGAT SINGH NAGAR',
  'ROPAR': 'RUPNAGAR',
  'ROOPNAGAR': 'RUPNAGAR',
  'SRI MUKTSAR SAHIB': 'MUKTSAR',
  'MUKTSAR SAHIB': 'MUKTSAR',
  'TARN TARAN SAHIB': 'TARN TARAN',
  // Malerkotla split from Sangrur in 2021 and is not in this GeoJSON yet
  'MALERKOTLA': 'SANGRUR',
};

function normDist(v){
  if(v == null) return '';
  let s = String(v).toUpperCase().trim()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\(.*?\)\s*/g, ' ')   // "Ludhiana (Rural)" -> "Ludhiana"
    .trim();
  return DIST_ALIASES[s] || s;
}

/* ----------------------------------------------------------------------
   CONSTITUENCY -> DISTRICT (fuzzy)
   The data carries AC Name (the constituency); the map has districts.
   Many of Punjab's 117 constituencies carry their district's name inside
   them: "Amritsar East" -> AMRITSAR, "Jalandhar Central" -> JALANDHAR,
   "Ferozepur City" -> FIROZPUR (via an alias).

   Only names that are unambiguous are matched here - no mapping was
   guessed, because a guessed one would fill the map with wrong districts
   and make the mistake very hard to spot. Constituencies that do not
   match are listed by name in the note under the map, so you can add
   them to DIST_ALIASES yourself.
   ---------------------------------------------------------------------- */
let _distIndex = null;                  // map ke asli district naam
function districtIndex(){
  if(_distIndex) return _distIndex;
  const feats = (mapState.geo && mapState.geo.features) || [];
  _distIndex = feats.map(f => normDist((f.properties||{})[mapState.nameKey]))
                    .filter(Boolean);
  return _distIndex;
}

const _fuzzyCache = new Map();
function fuzzyDistrict(name){
  if(_fuzzyCache.has(name)) return _fuzzyCache.get(name);
  const idx = districtIndex();
  let hit = '';
  if(idx.includes(name)){
    hit = name;
  } else {
    /* Try longer district names first — "SAHIBZADA AJIT SINGH NAGAR"
       must match before "AJIT". */
    const sorted = idx.slice().sort((a,b)=>b.length-a.length);
    hit = sorted.find(d => name.startsWith(d + ' ') || name.endsWith(' ' + d)
                        || name === d || name.indexOf(' ' + d + ' ') >= 0) || '';
  }
  _fuzzyCache.set(name, hit);
  return hit;
}

/* Ek geo/explorer row se district nikalne ki koshish */
function rowDistrict(r){
  return r.district || r.dist || r.zila || r.pc || r.ac || '';
}

/* --------------------------------------------------------- projection -- */
/* Simple equirectangular projection with latitude correction.
   Perfectly fine for an extent as small as Punjab - Mercator distortion
   is invisible at this scale. */
function makeProjection(features, w, h, pad){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  eachRing(features, ring=>{
    for(const [x,y] of ring){
      if(x<minX) minX=x; if(x>maxX) maxX=x;
      if(y<minY) minY=y; if(y>maxY) maxY=y;
    }
  });
  const midLat = (minY + maxY) / 2;
  const kx = Math.cos(midLat * Math.PI / 180);   // longitude squeeze
  const bw = (maxX - minX) * kx, bh = (maxY - minY);
  const scale = Math.min((w - pad*2)/bw, (h - pad*2)/bh);
  const ox = (w - bw*scale)/2, oy = (h - bh*scale)/2;
  return ([x,y]) => [
    ox + (x - minX) * kx * scale,
    oy + (maxY - y) * scale,          // y flip
  ];
}

function eachRing(features, fn){
  features.forEach(f=>{
    const g = f.geometry; if(!g) return;
    if(g.type === 'Polygon') g.coordinates.forEach(fn);
    else if(g.type === 'MultiPolygon') g.coordinates.forEach(poly=>poly.forEach(fn));
  });
}

function featurePath(f, proj){
  const g = f.geometry; if(!g) return '';
  const polys = g.type === 'Polygon' ? [g.coordinates]
              : g.type === 'MultiPolygon' ? g.coordinates : [];
  let d = '';
  polys.forEach(poly=>{
    poly.forEach(ring=>{
      ring.forEach((pt,i)=>{
        const [x,y] = proj(pt);
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      });
      d += 'Z';
    });
  });
  return d;
}

/* How much screen area a district covers - decides whether to draw a label */
function featureArea(f, proj){
  const g = f.geometry; if(!g) return 0;
  const polys = g.type === 'Polygon' ? [g.coordinates]
              : g.type === 'MultiPolygon' ? g.coordinates : [];
  let total = 0;
  polys.forEach(poly=>{
    const ring = poly[0]; if(!ring || ring.length < 3) return;
    let a = 0;
    for(let i=0; i<ring.length-1; i++){
      const [x0,y0] = proj(ring[i]), [x1,y1] = proj(ring[i+1]);
      a += x0*y1 - x1*y0;
    }
    total += Math.abs(a/2);
  });
  return total;
}

/* Centroid of the largest ring, used for the label */
function featureCentroid(f, proj){
  const g = f.geometry; if(!g) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates]
              : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best = null, bestArea = -1;
  polys.forEach(poly=>{
    const ring = poly[0]; if(!ring || ring.length < 3) return;
    let a = 0, cx = 0, cy = 0;
    for(let i=0; i<ring.length-1; i++){
      const [x0,y0] = ring[i], [x1,y1] = ring[i+1];
      const cross = x0*y1 - x1*y0;
      a += cross; cx += (x0+x1)*cross; cy += (y0+y1)*cross;
    }
    a *= 0.5;
    if(Math.abs(a) > bestArea){ bestArea = Math.abs(a); best = [cx/(6*a), cy/(6*a)]; }
  });
  return best ? proj(best) : null;
}

/* --------------------------------------------------------------- data -- */

const mapState = { geo:null, byDist:new Map(), metric:'tweets', selected:null };

/* Build district-wise aggregates from the explorer rows (filters applied) */
function districtAggregates(){
  const agg = new Map();
  ((PL.DATA && PL.DATA.explorer) || []).forEach(t=>{
    if(typeof tweetPassesFilters === 'function' && !tweetPassesFilters(t)) return;
    const raw = normDist(rowDistrict(t));
    if(!raw) return;
    const key = fuzzyDistrict(raw) || raw;
    let a = agg.get(key);
    if(!a){ a = {tweets:0, positive:0, negative:0, neutral:0, eng:0}; agg.set(key, a); }
    a.tweets++;
    if(t.sn === 'Positive') a.positive++;
    else if(t.sn === 'Negative') a.negative++;
    else a.neutral++;
    a.eng += Number(t.eng||0);
  });
  agg.forEach(a=>{
    const tot = a.positive + a.negative + a.neutral;
    a.avg_sentiment = tot ? Math.round(((a.positive - a.negative)/tot)*1000)/1000 : 0;
  });
  return agg;
}

/* ------------------------------------------------------------- colour -- */
function mix(c1, c2, t){
  const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = p(c1), [r2,g2,b2] = p(c2);
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}

function scaleFor(metric, values){
  if(metric === 'avg_sentiment'){
    const m = Math.max(0.001, ...values.map(Math.abs));
    return { type:'diverging', max:m };
  }
  // Tweet counts are heavily skewed (one or two districts dominate the
  // rest). On a linear scale the whole map ends up one colour, so we use
  // a square-root scale instead.
  const max = Math.max(1, ...values);
  return { type:'seq', max };
}

function colourFor(v, scale, theme){
  if(v == null) return null;
  if(scale.type === 'diverging'){
    const t = Math.min(1, Math.abs(v)/scale.max);
    return v >= 0 ? mix('#F1F5F9', '#16A34A', t) : mix('#F1F5F9', '#DC2626', t);
  }
  const t = Math.sqrt(Math.max(0,v) / scale.max);
  return mix(theme.lo, theme.hi, t);
}

function mapTheme(){
  const cfg = (typeof stateCfg === 'function') ? stateCfg(PL.ACTIVE_STATE) : null;
  const hi = cfg ? cfg.theme.primary : '#2563EB';
  return { lo: isDark && isDark() ? '#16233B' : '#EDF5F4', hi };
}

/* --------------------------------------------------------------- draw -- */

async function loadDistrictMap(){
  const card = $('#mapCard'); if(!card) return;
  const MAP_DATA = MAP_DATA_LOOKUP();

  // Embedded boundaries only. There used to be a fetch() fallback, but it
  // never worked over file:// and forced the user to attach a file. The
  // boundaries now ship with the build.
  const embedded = MAP_DATA[PL.ACTIVE_STATE];
  if(!embedded){ card.hidden = true; return; }
  mapState.geo = embedded;

  const feats = (mapState.geo.features||[]).filter(f=>f.geometry);
  if(!feats.length){ card.hidden = true; return; }

  // naam property auto-detect
  const props = feats[0].properties || {};
  mapState.nameKey = NAME_KEYS.find(k=>k in props) || Object.keys(props)[0];

  card.hidden = false;
  $('#mapTitle').textContent = `${PL.ACTIVE_STATE} — District Map`;
  renderDistrictMap();
}

function renderDistrictMap(){
  const host = $('#mapHost'); if(!host || !mapState.geo) return;

  const feats = mapState.geo.features.filter(f=>f.geometry);
  const W = 560, H = 460;   // was 760x620 - far too large on screen
  const proj = makeProjection(feats, W, H, 14);
  const agg = districtAggregates();
  mapState.byDist = agg;

  const metric = mapState.metric;
  const vals = feats.map(f=>{
    const a = agg.get(normDist(f.properties[mapState.nameKey]));
    return a ? a[metric] : null;
  }).filter(v=>v != null);

  const scale = scaleFor(metric, vals);
  const theme = mapTheme();

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(PL.ACTIVE_STATE)} district map">`;
  const labels = [];

  feats.forEach((f,i)=>{
    const raw = f.properties[mapState.nameKey];
    const key = normDist(raw);
    const a = agg.get(key);
    const v = a ? a[metric] : null;
    const fill = colourFor(v, scale, theme);
    const cls = 'map-d' + (a ? '' : ' nodata') + (mapState.selected === key ? ' sel' : '')
              + (mapState.selected && mapState.selected !== key ? ' dim' : '');
    svg += `<path class="${cls}" d="${featurePath(f, proj)}" data-k="${esc(key)}" data-n="${esc(raw)}"`
         + (fill ? ` fill="${fill}"` : '') + `></path>`;
    // Only label a district large enough for the name to fit.
    // Labels used to be drawn on every district and overlapped on small ones.
    const c = featureCentroid(f, proj);
    if(c && featureArea(f, proj) > 900){
      labels.push(`<text class="map-label" x="${c[0].toFixed(1)}" y="${c[1].toFixed(1)}">${esc(shortName(raw))}</text>`);
    }
  });

  svg += labels.join('') + '</svg>';
  host.innerHTML = svg;

  drawLegend(scale, theme);
  drawLeaders();
  drawMapNote(feats, agg);
  bindMapEvents();
}

/* Long names do not fit on the map */
function shortName(n){
  const s = String(n||'');
  if(s.length <= 14) return s;
  const words = s.split(' ');
  if(words.length > 2) return words.map(w=>w[0]).join('');   // S.B.S. Nagar -> SBSN
  return s.slice(0, 13) + '…';
}

/* Top district ranking - the map only shows colour, the actual number
   dekhne ke liye list chahiye. Row par click = wahi district select. */
function rankBlock(){
  const metric = mapState.metric;
  const list = [...mapState.byDist.entries()]
    .map(([k,a])=>({k, v:a[metric], tweets:a.tweets}))
    .filter(x=>x.v != null)
    .sort((a,b)=>b.v-a.v).slice(0, 8);
  if(!list.length) return '';
  const max = Math.max(...list.map(x=>Math.abs(x.v))) || 1;
  const label = {tweets:'Tweets', positive:'Positive', negative:'Negative', avg_sentiment:'Sentiment'}[metric];
  return `<div class="ms-block">
    <h4>Top districts · ${esc(label)}</h4>
    <div class="ms-rank">${list.map((x,i)=>`
      <button class="ms-row ${mapState.selected===x.k?'on':''}" data-k="${esc(x.k)}">
        <span class="ms-i">${i+1}</span>
        <span class="ms-n">${esc(titleCase(x.k))}</span>
        <span class="ms-v">${metric==='avg_sentiment' ? x.v.toFixed(3) : fmt(x.v)}</span>
        <span class="ms-track"><i style="width:${(Math.abs(x.v)/max*100).toFixed(1)}%"></i></span>
      </button>`).join('')}</div>
  </div>`;
}
function titleCase(s){
  return String(s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase());
}

/* Map ke bagal me state ke leaders + assembly strength */
function drawLeaders(){
  const el = $('#mapSide'); if(!el) return;
  const cfg = stateCfg(PL.ACTIVE_STATE);
  if(!cfg || !cfg.leaders){ el.innerHTML = ''; return; }
  const L = cfg.leaders;

  const card = (role, p) => p
    ? `<div class="ms-person">
         <span class="ms-role">${esc(role)}</span>
         <b>${esc(p.name)}</b>
         <span class="ms-meta">${esc(p.party||'')}${p.seat?' · '+esc(p.seat):''}</span>
       </div>`
    : `<div class="ms-person vacant">
         <span class="ms-role">${esc(role)}</span>
         <b>Vacant</b><span class="ms-meta">the post is vacant</span>
       </div>`;

  const total = (cfg.seatsWon||[]).reduce((a,x)=>a+x.seats,0) || 1;
  const bar = (cfg.seatsWon||[]).map(x=>
    `<span style="width:${(x.seats/total*100).toFixed(1)}%;background:${partyColor(x.party)}" title="${esc(x.party)} ${x.seats}"></span>`).join('');
  const legend = (cfg.seatsWon||[]).map(x=>
    `<div class="ms-seat"><i style="background:${partyColor(x.party)}"></i>${esc(x.party)}<b>${x.seats}</b></div>`).join('');

  el.innerHTML = rankBlock() + `
    <div class="ms-block">
      <h4>Leadership</h4>
      ${card('Chief Minister', L.cm)}
      ${card('Deputy CM', L.dyCm)}
      ${card('Speaker', L.speaker)}
    </div>
    <div class="ms-block">
      <h4>Assembly · ${total} seats</h4>
      <div class="ms-bar">${bar}</div>
      <div class="ms-seats">${legend}</div>
    </div>`;
}

function drawLegend(scale, theme){
  const el = $('#mapLegend'); if(!el) return;
  if(scale.type === 'diverging'){
    el.innerHTML = `<span>−${scale.max.toFixed(2)}</span>`
      + `<span class="lg-bar" style="background:linear-gradient(90deg,#DC2626,#F1F5F9,#16A34A)"></span>`
      + `<span>+${scale.max.toFixed(2)}</span>`;
  }else{
    el.innerHTML = `<span>0</span>`
      + `<span class="lg-bar" style="--lg-from:${theme.lo};--lg-to:${theme.hi}"></span>`
      + `<span>${fmt(scale.max)}</span>`;
  }
}

/* Which districts failed to match - never leave this silent */
function drawMapNote(feats, agg){
  const el = $('#mapNote'); if(!el) return;
  const geoKeys = new Set(feats.map(f=>normDist(f.properties[mapState.nameKey])));
  const noData = [...geoKeys].filter(k=>!agg.has(k));
  const noShape = [...agg.keys()].filter(k=>!geoKeys.has(k));

  const bits = [`<b>${feats.length}</b> districts drawn`];
  if(noData.length) bits.push(`<b>${noData.length}</b> with no data: ${noData.slice(0,6).map(esc).join(', ')}${noData.length>6?'…':''}`);
  if(noShape.length) bits.push(`<b>${noShape.length}</b> districts in the data had no match on the map: ${noShape.slice(0,6).map(esc).join(', ')}${noShape.length>6?'…':''}`);
  el.innerHTML = bits.join(' · ');
}

function bindMapEvents(){
  const host = $('#mapHost'), tip = $('#mapTooltip');
  if(!host) return;

  host.onmousemove = e=>{
    const p = e.target.closest('.map-d');
    if(!p){ tip.hidden = true; return; }
    const a = mapState.byDist.get(p.dataset.k);
    const r = host.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(p.dataset.n)}</b>` + (a
      ? `<div class="mt-row"><span>Tweets</span><span>${fmt(a.tweets)}</span></div>
         <div class="mt-row"><span>Positive</span><span>${fmt(a.positive)}</span></div>
         <div class="mt-row"><span>Negative</span><span>${fmt(a.negative)}</span></div>
         <div class="mt-row"><span>Avg sentiment</span><span>${a.avg_sentiment.toFixed(3)}</span></div>`
      : `<div class="mt-row"><span>No data</span><span></span></div>`);
    tip.style.left = (e.clientX - r.left) + 'px';
    tip.style.top  = (e.clientY - r.top) + 'px';
    tip.hidden = false;
  };
  host.onmouseleave = ()=>{ tip.hidden = true; };

  host.onclick = e=>{
    const p = e.target.closest('.map-d'); if(!p) return;
    mapState.selected = (mapState.selected === p.dataset.k) ? null : p.dataset.k;
    renderDistrictMap();
  };

  const side = $('#mapSide');
  if(side) side.onclick = e=>{
    const row = e.target.closest('.ms-row'); if(!row) return;
    mapState.selected = (mapState.selected === row.dataset.k) ? null : row.dataset.k;
    renderDistrictMap();
  };
}

/* ---------------------------------------------------------------- init -- */
function initDistrictMap(){
  const sel = $('#mapMetric');
  if(sel) sel.addEventListener('change', e=>{ mapState.metric = e.target.value; renderDistrictMap(); });
  const reset = $('#mapReset');
  if(reset) reset.addEventListener('click', ()=>{ mapState.selected = null; renderDistrictMap(); });
  loadDistrictMap();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initDistrictMap);
}else{
  initDistrictMap();
}
