/*  mongo_conf.js  --  MongoDB ka connection string, EK hi jagah se.
 *
 *  Pehle har server.js me apna "mongodb://localhost:27017" likha tha.
 *  MongoDB par authentication chalu hote hi sab band ho gaya (code 13,
 *  Unauthorized), kyunki koi username/password bhejta hi nahi tha.
 *
 *  Ab sab yahi file poochhte hain. Password badla? Sirf db_config.json badlo.
 *
 *  Kram (jo pehle mil jaaye):
 *     1. MONGO_URL environment variable
 *     2. db_config.json -> "mongo_url"    (project ki jad me -- ASLI JAGAH)
 *     3. mongodb://localhost:27017        (purana vyavhaar)
 *
 *  Use:  const MONGO_URL = require('./mongo_conf.js');
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FALLBACK = 'mongodb://localhost:27017';
const PLACEHOLDER = 'PASTE_';

function findCfg() {
  let d = __dirname;
  for (let i = 0; i < 5; i++) {
    const p = path.join(d, 'db_config.json');
    if (fs.existsSync(p)) return p;
    const nd = path.dirname(d);
    if (nd === d) break;
    d = nd;
  }
  return null;
}

function resolve() {
  const env = String(process.env.MONGO_URL || '').trim();
  if (env) return env;

  const p = findCfg();
  if (p) {
    try {
      const v = String(JSON.parse(fs.readFileSync(p, 'utf8')).mongo_url || '').trim();
      if (v && v.indexOf(PLACEHOLDER) !== 0) return v;
    } catch (e) {
      console.log('  [mongo_conf] db_config.json padhi nahi gayi (' + e.message + ')');
      console.log('               -- filhaal localhost use kar rahe hain');
    }
  }
  return FALLBACK;
}

module.exports = resolve();
