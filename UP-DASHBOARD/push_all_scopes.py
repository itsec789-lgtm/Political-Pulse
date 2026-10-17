# -*- coding: utf-8 -*-
"""
push_all_scopes.py  --  EK master se DONO dashboard push karo:
   - All-India  -> MongoDB db 'india_pulse'   (koi state filter nahi)
   - UP         -> MongoDB db 'up_pulse'       (State = Uttar Pradesh)

Yani tum sirf All-India data doge, UP apne aap filtered-view me update ho jaayega.

use:
    import push_all_scopes as PA
    PA.push_all(MASTER_CSV)
"""
import os, datetime, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)

SCOPES = [
    # (label, scope_state, db_name, write_json_files?)
    # NOTE: All-India dashboard ALAG project hai (X\DASHBOARD, db india_Pulse).
    #       Usko yahan se push NAHI karna (warna uska CM-map build overwrite ho jaata hai).
    #       Yahan se sirf UP push hota hai.
    ("UP", "Uttar Pradesh", "up_pulse", True),
]


def _stamp(db_name, tot, log):
    try:
        from pymongo import MongoClient
        cli = MongoClient(MONGO_URL)
        cli[db_name]["meta"].update_one({"key": "lastUpdate"},
            {"$set": {"key": "lastUpdate",
                      "value": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                      "tweets": int(tot)}}, upsert=True)
        cli.close()
    except Exception as e:
        log("  (stamp skip %s: %s)" % (db_name, e))


def push_all(master_csv, log=print):
    import update_dashboard as U
    import push_tweets as PT
    importlib.reload(U); importlib.reload(PT)
    for label, scope, db, write in SCOPES:
        log("=== push scope: %s -> db '%s' ===" % (label, db))
        U.SCOPE_STATE = scope; U.DB_NAME = db
        handles, phd, mapping, dd, DATES, tot = U.build(master_csv)
        if write:
            U.write_files(handles, phd, mapping, dd)   # offline export ke liye (All-India)
        U.push_mongo(handles, phd, mapping, dd)
        PT.SCOPE_STATE = scope; PT.DB_NAME = db
        PT.main()
        _stamp(db, tot, log)
        log("  %s done: tweets=%d dates=%s..%s" % (label, tot, DATES[0], DATES[-1]))


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        sys.exit('Usage: python push_all_scopes.py "path\\to\\master.csv"')
    push_all(sys.argv[1])
