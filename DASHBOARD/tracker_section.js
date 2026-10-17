/* ===========================================================================
   tracker_section.js  --  teen Admin Panel tab:

     1. sec-tracker  "Handle Tracker"     handle jodo / settings / tracked table
     2. sec-trklog   "Live Scrape Log"    jo abhi chal raha hai uska log
     3. sec-trkdb    "Tweet Database"     scrape hua data dekho + CSV download

   Ye sirf HTML + JS string banata hai, jo server.js ke adminPage() me jaata
   hai. Alag file me rakha hai taaki server.js ka patch chhota rahe aur isko
   bina server chalaye test kiya ja sake.

   DHYAN DO -- panel par dikhne wala HAR SHABD ENGLISH me hai (user ki
   request). Comment Hindi me hain; wo panel par kabhi nahi dikhte.

   NOTE -- "pages per handle" ka control jaanbujh kar hata diya gaya hai.
   Gehrai ab sirf date window se tay hoti hai: scraper tab tak page padhta
   rehta hai jab tak tweet us window ke andar aate hain (x_scraper.js dekho).
   =========================================================================== */
'use strict';

/* window ke option -- UI label aur table ka label dono yahin se */
var WINS = [
  ['24', 'Today (24 hours)'],
  ['72', 'Last 3 days'],
  ['168', 'Last 7 days'],
  ['360', 'Last 15 days'],
  ['720', 'Last 30 days'],
  ['2160', 'Last 90 days']
];

function winOpts(sel) {
  return WINS.map(function (w) {
    return '<option value="' + w[0] + '"' + (String(sel) === w[0] ? ' selected' : '') + '>'
      + w[1] + '</option>';
  }).join('');
}

/* progress bar ka HTML -- Tracker aur Log dono tab par wahi dikhta hai,
   isliye ek hi jagah se banta hai (id me prefix alag). */
function progressBox(p) {
  return '<div id="' + p + 'Prog" style="display:none;margin-top:12px">'
  + '<div style="display:flex;justify-content:space-between;align-items:baseline;'
  + 'gap:10px;font-size:12px;color:#6B4F3A;margin-bottom:6px">'
  + '<span id="' + p + 'ProgL"></span><b id="' + p + 'ProgPct" style="color:#1B6B45"></b></div>'
  + '<div style="height:10px;background:#EADFD2;border-radius:6px;overflow:hidden">'
  + '<div id="' + p + 'ProgIn" style="height:100%;width:0;background:'
  + 'linear-gradient(90deg,#1B6B45,#2E9E68);transition:width .45s ease"></div></div>'
  + '<div id="' + p + 'ProgSub" style="font-size:11.5px;color:#9A7A63;margin-top:6px"></div>'
  + '</div>';
}

/* ===================== HTML ===================== */
function section(onTab) {
  var on = function (id) { return 'class="sec' + (onTab === id ? ' on' : '') + '" id="sec-' + id + '"'; };

  /* ---------------- 1. HANDLE TRACKER ---------------- */
  var t1 = '<div ' + on('tracker') + '>'
  + '<div class="pg-h">Handle Tracker</div>'
  + '<div class="pg-s">Scrapes handles from X straight into '
  + '<code>pulse_master.master_tweets</code> using the same merge rules as the pipeline, '
  + 'so anything collected here shows up in both dashboards and in Handle Analytics '
  + 'exactly like data that came from the network folder.</div>'

  /* handle jodo */
  + '<div class="ad-card"><h2>Add a handle</h2>'
  + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'
  + '<div style="flex:1;min-width:260px"><label>Handle (several, separated by commas)</label>'
  + '<input id="trkIn" placeholder="@handle1, @handle2 or a full x.com link"></div>'
  + '<button class="ad-btn" onclick="trkCheck()">Check mapping</button>'
  + '<button class="ad-btn g" onclick="trkAdd()">+ Add handle</button></div>'
  + '<div id="trkChk"></div>'
  + '<div class="ad-note">With or without the @ &mdash; both work. A full profile link is fine too.<br>'
  + '<b>Check mapping</b> tells you, before you scrape, whether these handles are already in '
  + '<code>Mapping.xlsx</code>. Ones that are go straight into the database; ones that are not '
  + 'are held until you fill them in.</div>'
  + '<div id="trkStale"></div>'
  + '</div>'

  /* settings -- sirf window aur interval */
  + '<div class="ad-card"><h2>Scraper settings</h2>'
  + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">'
  + '<div><label>How far back (default)</label>'
  + '<select id="trkWin" onchange="trkDirty(\'trkWin\')">' + winOpts('72') + '</select></div>'
  + '<div><label>How often</label>'
  + '<select id="trkInt" onchange="trkDirty(\'trkInt\')">'
  + '<option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option>'
  + '<option value="30" selected>Every 30 minutes</option><option value="60">Every hour</option>'
  + '<option value="180">Every 3 hours</option><option value="360">Every 6 hours</option>'
  + '<option value="1440">Once a day</option>'
  + '</select></div>'
  + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;min-height:42px">'
  + '<input type="checkbox" id="trkStrict" checked onchange="trkDirty(\'trkStrict\')" '
  + 'style="width:auto;min-height:0"> Strict sentiment</label>'
  + '<button class="ad-btn" id="trkSaveBtn" onclick="trkSave()">Save settings</button>'
  + '<button class="ad-btn g" id="trkRunBtn" onclick="trkRun()">\u25B6 Scrape all now</button>'
  + '<button class="ad-btn r" onclick="trkStop()">\u23F9 Stop</button>'
  + '</div>'
  + '<div id="trkSentBox"></div>'
  + '<div class="ad-note"><b>Strict sentiment</b> means the Sentiment column is written '
  + '<i>only</i> by your trained <code>sentiment_tagger</code> model. If that package is not '
  + 'installed, the column is left empty rather than filled by the fallback &mdash; the '
  + 'fallback only knows Positive / Negative / Neutral, while your model has its own labels '
  + '(for example "Anti-BJP"). Wrong labels sitting in the database are worse than blank ones. '
  + 'Clear the box if you would rather have the 3-label fallback than nothing.</div>'
  + '<div class="ad-note">Depth is driven entirely by this date window &mdash; the scraper keeps '
  + 'reading further back for as long as tweets fall inside the window, then stops. Any single '
  + 'handle can use its own window from the table below. The scraper also runs on its own in the '
  + 'background whenever the server is up.</div>'
  + '</div>'

  /* haal + progress */
  + '<div class="ad-card"><h2>Status</h2>'
  + '<div id="trkStatus" class="ad-note">Loading\u2026</div>'
  + progressBox('trk')
  + '</div>'

  /* tracked accounts */
  + '<div class="ad-card"><h2>Tracked Accounts <span id="trkCount" style="font-weight:400;'
  + 'color:#9A7A63;font-size:12px"></span></h2>'
  + '<div style="max-width:340px;margin:2px 0 12px"><label>Search handles</label>'
  + '<input id="trkSearch" placeholder="Filter by handle\u2026" oninput="trkRenderTable()"></div>'
  + '<div id="trkTable"></div></div>'

  + '</div>';

  /* ---------------- 2. LIVE SCRAPE LOG ---------------- */
  var t2 = '<div ' + on('trklog') + '>'
  + '<div class="pg-h">Live Scrape Log</div>'
  + '<div class="pg-s">What the scraper is doing, line by line. The log lives in memory '
  + '(last 400 lines) and resets when the server restarts.</div>'

  + '<div class="ad-card"><h2>Status</h2>'
  + '<div id="tlgStatus" class="ad-note">Loading\u2026</div>'
  + progressBox('tlg')
  + '</div>'

  + '<div class="ad-card"><h2>Log <span id="tlgCount" style="font-weight:400;color:#9A7A63;'
  + 'font-size:12px"></span></h2>'
  + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">'
  + '<div><label>Show</label><select id="tlgOnly" onchange="tlgPaint()">'
  + '<option value="">Everything</option><option value="bad">Errors and warnings</option>'
  + '<option value="err">Errors only</option></select></div>'
  + '<div style="max-width:240px"><label>Search</label>'
  + '<input id="tlgQ" placeholder="handle or word\u2026" oninput="tlgPaint()"></div>'
  + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;min-height:42px">'
  + '<input type="checkbox" id="tlgAuto" checked style="width:auto;min-height:0"> Auto refresh</label>'
  + '<button class="ad-btn" onclick="tlgLoad()">Refresh</button>'
  + '</div>'
  + '<div id="tlgPane" style="background:#1A120C;color:#9FE3BE;border-radius:8px;padding:12px;'
  + 'font-family:Consolas,Menlo,monospace;font-size:11.5px;max-height:62vh;overflow:auto;'
  + 'line-height:1.65">\u2014</div>'
  + '<div style="display:flex;justify-content:flex-end;margin-top:8px">'
  + '<button class="ad-btn s" id="tlgEnd" onclick="tlgBottom()">\u2193 Jump to latest</button></div>'
  + '<div class="ad-note">Oldest line at the top, newest at the bottom \u2014 it reads top to bottom '
  + 'like a terminal, and follows along on its own while you are at the bottom. '
  + '<b style="color:#A83224">Red</b> is an error, <b style="color:#A8761F">amber</b> is a warning. '
  + 'Every run ends with a <b>DONE</b>, <b>STOPPED</b> or <b>FAILED</b> line.</div>'
  + '</div>'

  + '</div>';

  /* ---------------- 3. TWEET DATABASE ---------------- */
  var t3 = '<div ' + on('trkdb') + '>'
  + '<div class="pg-h">Scraped Tweet Database</div>'
  + '<div class="pg-s">Scraped tweets go straight into '
  + '<code>pulse_master.master_tweets</code> &mdash; this tab reads that same collection.</div>'

  + '<div class="ad-card"><h2>Filter</h2>'
  + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">'
  + '<div style="min-width:200px"><label>Handle</label>'
  + '<select id="tdbHandle" onchange="tdbGo(0)"><option value="">All tracked handles</option></select></div>'
  + '<div style="flex:1;min-width:220px"><label>Search tweet text</label>'
  + '<input id="tdbQ" placeholder="word or phrase\u2026" onkeydown="if(event.key===\'Enter\')tdbGo(0)"></div>'
  + '<div><label>Rows per page</label><select id="tdbLimit" onchange="tdbGo(0)">'
  + '<option value="25">25</option><option value="50" selected>50</option>'
  + '<option value="100">100</option><option value="200">200</option></select></div>'
  /* tweet-date-filter : scrape window sirf naya data laane ke liye hai.
     Jo pehle aa chuka wo database me rehta hai, isliye table ka apna
     date filter chahiye -- warna "Today" chun kar bhi purane din dikhte
     the aur lagta tha scraper window maan hi nahi raha. */
  + '<div><label>Tweet date from</label><input type="date" id="tdbFrom" onchange="tdbGo(0)"></div>'
  + '<div><label>Tweet date to</label><input type="date" id="tdbTo" onchange="tdbGo(0)"></div>'
  + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;min-height:42px">'
  + '<input type="checkbox" id="tdbOnly" checked onchange="tdbGo(0)" style="width:auto;min-height:0"> '
  + 'Tracker data only</label>'
  + '<button class="ad-btn" onclick="tdbGo(0)">Search</button>'
  + '<a class="ad-btn o" id="tdbCsv" href="/admin/tracker/export.csv" '
  + 'style="text-decoration:none;display:inline-flex;align-items:center">\u2B07 Download CSV</a>'
  + '</div>'
  + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
  + '<span style="font-size:11.5px;color:#9A7A63;text-transform:uppercase;letter-spacing:.5px">Quick range</span>'
  + '<button class="ad-btn s" onclick="tdbDays(1)">Last 24 hours</button>'
  + '<button class="ad-btn s" onclick="tdbDays(3)">Last 3 days</button>'
  + '<button class="ad-btn s" onclick="tdbDays(7)">Last 7 days</button>'
  + '<button class="ad-btn s" onclick="tdbDays(30)">Last 30 days</button>'
  + '<button class="ad-btn s" onclick="tdbDays(0)">All dates</button>'
  + '</div>'
  + '<div class="ad-note"><b>The scrape window and this date filter are two different things.</b> '
  + 'The scrape window on the Handle Tracker tab only decides how far back a <i>new</i> run '
  + 'fetches from X. Tweets collected by earlier runs stay in the database &mdash; they are not '
  + 'deleted when you narrow the window &mdash; so this table shows everything stored for the '
  + 'handle until you set a date range here.<br>'
  + 'Clear the checkbox to see all of <code>master_tweets</code>, including pipeline data. '
  + 'Searching text without picking a handle can be slow on a large collection. '
  + '<b>Download CSV</b> exports every row matching the filters above &mdash; not just this page '
  + '&mdash; up to 200,000 rows, UTF-8 with a BOM so Excel opens it correctly.</div>'
  + '</div>'

  + '<div class="ad-card">'
  + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
  + '<h2 style="margin:0">Tweets</h2>'
  + '<div style="display:flex;gap:8px;align-items:center">'
  + '<span id="tdbInfo" style="color:#9A7A63;font-size:12px"></span>'
  + '<button class="ad-btn s" id="tdbPrev" onclick="tdbGo(TDB_PAGE-1)">\u2039 Previous</button>'
  + '<button class="ad-btn s" id="tdbNext" onclick="tdbGo(TDB_PAGE+1)">Next \u203A</button>'
  + '</div></div>'
  + '<div id="tdbTable" style="margin-top:12px"><div class="ad-note">Loading\u2026</div></div>'
  + '</div>'

  + '</div>';

  /* ---------------- 4. HANDLE MAPPING ---------------- */
  var t4 = '<div ' + on('trkmap') + '>'
  + '<div class="pg-h">Handle Mapping</div>'
  + '<div class="pg-s">A scraped handle only reaches <code>master_tweets</code> once it exists in '
  + '<code>Mapping/Mapping.xlsx</code>. Anything scraped for an unknown handle is held here until '
  + 'you fill in its details &mdash; nothing is lost, and nothing half-mapped reaches the dashboards.</div>'

  + '<div class="ad-card"><h2>Status</h2><div id="tmpStatus" class="ad-note">Loading\u2026</div></div>'

  /* ---- bulk: CSV ---- */
  + '<div class="ad-card"><h2>Fill several at once (CSV)</h2>'
  + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
  + '<a class="ad-btn" id="tmpTpl" href="/admin/tracker/map-template.csv" '
  + 'style="text-decoration:none;display:inline-flex;align-items:center">\u2B07 Download template</a>'
  + '<label class="ad-btn o" style="display:inline-flex;align-items:center;cursor:pointer;margin:0">'
  + '\u2B06 Upload filled CSV'
  + '<input type="file" id="tmpFile" accept=".csv,text/csv" style="display:none" '
  + 'onchange="tmpUpload(this)"></label>'
  + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;min-height:42px">'
  + '<input type="checkbox" id="tmpCheck" checked style="width:auto;min-height:0"> '
  + 'Check first, do not write</label>'
  + '</div>'
  + '<div class="ad-note">The template already lists every waiting handle &mdash; fill the columns '
  + 'and upload it back. If even one row is missing a required column, <b>nothing</b> is written and '
  + 'you get the exact line numbers. Handles already in Mapping.xlsx are skipped, never overwritten.</div>'
  + '<div id="tmpUpOut"></div>'
  + '</div>'

  /* ---- manual ---- */
  + '<div class="ad-card"><h2>Waiting for mapping <span id="tmpCount" style="font-weight:400;'
  + 'color:#9A7A63;font-size:12px"></span></h2>'
  + '<div class="ad-note">Only <b>Candidate Name</b> and <b>Category</b> are required. '
  + 'Everything else can stay <code>-</code> &mdash; an official page or a media handle has '
  + 'no state, no seat and no party, and that is exactly how they are stored today '
  + '(all 40 media houses and 26 journalists in your mapping have <code>-</code> for State, '
  + 'Party and AC Name).<br>'
  + 'Do not want to map a handle at all? Use <b>Skip for now</b> &mdash; it leaves this list '
  + 'without touching its tweets, so one handle can never block the rest.</div>'
  + '<div id="tmpList"><div class="ad-note">Loading\u2026</div></div></div>'

  + '</div>';

  return t1 + t2 + t3 + t4;
}

/* ===================== JS ===================== */
function script() {
  return `
/* ================= Handle Tracker (teen tab ki JS) ================= */
var TRK_T=null, TLG_T=null;
var TRK_HS=[];            /* aakhri load ki hui handle list */
var TRK_DIRTY={};         /* kis select ko user ne haath lagaya -- poll usko nahi chhuyega */
var TLG_LOGS=[];
var TDB_PAGE=0, TDB_BUSY=false;

function trkEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function trkNum(n){return (Number(n)||0).toLocaleString('en-IN');}
function trkAgo(v){if(!v)return '\\u2014';var t=Date.parse(v);if(!t)return '\\u2014';
  var s=Math.max(0,(Date.now()-t)/1000);if(s<60)return 'just now';var m=Math.round(s/60);
  if(m<60)return m+' min ago';var h=Math.round(m/60);if(h<24)return h+' hr ago';
  var d=Math.round(h/24);return d+(d===1?' day ago':' days ago');}
function trkWhen(v){if(!v)return '';try{return new Date(v).toLocaleString('en-IN');}catch(e){return String(v);}}
function trkClock(ms){var s=Math.max(0,Math.round((ms||0)/1000));
  return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);}
function trkApi(p,o){return fetch(p,o||{}).then(function(r){return r.json();});}
function trkWinLabel(h){var m={'24':'Today (24 hours)','72':'Last 3 days','168':'Last 7 days',
  '360':'Last 15 days','720':'Last 30 days','2160':'Last 90 days'};
  return m[String(h)]||(h+' hours');}

/* ---- settings: user ki choice poll se overwrite na ho (ye wahi bug tha
       jisme 24 ghante chunne par 3 din par wapas chala jaata tha) ---- */
function trkDirty(id){TRK_DIRTY[id]=1;
  var b=document.getElementById('trkSaveBtn');
  if(b){b.classList.add('o');b.textContent='Save settings \\u2190';}}
function trkClean(){TRK_DIRTY={};
  var b=document.getElementById('trkSaveBtn');
  if(b){b.classList.remove('o');b.textContent='Save settings';}}
function trkSetSel(id,val){
  if(TRK_DIRTY[id])return;                       /* user ne badla hai -- haath mat lagao */
  var el=document.getElementById(id);
  if(el&&val!=null&&String(el.value)!==String(val))el.value=String(val);}
function trkSetChk(id,val){
  if(TRK_DIRTY[id])return;
  var el=document.getElementById(id);
  if(el&&val!=null)el.checked=!!val;}

/* Sentiment engine ka saaf haal -- yahi sabse zyada confuse karta hai:
   "sirf 3 sentiment aa rahe hain" ki wajah lagbhag hamesha yahi hoti hai
   ki trained package install hi nahi hai. */
function trkSentHtml(st){
  if(!st||!st.sentimentEngine)return '';
  var eng=st.sentimentEngine,ok=st.sentimentTrained;
  if(ok){
    var L=(st.sentimentLabels||[]),E=(st.sentimentExpected||[]),
        C=(st.sentimentCounts||{}),O=(st.sentimentOdd||[]);
    var ks=Object.keys(C).sort(function(a,b){return C[b]-C[a];});
    return '<div class="ad-note" style="border-left-color:#1B6B45">'
      +'<b style="color:#1B6B45">\u2714 Sentiment: your trained model</b> ('
      +trkEsc(eng)+')'
      +(L.length?'<br>Labels the model reports: '+L.map(trkEsc).join(', '):'')
      +(E.length?'<br>Labels expected (from <code>sentiment_labels.json</code>): '
        +E.map(trkEsc).join(', ')
        :'<br><span style="color:#9A7A63">No expected list set \u2014 fill '
         +'<code>sentiment_labels.json</code> and anything outside it gets flagged.</span>')
      +(ks.length?'<br>Last run: '+ks.map(function(k){
         return trkEsc(k)+' '+trkNum(C[k]);}).join(' \u00B7 '):'')
      +'</div>'
      +(O.length?'<div class="ad-err"><b>\u26A0 Labels not in your list: '
        +O.map(trkEsc).join(', ')+'</b><br>They were still stored, but the dashboards do not '
        +'know about them. Add them to <code>sentiment_labels.json</code>.</div>':'');}
  var pi=st.sentimentPython||{},E2=(st.sentimentExpected||[]);
  return '<div class="ad-err"><b>\u26A0 Your trained sentiment model is not installed.</b><br>'
    +'Current engine: <b>'+trkEsc(eng)+'</b> \u2014 it can only return <b>Positive, Negative, '
    +'Neutral</b>. Your model returns its own labels'
    +(E2.length?' ('+E2.map(trkEsc).join(', ')+')':' (for example "ANTI-BJP")')+'.<br>'
    /* Sabse aam galti: package Anaconda me install hota hai aur dashboard
       kisi doosre python ko bulata hai. Isliye python ka poora path dikhate
       hain -- "install to kiya tha" wali uljhan yahin khatam ho jaati hai. */
    +(pi.path?'<br><b>This dashboard is using this Python:</b><br><code>'+trkEsc(pi.path)+'</code>'
      +(pi.version?' (Python '+trkEsc(pi.version)+')':'')
      +'<br>Install into <b>that</b> one \u2014 if you installed the package into Anaconda or a '
      +'different Python, this one still will not see it.':'')
    +(pi.why?'<br>What it reported: <code>'+trkEsc(pi.why)+'</code>':'')
    +'<br>'
    +(st.sentimentStrict===false
      ? 'Strict sentiment is <b>off</b>, so those 3 fallback labels <b>are being written</b> '
        +'into the database.'
      : 'Strict sentiment is <b>on</b>, so the Sentiment column is being left <b>empty</b> '
        +'rather than filled with the wrong labels.')
    /* whl-cmd : wheel DASHBOARD folder me pehle se padi hai, isliye command
       usi ki honi chahiye -- user ko koi kaalpanik path bharna na pade. */
    +'<br><b>Fix it on the machine that runs this dashboard.</b> Easiest way \u2014 '
    +'double-click this file:<br>'
    +'<code>DASHBOARD\\\\INSTALL_SENTIMENT.bat</code>'
    +'<br><span style="font-size:11.5px">It finds this same Python by itself, installs the '
    +'bundled wheel into it, and runs a test tag at the end.</span>'
    +'<br><br>Or run this one line yourself, from a normal Command Prompt:<br>'
    +'<code>"'+trkEsc(pi.path||'python')+'" -m pip install '
    +'"...\\\\DASHBOARD\\\\sentiment_tagger-3.0.0-py3-none-any.whl"</code>'
    +'<br><span style="font-size:11.5px">The wheel is already in your DASHBOARD folder '
    +'\u2014 give its full path.</span>'
    +'<br>Then restart START_LIVE.bat and scrape again \u2014 it switches over on its own.</div>';}

/* ---- actions ---- */
/* Handle jodne se PEHLE bata do ki wo mapping me hai ya nahi -- warna
   pata scrape ke baad chalta hai. */
function trkCheck(){
  var v=(document.getElementById('trkIn')||{}).value||'';
  var box=document.getElementById('trkChk');if(!box)return;
  if(!v.trim()){box.innerHTML='';return;}
  box.innerHTML='<div class="ad-note">Checking\u2026</div>';
  trkApi('/admin/tracker/mapcheck?handles='+encodeURIComponent(v)).then(function(d){
    var hs=d.handles||[];
    if(!hs.length){box.innerHTML='<div class="ad-note">No handle recognised in that text.</div>';return;}
    box.innerHTML='<table><tr><th>HANDLE</th><th>IN MAPPING?</th><th>WHAT THE MAPPING SAYS</th></tr>'
      +hs.map(function(h){
        return '<tr><td><b>@'+trkEsc(h.handle)+'</b></td>'
        +'<td>'+(h.mapped
          ?'<span style="color:#1B6B45;font-weight:700">\u2714 Already in mapping</span>'
          :'<span style="color:#A8761F;font-weight:700">\u2716 Not in mapping</span>')+'</td>'
        +'<td>'+(h.mapped
          ?trkEsc([h.name,h.party,h.state,h.category].filter(Boolean).join(' \u00B7 '))
          :'<span style="color:#9A7A63">You will be asked for its columns on the '
           +'Handle Mapping tab after the first scrape.</span>')+'</td></tr>';}).join('')
      +'</table>';
    trkStale(d.fresh,d.msync);}).catch(function(e){
    box.innerHTML='<div class="ad-err">'+trkEsc(String(e))+'</div>';});}

/* Mapping.xlsx aap khud badal dein to handle_master.json purana reh jaata
   hai, aur tab tak panel us handle ko "unmapped" hi samjhega. */
function trkRebuild(btn){
  var msg=document.getElementById('trkRbMsg');
  if(btn){btn.disabled=true;btn.textContent='Rebuilding\u2026';}
  if(msg){msg.style.color='#8B6B55';msg.textContent='reading Mapping.xlsx\u2026 this can take a minute';}
  trkApi('/admin/tracker/rebuild-mapping',{method:'POST'}).then(function(r){
    if(msg){
      if(r.ok){msg.style.color='#1B6B45';
        msg.textContent='Done \u2014 '+trkNum(r.handles)+' handles in the mapping now';}
      else{msg.style.color='#A83224';
        msg.textContent='Failed: '+trkEsc(String(r.error||r.err||'').slice(0,200));}}
    setTimeout(function(){trkLoad();},800);})
   .catch(function(e){if(msg){msg.style.color='#A83224';msg.textContent=String(e);}})
   .then(function(){if(btn){btn.disabled=false;btn.textContent='Rebuild mapping from Mapping.xlsx';}});}

function trkAdd(){var i=document.getElementById('trkIn'),v=i.value.trim();if(!v)return;
  trkApi('/admin/tracker/add',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({handles:v})}).then(function(){
      /* jodte hi bata do kaun mapping me hai aur kaun nahi */
      trkApi('/admin/tracker/mapcheck?handles='+encodeURIComponent(v)).then(function(d){
        var box=document.getElementById('trkChk');
        var hs=(d.handles||[]),no=hs.filter(function(x){return !x.mapped;});
        if(box)box.innerHTML='<div class="'+(no.length?'ad-note':'ad-ok')+'">'
          +'<b>Added '+hs.length+' handle'+(hs.length===1?'':'s')+'.</b> '
          +(no.length
            ?(no.length+' of them '+(no.length===1?'is':'are')+' not in Mapping.xlsx ('
              +no.map(function(x){return '@'+trkEsc(x.handle);}).join(', ')
              +') \u2014 their tweets will be held until you fill them in on the '
              +'<a href="#trkmap">Handle Mapping</a> tab.')
            :'All of them are already in the mapping, so their tweets go straight into the database.')
          +'</div>';
        trkStale(d.fresh,d.msync);});
      i.value='';trkLoad();});}

function trkSave(){var b=document.getElementById('trkSaveBtn');b.disabled=true;
  trkApi('/admin/tracker/cfg',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({windowHours:document.getElementById('trkWin').value,
      intervalMin:document.getElementById('trkInt').value,
      sentimentStrict:(document.getElementById('trkStrict')||{}).checked!==false})})
   .then(function(){trkClean();}).catch(function(){})
   .then(function(){b.disabled=false;trkLoad();});}

function trkRun(only){var b=document.getElementById('trkRunBtn');
  if(!only&&b){b.disabled=true;b.textContent='\\u23F3 Running\\u2026';}
  /* Jo window screen par CHUNA hua hai wahi is run par lage -- Save dabaya
     ho ya nahi. Pehle Save bhoolne par purana window chup-chaap chalta tha. */
  var w=document.getElementById('trkWin'),body=only?{only:only}:{};
  if(w&&w.value)body.windowHours=w.value;
  trkApi('/admin/tracker/run',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)})
   .then(function(r){if(r&&r.skipped)alert('A scrape is already running. Wait for it to finish, or press Stop.');})
   .catch(function(){})
   .then(function(){if(b){b.disabled=false;b.textContent='\\u25B6 Scrape all now';}
     setTimeout(trkLoad,400);});}

function trkStop(){trkApi('/admin/tracker/stop',{method:'POST'}).then(trkLoad);}
function trkToggle(h,a){trkApi('/admin/tracker/toggle',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:h,active:a})}).then(trkLoad);}
function trkHWin(h,v){trkApi('/admin/tracker/hwin',{method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({handle:h,windowHours:v})}).then(trkLoad);}
function trkDel(h){if(!confirm('Remove @'+h+' from the tracked list?\\n\\nIts tweets stay in the database; it just will not be scraped again.'))return;
  trkApi('/admin/tracker/remove',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({handle:h})}).then(trkLoad);}

/* ---- status line (Tracker aur Log dono tab par wahi) ---- */
function trkStatusHtml(st,cfg){
  var s='';
  if(!st.cookieOk){return '<b style="color:#A83224">\\u2716 No cookie</b> \\u2014 '
    +'fill in auth_token, ct0 and twid in DASHBOARD\\\\x_config.json. Scraping cannot run without it.';}
  if(st.running){return '<b style="color:#1B6B45">\\u25CF Scraping\\u2026</b> \\u2014 '
    +trkEsc(st.current?'@'+st.current:'starting up');}
  var r=st.lastResult||{};
  if(r.ok){s='<b style="color:#1B6B45">\\u2714 Last run finished</b> \\u2014 '
    +'<b>'+trkNum(r.newCount)+'</b> new, <b>'+trkNum(r.updatedCount)+'</b> updated, '
    +trkNum(r.handles)+' handles, '+trkNum(r.pages)+' pages'
    +(r.errors?', <b style="color:#A83224">'+r.errors+' error(s)</b>':'')
    +' \\u2014 '+trkAgo(r.at)+' (took '+Math.round((r.ms||0)/1000)+'s)';}
  else if(r.error){s='<b style="color:#A83224">\\u2716 Last run failed</b> \\u2014 '+trkEsc(r.error);}
  else{s='<b>No scrape has run yet</b>';}
  if(st.nextAt)s+=' \\u00B7 next in '+Math.max(0,Math.round((st.nextAt-Date.now())/60000))+' min';
  if(cfg&&cfg.windowHours)s+=' \\u00B7 window: '+trkWinLabel(cfg.windowHours);
  return s;}

/* Scrape ke baad agar koi handle mapping ke intezaar me ruk gaya hai to
   Handle Tracker tab par hi bata do. User scrape yahin se chalata hai --
   khabar doosre tab me chhipi rahe to wo kabhi dikhegi hi nahi. */
function trkWaitHtml(st,extra){
  /* pendingCount = abhi kitne handle ruke hain (har run par reset nahi hota).
     heldCount = SIRF pichhle run me kitne tweet ruke. Dono me se jo mile. */
  var h=Number(extra&&extra.pendingCount)||0;
  var t=Number(st&&st.heldCount)||0;
  if(!h&&!t)return '';
  return '<div class="ad-err" style="margin-top:10px">'
    +'<b>\u26A0 '
    +(h?trkNum(h)+' handle'+(h===1?'':'s')+' waiting for mapping':'')
    +(h&&t?' \u00B7 ':'')
    +(t?trkNum(t)+' tweet'+(t===1?'':'s')+' held in the last run':'')
    +'</b><br>These handles are not in <code>Mapping.xlsx</code>, so their tweets have '
    +'<b>not</b> gone into <code>master_tweets</code> yet \u2014 nothing is lost, they are '
    +'being held. '
    +'<a href="#trkmap" style="color:#A83224;font-weight:700">Open the Handle Mapping tab</a> '
    +'and fill in their columns; the tweets go in the moment you save.</div>';}

/* Mapping.xlsx ki date handle_master.json se nayi hai -> rebuild chahiye */
/* Mapping sync ka haal -- har baar dikhta hai, taaki chup-chaap fail na ho */
function trkMsync(m){
  if(!m)return '';
  var line,col,bg;
  if(m.ok===false){
    col='#8A1C13';bg='#FDECEA';
    line='<b>\u26A0 Mapping Sync: Failed</b> \u2014 dashboard is still using the '
      +'last mapping that synced cleanly.'+(m.why?'<br><span style="opacity:.85">'
      +trkEsc(m.why)+'</span>':'');
  }else if(m.ok===null||!m.at){
    col='#6B5B45';bg='#FFF7EC';
    line='<b>Mapping Sync: not run yet</b> \u2014 it runs on startup and with every '
      +'hourly update.';
  }else if(m.changed){
    col='#13593A';bg='#E8F6EE';
    line='<b>Mapping Sync: Updated</b> \u2014 '+m.added+' added, '+m.modified
      +' modified, '+m.removed+' removed'+(m.mongo?' \u00B7 database updated':'')+'.';
  }else{
    col='#2F5D7C';bg='#EDF4FA';
    line='<b>Mapping Sync: Checked</b> \u2014 no mapping changes.';
  }
  var det='';
  if(m.modifiedList&&m.modifiedList.length){
    det='<div style="margin-top:7px;font-size:11.5px;line-height:1.5;max-height:150px;overflow:auto">'
      +m.modifiedList.slice(0,12).map(function(x){
        return '<b>@'+trkEsc(x.handle)+'</b> \u2014 '+(x.changes||[]).map(function(c){
          return trkEsc(c.field)+': '+trkEsc(c.old)+' \u2192 '+trkEsc(c.new);}).join(' \u00B7 ');
      }).join('<br>')+'</div>';
  }
  var warn='';
  if(m.warnings&&m.warnings.length){
    warn='<div style="margin-top:7px;font-size:11.5px;color:#8A1C13">'
      +m.warnings.slice(0,6).map(trkEsc).join('<br>')+'</div>';
  }
  return '<div style="margin-top:10px;background:'+bg+';color:'+col
    +';border-radius:9px;padding:10px 12px;font-size:12px;line-height:1.55">'
    +line
    +'<div style="margin-top:5px;font-size:11px;opacity:.8">Last check: '
    +trkEsc(m.at||'\u2014')+(m.rows?(' \u00B7 '+m.rows.toLocaleString('en-IN')+' handles in mapping'):'')+'</div>'
    +det+warn
    +'<button class="ad-btn o" style="margin-top:9px" onclick="trkMsyncNow(this)">'
    +'Sync mapping now</button> <span id="trkMsMsg" style="font-size:12px"></span>'
    +'</div>';}

/* baaki file ki tarah seedha function -- HTML onclick isi naam se bulata hai */
function trkMsyncNow(btn){
  var msg=document.getElementById('trkMsMsg');
  btn.disabled=true;if(msg)msg.textContent=' Running\u2026';
  fetch('/admin/mapping/sync',{method:'POST'}).then(function(r){return r.json();})
   .then(function(){if(msg)msg.textContent=' Started \u2014 this panel updates on its own.';
     setTimeout(function(){btn.disabled=false;},6000);})
   .catch(function(e){if(msg)msg.textContent=' '+String(e);btn.disabled=false;});};

function trkStale(f,m){
  var box=document.getElementById('trkStale');if(!box)return;
  var sync=trkMsync(m);
  if(!f||!f.stale){box.innerHTML=sync;return;}
  box.innerHTML=sync+'<div class="ad-err" style="margin-top:10px">'
    +'<b>\u26A0 Mapping.xlsx has been edited since the mapping was last built.</b><br>'
    +'If you added handles to the Excel yourself, this panel cannot see them until the '
    +'mapping is rebuilt from it. Excel changed '+trkAgo(f.xlsxAt)
    +', mapping built '+trkAgo(f.jsonAt)+'.<br>'
    +'<button class="ad-btn o" style="margin-top:8px" onclick="trkRebuild(this)">'
    +'Rebuild mapping from Mapping.xlsx</button> '
    +'<span id="trkRbMsg" style="font-size:12px"></span></div>';}

/* ---- progress bar ----
   Pehle bar sirf done/total par chalta tha. Ek hi handle par wo 0% se
   seedha gayab ho jaata tha -- user ko lagta tha kuch ho hi nahi raha.
   Ab chalu handle ke andar padhe gaye page se bhi bar aage badhta hai,
   aur neeche live ginti chalti rehti hai. */
function trkProg(p,st){
  var box=document.getElementById(p+'Prog');if(!box)return;
  if(!st.running){box.style.display='none';return;}
  box.style.display='block';
  var total=st.total||1,done=st.done||0;
  /* chalu handle ka hissa: page 1 -> 12%, page 8+ -> 92% */
  var part=Math.min(0.92,(st.page||0)/8);
  var pct=Math.min(99,Math.round(((done+part)/total)*100));
  document.getElementById(p+'ProgIn').style.width=pct+'%';
  document.getElementById(p+'ProgPct').textContent=pct+'%';
  document.getElementById(p+'ProgL').innerHTML=
    (st.current?'<b>@'+trkEsc(st.current)+'</b>':'starting\\u2026')
    +' \\u00B7 handle '+Math.min(done+1,total)+' of '+total
    +(st.page?' \\u00B7 page '+st.page:'');
  document.getElementById(p+'ProgSub').textContent=
    trkNum(st.handleTweets)+' tweets from this handle \\u00B7 '
    +trkNum(st.newCount)+' new, '+trkNum(st.updatedCount)+' updated so far \\u00B7 '
    +trkNum(st.pages)+' pages read \\u00B7 '+trkClock(st.elapsedMs)+' elapsed';}

/* ---- tracked accounts table ---- */
function trkRenderTable(){
  var box=document.getElementById('trkTable');if(!box)return;
  var qEl=document.getElementById('trkSearch');
  var q=(qEl?qEl.value:'').trim().toLowerCase().replace(/^@+/,'');
  var hs=TRK_HS.filter(function(h){
    if(!q)return true;
    return String(h._id).toLowerCase().indexOf(q)>=0
        || String(h.name||'').toLowerCase().indexOf(q)>=0;});
  var cnt=document.getElementById('trkCount');
  if(cnt)cnt.textContent=TRK_HS.length?(q?(hs.length+' of '+TRK_HS.length+' tracked'):(TRK_HS.length+' tracked')):'';
  if(!TRK_HS.length){box.innerHTML='<div class="ad-note">No handles yet. Add one above.</div>';return;}
  if(!hs.length){box.innerHTML='<div class="ad-note">No handle matches "'+trkEsc(q)+'".</div>';return;}
  var wins=[['','Default'],['24','Today (24 hours)'],['72','Last 3 days'],['168','Last 7 days'],
            ['360','Last 15 days'],['720','Last 30 days'],['2160','Last 90 days']];
  box.innerHTML='<table><tr><th>HANDLE</th><th>MAPPING</th><th>STATUS</th><th>SCRAPE WINDOW</th>'
    +'<th>LAST CHECKED</th><th>ACTIONS</th></tr>'
    +hs.map(function(h){
      var on=h.active!==false, id=trkEsc(h._id);
      var bad=/^Error/i.test(String(h.status||''));
      var stat=!on?'<span style="color:#A8761F">\\u23F8 Paused</span>'
        :(bad?'<span style="color:#A83224">\\u2716 '+trkEsc(h.status)+'</span>'
             :'<span style="color:#1B6B45">\\u25CF Active</span>');
      var cur=h.windowHours?String(h.windowHours):'';
      return '<tr><td><b>@'+id+'</b>'
        +(h.name?'<div style="color:#9A7A63;font-size:11px">'+trkEsc(h.name)+'</div>':'')
        +'<div style="color:#9A7A63;font-size:11px">'+trkNum(h.tweets)+' tweets</div></td>'
        +'<td>'+(h.mapped
          ?'<span style="color:#1B6B45" title="'+trkEsc(h.mapInfo||'')+'">\u2714 In mapping</span>'
          :'<span style="color:#A8761F">\u2716 Not mapped</span>')+'</td>'
        +'<td>'+stat+'</td>'
        +'<td><select onchange="trkHWin(\\''+id+'\\',this.value)" style="min-width:160px">'
        +wins.map(function(w){return '<option value="'+w[0]+'"'+(cur===w[0]?' selected':'')+'>'
          +w[1]+(w[0]?'':' (use global)')+'</option>';}).join('')
        +'</select></td>'
        +'<td title="'+trkEsc(trkWhen(h.lastRun))+'">'+trkAgo(h.lastRun)+'</td>'
        +'<td style="white-space:nowrap">'
        +'<button class="ad-btn s g" onclick="trkRun(\\''+id+'\\')">\\u25B6 Scrape</button> '
        +'<button class="ad-btn s" onclick="trkToggle(\\''+id+'\\','+(!on)+')">'+(on?'Pause':'Resume')+'</button> '
        +'<button class="ad-btn s r" onclick="trkDel(\\''+id+'\\')">Remove</button>'
        +'</td></tr>';}).join('')
    +'</table>';}

/* ---- Tracker tab load ---- */
function trkLoad(){return trkApi('/admin/tracker/state').then(trkPaint).catch(function(e){
  var el=document.getElementById('trkStatus');if(el)el.textContent='Could not load: '+e;});}

function trkPaint(d){
  var st=d.status||{},cfg=d.cfg||{};
  TRK_HS=d.handles||[];
  TLG_LOGS=d.logs||TLG_LOGS;
  trkSetSel('trkWin',cfg.windowHours);
  trkSetSel('trkInt',cfg.intervalMin);
  trkSetChk('trkStrict',cfg.sentimentStrict!==false);
  var sb=document.getElementById('trkSentBox');
  if(sb)sb.innerHTML=trkSentHtml(st);
  var el=document.getElementById('trkStatus');
  if(el)el.innerHTML=trkStatusHtml(st,cfg)+trkWaitHtml(st,d);
  trkProg('trk',st);
  trkRenderTable();
  tdbFillHandles();
  trkStale(d.fresh,d.msync);
}

/* ================= Live Scrape Log tab ================= */
function tlgLoad(){return trkApi('/admin/tracker/logs?limit=400').then(function(d){
    TLG_LOGS=d.logs||[];
    var st=d.status||{};
    var el=document.getElementById('tlgStatus');
    if(el)el.innerHTML=trkStatusHtml(st,d.cfg||{});
    trkProg('tlg',st);
    tlgPaint();}).catch(function(e){
    var el=document.getElementById('tlgStatus');if(el)el.textContent='Could not load: '+e;});}

function tlgPaint(){
  var pane=document.getElementById('tlgPane');if(!pane)return;
  var onlyEl=document.getElementById('tlgOnly'),qEl=document.getElementById('tlgQ');
  var only=onlyEl?onlyEl.value:'';
  var q=(qEl?qEl.value:'').trim().toLowerCase();
  var rows=TLG_LOGS.filter(function(l){
    if(only==='err'&&l.k!=='err')return false;
    if(only==='bad'&&l.k!=='err'&&l.k!=='warn')return false;
    if(q&&String(l.m).toLowerCase().indexOf(q)<0)return false;
    return true;});
  var cnt=document.getElementById('tlgCount');
  if(cnt)cnt.textContent=rows.length+(rows.length===1?' line':' lines')
    +(rows.length!==TLG_LOGS.length?(' of '+TLG_LOGS.length):'');

  /* Server se log NAYA-PEHLE aata hai. Padhne me ye ulta lagta hai --
     scrape neeche se upar chalta dikhta tha. Terminal ki tarah seedha
     karte hain: sabse purani line upar, nayi neeche. */
  rows=rows.slice().reverse();

  /* Scroll: agar user neeche hi tha (ya pehli baar paint ho raha hai) to
     nayi line ke saath neeche chale jao. Par agar usne upar scroll karke
     kuch padhna shuru kiya hai to usse mat kheencho -- har 3 sec me page
     neeche phenkna sabse chidhane wali cheez hoti hai. */
  var ds=pane.dataset||(pane.dataset={});
  var first=!ds.painted;
  var stick=first||((pane.scrollTop+pane.clientHeight)>=(pane.scrollHeight-40));

  pane.innerHTML=rows.length?rows.map(function(l){
    var c=l.k==='err'?'#F0908A':(l.k==='warn'?'#E8C27A':'#9FE3BE');
    /* run khatam hone wali line alag se chamakni chahiye -- log me
       "kya ye poora hua?" sabse zyada poochha jaane wala sawaal hai */
    var done=/^(\\u2714 DONE|\\u23F9 STOPPED|\\u2716 SCRAPE FAILED)/.test(String(l.m));
    return '<div style="color:'+c+(done?';font-weight:700;background:#241A12;'
      +'border-left:3px solid '+c+';padding:3px 7px;margin:3px 0;border-radius:3px':'')+'">'
      +'<span style="color:#7A6A5C">'
      +trkEsc(String(l.t).slice(0,10))+' '+trkEsc(String(l.t).slice(11,19))+'</span> '
      +trkEsc(l.m)+'</div>';}).join('')
    :'<div style="color:#7A6A5C">No log lines.</div>';

  ds.painted='1';
  if(stick)tlgBottom();}

function tlgBottom(){var p=document.getElementById('tlgPane');
  if(p)p.scrollTop=p.scrollHeight;}

/* ================= Tweet Database tab ================= */
function tdbFillHandles(){
  var sel=document.getElementById('tdbHandle');
  if(!sel||!TRK_HS.length)return;
  var want=TRK_HS.map(function(h){return h._id;}).join(',');
  if(sel.dataset.hs===want)return;            /* badla nahi -- chhodo */
  var keep=sel.value;
  sel.innerHTML='<option value="">All tracked handles</option>'
    +TRK_HS.map(function(h){return '<option value="'+trkEsc(h._id)+'">@'+trkEsc(h._id)+'</option>';}).join('');
  sel.dataset.hs=want;
  if(keep)sel.value=keep;}

function tdbFilters(){
  return {h:(document.getElementById('tdbHandle')||{}).value||'',
    q:((document.getElementById('tdbQ')||{}).value||'').trim(),
    only:(document.getElementById('tdbOnly')||{}).checked?'1':'',
    from:(document.getElementById('tdbFrom')||{}).value||'',
    to:(document.getElementById('tdbTo')||{}).value||''};}

/* IST me aaj ki tareekh -- browser kisi aur timezone me ho to bhi
   'Tweet Date' IST me likhi hai, isliye hisaab IST par hi hona chahiye. */
function tdbIstDay(back){
  var t=new Date(Date.now()+5.5*3600*1000-(back||0)*86400000);
  return t.toISOString().slice(0,10);}

function tdbDays(n){
  var f=document.getElementById('tdbFrom'),t=document.getElementById('tdbTo');
  if(!f||!t)return;
  if(!n){f.value='';t.value='';}
  else{f.value=tdbIstDay(n-1);t.value=tdbIstDay(0);}
  tdbGo(0);}

/* CSV ka link hamesha wahi filter dikhaye jo table par laga hai --
   warna screen par kuch aur, file me kuch aur aata. */
function tdbCsvLink(){
  var a=document.getElementById('tdbCsv');if(!a)return;
  var f=tdbFilters();
  a.href='/admin/tracker/export.csv?handle='+encodeURIComponent(f.h)
    +'&q='+encodeURIComponent(f.q)+'&only='+f.only
    +'&from='+f.from+'&to='+f.to;}

function tdbGo(p){
  if(TDB_BUSY)return;
  TDB_PAGE=Math.max(0,p||0);
  var box=document.getElementById('tdbTable');if(!box)return;
  var lim=Number((document.getElementById('tdbLimit')||{}).value)||50;
  var f=tdbFilters();
  tdbCsvLink();
  TDB_BUSY=true;
  box.style.opacity='.5';
  var u='/admin/tracker/tweets?page='+TDB_PAGE+'&limit='+lim
       +'&handle='+encodeURIComponent(f.h)+'&q='+encodeURIComponent(f.q)+'&only='+f.only
       +'&from='+f.from+'&to='+f.to;
  trkApi(u).then(function(d){
    if(d.error){box.innerHTML='<div class="ad-err">'+trkEsc(d.error)+'</div>';return;}
    tdbPaint(d);}).catch(function(e){
    box.innerHTML='<div class="ad-err">Could not load: '+trkEsc(String(e))+'</div>';})
   .then(function(){TDB_BUSY=false;box.style.opacity='1';});}

function tdbPaint(d){
  var rows=d.rows||[],box=document.getElementById('tdbTable');
  var from=TDB_PAGE*(d.limit||50);
  var info=document.getElementById('tdbInfo');
  var fl=tdbFilters(),rng=(fl.from||fl.to)
    ?(' \\u00B7 '+(fl.from||'start')+' to '+(fl.to||'now')):' \\u00B7 all dates';
  if(info)info.textContent=(rows.length
    ?((from+1)+'\\u2013'+(from+rows.length)+(d.more?'':' (end)')):'nothing found')+rng;
  var pv=document.getElementById('tdbPrev'),nx=document.getElementById('tdbNext');
  if(pv)pv.disabled=TDB_PAGE<=0;
  if(nx)nx.disabled=!d.more;
  if(!rows.length){box.innerHTML='<div class="ad-note">No tweets match this filter.</div>';return;}
  box.innerHTML='<table><tr><th>TWEET DATE</th><th>HANDLE</th><th>TWEET</th><th>LIKES</th>'
    +'<th>COMMENTS</th><th>RETWEETS</th><th>VIEWS</th><th>LINK</th></tr>'
    +rows.map(function(r){
      var tx=String(r.text||'');
      return '<tr><td style="white-space:nowrap">'+trkEsc(String(r.date||'').replace(' IST',''))+'</td>'
      +'<td><b>@'+trkEsc(r.handle)+'</b></td>'
      +'<td style="white-space:normal;max-width:460px" title="'+trkEsc(tx)+'">'
      +trkEsc(tx.length>180?tx.slice(0,180)+'\\u2026':tx)+'</td>'
      +'<td>'+trkNum(r.likes)+'</td><td>'+trkNum(r.comments)+'</td>'
      +'<td>'+trkNum(r.retweets)+'</td><td>'+trkNum(r.views)+'</td>'
      +'<td>'+(r.url?'<a href="'+trkEsc(r.url)+'" target="_blank" rel="noopener">open</a>':'\\u2014')+'</td>'
      +'</tr>';}).join('')
    +'</table>';}

/* ================= Handle Mapping tab ================= */
var TMP_P=[], TMP_OPT={}, TMP_COLS=[], TMP_REQ=[], TMP_BUSY=false;

/* legacy-fix-ui : aam load sasta hai (sirf tracked handle gine jaate hain).
   Poora database scan mehnga hai, isliye wo sirf maangne par. */
function tmpLoad(deep){
  /* deep sirf click par chalta hai, poll par kabhi nahi -- isliye click
     ko force maante hain, chahe pichhli baar fail hua ho. */
  var u='/admin/tracker/pending'+(deep?'?deep=1&force=1':'');
  if(deep){var b=document.getElementById('tmpDeepBtn');
    if(b){b.disabled=true;b.textContent='Scanning\u2026';}}
  return trkApi(u).then(function(d){
    var b=document.getElementById('tmpDeepBtn');
    if(b){b.disabled=false;b.textContent='Scan the whole database';}
    if(d.error)throw new Error(d.error);
    TMP_P=d.handles||[];TMP_OPT=d.options||{};
    TMP_COLS=d.cols||[];TMP_REQ=d.required||[];
    var m=d.mapping||{};
    var st=document.getElementById('tmpStatus');
    if(st)st.innerHTML=
      (m.error?'<b style="color:#A83224">\u2716 '+trkEsc(m.error)+'</b><br>':'')
      +'<b>'+trkNum(m.handles)+'</b> handles in the mapping \u00B7 '
      +(TMP_P.length?('<b style="color:#A8761F">'+trkNum(TMP_P.length)+'</b> waiting to be filled')
                    :'<b style="color:#1B6B45">nothing waiting</b>')
      +' \u00B7 sentiment engine: <b>'+trkEsc(d.sentimentEngine||'unknown')+'</b>'
      +(d.sentimentTrained===false
        ?' <span style="color:#A83224">(not your trained model \u2014 see Handle Tracker tab)</span>':'')
      +'<div style="margin-top:9px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +'<button class="ad-btn s" id="tmpDeepBtn" onclick="tmpLoad(1)">'
      +'Scan the whole database</button>'
      +'<span style="font-size:11.5px;color:#9A7A63">This list normally only checks the '
      +'handles the tracker is watching, which is fast. A full scan also finds handles that '
      +'were scraped earlier and later removed from the tracked list \u2014 it reads every '
      +'row, so it can take a minute.</span></div>'
      +((d.legacy&&d.legacy.error)
        ?'<div class="ad-err" style="margin-top:9px"><b>The full scan could not finish.</b><br>'
         +trkEsc(d.legacy.error)
         +'<br>The list below still shows every tracked handle that needs mapping \u2014 only '
         +'handles no longer being tracked could be missing. An index is created on first '
         +'start; if this keeps happening, restart once and try the scan again.</div>':'');
    tmpPaint();}).catch(function(e){
    var st=document.getElementById('tmpStatus');
    if(st)st.textContent='Could not load: '+e;});}

function tmpField(h,col){
  var id='tmp_'+h.replace(/[^A-Za-z0-9_]/g,'')+'_'+col.replace(/[^A-Za-z0-9]/g,'');
  var req=TMP_REQ.indexOf(col)>=0;
  var lab=trkEsc(col)+(req?' <span style="color:#A83224">*</span>':'');
  var derived=(col==='Locations'||col==='Categories');
  var opts=TMP_OPT[col];
  var input;
  if(opts&&opts.length){
    /* Mapping me jo values pehle se hain wahi chuno -- nayi spelling
       ("UP" bनाम "Uttar Pradesh") dashboard ka filter tod deti hai.
       Phir bhi kuch naya chahiye to "other" se type kar sakte ho. */
    input='<select id="'+id+'" data-col="'+trkEsc(col)+'">'
      +'<option value="">\u2014 choose \u2014</option>'
      /* Media house / official page ka na State hota hai, na seat, na party --
         unke liye "-" bilkul theek hai, isliye wo pehla asli option hai. */
      +(req?'':'<option value="-" selected>- (not applicable)</option>')
      +opts.slice(0,400).map(function(o){return '<option>'+trkEsc(o)+'</option>';}).join('')
      +'<option value="__other">other\u2026</option></select>'
      +'<input id="'+id+'_o" data-col="'+trkEsc(col)+'" placeholder="type a new '+trkEsc(col)+'" '
      +'style="display:none;margin-top:5px">';
  }else{
    input='<input id="'+id+'" data-col="'+trkEsc(col)+'" '
      +(req?'':'value="-" ')
      +'placeholder="'+(derived?'auto':(req?'required':'-'))+'"'
      +(derived?' disabled':'')+'>';
  }
  return '<div style="min-width:160px;flex:1"><label>'+lab+'</label>'+input+'</div>';}

function tmpPaint(){
  var box=document.getElementById('tmpList');if(!box)return;
  var cnt=document.getElementById('tmpCount');
  if(cnt)cnt.textContent=TMP_P.length?(TMP_P.length+' handle'+(TMP_P.length===1?'':'s')):'';
  if(!TMP_P.length){box.innerHTML='<div class="ad-note">Nothing waiting. Every scraped handle is '
    +'already in the mapping.</div>';return;}
  box.innerHTML=TMP_P.map(function(p){
    var h=trkEsc(p.handle),safe=p.handle.replace(/[^A-Za-z0-9_]/g,'');
    return '<div class="ad-note" style="border-left-color:#A8761F;margin-bottom:14px" '
      +'id="tmpcard_'+safe+'">'
      +'<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">'
      +'<b style="font-size:14px">@'+h+'</b>'
      +'<span style="color:#9A7A63">'
      +(p.tweets?trkNum(p.tweets)+' tweets held':'')
      +(p.tweets&&p.dbTweets?' \u00B7 ':'')
      +(p.dbTweets?trkNum(p.dbTweets)+' already in the database':'')
      +'</span></div>'
      +(p.dbTweets&&!p.tweets
        ?'<div style="color:#A8761F;font-size:11.5px;margin-top:4px">This handle was scraped '
         +'before the mapping check existed, so its tweets are already in '
         +'<code>master_tweets</code> without State / Party / Category. Filling this in '
         +'will add those columns to them.</div>':'')
      +(p.sample?'<div style="color:#8B6B55;font-size:11.5px;margin:6px 0 2px">'
        +trkEsc(p.sample)+'</div>':'')
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">'
      +TMP_COLS.map(function(c){return tmpField(p.handle,c);}).join('')
      +'</div>'
      +'<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      +'<button class="ad-btn g" onclick="tmpSave(\\''+h+'\\')">Save mapping and apply to '
      +trkNum((p.tweets||0)+(p.dbTweets||0))+' tweets</button>'
      /* skip-handle : ek handle poori list ko rok nahi sakta. Jo nahi
         bharna, use hata do -- uska data mitta nahi. */
      +'<button class="ad-btn s" onclick="tmpSkip(\\''+h+'\\',\\'hide\\')" '
      +'title="Remove it from this list. Its held tweets are kept, and it comes '
      +'back here if the handle is scraped again.">Skip for now</button>'
      +'<button class="ad-btn s" onclick="tmpSkip(\\''+h+'\\',\\'stop\\')" '
      +'title="Remove it from this list and stop tracking the handle, so it is '
      +'not scraped again. Held tweets are kept.">Skip &amp; stop tracking</button>'
      +'<button class="ad-btn s r" onclick="tmpSkip(\\''+h+'\\',\\'drop\\')" '
      +'title="Delete the held tweets as well. This one does remove data.">'
      +'Discard held tweets</button>'
      +'<span id="tmpmsg_'+safe+'" style="margin-left:4px;font-size:12px"></span></div>'
      +'</div>';}).join('');
  /* "other" chunne par text box khol do */
  TMP_P.forEach(function(p){
    var safe=p.handle.replace(/[^A-Za-z0-9_]/g,'');
    TMP_COLS.forEach(function(c){
      var id='tmp_'+safe+'_'+c.replace(/[^A-Za-z0-9]/g,'');
      var sel=document.getElementById(id),oth=document.getElementById(id+'_o');
      if(sel&&oth&&sel.tagName==='SELECT')sel.onchange=function(){
        oth.style.display=(sel.value==='__other')?'block':'none';};});});}

function tmpSave(handle){
  if(TMP_BUSY)return;
  var safe=handle.replace(/[^A-Za-z0-9_]/g,'');
  var msg=document.getElementById('tmpmsg_'+safe);
  var fields={},miss=[];
  TMP_COLS.forEach(function(c){
    var id='tmp_'+safe+'_'+c.replace(/[^A-Za-z0-9]/g,'');
    var el=document.getElementById(id),oth=document.getElementById(id+'_o');
    var v=el?String(el.value||'').trim():'';
    if(v==='__other')v=oth?String(oth.value||'').trim():'';
    fields[c]=v;
    if(TMP_REQ.indexOf(c)>=0&&!v)miss.push(c);});
  if(miss.length){if(msg){msg.style.color='#A83224';
    msg.textContent='Still empty: '+miss.join(', ');}return;}
  TMP_BUSY=true;
  if(msg){msg.style.color='#8B6B55';msg.textContent='Writing to Mapping.xlsx and rebuilding\u2026 '
    +'(this can take a minute)';}
  trkApi('/admin/tracker/map',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({handle:handle,fields:fields})})
   .then(function(r){
     if(!r.ok){if(msg){msg.style.color='#A83224';msg.textContent=r.error||'failed';}return;}
     var rel=(r.released||[])[0]||{};
     if(msg){msg.style.color='#1B6B45';
       msg.textContent='Done \u2014 '+(rel.released||0)+' held tweets released, '
         +(rel.patched||0)+' existing rows updated';}
     setTimeout(tmpLoad,900);})
   .catch(function(e){if(msg){msg.style.color='#A83224';msg.textContent=String(e);}})
   .then(function(){TMP_BUSY=false;});}

/* skip-handle : teen tarah ka skip. Sirf 'drop' me data jaata hai,
   isliye uspar confirm maangte hain. */
function tmpSkip(handle,mode){
  if(TMP_BUSY)return;
  var safe=handle.replace(/[^A-Za-z0-9_]/g,'');
  var msg=document.getElementById('tmpmsg_'+safe);
  if(mode==='drop'&&!confirm('Delete the held tweets for @'+handle+'?\\n\\n'
    +'They are removed for good. The handle also stops being tracked.\\n'
    +'Use "Skip for now" instead if you only want it out of this list.'))return;
  TMP_BUSY=true;
  if(msg){msg.style.color='#8B6B55';msg.textContent='Removing\u2026';}
  trkApi('/admin/tracker/skip',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({handle:handle,mode:mode})})
   .then(function(r){
     if(msg){
       if(r.ok){msg.style.color='#1B6B45';
         msg.textContent=(mode==='drop'
           ?('Removed \u2014 '+trkNum(r.removedTweets)+' held tweets deleted')
           :(mode==='stop'?'Removed and no longer tracked':'Skipped for now'));}
       else{msg.style.color='#A83224';msg.textContent=r.why||r.error||'failed';}}
     setTimeout(tmpLoad,700);})
   .catch(function(e){if(msg){msg.style.color='#A83224';msg.textContent=String(e);}})
   .then(function(){TMP_BUSY=false;});}

function tmpUpload(inp){
  var f=inp.files&&inp.files[0];if(!f)return;
  var out=document.getElementById('tmpUpOut');
  var check=(document.getElementById('tmpCheck')||{}).checked;
  out.innerHTML='<div class="ad-note">Reading '+trkEsc(f.name)+'\u2026</div>';
  var fr=new FileReader();
  fr.onload=function(){
    fetch('/admin/tracker/map-upload'+(check?'?check=1':''),
      {method:'POST',headers:{'Content-Type':'text/csv'},body:fr.result})
     .then(function(r){return r.json();}).then(function(r){tmpUpOut(r,check);})
     .catch(function(e){out.innerHTML='<div class="ad-err">'+trkEsc(String(e))+'</div>';})
     .then(function(){inp.value='';});};
  fr.onerror=function(){out.innerHTML='<div class="ad-err">Could not read that file.</div>';};
  fr.readAsText(f);}

function tmpUpOut(r,check){
  var out=document.getElementById('tmpUpOut');if(!out)return;
  var h='';
  if(r.incomplete){
    h='<div class="ad-err"><b>'+trkNum(r.badCount)+' row(s) are incomplete \u2014 nothing was '
      +'written.</b> '+trkNum(r.goodCount)+' row(s) were fine. Fill these and upload again:</div>'
      +'<table><tr><th>CSV LINE</th><th>HANDLE</th><th>WHAT IS MISSING</th></tr>'
      +(r.bad||[]).map(function(b){return '<tr><td>'+b.line+'</td><td>@'+trkEsc(b.handle)
        +'</td><td>'+trkEsc(b.why)+'</td></tr>';}).join('')+'</table>';
    out.innerHTML=h;return;}
  if(!r.ok){out.innerHTML='<div class="ad-err">'+trkEsc(r.error||'failed')+'</div>';return;}
  var rel=(r.released||[]).reduce(function(a,x){return a+(x.released||0);},0);
  h='<div class="ad-ok"><b>'+(check?'Check only \u2014 nothing written. ':'')
    +trkNum(r.added)+' handle(s) '+(check?'ready to add':'added to Mapping.xlsx')+'</b>'
    +(r.rows_written?' ('+trkNum(r.rows_written)+' Excel rows)':'')
    +(check?'':' \u00B7 <b>'+trkNum(rel)+'</b> held tweets released into the database')+'</div>';
  if(r.backup)h+='<div class="ad-note">Excel backup: <code>'+trkEsc(r.backup)+'</code></div>';
  if((r.skipped||[]).length)h+='<div class="ad-note"><b>Skipped (already in the mapping):</b><br>'
    +r.skipped.map(function(x){return '@'+trkEsc(x.handle)+' \u2014 '+trkEsc(x.why);}).join('<br>')
    +'</div>';
  if((r.errors||[]).length)h+='<div class="ad-err"><b>Could not use:</b><br>'
    +r.errors.map(function(x){return 'line '+x.row+' @'+trkEsc(x.handle)+' \u2014 '+trkEsc(x.why);}).join('<br>')
    +'</div>';
  if(r.rebuild&&r.rebuild.ok===false)h+='<div class="ad-err">Mapping rebuild failed \u2014 '
    +'Mapping.xlsx was updated but handle_master.json was not. Run '
    +'<code>python rebuild_mapping.py --apply</code> yourself.<br>'
    +trkEsc(String(r.rebuild.error||r.rebuild.err||'').slice(0,300))+'</div>';
  out.innerHTML=h;
  if(!check)setTimeout(tmpLoad,900);}

/* ================= poll ================= */
function trkOn(id){var e=document.getElementById('sec-'+id);return !!e&&e.classList.contains('on');}

if(document.getElementById('sec-tracker')){
  trkLoad();
  TRK_T=setInterval(function(){if(!document.hidden&&trkOn('tracker'))trkLoad();},5000);
  TLG_T=setInterval(function(){
    if(document.hidden)return;
    var a=document.getElementById('tlgAuto');
    if(trkOn('trklog')&&(!a||a.checked))tlgLoad();},3000);
  /* tab badalte hi us tab ka data turant aaye -- hash change par */
  window.addEventListener('hashchange',function(){
    if(trkOn('trkmap'))tmpLoad();
    if(trkOn('trklog'))tlgLoad();
    if(trkOn('trkdb')){
      trkLoad();                     /* handle dropdown taaza rahe */
      var t=document.getElementById('tdbTable');
      if(t&&!t.dataset.did){t.dataset.did='1';tdbGo(0);}}
    if(trkOn('tracker'))trkLoad();});
  if(trkOn('trklog'))tlgLoad();
  if(trkOn('trkmap'))tmpLoad();
  if(trkOn('trkdb')){document.getElementById('tdbTable').dataset.did='1';tdbGo(0);}
}
`;
}

module.exports = { section: section, script: script, WINS: WINS };
