/*  hot_conf.js  --  HOT store (Atlas, last N days) ki settings (hot/cold plan, Phase 1)
 *
 *  Python wale hot_conf.py jaisa hi:
 *     1. env  MONGO_HOT_URL, PULSE_HOT_ENABLED, PULSE_HOT_DAYS, PULSE_HOT_DB
 *     2. db_config.local.json -> "hot"   (git me nahi jaati)
 *     3. default: enabled=false  -> sab pehle jaisa
 *
 *  mongo_conf.js nahi badla -- wo ek STRING export karta hai (MONGO_URL),
 *  usme property nahi jud sakti, isliye HOT ki settings yahan alag hain.
 *
 *  Use:  const HC = require('./hot_conf.js');  HC.HOT.enabled, HC.windowCutoff()
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = { enabled: false, url: '', db: 'pulse_hot', days: 7, max_mb: 400 };
const LOCAL_NAME = 'db_config.local.json';

function find(name) {
  let d = __dirname;
  for (let i = 0; i < 5; i++) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
    const nd = path.dirname(d);
    if (nd === d) break;
    d = nd;
  }
  return null;
}
function truthy(v) { return ['1', 'true', 'yes', 'on'].indexOf(String(v).trim().toLowerCase()) >= 0; }

function load() {
  let h = Object.assign({}, DEFAULTS);
  const p = find(LOCAL_NAME);
  if (p) {
    try { Object.assign(h, (JSON.parse(fs.readFileSync(p, 'utf8')) || {}).hot || {}); }
    catch (e) {
      console.log('  [hot_conf] ' + LOCAL_NAME + ' padhi nahi gayi (' + e.message + ') -- HOT band');
      h = Object.assign({}, DEFAULTS);
    }
  }
  const env = process.env;
  if (String(env.MONGO_HOT_URL || '').trim()) h.url = env.MONGO_HOT_URL.trim();
  if (String(env.PULSE_HOT_ENABLED || '').trim()) h.enabled = truthy(env.PULSE_HOT_ENABLED);
  if (String(env.PULSE_HOT_DAYS || '').trim()) h.days = env.PULSE_HOT_DAYS;
  if (String(env.PULSE_HOT_DB || '').trim()) h.db = env.PULSE_HOT_DB.trim();
  h.enabled = (typeof h.enabled === 'string') ? truthy(h.enabled) : !!h.enabled;
  h.days = Math.max(1, parseInt(h.days, 10) || 7);
  h.max_mb = parseInt(h.max_mb, 10) || 400;
  h.url = String(h.url || '').trim();
  if (!h.url) h.enabled = false;
  h.source = p || '(defaults)';
  return h;
}

const HOT = load();

/* IST ka aaj -> 'YYYY-MM-DD' */
function todayIST(now) {
  const t = (now ? new Date(now) : new Date()).getTime() + 330 * 60000;
  return new Date(t).toISOString().slice(0, 10);
}
/* HOT window ka pehla din (IST). days=7 -> aaj + pichhle 6 din. */
/* hot.days, ya Phase 7 guard ne size ki wajah se ghataya ho to wo (DASHBOARD/.hot_state.json) */
function effectiveDays() {
  const cands = [path.join(__dirname, '.hot_state.json'), path.join(__dirname, '..', 'DASHBOARD', '.hot_state.json')];
  for (const p of cands) {
    try { const v = parseInt((JSON.parse(fs.readFileSync(p, 'utf8')) || {}).days, 10); if (v > 0) return Math.min(v, HOT.days); }
    catch (e) { }
  }
  return HOT.days;
}
function windowCutoff(days, now) {
  const d = parseInt(days || effectiveDays(), 10);
  const t = Date.parse(todayIST(now) + 'T00:00:00Z') - (d - 1) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function masked(url) {
  const u = url === undefined ? HOT.url : String(url || '');
  const i = u.indexOf('//'), j = u.lastIndexOf('@');
  if (i < 0 || j < i) return u;
  const user = u.slice(i + 2, j).split(':')[0];
  return u.slice(0, i + 2) + user + ':****' + u.slice(j);
}

module.exports = { HOT: HOT, windowCutoff: windowCutoff, effectiveDays: effectiveDays, todayIST: todayIST, masked: masked };
