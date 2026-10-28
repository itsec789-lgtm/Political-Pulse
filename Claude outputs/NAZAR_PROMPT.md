# Prompt for Claude on the Nazar machine — use Political Pulse data (summary + live) in Nazar

> Paste everything below this line into Claude Code / Claude on the machine where the **Nazar** project lives
> (the site deployed at `https://nazarindianpoliticspulse.onrender.com`). Before pasting, replace the one
> placeholder `<<NAZAR_READONLY_MONGO_URL>>` (see section 2).

---

## 1. Goal

Nazar must show the **same numbers as the Political Pulse dashboard**, using Political Pulse's data, without
ever reading Political Pulse's full tweet archive.

Political Pulse already publishes everything Nazar needs to **MongoDB Atlas** (database `pulse_hot`), and keeps
it current **every hour** automatically:

| Part | Where | What |
|---|---|---|
| **History (summary)** | `pulse_hot.nazar_daily` | one row per **handle × day**, every day from 2026-04-01 up to yesterday: tweets, likes, views, retweets, 8 sentiment counts, state/party/category of the row |
| **Live (last 3 days, raw tweets)** | `pulse_hot.tweets` | every tweet from `window_start` (IST) until now — written within seconds of ingest; older tweets expire automatically |
| **Handle directory** | `pulse_hot.nazar_handles` | latest name, party, designation, state, PC/AC, category, followers per handle |
| **Control info** | `pulse_hot.nazar_meta` | `window_start`, `updated_at`, first/last day, schema version |

**The one rule** (exactly how Political Pulse builds its own dashboard):

```
any date range [from, to]  =  nazar_daily rows with  from ≤ d < window_start
                           +  tweets with  max(from, window_start) ≤ Tweet Date ≤ to
```

Days before `window_start` come from the summary (small, fast); days from `window_start` onward come from raw
tweets (fresh). Never count the same day from both.

Your job: inspect how Nazar currently gets its data, add a data layer that follows the rule above, switch Nazar's
cards/charts/lists to it, and prove the numbers match.

---

## 2. Connection ("API key")

Nazar connects with the official **MongoDB driver** (Atlas's old "Data API" was retired; do not use it).

```
<<NAZAR_READONLY_MONGO_URL>>
```

Expected form (legacy, non-SRV string — it works on networks where SRV DNS lookups fail):

```
mongodb://<user>:<password>@ac-urlrsia-shard-00-00.hcxvjnf.mongodb.net:27017,ac-urlrsia-shard-00-01.hcxvjnf.mongodb.net:27017,ac-urlrsia-shard-00-02.hcxvjnf.mongodb.net:27017/?ssl=true&replicaSet=atlas-fvpubg-shard-0&authSource=admin&readPreference=secondaryPreferred&compressors=zlib&appName=nazar
```

- This user is **read-only** (role "Only read any database"). Nazar never writes to Atlas.
- Store it **only** as an environment variable on Render, e.g. `PULSE_MONGO_URL`, and locally in an untracked
  `.env`. Never commit it, never print it in logs, never send it to the browser.
- Database name: `pulse_hot`. Atlas network access already allows any IP, so Render can connect.

---

## 3. Data contract (schema 1)

### 3.1 `nazar_meta`
```js
{ _id: "info", schema: 1, timezone: "Asia/Kolkata",
  window_start: "2026-10-25",          // first day (IST) that is served from raw tweets
  hot_days: 3,                          // window length in days (today + 2 previous days)
  first_day: "2026-04-01", last_day: "2026-10-26",
  days: 209, daily_docs: 332720, handles: 3757,
  updated_at: ISODate(...),             // UTC; changes whenever the feed is refreshed
  sentiment_order: ["probjp","antigovt","progovt","pos","neu","antibjp","neg","none"] }
{ _id: "days", sig: { "2026-10-25": "<rows>|<tw>|<lk>|<vw>|<rt>", ... } }   // internal, ignore
```
Read `info` at most once a minute; use `updated_at` as the cache key for anything historical.

### 3.2 `nazar_daily` (history) — ~332k docs, ~68 MB
```js
{ h: "narendramodi",          // X handle (as in the tweet rows; may differ only in letter case across rows)
  d: "2026-10-26",            // IST day
  st: "Uttar Pradesh",        // State written on the tweet row ("National" for national accounts)
  pt: "BJP",                  // Party written on the tweet row ("" if none)
  cat: "LS_MP",               // Category on the row (e.g. LS_MP, MLA, Media House, Journalist, ...)
  tw: 2, lk: 8574, vw: 552489, rt: 2104,   // tweets, likes, views, retweets for that handle-day
  s: [0,0,0,2,0,0,0,0] }      // tweet counts per sentiment, order = sentiment_order
```
Indexes: `{d:1}`, `{h:1,d:1}`, `{pt:1,d:1}`, `{st:1,d:1}`, `{cat:1,d:1}`.
Comments are **not** in the summary (use raw tweets for comment counts inside the window).

### 3.3 `tweets` (live window) — ~30–40k docs
Same field names as Political Pulse's master table. **Numbers are often stored as strings** (e.g. `"3,050"`).
```js
{ _id: "<tweet id>", "Tweet ID": "...", "Tweet URL": "https://x.com/...",
  "Handle": "TimesNow", "Candidate Name": "Times Now",
  "Tweet Date": "2026-10-25 00:00:00 IST",     // string, sortable, IST
  ts: ISODate("2026-10-24T18:30:00Z"),          // same instant as a real UTC Date (TTL + time windows)
  "Tweet Text": "...", "Sentiment": "Pro-Govt", "Sentiment Score": "0.2524",
  "Total Likes": "3", "Total Retweets": "1", "Total Views": "3050", "Total Comments": "0",
  "Followers": "9844866", "Followings": "368",
  "State": "National", "Party": "BJP" /* may be missing */, "Category": "Media House",
  "Categories": "['Media House']", "Designation": "-", ... }
```
Indexes: `{"Tweet Date":-1}`, `{ts:-1}`, `{Handle:1,ts:-1}`, `{Party:1,ts:-1}`, `{Category:1,ts:-1}`,
`{"Total Views":-1}`, `{"Total Likes":-1}`, `{"Total Retweets":-1}`, `{"Total Comments":-1}`; TTL on `ts`
(window + 1 day buffer — so **always** filter by `window_start`, never rely on "what is in the collection").

### 3.4 `nazar_handles` — ~3.8k docs
```js
{ _id: "narendramodi", name: "Shri Narendra Modi", party: "BJP", desig: "Prime Minister",
  state: "Uttar Pradesh", pc: "Varanasi", ac: "", cat: "LS_MP",
  fw: 107096494, fg: 2667,                 // followers / following on the latest day seen
  last_day: "2026-10-26", tweets_all: 1590 }
```

### 3.5 Optional: ready-made dashboard numbers
`pulse_hot.india_Pulse__meta` → `{_id:"current", slot:"a"|"b", lastUpdate}` and the full baked dashboard in
`india_Pulse__dashboard_data__<slot>`, `india_Pulse__phd__<slot>`, `india_Pulse__handles__<slot>` (UP: `up_pulse__…`).
Use these only if you want Pulse's exact precomputed blocks; always read `meta.current.slot` first.

---

## 4. Cleaning rules (must match Political Pulse)

1. **Numbers** in `tweets`: remove commas, parse as number, anything invalid → 0.
   In Mongo aggregation:
   ```js
   const num = f => ({ $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: [f, "0"] } }, find: ",", replacement: "" } }, to: "double", onError: 0, onNull: 0 } });
   ```
2. **Sentiment** → code: lower-case, drop every non-alphanumeric character, then map:
   `probjp|prbjp|bjppro→probjp`, `antibjp|bjpanti→antibjp`, `progovt|progov|progovernment→progovt`,
   `antigovt|antigov|antigovernment→antigovt`, `positive|pos→pos`, `negative|neg→neg`, `neutral|neu→neu`,
   anything else (incl. empty) → `none`. Labels: Pro-BJP, Anti-Govt, Pro-Govt, Positive, Neutral, Anti-BJP, Negative, No-Sentiment.
3. **Day** = first 10 characters of `Tweet Date` (already IST). Rows without a valid date are not counted per day.
4. **Politicians vs media**: Political Pulse's All-India KPIs exclude rows whose category is `Media House` or
   `Journalist` (case-insensitive). Do the same for "political" numbers; keep media separately if Nazar shows it.
5. **UP scope** = rows whose State is `Uttar Pradesh`.
6. All "today / last 24 h / this week" logic is in **IST** (UTC+5:30).

---

## 5. Data layer to build (Node example — adapt to Nazar's stack)

```js
// pulseData.js
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.PULSE_MONGO_URL, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
const db = () => client.db('pulse_hot');
let meta = null, metaAt = 0;
async function getMeta() {               // cached 60 s
  if (!meta || Date.now() - metaAt > 60000) { await client.connect(); meta = await db().collection('nazar_meta').findOne({ _id: 'info' }); metaAt = Date.now(); }
  return meta;
}
const prevDay = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

// Totals for [from, to] (IST days, inclusive) with optional filters {party, state, excludeMedia, handle}
async function totals(from, to, f = {}) {
  const m = await getMeta(), ws = m.window_start;
  const out = { tweets: 0, likes: 0, views: 0, retweets: 0, sent: [0,0,0,0,0,0,0,0] };
  if (from < ws) {                                   // history part
    const q = { d: { $gte: from, $lte: to < ws ? to : prevDay(ws) } };
    if (f.party) q.pt = f.party; if (f.state) q.st = f.state; if (f.handle) q.h = f.handle;
    if (f.excludeMedia) q.cat = { $nin: ['Media House', 'Journalist'] };
    const [r] = await db().collection('nazar_daily').aggregate([{ $match: q },
      { $group: { _id: null, tw: { $sum: '$tw' }, lk: { $sum: '$lk' }, vw: { $sum: '$vw' }, rt: { $sum: '$rt' },
                  s0: { $sum: { $arrayElemAt: ['$s', 0] } }, /* … s1..s7 the same way … */ } }]).toArray();
    if (r) { out.tweets += r.tw; out.likes += r.lk; out.views += r.vw; out.retweets += r.rt; }
  }
  if (to >= ws) {                                    // live part
    const q = { 'Tweet Date': { $gte: (from > ws ? from : ws), $lte: to + '~' } };
    if (f.party) q.Party = f.party; if (f.state) q.State = f.state; if (f.handle) q.Handle = f.handle;
    if (f.excludeMedia) q.Category = { $nin: ['Media House', 'Journalist'] };
    const [r] = await db().collection('tweets').aggregate([{ $match: q },
      { $group: { _id: null, tw: { $sum: 1 }, lk: { $sum: num('$Total Likes') }, vw: { $sum: num('$Total Views') },
                  rt: { $sum: num('$Total Retweets') } } }]).toArray();
    if (r) { out.tweets += r.tw; out.likes += r.lk; out.views += r.vw; out.retweets += r.rt; }
  }
  return out;
}
```
Build the other queries the same way (group by `pt`/`Party`, `st`/`State`, `h`/`Handle`, or `d`/`substr(Tweet Date,0,10)`
for daily series), always merging the two parts. For **rolling windows** like "last 24 hours" vs "previous 24 hours",
use only `tweets` with `ts` (both windows are inside the 3-day window).

---

## 6. Nazar cards → formulas

| Nazar shows | Compute |
|---|---|
| "मूल पोस्ट" (posts, last 24 h) and change vs previous period | `tweets` count with `ts ≥ now−24h` vs `now−48h ≤ ts < now−24h`; % change = (cur−prev)/prev |
| "इन पोस्ट पर व्यूज़" | sum of `num(Total Views)` for the same 24 h |
| "सबसे सक्रिय पार्टी" + share | group live tweets (politicians only) by `Party`; share = party posts ÷ posts that have a party |
| "सबसे सक्रिय राज्य" | group by `State`, ignore `National`/empty |
| "… राजनीतिक खातों पर नज़र" | `nazar_handles` count where `cat` not Media House/Journalist (or the mapping count Nazar already uses — state which) |
| "… राज्यों से गतिविधि" | distinct `State` in the period (excluding National/empty) |
| "कुल … पोस्ट का विश्लेषण" (all time) | `nazar_daily` sum `tw` for all days < window_start + live count |
| Any chart over a custom range | `totals()` / grouped variants using the rule in section 1 |
| Top tweets / live feed | `tweets` only, sorted by `ts` or `num(Total Views)`, limit ≤ 100, with projection |

Show "data as of" from the newest `ts` in `tweets` (IST), not from the server clock.

---

## 7. Refresh cycle and limits (free Atlas M0)

- Political Pulse updates Atlas **every hour** (and new tweets within the hour); at IST midnight `window_start`
  moves forward one day and the oldest raw day expires. Nazar needs **no job of its own**: just re-read `nazar_meta`
  each minute and invalidate caches when `updated_at` or `window_start` changes.
- Cache: historical aggregates until `updated_at` changes; live aggregates 60 s; per-request work must hit the cache.
- Limits on M0: 100 operations/second, 500 connections, **10 GB out per 7 days**, 32 MB in-memory sort,
  `allowDiskUse` ignored. So: one shared client (pool ≤ 5), always `$match` before `$group`, always project fields,
  never download whole collections to the server, never poll faster than once a minute, sort only on indexed fields.
- If Atlas is unreachable: keep serving the last good cached numbers and show a small "data may be delayed" note.
  Do **not** crash or show zeros.

---

## 8. Steps on this machine

1. Read Nazar's code first: find where every number/card/list currently comes from (DB, files, other API), and list them.
2. Add `PULSE_MONGO_URL` to `.env` (untracked) and to Render's environment. Add `.env` to `.gitignore` if missing.
3. Create the data layer (section 5) with the cleaning rules (section 4); keep it in one module.
4. Behind a flag (`USE_PULSE_DATA=1`), switch each card/chart/list to the new layer; keep the old path until verified.
5. Add a health route (e.g. `/health/pulse`) returning `window_start`, `updated_at`, counts and the latest `ts` — no secrets.
6. Verify (must pass before turning the flag on in production):
   - For 3 past days (< window_start): tweets/likes/views per day from Nazar = the Political Pulse dashboard's daily numbers for the same day and scope.
   - For today: Nazar's count = `tweets` count for today (`Tweet Date` prefix).
   - A range that crosses `window_start` (e.g. last 7 days) = sum of the two parts, and no day is counted twice.
   - Kill the network to Atlas → Nazar still renders with the cached numbers.
   - Page load does not issue more than a handful of Atlas queries (check logs).
7. Deploy to Render, set the env var there, turn the flag on, watch `/health/pulse` for a day (it must advance every hour and roll over at IST midnight).

## 9. Do not

- Write, update, create indexes in, or drop anything in Atlas — the user is read-only and Political Pulse owns the data.
- Put the connection string in code, git, logs, front-end bundles, or error messages.
- Read `tweets` for days before `window_start`, or `nazar_daily` for days on/after it.
- Use Atlas Data API / App Services endpoints (retired).
