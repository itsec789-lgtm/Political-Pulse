# -*- coding: utf-8 -*-
"""
REPLICA_SETUP.py  --  NAYE PC par bilkul wahi dashboard khada karta hai.
==========================================================================
Ye script NAYE PC par chalti hai (purane wale par nahi).

Kram wahi hai jo aapne kaha:
    1. dekho is PC ki MongoDB me abhi kya hai
    2. usko SAAF karo (chaaron database hata do)
    3. purane PC ke dump se saari collection dobara banao
    4. jaanch karo ki ginti mil rahi hai
    5. dashboard live kar do

--------------------------------------------------------------------------
CHALANE SE PEHLE ye teen cheezein is PC par honi chahiye
--------------------------------------------------------------------------
    Python 3.10+     python.org se ("Add Python to PATH" par tick)
    Node.js 18+      nodejs.org se
    MongoDB          Community Server, service ke roop me chalti hui

Aur poora "Main Twitter Project" folder yahan copy hona chahiye --
'mongo_dump_py' folder SAMET (wahi asli data hai, ~400 MB).

--------------------------------------------------------------------------
CHALAO (project root me)
--------------------------------------------------------------------------
    python REPLICA_SETUP.py --check   <- sirf dikhao, kuch mat karo
    python REPLICA_SETUP.py           <- poochh kar sab karo
    python REPLICA_SETUP.py --yes     <- bina poochhe

    --no-live     aakhir me START_LIVE.bat mat kholo
    --primary     is PC ko primary banao (DEFAULT: secondary -- neeche padho)
    --rebuild     restore ke baad data har haal me dobara banao
    --no-rebuild  kabhi dobara mat banao, jo dump me tha wahi rakho

SENTIMENT ke aathon category (Pro-BJP, Anti-Govt, Pro-Govt, Positive,
Neutral, Anti-BJP, Negative, No-Sentiment) ke bare me:
    Ye ginti tweets me nahi, 'dashboard_data' naam ke banaye hue blob me
    hoti hai. Agar purane PC ka wo blob abhi tak 3 category wala hai to
    dump me bhi wahi aayega -- aur naye PC par bhi 0 dikhega.
    Isliye ye script restore ke baad KHUD jaanchti hai, aur 0 mila to
    asli tweets (master_tweets) se poora data yahin dobara bana deti hai.
    Yaani aathon category har haal me kaam karengi.

DHYAN: replica hamesha SECONDARY rehna chahiye. Do PC primary honge to
dono network par EK HI master CSV par likhenge aur ek doosre ka kaam
mita denge. Primary sirf ek hi rehne do.
"""
import io, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, 'DASHBOARD')
UPD = os.path.join(HERE, 'UP-DASHBOARD')
PJ = os.path.join(HERE, 'PunjabLens')
DUMP = os.path.join(HERE, 'mongo_dump_py')
PY = sys.executable or 'python'
STAMP = time.strftime('%Y%m%d_%H%M')

CHECK = '--check' in sys.argv
YES = '--yes' in sys.argv
DO_LIVE = '--no-live' not in sys.argv
WANT_ROLE = 'primary' if '--primary' in sys.argv else 'secondary'
# Restore ke baad agar nayi sentiment category 0 nikleen to asli tweets se
# data yahin dobara bana dete hain -- taaki aathon category pakka kaam karein
# chahe dump kitna hi purana ho.
FORCE_REBUILD = '--rebuild' in sys.argv
NO_REBUILD = '--no-rebuild' in sys.argv

DBS = ['pulse_master', 'india_Pulse', 'up_pulse', 'political_lens']
SYSTEM = {'admin', 'config', 'local'}

CODES = ['probjp', 'antigovt', 'progovt', 'pos', 'neu', 'antibjp', 'neg', 'none']
LABEL = {'probjp': 'Pro-BJP', 'antigovt': 'Anti-Govt', 'progovt': 'Pro-Govt',
         'pos': 'Positive', 'neu': 'Neutral', 'antibjp': 'Anti-BJP',
         'neg': 'Negative', 'none': 'No-Sentiment'}
NEW4 = ('probjp', 'progovt', 'antigovt', 'antibjp')
PJ_CODES = ['probjp', 'antigovt', 'progovt', 'positive', 'neutral',
            'antibjp', 'negative', 'nosent']
PJ_LABEL = dict(zip(PJ_CODES, ['Pro-BJP', 'Anti-Govt', 'Pro-Govt', 'Positive',
                               'Neutral', 'Anti-BJP', 'Negative', 'No-Sentiment']))

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
    (os.path.join(PJ, 'public', 'index.html'), '<section class="page" id="breaking">', 'Punjab: breaking news'),
]

# in .bat me python ka path likha hota hai -- naye PC par wo galat hoga
BATS = [os.path.join(DASH, 'START_LIVE.bat'), os.path.join(DASH, 'run_once.bat'),
        os.path.join(DASH, 'DAILY_REPORT.bat'), os.path.join(DASH, 'GET_DATA.bat'),
        os.path.join(DASH, 'RUN_MAPPING_UPDATE.bat'), os.path.join(HERE, 'UPDATE_DASHBOARD.bat'),
        os.path.join(HERE, 'FRESH_SETUP.bat'), os.path.join(HERE, 'REBUILD_ONLY.bat')]


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


def human(n):
    return format(int(n), ',')


# ------------------------------------------------------------ mongo ka pata
def mongo_url():
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
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    if URL_GUESS:
        env.pop('MONGO_URL', None)
    else:
        env['MONGO_URL'] = URL
    return env


def run(cmd, cwd, label, quiet=False):
    print('\n   > %s' % label)
    try:
        if quiet:
            r = subprocess.run(cmd, cwd=cwd, env=child_env(),
                               stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        else:
            r = subprocess.run(cmd, cwd=cwd, env=child_env())
    except Exception as e:
        print('   !! chal hi nahi paaya: %s' % e)
        return False
    if r.returncode != 0:
        print('   !! FAIL (exit %d)' % r.returncode)
        return False
    print('   ho gaya.')
    return True


def ask(q):
    if YES:
        return True
    try:
        return input('\n  ' + q + ' ').strip()
    except Exception:
        return ''


# ------------------------------------------------------------------ 1 layout
def step_layout():
    ok = True
    for p, n in [(DASH, 'DASHBOARD'), (UPD, 'UP-DASHBOARD'), (PJ, 'PunjabLens')]:
        got = os.path.isdir(p)
        print('   %-16s %s' % (n, 'mila' if got else '!! NAHI MILA'))
        ok = ok and got
    if not ok:
        print('\n   Ye script project ROOT me rakh kar chalani hai.')
        return False

    if not os.path.isdir(DUMP):
        print('   %-16s !! NAHI MILA' % 'mongo_dump_py')
        print('\n   Purane PC ka dump yahan nahi hai -- data kahan se aayega?')
        print('   Purane PC par ye chalao:   python mongo_backup.py')
        print('   phir wo poora folder yahan copy karo.')
        return False

    tot, files = 0, 0
    for dp, _, fs in os.walk(DUMP):
        for f in fs:
            try:
                tot += os.path.getsize(os.path.join(dp, f))
            except Exception:
                pass
            files += 1
    print('   %-16s mila -- %d file, %.0f MB' % ('mongo_dump_py', files, tot / 1e6))
    have = sorted(d for d in os.listdir(DUMP) if os.path.isdir(os.path.join(DUMP, d)))
    print('   dump me database : %s' % (', '.join(have) or '(khaali!)'))
    miss = [d for d in DBS if d not in have]
    if miss:
        print('   !! dump me ye nahi hain: %s' % ', '.join(miss))
    mt = os.path.join(DUMP, 'pulse_master', 'master_tweets.jsonl.gz')
    if os.path.exists(mt):
        age = (time.time() - os.path.getmtime(mt)) / 86400.0
        print('   dump ki umar      : %.1f din purana (%s)'
              % (age, time.strftime('%Y-%m-%d %H:%M', time.localtime(os.path.getmtime(mt)))))
        if age > 2:
            print('   !! ye dump purana hai. Naya chahiye to purane PC par')
            print('      pehle "python mongo_backup.py" dobara chala lo.')
    else:
        print('   !! master_tweets ka dump hi nahi mila -- asli tweets nahi aayenge.')
        return False
    return True


# ------------------------------------------------------------------- 2 tools
def step_tools():
    """Lautata hai (data_ok, node_ok).

    data_ok  -- python + pymongo. Iske bina restore ho hi nahi sakta.
    node_ok  -- node + node_modules. Ye na ho to data to aa jaayega,
                bas server nahi chalega. Isliye ise 'rok do' nahi maanta --
                warna npm ki ek hichki ki wajah se 40 minute ka restore
                dobara karna padta.
    """
    data_ok = True
    print('   python           %s' % sys.version.split()[0])
    if sys.version_info < (3, 8):
        print('   !! Python 3.8 ya usse naya chahiye')
        data_ok = False

    for pkg in ('pymongo', 'pandas'):
        try:
            __import__(pkg)
            print('   %-16s laga hai' % pkg)
            continue
        except ImportError:
            pass
        print('   %-16s NAHI -- laga rahe hain...' % pkg)
        r = subprocess.run([PY, '-m', 'pip', 'install', pkg],
                           stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        try:
            __import__(pkg)
            print('   %-16s lag gaya' % pkg)
        except ImportError:
            print('   %-16s !! nahi laga. Khud chalao:' % pkg)
            print('                    %s -m pip install %s' % (PY, pkg))
            if pkg == 'pymongo':
                data_ok = False
    # bson pymongo ke andar hi aata hai -- alag se install nahi hota
    try:
        __import__('bson')
    except ImportError:
        print('   bson             !! nahi mila. Aksar "bson" naam ka galat')
        print('                    package laga hota hai. Theek karo:')
        print('                    %s -m pip uninstall -y bson pymongo' % PY)
        print('                    %s -m pip install pymongo' % PY)
        data_ok = False

    node_ok = bool(shutil.which('node'))
    print('   node             %s'
          % (shutil.which('node') or '!! NAHI MILA -- nodejs.org se install karo'))
    for d, name in [(DASH, 'DASHBOARD'), (PJ, 'PunjabLens')]:
        if not os.path.isdir(d):
            continue
        if os.path.isdir(os.path.join(d, 'node_modules')):
            print('   %-16s node packages pehle se hain' % name)
            continue
        if not node_ok:
            print('   %-16s node hi nahi hai -- packages skip' % name)
            continue
        print('   %-16s npm install chal raha hai (2-4 min)...' % name)
        # Windows par npm asal me npm.cmd hai -- isliye string + shell=True
        r = subprocess.run('npm install', cwd=d, shell=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        if r.returncode == 0 and os.path.isdir(os.path.join(d, 'node_modules')):
            print('   %-16s ho gaya' % name)
        else:
            print('   %-16s !! npm install FAIL -- baad me khud chalana:' % name)
            print('                    cd "%s"  &&  npm install' % d)
            node_ok = False
    return data_ok, node_ok


# ------------------------------------------------------------------ 3 mongo
def step_mongo_now():
    try:
        cli = client()
        cli.admin.command('ping')
    except Exception as e:
        print('   !! MongoDB se juda nahi gaya: %s' % e)
        print('      URL: %s   [%s]' % (hide(URL), URL_SRC))
        print('      MongoDB chalu karo:   net start MongoDB')
        return None
    print('   connection OK   [%s]' % URL_SRC)
    found = []
    for d in sorted(cli.list_database_names()):
        if d in SYSTEM:
            continue
        try:
            cols = sorted(cli[d].list_collection_names())
            tot = sum(cli[d][c].estimated_document_count() for c in cols)
        except Exception:
            cols, tot = [], 0
        tag = '  <-- HATEGI' if d in DBS else '  (chhod denge)'
        print('   %-18s %5d collection %14s docs%s' % (d, len(cols), human(tot), tag))
        if d in DBS and tot:
            found.append((d, tot))
    if not found:
        print('\n   Hatane layak kuch nahi -- MongoDB pehle se saaf hai.')
    cli.close()
    return found


# ------------------------------------------------------------------ 4 clean
def step_clean(found):
    if not found:
        print('   Kuch hatana hi nahi hai -- seedha restore par jaate hain.')
        return True
    print('   Ye poori tarah hat jaayengi:')
    for d, n in found:
        print('      %-18s %s docs' % (d, human(n)))
    print('\n   (ye is NAYE PC ka data hai. Purane PC par kuch nahi hoga.)')
    if not YES:
        a = ask('Aage badhne ke liye  CLEAN  likho (aur kuch bhi = ruk jao):')
        if a != 'CLEAN':
            print('\n   Kuch nahi hataya. Sab waise ka waisa hai.')
            return False
    cli = client()
    print()
    for d, _ in found:
        try:
            cli.drop_database(d)
            print('   hat gayi   %s' % d)
        except Exception as e:
            print('   !! %s: %s' % (d, e))
    left = [d for d in cli.list_database_names() if d in DBS]
    cli.close()
    if left:
        print('\n   !! ye ab bhi hain: %s' % ', '.join(left))
        print('      MongoDB Compass khula ho to band karke dobara chalao.')
        return False
    print('\n   Saaf ho gaya.')
    return True


# ---------------------------------------------------------------- 5 restore
def step_restore():
    p = os.path.join(HERE, 'mongo_backup.py')
    if not os.path.exists(p):
        print('   !! mongo_backup.py nahi mila -- restore nahi ho sakta')
        return False
    return run([PY, p, '--restore'], HERE, 'mongo_backup.py --restore  (20-40 minute)')


# ------------------------------------------------------------------- 6 code
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
    a = os.path.join(HERE, 'APPLY_ALL_SEPT.py')
    if os.path.exists(a):
        print('\n   %d cheez nahi lagi -- APPLY_ALL_SEPT.py chala rahe hain...' % len(miss))
        return run([PY, a, '--apply'], HERE, 'APPLY_ALL_SEPT.py --apply')
    print('\n   !! %d cheez nahi lagi aur APPLY_ALL_SEPT.py bhi nahi mili.' % len(miss))
    print('      Purane PC se poora folder dobara copy karo.')
    return False


# ------------------------------------------------------------- 7 role + bat
def step_role():
    f = os.path.join(DASH, 'local_config.json')
    try:
        cur = json.load(io.open(f, encoding='utf-8')) if os.path.isfile(f) else {}
    except Exception:
        cur = {}
    was = str(cur.get('role', '')).strip().lower() or '(khaali)'
    if was == WANT_ROLE:
        print('   role pehle se %s hai' % WANT_ROLE)
    else:
        if os.path.isfile(f):
            shutil.copy2(f, f + '.bak_REPLICA_' + STAMP)
        cur['role'] = WANT_ROLE
        io.open(f, 'w', encoding='utf-8').write(json.dumps(cur, indent=1, ensure_ascii=False))
        print('   role: %s  ->  %s' % (was, WANT_ROLE))
    if WANT_ROLE == 'secondary':
        print('   (secondary = ye PC network par master CSV nahi likhega --')
        print('    dashboard poora chalega, bas backup primary hi lega)')
    else:
        print('   !! primary chuna hai -- dhyan rakhna ki DUSRA koi PC bhi')
        print('      primary na ho, warna dono ek doosre ka backup mita denge.')


def step_bats():
    """.bat files me purane PC ka python path likha hota hai. Waise to unme
    'if not exist ... set PY=python' wala fallback hai, par sahi path likh
    dena behtar hai -- warna jis PC par python PATH me nahi hai wahan
    chupchaap fail hota hai."""
    n = 0
    for b in BATS:
        if not os.path.isfile(b):
            continue
        try:
            s = io.open(b, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        new = re.sub(r'(?im)^(\s*set\s+PY=).*$', lambda m: m.group(1) + PY, s, count=1)
        if new != s:
            shutil.copy2(b, b + '.bak_REPLICA_' + STAMP)
            io.open(b, 'w', encoding='utf-8', newline='').write(new)
            n += 1
    print('   %d .bat file me is PC ka python path likh diya' % n)
    print('   (%s)' % PY)


# ----------------------------------------------------------------- 8 verify
def show(title, sent, codes, labels):
    tot = sum(int(sent.get(c, 0) or 0) for c in codes) or 1
    print('   ' + title)
    for c in codes:
        v = int(sent.get(c, 0) or 0)
        print('      %-14s %12s   %5.1f%%' % (labels[c], human(v), v * 100.0 / tot))
    print('      %-14s %12s' % ('TOTAL', human(tot)))


def step_verify():
    bad = []
    try:
        cli = client()
    except Exception as e:
        print('   !! Mongo se juda nahi gaya: %s' % e)
        return ['(mongo)']
    try:
        n = cli['pulse_master']['master_tweets'].estimated_document_count()
        print('   pulse_master.master_tweets   %s tweets' % human(n))
        if n < 1000:
            print('   !! asli tweets aaye hi nahi -- restore adhoora raha')
            bad.append('master_tweets')
    except Exception as e:
        print('   !! master_tweets padha nahi gaya: %s' % e)
        bad.append('master_tweets')
    print()
    for db, name in [('india_Pulse', 'ALL INDIA'), ('up_pulse', 'UTTAR PRADESH')]:
        try:
            d = cli[db]['dashboard_data'].find_one({'key': 'UNI'})
            sent = ((d or {}).get('value') or {}).get('sent') or {}
            if not sent:
                print('   %s: dashboard_data blob hi nahi aaya' % name)
                bad.append(name)
                continue
            show('%s  (db: %s)' % (name, db), sent, CODES, LABEL)
            if not any(int(sent.get(c, 0) or 0) for c in NEW4):
                print('      !! nayi category 0 hain (dump me purana data tha)')
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
            print('   PUNJAB: kpis nahi aaye')
            bad.append('PUNJAB')
    except Exception as e:
        print('   PUNJAB: padha nahi gaya (%s)' % e)
        bad.append('PUNJAB')
    cli.close()
    return bad


# ---------------------------------------------------------------- 8b rebuild
def step_rebuild():
    """Asli tweets se teeno dashboard ka data dobara banata hai.

    master_tweets me Sentiment ki saari asli value hoti hain (Pro-BJP,
    Anti-Govt, Pro-Govt, Anti-BJP bhi). Naya code un sab ko ginta hai.
    Isliye ek baar dobara build kar dene se aathon category bhar jaati
    hain -- chahe dump kitna hi purana ho.
    """
    ok1 = ok2 = False
    p = os.path.join(DASH, 'push_all_scopes.py')
    if os.path.exists(p):
        ok1 = run([PY, p, 'MONGO'], DASH, 'All India + UP  (push_all_scopes.py MONGO)')
    else:
        print('   !! push_all_scopes.py nahi mila')
    p2 = os.path.join(PJ, 'build_punjab_data.py')
    if os.path.exists(p2):
        ok2 = run([PY, p2, '--push'], PJ, 'Punjab  (build_punjab_data.py --push)')
        if not ok2:
            print('   (Punjab fail hua to bhi All India / UP ban chuke hain)')
    else:
        print('   !! build_punjab_data.py nahi mila')
    return ok1


# ------------------------------------------------------------------- 9 live
def step_live():
    live = os.path.join(DASH, 'START_LIVE.bat')
    if not os.path.isfile(live):
        print('   !! START_LIVE.bat nahi mili')
        return
    try:
        subprocess.Popen(['cmd', '/c', 'start', '', live], cwd=DASH)
        print('   START_LIVE.bat chala diya --')
        print('      http://localhost:3000          All India')
        print('      http://localhost:3000/up       Uttar Pradesh')
        print('      http://localhost:3000/punjab   Punjab')
        print('   Us window ko band mat karna.')
    except Exception as e:
        print('   !! chala nahi paaya: %s' % e)
        print('      khud double-click kar do: DASHBOARD\\START_LIVE.bat')


# -------------------------------------------------------------------- main
def main():
    print('\n' + '#' * 70)
    print('#  REPLICA SETUP  --  is PC par wahi dashboard, wahi data')
    print('#  Folder  : %s' % HERE)
    print('#  MongoDB : %s   [%s]' % (hide(URL), URL_SRC))
    print('#  Role    : %s' % WANT_ROLE)
    print('#' * 70)

    bar('1. FOLDER aur DUMP')
    if not step_layout():
        return 1

    bar('2. PYTHON / NODE / PACKAGES')
    data_ok, node_ok = step_tools()
    if not data_ok:
        print('\n   !! Iske bina data aa hi nahi sakta. Pehle upar wali')
        print('      cheez theek karo, phir dobara chalao.')
        return 1
    if not node_ok:
        print('\n   (node ka kaam adhoora hai -- data phir bhi aa jaayega,')
        print('    bas server aakhir me apne aap chalu nahi hoga.)')

    bar('3. IS PC KI MONGODB ME ABHI KYA HAI')
    found = step_mongo_now()
    if found is None:
        return 2

    if CHECK:
        bar('--check tha, isliye yahin ruk gaye')
        print('  Kuch nahi hataya, kuch nahi badla.')
        print('  Asli me karne ke liye:   python REPLICA_SETUP.py')
        return 0

    bar('4. PURANI DATABASE SAAF')
    if not step_clean(found):
        return 3

    t0 = time.time()
    bar('5. DUMP SE SAARI COLLECTION DOBARA BANAO')
    if not step_restore():
        print('\n   !! Restore fail hua. Upar ka error hi asli wajah hai.')
        return 4

    bar('6. CODE (saare changes lage hain ya nahi)')
    code_ok = step_code()

    bar('7. IS PC KA ROLE aur .bat ke path')
    step_role()
    step_bats()

    bar('8. JAANCH -- ginti mil rahi hai ya nahi')
    bad = step_verify()

    # dashboard ka data theek nahi hai (ya --rebuild kaha gaya) to asli
    # tweets se dobara bana do. 'master_tweets' ki gadbadi isse theek nahi
    # hoti -- wo restore ki apni problem hai, uske liye rebuild bekaar hai.
    dash_bad = [b for b in bad if b != 'master_tweets']
    if not NO_REBUILD and 'master_tweets' not in bad and (FORCE_REBUILD or dash_bad):
        if dash_bad:
            bar('8b. AATHON CATEGORY NAHI AAYIN -- ASLI TWEETS SE DOBARA BANATE HAIN')
            print('   (dump me purana 3-category wala data tha. Koi baat nahi --')
            print('    asli tweets yahan aa chuke hain, unhi se sab ban jaayega.)')
        else:
            bar('8b. DATA DOBARA BANAO  (--rebuild kaha gaya tha)')
        print('   10-20 minute lag sakte hain.')
        if step_rebuild():
            bar('8c. DOBARA JAANCH')
            bad = step_verify()
        else:
            print('\n   !! Dobara banane me dikkat aayi -- upar ka error dekho.')

    bar('HO GAYA -- %d minute lage' % max(1, int((time.time() - t0) / 60)))
    if not code_ok:
        print('  !! Code adhoora hai -- step 6 dekho.')
        return 5
    if bad:
        print('  !! Ye theek nahi lage: %s' % ', '.join(bad))
        print('     Upar ka poora output bhej dena.')
        return 6
    print('  Sab theek. Ye PC purane wale ka poora replica hai --')
    print('  wahi data, wahi teeno dashboard, wahi saare changes.')

    if DO_LIVE and node_ok:
        bar('9. LIVE')
        step_live()
        print('\n  Browser me ek baar  Ctrl + Shift + R  zaroor dabana.')
    elif DO_LIVE:
        bar('9. LIVE -- abhi nahi')
        print('  Data poora aa gaya hai, par node ke packages adhoore hain.')
        print('  Ye do command chala kar phir START_LIVE.bat kholo:')
        print('     cd "%s"  &&  npm install' % DASH)
        print('     cd "%s"  &&  npm install' % PJ)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\n  Rok diya.')
        sys.exit(1)
