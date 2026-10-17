# Dashboard ka Data MongoDB me le jaana — Beginner Step-by-Step Guide

Aapne MongoDB **Compass** + **Server Community** install kar liya hai — sabse bada step ho chuka. 👍
Ab bas data import karna hai. Ye guide bilkul shuru se, aasaan bhasha me hai.

---

## Poora plan (3 phases)

| Phase | Kya | Status |
|---|---|---|
| **1** | Dashboard ka data JSON files me nikaalna | ✅ **Ho gaya** (maine `mongodb-data` folder me 10 files bana di) |
| **2** | In JSON files ko MongoDB me import karna (Compass se) | 👈 **Abhi ye karenge** |
| **3** | Dashboard ko MongoDB se connect karna (backend API) | Baad me (advanced) |

> **Important:** Abhi Phase 2 karenge — data MongoDB me daal ke Compass me dekhna. Isse aapko confidence aayega ki data chala gaya. Phase 3 (dashboard live DB se chale) alag, badा kaam hai — wo baad me.

---

## Aapki data files (`mongodb-data` folder me)

Har file = MongoDB me ek **collection** (Excel ki ek sheet jaisa):

| JSON file | Collection naam | Kitne records | Kya hai |
|---|---|---|---|
| `handles.json` | handles | 3,024 | Sabhi Twitter handles + followers/views/likes |
| `growth.json` | growth | 3,024 | Har handle ka growth data |
| `party_handles.json` | party_handles | 66 | Party-wise handles |
| `parties.json` | parties | 62 | Har party ke totals |
| `cm_and_dycm.json` | cm_and_dycm | 51 | CM aur Deputy CM |
| `hashtags.json` | hashtags | 40 | Top hashtags |
| `states.json` | states | 35 | State-wise data |
| `mla_tracker.json` | mla_tracker | 30 | MLA tracker |
| `top_leaders.json` | top_leaders | 15 | Top leaders |
| `viral_tweets.json` | viral_tweets | 12 | Viral tweets |

---

## PHASE 2 — Import karna (Compass se)

### Step 0: Check karo MongoDB chal raha hai

1. **Compass** kholo (Start menu me "MongoDB Compass").
2. Sabse upar connection box me ye likha hoga: `mongodb://localhost:27017`
3. **Connect** button dabao.
4. Agar left side me kuch databases (admin, config, local) dikh jaayein — **MongoDB chal raha hai. ✅**

> Agar connect na ho: Windows me `Win + R` → `services.msc` → list me **"MongoDB Server (MongoDB)"** dhoondho → uspe right-click → **Start**. Phir Compass me dobara Connect.

---

### Step 1: Naya database banao

1. Compass me connect hone ke baad, left panel me **"+"** ya **"Create database"** button dabao.
2. **Database Name:** `india_pulse`
3. **Collection Name:** `handles`  (pehli collection ka naam)
4. **Create Database** dabao.

Ab `india_pulse` database + `handles` collection ban gayi (abhi khaali hai).

---

### Step 2: Pehli file import karo (`handles`)

1. Left me `india_pulse` → `handles` collection pe **click** karo.
2. Beech me **"ADD DATA"** (green button) → **"Import JSON or CSV file"**.
3. File chuno: `mongodb-data\handles.json`
4. **Input File Type:** **JSON** select karo.
5. **Import** dabao.
6. Thodi der me "Imported 3024 documents" jaisa message aayega. ✅

Bas! Pehli collection me data aa gaya.

---

### Step 3: Baaki 9 collections import karo

Har baaki file ke liye:

1. Left me `india_pulse` ke aage **"+"** (Create collection) dabao.
2. Collection naam daalo (neeche table se — bilkul same naam rakho).
3. Us collection pe click → **ADD DATA** → **Import JSON or CSV file** → file chuno → **JSON** → **Import**.

| Collection naam banao | Ye file import karo |
|---|---|
| `top_leaders` | `top_leaders.json` |
| `cm_and_dycm` | `cm_and_dycm.json` |
| `mla_tracker` | `mla_tracker.json` |
| `states` | `states.json` |
| `parties` | `parties.json` |
| `party_handles` | `party_handles.json` |
| `viral_tweets` | `viral_tweets.json` |
| `growth` | `growth.json` |
| `hashtags` | `hashtags.json` |

---

### Step 4: Check karo sab aa gaya

Har collection pe click karke upar dekho "X documents" — ye numbers match hone chahiye:
`handles` 3024, `growth` 3024, `party_handles` 66, `parties` 62, `cm_and_dycm` 51, `hashtags` 40, `states` 35, `mla_tracker` 30, `top_leaders` 15, `viral_tweets` 12.

**Ho gaya! 🎉 Aapka poora dashboard data ab MongoDB me hai. Compass me aap use browse/filter/search kar sakte ho.**

---

## Tez tareeka (optional) — command se import

Agar ek-ek karke import karna slow lage, to **CMD** kholo, `mongodb-data` folder me jaao, aur ye chalao (ek line har collection ke liye):

```
mongoimport --db india_pulse --collection handles      --file handles.json      --jsonArray
mongoimport --db india_pulse --collection top_leaders  --file top_leaders.json  --jsonArray
mongoimport --db india_pulse --collection cm_and_dycm  --file cm_and_dycm.json  --jsonArray
mongoimport --db india_pulse --collection mla_tracker  --file mla_tracker.json  --jsonArray
mongoimport --db india_pulse --collection states       --file states.json       --jsonArray
mongoimport --db india_pulse --collection parties      --file parties.json      --jsonArray
mongoimport --db india_pulse --collection party_handles --file party_handles.json --jsonArray
mongoimport --db india_pulse --collection viral_tweets --file viral_tweets.json --jsonArray
mongoimport --db india_pulse --collection growth       --file growth.json       --jsonArray
mongoimport --db india_pulse --collection hashtags     --file hashtags.json     --jsonArray
```

> `mongoimport` MongoDB ke "Database Tools" ke saath aata hai. Agar "command not found" aaye, to [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) download kar lena — Compass wala tareeka bhi bilkul theek hai.

---

## PHASE 3 — Dashboard ko MongoDB se connect karna (baad me)

Abhi tak data MongoDB me **aa** gaya, par dashboard abhi bhi apni HTML file ke andar wale data se chal raha hai. Dashboard ko live MongoDB se chalane ke liye ek **backend** chahiye:

```
Browser (dashboard.html)  →  Backend API (Node.js)  →  MongoDB
```

Ye thoda advanced hai (Node.js install + ek chhota server likhna). **Jab Phase 2 ho jaaye aur aap ready ho, mujhe bolo — main aapke liye ready-to-run backend + connected dashboard bana dunga, wahi step-by-step.**

Filhaal Phase 2 (import) pe focus karo — koi bhi step atke to screenshot bhej dena, main wahin se help kar dunga. 💪
