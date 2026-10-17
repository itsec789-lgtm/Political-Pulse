/* t_maptbl.js -- teen shikayaton ka test
   1. Mapping se handle hatao -> dashboard ki har table se jaaye
   2. Jis range me kuch post nahi hua, wo row table me na dikhe
   3. Avg columns me NaN kabhi na aaye (0 tweet par 0/0) */
'use strict';
var fs = require('fs');
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var SRV = fs.readFileSync('./server.js', 'utf8');
var UPD = fs.readFileSync('./update_dashboard.py', 'utf8');
var UUPD = fs.readFileSync('../UP-DASHBOARD/update_dashboard.py', 'utf8');
var TPL = fs.readFileSync('./dashboard.template.html', 'utf8');
var UTPL = fs.readFileSync('../UP-DASHBOARD/dashboard.template.html', 'utf8');
var MAPL = require('./mapping_lib.js');

/* ---------- 1. NaN ---------- */
sec('1. Avg columns me NaN nahi');
var pp = new Function((TPL.match(/function perPost\(total,count\)\{[\s\S]*?\}/) || [''])[0]
  + '; return perPost;')();
ok(typeof pp === 'function', 'perPost() template me hai');
ok(pp(0, 0) === 0, '0 tweet par 0 (pehle NaN aata tha): ' + pp(0, 0));
ok(pp(100, 0) === 0, 'views hon par tweet 0 -> 0');
ok(pp(1000, 4) === 250, 'seedha hisaab: ' + pp(1000, 4));
ok(pp(null, null) === 0, 'khaali value par 0');
ok(pp(5, -3) === 0, 'ulta count par 0');
ok(!isNaN(pp(0, 0)) && !isNaN(pp('x', 'y')), 'kabhi NaN nahi lautata');
ok(isFinite(pp(9, 0)), 'Infinity bhi nahi');

[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(/const avgVw=perPost\(h\.vw,h\.tw\),avgLk=perPost\(h\.lk,h\.tw\)/.test(t),
     n + ': Top Leaders ki row perPost use karti hai');
  /* jo bache hain wo sab 'h.tw>0?' se guarded hain -- bina guard wala ek bhi na ho */
  var bare = (t.match(/Math\.round\(h\.vw\/h\.tw\)/g) || []).length;
  var grd  = (t.match(/h\.tw>0\?Math\.round\(h\.vw\/h\.tw\)/g) || []).length;
  ok(bare === grd, n + ': bina-guard wala purana hisaab ek bhi nahi (kul ' + bare + ', guarded ' + grd + ')');
  ok(!/Math\.round\(u\.vw\/u\.tw\)/.test(t), n + ': chart wala bhi hat gaya');
});

/* ---------- 2. khaali row ---------- */
sec('2. Jis range me post nahi, wo row chhant jaati hai');
var ao = new Function((TPL.match(/function activeOnly\(rows\)\{[\s\S]*?\n\}/) || [''])[0]
  + '; return activeOnly;')();
ok(typeof ao === 'function', 'activeOnly() template me hai');
var r1 = ao([{ h: 'a', tw: 5, vw: 90 }, { h: 'b', tw: 0, vw: 0, lk: 0, rt: 0 },
             { h: 'c', tw: 0, vw: 0, lk: 0, rt: 0 }]);
ok(r1.rows.length === 1 && r1.rows[0].h === 'a', 'sirf active handle bacha');
ok(r1.hidden === 2, 'do chhante gaye: ' + r1.hidden);
var r2 = ao([{ h: 'a', tweets: 0, views: 0, likes: 3, rts: 0 }]);
ok(r2.rows.length === 1, 'sirf like hon to bhi row rehti hai (galti se na chhante)');
var r3 = ao([{ h: 'a', tweets: 2, views: 0 }]);
ok(r3.rows.length === 1, 'dusre naam wale field (tweets/views) bhi padhe jaate hain');
var r4 = ao([]);
ok(r4.rows.length === 0 && r4.hidden === 0, 'khaali list par crash nahi');

var en = new Function((TPL.match(/function emptyNote\(hidden,cols\)\{[\s\S]*?\n\}/) || [''])[0]
  + '; return emptyNote;')();
ok(en(0, 13) === '', 'kuch na chhante to koi line nahi');
ok(/colspan="13"/.test(en(3, 13)), 'line poori chaudai leti hai');
ok(/3 handles hidden/.test(en(3, 13)), 'ginti likhi hai: ' + en(3, 13).replace(/<[^>]*>/g, '').trim());
ok(/1 handle hidden/.test(en(1, 13)), 'ek ke liye ekvachan');
ok(/no posts in the selected date range/.test(en(2, 13)), 'wajah bhi likhi hai');
ok(!/[ऀ-ॿ]/.test(en(2, 13)), 'line English me hai');

[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  /* renderLeaders baad me dobara likhi gayi (leaderPool + mergeCase + LEAD_N).
     Donon shakal theek hain -- shart sirf itni ki khaali row chhantti ho. */
  ok(/activeOnly\(rows\)\.rows|var _ao=activeOnly\(rows\);rows=_ao\.rows;/.test(t),
     n + ': Top Leaders table khaali row chhantti hai');
  ok(/var _ao=activeOnly\(all\);all=_ao\.rows;/.test(t), n + ': legislators table chhantti hai');
  ok(/window\._tblHidden=_ao\.hidden/.test(t), n + ': main table bhi chhantti hai');
  ok(/emptyNote\(_ao\.hidden,13\)|Only '\+rows\.length\+' handle/.test(t),
     n + ': Top Leaders bata deta hai ki kitne hi bache');
  ok(/emptyNote\(window\._tblHidden\|\|0,13\)/.test(t), n + ': main table ginti dikhata hai');
  ok(/No handle posted anything in this date range/.test(t), n + ': sab khaali hon to saaf message');
});

/* ---------- 3. mapping gate ---------- */
sec('3. Mapping se hataya handle dashboard se bhi jaata hai');
ok(/function mapGate\(map\)/.test(SRV), 'server.js me mapGate()');
ok(/function removedSet\(\)/.test(SRV), 'server.js me removedSet() (hataye gaye handle ki list)');
var GATE_SRC = (SRV.match(/var REMOVED_FILE =[\s\S]*?\n\}\n\n/) || [''])[0]
             + (SRV.match(/function mapGate\(map\) \{[\s\S]*?\n\}\n/) || [''])[0];
function mkGate(mapl, removed) {
  var fakeFs = {
    statSync: function () { return { mtimeMs: 1 }; },
    readFileSync: function () { return JSON.stringify({ handles: removed }); }
  };
  return new Function('MAPL', 'console', 'fs', 'path', '__dirname',
    GATE_SRC + '; return mapGate;')(mapl, { warn: function () {}, log: function () {} },
    fakeFs, { join: function () { return 'x'; } }, '.');
}
var mapGate = mkGate(MAPL, ['ek_hataya_hua_handle']);

var map = {
  HANDLES: [{ h: 'narendramodi', vw: 9 }, { h: 'ek_hataya_hua_handle', vw: 5 }],
  PARTY_HANDLES: [{ h: 'narendramodi' }, { h: 'ek_hataya_hua_handle' }],
  MLA_DATA: [{ h: 'narendramodi' }, { h: 'ek_hataya_hua_handle' }],
  /* CM_DATA ab sirf CM/Dy CM rakhta hai (mapping se), isliye yahan ek asli CM */
  CM_DATA: [{ handle: 'myogiadityanath' }, { handle: 'ek_hataya_hua_handle' }],
  UNI: { allHandles: [{ h: 'narendramodi' }, { h: 'ek_hataya_hua_handle' }] },
  PHD: { narendramodi: { t: [1] }, ek_hataya_hua_handle: { t: [1] } },
  HROLE: { narendramodi: 'PM', ek_hataya_hua_handle: 'X' },
  GROWTH: { H: { narendramodi: {}, ek_hataya_hua_handle: {} } }
};
var g = mapGate(map);
ok(g.on === true, 'gate chala (mapping padhi gayi)');
ok(map.HANDLES.length === 1 && map.HANDLES[0].h === 'narendramodi', 'HANDLES se hata');
ok(map.PARTY_HANDLES.length === 1, 'PARTY_HANDLES se hata');
ok(map.MLA_DATA.length === 1, 'MLA_DATA se hata');
ok(!map.CM_DATA.some(function (r) { return r.handle === 'ek_hataya_hua_handle'; })
   && map.CM_DATA.some(function (r) { return r.handle === 'myogiadityanath'; }),
   'CM_DATA se hata (yahan key "handle" hai), asli CM bacha');
ok(map.UNI.allHandles.length === 1, 'UNI.allHandles se hata');
ok(!map.PHD.ek_hataya_hua_handle && !!map.PHD.narendramodi, 'PHD (per-din data) se bhi hata');
ok(!map.HROLE.ek_hataya_hua_handle, 'HROLE se hata');
ok(!map.GROWTH.H.ek_hataya_hua_handle, 'GROWTH se hata');
ok(g.dropped === 1 && g.names[0] === 'ek_hataya_hua_handle', 'log me naam bhi aata hai: ' + g.names);

/* @ aur case */
var m2 = { HANDLES: [{ h: '@myogiadityanath' }, { h: '@Koi_Bhi_Nahi_123' }] };
mkGate(MAPL, ['koi_bhi_nahi_123'])(m2);
ok(m2.HANDLES.length === 1 && m2.HANDLES[0].h === '@myogiadityanath',
   '@ aur chhota-bada akshar dono chalte hain (list me chhote akshar, handle me bade)');

/* safety: mapping na mile to kuch na chhante */
var fakeMapl = { stats: function () { return { handles: 0, error: 'nahi mili' }; },
                 has: function () { return false; } };
var m3 = { HANDLES: [{ h: 'a' }, { h: 'b' }] };
var g3 = mkGate(fakeMapl, ['a', 'b'])(m3);
ok(g3.on === false, 'mapping na mile to gate band');
ok(m3.HANDLES.length === 2, 'aur ek bhi handle nahi chhanta (dashboard khaali nahi hota)');

sec('3a. Handle hatao to JOD bhi dobara bane  <-- KPI aur note alag dikh rahe the');
/* KPI "Total Tweets" PHD se banta hai (jo gate ke baad chhant jaata hai),
   par neeche ka note UNI.tot se. Pehle UNI.tot ko haath nahi lagaya jaata
   tha, isliye KPI 20,21,948 aur note 20,39,825 dikhate the. */
var mT = {
  UNI: {
    tot: { tw: 1000, vw: 5000, lk: 300, rt: 200, cm: 0, bm: 0 },
    allHandles: [
      { h: 'myogiadityanath', tw: 600, vw: 3000, lk: 200, rt: 150 },
      { h: 'ye_hataya_gaya',  tw: 400, vw: 2000, lk: 100, rt: 50 }
    ]
  },
  PHD: { myogiadityanath: { t: [600] }, ye_hataya_gaya: { t: [400] } }
};
mkGate(MAPL, ['ye_hataya_gaya'])(mT);
ok(mT.UNI.allHandles.length === 1, 'hataya hua handle nikal gaya');
ok(!mT.PHD.ye_hataya_gaya, 'uska per-din data bhi nikla');
ok(mT.UNI.tot.tw === 600, 'kul tweet dobara gina gaya: ' + mT.UNI.tot.tw + ' (pehle 1000 hi rehta tha)');
ok(mT.UNI.tot.vw === 3000 && mT.UNI.tot.lk === 200 && mT.UNI.tot.rt === 150,
   'views/likes/retweets bhi dobara gine gaye');
var phdSum = 0;
Object.keys(mT.PHD).forEach(function (k) { (mT.PHD[k].t || []).forEach(function (x) { phdSum += x; }); });
ok(phdSum === mT.UNI.tot.tw,
   'KPI (PHD ka jod) aur note (UNI.tot) ab BARABAR: ' + phdSum + ' = ' + mT.UNI.tot.tw);

/* kuch na hate to jod waisa ka waisa */
var mT2 = {
  UNI: { tot: { tw: 1000, vw: 5000 },
         allHandles: [{ h: 'myogiadityanath', tw: 600, vw: 3000 },
                      { h: 'kabhi_mapping_me_tha_hi_nahi', tw: 400, vw: 2000 }] },
  PHD: {}
};
/* 10-Oct: ab jo mapping me nahi hai wo bhi hat jaata hai, isliye yahan
   bhi jod dobara banta hai (400 wala handle nikal gaya). */
mkGate(MAPL, [])(mT2);
ok(mT2.UNI.tot.tw === 600,
   'mapping me na hone wala handle nikla, jod dobara bana: ' + mT2.UNI.tot.tw);
ok(mT2.UNI.allHandles.length === 1, 'sirf mapping wala handle bacha');

sec('3b. MAPPING HI SACH -- jo usme nahi, wo dashboard par bhi nahi (10-Oct)');
var m4 = {
  HANDLES: [{ h: 'narendramodi' }, { h: 'kabhi_mapping_me_tha_hi_nahi' },
            { h: 'ye_jaan_boojhkar_hataya' }]
};
var g4 = mkGate(MAPL, ['ye_jaan_boojhkar_hataya'])(m4);
var left = m4.HANDLES.map(function (x) { return x.h; });
/* is nakli MAPL me Modi hain, isliye bache; asli mapping me bhi ab hain */
ok(left.indexOf('narendramodi') >= 0, 'mapping me hai to bacha (Modi)');
ok(left.indexOf('kabhi_mapping_me_tha_hi_nahi') < 0,
   'mapping me nahi -> ab hat jaata hai (pehle bach jaata tha)');
ok(left.indexOf('ye_jaan_boojhkar_hataya') < 0, 'jaanbujhkar hataya gaya bhi nikla');
ok(g4.dropped === 2, 'dono hataye gaye: ' + g4.dropped);

/* wapas mapping me aa jaaye to list me hone par bhi dikhe */
var m5 = { HANDLES: [{ h: 'myogiadityanath' }] };
mkGate(MAPL, ['myogiadityanath'])(m5);
ok(m5.HANDLES.length === 1,
   'list me hone par bhi, mapping me wapas aa gaya to dikhta hai');

ok(/var _gate = mapGate\(map\);/.test(SRV), 'buildHtml me gate laga hai');
ok(SRV.indexOf('var _gate = mapGate(map);') > SRV.indexOf("map['PHD'] = PHD;"),
   'gate PHD banne ke BAAD chalta hai (warna PHD chhoot jaata)');

sec('4. Rebuild (update_dashboard.py) par bhi wahi niyam');
ok(/def map_gate\(acc, meta, daily\)/.test(UPD), 'map_gate() hai');
ok(/acc, meta, daily = map_gate\(acc, meta, daily\)/.test(UPD), 'build() me chalta hai');
ok(/len\(m\) < 100/.test(UPD), 'mapping chhoti ho to filter nahi lagta');
ok(/mapping_removed\.json/.test(UPD), 'pipeline bhi hataye gaye handle ki list padhta hai');
ok(/if not removed:/.test(UPD), 'list khaali ho to kuch nahi chhanta');
ok(/return \(h in low\) or \(h not in removed\)/.test(UPD),
   'pipeline me bhi: mapping me ho YA hataya gaya na ho -> rehne do');
ok(/daily = \{k: v for k, v in daily\.items\(\) if keep\(k\[0\]\)\}/.test(UPD),
   'per-din data bhi chhantta hai');
ok(/def map_gate\(acc, meta, daily\)/.test(UUPD), 'UP wali file me bhi map_gate()');
ok(/acc, meta, daily = map_gate\(acc, meta, daily\)/.test(UUPD), 'UP build() me bhi chalta hai');


sec('5. Top Performers: chhoti range par bhi log dikhein');
var TPL2 = TPL;
ok(!/avg:tw>=10\?/.test(TPL2), "pehle wali 'kam se kam 10 tweet' wali shart hat gayi");
ok(/var minTw=Math\.max\(1,Math\.min\(10,Math\.ceil\(idx\.length\/3\)\)\)/.test(TPL2),
   'shart ab range ke hisaab se banti hai');
var minTw = function (days) { return Math.max(1, Math.min(10, Math.ceil(days / 3))); };
ok(minTw(3) === 1, '3 din par sirf 1 tweet kaafi: ' + minTw(3));
ok(minTw(7) === 3, '7 din par 3: ' + minTw(7));
ok(minTw(30) === 10, '30 din par 10: ' + minTw(30));
ok(minTw(180) === 10, 'poori range par bhi 10 se zyada nahi: ' + minTw(180));
ok(minTw(1) === 1, '1 din par bhi 1 (0 kabhi nahi)');
ok(/avg:tw>=minTw\?perPost\(vw,tw\)/.test(TPL2), 'yahan bhi perPost (NaN nahi)');

sec('6. FROM / TO sirf Custom par');
[['All-India', TPL], ['UP', UTPL]].forEach(function (x) {
  var n = x[0], t = x[1];
  ok(/date-ui :/.test(t), n + ': date-ui laga hai');
  ok(/\[data-dhide\]\{display:none !important\}/.test(t), n + ': chhipane wali css');
  ok(/String\(p\.sel\.value\|\|''\)==='custom'/.test(t), n + ": sirf 'custom' par dikhta hai");
  ok(/if\(!sel\)continue;/.test(t), n + ': jahan QUICK hi nahi, wahan date hamesha dikhegi');
  ok(/classList\.contains\('filter-label'\)/.test(t), n + ': FROM/TO ka label bhi saath chhipta hai');
  ok(/addEventListener\('click'/.test(t), n + ': Reset/Today button ke baad bhi theek ho jaata hai');
});

console.log('\n========================================================');
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================================');
process.exit(F ? 1 : 0);
