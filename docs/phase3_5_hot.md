# Phase 3 (writes to HOT), 4.2 (dashboards to HOT), 5 (website reads), 7 (guard)

Everything here is **inactive until** `db_config.local.json → hot.url` is filled and `hot.enabled` is `true`.
With HOT off (or Atlas unreachable) every path is exactly today's behaviour.

## Writes (Phase 3)
| Where | What goes to Atlas `pulse_hot.tweets` |
|---|---|
| `master_to_mongo.upsert_frame` | the same `UpdateOne` ops for rows whose `Tweet Date` is inside the window, plus `ts` (UTC, for TTL) |
| `x_scraper.js` (Handle Tracker) | same ops for its tweets inside the window (`hotMirror`); relabels via `updateMany` (`hotRelabel`) |
| `hot_sync.py --resync` | whole window copied cold → hot (ReplaceOne by `_id`), max once a day, or when `.hot_resync` exists |

Any HOT error: log `HOT SYNC FAIL`, write `DASHBOARD/.hot_resync`; cold ingest and the dashboard build continue.
Indexes (`hot_sync.py --init`): TTL `ts` = (days+1)·86400 s; `{Handle,ts}`, `{ts}`, `{Party,ts}`, `{Category,ts}`;
for Phase 5 sorts: `Tweet Date`, `Total Views/Likes/Retweets/Comments` (desc).

## Dashboards (Phase 4.2)
`update_dashboard.push_mongo` (both) → `hot_push.push`: `dashboard_data`, `phd`, `handles` into the inactive slot
`<scopeDB>__<coll>__a|b`, count check, then `<scopeDB>__meta.current` flips. `push_all_scopes` stamps the same
`lastUpdate` on Atlas only if this run pushed. No renameCollection needed.

## Website (Phase 5)
| Route | Store |
|---|---|
| dashboard page (`buildDashBase`) | Atlas slot **only if** its `lastUpdate` == local `lastUpdate`; else local |
| `/api/tw/top`, `/api/tw/list` | HOT when `from` ≥ window start; else cold (`source: archive` on list) |
| news feed (`newsWindow`, `/api/news*`) | HOT first; cold if HOT has fewer than 4,000 media tweets |
| `/api/report` | HOT when `from` ≥ window start; older ranges cold with an "archive" note |
| `/api/live` (Nazar/live badge) | newest tweet + "fresh" count from HOT (cold if HOT has none for that scope); all-time `total` stays an indexed count on cold |
| `/api/narrative-groups/stats`, `/leader-analysis/:h`, `/comparison`, `/api/parties/comparison` | HOT when `from` ≥ window start; else cold with `source: "archive"` |
| `/api/ha/*` (Handle Analytics) | cold: its smallest range is 7 days counted from the handle's newest tweet, always wider than the 3-day window |
| admin count/download/hashtags exports | cold (by plan) |
Pages show a small "loaded from the archive" note when a tweet list / narrative / parties answer comes back with `source: "archive"`
(fetch hook at the end of both `dashboard.template.html`).
Test: `tools/test_routes_hot.js` starts this checkout's server on port 3001 (`PULSE_PORT`, `PULSE_TEST_NO_JOBS=1` = no mapping
sync/tracker) with HOT on, HOT off and a wrong Atlas URL; every answer must be identical. 26 Oct 2026: 12/12 PASS.
Every HOT read falls back to cold on any error (`onTweets`). `/admin/hot-status` shows on/off, healthy,
window start, size, last resync, read counters, guard state.

## Guard (Phase 7)
`hot_sync.py --check` after every pipeline push: per-day counts hot vs cold, Atlas size. Above `max_mb` (400) →
window 5 days (TTL + cutoff, `HOT WINDOW REDUCED`); under 300 MB → back to 7 and a fresh resync.

## Free-tier limits that matter (MongoDB docs, checked 26 Oct 2026)
0.5 GB storage, 10 GB in + 10 GB out per rolling 7 days, 100 ops/s, 500 connections, in-memory sort 32 MB,
`allowDiskUse` ignored. Our traffic: write-through ~70–100 MB/day, dashboards ~50 MB per pipeline run,
daily resync ~150 MB → roughly 4–8 GB/week in. Watch `/admin/hot-status`.
