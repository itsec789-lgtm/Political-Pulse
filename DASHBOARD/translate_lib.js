/* translate_lib.js  (30-Oct)  --  tweet translation with a fallback chain.
 *
 * Sirf /api/translate (user ke click) se chalta hai -- koi background job nahi.
 * Ek provider fail ho (quota 429, busy 503, model band 404, timeout, khaali jawab)
 * to agla. Fail hua model thodi der "aaram" karta hai (cooldown) taaki agla click
 * seedha chalne wale par jaaye.
 *
 * Kram (accuracy + speed dono dekh kar, 30-Oct ko test kiya):
 *   1. Gemini (Google AI Studio key) -- kai model, har model ka apna free quota
 *   2. Gemma (wahi key)
 *   3. Groq (ai_config.json, agar key chalti ho)
 *   4. Google Translate free endpoint (koi key nahi)
 *   5. MyMemory (koi key nahi)
 * Keys: DASHBOARD/translate_config.json  { "gemini_key": "..." }   (git me nahi jaati)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const LANG = { en: 'English', hi: 'Hindi' };
const CHAIN = [
  { id: 'gemini-3.5-flash-lite', kind: 'gemini' },
  { id: 'gemini-flash-lite-latest', kind: 'gemini' },
  { id: 'gemini-3.1-flash-lite', kind: 'gemini', think: { thinkingLevel: 'minimal' } },
  { id: 'gemini-3.5-flash', kind: 'gemini', think: { thinkingLevel: 'minimal' } },
  { id: 'gemini-3.6-flash', kind: 'gemini', think: { thinkingLevel: 'minimal' } },
  { id: 'gemini-3.8-flash', kind: 'gemini', think: { thinkingLevel: 'minimal' } },
  { id: 'gemini-3.7-flash', kind: 'gemini', think: { thinkingLevel: 'minimal' } },
  { id: 'gemma-4-31b-it', kind: 'gemma' },
  { id: 'llama-3.3-70b-versatile', kind: 'groq' },
  { id: 'llama-3.1-8b-instant', kind: 'groq' },
  { id: 'google-translate', kind: 'gtx' },
  { id: 'mymemory', kind: 'mymemory' }
];
const COOL = new Map();          // model -> time until which it is skipped
const TIMEOUT_MS = 25000;        // ek provider ka max wait
const TOTAL_MS = 60000;          // poori koshish ka max wait

function readJson(f) { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); } catch (e) { return {}; } }
function keys() { return { gemini: (readJson('translate_config.json').gemini_key || '').trim(), groq: (readJson('ai_config.json').key || '').trim() }; }

function prompt(to) {
  return 'You translate social media posts from Indian politics into ' + LANG[to] + '. '
    + 'Translate the full post accurately and naturally. Keep every #hashtag, @mention, URL and emoji exactly as written '
    + '(for a hashtag in a non-Latin script you may add its meaning in brackets right after it). '
    + 'Keep names of people, parties and places (e.g. Kazhagam = DMK). Reply with the translation only -- no notes, no quotes.';
}

async function http(url, opt) {
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt || {}));
    const body = await r.text();
    let j = null; try { j = JSON.parse(body); } catch (e) {}
    return { ok: r.ok, status: r.status, j: j, body: body };
  } finally { clearTimeout(t); }
}

/* --- providers: return text or throw {status, msg} --- */
async function viaGemini(p, text, to, k) {
  if (!k.gemini) throw { status: 0, msg: 'no gemini key' };
  const gemma = p.kind === 'gemma';
  const gc = { temperature: 0.2, maxOutputTokens: 2048 };
  if (p.think) gc.thinkingConfig = p.think;
  const body = gemma
    ? { contents: [{ role: 'user', parts: [{ text: prompt(to) + '\n\n' + text }] }], generationConfig: gc }
    : { systemInstruction: { parts: [{ text: prompt(to) }] }, contents: [{ role: 'user', parts: [{ text: text }] }], generationConfig: gc };
  const r = await http(GEMINI + p.id + ':generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.gemini }, body: JSON.stringify(body)
  });
  if (!r.ok) throw { status: r.status, msg: ((r.j && r.j.error) || {}).message || r.body.slice(0, 160) };
  const c = ((r.j && r.j.candidates) || [])[0] || {};
  if (c.finishReason && c.finishReason !== 'STOP') throw { status: 0, msg: 'finish=' + c.finishReason };
  return ((c.content || {}).parts || []).filter(function (x) { return !x.thought; }).map(function (x) { return x.text || ''; }).join('');
}
async function viaGroq(p, text, to, k) {
  if (!k.groq) throw { status: 0, msg: 'no groq key' };
  const r = await http('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k.groq },
    body: JSON.stringify({ model: p.id, temperature: 0.2, max_tokens: 900, messages: [{ role: 'system', content: prompt(to) }, { role: 'user', content: text }] })
  });
  if (!r.ok) throw { status: r.status, msg: ((r.j && r.j.error) || {}).message || r.body.slice(0, 160) };
  return ((((r.j || {}).choices || [])[0] || {}).message || {}).content || '';
}
async function viaGtx(p, text, to) {
  const r = await http('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + to + '&dt=t&q=' + encodeURIComponent(text));
  if (!r.ok || !Array.isArray(r.j) || !Array.isArray(r.j[0])) throw { status: r.status, msg: 'google-translate failed' };
  return r.j[0].map(function (s) { return s[0] || ''; }).join('');
}
async function viaMyMemory(p, text, to, k, from) {
  if (!from) throw { status: 0, msg: 'mymemory needs source language' };
  const r = await http('https://api.mymemory.translated.net/get?langpair=' + from + '|' + to + '&q=' + encodeURIComponent(text.slice(0, 480)));
  const t = r.j && r.j.responseData && r.j.responseData.translatedText;
  if (!r.ok || !t || (r.j.responseStatus && +r.j.responseStatus !== 200)) throw { status: r.status, msg: 'mymemory failed' };
  return t;
}

/* jawab kaam ka hai? -- khaali / original jaisa / galat lipi wala nahi */
function looksRight(out, src, to) {
  const s = String(out || '').trim();
  if (!s || s === String(src).trim()) return false;
  const letters = s.replace(/https?:\/\/\S+|[#@][\wऀ-ൿ؀-ۿ]+|[\s\d\p{P}\p{S}]/gu, '');
  if (!letters) return false;
  /* asli bhasha ka koi akshar bacha (jaise "स्टாலின்") = adhoora translation -> agla model */
  if (/[ঀ-ൿ؀-ۿ]/.test(letters)) return false;
  const dev = (letters.match(/[ऀ-ॿ]/g) || []).length, lat = (letters.match(/[A-Za-z]/g) || []).length;
  return to === 'hi' ? dev / letters.length > 0.5 : lat / letters.length > 0.6;
}
function coolFor(status, msg) {
  if (status === 404 || status === 400) return 6 * 3600e3;                 // model band / galat
  if (status === 401 || status === 403) return 3600e3;                     // key nahi chali
  if (status === 429) return /per day|daily|PerDay/i.test(msg || '') ? 3 * 3600e3 : 60e3;  // quota
  if (status === 503 || status === 500 || status === 502) return 45e3;     // busy
  return 20e3;                                                             // timeout / kharab jawab
}

/* text -> { text, provider, tried: [...] } ya throw Error */
async function translate(text, to, from) {
  if (!LANG[to]) throw new Error('bad target language');
  const k = keys(), t0 = Date.now(), tried = [];
  const skip = String(process.env.TRANSLATE_SKIP || '').split(',').filter(Boolean);   // sirf test ke liye
  for (const p of CHAIN) {
    if (skip.indexOf(p.kind) >= 0) continue;
    if (Date.now() - t0 > TOTAL_MS) break;
    if ((COOL.get(p.id) || 0) > Date.now()) { tried.push(p.id + ':cooling'); continue; }
    if ((p.kind === 'gemini' || p.kind === 'gemma') && !k.gemini) continue;
    if (p.kind === 'groq' && !k.groq) continue;
    try {
      const fn = p.kind === 'groq' ? viaGroq : p.kind === 'gtx' ? viaGtx : p.kind === 'mymemory' ? viaMyMemory : viaGemini;
      const out = String(await fn(p, text, to, k, from) || '').trim();
      if (!looksRight(out, text, to)) throw { status: 0, msg: 'bad output' };
      tried.push(p.id + ':ok');
      return { text: out, provider: p.id, tried: tried, ms: Date.now() - t0 };
    } catch (e) {
      const st = (e && e.status) || 0, msg = (e && (e.msg || e.message)) || String(e);
      /* sirf is tweet ka jawab kharab tha (model theek hai) -> cooldown nahi */
      if (msg !== 'bad output') COOL.set(p.id, Date.now() + coolFor(st, msg));
      tried.push(p.id + ':' + (st || (e && e.name === 'AbortError' ? 'timeout' : 'err')));
    }
  }
  const err = new Error('All translation services are busy right now. Please try again in a minute.');
  err.tried = tried;
  throw err;
}

module.exports = { translate: translate, CHAIN: CHAIN, LANG: LANG };
