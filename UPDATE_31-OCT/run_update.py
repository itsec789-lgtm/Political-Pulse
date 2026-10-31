# -*- coding: utf-8 -*-
"""
UPDATE 31-Oct-2026 -- main system ko 30 + 31 Oct ke saare badlaav (UPDATE_29-OCT ke baad se).

RUN_UPDATE.bat isi ko chalata hai. Kram:
  0. jaanch: project folder, node (18+), python + pymongo, MongoDB chalu
  1. dashboard server + RUN_SERVER window band (chalti .bat file badalna khatarnaak hai)
  2. jo files badlengi unka BACKUP -> _backup_before_UPDATE_31-OCT\\ , phir nayi files copy
  3. config: translate_config.json (Gemini key) daalo; x_config / ai_config sirf tab jab
     main system par na hon (wahan wali cookies hi asli hain -- unhe nahi chhedte)
  4. suraksha: keys wali files git me ignore hain ya nahi (auto_sync GitHub par na bhej de)
  5. syntax check: saari badli JS / Python files + pipeline scripts
  6. MongoDB: naye cache (AI summary, party logo, translation) -- sirf naye daalte hain
  7. Gemini key aur X cookies kaam kar rahi hain ya nahi
  8. START_LIVE.bat dobara chalao, server port 3000 par aane tak ruko
  9. aakhri jaanch

Kuch bhi fail ho to wahi ruk jaata hai. Wapas jaana ho:  RUN_UPDATE.bat --rollback
"""
import os, sys, shutil, subprocess, time, json, datetime, filecmp

HERE = os.path.dirname(os.path.abspath(__file__))
NEW = os.path.join(HERE, 'nayi-files')
CFG = os.path.join(HERE, 'config')
NAME = os.path.basename(HERE)
LOG = os.path.join(HERE, 'update_log.txt')


def log(msg=''):
    line = '[%s] %s' % (datetime.datetime.now().strftime('%H:%M:%S'), msg)
    print(line, flush=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def fail(msg):
    log('')
    log('XXXX  RUKA: ' + msg)
    log('      Purani files ' + BACKUP + ' me hain.  Wapas jaane ke liye:  RUN_UPDATE.bat --rollback')
    sys.exit(1)


def find_root():
    for cand in [os.path.dirname(HERE)] + sys.argv[1:]:
        if cand.startswith('--'):
            continue
        if os.path.isfile(os.path.join(cand, 'DASHBOARD', 'server.js')):
            return os.path.abspath(cand)
    print('Project folder nahi mila. Ye folder (%s) project ke andar rakhiye,' % NAME)
    print('jaise  C:\\Main Twitter Project\\%s' % NAME)
    sys.exit(1)


ROOT = find_root()
DASH = os.path.join(ROOT, 'DASHBOARD')
BACKUP = os.path.join(ROOT, '_backup_before_' + NAME)
FILES = [l.strip() for l in open(os.path.join(HERE, 'files.txt'), encoding='utf-8') if l.strip()]
CONFIGS = ['translate_config.json', 'x_config.json', 'ai_config.json']


def run(cmd, cwd, title, timeout=None, ok_codes=(0,)):
    log('--> ' + title)
    t = time.time()
    p = subprocess.run(cmd, cwd=cwd, timeout=timeout)
    if p.returncode not in ok_codes:
        fail('%s fail hua (exit %s)' % (title, p.returncode))
    log('    ok (%.0f s)' % (time.time() - t))


def out(cmd, cwd=None):
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    except Exception as e:
        class R: returncode = 1; stdout = ''; stderr = str(e)
        return R()


def port_pid(port):
    p = out(['netstat', '-ano'])
    for line in (p.stdout or '').splitlines():
        q = line.split()
        if len(q) >= 5 and q[0] == 'TCP' and q[1].endswith(':%d' % port) and q[3] == 'LISTENING':
            return q[4]
    return None


def healthy():
    """server jawab de raha hai? /healthz 503 bhi 'chalu' hai -- 503 ka matlab sirf data purana hai."""
    import urllib.request, urllib.error
    try:
        with urllib.request.urlopen('http://localhost:3000/healthz', timeout=5) as r:
            return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


# ---------------------------------------------------------------- steps
def step_precheck():
    log('== 0. Jaanch: node / python / MongoDB ==')
    v = out(['node', '--version']).stdout.strip()
    try:
        major = int(v.lstrip('v').split('.')[0])
    except Exception:
        major = 0
    if major < 18:
        fail('Node.js 18 ya naya chahiye (abhi: %s). nodejs.org se LTS install kijiye.' % (v or 'nahi mila'))
    log('    node %s OK' % v)
    try:
        import pymongo  # noqa
    except Exception:
        fail('python me pymongo nahi hai:  pip install pymongo')
    sys.path.insert(0, DASH)
    from pymongo import MongoClient
    from mongo_conf import MONGO_URL
    try:
        MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000).admin.command('ping')
    except Exception as e:
        fail('MongoDB se connect nahi hua (%s). Pehle MongoDB chalu kijiye.' % e)
    log('    MongoDB OK')
    for rel in FILES:
        if not os.path.isfile(os.path.join(NEW, rel)):
            fail('nayi-files me nahi mili: ' + rel)
    log('    %d nayi files maujood' % len(FILES))


def step_stop():
    log('== 1. Dashboard server + RUN_SERVER window band ==')
    # RUN_SERVER.bat badal raha hai -- chalti window purani file padhti rahe to gadbad, isliye band
    ps = ("Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'RUN_SERVER' }"
          " | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }")
    killed = out(['powershell', '-NoProfile', '-Command', ps]).stdout.split()
    if killed:
        log('    RUN_SERVER window band: ' + ', '.join(killed))
    pid = port_pid(3000)
    if pid:
        subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
        log('    server (PID %s) band' % pid)
    time.sleep(2)
    if port_pid(3000):
        fail('port 3000 abhi bhi busy hai -- dashboard ki saari window band karke dobara chalaiye')


def step_copy():
    log('== 2. Backup + nayi files copy ==')
    for rel in FILES:
        src = os.path.join(NEW, rel)
        dst = os.path.join(ROOT, rel)
        b = os.path.join(BACKUP, rel)
        if not os.path.exists(b) and not os.path.exists(b + '.NEW_FILE'):
            os.makedirs(os.path.dirname(b), exist_ok=True)
            if os.path.isfile(dst):
                shutil.copy2(dst, b)
            else:
                open(b + '.NEW_FILE', 'w').close()
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    log('    %d file copy, backup: %s' % (len(FILES), BACKUP))


def step_config():
    log('== 3. Config (keys) ==')
    for name in CONFIGS:
        src = os.path.join(CFG, name)
        dst = os.path.join(DASH, name)
        if not os.path.isfile(src):
            continue
        if not os.path.isfile(dst):
            shutil.copy2(src, dst)
            log('    %s daala (pehle nahi tha)' % name)
        elif name == 'translate_config.json' and not filecmp.cmp(src, dst, shallow=False):
            b = os.path.join(BACKUP, 'DASHBOARD', name)
            os.makedirs(os.path.dirname(b), exist_ok=True)
            if not os.path.exists(b):
                shutil.copy2(dst, b)
            shutil.copy2(src, dst)
            log('    %s naya daala (purana backup me)' % name)
        elif filecmp.cmp(src, dst, shallow=False):
            log('    %s pehle se same' % name)
        else:
            shutil.copy2(src, dst + '.from_laptop')
            log('    %s main system par alag hai -- WAHI rakha; laptop wala %s.from_laptop me' % (name, name))


def step_gitignore():
    log('== 4. Suraksha: keys git me nahi jaani chahiye ==')
    if not os.path.isdir(os.path.join(ROOT, '.git')):
        log('    git repo nahi -- skip')
        return
    bad = []
    for rel in ['DASHBOARD/translate_config.json', 'DASHBOARD/x_config.json', 'DASHBOARD/ai_config.json',
                NAME + '/config/x_config.json', NAME + '/mongo/party_logos.json']:
        if out(['git', 'check-ignore', '-q', rel], cwd=ROOT).returncode != 0:
            bad.append(rel)
    if bad:
        fail('ye files git me ignore NAHI hain (auto_sync GitHub par bhej dega): ' + ', '.join(bad))
    log('    keys / cookies / Mongo export -- sab git-ignored OK')


def step_syntax():
    log('== 5. Syntax check ==')
    js = [f for f in FILES if f.endswith('.js')] + ['DASHBOARD/metrics_lib.js', 'DASHBOARD/x_live.js']
    for f in js:
        if os.path.isfile(os.path.join(ROOT, f)):
            run(['node', '--check', f], ROOT, 'node --check ' + f)
    py = [f for f in FILES if f.endswith('.py')] + [
        'DASHBOARD/run_pipeline.py', 'DASHBOARD/build_daily_summary.py', 'DASHBOARD/update_dashboard.py',
        'DASHBOARD/summary_agg.py', 'UP-DASHBOARD/update_dashboard.py', 'UP-DASHBOARD/summary_agg.py']
    for f in py:
        if os.path.isfile(os.path.join(ROOT, f)):
            run([sys.executable, '-m', 'py_compile', f], ROOT, 'py_compile ' + f)
    # dashboard template me JS ka syntax (bina browser): har <script> node se parse
    chk = os.path.join(HERE, 'template_check.js')
    for t in ['DASHBOARD/dashboard.template.html', 'UP-DASHBOARD/dashboard.template.html']:
        run(['node', chk, os.path.join(ROOT, t)], ROOT, 'template scripts ' + t)


def step_mongo():
    log('== 6. MongoDB: naye cache (sirf naye daalte hain, purana kuch nahi hatta) ==')
    run(['node', os.path.join(HERE, 'mongo_cache.js'), 'import'], ROOT, 'mongo_cache import', timeout=600)


def step_keys():
    log('== 7. Gemini key + X cookies ==')
    p = out(['node', '-e', (
        "const fs=require('fs');let k='';try{k=JSON.parse(fs.readFileSync('translate_config.json','utf8')).gemini_key||''}catch(e){}"
        "if(!k){console.log('NOKEY');process.exit(0)}"
        "fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',{headers:{'x-goog-api-key':k.trim()}})"
        ".then(r=>{console.log('GEMINI '+r.status)}).catch(e=>console.log('NET '+e.message));"
        "try{console.log('X '+(require('./x_live.js').ready()?'READY':'NOCOOKIE'))}catch(e){console.log('X ERR')}")], cwd=DASH)
    res = (p.stdout or '').strip().replace('\n', ' | ')
    log('    ' + res)
    if 'NOKEY' in res:
        log('    !! translate_config.json me Gemini key nahi -- AI Summary / translate nahi chalega')
    elif 'GEMINI 200' not in res:
        log('    !! Gemini key se jawab theek nahi aaya -- internet / key dekhiye (baaki dashboard chalega)')
    if 'X READY' not in res:
        log('    !! X cookies (x_config.json) nahi -- party logo / profile photo live nahi aayega (baaki chalega)')


def step_start():
    log('== 8. START_LIVE.bat dobara chalao ==')
    bat = os.path.join(DASH, 'START_LIVE.bat')
    if not os.path.isfile(bat):
        fail('DASHBOARD\\START_LIVE.bat nahi mila')
    subprocess.Popen(['cmd', '/c', 'start', '"START_LIVE"', 'cmd', '/c', bat], cwd=DASH, shell=False)
    for _ in range(100):
        time.sleep(3)
        if healthy():
            log('    server chalu (port 3000)')
            return True
    log('    server 5 min me nahi aaya -- START_LIVE window dekhiye, phir:  RUN_UPDATE.bat --check')
    return False


def step_check(up):
    log('== 9. Aakhri jaanch ==')
    bad = 0
    sys.path.insert(0, DASH)
    from pymongo import MongoClient
    from mongo_conf import MONGO_URL
    m = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)['pulse_master']
    for c in ['ha_summaries', 'party_logos', 'tweet_translations']:
        log('    %-20s %d docs' % (c, m[c].estimated_document_count()))
    if not up:
        bad += 1
        log('    server: NAHI chal raha')
    else:
        log('    server: OK')
        p = out(['curl', '-s', '-o', 'NUL', '-w', '%{http_code}', 'http://localhost:3000/api/party-logo?p=BJP'])
        code = (p.stdout or '').strip()
        log('    naya route /api/party-logo: HTTP %s %s' % (code, '(OK -- login maangta hai)' if code in ('401', '200', '302') else '(??)'))
        bad += code not in ('401', '200', '302')
    log('')
    if bad:
        log('XXXX  Jaanch me %d dikkat -- update_log.txt bhej dijiye.' % bad)
        return 1
    log('====  SAB THEEK. Update poora.  Browser me Ctrl+F5 karke dashboard dekhiye.  ====')
    return 0


def rollback():
    if not os.path.isdir(BACKUP):
        print('Backup folder nahi mila: ' + BACKUP); sys.exit(1)
    n = 0
    for rel in FILES + ['DASHBOARD/translate_config.json']:
        b = os.path.join(BACKUP, rel)
        dst = os.path.join(ROOT, rel)
        if os.path.isfile(b):
            shutil.copy2(b, dst); n += 1
        elif os.path.isfile(b + '.NEW_FILE') and os.path.isfile(dst):
            os.remove(dst); n += 1
    print('Rollback: %d file purani halat me. Ab dashboard ki window band karke START_LIVE.bat chalaiye.' % n)
    print('(MongoDB ke naye cache rehne do -- purana code unhe use hi nahi karta.)')
    sys.exit(0)


if __name__ == '__main__':
    if '--rollback' in sys.argv:
        rollback()
    log('')
    log('######## %s  --  project: %s ########' % (NAME, ROOT))
    if '--check' in sys.argv:
        sys.exit(step_check(healthy()))
    step_precheck()
    if '--dry' in sys.argv:          # sirf jaanch, kuch nahi badalta
        step_gitignore(); log('dry run khatam'); sys.exit(0)
    step_stop()
    step_copy()
    step_config()
    step_gitignore()
    step_syntax()
    step_mongo()
    step_keys()
    up = step_start()
    sys.exit(step_check(up))
