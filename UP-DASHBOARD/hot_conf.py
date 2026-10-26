# -*- coding: utf-8 -*-
"""
hot_conf.py  --  HOT store (MongoDB Atlas, last N days) ki settings, EK jagah se.
(hot/cold plan, Phase 1)

COLD = local MongoDB (pulse_master.master_tweets) -- poora archive, source of truth.
HOT  = Atlas par sirf pichhle `days` din ke tweets + dashboard collections.

Settings kahan se (jo pehle mile):
   1. env:  MONGO_HOT_URL, PULSE_HOT_ENABLED (1/0), PULSE_HOT_DAYS, PULSE_HOT_DB
   2. db_config.local.json -> "hot": {...}   (git me NAHI jaati -- password yahin)
   3. default: enabled=False  -> system bilkul pehle jaisa chalta hai

mongo_conf.py ko haath nahi lagaya -- MONGO_URL waisa ka waisa.

Use:
    from hot_conf import HOT, window_cutoff, hot_client, masked
    if HOT["enabled"]: ...
"""
import json
import os
import datetime

DEFAULTS = {"enabled": False, "url": "", "db": "pulse_hot", "days": 7, "max_mb": 400}
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
LOCAL_NAME = "db_config.local.json"


def _find(name):
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            return p
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    return None


def _truthy(v):
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def load_hot():
    h = dict(DEFAULTS)
    p = _find(LOCAL_NAME)
    if p:
        try:
            with open(p, encoding="utf-8") as f:
                h.update((json.load(f) or {}).get("hot") or {})
        except Exception as e:
            print("  [hot_conf] %s padhi nahi gayi (%s) -- HOT band" % (LOCAL_NAME, e))
            h = dict(DEFAULTS)
    env = os.environ
    if (env.get("MONGO_HOT_URL") or "").strip():
        h["url"] = env["MONGO_HOT_URL"].strip()
    if (env.get("PULSE_HOT_ENABLED") or "").strip():
        h["enabled"] = _truthy(env["PULSE_HOT_ENABLED"])
    if (env.get("PULSE_HOT_DAYS") or "").strip():
        h["days"] = env["PULSE_HOT_DAYS"]
    if (env.get("PULSE_HOT_DB") or "").strip():
        h["db"] = env["PULSE_HOT_DB"].strip()
    h["enabled"] = bool(h.get("enabled")) if not isinstance(h.get("enabled"), str) else _truthy(h["enabled"])
    try:
        h["days"] = max(1, int(h.get("days") or 7))
    except Exception:
        h["days"] = 7
    try:
        h["max_mb"] = int(h.get("max_mb") or 400)
    except Exception:
        h["max_mb"] = 400
    h["url"] = str(h.get("url") or "").strip()
    if not h["url"]:
        h["enabled"] = False                 # URL ke bina HOT chalu ho hi nahi sakta
    h["source"] = p or "(defaults)"
    return h


HOT = load_hot()


def today_ist(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=datetime.timezone.utc)
    return now.astimezone(IST).date()


def effective_days():
    """hot.days, ya Phase 7 guard ne size ki wajah se ghataya ho to wo (DASHBOARD/.hot_state.json)."""
    here = os.path.dirname(os.path.abspath(__file__))
    for p in (os.path.join(here, ".hot_state.json"), os.path.join(here, "..", "DASHBOARD", ".hot_state.json")):
        try:
            v = int((json.load(open(p)) or {}).get("days") or 0)
            if v > 0:
                return min(v, HOT["days"])
        except Exception:
            pass
    return HOT["days"]


def window_cutoff(days=None, now=None):
    """HOT window ka PEHLA din (IST), 'YYYY-MM-DD'.
    days=7 -> aaj + pichhle 6 din. Har jagah yahi use karo, cutoff inline mat banao."""
    d = int(days or effective_days())
    return (today_ist(now) - datetime.timedelta(days=d - 1)).isoformat()


def masked(url=None):
    u = HOT["url"] if url is None else url
    if "@" in u and "//" in u:
        pre, rest = u.split("//", 1)
        cred, host = rest.rsplit("@", 1)
        user = cred.split(":", 1)[0]
        return "%s//%s:****@%s" % (pre, user, host)
    return u


def hot_client(timeout_ms=4000):
    """MongoClient for HOT, ya None (band / URL nahi)."""
    if not HOT["enabled"]:
        return None
    from pymongo import MongoClient
    return MongoClient(HOT["url"], serverSelectionTimeoutMS=timeout_ms,
                       connectTimeoutMS=timeout_ms, socketTimeoutMS=120000,
                       compressors="zlib")   # Atlas M0: 10 GB/week transfer -- wire compression


if __name__ == "__main__":
    print("hot source :", HOT["source"])
    print("enabled    :", HOT["enabled"])
    print("url        :", masked() or "(khaali)")
    print("db / days  :", HOT["db"], "/", HOT["days"], "  max_mb:", HOT["max_mb"])
    print("cutoff IST :", window_cutoff())
    if HOT["enabled"]:
        try:
            c = hot_client(); c.admin.command("ping")
            s = c[HOT["db"]].command("dbStats", scale=1024 * 1024)
            print("connection : OK  --  %s data %.1f MB, index %.1f MB" % (HOT["db"], s["dataSize"], s["indexSize"]))
        except Exception as e:
            print("connection : FAIL --", str(e)[:200])
