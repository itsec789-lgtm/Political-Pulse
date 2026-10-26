# Phase 0 report (26 Oct 2026)

## 1. Baseline
See `baseline.md`. UP stage ≈ 22 min; 18 of 23 runs since 21 Oct died silently. The 26 Oct 12:27 run died in
the UP stage too (pid 6020 gone by 13:01, lock left behind). At 13:02 Laptop 1 had **713 MB free of 7.8 GB RAM**
with no pipeline running, which points to memory as the cause.

## 2. `_first` index (live `pulse_master.master_tweets`, created 13:04, 41 s)

| `daily_report.py` query | Before | After |
|---|---|---|
| All India `count_documents({_first: today})` | 38.4 s (COLLSCAN) | 0.02 s (IXSCAN `_first_1`) |
| All India `$match _first` → min/max | 49.3 s | 0.18 s |
| All India `$match _first` → by date | 41.5 s | 0.15 s |
| UP (`State` + `_first`) ×3 | 1.3–1.4 s (IXSCAN State) | 0.17–0.19 s (IXSCAN `_first_1`) |

`daily_report.py` is the only code that queries `_first` (lines 137–149). Expected effect: the daily-report step
drops from ~8 min to well under 1 min. Tool: `tools/index_first.py` (re-runnable, read-only with `--check`).

## 3. `up_pulse.tweets`
Option (b) implemented on the branch; see `phase0_report_pool.md` for the comparison and results.
Expected effect: UP stage ~22 → ~6–8 min, and no 2.9M-doc list in RAM.

## 4. Expected run time after merge
Ingest ~5 + India ~4–8 + UP ~6–8 + Punjab ~3 + daily report <1 ≈ **20–25 min** for the first run of the day
without the CSV backup; the once-a-day CSV backup (~23 min) is unchanged.

## 5. Needs Harshit's OK
- Merge Phase 0 commit to `main` (deploy).
- Later, separately: drop the old `up_pulse.tweets` copy (frees ~1.4 GB) once the new Report path is proven.
