# Punjab — main dashboard ke andar

Punjab ab main dashboard ka teesra scope hai. Ek hi server, ek hi port (3000),
ek hi login.

| Dashboard | Address |
|---|---|
| All India | `http://localhost:3000/` |
| Uttar Pradesh | `http://localhost:3000/up` |
| **Punjab** | `http://localhost:3000/punjab/` |

Switch karne ke liye sidebar me apne naam par click karo — All India / Uttar
Pradesh / Punjab ke button wahin niklenge. Punjab ke page par ye button upar
navbar me hain (kyunki uska sidebar alag hai).

---

## Chalana

Kuch naya nahi. Wahi purani file:

```
DASHBOARD\START_LIVE.bat
```

Bas ek baar `python build_punjab_data.py --push` chala lena (agar `political_lens`
pehle se bhari hai to zaroorat nahi) — uske baad har ghante apne aap update hoga.

---

## Login

| Email | Password | Kya dikhega |
|---|---|---|
| `admin@jarvis.consulting` | `admin@Jarvis` | teeno dashboard |
| `punjab@jarvis.consulting` | `Punjab@Jarvis` | **sirf Punjab** |
| `uttarpradesh@jarvis.consulting` | `Up@Jarvis` | sirf UP |
| `indiapulse@jarvis.consulting` | `India@Jarvis` | sirf All India |

Backend panel (`/admin`) ke *Users* aur *Login requests* me ab "Punjab" ka
option bhi aa gaya hai — kisi ko bhi Punjab-only access de sakte ho.

---

## Data kahan se aata hai

```
pulse_master.master_tweets        <- wahi master jisse All India aur UP chalte hain
        |
        |  PunjabLens\build_punjab_data.py   (State = Punjab)
        v
political_lens.tweets             <- sirf Punjab ke tweets
political_lens.aggregates         <- dashboard ke bane-banaye blocks
political_lens.meta.lastBuild     <- aakhri build ka time
```

`DASHBOARD\run_pipeline.py` har ghante ye karta hai:

1. nayi scraped file padho → `pulse_master` me daalo
2. All India + UP push (`india_Pulse`, `up_pulse`)
3. **Punjab push** (`build_punjab_data.py --push`)
4. `http://localhost:3000/punjab/refresh` — server ka cache saaf

Agar step 3 ya 4 fail ho jaaye to poora pipeline nahi rukta — bas `pipeline.log`
me ek line aati hai. Aur server khud bhi har 3 minute me dekhta rehta hai ki naya
build aaya ya nahi, to data phir bhi aa hi jaata hai.

Haath se chalana ho: `PunjabLens\UPDATE_DATA.bat`

---

## Kya-kya badla

**`DASHBOARD\server.js`** *(backup: `server.js.bak_punjab`)*

- `punjab` naam ka naya role
- `homeFor()` — kis role ka ghar kaunsa dashboard
- `allowScope()` — `/`, `/up`, `/punjab` ka ek jaisa pehra (pehle har route
  apna-apna check karta tha; vyavhaar bilkul wahi hai)
- `/punjab` par PunjabLens ko sub-app ki tarah mount kiya
- `/punjab/_me` — page ko batata hai ki tum kaun ho (switch button ke liye)
- sidebar me ab **dono** doosre dashboard ke button aate hain

**`DASHBOARD\run_pipeline.py`** *(backup: `run_pipeline.py.bak_punjab`)*

- `push_punjab()` — alag process me chalta hai, fail ho to pipeline safe

**`PunjabLens\server.js`**

- ab `module.exports = app`. Seedha chalao (`node server.js`) to pehle jaisa hi
  apna port kholta hai; `require()` karo to sirf app deta hai.

**`PunjabLens\public\*`** *(backup: `public.bak_mount\`)*

- `index.html` me `PL_BASE` — API ka pata address bar dekh kar tay hota hai
- 11 API call `PL_BASE` ke saath (`/api/data`, `/api/ask`, `/api/tweets`, …)
- naya `host-switch.js` — navbar me switch/logout button
- `START.bat`, `UPDATE_DATA.bat`, `SCHEDULE_DAILY.bat` → CRLF (LF wali `.bat`
  CMD me `if (` block par turant band ho jaati hai)

---

## Dhyan rakhne wali do baatein

1. **`PunjabLens\START.bat` ab mat chalao** jab `START_LIVE.bat` chal rahi ho —
   dono port 3000 maangte hain. Punjab ab main ke andar hai, alag server ki
   zaroorat nahi. (Kisi doosre laptop par akela chalana ho to START.bat abhi
   bhi kaam karta hai.)

2. Agar pehle `SCHEDULE_DAILY.bat` se `PoliticalLens_DailyBuild` task banaya
   tha, to use hata do — ab pipeline khud kar raha hai:
   ```
   schtasks /Delete /TN "PoliticalLens_DailyBuild" /F
   ```

3. `ai_config.json` me Gemini ki API key padi hai. Ye file kisi ko mat bhejna
   aur folder share karte waqt hata dena.
