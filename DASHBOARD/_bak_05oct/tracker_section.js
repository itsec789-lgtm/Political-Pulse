/* Admin Panel ka Tracker tab -- ye string server.js me jaayegi.
   Alag file me likha taaki server.js patch chhota rahe aur isko test kiya ja sake. */
'use strict';

function section(onTab) {
  return '<div class="sec' + (onTab === 'tracker' ? ' on' : '') + '" id="sec-tracker">'
  + '<div class="pg-h">Handle Tracker</div>'
  + '<div class="pg-s">X se handle scrape karke seedha <code>pulse_master.master_tweets</code> me '
  + 'daalta hai — wahi merge rules jo pipeline use karta hai. Isliye yahan se aaya data dono '
  + 'dashboard aur Handle Analytics me waise hi dikhta hai.</div>'

  /* ---- 1. handle jodo ---- */
  + '<div class="ad-card"><h2>Naya handle jodo</h2>'
  + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'
  + '<div style="flex:1;min-width:260px"><label>Handle (comma se kai saare)</label>'
  + '<input id="trkIn" placeholder="@handle1, @handle2 ya poora x.com link"></div>'
  + '<button class="ad-btn g" onclick="trkAdd()">+ Handle jodo</button></div>'
  + '<div class="ad-note">@ lagao ya na lagao, dono chalta hai. Poora link bhi chipka sakte ho.</div>'
  + '</div>'

  /* ---- 2. settings + chalao ---- */
  + '<div class="ad-card"><h2>Scraper settings</h2>'
  + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">'
  + '<div><label>Kitna peeche tak</label><select id="trkWin">'
  + '<option value="24">Aaj (24 ghante)</option>'
  + '<option value="72" selected>Pichhle 3 din</option>'
  + '<option value="168">Pichhle 7 din</option>'
  + '<option value="360">Pichhle 15 din</option>'
  + '<option value="720">Pichhle 30 din</option>'
  + '</select></div>'
  + '<div><label>Har kitni der me</label><select id="trkInt">'
  + '<option value="5">5 minute</option><option value="15">15 minute</option>'
  + '<option value="30" selected>30 minute</option><option value="60">1 ghanta</option>'
  + '<option value="180">3 ghante</option><option value="360">6 ghante</option>'
  + '<option value="1440">Roz ek baar</option>'
  + '</select></div>'
  + '<div><label>Ek handle ki kitni page</label><select id="trkPg">'
  + '<option value="2">2 (tez)</option><option value="4" selected>4</option>'
  + '<option value="8">8</option><option value="15">15 (gehra)</option>'
  + '</select></div>'
  + '<button class="ad-btn" onclick="trkSave()">Settings save</button>'
  + '<button class="ad-btn g" id="trkRunBtn" onclick="trkRun()">\u25B6 Abhi scrape karo</button>'
  + '<button class="ad-btn r" onclick="trkStop()">\u23F9 Roko</button>'
  + '</div>'
  + '<div class="ad-note">Settings sab tracked handle par lagti hain. Server chalu hote hi '
  + 'scraper apne aap background me chalta rehta hai.</div>'
  + '</div>'

  /* ---- 3. haal ---- */
  + '<div class="ad-card"><h2>Haal</h2><div id="trkStatus" class="ad-note">Load ho raha hai\u2026</div>'
  + '<div id="trkBar" style="height:6px;background:#EADFD2;border-radius:4px;overflow:hidden;'
  + 'margin-top:10px;display:none"><div id="trkBarIn" style="height:100%;width:0;background:#1B6B45;'
  + 'transition:width .4s"></div></div></div>'

  /* ---- 4. tracked handles ---- */
  + '<div class="ad-card"><h2>Tracked accounts <span id="trkCount" style="font-weight:400;'
  + 'color:#9A7A63;font-size:12px"></span></h2>'
  + '<div id="trkTable"></div></div>'

  /* ---- 5. log ---- */
  + '<div class="ad-card"><h2>Scrape log</h2>'
  + '<div id="trkLog" style="background:#1A120C;color:#9FE3BE;border-radius:8px;padding:12px;'
  + 'font-family:Consolas,Menlo,monospace;font-size:11.5px;max-height:320px;overflow:auto;'
  + 'line-height:1.6">\u2014</div></div>'

  + '</div>';
}

/* Tracker tab ki JS -- adminPage ke <script> me jaati hai */
function script() {
  return "\n/* ---- Handle Tracker ---- */\n"
  + "var TRK_T=null;\n"
  + "function trkEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')"
  + ".replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}\n"
  + "function trkNum(n){return (Number(n)||0).toLocaleString('en-IN');}\n"
  + "function trkAgo(v){if(!v)return '\\u2014';var t=Date.parse(v);if(!t)return '\\u2014';"
  + "var s=Math.max(0,(Date.now()-t)/1000);if(s<60)return 'abhi';var m=Math.round(s/60);"
  + "if(m<60)return m+' min pehle';var h=Math.round(m/60);if(h<24)return h+' ghante pehle';"
  + "return Math.round(h/24)+' din pehle';}\n"
  + "function trkApi(p,o){return fetch(p,o||{}).then(function(r){return r.json();});}\n"

  + "function trkAdd(){var v=document.getElementById('trkIn').value.trim();if(!v)return;\n"
  + "  trkApi('/admin/tracker/add',{method:'POST',headers:{'Content-Type':'application/json'},\n"
  + "    body:JSON.stringify({handles:v})}).then(function(r){\n"
  + "      document.getElementById('trkIn').value='';trkLoad();});}\n"

  + "function trkSave(){trkApi('/admin/tracker/cfg',{method:'POST',\n"
  + "  headers:{'Content-Type':'application/json'},body:JSON.stringify({\n"
  + "    windowHours:document.getElementById('trkWin').value,\n"
  + "    intervalMin:document.getElementById('trkInt').value,\n"
  + "    maxPages:document.getElementById('trkPg').value})}).then(trkLoad);}\n"

  + "function trkRun(){var b=document.getElementById('trkRunBtn');b.disabled=true;\n"
  + "  b.textContent='\\u23F3 Chal raha hai\\u2026';\n"
  + "  trkApi('/admin/tracker/run',{method:'POST'}).then(function(){trkLoad();}).catch(function(){})\n"
  + "   .then(function(){b.disabled=false;b.textContent='\\u25B6 Abhi scrape karo';});}\n"

  + "function trkStop(){trkApi('/admin/tracker/stop',{method:'POST'}).then(trkLoad);}\n"
  + "function trkToggle(h,a){trkApi('/admin/tracker/toggle',{method:'POST',\n"
  + "  headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:h,active:a})}).then(trkLoad);}\n"
  + "function trkDel(h){if(!confirm('@'+h+' ko list se hata dein?\\n\\nUske tweets database me rahenge, "
  + "bas aage scrape nahi hoga.'))return;\n"
  + "  trkApi('/admin/tracker/remove',{method:'POST',headers:{'Content-Type':'application/json'},\n"
  + "    body:JSON.stringify({handle:h})}).then(trkLoad);}\n"

  + "function trkLoad(){trkApi('/admin/tracker/state').then(trkPaint).catch(function(e){\n"
  + "  var el=document.getElementById('trkStatus');if(el)el.textContent='Load nahi hua: '+e;});}\n"

  + "function trkPaint(d){\n"
  + "  var st=d.status||{},cfg=d.cfg||{},hs=d.handles||[],lg=d.logs||[];\n"
  + "  var w=document.getElementById('trkWin');if(w&&cfg.windowHours)w.value=String(cfg.windowHours);\n"
  + "  var iv=document.getElementById('trkInt');if(iv&&cfg.intervalMin)iv.value=String(cfg.intervalMin);\n"
  + "  var pg=document.getElementById('trkPg');if(pg&&cfg.maxPages)pg.value=String(cfg.maxPages);\n"
  + "  var s='';\n"
  + "  if(!st.cookieOk){s='<b style=\"color:#A83224\">\\u2716 Cookie nahi mili</b> \\u2014 '\n"
  + "    +'DASHBOARD\\\\x_config.json me auth_token, ct0, twid bharo. Uske bina scrape nahi hoga.';}\n"
  + "  else if(st.running){s='<b style=\"color:#1B6B45\">\\u25CF Chal raha hai</b> \\u2014 '\n"
  + "    +trkEsc(st.current||'')+' ('+st.done+'/'+st.total+')';}\n"
  + "  else{var r=st.lastResult||{};\n"
  + "    if(r.ok){s='<b style=\"color:#1B6B45\">\\u2714 Pichhli baar poora hua</b> \\u2014 '\n"
  + "      +'<b>'+trkNum(r.newCount)+'</b> naye, <b>'+trkNum(r.updatedCount)+'</b> update, '\n"
  + "      +trkNum(r.handles)+' handle'+(r.errors?', <b style=\"color:#A83224\">'+r.errors+' error</b>':'')\n"
  + "      +' \\u2014 '+trkAgo(r.at)+' ('+Math.round((r.ms||0)/1000)+'s)';}\n"
  + "    else if(r.error){s='<b style=\"color:#A83224\">\\u2716 Pichhli baar fail</b> \\u2014 '+trkEsc(r.error);}\n"
  + "    else{s='<b>Abhi tak koi scrape nahi hua</b>';}\n"
  + "    if(st.nextAt)s+=' \\u00B7 agla '+Math.max(0,Math.round((st.nextAt-Date.now())/60000))+' min me';}\n"
  + "  document.getElementById('trkStatus').innerHTML=s;\n"
  + "  var bar=document.getElementById('trkBar');\n"
  + "  if(st.running&&st.total){bar.style.display='block';\n"
  + "    document.getElementById('trkBarIn').style.width=Math.round(st.done*100/st.total)+'%';}\n"
  + "  else bar.style.display='none';\n"

  + "  document.getElementById('trkCount').textContent=hs.length+' tracked';\n"
  + "  document.getElementById('trkTable').innerHTML=hs.length?('<table><tr><th>Handle</th>'\n"
  + "    +'<th>Naam</th><th>Haal</th><th>Tweets</th><th>Aakhri scrape</th><th></th></tr>'\n"
  + "    +hs.map(function(h){var on=h.active!==false;\n"
  + "      return '<tr><td><b>@'+trkEsc(h._id)+'</b></td><td>'+trkEsc(h.name||'')+'</td>'\n"
  + "      +'<td>'+(on?'<span style=\"color:#1B6B45\">'+trkEsc(h.status||'Active')+'</span>'\n"
  + "              :'<span style=\"color:#A8761F\">Roka hua</span>')+'</td>'\n"
  + "      +'<td>'+trkNum(h.tweets)+'</td><td>'+trkAgo(h.lastRun)+'</td>'\n"
  + "      +'<td style=\"white-space:nowrap\">'\n"
  + "      +'<button class=\"ad-btn s\" onclick=\"trkToggle(\\''+trkEsc(h._id)+'\\','+(!on)+')\">'\n"
  + "      +(on?'Roko':'Chalao')+'</button> '\n"
  + "      +'<button class=\"ad-btn s r\" onclick=\"trkDel(\\''+trkEsc(h._id)+'\\')\">Hatao</button>'\n"
  + "      +'</td></tr>';}).join('')+'</table>')\n"
  + "    :'<div class=\"ad-note\">Abhi koi handle nahi. Upar se jodo.</div>';\n"

  + "  document.getElementById('trkLog').innerHTML=lg.length?lg.map(function(l){\n"
  + "    var c=l.k==='err'?'#F0908A':(l.k==='warn'?'#E8C27A':'#9FE3BE');\n"
  + "    return '<div style=\"color:'+c+'\"><span style=\"color:#7A6A5C\">'\n"
  + "      +trkEsc(String(l.t).slice(11,19))+'</span> '+trkEsc(l.m)+'</div>';}).join('')\n"
  + "    :'\\u2014';\n"
  + "}\n"

  + "if(document.getElementById('sec-tracker')){trkLoad();\n"
  + "  TRK_T=setInterval(function(){if(!document.hidden&&\n"
  + "    document.getElementById('sec-tracker').classList.contains('on'))trkLoad();},5000);}\n";
}

module.exports = { section: section, script: script };
