# Phase 2 hooks + Phase 4 "SPLIT" build (on branch, default OFF)

## Keeping the summary fresh (dirty days)
| Writer | Hook |
|---|---|
| `master_to_mongo.upsert_frame` (pipeline ingest) | `mark_dirty(c, days)` after the bulk write — every `Tweet Date[:10]` written |
| `x_scraper.js` (Handle Tracker: scrape + release held tweets) | `markDirtyDays` after each bulkWrite |
| `x_scraper.js` relabel (`updateMany` when a handle gets mapped) | `markDirtyHandle` — all days of that handle |
| `push_mapping_to_mongo.py` (RUN_MAPPING_UPDATE) | marks `ALL` (full rebuild, ~4.5 min) |
| anything else (`fix_*.py`, `apply_dual_seats.py`, manual edits) | nightly `build_daily_summary.py --verify` compares every (handle, day, labels) group with cold and marks differing days |

All hooks are wrapped so a failure only logs `summary_dirty mark skip` — ingest never fails because of them.

## Build source
`read_csv_agg('SPLIT')` (both `update_dashboard.py` copies) → `summary_agg.split_agg`:
- rebuilds any summary day still dirty before the cutoff (inline), then
- raw part: the module's own `read_csv_agg` with `{'Tweet Date': {'$gte': cutoff}}` (cutoff = `hot_conf.window_cutoff()`, 7 days),
- summary part: `daily_summary` rows with `d < cutoff` (+ `daily_words` for the Word Cloud),
- returns the same 11 accumulators, so `build()` is untouched.
- If SPLIT fails for any reason the build prints `SPLIT nahi chala` and does the full MONGO read (today's behaviour).
UP `top_viral`: index query on `Total Views` instead of a full scan.

`run_pipeline.build_source()`: `MONGO` unless `db_config.local.json` → `"build": {"source": "SPLIT"}`
(or env `PULSE_BUILD_SRC=SPLIT`). With SPLIT: once a day `--verify`, every run `--dirty`, then build;
any summary error → this run uses MONGO.

## Switch-on steps (each needs OK)
1. Merge the branch commits to `main` (hooks start marking days; build still MONGO).
2. `build_daily_summary.py --all --live` once (≈4.5 min, pipeline idle).
3. Set `"build": {"source": "SPLIT"}` in `C:\Main Twitter Project\db_config.local.json`. Rollback = set it back to `MONGO`.

## Results (26 Oct 2026, same data, `tools/compare_builds.py`, test summary)

| Build | MONGO (today) | SPLIT |
|---|---|---|
| All-India | 242 s | **44 s** |
| UP | 221 s | **25 s** |

Every dashboard key and collection is **identical** (UNI, PARTY_DATA, STATE_DATA, DAILY_DATA, phd, handles, AGG,
CM_DATA, SENT_DAILY, HASHTAGS, …). `mapping`, `D.handles`, `HTFULL`, `WORDCLOUD` differ **only in the order of
items that have equal values** (ties). Word Cloud counts are exact after storing full per-day word lists
(`daily_words` ≈ 102 MB data / 51 MB on disk). `--verify` on the full test summary: 0 days differ (73 s).
Dirty-hook test (`tools/test_dirty_hook.py`): PASS.
