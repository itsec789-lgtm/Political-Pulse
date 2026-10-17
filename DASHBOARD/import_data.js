// import_data.js — imports all collections into MongoDB (no mongoimport needed)
// Run:  node import_data.js
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URL = require('./mongo_conf.js');   // <- central: db_config.json
const DB = 'india_Pulse';
const DATA_DIR = path.join(__dirname, 'data');

// collection name -> file
const FILES = {
  handles: 'handles.json',
  mapping: 'mapping.json',
  dashboard_data: 'dashboard_data.json',
  phd: 'phd.json',
};

(async () => {
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(DB);
    console.log('Connected to', MONGO_URL, '| db:', DB, '\n');

    for (const [coll, file] of Object.entries(FILES)) {
      const fp = path.join(DATA_DIR, file);
      if (!fs.existsSync(fp)) { console.log(`  SKIP ${coll} (file not found: ${file})`); continue; }
      const docs = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const arr = Array.isArray(docs) ? docs : [docs];
      await db.collection(coll).drop().catch(() => {});      // drop old
      if (arr.length) await db.collection(coll).insertMany(arr, { ordered: false });
      const n = await db.collection(coll).countDocuments();
      console.log(`  OK  ${coll.padEnd(16)} imported ${n} docs   (from ${file})`);
    }

    // helpful indexes (idempotent)
    await db.collection('handles').createIndex({ level: 1 }).catch(() => {});
    await db.collection('handles').createIndex({ party: 1 }).catch(() => {});
    await db.collection('handles').createIndex({ views: -1 }).catch(() => {});

    console.log('\nDone. Now:  npm start   ->   http://localhost:3000');
  } catch (e) {
    console.error('\nERROR:', e.message);
    console.error('Kya MongoDB chal raha hai? (services.msc -> MongoDB Server -> Start)');
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
