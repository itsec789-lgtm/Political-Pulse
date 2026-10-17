# -*- coding: utf-8 -*-
"""
backfill_first.py  --  purane tweets par "kab aaya" (_first) ka nishaan laga deta hai.

Problem: _first tracking baad me joda gaya, isliye purane docs par ye field nahi hai
         -> "Aaj DB me aaye tweets" 0 dikh raha tha (jabki aaj ke tweets DB me the).

Fix: jin docs me _first nahi hai, unka _first = unki Tweet Date ka din.
     (scraping roz hoti hai, isliye tweet ki date ≈ jis din woh humein mila)
     Aaj ke tweets -> _first = aaj  => report turant sahi dikhne lagegi.
     Aage se har naya tweet apne aap sahi din se mark hota rahega.

Saath me handles_seen bhi bhar deta hai (har handle pehli baar kab dikha).

Chalao:
  python backfill_first.py --check    # sirf ginti
  python backfill_first.py            # laga do
"""
import sys, datetime
from pymongo import MongoClient, UpdateOne

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
TODAY = datetime.date.today().isoformat()


def main():
    db = MongoClient(MONGO_URL)[DB]
    c = db[COLL]
    miss = c.count_documents({"_first": {"$exists": False}})
    total = c.estimated_document_count()
    print("Total docs        :", format(total, ","))
    print("_first missing    :", format(miss, ","))
    if '--check' in sys.argv:
        print("\n(--check: kuch nahi badla)")
        return
    if not miss:
        print("Sab par nishaan hai - kuch karne ki zaroorat nahi.")
    else:
        print("\nLaga raha hoon (_first = Tweet Date ka din)...")
        # ek hi aggregation-update se sabpar (fast)
        c.update_many({"_first": {"$exists": False}},
                      [{"$set": {"_first": {"$substrBytes": [{"$ifNull": ["$Tweet Date", TODAY]}, 0, 10]}}}])
        print("  ho gaya. ab missing:", format(c.count_documents({"_first": {"$exists": False}}), ","))

    # handles_seen: har handle pehli baar kab dikha
    print("\nhandles_seen bhar raha hoon...")
    hc = db["handles_seen"]
    ops = []
    n = 0
    for r in c.aggregate([{"$group": {"_id": "$Handle", "first": {"$min": "$_first"}}}], allowDiskUse=True):
        h = r["_id"]
        if not h: continue
        ops.append(UpdateOne({"_id": h}, {"$set": {"first": r["first"] or TODAY}}, upsert=True))
        if len(ops) >= 2000:
            hc.bulk_write(ops, ordered=False); n += len(ops); ops = []
    if ops:
        hc.bulk_write(ops, ordered=False); n += len(ops)
    print("  handles:", format(n, ","))

    # aaj ka summary
    t = c.count_documents({"_first": TODAY})
    nh = hc.count_documents({"first": TODAY})
    print("\nAB REPORT DIKHAYEGI:")
    print("  Aaj DB me aaye tweets :", format(t, ","))
    print("  Aaj naye handles      :", format(nh, ","))
    print("\nAb chalao:  python daily_report.py --open")


if __name__ == "__main__":
    main()
