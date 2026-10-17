# Naye system par project setup (All India + UP dashboard)

## 1. Ye software install karo (naye system par)
- **MongoDB** (Community Server) — install karke service chalu rakho (localhost:27017).
- **Node.js** (LTS) — server ke liye.
- **Python** (Anaconda ya python 3) — ye packages:
  ```
  pip install pandas pymongo openpyxl lxml
  ```

## 2. Poora project folder copy karo
`C:\...\X` folder (jisme **DASHBOARD** aur **UP-DASHBOARD** dono hain) copy karke naye system par rakho.
> **Zaroori:** DASHBOARD aur UP-DASHBOARD **saath-saath (sibling)** rakhna — kyunki All-India server UP ka template `..\UP-DASHBOARD\dashboard.template.html` se leta hai.

Copy me ye zaroor hon:
- `DASHBOARD\` (server.js, *.py, data\master_tweets.csv, data\handle_master.json, *.bat)
- `UP-DASHBOARD\` (dashboard.template.html, *.py)
- `data\master_tweets.csv` aur `data\handle_master.json` (mapping) — ye do sabse important.

## 3. node_modules install (dono folder me)
```
cd path\to\X\DASHBOARD
npm install
cd path\to\X\UP-DASHBOARD
npm install
```
(ya purana `node_modules` folder bhi copy kar sakte ho.)

## 4. Paths update karo (naye system ke hisaab se)
Naye system par username/path alag hoga, to ye check/update karo:

- **`.bat` files** (START_LIVE.bat, run_once.bat) me Python ka path:
  ```
  set PY=C:\Users\<NAYA-USER>\anaconda3\python.exe
  ```
  (ya agar python PATH me hai to bas `set PY=python`)

- **Network folder** (`phase2_push.py` aur `auto_update.py` me `BASE`):
  ```
  BASE = r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
  ```
  Agar data-server same hai to change nahi; alag ho to naya path daalo.
  Naya system us network share tak pahunch pa raha ho (VPN/LAN).

- Baaki paths `.bat` me `%~dp0` (apne folder se) use hote hain — woh apne aap adjust ho jaate hain.

## 5. Master ko MongoDB me push karo (naye system par)
```
cd path\to\X\DASHBOARD
attrib -r "data\master_tweets.csv"
<python> push_all_scopes.py "data\master_tweets.csv"
```
Ye `india_Pulse` + `up_pulse` fresh bana dega (dedupe + IST + count check).

## 6. Chalu karo
```
START_LIVE.bat   (double-click)
```
- Server (localhost:3000) + har 1 ghante folders se auto-update.
- `http://localhost:3000` = All India, switch se Uttar Pradesh.

## Checklist (naye system par)
- [ ] MongoDB chal raha (services.msc)
- [ ] Node + Python + packages installed
- [ ] X folder copy (DASHBOARD + UP-DASHBOARD saath me)
- [ ] npm install dono me
- [ ] .bat me Python path sahi
- [ ] BASE network path reachable
- [ ] push_all_scopes chal gaya (india_Pulse + up_pulse bane)
- [ ] START_LIVE.bat chalu

## Zaroori files jo miss nahi honi chahiye
- `DASHBOARD\data\master_tweets.csv`  (poora data)
- `DASHBOARD\data\handle_master.json` (mapping)
- `DASHBOARD\dashboard.template.html`  (All India template)
- `UP-DASHBOARD\dashboard.template.html` (UP template)
- `DASHBOARD\report_lib.js`, `smart_import.py`, `update_dashboard.py`,
  `push_all_scopes.py`, `phase2_push.py`, `auto_update.py`, `server.js`
