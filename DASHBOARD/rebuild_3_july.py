# -*- coding: utf-8 -*-
"""
STEP 3 -- 1 JULY se AAJ tak ka data (7 network folders se) master me add.

Kya karta hai:
  - 7 folders (neeche list) ki SAARI csv/xlsx padhta hai
  - RAW se: Handle -> Sentiment Score tak ke 16 columns (jo-jo file me hain)
  - MAPPING se: State, Locations, AC/PC No, AC Name, PC Name, Designation,
                Candidate Name, Category, Party, Status
  - Row-level date filter: sirf 1 July se aaj tak (Tweet Date se; UTC->IST convert)
  - Dedupe: Tweet ID par -- par REPLACE nahi, MERGE:
       * numeric fields (likes/views/rt...) me MAX rakha jaata hai (count badhta hai)
       * text fields me jo bhara hai woh rakha jaata hai (blank kabhi overwrite nahi karta)
    => kisi bhi row ka data blank nahi hota.

Chalao:  python rebuild_3_july.py
"""
import os, re, sys, json, glob, datetime
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")
MAPJSON = os.path.join(DATA, "handle_master.json")
NEEDMAP = os.path.join(HERE, "needs_mapping.csv")
sys.path.insert(0, HERE)
import smart_import as SI

FOLDERS = [
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\ALL INDIA ALL PARTY MLAs Twitter",
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\All India Top Leaders",
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\BJP SANGATHAN",
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\CM and DCM",
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\UP_MLA",
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\UP_MP",
    r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)\UttarPradeh data",
]
EXTS = ("*.csv", "*.xlsx", "*.xls", "*.xlsm")
DATE_FROM = datetime.date(2026, 7, 1)
DATE_TO   = datetime.date.today()

SCHEMA = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
          'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
          'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
          'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
          'Category','Party','Status']
NUMCOLS = ['Followers','Followings','Total Posts','Total Comments','Total Likes',
           'Total Retweets','Total Views','Total Bookmark Tweets Times']
# mapping-key -> column
MAPFILL = {'State':'state','Locations':'locations','AC/PC No':'ac_pc_no','AC Name':'ac_name',
           'PC Name':'pc_name','Designation':'designation_raw','Candidate Name':'name',
           'Category':'category','Party':'party','Status':'status'}

RID = re.compile(r'/status(?:es)?/(\d+)')
TZ  = re.compile(r'\s+(IST|UTC|GMT|BST|IDT)\b.*$')
LOG = os.path.join(HERE, "rebuild_july.log")


def log(m):
    line = "[" + datetime.datetime.now().strftime("%H:%M:%S") + "] " + str(m)
    print(line, flush=True)
    try: open(LOG, "a", encoding="utf-8").write(line + "\n")
    except Exception: pass


def to_ist(s):
    s = s.astype(str)
    base = s.str.replace(TZ, '', regex=True)
    dt = pd.to_datetime(base, errors='coerce')
    isutc = s.str.contains(r'\b(?:UTC|GMT)\b', case=False, regex=True).fillna(False)
    dt = dt + pd.to_timedelta(isutc.astype(int) * 5.5, unit='h')
    return (dt.dt.strftime('%Y-%m-%d %H:%M:%S') + ' IST').where(dt.notna(), s), dt


def find_files():
    out = []
    for f in FOLDERS:
        if not os.path.isdir(f):
            log("  !! folder nahi mila: " + f); continue
        n = 0
        for pat in EXTS:
            for p in glob.glob(os.path.join(f, pat)):
                if not os.path.basename(p).startswith("~$"):
                    out.append(p); n += 1
        log("  [%s] files=%d" % (os.path.basename(f), n))
    return out


def main():
    if not os.path.exists(MASTER):
        log("!! master nahi mila - pehle rebuild_2_base.py chalao."); return
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    log("mapping handles: %d" % len(mp))

    files = find_files()
    log("Total files: %d" % len(files))
    frames = []; unmapped = {}
    for f in files:
        try:
            df, _ = SI.smart_read(f, log=lambda *a: None)
        except Exception as e:
            log("  ERROR read (skip): %s -> %s" % (os.path.basename(f)[:40], e)); continue
        # valid rows
        df = df[(df['Handle'].astype(str).str.strip() != '') & (df['Tweet URL'].astype(str).str.strip() != '')]
        if len(df) == 0: continue
        # date: IST + row filter
        df['Tweet Date'], dt = to_ist(df['Tweet Date'])
        keep = ((dt.dt.date >= DATE_FROM) & (dt.dt.date <= DATE_TO)).fillna(False)
        df = df[keep]
        if len(df) == 0: continue
        # schema
        for c in SCHEMA:
            if c not in df.columns: df[c] = ''
        # Tweet ID URL se
        df['Tweet ID'] = df['Tweet URL'].astype(str).map(lambda u: (RID.search(u).group(1) if RID.search(u) else ''))
        # MAPPING se attributes (mapping me na ho to jo file me hai wahi)
        hs = df['Handle'].astype(str).str.strip()
        for col, key in MAPFILL.items():
            mv = hs.map(lambda h: mp.get(h, {}).get(key, None))
            df[col] = [m if (m is not None and str(m).strip() not in ('', '-')) else old
                       for m, old in zip(mv, df[col])]
        for h in hs[~hs.isin(mp)].unique():
            unmapped[h] = unmapped.get(h, 0) + int((hs == h).sum())
        frames.append(df[SCHEMA])
        log("  %-46s +%d rows" % (os.path.basename(f)[:46], len(df)))

    if not frames:
        log("Koi July+ data nahi mila."); return
    new = pd.concat(frames, ignore_index=True)
    log("July+ naye rows (raw): %s" % f"{len(new):,}")
    if unmapped:
        pd.DataFrame(sorted(unmapped.items(), key=lambda x: -x[1]), columns=['Handle','tweets']).to_csv(NEEDMAP, index=False)
        log("Mapping me na mile %d handle -> needs_mapping.csv" % len(unmapped))

    base = pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig', keep_default_na=False)
    base = base.rename(columns=lambda c: str(c).strip())
    for c in SCHEMA:
        if c not in base.columns: base[c] = ''
    log("Base master rows: %s" % f"{len(base):,}")

    comb = pd.concat([base[SCHEMA], new[SCHEMA]], ignore_index=True).fillna('')
    before = len(comb)
    comb['_key'] = comb['Tweet ID'].astype(str).str.strip()
    blank = comb['_key'] == ''
    comb.loc[blank, '_key'] = 'u_' + comb.index[blank].astype(str)   # bina ID wali rows alag rahengi

    # ---- MERGE dedupe -- VECTORIZED (fast). blank kabhi overwrite nahi; numeric me non-zero MAX ----
    dupmask = comb.duplicated('_key', keep=False)
    uniq = comb[~dupmask]
    dups = comb[dupmask]
    if len(dups):
        log("Duplicate Tweet IDs: %s rows -> merge kar raha hoon (fast)..." % f"{len(dups):,}")
        keys = dups['_key']
        TXT = [c for c in SCHEMA if c not in NUMCOLS]
        # numeric: blank->NaN, 0->NaN (taaki 0 asli value ko na haraye), phir max; sab NaN ho to 0-wala max
        num = dups[NUMCOLS].apply(lambda s: pd.to_numeric(s.astype(str).str.replace(',', '', regex=False), errors='coerce'))
        gmax_nz = num.where(num > 0).groupby(keys, sort=False).max()
        gmax_all = num.groupby(keys, sort=False).max()
        gnum = gmax_nz.fillna(gmax_all)
        gnum = gnum.apply(lambda s: s.map(lambda v: '' if pd.isna(v) else str(int(v))))
        # text: blank->NA, groupby.last() NA skip karta hai -> aakhri non-blank bacha rehta hai
        gtxt = dups[TXT].replace('', pd.NA).groupby(keys, sort=False).last().fillna('')
        merged = pd.concat([gtxt, gnum], axis=1).reset_index()
        log("  merged unique rows: %s" % f"{len(merged):,}")
        final = pd.concat([uniq, merged], ignore_index=True)
    else:
        final = uniq
    final = final[SCHEMA]
    log("Master: %s -> %s rows (unique by Tweet ID, merge se)" % (f"{before:,}", f"{len(final):,}"))

    tmp = MASTER + ".tmp"
    final.to_csv(tmp, index=False, encoding='utf-8')
    os.replace(tmp, MASTER)
    log("MASTER likha: " + MASTER)

    # ---- verify: har column me kitne bhare ----
    log("\nColumn fill check (final master):")
    for c in SCHEMA:
        ne = int((final[c].astype(str).str.strip() != '').sum())
        log("  %-30s %s / %s" % (c, f"{ne:,}", f"{len(final):,}"))
    d = final['Tweet Date'].astype(str).str.slice(0, 10)
    log("\nDate range: %s -> %s" % (d.min(), d.max()))
    log("\nDONE. Ab chalao:  python push_all_scopes.py \"data\\master_tweets.csv\"")


if __name__ == "__main__":
    try: main()
    except Exception as e:
        import traceback; log("FATAL: " + str(e)); log(traceback.format_exc()); sys.exit(1)
