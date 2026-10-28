# -*- coding: utf-8 -*-
# replica-kit (27-Oct): state snapshot + manifest + staged dump (see backup())
"""
mongo_backup.py  --  MongoDB ka backup aur restore, BINA mongodump ke.

mongodump MongoDB ke saath nahi aata (wo alag "Database Tools" download hai).
Ye script wahi kaam pymongo se kar deti hai -- pymongo pehle se laga hua hai.

Kya lena-dena:
   pulse_master     raw tweets + login/users
   india_Pulse      All India dashboard
   up_pulse         UP dashboard
   political_lens   Punjab dashboard
        |
        v
   mongo_dump_py\\<db>\\<collection>.jsonl.gz     (+ _indexes.json)

  * bson.json_util use karta hai, isliye ObjectId / date / har BSON type
    theek se aata-jaata hai -- kuch bigadta nahi.
  * Index bhi likh leta hai aur restore par dobara bana deta hai, warna
    dashboard bahut dheema chalta.
  * BACKUP sirf PADHTA hai. Chalta hua dashboard bilkul safe hai.

--------------------------------------------------------------------------
PURANE laptop par (backup banao):
    python mongo_backup.py
    -> "mongo_dump_py" folder banega. Use poore project folder ke saath copy karo.

NAYE laptop par (bharo):
    SETUP.bat khud kar lega. Haath se karna ho to:
    python mongo_backup.py --restore

Ek hi database:
    python mongo_backup.py --only political_lens
    python mongo_backup.py --restore --only political_lens
--------------------------------------------------------------------------
Zaroorat: pymongo  |  MongoDB chalti honi chahiye
"""
import gzip
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "mongo_dump_py")
from mongo_conf import MONGO_URL as URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DBS = ["pulse_master", "india_Pulse", "up_pulse", "political_lens"]
BATCH = 2000
IDX = "_indexes.json"


def human(n):
    return f"{n:,}"


def size_mb(p):
    try:
        return os.path.getsize(p) / 1e6
    except Exception:
        return 0


def only_arg():
    """--only <db>  ->  sirf ek database"""
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1].strip()
    return ""


def client():
    from pymongo import MongoClient
    cli = MongoClient(URL, serverSelectionTimeoutMS=8000)
    cli.admin.command("ping")
    return cli


# ----------------------------------------------------------------- BACKUP --
def backup():
    from bson import json_util

    # replica-kit (27-Oct): poora dump pehle "mongo_dump_py_NEW" me banta hai, poora hone par hi
    # asli naam par aata hai -- beech me ruk gaya to purana dump bilkul safe rehta hai.
    # Purana dump hataya nahi jaata: "mongo_dump_py_OLD_<time>" naam se project ke BAHAR chala jaata hai.
    global OUT
    FINAL = OUT
    pick = only_arg()
    full = not pick
    if full:
        OUT = FINAL + "_NEW"
        if os.path.isdir(OUT):
            shutil.rmtree(OUT)              # pichhli adhoori koshish ka apna hi kachra
    cli = client()
    os.makedirs(OUT, exist_ok=True)
    MAN = {}
    # auto_state.json = "kaun si network files ho chuki". Isse dump se PEHLE copy karte hain, taaki
    # naye PC par dump ke baad ki files dobara padhi jayen (upsert hai -- duplicate nahi banta).
    try:
        sd = os.path.join(OUT, "_state")
        os.makedirs(sd, exist_ok=True)
        for src in (os.path.join(HERE, "DASHBOARD", "auto_state.json"),):
            if os.path.isfile(src):
                shutil.copy2(src, os.path.join(sd, os.path.basename(src)))
                print("  state file saath rakhi: %s" % os.path.basename(src))
    except Exception as e:
        print("  (state file skip: %s)" % e)

    print("=" * 66)
    print("  BACKUP  ->  %s" % OUT)
    print("=" * 66)
    grand = 0
    t0 = time.time()

    for dbn in DBS:
        if pick and dbn != pick:
            continue
        db = cli[dbn]
        try:
            colls = db.list_collection_names()
        except Exception as e:
            print("  [!] %s: %s" % (dbn, e))
            continue
        if not colls:
            print("\n  %-16s khaali hai, chhod diya" % dbn)
            continue

        d = os.path.join(OUT, dbn)
        os.makedirs(d, exist_ok=True)
        print("\n  %s" % dbn)

        idx_all = {}
        for c in sorted(x for x in colls if not x.endswith('_test')):   # *_test = scratch
            # index ka naksha bhi rakh lo -- dump me index nahi aate
            try:
                info = db[c].index_information()
                idx_all[c] = [{"name": k, "key": [list(t) for t in v["key"]],
                               "unique": bool(v.get("unique"))}
                              for k, v in info.items() if k != "_id_"]
            except Exception:
                idx_all[c] = []

            total = db[c].estimated_document_count()
            path = os.path.join(d, c + ".jsonl.gz")
            n = 0
            t1 = time.time()
            with gzip.open(path, "wt", encoding="utf-8") as f:
                for doc in db[c].find({}, batch_size=1000):
                    f.write(json_util.dumps(doc))
                    f.write("\n")
                    n += 1
                    if total > 50000 and n % 100000 == 0:
                        print("      %-20s %s / %s" % (c, human(n), human(total)), flush=True)
            grand += n
            MAN.setdefault(dbn, {})[c] = n
            print("      %-20s %-12s %7.1f MB   %ds"
                  % (c, human(n), size_mb(path), time.time() - t1), flush=True)

        try:
            json.dump(idx_all, open(os.path.join(d, IDX), "w", encoding="utf-8"), indent=1)
        except Exception as e:
            print("      (index list skip: %s)" % e)

    if full:
        try:
            json.dump({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "counts": MAN},
                      open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8"), indent=1)
        except Exception as e:
            print("  (manifest skip: %s)" % e)
        stamp = time.strftime("%Y%m%d_%H%M")
        if os.path.isdir(FINAL):
            old = os.path.join(os.path.dirname(HERE) or HERE, "mongo_dump_py_OLD_" + stamp)
            try:
                os.replace(FINAL, old)
            except Exception:
                old = FINAL + "_OLD_" + stamp
                os.replace(FINAL, old)
            print("  purana dump hataya nahi, yahan rakha hai: %s" % old)
        os.replace(OUT, FINAL)
        OUT = FINAL
    cli.close()
    tot_mb = sum(size_mb(os.path.join(dp, f))
                 for dp, _, fs in os.walk(OUT) for f in fs)
    print("\n" + "=" * 66)
    print("  HO GAYA  --  %s documents, %.1f minute, %.0f MB"
          % (human(grand), (time.time() - t0) / 60, tot_mb))
    print("  Folder: %s" % OUT)
    print()
    print("  Ab poora 'Main Twitter Project' folder (mongo_dump_py samet)")
    print("  naye laptop par copy karo, phir wahan SETUP.bat chalao.")
    print("=" * 66)
    return 0


# ---------------------------------------------------------------- RESTORE --
def restore():
    from bson import json_util

    if not os.path.isdir(OUT):
        print("  [!] dump folder nahi mila:\n      " + OUT)
        print("      Purane laptop par 'python mongo_backup.py' chala kar")
        print("      'mongo_dump_py' folder yahan copy karo.")
        return 1

    cli = client()
    pick = only_arg()

    print("=" * 66)
    print("  RESTORE  <-  %s" % OUT)
    print("=" * 66)
    grand = 0
    t0 = time.time()

    for dbn in sorted(os.listdir(OUT)):
        if dbn.startswith("_"):            # _state, _manifest
            continue
        d = os.path.join(OUT, dbn)
        if not os.path.isdir(d):
            continue
        if pick and dbn != pick:
            continue
        print("\n  %s" % dbn)

        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".jsonl.gz"):
                continue
            c = fn[:-len(".jsonl.gz")]
            col = cli[dbn][c]
            col.delete_many({})                 # purana hatao, warna duplicate
            n = 0
            buf = []
            t1 = time.time()
            with gzip.open(os.path.join(d, fn), "rt", encoding="utf-8") as f:
                for lineno, ln in enumerate(f, 1):
                    ln = ln.strip()
                    if not ln:
                        continue
                    try:
                        buf.append(json_util.loads(ln))
                    except Exception as e:
                        print("      (line %d chhodi: %s)" % (lineno, e))
                        continue
                    if len(buf) >= BATCH:
                        col.insert_many(buf, ordered=False)
                        n += len(buf)
                        buf = []
                        if n % 200000 == 0:
                            print("      %-20s %s..." % (c, human(n)), flush=True)
            if buf:
                col.insert_many(buf, ordered=False)
                n += len(buf)
            grand += n
            print("      %-20s %-12s %ds" % (c, human(n), time.time() - t1), flush=True)

        # index dobara banao -- warna dashboard reng kar chalega
        ip = os.path.join(d, IDX)
        if os.path.exists(ip):
            try:
                idx_all = json.load(open(ip, encoding="utf-8"))
                made = 0
                for c, lst in idx_all.items():
                    for ix in lst:
                        try:
                            cli[dbn][c].create_index(
                                [(k[0], k[1]) for k in ix["key"]],
                                name=ix.get("name"), unique=ix.get("unique", False),
                                background=True)
                            made += 1
                        except Exception:
                            pass
                if made:
                    print("      index dobara bane: %d" % made)
            except Exception as e:
                print("      (index skip: %s)" % e)

    cli.close()
    print("\n" + "=" * 66)
    print("  HO GAYA  --  %s documents, %.1f minute" % (human(grand), (time.time() - t0) / 60))
    print("=" * 66)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(restore() if "--restore" in sys.argv else backup())
    except KeyboardInterrupt:
        print("\n  Rok diya.")
        sys.exit(1)
    except Exception as e:
        print("\n  [!] %s" % e)
        print("  MongoDB chal rahi hai? pymongo laga hai?")
        print("     net start MongoDB")
        print("     python -m pip install pymongo")
        sys.exit(1)
