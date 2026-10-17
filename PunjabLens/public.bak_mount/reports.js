/* ======================================================================
   REPORTS  —  PDF templates + word/hashtag counts
   ----------------------------------------------------------------------
   No library is used for the PDF. The browser's own print-to-PDF engine
   does the work, driven by print CSS. Why:
     - the text stays selectable instead of turning into a blurry image
     - it works offline, with no CDN
     - the browser handles the page breaks
   ====================================================================== */

const PLR = window.PL || {};
const $r   = PLR.$   || (s => document.querySelector(s));
const $$r  = PLR.$$  || (s => Array.from(document.querySelectorAll(s)));
const escR = PLR.esc || (v => String(v == null ? '' : v));
const fmtR = PLR.fmt || (n => Number(n||0).toLocaleString('en-IN'));

function D(){ return PLR.DATA || {}; }
function passes(t){ return PLR.tweetPassesFilters ? PLR.tweetPassesFilters(t) : true; }
function rows(){ return (D().explorer||[]).filter(passes); }

/* Indian digit grouping - 1,77,193 */
function fmtIn(n){
  const s = String(Math.round(Number(n)||0));
  if(s.length <= 3) return s;
  let head = s.slice(0,-3), tail = s.slice(-3), parts = [];
  while(head.length > 2){ parts.unshift(head.slice(-2)); head = head.slice(0,-2); }
  if(head) parts.unshift(head);
  return parts.join(',') + ',' + tail;
}
/* Large numbers as Cr / L - matching how the reference dashboards read */
function fmtBig(n){
  n = Number(n)||0;
  if(n >= 1e7) return (n/1e7).toFixed(2) + ' Cr';
  if(n >= 1e5) return (n/1e5).toFixed(2) + ' L';
  return fmtIn(n);
}

/* ------------------------------------------------------- aggregates -- */

function summarise(rs){
  const k = {tweets:rs.length, likes:0, rts:0, comments:0, views:0, eng:0,
             pos:0, neg:0, neu:0};
  const handles = new Set(), parties = new Map(), areas = new Map();
  rs.forEach(t=>{
    k.likes += +t.l||0; k.rts += +t.r||0; k.comments += +t.c||0;
    k.views += +t.v||0; k.eng += +t.eng||0;
    if(t.sn === 'Positive') k.pos++; else if(t.sn === 'Negative') k.neg++; else k.neu++;
    if(t.h) handles.add(String(t.h).toLowerCase());
    bump(parties, t.pt, t);
    bump(areas, t.pc, t);
  });
  k.handles = handles.size;
  return {k, parties, areas};
}
function bump(map, key, t){
  if(!key) return;
  let a = map.get(key);
  if(!a){ a = {name:key, tweets:0, views:0, likes:0, rts:0, eng:0, pos:0, neg:0, neu:0}; map.set(key, a); }
  a.tweets++; a.views += +t.v||0; a.likes += +t.l||0; a.rts += +t.r||0; a.eng += +t.eng||0;
  if(t.sn === 'Positive') a.pos++; else if(t.sn === 'Negative') a.neg++; else a.neu++;
}
const bySize = (a,b)=>b.tweets-a.tweets;

/* Word / hashtag counts - derived from the text so filters apply.
   DATA.word_cloud is precomputed, but it ignores the filters. */
const STOP = new Set(('the a an and or of to in on for is are was were be been with at by from '
  + 'this that these those it its as we you they he she his her our your their i me my not no '
  + 'will would can could should has have had do does did but if so than then there here what '
  + 'which who whom when where why how all any both each few more most other some such only own '
  + 'same very just also into over under again further once about against between during before '
  + 'after above below up down out off too s t don now am pe ka ki ke ko se me mein hai hain ho '
  + 'ye yeh wo woh aur par bhi tha the na nahi kar karo kiya raha rahe https http com www amp rt '
  // Devanagari stopwords - inke bina top-10 me "में", "है", "एवं", "लिए"
  // filler words crowd the list and bury the real signal
  + 'में है हैं था थे थी और एवं के का की को से पर यह वह ये वे हम आप उन इस उस लिए किया करने कर '
  + 'साथ भी नहीं तो ही जो कि तक बाद पहले सभी अपने अपनी हुए हुई गया गई रहे रही जी श्री द्वारा '
  + 'लिये होगा होगी करते किए बहुत जैसे क्या कोई अब तथा या हो होने वाले वाली दिया देश').split(' '));

function wordCounts(limit){
  const rs = rows(), w = new Map(), h = new Map();
  rs.forEach(t=>{
    const tx = String(t.tx||'');
    (tx.match(/#[\w\u0900-\u097F]+/g)||[]).forEach(tag=>{
      const k = tag.toLowerCase(); h.set(k, (h.get(k)||0)+1);
    });
    tx.toLowerCase()
      .replace(/https?:\/\/\S+/g,' ')
      .replace(/[\u0964\u0965]/g,' ')                 // Devanagari danda ।  ॥
      .replace(/[^a-z0-9\u0900-\u097F]+/g,' ')
      .split(/\s+/)
      .forEach(word=>{
        if(word.length < 3 || STOP.has(word) || /^\d+$/.test(word)) return;
        w.set(word, (w.get(word)||0)+1);
      });
  });
  const top = m => [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0, limit||120)
                    .map(([term,count])=>({term, count}));
  return {words: top(w), hashtags: top(h), total: rs.length};
}

/* ------------------------------------------------------- word table -- */

let wcCache = null;
function renderWordTable(q){
  const el = $r('#wcTable'); if(!el) return;
  if(!wcCache) wcCache = wordCounts(300);
  const query = String(q||'').toLowerCase().trim();
  const all = [
    ...wcCache.hashtags.map(x=>({...x, kind:'Hashtag'})),
    ...wcCache.words.map(x=>({...x, kind:'Word'})),
  ].filter(x=>!query || x.term.includes(query))
   .sort((a,b)=>b.count-a.count).slice(0, 200);

  const tot = wcCache.total || 1;
  el.innerHTML = `<thead><tr><th>#</th><th>Term</th><th>Type</th><th>Count</th><th>% of tweets</th></tr></thead>`
    + `<tbody>${all.map((x,i)=>`<tr>
        <td>${i+1}</td><td><b>${escR(x.term)}</b></td>
        <td><span class="pill">${x.kind}</span></td>
        <td>${fmtIn(x.count)}</td>
        <td>${(x.count/tot*100).toFixed(2)}%</td>
      </tr>`).join('') || `<tr><td colspan="5">Nothing found</td></tr>`}</tbody>`;
}

function exportWc(kind, fmt){
  if(!wcCache) wcCache = wordCounts(300);
  const list = kind === 'hashtags' ? wcCache.hashtags : wcCache.words;
  const title = kind === 'hashtags' ? 'Top Hashtags' : 'Top Words';
  if(fmt === 'csv'){
    const csv = 'Rank,Term,Count,Percent of tweets\n' + list.map((x,i)=>
      `${i+1},"${x.term.replace(/"/g,'""')}",${x.count},${(x.count/(wcCache.total||1)*100).toFixed(2)}`).join('\n');
    downloadText(csv, `${kind}-${today()}.csv`);
  }else{
    openPrint(reportShell(title, `
      ${kv('Total tweets analysed', fmtIn(wcCache.total))}
      ${table(['#','Term','Count','% of tweets'],
        list.slice(0,80).map((x,i)=>[i+1, x.term, fmtIn(x.count), (x.count/(wcCache.total||1)*100).toFixed(2)+'%']))}
    `));
  }
}

function downloadText(text, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8;'}));
  a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function today(){ return new Date().toISOString().slice(0,10); }

/* ---------------------------------------------------- report pieces -- */

function kv(k, v){ return `<div class="rp-kv"><span>${escR(k)}</span><b>${escR(v)}</b></div>`; }
/* Table cells can be typed so the report does not read flat:
     {rank:1}            -> gol badge
     {bar:0.62, v:'303'} -> number + uske peeche halka bar
     {sent:0.274}        -> green/red colour
     {strong:'BJP'}      -> bold
     {tag:'BJP'}         -> pill
   A plain string works too. */
function cell(c){
  if(c == null) return '<td></td>';
  if(typeof c === 'object'){
    if(c.rank != null)  return `<td class="c-rank"><span>${escR(c.rank)}</span></td>`;
    if(c.bar != null)   return `<td class="c-bar"><i style="width:${(Math.max(0,Math.min(1,c.bar))*100).toFixed(1)}%"></i><b>${escR(c.v)}</b></td>`;
    if(c.sent != null){
      const n = Number(c.sent);
      const k = n > 0.02 ? 'pos' : n < -0.02 ? 'neg' : 'neu';
      return `<td class="c-sent ${k}">${escR(c.text != null ? c.text : n.toFixed(3))}</td>`;
    }
    if(c.strong != null) return `<td class="c-strong">${escR(c.strong)}</td>`;
    if(c.tag != null)    return `<td><span class="c-tag">${escR(c.tag)}</span></td>`;
    if(c.num != null)    return `<td class="c-num">${escR(c.num)}</td>`;
  }
  return `<td>${escR(c)}</td>`;
}
function table(head, body){
  return `<table class="rp-table"><thead><tr>${head.map(h=>`<th>${escR(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${body.map(r=>`<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
}
function kpiGrid(items){
  return `<div class="rp-kpis">${items.map(([lab,val,sub])=>
    `<div class="rp-kpi"><span>${escR(lab)}</span><b>${escR(val)}</b>${sub?`<i>${escR(sub)}</i>`:''}</div>`).join('')}</div>`;
}
function bullets(list){
  return `<ul class="rp-bullets">${list.map(x=>`<li>${x}</li>`).join('')}</ul>`;
}

function scopeLine(){
  const st = (typeof PLR.ACTIVE_STATE === 'string') ? PLR.ACTIVE_STATE : '';
  const n = rows().length, total = (D().explorer||[]).length;
  const filtered = n !== total ? ` · filtered view (${fmtIn(n)} of ${fmtIn(total)} tracked tweets)` : '';
  return `${st}${filtered}`;
}

function reportShell(title, inner){
  return `<div class="rp-page">
    <div class="rp-head">
      <div class="rp-brand">${logoTag()}<div><h1>${escR(title)}</h1><p>${escR(scopeLine())}</p></div></div>
      <div class="rp-meta">Generated ${new Date().toLocaleString('en-IN')}</div>
    </div>
    ${inner}
    <div class="rp-foot">Political Lens · Data Team · numbers are based on the tracked sample</div>
  </div>`;
}

/* ------------------------------------------------------- templates --- */

function buildExec(){
  const rs = rows(), {k, parties, areas} = summarise(rs);
  const P = [...parties.values()].sort(bySize);
  const A = [...areas.values()].sort(bySize);
  const top = rs.slice().sort((a,b)=>(+b.v||0)-(+a.v||0)).slice(0,5);
  const sentTot = k.pos + k.neg + k.neu || 1;

  const hi = [];
  if(P[0]) hi.push(`<b>${escR(P[0].name)}</b> leads — ${fmtIn(P[0].tweets)} tweets (${(P[0].tweets/(k.tweets||1)*100).toFixed(1)}% share) and ${fmtBig(P[0].views)} views`);
  if(top[0]) hi.push(`<b>@${escR(top[0].h)}</b> posted the biggest tweet — ${fmtBig(top[0].v)} views, ${fmtBig(top[0].l)} likes`);
  if(A[0]) hi.push(`<b>${escR(A[0].name)}</b> leads on activity — ${fmtIn(A[0].tweets)} tweets`);
  hi.push(`${(k.neu/sentTot*100).toFixed(1)}% of tweets are Neutral — communication is mostly factual/informational`);
  if(k.tweets) hi.push(`Average engagement per tweet: <b>${fmtIn(Math.round(k.eng/k.tweets))}</b>`);

  return reportShell('Executive Summary', `
    ${kpiGrid([
      ['Tweets', fmtIn(k.tweets)],
      ['Handles', fmtIn(k.handles)],
      ['Views', fmtBig(k.views)],
      ['Likes', fmtBig(k.likes)],
      ['Retweets', fmtBig(k.rts)],
      ['Engagement', fmtBig(k.eng)],
    ])}
    <h2>Key Highlights</h2>
    ${bullets(hi)}
    <h2>Sentiment Mix</h2>
    ${table(['Sentiment','Tweets','Share'], [
      [{sent:1, text:'Positive'}, {bar:k.pos/sentTot, v:fmtIn(k.pos)}, {num:(k.pos/sentTot*100).toFixed(1)+'%'}],
      [{sent:0, text:'Neutral'},  {bar:k.neu/sentTot, v:fmtIn(k.neu)}, {num:(k.neu/sentTot*100).toFixed(1)+'%'}],
      [{sent:-1, text:'Negative'},{bar:k.neg/sentTot, v:fmtIn(k.neg)}, {num:(k.neg/sentTot*100).toFixed(1)+'%'}],
    ])}
    <h2>Top 5 Parties</h2>
    ${table(['#','Party','Tweets','Views','Engagement','Pos','Neg'],
      P.slice(0,5).map((p,i)=>{
        const mx = P[0] ? P[0].tweets : 1;
        return [{rank:i+1}, {strong:p.name}, {bar:p.tweets/mx, v:fmtIn(p.tweets)},
                {num:fmtBig(p.views)}, {num:fmtBig(p.eng)}, {num:fmtIn(p.pos)}, {num:fmtIn(p.neg)}];
      }))}
    <h2>Top 5 Tweets by Reach</h2>
    ${table(['#','Handle','Party','Views','Likes','Sentiment'],
      top.map((t,i)=>[{rank:i+1}, {strong:'@'+t.h}, {tag:t.pt||'—'},
        {num:fmtBig(t.v)}, {num:fmtBig(t.l)},
        {sent:t.sn==='Positive'?1:t.sn==='Negative'?-1:0, text:t.sn||'—'}]))}
  `);
}

function buildParty(){
  const rs = rows(), {k, parties} = summarise(rs);
  const P = [...parties.values()].sort(bySize);
  return reportShell('Party Performance Report', `
    ${kpiGrid([
      ['Parties', fmtIn(P.length)],
      ['Tweets', fmtIn(k.tweets)],
      ['Views', fmtBig(k.views)],
      ['Engagement', fmtBig(k.eng)],
    ])}
    <h2>Party-wise Breakdown</h2>
    ${table(['Party','Tweets','Share','Views','Likes','Retweets','Positive','Negative','Net sentiment'],
      P.map(p=>{
        const st = p.pos + p.neg + p.neu || 1;
        const mx = P[0] ? P[0].tweets : 1;
        return [{strong:p.name}, {bar:p.tweets/mx, v:fmtIn(p.tweets)},
                {num:(p.tweets/(k.tweets||1)*100).toFixed(1)+'%'},
                {num:fmtBig(p.views)}, {num:fmtBig(p.likes)}, {num:fmtBig(p.rts)},
                {num:fmtIn(p.pos)}, {num:fmtIn(p.neg)}, {sent:(p.pos-p.neg)/st}];
      }))}
    <h2>Reach Efficiency</h2>
    <p class="rp-note">Average views per tweet — this is what separates high volume from real impact.</p>
    ${table(['Party','Tweets','Avg views / tweet','Avg engagement / tweet'],
      P.map(p=>[p.name, fmtIn(p.tweets),
        fmtIn(Math.round(p.views/(p.tweets||1))), fmtIn(Math.round(p.eng/(p.tweets||1)))]))}
  `);
}

function buildGeo(){
  const rs = rows(), {k, areas} = summarise(rs);
  const A = [...areas.values()].sort(bySize);
  const withSent = A.map(a=>{
    const st = a.pos + a.neg + a.neu || 1;
    return {...a, net:(a.pos-a.neg)/st};
  });
  const best = withSent.slice().sort((a,b)=>b.net-a.net).slice(0,10);
  const worst = withSent.slice().sort((a,b)=>a.net-b.net).slice(0,10);
  return reportShell('Constituency Report', `
    ${kpiGrid([
      ['Areas covered', fmtIn(A.length)],
      ['Tweets', fmtIn(k.tweets)],
      ['Avg per area', fmtIn(Math.round(k.tweets/(A.length||1)))],
    ])}
    <h2>Top 20 by Volume</h2>
    ${table(['#','Constituency','Tweets','Views','Positive','Negative','Net sentiment'],
      withSent.slice(0,20).map((a,i)=>{
        const mx = withSent[0] ? withSent[0].tweets : 1;
        return [{rank:i+1}, {strong:a.name}, {bar:a.tweets/mx, v:fmtIn(a.tweets)},
                {num:fmtBig(a.views)}, {num:fmtIn(a.pos)}, {num:fmtIn(a.neg)}, {sent:a.net}];
      }))}
    <h2>Most Positive Areas</h2>
    ${table(['Constituency','Tweets','Net sentiment'], best.map(a=>[{strong:a.name}, {num:fmtIn(a.tweets)}, {sent:a.net}]))}
    <h2>Most Negative Areas</h2>
    ${table(['Constituency','Tweets','Net sentiment'], worst.map(a=>[{strong:a.name}, {num:fmtIn(a.tweets)}, {sent:a.net}]))}
  `);
}

function buildContent(){
  const wc = wordCounts(60), rs = rows();
  const viral = rs.slice().sort((a,b)=>(+b.eng||0)-(+a.eng||0)).slice(0,10);
  return reportShell('Content & Hashtag Report', `
    ${kpiGrid([
      ['Tweets analysed', fmtIn(wc.total)],
      ['Distinct hashtags', fmtIn(wc.hashtags.length)],
      ['Distinct words', fmtIn(wc.words.length)],
    ])}
    <h2>Top 25 Hashtags</h2>
    ${table(['#','Hashtag','Count','% of tweets'],
      wc.hashtags.slice(0,25).map((x,i)=>{
        const mx = wc.hashtags[0] ? wc.hashtags[0].count : 1;
        return [{rank:i+1}, {strong:x.term}, {bar:x.count/mx, v:fmtIn(x.count)},
                {num:(x.count/(wc.total||1)*100).toFixed(2)+'%'}];
      }))}
    <h2>Top 25 Words</h2>
    ${table(['#','Word','Count','% of tweets'],
      wc.words.slice(0,25).map((x,i)=>{
        const mx = wc.words[0] ? wc.words[0].count : 1;
        return [{rank:i+1}, {strong:x.term}, {bar:x.count/mx, v:fmtIn(x.count)},
                {num:(x.count/(wc.total||1)*100).toFixed(2)+'%'}];
      }))}
    <h2>Top 10 Viral Tweets</h2>
    ${table(['Handle','Party','Engagement','Views','Sentiment'],
      viral.map(t=>[{strong:'@'+t.h}, {tag:t.pt||'—'}, {num:fmtBig(t.eng)},
                    {num:fmtBig(t.v)}, {sent:t.sn==='Positive'?1:t.sn==='Negative'?-1:0, text:t.sn||'—'}]))}
  `);
}

const TEMPLATES = { exec:buildExec, party:buildParty, geo:buildGeo, content:buildContent };
let rptType = 'exec';

/* ---------------------------------------------------------- output --- */

/* This used to call window.open('about:blank') - two problems with that:
   a relative CSS path (style.css) does not resolve on about:blank, and a
   popup blocker stops the window opening at all. So the report now renders
   inside this page
   into a hidden container, and the print CSS hides everything else
   hides everything else. No popup, and the styles are already loaded. */
function openPrint(html){
  let host = document.getElementById('printHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'printHost';
    document.body.appendChild(host);
  }
  host.innerHTML = html;
  document.documentElement.classList.add('printing');

  const done = ()=>{
    document.documentElement.classList.remove('printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(done, 20000);          // safety - some browsers never fire afterprint

  setTimeout(()=>window.print(), 120);   // let the layout settle first
}

/* Logo in the report header. A failed load used to leave an empty bordered
   box - now the whole wrapper is removed so nothing empty is drawn.
   (report-ai.js overrides this to return '' - no logo was wanted.) */
function logoTag(){
  return `<img class="rp-logo" src="assets/logo.jpeg" alt=""
    onerror="this.parentNode && this.parentNode.removeChild(this)">`;
}

function initReports(){
  $$r('#rptTypes .rpt-type').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$r('#rptTypes .rpt-type').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); rptType = b.dataset.r;
      const box = $r('#rptPreviewBox');
      if(box && !box.hidden) box.innerHTML = TEMPLATES[rptType]();
    });
  });
  const prev = $r('#rptPreview');
  if(prev) prev.addEventListener('click', ()=>{
    const box = $r('#rptPreviewBox'); if(!box) return;
    wcCache = null;                       // the filters may have changed
    box.innerHTML = TEMPLATES[rptType]();
    box.hidden = false;
    box.scrollIntoView({behavior:'smooth', block:'nearest'});
  });
  const dl = $r('#rptDownload');
  if(dl) dl.addEventListener('click', ()=>{ wcCache = null; openPrint(TEMPLATES[rptType]()); });

  $$r('[data-wc]').forEach(b=>{
    b.addEventListener('click', ()=>{ wcCache = null; exportWc(b.dataset.wc, b.dataset.fmt); });
  });

  const s = $r('#wcSearch');
  if(s) s.addEventListener('input', e=>renderWordTable(e.target.value));

  // Word cloud page khulte hi table bhar do
  document.addEventListener('click', e=>{
    const nav = e.target.closest('[data-target="wordcloud"]');
    if(nav) setTimeout(()=>renderWordTable($r('#wcSearch') ? $r('#wcSearch').value : ''), 60);
  });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReports);
else initReports();

/* ======================================================================
   TOPIC REPORT
   Ek word/topic do -> us par poori report: kitne tweets, kis party ne,
   kaunse handles ne, sentiment kaisa, kis area me, aur asli viral tweets.
   ====================================================================== */

let topicTerm = '';

function topicRows(term){
  const t = String(term||'').toLowerCase().trim().replace(/^#/,'');
  if(!t) return [];
  return rows().filter(r => String(r.tx||'').toLowerCase().includes(t));
}

function buildTopic(){
  const term = topicTerm.trim();
  if(!term){
    return reportShell('Topic Report',
      `<p class="rp-note">Type a topic or keyword in the box above — for example
       <b>farmers</b>, <b>jobs</b>, <b>#punjab</b> — then hit Preview.</p>`);
  }

  const hits = topicRows(term);
  const all  = rows();
  if(!hits.length){
    return reportShell(`Topic: "${term}"`,
      `<p class="rp-note">No tweets matched <b>${escR(term)}</b> in this filter and date range.
       Try another word, or clear the filters above.</p>`);
  }

  const {k, parties, areas} = summarise(hits);
  const P = [...parties.values()].sort(bySize);
  const A = [...areas.values()].sort(bySize);
  const sentTot = k.pos + k.neg + k.neu || 1;

  // Handle-wise
  const hMap = new Map();
  hits.forEach(t=>{
    if(!t.h) return;
    let a = hMap.get(t.h) || {h:t.h, n:0, v:0, pt:t.pt, cn:t.cn};
    a.n++; a.v += +t.v||0; hMap.set(t.h, a);
  });
  const H = [...hMap.values()].sort((a,b)=>b.n-a.n).slice(0,10);

  // Din-wise trend — kab uchha
  const dMap = new Map();
  hits.forEach(t=>{
    const d = String(t.d||'').slice(0,10);
    if(d) dMap.set(d, (dMap.get(d)||0)+1);
  });
  const days = [...dMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);

  const viral = hits.slice().sort((a,b)=>(+b.eng||0)-(+a.eng||0)).slice(0,8);
  const share = (hits.length/(all.length||1)*100);

  // Is this topic more positive than the overall picture, or less? That
  // comparison is what makes the report useful - a lone number says nothing.
  let oP=0,oN=0,oU=0;
  all.forEach(t=>{ if(t.sn==='Positive')oP++; else if(t.sn==='Negative')oN++; else oU++; });
  const oTot = oP+oN+oU || 1;
  const topicNet = (k.pos - k.neg)/sentTot, overallNet = (oP - oN)/oTot;
  const diff = topicNet - overallNet;
  const verdict = Math.abs(diff) < 0.01 ? 'in line with the rest of the data'
    : diff > 0 ? `<b>more positive</b> than the rest of the data (+${diff.toFixed(3)})`
               : `<b>more negative</b> than the rest of the data (${diff.toFixed(3)})`;

  return reportShell(`Topic Report — "${term}"`, `
    ${kpiGrid([
      ['Tweets', fmtIn(hits.length), `${share.toFixed(2)}% of ${fmtIn(all.length)}`],
      ['Handles', fmtIn(hMap.size)],
      ['Views', fmtBig(k.views)],
      ['Likes', fmtBig(k.likes)],
      ['Retweets', fmtBig(k.rts)],
      ['Engagement', fmtBig(k.eng)],
    ])}

    <h2>Sentiment on this topic</h2>
    ${table(['Sentiment','Tweets','Share','Overall'], [
      [{sent:1, text:'Positive'}, {bar:k.pos/sentTot, v:fmtIn(k.pos)}, {num:(k.pos/sentTot*100).toFixed(1)+'%'}, {num:(oP/oTot*100).toFixed(1)+'%'}],
      [{sent:0, text:'Neutral'},  {bar:k.neu/sentTot, v:fmtIn(k.neu)}, {num:(k.neu/sentTot*100).toFixed(1)+'%'}, {num:(oU/oTot*100).toFixed(1)+'%'}],
      [{sent:-1, text:'Negative'},{bar:k.neg/sentTot, v:fmtIn(k.neg)}, {num:(k.neg/sentTot*100).toFixed(1)+'%'}, {num:(oN/oTot*100).toFixed(1)+'%'}],
    ])}
    <p class="rp-note">Net sentiment on this topic is <b>${topicNet.toFixed(3)}</b> — ${verdict}.</p>

    <h2>Which party said the most</h2>
    ${table(['Party','Tweets','Share of topic','Views','Pos','Neg'],
      P.slice(0,8).map(p=>[p.name, fmtIn(p.tweets),
        (p.tweets/hits.length*100).toFixed(1)+'%', fmtBig(p.views), fmtIn(p.pos), fmtIn(p.neg)]))}

    <h2>Top handles</h2>
    ${table(['Handle','Name','Party','Tweets','Views'],
      H.map(h=>[{strong:'@'+h.h}, h.cn||'—', {tag:h.pt||'—'}, {num:fmtIn(h.n)}, {num:fmtBig(h.v)}]))}

    ${A.length ? `<h2>Kahan se</h2>` + table(['Constituency','Tweets'],
      A.slice(0,10).map(a=>[a.name, fmtIn(a.tweets)])) : ''}

    ${days.length ? `<h2>Peak days</h2>` + table(['Date','Tweets'],
      days.map(([d,n])=>[d, fmtIn(n)])) : ''}

    <h2>Most viral tweets</h2>
    ${table(['Handle','Party','Sentiment','Engagement','Views'],
      viral.map(t=>['@'+t.h, t.pt||'—', t.sn||'—', fmtBig(t.eng), fmtBig(t.v)]))}
  `);
}

TEMPLATES.topic = buildTopic;

/* Topic input wiring */
(function(){
  function bind(){
    const row = $r('#rptTopicRow'), inp = $r('#rptTopic'), hint = $r('#rptTopicHint');

    // Topic chunne par input dikhao
    $$r('#rptTypes .rpt-type').forEach(b=>b.addEventListener('click', ()=>{
      if(row) row.hidden = b.dataset.r !== 'topic';
      if(b.dataset.r === 'topic' && inp) setTimeout(()=>inp.focus(), 40);
    }));

    if(inp){
      let t = null;
      inp.addEventListener('input', ()=>{
        topicTerm = inp.value;
        clearTimeout(t);
        t = setTimeout(()=>{
          if(!hint) return;
          const v = inp.value.trim();
          hint.textContent = v ? `${topicRows(v).length.toLocaleString('en-IN')} tweets match` : '';
        }, 250);
      });
      inp.addEventListener('keydown', e=>{
        if(e.key === 'Enter'){ e.preventDefault(); const p = $r('#rptPreview'); if(p) p.click(); }
      });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
