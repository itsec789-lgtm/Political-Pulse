# India Political Pulse - Poori Guide (Updated)

Sab kuch is `DASHBOARD` folder me hai. Data MongoDB se aata hai.

---

## Ek-baar setup (pehli baar)

**A) MongoDB chal raha ho** — Compass kholo, `mongodb://localhost:27017` Connect.
   (Na chale: Win+R -> `services.msc` -> "MongoDB Server" -> Start)

**B) Python packages** (Anaconda me):
   Jupyter cell me ya Anaconda Prompt me:
   ```
   pip install pandas pymongo
   ```

**C) Server ke packages** (CMD me, DASHBOARD folder me):
   ```
   cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
   npm install
   ```

---

## Dashboard kholna (roz)

CMD me:
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
npm start
```
Phir browser: **http://localhost:3000**  (band karna: CMD me Ctrl+C)

> Server band karke dobara chalao (data badla ho to):
> `taskkill /F /IM node.exe`  phir  `npm start`

Sab data (loader, CM, level, party, sentiment, hashtag, charts) MongoDB se aata hai.
Kuch bhi hardcoded/baked nahi hai.

---

## Data update karna (sirf naye din) -- INCREMENTAL

Python plain CMD me nahi chalta, isliye Anaconda ka poora python use karo:
`"C:\Users\arpan\anaconda3\python.exe"`

**Pehli baar (SIRF EK BAAR)** — master banao, poori April1..July1 CSV se:
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
"C:\Users\arpan\anaconda3\python.exe" update_add.py "APNI_PURI_CSV_KA_PATH" --init --push
```

**Uske baad har baar** — sirf naye din (jaise July2..8):
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
"C:\Users\arpan\anaconda3\python.exe" update_add.py "NAYE_DIN_KI_CSV_KA_PATH" --push
```
Phir browser reload: **Ctrl + Shift + R**

> CSV ka path: file ko CMD window me **drag-drop** kar do, path apne aap aa jayega.
> `--push` = seedha MongoDB me (koi Compass import nahi).
> `--init` sirf pehli baar. Uske baad NAHI.
> Duplicate (overlapping din) khud hat jaate hain (Tweet URL se).

---

## Kya-kya update hota hai (sab)
loader/splash, level strip, party cards, sentiment, UP counts, State CM overview + map,
hashtags + party filter, overview charts, hourly heatmap, party-daily, daily trend.
**Kuch static nahi.**

---

## Files (kya kya hai)
| File | Kaam |
|---|---|
| `server.js` | dashboard chalane wala (npm start) |
| `dashboard.template.html` | dashboard (data MongoDB se) |
| `update_add.py` | **incremental** update (sirf naye din) -- ye use karo |
| `update_dashboard.py` | full update (poora data har baar) |
| `import_data.js` | JSON files ko MongoDB me daalna (agar zaroorat pade) |
| `data/` | 4 collection JSON + master_tweets.csv |

---

## Kuch atke to
| Problem | Fix |
|---|---|
| `python`/`pip` not recognized | Anaconda ka poora path: `"C:\Users\arpan\anaconda3\python.exe"` |
| `npm`/`node` not recognized | Node.js install (nodejs.org LTS), CMD dobara kholo |
| Dashboard blank / purana | server restart (`taskkill /F /IM node.exe` -> `npm start`) + `Ctrl+Shift+R` |
| MongoDB connect nahi | `services.msc` -> "MongoDB Server" -> Start |
| Port 3000 busy | `taskkill /F /IM node.exe` phir `npm start` |

Koi step atke -> us screen ka screenshot bhej dena.
