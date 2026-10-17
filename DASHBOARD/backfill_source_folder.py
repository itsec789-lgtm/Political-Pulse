# -*- coding: utf-8 -*-
"""
backfill_source_folder.py  --  PURANE tweets par "Source Folder" bhar deta hai.

Kyun chahiye:
  Master me ab tak ye likha hi nahi jaata tha ki tweet KIS FOLDER ki file se aaya.
  'Category' sirf mapping ka label hai (handle ka post -- MLA / LS_MP / Top Leaders),
  isliye "Top Leaders folder ka data" filter karna mumkin nahi tha.

  Aaj se naye tweets par run_pipeline khud likh deta hai. Ye script PURANE
  tweets ke liye hai -- network folder ki saari purani file dobara padh kar
  har Tweet ID ke saamne folder ka naam Mongo me jod deti hai.

Kya karta hai:
  \\\\192.168.2.85\\d\\Tweeter Data Social Media (25-07-2026)\\<FOLDER>\\*.csv|xlsx
  har file se sirf 'Tweet URL' / 'Tweet ID' column padhta hai (halka),
  phir  $addToSet: { "Source Folders": "<FOLDER>" }

  Ek tweet kai folder me ho to sab naam jud jaate hain -- purana kuch mitata nahi.
  SIRF ye ek field chhuti hai. Tweet text, likes, mapping -- kisi ko haath nahi lagta.

Chalao:
    python backfill_source_folder.py                        <- sirf REPORT (kuch nahi badlega)
    python backfill_source_folder.py --only "All India Top Leaders"          <- ek hi folder ki report
    python backfill_source_folder.py --only "All India Top Leaders" --apply  <- ek hi folder likho
    python backfill_source_folder.py --apply                <- saare folder likho

Zaroorat: pandas, pymongo  |  network share chalu hona chahiye
"""
import os
import re
import sys
import glob
import json
import time
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
BATCH = 20000

_RID = re.compile(r'/status(?:es)?/(\d+)')


def tweet_ids(path):
    """Ek file se Tweet ID nikaalo. Sirf 2 column padhte hain -- isliye tez."""
    import pandas as pd
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in ('.xlsx', '.xls', '.xlsm'):
            df = pd.read_excel(path, dtype=str)
        else:
            df = pd.read_csv(path, dtype=str, encoding='utf-8-sig',
                             keep_default_na=False, on_bad_lines='skip')
    except Exception as e:
        return None, str(e)
    df = df.rename(columns=lambda c: str(c).strip())
    out = set()
    urls = df['Tweet URL'].astype(str) if 'Tweet URL' in df.columns else []
    for u in urls:
        m = _RID.search(u)
        if m:
            out.add(m.group(1))
    if 'Tweet ID' in df.columns:
        for t in df['Tweet ID'].astype(str):
            t = t.strip()
            if t.isdigit():
                out.add(t)
    return out, None


def main():
    apply = '--apply' in sys.argv
    # --only "folder ka naam"  -> sirf usi folder par kaam (pehle test karne ke liye)
    only = ''
    if '--only' in sys.argv:
        i = sys.argv.index('--only')
        if i + 1 < len(sys.argv):
            only = sys.argv[i + 1].strip().lower()
    if not os.path.isdir(BASE):
        print("  [!] Network folder nahi mila:")
        print("      " + BASE)
        print("      Share chalu karo, phir dobara chalao.")
        return 1

    print("=" * 66)
    print("  SOURCE FOLDER BACKFILL   " + ("(LIKHENGE)" if apply else "(sirf REPORT -- kuch nahi badlega)"))
    print("=" * 66)

    folders = sorted(d for d in os.listdir(BASE) if os.path.isdir(os.path.join(BASE, d)))
    all_folders = list(folders)
    if only:
        folders = [d for d in folders if d.lower() == only]
        if not folders:
            print("\n  [!] '%s' naam ka folder nahi mila. Ye hain:" % only)
            for d in all_folders:
                print("     " + d)
            return 1
        print("\n  SIRF ek folder par: %s" % folders[0])
    print("\n  %d folder mile:" % len(folders))
    for d in folders:
        print("     " + d)

    # folder ki list dropdown ke liye
    try:
        os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
        json.dump(all_folders, open(os.path.join(HERE, "data", "source_folders.json"),
                                    "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print("\n  data/source_folders.json likh di (admin dropdown isi se banega)")
    except Exception as e:
        print("  (source_folders.json skip: %s)" % e)

    col = None
    if apply:
        from pymongo import MongoClient, UpdateOne
        col = MongoClient(MONGO_URL)[DB][COLL]

    t0 = time.time()
    per_folder = collections.OrderedDict()
    grand_ids, grand_written = 0, 0

    for d in folders:
        fp = os.path.join(BASE, d)
        files = []
        for pat in ("*.csv", "*.xlsx", "*.xls", "*.xlsm"):
            files += glob.glob(os.path.join(fp, pat))
        if not files:
            per_folder[d] = (0, 0, 0)
            continue

        ids, bad = set(), 0
        for i, f in enumerate(files, 1):
            got, err = tweet_ids(f)
            if got is None:
                bad += 1
                continue
            ids |= got
            if i % 25 == 0:
                print("     %-34s %d/%d file, %s id" % (d[:34], i, len(files), f"{len(ids):,}"), flush=True)

        written = 0
        if apply and ids:
            from pymongo import UpdateOne
            ops, buf = [], list(ids)
            for j in range(0, len(buf), BATCH):
                chunk = buf[j:j + BATCH]
                ops = [UpdateOne({'_id': t}, {'$addToSet': {'Source Folders': d}}) for t in chunk]
                r = col.bulk_write(ops, ordered=False)
                written += (r.modified_count or 0)
                print("        %-30s likha %s / %s" % (d[:30], f"{min(j+BATCH,len(buf)):,}", f"{len(buf):,}"), flush=True)

        per_folder[d] = (len(files), len(ids), written)
        grand_ids += len(ids)
        grand_written += written
        print("  %-36s %3d file  %9s tweet id  %s"
              % (d[:36], len(files), f"{len(ids):,}",
                 ("badle: " + f"{written:,}") if apply else "(report)"), flush=True)

    print("\n" + "=" * 66)
    print("  %-36s %s" % ("folder", "file / tweet id / badle"))
    for d, (nf, ni, nw) in per_folder.items():
        print("  %-36s %3d  %9s  %s" % (d[:36], nf, f"{ni:,}", f"{nw:,}" if apply else "-"))
    print("\n  kul tweet id: %s   |   %d minute" % (f"{grand_ids:,}", (time.time() - t0) / 60))
    if apply:
        print("  Mongo me badli hui rows: %s" % f"{grand_written:,}")
        print("\n  Ho gaya. Ab admin panel me 'Source folder' dropdown kaam karega.")
        print("  (Server ek baar restart kar lena.)")
    else:
        print("\n  Ye sirf REPORT thi -- Mongo me kuch nahi badla.")
        print("  Sach me likhne ke liye:  python backfill_source_folder.py --apply")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n  Rok diya.")
        sys.exit(1)
