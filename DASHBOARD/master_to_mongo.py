# -*- coding: utf-8 -*-
"""
master_to_mongo.py  --  master_tweets.csv ko MongoDB me daalta hai.

  DB         : pulse_master
  Collection : master_tweets
  _id        : Tweet ID  (isse duplicate apne aap nahi bante)

MERGE rule (data kabhi kam/blank nahi hota):
  - numeric fields (likes/views/rt/posts/comments/followers...) -> $max  (count sirf badhta hai)
  - text fields (state/party/designation/text/date...)          -> $set  sirf jab naya value non-blank ho

Chalao:
  python master_to_mongo.py                 # poori master.csv -> mongo (one-time / re-sync)
  python master_to_mongo.py --count         # sirf ginti dikhao
"""
import os, sys, json, datetime
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, "data", "master_tweets.csv")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB = "pulse_master"
COLL = "master_tweets"

_TODAY = datetime.date.today().isoformat()
NUM = ['Followers', 'Followings', 'Total Posts', 'Total Comments', 'Total Likes',
       'Total Retweets', 'Total Views', 'Total Bookmark Tweets Times']
SCHEMA = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
          'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
          'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
          'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
          'Category','Party','Status']


def coll():
    from pymongo import MongoClient
    return MongoClient(MONGO_URL)[DB][COLL]


def _num(v):
    try:
        return int(float(str(v).replace(',', '').strip()))
    except Exception:
        return None


_DAY_RE = None


def mark_dirty(c, days=(), all_days=False):
    """hot/cold plan, Phase 2: tell the daily summary which days changed.
    Writes {_id: 'YYYY-MM-DD', at: now} into pulse_master.summary_dirty (or
    <coll>_summary_dirty for a test collection). Never raises -- ingest must not
    fail because of the summary."""
    global _DAY_RE
    try:
        import re as _re
        from pymongo import UpdateOne
        if _DAY_RE is None:
            _DAY_RE = _re.compile(r'^\d{4}-\d{2}-\d{2}$')
        dc = c.database['summary_dirty' if c.name == COLL else c.name + '_summary_dirty']
        now = datetime.datetime.now(datetime.timezone.utc)
        if all_days:
            dc.update_one({'_id': 'ALL'}, {'$set': {'at': now}}, upsert=True)
            return 1
        ds = sorted({d for d in days if d and _DAY_RE.match(d)})
        if ds:
            dc.bulk_write([UpdateOne({'_id': d}, {'$set': {'at': now}}, upsert=True) for d in ds], ordered=False)
        return len(ds)
    except Exception as e:
        print("  (summary_dirty mark skip: %s)" % e)
        return 0


def upsert_frame(df, c, log=print):
    """DataFrame -> mongo (merge upsert). Return (inserted+updated) count."""
    from pymongo import UpdateOne
    import re as _re
    _rid = _re.compile(r'/status(?:es)?/(\d+)')
    ops = []
    _days = set()
    for r in df.itertuples(index=False):
        d = dict(zip(df.columns, r))
        # _id HAMESHA URL me se Tweet ID (yahi asli unique key hai).
        # URL na ho to Tweet ID column, warna row skip.
        u = str(d.get('Tweet URL', '')).strip()
        m = _rid.search(u)
        tid = m.group(1) if m else ''
        if not tid:
            tid = str(d.get('Tweet ID', '')).strip()
            if not tid or not tid.isdigit():
                continue
        setd, maxd = {}, {}
        for k in SCHEMA:
            v = d.get(k, '')
            v = '' if v is None else str(v).strip()
            if k in NUM:
                n = _num(v)
                if n is not None: maxd[k] = n
            elif v != '':
                setd[k] = v
        upd = {}
        if setd: upd['$set'] = setd
        if maxd: upd['$max'] = maxd
        # ---- Source Folder ----
        # Ek hi tweet kai folder ki file me aa sakta hai (jaise 'All India Top Leaders'
        # aur 'CM and DCM' dono me). Isliye SET nahi, ARRAY me jodte hain --
        # $addToSet purana mitata nahi, bas naya naam jod deta hai.
        # Mongo array par barabari khud-ba-khud "isme ye hai kya?" ban jaati hai,
        # yaani {'Source Folders': 'All India Top Leaders'} sidhe kaam karta hai.
        sf = str(d.get('Source Folder', '') or '').strip()
        add = {}
        if sf:
            add['Source Folders'] = sf
        # Categories: handle ke SAARE label (list). SCHEMA wale $set string ke liye hain,
        # isliye ise alag se array ki tarah likhte hain.
        cl = d.get('Categories')
        if isinstance(cl, (list, tuple, set)):
            cl = [str(x).strip() for x in cl if str(x).strip() not in ('', '-')]
            if cl:
                setd['Categories'] = sorted(set(cl))
                upd['$set'] = setd
        if add:
            upd['$addToSet'] = add
        # _first = ye tweet HUMARE paas kab aaya (backdate scraping track karne ke liye)
        upd['$setOnInsert'] = {'_first': _TODAY}
        if not upd: continue
        ops.append(UpdateOne({'_id': tid}, upd, upsert=True))
        _days.add(str(d.get('Tweet Date', '') or '')[:10])
        if len(ops) >= 5000:
            c.bulk_write(ops, ordered=False); ops = []
    if ops: c.bulk_write(ops, ordered=False)
    mark_dirty(c, _days)                    # hot/cold: these days need a fresh summary
    # handle kab pehli baar mila (naye handles ginne ke liye)
    try:
        hs = set(str(x).strip() for x in df.get('Handle', []) if str(x).strip())
        if hs:
            hc = c.database['handles_seen']
            hc.bulk_write([UpdateOne({'_id': h}, {'$setOnInsert': {'first': _TODAY}}, upsert=True)
                           for h in hs], ordered=False)
    except Exception:
        pass
    return len(df)


def main():
    c = coll()
    if '--count' in sys.argv:
        print("MongoDB %s.%s docs: %s" % (DB, COLL, f"{c.estimated_document_count():,}")); return
    if not os.path.exists(MASTER):
        print("!! master nahi mila:", MASTER); return
    # helpful indexes (ek baar)
    for f in ['Tweet Date', 'State', 'Handle', 'Category', 'Party']:
        try: c.create_index(f)
        except Exception: pass
    print("Sync:", MASTER, "->", DB + "." + COLL)
    t0 = datetime.datetime.now(); done = 0
    for ch in pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig', chunksize=50000, keep_default_na=False):
        ch = ch.rename(columns=lambda x: str(x).strip())
        for k in SCHEMA:
            if k not in ch.columns: ch[k] = ''
        done += upsert_frame(ch[SCHEMA], c)
        print("  synced:", f"{done:,}", "rows...", flush=True)
    n = c.estimated_document_count()
    print("\nDONE in", str(datetime.datetime.now() - t0).split('.')[0])
    print("Mongo me kul unique tweets:", f"{n:,}")
    print("\nAb export karo:  python export_from_mongo.py --from 2026-04-01 --to 2026-08-11")


if __name__ == "__main__":
    main()
