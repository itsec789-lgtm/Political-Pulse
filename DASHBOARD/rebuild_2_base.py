# -*- coding: utf-8 -*-
"""
STEP 2 -- BASE MASTER (1 Apr - 1 July) tumhari original CSV se.

NIYAM: data AS-IS. Har cell jaisa source me hai waisa hi master me.
  - Koi column drop nahi, koi cell blank nahi kiya jaayega
  - Followers/Followings/DOJ/Posts/Comments/Likes/RT/Views/Bookmarks - jyon ka tyon
  - Sirf 2 safe cheezein: (a) Tweet ID URL se theek (original me 2.05E+18 kharab tha)
                          (b) 26-column schema me line-up (missing col -> khaali banega)
  - Dedupe NAHI karte yahan - tumhari base file jaisi hai waisi hi rahegi.

Chalao:  python rebuild_2_base.py
"""
import os, re, datetime
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")

SRC = r"C:\Users\arpan\OneDrive\Desktop\New folder\All India Tweeter Data (04-07-2026).csv"

# master ka poora schema (26)
SCHEMA = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
          'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
          'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
          'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
          'Category','Party','Status']

RID = re.compile(r'/status(?:es)?/(\d+)')
TZ  = re.compile(r'\s+(IST|UTC|GMT|BST|IDT)\b.*$')


def to_ist(s):
    """UTC/GMT -> +5:30 IST. IST/no-tz -> waise ka waisa. Parse na ho -> original."""
    s = s.astype(str)
    base = s.str.replace(TZ, '', regex=True)
    dt = pd.to_datetime(base, errors='coerce')
    isutc = s.str.contains(r'\b(?:UTC|GMT)\b', case=False, regex=True).fillna(False)
    dt = dt + pd.to_timedelta(isutc.astype(int) * 5.5, unit='h')
    return (dt.dt.strftime('%Y-%m-%d %H:%M:%S') + ' IST').where(dt.notna(), s)


def main():
    if not os.path.exists(SRC):
        print("!! Source CSV nahi mila:\n   " + SRC); return
    os.makedirs(DATA, exist_ok=True)
    if os.path.exists(MASTER):
        print("!! master_tweets.csv pehle se hai - pehle rebuild_1_reset.py chalao."); return

    print("Source:", SRC)
    first = True; total = 0; fixed_id = 0
    colcheck = None
    for ch in pd.read_csv(SRC, dtype=str, encoding='utf-8-sig', chunksize=100000, keep_default_na=False):
        ch = ch.rename(columns=lambda c: str(c).strip())
        if colcheck is None:
            colcheck = list(ch.columns)
            print("Source columns (%d):" % len(colcheck))
            print("  ", ", ".join(colcheck))
            miss = [c for c in SCHEMA if c not in colcheck]
            if miss: print("  (source me nahi, khaali rahenge):", ", ".join(miss))
        # schema line-up: jo column source me nahi, woh khaali
        for c in SCHEMA:
            if c not in ch.columns: ch[c] = ''
        # Tweet ID: URL se asli (kharab scientific-notation ki jagah)
        uid = ch['Tweet URL'].astype(str).map(lambda u: (RID.search(u).group(1) if RID.search(u) else ''))
        newid = [u if u else str(o) for u, o in zip(uid, ch['Tweet ID'])]
        fixed_id += int(sum(1 for a, b in zip(newid, ch['Tweet ID']) if a != str(b)))
        ch['Tweet ID'] = newid
        # date IST format me (values badalti nahi, sirf tz normalize)
        ch['Tweet Date'] = to_ist(ch['Tweet Date'])
        out = ch[SCHEMA]
        out.to_csv(MASTER, index=False, encoding='utf-8', mode=('w' if first else 'a'), header=first)
        first = False; total += len(out)
        print("  likhe:", f"{total:,}", "rows...")

    print("\nBASE MASTER ban gaya:", MASTER)
    print("  rows:", f"{total:,}", "| columns:", len(SCHEMA), "| Tweet ID theek kiye:", f"{fixed_id:,}")
    print("\nVERIFY chala raha hoon (kuch miss to nahi hua)...")
    verify(SRC)
    print("\nAb chalao:  python rebuild_3_july.py")


def verify(src):
    """har numeric column ka SUM source vs master - barabar hona chahiye."""
    cols = ['Followers','Followings','Total Posts','Total Comments','Total Likes',
            'Total Retweets','Total Views','Total Bookmark Tweets Times']
    def sums(path):
        s = {c: 0 for c in cols}; n = 0; ne = {c: 0 for c in cols}
        for ch in pd.read_csv(path, dtype=str, encoding='utf-8-sig', chunksize=200000, keep_default_na=False):
            ch = ch.rename(columns=lambda c: str(c).strip()); n += len(ch)
            for c in cols:
                if c in ch.columns:
                    v = pd.to_numeric(ch[c].astype(str).str.replace(',', '', regex=False), errors='coerce')
                    s[c] += float(v.fillna(0).sum()); ne[c] += int((ch[c].astype(str).str.strip() != '').sum())
        return s, n, ne
    a, na, nea = sums(src); b, nb, neb = sums(MASTER)
    print("  rows: source=%s  master=%s  %s" % (f"{na:,}", f"{nb:,}", "OK" if na == nb else "!! MISMATCH"))
    allok = (na == nb)
    for c in cols:
        ok = abs(a[c] - b[c]) < 1 and nea[c] == neb[c]
        allok = allok and ok
        print("  %-30s source=%-16s master=%-16s filled %s/%s  %s" %
              (c, f"{a[c]:,.0f}", f"{b[c]:,.0f}", f"{nea[c]:,}", f"{neb[c]:,}", "OK" if ok else "!! MISMATCH"))
    print("  ==> " + ("SAB SAHI - koi data miss nahi hua." if allok else "!! kuch mismatch hai - upar dekho"))


if __name__ == "__main__":
    main()
