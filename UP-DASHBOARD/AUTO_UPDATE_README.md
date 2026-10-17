# UP Dashboard — Auto-Update (har 30 min, khud-ba-khud)

Ab aapko baar-baar `update_add.py` / `push` manually nahi chalana. Naye tweets
jo network folder me aate hain, woh apne aap master me merge hokar MongoDB me
chale jaate hain — dashboard "live" ho jaata hai.

## Kya-kya banaya

| File | Kaam |
|---|---|
| `smart_import.py` | Kisi bhi column-layout wali Excel ko dashboard schema me normalize karta hai (State/State Name, Level/Levels/Designation/Category, Tweet Date (IST) — sab apne aap map). |
| `auto_update.py` | 3 folders scan → 1-Aug ke baad ki nayi files → merge + Tweet URL par unique → MongoDB push. |
| `START_LIVE.bat` | **Sabse aasaan.** Server chalu + har 30 min auto-update. |
| `SETUP_AUTO_TASK.bat` | Background me (bina window) har 30 min update — Task Scheduler. |
| `START_SERVER.bat` | Sirf server (background wale setup ke liye). |
| `run_once.bat` | Ek baar update (scheduler isko bulata hai). |

## Kaunse folders se data uthta hai
```
\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\UttarPradeh data
\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\UP_MLA
\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\UP_MP
```
- Sirf **1 August 2026 ke baad** banी/badli `.xlsx` files uthti hain (purani skip).
- Ek file dobara nahi padhti (record `auto_state.json` me).
- Tweet URL par **unique** — same tweet do baar nahi aayega.
- Badle-hue columns bhi chalte hain (alias mapping). Jo file map na ho, woh
  `needs_review\` folder me copy ho jaati hai (baaki update chalta rehta hai).

Cutoff date badalni ho to `auto_update.py` me `CUTOFF = datetime.datetime(2026, 8, 1)`.
CSV bhi uthani ho to `EXTS` me `"*.csv"` add karo.

---

## Chalane ke 2 tareeke

### Tareeka A — Aasaan (recommend)
`START_LIVE.bat` par **double-click**.
- Server chalu ho jaata hai → http://localhost:3001 khud khulta hai.
- Turant ek update chalta hai, phir har 30 min.
- Us **black window ko open rehne do** — wahi loop chala raha hai.

### Tareeka B — Fully automatic (reboot ke baad bhi, bina window)
1. `SETUP_AUTO_TASK.bat` par **ek baar** double-click (right-click → *Run as administrator* behtar).
   → Har 30 min background me update chalega, hamesha ke liye.
2. Dashboard dekhne ke liye server bhi chahiye. `START_SERVER.bat` ka shortcut
   Startup folder me daal do:
   - `Win + R` → `shell:startup` → Enter
   - `START_SERVER.bat` ka shortcut wahan paste kar do.
   Ab har boot par server khud chalu.

---

## ⭐ System band kiya tha — dobara START kaise karein (aapka sawaal)

**Agar aap Tareeka A use karte ho:**
> Bas `START_LIVE.bat` par phir se **double-click**. Bass. Server + 30-min loop
> dono wapas chalu. Kuch aur nahi karna.

**Agar aap Tareeka B use karte ho:**
> Kuch karne ki zaroorat hi nahi — reboot ke baad Task Scheduler khud update
> karta rehta hai, aur Startup wala server khud chalu ho jaata hai.
> (Manually chahiye to: `START_SERVER.bat` double-click.)

**Dhyaan — MongoDB chalu hona zaroori hai** (data yahin store hota hai):
- Agar MongoDB **service** ke roop me install hai (aksar hota hai), woh boot par
  khud chalu ho jaata hai — bat file `net start MongoDB` bhi try karti hai.
- Warna ek baar (admin CMD me) service auto kar do:
  `sc config MongoDB start= auto` → phir `net start MongoDB`.
- MongoDB band ho to update `auto_update.log` me error dikhayega.

---

## Kaam ho raha hai ya nahi — kaise check karein
- **`auto_update.log`** kholo — har run ki detail: kaunsi file aayi, kitne naye
  rows, master kitne se kitne hue, dates, "DONE".
- Dashboard me date-filter ki **max date** aage badhni chahiye jaise naya data aata hai.
- Turant test: `run_once.bat` double-click → log dekho.

## Pehli baar chalane se pehle (ek-time check)
Pehla run karke `auto_update.log` me `mapped:` line dekh lena — confirm karo ki
saare zaroori column sahi map hue (Handle, Tweet URL, Tweet Date, Tweet Text,
Party, State, Designation, Likes/RT/Views). Agar koi column `blank/not found`
dikhe jo hona chahiye tha, toh us header ka naam mujhe bata dena — main
`smart_import.py` ke alias me add kar dunga (30 second ka kaam).
