# -*- coding: utf-8 -*-
"""
src_chunks.py  --  data source ka common reader.

  src = "MONGO"   -> pulse_master.master_tweets se padho (source of truth)
  src = "koi.csv" -> us CSV se padho (fallback / backup)

Dono case me same shape ke DataFrame chunks milte hain, isliye baaki
pipeline ka code badalna nahi padta.
"""
import pandas as pd

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
CHUNK = 200000


def is_mongo(src):
    return str(src).strip().upper() == "MONGO"


def mongo_coll():
    from pymongo import MongoClient
    return MongoClient(MONGO_URL)[DB][COLL]


def chunks(src, need, query=None):
    """need = column naam ka set/list. yields DataFrame (sab str, no NaN)."""
    need = list(need)
    if is_mongo(src):
        c = mongo_coll()
        proj = {k: 1 for k in need}
        proj['_id'] = 0
        buf = []
        for d in c.find(query or {}, proj).batch_size(5000):
            buf.append(d)
            if len(buf) >= CHUNK:
                df = pd.DataFrame(buf)
                for k in need:
                    if k not in df.columns: df[k] = ''
                yield df[need].fillna('').astype(str)
                buf = []
        if buf:
            df = pd.DataFrame(buf)
            for k in need:
                if k not in df.columns: df[k] = ''
            yield df[need].fillna('').astype(str)
    else:
        for ch in pd.read_csv(src, dtype=str, chunksize=CHUNK, encoding='utf-8-sig',
                              usecols=lambda c: str(c).strip() in need, keep_default_na=False):
            yield ch.rename(columns=lambda c: str(c).strip()).fillna('')
