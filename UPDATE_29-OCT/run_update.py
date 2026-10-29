# -*- coding: utf-8 -*-
"""
UPDATE 29-Oct-2026 -- main system ko 27 Oct se aaj tak ke saare badlaav dena.

RUN_UPDATE.bat isi ko chalata hai. Kram:
  1. project folder dhoondo (ye folder project ke andar rakha ho -- C:\\Main Twitter Project\\UPDATE_29-OCT)
  2. jo files badlengi unka BACKUP  ->  _backup_before_UPDATE_29-OCT\\
  3. nayi files copy  (nayi-files\\ -> project)
  4. syntax check (node / python)
  5. MongoDB: daily_summary dobara  (build_daily_summary.py --live --all)
  6. MongoDB: dashboard data dobara (run_pipeline.py --no-backup --force-push)
  7. dashboard server restart (port 3000 -- RUN_SERVER.bat khud dobara chalata hai)
  8. jaanch: sentiment = tweets, retweet sentiment = retweets, handle numbers = MongoDB

Kuch bhi fail ho to wahi ruk jaata hai aur batata hai. Wapas jaana ho:  RUN_UPDATE.bat --rollback
"""
import os, sys, shutil, subprocess, time, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
NEW = os.path.join(HERE, 'nayi-files')
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
    log('      Kuch nahi bigda -- purani files ' + BACKUP + ' me hain.')
    log('      Wapas jaane ke liye:  RUN_UPDATE.bat --rollback')
    sys.exit(1)


def find_root():
    for cand in [os.path.dirname(HERE)] + sys.argv[1:]:
        if cand.startswith('--'):
            continue
        if os.path.isfile(os.path.join(cand, 'DASHBOARD', 'server.js')):
            return os.path.abspath(cand)
    print('Project folder nahi mila. Ye folder (%s) project ke andar rakhiye,' % NAME)
    print('jaise  C:\\Main Twitter Project\\%s' % NAME)
    print('ya path do:  RUN_UPDATE.bat "D:\\Mera Project"')
    sys.exit(1)


ROOT = find_root()
DASH = os.path.join(ROOT, 'DASHBOARD')
BACKUP = os.path.join(ROOT, '_backup_before_' + NAME)
FILES = [l.strip() for l in open(os.path.join(HERE, 'files.txt'), encoding='utf-8') if l.strip()]


def run(cmd, cwd, title, timeout=None):
    log('--> ' + title)
    log('    ' + ' '.join(cmd))
    t = time.time()
    p = subprocess.run(cmd, cwd=cwd, timeout=timeout)
    if p.returncode != 0:
        fail('%s fail hua (exit %s)' % (title, p.returncode))
    log('    ok (%.0f s)' % (time.time() - t))


def rollback():
    if not os.path.isdir(BACKUP):
        print('Backup folder nahi mila: ' + BACKUP); sys.exit(1)
    n = 0
    for rel in FILES:
        b = os.path.join(BACKUP, rel)
        dst = os.path.join(ROOT, rel)
        if os.path.isfile(b):
            shutil.copy2(b, dst); n += 1
        elif os.path.isfile(os.path.join(BACKUP, rel + '.NEW_FILE')) and os.path.isfile(dst):
            os.remove(dst); n += 1
    print('Rollback: %d file purani halat me. Ab RUN_SERVER wali window band karke START_LIVE.bat chalaiye.' % n)
    print('(MongoDB ka data pipeline ke agle run me purane code se dobara ban jaayega.)')
    sys.exit(0)


def step_backup_and_copy():
    log('== 1. Backup + nayi files copy ==')
    if os.path.isdir(BACKUP):
        log('    backup pehle se hai (%s) -- use nahi chhedte' % BACKUP)
    for rel in FILES:
        src = os.path.join(NEW, rel)
        dst = os.path.join(ROOT, rel)
        if not os.path.isfile(src):
            fail('nayi-files me nahi mili: ' + rel)
        b = os.path.join(BACKUP, rel)
        if not os.path.exists(b) and not os.path.exists(b + '.NEW_FILE'):
            os.makedirs(os.path.dirname(b), exist_ok=True)
            if os.path.isfile(dst):
                shutil.copy2(dst, b)
            else:
                open(b + '.NEW_FILE', 'w').close()       # nayi file thi -- rollback par hatani hai
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    log('    %d file copy hui, backup: %s' % (len(FILES), BACKUP))


def step_syntax():
    log('== 2. Syntax check ==')
    for js in ['server.js', 'metrics_lib.js', 'ha_lib.js', 'verify_consistency.js']:
        run(['node', '--check', js], DASH, 'node --check ' + js)
    for py in [os.path.join(DASH, 'update_dashboard.py'), os.path.join(DASH, 'summary_agg.py'),
               os.path.join(DASH, 'build_daily_summary.py'), os.path.join(DASH, 'run_pipeline.py'),
               os.path.join(ROOT, 'UP-DASHBOARD', 'update_dashboard.py'),
               os.path.join(ROOT, 'UP-DASHBOARD', 'summary_agg.py')]:
        run([sys.executable, '-m', 'py_compile', py], DASH, 'py_compile ' + os.path.basename(py))


def step_mongo():
    log('== 3. MongoDB: daily_summary dobara (3-5 min) ==')
    run([sys.executable, 'build_daily_summary.py', '--live', '--all'], DASH, 'build_daily_summary --live --all')
    log('== 4. MongoDB: dashboard data dobara -- All India + UP + Punjab (10-15 min) ==')
    run([sys.executable, 'run_pipeline.py', '--no-backup', '--force-push'], DASH, 'run_pipeline --force-push')


def port_pid(port):
    try:
        out = subprocess.run(['netstat', '-ano'], capture_output=True, text=True).stdout
    except Exception:
        return None
    for line in out.splitlines():
        p = line.split()
        if len(p) >= 5 and p[0] == 'TCP' and p[1].endswith(':%d' % port) and p[3] == 'LISTENING':
            return p[4]
    return None


def healthy():
    import urllib.request
    try:
        with urllib.request.urlopen('http://localhost:3000/healthz', timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


def step_restart():
    log('== 5. Dashboard server restart ==')
    pid = port_pid(3000)
    if not pid:
        log('    port 3000 par server nahi chal raha -- START_LIVE.bat chala dijiye, phir jaanch dobara:')
        log('    RUN_UPDATE.bat --check')
        return False
    subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
    log('    purana server (PID %s) band kiya -- RUN_SERVER.bat ki window use khud dobara chalati hai' % pid)
    for _ in range(60):
        time.sleep(3)
        if healthy():
            log('    server wapas chalu (port 3000)')
            return True
    log('    server 3 min me wapas nahi aaya. RUN_SERVER wali window dekhiye ya START_LIVE.bat chalaiye,')
    log('    phir:  RUN_UPDATE.bat --check')
    return False


def step_check(server_up):
    log('== 6. Jaanch ==')
    sys.path.insert(0, DASH)
    from pymongo import MongoClient
    from mongo_conf import MONGO_URL
    cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    bad = 0
    s = cli['pulse_master']['daily_summary']
    tot = s.estimated_document_count(); nsv = s.count_documents({'sv': {'$ne': 2}})
    log('    daily_summary: %d docs, purane format wale: %d %s' % (tot, nsv, 'OK' if nsv == 0 else 'MISMATCH'))
    bad += nsv != 0
    for db in ['india_Pulse', 'up_pulse']:
        dd = cli[db]['dashboard_data']
        U = (dd.find_one({'key': 'UNI'}) or {}).get('value') or {}
        D = (dd.find_one({'key': 'D'}) or {}).get('value') or {}
        SD = (dd.find_one({'key': 'SENT_DAILY'}) or {}).get('value') or {}
        tw = sum(int(h.get('tw') or 0) for h in U.get('allHandles', []))
        rc = int((U.get('tot') or {}).get('rc') or 0)
        sn = sum((D.get('sentN') or {}).values())
        hr = sum(D.get('HOURLY') or [])
        srt = sum((U.get('sentRT') or {}).values())
        dsr = sum(sum(a) for a in ((SD.get('SR') or {}).get('ALL') or {}).values())
        ok = (sn == tw == hr) and (srt == rc == dsr) and rc > 0
        bad += not ok
        log('    %-12s tweets=%d sentiment=%d hourly=%d | retweets=%d retweet-sentiment=%d daily=%d  %s'
            % (db, tw, sn, hr, rc, srt, dsr, 'OK' if ok else 'MISMATCH'))
    if server_up:
        today = datetime.date.today()
        frm = (today - datetime.timedelta(days=8)).isoformat(); to = (today - datetime.timedelta(days=2)).isoformat()
        log('    handle numbers vs MongoDB (%s -> %s):' % (frm, to))
        p = subprocess.run(['node', 'verify_consistency.js', frm, to, '3000'], cwd=DASH, capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        tail = (p.stdout or '').strip().splitlines()[-1:] or ['(koi output nahi)']
        log('    ' + tail[0])
        bad += p.returncode != 0
    log('')
    if bad:
        log('XXXX  Jaanch me %d MISMATCH -- update_log.txt bhej dijiye.' % bad)
        return 1
    log('====  SAB THEEK. Update poora.  Browser me Ctrl+F5 karke dashboard dekhiye.  ====')
    return 0


if __name__ == '__main__':
    if '--rollback' in sys.argv:
        rollback()
    log('')
    log('######## %s  --  project: %s ########' % (NAME, ROOT))
    if '--check' in sys.argv:
        sys.exit(step_check(healthy()))
    step_backup_and_copy()
    step_syntax()
    step_mongo()
    up = step_restart()
    sys.exit(step_check(up))
