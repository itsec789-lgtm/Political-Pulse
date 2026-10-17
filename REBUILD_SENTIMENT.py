# -*- coding: utf-8 -*-
"""
REBUILD_SENTIMENT.py   (v3 -- mongo_conf ke bina bhi chalta hai)
================================================================
Sentiment ka data (8 category) dobara banata hai -- All India + Uttar
Pradesh + Punjab, teeno. Seedha MongoDB se.

KYUN ZAROORAT: sentiment ki ginti HTML me nahi hoti, 'dashboard_data'
blob me hoti hai. Code lag jaane ke baad bhi jab tak wo blob dobara nahi
banta, Pro-BJP / Anti-BJP / Pro-Govt / Anti-Govt par 0 hi dikhega.
Aur run_pipeline.py naye tweet na aane par push SKIP kar deta hai
("Naya data nahi -> push skip"), isliye wo apne aap kabhi theek nahi hoga.

v2/v3 me kya theek hua -- YE MERI GALTI THI:
  v1 MongoDB ka pata SIRF 'from mongo_conf import MONGO_URL' se leta tha.
  Hosted PC par wo file hai hi nahi, isliye script pehli hi line par gir
  jaati thi, APPLY_ALL_SEPT ka step us error ko chupa leta tha, aur data
  kabhi rebuild hota hi nahi tha. Ab:
    - pata 4 jagah se dhoondte hain (env -> mongo_conf -> db_config.json
      upar tak -> localhost),
    - build shuru karne se PEHLE connection test karte hain,
    - child script fail ho to exit code dekh kar CHILLA kar batate hain.

CHALAO (project root me, jahan DASHBOARD folder hai):
    python REBUILD_SENTIMENT.py
    python REBUILD_SENTIMENT.py --check     <- sirf dekho, banao mat

Master data (pulse_master.master_tweets) ko sirf PADHA jaata hai --
badla nahi jaata. Config file bhi koi nahi chhedi jaati.
"""
import os, sys, json, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, 'DASHBOARD')
UPD = os.path.join(HERE, 'UP-DASHBOARD')
PJ = os.path.join(HERE, 'PunjabLens')
PY = sys.executable or 'python'
CHECK = '--check' in sys.argv

CODES = ['probjp', 'antigovt', 'progovt', 'pos', 'neu', 'antibjp', 'neg', 'none']
LABEL = {'probjp': 'Pro-BJP', 'antigovt': 'Anti-Govt', 'progovt': 'Pro-Govt',
         'pos': 'Positive', 'neu': 'Neutral', 'antibjp': 'Anti-BJP',
         'neg': 'Negative', 'none': 'No-Sentiment'}
NEW4 = ('probjp', 'progovt', 'antigovt', 'antibjp')
PJ_CODES = ['probjp', 'antigovt', 'progovt', 'positive', 'neutral',
            'antibjp', 'negative', 'nosent']
PJ_LABEL = dict(zip(PJ_CODES, ['Pro-BJP', 'Anti-Govt', 'Pro-Govt', 'Positive',
                               'Neutral', 'Anti-BJP', 'Negative', 'No-Sentiment']))


def bar(t=''):
    print('\n' + '=' * 68)
    if t:
        print('  ' + t)
        print('=' * 68)


def hide(u):
    """Password ko log me mat chhapo."""
    if '@' not in u:
        return u
    a, b = u.split('@', 1)
    return (a.rsplit(':', 1)[0] if ':' in a else a) + ':****@' + b


# --------------------------------------------------------------- mongo url
def _from_json(path):
    try:
        v = str((json.load(open(path, encoding='utf-8')) or {}).get('mongo_url', '')).strip()
        if v and not v.startswith('PASTE'):
            return v
    except Exception:
        pass
    return ''


def mongo_url():
    """MongoDB ka pata. Lautata hai (url, kahan se mila, guess hai ya nahi).

    Kram wahi hai jo project ke mongo_conf.py ka hai, taaki dono ek hi
    jagah par pahunchein:
        1. MONGO_URL environment variable
        2. mongo_conf.py  (agar machine par hai)
        3. db_config.json -- HERE/DASHBOARD se upar 5 level tak
        4. mongodb://localhost:27017   <- sirf yahi 'guess' hai
    """
    u = (os.environ.get('MONGO_URL') or '').strip()
    if u:
        return u, 'MONGO_URL environment se', False

    for p in (HERE, DASH, UPD, PJ):
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)
    try:
        from mongo_conf import MONGO_URL as u2
        u2 = str(u2 or '').strip()
        if u2:
            return u2, 'mongo_conf.py se', False
    except Exception:
        pass

    seen = set()
    for start in (HERE, DASH, UPD, PJ):
        d = start
        for _ in range(5):
            if d in seen:
                break
            seen.add(d)
            f = os.path.join(d, 'db_config.json')
            if os.path.isfile(f):
                v = _from_json(f)
                if v:
                    return v, os.path.relpath(f, HERE) + ' se', False
            nd = os.path.dirname(d)
            if nd == d:
                break
            d = nd

    return 'mongodb://localhost:27017', 'kahin nahi mila -> localhost maan liya', True


URL, URL_SRC, URL_GUESS = mongo_url()


def client():
    from pymongo import MongoClient
    return MongoClient(URL, serverSelectionTimeoutMS=8000)


def child_env():
    """Child script ka environment.

    Agar hamein URL kisi ASLI jagah se mila hai to wahi aage bhej dete hain.
    Par agar humne sirf localhost GUESS kiya hai to MONGO_URL bilkul NAHI
    bhejte -- warna host ki apni sahi setting (db_config.json ka password
    wala URL) hamare guess se dab jaati aur chalti hui pipeline toot jaati.
    """
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    if URL_GUESS:
        env.pop('MONGO_URL', None)
    else:
        env['MONGO_URL'] = URL
    return env


# ------------------------------------------------------------------ check
def code_ready():
    ok = True
    for p, needle, name in [
        (os.path.join(DASH, 'update_dashboard.py'), 'SENT_CATS', 'DASHBOARD/update_dashboard.py'),
        (os.path.join(UPD, 'update_dashboard.py'), 'SENT_CATS', 'UP-DASHBOARD/update_dashboard.py'),
        (os.path.join(PJ, 'build_punjab_data.py'), 'SENT8_CODES', 'PunjabLens/build_punjab_data.py'),
    ]:
        try:
            got = needle in open(p, encoding='utf-8', errors='ignore').read()
        except Exception:
            got = False
        print('   %-44s %s' % (name, 'naya code hai' if got else '!! PURANA code'))
        ok = ok and got
    return ok


def mongo_ready():
    """Build shuru karne se PEHLE hi pata chal jaana chahiye ki Mongo mil raha hai."""
    try:
        cli = client()
        cli.admin.command('ping')
        n = cli['pulse_master']['master_tweets'].estimated_document_count()
        print('   connection OK  --  master_tweets: %s tweets' % format(n, ','))
        cli.close()
        return True
    except Exception as e:
        print('   !! MongoDB se juda nahi gaya: %s' % e)
        print('      URL: %s   [%s]' % (hide(URL), URL_SRC))
        print('      - MongoDB service chal rahi hai?  (services.msc -> MongoDB)')
        print('      - auth laga hai to project root ki db_config.json me')
        print('        "mongo_url" bhar do, ya chalao:')
        print('        set MONGO_URL=mongodb://user:pass@host:27017')
        return False


def show(title, sent, codes, labels):
    tot = sum(int(sent.get(c, 0) or 0) for c in codes) or 1
    print('   ' + title)
    for c in codes:
        v = int(sent.get(c, 0) or 0)
        print('      %-14s %12s   %5.1f%%' % (labels[c], format(v, ','), v * 100.0 / tot))
    print('      %-14s %12s' % ('TOTAL', format(tot, ',')))


def read_state():
    try:
        cli = client()
    except Exception as e:
        print('   !! Mongo se juda nahi gaya: %s' % e)
        return {}
    out = {}
    for db, name in [('india_Pulse', 'ALL INDIA'), ('up_pulse', 'UTTAR PRADESH')]:
        try:
            d = cli[db]['dashboard_data'].find_one({'key': 'UNI'})
            sent = ((d or {}).get('value') or {}).get('sent') or {}
            out[name] = sent
            show('%s  (db: %s)' % (name, db), sent, CODES, LABEL)
            miss = [c for c in CODES if c not in sent]
            if miss:
                print('      !! blob me ye hain hi nahi -> card 0 dikhega: %s'
                      % ', '.join(LABEL[c] for c in miss))
        except Exception as e:
            print('   %s: padha nahi gaya (%s)' % (name, e))
    try:
        k = (cli['political_lens']['aggregates'].find_one({'_id': 'kpis'}) or {}).get('data') or {}
        if k:
            show('PUNJAB  (political_lens)', k, PJ_CODES, PJ_LABEL)
        vals = [str(v) for v in cli['political_lens']['tweets'].distinct('sn') if v]
        print('      tweets.sn me abhi: %s' % ', '.join(sorted(vals)))
    except Exception as e:
        print('   PUNJAB: padha nahi gaya (%s)' % e)
    try:
        cli.close()
    except Exception:
        pass
    return out


# ------------------------------------------------------------------- build
def run(cmd, cwd, label):
    print('\n   > %s' % label)
    try:
        r = subprocess.run(cmd, cwd=cwd, env=child_env())
    except Exception as e:
        print('   !! chal hi nahi paaya: %s' % e)
        return False
    if r.returncode != 0:
        print('   !! FAIL (exit %d) -- upar ka error dekho, wahi asli wajah hai'
              % r.returncode)
        return False
    print('   ho gaya.')
    return True


def ping(url):
    try:
        import urllib.request
        urllib.request.urlopen(url, timeout=120).read(200)
        print('   refresh OK :', url)
    except Exception as e:
        print('   (refresh skip: %s -- server band ho to koi baat nahi)' % e)


def main():
    print('\n' + '#' * 68)
    print('#  REBUILD SENTIMENT  (v3)')
    print('#  Folder  : %s' % HERE)
    print('#  MongoDB : %s   [%s]' % (hide(URL), URL_SRC))
    print('#' * 68)

    bar('1. CODE JAANCH')
    if not code_ready():
        print('\n   !! Pehle APPLY_ALL_SEPT.py --apply chalao, phir ye script.')
        return 1

    bar('2. MONGODB JAANCH')
    if not mongo_ready():
        print('\n   !! Mongo hi nahi mila -- build chalane ka koi fayda nahi.')
        return 2

    bar('3. ABHI KYA HAI (build se PEHLE)')
    read_state()

    if CHECK:
        print('\n   (--check tha, isliye build nahi chalaya.)')
        return 0

    t0 = time.time()
    ok1 = ok2 = False

    bar('4. ALL INDIA + UTTAR PRADESH  (seedha Mongo se)')
    p = os.path.join(DASH, 'push_all_scopes.py')
    if os.path.exists(p):
        ok1 = run([PY, p, 'MONGO'], DASH, 'push_all_scopes.py MONGO')
    else:
        print('   !! push_all_scopes.py nahi mila: %s' % p)

    bar('5. PUNJAB')
    p2 = os.path.join(PJ, 'build_punjab_data.py')
    if os.path.exists(p2):
        ok2 = run([PY, p2, '--push'], PJ, 'build_punjab_data.py --push')
        if not ok2:
            print('   (Punjab fail hua to bhi All India / UP ka data ban chuka hai)')
    else:
        print('   !! build_punjab_data.py nahi mila')

    bar('6. SERVER KA CACHE SAAF')
    ping('http://localhost:3000/refresh')
    ping('http://localhost:3000/punjab/refresh')

    bar('7. AB KYA HAI (build ke BAAD)')
    after = read_state()

    bar('HO GAYA -- %d second lage' % int(time.time() - t0))
    bad = [n for n, s in after.items()
           if not any(int(s.get(c, 0) or 0) for c in NEW4)]
    if not ok1:
        print('  !! All India / UP ka build FAIL hua -- upar step 4 ka error dekho.')
        print('     Wahi error mujhe bhej dena, usi se asli wajah pata chalegi.')
        return 3
    if bad:
        print('  !! %s me ab bhi nayi category 0 hain -- upar ka poora output bhejo.'
              % ', '.join(bad))
        return 4
    print('  Sab theek. Ab browser me Ctrl + Shift + R.')
    print('  (server restart ki zaroorat nahi -- data Mongo se aata hai)')
    if not ok2:
        print('  (Punjab ka build fail hua tha -- All India / UP theek hain.)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
