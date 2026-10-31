# -*- coding: utf-8 -*-
"""
SYNC_SNAPSHOT_TO_MONGO.py -- Political Pulse Local Snapshot Sync
Syncs git-tracked dashboard snapshot JSON files into local MongoDB (india_Pulse & up_pulse).

Usage:
    python SYNC_SNAPSHOT_TO_MONGO.py           # Force sync
    python SYNC_SNAPSHOT_TO_MONGO.py --if-newer # Sync only if JSON files are newer than Mongo lastUpdate
"""
import os
import sys
import json
import datetime
from pymongo import MongoClient

HERE = os.path.dirname(os.path.abspath(__file__))
from mongo_conf import MONGO_URL

def snapshot_time(path):
    """Snapshot ka asli time = git me us file ka aakhri commit.
    File ka modify-time kaam ka nahi: git checkout/pull use hamesha "abhi"
    kar deta hai, to purana snapshot bhi naya lagta aur Mongo ka taaza data
    usse badal jaata. Git na mile tabhi modify-time."""
    try:
        import subprocess
        rel = os.path.relpath(path, HERE).replace(os.sep, '/')
        out = subprocess.run(['git', 'log', '-1', '--format=%ct', '--', rel], cwd=HERE,
                             capture_output=True, text=True, timeout=20).stdout.strip()
        if out:
            return datetime.datetime.fromtimestamp(int(out))
    except Exception:
        pass
    return datetime.datetime.fromtimestamp(os.path.getmtime(path))

def sync_scope(scope_dir, db_name, if_newer=False, log=print):
    data_dir = os.path.join(HERE, scope_dir, "data")
    dd_path = os.path.join(data_dir, "dashboard_data.json")
    if not os.path.exists(dd_path):
        return False

    cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = cli[db_name]

    file_dt = snapshot_time(dd_path)

    if if_newer:
        cur_meta = db["meta"].find_one({"key": "lastUpdate"})
        if cur_meta and cur_meta.get("value"):
            try:
                db_dt = datetime.datetime.fromisoformat(str(cur_meta["value"]))
                if file_dt <= db_dt:
                    return False
            except Exception:
                pass

    log(f"[*] Syncing {scope_dir} snapshot into MongoDB ({db_name})...")

    # 1. dashboard_data
    with open(dd_path, encoding="utf-8") as f:
        dd_docs = json.load(f)
    db["dashboard_data__new"].drop()
    db["dashboard_data__new"].insert_many(dd_docs)
    db["dashboard_data__old"].drop()
    try: db["dashboard_data"].rename("dashboard_data__old")
    except Exception: pass
    db["dashboard_data__new"].rename("dashboard_data")
    db["dashboard_data__old"].drop()

    # 2. phd
    phd_path = os.path.join(data_dir, "phd.json")
    if os.path.exists(phd_path):
        with open(phd_path, encoding="utf-8") as f:
            phd_docs = json.load(f)
        db["phd__new"].drop()
        for i in range(0, len(phd_docs), 1000):
            db["phd__new"].insert_many(phd_docs[i:i+1000])
        db["phd__old"].drop()
        try: db["phd"].rename("phd__old")
        except Exception: pass
        db["phd__new"].rename("phd")
        db["phd__old"].drop()

    # 3. handles
    handles_path = os.path.join(data_dir, "handles.json")
    if os.path.exists(handles_path):
        with open(handles_path, encoding="utf-8") as f:
            handles_docs = json.load(f)
        db["handles__new"].drop()
        for i in range(0, len(handles_docs), 1000):
            db["handles__new"].insert_many(handles_docs[i:i+1000])
        db["handles__old"].drop()
        try: db["handles"].rename("handles__old")
        except Exception: pass
        db["handles__new"].rename("handles")
        db["handles__old"].drop()

    # 4. mapping
    mapping_path = os.path.join(data_dir, "mapping.json")
    if os.path.exists(mapping_path):
        with open(mapping_path, encoding="utf-8") as f:
            mapping_docs = json.load(f)
        db["mapping__new"].drop()
        db["mapping__new"].insert_many(mapping_docs)
        db["mapping__old"].drop()
        try: db["mapping"].rename("mapping__old")
        except Exception: pass
        db["mapping__new"].rename("mapping")
        db["mapping__old"].drop()

    # 5. stamp lastUpdate
    now_str = file_dt.strftime("%Y-%m-%d %H:%M:%S")
    db["meta"].update_one({"key": "lastUpdate"}, {"$set": {"key": "lastUpdate", "value": now_str}}, upsert=True)
    log(f"[+] {db_name} updated successfully! (stamped: {now_str})")
    cli.close()
    return True

def sync_all(if_newer=False, log=print):
    s1 = sync_scope("DASHBOARD", "india_Pulse", if_newer=if_newer, log=log)
    s2 = sync_scope("UP-DASHBOARD", "up_pulse", if_newer=if_newer, log=log)
    return s1 or s2

if __name__ == "__main__":
    if_newer = "--if-newer" in sys.argv
    changed = sync_all(if_newer=if_newer)
    if not changed and if_newer:
        print("[*] Local MongoDB is already up-to-date with snapshot files.")

