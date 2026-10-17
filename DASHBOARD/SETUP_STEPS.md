# DASHBOARD — Setup Step by Step (sab kuch is folder me)

Is **DASHBOARD** folder me poora setup ek jagah hai — 4 data files + script + server.
Bas neeche ke steps follow karo. 🙂

**Aakhir me:** MongoDB me 4 collections + dashboard **http://localhost:3000** par MongoDB se chalega.

---

## 📁 Is folder me kya hai
```
DASHBOARD/
├── data/                       ← 4 collection files (MongoDB me import karni hain)
│   ├── handles.json            (3,024 docs)
│   ├── mapping.json            (3 docs)
│   ├── dashboard_data.json     (12 docs)
│   └── phd.json                (3,024 docs)
├── server.js                   ← dashboard chalane wala server
├── package.json
├── dashboard.template.html     ← dashboard (data MongoDB se bharta)
├── update_dashboard.py         ← nayi CSV se data update karne ka script
├── SETUP_STEPS.md              ← (ye file)
└── UPDATE_GUIDE.md             ← data update karne ki guide
```

## 📦 4 Collections (bas itne)
| # | Collection | Docs | File |
|---|---|---|---|
| 1 | **handles** | 3,024 | `data\handles.json` |
| 2 | **mapping** | 3 | `data\mapping.json` |
| 3 | **dashboard_data** | 12 | `data\dashboard_data.json` |
| 4 | **phd** | 3,024 | `data\phd.json` |

---

## STEP 0 — MongoDB chal raha hai?
- **Compass** kholo → `mongodb://localhost:27017` → **Connect**. Databases dikhein = ✅.
- Na chale to: `Win+R` → `services.msc` → **"MongoDB Server"** → **Start** → dobara Connect.

## STEP 1 — Purana database delete (agar messy hai)
- Compass me `india_pulse` ke upar hover → **🗑 trash** → naam type → **Drop Database**.
- (Na ho to skip. Files disk pe safe rehti hain.)

## STEP 2 — Naya database banao
- **Create Database** → naam **`india_pulse`**, collection **`handles`** → Create.

## STEP 3 — Chaaro collections import karo
Har ek: **collection pe click → ADD DATA → Import JSON or CSV file → file → Type=JSON → Import**
| Collection banao | File chuno |
|---|---|
| `handles` *(Step 2 me bani)* | `DASHBOARD\data\handles.json` |
| `mapping` *("+" se banao)* | `DASHBOARD\data\mapping.json` |
| `dashboard_data` *(banao)* | `DASHBOARD\data\dashboard_data.json` |
| `phd` *(banao)* | `DASHBOARD\data\phd.json` |

## STEP 4 — Verify counts
handles = **3,024**, phd = **3,024**, dashboard_data = **12**, mapping = **3** ✅

## STEP 5 — Indexes (ek baar, mongosh me)
```js
use india_pulse
db.handles.createIndex({ level: 1 })
db.handles.createIndex({ party: 1 })
db.handles.createIndex({ level: 1, party: 1 })
db.handles.createIndex({ views: -1 })
```

## STEP 6 — Dashboard chalao 🚀
**CMD** kholo:
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
npm install
npm start
```
→ browser me **http://localhost:3000** 🎉  (band karna: `Ctrl + C`)

---

## ⚡ Tez tareeka (Step 2-4 ek saath — CMD se)
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD\data"
mongoimport --db india_pulse --collection handles        --file handles.json        --jsonArray
mongoimport --db india_pulse --collection mapping        --file mapping.json        --jsonArray
mongoimport --db india_pulse --collection dashboard_data --file dashboard_data.json --jsonArray
mongoimport --db india_pulse --collection phd            --file phd.json            --jsonArray
```

---

## 🔄 Data update karna ho to
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
pip install pandas pymongo
python update_dashboard.py "C:\path\to\new_data.csv" --push
```
Phir **http://localhost:3000/refresh** → reload. (Detail `UPDATE_GUIDE.md` me.)

---

## 🆘 Kuch atke to
| Problem | Fix |
|---|---|
| Compass connect nahi | `services.msc` → "MongoDB Server" → Start |
| Import "0 documents" | Sahi file? JSON type? |
| `npm`/`node` not recognized | Node.js (nodejs.org → LTS) install, CMD dobara kholo |
| "dashboard_data collection khaali" | Step 3 dobara |
| Dashboard purana data | `http://localhost:3000/refresh` |

Koi bhi step atke — us screen ka screenshot bhej dena. 💪
