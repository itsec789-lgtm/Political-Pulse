# -*- coding: utf-8 -*-
"""
nazar_push.py  --  Nazar feed: Political Pulse ka summary Atlas (pulse_hot) par, taaki
Nazar (Render par) wahi aankde bana sake jo dashboard banata hai.

Atlas par 3 cheezein (sirf ye script likhti hai, Nazar sirf padhta hai):
  nazar_daily    ek row = ek handle x ek din (purane dinon ke liye; pulse_master.daily_summary ka chhota roop)
                 {h, d, st, pt, cat, tw, lk, vw, rt, s:[probjp,antigovt,progovt,pos,neu,antibjp,neg,none]}
  nazar_handles  har handle ki aakhri jaankari {_id:h, name, party, desig, state, pc, ac, cat, fw, fg, last_day}
  nazar_meta     {_id:'info'} window_start, hot_days, updated_at, last_day ...
                 {_id:'days'} sig per din (sirf badle hue din dobara bheje jaate hain)
Live hissa (window_start se aaj tak) Nazar seedha pulse_hot.tweets se padhta hai.

Chalana:
    python nazar_push.py              badle hue din + handles + meta  (pipeline har run me yahi chalata hai)
    python nazar_push.py --force      saare din dobara
    python nazar_push.py --check      Atlas vs local har din ki ginti (kuch nahi likhta)
    python nazar_push.py --db pulse_hot_test --force   (test database)
On/off: db_config.local.json -> "nazar": {"enabled": true}. HOT band ho to kuch nahi karta.
Koi bhi gadbad -> "NAZAR SYNC FAIL" log, pipeline/dashboard par koi asar nahi.
"""
import os, sys, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SENT = ('probjp', 'antigovt', 'progovt', 'pos', 'neu', 'antibjp', 'neg', 'none')
C_DAILY, C_HANDLES, C_META = 'nazar_daily', 'nazar_handles', 'nazar_meta'
SCHEMA = 1


def nazar_enabled():
    for d in (HERE, os.path.dirname(HERE)):
        p = os.path.join(d, 'db_config.local.json')
        if os.path.exists(p):
            try:
                with open(p, encoding='utf-8') as f:
                    return bool(((json.load(f) or {}).get('nazar') or {}).get('enabled'))
            except Exception:
                return False
    return False


def _local():
    from pymongo import MongoClient
    from mongo_conf import MONGO_URL
    return MongoClient(MONGO_URL)['pulse_master']['daily_summary']


def _hot(db_name=None):
    import hot_conf as HC
    if not HC.HOT['enabled']:
        return None, HC
    return HC.hot_client(20000)[db_name or HC.HOT['db']], HC


def local_sigs(loc):
    out = {}
    for r in loc.aggregate([{'$group': {'_id': '$d', 'n': {'$sum': 1}, 'tw': {'$sum': '$tw'},
                                        'lk': {'$sum': '$lk'}, 'vw': {'$sum': '$vw'}, 'rt': {'$sum': '$rt'}}}]):
        if r['_id']:
            out[r['_id']] = '%d|%d|%d|%d|%d' % (r['n'], r['tw'], r['lk'], r['vw'], r['rt'])
    return out


def compact(x):
    s = x.get('s') or {}
    return {'h': x.get('h', ''), 'd': x.get('d', ''), 'st': x.get('st', ''), 'pt': x.get('pt', ''),
            'cat': x.get('cat', ''), 'tw': int(x.get('tw') or 0), 'lk': int(x.get('lk') or 0),
            'vw': int(x.get('vw') or 0), 'rt': int(x.get('rt') or 0), 's': [int(s.get(k) or 0) for k in SENT]}


def handles_dir(loc):
    """Har handle ki sabse naye din wali 'last' jaankari (naam, party, pad, rajya, followers)."""
    out = []
    pipe = [{'$match': {'d': {'$ne': '_nodate'}}}, {'$sort': {'h': 1, 'd': 1}},
            {'$group': {'_id': '$h', 'last': {'$last': '$last'}, 'cat': {'$last': '$cat'}, 'd': {'$last': '$d'},
                        'tw': {'$sum': '$tw'}}}]
    for r in loc.aggregate(pipe, allowDiskUse=True):
        l = r.get('last') or {}
        out.append({'_id': r['_id'], 'name': l.get('name', ''), 'party': l.get('party', ''), 'desig': l.get('desig', ''),
                    'state': l.get('state', ''), 'pc': l.get('pc', ''), 'ac': l.get('ac', ''), 'cat': r.get('cat', ''),
                    'fw': int(l.get('fw') or 0), 'fg': int(l.get('fg') or 0), 'last_day': r.get('d', ''),
                    'tweets_all': int(r.get('tw') or 0)})
    return out


def push(force=False, db_name=None, log=print):
    from pymongo import ReplaceOne
    hot, HC = _hot(db_name)
    if hot is None:
        log('  NAZAR: HOT band hai -- kuch nahi kiya'); return 0
    loc = _local()
    t0 = datetime.datetime.now()
    local = local_sigs(loc)
    dm = hot[C_META].find_one({'_id': 'days'}) or {}
    remote = dm.get('sig') or {}
    changed = [d for d in sorted(local) if force or remote.get(d) != local[d]]
    gone = [d for d in remote if d not in local]
    proj = {k: 1 for k in ('h', 'd', 'st', 'pt', 'cat', 'tw', 'lk', 'vw', 'rt', 's')}
    sent = 0
    for i, d in enumerate(changed):
        docs = [compact(x) for x in loc.find({'d': d}, proj)]
        hot[C_DAILY].delete_many({'d': d})
        for j in range(0, len(docs), 2000):
            hot[C_DAILY].insert_many(docs[j:j + 2000], ordered=False)
        got = hot[C_DAILY].count_documents({'d': d})
        if got != len(docs):
            raise RuntimeError('%s: %d bheje, %d pahunche' % (d, len(docs), got))
        remote[d] = local[d]; sent += len(docs)
        if i % 10 == 9:   # beech me ruk jaaye to agla run wahin se
            hot[C_META].replace_one({'_id': 'days'}, {'_id': 'days', 'sig': remote}, upsert=True)
    for d in gone:
        hot[C_DAILY].delete_many({'d': d}); remote.pop(d, None)
    hot[C_META].replace_one({'_id': 'days'}, {'_id': 'days', 'sig': remote}, upsert=True)

    hcount = None
    if changed or force or not hot[C_HANDLES].estimated_document_count():
        hs = handles_dir(loc)
        for j in range(0, len(hs), 1000):
            hot[C_HANDLES].bulk_write([ReplaceOne({'_id': x['_id']}, x, upsert=True) for x in hs[j:j + 1000]], ordered=False)
        keep = set(x['_id'] for x in hs)
        stale = [x['_id'] for x in hot[C_HANDLES].find({}, {'_id': 1}) if x['_id'] not in keep]
        if stale:
            hot[C_HANDLES].delete_many({'_id': {'$in': stale}})
        hcount = len(hs)

    for keys in ([('d', 1)], [('h', 1), ('d', 1)], [('pt', 1), ('d', 1)], [('st', 1), ('d', 1)], [('cat', 1), ('d', 1)]):
        hot[C_DAILY].create_index(keys)
    days = sorted(local)
    days_real = [d for d in days if d != '_nodate']
    hot[C_META].replace_one({'_id': 'info'}, {
        '_id': 'info', 'schema': SCHEMA, 'timezone': 'Asia/Kolkata',
        'window_start': HC.window_cutoff(), 'hot_days': HC.effective_days(),
        'first_day': days_real[0] if days_real else '', 'last_day': days_real[-1] if days_real else '',
        'days': len(days_real), 'daily_docs': hot[C_DAILY].estimated_document_count(),
        'handles': hot[C_HANDLES].estimated_document_count(),
        'updated_at': datetime.datetime.now(datetime.timezone.utc),
        'sentiment_order': list(SENT),
        'note': 'd < window_start -> nazar_daily ; d >= window_start -> pulse_hot.tweets (raw)'}, upsert=True)
    log('  NAZAR: %d din bheje (%d rows)%s, window %s, %.0f s' % (
        len(changed), sent, (', handles %d' % hcount) if hcount is not None else '', HC.window_cutoff(),
        (datetime.datetime.now() - t0).total_seconds()))
    return len(changed)


def check(db_name=None, log=print):
    hot, HC = _hot(db_name)
    if hot is None:
        log('HOT band'); return 1
    local = local_sigs(_local())
    remote = {}
    for r in hot[C_DAILY].aggregate([{'$group': {'_id': '$d', 'n': {'$sum': 1}, 'tw': {'$sum': '$tw'},
                                                 'lk': {'$sum': '$lk'}, 'vw': {'$sum': '$vw'}, 'rt': {'$sum': '$rt'}}}]):
        remote[r['_id']] = '%d|%d|%d|%d|%d' % (r['n'], r['tw'], r['lk'], r['vw'], r['rt'])
    bad = [d for d in sorted(set(local) | set(remote)) if local.get(d) != remote.get(d)]
    tot = lambda m, i: sum(int(v.split('|')[i]) for v in m.values())
    log('check: %d din local, %d din Atlas, %d din alag | tweets local %d / Atlas %d | views local %d / Atlas %d' % (
        len(local), len(remote), len(bad), tot(local, 1), tot(remote, 1), tot(local, 3), tot(remote, 3)))
    for d in bad[:10]:
        log('   %s local %s  atlas %s' % (d, local.get(d), remote.get(d)))
    st = hot.command('dbStats')
    log('Atlas %s size %.1f MB' % (hot.name, st['dataSize'] / 1e6))
    return 0 if not bad else 2


if __name__ == '__main__':
    a = sys.argv[1:]
    db = a[a.index('--db') + 1] if '--db' in a else None
    if '--check' in a:
        sys.exit(check(db))
    if not db and not nazar_enabled() and '--force' not in a:
        print('nazar.enabled = false (db_config.local.json) -- kuch nahi kiya'); sys.exit(0)
    push(force='--force' in a, db_name=db)
