# -*- coding: utf-8 -*-
"""
summary_agg.py  --  hot/cold plan, Phase 4: build source "SPLIT".

read_csv_agg("SPLIT") in update_dashboard.py (All-India and UP copies) comes here:
  * days BEFORE the hot-window cutoff  -> pulse_master.daily_summary (small per-day rows)
  * days FROM the cutoff               -> raw tweets, read by the module's OWN read_csv_agg
                                          with a {'Tweet Date': {'$gte': cutoff}} filter
and returns exactly the same 11 accumulators read_csv_agg returns, so build() is unchanged.

Any summary day still marked dirty is rebuilt first (build_daily_summary), so a stale
summary is never used. If anything here fails the caller can fall back to "MONGO".

Settings (db_config.local.json -> "build", env overrides):
  source  : PULSE_BUILD_SRC     "MONGO" (default, today's behaviour) | "SPLIT"
  summary : PULSE_SUMMARY_COLL  "daily_summary"
  days    : PULSE_HOT_DAYS      raw window (default hot.days = 7)
This file is identical in DASHBOARD/ and UP-DASHBOARD/.
"""
import os, sys, json, collections

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


def build_conf():
    b = {"source": "MONGO", "summary": "daily_summary"}
    p = _find(LOCAL_NAME)
    if p:
        try:
            b.update((json.load(open(p, encoding="utf-8")) or {}).get("build") or {})
        except Exception:
            pass
    if (os.environ.get("PULSE_BUILD_SRC") or "").strip():
        b["source"] = os.environ["PULSE_BUILD_SRC"].strip()
    if (os.environ.get("PULSE_SUMMARY_COLL") or "").strip():
        b["summary"] = os.environ["PULSE_SUMMARY_COLL"].strip()
    b["source"] = str(b.get("source") or "MONGO").upper()
    return b


def split_agg(M, log=print):
    """M = the calling update_dashboard module (All-India or UP)."""
    from pymongo import MongoClient
    from mongo_conf import MONGO_URL
    import hot_conf
    conf = build_conf()
    cutoff = hot_conf.window_cutoff()
    scope_up = bool(getattr(M, 'SCOPE_STATE', None))
    excl = getattr(M, 'EXCLUDE_CAT', None) if not scope_up else None
    cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=6000)
    db = cli['pulse_master']
    summ = db[conf['summary']]
    dirty_name = 'summary_dirty' if conf['summary'] == 'daily_summary' else conf['summary'] + '_dirty'
    words_name = 'daily_words' if conf['summary'] == 'daily_summary' else conf['summary'].replace('daily_summary', 'daily_words')

    # ---- 0. summary must exist and be clean for the old days ----
    if summ.estimated_document_count() == 0:
        raise RuntimeError("summary %s is empty -- run build_daily_summary.py --all first" % conf['summary'])
    dirty = sorted(d['_id'] for d in db[dirty_name].find({}, {'_id': 1}))
    if 'ALL' in dirty:
        raise RuntimeError("summary marked ALL dirty -- run build_daily_summary --dirty first")
    old_dirty = [d for d in dirty if d < cutoff]
    if old_dirty:                                   # changed since the last refresh: rebuild inline
        import datetime as _dt
        import importlib.util as _ilu
        _bp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'DASHBOARD', 'build_daily_summary.py')
        _sp = _ilu.spec_from_file_location('bds_for_split', os.path.normpath(_bp))
        B = _ilu.module_from_spec(_sp); _sp.loader.exec_module(B)
        t0 = _dt.datetime.now(_dt.timezone.utc)
        for d in old_dirty:
            docs, wdocs, _n = B.summarize_day(db['master_tweets'], d)
            B.write_day(db, conf['summary'], words_name, d, docs, wdocs)
        db[dirty_name].delete_many({'_id': {'$in': old_dirty}, 'at': {'$lte': t0}})
        log("  SPLIT: %d dirty summary day(s) rebuilt inline: %s" % (len(old_dirty), ', '.join(old_dirty[:5])))

    # ---- 1. raw part: the module's own code on the last N days ----
    (acc, meta, daily, dates, htag, htag_party, hourly, htag_daily, htag_party_daily, words, sdaily
     ) = M.read_csv_agg('MONGO', query={'Tweet Date': {'$gte': cutoff}})
    dates = set(dates)

    # ---- 2. summary part: everything before the cutoff ----
    q = {'d': {'$lt': cutoff}}
    if scope_up:
        q['st'] = M.SCOPE_STATE
    CODES = M.SENT_CODES
    cand = []                                       # meta candidates (latest row per summary doc)
    n = 0
    for g in summ.find(q, {'built': 0}).batch_size(5000):
        if excl is not None and g['cat'].lower() in excl:
            continue
        n += 1
        h, d = g['h'], g['d']
        if h:
            a = acc.get(h)
            if a is None:
                a = acc[h] = dict({'tw': 0, 'lk': 0, 'rt': 0, 'vw': 0}, **M.sent_blank())
            # rt-split (27-Oct): summary tw/lk/rt/vw = all rows; own posts = minus the "RT @" part
            _rc, _rl, _rv, _rr = g.get('rc', 0), g.get('rl', 0), g.get('rv', 0), g.get('rr', 0)
            a['tw'] += g['tw'] - _rc; a['lk'] += g['lk'] - _rl; a['rt'] += g['rt'] - _rr; a['vw'] += g['vw'] - _rv
            a['rc'] = a.get('rc', 0) + _rc
            for c in CODES:
                a[c] += g['s'][c]
            _rs = g.get('rs')                               # rt-sent: retweets ka sentiment
            if _rs and hasattr(M, 'RS_ACC'):
                for c in CODES:
                    if _rs.get(c):
                        M.RS_ACC[h][c] += _rs[c]
                        if len(d) == 10:
                            M.RS_DAILY[(g['st'] or M.DASH, d, c)] += _rs[c]
            if len(d) == 10:
                dates.add(d)
                e = daily[(h, d)]
                e[0] += g['tw'] - _rc; e[1] += g['vw'] - _rv; e[2] += g['lk'] - _rl; e[3] += g['rt'] - _rr
                if _rc and hasattr(M, 'RC_DAILY'):
                    M.RC_DAILY[(h, d)] += _rc
                if _rc and hasattr(M, 'RL_DAILY'):          # tw-rt-split
                    M.RL_DAILY[(h, d)] += int(_rl); M.RV_DAILY[(h, d)] += int(_rv)
            if g.get('last'):
                cand.append((g['last']['dt'], h, g['last']))
        for tag, e in (g.get('ht') or {}).items():
            t = htag[tag]; t['c'] += e[0]; t['lk'] += e[1]; t['vw'] += e[2]
            for i, c in enumerate(CODES):
                t[c] += e[3 + i]
            htag_daily[tag][d] += e[0]
            if g['pt']:
                tp = htag_party[g['pt']][tag]; tp['c'] += e[0]; tp['lk'] += e[1]; tp['vw'] += e[2]
                for i, c in enumerate(CODES):
                    tp[c] += e[3 + i]
                htag_party_daily[(g['pt'], tag)][d] += e[0]
        if len(d) == 10:
            for c in CODES:
                if g['s'][c]:
                    sdaily[(g['st'] or M.DASH, d, c)] += g['s'][c]
        for i, x in enumerate(g.get('hr') or []):
            hourly[i] += x

    # meta: same update rules as read_csv_agg (latest row wins; followers from latest non-zero)
    for dt, h, row in sorted(cand, key=lambda x: x[0]):
        m = meta.get(h)
        if m is None:
            m = meta[h] = {'name': h, 'party': '', 'levelCSV': 'Others', 'state': M.DASH,
                           'followers': 0, 'followings': 0, 'pcName': '', '_dt': '', '_fdt': ''}
        if dt >= m.get('_dt', ''):
            m['_dt'] = dt
            m['name'] = (M.from_master(h, 'name') or str(row['name']).strip() or h)
            m['party'] = (M.from_master(h, 'party') or row['party'])
            m['levelCSV'] = M.lvl_from_desig(M.from_master(h, 'designation_raw') or row['desig'])
            m['state'] = (M.from_master(h, 'state') or M._first(row['state']) or M.DASH)
            m['pcName'] = (M.from_master(h, 'pc_name', 'ac_name') or M._first(row['pc'], row['ac']))
        fw, fg = int(row.get('fw') or 0), int(row.get('fg') or 0)
        if fw and dt >= m.get('_fdt', ''):
            m['_fdt'] = dt; m['followers'] = fw; m['followings'] = fg

    # word cloud: per-day top words of the old days
    for w in db[words_name].find({'scope': 'up' if scope_up else 'all', 'd': {'$lt': cutoff}}, {'w': 1}):
        words.update(w['w'])
    cli.close()
    log("  SPLIT: summary docs=%d (before %s) + raw tweets from %s" % (n, cutoff, cutoff))
    return acc, meta, daily, sorted(dates), htag, htag_party, hourly, htag_daily, htag_party_daily, words, sdaily
