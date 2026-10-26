# -*- coding: utf-8 -*-
"""
push_all_scopes.py  (All-India DASHBOARD project)

EK master se DONO dashboard banata hai -- har ek APNI pipeline se:
   All-India -> db 'india_Pulse'  (DASHBOARD ki update_dashboard, CM-map wala)
   UP         -> db 'up_pulse'     (UP-DASHBOARD ki update_dashboard + push_tweets,
                                     UP map/report wala) -- wahi master, UP filter

Isse har dashboard apne sahi template+data ke saath banta hai.
"""
import os, sys, subprocess, datetime

HERE   = os.path.dirname(os.path.abspath(__file__))
UP_DIR = os.path.join(os.path.dirname(HERE), "UP-DASHBOARD")
PY     = sys.executable
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)


def _stamp(db, log, when=None):
    """meta.lastUpdate likho -- dashboard isi se jaanta hai ki naya data aaya.

    audit-fix A3 : pehle ye exception chupchap nigal leta tha. Stamp na
    lagne ka matlab hai dashboard auto-refresh hi nahi karega aur hara
    "^ +1K" indicator bhi nahi aayega -- yaani data push ho gaya par kisi
    ko dikha hi nahi. Isliye ab ye fail hone par SAAF bolta hai.
    """
    val = when or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        from pymongo import MongoClient
        cli = MongoClient(MONGO_URL)
        try:
            cli[db]["meta"].update_one({"key": "lastUpdate"},
                {"$set": {"key": "lastUpdate", "value": val}}, upsert=True)
        finally:
            cli.close()
        return True
    except Exception as e:
        log("  !! STAMP FAIL (%s): %s" % (db, e))
        log("     Data push ho gaya hai par dashboard ko pata nahi chalega --")
        log("     browser me khud Ctrl+F5 karna padega.")
        return False


def dedupe_report(master, log=print):
    """SIRF REPORT (master ko chhedta NAHI).
       Dedupe/merge rebuild_3_july.py aur auto_update.py karte hain (merge se, data loss ke bina)."""
    import pandas as pd, re
    _rid = re.compile(r"/status(?:es)?/(\d+)")
    total = blank = 0
    ids = set()
    NUM = ['Followers', 'Followings', 'Total Posts', 'Total Comments', 'Total Likes',
           'Total Retweets', 'Total Views', 'Total Bookmark Tweets Times', 'Date of Joining']
    filled = {c: 0 for c in NUM}
    for ch in pd.read_csv(master, dtype=str, encoding="utf-8-sig", chunksize=200000, keep_default_na=False):
        ch = ch.rename(columns=lambda c: str(c).strip())
        total += len(ch)
        for u in ch.get('Tweet URL', pd.Series(dtype=str)).astype(str):
            m = _rid.search(u)
            if m: ids.add(m.group(1))
            elif not u.strip(): blank += 1
            else: ids.add(u.strip())
        for c in NUM:
            if c in ch.columns:
                filled[c] += int((ch[c].astype(str).str.strip() != '').sum())
    uniq = len(ids); dup = total - uniq - blank
    log("------------------------------------------------------------")
    log("  MASTER DATA CHECK (report only - file nahi badli)")
    log("    Total rows       : %s" % f"{total:,}")
    log("    Unique (Tweet ID): %s" % f"{uniq:,}")
    log("    Duplicate        : %s" % f"{dup:,}")
    log("    Blank URL rows   : %s" % f"{blank:,}")
    for c in NUM:
        log("    %-28s filled: %s" % (c, f"{filled[c]:,}"))
    log("------------------------------------------------------------")
    return master


def push_all(master_csv, log=print):
    # "MONGO" -> seedha pulse_master.master_tweets se build (koi CSV nahi)
    if str(master_csv).strip().upper() in ("MONGO", "SPLIT"):
        # SPLIT (hot/cold plan, Phase 4): old days from pulse_master.daily_summary,
        # last N days raw from master -- see summary_agg.py
        master = str(master_csv).strip().upper()
        try:
            import src_chunks as SC
            n = f"{SC.mongo_coll().estimated_document_count():,}"
            if master == "SPLIT":
                log("Source: SPLIT -- purane din pulse_master.daily_summary se + pichhle 7 din seedhe master se (%s docs)" % n)
            else:
                log("Source: MongoDB pulse_master.master_tweets (%s docs)" % n)
        except Exception as e:
            log("  (mongo count skip: %s)" % e)
    else:
        master = os.path.abspath(master_csv)
        master = dedupe_report(master, log)   # CSV mode: report + path

    # ================= audit-fix A3 =================
    # PEHLE KYA HOTA THA:
    #   All-India push -> turant _stamp("india_Pulse") -> phir UP push.
    #   UP ka step fail hua to All-India naya data + naya stamp dikhata tha
    #   aur UP chupchap PURANA data dikhata rehta tha -- uska "last updated"
    #   bhi nahi badalta, to kisi ko shaq tak nahi hota.
    #
    # AB:
    #   pehle DONO dashboard poore build+push hote hain. Dono kaamyaab hone
    #   par hi, ek hi timestamp se, dono ka stamp lagta hai. Beech me kuch
    #   toota to koi stamp nahi lagta -- dono purana data dikhayenge, jo
    #   "aadha naya aadha purana" se hamesha behtar hai.
    _hot_since = datetime.datetime.now(datetime.timezone.utc)      # hot/cold: Atlas push of THIS run
    log("=== All-India -> india_Pulse (DASHBOARD pipeline) ===")
    subprocess.run([PY, os.path.join(HERE, "update_dashboard.py"), master, "--push"],
                   cwd=HERE, check=True)

    log("=== UP -> up_pulse (UP-DASHBOARD pipeline, same master, UP filter) ===")
    subprocess.run([PY, os.path.join(UP_DIR, "update_dashboard.py"), master, "--push"],
                   cwd=UP_DIR, check=True)
    # phase0-report-src (hot/cold plan, Phase 0.4 option b):
    # Report tab ab seedha pulse_master.master_tweets padhta hai (server.js
    # REPORT_SRC), isliye up_pulse.tweets ki poori copy (2.9M docs RAM me,
    # ~15 min) har run me banane ki zaroorat nahi. Purana raasta chahiye to
    # env PULSE_REPORT_SRC=pool -- tab push_tweets.py pehle jaisa chalta hai.
    if os.environ.get("PULSE_REPORT_SRC", "master").strip().lower() == "pool":
        subprocess.run([PY, os.path.join(UP_DIR, "push_tweets.py"), "MONGO" if master == "SPLIT" else master],
                       cwd=UP_DIR, check=True)
    else:
        log("  Report pool: up_pulse.tweets rebuild skip (Report tab reads pulse_master.master_tweets)")

    # dono ban gaye -> ab dono ka stamp, ek hi waqt ka
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ok1 = _stamp("india_Pulse", log, now)
    ok2 = _stamp("up_pulse", log, now)
    if ok1 and ok2:
        log("  Dono dashboard stamp ho gaye: %s" % now)
        try:
            import hot_push
            if hot_push._db() is not None:
                h1 = hot_push.stamp("india_Pulse", now, _hot_since, log)
                h2 = hot_push.stamp("up_pulse", now, _hot_since, log)
                log("  HOT stamp: india=%s up=%s" % (h1, h2))
        except Exception as e:
            log("  HOT SYNC FAIL (stamp): %s" % e)

    log("DONE: dono view push (All-India + UP).")


if __name__ == "__main__":
    m = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "data", "master_tweets.csv")
    push_all(m)
