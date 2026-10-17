# Saari command — ek jagah

Do laptop hain. Har command ke saath likha hai ki kis par chalani hai.

- **PURANA** = jispe abhi dashboard chal raha hai (`C:\Users\arpan\Claude\Projects\X\...`)
- **NAYA** = jispe host karna hai

Neeche maan liya hai ki naye laptop par folder yahan hai:

```
C:\PoliticalPulse\Main Twitter Project
```

Kahin aur rakha ho to har command me sirf ye path badal dena.

---

# PURANA LAPTOP

### 1 — MongoDB ka backup

```cmd
cd /d "C:\Users\arpan\Claude\Projects\X\Main Twitter Project"
```

```cmd
BACKUP_MONGO.bat
```

10–20 minute. `mongo_dump_py\` folder ban jayega.

Command se karna ho to:

```cmd
"C:\Users\arpan\anaconda3\python.exe" mongo_backup.py
```

### 2 — Ginti likh lo (baad me milane ke liye)

```cmd
"C:\Users\arpan\anaconda3\python.exe" RESET_MONGO.py --list
```

> `--list` kuch hataata nahi, sirf dikhata hai. Purane laptop par bina `--list`
> ke **kabhi mat chalana**.

Jo number dikhein wo kahin note kar lo — naye laptop par yahi milne chahiye.

### 3 — Folder copy karo

Poora `Main Twitter Project` folder USB me.

Chhod sakte ho: `_HATAYA_2026-09-02`, `DASHBOARD\node_modules`,
`PunjabLens\node_modules`, `DASHBOARD\data\master_tweets.csv`

Saath jana zaroori hai: `mongo_dump_py\`, `Mapping\Mapping.xlsx`,
`DASHBOARD\data\handle_master.json`

`DASHBOARD\ai_config.json` me Groq ki key khuli padi hai — apne hi system par le
jaa rahe ho to saath rakho, kisi aur ko folder dena ho to wo file hata dena.

---

# NAYA LAPTOP

### 4 — Ye teen install karo

| Kya | Kahan se | Dhyan |
|---|---|---|
| Node.js LTS | nodejs.org | — |
| Python 3.10–3.12 | python.org | **"Add Python to PATH"** tick |
| MongoDB Community | mongodb.com/try/download/community | **"Install as a Service"** tick |

Check:

```cmd
node -v
```

```cmd
python --version
```

```cmd
net start MongoDB
```

*(pehle se chal rahi ho to "already been started" aayega — theek hai)*

### 5 — Network share

```cmd
net use \\192.168.2.85\d /persistent:yes
```

Check:

```cmd
dir "\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
```

Folder ki list aani chahiye. **Ye zaroori hai** — iske bina hourly update nahi chalega.

### 6 — Folder rakho

USB se paste karke:

```cmd
cd /d "C:\PoliticalPulse\Main Twitter Project"
```

```cmd
dir
```

`SETUP.bat`, `mongo_dump_py`, `DASHBOARD`, `PunjabLens` dikhne chahiye.

### 7 — Purani database pehle dekho

```cmd
python RESET_MONGO.py --list
```

Kuch nahi mila → step 8 chhod do, seedha 9 par jao.

### 8 — Purani database hatao

```cmd
python RESET_MONGO.py
```

Poochhega → **`DROP`** likh kar Enter.

Sirf `pulse_master`, `india_Pulse`, `up_pulse`, `political_lens` jaayengi.
Baaki koi database ho to safe hai.

### 9 — SETUP

```cmd
SETUP.bat
```

20–30 minute. Do sawaal:

| Sawaal | Jawaab |
|---|---|
| `Isi dump se MongoDB bharein?` | **y** |
| `Kya purana laptop bhi chalta rahega?` | **y** |

`SETUP POORA HUA` aana chahiye.

### 10 — Ginti milao

```cmd
python RESET_MONGO.py --list
```

Step 2 wale number se milne chahiye.

### 11 — Chalao

```cmd
DASHBOARD\START_LIVE.bat
```

Window **band mat karna**.

```
http://localhost:3000/          All India
http://localhost:3000/up        Uttar Pradesh
http://localhost:3000/punjab/   Punjab
```

Login: `admin@jarvis.consulting` / `admin@Jarvis`

### 12 — Ek ghante baad check

```cmd
type "C:\PoliticalPulse\Main Twitter Project\DASHBOARD\pipeline.log"
```

Ye lines aani chahiye:

```
Naye rows: xx,xxx | Mongo master total: 16,9x,xxx
Build + push (SEEDHA MONGO SE) -> india_Pulse + up_pulse ...
Punjab build + push -> political_lens ...
  Punjab ho gaya.
CSV backup skip (ye SECONDARY laptop hai ...)
```

Aakhri line ka matlab — purane laptop se takraav nahi ho raha. Setup poora.

---

## Kuch atke to

| Dikkat | Command |
|---|---|
| `python` pehchana nahi ja raha | `"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" --version` — jo mile wahi `python` ki jagah use karo |
| MongoDB band | `net start MongoDB` |
| `requires authentication` / `Unauthorized` (code 13) | `db_config.json` me `mongo_url` bharo (jad me). Jaanch: `cd DASHBOARD` phir `python mongo_conf.py` |
| pymongo nahi hai | `python -m pip install pymongo pandas openpyxl` |
| Dashboard khaali | `python mongo_backup.py --restore` |
| Punjab khaali | `cd PunjabLens` phir `UPDATE_DATA.bat` |
| node_modules nahi bane | `cd DASHBOARD` → `npm install`, phir `cd ..\PunjabLens` → `npm install` |
| Port 3000 busy | Purani server window band karo. `PunjabLens\START.bat` alag se **mat** chalao |
| Trending / Explorer / AI me "Server purana chal raha hai" | START_LIVE.bat band karke dobara chalao (server.js badla hai) |
| Word Cloud khaali | `cd DASHBOARD` phir `"C:\Users\arpan\anaconda3\python.exe" run_pipeline.py --force-push` |
| AI: HTTP 429 | Groq ki free limit (8,000 token/min). Thodi der ruk kar poochho |
| AI: "key nahi mili" | `DASHBOARD\ai_config.json` banao, console.groq.com se free key |
| Pipeline abhi chala kar dekhna ho | `cd DASHBOARD` phir `run_once.bat` |

---

## Rozana ke kaam (setup ke baad)

| Kaam | Command |
|---|---|
| Dashboard chalu karo | `DASHBOARD\START_LIVE.bat` |
| Ek baar abhi update karo | `DASHBOARD\run_once.bat` |
| Sirf Punjab refresh | `PunjabLens\UPDATE_DATA.bat` |
| Mapping.xlsx badla | `DASHBOARD\RUN_MAPPING_UPDATE.bat` |
| Data export | `DASHBOARD\GET_DATA.bat` |
| Naya backup | `BACKUP_MONGO.bat` |
| Word Cloud ka data dobara banao | `cd DASHBOARD` phir `run_pipeline.py --force-push` |
| Groq par kaun se AI model hain | browser me `http://localhost:3000/api/ai/models` |
