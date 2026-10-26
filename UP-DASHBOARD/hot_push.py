# -*- coding: utf-8 -*-
"""
hot_push.py  --  hot/cold plan, Phase 4.2: copy the built dashboard collections to Atlas.

Two slots per collection so readers never see a half-written set:
    pulse_hot.<scopeDB>__dashboard_data__a / __b   (same for phd, handles)
    pulse_hot.<scopeDB>__meta  {_id:'current', slot, at, lastUpdate}
New data goes into the INACTIVE slot, is counted, then 'current' flips to it.
renameCollection is not needed (not guaranteed on the free tier).
push_all_scopes stamps 'lastUpdate' after BOTH dashboards are built, exactly like
the local meta; server.js uses the Atlas copy only when its lastUpdate equals the local one.
Any error -> 'HOT SYNC FAIL' in the log; local dashboards are never affected.
This file is identical in DASHBOARD/ and UP-DASHBOARD/.
"""
import os, datetime

COLLS = ('dashboard_data', 'phd', 'handles')
FLAG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'DASHBOARD', '.hot_resync')


def _db():
    import hot_conf as HC
    if not HC.HOT['enabled']:
        return None
    return HC.hot_client(8000)[HC.HOT['db']]


def push(scope_db, data, log=print):
    """data = {'dashboard_data': [...], 'phd': [...], 'handles': [...]}"""
    try:
        db = _db()
        if db is None:
            return False
        meta = db[scope_db + '__meta']
        cur = meta.find_one({'_id': 'current'}) or {}
        slot = 'b' if cur.get('slot') == 'a' else 'a'
        for name in COLLS:
            docs = data.get(name) or []
            c = db['%s__%s__%s' % (scope_db, name, slot)]
            c.drop()
            for i in range(0, len(docs), 1000):
                c.insert_many([dict(d) for d in docs[i:i + 1000]], ordered=False)
            got = c.count_documents({})
            if got != len(docs):
                raise RuntimeError('%s: %d sent, %d arrived' % (name, len(docs), got))
        now = datetime.datetime.now(datetime.timezone.utc)
        # lastUpdate stays empty until push_all_scopes stamps it (both scopes done)
        meta.replace_one({'_id': 'current'}, {'_id': 'current', 'slot': slot, 'at': now, 'lastUpdate': ''},
                         upsert=True)
        log("  HOT dashboards: %s -> Atlas slot %s (%s)" % (scope_db, slot, ', '.join(
            '%s=%d' % (n, len(data.get(n) or [])) for n in COLLS)))
        return True
    except Exception as e:
        log("  HOT SYNC FAIL (dashboards %s): %s -- local dashboard theek hai" % (scope_db, str(e)[:200]))
        try:
            open(FLAG, 'w').write(datetime.datetime.now().isoformat())
        except Exception:
            pass
        return False


def stamp(scope_db, value, since, log=print):
    """After both scopes are built: give the Atlas copy the same lastUpdate as local meta,
    but only if it was pushed in this run (at >= since)."""
    try:
        db = _db()
        if db is None:
            return False
        r = db[scope_db + '__meta'].update_one({'_id': 'current', 'at': {'$gte': since}},
                                               {'$set': {'lastUpdate': value}})
        if not r.matched_count:
            log("  HOT stamp skip (%s): is run me Atlas push nahi hua" % scope_db)
        return bool(r.matched_count)
    except Exception as e:
        log("  HOT SYNC FAIL (stamp %s): %s" % (scope_db, str(e)[:200]))
        return False
