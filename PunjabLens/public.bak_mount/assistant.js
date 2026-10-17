/* ======================================================================
   LOCAL ASSISTANT  -  fully offline, no API
   ----------------------------------------------------------------------
   How it works:
     1. Pull keywords out of whatever the user typed
     2. Score every intent against its keywords
     3. CONFIRM the leading intent - "did you mean this?" Yes/No
     4. On Yes, pull the real answer out of the data

   The confirm step exists because keyword matching sometimes gets it
   wrong, and asking once beats quietly returning the wrong answer.

   The keyword lists deliberately include Hindi/Hinglish spellings so the
   matcher still works if someone types that way; everything it says back
   is in English.
   ====================================================================== */

const PLA = window.PL || {};
const $a  = PLA.$  || (s => document.querySelector(s));
const escA = PLA.esc || (v => String(v == null ? '' : v));

function AD(){ return PLA.DATA || {}; }
function aRows(){
  const all = (AD().explorer) || [];
  return PLA.tweetPassesFilters ? all.filter(PLA.tweetPassesFilters) : all;
}
function nIn(n){
  const s = String(Math.round(Number(n)||0));
  if(s.length <= 3) return s;
  let h = s.slice(0,-3), t = s.slice(-3), p = [];
  while(h.length > 2){ p.unshift(h.slice(-2)); h = h.slice(0,-2); }
  if(h) p.unshift(h);
  return p.join(',') + ',' + t;
}
function nBig(n){
  n = Number(n)||0;
  if(n >= 1e7) return (n/1e7).toFixed(2)+' Cr';
  if(n >= 1e5) return (n/1e5).toFixed(2)+' L';
  return nIn(n);
}

/* ---------------------------------------------------------- intents -- */
/* `k` = keywords (any single match raises the score)
   `q` = the question shown when confirming
   `run` = the actual answer                                             */

const INTENTS = [
  {
    id:'total',
    q:'How many tweets, handles and views in total?',
    s:['overview','summary','saar','total'],
    w:['kitne','kitna','kul','tweets','tweet','sab','data'],
    run(){
      const r = aRows(); let v=0,l=0,rt=0; const h=new Set();
      r.forEach(t=>{ v+=+t.v||0; l+=+t.l||0; rt+=+t.r||0; if(t.h) h.add(String(t.h).toLowerCase()); });
      return line([
        ['Tweets', nIn(r.length)], ['Handles', nIn(h.size)],
        ['Views', nBig(v)], ['Likes', nBig(l)], ['Retweets', nBig(rt)],
      ]);
    }
  },
  {
    id:'party',
    q:'What are the party-wise tweets and reach?',
    s:['party','parties','partywise','bjp','congress','inc','bsp','aap','sad','akali'],
    w:['dal','sp','breakdown'],
    run(q){
      const map = new Map();
      aRows().forEach(t=>{
        if(!t.pt) return;
        let a = map.get(t.pt) || {n:t.pt,tw:0,v:0,pos:0,neg:0};
        a.tw++; a.v += +t.v||0;
        if(t.sn==='Positive') a.pos++; else if(t.sn==='Negative') a.neg++;
        map.set(t.pt, a);
      });
      let list = [...map.values()].sort((a,b)=>b.tw-a.tw);
      const named = list.find(p=>q.includes(p.n.toLowerCase()));
      if(named) list = [named];
      return tbl(['Party','Tweets','Views','Pos','Neg'],
        list.slice(0,8).map(p=>[p.n, nIn(p.tw), nBig(p.v), nIn(p.pos), nIn(p.neg)]));
    }
  },
  {
    id:'sentiment',
    q:'What is the sentiment breakdown — positive, negative, neutral?',
    s:['sentiment','positive','negative','neutral','mood','bhavna','sakaratmak','tone'],
    w:['feel','achha','bura'],
    run(){
      const r = aRows(); let p=0,n=0,u=0;
      r.forEach(t=>{ if(t.sn==='Positive')p++; else if(t.sn==='Negative')n++; else u++; });
      const tot = p+n+u || 1;
      return tbl(['Sentiment','Tweets','Share'], [
        ['Positive', nIn(p), (p/tot*100).toFixed(1)+'%'],
        ['Neutral',  nIn(u), (u/tot*100).toFixed(1)+'%'],
        ['Negative', nIn(n), (n/tot*100).toFixed(1)+'%'],
      ]) + `<p class="ai-note">Net sentiment score: <b>${((p-n)/tot).toFixed(3)}</b></p>`;
    }
  },
  {
    id:'top',
    q:'Which handle has the highest reach?',
    s:['top','viral','famous','popular','highest','no1'],
    w:['sabse','zyada','best','lead','aage','number','kiski','kaun'],
    run(){
      const r = aRows().slice().sort((a,b)=>(+b.v||0)-(+a.v||0)).slice(0,8);
      return tbl(['Handle','Party','Views','Likes'],
        r.map(t=>['@'+t.h, t.pt||'—', nBig(t.v), nBig(t.l)]));
    }
  },
  {
    id:'area',
    q:'Which constituency has the most activity?',
    s:['constituency','constituencies','area','seat','kshetra','ilaka','district','zila','region','map','location'],
    w:['pc','ac','jagah','kahan'],
    run(){
      const map = new Map();
      aRows().forEach(t=>{
        if(!t.pc) return;
        let a = map.get(t.pc) || {n:t.pc,tw:0,pos:0,neg:0};
        a.tw++; if(t.sn==='Positive')a.pos++; else if(t.sn==='Negative')a.neg++;
        map.set(t.pc, a);
      });
      const list = [...map.values()].sort((a,b)=>b.tw-a.tw).slice(0,10);
      return tbl(['Constituency','Tweets','Pos','Neg'],
        list.map(a=>[a.n, nIn(a.tw), nIn(a.pos), nIn(a.neg)]));
    }
  },
  {
    id:'hashtag',
    q:'Which hashtags are trending?',
    s:['hashtag','hashtags','trending','trend','keyword','shabd'],
    w:['tag','hash','word','chal'],
    run(){
      const m = new Map();
      aRows().forEach(t=>(String(t.tx||'').match(/#[\w\u0900-\u097F]+/g)||[])
        .forEach(x=>{ const k=x.toLowerCase(); m.set(k,(m.get(k)||0)+1); }));
      const list = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
      if(!list.length) return '<p>No hashtags found in this filter.</p>';
      return tbl(['Hashtag','Count'], list.map(([k,v])=>[k, nIn(v)]));
    }
  },
  {
    id:'level',
    q:'How much data is there at MP / MLA / MLC level?',
    s:['mla','mlc','designation','vidhayak','sansad','candidate','leader','neta','level'],
    w:['mp','post','pad','minister','cm'],
    run(){
      const m = new Map();
      aRows().forEach(t=>{ if(!t.dg) return; m.set(t.dg,(m.get(t.dg)||0)+1); });
      const list = [...m.entries()].sort((a,b)=>b[1]-a[1]);
      if(!list.length) return '<p>No designation data in this view.</p>';
      return tbl(['Level','Tweets'], list.map(([k,v])=>[k, nIn(v)]));
    }
  },
  {
    id:'engagement',
    q:'Engagement — how many likes, retweets and comments?',
    s:['engagement','likes','retweet','retweets','comment','comments','reach','impression'],
    w:['like','rt','reply','share','views'],
    run(){
      const r = aRows(); let l=0,rt=0,c=0,v=0,e=0;
      r.forEach(t=>{ l+=+t.l||0; rt+=+t.r||0; c+=+t.c||0; v+=+t.v||0; e+=+t.eng||0; });
      const n = r.length||1;
      return tbl(['Metric','Total','Per tweet'], [
        ['Likes', nBig(l), nIn(Math.round(l/n))],
        ['Retweets', nBig(rt), nIn(Math.round(rt/n))],
        ['Comments', nBig(c), nIn(Math.round(c/n))],
        ['Views', nBig(v), nIn(Math.round(v/n))],
        ['Engagement', nBig(e), nIn(Math.round(e/n))],
      ]);
    }
  },
  {
    id:'help',
    q:'What can I ask you?',
    s:['help','madad','guide','samajh','options'],
    w:['kya','how','kaise','option','pooch','puch','sakta','list'],
    run(){ return helpHtml(); }
  },
];

/* ---------------------------------------------------------- helpers -- */

function tbl(head, body){
  if(!body.length) return '<p>No data in this filter.</p>';
  return `<table class="ai-tbl"><thead><tr>${head.map(h=>`<th>${escA(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${body.map(r=>`<tr>${r.map(c=>`<td>${escA(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function line(pairs){
  return `<div class="ai-stats">${pairs.map(([k,v])=>
    `<div><span>${escA(k)}</span><b>${escA(v)}</b></div>`).join('')}</div>`;
}
function helpHtml(){
  return `<p>You can ask any of these:</p><div class="ai-chips">`
    + INTENTS.filter(i=>i.id!=='help').map(i=>
        `<button class="ai-chip" data-intent="${i.id}">${escA(i.q)}</button>`).join('')
    + `</div><p class="ai-note">Answers respect the filters set above.</p>`;
}

/* Keyword scoring - a point per match, more for an exact word */
function scoreIntents(text){
  const q = ' ' + String(text||'').toLowerCase().replace(/[^\w\u0900-\u097F]+/g,' ').trim() + ' ';
  // Strong = domain words (constituency, sentiment, hashtag). Weak = generic
  // Weighting both equally meant 'tweets' won inside "negative tweets"
  // and the wrong intent got picked.
  const hit = (list, strongWeight, weakWeight, isStrong) => {
    let sc = 0;
    (list||[]).forEach(k=>{
      if(q.includes(' '+k+' ')) sc += isStrong ? strongWeight : weakWeight;
      else if(k.length > 4 && q.includes(k)) sc += isStrong ? 2 : 1;
    });
    return sc;
  };
  return INTENTS.map(it=>({
    it,
    score: hit(it.s, 6, 0, true) + hit(it.w, 0, 2, false)
  })).sort((a,b)=>b.score-a.score);
}

/* --------------------------------------------------------- the chat -- */

let pending = null;    // {intent, question}

function aiPush(role, html){
  const box = $a('#aiMessages'); if(!box) return null;
  const d = document.createElement('div');
  d.className = 'ai-msg ' + (role==='user' ? 'ai-msg-user' : 'ai-msg-bot');
  d.innerHTML = html;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}

function answerIntent(intent, question){
  aiPush('assistant', `<b>${escA(intent.q)}</b>` + intent.run(String(question||'').toLowerCase()));
  pending = null;
}

function askLocal(question){
  const text = String(question||'').trim();
  if(!text) return;
  aiPush('user', escA(text));

  // Is this a reply to a pending confirmation?
  if(pending){
    const yes = /^(y|yes|haan|han|ha|ji|sahi|theek|thik|ok|okay|hmm|yep|yup|bilkul|correct)\b/i.test(text);
    const no  = /^(n|no|nahi|nai|nhi|galat|wrong|nope)\b/i.test(text);
    if(yes){ answerIntent(pending.intent, pending.question); return; }
    if(no){
      const p = pending; pending = null;
      aiPush('assistant', `<p>No problem. Any of these?</p>` + helpHtml());
      return;
    }
    // neither yes nor no - treat it as a new question
    pending = null;
  }

  const ranked = scoreIntents(text);
  const best = ranked[0];

  if(!best || best.score === 0){
    aiPush('assistant', `<p>I did not follow that. Here is what I can answer from the dashboard data:</p>` + helpHtml());
    return;
  }

  // A clearly high score answers directly; otherwise confirm first.
  if(best.score >= 6 || window.PL_ASSIST_CONFIRM === false){
    answerIntent(best.it, text); return;
  }

  pending = {intent:best.it, question:text};
  aiPush('assistant',
    `<p>Did you mean this?</p><p class="ai-guess">“${escA(best.it.q)}”</p>`
    + `<div class="ai-yn"><button class="ai-yes">Yes</button><button class="ai-no">No</button></div>`);
}

/* ------------------------------------------------------------ wiring -- */

function initAssistant(){
  const box = $a('#aiMessages');
  if(box){
    box.innerHTML = '';
    aiPush('assistant', `<p>Hello! I am this dashboard's assistant — fully offline, no API needed.</p>` + helpHtml());
  }

  // Yes / No buttons and suggestion chips
  document.addEventListener('click', e=>{
    if(e.target.classList && e.target.classList.contains('ai-yes')){
      if(pending) answerIntent(pending.intent, pending.question);
      return;
    }
    if(e.target.classList && e.target.classList.contains('ai-no')){
      pending = null;
      aiPush('assistant', `<p>No problem. Any of these?</p>` + helpHtml());
      return;
    }
    const chip = e.target.closest && e.target.closest('.ai-chip');
    if(chip){
      const it = INTENTS.find(i=>i.id === chip.dataset.intent);
      if(it){ aiPush('user', escA(it.q)); answerIntent(it, it.q); }
    }
  });

  // Replace the old API-based send handler
  const form = $a('#aiInput') && $a('#aiInput').closest('form');
  if(form){
    const clone = form.cloneNode(true);        // saare purane listeners hata do
    form.parentNode.replaceChild(clone, form);
    clone.addEventListener('submit', e=>{
      e.preventDefault();
      const inp = clone.querySelector('#aiInput');
      const v = inp.value; inp.value = '';
      askLocal(v);
    });
  }
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAssistant);
else initAssistant();
