# -*- coding: utf-8 -*-
"""
hot_switch.py  --  turn the Atlas HOT store on / off safely (used by HOT_ON.bat / HOT_OFF.bat / HOT_STATUS.bat).

  on     : test Atlas (throwaway db) -> enable in db_config.local.json -> indexes + copy last N days
           -> copy current dashboards -> restart the website -> health check.  Stops at the first problem
           and leaves HOT OFF, so the website keeps working exactly as before.
  off    : disable HOT and restart the website (everything reads the local database again).
  status : what HOT is doing now (size, per-day counts, last copy).
The password in the connection string is never printed.
"""
import os, sys, json, time, subprocess, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CFG = os.path.join(ROOT, 'db_config.local.json')
PY = sys.executable


def say(m=''):
    print(m, flush=True)


def load():
    return json.load(open(CFG, encoding='utf-8'))


def save(d):
    tmp = CFG + '.tmp'
    json.dump(d, open(tmp, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    os.replace(tmp, CFG)


def run(args, timeout=3600):
    r = subprocess.run([PY, '-u'] + args, cwd=HERE, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=timeout)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def pipeline_running():
    out = subprocess.run(["powershell", "-NoProfile", "-Command",
                          "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run_pipeline\\.py' } | Measure-Object | ForEach-Object { $_.Count }"],
                         capture_output=True, text=True).stdout.strip()
    return out not in ('', '0')


def restart_server():
    pids = subprocess.run(["powershell", "-NoProfile", "-Command",
                           "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\\.js' -and $_.CommandLine -notmatch 'PunjabLens' } | ForEach-Object { $_.ProcessId }"],
                          capture_output=True, text=True).stdout.split()
    for p in pids:
        subprocess.run(["taskkill", "/F", "/PID", p], capture_output=True)
    if not pids:
        say("   (website was not running -- start it with START_LIVE.bat)")
        return None
    for _ in range(18):
        time.sleep(5)
        try:
            body = urllib.request.urlopen("http://localhost:3000/healthz", timeout=10).read().decode()
            return json.loads(body)
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read().decode())
            except Exception:
                return {'ok': False}
        except Exception:
            pass
    return None


def push_current_dashboards():
    """Copy the dashboards that are live right now (local) to Atlas and stamp them."""
    sys.path.insert(0, HERE)
    import importlib, hot_conf, hot_push
    importlib.reload(hot_conf); importlib.reload(hot_push)
    from pymongo import MongoClient
    from mongo_conf import MONGO_URL
    import datetime
    loc = MongoClient(MONGO_URL)
    since = datetime.datetime.now(datetime.timezone.utc)
    ok = True
    for dbn in ('india_Pulse', 'up_pulse'):
        db = loc[dbn]
        data = {c: list(db[c].find({})) for c in hot_push.COLLS}
        lu = (db['meta'].find_one({'key': 'lastUpdate'}) or {}).get('value', '')
        ok = hot_push.push(dbn, data, log=say) and hot_push.stamp(dbn, lu, since, log=say) and ok
    return ok


def on():
    say("== HOT ON ==")
    d = load()
    url = (d.get('hot') or {}).get('url', '')
    if not url or not url.startswith('mongodb'):
        say("STOP: db_config.local.json me 'url' khaali hai. Pehle Atlas ka connection string paste karo."); return 1
    if '<password>' in url or '<db_password>' in url:
        say("STOP: url me abhi bhi <password> likha hai -- asli password daalo."); return 1
    if pipeline_running():
        say("STOP: pipeline abhi chal raha hai. 10-15 minute baad dobara chalao."); return 1
    say("1. Atlas test (throwaway database)...")
    rc, out = run([os.path.join(ROOT, 'tools', 'test_hot.py')], timeout=600)
    for l in out.splitlines():
        if l[:2] in ('ur', '1.', '2.', '3.', '4.', '5.', '6.', '7.') or 'RESULT' in l or 'FAIL' in l or 'Error' in l:
            say('   ' + l[:200])
    if rc != 0 or 'RESULT: OK' not in out:
        say("STOP: Atlas test fail hua. HOT band hi rahega. (Network Access me Laptop ka IP add hai? password sahi hai?)")
        say(out[-800:]); return 1
    say("2. HOT on kar rahe hain (db_config.local.json: enabled=true, db=pulse_hot)")
    d['hot']['enabled'] = True
    d['hot']['db'] = d['hot'].get('db') or 'pulse_hot'
    if d['hot']['db'] == 'pulse_hot_test':
        d['hot']['db'] = 'pulse_hot'
    save(d)
    try:
        say("3. Indexes + pichhle %s din ke tweets Atlas par copy (kuch minute)..." % d['hot'].get('days', 7))
        rc, out = run(['hot_sync.py', '--resync', '--force'], timeout=3600)
        say('   ' + ' | '.join(l for l in out.splitlines() if l.startswith(('hot indexes', 'resync')))[:300])
        if rc != 0:
            raise RuntimeError(out[-600:])
        rc, out = run(['hot_sync.py', '--check'])
        say('   ' + ' | '.join(l for l in out.splitlines() if l.startswith(('check', 'HOT')))[:300])
        say("4. Abhi ke dashboards Atlas par copy...")
        if not push_current_dashboards():
            raise RuntimeError("dashboard copy fail")
    except Exception as e:
        say("STOP: %s" % str(e)[:400])
        d['hot']['enabled'] = False; save(d)
        say("HOT wapas BAND kar diya -- website pehle jaisi chal rahi hai."); return 1
    say("5. Website restart...")
    h = restart_server()
    hot = ((h or {}).get('checks') or {}).get('hot') or {}
    say("   website ok=%s | hot enabled=%s healthy=%s window=%s" % ((h or {}).get('ok'), hot.get('enabled'), hot.get('healthy'), hot.get('windowStart')))
    say("\nHO GAYA. HOT chalu hai. Band karna ho to HOT_OFF.bat.")
    return 0


def off():
    say("== HOT OFF ==")
    d = load(); d.setdefault('hot', {})['enabled'] = False; save(d)
    say("1. db_config.local.json: hot.enabled = false")
    h = restart_server()
    say("2. Website restart: ok=%s  -- ab sab kuch local database se." % ((h or {}).get('ok')))
    return 0


def status():
    say("== HOT STATUS ==")
    rc, out = run(['hot_sync.py', '--status']); say(out.strip()[-600:])
    if json.loads(out.strip().splitlines()[-1] or '{}').get('enabled'):
        rc, out = run(['hot_sync.py', '--check']); say(out.strip()[-1500:])
    return 0


if __name__ == '__main__':
    cmd = (sys.argv[1:] or ['status'])[0]
    sys.exit({'on': on, 'off': off, 'status': status}.get(cmd, status)())
