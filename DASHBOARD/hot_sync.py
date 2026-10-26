# -*- coding: utf-8 -*-
"""
hot_sync.py  --  hot/cold plan, Phase 3 + 7: keep the Atlas HOT copy of the last N days.

  python hot_sync.py --init              indexes on pulse_hot.tweets (TTL on ts + 4 query indexes)
  python hot_sync.py --resync [--force]  copy the whole window cold -> hot (max once a day, unless
                                         --force or DASHBOARD/.hot_resync exists); clears the flag
  python hot_sync.py --check             per-day counts hot vs cold inside the window + Atlas size;
                                         Phase 7 guard: above max_mb -> window 5 days, back to normal under 300 MB
  python hot_sync.py --status            one-line status (JSON) for the admin page / pipeline log

Cold (local master_tweets) is only READ. Hot is a cache: anything wrong there is fixed by --resync.
Connection string is never printed (masked).
"""
import os, sys, json, time, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hot_conf as HC
from mongo_conf import MONGO_URL
from pymongo import MongoClient, ReplaceOne
from master_to_mongo import ist_to_utc

FLAG = os.path.join(HERE, '.hot_resync')
MARK = os.path.join(HERE, '.hot_resync_done')
STATE = os.path.join(HERE, '.hot_state.json')        # guard state (effective window days)
INDEXES = [([('Handle', 1), ('ts', -1)], {}), ([('ts', -1)], {}),
           ([('Party', 1), ('ts', -1)], {}), ([('Category', 1), ('ts', -1)], {}),
           # Phase 5 routes (Tweet Explorer / Top tweets / news) sort on these:
           ([('Tweet Date', -1)], {}), ([('Total Views', -1)], {}), ([('Total Likes', -1)], {}),
           ([('Total Retweets', -1)], {}), ([('Total Comments', -1)], {})]


def state():
    try:
        return json.load(open(STATE))
    except Exception:
        return {}


def save_state(s):
    tmp = STATE + '.tmp'
    json.dump(s, open(tmp, 'w'), indent=1)
    os.replace(tmp, STATE)


def eff_days():
    """Window actually used (guard may lower it to 5)."""
    return HC.effective_days()


def hot_db():
    if not HC.HOT['enabled']:
        sys.exit("HOT band hai (db_config.local.json -> hot.enabled / url). Kuch nahi kiya.")
    return HC.hot_client(8000)[HC.HOT['db']]


def init(db, days=None):
    t = db['tweets']
    days = days or eff_days()
    ttl = (days + 1) * 86400
    have = {i['name']: i for i in t.list_indexes()}
    if 'ts_ttl' in have:
        if have['ts_ttl'].get('expireAfterSeconds') != ttl:
            db.command('collMod', 'tweets', index={'name': 'ts_ttl', 'expireAfterSeconds': ttl})
    else:
        t.create_index([('ts', 1)], name='ts_ttl', expireAfterSeconds=ttl)
    for keys, kw in INDEXES:
        t.create_index(keys, **kw)
    print("hot indexes ok (TTL %d days + 1 buffer)" % days)


def resync(db, force=False):
    today = datetime.date.today().isoformat()
    done = open(MARK).read().strip() if os.path.exists(MARK) else ''
    if not force and not os.path.exists(FLAG) and done == today:
        print("resync: aaj ho chuka hai (--force se dobara)"); return 0
    cut = HC.window_cutoff(eff_days())
    cold = MongoClient(MONGO_URL)['pulse_master']['master_tweets']
    hot = db['tweets']
    t0 = time.time(); n = 0; buf = []
    for d in cold.find({'Tweet Date': {'$gte': cut}}).batch_size(2000):
        ts = ist_to_utc(d.get('Tweet Date'))
        if ts is None:
            continue
        d['ts'] = ts
        buf.append(ReplaceOne({'_id': d['_id']}, d, upsert=True))
        if len(buf) >= 1000:
            hot.bulk_write(buf, ordered=False); n += len(buf); buf = []
    if buf:
        hot.bulk_write(buf, ordered=False); n += len(buf)
    # anything older than the window goes now (TTL would do it later anyway)
    cut_utc = ist_to_utc(cut)
    old = hot.delete_many({'ts': {'$lt': cut_utc}}).deleted_count
    open(MARK, 'w').write(today)
    if os.path.exists(FLAG):
        os.remove(FLAG)
    print("resync: %d tweets copied (from %s), %d old removed, %.0f s" % (n, cut, old, time.time() - t0))
    return n


def size_mb(db):
    s = db.command('dbStats')
    return (s.get('dataSize', 0) + s.get('indexSize', 0)) / 1e6


def check(db):
    cut = HC.window_cutoff(eff_days())
    cold = MongoClient(MONGO_URL)['pulse_master']['master_tweets']
    days = []
    d = datetime.date.fromisoformat(cut)
    while d <= HC.today_ist():
        days.append(d.isoformat()); d += datetime.timedelta(days=1)
    bad = 0
    for day in days:
        c = cold.count_documents({'Tweet Date': {'$gte': day, '$lt': day + '~'}})
        h = db['tweets'].count_documents({'ts': {'$gte': ist_to_utc(day), '$lt': ist_to_utc(day) + datetime.timedelta(days=1)}})
        flag = '' if c == h else '   <-- differs'
        bad += bool(flag)
        print("  %s  cold=%6d  hot=%6d%s" % (day, c, h, flag))
    mb = size_mb(db)
    print("check: %d day(s) differ | Atlas %s size %.1f MB (limit %d MB)" % (bad, HC.HOT['db'], mb, HC.HOT['max_mb']))
    guard(db, mb)
    return bad


def guard(db, mb):
    """Phase 7: too big -> 5-day window; back to normal under 300 MB."""
    st = state(); cur = int(st.get('days') or HC.HOT['days'])
    if mb > HC.HOT['max_mb'] and cur > 5:
        st.update(days=5, reduced_at=datetime.datetime.now().isoformat(), reason='%.0f MB' % mb)
        save_state(st); init(db, 5)
        cut_utc = ist_to_utc(HC.window_cutoff(5))
        n = db['tweets'].delete_many({'ts': {'$lt': cut_utc}}).deleted_count
        print("HOT WINDOW REDUCED to 5 days (%.0f MB > %d MB), %d old tweets removed" % (mb, HC.HOT['max_mb'], n))
    elif mb < 300 and cur < HC.HOT['days']:
        st.update(days=HC.HOT['days'], restored_at=datetime.datetime.now().isoformat())
        save_state(st); init(db, HC.HOT['days'])
        open(FLAG, 'w').write('window restored')
        print("HOT WINDOW back to %d days (%.0f MB) -- next run re-copies the window" % (HC.HOT['days'], mb))


def status():
    out = {'enabled': HC.HOT['enabled'], 'db': HC.HOT['db'], 'url': HC.masked(), 'days': eff_days(),
           'window_start': HC.window_cutoff(eff_days()), 'resync_pending': os.path.exists(FLAG),
           'last_resync': open(MARK).read().strip() if os.path.exists(MARK) else ''}
    if HC.HOT['enabled']:
        try:
            db = HC.hot_client(5000)[HC.HOT['db']]
            out['size_mb'] = round(size_mb(db), 1)
            out['tweets'] = db['tweets'].estimated_document_count()
            out['healthy'] = True
        except Exception as e:
            out['healthy'] = False; out['error'] = str(e)[:150]
    print(json.dumps(out))
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--status' in a:
        status(); sys.exit(0)
    db = hot_db()
    if '--init' in a:
        init(db)
    if '--resync' in a:
        init(db); resync(db, force='--force' in a)
    if '--check' in a:
        sys.exit(1 if check(db) else 0)
