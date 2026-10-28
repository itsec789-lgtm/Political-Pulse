# Political Pulse → Nazar: status + number check (27 Oct 2026, ~15:00 IST)

All checks were read-only. No passwords or connection strings are in this report. **Nothing was changed on the Pulse side.**

## 1. Status

- **Pipeline:** runs every hour (START_LIVE loop). Last run 14:30–14:36 IST succeeded (`DONE in 348s`) with **0 new rows**. The last run that brought new posts was 11:06 IST today.
- **Newest post:** 2026-10-26 15:10:07 IST (CNBC_Awaaz). This is the same in the master table and in `pulse_hot.tweets`.
- **Why nothing newer:** Pulse only reads files from the network share `\\192.168.2.85\d\Social Media`. The share is reachable, but no new scraper files have arrived:
  - Newest file per folder is from 24 Oct or older (All India Top Leaders 24 Oct 10:06, UP_MLA 24 Oct 08:22, Media Houses 24 Oct 06:27).
  - The 26-Oct posts reached Pulse on 26 Oct (46,953 rows) and at 11:06 today (5,406 rows). Nothing has arrived since.
  - The scrapers that write these files run on another machine. **Not fixable from this PC**, so the "newest post < 1 hour old" goal was **not reached**.
  - Separately, about 1,939 Instagram files fail to read on every run (`Invalid comparison between dtype=datetime64 and date`). This started 7 Oct and is not related to Nazar.
- **Why `nazar_meta.info.updated_at` keeps changing:** `nazar_push.py` runs every hour and rewrites meta even when no day changed. This is expected. Use `last_day` or the newest `Tweet Date` to judge freshness, not `updated_at`.
- **Settings now in use:**
  - `window_start` = 2026-10-25, `hot_days` = 3.
  - TTL `ts_ttl` = 345,600 s (4 days).
  - The daily resync also **deletes rows older than `window_start`** (today: 13,459 rows of 24 Oct). So in practice the hot window is 3 calendar days, and the TTL buffer day is not kept.
- **Window days, hot vs master:** 25 Oct 15,362 = 15,362; 26 Oct 7,644 = 7,644; 27 Oct 0 = 0. 23 Oct and 24 Oct are no longer in `pulse_hot.tweets`.

## 2. Number check

Definitions are the ones from Nazar's prompt. The 24 h window is 25 Oct 15:10:08 → 26 Oct 15:10:07 IST (UP: 15:06:33 → 15:06:32). "Pulse dashboard" is the nearest equivalent the Pulse dashboard shows.

| Check | Pulse master | pulse_hot | Pulse dashboard | Nazar | Match? | Whose side | What was done |
|---|---|---|---|---|---|---|---|
| Original posts, 24 h, All India | 6,252 | 6,252 | 5,828 (calendar day 26 Oct, RTs included, no media) | 6,252 | ✅ | definition (dashboard = calendar day, RTs included) | — |
| Views on them | 1,54,10,018 | 1,54,10,018 | 63,35,005 (26 Oct) | 1,54,10,018 | ✅ | definition | — |
| Active accounts | 1,624 | 1,624 | 1,291 (26 Oct) | 1,624 | ✅ | definition | — |
| BJP posts / views | 4,777 / 99,45,839 | 4,777 / 99,45,839 | — | 4,777 / 99,45,839 | ✅ | — | — |
| Most-viewed post | 15,97,669 | 15,97,669 | — | 15,97,669 | ✅ | — | — |
| Narendra Modi 24 h: posts / views / likes | 5 / 13,68,730 / 23,564 | same | — | same | ✅ | — | — |
| UP 24 h: posts / views / active | 955 / 37,72,482 / 279 | same | 916 / 16,17,943 / 229 (26 Oct) | 955 / 37,72,482 / 279 | ✅ | definition | — |
| UP BJP posts / views; top post | 762 / 32,75,725; 4,82,736 | same | — | same | ✅ | — | — |
| Total posts, All India | 29,18,816 | 28,95,810 (`nazar_daily` before 25 Oct) + 23,006 (hot) = 29,18,816 | 23,55,918 politicians (+5,62,898 media/journalist = 29,18,816) | 29,18,816 | ✅ | definition (dashboard total leaves out media) | — |
| Total posts, UP | 4,45,908 | 4,43,203 + 2,705 = 4,45,908 | 4,45,908 | 4,45,908 | ✅ | — | — |
| 48 h, All India: posts / views | 12,430 / 2,61,99,779 | 9,642 / 2,23,16,464 | — | 9,642 / 2,23,16,464 | ⚠️ 2,788 posts and 38.8 lakh views lower than master | Nazar / design (see §4a) | — |
| 72 h, All India: posts / views | 18,703 / 4,08,47,705 | 9,642 / 2,23,16,464 (23–24 Oct already removed) | — | 13,290 / 3,15,53,071 | ⚠️ 5,413 posts lower than master | Nazar / design (see §4a) | — |
| Political accounts tracked | mapping: **5,201** political handles (UP 873) | `nazar_handles` 3,757; without Media/Journalist **3,696** (UP 647) | 3,669 handles with posts | 3,669 (UP 633) | ⚠️ | definition + Nazar (§4b) | — |

**Part B answers:**

1. **Last 30 days before `window_start`** (25 Sep–24 Oct): `nazar_daily` `tw`, `lk`, `vw` and `rt` match the master table on **all 30 days, 0 differences**. `tw` counts **all rows**, including RTs and media.
2. **24 Oct:** 13,459 is correct. The master table also has 13,459 rows that day. The "719" was an old partial copy.
3. **Low days** (11–15 Sep, 20 Sep): confirmed about 480–590 accounts against about 1,500–2,000 normally.
   - Every row of those days reached Pulse on 25 Sep, which was a late backfill.
   - So the scraper missed those days and was only partly recovered later.
   - They **can't be rebuilt from here**. There is no other source on this PC, and re-scraping needs the scraper machine.
4. **April–May:**

   | Month | Posts per day | Accounts posting |
   |---|---|---|
   | April | 5,039 | 2,126 |
   | May | 7,762 | 2,826 |
   | October | 23,157 | 3,291 |

   - Part of the gap is that fewer accounts were tracked: 2,126 accounts first appear in April and 854 more in May.
   - Each account also has fewer posts per day in April: 2.4, against 7.0 in October.
   - So early-month history is **probably incomplete** (the first scrape of a profile gets only limited history). This can't be proved from Pulse's data alone.
5. **Empty fields in `nazar_daily` now:**
   - No party: 5,176 rows. 5,074 of them are Media House/Journalist, which is expected.
   - No state: 4,498 rows. These are mostly Other Party Leaders, Top Leaders, contestants and RS MPs (national accounts), which is expected.
   - No or `nan` category: 97 rows. This is a small data-quality gap in the raw rows.
6. **Accounts:**
   - Pulse **tracks 5,201 political handles** (Mapping.xlsx); 873 of them are in UP.
   - Of these, only 3,669–3,696 have posted since April. That is the "accounts with data" number.

## 3. Changes on the Pulse side

None. Every check was read-only.

## 4. For Nazar (user to fix there)

a. **48 h / 72 h windows reach before `window_start`.**
   - A 72 h window ending at the newest post always starts before `window_start`, because `window_start` = today − 2 days.
   - Those rows are not in `pulse_hot.tweets`: the daily resync removes them, and `nazar_daily` has no times.
   - Options:
     - (1) Nazar caps these windows at `window_start` and says so on screen.
     - (2) Pulse keeps one extra day of raw rows. This is about +20k rows (~25 MB) and the contract does not change. Nazar would then read raw rows for `d >= window_start − 1` when a window needs them.
   - The Pulse-side change is ready to make on request.

b. **Accounts count:**
   - `nazar_handles` without Media House/Journalist is **3,696** (UP 647), not 3,669 (UP 633).
   - The 27-account gap was not traced here. Likely causes: handles whose `cat` is `nan`, `Social_Profile` or empty, or a different spelling or case of the category.
   - Nazar's 3,669 equals the number of accounts with posts on the Pulse dashboard.
   - Check Nazar's filter, and decide whether those accounts count as political.

c. **Freshness:** use the newest `Tweet Date` or `nazar_meta.info.last_day`, not `updated_at`. `updated_at` changes every hour even when no new data arrives.
