# -*- coding: utf-8 -*-
"""
STEP 1 -- RESET: sab purana hata do (Mongo + local files).

Hataega:
  - MongoDB databases: india_Pulse, up_pulse  (poore drop)
  - data\master_tweets.csv (+ purane backups/temp)
  - data\dashboard_data.json / handles.json / phd.json / mapping.json (dono project)
  - auto_state.json, needs_mapping.csv, logs

NAHI hataega (ye chahiye):
  - data\handle_master.json  (tumhari MAPPING)
  - templates, server.js, scripts

Chalao:  python rebuild_1_reset.py
"""
import os, glob, shutil, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
UP   = os.path.join(os.path.dirname(HERE), "UP-DASHBOARD")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)

# ye files DELETE NAHI karni:
#   handle_master*.json  = tumhari MAPPING
#   dashboard_data.json  = build ka TEMPLATE (structure); iske bina build crash hota hai.
#                          (values har push par data se overwrite ho jaati hain)
KEEP = {"handle_master.json", "handle_master_UP.json", "dashboard_data.json"}


def main():
    print("=" * 60)
    print("  RESET: purana sab hataya ja raha hai")
    print("=" * 60)

    # 1) MongoDB drop
    try:
        from pymongo import MongoClient
        cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
        names = cli.list_database_names()
        for db in ("india_Pulse", "india_pulse", "up_pulse"):
            if db in names:
                cli.drop_database(db)
                print("  MongoDB DROP:", db)
        cli.close()
    except Exception as e:
        print("  !! MongoDB drop skip:", e)

    # 2) local data files
    for d in (os.path.join(HERE, "data"), os.path.join(UP, "data")):
        if not os.path.isdir(d): continue
        for f in glob.glob(os.path.join(d, "*")):
            base = os.path.basename(f)
            if base in KEEP:
                print("  RAKHA (mapping):", base); continue
            try:
                os.remove(f); print("  deleted:", os.path.relpath(f, os.path.dirname(HERE)))
            except Exception as e:
                print("  !! nahi hata:", base, e)

    # 3) state/log files
    for f in ["auto_state.json", "needs_mapping.csv", "auto_update.log", "phase2_push.log"]:
        for p in (os.path.join(HERE, f), os.path.join(UP, f)):
            if os.path.exists(p):
                try: os.remove(p); print("  deleted:", os.path.basename(p))
                except Exception: pass

    print("\nRESET DONE. Ab chalao:  python rebuild_2_base.py")


if __name__ == "__main__":
    main()
