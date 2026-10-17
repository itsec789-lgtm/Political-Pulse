# India Political Pulse — Master Setup Guide (Step by Step)

Ye ek hi guide me poora setup hai — **shuru se lekar dashboard chalne tak.**
Beginner ho to bhi tension mat lo, har step aasaan bhasha me hai. 🙂

**Aakhir me aapke paas hoga:**
- MongoDB me clean data (handle = primary key, level mapping ke saath)
- Aapka dashboard **http://localhost:3000** par, data **MongoDB se**

---

## 📁 Folder map (kya kahan hai)

```
X/
├── README.md                         ← (ye file) master guide
├── India_Political_Dashboard_May2026.html   ← standalone dashboard (data andar, bina DB ke chalta)
│
├── mongodb_export/                   ← MongoDB me daalne ka data + mapping
│   ├── handles.json                  ← MASTER (primary key = handle)
│   ├── level_map.json                ← level → handles mapping
│   ├── states.json, viral_tweets.json, hourly.json ...
│   ├── MAPPING_GUIDE.md              ← query kaise resolve hoti hai
│   └── CLEAN_DATA_MODEL.md           ← kaunsi collection rakhni/deletni hai
│
└── mongo-dashboard/                  ← dashboard ko MongoDB se chalane wala server
    ├── server.js                     ← chhota Node server
    ├── package.json
    ├── dashboard.template.html        ← dashboard (data ke bina; DB se bharta)
    └── data/
        ├── dashboard_data.json        ← dashboard ke blobs
        └── phd.json                   ← daily charts ka data
```

---

## PART 1 — Install (ek baar) 🔧

1. **MongoDB Server + Compass** — [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) se install karo. (Compass = GUI, Server = database.)
2. **Node.js (LTS)** — [nodejs.org](https://nodejs.org) se install karo. Check: CMD me `node -v` → version dikhe.
3. MongoDB chal raha hai? Compass kholo → **Connect** (`mongodb://localhost:27017`). Databases dikhein = ✅.

---

## PART 2 — Database banao + data import karo 📥

1. Compass me **Create Database** → naam **`india_pulse`**, first collection **`handles`**.
2. Har file ko apni collection me import karo:
   - collection pe click → **ADD DATA → Import JSON or CSV file** → file chuno → type **JSON** → **Import**.

| Collection banao | File import karo | Kaha se |
|---|---|---|
| `handles` | `handles.json` | mongodb_export |
| `level_map` | `level_map.json` | mongodb_export |
| `states` | `states.json` | mongodb_export |
| `viral_tweets` | `viral_tweets.json` | mongodb_export |
| `dashboard_data` | `dashboard_data.json` | mongo-dashboard/data |
| `phd` | `phd.json` | mongo-dashboard/data |
| `hashtags` | `hashtags.json` *(agar hai)* | (jo folder me ho) |

> **Tez tareeka (CMD):** us folder me jaake:
> ```
> mongoimport --db india_pulse --collection handles   --file handles.json   --jsonArray
> mongoimport --db india_pulse --collection level_map --file level_map.json --jsonArray
> ```
> (`dashboard_data` aur `phd` `mongo-dashboard\data` folder me hain.)

> **Note:** agar pehle se extra collections (`cm_and_dycm`, `mla_tracker`, `top_leaders`, `party_handles`, `growth`) hain — inhe **delete** kar sakte ho, ye `handles` se ban jaati hain. Detail `CLEAN_DATA_MODEL.md` me.

---

## PART 3 — Mapping + levels + indexes 🗺️

Data ab MongoDB me hai. Handle = primary key, aur `level_map` se level-wise routing.

**Indexes bana lo (queries fast honge)** — `mongosh` kholo aur:
```js
use india_pulse
db.handles.createIndex({ level: 1 })
db.handles.createIndex({ party: 1 })
db.handles.createIndex({ level: 1, party: 1 })
db.handles.createIndex({ views: -1 })
```

**Query kaise chalti hai** (examples):
```js
db.handles.findOne({ _id: "narendramodi" })          // ek handle ki detail
db.handles.find({ level: "MLA" })                     // saare MLA
db.handles.find({ level: "MLA", party: "BJP" })       // BJP ke MLA
db.level_map.findOne({ _id: "MLA" }).handles          // MLA handles ki list (mapping se)
```
(Poora table `MAPPING_GUIDE.md` me.)

---

## PART 4 — Dashboard chalao 🚀

1. **CMD** kholo, `mongo-dashboard` folder me jaao:
   ```
   cd "C:\Users\arpan\Claude\Projects\X\mongo-dashboard"
   ```
2. Ek baar packages install:
   ```
   npm install
   ```
3. Server chalao:
   ```
   npm start
   ```
4. Browser me kholo: **http://localhost:3000** → dashboard MongoDB se chalega! 🎉
   (Band karna ho to CMD me `Ctrl + C`.)

---

## PART 5 — Data edit karna ✏️

Bas **ek jagah** edit karo — `handles` collection.

1. Compass me `handles` → koi handle ka party/level/name/number badlo → save.
2. `level_map` ko sync karne ke liye `mongosh` me rebuild-command chalao (poora command `CLEAN_DATA_MODEL.md` me hai).
3. Dashboard me dikhaayi de, to `http://localhost:3000/refresh` kholo → phir reload.

> Dashboard ke bade numbers (`dashboard_data`) tab tak same rahenge jab tak "update script" na chale. Nayi poori CSV aaye to wo script main bana dunga (bolna).

---

## PART 6 — Naya data aane par (future)

Jab nayi CSV (naye tweets) aayegi:
1. Ek **update script** (main bana dunga) us CSV ko process karega,
2. `handles`, `phd`, `dashboard_data` update kar dega,
3. `http://localhost:3000/refresh` → dashboard taaza.

Bas aapko ek command chalani hogi. (Incremental setup me sirf naye din ki chhoti CSV deni hogi.)

---

## 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| Compass connect nahi | `services.msc` → "MongoDB Server" → Start |
| `npm`/`node` not recognized | Node.js install karo (Part 1), CMD dobara kholo |
| "dashboard_data collection khaali" | Part 2 dobara — import reh gaya |
| Import "0 documents" | File bahut bada single-doc — chhoti files import karo (phd already tuti hui hai) |
| Dashboard purana data | `/refresh` kholo phir reload |

---

## 📚 Aur detail (sub-guides)
- **`mongodb_export/MAPPING_GUIDE.md`** — handle mapping + har query kaise resolve hoti hai
- **`mongodb_export/CLEAN_DATA_MODEL.md`** — clean structure, kaunsi collection rakho/delete karo, edit workflow
- **`mongo-dashboard/README.md`** — sirf dashboard chalane ke steps

Koi step atke ya error aaye — us screen ka screenshot bhej dena, main wahin se help kar dunga. 💪
