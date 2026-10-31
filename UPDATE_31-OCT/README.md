# UPDATE 31-Oct-2026 (30 + 31 Oct ke badlaav)

`UPDATE_29-OCT` ke baad ke saare badlaav, ek baar me. Ye pen drive se le jaane ke liye hai.

> **Is folder me keys hain** (Gemini key, X cookies). Ise kisi ko mat bhejiye, GitHub par mat daaliye.
> `.gitignore` me `UPDATE_*/config/` aur `UPDATE_*/mongo/` ignore kar diye hain, aur script khud jaanchti hai.

## Kaise chalayein
1. Poora `UPDATE_31-OCT` folder main system par `C:\Main Twitter Project\` ke andar copy kijiye.
2. MongoDB chalu ho (normal tarah).
3. `RUN_UPDATE.bat` par double-click. 2-3 minute.
   - Script khud dashboard server aur RUN_SERVER window band karti hai, files badalti hai, phir `DASHBOARD\START_LIVE.bat` dobara chalati hai.
4. Aakhir me `SAB THEEK` aaye to browser me Ctrl+F5.

Sirf jaanch: `RUN_UPDATE.bat --dry`. Wapas jaana ho: `RUN_UPDATE.bat --rollback`.

## Kya badla (code)
- **Handle Analytics:** Profile & activity redesign (KPI cards, Analysis, AI Summary English/Hindi), Daily Breakdown, Top Performing Tweet card, translate, headings, collapse teer.
- **Parties:** party cards (KPI style, flag rang ki patti, live logo X / Wikipedia se), party page hero, designation slide, Contribution Share donut.
- **Header / Dashboard:** Harshit ke header, KPI ring, Executive Summary waghaira.
- **Server:** `/api/ha/summary` (AI Summary), `/api/party-logo`, `/api/translate`, `/api/ximg`.
- **Naye files:** `summary_lib.js`, `translate_lib.js`, `SYNC_SNAPSHOT_TO_MONGO.py`, `tools/build_hero_map.js`, `assets/sansad.webp`.
- **Pipeline:** `mongo_pool.js` (Mongo band ho to khud chalu), `RUN_SERVER.bat` (dusra server nahi chalata), `auto_sync_github.py`, `START_LOCAL.bat`.
- `run_pipeline.py` / `build_daily_summary.py` **nahi badle**, isliye Mongo ka dashboard data dobara banane ki zaroorat nahi.

Poori list: `files.txt`.

## Config (keys)
| File | Kya karti hai | Script kya karti hai |
|---|---|---|
| `translate_config.json` | Gemini key (AI Summary, translate) | daal deti hai (purana ho to backup) |
| `x_config.json` | X cookies (profile photo, party logo) | **sirf tab daalti hai jab main system par na ho**; alag ho to main wala rehta hai, laptop wala `.from_laptop` |
| `ai_config.json` | purana Groq config | upar jaisa |

## MongoDB
Naye cache collections (`pulse_master`): `ha_summaries`, `party_logos`, `tweet_translations`.
Script sirf naye documents daalti hai, kuch delete / overwrite nahi karti. Na bhi aayein to dashboard pehli click par khud bana leta hai.
