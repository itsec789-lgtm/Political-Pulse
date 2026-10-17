#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Merge + de-duplicate Twitter tracking CSVs.

Kya karta hai:
  1. Input folder ki saari CSV files ko category ke hisaab se group karta hai
     (naam ke variants bhi ek saath merge hote hain -- neeche CATEGORY_RULES dekho).
  2. Har category ki daily files ko merge karta hai.
  3. Duplicate hata deta hai. UNIQUE ka basis = "Tweet ID"
     (kyunki har row ek tweet hai; same tweet alag-alag din ki file me repeat hota hai).
     Jaha ek hi Tweet ID ki multiple rows milti hain, wahan sabse "fresh" row rakhi jaati hai
     = jiske "Total Views" sabse zyada hain (tie hone par sabse nayi date wali).
  4. Har category ki ek merged CSV output folder me save karta hai.

Chalane ka tarika:
    - Jupyter / Spyder / Anaconda me: bas Run daba do (paths neeche INPUT_DIR/OUTPUT_DIR se lenge).
    - Terminal / CMD me:  python merge_dataset.py
                    (ya) python merge_dataset.py "<input_folder>" "<output_folder>"

Zaroorat: pandas  ->  pip install pandas
"""

import os
import re
import sys
import glob
import pandas as pd

# ----------------------------------------------------------------------
# 1. PATHS  (yahan apne folder ka path daal sakte ho)
# ----------------------------------------------------------------------
INPUT_DIR  = r"C:\Users\arpan\OneDrive\Desktop\New folder (6)\Main Data Set"
OUTPUT_DIR = r"C:\Users\arpan\OneDrive\Desktop\New folder (6)\New folder (2)"

# Jupyter/Spyder/IPython me argv IGNORE hota hai (wahan sys.argv me kernel ka '-f ...json'
# aata hai). Aise case me upar wale INPUT_DIR / OUTPUT_DIR hi use honge.
# Terminal se chalao to command-line args (agar diye) override kar denge.
def _in_ipython():
    try:
        get_ipython()   # IPython/Jupyter/Spyder me yeh defined hota hai
        return True
    except NameError:
        return False

if not _in_ipython():
    if len(sys.argv) >= 2:
        INPUT_DIR = sys.argv[1]
    if len(sys.argv) >= 3:
        OUTPUT_DIR = sys.argv[2]

# ----------------------------------------------------------------------
# 2. SETTINGS
# ----------------------------------------------------------------------
DEDUP_KEY   = "Tweet ID"      # unique ka basis
FRESH_COL   = "Total Views"   # duplicate me se yeh sabse zyada wali row rakho (freshest)

# Date column ke do naam aate hain -> ek jaisa kar do taaki merge sahi ho
DATE_ALIASES = {"Tweet Date (IST)": "Tweet Date"}

# Category rules: (regex pattern, output category name).  Pehla match jeetega.
# Pattern filename par (date hataake, lowercase) chalta hai.
# Agar aage naye naam aaye to yahan line add/edit kar dena.
CATEGORY_RULES = [
    (r"top leaders",                                 "ALL PARTY (TOP LEADERS)"),
    (r"bjp sangathan",                               "BJP SANGATHAN"),
    (r"cm and dputy|cm and deputy|dcm|cm .*dcm",     "CM and Deputy CM"),
    (r"all india all party mlas",                    "ALL INDIA ALL PARTY MLAs"),
    (r"all party leader up|uttar pradesh all party", "UP All Party"),
    (r"media houses",                                "Media Houses"),
]

DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


# ----------------------------------------------------------------------
# 3. HELPERS
# ----------------------------------------------------------------------
def base_name(fname):
    """Filename se date-part aur extension hataakar clean base naam."""
    b = os.path.basename(fname)
    b = re.sub(r"\.csv$", "", b, flags=re.IGNORECASE)
    b = DATE_RE.sub("", b)               # date hatao
    b = b.replace("(", " ").replace(")", " ")
    return re.sub(r"\s+", " ", b).strip()


def category_of(fname):
    """File kis category me jaati hai -- CATEGORY_RULES se decide."""
    name = base_name(fname).lower()
    for pattern, cat in CATEGORY_RULES:
        if re.search(pattern, name):
            return cat
    # koi rule match na ho to base naam hi category (taaki file chhut na jaaye)
    return base_name(fname)


def src_date(fname):
    """Filename se snapshot date (tie-break ke liye)."""
    m = DATE_RE.search(os.path.basename(fname))
    return m.group(1) if m else ""


def read_csv_safe(path):
    """Sab kuch string ki tarah padho (IDs/numbers safe rahein)."""
    return pd.read_csv(path, dtype=str, low_memory=False, keep_default_na=False)


def dedup(df):
    """Tweet ID par unique -- har ID ki freshest (max Total Views) row rakho."""
    # freshness score
    views = pd.to_numeric(
        df.get(FRESH_COL, pd.Series([""] * len(df))).astype(str).str.replace(",", "", regex=False),
        errors="coerce",
    ).fillna(-1)
    df = df.assign(_views=views)

    key = df[DEDUP_KEY].astype(str).str.strip()
    has_id = key.ne("") & key.str.lower().ne("nan")

    # (a) valid Tweet ID wali rows -> per-ID sabse fresh row
    with_id = (
        df[has_id]
        .sort_values(["_views", "_srcdate"])
        .drop_duplicates(subset=DEDUP_KEY, keep="last")
    )
    # (b) blank Tweet ID wali rows -> poori row par exact duplicate hatao
    no_id = df[~has_id].drop_duplicates()

    out = pd.concat([with_id, no_id], ignore_index=True)
    return out.drop(columns=["_views", "_srcdate"], errors="ignore")


# ----------------------------------------------------------------------
# 4. MAIN
# ----------------------------------------------------------------------
def main():
    if not os.path.isdir(INPUT_DIR):
        sys.exit("Input folder nahi mila: " + INPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.csv")))
    if not files:
        sys.exit("Input folder me koi CSV nahi mili: " + INPUT_DIR)

    # category -> [files]
    groups = {}
    for f in files:
        groups.setdefault(category_of(f), []).append(f)

    print("=" * 70)
    print("Input :", INPUT_DIR)
    print("Output:", OUTPUT_DIR)
    print("Kul CSV files:", len(files), "| Categories:", len(groups))
    print("=" * 70)

    grand_in = grand_out = 0
    for cat, flist in sorted(groups.items()):
        frames = []
        for f in flist:
            df = read_csv_safe(f)
            df = df.rename(columns=DATE_ALIASES)      # date column naam normalize
            df["_srcdate"] = src_date(f)              # tie-break ke liye
            frames.append(df)

        # pehli file ka column order yaad rakho (output usi order me)
        col_order = [c for c in frames[0].columns if c != "_srcdate"]

        merged = pd.concat(frames, ignore_index=True, sort=False)
        total_in = len(merged)
        deduped = dedup(merged)

        # column order sambhalo (jo naye column kisi file me the wo end me)
        cols = col_order + [c for c in deduped.columns if c not in col_order]
        deduped = deduped.reindex(columns=cols)

        out_path = os.path.join(OUTPUT_DIR, cat + ".csv")
        deduped.to_csv(out_path, index=False, encoding="utf-8-sig")

        removed = total_in - len(deduped)
        grand_in += total_in
        grand_out += len(deduped)
        print("")
        print("[" + cat + "]")
        print("   files merged : " + str(len(flist)))
        print("   rows in      : " + str(total_in))
        print("   duplicates   : " + str(removed) + "  (removed)")
        print("   rows out     : " + str(len(deduped)))
        print("   saved -> " + out_path)

    print("")
    print("=" * 70)
    print("DONE. Total rows in: " + str(grand_in) +
          " | out: " + str(grand_out) +
          " | duplicates removed: " + str(grand_in - grand_out))
    print("=" * 70)


if __name__ == "__main__":
    main()
