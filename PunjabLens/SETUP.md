# Political Lens — Punjab · Setup

This is your own dashboard — same layout, same cards, same charts. Two things changed:

1. The data now comes live from **MongoDB** instead of `data.js`.
2. It covers **Punjab only** (State = Punjab), plus a set of new pages and features.

---

## What is in this folder

```
PunjabLens/
├── server.js               the server that runs the dashboard (API + optional login)
├── aggregate.js            recomputes the numbers when a date range is applied
├── package.json
├── config.json             Mongo URL, database names, port — all in one place
├── ai_config.json          Gemini key (filled in from Settings, never sent to the browser)
├── build_punjab_data.py    builds the Punjab data from the master pool (also has --scan)
├── requirements.txt
├── START.bat               double-click → dashboard starts
├── UPDATE_DATA.bat         double-click → rebuild the data
├── SCHEDULE_DAILY.bat      double-click → set up the daily automatic rebuild
└── public/                 the dashboard files (your HTML/CSS/JS)
    ├── index.html          your layout, with Punjab branding
    ├── style.css           your CSS, with the new modules' styles appended
    ├── app.js              your app.js — only the data source changed
    ├── state-config.js     Punjab theme, party list, leaders, seat counts
    ├── punjab-geo.js       Punjab district boundaries (embedded)
    ├── district-map.js     district choropleth map
    ├── overview-plus.js    level strip + executive summary + header PDF button
    ├── insights.js         data quality, heatmap, momentum, compare
    ├── reports.js          PDF report builder + word/hashtag table
    ├── assistant.js        the assistant's offline engine (fallback)
    ├── assistant-ai.js     connects the assistant to Gemini
    ├── report-ai.js        topic deep search + AI analysis
    ├── extras.js           date range bar + profile modal + media page
    └── wire.js             a small glue file
```

---

## One-time setup

### Step 0 — Is MongoDB running?

Open Compass → `mongodb://localhost:27017` → **Connect**. If databases appear, you are good.
If not: `Win + R` → `services.msc` → **"MongoDB Server (MongoDB)"** → right-click → **Start**.

### Step 1 — Node packages

In a command prompt:

```
cd "C:\Users\HP\Desktop\Punjab Dasbpa\PunjabLens"
npm install
```

If you get "npm is not recognized", install the Node.js LTS build from nodejs.org and open a new command prompt.

### Step 2 — Python packages

```
pip install pymongo
```

(For building from a CSV you also need `pip install pandas`.)

### Step 3 — First, find out where your data is

```
python build_punjab_data.py --scan
```

This walks every database and collection in Mongo, shows which ones look like tweets, which
columns were found in each, **what the State column actually contains**, and how many Punjab
rows there are. Put whichever collection is correct into `config.json` as `sourceDb` /
`sourceCollection`.

### Step 4 — Build the Punjab data

This pulls **Punjab rows only** out of `pulse_master.master_tweets`, de-duplicates them,
computes every aggregate, and writes it all into the `political_lens` database:

```
python build_punjab_data.py --push
```

Check these numbers in the output once:

```
tweets / handles / candidates / parties / constituencies / days / date range
```

> Master pool not in Mongo yet? You can build straight from a CSV:
> ```
> python build_punjab_data.py --csv "C:\path\master_tweets.csv" --push
> ```

### Step 5 — Run the dashboard

```
npm start
```

or double-click `START.bat`. Then open **http://localhost:3000** — it goes straight to the
dashboard.

> **Login is currently off.** `config.json` has `"authEnabled": false`, so no password is
> asked for. To turn it back on, set it to `true` and restart the server — the first admin
> email and password are printed to the console once, so note them down. The login code is
> already there; nothing needs building.

---

## Day-to-day (when new data arrives)

```
python build_punjab_data.py --push
```

(or double-click `UPDATE_DATA.bat`)

A running server checks every 3 minutes whether a new build has landed and clears its cache
automatically. If you want it immediately, use **Settings → Reload from MongoDB**. You never
need to restart the server.

### Running it automatically every day

Right-click `SCHEDULE_DAILY.bat` → **Run as administrator** → enter an hour → done. It creates
a Windows Task Scheduler job called `PoliticalLens_DailyBuild`. To remove it:

```
schtasks /Delete /TN "PoliticalLens_DailyBuild" /F
```

---

## Sharing it with the team / opening it on a phone

The server listens on `0.0.0.0`, so `npm start` prints something like this:

```
on this laptop  :  http://localhost:3000
phone / team    :  http://192.168.1.24:3000
```

The second URL works from any phone or laptop on the same office wifi.

- Windows Firewall will ask the first time — tick **Private networks**.
- If the laptop restarts or the wifi changes, the IP can change; check the console again.
- This is **local network only**. Do not expose it to the internet as-is — login is currently off.

---

## Database layout

| Database | Collection | What it holds |
|---|---|---|
| `pulse_master` | `master_tweets` | the all-India master pool — **read-only**, this script never writes to it |
| `political_lens` | `tweets` | Punjab tweets only (de-duplicated by Tweet ID) |
| `political_lens` | `aggregates` | ready-made blocks for the dashboard (kpis, parties, candidates, geo, …) |
| `political_lens` | `meta` | timestamp of the last build |
| `political_lens` | `users`, `login_log` | for login — not created while login is off |

The aggregates are stored as separate documents. Putting them all in one would blow MongoDB's
16 MB document limit.

---

## config.json

```json
{
  "mongoUrl": "mongodb://localhost:27017",
  "sourceDb": "pulse_master",
  "sourceCollection": "master_tweets",
  "targetDb": "political_lens",
  "state": "Punjab",
  "port": 3000,
  "explorerLimit": 25000,
  "authEnabled": false
}
```

- `explorerLimit` — how many of the latest tweets go to Tweet Explorer / Insights / Reports.
  Higher means more detail but a heavier page. 25,000 runs comfortably.
- `authEnabled` — currently `false`, so login is off. Set it to `true` and restart to enable it.
- To use Atlas (cloud), just put your connection string in `mongoUrl`. Nothing else changes.

---

## What is new (ported from the other dashboard)

| Feature | Where | What it does |
|---|---|---|
| **Date range** | the bar at the top | Last 7/30/90 days or custom dates. Every KPI, chart, map, table, report and AI answer follows that window. The numbers are recomputed on the server, so they are exact rather than estimated from a sample |
| **District map** | Constituencies | Punjab choropleth coloured by tweets / sentiment / positive %, with top districts, CM and Speaker, and the 2022 assembly strength alongside |
| **Level strip** | Overview | LS MP / RS MP / MLA / MLC — how much data sits at each level |
| **Executive summary** | Overview | an auto-written narrative that respects the current filters |
| **Insights** | sidebar | data quality, weekday × hour heatmap, momentum (7d vs 7d), party comparison, language split, engagement quality, repeated text, silent handles |
| **Media & Press** | sidebar | from the `Category` column — politicians vs media houses vs journalists: share, sentiment comparison, top handles, and what each group talks about |
| **Profile** | click any candidate card or media row | that handle's full record — Lens Score, followers, an activity sparkline, top tweets, and the negative tweets that travelled furthest |
| **PDF reports** | Reports, and the header PDF button | 5 templates, rendered by the browser's own print engine so the text stays selectable |
| **Topic deep-dive** | Reports | any keyword → searched across the whole database → a full report on that topic |
| **AI analysis** | the ✨ button on Reports | Gemini writes an analysis from the report's numbers; it goes into the PDF too |
| **Assistant** | bottom-right button | ask questions in plain English — Gemini when a key is set, built-in offline answers otherwise |
| **Phone / team access** | on server start | listens on `0.0.0.0`, and the LAN URL is printed to the console |
| **Auto update** | `SCHEDULE_DAILY.bat` | rebuilds daily; the server picks it up within 3 minutes |
| **Login** | `/login` | currently **off** (`authEnabled:false`) — the code is ready whenever you want it |

> There is deliberately no admin panel. Adding and removing users is a two-minute job directly
> in Compass under `political_lens.users`; a whole page for it would only make the dashboard heavier.

---

## Turning on the AI (Gemini)

1. **Get a key** — [aistudio.google.com](https://aistudio.google.com) → *Get API key*. The free tier is plenty.
2. In the dashboard open **Settings → AI Assistant & Reports**.
3. Paste the key, pick a model, hit **Save**. The tag flips from `Off` to `On`.

**Where the key goes:** onto the server only, into `ai_config.json`. It never reaches the
browser — the dashboard just calls `/api/ask` and `/api/ai/narrative`, and the server attaches
the key. So no user can lift it out of the browser.

**What the model is sent:** not raw tweets. Only a small digest (~8 KB) of our own computed
numbers — totals, party breakdown, top candidates, constituencies, words, hashtags, the daily
and hourly trend, and the text of the top five or six tweets. The prompt states plainly that
inventing any fact, name, date or figure beyond those numbers is forbidden, and that it must
say "That is not in this data" when the answer is not there. Two benefits:

- the model cannot make things up
- every question stays cheap — sending the full dataset each time would be very expensive

**Filters and date ranges are respected** — ask a question with filters applied and the digest
is built from that same view, and the AI states which scope it answered on.

**The model list is fetched live.** As soon as a key is saved, the dropdown is populated from
Google (`/api/ai/models`), so retired models never appear. The default is `gemini-3.5-flash`.
Google keeps retiring models — `gemini-2.0-flash` is gone and `gemini-2.5-pro` is no longer
offered to new users — which is why the list is not hardcoded. If a selected model is retired
mid-use, the server automatically retries once on the default and repairs the config, so the
dashboard never gets stuck.

To turn the AI off again, hit **Remove** in Settings — the assistant falls back to offline mode
rather than disappearing.

---

## Topic Deep-Dive reports

Reports → **Topic Deep-Dive** → type a keyword (`drugs`, `farmers`, `power`, `jobs`).

- With **"Search the whole database"** ticked, the search runs across the entire Punjab corpus,
  not just the loaded 25,000 sample. The hint below tells you how many tweets matched.
- The report covers volume, sentiment (compared against the overall picture), party-wise share,
  top handles, constituency breakdown, the daily trend, and the actual viral tweets.
- Hit **✨ AI analysis** and Gemini's read of those numbers is added inside the report — and it
  is included in **Download PDF**.

You can pass more than one keyword, separated by commas: `drugs, chitta, addiction`.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| `MongoDB offline — see Settings` | Check Compass connects; `services.msc` → MongoDB Server → Start |
| `No "aggregates" collection` | `python build_punjab_data.py --push` has not been run yet |
| **0** Punjab tweets | Run `python build_punjab_data.py --scan`. It shows which db/collection holds the data and what the State column actually contains. Set `sourceDb` / `sourceCollection` / `state` in `config.json` accordingly |
| `Nothing found in <db>.<coll>` | The script searches on its own and prints the collection it found — put that name in `config.json` |
| Column names are different | Not a problem — the script recognises common names like `username`, `text`, `created_at`, `likes`. Anything it could not find is listed on the `note:` line |
| An old `punjab_pulse` database is lying around | The database was renamed to `political_lens`. In Compass, hover `punjab_pulse` → 🗑 → Drop Database. The data comes back with `--push` |
| Everything reads 0 after picking a date range | There are no tweets in that window. Click "All time" and check `date_from → date_to`; the preset chips count back from the last day in the data, not from today |
| Media page is empty | The master data has no `Category` column, or it is blank. Fill it in and run `--push` again |
| It will not open on a phone | Same wifi? Node allowed through Windows Firewall? Use the LAN URL from the console, not localhost |
| Some districts are grey on the map | The note under the map lists the constituency names that did not match a district — add them to `DIST_ALIASES` in `public/district-map.js` |
| Port 3000 is busy | `taskkill /F /IM node.exe` then `npm start` |
| Forgotten password | Drop the `political_lens.users` collection in Compass and restart the server — a new password is printed to the console |
| AI fails with `API key not valid` | Paste the key again in Settings (watch for stray spaces) |
| AI fails with `quota` | The free tier limit was hit — wait a while, or switch to a Flash model |
| AI fails with `model no longer available` | Open the Settings dropdown and pick a current model, then Save. The list comes live from Google |

---

*Created by Data Team*
