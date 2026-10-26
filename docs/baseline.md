# Phase 0 baseline — pipeline stage timings (Laptop 1)

Source: `DASHBOARD/pipeline.log`, `.log.1`, `.log.2` (read-only), parsed 26 Oct 2026 12:45 IST.
Minutes. "Ingest" = run start → `=== All-India`. "Report" = backup end → `Daily report:` line.

## Last 5 runs that got past the UP stage

| Run start (IST)     | Ingest | India | UP   | Punjab | CSV backup | Daily report | Total |
|---------------------|-------:|------:|-----:|-------:|-----------:|-------------:|------:|
| 2026-10-23 17:53:34 | 5.6  | 8.4 | 21.5 | 3.5 | 23.3 | 7.8 | 70.1 |
| 2026-10-23 11:08:40 | 4.5  | 4.4 | 22.1 | 2.4 | died mid-backup | – | – |
| 2026-10-22 11:00:38 | 4.8  | 4.4 | 30.3 | 2.2 | 51.6 (FAILED: No such file or directory) | 8.8 | 102.2 |
| 2026-10-21 15:27:33 | 3.8  | 3.9 | 24.4 | 2.2 | – (not first run of day) | – | ~34 to Punjab |
| 2026-10-21 13:32:00 | 10.6 | 3.5 | 12.6 | 1.5 | 21.6 | 5.7 | 55.5 |

## Reliability, 21–26 Oct

22 runs started, only 5 finished the UP push. The rest stopped silently (mostly inside the UP stage),
no traceback; the next run logs `lock to tha par wo process ab zinda nahi`. Suspect: memory —
`UP-DASHBOARD/push_tweets.py` holds every tweet (~2.9M dicts) in a Python list.

## MongoDB facts (read-only probe, 26 Oct 12:53 IST, pipeline mid-UP-stage)

- Mongo 8.3.8. `master_tweets` est. count 2,911,846.
- pulse_master: data 3,176 MB, indexes 519 MB, storage 1,319 MB.
- up_pulse: data 2,785 MB (both `tweets` and `tweets__new` present during the swap), indexes 106 MB.
- india_Pulse: data 44 MB. political_lens: data 36 MB.
- `find({_first: "<date>"})` plan = **COLLSCAN** (no `_first` index). Only caller: `DASHBOARD/daily_report.py` :137–149.
- Existing master indexes: `_id`, Tweet Date, State, Handle, Category, Party, Total Views/Likes/Retweets/Comments (desc),
  {Category, Tweet Date -1}, {Handle, Tweet Date -1}, Source Folders, {Source Folders, Handle}, …
