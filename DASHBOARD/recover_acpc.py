# -*- coding: utf-8 -*-
"""
recover_acpc.py -- AC/PC No (code) wapas laata hai.

Problem: mapping me kuch handles ka AC/PC No '-' tha, aur sync ne wahi '-'
saari rows par likh diya -> raw data me maujood code (jaise AC_201) gayab.

Ye script har handle ka code purane sources se dhoondh kar:
   1. mapping (handle_master.json) me bharta hai  -- sirf jahan khaali hai
   2. MongoDB me un handles ki rows update karta hai

Sources: MongoDB + data/master_tweets.csv + data/master_tweets_OLD_base.csv
Seat type ka dhyaan: MP -> PC_ code, MLA -> AC_ code.

Chalao:
   python recover_acpc.py --check     # sirf report, kuch nahi badlega
   python recover_acpc.py             # theek kar do
"""
import os, re, sys, json
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
MAPJSON = os.path.join(HERE, "data", "handle_master.json")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
CODE = re.compile(r'^(AC|PC)[_\s-]?\d+$', re.I)
FIELDS = ('AC/PC No', 'AC Name', 'PC Name', 'Locations')
CSVS = [os.path.join(HERE, "data", "master_tweets.csv"),
        os.path.join(HERE, "data", "master_tweets_OLD_base.csv"),
        # April wali original base file -- isme kaafi PC No the
        r"C:\Users\arpan\OneDrive\Desktop\New folder\All India Tweeter Data (04-07-2026).csv",
        os.path.join(HERE, "data", "All India Tweeter Data (04-07-2026).csv")]
EXPORT_DIRS = [r"\\192.168.2.85\d\Social Media\Exported Data",
               r"\\192.168.2.85\d\Social Media"]


def norm_code(v):
    v = str(v or '').strip().upper().replace(' ', '_').replace('-', '_')
    v = re.sub(r'_+', '_', v)
    return v if CODE.match(v) else ''


def seat_of(v):
    """handle ka seat type: 'PC' (MP), 'AC' (MLA/MLC), ya '' """
    ds = [str(d).upper().replace(' ', '_') for d in (v.get('designations') or [])]
    if any(d in ('LS_MP',) for d in ds): return 'PC'
    if any(d in ('MLA',) for d in ds):   return 'AC'
    if any(d in ('RS_MP', 'MLC') for d in ds): return ''   # inki koi seat nahi hoti
    return ''


def collect():
    """handle -> Counter(code)"""
    found = defaultdict(Counter)
    # ---- Mongo (jinme abhi bhi code bacha hai) ----
    try:
        from pymongo import MongoClient
        c = MongoClient(MONGO_URL)[DB][COLL]
        for d in c.aggregate([
                {"$match": {"AC/PC No": {"$regex": r"^(AC|PC)[_\s-]?\d+$", "$options": "i"}}},
                {"$group": {"_id": {"h": "$Handle", "c": "$AC/PC No"}, "n": {"$sum": 1}}}],
                allowDiskUse=True):
            k = norm_code(d['_id']['c'])
            if k: found[str(d['_id']['h']).strip()][k] += d['n']
        print("   Mongo se:", f"{len(found):,}", "handles")
    except Exception as e:
        print("   Mongo skip:", e)
    # ---- purani CSVs (April wali base file bhi) ----
    import pandas as pd, glob as _glob

    def eat(df, tag, n_box):
        df = df.rename(columns=lambda x: str(x).strip())
        if 'Handle' not in df.columns:
            # Handle na ho to Tweet URL se nikaal lo
            u = next((c for c in df.columns if c.lower().replace(' ', '') in
                      ('tweeturl', 'url', 'link')), None)
            if not u: return
            df['Handle'] = df[u].astype(str).str.extract(
                r'(?:twitter|x)\.com/([^/\s?]+)', expand=False).fillna('')
        cols = [x for x in FIELDS if x in df.columns]
        if not cols: return
        for row in df[['Handle'] + cols].itertuples(index=False):
            h = str(row[0]).strip().lstrip('@')
            if not h: continue
            for v in row[1:]:
                k = norm_code(v)
                if k: found[h][k] += 1; n_box[0] += 1

    paths = list(CSVS)
    for d in EXPORT_DIRS:
        try: paths += sorted(_glob.glob(os.path.join(d, "*.csv")))
        except Exception: pass
    seen_p = set()
    for path in paths:
        rp = os.path.abspath(path).lower()
        if rp in seen_p or not os.path.exists(path): continue
        seen_p.add(rp)
        n_box = [0]
        try:
            for ch in pd.read_csv(path, dtype=str, encoding='utf-8-sig', chunksize=200000,
                                  keep_default_na=False, on_bad_lines='skip'):
                eat(ch, path, n_box)
        except Exception as e:
            print("   skip %-24s (%s)" % (os.path.basename(path)[:24], str(e)[:40])); continue
        print("   %-34s %s code-rows" % (os.path.basename(path)[:34], f"{n_box[0]:,}"))

    # ---- --deep : network ke RAW folders (April wali files) ----
    if '--deep' in sys.argv:
        print("   --deep: raw source folders scan ho rahe hain (thoda time lagega)...")
        try:
            import phase2_push as P2, smart_import as SI
            files = P2.find_files()
            print("      files mile:", len(files))
            for i, f in enumerate(files, 1):
                try:
                    df = SI.read_any(f) if hasattr(SI, 'read_any') else SI._read_any(f)
                    if df is None or not len(df): continue
                    n_box = [0]; eat(df, f, n_box)
                except Exception:
                    pass
                if i % 25 == 0: print("      %s/%s" % (i, len(files)), flush=True)
        except Exception as e:
            print("      deep scan skip:", e)
    return found


def main():
    check = '--check' in sys.argv
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    print("Sources scan ho rahe hain...")
    found = collect()

    fills, conflict, no_src = {}, [], []
    for h, v in mp.items():
        if norm_code(v.get('ac_pc_no')): continue           # pehle se sahi hai
        seat = seat_of(v)
        if seat == '' and not (v.get('designations') or []): pass
        cand = found.get(h)
        if not cand:
            no_src.append(h); continue
        pref = [k for k in cand if k.startswith(seat + '_')] if seat else list(cand)
        pool = pref or list(cand)
        best = max(pool, key=lambda k: cand[k])
        if seat and not best.startswith(seat + '_'):
            conflict.append((h, seat, best)); continue      # MP ko AC code -- chhod do
        fills[h] = best

    miss = [h for h, v in mp.items() if not norm_code(v.get('ac_pc_no'))]
    print("\nMAPPING: %s handles | code khaali: %s" % (f"{len(mp):,}", len(miss)))
    print("   -> recover ho sakte      :", len(fills))
    print("   -> source me hi nahi mila:", len(no_src), "(RS_MP/MLC/media -- inki seat hoti hi nahi)")
    print("   -> seat-type mismatch    :", len(conflict), (conflict[:3] if conflict else ""))
    for h in list(fills)[:8]:
        print("      %-22s -> %s" % (h, fills[h]))

    if check:
        print("\n(--check: kuch nahi badla)"); return
    if not fills:
        print("\nKuch recover karne ko nahi hai."); return

    # ---- mapping update ----
    for h, code in fills.items():
        mp[h]['ac_pc_no'] = code
    json.dump(mp, open(MAPJSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print("\nmapping me bhare:", len(fills))

    # ---- Mongo update ----
    from pymongo import MongoClient, UpdateMany
    c = MongoClient(MONGO_URL)[DB][COLL]
    ops = [UpdateMany({"Handle": h}, {"$set": {"AC/PC No": code}}) for h, code in fills.items()]
    done = 0
    for i in range(0, len(ops), 500):
        r = c.bulk_write(ops[i:i + 500], ordered=False); done += r.modified_count
    print("Mongo rows update:", f"{done:,}")
    left = c.count_documents({"AC/PC No": {"$in": ['-', '', None]}})
    print("ab bhi code-rahit rows:", f"{left:,}", "(RS_MP / MLC / media house -- normal hai)")
    print("\nAb chalao:  python push_all_scopes.py MONGO   phir   python export_from_mongo.py --split")


if __name__ == "__main__":
    main()
