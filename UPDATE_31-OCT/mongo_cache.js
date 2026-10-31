// UPDATE 31-Oct: naye cache collections ka export / import (pulse_master).
//   node mongo_cache.js export   -> mongo\*.json  (laptop par, ek baar)
//   node mongo_cache.js import   -> main system ke Mongo me (upsert -- koi purana data delete nahi)
// Collections: ha_summaries (AI summary), party_logos (party logo cache), tweet_translations.
// Teeno sirf cache hain: na bhi aayein to dashboard pehli click par khud bana leta hai.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DASH = path.join(ROOT, 'DASHBOARD');
const { EJSON } = require(path.join(DASH, 'node_modules', 'mongodb')).BSON;
const MP = require(path.join(DASH, 'mongo_pool.js'));
const DB = 'pulse_master', COLLS = ['ha_summaries', 'party_logos', 'tweet_translations'];
const DIR = path.join(__dirname, 'mongo');

(async () => {
  const mode = process.argv[2];
  const cli = MP.client(); await cli.connect();
  const db = cli.db(DB);
  if (mode === 'export') {
    fs.mkdirSync(DIR, { recursive: true });
    for (const c of COLLS) {
      const docs = await db.collection(c).find({}).toArray();
      fs.writeFileSync(path.join(DIR, c + '.json'), EJSON.stringify(docs, { relaxed: false }));
      console.log('  export ' + c + ': ' + docs.length + ' docs');
    }
  } else if (mode === 'import') {
    for (const c of COLLS) {
      const f = path.join(DIR, c + '.json');
      if (!fs.existsSync(f)) { console.log('  ' + c + ': file nahi -- skip'); continue; }
      const docs = EJSON.parse(fs.readFileSync(f, 'utf8'), { relaxed: false });
      let n = 0;
      for (const d of docs) {
        /* jo main system par pehle se hai use mat chhedo (wahi taaza hai) */
        const r = await db.collection(c).updateOne({ _id: d._id }, { $setOnInsert: d }, { upsert: true });
        n += r.upsertedCount || 0;
      }
      console.log('  import ' + c + ': ' + docs.length + ' me se ' + n + ' naye daale');
    }
  } else {
    console.log('use: node mongo_cache.js export|import'); process.exitCode = 2;
  }
  await cli.close();
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('  Mongo error: ' + e.message); process.exit(1); });
