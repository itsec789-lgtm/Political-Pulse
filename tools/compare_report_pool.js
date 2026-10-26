/* compare_report_pool.js  --  Phase 0.4 acceptance check (READ-ONLY).

   Same Report query, two sources:
     OLD  up_pulse.tweets       (copy built by push_tweets.py)
     NEW  pulse_master.master_tweets  mapped by DASHBOARD/report_src.js
   For each query: row counts, time, rows only in one side, field diffs.
   Counter fields (lk, rt, vw, followers) that are HIGHER in master are
   expected (master kept updating after the copy was built) and are listed
   separately from real mismatches.

   Run on Laptop 1:  node tools\compare_report_pool.js  [> out.txt]       */
'use strict';
const path = require('path');
function req(name) {
  const tries = [path.join(__dirname, '..', 'DASHBOARD', 'node_modules', name),
                 path.join('C:\\Main Twitter Project', 'DASHBOARD', 'node_modules', name), name];
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('module not found: ' + name);
}
const { MongoClient } = req('mongodb');
const MONGO_URL = require(path.join(__dirname, '..', 'DASHBOARD', 'mongo_conf.js'));
const RS = require(path.join(__dirname, '..', 'DASHBOARD', 'report_src.js'));
const CAP = 120000;
const COUNTERS = ['lk', 'rt', 'vw', 'followers'];
const FIELDS = ['h', 'name', 'text', 'party', 'level', 'sent', 'date', 'lk', 'rt', 'vw', 'followers', 'url', 'cat'];

const QUERIES = [
  { terms: ['Akhilesh'] },
  { terms: ['kisan', 'farmer'], from: '2026-10-01', to: '2026-10-20' },
  { terms: ['#Bihar'] },
  { terms: ['Yogi'], from: '2026-10-10', to: '2026-10-15' },
  { terms: ['GST'], from: '2026-09-01' },
  { terms: ['Operation Sindoor'], to: '2026-08-31' },
];

function key(r) { return r.url ? 'u:' + r.url : 'x:' + r.h + '|' + r.date + '|' + r.text; }

(async function main() {
  const cli = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 6000 });
  await cli.connect();
  const pool = cli.db('up_pulse').collection('tweets');
  const master = cli.db('pulse_master').collection('master_tweets');
  console.log('pool docs   :', await pool.estimatedDocumentCount());
  console.log('master docs :', await master.estimatedDocumentCount());
  let allOk = true;
  for (const Q of QUERIES) {
    let t0 = Date.now();
    const a = await pool.find(RS.poolQuery(Q.terms, Q.from, Q.to), { projection: { _id: 0 } }).limit(CAP).toArray();
    const ta = Date.now() - t0; t0 = Date.now();
    const bDocs = await master.find(RS.masterQuery(Q.terms, Q.from, Q.to), { projection: RS.PROJ }).limit(CAP).batchSize(5000).toArray();
    const tb = Date.now() - t0;
    const b = bDocs.map(RS.toRow);
    const A = new Map(), B = new Map();
    a.forEach(r => A.set(key(r), r)); b.forEach(r => B.set(key(r), r));
    const onlyA = [...A.keys()].filter(k => !B.has(k));
    const onlyB = [...B.keys()].filter(k => !A.has(k));
    let grew = 0; const real = {};
    for (const [k, ra] of A) {
      const rb = B.get(k); if (!rb) continue;
      for (const f of FIELDS) {
        if (ra[f] === rb[f]) continue;
        if (COUNTERS.includes(f) && typeof ra[f] === 'number' && rb[f] >= ra[f]) { grew++; continue; }
        (real[f] = real[f] || []).push({ k: k.slice(0, 80), pool: String(ra[f]).slice(0, 60), master: String(rb[f]).slice(0, 60) });
      }
    }
    const nReal = Object.values(real).reduce((n, v) => n + v.length, 0);
    console.log('\n=== ' + JSON.stringify(Q));
    console.log('  rows  pool=' + a.length + ' (' + ta + ' ms)   master=' + b.length + ' (' + tb + ' ms)' + (a.length >= CAP || b.length >= CAP ? '   [CAP HIT]' : ''));
    console.log('  dup keys  pool=' + (a.length - A.size) + '  master=' + (b.length - B.size));
    console.log('  only in pool=' + onlyA.length + '  only in master=' + onlyB.length + '  counters grew=' + grew + '  real field diffs=' + nReal);
    onlyA.slice(0, 3).forEach(k => console.log('    only pool  : ' + k.slice(0, 100)));
    onlyB.slice(0, 3).forEach(k => console.log('    only master: ' + k.slice(0, 100)));
    for (const f in real) {
      console.log('    field ' + f + ': ' + real[f].length + ' diffs, e.g. ' + JSON.stringify(real[f].slice(0, 2)));
    }
    if (onlyA.length || nReal) allOk = false;
  }
  console.log('\nRESULT: ' + (allOk ? 'MATCH (only new tweets / grown counters differ)' : 'DIFFERENCES FOUND -- see above'));
  await cli.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
