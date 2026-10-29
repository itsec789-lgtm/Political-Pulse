# UPDATE 29-Oct-2026: main system par chalane ka tareeka

Yeh folder main system ko **28 aur 29 Oct ke saare badlaav** deta hai: code bhi aur MongoDB bhi.

## Kya karna hai (bas 3 kadam)

1. Yeh poora folder `UPDATE_29-OCT` main system par **project ke andar** copy kijiye:
   `C:\Main Twitter Project\UPDATE_29-OCT\`
2. Dashboard server chal raha ho (`START_LIVE.bat` / `RUN_SERVER.bat` wali window khuli ho), to theek hai. Use band mat kijiye.
3. **`RUN_UPDATE.bat` par double-click.** Lagbhag **15–20 minute** lagenge. Aakhir mein yeh line aani chahiye:

   `====  SAB THEEK. Update poora.  ====`

   Phir browser mein **Ctrl+F5** kijiye.

> Agar project kisi aur jagah hai to: `RUN_UPDATE.bat "D:\Mera Project"`

## Script kya-kya karti hai

| Step | Kaam | Samay |
|---|---|---|
| 1 | Jo 26 files badlengi, unka backup → `_backup_before_UPDATE_29-OCT\` | 1 s |
| 2 | Nayi files copy (`nayi-files\` → project) | 1 s |
| 3 | Syntax check (node + python) | 10 s |
| 4 | MongoDB: `daily_summary` dobara (`build_daily_summary.py --live --all`) | 3–5 min |
| 5 | MongoDB: dashboard data dobara, All India + UP + Punjab + Atlas (`run_pipeline.py --no-backup --force-push`) | 10–15 min |
| 6 | Dashboard server restart (port 3000; `RUN_SERVER.bat` use khud wapas chalata hai) | 30 s |
| 7 | Jaanch: sentiment = tweets, retweet sentiment = retweets, handle numbers = MongoDB | 10 s |

Koi bhi step fail ho to script wahin ruk jaati hai aur saaf batati hai. Sab kuch `update_log.txt` mein likha jaata hai.

## MongoDB mein kya badlega

| Collection | Badlaav |
|---|---|
| `pulse_master.daily_summary` | Sentiment, hourly, hashtags ab sirf tweets se. Nayi fields: comments (`cm`/`rcm`), retweet sentiment (`rs`), `sv: 2` |
| `india_Pulse` / `up_pulse` / Punjab: `dashboard_data`, `phd`, `handles` | Tweets-only sentiment aur hourly, retweet sentiment (`sentRT`, `rs`, `SENT_DAILY.SR`), viral list bina retweets |
| `pulse_master.master_tweets` (asli tweets) | **Kuch nahi.** Koi tweet joda ya hataya nahi jaata |

Data copy nahi hota. Wahan ke `master_tweets` se naye code ke saath **dobara banta hai**, isliye main system ke naye tweets bhi shaamil rehte hain.

## Dashboard par kya naya dikhega

- Har section mein tweets aur retweets alag-alag (KPI, Top 50, Category, Handle Analytics, comparisons): sab jagah ek hi number
- Handle ki saari spellings (`AmitShah` / `amitshah`) judkar ginti
- Dashboard tab ka Top-8 crash theek
- UP dashboard ke category cards sirf UP ke handles (LS MP 94, MLA 401, CM 1, Dy CM 2)
- Parties tab: asli likes, retweets aur sentiment (andaza nahi)
- Home engagement rate mein comments bhi
- Leader Board ki photos gol
- **Sentiment tab:** Tweets / Retweets button, date filter, aur "Sentiment by Handle" mein Top 12 / 25 / 50 / 100 / All, chuni tareekh ke hisaab se

Poori jaankari: `DASHBOARD\DATA_CONSISTENCY_AUDIT_REPORT.md`

## Doosre commands

| Command | Kaam |
|---|---|
| `RUN_UPDATE.bat --check` | Sirf jaanch, kuch nahi badalta |
| `RUN_UPDATE.bat --rollback` | 26 files purani halat mein. Phir `RUN_SERVER` window band karke `START_LIVE.bat` chalaiye |

## Dhyaan dein

- Update ke dauraan (15–20 min) dashboard purana data dikhata rahega, aur end mein server ek baar restart hoga.
- Main system ki `data\*.json` snapshot files, `handle_master.json` aur mapping files **nahi chhedi jaatin**. Woh wahan ki mapping se hi chalti hain.
- Agar main system par pipeline us waqt khud bhi chal raha ho, to koi baat nahi. `run_pipeline.py` ka apna lock hai, woh ek ke baad ek chalenge.
