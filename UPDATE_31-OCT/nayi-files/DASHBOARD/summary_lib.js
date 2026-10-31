/* ---------------------------------------------------------------------------
 * summary_lib.js  (30-Oct)  --  Handle Analytics "AI Summary"
 *
 * Saare hisaab YAHAN hote hain (buildFacts), Gemini sirf unhe seedhi bhasha me
 * likhta hai. Pehle Gemini ko kaccha data diya tha to usne galat din ko "sabse
 * zyada reach" bata diya -- isliye ab model ko koi ginti nahi karni padti.
 *
 * Jawab ki jaanch (looksRight): jo bhi ank model likhe wo facts me hona chahiye,
 * aur Hindi me sirf din / mahine / handle hi Roman me ho sakte hain. Fail ho to
 * agla model.
 *
 * Key: translate_config.json -> gemini_key  (git-ignored, kabhi commit nahi)
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
/* 3.5-flash pehle: flash-lite "you posted" likhta tha, ank chhod deta tha */
const CHAIN = [
  { id: 'gemini-3.5-flash', think: { thinkingLevel: 'low' } },
  { id: 'gemini-3.6-flash', think: { thinkingLevel: 'low' } },
  { id: 'gemini-3.5-flash-lite' },
  { id: 'gemini-flash-lite-latest' },
  { id: 'gemini-3.1-flash-lite', think: { thinkingLevel: 'minimal' } }
];
const COOL = new Map();
const TIMEOUT_MS = 30000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function key() {
  try { return (JSON.parse(fs.readFileSync(path.join(__dirname, 'translate_config.json'), 'utf8')).gemini_key || '').trim(); }
  catch (e) { return ''; }
}

/* dashboard jaisa: 35.6K, 1.66 L, 2.30 Cr */
function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
function dayName(iso, withYear) {
  const t = new Date(iso + 'T00:00:00Z');
  if (isNaN(t)) return iso;
  return WD[t.getUTCDay()] + ' ' + t.getUTCDate() + ' ' + MO[t.getUTCMonth()] + (withYear ? ' ' + t.getUTCFullYear() : '');
}

/* ---- hisaab: daily + summary (+ pichhla barabar samay) se points ----
   days = '7' | '30' | 'all'. prev = pichhle utne hi din ka summary (all me null). */
function buildFacts(h, days, daily, s, prev, lang) {
  const act = (daily || []).filter(x => x.posts > 0);
  if (!act.length) return null;
  const multiYear = act[0].date.slice(0, 4) !== act[act.length - 1].date.slice(0, 4);
  const dn = d => dayName(d, multiYear);
  const less = lang === 'hi' ? 'कम' : 'fewer', more = lang === 'hi' ? 'ज़्यादा' : 'more';
  const rel = (now, old) => {
    if (!(old > 0) || now == null) return null;
    const p = Math.round((now - old) / old * 100);
    return p === 0 ? (lang === 'hi' ? 'बराबर' : 'the same') : Math.abs(p) + '% ' + (p < 0 ? less : more);
  };
  const cmp = days === '7' ? (lang === 'hi' ? 'पिछले 7 दिन' : 'the previous 7 days')
            : days === '30' ? (lang === 'hi' ? 'पिछले 30 दिन' : 'the previous 30 days') : null;
  const period = days === '7' ? (lang === 'hi' ? 'पिछले 7 दिन' : 'the last 7 days')
               : days === '30' ? (lang === 'hi' ? 'पिछले 30 दिन' : 'the last 30 days')
               : (lang === 'hi' ? 'शुरू से अब तक' : 'all time') + ' (' + dn(act[0].date) + ' – ' + dn(act[act.length - 1].date) + ')';

  const pts = [];
  const best = act.reduce((a, b) => b.engagement > a.engagement ? b : a);
  pts.push({ point: 'best day', day: dn(best.date), responses: fmt(best.engagement), posts_that_day: String(best.posts) });
  if (act.length >= 2) {
    const lo = Math.min.apply(null, act.map(x => x.engagement));
    const slow = act.filter(x => x.engagement === lo).slice(0, 2).map(x => dn(x.date));
    pts.push(slow.length > 1
      ? { point: 'slowest days', days: slow.join(lang === 'hi' ? ' और ' : ' and '), responses_each_day: fmt(lo) }
      : { point: 'slowest day', day: slow[0], responses: fmt(lo) });
  }
  const ppd = { point: 'posts per day', posts_per_day: String(s.postsPerDay) };
  const r1 = prev ? rel(s.postsPerDay, prev.postsPerDay) : null;
  if (r1) { ppd.vs_before = r1; ppd.compared_with = cmp; }
  pts.push(ppd);
  if (act.length >= 2) {
    const per = act.map(x => ({ d: x.date, r: x.engagement / x.posts })).reduce((a, b) => b.r > a.r ? b : a);
    pts.push({ point: 'day each post did best', day: dn(per.d), responses_per_post: Math.round(per.r).toLocaleString('en-IN') });
  }
  if (s.avgViews != null) {
    const vp = { point: 'views per post', views_per_post: fmt(s.avgViews) };
    const r2 = prev ? rel(s.avgViews, prev.avgViews) : null;
    if (r2) { vp.vs_before = r2; vp.compared_with = cmp; }
    pts.push(vp);
  }
  return { handle: h, period: period, points: pts };
}

const RULES = 'All numbers are already calculated: copy every figure, %, K / L / Cr and day name exactly as given; never compute, compare or add reasons. '
  + 'Write exactly one bullet per item in "points", in the same order. Each bullet ONE short simple sentence, max 14 words, past tense. '
  + 'Mention the handle only in bullet 1, never "you". If an item has vs_before, say it relative to compared_with. '
  + 'Wrap the key day or figure in **double asterisks**. Reply as a JSON array of strings only.';
const SYS = {
  en: 'You explain an X (Twitter) account\'s activity to a busy politician who is not a data person. Plain everyday English. '
    + 'Call likes + replies + reposts "responses". No jargon (engagement, reach, efficiency, benchmark, metrics, interactions). ' + RULES
    + ' Example for OTHER data (copy the style, not the numbers): ["**Mon 3 Nov** was XYZ\'s best day, with **12.4K** responses.", '
    + '"**Wed 5 Nov** was the slowest day, with **4.1K** responses.", "It posted **18.2** times a day, **10% fewer** than the previous 7 days.", '
    + '"Posts on **Sat 8 Nov** did best, about **610** responses each.", "Each post was seen about **9.8K** times, **5% more** than the previous 7 days."]',
  hi: 'आप एक X (Twitter) अकाउंट की गतिविधि एक व्यस्त नेता को समझाते हैं जो डेटा नहीं जानते। बोलचाल की आसान हिंदी, सिर्फ़ देवनागरी लिपि में। '
    + 'likes + replies + reposts को "प्रतिक्रियाएं" लिखें; "पोस्ट", "बार देखी गई" जैसे आसान शब्द। '
    + 'Roman में सिर्फ़ ये रहें: अंक, %, K / L / Cr, हैंडल और "Thu 22 Oct" जैसे दिन। बाक़ी हर शब्द देवनागरी में। "आप/आपके" कभी नहीं। ' + RULES
    + ' दूसरे डेटा का उदाहरण (सिर्फ़ अंदाज़ लें, अंक नहीं): ["**Mon 3 Nov** XYZ का सबसे अच्छा दिन रहा, **12.4K** प्रतिक्रियाएं मिलीं।", '
    + '"**Wed 5 Nov** सबसे धीमा दिन रहा, **4.1K** प्रतिक्रियाएं मिलीं।", "रोज़ **18.2** पोस्ट हुईं, पिछले 7 दिन से **10% कम**।", '
    + '"**Sat 8 Nov** की पोस्ट सबसे अच्छी चलीं, हर पोस्ट पर लगभग **610** प्रतिक्रियाएं।", "हर पोस्ट लगभग **9.8K** बार देखी गई, पिछले 7 दिन से **5% ज़्यादा**।"]'
};

/* jawab kaam ka hai? sahi ginti ke bullets, koi naya ank nahi, Hindi me English shabd nahi */
function looksRight(arr, facts, lang) {
  if (!Array.isArray(arr) || arr.length !== facts.points.length) return false;
  const src = JSON.stringify(facts).replace(/,/g, '');
  for (const b of arr) {
    if (typeof b !== 'string' || !b.trim() || b.length > 260) return false;
    const nums = b.replace(/,/g, '').match(/\d+(\.\d+)?/g) || [];
    for (const n of nums) if (src.indexOf(n) < 0) return false;
    if (lang === 'hi') {
      if (!/[ऀ-ॿ]/.test(b)) return false;
      const left = b.replace(new RegExp(facts.handle, 'gi'), '')
        .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Cr|X)\b/g, '');
      if (/[A-Za-z]{3,}/.test(left)) return false;
    }
  }
  return true;
}

async function callGemini(m, sys, user, k) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const gc = { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' };
    if (m.think) gc.thinkingConfig = m.think;
    const r = await fetch(GEMINI + m.id + ':generateContent', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: gc })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw { status: r.status, msg: ((j && j.error) || {}).message || ('HTTP ' + r.status) };
    const c = ((j && j.candidates) || [])[0] || {};
    const txt = ((c.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
    return JSON.parse(txt);
  } finally { clearTimeout(t); }
}

/* facts -> { bullets, model, ms }. Har model fail ho to Error (err.tried me kya hua). */
async function write(facts, lang) {
  const k = key();
  if (!k) throw Object.assign(new Error('AI key missing (translate_config.json).'), { tried: [] });
  const t0 = Date.now(), tried = [], user = JSON.stringify(facts);
  for (const m of CHAIN) {
    if ((COOL.get(m.id) || 0) > Date.now()) { tried.push(m.id + ':cool'); continue; }
    try {
      const arr = await callGemini(m, SYS[lang], user, k);
      if (!looksRight(arr, facts, lang)) { tried.push(m.id + ':bad'); continue; }
      return { bullets: arr.map(s => String(s).trim()), model: m.id, ms: Date.now() - t0 };
    } catch (e) {
      const st = e && e.status;
      tried.push(m.id + ':' + (st || (e && e.name === 'AbortError' ? 'timeout' : 'err')));
      /* quota / overload / model band -- thodi der chhod do */
      if (st === 429 || st === 503) COOL.set(m.id, Date.now() + 60 * 1000);
      if (st === 404) COOL.set(m.id, Date.now() + 6 * 3600 * 1000);
    }
  }
  throw Object.assign(new Error('AI summary is not available right now. Please try again in a minute.'), { tried: tried });
}

module.exports = { buildFacts, write, fmt };
