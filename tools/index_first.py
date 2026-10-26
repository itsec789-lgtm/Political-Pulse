# -*- coding: utf-8 -*-
"""
index_first.py  --  Phase 0.2 / 0.3 of the hot/cold plan.

Adds ONE index to pulse_master.master_tweets:  {_first: 1}
(non-destructive; no document is changed). Times the daily_report.py
queries that filter on _first before and after, and prints explain()
for each one.

Refuses to run while the pipeline holds DASHBOARD/.pipeline.lock.

    python tools\\index_first.py            # time -> index -> time
    python tools\\index_first.py --check    # only explain/time, no index
"""
import os, sys, time, json, datetime
LIVE = r"C:\Main Twitter Project\DASHBOARD"
sys.path.insert(0, LIVE)
from pymongo import MongoClient
from mongo_conf import MONGO_URL

LOCK = os.path.join(LIVE, ".pipeline.lock")
TODAY = datetime.date.today().isoformat()


def plan_of(c, q):
    ex = c.find(q).explain()
    wp = ex.get("queryPlanner", {}).get("winningPlan", {})
    st = []
    def walk(p):
        if not p: return
        s = p.get("stage")
        if s == "IXSCAN": s += "(%s)" % p.get("indexName")
        st.append(s)
        walk(p.get("inputStage"))
        for x in p.get("inputStages", []) or []: walk(x)
    walk(wp)
    return " <- ".join(st)


def timed(label, fn):
    t = time.time(); r = fn(); dt = time.time() - t
    print("  %-46s %8.2f s   -> %s" % (label, dt, r))
    return dt


def run_queries(c, tag):
    print("\n[%s]  _first = %s" % (tag, TODAY))
    out = {}
    for scope in (None, "Uttar Pradesh"):
        base = {} if not scope else {"State": scope}
        q_new = dict(base); q_new["_first"] = TODAY
        name = scope or "All India"
        print("  scope: %s   plan: %s" % (name, plan_of(c, q_new)))
        out[name + " count"] = timed("count_documents(q_new)", lambda: c.count_documents(q_new))
        out[name + " minmax"] = timed("aggregate $match q_new -> min/max date", lambda: len(list(c.aggregate([
            {"$match": q_new}, {"$group": {"_id": None, "min": {"$min": "$Tweet Date"}, "max": {"$max": "$Tweet Date"}}}]))))
        out[name + " bydate"] = timed("aggregate $match q_new -> by date top8", lambda: len(list(c.aggregate([
            {"$match": q_new}, {"$group": {"_id": {"$substr": ["$Tweet Date", 0, 10]}, "n": {"$sum": 1}}},
            {"$sort": {"n": -1}}, {"$limit": 8}]))))
    return out


def pipeline_running():
    """True if .pipeline.lock exists AND its pid is alive (same rule as run_pipeline.py:
    a lock whose process is gone is stale)."""
    if not os.path.exists(LOCK):
        return False
    try:
        pid = int(json.load(open(LOCK)).get("pid", 0))
    except Exception:
        return True                      # unreadable lock -> be safe
    import subprocess
    out = subprocess.run(["tasklist", "/FI", "PID eq %d" % pid, "/NH"], capture_output=True, text=True).stdout
    alive = str(pid) in out
    print("lock pid %d alive: %s" % (pid, alive))
    return alive


def main():
    if pipeline_running():
        print("STOP: pipeline is running (%s). Try again when it is idle." % LOCK)
        return 2
    c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=6000)["pulse_master"]["master_tweets"]
    have = [i["name"] for i in c.list_indexes()]
    print("existing _first index:", "_first_1" in have)
    before = run_queries(c, "BEFORE" if "_first_1" not in have else "CURRENT")
    if "--check" in sys.argv or "_first_1" in have:
        return 0
    if pipeline_running():
        print("STOP: pipeline started meanwhile -- index NOT created."); return 2
    print("\ncreate_index([('_first', 1)]) ...")
    t = time.time()
    name = c.create_index([("_first", 1)], name="_first_1")
    print("  created %s in %.1f s" % (name, time.time() - t))
    after = run_queries(c, "AFTER")
    print("\nSUMMARY (seconds, before -> after)")
    for k in before:
        print("  %-28s %8.2f -> %6.2f" % (k, before[k], after[k]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
