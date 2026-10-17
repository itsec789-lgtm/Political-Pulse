# -*- coding: utf-8 -*-
"""
build_punjab_data.py - prepares the Punjab data and loads it into MongoDB.

  SOURCE  : pulse_master.master_tweets   (the all-India master pool)
            or any master CSV via --csv <path>
  TARGET  : political_lens.tweets        (Punjab tweets only, de-duplicated)
            political_lens.aggregates    (ready-made blocks for the dashboard)
            political_lens.meta          (timestamp of the last build)

The dashboard (server.js) only ever reads political_lens - it never touches
the master pool. So new data shows up on the dashboard only after this
script has run.

Usage:
    python build_punjab_data.py --scan                 # what is in Mongo? (run this first if you get 0)
    python build_punjab_data.py --push                 # Mongo to Mongo
    python build_punjab_data.py --csv master.csv --push
    python build_punjab_data.py --count                # counts only

Requires: pip install pymongo    (for CSV mode: pip install pandas)
"""

import argparse
import datetime
import json
import math
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(HERE, 'config.json')

DEFAULT_CFG = {
    "mongoUrl": __import__("mongo_conf").MONGO_URL,   # <- central: db_config.json
    "sourceDb": "pulse_master",
    "sourceCollection": "master_tweets",
    "targetDb": "political_lens",
    "state": "Punjab",
    "port": 3000,
}


def cfg():
    c = dict(DEFAULT_CFG)
    try:
        with open(CFG_PATH, encoding='utf-8') as f:
            c.update(json.load(f))
    except Exception:
        pass
    # config.json me mongoUrl khaali ho to central wala hi chalega
    if not str(c.get("mongoUrl") or "").strip():
        c["mongoUrl"] = __import__("mongo_conf").MONGO_URL
    return c


C = cfg()

# Punjab can appear under several spellings in the master pool. Catch them
# all, otherwise half the data is silently dropped and nobody notices.
STATE_MATCH = re.compile(r'^\s*(punjab|pb)\s*$', re.I)

# ------------------------------------------------------------------ helpers --

def num(v):
    if v is None or v == '':
        return 0
    if isinstance(v, (int, float)):
        try:
            return int(v)
        except Exception:
            return 0
    try:
        return int(float(str(v).replace(',', '').strip()))
    except Exception:
        return 0


def txt(v):
    return '' if v is None else str(v).strip()


BAD_PC = {'', '-', 'unknown', 'n/a', 'na', 'none', 'null', 'nan'}


def clean_pc(v):
    s = txt(v)
    return '' if s.lower() in BAD_PC else s


# Normalise party names - otherwise one party is split across two rows and
# even "how many parties are there" comes out wrong.
PARTY_ALIAS = {
    'AAM AADMI PARTY': 'AAP',
    'INDIAN NATIONAL CONGRESS': 'INC', 'CONGRESS': 'INC',
    'SHIROMANI AKALI DAL': 'SAD', 'AKALI DAL': 'SAD',
    'SAD (B)': 'SAD', 'SAD(B)': 'SAD', 'SHIROMANI AKALI DAL (BADAL)': 'SAD',
    'SHIROMANI AKALI DAL (AMRITSAR)': 'SAD(A)', 'SAD (A)': 'SAD(A)', 'SAD(A)': 'SAD(A)',
    'BHARATIYA JANATA PARTY': 'BJP',
    'BAHUJAN SAMAJ PARTY': 'BSP',
    'PUNJAB LOK CONGRESS': 'PLC',
    'SANYUKT SAMAJ MORCHA': 'SSM',
    'COMMUNIST PARTY OF INDIA': 'CPI',
    'COMMUNIST PARTY OF INDIA (MARXIST)': 'CPM', 'CPI(M)': 'CPM', 'CPI (M)': 'CPM',
    'INDEPENDENT': 'IND',
}


def clean_party(v):
    s = txt(v)
    return PARTY_ALIAS.get(s.upper(), s)


def clean_desig(v):
    s = txt(v)
    u = s.upper()
    if u == 'MLA':
        return 'MLA'
    if u == 'MLC':
        return 'MLC'
    if u.startswith('LS_MP'):
        return 'LS_MP'
    if u.startswith('RS_MP'):
        return 'RS_MP'
    return s


def sent_label(v):
    """Sentiment ki ASLI category lauta do (8 me se ek).

    PEHLE ye sirf Positive / Negative / Neutral lautata tha -- aur yahi value
    Mongo (political_lens.tweets ka 'sn') me likhi jaati thi. Iska matlab
    Pro-BJP / Anti-BJP / Pro-Govt / Anti-Govt tweets DB me hi Neutral ban kar
    chale jaate the, isliye Punjab dashboard par wo kabhi dikh hi nahi sakte the.
    """
    return SENT8_LABEL[_scode(v)]


def fdate(v):
    if v is None:
        return ''
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d %H:%M:%S')
    s = str(v)
    return s[:19] if len(s) >= 19 else s


TAG_RE = re.compile(r'#[\wऀ-ॿ਀-੿]+')
URL_RE = re.compile(r'https?://\S+')
WORD_RE = re.compile(r'[^a-z0-9ऀ-ॿ਀-੿]+')
ID_RE = re.compile(r'/status(?:es)?/(\d+)')

STOP = set((
    'the a an and or of to in on for is are was were be been with at by from this '
    'that these those it its as we you they he she his her our your their i me my not no will '
    'would can could should has have had do does did but if so than then there here what which '
    'who when where why how all any both each few more most other some such only own same very '
    'just also into over under again further once about against between during before after '
    'above below up down out off too don now am pe ka ki ke ko se me mein hai hain ho ye yeh wo '
    'woh aur par bhi tha the na nahi kar karo kiya raha rahe https http com www amp rt '
    'de da di nu vich naal ate ji sri '
    'में है हैं था थे थी और एवं के का की को से पर यह वह ये वे हम आप उन इस उस लिए किया करने कर '
    'साथ भी नहीं तो ही जो कि तक बाद पहले सभी अपने अपनी हुए हुई गया गई रहे रही जी श्री द्वारा '
    'ਦੇ ਦਾ ਦੀ ਨੂੰ ਵਿੱਚ ਨਾਲ ਅਤੇ ਹੈ ਹਨ ਸੀ ਨੇ ਤੇ ਇਹ ਉਹ ਕਿ ਜੀ ਲਈ ਕਰ ਕੀਤਾ'
).split())


# ---------------------------------------------------------- field mapping --
# Different exports use different column names. Everything is mapped onto
# one canonical name - without this, a missing "State" column shows 0 rows
# and it looks as if Mongo itself were empty.
FIELD_ALIASES = {
    'Handle':      ['handle', 'username', 'screenname', 'screen name', 'user', 'twitterhandle'],
    'Tweet URL':   ['tweeturl', 'tweet url', 'url', 'link', 'permalink', 'u'],
    'Tweet ID':    ['tweetid', 'tweet id', 'id', '_id', 'statusid', 'status id'],
    'Tweet Date':  ['tweetdate', 'tweet date', 'date', 'createdat', 'created at',
                    'timestamp', 'postedon', 'd'],
    'Tweet Text':  ['tweettext', 'tweet text', 'text', 'content', 'fulltext', 'tx'],
    'Followers':   ['followers', 'followercount', 'follower count'],
    'Followings':  ['followings', 'following', 'followingcount'],
    'Total Posts': ['totalposts', 'total posts', 'posts', 'postcount'],
    'Total Comments': ['totalcomments', 'total comments', 'comments', 'replies', 'replycount'],
    'Total Likes':    ['totallikes', 'total likes', 'likes', 'likecount', 'favorites'],
    'Total Retweets': ['totalretweets', 'total retweets', 'retweets', 'retweetcount', 'rt'],
    'Total Views':    ['totalviews', 'total views', 'views', 'impressions', 'viewcount'],
    'Total Bookmark Tweets Times': ['totalbookmarktweetstimes', 'bookmarks', 'bookmarkcount'],
    'Sentiment':       ['sentiment', 'sentimentlabel', 'sentiment label', 'sn'],
    'Sentiment Score': ['sentimentscore', 'sentiment score', 'score', 'ss'],
    'State':      ['state', 'st'],
    'Locations':  ['locations', 'location', 'district', 'zila', 'city'],
    'AC/PC No':   ['acpcno', 'ac/pc no', 'acno', 'ac no', 'ac'],
    'AC Name':    ['acname', 'ac name', 'assemblyconstituency', 'assembly constituency',
                   'constituency', 'halqa', 'pc'],
    'PC Name':    ['pcname', 'pc name', 'parliamentaryconstituency'],
    'Designation':    ['designation', 'role', 'level', 'dg'],
    'Candidate Name': ['candidatename', 'candidate name', 'candidate', 'name', 'cn'],
    'Category':   ['category', 'cat'],
    'Party':      ['party', 'pt'],
    'Status':     ['status'],
}


def _nk(k):
    return str(k).strip().lower().replace('_', '').replace('-', '').replace(' ', '')


def build_keymap(sample_keys):
    """Map a collection's real keys onto canonical names."""
    have = {}
    for k in sample_keys:
        have.setdefault(_nk(k), k)
    out = {}
    for canon, aliases in FIELD_ALIASES.items():
        for a in [canon] + aliases:
            real = have.get(_nk(a))
            if real is not None:
                out[canon] = real
                break
    return out


class Row(dict):
    """Behaves like a dict, but reads by canonical name."""
    __slots__ = ('_km', '_raw')

    def __init__(self, raw, km):
        dict.__init__(self)
        self._raw = raw
        self._km = km

    def get(self, canon, default=''):
        k = self._km.get(canon)
        if k is None:
            return default
        v = self._raw.get(k, default)
        return default if v is None else v


# ------------------------------------------------------------------- source --

def _client():
    from pymongo import MongoClient
    return MongoClient(C['mongoUrl'], serverSelectionTimeoutMS=8000)


def _is_tweetish(keys):
    km = build_keymap(keys)
    return ('Tweet Text' in km or 'Tweet URL' in km) and ('Handle' in km or 'Candidate Name' in km)


def find_sources(cli, quiet=False):
    """Walk every database/collection and report where the tweets are."""
    found = []
    for dbname in cli.list_database_names():
        if dbname in ('admin', 'config', 'local'):
            continue
        d = cli[dbname]
        for cname in d.list_collection_names():
            col = d[cname]
            try:
                n = col.estimated_document_count()
            except Exception:
                continue
            if not n:
                continue
            doc = col.find_one()
            keys = list(doc.keys()) if doc else []
            item = {'db': dbname, 'coll': cname, 'n': n,
                    'keys': keys, 'tweetish': _is_tweetish(keys)}
            found.append(item)
            if not quiet:
                mark = '  <-- tweets' if item['tweetish'] else ''
                print('    %-22s %-22s %10s docs%s' % (dbname, cname, f'{n:,}', mark))
    return found


def state_counts(col, km, cap=200000):
    """What the State column actually contains."""
    from collections import Counter
    c = Counter()
    k = km.get('State')
    if not k:
        return c
    for doc in col.find({}, {k: 1, '_id': 0}).limit(cap):
        c[str(doc.get(k, '') or '(blank)').strip()] += 1
    return c


def scan():
    """--scan : a plain look at what is in Mongo."""
    cli = _client()
    cli.admin.command('ping')
    print('\nMongoDB:', C['mongoUrl'])
    print('\n  Databases and collections:')
    found = find_sources(cli)

    tweetish = [f for f in found if f['tweetish']]
    if not tweetish:
        print('\n  !! No collection looks like tweets.')
        print('     The data may not be in Mongo yet - in that case build')
        print('     straight from CSV:  python build_punjab_data.py --csv "path\\to.csv" --push')
        cli.close(); return

    print('\n  Detail on the tweet-like collections:')
    for f in tweetish:
        col = cli[f['db']][f['coll']]
        km = build_keymap(f['keys'])
        print('\n  --- %s.%s  (%s docs)' % (f['db'], f['coll'], f"{f['n']:,}"))
        print('      columns found : ' + ', '.join(sorted(km.keys())) or '(none)')
        missing = [c for c in ('Handle', 'Tweet Text', 'Tweet Date', 'State', 'Party') if c not in km]
        if missing:
            print('      MISSING       : ' + ', '.join(missing))
        sc = state_counts(col, km)
        if sc:
            pun = sum(v for k, v in sc.items() if 'punjab' in k.lower())
            print('      Punjab rows   : %s' % f'{pun:,}')
            print('      State values  : ' + ', '.join(
                '%s=%s' % (k or '(blank)', v) for k, v in sc.most_common(12)))
        else:
            print('      No State column at all - the Punjab filter cannot be applied.')
    print('\n  Put whichever collection looks right into config.json:')
    print('     "sourceDb": "<db>", "sourceCollection": "<collection>"\n')
    cli.close()


def rows_from_mongo():
    """Punjab tweets only, from the source collection.

    The filter runs in Python rather than as a Mongo query, because the
    column may be named 'State', 'state' or 'st', and the value may be
    'Punjab', 'PUNJAB' or 'Punjab ' - all of them have to work. At anything
    up to a few million rows this is perfectly fine.
    """
    cli = _client()
    cli.admin.command('ping')                      # fail fast rather than hang

    dbn, cn = C['sourceDb'], C['sourceCollection']
    col = cli[dbn][cn]
    n = col.estimated_document_count()

    # Configured collection empty or missing? Go and find it - showing the
    # user "0 tweets" and going quiet is the worst possible behaviour.
    if not n:
        print('  !! Nothing found in %s.%s - searching for it...' % (dbn, cn))
        cands = [f for f in find_sources(cli, quiet=True) if f['tweetish']]
        cands.sort(key=lambda f: -f['n'])
        if not cands:
            print('  !! There is no tweet-like collection in Mongo.')
            print('     Either load the data into Mongo first, or build from --csv.')
            print('     For the full list run:  python build_punjab_data.py --scan')
            cli.close(); return
        dbn, cn = cands[0]['db'], cands[0]['coll']
        col = cli[dbn][cn]
        n = cands[0]['n']
        print('  -> found: %s.%s (%s docs). Put it in config.json to make it stick.'
              % (dbn, cn, f'{n:,}'))

    doc = col.find_one()
    km = build_keymap(list(doc.keys()) if doc else [])
    print('  source  : %s.%s  (%s docs)' % (dbn, cn, f'{n:,}'))
    miss = [c for c in ('Handle', 'Tweet Text', 'Tweet Date', 'State', 'Party') if c not in km]
    if miss:
        print('  note    : these columns were not found -> %s' % ', '.join(miss))

    want = str(C.get('state') or 'Punjab').strip().lower()
    matched = 0
    seen_states = {}

    cur = col.find({}, no_cursor_timeout=True).batch_size(2000)
    for d in cur:
        r = Row(d, km)
        st = str(r.get('State', '')).strip()
        loc = str(r.get('Locations', '')).strip()
        seen_states[st or '(blank)'] = seen_states.get(st or '(blank)', 0) + 1
        # Not in State? Check Locations - plenty of exports keep the state
        # there instead.
        if want in st.lower() or (not st and want in loc.lower()):
            matched += 1
            yield r
    cur.close()

    print('  %s  : %s tweets matched' % (C.get('state', 'Punjab').ljust(7), f'{matched:,}'))
    if matched == 0:
        top = sorted(seen_states.items(), key=lambda x: -x[1])[:15]
        print('\n  !! Not a single row matched. The State column contains:')
        for k, v in top:
            print('       %-32s %s' % (k[:32], f'{v:,}'))
        print('\n     If Punjab appears under another name, change "state" in config.json,')
        print('     or run a full scan:  python build_punjab_data.py --scan\n')
    cli.close()


def rows_from_csv(path):
    """From CSV - works even when the column names differ (same keymap)."""
    import pandas as pd
    print('  source  :', path)
    want = str(C.get('state') or 'Punjab').strip().lower()
    km = None
    matched = 0
    seen = {}
    for ch in pd.read_csv(path, dtype=str, encoding='utf-8-sig',
                          chunksize=50000, keep_default_na=False):
        ch = ch.rename(columns=lambda x: str(x).strip())
        if km is None:
            km = build_keymap(list(ch.columns))
            miss = [c for c in ('Handle', 'Tweet Text', 'Tweet Date', 'State') if c not in km]
            if miss:
                print('  note    : these columns were not found -> %s' % ', '.join(miss))
            if 'State' not in km:
                sys.exit('No State-like column in the CSV - the filter cannot be applied.')
        for raw in ch.to_dict('records'):
            r = Row(raw, km)
            st = str(r.get('State', '')).strip()
            loc = str(r.get('Locations', '')).strip()
            seen[st or '(blank)'] = seen.get(st or '(blank)', 0) + 1
            if want in st.lower() or (not st and want in loc.lower()):
                matched += 1
                yield r
    print('  %s  : %s rows matched' % (str(C.get('state', 'Punjab')).ljust(7), f'{matched:,}'))
    if matched == 0:
        print('  !! The State column contains:')
        for k, v in sorted(seen.items(), key=lambda x: -x[1])[:15]:
            print('       %-32s %s' % (k[:32], f'{v:,}'))


# ---------------------------------------------------------------------------
# SENT8 -- 8 sentiment categories.
# Mongo ke 'Sentiment' me ye values hain: Neutral, Positive, Negative, Pro-BJP,
# Anti-BJP, Pro-Govt, Anti-Govt -- aur khaali ho to 'No-Sentiment'.
# Pehle sirf Positive/Negative gine jaate the aur BAAKI SAB 'neutral' me chala
# jaata tha, isliye Pro-BJP/Pro-Govt jaise tweets Neutral dikh rahe the.
# positive/negative/neutral naam jaan-boojh kar wahi rakhe hain.
# ---------------------------------------------------------------------------
SENT8_CODES = ['probjp', 'antigovt', 'progovt', 'positive',
               'neutral', 'antibjp', 'negative', 'nosent']
SENT8_LABEL = {'probjp': 'Pro-BJP', 'antigovt': 'Anti-Govt', 'progovt': 'Pro-Govt',
               'positive': 'Positive', 'neutral': 'Neutral', 'antibjp': 'Anti-BJP',
               'negative': 'Negative', 'nosent': 'No-Sentiment'}
_S8_SQUASH = re.compile(r'[^a-z0-9]+')
_S8_MAP = {'probjp': 'probjp', 'antibjp': 'antibjp', 'progovt': 'progovt',
           'progov': 'progovt', 'antigovt': 'antigovt', 'antigov': 'antigovt',
           'positive': 'positive', 'negative': 'negative', 'neutral': 'neutral',
           'nosentiment': 'nosent', 'none': 'nosent', 'na': 'nosent',
           'nan': 'nosent', 'null': 'nosent', '': 'nosent'}


def _scode(v):
    return _S8_MAP.get(_S8_SQUASH.sub('', str(v if v is not None else '').strip().lower()), 'nosent')


def _sblank():
    return {c: 0 for c in SENT8_CODES}


def _spick(d):
    return {c: d.get(c, 0) for c in SENT8_CODES}


def _sbump(d, sn):
    c = _scode(sn)
    d[c] = d.get(c, 0) + 1


# ---------------------------------------------------------------- aggregate --

def build(rows):
    kpi = dict(total_tweets=0, total_likes=0, total_retweets=0, total_comments=0,
               total_views=0, total_bookmarks=0, **_sblank())
    sent_sum = 0.0

    parties = defaultdict(lambda: dict(tweets=0, handles=set(), followers=0, likes=0,
                                       retweets=0, comments=0, views=0, bookmarks=0,
                                       engagement=0, **_sblank(), ssum=0.0))
    cands = defaultdict(lambda: dict(party='', designation='', handle='', followers=0,
                                     posts=0, tweets=0, engagement=0, **_sblank(), ssum=0.0))
    geo = defaultdict(lambda: dict(state='', tweets=0, **_sblank(), ssum=0.0))
    handles = {}
    cats = defaultdict(lambda: dict(tweets=0, handles=set(), views=0, engagement=0,
                                    **_sblank()))
    daily = defaultdict(lambda: dict(tweets=0, likes=0, retweets=0, views=0,
                                     **_sblank()))
    hourly = defaultdict(int)
    states = defaultdict(lambda: dict(tweets=0, handles=set(), views=0,
                                      **_sblank()))
    words = defaultdict(int)
    tags = defaultdict(int)

    seen = set()
    dupes = 0
    tweets_out = []
    n = 0

    for row in rows:
        n += 1
        if n % 50000 == 0:
            print('   %s rows...' % f'{n:,}', flush=True)

        url = txt(row.get('Tweet URL'))
        m = ID_RE.search(url)
        tid = m.group(1) if m else txt(row.get('Tweet ID'))
        key = tid or url
        if key:
            if key in seen:
                dupes += 1
                continue
            seen.add(key)

        h = txt(row.get('Handle'))
        tx = txt(row.get('Tweet Text'))
        d = fdate(row.get('Tweet Date'))
        pt = clean_party(row.get('Party'))
        dg = clean_desig(row.get('Designation'))
        cn = txt(row.get('Candidate Name'))
        cat = txt(row.get('Category'))
        pc = clean_pc(row.get('AC Name')) or clean_pc(row.get('PC Name'))
        ac = txt(row.get('AC/PC No'))
        st = txt(row.get('State')) or 'Punjab'
        if STATE_MATCH.match(st):
            st = 'Punjab'

        likes = num(row.get('Total Likes'))
        rts = num(row.get('Total Retweets'))
        cmts = num(row.get('Total Comments'))
        views = num(row.get('Total Views'))
        bms = num(row.get('Total Bookmark Tweets Times'))
        fol = num(row.get('Followers'))
        folg = num(row.get('Followings'))
        posts = num(row.get('Total Posts'))
        eng = likes + rts + cmts

        sn = sent_label(row.get('Sentiment'))
        try:
            ss = float(row.get('Sentiment Score') or 0)
        except Exception:
            ss = 0.0

        kpi['total_tweets'] += 1
        kpi['total_likes'] += likes
        kpi['total_retweets'] += rts
        kpi['total_comments'] += cmts
        kpi['total_views'] += views
        kpi['total_bookmarks'] += bms
        _sbump(kpi, sn)
        sent_sum += ss

        if pt:
            p = parties[pt]
            p['tweets'] += 1
            p['likes'] += likes
            p['retweets'] += rts
            p['comments'] += cmts
            p['views'] += views
            p['bookmarks'] += bms
            p['engagement'] += eng
            p['ssum'] += ss
            _sbump(p, sn)
            if h:
                p['handles'].add(h.lower())

        if h:
            k = h.lower()
            c = cands[k]
            c['handle'] = h
            if cn and not c.get('name'):
                c['name'] = cn
            if pt:
                c['party'] = pt
            if dg:
                c['designation'] = dg
            c['followers'] = max(c['followers'], fol)
            c['posts'] = max(c['posts'], posts)
            c['tweets'] += 1
            c['engagement'] += eng
            c['ssum'] += ss
            _sbump(c, sn)

            if k not in handles:
                handles[k] = dict(handle=h, followers=fol, followings=folg, posts=posts,
                                  party=pt, designation=dg, candidate=cn, state=st,
                                  pc=pc, ac=ac, cat=cat, tweets=0, views=0, engagement=0,
                                  **_sblank())
            hh = handles[k]
            hh['tweets'] += 1
            hh['views'] += views
            hh['engagement'] += eng
            _sbump(hh, sn)
            hh['followers'] = max(hh['followers'], fol)
            hh['followings'] = max(hh['followings'], folg)
            if pc and not hh.get('pc'):
                hh['pc'] = pc
            if cat and not hh.get('cat'):
                hh['cat'] = cat

        cb = cats[cat or 'Uncategorised']
        cb['tweets'] += 1
        cb['views'] += views
        cb['engagement'] += eng
        _sbump(cb, sn)
        if h:
            cb['handles'].add(h.lower())

        sb = states[st]
        sb['tweets'] += 1
        sb['views'] += views
        _sbump(sb, sn)
        if h:
            sb['handles'].add(h.lower())

        if pc:
            g = geo[pc]
            g['state'] = st
            g['tweets'] += 1
            g['ssum'] += ss
            _sbump(g, sn)

        if d:
            dd = daily[d[:10]]
            dd['tweets'] += 1
            dd['likes'] += likes
            dd['retweets'] += rts
            dd['views'] += views
            _sbump(dd, sn)
            if len(d) >= 13:
                try:
                    hourly[int(d[11:13])] += 1
                except ValueError:
                    pass

        if tx:
            for t in TAG_RE.findall(tx):
                tags[t.lower()] += 1
            low = URL_RE.sub(' ', tx.lower()).replace('।', ' ').replace('॥', ' ')
            for w in WORD_RE.sub(' ', low).split():
                if len(w) > 2 and w not in STOP and not w.isdigit():
                    words[w] += 1

        tweets_out.append(dict(_id=(tid or url or ('r%d' % n)), h=h, u=url, d=d,
                               tx=tx[:280], l=likes, r=rts, c=cmts, v=views, b=bms,
                               sn=sn, ss=round(ss, 4), st=st, pc=pc, ac=ac,
                               dg=dg, cn=cn, pt=pt, cat=cat, eng=eng,
                               f=fol, po=posts))

    print('   %s rows read, %s duplicates skipped' % (f'{n:,}', f'{dupes:,}'))

    def net(dd):
        return round(dd['ssum'] / (dd['tweets'] or 1), 3)

    party_list = []
    for name, p in parties.items():
        party_list.append(dict(party=name, tweets=p['tweets'], handles=len(p['handles']),
                               followers=0, likes=p['likes'], retweets=p['retweets'],
                               comments=p['comments'], views=p['views'],
                               bookmarks=p['bookmarks'], engagement=p['engagement'],
                               avg_sentiment=net(p), **_spick(p)))
    party_list.sort(key=lambda x: -x['tweets'])

    pf = defaultdict(int)
    for hh in handles.values():
        if hh['party']:
            pf[hh['party']] += hh['followers']
    for p in party_list:
        p['followers'] = pf.get(p['party'], 0)

    cand_list = []
    for c in cands.values():
        tw = c['tweets'] or 1
        avg_s = round(c['ssum'] / tw, 3)
        score = min(100, (c['engagement'] / 1000) + (avg_s * 40)
                    + (math.log10(c['followers'] + 1) * 3))
        cand_list.append(dict(name=c.get('name') or c['handle'], party=c['party'],
                              designation=c['designation'], handle=c['handle'],
                              followers=c['followers'], posts=c['posts'],
                              tweets=c['tweets'], engagement=c['engagement'],
                              avg_sentiment=avg_s,
                              score=round(max(0, score), 1), **_spick(c)))
    cand_list.sort(key=lambda x: -x['score'])

    geo_list = [dict(pc=k, ac=k, state=g['state'], tweets=g['tweets'],
                     avg_sentiment=net(g), **_spick(g))
                for k, g in geo.items()]
    geo_list.sort(key=lambda x: -x['tweets'])

    state_list = [dict(state=k, tweets=v['tweets'], handles=len(v['handles']),
                       views=v['views'], **_spick(v))
                  for k, v in states.items()]
    state_list.sort(key=lambda x: -x['tweets'])

    # The dashboard reads all four of these as [key, count] pairs
    # (app.js: d[0], d[1]). Sending dicts leaves the charts blank, so the
    # shape is kept exactly as it was.
    cat_list = [dict(category=k, tweets=v['tweets'], handles=len(v['handles']),
                     views=v['views'], engagement=v['engagement'], **_spick(v))
                for k, v in cats.items()]
    cat_list.sort(key=lambda x: -x['tweets'])

    timeline_daily = [[k, v['tweets']] for k, v in sorted(daily.items())]
    # Daily Sentiment Trend ab asli ginti se (pehle sirf volume line thi)
    timeline_sentiment = [[k, _spick(v)] for k, v in sorted(daily.items())]
    timeline_hourly = [[i, hourly.get(i, 0)] for i in range(24)]

    word_cloud = [[w, c] for w, c in
                  sorted(words.items(), key=lambda x: -x[1])[:150]]
    hashtags = [[t, c] for t, c in
                sorted(tags.items(), key=lambda x: -x[1])[:80]]

    # The daily sentiment breakdown is kept separately - useful later, and
    # it leaves the simple shape above alone.
    timeline_daily_full = [dict(date=k, **v) for k, v in sorted(daily.items())]

    def topn(k, limit=20):
        return [dict(x) for x in sorted(tweets_out, key=lambda r: -r[k])[:limit]]

    trending = dict(views=topn('v'), likes=topn('l'), retweets=topn('r'),
                    comments=topn('c'), engagement=topn('eng'), bookmarks=topn('b'))

    total_fol = sum(h['followers'] for h in handles.values())
    kpi.update(total_candidates=len(cand_list), total_parties=len(party_list),
               total_handles=len(handles), total_followers=total_fol,
               total_engagement=kpi['total_likes'] + kpi['total_retweets'] + kpi['total_comments'],
               avg_sentiment_score=round(sent_sum / (kpi['total_tweets'] or 1), 3),
               avg_followers=round(total_fol / (len(handles) or 1), 1),
               avg_engagement=round((kpi['total_likes'] + kpi['total_retweets']
                                     + kpi['total_comments']) / (kpi['total_tweets'] or 1), 2))

    days = [t[0] for t in timeline_daily]
    meta = dict(live=True, source_label=C['targetDb'],
                generated=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
                state=C['state'], total_rows_source=n, unique_tweets=kpi['total_tweets'],
                duplicates_removed=dupes,
                date_from=days[0] if days else '', date_to=days[-1] if days else '')

    aggregates = dict(meta=meta, kpis=kpi, parties=party_list, candidates=cand_list,
                      geo=geo_list, states=state_list, timeline_daily=timeline_daily,
                      timeline_sentiment=timeline_sentiment, sent_cats=[{'k': c, 'label': SENT8_LABEL[c]} for c in SENT8_CODES],
                      timeline_daily_full=timeline_daily_full,
                      timeline_hourly=timeline_hourly, word_cloud=word_cloud,
                      hashtags=hashtags, trending=trending,
                      categories=cat_list, handles=list(handles.values()))
    return aggregates, tweets_out


# --------------------------------------------------------------------- push --

def push(aggregates, tweets):
    from pymongo import MongoClient, UpdateOne
    cli = MongoClient(C['mongoUrl'], serverSelectionTimeoutMS=8000)
    db = cli[C['targetDb']]

    # One document per block - putting everything in a single doc would
    # blow the 16MB BSON limit (candidates + handles + trending together
    # get large).
    print('  pushing aggregates...', flush=True)
    ops = [UpdateOne({'_id': k}, {'$set': {'data': v}}, upsert=True)
           for k, v in aggregates.items()]
    db['aggregates'].bulk_write(ops, ordered=False)

    print('  pushing tweets (%s)...' % f'{len(tweets):,}', flush=True)
    db['tweets'].drop()                       # the Punjab set is rebuilt in full
    B = 5000
    for i in range(0, len(tweets), B):
        db['tweets'].insert_many(tweets[i:i + B], ordered=False)
        print('    %s…' % f'{min(i+B, len(tweets)):,}', flush=True)

    for f in ['d', 'pt', 'sn', 'pc', 'h', 'cat', 'dg', 'eng', 'v']:
        try:
            db['tweets'].create_index(f)
        except Exception:
            pass

    db['meta'].update_one({'_id': 'lastBuild'},
                          {'$set': {'value': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    'tweets': len(tweets)}}, upsert=True)
    cli.close()
    print('  push complete.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', help='build from a master CSV instead of the Mongo source')
    ap.add_argument('--push', action='store_true', help='write the result into MongoDB')
    ap.add_argument('--out', help='also write the payload to a JSON file')
    ap.add_argument('--count', action='store_true', help='show counts only')
    ap.add_argument('--scan', action='store_true',
                    help='show what is in Mongo (run this if you are getting 0 tweets)')
    ap.add_argument('--state', help='use a state other than the default Punjab')
    a = ap.parse_args()

    if a.state:
        C['state'] = a.state
    if a.scan:
        scan(); return

    if a.count:
        from pymongo import MongoClient
        cli = MongoClient(C['mongoUrl'], serverSelectionTimeoutMS=8000)
        print('%s.tweets : %s' % (C['targetDb'],
              f"{cli[C['targetDb']]['tweets'].estimated_document_count():,}"))
        return

    print('Starting Punjab build...')
    t0 = datetime.datetime.now()
    rows = rows_from_csv(a.csv) if a.csv else rows_from_mongo()
    aggregates, tweets = build(rows)

    k = aggregates['kpis']
    print()
    print('  tweets      : %s' % f"{k['total_tweets']:,}")
    print('  handles     : %s' % f"{k['total_handles']:,}")
    print('  candidates  : %s' % f"{k['total_candidates']:,}")
    print('  parties     : %s' % k['total_parties'])
    print('  categories  : %s' % ', '.join(
        '%s=%s' % (c['category'], f"{c['tweets']:,}") for c in aggregates['categories'][:6]))
    print('  constituencies: %s' % f"{len(aggregates['geo']):,}")
    print('  days        : %s' % len(aggregates['timeline_daily']))
    print('  date range  : %s → %s' % (aggregates['meta']['date_from'],
                                       aggregates['meta']['date_to']))
    print()

    if a.out:
        payload = dict(aggregates)
        payload['explorer'] = tweets[:25000]
        with open(a.out, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        print('  JSON written:', a.out)

    if a.push:
        push(aggregates, tweets)
    else:
        print('  (no --push given, so nothing was written to MongoDB)')

    print('DONE in', str(datetime.datetime.now() - t0).split('.')[0])


if __name__ == '__main__':
    main()
