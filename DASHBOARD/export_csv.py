# -*- coding: utf-8 -*-
"""
export_csv.py  --  All-India poora dataset (Apr 1 -> aaj tak) CSV me.

Columns (exact order, jaisa manga):
Handle, Tweet URL, Tweet ID, Tweet Date, Tweet Text, Followers, Followings,
Date of Joining, Total Posts, Total Comments, Total Likes, Total Retweets,
Total Views, Total Bookmark Tweets Times, Sentiment, Sentiment Score,
State, Locations, AC/PC No, AC Name, PC Name, Designation, Candidate Name,
Category, Party

- Attribute columns (State..Party) MAPPING se bharte hain (authoritative).
  Handle mapping me na ho to row me jo hai wahi.
- Tweet ID: URL me se /status/<id> (agar column khaali ho).
- Output: X folder me  All_India_Export_YYYY-MM-DD.csv

Chalao:  C:\\Users\\arpan\\anaconda3\\python.exe export_csv.py
"""
import os, re, json, datetime
import pandas as pd

HERE   = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, "data", "master_tweets.csv")
MAPJSON= os.path.join(HERE, "data", "handle_master.json")
OUTDIR = r"\\192.168.2.85\d\Social Media"          # network folder (yahin save hoga)
OUT    = os.path.join(OUTDIR, "All_India_Export_" + datetime.date.today().isoformat() + ".csv")

COLS = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
        'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
        'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
        'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
        'Category','Party']

# mapping-key -> output column
MAPFILL = {'State':'state','Locations':'locations','AC/PC No':'ac_pc_no','AC Name':'ac_name',
           'PC Name':'pc_name','Designation':'designation_raw','Candidate Name':'name',
           'Category':'category','Party':'party'}

RID = re.compile(r'/status(?:es)?/(\d+)')

def main():
    if not os.path.isdir(OUTDIR):
        print("!! Network folder nahi mila:", OUTDIR)
        print("   (network/VPN check karo, ya OUTDIR badlo)"); return
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    print("mapping handles:", len(mp))
    first = True
    total = 0
    DATE_FROM = '2026-04-01'
    TODAY = datetime.date.today().isoformat()
    for ch in pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig', chunksize=100000):
        ch = ch.rename(columns=lambda c: c.strip()).fillna('')
        # date window: Apr 1 -> aaj
        d = ch['Tweet Date'].astype(str).str.slice(0, 10)
        ch = ch[(d >= DATE_FROM) & (d <= TODAY)]
        if len(ch) == 0: continue
        # jo columns file me nahi (naye rows me blank the) unhe bana do
        for c in COLS:
            if c not in ch.columns: ch[c] = ''
        # Tweet ID: HAMESHA URL se lo (original file me scientific notation se kharab tha
        # jaise 2.07185e+18 - URL me asli poora ID hota hai). URL me na mile to purana.
        url_id = ch['Tweet URL'].astype(str).map(lambda u: (RID.search(u).group(1) if RID.search(u) else ''))
        ch['Tweet ID'] = [u if u else old for u, old in zip(url_id, ch['Tweet ID'])]
        # attribute columns MAPPING se (authoritative; mapping me na ho to jo row me hai wahi)
        hs = ch['Handle'].astype(str).str.strip()
        for col, key in MAPFILL.items():
            mapped = hs.map(lambda h: mp.get(h, {}).get(key, None))
            ch[col] = [m if (m is not None and str(m).strip() != '') else old
                       for m, old in zip(mapped, ch[col])]
        out = ch[COLS]
        out.to_csv(OUT, index=False, encoding='utf-8-sig', mode=('w' if first else 'a'), header=first)
        first = False
        total += len(out)
        print("  likhe:", f"{total:,}", "rows...")
    print("\nDONE:", OUT)
    print("Total rows:", f"{total:,}", "| Columns:", len(COLS))
    # Excel ki limit 10,48,576 rows -> usse zyada ho to month-wise parts bhi bana do
    EXCEL_LIMIT = 1048576
    if total > EXCEL_LIMIT - 1:
        print("\n(Rows Excel limit se zyada -> month-wise parts bana raha hoon)")
        made = {}
        for ch in pd.read_csv(OUT, dtype=str, encoding='utf-8-sig', chunksize=200000, keep_default_na=False):
            ch = ch.rename(columns=lambda c: str(c).strip())
            for ym, g in ch.groupby(ch['Tweet Date'].astype(str).str.slice(0, 7)):
                if not ym or len(ym) != 7: ym = 'other'
                p = OUT.replace('.csv', '_' + ym + '.csv')
                g.to_csv(p, index=False, encoding='utf-8-sig', mode=('a' if p in made else 'w'), header=(p not in made))
                made[p] = made.get(p, 0) + len(g)
        for p, n in sorted(made.items()):
            print("   ", os.path.basename(p), f"{n:,} rows")
        print("  (poori file bhi rahegi - Excel me sirf parts khulenge)")

if __name__ == '__main__':
    main()
