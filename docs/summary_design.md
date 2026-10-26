# Phase 2 — Daily summary design (for approval)

Goal: the All-India and UP dashboard builds stop reading 2.9M raw tweets every hour. Days before the
hot window come from small per-day rows (`pulse_master.daily_summary`); only the last 7 days are read raw.

Source read: `DASHBOARD/update_dashboard.py` (`read_csv_agg`, `case_merge`, `map_gate`, `build`),
`UP-DASHBOARD/update_dashboard.py` (same + `top_viral`, UP-only keys), `push_all_scopes.py`.

## 1. What the build reads from each tweet today

`read_csv_agg` streams every tweet once and keeps these accumulators:

| Accumulator | Keyed by | Uses tweet fields |
|---|---|---|
| `acc` (per handle totals) | handle | tw count, likes, RTs, views, 8 sentiment codes |
| `daily` | handle, date | tw, views, likes, RTs |
| `meta` | handle | latest row's name/party/designation/state/PC/AC (only used when the mapping is empty), followers/followings of the latest non-zero row |
| `htag`, `htag_daily` | hashtag (, date) | count, likes, views, sentiment |
| `htag_party`, `htag_party_daily` | **row `Party`**, hashtag (, date) | same |
| `sdaily` | **row `State`**, date, sentiment | count |
| `words` | word | count (Word Cloud) |
| `hourly` | hour 0–23 | count |

Filters before counting: UP build keeps rows with **row** `State == "Uttar Pradesh"`; All-India build drops rows
whose **row** `Category` is Media House / Journalist. After counting: `case_merge` (handle spelling variants)
and `map_gate` (deliberately removed handles) work on handle-level data only.

Two details that decide the design:
- `acc` counts **every** row of a handle, including rows whose date is not `YYYY-MM-DD…`; `daily` skips them.
  So totals ≠ sum of daily rows if such rows exist. The summary keeps them in a special day `"_nodate"`.
- Hashtag-by-party and sentiment-by-state use the tweet's **own** `Party` / `State` field, not the mapping.

## 2. Summary document (one per handle × day × row-labels)

```
_id : "<handle>|<day>|<row State>|<row Party>|<row Category>"   (usually exactly one per handle-day)
h, d, st, pt, cat                        # raw row values; d = "_nodate" for bad dates
tw, lk, vw, rt                           # sums
s   : {probjp, antigovt, progovt, pos, neu, neg, antibjp, nosent}   # same sent_code() as today
hr  : [24 ints]                          # tweets per hour
ht  : {tag: [count, likes, views, s0..s7]}   # every hashtag of the day (they are few per handle-day)
last: {dt, name, party, desig, state, pc, ac}    # latest row of that day (for meta fallback)
fol : {dt, fw, fg}                       # latest NON-ZERO followers row of that day
```
Plus one doc per day and scope for words: `daily_words` `_id: "<scope>|<day>"`, `w: {word: count}` (top 2,000).

Why the row labels are in the key (the plan said "don't store party/state"): the current dashboard groups
hashtags by row Party and sentiment-trend by row State, and filters UP/media by row State/Category. Keeping
them as key parts (not as mapping labels) reproduces today's numbers exactly. Mapping labels (party, state,
level shown on cards) are still joined at build time from `handle_master.json`, exactly as today, so a mapping
change re-labels history without touching the summary.

## 3. Every dashboard key and how it is rebuilt

| Key | Built today from | Rebuilt from summary | Exact? |
|---|---|---|---|
| `UNI.tot`, `UNI.handles`, `UNI.level`, `UNI.party`, `UNI.states`, `UNI.sent` | `acc` + `meta` (mapping) | sum `tw/lk/vw/rt/s` per handle (incl. `_nodate`) | yes |
| `UNI.allHandles` | `acc` + `meta` | same + `last`/`fol` → meta | totals yes; followers see §5 |
| `phd` | `daily` | per handle-day sums (`_nodate` excluded) | yes |
| `handles` collection | `acc` + `meta` | same | yes (followers §5) |
| `mapping` collection | handles × meta | same | yes |
| `PARTY_DATA`, `STATE_DATA` | `acc` grouped by mapping party/state | same | yes |
| `DAILY_DATA`, `AGG.dates`, `AGG.S`, `D.partyDaily`, `D.handles`, `UNI.updates` (UP) | `daily` × level/party | per handle-day sums | yes |
| `D.sent`, `D.sentN` | `acc` sentiment | `s` | yes |
| `D.HOURLY` | `hourly` | sum `hr` | yes |
| `D.wd`, `D.dayLabels`, `D.AD` | `DATES` | set of days present | yes |
| `CM_DATA` | `acc` + `meta` | same | yes |
| `HASHTAGS`, `HTFULL`, `WORDCLOUD.tags` | `htag*` | sum `ht` per day (+ row party) | yes |
| `WORDCLOUD.words` | `words` (top 150) | sum per-day top-2,000 | near-exact (top 150 of the sum of per-day top 2,000; `total_words` becomes approximate) |
| `SENT_DAILY` | `sdaily` (row State × day × sentiment) | `s` grouped by `st`, `d` | yes |
| `UNI.viral_up`, `UNI.viral` (UP) | top 400 UP tweets by views (full scan) | direct query on cold: `{State:"Uttar Pradesh"}` sorted by the existing `Total Views` index, limit 800, dedupe by URL | yes |
| `UNI.updist` (UP) | carried over from previous build | unchanged | — |
| `GROWTH`, `HANDLES`, `MLA_DATA`, `PARTY_HANDLES`, `TWEETS`, `HROLE` | not recomputed — carried over from the previous `dashboard_data.json` | unchanged | — |

## 4. Keeping the summary correct

A day's rows must be recomputed whenever any tweet of that day changes. Writers of `master_tweets` today:

| Writer | What changes | How the day gets marked dirty |
|---|---|---|
| `master_to_mongo.upsert_frame` (pipeline ingest) | new tweets, growing likes/views | collect `Tweet Date[:10]` of the frame → upsert into `summary_dirty` (plan step 4) |
| `x_scraper.js` (Handle Tracker, inside server.js) | new tweets, relabel `updateMany` per handle | same hook in JS after each bulkWrite / updateMany |
| `push_mapping_to_mongo.py`, `apply_dual_seats.py`, `fix_*.py`, `recover_acpc.py` | relabel Party/State/Category of a handle's tweets | mark **every day of the affected handles** dirty (distinct `Tweet Date[:10]` for those handles) |

Safety net: a nightly `--dirty` run plus a weekly full `--check` that compares summary vs cold per day and
re-marks any mismatching day.

## 5. Known non-exact item (exists today too)

Followers/followings: today's code takes them from the latest row **per 200,000-row chunk**, so the result
already depends on chunk boundaries. The summary uses the latest non-zero row per handle (by tweet time),
which is the intended behaviour. Followers are not in the strict acceptance list.

## 6. Size (measured 26 Oct 14:07, `tools/summary_sizing.py`, read-only, 189 s)

| Measure | Value |
|---|---|
| Tweets | 2,911,846 over 209 days |
| Handle-day pairs | 330,825 |
| Summary docs with row labels in the key | 331,465 (only 640 more — the extra key parts cost almost nothing) |
| Tweets without a valid date | 0 (the `_nodate` bucket stays as a safety net) |
| Hashtag occurrences | 2,251,240 (max 1,590 in one handle-day) |
| Estimated size | ≤ 241 MB (upper bound), local MongoDB only |

**Atlas mirror:** the full summary does not fit the ≤ 60 MB budget, so it stays local (cold). For Phase 5
date-range charts older than 7 days, a much smaller per-day roll-up (day × party × level, ~209 × few hundred
rows, < 5 MB) can be mirrored instead. Decision can wait until Phase 5.

**Build cost:** one full backfill streams 2.9M tweets once (similar to one of today's dashboard builds,
~5–7 min). After that, each hourly run recomputes only dirty days (usually today + yesterday + any day whose
tweets got new likes), so the dashboard build reads ~7 days raw + 331k small rows.

## 7. Builder (after approval)

`DASHBOARD/build_daily_summary.py --all | --days d1,d2 | --dirty | --check`, streaming with a cursor
(projection of needed fields, batch 5,000), writing first to `daily_summary_test`. Acceptance before any use:
per-day totals == cold aggregate; summed totals == `india_Pulse.dashboard_data` `UNI.tot`.
