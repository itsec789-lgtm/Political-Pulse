# Phase 1 — Config and connections (done on branch, HOT off)

| Item | Where |
|---|---|
| HOT settings (`enabled`, `url`, `db`, `days`, `max_mb`) from untracked `db_config.local.json`, env overrides `MONGO_HOT_URL`, `PULSE_HOT_ENABLED`, `PULSE_HOT_DAYS`, `PULSE_HOT_DB` | `DASHBOARD/hot_conf.py`, `DASHBOARD/hot_conf.js` (identical copies in `UP-DASHBOARD/`) |
| `window_cutoff()` / `windowCutoff()` — first IST day of the hot window (`today_IST − (days−1)`) | same files |
| Password masking for logs/admin | `masked()` in both |
| Second pool `hotClient()`, cached `hotHealthy()` (ping every 30 s, 4 s timeouts), `hotStatus()` for admin | `DASHBOARD/mongo_pool.js` |
| Secrets | `db_config.local.json` added to `.gitignore`; `db_config.local.json.example` committed as the template |

**Deviation from plan:** `mongo_conf.py` / `mongo_conf.js` are untouched. `mongo_conf.js` exports a plain
string (`MONGO_URL`) that ~40 files use, so no property can be added to it without changing every caller.
The hot settings live in `hot_conf.*` instead; `MONGO_URL` behaviour is byte-for-byte the same.
PunjabLens gets no copy (Punjab stays on its current path in this project).

**Tests (HOT off):** defaults → `enabled=false`, `hotClient()=null`, `hotHealthy()=false`; `MONGO_URL` unchanged
(`mongodb://localhost:27017`); env overrides switch it on/off; cutoff checked at IST day boundaries
(10:00 UTC 26 Oct → 2026-10-20; 20:00 UTC 26 Oct = 01:30 IST 27 Oct → 2026-10-21); masked URL never shows the
password. No existing code calls the new functions yet, so the pipeline and server behave exactly as today.
