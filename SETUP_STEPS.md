# MongoDB Setup — Step by Step (4 Collections)

Ye guide dekh kar aap seedha setup kar sakte ho. Bas neeche ke steps follow karo. 🙂

**Aakhir me:** MongoDB me 4 clean collections + dashboard **http://localhost:3000** par MongoDB se chalega.

---

## 📦 4 Collections (bas itne — 5 nahi)

| # | Collection | Kitne docs | File kaha hai |
|---|---|---|---|
| 1 | **handles** | 3,024 | `mongodb_export\handles.json` |
| 2 | **mapping** | 3 | `mongodb_export\mapping.json` |
| 3 | **dashboard_data** | 12 | `mongo-dashboard\data\dashboard_data.json` |
| 4 | **phd** | 3,024 | `mongo-dashboard\data\phd.json` |

> `tweets` (5th) tab chahiye jab "sirf naye din" wala incremental karein — abhi zaroorat nahi.

---

## STEP 0 — Check MongoDB chal raha hai
1. **Compass** kholo → sabse upar `mongodb://localhost:27017` → **Connect**.
2. Left me databases dikhein = ✅ chal raha hai.
   - Na chale to: `Win+R` → `services.msc` → **"MongoDB Server"** → right-click → **Start** → Compass dobara Connect.

---

## STEP 1 — Purana database delete karo (agar messy hai)
1. Compass me left panel me **`india_pulse`** dhoondho.
2. Uske upar hover karo → **🗑 (trash) icon** dabao → naam type karke **Drop Database**.
3. (Agar `india_pulse` hai hi nahi, to ye step skip karo.)

> Data files disk pe safe hain — delete se sirf MongoDB ka copy jaata hai.

---

## STEP 2 — Naya database banao
1. Compass me **Create Database** (ya **"+"**).
2. **Database Name:** `india_pulse`
3. **Collection Name:** `handles`
4. **Create Database**.

---

## STEP 3 — Chaaro collections import karo

Har collection ke liye ye 4 clicks:
**collection pe click → ADD DATA → Import JSON or CSV file → file chuno → Type = JSON → Import**

| Collection banao | Ye file import karo | Baad me docs |
|---|---|---|
| `handles` *(Step 2 me ban gayi)* | `mongodb_export\handles.json` | 3,024 |
| `mapping` *(nayi banao "+")* | `mongodb_export\mapping.json` | 3 |
| `dashboard_data` *(nayi banao)* | `mongo-dashboard\data\dashboard_data.json` | 12 |
| `phd` *(nayi banao)* | `mongo-dashboard\data\phd.json` | 3,024 |

> **Nayi collection banane ke liye:** `india_pulse` ke aage **"+"** → naam daalo → Create.

---

## STEP 4 — Verify (counts check karo)
Har collection pe click karke upar "X documents" dekho:
- `handles` = **3,024**
- `phd` = **3,024**
- `dashboard_data` = **12**
- `mapping` = **3**

Sab match = ✅ import ho gaya.

---

## STEP 5 — Indexes banao (ek baar — queries fast)
`mongosh` kholo (ya Compass ke andar shell) aur ye chalao:
```js
use india_pulse
db.handles.createIndex({ level: 1 })
db.handles.createIndex({ party: 1 })
db.handles.createIndex({ level: 1, party: 1 })
db.handles.createIndex({ views: -1 })
```

---

## STEP 6 — Dashboard chalao 🚀
**CMD** kholo:
```
cd "C:\Users\arpan\Claude\Projects\X\mongo-dashboard"
npm install
npm start
```
Phir browser me **http://localhost:3000** → dashboard MongoDB se chalega! 🎉
(Band karna ho to CMD me `Ctrl + C`.)

---

## ⚡ Sabse tez tareeka (Step 2-4 ek saath, CMD se)

Node/Mongo tools installed hain to Compass ki jagah seedha:
```
cd "C:\Users\arpan\Claude\Projects\X"
mongoimport --db india_pulse --collection handles        --file "mongodb_export\handles.json"             --jsonArray
mongoimport --db india_pulse --collection mapping        --file "mongodb_export\mapping.json"             --jsonArray
mongoimport --db india_pulse --collection dashboard_data --file "mongo-dashboard\data\dashboard_data.json" --jsonArray
mongoimport --db india_pulse --collection phd            --file "mongo-dashboard\data\phd.json"           --jsonArray
```
(Agar `mongoimport` "not recognized" aaye → MongoDB Database Tools install karo, ya Compass wala tareeka use karo.)

---

## 🆘 Kuch atke to
| Problem | Fix |
|---|---|
| Compass connect nahi | `services.msc` → "MongoDB Server" → Start |
| Import "0 documents" | File theek se chuni? JSON type select kiya? |
| `npm`/`node` not recognized | Node.js install karo (nodejs.org → LTS), CMD dobara kholo |
| "dashboard_data collection khaali" | Step 3 dobara — import reh gaya |
| Dashboard purana data | `http://localhost:3000/refresh` → reload |

---

## Aage — data update karna ho to
`mongo-dashboard\UPDATE_GUIDE.md` dekho — nayi CSV se ek command me sab update:
```
python update_dashboard.py "C:\path\to\data.csv" --push
```
Phir `/refresh`. Bas.

Koi bhi step atke — us screen ka screenshot bhej dena, main wahin se help kar dunga. 💪
