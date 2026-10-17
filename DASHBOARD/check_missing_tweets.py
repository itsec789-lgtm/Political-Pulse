# -*- coding: utf-8 -*-
"""
check_missing_tweets.py  --  scraped file me hai par Mongo me nahi? -- GINTI KARO.

Ye script SIRF PADHTI HAI. Mongo me ek akshar nahi likhti, kuch delete nahi karti.

Kya karti hai:
  1. Network folder ki saari file kholti hai aur har Tweet ID nikaalti hai
  2. Mongo (pulse_master.master_tweets) se poochhti hai ki wo ID maujood hai ya nahi
  3. Batati hai: kis FOLDER me kitne chhoote, aur kis FILE me kitne chhoote

Kyun zaroori hai:
  run_pipeline sirf NAYI/BADLI file padhta hai (auto_state.json me hisaab rehta hai).
  Agar koi file beech me fail ho gayi, ya state me galti se "processed" likha gaya,
  to us file ke tweets Mongo me kabhi pahunche hi nahi. Ye script wahi gap dikhati hai.

Chalao:
    python check_missing_tweets.py
    python check_missing_tweets.py --only "All India Top Leaders"
    python check_missing_tweets.py --since 2026-08-01      <- sirf is date ke baad ki file

Gap mila to (usi din se dobara padho, poora master nahi):
    python run_pipeline.py --since 2026-08-01
Ya sab kuch dobara:
    python run_pipeline.py --rescan

Tweet Date ka roop: "2026-08-15 12:05:28 IST"  -- date ke liye pehle 10 akshar
kaafi hain, aur range filter string-compare se hi sahi chalta hai (IST se farq nahi padta).

Zaroorat: pandas, pymongo  |  network share chalu hona chahiye
"""
import os
import re
import sys
import glob
import time
import datetime
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
CHUNK = 5000        # $in me itne se zyada ID Mongo par bhaari padte hain

_RID = re.compile(r'/status(?:es)?/(\d+)')


def ids_of(path):
    """File se Tweet ID nikaalo -> set"""
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
    if 'Tweet URL' in df.columns:
        for u in df['Tweet URL'].astype(str):
            m = _RID.search(u)
            if m:
                out.add(m.group(1))
    if 'Tweet ID' in df.columns:
        for t in df['Tweet ID'].astype(str):
            t = t.strip()
            if t.isdigit():
                out.add(t)
    return out, None


def in_mongo(col, ids):
    """Jo ID Mongo me MAUJOOD hain unka set (chunk-chunk me poochhte hain)"""
    have = set()
    buf = list(ids)
    for i in range(0, len(buf), CHUNK):
        for d in col.find({'_id': {'$in': buf[i:i + CHUNK]}}, {'_id': 1}):
            have.add(d['_id'])
    return have


def main():
    only = ''
    if '--only' in sys.argv:
        i = sys.argv.index('--only')
        if i + 1 < len(sys.argv):
            only = sys.argv[i + 1].strip().lower()
    since = None
    if '--since' in sys.argv:
        i = sys.argv.index('--since')
        if i + 1 < len(sys.argv):
            since = datetime.datetime.strptime(sys.argv[i + 1], '%Y-%m-%d').timestamp()

    if not os.path.isdir(BASE):
        print("  [!] Network folder nahi mila:\n      " + BASE)
        return 1
    try:
        from pymongo import MongoClient
        col = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)[DB][COLL]
        col.database.client.admin.command('ping')
    except Exception as e:
        print("  [!] MongoDB se baat nahi hui: %s" % e)
        return 1

    print("=" * 72)
    print("  MISSING TWEETS CHECK   (sirf padh rahe hain -- kuch nahi badlega)")
    print("=" * 72)
    print("  Mongo me abhi: %s tweets" % f"{col.estimated_document_count():,}")

    folders = sorted(d for d in os.listdir(BASE) if os.path.isdir(os.path.join(BASE, d)))
    if only:
        folders = [d for d in folders if d.lower() == only]
        if not folders:
            print("\n  [!] '%s' folder nahi mila." % only)
            return 1

    t0 = time.time()
    rep = collections.OrderedDict()
    bad_files = []          # (folder, file, missing count, total)
    G_ids = G_miss = 0

    for d in folders:
        files = []
        for pat in ("*.csv", "*.xlsx", "*.xls", "*.xlsm"):
            files += glob.glob(os.path.join(BASE, d, pat))
        if since:
            files = [f for f in files if os.path.getmtime(f) >= since]
        if not files:
            rep[d] = (0, 0, 0)
            continue

        per_file, all_ids = {}, set()
        for n, f in enumerate(files, 1):
            got, err = ids_of(f)
            if got is None:
                bad_files.append((d, os.path.basename(f), -1, 0))
                continue
            per_file[f] = got
            all_ids |= got
            if n % 25 == 0:
                print("     %-32s %d/%d file padhi" % (d[:32], n, len(files)), flush=True)

        have = in_mongo(col, all_ids)
        miss = all_ids - have
        for f, s in per_file.items():
            m = len(s - have)
            if m:
                bad_files.append((d, os.path.basename(f), m, len(s)))

        rep[d] = (len(files), len(all_ids), len(miss))
        G_ids += len(all_ids)
        G_miss += len(miss)
        flag = "   <-- %s CHHOOT GAYE" % f"{len(miss):,}" if miss else ""
        print("  %-38s %3d file  %9s id%s" % (d[:38], len(files), f"{len(all_ids):,}", flag), flush=True)

    print("\n" + "=" * 72)
    print("  %-38s %5s %11s %11s" % ("folder", "file", "tweet id", "MISSING"))
    for d, (nf, ni, nm) in rep.items():
        print("  %-38s %5d %11s %11s" % (d[:38], nf, f"{ni:,}", f"{nm:,}" if nm else "-"))
    print("  " + "-" * 70)
    print("  %-38s %5s %11s %11s" % ("KUL", "", f"{G_ids:,}", f"{G_miss:,}"))

    if bad_files:
        bad_files.sort(key=lambda x: -x[2])
        print("\n  Jin FILE ke tweets chhoote (upar ke 15):")
        print("  %-30s %-42s %8s / %s" % ("folder", "file", "missing", "total"))
        for d, f, m, t in bad_files[:15]:
            if m < 0:
                print("  %-30s %-42s   PADHI NAHI JA SAKI" % (d[:30], f[:42]))
            else:
                print("  %-30s %-42s %8s / %s" % (d[:30], f[:42], f"{m:,}", f"{t:,}"))

    # poori report ek CSV me -- 15 se zyada file ho to yahin se dekh lena
    try:
        import csv as _csv
        os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
        rp = os.path.join(HERE, "data", "missing_report.csv")
        with open(rp, "w", newline="", encoding="utf-8-sig") as fh:
            w = _csv.writer(fh)
            w.writerow(["Folder", "File", "Missing", "Total in file"])
            for d, f, m, t in bad_files:
                w.writerow([d, f, ("PADHI NAHI JA SAKI" if m < 0 else m), t])
            w.writerow([])
            w.writerow(["Folder", "Files", "Tweet IDs", "Missing"])
            for d, (nf, ni, nm) in rep.items():
                w.writerow([d, nf, ni, nm])
        print("\n  Poori report: %s" % rp)
    except Exception as e:
        print("  (report CSV skip: %s)" % e)

    print("\n  %d minute lage." % ((time.time() - t0) / 60))
    if G_miss:
        print("\n  >> %s tweets file me hain par Mongo me NAHI." % f"{G_miss:,}")
        print("     Bharne ke liye (sirf jitna chahiye utna padho):")
        print("        python run_pipeline.py --since YYYY-MM-DD")
        print("     Ya sab kuch dobara:")
        print("        python run_pipeline.py --rescan")
        print("     Dono surakshit hain -- upsert hota hai, duplicate nahi banta.")
    else:
        print("\n  >> Ek bhi tweet nahi chhoota. Mongo poori tarah bhara hua hai.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n  Rok diya.")
        sys.exit(1)
