# -*- coding: utf-8 -*-
"""Media House / Journalist ke card par 0 kyon tha -- aur uska ilaaj.

   ASLI WAJAH (andaaza nahi, code me likhi hui hai):
     update_dashboard.py line ~204 --
        # SIRF media house / journalist bahar (reports me rahenge).
        ch = ch[~ch[C['cat']].str.lower().isin(EXCLUDE_CAT)]
        EXCLUDE_CAT = {'media house', 'journalist'}
     Yaani Mongo me unke tweet HAIN, par pipeline unhe jaan-boojhkar
     chhaant deti hai -- taaki party/state ke chart aur "political" ke
     jod me news channel ka bada volume na mile. Isliye wo roster
     (UNI.allHandles) me aate hi nahi, aur card par 0 dikhta tha.

   AB:
     Server page banate waqt SIRF in handle ke liye Mongo se seedha jod
     le leta hai (Category = Media House / Journalist, handle ke hisaab
     se tweets aur views). Ye jod SIRF card par lagta hai --
     UNI.allHandles, party/state ke chart, grand total: kisi ko haath
     nahi lagta. Yaani pipeline ka faisla waisa ka waisa, par card ab
     sach bolta hai.

     Niyam aam hai, in do Category tak hi seemit nahi: mapping ka jo bhi
     handle roster me nahi hai par Mongo me uske tweet hain, uski ginti
     uski Category ke card par aa jaayegi.
"""
import io, os, shutil

P = os.environ.get('SRV', 'server.js')
s = io.open(P, encoding='utf-8').read(); n0 = len(s)
assert 'mj-agg (13-Oct)' not in s, 'ALREADY'
if not os.path.exists(P + '.bak_mj'): shutil.copyfile(P, P + '.bak_mj')

# ---- 1. per-handle jod (10 min cache) ----
A = """// media/journalist ka count (pulse_master se) - KPI note ke liye. 10 min cache."""
assert s.count(A) == 1
s = s.replace(A, """/* ===== mj-agg (13-Oct): un handle ka per-handle jod jo pipeline ne
   chhoda hua hai (Media House / Journalist).
   update_dashboard.py me EXCLUDE_CAT = {'media house','journalist'} hai --
   unke tweet Mongo me hain par roster me nahi aate, isliye card par 0
   dikhta tha. Yahan se SIRF card ke liye ginti laate hain; roster,
   chart aur grand total ko haath nahi lagta. */
var _mjaCache = { t: 0, v: null };
async function mjAgg() {
  if (_mjaCache.v && Date.now() - _mjaCache.t < 600000) return _mjaCache.v;
  var out = {};
  try {
    var cl = MP.client(); await cl.connect();
    var rows = await cl.db('pulse_master').collection('master_tweets').aggregate([
      { $match: { Category: { $in: ['Media House', 'Journalist'] } } },
      { $group: {
          _id: '$Handle',
          tw: { $sum: 1 },
          vw: { $sum: { $convert: { input: '$Total Views', to: 'long', onError: 0, onNull: 0 } } }
      } }
    ], { allowDiskUse: true }).toArray();
    await cl.close();
    rows.forEach(function (r) {
      var h = String(r._id == null ? '' : r._id).trim().replace(/^@/, '').toLowerCase();
      if (!h) return;
      out[h] = { tw: (+r.tw) || 0, vw: (+r.vw) || 0 };
    });
    _mjaCache = { t: Date.now(), v: out };
    console.log('  mj-agg: ' + Object.keys(out).length + ' media/journalist handle ka jod aaya');
  } catch (e) {
    console.log('  (mj-agg skip: ' + e.message + ')');
    return _mjaCache.v || {};
  }
  return out;
}

// media/journalist ka count (pulse_master se) - KPI note ke liye. 10 min cache.""")

# ---- 2. page banate waqt map me rakh do ----
A = """  map['PHD'] = PHD;"""
assert s.count(A) == 1
s = s.replace(A, """  map['PHD'] = PHD;
  /* mj-agg (13-Oct): mapGate ise padhta hai (neeche catStats me) */
  try { map['MJAGG'] = await mjAgg(); } catch (e) { map['MJAGG'] = {}; }""")

# ---- 3. catStats me joddo ----
A = """      map.UNI.allHandles.forEach(function (r) {
        var cs = (r && r.cats) || [];
        cs.forEach(function (c) {
          var o = _row(_cs, c);
          o.live++; o.tw += (+r.tw) || 0; o.vw += (+r.vw) || 0;
        });
      });
      map.UNI.catStats = _cs;"""
assert s.count(A) == 1
s = s.replace(A, """      var _seenH = {};
      map.UNI.allHandles.forEach(function (r) {
        var cs = (r && r.cats) || [];
        _seenH[String(r.h || '').toLowerCase()] = 1;
        cs.forEach(function (c) {
          var o = _row(_cs, c);
          o.live++; o.tw += (+r.tw) || 0; o.vw += (+r.vw) || 0;
        });
      });
      /* mj-agg (13-Oct): jo mapping me hai par roster me nahi (pipeline ne
         chhoda hua -- Media House / Journalist), uska jod Mongo se seedha
         yahan jud jaata hai. SIRF card ke liye: allHandles, party/state
         chart aur grand total pehle jaise hi rehte hain. */
      var _mj = map.MJAGG || {};
      var _mjN = 0;
      Object.keys(_ct).forEach(function (low) {
        if (_seenH[low]) return;
        var a = _mj[low];
        if (!a || (!a.tw && !a.vw)) return;
        _mjN++;
        _ct[low].forEach(function (c) {
          var o = _row(_cs, c);
          o.live++; o.tw += (+a.tw) || 0; o.vw += (+a.vw) || 0;
        });
      });
      if (_mjN) console.log('  mj-agg: ' + _mjN + ' handle ki ginti card par jud gayi');
      map.UNI.catStats = _cs;""")

io.open(P, 'w', encoding='utf-8').write(s)
print('PATCHED %s  %d -> %d' % (P, n0, len(s)))
