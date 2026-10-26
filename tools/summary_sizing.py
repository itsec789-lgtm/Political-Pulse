# -*- coding: utf-8 -*-
"""summary_sizing.py -- READ-ONLY sizing for the Phase 2 daily summary.
Counts how many summary docs (handle x day x row State x row Party x row Category) there would be,
how many tweets have no valid date, and how many hashtag occurrences per summary doc.
Refuses to run while the pipeline is running."""
import os, sys, json, time, subprocess
LIVE = r"C:\Main Twitter Project\DASHBOARD"
sys.path.insert(0, LIVE)
from pymongo import MongoClient
from mongo_conf import MONGO_URL
LOCK = os.path.join(LIVE, ".pipeline.lock")

def running():
    if not os.path.exists(LOCK): return False
    try: pid = int(json.load(open(LOCK)).get("pid", 0))
    except Exception: return True
    out = subprocess.run(["tasklist", "/FI", "PID eq %d" % pid, "/NH"], capture_output=True, text=True).stdout
    return str(pid) in out

if running():
    print("STOP: pipeline running"); sys.exit(2)
c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=6000)["pulse_master"]["master_tweets"]
t = time.time()
pipe = [
    {"$project": {"_id": 0, "h": "$Handle", "st": "$State", "pt": "$Party", "cat": "$Category",
                  "d": {"$substrBytes": [{"$ifNull": ["$Tweet Date", ""]}, 0, 10]},
                  "nt": {"$size": {"$regexFindAll": {"input": {"$toLower": {"$ifNull": ["$Tweet Text", ""]}}, "regex": "#[^\\s#]+"}}}}},
    {"$group": {"_id": {"h": "$h", "d": "$d", "st": "$st", "pt": "$pt", "cat": "$cat"}, "n": {"$sum": 1}, "tags": {"$sum": "$nt"}}},
    {"$group": {"_id": None, "docs": {"$sum": 1}, "tweets": {"$sum": "$n"}, "tagocc": {"$sum": "$tags"},
                "maxTags": {"$max": "$tags"},
                "badDateDocs": {"$sum": {"$cond": [{"$regexMatch": {"input": "$_id.d", "regex": "^\\d{4}-\\d{2}-\\d{2}$"}}, 0, 1]}},
                "badDateTweets": {"$sum": {"$cond": [{"$regexMatch": {"input": "$_id.d", "regex": "^\\d{4}-\\d{2}-\\d{2}$"}}, 0, "$n"]}},
                "days": {"$addToSet": "$_id.d"}}},
    {"$project": {"docs": 1, "tweets": 1, "tagocc": 1, "maxTags": 1, "badDateDocs": 1, "badDateTweets": 1, "ndays": {"$size": "$days"}}},
]
r = list(c.aggregate(pipe, allowDiskUse=True))[0]
print(json.dumps(r, default=str, indent=1))
hd = list(c.aggregate([{"$group": {"_id": {"h": "$Handle", "d": {"$substrBytes": [{"$ifNull": ["$Tweet Date", ""]}, 0, 10]}}}},
                        {"$count": "n"}], allowDiskUse=True))
print("handle-day pairs:", hd[0]["n"] if hd else 0)
# rough size: base ~220 bytes + 24 hr ints (~200) + per tag ~45 bytes
est = r["docs"] * 420 + r["tagocc"] * 45
print("estimated summary size: %.0f MB (upper bound; tags counted per occurrence)" % (est / 1e6))
print("took %.0f s" % (time.time() - t))
