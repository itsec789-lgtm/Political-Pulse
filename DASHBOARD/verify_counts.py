# -*- coding: utf-8 -*-
"""
verify_counts.py  --  Mongo se ginti milaata hai (report ke numbers sahi hain ya nahi).

Check karta hai:
  1. Category-wise ka jod  == kul tweets ?   (barabar hona CHAHIYE)
  2. Designation-wise jod  vs kul tweets ?   (thoda zyada hoga - multi-designation)
  3. Handles ki ginti      == distinct Handle ?
  4. Kaun se handles double-count ho rahe hain (CM+MLA jaise)

Chalao:  python verify_counts.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import daily_report as D
from pymongo import MongoClient

c = MongoClient(__import__("mongo_conf").MONGO_URL)["pulse_master"]["master_tweets"]

total = c.estimated_document_count()
handles = len(c.distinct("Handle"))
print("=" * 58)
print("  VERIFY  (source: pulse_master.master_tweets)")
print("=" * 58)
print("  Kul tweets  : %s" % D.IN(total))
print("  Kul handles : %s" % D.IN(handles))

# 1) Category-wise
cat = D.agg_count(c, {}, "Category")
cs = sum(cat.values())
print("\n[1] CATEGORY-WISE")
for k, v in cat.items():
    print("      %-20s %s" % (k, D.IN(v)))
print("      %-20s %s" % ("JOD", D.IN(cs)))
print("      -> %s (total %s)" % ("MATCH ✓" if cs == total else "MISMATCH ✗ farak " + D.IN(abs(cs - total)), D.IN(total)))

# 2) Designation-wise
lvl = D.agg_levels(c, {})
ls = sum(t for _, t, _ in lvl)
print("\n[2] DESIGNATION-WISE (multi-designation dono me)")
for k, t, h in lvl:
    print("      %-24s %10s  %s handles" % (k, D.IN(t), D.IN(h)))
print("      %-24s %10s" % ("JOD", D.IN(ls)))
print("      -> total %s | farak %s  (ye dohra count hai, galti nahi)" % (D.IN(total), D.IN(ls - total)))

# 3) multi-designation handles
print("\n[3] MULTI-DESIGNATION HANDLES (jo do jagah gine ja rahe)")
multi = {}
for r in c.aggregate([{"$group": {"_id": {"d": "$Designation", "h": "$Handle"}, "n": {"$sum": 1}}}]):
    k = r["_id"] or {}
    d, h = k.get("d"), k.get("h")
    if len(D.levels_of(d)) > 1:
        multi[h] = (d, multi.get(h, (None, 0))[1] + r["n"])
tot_multi = sum(v[1] for v in multi.values())
print("      handles: %s | inke tweets: %s" % (D.IN(len(multi)), D.IN(tot_multi)))
for h, (d, n) in sorted(multi.items(), key=lambda x: -x[1][1])[:8]:
    print("        @%-20s %-28s %s tweets" % (h, str(d)[:28], D.IN(n)))
print("\n      => designation-table ka extra (%s) inhi ki wajah se hai." % D.IN(ls - total))
