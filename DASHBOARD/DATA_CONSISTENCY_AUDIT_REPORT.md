# Dashboard Data Consistency Audit — 29 Oct 2026

Scope: `DASHBOARD` (All India) and `UP-DASHBOARD` (Uttar Pradesh). This covers the MongoDB data, the Python pipeline, the server APIs and the front-end template.

## 1. What was audited

| Layer | Components |
|---|---|
| MongoDB | `pulse_master.master_tweets` (raw), `daily_summary`; `india_Pulse` / `up_pulse` → `dashboard_data` (UNI, D, AGG, GROWTH), `phd`, `handles` |
| Pipeline | `update_dashboard.py` (both), `summary_agg.py`, `build_daily_summary.py`, `run_pipeline.py`, `push_all_scopes.py` |
| Server APIs | `/api/cat-range`, `/api/tw/*`, `/api/narrative-groups/stats`, `/leader-analysis`, `/comparison`, `/api/parties/comparison`, `/api/ha/*` (Handle Analytics), `/api/report`, `/api/live`, admin counts |
| Front end | Tweet Summary and Retweet Summary KPIs, Total Tweet by Category, Overview (Trends & Distribution, Party & Sentiment, Engagement & Reach, Executive Summary), Dashboard Top-8, Top 50 Handles by Avg Views/Post, leaders bar, Parties tab, Party/Narrative comparison, Leader analysis, Handle Analytics, Home, Growth, sentiment donut, heatmap |

## 2. Inconsistencies found, with root causes

| # | Finding | Root cause |
|---|---|---|
| 1 | Dashboard Top-8 table crashed (`_pp2` undefined). The Top-8, viral tweets and the Executive Summary top list stopped updating when the date changed. | A variable was used outside the block where it is defined. |
| 2 | The same handle showed different tweet counts in Handle Analytics vs Top 50 / comparisons (the "17 vs 20" problem). | MongoDB stores some handles under two spellings (27 such handles, e.g. `AmitShah` / `amitshah`). Handle Analytics fetched only the exact spelling that was clicked. The comparison endpoints tried only 3–4 case variants and then **overwrote** one spelling's totals with another's instead of adding them. |
| 3 | Follower counts differed between tabs. | Four different sources: the Top-8 table used the **oldest** GROWTH snapshot (`f[0]`); Home and Growth used the latest; Top 50 used the UNI snapshot; Handle Analytics used its own per-day maximum. |
| 4 | Avg Views/Post differed between Handle Analytics and Top 50. | Handle Analytics divided by the number of rows that had a views value. Every other section divides by the number of tweets. |
| 5 | Sentiment, the heatmap/peak hour, hashtags and the word cloud counted retweets. | The pipeline (`update_dashboard.py`) and `daily_summary` (`s`, `hr`, `ht`, words) were built from every row. The 27-Oct tweet/retweet split only covered tw/views/likes/retweets. |
| 6 | Party filter results differed between the KPIs, the category strip and the Executive Summary. | Three party sources (GROWTH `.p` (outdated), UNI, `D.handles`). |
| 7 | The Top 50 date filter mixed full-period numbers into date-filtered rows. | `_applyDate` returned a handle's full-period totals whenever that handle had no per-day data under its exact spelling. |
| 8 | Parties tab likes and retweets were estimates. | Pro-rated by tweet share even though real per-day data (PHD `k`/`r`) exists. |
| 9 | "Last N days" and day-end boundaries differed between APIs. | Some endpoints used UTC `toISOString` (N+1 days; the wrong date between midnight and 05:30 IST) and others IST. The end-of-day check `' 23:59:59'` dropped tweets timestamped exactly 23:59:59 IST. |
| 10 | Comparison totals could be undercounted. | A plain `$sum` on `Total *` fields counts values stored as text as 0. |
| 11 | "Following" always showed 0 in Party comparison. | Field-name typo (`following` instead of `followings`). |
| 12 | Report (pool source) and the live "new tweets" counter included retweets. | The tweet/retweet filter was missing. |

## 3. Corrections implemented

- **New `DASHBOARD/metrics_lib.js`**: the single definition of each metric. It covers: tweet / retweet (`RT @` prefix); numeric summing (`$convert`); IST date ranges with the end day included (`to + '~'`); handle spellings (taken from MongoDB's distinct `Handle` values, cached for 10 min); avg per post; engagement rate.
- **`server.js`**:
  - The narrative stats, leader-analysis, narrative comparison and party comparison endpoints now use metrics_lib for handle spellings, dates and sums.
  - Their groupings are on the lowercase handle, so spellings are added together.
  - Handle Analytics (`haRows`) fetches every spelling.
  - The `/api/live` new-tweets count and the report pool path now exclude retweets.
- **`ha_lib.js`**: averages are divided by the number of tweets.
- **Templates (both dashboards)**:
  - A single `PM` lookup for party, followers and followings.
  - The Top-8 crash is fixed and the table shows latest followers.
  - The KPI and Retweet Summary party filters use `PM`.
  - The Top 50 date filter now adds spellings together and shows 0 when the range has no data.
  - The Parties tab uses real per-day likes and retweets.
  - The `followings` typo is fixed.
- **Pipeline**: `update_dashboard.py` (both dashboards) and `build_daily_summary.py` now build sentiment, hourly, hashtags and the word cloud from own tweets only (`daily_summary` records are marked `sv: 2`).
- **Data**:
  - `daily_summary` was rebuilt: 334,263 records covering 2.93M rows over 210 days.
  - The pipeline was re-run with `--force-push`, which rebuilt All India, UP and Punjab.

## 4. Verification against MongoDB

`DASHBOARD/verify_consistency.js` (read-only) calculates the reference numbers straight from `master_tweets`: own tweets, retweets, views and avg views. It uses every spelling of the handle and IST dates. It then compares them with:
- PHD (pipeline data behind the KPIs, Top 50, Retweet Summary, Parties tab and Executive Summary)
- `daily_summary` (behind Total Tweet by Category)
- `/api/narrative-groups/leader-analysis` and `/api/parties/comparison` (live, on a test server instance)
- the Handle Analytics calculation (`ha_lib.analyse`)

| Test | Handles | Range | Result |
|---|---|---|---|
| Major leaders (Modi, Rahul Gandhi, Yogi, Amit Shah, Kejriwal, Akhilesh, Mamata, BJP4India, INCIndia, Priyanka) | 10 | 20–26 Oct | **All match** |
| Handles stored under two spellings | 12 | 1 Apr–26 Oct | **All match** (e.g. amitshah: 1,434 tweets in every source) |
| Major leaders, after the pipeline push | 10 | 1–27 Oct | **All match** |
| Sentiment total = hourly total = tweet total | All India / UP | full | 1,347,990 = 1,347,990 = 1,347,990 / 262,774 = 262,774 = 262,774 |
| `daily_summary`: sentiment total vs own tweets | all | full | 1,891,331 = 1,891,331 |
| JS syntax of every inline script in both templates | 42 + 42 | — | 0 errors |

To re-run it: `node verify_consistency.js <from> <to> <port> [handles]`. It needs a server running on that port (for example `PULSE_PORT=3999 PULSE_TEST_NO_JOBS=1 node server.js`).

## 5. What is not fully consistent, and why

Follow-up fixes made on 29 Oct (later the same day):
- **Parties tab sentiment over a date range** is now the real tweets-only count from the new `/api/sent-range` endpoint (`daily_summary` for older days, live MongoDB for recent ones). The "approx." label only shows while that data is loading.
- **Viral tweets** now follow the Dashboard party filter. The UP pipeline also leaves retweets out of the viral list, because a retweet carries the original post's views.
- **Home engagement rate** = (likes + retweets + comments) ÷ views, from the new `/api/eng-daily` endpoint. `daily_summary` now stores comments (`cm` / `rcm`). This is now the same formula as Handle Analytics and Leader Analysis.
- **Instagram export files** (876 of them in the Toolkit folders) are skipped once and remembered. Previously they failed with "ERROR read" on every pipeline run. They are not imported into the Twitter dashboard.

Still different, deliberately:
- **Handle Analytics engagement rate** leaves out rows where engagement is greater than views, because those rows have bad data.
- **Handle Analytics "days" presets** count back from the handle's newest tweet, so handles with older data don't show empty charts.
- **Home, Level donut, CM KPIs and party cards** always show the full period ("current state" views).
- **`/api/live` total, admin counts and admin downloads** include retweets. They are raw database size and export figures.
- **Empty source CSVs** (0 bytes) still log "format samajh nahi aaya". The files have no data to read.

## 6. Tests performed

1. The cross-source handle comparison above, under three conditions: a 7-day range, the full range, and the month after the pipeline push.
2. Multi-spelling handles (the main cause of the "17 vs 20" problem).
3. Total checks: sentiment = hourly = tweets for both scopes, and the `daily_summary` sentiment total = own tweets.
4. A one-day `daily_summary` test build compared with the live collection before the full rebuild: tweet and retweet counts identical, sentiment reduced to own posts only.
5. Sentiment (per category) and comment totals in `daily_summary` match `master_tweets` for 6 handles over 20–26 Oct.
6. Syntax checks: `node --check` on the server files, `py_compile` on the pipeline files, and a script-level parse of both templates.
