# -*- coding: utf-8 -*-
"""
DIAGNOSE_PIPELINE.py  --  Network file -> Scraper -> MongoDB -> API -> Dashboard,
                          har stage ka LATEST timestamp ek jagah.

Kuch badalta NAHI hai -- sirf padh kar report deta hai. Kisi bhi scope
(All India / Uttar Pradesh / Punjab) ka atka hua stage isse pakad me aa jaata hai.

Chalao (project root me):
    python DIAGNOSE_PIPELINE.py
    python DIAGNOSE_PIPELINE.py --state Punjab      # sirf ek state
"""
import os, sys, glob, json, time, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, 'DASHBOARD')
PJ = os.path.join(HERE, 'PunjabLens')
NOW = datetime.datetime.now()
STATES = ['All India', 'Uttar Pradesh', 'Punjab']

for p in (HERE, DASH):
    if p not in sys.path: sys.path.insert(0, p)


def age(ts):
    """timestamp -> 'X ghante' + PASS/FAIL"""
    if not ts: return '-', None
    h = (NOW - ts).total_seconds() / 3600.0
    return ts.strftime('%Y-%m-%d %H:%M'), h


def verdict(h, warn=3, bad=12):
    if h is None: return 'FAIL  (pata nahi chala)'
    if h <= warn: return 'PASS'
    if h <= bad:  return 'DELAYED (%.0f ghante purana)' % h
    return 'FAIL  (%.0f ghante purana)' % h


def head(t):
    print('\n' + '=' * 72); print('  ' + t); print('=' * 72)


# ------------------------------------------------------- 1. NETWORK FILE
def stage_network():
    head('STAGE 1  --  NETWORK SCRAPED FILE')
    try:
        import phase2_push as P2
        base = P2.BASE
    except Exception as e:
        print('  phase2_push import fail:', e); return None, []
    print('  Folder :', base)
    if not os.path.isdir(base):
        print('  !! ye network folder khul hi nahi raha (share offline / permission).')
        print('     Jab tak ye nahi khulta, pipeline ko naya data mil hi nahi sakta.')
        return None, []
    rows, newest, empties = [], None, []
    for d in sorted(os.listdir(base)):
        fp = os.path.join(base, d)
        if not os.path.isdir(fp): continue
        fs = []
        for pat in ('*.csv', '*.xlsx', '*.xls', '*.xlsm'):
            fs += glob.glob(os.path.join(fp, pat))
        if not fs:
            rows.append((d, None, 0)); continue
        latest = max(fs, key=os.path.getmtime)
        ts = datetime.datetime.fromtimestamp(os.path.getmtime(latest))
        rows.append((d, ts, len(fs)))
        if newest is None or ts > newest: newest = ts
        for f in fs:
            try:
                if os.path.getsize(f) == 0: empties.append(f)
            except OSError:
                pass
    print('  %-38s %-18s %s' % ('FOLDER', 'AAKHRI FILE', 'UMR'))
    for d, ts, n in rows:
        if ts is None:
            print('  %-38s %-18s %s' % (d[:38], '(koi file nahi)', '-')); continue
        h = (NOW - ts).total_seconds() / 3600.0
        flag = '' if h <= 3 else ('  <-- ATKA HUA' if h > 12 else '  <-- der')
        print('  %-38s %-18s %5.0f ghante%s' % (d[:38], ts.strftime('%d %b %H:%M'), h, flag))
    if empties:
        print('\n  !! ye file KHAALI (0 byte) hai -- scraper ne likhi to hai par data nahi:')
        for f in empties[:10]: print('     ' + os.path.basename(f))
    return newest, empties


# ------------------------------------------------------- 2. SCRAPER / PIPELINE
def stage_scraper():
    head('STAGE 2  --  SCRAPER / PIPELINE (run_pipeline.py)')
    log = os.path.join(DASH, 'pipeline.log')
    if not os.path.exists(log):
        print('  pipeline.log nahi mila -- pipeline shayad kabhi chala hi nahi.')
        return None, None
    ts = datetime.datetime.fromtimestamp(os.path.getmtime(log))
    print('  Aakhri run   :', ts.strftime('%Y-%m-%d %H:%M'), ' (%.1f ghante pehle)'
          % ((NOW - ts).total_seconds() / 3600.0))
    try:
        lines = open(log, encoding='utf-8', errors='replace').read().splitlines()
    except Exception as e:
        print('  log padha nahi gaya:', e); return ts, None
    added = None
    for ln in reversed(lines[-400:]):
        if 'Naye rows:' in ln:
            print('  Aakhri result:', ln.split('] ', 1)[-1])
            try: added = int(ln.split('Naye rows:')[1].split('|')[0].strip().replace(',', ''))
            except Exception: pass
            break
    skips = [ln for ln in lines[-400:] if 'push skip' in ln]
    if skips:
        print('  !! "Naya data nahi -> push skip" -- jab naye row 0 hote hain to pipeline')
        print('     dashboard ka data DOBARA BANATA HI NAHI. Ye by design hai.')
    fails = [ln for ln in lines[-400:] if 'Punjab push fail' in ln or 'Punjab skip' in ln]
    for ln in fails[-3:]:
        print('  !! ' + ln.split('] ', 1)[-1][:150])
    errs = [ln for ln in lines[-400:] if 'ERROR read (skip)' in ln]
    for ln in errs[-6:]:
        print('  !! ' + ln.split('] ', 1)[-1][:150])
    return ts, added


# ------------------------------------------------------- 3. MONGODB
def mongo():
    from mongo_conf import MONGO_URL
    from pymongo import MongoClient
    return MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000), MONGO_URL


def stage_mongo(only=None):
    head('STAGE 3  --  MONGODB (pulse_master.master_tweets)')
    out = {}
    try:
        cli, url = mongo()
    except Exception as e:
        print('  Mongo se juda nahi gaya:', e); return out
    print('  URL :', url.split('@')[-1])
    col = cli['pulse_master']['master_tweets']
    print('  Kul docs :', f'{col.estimated_document_count():,}')

    # State column me asli values (Punjab / PUNJAB / PB / "Punjab, India" ...)
    try:
        vals = [v for v in col.distinct('State') if v and 'punjab' in str(v).lower()]
        print('  State me "punjab" jaisi values :', ', '.join(map(repr, vals)) or '(koi nahi)')
        if len(vals) > 1:
            print('     !! ek se zyada shakl hai -> dashboard sirf ek hi maanta hai.')
    except Exception as e:
        print('  (State distinct skip: %s)' % e)

    for st in (only or STATES):
        q = {} if st == 'All India' else {'State': st}
        try:
            n = col.count_documents(q)
            # sabse naya tweet (Tweet Date string, 'YYYY-MM-DD HH:MM:SS')
            d = list(col.find(q, {'Tweet Date': 1}).sort('Tweet Date', -1).limit(1))
            newest_tweet = (d[0].get('Tweet Date') if d else '') or '-'
            # sabse naya INGEST (_first = row humare Mongo me kis din aaya)
            f = list(col.find(q, {'_first': 1}).sort('_first', -1).limit(1))
            newest_ing = (f[0].get('_first') if f else '') or '-'
            print('\n  %-14s docs: %10s | sabse naya tweet: %s | Mongo me aakhri naya row: %s'
                  % (st, f'{n:,}', str(newest_tweet)[:16], newest_ing))
            out[st] = {'docs': n, 'tweet': str(newest_tweet)[:19], 'ingest': str(newest_ing)[:10]}
        except Exception as e:
            print('  %-14s padha nahi gaya (%s)' % (st, e))
    cli.close()
    return out


# ------------------------------------------------------- 4. DASHBOARD BLOBS
def stage_blobs():
    head('STAGE 4  --  DASHBOARD DATA (API jo padhta hai)')
    try:
        cli, _ = mongo()
    except Exception as e:
        print('  Mongo se juda nahi gaya:', e); return
    for db, label in [('india_Pulse', 'All India'), ('up_pulse', 'Uttar Pradesh')]:
        try:
            d = cli[db]['dashboard_data'].find_one({'key': 'UNI'})
            u = (d or {}).get('value') or {}
            dates = sorted((u.get('updates') or {}).keys())
            tot = ((u.get('tot') or {}).get('tw')) or 0
            print('  %-14s (%s) tweets: %10s | blob ka aakhri din: %s'
                  % (label, db, f'{tot:,}', dates[-1] if dates else '-'))
        except Exception as e:
            print('  %-14s padha nahi gaya (%s)' % (label, e))
    try:
        m = cli['political_lens']['meta'].find_one({}) or {}
        k = (cli['political_lens']['aggregates'].find_one({'_id': 'kpis'}) or {}).get('data') or {}
        n = cli['political_lens']['tweets'].estimated_document_count()
        print('  %-14s (political_lens) tweets: %10s | build meta: %s'
              % ('Punjab', f'{n:,}', {x: y for x, y in m.items() if x != '_id'} or '-'))
        if k: print('                 kpis.total_tweets: %s' % f"{k.get('total_tweets', 0):,}")
        d = list(cli['political_lens']['tweets'].find({}, {'d': 1}).sort('d', -1).limit(1))
        print('                 sabse naya Punjab tweet: %s' % ((d[0].get('d') if d else '-') or '-'))
    except Exception as e:
        print('  Punjab padha nahi gaya (%s)' % e)
    cli.close()


# ------------------------------------------------------- 5. API
def stage_api():
    head('STAGE 5  --  API / SERVER (localhost:3000)')
    import urllib.request
    for path in ('/api/version', '/punjab/api/meta'):
        try:
            r = urllib.request.urlopen('http://localhost:3000' + path, timeout=15).read()
            print('  %-22s -> %s' % (path, r[:180].decode('utf-8', 'replace')))
        except Exception as e:
            print('  %-22s -> nahi mila (%s)' % (path, e))
    print('  (server band ho to START_LIVE.bat se chalu karo -- ye stage ki galti nahi hai)')


def main():
    only = None
    if '--state' in sys.argv:
        only = [sys.argv[sys.argv.index('--state') + 1]]
    print('DIAGNOSE_PIPELINE  --  %s' % NOW.strftime('%Y-%m-%d %H:%M:%S'))
    net, empties = stage_network()
    scr, added = stage_scraper()
    mon = stage_mongo(only)
    stage_blobs()
    stage_api()

    head('SUMMARY')
    nt, nh = age(net)
    st, sh = age(scr)
    print('  Network File          : %s   %s' % (nt, verdict(nh)))
    print('  Scraper / Pipeline    : %s   %s' % (st, verdict(sh, warn=2, bad=6)))
    for k, v in mon.items():
        print('  MongoDB %-13s : sabse naya tweet %s | aakhri naya row %s'
              % (k, v['tweet'], v['ingest']))
    if added == 0:
        print('\n  ROOT CAUSE (sabse sambhavit):')
        print('    Pipeline chal raha hai par NAYE ROW 0 hain -- yaani problem')
        print('    is machine me nahi, UPSTREAM me hai: network folder me nayi')
        print('    file aa hi nahi rahi. Mongo/API/dashboard sab theek hain,')
        print('    unke paas dene ko naya kuch hai hi nahi.')
        print('    Dekhne ki jagah: STAGE 1 ki list me jo folder "ATKA HUA" hai.')
    if empties:
        print('\n  Aur: %d source file 0-byte hain -- scraper ne khaali file likhi.' % len(empties))
    print('')


if __name__ == '__main__':
    main()
