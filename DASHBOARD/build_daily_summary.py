# -*- coding: utf-8 -*-
"""
build_daily_summary.py  --  hot/cold plan, Phase 2: per-day summary of master_tweets.

One doc per (handle, day, row State, row Party, row Category) with everything the
dashboard builds (update_dashboard.py, All-India + UP) need -- see docs/summary_design.md.
Plus one word-count doc per (scope, day) for the Word Cloud.

Reads pulse_master.master_tweets (read-only), day by day via the 'Tweet Date' index,
so memory stays small (one day at a time). Writes ONLY the summary collections.

    python build_daily_summary.py --days 2026-10-20,2026-10-21   [--coll daily_summary_test]
    python build_daily_summary.py --all                          (every day, one by one)
    python build_daily_summary.py --dirty                        (days in pulse_master.summary_dirty)
    python build_daily_summary.py --check [--days ...]           (compare summary vs cold, no writes)

Default target: daily_summary_test / daily_words_test (plan safety rule 3).
Live names (daily_summary / daily_words) only with --live.
"""
import os, sys, re, json, time, hashlib, datetime, collections
from pymongo import MongoClient, InsertOne
import update_dashboard as U          # same sent_code / regexes / stopwords as the dashboard build
from mongo_conf import MONGO_URL

DB, SRC = "pulse_master", "master_tweets"
SCOPES = ("all", "up")               # word-cloud scopes
UP_STATE = "Uttar Pradesh"
WORDS_PER_DAY = 2000
TAG_RE = re.compile(r'#[\wऀ-ॣ०-ॿ]+')   # exactly as read_csv_agg
NEED = sorted(set(U.C.values()))
PROJ = dict({k: 1 for k in NEED}, _id=0)
C = U.C
CODES = U.SENT_CODES


def S(v):
    """value -> str the way src_chunks/pandas would give it ('' for missing)."""
    if v is None:
        return ''
    if isinstance(v, float):
        if v != v:
            return ''
        return repr(v) if not v.is_integer() else ('%.1f' % v)
    return str(v)


def num(v):
    """pd.to_numeric(str.replace(',', ''), errors='coerce').fillna(0)"""
    s = S(v).replace(',', '').strip()
    if not s:
        return 0.0
    try:
        f = float(s)
        return f if f == f and f not in (float('inf'), float('-inf')) else 0.0
    except ValueError:
        return 0.0


def doc_id(h, d, st, pt, cat):
    return hashlib.md5(('%s\x1f%s\x1f%s\x1f%s\x1f%s' % (h, d, st, pt, cat)).encode('utf-8')).hexdigest()


def summarize_day(coll, day):
    """Read one day (Tweet Date starts with `day`) and return (summary docs, word docs, n tweets)."""
    q = {C['date']: {'$gte': day, '$lt': day + '~'}}
    groups = {}
    words = {sc: collections.Counter() for sc in SCOPES}
    n = 0
    for r in coll.find(q, PROJ).batch_size(5000):
        n += 1
        h = S(r.get(C['handle'])).strip()
        st = S(r.get(C['state'])).strip()
        pt = S(r.get(C['party'])).strip()
        cat = S(r.get(C['cat'])).strip()
        date = S(r.get(C['date']))
        d = date[:10]
        key = (h, d, st, pt, cat)
        g = groups.get(key)
        if g is None:
            g = groups[key] = {'_id': doc_id(*key), 'h': h, 'd': d, 'st': st, 'pt': pt, 'cat': cat,
                               'tw': 0, 'lk': 0.0, 'rt': 0.0, 'vw': 0.0,
                               's': {c: 0 for c in CODES}, 'hr': [0] * 24, 'ht': {}, 'last': None}
        lk, rt, vw = num(r.get(C['likes'])), num(r.get(C['rts'])), num(r.get(C['views']))
        sc = U.sent_code(S(r.get(C['sent'])))
        g['tw'] += 1; g['lk'] += lk; g['rt'] += rt; g['vw'] += vw
        g['s'][sc] += 1
        try:
            hr = int(date[11:13])
            if 0 <= hr < 24:
                g['hr'][hr] += 1
        except ValueError:
            pass
        dt = date[:19]
        if g['last'] is None or dt > g['last']['dt']:      # first max wins, like idxmax
            g['last'] = {'dt': dt, 'name': S(r.get(C['name'])), 'party': S(r.get(C['party'])),
                         'desig': S(r.get(C['desig'])), 'state': S(r.get(C['state'])),
                         'pc': S(r.get(C['pc'])), 'ac': S(r.get(C['ac'])),
                         'fw': int(num(r.get(C['followers']))), 'fg': int(num(r.get(C['followings'])))}
        txt = S(r.get(C['text']))
        # word cloud (same steps as read_csv_agg)
        if txt:
            t2 = U._TAG_RE.sub(' ', U._MENTION_RE.sub(' ', U._URL_RE.sub(' ', txt)))
            ws = [w for w in U._WORD_RE.findall(t2.lower())
                  if len(w) >= 3 and w not in U.STOPWORDS and not w.isdigit()]
            if ws:
                if cat.lower() not in U.EXCLUDE_CAT:
                    words['all'].update(ws)
                if st == UP_STATE:
                    words['up'].update(ws)
        tags = set(TAG_RE.findall(txt.lower()))
        if tags:
            ilk, ivw, ci = int(lk), int(vw), CODES.index(sc)
            for tag in tags:
                e = g['ht'].get(tag)
                if e is None:
                    e = g['ht'][tag] = [0, 0, 0] + [0] * len(CODES)
                e[0] += 1; e[1] += ilk; e[2] += ivw; e[3 + ci] += 1
    docs = []
    for g in groups.values():
        g['lk'], g['rt'], g['vw'] = int(g['lk']), int(g['rt']), int(g['vw'])
        if not any(g['hr']):
            del g['hr']
        if not g['ht']:
            del g['ht']
        g['built'] = datetime.datetime.now(datetime.timezone.utc)
        docs.append(g)
    wdocs = [{'_id': '%s|%s' % (sc, day), 'scope': sc, 'd': day,
              'w': dict(words[sc].most_common(WORDS_PER_DAY)), 'distinct': len(words[sc]),
              'built': datetime.datetime.now(datetime.timezone.utc)} for sc in SCOPES]
    return docs, wdocs, n


def write_day(db, coll_name, words_name, day, docs, wdocs):
    """Replace one day inside the SUMMARY collections only."""
    sc = db[coll_name]
    sc.delete_many({'d': day})
    for i in range(0, len(docs), 5000):
        sc.insert_many(docs[i:i + 5000], ordered=False)
    db[words_name].delete_many({'d': day})
    db[words_name].insert_many(wdocs, ordered=False)


def all_days(coll):
    lo = coll.find({C['date']: {'$gt': ''}}, {C['date']: 1, '_id': 0}).sort(C['date'], 1).limit(1)
    hi = coll.find({C['date']: {'$gt': ''}}, {C['date']: 1, '_id': 0}).sort(C['date'], -1).limit(1)
    lo = list(lo); hi = list(hi)
    if not lo:
        return []
    d0 = datetime.date.fromisoformat(S(lo[0][C['date']])[:10])
    d1 = datetime.date.fromisoformat(S(hi[0][C['date']])[:10])
    out = []
    while d0 <= d1:
        out.append(d0.isoformat()); d0 += datetime.timedelta(days=1)
    return out


def check_days(db, coll_name, days):
    """Per day: cold aggregate (count, likes, RTs, views) vs summary sums. No writes."""
    src = db[SRC]
    bad = 0
    tot = collections.Counter()
    for day in days:
        cold = list(src.aggregate([
            {'$match': {C['date']: {'$gte': day, '$lt': day + '~'}}},
            {'$group': {'_id': None, 'tw': {'$sum': 1}}}]))
        ctw = cold[0]['tw'] if cold else 0
        s = list(db[coll_name].aggregate([{'$match': {'d': day}},
                 {'$group': {'_id': None, 'tw': {'$sum': '$tw'}, 'lk': {'$sum': '$lk'},
                             'rt': {'$sum': '$rt'}, 'vw': {'$sum': '$vw'}, 'docs': {'$sum': 1}}}]))
        stw = s[0]['tw'] if s else 0
        tot['cold'] += ctw; tot['summary'] += stw
        flag = '' if ctw == stw else '   <-- MISMATCH'
        if flag: bad += 1
        if flag or len(days) <= 15:
            print('  %s  cold=%7d  summary=%7d  docs=%6d%s' % (day, ctw, stw, s[0]['docs'] if s else 0, flag))
    print('CHECK: %d days, %d mismatching; tweets cold=%d summary=%d'
          % (len(days), bad, tot['cold'], tot['summary']))
    return bad


def main():
    a = sys.argv[1:]
    live = '--live' in a
    coll_name = 'daily_summary' if live else 'daily_summary_test'
    words_name = 'daily_words' if live else 'daily_words_test'
    if '--coll' in a:
        coll_name = a[a.index('--coll') + 1]
    cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=6000)
    db = cli[DB]
    src = db[SRC]
    if '--days' in a:
        days = [x.strip() for x in a[a.index('--days') + 1].split(',') if x.strip()]
    elif '--all' in a:
        days = all_days(src)
    elif '--dirty' in a:
        days = sorted(d['_id'] for d in db['summary_dirty' if live else 'summary_dirty_test'].find({}, {'_id': 1}))
    elif '--check' in a:
        days = all_days(src)
    else:
        print(__doc__); return 2
    if '--check' in a:
        return 1 if check_days(db, coll_name, days) else 0
    print('target: %s.%s / %s   days: %d' % (DB, coll_name, words_name, len(days)))
    db[coll_name].create_index('d'); db[coll_name].create_index('h')
    t0 = time.time(); total = 0
    for i, day in enumerate(days, 1):
        t = time.time()
        docs, wdocs, n = summarize_day(src, day)
        write_day(db, coll_name, words_name, day, docs, wdocs)
        total += n
        if len(days) <= 15 or i % 10 == 0 or i == len(days):
            print('  [%d/%d] %s  tweets=%d  summary docs=%d  %.1fs' % (i, len(days), day, n, len(docs), time.time() - t))
    if '--dirty' in a:
        dc = db['summary_dirty' if live else 'summary_dirty_test']
        dc.delete_many({'_id': {'$in': days}})
    print('DONE: %d tweets in %.1f s' % (total, time.time() - t0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
