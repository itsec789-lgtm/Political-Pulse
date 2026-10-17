# Naye laptop par poora dashboard chalana

Teen dashboard, ek server, ek MongoDB — All India + Uttar Pradesh + Punjab.

---

## Ek nazar me

| Kahan | Kya karna |
|---|---|
| **Purane laptop par** | `BACKUP_MONGO.bat` → folder copy karo |
| **Naye laptop par** | 3 cheez install → `SETUP.bat` → `START_LIVE.bat` |

Kul time: backup 10–20 min, copy 15–30 min, setup 20–30 min.

---

# PURANE LAPTOP PAR

## 1. MongoDB ka backup banao

```
C:\Users\arpan\Claude\Projects\X\Main Twitter Project\BACKUP_MONGO.bat
```

Double-click. Ye chaaro database padh kar `mongo_dump_py\` folder bana dega:

| Database | Kya hai |
|---|---|
| `pulse_master` | saara raw tweet data (~16.9 lakh) + users/login |
| `india_Pulse` | All India dashboard |
| `up_pulse` | UP dashboard |
| `political_lens` | Punjab dashboard |

Sirf **padhta** hai — chalta hua dashboard bilkul safe hai. Index ka naksha bhi
saath le jaata hai, taaki naye laptop par dashboard dheema na chale.

## 2. Folder copy karo

Poora `Main Twitter Project` folder → USB / external drive → naya laptop.

> **`DASHBOARD\ai_config.json` me Groq ki API key khuli padi hai.** Folder apne
> hi doosre system par le jaa rahe ho to theek hai. Kisi aur ko dena ho to wo
> file pehle hata dena, warna tumhari key uske paas chali jayegi.

Chhota rakhna ho to ye teen **chhod sakte ho**, SETUP khud bana lega:

```
DASHBOARD\node_modules
PunjabLens\node_modules
_HATAYA_2026-09-02
```

---

# NAYE LAPTOP PAR

## 3. Ye teen cheezein pehle install karo

| Kya | Kahan se | Dhyan |
|---|---|---|
| **Node.js** (LTS) | nodejs.org | — |
| **Python** 3.10–3.12 | python.org | *"Add Python to PATH"* par **tick** |
| **MongoDB Community** | mongodb.com/try/download/community | *"Install as a Service"* tick rakhna |

Baaki sab `SETUP.bat` kar lega.

## 4. Folder rakho

Kahin bhi rakh sakte ho, path me koi dikkat nahi. Suggestion:

```
C:\PoliticalPulse\Main Twitter Project\
```

## 5. Network share se connect karo

Naye tweets yahin se aate hain — iske bina hourly update nahi chalega:

```
net use \\192.168.2.85\d /persistent:yes
```

Poochhe to office ka username/password daal dena. Check:
Explorer me `\\192.168.2.85\d` khol kar dekho.

## 5b. Purani database saaf karo (agar pehle se kuch bana hai)

Naye laptop ki MongoDB me pehle se koi collection ho — purane setup se, ya
adhoore import se — to pehle use hata do. Warna aadha purana aur aadha naya
data mil jayega aur ginti kabhi milegi hi nahi.

```
RESET_MONGO.bat
```

Ye pehle **dikhayega** ki abhi kya-kya hai, phir `DROP` likhwa kar hi hataega.
Sirf ye chaar jaayengi — `pulse_master`, `india_Pulse`, `up_pulse`,
`political_lens`. Tumhari koi aur database ho to use haath nahi lagega.

Mongo pehle se khaali ho to ye khud keh dega "saaf hai" — tab ye step chhod do.

> **Ye purane laptop par bilkul mat chalana.** Wahan ka asli data chala jayega.

## 5c. Dashboard me kya-kya milega

Teeno dashboard me ye tab hain:

| Tab | Kya |
|---|---|
| Dashboard, Top Leaders, States/CM, MLA Tracker | pehle jaise |
| Hashtags, Sentiment, Parties, Growth, Profiles | pehle jaise |
| **Reports** | topic/keyword se poori report + PDF |
| **Trending** | Views / Likes / Retweets / Comments / Engagement — live Mongo se |
| **Tweet Explorer** | search + sort + date filter — live Mongo se |
| **Word Cloud** | top shabd + hashtag, CSV download ke saath |
| **AI Assistant** | neeche daayein gol button |

Punjab alag dhaanche ka hai (`/punjab/`) — usme apne tab hain.

## 5d. MongoDB ka password (`db_config.json`)

Agar MongoDB par **authentication chalu** hai (user/password maangta hai), to
project ki jad me `db_config.json` kholo aur apna connection string daalo:

```json
{ "mongo_url": "mongodb://USERNAME:PASSWORD@localhost:27017/?authSource=admin" }
```

**Saari script yahi ek file padhti hain** -- pipeline, teeno dashboard, backup,
export, sab. Password badle to sirf yahi file badalni hai, aur kahin nahi.

- Password me `@ : / ? # %` jaisa character ho to percent-encode karo
  (`@` -> `%40`, `:` -> `%3A`). Warna URI tut jaata hai.
- `authSource` wahi DB hai jisme user banaya tha -- aam taur par `admin`.
- Auth chalu **nahi** hai? File ko waise hi (`PASTE_...`) chhod do --
  purana `mongodb://localhost:27017` chalta rahega.
- Jaanch: `cd DASHBOARD` phir `python mongo_conf.py` -- connection test karke
  tweet ki ginti dikha dega (password screen par nahi aata).

> Ye file kisi ko mat bhejna -- isme password khula padta hai.

---

## 6. `SETUP.bat` chalao

```
SETUP.bat
```

Ye aath kaam karta hai:

1. Python packages (pandas, pymongo, openpyxl)
2. Node check + `npm install` — **dono** folder me (DASHBOARD aur PunjabLens)
3. MongoDB chal rahi hai ya nahi (band ho to khud start karta hai)
4. Saari `.bat` files me is system ka python path likh deta hai
5. Network folder pahunch me hai ya nahi
6. **MongoDB me poora data bhar deta hai** — `Isi dump se MongoDB bharein?` par **`y`**
7. Poochhta hai: purana laptop bhi chalta rahega? → **`y`** (neeche dekho, zaroori hai)
8. Aakhir me ginti dikha kar jaanch

Aakhir me `SETUP POORA HUA` aana chahiye.

> Beech me ruk jaaye to ghabrana mat — theek karke `SETUP.bat` dobara chala do.
> Jo ho chuka hai wo dobara nahi hoga.

## 7. Chalao

```
DASHBOARD\START_LIVE.bat
```

Ye window **band mat karna** — yahi har ghante ka auto-update chala rahi hai.

```
http://localhost:3000/          All India
http://localhost:3000/up        Uttar Pradesh
http://localhost:3000/punjab/   Punjab
```

Sidebar me apne naam par click → teeno ke beech switch.

---

## Login

| Email | Password | Kya dikhega |
|---|---|---|
| `admin@jarvis.consulting` | `admin@Jarvis` | teeno dashboard |
| `indiapulse@jarvis.consulting` | `India@Jarvis` | sirf All India |
| `uttarpradesh@jarvis.consulting` | `Up@Jarvis` | sirf UP |
| `punjab@jarvis.consulting` | `Punjab@Jarvis` | sirf Punjab |
| `admin_1@jarvis.consulting` | `admin_1@Jarvis` | Backend Admin Panel |

Baaki users `pulse_master.portal_users` me hain aur dump ke saath aa jaate hain —
purane laptop ke saare login yahan bhi chalenge.

---

## Dono laptop saath chalein — ek zaroori baat

Dono ek hi network folder padhte hain. **Padhne me koi dikkat nahi** — Mongo dono
ka alag hai, aur data upsert hota hai to kuch kharab nahi hoga.

Dikkat **likhne** me thi: CSV backup aur daily report dono network par *ek hi file*
par likhte the aur ek doosre ko mita dete.

Isliye ab `DASHBOARD\local_config.json` hai:

```json
{ "role": "secondary" }
```

- **secondary** → network par kuch nahi likhta, sab apne andar rakhta hai
- **primary** → pehle jaisa, network par backup aur report likhta hai
- file na ho → primary maana jaata hai

`SETUP.bat` ye khud pooch kar likh deta hai. Baad me badalna ho to file
seedha edit kar do — server restart ki zaroorat nahi, agla pipeline run khud padh lega.

> Purane laptop par ye file **mat** banana — wahi primary hai.

---

## Har ghante kya hota hai

```
nayi scraped file  →  pulse_master
                        ├─ india_Pulse    (All India)
                        ├─ up_pulse       (UP)
                        └─ political_lens (Punjab)
                             ↓
                       /punjab/refresh
```

`DASHBOARD\pipeline.log` me sab likha jaata hai. Sahi chalne par aisa dikhega:

```
Naye rows: 63,459 | Mongo master total: 1,690,883
Build + push (SEEDHA MONGO SE) -> india_Pulse + up_pulse ...
Punjab build + push -> political_lens ...
  Punjab ho gaya.
```

Naya data na aaye to `Naya data nahi -> push skip.` — ye galti nahi hai.

---

## Do cheezein jo shayad badalni padein

### ngrok (bahar se kholna ho to)

`DASHBOARD\START_LIVE.bat` me:

```
set NGROK=C:\ngrok\ngrok.exe
set NGROK_TOKEN=...
set NGROK_DOMAIN=
```

`ngrok.exe` ko `C:\ngrok\` me rakho. `NGROK_DOMAIN` khaali = har baar naya URL,
jo screen par bhi dikhta hai aur `mail_config.json` me bhi bhar jaata hai.

**Dono laptop par ek hi ngrok token mat chalana** — free plan me ek waqt me ek hi
tunnel chalta hai.

### Email — `DASHBOARD\mail_config.json`

Gmail app password isi file me hai. `url` haath se badalne ki zaroorat nahi,
`START_LIVE.bat` har baar khud bhar deta hai.

---

## Agar kuch atke

| Dikkat | Ilaaj |
|---|---|
| `SETUP.bat` khulte hi band | Python nahi mila — python.org se install, *Add to PATH* tick |
| `MongoDB se baat nahi ho pa rahi` | `net start MongoDB` — ya services.msc → MongoDB Server → Start |
| `npm install fail` | Node.js install hai? `node -v` chala kar dekho |
| Dashboard khaali | `python mongo_backup.py --restore` |
| Punjab khaali | `cd PunjabLens` → `UPDATE_DATA.bat` |
| Word Cloud khaali | `cd DASHBOARD` → `run_pipeline.py --force-push` |
| Trending/Explorer me "Server purana chal raha hai" | START_LIVE.bat band karke dobara chalao |
| AI "key nahi mili" | `DASHBOARD\ai_config.json` banao, console.groq.com se free key |
| AI par HTTP 429 | Groq ki free limit (8,000 token/min) — thodi der ruk jao |
| AI par HTTP 404 | server khud naya model dhoondh lega; na chale to `/api/ai/models` khol kar dekho |
| Hourly update me `network folder nahi mila` | `net use \\192.168.2.85\d /persistent:yes` |
| Port 3000 pehle se busy | Purani server window band karo. `PunjabLens\START.bat` alag se **mat** chalao — Punjab ab main ke andar hai |

---

## Folder me kya hai

```
SETUP.bat / setup.py          <- naye laptop ka ek-baar ka setup
BACKUP_MONGO.bat              <- purane laptop par backup
mongo_backup.py               <- backup / restore (mongodump ki zaroorat nahi)
RESET_MONGO.bat / .py         <- naye laptop par purani database hatao
COMMANDS.md                   <- saari command ek jagah
mongo_dump_py/                <- chaaro database ka data

DASHBOARD/                    <- server + All India + Backend panel
  server.js                   <- teeno dashboard yahin se chalte hain
  START_LIVE.bat              <- server + ngrok + har ghante ka pipeline
  run_pipeline.py             <- hourly pipeline
  local_config.json           <- primary / secondary
  data/handle_master.json     <- mapping (4,419 handles)
  ai_config.json              <- Groq key (AI assistant + report AI) -- SECRET

UP-DASHBOARD/                 <- UP ka template + uska data
PunjabLens/                   <- Punjab ka dashboard (main ke andar mount hota hai)
  build_punjab_data.py        <- pulse_master -> political_lens
  MAIN_DASHBOARD_ME_KAISE_JUDA.md

Mapping/Mapping.xlsx          <- mapping ka asli source
Reports/                      <- ab tak ki saari report (docx / pdf / pptx)
```
