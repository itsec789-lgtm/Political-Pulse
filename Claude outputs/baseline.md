# Phase 0 baseline — pipeline stage timings (Laptop 1)

Source: `DASHBOARD/pipeline.log`, `pipeline.log.1`, `pipeline.log.2` (read-only), parsed 26 Oct 2026 12:45 IST.
All times in minutes. "Ingest" = run start → `=== All-India`. "Report" = backup end → `Daily report:` line.

## Last 5 runs that got past the UP stage

| Run start (IST)     | Ingest | India | UP   | Punjab | CSV backup        | Daily report | Total  | Note |
|---------------------|-------:|------:|-----:|-------:|------------------:|-------------:|-------:|------|
| 2026-10-23 17:53:34 | 5.6    | 8.4   | 21.5 | 3.5    | 23.3              | 7.8          | 70.1   | full run, first of day after failures |
| 2026-10-23 11:08:40 | 4.5    | 4.4   | 22.1 | 2.4    | died during backup | —           | 59.4+  | process gone, next run found stale lock |
| 2026-10-22 11:00:38 | 4.8    | 4.4   | 30.3 | 2.2    | 51.6 (FAILED, `No such file or directory`) | 8.8 | 102.2 | backup aborted, old backup kept |
| 2026-10-21 15:27:33 | 3.8    | 3.9   | 24.4 | 2.2    | — (not first run) | —            | ~34 to Punjab | |
| 2026-10-21 13:32:00 | 10.6   | 3.5   | 12.6 | 1.5    | 21.6              | 5.7          | 55.5   | full run |

UP stage median ≈ 22 min (range 12.6–30.3). India 3.5–8.4. Punjab 1.5–3.5.

## Reliability (21 Oct → 26 Oct)

22 runs started; only 5 finished the UP push. The other 17 stopped silently — mostly inside the UP stage
(`=== UP` logged, then nothing until the next run logs `lock to tha par wo process ab zinda nahi`).
No traceback is logged, which looks like the process being killed (memory or a manual stop), not a Python error.
`UP-DASHBOARD/push_tweets.py` builds a list of every tweet (~2.9M dicts) in RAM during this stage, so it is
the main suspect on an 8 GB machine.

## Run in progress at measurement time

Started 2026-10-26 12:27:26 (pid 6020, `.pipeline.lock` present). Ingest 5.5 min, +66,904 new rows,
master now 2,911,846 docs. India done in 4.0 min; UP stage running since 12:36:57.

## Older reference (Aug–Oct)

Mid-Sept hourly runs: India ~2–3 min, UP 8–15 min, total 12–25 min. The UP stage has roughly doubled as the
master grew from ~2.1M to 2.9M docs.
