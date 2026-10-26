# Political Pulse — what to do by hand (Laptop 1)

Everything else runs by itself. This page is only the manual steps.

## 1. Daily: keep these windows open
`DASHBOARD\START_LIVE.bat` opens them. Don't close:
- **All-India Dashboard - Live Auto-Updater** (updates every hour)
- **All-India Dashboard Server** (the website, http://localhost:3000)

If the laptop restarted: double-click `C:\Main Twitter Project\DASHBOARD\START_LIVE.bat`.

## 2. One time: Atlas (the online copy of the last 7 days)
1. Go to https://cloud.mongodb.com → sign up / log in.
2. **Create** → cluster type **Free (M0)** → provider **AWS**, region **Mumbai (ap-south-1)** → Create.
3. **Database Access** → Add New Database User → username e.g. `pulse`, a strong password
   (only letters and numbers is easiest) → role **Read and write to any database** → Add.
4. **Network Access** → Add IP Address → **Add Current IP Address** (do this on Laptop 1) → Confirm.
5. **Database → Connect → Drivers** → copy the string that starts with `mongodb+srv://`.
   Replace `<db_password>` (or `<password>`) with the real password.
6. Open `C:\Main Twitter Project\db_config.local.json` in Notepad. Paste the string between the quotes
   after `"url":` → Save. (This file never goes to GitHub. Never paste the password in chat.)
7. Double-click `C:\Main Twitter Project\DASHBOARD\HOT_ON.bat`. It tests Atlas, copies the data,
   restarts the website and prints **HO GAYA** at the end. If it says STOP, read the reason — nothing
   was changed and the website keeps working.

## 3. Switches
| File (in DASHBOARD) | What it does |
|---|---|
| `HOT_ON.bat` | test + switch Atlas on |
| `HOT_OFF.bat` | switch Atlas off (everything from the laptop again) — use if anything looks wrong |
| `HOT_STATUS.bat` | size of Atlas, last copy, tweets per day laptop vs Atlas |
| `db_config.local.json` → `"build": {"source": "SPLIT"}` | fast hourly build. `"MONGO"` = old slow full build |

## 4. Weekly (2 minutes)
- Double-click `HOT_STATUS.bat`. Size must stay under 400 MB (it shrinks itself to 5 days if not).
- Atlas website → your cluster → **Metrics**: data in/out must stay under 10 GB per 7 days.
- If the office internet IP changes, add the new IP in Atlas **Network Access**.

## 5. Security (once)
- GitHub → repo → Settings → bottom → **Change visibility → Private**.
- Change the keys that were public: Gmail app password (`DASHBOARD\mail_config.json`), Groq key
  (`DASHBOARD\ai_config.json`, `PunjabLens\ai_config.json`), X cookies (`DASHBOARD\x_config.json`),
  ngrok token (put the new one in `DASHBOARD\ngrok_token.local.txt`).
- Collaborators: before their next `git pull`, copy those 5 files somewhere and put them back after.

## 6. Optional: start by itself after a restart
Windows **Task Scheduler** → Create Basic Task → "Political Pulse" → **When I log on** →
Start a program → `C:\Main Twitter Project\DASHBOARD\START_LIVE.bat` → Finish.
Also: Settings → System → Power → **Never sleep** when plugged in.

## If something goes wrong
1. `HOT_OFF.bat` (website back to laptop-only).
2. Slow/odd dashboard numbers: set `"source": "MONGO"` in `db_config.local.json` (old full build next hour).
3. Website not opening: close the server window, run `START_LIVE.bat` again.
