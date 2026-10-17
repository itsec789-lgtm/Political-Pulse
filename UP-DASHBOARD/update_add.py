# -*- coding: utf-8 -*-
"""
update_add.py  -  INCREMENTAL update: sirf NAYE din ki CSV do.

Pehli baar (master banao - poori April1..July1 wali CSV se, ek hi baar):
    python update_add.py "C:\\path\\April1_July1.csv" --init --push

Uske baad (har baar sirf naye din, jaise July2..July8):
    python update_add.py "C:\\path\\July2_July8.csv" --push

Kaise kaam karta hai:
  - Sab tweets 'data/master_tweets.csv' me jama rehte hain.
  - Naya data aata hai -> master me jud jaata hai -> Tweet URL se DUPLICATE hat jaate hain
    (galti se overlapping din de diye to bhi safe).
  - Phir poora recompute (CM_DATA, hashtags, charts, sab) -> MongoDB update.
  - Aapko har baar poora data NAHI dena - bas naye din.

Zaroorat: pip install pandas pymongo
"""
import sys, os
import pandas as pd
import update_dashboard as U

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")
IDCOL = "Tweet URL"                      # Tweet ID mangled hota hai; URL unique hai
NEED = set([IDCOL] + list(U.C.values())) # dedup key + build ke liye zaroori columns


def load_needed(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.xlsx', '.xls', '.xlsm'):
        # Excel support (zaroorat: pip install openpyxl)
        df = pd.read_excel(path, dtype=str)
        df = df.rename(columns=lambda c: str(c).strip())
        keep = [c for c in df.columns if c in NEED]
        df = df[keep]
    else:
        df = pd.read_csv(path, dtype=str, usecols=lambda c: c.strip() in NEED)
        df = df.rename(columns=lambda c: c.strip())
    df = df.fillna('')
    # header-check: kaunse zaroori columns mile / nahi mile
    found = set(df.columns)
    missing = [c for c in sorted(NEED) if c not in found]
    print("  columns found:", sorted(found))
    if missing:
        print("  !! MISSING needed columns:", missing, "-> header check karo")
    return df


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit('Usage: python update_add.py "new_data.csv" [--init] [--push]')
    new_csv = sys.argv[1]
    init = '--init' in sys.argv
    push = '--push' in sys.argv

    print("Reading NEW csv:", new_csv)
    new = load_needed(new_csv)
    print("  new rows:", len(new))

    if init or not os.path.exists(MASTER) or os.path.getsize(MASTER) < 100:
        combined = new
        print("  master banaya (init)" if init else "  master nahi tha -> naya banaya")
    else:
        print("Reading master:", MASTER)
        master = load_needed(MASTER)
        print("  master rows (purane):", len(master))
        combined = pd.concat([master, new], ignore_index=True)

    if IDCOL not in combined.columns:
        sys.exit("ERROR: '%s' column CSV me nahi mila. Header check karo." % IDCOL)
    before = len(combined)
    combined = combined.drop_duplicates(subset=IDCOL, keep='last')
    print("  total rows:", before, "-> dedupe ke baad:", len(combined), "(%d duplicate hataye)" % (before - len(combined)))

    combined.to_csv(MASTER, index=False)
    print("  master saved:", MASTER)

    # poora recompute (update_dashboard ka tested build)
    handles, phd_docs, mapping, dd_docs, DATES, tot = U.build(MASTER)
    print("Writing JSON files...")
    U.write_files(handles, phd_docs, mapping, dd_docs)
    if push:
        print("Pushing to MongoDB...")
        U.push_mongo(handles, phd_docs, mapping, dd_docs)
        # standalone offline HTML bhi bana do (data andar baked, server ke bina chalta hai)
        print("Offline HTML bana rahe hain...")
        try:
            import subprocess
            r = subprocess.run(["node", os.path.join(HERE, "export_html.js")])
            if r.returncode != 0:
                print("  (offline HTML nahi bana - 'node' PATH me hai? warna: node export_html.js khud chalao)")
        except Exception as e:
            print("  (offline HTML skip:", e, ")")
    print("\nDONE. total tweets=%d  handles=%d  dates=%d (%s..%s)" % (tot, len(handles), len(DATES), DATES[0], DATES[-1]))
    print("Ab dashboard reload karo (Ctrl+Shift+R).")
    print("(--push nahi diya to sirf JSON files bani.)")
