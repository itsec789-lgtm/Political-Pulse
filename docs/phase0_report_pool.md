# Phase 0.4 — What to do with `up_pulse.tweets`

## Who uses it today

| Reader | File:line | What it does |
|---|---|---|
| `/api/report` (Report tab, main server :3000) | `DASHBOARD/server.js` `reportPoolInfo` / `queryTweets` | header info + `$regex` on `text`, optional `date` range, cap 120,000 |
| UP-DASHBOARD server (:3001) | `UP-DASHBOARD/server.js:384` | loads the **whole** collection with `toArray()`. Only started by `UP-DASHBOARD/START_LIVE.bat` / `START_SERVER.bat`; none of the current start scripts launch it. Legacy. |
| Offline HTML export | `UP-DASHBOARD/export_html.js:111` | manual tool, loads whole collection |

Writer: `UP-DASHBOARD/push_tweets.py`, called from `DASHBOARD/push_all_scopes.py` on every run.
It reads all ~2.9M master docs, builds **one Python list of every doc**, then inserts into `tweets__new`
and swaps. Shape: `h, name, text, party, level, sent, date, lk, rt, vw, followers, url, cat` (no tweet id).
Cost: roughly 13–17 of the ~22 min UP stage (UP stage minus a normal dashboard build), ~1.4 GB extra
data on disk (2.8 GB during the swap), and the RAM spike that most likely kills the run on 8 GB.

## Option (a) — incremental copy

Give docs `_id = tweet id`, upsert only touched tweets each run.

- Needs the id (take it from `url`), one full rebuild, then per-run upserts.
- **Gap:** master is also changed outside `upsert_frame`: `x_scraper.js` (Handle Tracker upserts and
  `updateMany` relabels), `push_mapping_to_mongo.py`, `apply_dual_seats.py`, `fix_*.py`, `recover_acpc.py`.
  Today those changes reach the copy only because it is rebuilt in full. Incremental would need hooks
  in all of them, or the copy drifts (wrong party/category in reports).
- Keeps 1.4 GB duplicate data.

## Option (b) — drop the copy, query master directly  **← recommended**

`/api/report` runs the same query on `pulse_master.master_tweets` (`Tweet Text` regex, `Tweet Date`
range) with a projection, and maps each doc to the old short shape. `report_lib.js` is untouched.

- Removes the whole `push_tweets.py` step (~15 min/run) and the RAM spike.
- Always consistent with master (no drift from scraper/mapping updates).
- Same index situation: the date range uses the existing `Tweet Date` index; a keyword regex scans
  the collection in both designs. Master docs are larger, so an unbounded keyword search may be
  slower — measured by `tools/compare_report_pool.js` (timings per query).
- Later (Phase 5) the same code can point at the hot store for recent ranges.

## What is implemented on `feature/hot-cold` (not deployed)

- `DASHBOARD/report_src.js` (new): projection, row mapping (`num`, `level_of` ported 1:1 from
  `push_tweets.py`), master and pool queries. Used by both the server and the comparison tool.
- `DASHBOARD/server.js`: `reportPoolInfo` / `queryTweets` read master by default.
  `PULSE_REPORT_SRC=pool` + server restart = old behaviour (instant rollback).
- `DASHBOARD/push_all_scopes.py`: skips `push_tweets.py` unless `PULSE_REPORT_SRC=pool`.
- `UP-DASHBOARD/push_tweets.py` + `mongo_swap.swap_collection_iter`: when it does run, it now
  streams docs in 5,000-doc batches instead of building one list (safety rule 5).
- `up_pulse.tweets` itself is **not** dropped. That is a separate [ASK] after the switch is proven.

## Acceptance

`node tools\compare_report_pool.js` — for each test query: row counts and times on both sides, rows only
in one side, and field differences. Counters that grew in master since the copy was built are expected and
listed separately.

### Result (26 Oct 13:05–13:12 IST)

The copy in `up_pulse.tweets` was last rebuilt on 23 Oct 18:07 (2,866,457 docs); every rebuild since then
died. Master now has 2,911,846.

| Query | Pool rows / time | Master rows / time | Only in pool | Only in master | Real diffs |
|---|---|---|---|---|---|
| `Akhilesh` (all dates) | 18,571 / 34.5 s | 18,937 / 60.3 s | 0 | 366 | 7 (5 party `''`→`-`, 2 sentiment) |
| `kisan, farmer` 1–20 Oct | 1,048 / 9.6 s | 1,048 / 7.6 s | 0 | 0 | 0 |
| `#Bihar` (all dates) | 7,433 / 38.0 s | 7,601 / 68.5 s | 0 | 168 | 11 (party `''`→`-`) |
| `Yogi` 10–15 Oct | 3,431 / 3.3 s | 3,431 / 1.6 s | 0 | 0 | 0 |
| `GST` from 1 Sep | 3,799 / 14.5 s | 3,928 / 23.3 s | 0 | 129 | 3 (party `''`→`-`) |
| `Operation Sindoor` to 31 Aug | 332 / 24.7 s | 332 / 40.0 s | 0 | 0 | 0 |

- **No row is ever lost** (only-in-pool = 0 everywhere). Closed date ranges before 23 Oct match exactly,
  field by field.
- Every difference is newer data in master: tweets added after 23 Oct, counters that grew, and labels
  changed since (media-house `Party` now `-` instead of empty; 2 re-tagged sentiments). The old copy
  would have shown the same after its next successful rebuild.
- **Trade-off:** keyword searches over *all dates* are ~1.7× slower on master (bigger documents to scan;
  Laptop 1 had only ~700 MB RAM free). Searches with a recent date range are the same or faster.
  Phase 5 moves recent-range reports to the hot store, which removes most of this cost.
- Rollback is one setting: `PULSE_REPORT_SRC=pool` (+ server restart).

