// check_db.js — aapke MongoDB ka data verify karta hai (koi change nahi karta, sirf padhta hai)
// Run:  node check_db.js
const { MongoClient } = require('mongodb');
const MONGO_URL = require('./mongo_conf.js');   // <- central: db_config.json

const EXPECT_BLOBS = ['UNI','GROWTH','AGG','HTFULL','HROLE','STATE_DATA','PARTY_DATA',
  'HANDLES','MLA_DATA','PARTY_HANDLES','TWEETS','CM_DATA','DAILY_DATA','HASHTAGS','D'];

(async () => {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    console.log('Connected:', MONGO_URL, '\n');

    // konse db me dashboard_data hai
    const admin = client.db().admin();
    const { databases } = await admin.listDatabases();
    let dbName = null;
    for (const d of databases) {
      const cols = await client.db(d.name).listCollections().toArray();
      if (cols.some(c => c.name === 'dashboard_data')) { dbName = d.name; break; }
    }
    if (!dbName) { console.log('❌ Kisi bhi db me dashboard_data collection nahi mili.'); return; }
    console.log('Data database:', dbName, '\n');
    const db = client.db(dbName);

    // collection counts
    for (const c of ['handles','mapping','dashboard_data','phd']) {
      const n = await db.collection(c).countDocuments().catch(() => 'MISSING');
      console.log(`  ${c.padEnd(16)} = ${n} docs`);
    }

    // dashboard_data blobs
    console.log('\n--- dashboard_data blobs ---');
    const docs = await db.collection('dashboard_data').find({}).toArray();
    const byKey = {};
    docs.forEach(d => { byKey[d.key] = d; });
    console.log('  keys present:', docs.map(d => d.key).join(', '));

    const missing = EXPECT_BLOBS.filter(k => !(k in byKey));
    console.log('  MISSING blobs:', missing.length ? missing.join(', ') : 'none ✓');

    // structure checks
    function chk(key, test, desc) {
      const d = byKey[key];
      if (!d) { console.log(`  ❌ ${key}: NAHI HAI`); return; }
      let ok = false, extra = '';
      try { const r = test(d.value); ok = !!r; extra = typeof r === 'string' ? r : ''; } catch (e) { extra = e.message; }
      console.log(`  ${ok ? '✓' : '❌'} ${key}: ${desc}${extra ? ' -> ' + extra : ''}`);
    }
    chk('CM_DATA', v => Array.isArray(v) && v.length + ' leaders', 'array?');
    chk('UNI', v => v && typeof v === 'object' && !Array.isArray(v) && ('tot=' + JSON.stringify(v.tot)), 'object with tot?');
    chk('UNI', v => Array.isArray(v.allHandles) && (v.allHandles.length + ' handles'), 'allHandles?');
    chk('UNI', v => v.sent && ('pos=' + v.sent.pos + ' neu=' + v.sent.neu + ' neg=' + v.sent.neg), 'sent?');
    chk('UNI', v => v.party && v.party.BJP && ('BJP.tw=' + v.party.BJP.tw), 'party.BJP?');

    // any doc missing key/value?
    const bad = docs.filter(d => !('key' in d) || !('value' in d));
    console.log('\n  docs without key/value field:', bad.length ? bad.length + ' ❌' : 'none ✓');

    console.log('\nDone.');
  } catch (e) {
    console.error('\nERROR:', e.message);
  } finally {
    await client.close();
  }
})();
