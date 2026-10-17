/* ======================================================================
   CHECK_PUNJAB_DATA  --  sirf PADHTA hai, kuch likhta ya mitata NAHI
   ----------------------------------------------------------------------
   Ye batata hai:
     1. SOURCE (pulse_master.master_tweets) me Punjab ka kitna data hai,
        sabse naya/purana din kaun sa, pichhle 24 ghante aur 7 din me
        kitne naye aaye
     2. TARGET (political_lens) me kya bana hua hai, aur wo kab bana
     3. Dashboard ke teen number (Tweets Indexed / Handles Tracked /
        Constituencies) source se milte hain ya nahi
     4. Data ki gadbad: duplicate, gayab field, ajeeb date format

   Connection string mongo_conf.js se aata hai aur kahin print NAHI hota.
   Chalao:  node check_punjab_data.js     (ya CHECK_PUNJAB_DATA.bat)
   ====================================================================== */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const MONGO_URL = require(path.join(ROOT, 'mongo_conf.js'));
const { MongoClient } = require(path.join(ROOT, 'node_modules', 'mongodb'));
const CFG = require(path.join(ROOT, 'config.json'));

const WANT = String(CFG.state || 'Punjab').trim().toLowerCase();
const SRC_DB = CFG.sourceDb || 'pulse_master';
const SRC_COL = CFG.sourceCollection || 'master_tweets';
const TGT_DB = CFG.targetDb || 'political_lens';

/* build_punjab_data.py jaise hi naam dhoondhte hain -- column ka naam
   export-to-export badalta rehta hai. */
const ALIAS = {
  state: ['State', 'state', 'st'],
  loc: ['Locations', 'locations', 'location', 'district', 'zila', 'city'],
  date: ['Tweet Date', 'tweetdate', 'date', 'Date', 'createdat', 'created at', 'timestamp', 'd'],
  handle: ['Handle', 'handle', 'username', 'screenname', 'user', 'twitterhandle'],
  tid: ['Tweet ID', 'tweetid', 'id', 'statusid'],
  ac: ['AC Name', 'acname', 'constituency', 'AC/PC No', 'acpcno', 'ac'],
  party: ['Party', 'party', 'pt']
};

function pick(doc, names) {
  for (const n of names) if (Object.prototype.hasOwnProperty.call(doc, n)) return n;
  const low = {};
  Object.keys(doc).forEach(k => low[k.toLowerCase().replace(/[^a-z]/g, '')] = k);
  for (const n of names) {
    const k = low[n.toLowerCase().replace(/[^a-z]/g, '')];
    if (k) return k;
  }
  return null;
}
const pad = (s, n) => String(s == null ? '' : s).padEnd(n);
const num = n => (n == null ? '-' : Number(n).toLocaleString('en-IN'));
function line(c) { console.log('  ' + '-'.repeat(c || 68)); }

/* tareekh kai shakal me aa sakti hai: Date object, "2026-10-09",
   "09/10/2026", epoch... Jo samajh na aaye use 'ajeeb' me gin lete hain. */
function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? null : d; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const iso = d => (d ? d.toISOString().slice(0, 10) : '-');

(async () => {
  const cli = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 8000 });
  try {
    await cli.connect();
  } catch (e) {
    console.log('\n  !! MongoDB se jud nahi paya: ' + e.message);
    console.log('     - MongoDB service chalu hai? (Win+R -> services.msc -> "MongoDB Server")');
    console.log('     - db_config.json me sahi URL hai?');
    process.exit(1);
  }

  console.log('\n==========  PUNJAB DATA CHECK  ==========\n');

  /* ---------------- 1. SOURCE ---------------- */
  const src = cli.db(SRC_DB).collection(SRC_COL);
  const srcTotal = await src.estimatedDocumentCount();
  const sample = await src.findOne({});
  if (!sample) { console.log('  SOURCE khaali hai: ' + SRC_DB + '.' + SRC_COL); await cli.close(); return; }

  const F = {};
  Object.keys(ALIAS).forEach(k => F[k] = pick(sample, ALIAS[k]));

  console.log('  SOURCE : ' + SRC_DB + '.' + SRC_COL);
  console.log('  kul documents            : ' + num(srcTotal));
  console.log('  state ka column          : ' + (F.state || '(nahi mila)'));
  console.log('  date ka column           : ' + (F.date || '(nahi mila)'));
  console.log('  handle ka column         : ' + (F.handle || '(nahi mila)'));

  /* Punjab ka filter -- State me, warna Locations me (wahi tarika jo
     build_punjab_data.py use karta hai) */
  const rx = new RegExp('^\\s*' + WANT + '\\s*$', 'i');
  const rxLoose = new RegExp(WANT, 'i');
  const q = { $or: [] };
  if (F.state) q.$or.push({ [F.state]: rx });
  if (F.loc) q.$or.push({ [F.loc]: rxLoose });
  if (!q.$or.length) { console.log('\n  !! state/locations column mila hi nahi.'); await cli.close(); return; }

  const pTotal = await src.countDocuments(q);
  line();
  console.log('  PUNJAB documents (source): ' + num(pTotal));

  /* sabse naya / purana din + 24h aur 7d ki ginti */
  let newest = null, oldest = null, bad = 0, missDate = 0;
  const now = Date.now();
  let d1 = 0, d7 = 0;
  const seenTid = new Map();
  let dupTid = 0, missState = 0, missHandle = 0, missParty = 0;
  const fmtSeen = {};

  const cur = src.find(q, { projection: Object.fromEntries(
      Object.values(F).filter(Boolean).map(k => [k, 1])) }).batchSize(2000);
  let n = 0;
  for await (const doc of cur) {
    n++;
    const raw = F.date ? doc[F.date] : null;
    if (raw == null || raw === '') missDate++;
    else {
      const shape = raw instanceof Date ? 'Date object'
        : (typeof raw === 'number' ? 'number (epoch)'
          : (/^\d{4}-\d{2}-\d{2}/.test(String(raw)) ? 'YYYY-MM-DD'
            : (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(String(raw)) ? 'DD/MM/YYYY' : 'kuch aur')));
      fmtSeen[shape] = (fmtSeen[shape] || 0) + 1;
      const d = toDate(raw);
      if (!d) bad++;
      else {
        if (!newest || d > newest) newest = d;
        if (!oldest || d < oldest) oldest = d;
        const age = now - d.getTime();
        if (age <= 864e5) d1++;
        if (age <= 7 * 864e5) d7++;
      }
    }
    if (F.tid) {
      const t = String(doc[F.tid] || '');
      if (t) { if (seenTid.has(t)) dupTid++; else seenTid.set(t, 1); }
    }
    if (F.state && !String(doc[F.state] || '').trim()) missState++;
    if (F.handle && !String(doc[F.handle] || '').trim()) missHandle++;
    if (F.party && !String(doc[F.party] || '').trim()) missParty++;
  }

  console.log('  sabse purana din         : ' + iso(oldest));
  console.log('  SABSE NAYA din           : ' + iso(newest));
  console.log('  pichhle 24 ghante me     : ' + num(d1));
  console.log('  pichhle 7 din me         : ' + num(d7));

  /* ---------------- 2. TARGET ---------------- */
  line();
  const tdb = cli.db(TGT_DB);
  const cols = (await tdb.listCollections().toArray()).map(c => c.name).sort();
  console.log('  TARGET : ' + TGT_DB);
  console.log('  collections              : ' + (cols.join(', ') || '(ek bhi nahi)'));
  for (const c of cols) {
    console.log('     ' + pad(c, 22) + num(await tdb.collection(c).estimatedDocumentCount()) + ' docs');
  }
  let meta = null;
  if (cols.indexOf('meta') >= 0) meta = await tdb.collection('meta').findOne({});
  if (meta) {
    console.log('  build kab bana           : ' + (meta.generated || '-'));
    console.log('  build ka date_from       : ' + (meta.date_from || '-'));
    console.log('  build ka date_to         : ' + (meta.date_to || '-'));
    console.log('  build me unique tweets   : ' + num(meta.unique_tweets));
  } else {
    console.log('  !! meta nahi mila -- lagta hai build kabhi chala hi nahi.');
  }

  /* ---------------- 3. DASHBOARD ke teen number ---------------- */
  line();
  let agg = null;
  if (cols.indexOf('aggregates') >= 0) agg = await tdb.collection('aggregates').findOne({});
  const kpi = (agg && (agg.kpi || agg.kpis)) || {};
  const dashTweets = kpi.total_tweets != null ? kpi.total_tweets : (meta && meta.unique_tweets);
  const dashHandles = kpi.total_handles != null ? kpi.total_handles
    : (agg && agg.handles ? agg.handles.length : null);
  const dashAC = (agg && agg.geo) ? agg.geo.length : null;

  console.log('  DASHBOARD par kya dikhega');
  console.log('     Tweets Indexed        : ' + num(dashTweets));
  console.log('     Handles Tracked       : ' + num(dashHandles));
  console.log('     Constituencies        : ' + num(dashAC));
  console.log('  SOURCE se milta hai?');
  const diff = (dashTweets == null || !pTotal) ? null : (pTotal - dashTweets);
  console.log('     source Punjab docs    : ' + num(pTotal)
    + (diff == null ? '' : ('   (farak: ' + num(diff) + ')')));
  if (newest && meta && meta.date_to) {
    const behind = Math.round((newest - toDate(meta.date_to)) / 864e5);
    console.log('     build kitna peeche    : ' + (isFinite(behind) ? behind + ' din' : '-'));
  }

  /* ---------------- 4. data ki gadbad ---------------- */
  line();
  console.log('  DATA KI JAANCH (sirf Punjab ke ' + num(n) + ' documents par)');
  console.log('     duplicate tweet id    : ' + num(dupTid));
  console.log('     date khaali           : ' + num(missDate));
  console.log('     date samajh nahi aayi : ' + num(bad));
  console.log('     state khaali          : ' + num(missState));
  console.log('     handle khaali         : ' + num(missHandle));
  console.log('     party khaali          : ' + num(missParty));
  console.log('     date ke format        : ' + (Object.keys(fmtSeen).length
    ? Object.keys(fmtSeen).map(k => k + ' (' + num(fmtSeen[k]) + ')').join(', ') : '-'));

  line();
  console.log('  Ye script ne kuch BADLA nahi -- sirf padha hai.\n');
  await cli.close();
})().catch(e => { console.log('\n  !! error: ' + e.message); process.exit(1); });
