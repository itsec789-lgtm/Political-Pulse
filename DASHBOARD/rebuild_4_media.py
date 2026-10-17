# -*- coding: utf-8 -*-
"""
STEP 4 -- MEDIA HOUSES + JOURNALIST ka data master me add.

Inke liye alag rule (kyunki ye kisi state/seat ke nahi hote):
  - State, Locations, AC/PC No, AC Name, PC Name  ->  khaali ('-')
  - Designation / Category  ->  'Media House'  ya  'Journalist'   (folder ke hisaab se)
  - Party -> '-'   (mapping me ho to wahi)
  - Status -> 'Active'
  - Baaki (Handle..Sentiment Score) raw file se, jaisa hai waisa

Isse:
  - Reports me ye handles milenge (Category se pehchane jaayenge)
  - State-wise views (UP dashboard) me ye NAHI aayenge (state blank hai) -- sahi hai
  - Ye handles mapping me bhi add ho jaate hain (aage auto-update khud map karega)

Chalao (ek baar):  python rebuild_4_media.py
"""
import os, re, sys, json, glob, datetime
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")
MAPJSON = os.path.join(DATA, "handle_master.json")
sys.path.insert(0, HERE)
import smart_import as SI

BASE = r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
# folder -> Category/Designation label
MEDIA_FOLDERS = {
    os.path.join(BASE, "Media Houses"): "Media House",
    os.path.join(BASE, "journalist"):   "Journalist",
}
EXTS = ("*.csv", "*.xlsx", "*.xls", "*.xlsm")
DATE_FROM = datetime.date(2026, 4, 1)      # inka poora data (Apr se aaj tak)
DATE_TO   = datetime.date.today()

SCHEMA = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
          'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
          'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
          'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
          'Category','Party','Status']
NUMCOLS = ['Followers','Followings','Total Posts','Total Comments','Total Likes',
           'Total Retweets','Total Views','Total Bookmark Tweets Times']
RID = re.compile(r'/status(?:es)?/(\d+)')
TZ  = re.compile(r'\s+(IST|UTC|GMT|BST|IDT)\b.*$')
LOG = os.path.join(HERE, "rebuild_media.log")


def log(m):
    line = "[" + datetime.datetime.now().strftime("%H:%M:%S") + "] " + str(m)
    print(line, flush=True)
    try: open(LOG, "a", encoding="utf-8").write(line + "\n")
    except Exception: pass


def to_ist(s):
    s = s.astype(str)
    dt = pd.to_datetime(s.str.replace(TZ, '', regex=True), errors='coerce')
    isutc = s.str.contains(r'\b(?:UTC|GMT)\b', case=False, regex=True).fillna(False)
    dt = dt + pd.to_timedelta(isutc.astype(int) * 5.5, unit='h')
    return (dt.dt.strftime('%Y-%m-%d %H:%M:%S') + ' IST').where(dt.notna(), s), dt


def main():
    if not os.path.exists(MASTER):
        log("!! master nahi mila."); return
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    log("mapping handles (pehle): %d" % len(mp))

    frames = []; newh = {}
    for folder, label in MEDIA_FOLDERS.items():
        if not os.path.isdir(folder):
            log("  !! folder nahi mila: " + folder); continue
        files = []
        for pat in EXTS:
            files += [p for p in glob.glob(os.path.join(folder, pat)) if not os.path.basename(p).startswith("~$")]
        log("[%s] files=%d  (label: %s)" % (os.path.basename(folder), len(files), label))
        for f in files:
            try:
                df, _ = SI.smart_read(f, log=lambda *a: None)
            except Exception as e:
                log("   ERROR read (skip): %s -> %s" % (os.path.basename(f)[:40], e)); continue
            df = df[(df['Handle'].astype(str).str.strip() != '') & (df['Tweet URL'].astype(str).str.strip() != '')]
            if len(df) == 0: continue
            df['Tweet Date'], dt = to_ist(df['Tweet Date'])
            df = df[((dt.dt.date >= DATE_FROM) & (dt.dt.date <= DATE_TO)).fillna(False)]
            if len(df) == 0: continue
            for c in SCHEMA:
                if c not in df.columns: df[c] = ''
            df['Tweet ID'] = df['Tweet URL'].astype(str).map(lambda u: (RID.search(u).group(1) if RID.search(u) else ''))
            # MEDIA rule: koi state/seat nahi
            df['State'] = ''; df['Locations'] = '-'; df['AC/PC No'] = '-'
            df['AC Name'] = '-'; df['PC Name'] = '-'
            df['Designation'] = label; df['Category'] = label
            df['Status'] = 'Active'
            hs = df['Handle'].astype(str).str.strip()
            df['Party'] = hs.map(lambda h: (mp.get(h, {}).get('party') or '-') if h in mp else '-')
            df['Candidate Name'] = [ (mp.get(h, {}).get('name') or n) if h in mp else n
                                     for h, n in zip(hs, df['Candidate Name']) ]
            for h in hs.unique():
                if h not in mp: newh[h] = label
            frames.append(df[SCHEMA])
            log("   %-46s +%d rows" % (os.path.basename(f)[:46], len(df)))

    if not frames:
        log("Media/journalist data nahi mila."); return
    new = pd.concat(frames, ignore_index=True)
    log("Media+Journalist naye rows: %s | naye handles: %d" % (f"{len(new):,}", len(newh)))

    # mapping me add
    for h, label in newh.items():
        mp[h] = {'handle': h, 'name': '', 'state': '', 'locations': '-', 'ac_pc_no': '-',
                 'ac_name': '-', 'pc_name': '-', 'designation_raw': label,
                 'designations': [label], 'levels': ['Others'], 'category': label,
                 'party': '-', 'status': 'Active', 'tweet_url': '', 'profile_url': 'https://x.com/' + h}
    json.dump(mp, open(MAPJSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    log("mapping handles (ab): %d" % len(mp))

    # master merge (wahi safe merge - blank/0 kabhi asli value ko nahi haraata)
    base = pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig', keep_default_na=False)
    base = base.rename(columns=lambda c: str(c).strip())
    for c in SCHEMA:
        if c not in base.columns: base[c] = ''
    log("Base master rows: %s" % f"{len(base):,}")
    comb = pd.concat([base[SCHEMA], new[SCHEMA]], ignore_index=True).fillna('')
    before = len(comb)
    comb['_key'] = comb['Tweet ID'].astype(str).str.strip()
    blank = comb['_key'] == ''
    comb.loc[blank, '_key'] = 'u_' + comb.index[blank].astype(str)
    dm = comb.duplicated('_key', keep=False)
    uniq, dups = comb[~dm], comb[dm]
    if len(dups):
        keys = dups['_key']; TXT = [c for c in SCHEMA if c not in NUMCOLS]
        num = dups[NUMCOLS].apply(lambda s: pd.to_numeric(s.astype(str).str.replace(',', '', regex=False), errors='coerce'))
        gnum = num.where(num > 0).groupby(keys, sort=False).max().fillna(num.groupby(keys, sort=False).max())
        gnum = gnum.apply(lambda s: s.map(lambda v: '' if pd.isna(v) else str(int(v))))
        gtxt = dups[TXT].replace('', pd.NA).groupby(keys, sort=False).last().fillna('')
        final = pd.concat([uniq, pd.concat([gtxt, gnum], axis=1).reset_index()], ignore_index=True)
    else:
        final = uniq
    final = final[SCHEMA]
    log("Master: %s -> %s rows (unique by Tweet ID)" % (f"{before:,}", f"{len(final):,}"))

    tmp = MASTER + ".tmp"
    final.to_csv(tmp, index=False, encoding='utf-8')
    try:
        os.replace(tmp, MASTER); log("MASTER likha: " + MASTER)
    except PermissionError:
        log("!! master read-only/locked. Chalao:  attrib -r \"%s\"  phir ye script dobara" % MASTER)
        log("   (naya data yahan hai: %s)" % tmp); return

    cat = final['Category'].astype(str).value_counts()
    log("\nCategory counts (top): %s" % dict(list(cat.items())[:8]))
    log("Media House rows : %s" % f"{int((final['Category']=='Media House').sum()):,}")
    log("Journalist rows  : %s" % f"{int((final['Category']=='Journalist').sum()):,}")
    log("\nDONE. Ab chalao:  python push_all_scopes.py \"data\\master_tweets.csv\"")


if __name__ == "__main__":
    try: main()
    except Exception as e:
        import traceback; log("FATAL: " + str(e)); log(traceback.format_exc()); sys.exit(1)
