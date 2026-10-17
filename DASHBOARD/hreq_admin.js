/* ===========================================================================
   hreq_admin.js  --  Admin Panel ka "Handle Requests" tab.

   Dashboard se aayi request yahan dikhti hai. Approve karne par wahi
   raasta chalta hai jo Handle Mapping tab ka hai: Mapping.xlsx me row ->
   rebuild_mapping.py --apply -> us handle ke roke hue tweet master_tweets
   me. Reject par kuch chhua nahi jaata, bas wajah user ko dikh jaati hai.
   =========================================================================== */
'use strict';

function section(onTab) {
  /* tab-merge : ab ye "Requests" tab ke neeche baithta hai, Login Requests
     ke saath. id apni hi rehti hai (uski JS usi se chalti hai); tab-switch
     data-sec dekhta hai. */
  return '<div class="sec' + (onTab === 'requests' ? ' on' : '')
  + '" data-sec="requests" id="sec-hreq">'
  + '<div class="pg-h" style="margin-top:6px">Handle Requests</div>'
  + '<div class="pg-s">Requests sent from the dashboard by users who want new handles tracked. '
  + 'Approving one writes the new handles into <code>Mapping.xlsx</code>, rebuilds the mapping, '
  + 'and releases any tweets that were being held for them.</div>'

  + '<div class="ad-card"><h2>Show <span id="hraCount" style="font-weight:400;color:#9A7A63;'
  + 'font-size:12px"></span></h2>'
  + '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">'
  + '<div><label>Status</label><select id="hraStatus" onchange="hraLoad()">'
  + '<option value="pending" selected>Pending review</option>'
  + '<option value="">Everything</option>'
  + '<option value="approved">Approved</option>'
  + '<option value="rejected">Rejected</option>'
  + '</select></div>'
  + '<button class="ad-btn" onclick="hraLoad()">Refresh</button>'
  + '</div></div>'

  + '<div id="hraList"><div class="ad-note">Loading\u2026</div></div>'
  + '</div>';
}

function script() {
  return `
/* ================= Handle Requests (admin) ================= */
var HRA_BUSY=false;

function hraEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function hraAgo(v){if(!v)return '';var t=Date.parse(v);if(!t)return '';
  var s=Math.max(0,(Date.now()-t)/1000);if(s<60)return 'just now';
  var m=Math.round(s/60);if(m<60)return m+' min ago';
  var h=Math.round(m/60);if(h<24)return h+' hr ago';
  var d=Math.round(h/24);return d+(d===1?' day ago':' days ago');}

function hraLoad(){
  var box=document.getElementById('hraList');if(!box)return;
  var st=(document.getElementById('hraStatus')||{}).value||'';
  fetch('/admin/hreq/list'+(st?('?status='+st):'')).then(function(r){return r.json();})
   .then(function(d){
     if(d.error){box.innerHTML='<div class="ad-err">'+hraEsc(d.error)+'</div>';return;}
     var rs=d.requests||[];
     var c=document.getElementById('hraCount');
     if(c)c.textContent=rs.length+' request'+(rs.length===1?'':'s');
     if(!rs.length){box.innerHTML='<div class="ad-card"><div class="ad-note">'
       +'Nothing here.</div></div>';return;}
     box.innerHTML=rs.map(hraCard).join('');})
   .catch(function(e){box.innerHTML='<div class="ad-err">'+hraEsc(String(e))+'</div>';});}

function hraCard(r){
  var rows=r.rows||[];
  var nNew=0,nHave=0,nBad=0;
  rows.forEach(function(x){
    if(x.missing&&x.missing.length)nBad++;else if(x.exists)nHave++;else nNew++;});

  var pill=r.status==='approved'
    ? '<span style="background:#DCF0E4;color:#19543A;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px">APPROVED</span>'
    : r.status==='rejected'
    ? '<span style="background:#FBDDD8;color:#7D2318;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px">REJECTED</span>'
    : '<span style="background:#FFF1D6;color:#8A5A12;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px">PENDING</span>';

  var h='<div class="ad-card" id="hra_'+hraEsc(r.id)+'">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
    +'<h2 style="margin:0">'+rows.length+' handle'+(rows.length===1?'':'s')
    +' <span style="font-weight:400;color:#9A7A63;font-size:12px">from '+hraEsc(r.by||'?')
    +' \\u00B7 '+hraAgo(r.at)+'</span></h2>'+pill+'</div>';

  h+='<div class="ad-note" style="margin-top:10px">'
    +'<b>'+nNew+'</b> new \\u00B7 <b>'+nHave+'</b> already in the mapping'
    +(nBad?' \\u00B7 <b style="color:#A83224">'+nBad+' incomplete</b>':'')
    +(r.scope?' \\u00B7 sent from the '+(r.scope==='up'?'UP':'All-India')+' dashboard':'')
    +'</div>';

  if(r.remarks)h+='<div class="ad-note" style="border-left-color:#1B6B45">'
    +'<b>User note:</b> '+hraEsc(r.remarks)+'</div>';

  /* admin-edit-ui : pending request ki har cell badli ja sakti hai --
     user aksar aadhi-adhuri ya galat spelling bhejta hai, aur usse wapas
     maangne se behtar hai yahin theek kar lena. */
  var edit=(r.status==='pending');
  function cell(x,col,ri){
    var v=x[col]||'';
    if(!edit)return hraEsc(v);
    return '<input data-req="'+hraEsc(r.id)+'" data-ri="'+ri+'" data-col="'+hraEsc(col)+'" '
      +'value="'+hraEsc(v)+'" style="width:100%;min-width:92px;font-size:11.5px;'
      +'padding:4px 6px;height:auto;min-height:0">';}

  h+='<div style="overflow-x:auto">'
    +'<table style="min-width:960px"><tr><th>HANDLE</th><th>VERDICT</th><th>CANDIDATE NAME *</th>'
    +'<th>CATEGORY *</th><th>PARTY</th><th>STATE</th><th>DESIGNATION</th>'
    +'<th>AC/PC NO</th><th>AC NAME</th><th>PC NAME</th></tr>'
    +rows.map(function(x,ri){
      var v=(x.missing&&x.missing.length)
        ?'<span style="color:#A83224">\\u2716 '+hraEsc(x.missing.join(', '))+'</span>'
        :(x.exists?'<span style="color:#A8761F">\\u25CF mapped</span>'
                  :'<span style="color:#1B6B45">\\u2714 new</span>');
      return '<tr><td style="white-space:nowrap">'
        +(edit?'<input data-req="'+hraEsc(r.id)+'" data-ri="'+ri+'" data-col="Handle" '
          +'value="'+hraEsc(x.handle||'')+'" style="width:140px;font-size:11.5px;padding:4px 6px;'
          +'height:auto;min-height:0">':('<b>@'+hraEsc(x.handle)+'</b>'))
        +'</td><td style="white-space:nowrap">'+v+'</td>'
        +'<td>'+cell(x,'Candidate Name',ri)+'</td>'
        +'<td>'+cell(x,'Category',ri)+'</td>'
        +'<td>'+cell(x,'Party',ri)+'</td>'
        +'<td>'+cell(x,'State',ri)+'</td>'
        +'<td>'+cell(x,'Designation',ri)+'</td>'
        +'<td>'+cell(x,'AC/PC No',ri)+'</td>'
        +'<td>'+cell(x,'AC Name',ri)+'</td>'
        +'<td>'+cell(x,'PC Name',ri)+'</td></tr>'
        +(x.exists?'<tr><td></td><td colspan="9" style="color:#8B6B55;font-size:11px;'
          +'white-space:normal">In the mapping right now: '+hraEsc(x.have||'\\u2014')+'</td></tr>':'');
    }).join('')+'</table></div>'
    +(edit?'<div class="ad-note">Every cell above can be edited. Fix whatever the user got '
      +'wrong, then Save edits or go straight to Approve \u2014 Approve always uses what is on '
      +'screen right now. Only <b>Candidate Name</b> and <b>Category</b> are required.</div>':'');

  if(r.status==='pending'){
    h+='<div style="margin-top:12px">'
      +'<label>Note for the user (optional for approve, please give a reason for reject)</label>'
      +'<input id="hran_'+hraEsc(r.id)+'" placeholder="what the user will see">'
      +'<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      +'<button class="ad-btn g" onclick="hraDecide(\\''+hraEsc(r.id)+'\\',\\'approve\\')">'
      +'\\u2714 Approve'+(nNew?(' and add '+nNew+' handle'+(nNew===1?'':'s')):'')+'</button>'
      +'<button class="ad-btn" onclick="hraSave(\\''+hraEsc(r.id)+'\\')">'
      +'Save edits</button>'
      +'<button class="ad-btn r" onclick="hraDecide(\\''+hraEsc(r.id)+'\\',\\'reject\\')">'
      +'\\u2716 Reject</button>'
      +'<span id="hram_'+hraEsc(r.id)+'" style="font-size:12px"></span></div>'
      +(nNew?'<div class="ad-note">Approving writes those '+nNew+' handle(s) into Mapping.xlsx '
        +'and rebuilds the mapping \\u2014 that takes up to a minute. Handles already in the '
        +'mapping are left alone.</div>'
        :'<div class="ad-note">Nothing new to add here \\u2014 every handle is already in the '
        +'mapping. Approving just tells the user it was looked at.</div>')
      +'</div>';
  }else{
    h+='<div class="ad-note">'
      +'<b>'+(r.status==='approved'?'Approved':'Rejected')+'</b>'
      +(r.decidedBy?' by '+hraEsc(r.decidedBy):'')
      +(r.decidedAt?' \\u00B7 '+hraAgo(r.decidedAt):'')
      +(r.adminNote?'<br>Note: '+hraEsc(r.adminNote):'')
      +(r.result&&r.result.added?'<br>'+r.result.added+' handle(s) added to the mapping.':'')
      +'</div>';}

  return h+'</div>';}

/* admin-edit-ui : screen par jo likha hai wahi uthao */
function hraRows(id){
  var ins=document.querySelectorAll('input[data-req="'+id+'"]');
  if(!ins.length)return null;
  var by={};
  Array.prototype.forEach.call(ins,function(i){
    var ri=i.dataset.ri;
    (by[ri]=by[ri]||{})[i.dataset.col]=String(i.value||'').trim();});
  return Object.keys(by).sort(function(a,b){return a-b;}).map(function(k){return by[k];});}

function hraSave(id){
  if(HRA_BUSY)return;
  var msg=document.getElementById('hram_'+id);
  var rows=hraRows(id);
  if(!rows||!rows.length){if(msg){msg.style.color='#A83224';
    msg.textContent='Nothing to save.';}return;}
  HRA_BUSY=true;
  if(msg){msg.style.color='#8B6B55';msg.textContent='Saving\u2026';}
  fetch('/admin/hreq/save',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:id,rows:rows})})
   .then(function(r){return r.json();}).then(function(r){
     if(msg){
       if(r.ok){msg.style.color='#1B6B45';msg.textContent='Edits saved';}
       else{msg.style.color='#A83224';msg.textContent=r.error||'failed';}}
     if(r.ok)setTimeout(hraLoad,700);})
   .catch(function(e){if(msg){msg.style.color='#A83224';msg.textContent=String(e);}})
   .then(function(){HRA_BUSY=false;});}

function hraDecide(id,act){
  if(HRA_BUSY)return;
  var msg=document.getElementById('hram_'+id);
  var note=(document.getElementById('hran_'+id)||{}).value||'';
  if(act==='reject'&&!note.trim()){
    if(msg){msg.style.color='#A83224';
      msg.textContent='Give a reason \\u2014 the user sees it.';}return;}
  if(act==='approve'&&!confirm('Approve this request?\\n\\n'
    +'New handles go into Mapping.xlsx, the mapping is rebuilt, and any tweets held '
    +'for them are released into the database.'))return;
  HRA_BUSY=true;
  if(msg){msg.style.color='#8B6B55';
    msg.textContent=(act==='approve'?'Writing to Mapping.xlsx and rebuilding\\u2026':'Saving\\u2026');}
  /* Approve hamesha SCREEN par jo hai wahi bhejta hai -- admin ne abhi
     jo sudhar kiya wo "Save edits" dabaye bina bhi lagna chahiye. */
  var rows=(act==='approve')?hraRows(id):null;
  fetch('/admin/hreq/decide',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(rows?{id:id,action:act,note:note,rows:rows}
                             :{id:id,action:act,note:note})})
   .then(function(r){return r.json();}).then(function(r){
     if(msg){
       if(r.ok){msg.style.color='#1B6B45';
         msg.textContent=(r.status==='approved'
           ?('Approved \\u2014 '+(r.added||0)+' handle(s) added'):'Rejected');}
       else{msg.style.color='#A83224';msg.textContent=r.error||'failed';}}
     setTimeout(hraLoad,900);})
   .catch(function(e){if(msg){msg.style.color='#A83224';msg.textContent=String(e);}})
   .then(function(){HRA_BUSY=false;});}

if(document.getElementById('sec-hreq')){
  hraLoad();
  window.addEventListener('hashchange',function(){
    var e=document.getElementById('sec-hreq');
    if(e&&e.classList.contains('on'))hraLoad();});
}
`;
}

module.exports = { section: section, script: script };
