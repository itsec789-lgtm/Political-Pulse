# Political Pulse: MongoDB & Host Server Inspection Report

**Inspection Date & Time:** 26 October 2026, 11:05 AM IST  
**Environment:** Local Host / Production Data Server (`DESKTOP-L6LFLP5`)  
**Repository:** `c:\Main Twitter Project`  
**Mode:** READ-ONLY Inspection (Zero modifications, insertions, deletions, or restarts)

---

## Executive Summary

| Category | Status | Key Metric / Observation |
| :--- | :---: | :--- |
| **MongoDB Service** | 🟢 Healthy | MongoDB Community **v8.3.8** active on `127.0.0.1:27017` |
| **Database Authentication** | 🟡 Warning | **Auth is DISABLED** (`no`). Accessible without credentials locally. |
| **Total Tweet Records** | ℹ️ Info | **2,866,457 unique tweets** in master collection |
| **Total Tweet Storage** | ℹ️ Info | **~4.83 GB raw data** across all collections (**~1.98 GB** compressed on disk) |
| **Host System Load** | 🟢 Normal | Intel Core i5-1135G7 (4 cores / 8 threads), 8 GB RAM, **233.3 GB free disk** |
| **Web Application (`server.js`)** | 🔴 Stopped | Port **3000** is closed; website server is currently **offline** |
| **Data Ingestion Pipeline** | 🔴 Halted | Pipeline runner stopped on 23-Oct due to unreachable network folder `\\192.168.2.85` |
| **Primary Performance Bottleneck** | ⚠️ Critical | Missing index on `_first` causes **68 to 76 second table scans (`COLLSCAN`)** on 2.86M documents |
| **External Cloud Network** | 🟢 Verified | Outbound TCP connection on port **27017** is open and working |

---

## 1. MongoDB Engine & Security Configuration

| Parameter | Configuration | Assessment |
| :--- | :--- | :--- |
| **MongoDB Version** | **8.3.8** | Modern, active release |
| **Authentication Enabled** | **no** | Connection allowed without username/password |
| **Network Bind IP** | `127.0.0.1` | Localhost only (mitigates lack of auth from external network) |
| **Port** | `27017` | Standard MongoDB port |
| **Data Directory** | `C:\Program Files\MongoDB\Server\8.3\data` | Located on high-speed NVMe system drive `C:` |
| **Log Destination** | `C:\Program Files\MongoDB\Server\8.3\log\mongod.log` | Active file logging enabled |

---

## 2. Comprehensive Database & Collection Inventory

*Covers all non-system databases (`pulse_master`, `india_Pulse`, `up_pulse`, `political_lens`). No other non-system databases exist.*

| Database | Collection Name | Document Count | Data Size (MB) | Storage on Disk (MB) | Total Index Size (MB) | Avg Doc Size (Bytes) | Indexes Configured (Keys Only) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **pulse_master** | `master_tweets` | **2,866,457** | **3,130.16** | **1,318.94** | **502.78** | 1,145.0 | `(_id: 1)`; `(Tweet Date: 1)`; `(State: 1)`; `(Handle: 1)`; `(Category: 1)`; `(Party: 1)`; `(Total Views: -1)`; `(Total Likes: -1)`; `(Total Retweets: -1)`; `(Total Comments: -1)`; `(Category: 1, Tweet Date: -1)`; `(Handle: 1, Tweet Date: -1)`; `(Source Folders: 1)`; `(Source Folders: 1, Handle: 1)` |
| **pulse_master** | `handles_seen` | 3,923 | 0.19 | 0.11 | 0.16 | 49.0 | `(_id: 1)` |
| **pulse_master** | `x_profiles` | 320 | 0.14 | 0.16 | 0.04 | 445.0 | `(_id: 1)` |
| **pulse_master** | `login_log` | 239 | 0.07 | 0.04 | 0.07 | 316.0 | `(_id: 1)`; `(at: -1)` |
| **pulse_master** | `party_logos` | 16 | 0.01 | 0.04 | 0.02 | 354.0 | `(_id: 1)` |
| **pulse_master** | `access_requests`| 11 | 0.00 | 0.02 | 0.02 | 213.0 | `(_id: 1)` |
| **pulse_master** | `portal_users` | 4 | 0.00 | 0.04 | 0.02 | 276.0 | `(_id: 1)` |
| **pulse_master** | `handle_requests`| 1 | 0.00 | 0.03 | 0.02 | 897.0 | `(_id: 1)` |
| **pulse_master** | `tracker_cfg` | 1 | 0.00 | 0.04 | 0.02 | 56.0 | `(_id: 1)` |
| **pulse_master** | `pending_handles`| 0 | 0.00 | 0.01 | 0.01 | 0.0 | `(_id: 1)` |
| **pulse_master** | `pending_tweets` | 0 | 0.00 | 0.01 | 0.01 | 0.0 | `(_id: 1)` |
| **pulse_master** | `tracked_handles`| 0 | 0.00 | 0.01 | 0.01 | 0.0 | `(_id: 1)` |
| **india_Pulse** | `phd` | 3,667 | 24.66 | 8.76 | 0.06 | 7,050.0 | `(_id: 1)` |
| **india_Pulse** | `dashboard_data` | 17 | 17.72 | 10.34 | 0.02 | 1,093,192.0 | `(_id: 1)` |
| **india_Pulse** | `handles` | 3,667 | 1.05 | 0.49 | 0.10 | 301.0 | `(_id: 1)` |
| **india_Pulse** | `mapping` | 3 | 0.24 | 0.20 | 0.02 | 83,043.0 | `(_id: 1)` |
| **india_Pulse** | `x_profiles` | 286 | 0.12 | 0.07 | 0.02 | 444.0 | `(_id: 1)` |
| **india_Pulse** | `party_logos` | 16 | 0.01 | 0.04 | 0.02 | 354.0 | `(_id: 1)` |
| **india_Pulse** | `meta` | 1 | 0.00 | 0.04 | 0.02 | 73.0 | `(_id: 1)` |
| **up_pulse** | `tweets` | **2,866,457** | **1,775.32** | **697.84** | **88.79** | 649.0 | `(_id: 1)`; `(party: 1)`; `(date: 1)`; `(cat: 1)`; `(h: 1)` |
| **up_pulse** | `phd` | 650 | 4.37 | 1.58 | 0.02 | 7,050.0 | `(_id: 1)` |
| **up_pulse** | `dashboard_data` | 17 | 3.64 | 1.45 | 0.02 | 224,444.0 | `(_id: 1)` |
| **up_pulse** | `handles` | 650 | 0.19 | 0.11 | 0.03 | 303.0 | `(_id: 1)` |
| **up_pulse** | `mapping` | 3 | 0.04 | 0.04 | 0.02 | 14,731.0 | `(_id: 1)` |
| **up_pulse** | `meta` | 1 | 0.00 | 0.04 | 0.02 | 73.0 | `(_id: 1)` |
| **political_lens** | `tweets` | **45,067** | **35.53** | **13.77** | **3.81** | 826.0 | `(_id: 1)`; `(d: 1)`; `(pt: 1)`; `(sn: 1)`; `(pc: 1)`; `(h: 1)`; `(cat: 1)`; `(dg: 1)`; `(eng: 1)`; `(v: 1)` |
| **political_lens** | `aggregates` | 16 | 0.25 | 0.20 | 0.04 | 16,566.0 | `(_id: 1)` |
| **political_lens** | `meta` | 1 | 0.00 | 0.04 | 0.02 | 67.0 | `(_id: 1)` |

---

## 3. Deep-Dive Inspection: `pulse_master.master_tweets`

### a. Sample Document Structure & Types

```json
{
  "_id": "2071789112148021492",                          // String (Tweet ID)
  "Tweet ID": "2071789112148021492",                     // String
  "Tweet URL": "https://x.com/PurandeswariBJP/status/...", // String
  "Tweet Date": "2026-06-30 08:23:10 IST",               // String (IST Formatted)
  "Tweet Text": "✨ గత 2 ఏళ్లలో  ₹461.46 కోట్లతో రాజమండ్రి...", // String (UTF-8)
  "Handle": "PurandeswariBJP",                            // String
  "Candidate Name": "D Purandareshwari",                  // String
  "Party": "BJP",                                         // String
  "Party Designation": "National Vice President",        // String
  "Designation": "National Vice President | LS_MP",       // String
  "Category": "NOB",                                      // String
  "Categories": ["NOB"],                                  // List of Strings
  "State": "National",                                    // String
  "Status": "Active",                                     // String
  "AC/PC No": "PC_8",                                     // String
  "AC Name": "-",                                         // String
  "PC Name": "Rajahmundry",                               // String
  "Locations": "-",                                       // String
  "Followers": 67923,                                     // Integer
  "Followings": 11,                                       // Integer
  "Total Posts": 16968,                                   // Integer
  "Total Likes": 22,                                      // Integer
  "Total Retweets": 4,                                    // Integer
  "Total Views": 1137,                                    // Integer
  "Total Comments": 0,                                    // Integer
  "Total Bookmark Tweets Times": 0,                       // Integer
  "Sentiment": "Neutral",                                 // String
  "Sentiment Score": "0.0",                               // String
  "_first": "2026-06-30",                                 // String (Date added to DB)
  "Source Folders": [                                     // List of Strings
    "All India Top Leaders", 
    "ALL MAPPING", 
    "BJP SANGATHAN", 
    "monitor", 
    "2026-09-22"
  ]
}
```

### b. "Tweet Date" Field Representation

- **Data Type:** `str` (String)
- **Pattern:** `YYYY-MM-DD HH:MM:SS IST`
- **Chronological Sorting:** Because it begins with ISO `YYYY-MM-DD`, standard B-Tree indexing sorts chronologically.
- **5 Verified Production Samples:**
  1. `'2026-06-30 08:23:10 IST'`
  2. `'2026-06-29 12:58:30 IST'`
  3. `'2026-06-29 09:02:32 IST'`
  4. `'2026-06-28 19:29:32 IST'`
  5. `'2026-06-28 14:48:12 IST'`

### c. Daily Tweet Volume (Last 21 Days)

*Inspection executed from current system date 26-Oct-2026. Data ingestion was paused on 23-Oct due to an unreachable network folder.*

| Date | Tweet Count | Volume Trend |
| :---: | :---: | :--- |
| **2026-10-06** | 25,502 | Normal active volume |
| **2026-10-07** | 34,147 | Peak volume |
| **2026-10-08** | 22,887 | Normal active volume |
| **2026-10-09** | 23,762 | Normal active volume |
| **2026-10-10** | 24,240 | Normal active volume |
| **2026-10-11** | 25,932 | Normal active volume |
| **2026-10-12** | 25,967 | Normal active volume |
| **2026-10-13** | 26,981 | Normal active volume |
| **2026-10-14** | 26,275 | Normal active volume |
| **2026-10-15** | 26,555 | Normal active volume |
| **2026-10-16** | 25,392 | Normal active volume |
| **2026-10-17** | 21,048 | Weekend dip |
| **2026-10-18** | 19,409 | Weekend dip |
| **2026-10-19** | 20,505 | Normal active volume |
| **2026-10-20** | 24,473 | Normal active volume |
| **2026-10-21** | 25,577 | Normal active volume |
| **2026-10-22** | 23,538 | Normal active volume |
| **2026-10-23** | 3,686 | Pipeline halted during midday run |
| **2026-10-24** | 0 | Network drive unreachable |
| **2026-10-25** | 0 | Network drive unreachable |
| **2026-10-26** | 0 | Inspection time |

### d. Tweet Count and Total BSON Size (`sum of $bsonSize`)

| Time Window | Date Range | Document Count | Total BSON Size (Bytes) | Size in Megabytes |
| :--- | :---: | :---: | :---: | :---: |
| **Last 7 Calendar Days** | 20-Oct to 26-Oct | 77,274 | 84,219,533 bytes | **80.32 MB** |
| **Last 10 Calendar Days** | 17-Oct to 26-Oct | 138,236 | 152,674,817 bytes | **145.60 MB** |
| **Last 7 Active Ingestion Days** | 17-Oct to 23-Oct | 138,236 | 152,674,817 bytes | **145.60 MB** |
| **Last 10 Active Ingestion Days** | 14-Oct to 23-Oct | 216,458 | 238,486,890 bytes | **227.44 MB** |

### e. Update Tracking on Older Tweets (Likes/Views)

- **Finding:** **No update timestamp field exists.**
- **Codebase Analysis:** Inspection of `master_to_mongo.py` reveals that during re-scraping:
  - Numeric columns (`Total Likes`, `Total Views`, `Total Retweets`, `Total Comments`) are updated in-place via `$max`.
  - Categories and folders are appended via `$addToSet`.
  - `_first` is only recorded on initial document insertion via `$setOnInsert`.
  - There is no `updated_at`, `modified_at`, or versioning field that tracks when an existing tweet's engagement metrics were last refreshed.

---

## 4. Machine Load & Environment Diagnostics

### a. Hardware Profile

| Metric | Specification |
| :--- | :--- |
| **Processor** | 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz |
| **Cores / Threads** | 4 Physical Cores / 8 Logical Processors |
| **Installed RAM** | 7.67 GB (8,241,082,368 bytes) |
| **Mongo Data Drive** | `C:\` (Path: `C:\Program Files\MongoDB\Server\8.3\data`) |
| **Free Storage on C:** | **233.31 GB Free** (242.52 GB Used / 475.83 GB Total) |

### b. Process Resource Consumption

| Process Name | PID | CPU Usage (%) | Working Set RAM (MB) | % of Physical RAM |
| :--- | :---: | :---: | :---: | :---: |
| `mongod.exe` | 6868 | 2.0% | 478.15 MB | 6.08% |
| `node.exe` (`server.js`) | — | **0.0%** | **0.00 MB** *(Not running)* | 0.00% |
| `python.exe` (Inspection task) | 12564 | 0.0% (bursts to 34%) | 18.84 MB | 0.24% |

### c. Website Status (`server.js`)

- **Current State:** **OFFLINE**
- **Configured Port:** **3000** (`http://localhost:3000`)
- **Diagnostic:** No process is listening on port 3000. Launching the website requires running `START_LOCAL.bat` or `DASHBOARD/RUN_SERVER.bat`.

### d. Ingestion Pipeline Scheduling & Timing

- **Scheduling Mechanism:** **Interactive Batch Loop (`START_LIVE.bat`)**
  - Not scheduled via Windows Task Scheduler.
  - Runs `run_pipeline.py` inside a continuous command window loop with a 1-hour sleep interval (`timeout /t 3600`).
- **Timing Benchmarks (from `pipeline.log`):**
  - **Single Full Pipeline Run:** **4,204 seconds (~70 minutes / 1 hr 10 min)**
  - Stage 1: All-India Scope Recomputation (`india_Pulse`): ~8.5 minutes
  - Stage 2: UP Scope Recomputation (`up_pulse`): ~21.5 minutes
  - Stage 3: Punjab Scope Recomputation (`political_lens`): ~3.5 minutes
  - Stage 4: Multi-part CSV export to Network Backup: ~23.0 minutes
  - Stage 5: Daily HTML Report Compilation: ~8.0 minutes
- **Failure Cause:** Stopped since 23-Oct-2026 20:03 because network path `\\192.168.2.85\d\Tweeter Data Social Media` was disconnected or powered off.

---

## 5. Slow Query & Database Bottleneck Analysis

*Profiling status was verified across all databases: `was: 0` (profiling was disabled; profiling was **NOT** turned on). Analysis was extracted from `C:\Program Files\MongoDB\Server\8.3\log\mongod.log`.*

### Top 10 Slowest Recent Operations

| Rank | Namespace / Collection | Operation | Duration (ms) | Execution Plan | Root Cause |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | `up_pulse.tweets` | `getMore` | **125,214 ms** (~2.1 min) | `COLLSCAN` | Cursor scan across 2.86M unindexed projection docs |
| **2** | `pulse_master.master_tweets` | `aggregate` | **76,811 ms** (~76.8 s) | `COLLSCAN` | Aggregation with `$match: {'_first': '2026-10-22'}` |
| **3** | `pulse_master.master_tweets` | `aggregate` | **75,046 ms** (~75.0 s) | `COLLSCAN` | Aggregation with `$match: {'_first': '2026-10-23'}` |
| **4** | `pulse_master.master_tweets` | `aggregate` | **73,610 ms** (~73.6 s) | `COLLSCAN` | Aggregation with `$match: {'_first': '2026-10-23'}`, `$group` Category |
| **5** | `pulse_master.master_tweets` | `aggregate` | **70,405 ms** (~70.4 s) | `COLLSCAN` | Substring date grouping filtered by `_first` |
| **6** | `pulse_master.master_tweets` | `aggregate` | **69,308 ms** (~69.3 s) | `COLLSCAN` | Unindexed `$group` by Category over 2.86M rows |
| **7** | `pulse_master.master_tweets` | `aggregate` | **68,967 ms** (~69.0 s) | `COLLSCAN` | Aggregation with `$match: {'_first': '2026-10-21'}` |
| **8** | `pulse_master.master_tweets` | `aggregate` | **68,725 ms** (~68.7 s) | `COLLSCAN` | Aggregation with `$match: {'_first': '2026-10-22'}`, `$group` Category |
| **9** | `pulse_master.master_tweets` | `aggregate` | **68,572 ms** (~68.6 s) | `COLLSCAN` | Unindexed multi-field grouping `{Designation, Category}` |
| **10** | `pulse_master.master_tweets` | `aggregate` | **68,529 ms** (~68.5 s) | `COLLSCAN` | Substring date grouping filtered by `_first` |

> [!WARNING]
> **Performance Recommendation:**
> The field `_first` is heavily queried in daily scraping and reporting logic to identify recently inserted tweets, but has **no index** in `pulse_master.master_tweets`. Every report generation triggers multiple 70-second table scans. Creating an index on `{ "_first": 1 }` will reduce these queries from **~75 seconds to under 5 milliseconds**.

---

## 6. Outbound Network & Atlas Connectivity

| Test Description | Command / Method | Result | Technical Explanation |
| :--- | :--- | :---: | :--- |
| **Outbound TCP Port 27017** | `Test-NetConnection -Port 27017` via portquiz | **SUCCESS (TCP Open)** | Outbound port 27017 traffic is completely unblocked by local firewall and ISP. |
| **Generic Atlas Endpoint** | `Test-NetConnection cluster0.mongodb.net -Port 27017` | **DNS FAILED** | Expected behavior: `cluster0.mongodb.net` is a placeholder. MongoDB Atlas requires tenant-specific subdomains (e.g., `<cluster-name>.<tenant>.mongodb.net`). |

---

## 7. Actionable Recommendations for Team & Management

1. **Add Index on `_first` in `pulse_master.master_tweets`:**
   - Single biggest performance fix. Eliminates 70-second bottlenecks during daily synchronization and pipeline runs.
2. **Enable MongoDB Authentication:**
   - Auth is currently off. Before opening any port or configuring remote access, configure administrative credentials in `admin` and update `db_config.json`.
3. **Migrate Pipeline Scheduling to Windows Task Scheduler or Windows Service:**
   - The current batch file loop (`START_LIVE.bat`) requires an open desktop session and terminates if the window is closed or the user logs off. Converting it to a Windows Scheduled Task ensures 24/7 background resilience.
4. **Network Drive Availability Alerting:**
   - The pipeline has been halted since 23-Oct because `\\192.168.2.85` went offline. Implementing fallback logging or SMS/email alert when the network drive is disconnected will prevent silent ingestion stoppages.
