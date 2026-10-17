# -*- coding: utf-8 -*-
"""
mongo_conf.py  --  MongoDB ka connection string, EK hi jagah se.

Pehle ye NAHI tha: har script me apna-apna "mongodb://localhost:27017"
likha hua tha (40 file, 47 jagah). Jis din MongoDB par authentication
chalu hua, saari script ek saath band ho gayin --
    "Command count requires authentication ... code 13 Unauthorized"
kyunki koi bhi script username/password bhejti hi nahi thi.

Ab sab yahi file poochhte hain. Password badla? Sirf db_config.json
badlo -- baaki kahin haath nahi lagana.

Kram (jo pehle mil jaaye, wahi):
   1. MONGO_URL environment variable      (ek baar ke test/override ke liye)
   2. db_config.json -> "mongo_url"       (project ki jad me -- ASLI JAGAH)
   3. mongodb://localhost:27017           (purana vyavhaar; auth band ho to)

Yaani db_config.json khaali chhod do to sab bilkul pehle jaisa chalta hai.

DHYAN: db_config.json me password khula padta hai. Folder kisi ko dena ho
to wo file pehle hata dena.

Use:
    from mongo_conf import MONGO_URL
"""
import json
import os

FALLBACK = "mongodb://localhost:27017"
_PLACEHOLDER = "PASTE_"


def _find_db_config():
    """db_config.json ko apne folder se upar ki taraf dhoondho (5 level tak)."""
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        p = os.path.join(d, "db_config.json")
        if os.path.isfile(p):
            return p
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    return None


def mongo_url():
    env = (os.environ.get("MONGO_URL") or "").strip()
    if env:
        return env

    p = _find_db_config()
    if p:
        try:
            with open(p, encoding="utf-8") as f:
                v = (json.load(f).get("mongo_url") or "").strip()
            if v and not v.startswith(_PLACEHOLDER):
                return v
        except Exception as e:
            # File hai par tuti hui hai -- chup mat raho, warna aadmi
            # ghanton dhoondhta rahega ki auth kaam kyun nahi kar raha.
            print("  [mongo_conf] db_config.json padhi nahi gayi (%s)" % e)
            print("               -- filhaal localhost use kar rahe hain")

    return FALLBACK


MONGO_URL = mongo_url()


if __name__ == "__main__":
    # Jaanch: python mongo_conf.py
    safe = MONGO_URL
    if "@" in safe:                       # password chhupa do
        a, b = safe.split("@", 1)
        if ":" in a:
            safe = a.rsplit(":", 1)[0] + ":****@" + b
    print("db_config.json :", _find_db_config() or "(nahi mili)")
    print("MONGO_URL      :", safe)
    try:
        from pymongo import MongoClient
        c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        c.admin.command("ping")
        n = c["pulse_master"]["master_tweets"].estimated_document_count()
        print("connection     : OK  --  master_tweets: {:,} tweets".format(n))
        c.close()
    except Exception as e:
        print("connection     : FAIL --", e)
