# -*- coding: utf-8 -*-
"""
FRESH_SETUP.py  --  is laptop par dashboard ka poora naya setup.
==================================================================
Teeno dashboard (All India + Uttar Pradesh + Punjab) ka saara banaya
hua data mita kar, isi laptop ki MongoDB me pade ASLI tweets se sab
kuch naye sire se banata hai -- aur phir live kar deta hai.

--------------------------------------------------------------------
KYA MITTA HAI, KYA NAHI  -- ye sabse zaroori baat hai
--------------------------------------------------------------------
MITEGA (ye teeno 'banaya hua' data hai, tweets se dobara ban jaata hai):
    india_Pulse       All India dashboard ka data
    up_pulse          UP dashboard ka data
    political_lens    Punjab dashboard ka data

NAHI MITEGA -- kabhi nahi:
    pulse_master      <- ASLI tweets (18 lakh+) aur login/users
                         Yahi to source hai. Ise mita diya to naya
                         data banega kis se? Ye script isko sirf
                         PADHTI hai.
    db_config.json, ai_config.json, mail_config.json, network folder,
    scraper, koi bhi .bat -- kisi ko haath nahi.

Yaani: ginti/aggregation saaf, tweets safe.

--------------------------------------------------------------------
CHALAO (project root me, jahan DASHBOARD folder hai)
--------------------------------------------------------------------
    python FRESH_SETUP.py --check    <- sirf dikhao, kuch mat karo
    python FRESH_SETUP.py            <- poochh kar sab karo
    python FRESH_SETUP.py --yes      <- bina poochhe (script/automation ke liye)

Aage ke kaam alag se band kiye ja sakte hain:
    --no-primary     role secondary hi rehne do
    --no-autostart   Windows ke saath apne aap chalu mat karo
    --no-live        aakhir me START_LIVE.bat mat kholo
"""
import io, json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, 'DASHBOARD')
UPD = os.path.join(HERE, 'UP-DASHBOARD')
PJ = os.path.join(HERE, 'PunjabLens')
PY = sys.executable or 'python'
STAMP = time.strftime('%Y%m%d_%H%M')

CHECK = '--check' in sys.argv
YES = '--yes' in sys.argv
DO_PRIMARY = '--no-primary' not in sys.argv
DO_AUTOSTART = '--no-autostart' not in sys.argv
DO_LIVE = '--no-live' not in sys.argv

# banaya hua data -- ye mitega aur dobara banega
DERIVED = ['india_Pulse', 'up_pulse', 'political_lens']
# asli tweets -- ise kabhi mat chhuna
SOURCE_DB, SOURCE_COLL = 'pulse_master', 'master_tweets'

CODES = ['probjp', 'antigovt', 'progovt', 'pos', 'neu', 'antibjp', 'neg', 'none']
LABEL = {'probjp': 'Pro-BJP', 'antigovt': 'Anti-Govt', 'progovt': 'Pro-Govt',
         'pos': 'Positive', 'neu': 'Neutral', 'antibjp': 'Anti-BJP',
         'neg': 'Negative', 'none': 'No-Sentiment'}
NEW4 = ('probjp', 'progovt', 'antigovt', 'antibjp')
PJ_CODES = ['probjp', 'antigovt', 'progovt', 'positive', 'neutral',
            'antibjp', 'negative', 'nosent']
PJ_LABEL = dict(zip(PJ_CODES, ['Pro-BJP', 'Anti-Govt', 'Pro-Govt', 'Positive',
                               'Neutral', 'Anti-BJP', 'Negative', 'No-Sentiment']))

# code laga hai ya nahi -- yahi nishaan dekhe jaate hain
MARKERS = [
    (os.path.join(DASH, 'dashboard.template.html'), 'SENTIMENT 8-CATEGORY CORE', 'All India: sentiment 8'),
    (os.path.join(DASH, 'dashboard.template.html'), 'BREAKING NEWS (news v1)', 'All India: breaking news'),
    (os.path.join(DASH, 'dashboard.template.html'), 'TWEET INTELLIGENCE (merge v1)', 'All India: tweet intelligence'),
    (os.path.join(DASH, 'dashboard.template.html'), 'rt-delta', 'All India: real-time indicator'),
    (os.path.join(UPD, 'dashboard.template.html'), 'SENTIMENT 8-CATEGORY CORE', 'UP: sentiment 8'),
    (os.path.join(UPD, 'dashboard.template.html'), 'BREAKING NEWS (news v1)', 'UP: breaking news'),
    (os.path.join(UPD, 'dashboard.template.html'), 'TWEET INTELLIGENCE (merge v1)', 'UP: tweet intelligence'),
    (os.path.join(UPD, 'dashboard.template.html'), 'rt-delta', 'UP: real-time indicator'),
    (os.path.join(DASH, 'update_dashboard.py'), 'SENT_CATS', 'All India: pipeline'),
    (os.path.join(UPD, 'update_dashboard.py'), 'SENT_CATS', 'UP: pipeline'),
    (os.path.join(DASH, 'server.js'), 'BREAKING NEWS API', 'server: /api/news'),
    (os.path.join(PJ, 'build_punjab_data.py'), 'SENT8_CODES', 'Punjab: pipeline'),
    (os.path.join(PJ, 'aggregate.js'), 'SENT8', 'Punjab: aggregate'),
    (os.path.join(PJ, 'public', 'app.js'), 'SENT8', 'Punjab: UI'),
    # Punjab ke index.html me nishaan purane version me nahi likha jaata tha,
    # isliye yahan asli section ko dhoondte hain -- naam par nahi jaate.
    (os.path.join(PJ, 'public', 'index.html'), '<section class="page" id="breaking">',
     'Punjab: breaking news'),
]


def bar(t=''):
    print('\n' + '=' * 70)
    if t:
        print('  ' + t)
        print('=' * 70)


def hide(u):
    if '@' not in u:
        return u
    a, b = u.split('@', 1)
    return (a.rsplit(':', 1)[0] if ':' in a else a) + ':****@' + b


def ask(q):
    if YES:
        return True
    try:
        return input('\n  ' + q + ' ').strip()
    except Exception:
        return ''


# ------------------------------------------------------------ mongo ka pata
def mongo_url():
    """Wahi kram jo project ke mongo_conf.py ka hai, taaki dono ek hi
    MongoDB par pahunchein."""
    u = (os.environ.get('MONGO_URL') or '').strip()
    if u:
        return u, 'MONGO_URL environment se', False
    for p in (HERE, DASH, UPD, PJ):
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)
    try:
        from mongo_conf import MONGO_URL as u2
        if str(u2 or '').strip():
            return str(u2).strip(), 'mongo_conf.py se', False
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
                try:
                    v = str((json.load(io.open(f, encoding='utf-8')) or {})
                            .get('mongo_url', '')).strip()
                    if v and not v.startswith('PASTE'):
                        return v, os.path.relpath(f, HERE) + ' se', False
                except Exception:
                    pass
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
    """Guess kiya hua localhost child par mat thopo -- unki apni sahi
    setting (db_config.json) usse dab jaayegi."""
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    if URL_GUESS:
        env.pop('MONGO_URL', None)
    else:
        env['MONGO_URL'] = URL
    return env


def run(cmd, cwd, label):
    print('\n   > %s' % label)
    try:
        r = subprocess.run(cmd, cwd=cwd, env=child_env())
    except Exception as e:
        print('   !! chal hi nahi paaya: %s' % e)
        return False
    if r.returncode != 0:
        print('   !! FAIL (exit %d) -- upar ka error hi asli wajah hai' % r.returncode)
        return False
    print('   ho gaya.')
    return True


# ------------------------------------------------------------------- 1 code
def step_layout():
    ok = True
    for p, n in [(DASH, 'DASHBOARD'), (UPD, 'UP-DASHBOARD'), (PJ, 'PunjabLens')]:
        got = os.path.isdir(p)
        print('   %-16s %s' % (n, 'mila' if got else '!! NAHI MILA'))
        ok = ok and got
    if not ok:
        print('\n   Ye script project ROOT me rakh kar chalani hai --')
        print('   yaani wahan jahan ye teeno folder hain.')
    return ok


def step_code():
    miss = []
    for p, needle, name in MARKERS:
        try:
            got = needle in io.open(p, encoding='utf-8', errors='ignore').read()
        except Exception:
            got = False
        print('   %-34s %s' % (name, 'laga hai' if got else '!! NAHI LAGA'))
        if not got:
            miss.append(name)
    if not miss:
        return True
    print('\n   %d cheez nahi lagi. Pehle ye chalao, phir dobara aana:' % len(miss))
    print('       python APPLY_ALL_SEPT.py --apply')
    return False


# ------------------------------------------------------------------ 2 mongo
def step_mongo():
    try:
        cli = client()
        cli.admin.command('ping')
    except Exception as e:
        print('   !! MongoDB se juda nahi gaya: %s' % e)
        print('      URL: %s   [%s]' % (hide(URL), URL_SRC))
        print('      MongoDB chalu karo:   net start MongoDB')
        return 0
    n = 0
    try:
        n = cli[SOURCE_DB][SOURCE_COLL].estimated_document_count()
    except Exception as e:
        print('   !! %s.%s padha nahi gaya: %s' % (SOURCE_DB, SOURCE_COLL, e))
    print('   connection OK   [%s]' % URL_SRC)
    print('   %s.%s  ->  %s tweets   (ISE HAATH NAHI LAGEGA)'
          % (SOURCE_DB, SOURCE_COLL, format(n, ',')))
    if n < 1000:
        print('\n   !! Source hi khaali hai. Isse naya data ban hi nahi sakta.')
        print('      Pehle tweets restore karo:  python mongo_backup.py --restore')
    print('\n   Ab jo hai (mitne wala banaya hua data):')
    for d in DERIVED:
        try:
            cols = cli[d].list_collection_names()
            tot = sum(cli[d][c].estimated_document_count() for c in cols)
            print('      %-16s %5d collection, %10s docs' % (d, len(cols), format(tot, ',')))
        except Exception as e:
            print('      %-16s padha nahi gaya (%s)' % (d, e))
    cli.close()
    return n


# ------------------------------------------------------------------- 3 drop
def step_drop():
    print('   Ye teeno database poori tarah hat jaayengi:')
    for d in DERIVED:
        print('      - ' + d)
    print('\n   %s.%s ko haath NAHI lagega -- naya data usi se banega.'
          % (SOURCE_DB, SOURCE_COLL))
    if not YES:
        a = ask('Aage badhne ke liye  FRESH  likho (aur kuch bhi = ruk jao):')
        if a != 'FRESH':
            print('\n   Kuch nahi hataya. Sab waise ka waisa hai.')
            return False
    cli = client()
    print()
    for d in DERIVED:
        try:
            cli.drop_database(d)
            print('   hat gayi   %s' % d)
        except Exception as e:
            print('   !! %s: %s' % (d, e))
    left = [d for d in cli.list_database_names() if d in DERIVED]
    cli.close()
    if left:
        print('\n   !! ye ab bhi hain: %s' % ', '.join(left))
        print('      MongoDB Compass khula ho to band karke dobara chalao.')
        return False
    print('\n   Saaf ho gaya.')
    return True


# ------------------------------------------------------------------ 4 build
def step_build():
    ok1 = ok2 = False
    p = os.path.join(DASH, 'push_all_scopes.py')
    if os.path.exists(p):
        ok1 = run([PY, p, 'MONGO'], DASH, 'All India + UP  (push_all_scopes.py MONGO)')
    else:
        print('   !! push_all_scopes.py nahi mila: %s' % p)
    p2 = os.path.join(PJ, 'build_punjab_data.py')
    if os.path.exists(p2):
        ok2 = run([PY, p2, '--push'], PJ, 'Punjab  (build_punjab_data.py --push)')
        if not ok2:
            print('   (Punjab fail hua to bhi All India / UP ka data ban chuka hai)')
    else:
        print('   !! build_punjab_data.py nahi mila')
    return ok1, ok2


# ------------------------------------------------------------------- 5 role
def step_role():
    f = os.path.join(DASH, 'local_config.json')
    try:
        cur = json.load(io.open(f, encoding='utf-8')) if os.path.isfile(f) else {}
    except Exception:
        cur = {}
    was = str(cur.get('role', '')).strip().lower() or '(khaali)'
    if was == 'primary':
        print('   pehle se primary hai -- kuch badla nahi')
        return
    if os.path.isfile(f):
        shutil.copy2(f, f + '.bak_FRESH_' + STAMP)
    cur['role'] = 'primary'
    io.open(f, 'w', encoding='utf-8').write(json.dumps(cur, indent=1, ensure_ascii=False))
    print('   role: %s  ->  primary' % was)
    print('   (matlab: ab ye laptop network par master CSV ka backup likhega)')
    print('   !! DHYAN: hosted PC bhi primary rahega to dono EK HI file par')
    print('      likhenge aur ek doosre ko mita denge. Wahan ka START_LIVE /')
    print('      pipeline band rakho, ya wahan role "secondary" kar do.')


# -------------------------------------------------------------- 6 autostart
def step_autostart():
    """Windows ke Startup folder me ek chhoti .bat rakh dete hain jo
    START_LIVE.bat ko bula deti hai. Shortcut (.lnk) banane ke liye
    alag package chahiye hota hai -- .bat usi kaam ka hai aur simple hai."""
    live = os.path.join(DASH, 'START_LIVE.bat')
    if not os.path.isfile(live):
        print('   !! START_LIVE.bat nahi mili -- autostart skip')
        return
    startup = os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows',
                           'Start Menu', 'Programs', 'Startup')
    if not os.path.isdir(startup):
        print('   !! Startup folder nahi mila -- autostart skip')
        print('      (khud rakhna ho to:  Win+R  ->  shell:startup)')
        return
    dst = os.path.join(startup, 'Political Pulse Dashboard.bat')
    io.open(dst, 'w', encoding='utf-8', newline='\r\n').write(
        '@echo off\r\n'
        'REM Windows chalu hote hi dashboard bhi chalu.\r\n'
        'REM Nahi chahiye to bas ye file delete kar do.\r\n'
        'timeout /t 30 /nobreak >nul\r\n'
        'start "" "%s"\r\n' % live)
    print('   laga diya: Startup me "Political Pulse Dashboard.bat"')
    print('   (band karna ho to wo file delete kar dena -- Win+R -> shell:startup)')


# ----------------------------------------------------------------- 7 verify
def show(title, sent, codes, labels):
    tot = sum(int(sent.get(c, 0) or 0) for c in codes) or 1
    print('   ' + title)
    for c in codes:
        v = int(sent.get(c, 0) or 0)
        print('      %-14s %12s   %5.1f%%' % (labels[c], format(v, ','), v * 100.0 / tot))
    print('      %-14s %12s' % ('TOTAL', format(tot, ',')))


def step_verify():
    bad = []
    try:
        cli = client()
    except Exception as e:
        print('   !! Mongo se juda nahi gaya: %s' % e)
        return ['(mongo)']
    for db, name in [('india_Pulse', 'ALL INDIA'), ('up_pulse', 'UTTAR PRADESH')]:
        try:
            d = cli[db]['dashboard_data'].find_one({'key': 'UNI'})
            sent = ((d or {}).get('value') or {}).get('sent') or {}
            if not sent:
                print('   %s: dashboard_data blob bana hi nahi' % name)
                bad.append(name)
                continue
            show('%s  (db: %s)' % (name, db), sent, CODES, LABEL)
            if not any(int(sent.get(c, 0) or 0) for c in NEW4):
                bad.append(name)
        except Exception as e:
            print('   %s: padha nahi gaya (%s)' % (name, e))
            bad.append(name)
    try:
        k = (cli['political_lens']['aggregates'].find_one({'_id': 'kpis'}) or {}).get('data') or {}
        if k:
            show('PUNJAB  (political_lens)', k, PJ_CODES, PJ_LABEL)
            if not any(int(k.get(c, 0) or 0) for c in ('probjp', 'progovt', 'antigovt', 'antibjp')):
                bad.append('PUNJAB')
        else:
            print('   PUNJAB: kpis bane hi nahi')
            bad.append('PUNJAB')
        vals = [str(v) for v in cli['political_lens']['tweets'].distinct('sn') if v]
        print('      tweets.sn me ab: %s' % ', '.join(sorted(vals)))
    except Exception as e:
        print('   PUNJAB: padha nahi gaya (%s)' % e)
        bad.append('PUNJAB')
    cli.close()
    return bad


# -------------------------------------------------------------------- 8 live
def step_live():
    live = os.path.join(DASH, 'START_LIVE.bat')
    if not os.path.isfile(live):
        print('   !! START_LIVE.bat nahi mili')
        return
    try:
        subprocess.Popen(['cmd', '/c', 'start', '', live], cwd=DASH, shell=False)
        print('   START_LIVE.bat chala diya --')
        print('     - server:  http://localhost:3000  (aur /up, /punjab)')
        print('     - har 1 ghante apne aap update')
        print('   Us window ko band mat karna -- wahi loop chala rahi hai.')
    except Exception as e:
        print('   !! chala nahi paaya: %s' % e)
        print('      khud double-click kar do: DASHBOARD\\START_LIVE.bat')


# -------------------------------------------------------------------- main
def main():
    print('\n' + '#' * 70)
    print('#  FRESH SETUP  --  is laptop par sab naye sire se')
    print('#  Folder  : %s' % HERE)
    print('#  MongoDB : %s   [%s]' % (hide(URL), URL_SRC))
    print('#  Mitega  : %s' % ', '.join(DERIVED))
    print('#  Safe    : %s.%s (asli tweets) + saari config' % (SOURCE_DB, SOURCE_COLL))
    print('#' * 70)

    bar('1. FOLDER')
    if not step_layout():
        return 1

    bar('2. CODE (saare Sept ke changes lage hain ya nahi)')
    if not step_code():
        return 1

    bar('3. MONGODB -- abhi kya hai')
    n = step_mongo()
    if n < 1000:
        return 2

    if CHECK:
        bar('--check tha, isliye yahin ruk gaye')
        print('  Kuch nahi mitaya, kuch nahi badla.')
        print('  Asli me karne ke liye:   python FRESH_SETUP.py')
        return 0

    bar('4. PURANA BANAYA HUA DATA MITAO')
    if not step_drop():
        return 3

    t0 = time.time()
    bar('5. SAB NAYE SIRE SE BANAO  (asli tweets se -- 10-20 minute)')
    ok1, ok2 = step_build()

    if DO_PRIMARY:
        bar('6. YE LAPTOP PRIMARY')
        step_role()

    if DO_AUTOSTART:
        bar('7. WINDOWS KE SAATH APNE AAP CHALU')
        step_autostart()

    bar('8. JAANCH -- ab data me kya hai')
    bad = step_verify()

    bar('HO GAYA -- %d minute lage' % max(1, int((time.time() - t0) / 60)))
    if not ok1:
        print('  !! All India / UP ka build FAIL hua -- step 5 ka error dekho.')
        print('     Wahi error bhej dena, usi se asli wajah pata chalegi.')
        return 4
    if bad:
        print('  !! In me nayi sentiment category 0 hain: %s' % ', '.join(bad))
        print('     Upar ka poora output bhej dena.')
        return 5
    print('  Sab theek -- teeno dashboard ka data naya hai,')
    print('  aur aathon sentiment category me asli ginti hai.')
    if not ok2:
        print('  (Punjab ka build fail hua tha -- All India / UP theek hain.)')

    if DO_LIVE:
        bar('9. LIVE')
        step_live()
        print('\n  Browser me ek baar  Ctrl + Shift + R  zaroor dabana.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\n  Rok diya.')
        sys.exit(1)
