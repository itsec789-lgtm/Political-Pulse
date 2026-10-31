# Political Pulse — Hot/Cold Storage: Implementation Plan for Laptop 1

**For:** Claude Code running on Laptop 1 (`DESKTOP-L6LFLP5`, the always-on production machine, repo `c:\Main Twitter Project`)
**From:** Harshit (plan prepared on Laptop 2, 26 Oct 2026)
**Goal:** Move the live dashboard's reads to a small MongoDB Atlas "hot" database holding only the last 7 days, while the local MongoDB stays the full "cold" archive. All-time numbers come from daily summaries, so the dashboard never re-reads the full history.

> Claude on Laptop 1: read this whole file first. Then read the code it names before changing anything. Follow the safety rules in Section 2 at all times. Work phase by phase, and stop for Harshit's OK at every step marked **[ASK]**.

---

## 1. What is decided (do not change without asking Harshit)

| Decision | Value |
|---|---|
| HOT store | MongoDB Atlas free tier (M0, 512 MB), Mumbai region. Database name `pulse_hot`. |
| HOT window | **7 days** of raw tweets = today + the previous 6 calendar days, in IST. Keep it as a config value (`hot.days`), default 7. |
| COLD store | The current local MongoDB (`pulse_master.master_tweets`, 2.87M tweets). It stays the source of truth. Nothing is ever deleted from it. |
| All-time numbers | **Daily summary** (one row per handle per day) for days before the window **+** a live count of the 7 hot days. The dashboard must never scan the full cold collection to show totals. |
| Website reads | HOT by default. COLD only for date ranges older than the window, long reports and exports. If HOT is down, fall back to COLD automatically (exactly today's behaviour). |
| Ingest | Unchanged: network share → `run_pipeline.py` → cold. HOT gets a copy of only the tweets inside the window. |
| On/off switch | `hot.enabled` in config. `false` = the system behaves exactly as today. |

**Load balancing in one line:** Laptop 1 does ingest, archive and the nightly summary. Atlas serves the dashboard. The full history is touched only when someone asks for old data.

---

## 2. Safety rules (mandatory)

1. **Never edit code inside `c:\Main Twitter Project` directly.** `auto_sync_github.py` pulls `origin/main` every 60 s, and on divergence it runs `git reset --hard origin/main`, which wipes uncommitted work. The running pipeline also reloads modules every hour, so a half-edited file would run in production.
   → Work in a **separate git worktree** on a branch:
   ```
   cd "c:\Main Twitter Project"
   git worktree add "c:\pulse-hotcold" -b feature/hot-cold
   ```
   Do all work in `c:\pulse-hotcold`. Push only the branch `feature/hot-cold`, **never `main`**. Merging into `main` happens only in Phase 6, with Harshit's OK, because merging is the deploy.
2. **Never put secrets in tracked files.** `db_config.json` is tracked in git. The Atlas connection string goes in a NEW file `db_config.local.json` (add it to `.gitignore` in the same commit that creates the loader), or in the env var `MONGO_HOT_URL`. Never print the full URL in logs or chat. Mask the password.
3. **Never write to live collections during development.** Use test targets:
   - local: `india_Pulse_test`, `up_pulse_test`, `pulse_master.daily_summary_test`
   - Atlas: database `pulse_hot_test`

   Live names are switched on only in Phase 6.
4. **Read-only on `pulse_master.master_tweets`**, except the index in Phase 0 **[ASK]** and the dirty-day hook in Phase 3. No deletes, no renames, no `drop` on any cold collection.
5. **Laptop 1 has 8 GB RAM.** Never load all 2.87M tweets into a Python list (the current `UP-DASHBOARD/push_tweets.py` does this; fix it). Stream with cursors and batch writes (≤ 5,000 per batch).
6. **Don't run heavy jobs while the live pipeline is mid-run.** Check `DASHBOARD/.pipeline.lock` first. One-time backfills: run them when Harshit says, preferably at night.
7. If something unexpected shows up (data that doesn't match this plan, a failing step, numbers that don't reconcile), **stop and report**. Don't work around it silently.

---

## 3. Facts measured on Laptop 1 (26 Oct 2026)

- `pulse_master.master_tweets`: 2,866,457 docs, 3,130 MB data, 503 MB indexes, avg 1,145 bytes/doc.
- `Tweet Date` is a **string**: `"YYYY-MM-DD HH:MM:SS IST"`. `_first` is a string `"YYYY-MM-DD"` (insert date) and **has no index**.
- There is no "last updated" field on tweets. `master_to_mongo.upsert_frame` uses `$max` (numbers), `$set` (non-blank text), `$addToSet` (Source Folders) and `$setOnInsert` (`_first`).
- Volume: about 25,000 tweets per working day. Last 7 working days = 138,236 tweets = **146 MB**. Busiest week (7–13 Oct) = 183,916 tweets ≈ 210 MB.
- `up_pulse.tweets` = a **full 1.78 GB copy of all 2.87M tweets**, rebuilt every run by `UP-DASHBOARD/push_tweets.py` (held in RAM, then swapped). This is the main cause of the 21.5-minute UP stage.
- A pipeline run takes about 70 min: India 8.5, UP 21.5, Punjab 3.5, CSV backup 23 (first run of the day only, already guarded by `BACKUP_MARK`), daily report 8.
- The slowest queries are `aggregate` with `$match: {_first: ...}` doing a COLLSCAN (68–77 s each), and `up_pulse.tweets getMore` (125 s).
- Outbound TCP 27017 is open (Atlas reachable). Local Mongo 8.3.8, auth off, bound to 127.0.0.1.
- The network share `\\192.168.2.85\d` has been unreachable since 23 Oct, so ingestion is halted (operations issue, see Section 5).

**Atlas budget (target ≤ 400 MB, hard limit 512 MB):**

| Item | Normal week | Busiest week |
|---|---|---|
| Hot tweets (7 days) | 146 MB | 210 MB |
| Indexes on hot tweets | ~25 MB | ~30 MB |
| Dashboard results (All-India + UP) | ~52 MB | ~52 MB |
| Daily summary mirror (optional, see Phase 2) | ≤ 60 MB | ≤ 60 MB |
| **Total** | **~285 MB** | **~350 MB** |

---

## 4. Phases

Each phase ends with a short report to Harshit: what changed, how it was tested, and the numbers.

### Phase 0 — Quick wins on the current system (no Atlas needed)

1. **Baseline.** From `DASHBOARD/pipeline.log`, record the stage timings of the last 5 full runs. Save them in `c:\pulse-hotcold\docs\baseline.md`.
2. **[ASK] Index `_first`** on the live `pulse_master.master_tweets`: `create_index([('_first', 1)])`. This is non-destructive and may take a few minutes. Run it when the pipeline is idle. Re-run one slow `_first` aggregation and record the before/after time.
3. **Find all `_first` queries** (`daily_report.py`, `server.js`, `hreq_admin.js`, the rest) and check that they now use the index (`explain()`).
4. **Stop the full rebuild of `up_pulse.tweets`.** Read who uses it: `server.js` `/api/report` (around lines 4660–4930), `report_lib.js`, `UP-DASHBOARD/server.js`. Then pick the smaller safe change:
   - **(a) Incremental:** give docs `_id = tweet id` and upsert only the tweets touched in this run. `run_pipeline.py` already has each `df` it passes to `upsert_frame`, so collect those IDs, or use the dirty-day list from Phase 3. Do a one-time full build into `up_pulse.tweets_new`, then swap once.
   - **(b) Drop the copy:** point `/api/report` at `master_tweets` using its existing indexes (`Handle`, `Party`, `Category`, `Tweet Date`) and a projection.

   Write a short comparison in the phase report and recommend one. **[ASK]** before switching. Acceptance: the same report query returns the same rows before and after; no step loads all tweets into RAM.
5. Phase 0 is merged to `main` on its own **[ASK]** because it gives value even if Atlas is delayed.

### Phase 1 — Config and connections

1. Add a `hot` section, read from `db_config.local.json` (untracked) with env overrides:
   ```json
   { "hot": { "enabled": false, "url": "mongodb+srv://...", "db": "pulse_hot", "days": 7, "max_mb": 400 } }
   ```
   Env overrides: `MONGO_HOT_URL`, `PULSE_HOT_ENABLED`, `PULSE_HOT_DAYS`.
2. `DASHBOARD/mongo_conf.py` and `mongo_conf.js`: expose `HOT` settings next to `MONGO_URL`. Keep the existing behaviour byte-for-byte when `hot` is missing.
3. `DASHBOARD/mongo_pool.js`: add a second pool `hotClient()` with short timeouts (server selection ~4 s) and `hotHealthy()` (cached ping, rechecked every 30 s).
4. Add a shared helper (Python + JS) `window_cutoff()` that returns the IST date string of the first day in the hot window (`today_IST - (days-1)`). Use it everywhere; never compute the cutoff inline.
5. Copy the same `mongo_conf` changes into `UP-DASHBOARD/` and `PunjabLens/` if they have their own copies (they do; check).
6. Test: with `hot` empty, run the normal pipeline against test DBs and confirm nothing changed.

### Phase 2 — Daily summary (the "smart totals")

**Purpose:** everything the dashboard shows for days *before* the window must come from small per-day rows, not from raw tweets.

1. **Read first:** `DASHBOARD/update_dashboard.py` (`read_csv_agg`, `build`), `UP-DASHBOARD/update_dashboard.py`, `push_all_scopes.py`, and the Punjab builder. List every dashboard key they produce (`AGG, CM_DATA, D, DAILY_DATA, GROWTH, HANDLES, HASHTAGS, HTFULL, MLA_DATA, PARTY_DATA, PARTY_HANDLES, STATE_DATA, TWEETS, UNI, HROLE, WORDCLOUD, SENT_DAILY`, plus `phd`, `handles`). For each one, write down how it can be rebuilt from daily rows. Put this table in `docs/summary_design.md` and show it to Harshit **[ASK]** before coding.
2. **Collection** `pulse_master.daily_summary`, one doc per handle per IST day:
   ```
   _id: "<handle>|<YYYY-MM-DD>",  h, d,
   tw, lk, vw, rt, cm, bm,                 # sums for that day
   s: {probjp, antigovt, progovt, pos, neu, neg, antibjp, nosent},   # 8-class counts
   hr: [24 ints] (only if a dashboard key uses hourly),
   ht: {tag: count} (top N per handle-day, N chosen to fit the budget),
   top: [ {id, lk, vw, rt} x up to 5 ]     # for all-time "top tweets"
   ```
   Rules that matter:
   - **Do not store party, state or designation in the summary.** Join `Mapping.xlsx` / `handle_master.json` at build time, so a mapping change re-labels history correctly, as it does today.
   - Followers and similar "latest value" fields are **not summed**. Keep a per-handle "latest snapshot" (max/last), as the current code does.
   - Word cloud: keep per-day scope-level word counts (top 300 per day), not per handle, unless the current code needs per-handle words.
   - Use the same sentiment normalisation (8 classes) and the same tweet-date parsing as `update_dashboard.py`. Import the functions; don't copy them.
3. **Builder** `DASHBOARD/build_daily_summary.py`:
   - `--all`: one-time backfill, streaming over cold with a cursor (projection of needed fields only, `batch_size(5000)`). Run at night **[ASK]**.
   - `--days 2026-10-20,2026-10-21`: recompute only those days (delete + insert per day, inside the summary collection only).
   - `--dirty`: recompute days listed in `pulse_master.summary_dirty`, then clear them.
4. **Dirty days:** in `master_to_mongo.upsert_frame`, collect the set of `Tweet Date[:10]` values written in that call, and upsert them into `pulse_master.summary_dirty` (`{_id: date}`). This is how old tweets whose likes keep growing get their day's totals refreshed. It's cheap: only the touched days are recomputed.
5. **Reconcile (acceptance):** for every day, summary totals == an aggregate over cold for that day (tw, lk, vw, rt), and the summed all-time totals == today's `UNI.tot` from `india_Pulse.dashboard_data`. Report any difference and its cause.
6. **Optional mirror to Atlas** (`pulse_hot.daily_summary`), only if its size is ≤ 60 MB. This lets date-range charts older than 7 days (narrative groups, party comparison, leader trends) be served from Atlas without touching cold. Measure first and report.

### Phase 3 — Writing tweets to HOT

1. **Write-through** in `master_to_mongo.upsert_frame`: after the cold `bulk_write`, build the same `UpdateOne` ops for rows whose `Tweet Date[:10] >= window_cutoff()` and send them to `pulse_hot.tweets`. Add the field `ts` = a real UTC `datetime` parsed from the IST string (needed for TTL).
2. **HOT must never break COLD.** Wrap the whole hot write in try/except, log it as `HOT SYNC FAIL`, and set the flag file `DASHBOARD/.hot_resync`. Cold ingest and the dashboard build continue normally.
3. **TTL index** on `pulse_hot.tweets.ts` with `expireAfterSeconds = (days + 1) * 86400`. The +1 day buffer means a full IST day is never cut early. Queries still filter by `window_cutoff()`, so the extra day is never shown.
4. **Hot indexes, minimal:** `{Handle:1, ts:-1}`, `{ts:-1}`, `{Party:1, ts:-1}`, `{Category:1, ts:-1}`. Add others only if a Phase 5 route needs them; each costs Atlas space.
5. **`DASHBOARD/hot_sync.py`:**
   - `--resync`: copy the window from cold to hot (upsert by `_id`, ~140k docs). Use it for the first seed and after a `.hot_resync` flag. Limit it to once per day, to stay within Atlas free-tier data-transfer limits. Check the current M0 limits in the Atlas docs and note them in `docs/atlas_limits.md`.
   - `--check`: compare counts per day hot vs cold inside the window, and report the Atlas size (`dbStats`).
6. `run_pipeline.py`: if `.hot_resync` exists at the start of a run, run `hot_sync --resync` once, then clear the flag.

### Phase 4 — Faster build: summary + hot

1. Add a build source `"SPLIT"` next to the existing `"MONGO"` and CSV sources (see `src_chunks.py`, `push_all_scopes.push_all`):
   - **archive part** = `daily_summary` rows with `d < cutoff` (from cold, local, fast)
   - **live part** = raw tweets with `d >= cutoff`, read from HOT, or from cold with a `Tweet Date >= cutoff` filter as a fallback
   - merge into the same accumulators, then produce **the same output structures** as today.
2. Write outputs to the local `india_Pulse` / `up_pulse` (as today, kept as the fallback) **and** to Atlas `pulse_hot` (dashboard collections). If Atlas M0 doesn't allow `renameCollection` for the swap pattern, use versioned docs plus a `meta.current` pointer instead. Verify which works and document it.
3. **Verification (acceptance, mandatory):** run the old `"MONGO"` build into `*_test` DBs and the new `"SPLIT"` build into `*_test2` DBs from the same data, then diff every key with a script `tools/compare_builds.py`.
   - `UNI` totals, `PARTY_DATA`, `STATE_DATA`, `DAILY_DATA` and `phd` must match **exactly**.
   - Ordering-only or float-rounding differences: list them and explain.
   - Anything else: stop and report.
4. Target: India + UP build time drops from ~30 min to a few minutes. Record the actual numbers.
5. Punjab (`political_lens`): leave it on its current path in this project. Only report how it could use the same summary later.

### Phase 5 — Website reads (server.js)

1. A helper `pickStore(fromDate, toDate)` returns `hot` if `hot.enabled`, `hotHealthy()` and `fromDate >= window_cutoff()`. Otherwise it returns `cold`. Every route uses it; no route chooses a database on its own.
2. Routes to move (all currently read `pulse_master.master_tweets` or `up_pulse.tweets`. Find every `collection('master_tweets')` and `collection('tweets')` in `server.js`, `ha_lib.js`, `report_lib.js`, `live_lib.js`, `news_lib.js`, `hreq_admin.js`, `tracker_section.js`):
   - `/api/live`, `/api/live-snapshot`, `/api/live-search`, `/api/live-person`, Nazar views → hot (7-day default)
   - `/api/tw/top`, `/api/tw/list` → hot
   - `/api/ha/*` → hot for the default range, cold for older ranges
   - `/api/narrative-groups/*`, `/api/parties/comparison` → summary (hot mirror if present) for daily series; hot or cold for tweet lists by range
   - `/api/report`, CSV exports → `pickStore`; long ranges go to cold
   - `buildDashBase` (the baked dashboard) → read `dashboard_data` / `phd` from hot, falling back to local
3. HOT tweets keep **the same field names** as `master_tweets`, so queries port unchanged. Only the date filter changes (use `ts` or `Tweet Date`, which compare correctly as strings).
4. When a request goes to cold for an old range, return a flag (`source: "archive"`) so the UI can show a small "loading from archive" note.
5. Admin status: show hot on/off, healthy, window start, Atlas size, last sync and last error.
6. Test each route with hot on, hot off and hot unreachable (wrong URL). All three must work.

### Phase 6 — Cutover [ASK at every step]

1. Merge `feature/hot-cold` into `main`, with Harshit's OK. Auto-sync then deploys it to `c:\Main Twitter Project`.
2. Point the build and server at the live names (`pulse_hot`, not `pulse_hot_test`), still with `hot.enabled = false`. Run one pipeline and check it.
3. Set `hot.enabled = true` in `db_config.local.json` and restart `server.js`.
4. Watch for 24 hours: compare KPIs hot vs cold every few hours (`hot_sync --check` + `compare_builds`), and watch the Atlas size and pipeline time.
5. **Rollback** = set `hot.enabled = false` and restart the server. Nothing else is needed, because cold always has everything.

### Phase 7 — Guard and monitoring

1. Each run: Atlas `dbStats`. Above `hot.max_mb` (400), set the effective window to 5 days (TTL + cutoff), log `HOT WINDOW REDUCED`, and show it in admin. Go back to 7 automatically when the size drops under 300 MB.
2. The nightly `build_daily_summary --dirty` runs from `run_pipeline.py` on the first run after midnight IST.
3. Log every hot failure in `pipeline.log` with a clear prefix (`HOT`).

---

## 5. Manual tasks for Harshit on Laptop 1 (Claude cannot do these)

| When | Task |
|---|---|
| Now | **Fix the network share.** `\\192.168.2.85\d` has been unreachable since 23 Oct, so no new tweets are coming in. Check that the machine at 192.168.2.85 is on and reachable (`Test-NetConnection 192.168.2.85 -Port 445`), then re-run `net use \\192.168.2.85\d /persistent:yes` if needed. |
| Now | **Start the website and pipeline** (both are currently stopped): `DASHBOARD\RUN_SERVER.bat` (or `START_LOCAL.bat`) and `START_LIVE.bat`. |
| Now | **Power settings:** set Laptop 1 to never sleep or hibernate when plugged in, so it stays always on. |
| Before Phase 1 | **Create Atlas:** sign up, create a free **M0** cluster in **AWS Mumbai (ap-south-1)**, then create a database user with a strong password. |
| Before Phase 1 | **Atlas network access:** add Laptop 1's public IP (check at whatismyip). If the office IP changes often, tell Claude; allowing 0.0.0.0/0 is a last resort and needs a strong password. |
| Before Phase 1 | **Put the connection string in `c:\pulse-hotcold\db_config.local.json`** yourself (Claude creates the empty file and `.gitignore` entry first). Never paste the password into chat, git or any tracked file. |
| Each [ASK] | Approve: the `_first` index, the `up_pulse.tweets` change, the summary design, the one-time backfill time, each merge to `main`, and the cutover. |
| After merge | Restart `server.js` and `START_LIVE.bat` when Claude asks (code reload). |
| During the project | **Don't push to `main` from Laptop 2** while this work is in progress, so Laptop 1 isn't auto-updated mid-change. |
| Optional, later | Run the pipeline and server from **Windows Task Scheduler** so they survive reboots and logouts. Turn on **MongoDB authentication** before the database is ever reachable from another machine. |

---

## 6. What changes on the primary computer (Laptop 1)

**New files:** `db_config.local.json` (untracked), `DASHBOARD/build_daily_summary.py`, `DASHBOARD/hot_sync.py`, a shared window/cutoff helper (py + js), `tools/compare_builds.py`, `docs/baseline.md`, `docs/summary_design.md`, `docs/atlas_limits.md`.

**Modified files (expected):** `.gitignore`, `DASHBOARD/mongo_conf.py`, `mongo_conf.js`, `mongo_pool.js`, `master_to_mongo.py`, `run_pipeline.py`, `push_all_scopes.py`, `src_chunks.py`, `update_dashboard.py` (DASHBOARD and UP-DASHBOARD), `UP-DASHBOARD/push_tweets.py`, `server.js`, `ha_lib.js`, `report_lib.js`, `live_lib.js`, and the `mongo_conf` copies in `UP-DASHBOARD/` and `PunjabLens/`.

**New in local MongoDB:** index `_first` on `master_tweets`; collections `pulse_master.daily_summary` and `pulse_master.summary_dirty`; test DBs `*_test` (drop them after cutover, with OK).

**New in Atlas `pulse_hot`:** `tweets` (7 days, TTL), the dashboard collections (dashboard_data, phd, handles, meta for All-India and UP), and optionally `daily_summary`.

**Unchanged:** the network share layout, `auto_state.json`, `Mapping.xlsx` as the source of truth, the `$max` merge rule, and every cold collection's data.

---

## 7. Done when

- [ ] A normal hourly pipeline run takes **under 15 minutes** (was ~70), with the timings recorded.
- [ ] The new build's `UNI`, `PARTY_DATA`, `STATE_DATA`, `DAILY_DATA` and `phd` match the old build exactly on the same data.
- [ ] Atlas size is under 400 MB, and `hot_sync --check` shows hot == cold per day inside the window.
- [ ] Dashboard pages load from Atlas, and older date ranges load from cold with the "archive" note.
- [ ] `hot.enabled = false`, or a wrong Atlas URL, gives today's behaviour with no errors.
- [ ] No step loads all tweets into memory, and no secret is in git.
- [ ] Harshit has a one-page summary: what changed, before/after numbers, and how to roll back.

---

## 8. First message to send back to Harshit

Before writing any code, reply with:
1. confirmation that the worktree `c:\pulse-hotcold` on `feature/hot-cold` exists
2. the Phase 0 baseline timings
3. the list of every place that reads `master_tweets` / `up_pulse.tweets`, with file:line
4. any part of this plan that doesn't match what you see in the code
