# -*- coding: utf-8 -*-
# replica-kit (27-Oct): ID/password + logins rakhna, state, Atlas HOT band, ginti jaanch
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

# replica-kit (27-Oct) ------------------------------------------------------
WIPE_ALL = '--wipe-all' in sys.argv        # admin/config/local ko chhodkar saari user database hatao
KEEP_HOT = '--no-hot' not in sys.argv      # Atlas HOT / Nazar push is PC par bhi CHALU rehta hai (band karna ho: --no-hot)
EXTRA_PULSE = {'pulse_hot', 'pulse_hot_test'}   # is project ki purani/test database (agar local me hon)
KEEP = [('pulse_master', 'portal_users')]  # is PC ke apne dashboard login -- hatane ke baad wapas
KEPT = {}
NETDIR = r'\\192.168.2.85\d\Social Media'

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
    (os.path.join(DASH, 'dashboard.template.html'), 'tw-rt-split', 'All India: Tweet / Retweet KPI'),
    (os.path.join(UPD, 'dashboard.template.html'), 'tw-rt-split', 'UP: Tweet / Retweet KPI'),
    (os.path.join(DASH, 'server.js'), 'NOT_RT', 'server: retweet alag'),
    (os.path.join(DASH, 'update_dashboard.py'), 'RL_DAILY', 'All India pipeline: retweet likes/views'),
    (os.path.join(UPD, 'update_dashboard.py'), 'RL_DAILY', 'UP pipeline: retweet likes/views'),
    (os.path.join(DASH, 'summary_agg.py'), 'RL_DAILY', 'summary build (hot/cold)'),
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

    for pkg in ('pymongo', 'pandas', 'openpyxl'):
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
def test_conn(url):
    from pymongo import MongoClient
    c = MongoClient(url, serverSelectionTimeoutMS=8000)
    try:
        c.admin.command('ping')
        c.list_database_names()
        return True, ''
    except Exception as e:
        return False, str(e)
    finally:
        c.close()


def fix_auth(why):
    """Is PC ki MongoDB ko ID/password chahiye (copy ke saath purani db_config.json aa gayi).
    User apna wahi ID/password daalta hai jo pehle se bana hai -- hum use sirf db_config.json me
    likhte hain. MongoDB ke users (admin database) ko kabhi nahi chhuate."""
    global URL, URL_SRC, URL_GUESS
    if YES:
        return False
    print('   Is PC ki MongoDB ko ID/password chahiye.  (%s)' % why[:110])
    print('   Apna WAHI MongoDB ID/password daalo jo is PC par pehle se bana hai.')
    print('   Wo yahan se hataya ya badla NAHI jaayega -- sirf db_config.json me likha jaayega.')
    import getpass
    from urllib.parse import quote_plus
    try:
        user = input('   MongoDB username            : ').strip()
        pw = getpass.getpass('   MongoDB password (dikhega nahi): ')
        asrc = input('   authSource      [admin]      : ').strip() or 'admin'
        host = input('   host:port       [localhost:27017]: ').strip() or 'localhost:27017'
    except Exception:
        return False
    url = 'mongodb://%s:%s@%s/?authSource=%s' % (quote_plus(user), quote_plus(pw), host, quote_plus(asrc))
    ok, err = test_conn(url)
    if not ok:
        print('   !! ye ID/password bhi nahi chala: %s' % err[:150])
        return False
    f = os.path.join(HERE, 'db_config.json')
    try:
        cur = json.load(io.open(f, encoding='utf-8')) if os.path.isfile(f) else {}
    except Exception:
        cur = {}
    if os.path.isfile(f):
        shutil.copy2(f, f + '.bak_REPLICA_' + STAMP)
    cur['mongo_url'] = url
    io.open(f, 'w', encoding='utf-8').write(json.dumps(cur, indent=1, ensure_ascii=False))
    URL, URL_SRC, URL_GUESS = url, 'abhi daala (db_config.json me likh diya)', False
    print('   ID/password chal gaya, db_config.json me likh diya.')
    return True


def step_mongo_now():
    ok, err = test_conn(URL)
    if not ok:
        print('   !! MongoDB se juda nahi gaya: %s' % err[:200])
        print('      URL: %s   [%s]' % (hide(URL), URL_SRC))
        low = err.lower()
        if any(k in low for k in ('auth', 'unauthorized', 'credential', 'not authorized')):
            if not fix_auth(err):
                return None
        else:
            print('      MongoDB chalu karo:   net start MongoDB')
            return None
    cli = client()
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
        wipe = d in DBS or d in EXTRA_PULSE or WIPE_ALL
        tag = '  <-- HATEGI' if wipe else '  (chhod denge)'
        print('   %-18s %5d collection %14s docs%s' % (d, len(cols), human(tot), tag))
        if wipe and (tot or cols):
            found.append((d, tot))
    print('   admin / config / local aur MongoDB ke ID-password: kabhi nahi chhuate.')
    kept_note = ', '.join('%s.%s' % k for k in KEEP)
    print('   is PC ke apne dashboard login (%s): hatane se pehle rakh lenge, restore ke baad wapas.' % kept_note)
    if not found:
        print('\n   Hatane layak kuch nahi -- MongoDB pehle se saaf hai.')
    cli.close()
    return found


# ------------------------------------------------------------------ 4 clean
def keep_capture(cli, names):
    """KEEP wali collection ke docs file me bhi likh lete hain aur memory me bhi. Pichhli koshish
    adhoori reh gayi ho to wahi purani file use hoti hai (warna dump wale login galti se 'apne' ban jaate)."""
    from bson import json_util
    kd = os.path.join(HERE, 'replica_keep')
    pend = os.path.join(kd, 'PENDING')
    for (d, c) in KEEP:
        fp = os.path.join(kd, '%s.%s.json' % (d, c))
        if os.path.exists(pend) and os.path.exists(fp):
            docs = json_util.loads(io.open(fp, encoding='utf-8').read())
            KEPT[(d, c)] = docs
            print('   rakhe hue %s.%s: %d (pichhli koshish ki file se)' % (d, c, len(docs)))
            continue
        docs = []
        if d in names:
            try:
                docs = list(cli[d][c].find({}))
            except Exception as e:
                print('   (%s.%s padha nahi gaya: %s)' % (d, c, e))
        KEPT[(d, c)] = docs
        if docs:
            os.makedirs(kd, exist_ok=True)
            io.open(fp, 'w', encoding='utf-8').write(json_util.dumps(docs))
            io.open(pend, 'w').write(STAMP)
        print('   rakh liye   %s.%s   %d entries   (restore ke baad wapas aayengi)' % (d, c, len(docs)))


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
    names = [d for d, _ in found]
    keep_capture(cli, names)
    print()
    for d, _ in found:
        try:
            cli.drop_database(d)
            print('   hat gayi   %s' % d)
        except Exception as e:
            print('   !! %s: %s' % (d, e))
    left = [d for d in cli.list_database_names() if d in names]
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
    return run([PY, p, '--restore'], HERE, 'mongo_backup.py --restore  (30-60 minute)')


def step_keep_restore():
    """Dump ke saath purane PC ke login aa gaye -- agar is PC ke apne login the to wahi wapas."""
    had = {k: v for k, v in KEPT.items() if v}
    if not had:
        print('   is PC par pehle koi dashboard login nahi tha -- dump wale (purane PC ke) login rakhe gaye.')
        return True
    cli = client()
    ok = True
    for (d, c), docs in had.items():
        try:
            col = cli[d][c]
            col.delete_many({})
            col.insert_many(docs)
            print('   %s.%s: is PC ke apne %d login wapas daal diye (dump wale hata diye)' % (d, c, len(docs)))
        except Exception as e:
            print('   !! %s.%s wapas nahi aaye: %s' % (d, c, e))
            print('      File me safe hain: replica_keep\\%s.%s.json' % (d, c))
            ok = False
    cli.close()
    if ok:
        pend = os.path.join(HERE, 'replica_keep', 'PENDING')
        try:
            if os.path.exists(pend):
                os.remove(pend)           # hamara apna marker
        except Exception:
            pass
    return ok


def step_state():
    """Dump ke waqt ki auto_state.json (kaun si network files ho chuki). Isse naye PC par pipeline
    wahin se aage badhti hai -- dump ke baad aayi files dobara padhi jaati hain, kuch chhootta nahi."""
    src = os.path.join(DUMP, '_state', 'auto_state.json')
    dst = os.path.join(DASH, 'auto_state.json')
    if os.path.isfile(src):
        if os.path.isfile(dst):
            shutil.copy2(dst, dst + '.bak_REPLICA_' + STAMP)
        shutil.copy2(src, dst)
        print('   auto_state.json dump wali lagayi')
    else:
        print('   !! dump me auto_state.json nahi (purana dump). Folder wali hi rahegi --')
        print('      agar wo dump se NAYI hai to beech ki kuch files chhoot sakti hain.')
    for n in ('.pipeline.lock', '.push_pending', '.punjab_pending'):
        p = os.path.join(DASH, n)
        if os.path.exists(p):
            os.replace(p, p + '.bak_REPLICA_' + STAMP)
            print('   purana %s hata diya (purane PC se aaya tha)' % n)


def step_hot():
    """Atlas HOT + Nazar push is replica par bhi CHALU rehte hain (db_config.local.json jaisi hai waisi).
    Dhyan: dono PC ek hi Atlas (pulse_hot) par likhenge. Band karna ho to:  --no-hot"""
    f = os.path.join(HERE, 'db_config.local.json')
    try:
        cur = json.load(io.open(f, encoding='utf-8')) if os.path.isfile(f) else {}
    except Exception:
        cur = {}
    changed = []
    if not KEEP_HOT:
        h = cur.get('hot') or {}
        if h.get('enabled'):
            h['enabled'] = False; cur['hot'] = h; changed.append('Atlas HOT band')
        n = cur.get('nazar') or {}
        if n.get('enabled'):
            n['enabled'] = False; cur['nazar'] = n; changed.append('Nazar push band')
    b = cur.get('build') or {}
    if str(b.get('source', '')).upper() == 'SPLIT':
        try:
            cli = client()
            cnt = cli['pulse_master']['daily_summary'].estimated_document_count()
            cli.close()
        except Exception:
            cnt = 0
        if not cnt:
            b['source'] = 'MONGO'; cur['build'] = b
            changed.append('build SPLIT -> MONGO (daily_summary khaali hai)')
        else:
            print('   build source SPLIT, daily_summary %s docs -- theek' % human(cnt))
    if changed:
        if os.path.isfile(f):
            shutil.copy2(f, f + '.bak_REPLICA_' + STAMP)
        io.open(f, 'w', encoding='utf-8').write(json.dumps(cur, indent=1, ensure_ascii=False))
        for c in changed:
            print('   db_config.local.json: %s' % c)
        if not KEEP_HOT:
            print('   (--no-hot diya tha isliye is PC se Atlas par push nahi hoga.)')
    else:
        h = cur.get('hot') or {}; n = cur.get('nazar') or {}
        print('   Atlas HOT: %s   Nazar push: %s   (jaisa asli laptop par hai waisa hi)'
              % ('CHALU' if h.get('enabled') else 'band', 'CHALU' if n.get('enabled') else 'band'))
        if h.get('enabled') or n.get('enabled'):
            print('   DHYAN: asli laptop aur ye PC DONO ek hi Atlas (pulse_hot) par push karenge.')
            print('          Dono ek jaisa data banate hain, par ek saath likhne par kabhi-kabhi')
            print('          Nazar thodi der purana dikh sakta hai. Band karna ho:  --no-hot')


def step_net():
    try:
        ok = os.path.isdir(NETDIR)
    except Exception:
        ok = False
    if ok:
        print('   scraper ka network folder mila: %s' % NETDIR)
    else:
        print('   !! scraper ka network folder is PC se nahi dikh raha: %s' % NETDIR)
        print('      Dashboard + purana data chalega, par NAYA data tab tak nahi aayega jab tak')
        print('      ye folder khulta nahi (Explorer me us path ko ek baar khol ke dekho).')
    return ok


def step_counts():
    mp = os.path.join(DUMP, '_manifest.json')
    if not os.path.isfile(mp):
        print('   (dump me ginti ki list nahi -- purana dump, mila-ke dekhna possible nahi)')
        return []
    man = json.load(io.open(mp, encoding='utf-8'))
    print('   dump ka waqt: %s' % man.get('ts'))
    bad = []
    cli = client()
    tot = 0
    for db, cols in sorted(man.get('counts', {}).items()):
        for c, n in sorted(cols.items()):
            if KEPT.get((db, c)):
                print('   %-14s %-22s is PC ke apne login (%d)' % (db, c, len(KEPT[(db, c)])))
                continue
            try:
                got = cli[db][c].count_documents({})
            except Exception as e:
                got = -1
            tot += 1
            if got != n:
                bad.append('%s.%s' % (db, c))
                print('   !! %-14s %-22s dump me %s, ab %s' % (db, c, human(n), human(got) if got >= 0 else '?'))
            elif n >= 100000 or c in ('daily_summary', 'portal_users'):
                print('   %-14s %-22s %12s  barabar' % (db, c, human(n)))
    cli.close()
    print('   %d collection ki ginti dump se milayi -- %s' % (tot, 'SAB BARABAR' if not bad else '%d me farak' % len(bad)))
    return bad


# ------------------------------------------------------------------- 6 code
def step_code():
    miss = []
    for p, needle, name in MARKERS:
        try:
            got = needle in io.open(p, encoding='utf-8', errors='ignore').read()
        except Exception:
            got = False
        print('   %-42s %s' % (name, 'laga hai' if got else '!! NAHI LAGA'))
        if not got:
            miss.append(name)
    if miss:
        print('\n   !! %d cheez nahi mili. Purane PC se poora folder dobara copy karo' % len(miss))
        print('      (code apne aap patch nahi karte -- naye code par purana patch bigaad sakta hai).')
        return False
    return True


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
    print('#  REPLICA SETUP  --  is PC par wahi dashboard, wahi data, wahi pipelines')
    print('#  Folder  : %s' % HERE)
    print('#  MongoDB : %s   [%s]' % (hide(URL), URL_SRC))
    print('#  Role    : %s' % WANT_ROLE)
    print('#  Hatana  : %s' % ('saari user database (--wipe-all)' if WIPE_ALL else 'sirf Pulse ki database'))
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

    bar('3b. SCRAPER KA NETWORK FOLDER')
    step_net()

    if CHECK:
        bar('--check tha, isliye yahin ruk gaye')
        print('  Kuch nahi hataya, kuch nahi badla.')
        print('  Asli me karne ke liye:   python REPLICA_SETUP.py')
        return 0

    bar('4. PURANI DATABASE SAAF  (ID/password aur login rakhe jaate hain)')
    if not step_clean(found):
        return 3

    t0 = time.time()
    bar('5. DUMP SE SAARI COLLECTION DOBARA BANAO')
    if not step_restore():
        print('\n   !! Restore fail hua. Upar ka error hi asli wajah hai.')
        print('      Dobara chalane par is PC ke login (replica_keep folder) phir bhi safe rahenge.')
        return 4

    bar('5b. IS PC KE APNE LOGIN WAPAS')
    step_keep_restore()

    bar('5c. PIPELINE KI STATE (kaun si files ho chuki)')
    step_state()

    bar('6. CODE (saare changes lage hain ya nahi)')
    code_ok = step_code()

    bar('7. IS PC KA ROLE, .bat ke path, Atlas HOT')
    step_role()
    step_bats()
    step_hot()

    bar('8. JAANCH -- ginti dump se mil rahi hai ya nahi')
    cbad = step_counts()
    bar('8a. JAANCH -- dashboard ka data')
    bad = step_verify()
    for c in cbad:
        if c == 'pulse_master.master_tweets' and 'master_tweets' not in bad:
            bad.append('master_tweets')

    dash_bad = [b for b in bad if b != 'master_tweets']
    if not NO_REBUILD and 'master_tweets' not in bad and (FORCE_REBUILD or dash_bad):
        if dash_bad:
            bar('8b. DASHBOARD KA DATA THEEK NAHI -- ASLI TWEETS SE DOBARA BANATE HAIN')
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
    if bad or cbad:
        print('  !! Ye theek nahi lage: %s' % ', '.join(bad + [c for c in cbad if c not in bad]))
        print('     Upar ka poora output (replica_setup.log) bhej dena.')
        return 6
    print('  Sab theek. Ye PC purane wale ka poora replica hai --')
    print('  wahi data, wahi dashboard, wahi pipelines (START_LIVE har ghante chalata hai).')

    if DO_LIVE and node_ok:
        bar('9. LIVE')
        step_live()
        print('\n  Browser me ek baar  Ctrl + Shift + R  zaroor dabana.')
        print('  START_LIVE pehle run me dump ke baad aayi nayi files bhi utha lega.')
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
