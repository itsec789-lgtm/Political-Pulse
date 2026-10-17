# SETUP — step by step (Mongo-first, kuch manual nahi)

CMD kholo aur pehle folder me jao (har step se pehle ye line):
```
cd /d "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
```
Python ka path (har command me yahi):  `C:\Users\arpan\anaconda3\python.exe`

---

## STEP 0 — file lock hata do (ek baar)
```
attrib -r "data\master_tweets.csv"
```

## STEP 1 — Media Houses + journalist ka data master me lao  (ek baar)
```
C:\Users\arpan\anaconda3\python.exe rebuild_4_media.py
```
Dekhna: `Media House rows: ...` aur `Journalist rows: ...` aur ant me DONE.
(Agar ye pehle chala chuke ho to skip.)

## STEP 2 — poora master MongoDB me daalo  (ek baar, 5-10 min)
```
C:\Users\arpan\anaconda3\python.exe master_to_mongo.py
```
Ant me dikhega: `Mongo me kul unique tweets: 11,95,xxx`
Ab source-of-truth = MongoDB  `pulse_master.master_tweets`

Check karne ke liye kabhi bhi:
```
C:\Users\arpan\anaconda3\python.exe master_to_mongo.py --count
```

## STEP 3 — dashboards Mongo se banao aur push karo  (ek baar)
```
C:\Users\arpan\anaconda3\python.exe push_all_scopes.py MONGO
```
Dekhna: `Source: MongoDB ...` → `All-India -> india_Pulse` → `UP -> up_pulse` → DONE

## STEP 4 — LIVE chalu karo  (rozana bas yahi)
File Explorer → `C:\Users\arpan\Claude\Projects\X\DASHBOARD` → **START_LIVE.bat** double-click

Ye khud karega:
- MongoDB + server (http://localhost:3000) chalu
- turant ek update, phir **har 1 ghante**:
  saare 9 folders scan → naya/badla data → mapping se columns → Mongo me upsert
  → dono dashboard push → browser khud refresh
- **CSV backup roz ek baar**, month-wise split (Excel-safe):
  `\\192.168.2.85\d\Social Media\master_backup\master_2026-08.csv` ...

Black window band mat karna (wahi loop chala rahi hai).

Login:
- All India : indiapulse@jarvis.consulting / India@Jarvis
- UP        : uttarpradesh@jarvis.consulting / Up@Jarvis
- Admin     : admin@jarvis.consulting / admin@Jarvis   (dono, switch ke saath)

---

## Jab data chahiye (kabhi bhi) — Mongo se CSV
```
C:\Users\arpan\anaconda3\python.exe export_from_mongo.py                                   (poora)
C:\Users\arpan\anaconda3\python.exe export_from_mongo.py --from 2026-07-01 --to 2026-08-11
C:\Users\arpan\anaconda3\python.exe export_from_mongo.py --state "Uttar Pradesh" --split
C:\Users\arpan\anaconda3\python.exe export_from_mongo.py --category "Media House"
C:\Users\arpan\anaconda3\python.exe export_from_mongo.py --party BJP --from 2026-08-01
C:\Users\arpan\anaconda3\python.exe export_from_mongo.py --handle myogiadityanath
```
- filters mix kar sakte ho
- `--split` = month-wise parts (Excel me khulne layak)
- `--out "D:\\file.csv"` = apna path
- default save: `\\192.168.2.85\d\Social Media`

---

## Kabhi zaroorat pade to
| Kaam | Command |
|---|---|
| Abhi ek update chalao | `python run_pipeline.py` |
| Saari files dobara padho | `python run_pipeline.py --rescan` |
| Backup abhi banao | `python run_pipeline.py --backup` |
| Mongo me kitne tweets | `python master_to_mongo.py --count` |
| Naye handles jo map nahi hue | `needs_mapping.csv` kholo |
| Log dekho | `pipeline.log` |

## System band ho gaya to
Bas `START_LIVE.bat` dobara double-click. Aur kuch nahi.
