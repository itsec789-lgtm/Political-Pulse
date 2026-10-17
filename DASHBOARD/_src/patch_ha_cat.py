# -*- coding: utf-8 -*-
"""Handle Analytics ka Category dropdown ab MAPPING ki Category se.

   PEHLE:
     /api/ha/cats  ->  handles collection par  { $group: { _id: '$level' } }
     Yaani wo LEVEL thi, Category nahi. Isliye list me MLA / LS MP / RS MP /
     Others / Chief Minister / MLC / MLA Contestent / Dy CM aate the --
     aur mapping ki asli Category (Top Leaders, NOB, Official Page,
     Media House, Journalist) kahin nahi thi. "Others (187)" bhi isi wajah
     se tha: jinka level nahi bana, wo sab ek jagah pad gaye.

   AB:
     Dono jagah -- list aur filter -- handle ki Category MAPPING se padhi
     jaati hai (handle_master.json), wahi jo card par dikhti hai. Ek hi
     sach, do jagah.

     Media House / Journalist ki rows 'handles' collection me hoti hi
     nahi (pipeline unhe chhod deti hai -- EXCLUDE_CAT). Unke liye
     mjAgg() se seedha Mongo ka jod le kar rows bana di jaati hain, taaki
     wo Category chunne par handle sach me dikhein.
"""
import io, os, shutil, sys

P = sys.argv[1] if len(sys.argv) > 1 else 'server.js'
s = io.open(P, encoding='utf-8').read(); n0 = len(s)
assert 'ha-cat (13-Oct)' not in s, 'ALREADY'
if not os.path.exists(P + '.bak_hacat'): shutil.copyfile(P, P + '.bak_hacat')

HELP = '''
/* ===== ha-cat (13-Oct): Handle Analytics ki Category bhi MAPPING se =====
   Pehle ye list 'handles' collection ke $level se banti thi -- yaani LEVEL,
   Category nahi. Ab mapping (handle_master.json) hi sach hai, bilkul waise
   hi jaise Dashboard ke card. */
function haCatOf(h) {
  try {
    var M = MAPL.load() || {};
    var k = String(h || '').trim().replace(/^@/, '');
    var rec = M[k];
    if (!rec) {
      var low = k.toLowerCase();
      var kk = Object.keys(M).find(function (x) { return x.toLowerCase() === low; });
      rec = kk ? M[kk] : null;
    }
    if (!rec) return '';
    var cs = Array.isArray(rec.categories) ? rec.categories : [];
    var c = cs.length ? cs[0] : (rec.category || '');
    c = String(c || '').trim();
    return (c && c !== '-') ? c : '';
  } catch (e) { return ''; }
}

/* Media House / Journalist ki rows 'handles' collection me hain hi nahi
   (pipeline unhe chhod deti hai). Unke liye mapping + Mongo ke jod se
   rows bana lete hain, taaki list khaali na mile. */
async function haExtraRows() {
  var out = [];
  try {
    var agg = await mjAgg();
    var M = MAPL.load() || {};
    Object.keys(M).forEach(function (k) {
      var rec = M[k] || {};
      if (rec.alias_of) return;
      var a = agg[String(k).toLowerCase()];
      if (!a) return;
      out.push({ _id: k, name: rec.name || k, party: rec.party || '',
                 state: rec.state || '', level: (rec.levels || [])[0] || '',
                 tweets: a.tw || 0, views: a.vw || 0, likes: 0, followers: 0 });
    });
  } catch (e) {}
  return out;
}
'''

A = "/* ---- 1. category list (+ kitne handle) ---- */"
assert s.count(A) == 1
s = s.replace(A, HELP + "\n/* ---- 1. category list (+ kitne handle) ---- */")

# ---- /api/ha/cats ----
A = """    var rows = await cli.db(haDb(req)).collection('handles').aggregate([
      { $group: { _id: '$level', n: { $sum: 1 }, tw: { $sum: '$tweets' } } },
      { $sort: { tw: -1 } }
    ]).toArray();
    res.json(rows.filter(function (r) { return r._id; })
                 .map(function (r) { return { cat: r._id, n: r.n, tw: r.tw || 0 }; }));"""
assert s.count(A) == 1
s = s.replace(A, """    /* ha-cat (13-Oct): pehle yahan Mongo me hi $group _id:'$level' hota tha.
       Ab rows la kar Category MAPPING se lagate hain -- wahi Category jo
       Dashboard ke card par dikhti hai. */
    var docs = await cli.db(haDb(req)).collection('handles')
      .find({}, { projection: { _id: 1, tweets: 1 } }).toArray();
    var extra = await haExtraRows();
    var seen = {};
    docs.forEach(function (d) { seen[String(d._id).toLowerCase()] = 1; });
    extra.forEach(function (d) {
      if (!seen[String(d._id).toLowerCase()]) docs.push({ _id: d._id, tweets: d.tweets });
    });
    var agg = {};
    docs.forEach(function (d) {
      var c = haCatOf(d._id);
      if (!c) return;                       /* mapping me nahi -> list me bhi nahi */
      var o = agg[c] || (agg[c] = { cat: c, n: 0, tw: 0 });
      o.n++; o.tw += (+d.tweets) || 0;
    });
    var out = Object.keys(agg).map(function (c) { return agg[c]; })
      .sort(function (a, b) { return b.tw - a.tw || b.n - a.n; });
    res.json(out);""")

# ---- /api/ha/handles ----
A = """  var find = {};
  if (cat && cat !== 'ALL') find.level = cat;"""
assert s.count(A) == 1
s = s.replace(A, """  /* ha-cat (13-Oct): pehle yahan find.level = cat lagta tha. Category ab
     mapping se aati hai, isliye chhantai Mongo me nahi -- rows aane ke
     baad haCatOf() se hoti hai (neeche). */
  var find = {};""")

A = """    var out = rows.map(function (r) {
      return haMap({ h: r._id, name: r.name || '', party: r.party || '', state: r.state || '',
               cat: r.level || '', pcName: r.pcName || '',
               tw: r.tweets || 0, vw: r.views || 0,
               lk: r.likes || 0, followers: r.followers || 0 });
    });"""
assert s.count(A) == 1
s = s.replace(A, """    /* ha-cat (13-Oct): Media House / Journalist ki rows is collection me
       hain hi nahi -- unhe mapping + Mongo ke jod se jod dete hain. */
    try {
      var _seen2 = {};
      rows.forEach(function (r) { _seen2[String(r._id).toLowerCase()] = 1; });
      (await haExtraRows()).forEach(function (r) {
        if (!_seen2[String(r._id).toLowerCase()]) rows.push(r);
      });
    } catch (e) {}
    /* Category se chhantai -- mapping ke hisaab se */
    if (cat && cat !== 'ALL') {
      rows = rows.filter(function (r) { return haCatOf(r._id) === cat; });
    }
    if (q) {
      var _rx = new RegExp(String(q).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
      rows = rows.filter(function (r) { return _rx.test(String(r._id)) || _rx.test(String(r.name || '')); });
    }
    var out = rows.map(function (r) {
      return haMap({ h: r._id, name: r.name || '', party: r.party || '', state: r.state || '',
               cat: haCatOf(r._id) || r.level || '', pcName: r.pcName || '',
               tw: r.tweets || 0, vw: r.views || 0,
               lk: r.likes || 0, followers: r.followers || 0 });
    });""")

# ---- haOwns: media/journalist handle bhi khul sake ----
A = """    var d = await cli.db(haDb(req)).collection('handles').findOne({ _id: handle });
    return d || null;"""
assert s.count(A) == 1
s = s.replace(A, """    var d = await cli.db(haDb(req)).collection('handles').findOne({ _id: handle });
    if (d) return d;
    /* ha-cat (13-Oct): Media House / Journalist is collection me nahi hote,
       par mapping me hain aur Mongo me unke tweet bhi. Unhe bhi khulne do. */
    var ex = (await haExtraRows()).filter(function (r) {
      return String(r._id).toLowerCase() === String(handle || '').toLowerCase(); })[0];
    return ex || null;""")

io.open(P, 'w', encoding='utf-8').write(s)
print('PATCHED %s  %d -> %d' % (P, n0, len(s)))
