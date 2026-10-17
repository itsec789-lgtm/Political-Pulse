# -*- coding: utf-8 -*-
"""
CHECK_SENTIMENT.py  --  MongoDB me Sentiment column me ASLI me kya-kya values hain,
                        aur teeno scope (All India / Uttar Pradesh / Punjab) me
                        har value kitni baar aayi hai.

Kuch badalta NAHI hai -- sirf padh kar ginti dikhata hai.

Chalane ka tarika (project root me):
    python CHECK_SENTIMENT.py

Output ke ant me ek JSON block aata hai -- wahi copy karke bhej dena.
"""
import os, sys, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
for p in (HERE, os.path.join(HERE, 'DASHBOARD')):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from mongo_conf import MONGO_URL
except Exception:
    MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')

from pymongo import MongoClient

SENT_KEYS = ['Sentiment', 'sentiment', 'sentimentlabel', 'Sentiment Label', 'sn']
STATE_KEYS = ['State', 'state', 'st']
CAT_KEYS = ['Category', 'category']


def pick(doc, keys):
    for k in keys:
        if k in doc:
            return k
    return None


def norm(v):
    s = str(v if v is not None else '').strip()
    return s if s else '(blank)'


def main():
    print('MongoDB :', MONGO_URL.split('@')[-1])
    cl = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)

    col = cl['pulse_master']['master_tweets']
    total = col.estimated_document_count()
    print('Collection: pulse_master.master_tweets   (~%s docs)\n' % f'{total:,}')

    sample = col.find_one()
    if not sample:
        print('!! collection khaali hai.')
        return
    SK = pick(sample, SENT_KEYS)
    STK = pick(sample, STATE_KEYS)
    CK = pick(sample, CAT_KEYS)
    print('Sentiment column ka naam :', SK)
    print('State column ka naam     :', STK)
    print('Category column ka naam  :', CK)
    print()

    if not SK:
        print('!! koi Sentiment column mila hi nahi. Ek poora document:')
        print(json.dumps({k: str(v)[:40] for k, v in sample.items()}, indent=2, ensure_ascii=False))
        return

    # ---- poora scan (aggregate, server-side -- tez hai) ----
    res = {'ALL': collections.Counter(), 'UP': collections.Counter(), 'PUNJAB': collections.Counter()}
    exact = collections.Counter()          # bilkul jaisa likha hai (case/space samet)
    states = collections.Counter()

    pipeline = [{'$group': {'_id': {'s': '$' + SK, 'st': ('$' + STK) if STK else None},
                            'n': {'$sum': 1}}}]
    for r in col.aggregate(pipeline, allowDiskUse=True):
        s_raw = r['_id'].get('s')
        st = norm(r['_id'].get('st'))
        n = r['n']
        exact[norm(s_raw)] += n
        key = norm(s_raw)
        res['ALL'][key] += n
        states[st] += n
        if st.lower() in ('uttar pradesh', 'up'):
            res['UP'][key] += n
        if st.lower() in ('punjab', 'pb'):
            res['PUNJAB'][key] += n

    def show(title, c):
        print('-' * 62)
        print(title, ' -- total %s' % f'{sum(c.values()):,}')
        for k, n in sorted(c.items(), key=lambda x: -x[1]):
            print('   %-22s %12s' % (k, f'{n:,}'))

    show('ALL INDIA (poora master)', res['ALL'])
    show('UTTAR PRADESH', res['UP'])
    show('PUNJAB', res['PUNJAB'])

    print('-' * 62)
    print('State column me top 15 values:')
    for k, n in sorted(states.items(), key=lambda x: -x[1])[:15]:
        print('   %-22s %12s' % (k, f'{n:,}'))

    out = {'sentiment_column': SK, 'state_column': STK, 'category_column': CK,
           'all': dict(res['ALL']), 'up': dict(res['UP']), 'punjab': dict(res['PUNJAB']),
           'states_top': dict(sorted(states.items(), key=lambda x: -x[1])[:15])}
    print('\n' + '=' * 62)
    print('YE POORA BLOCK COPY KARKE BHEJ DENA:')
    print('=' * 62)
    print('<<<SENT_JSON')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('SENT_JSON>>>')

    fn = os.path.join(HERE, 'sentiment_check.json')
    with open(fn, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\n(ye file bhi ban gayi: %s -- ise bhej doge to bhi chalega)' % fn)


if __name__ == '__main__':
    main()
