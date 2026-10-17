# -*- coding: utf-8 -*-
"""
fix_data_quality.py  --  Mongo master me do purani galtiyan theek karta hai:

  1. HANDLE me BOM/zero-width char  ->  'ncbn' aur '﻿ncbn' do alag handle ban gaye the
  2. STATE ki spelling             ->  'Odisa' aur 'Odisha' alag gine ja rahe the
                                       (Uttrakhand/Chattisgarh/Orissa waghairah bhi)

Chalao:
  python fix_data_quality.py --check    # sirf dikhao kitna galat hai
  python fix_data_quality.py            # theek kar do
"""
import sys, re
from pymongo import MongoClient, UpdateOne

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
BAD_CH = re.compile(r'[﻿​‌‍\xa0]')

STATE_FIX = {
    'odisa': 'Odisha', 'orissa': 'Odisha', 'odissa': 'Odisha',
    'uttrakhand': 'Uttarakhand', 'uttaranchal': 'Uttarakhand',
    'chattisgarh': 'Chhattisgarh', 'chhatisgarh': 'Chhattisgarh',
    'tamilnadu': 'Tamil Nadu', 'madhyapradesh': 'Madhya Pradesh',
    'andhrapradesh': 'Andhra Pradesh', 'westbengal': 'West Bengal',
    'jammu & kashmir': 'Jammu and Kashmir', 'j&k': 'Jammu and Kashmir',
    'new delhi': 'Delhi', 'pondicherry': 'Puducherry',
    'up': 'Uttar Pradesh', 'uttarpradesh': 'Uttar Pradesh',
}


def main():
    c = MongoClient(MONGO_URL)[DB][COLL]
    check = '--check' in sys.argv

    # ---- 1) handle me BOM ----
    bad_h = list(c.find({"Handle": {"$regex": r"[﻿​‌‍\xa0]|^\s|\s$"}},
                        {"Handle": 1}).limit(100000))
    print("Handle me BOM/space wale docs:", format(len(bad_h), ","))
    if bad_h:
        print("  sample:", [repr(d["Handle"])[:28] for d in bad_h[:4]])

    # ---- 2) state spelling ----
    states = {}
    for r in c.aggregate([{"$group": {"_id": "$State", "n": {"$sum": 1}}}]):
        states[(r["_id"] or "")] = r["n"]
    bad_s = {s: n for s, n in states.items() if str(s).strip().lower() in STATE_FIX
             and str(s).strip() != STATE_FIX[str(s).strip().lower()]}
    print("\nState spelling galat wale:", {k: format(v, ",") for k, v in bad_s.items()} or "koi nahi")

    if check:
        print("\n(--check mode: kuch nahi badla)")
        return
    if not bad_h and not bad_s:
        print("\nSab theek hai."); return

    fixed = 0
    if bad_h:
        ops = []
        for d in bad_h:
            h2 = BAD_CH.sub('', str(d["Handle"])).strip().lstrip('@').strip()
            if h2 and h2 != d["Handle"]:
                ops.append(UpdateOne({"_id": d["_id"]}, {"$set": {"Handle": h2}}))
        for i in range(0, len(ops), 2000):
            c.bulk_write(ops[i:i + 2000], ordered=False)
        fixed += len(ops)
        print("\nHandle theek kiye:", format(len(ops), ","))

    for s, n in bad_s.items():
        good = STATE_FIX[str(s).strip().lower()]
        r = c.update_many({"State": s}, {"$set": {"State": good}})
        print("  State '%s' -> '%s' : %s rows" % (s, good, format(r.modified_count, ",")))
        fixed += r.modified_count

    print("\nDONE. Total theek:", format(fixed, ","))
    print("Ab chalao:  python push_all_scopes.py MONGO")


if __name__ == "__main__":
    main()
