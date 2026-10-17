# -*- coding: utf-8 -*-
"""
fix_mongo_ids.py  --  purane BUG ka cleanup.

Bug tha: kuch rows ka _id "https://x.com/.../status/123" (poora URL) ban gaya,
jabki sahi _id sirf "123" (Tweet ID) hona chahiye. Isse ek hi tweet DO baar
count ho raha tha.

Ye script:
  1. Aise saare docs dhundhta hai jinka _id URL jaisa hai (ya non-numeric)
  2. Unka data sahi numeric-ID wale doc me MERGE karta hai
     (numeric -> $max, text -> sirf non-blank set)   => koi data nahi khota
  3. Galat _id wale docs delete kar deta hai

Chalao:
  python fix_mongo_ids.py --check     # sirf ginti dekho (kuch badlega nahi)
  python fix_mongo_ids.py             # cleanup karo
"""
import sys, re
from pymongo import MongoClient, UpdateOne

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
NUM = ['Followers', 'Followings', 'Total Posts', 'Total Comments', 'Total Likes',
       'Total Retweets', 'Total Views', 'Total Bookmark Tweets Times']
RID = re.compile(r'/status(?:es)?/(\d+)')


def main():
    c = MongoClient(MONGO_URL)[DB][COLL]
    total = c.estimated_document_count()
    print("Total docs abhi:", format(total, ","))

    bad = list(c.find({"_id": {"$not": {"$regex": r"^\d+$"}}}))
    print("Galat _id wale docs (URL-keyed etc.):", format(len(bad), ","))
    if not bad:
        print("Sab theek hai - kuch karne ki zaroorat nahi."); return

    ex = [str(d["_id"])[:70] for d in bad[:3]]
    print("  sample:", ex)
    if '--check' in sys.argv:
        print("\n(--check mode: kuch nahi badla. Cleanup ke liye bina --check chalao.)")
        print("Cleanup ke baad expected total: ~", format(total - len(bad), ","), "(ya thoda zyada agar kuch sach me naye the)")
        return

    ops, dels, moved, kept = [], [], 0, 0
    for d in bad:
        raw = str(d["_id"])
        m = RID.search(raw)
        good = m.group(1) if m else (raw if raw.isdigit() else None)
        if not good:
            kept += 1          # ID nikal hi nahi rahi -> chhod do (delete nahi karenge)
            continue
        setd, maxd = {}, {}
        for k, v in d.items():
            if k == "_id": continue
            if k in NUM:
                try: maxd[k] = int(float(str(v).replace(",", "").strip()))
                except Exception: pass
            else:
                s = "" if v is None else str(v).strip()
                if s: setd[k] = s
        setd["Tweet ID"] = good
        upd = {}
        if setd: upd["$set"] = setd
        if maxd: upd["$max"] = maxd
        ops.append(UpdateOne({"_id": good}, upd, upsert=True))
        dels.append(raw); moved += 1
        if len(ops) >= 2000:
            c.bulk_write(ops, ordered=False); c.delete_many({"_id": {"$in": dels}})
            ops, dels = [], []
            print("  merged:", format(moved, ","), flush=True)
    if ops:
        c.bulk_write(ops, ordered=False); c.delete_many({"_id": {"$in": dels}})

    print("\nMerge kiye:", format(moved, ","), "| chhode (ID nahi mili):", kept)
    print("Ab total docs:", format(c.estimated_document_count(), ","))
    print("\nAb chalao:  python push_all_scopes.py MONGO")


if __name__ == "__main__":
    main()
