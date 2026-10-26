# Hot/Cold storage — one-page summary (Laptop 1, 26 Oct 2026)

## What changed
- **COLD** = local MongoDB `pulse_master.master_tweets` (2.91M tweets). Still the source of truth; nothing deleted.
- **Daily summary** = `pulse_master.daily_summary` (one row per handle × day × row labels) + `daily_words`.
  Builds read the summary for old days and raw tweets only for the window ("SPLIT" build).
- **HOT** = MongoDB Atlas M0, database `pulse_hot`: last **3 days** of tweets (TTL), plus a copy of the built
  All-India / UP dashboards (two slots + `meta.current`, so readers never see a half-written copy).
- Writes to HOT: pipeline ingest (`upsert_frame`), Tracker (`x_scraper.js`), mapping relabel (`push_mapping_to_mongo.py`),
  daily `hot_sync --resync`. Any HOT failure → `HOT SYNC FAIL` in the log + `.hot_resync` flag → next run re-copies the window.
- Website: HOT when the requested range starts inside the window, COLD otherwise (with an "archive" note);
  any HOT error → COLD automatically. Route table: `docs/phase3_5_hot.md`.
- All HOT connections use zlib compression (free tier: 10 GB in / 10 GB out per week).

## Before → after
| | Before | After |
|---|---|---|
| Hourly pipeline (with new data) | ~70 min (UP stage 12–30 min, often killed) | ~9.4 min (India 43 s, UP 20 s) |
| Report query on master | 38–49 s (no index) | < 0.2 s (`_first` index) |
| Dashboard numbers | full scan of 2.9M tweets | identical (`compare_builds.py`: UNI, PARTY_DATA, STATE_DATA, DAILY_DATA, phd exact) |
| Atlas size | — | ~143 MB data (tweets 33 MB, dashboards 2 slots) of 512 MB |
| HOT on / off / wrong URL | — | identical answers (`tools/test_routes_hot.js`, 12/12) |

## Switches
- `HOT_ON.bat` — test Atlas, enable, copy window, copy dashboards, restart site. `HOT_OFF.bat` — back to local only.
  `HOT_STATUS.bat` — size and counts. Browser: `/healthz` (`checks.hot`), `/admin/hot-status`.
- Config: `db_config.local.json` (not in git): `hot.enabled/url/db/days/max_mb`, `build.source` (`SPLIT` | `MONGO`).

## Rollback
1. `HOT_OFF.bat` (or `hot.enabled = false` + restart server) → website reads only local, exactly as before.
2. Build: `build.source = "MONGO"` in `db_config.local.json` → old full-scan build. Report: env `PULSE_REPORT_SRC=pool`.
Nothing else is needed: COLD always has everything.

## Not done / later
- Punjab (`PunjabLens`) still builds on its own path. It can use the same summary with a row-State filter
  (`st == "Punjab"`), exactly like the UP build does — not switched in this project.
- After a manual fix script on `master_tweets` (`fix_*.py`, `recover_acpc.py`, `backfill_*`), run
  `python build_daily_summary.py --all --live` and `python hot_sync.py --resync --force` (the nightly verify and the
  daily resync would also catch it within a day).
- Test collections (`daily_summary_test`, `daily_words_test`, old `up_pulse.tweets`) kept until the owner OKs deleting them.
