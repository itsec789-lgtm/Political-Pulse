# -*- coding: utf-8 -*-
"""
mapping_sync.py  --  Mapping.xlsx hi SACH hai. Ye use dashboard tak pahunchata hai.

Chalao:
   python mapping_sync.py --check     # sirf report, kuch nahi badlega
   python mapping_sync.py             # sach me sync karo

Ye koi naya system nahi hai -- jo scripts pehle se hain, unhi ko sahi kram me
chalata hai aur beech me FARAK (diff) nikaal kar likh deta hai:

    Mapping.xlsx
        |  rebuild_mapping.py
        v
    handle_master.json          <- yahan PURANI aur NAYI ka farak nikalta hai
        |  push_mapping_to_mongo.py
        v
    master_tweets (Mongo)
        |  update_dashboard.py  (pipeline khud chalata hai)
        v
    dashboard

Har baar ek status file bhi likhi jaati hai -- data/mapping_sync.json.
Panel usi se dikhata hai ki aakhri sync kab hui aur kya badla.
"""
import os, sys, json, subprocess, shutil, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
MAPJSON = os.path.join(HERE, 'data', 'handle_master.json')
STATUS = os.path.join(HERE, 'data', 'mapping_sync.json')
# Mongo me AAKHRI baar jo mapping gayi thi, uski copy.
# DHYAN: farak isi se naapte hain, handle_master.json se NAHI --
# kyunki handle_master ko rebuild_mapping (aur RUN_MAPPING_UPDATE.bat) kabhi
# bhi dobara likh deta hai. Agar usi se naapte to rebuild ke baad "koi
# badlaav nahi" dikhta aur Mongo kabhi update hi nahi hota.
SYNCED = os.path.join(HERE, 'data', 'mapping_synced.json')
XLSX = os.path.join(HERE, '..', 'Mapping', 'Mapping.xlsx')

# wahi 10 field jinpar nazar rakhni hai (mapping ka naam -> dikhne wala naam)
WATCH = [
    ('state',             'State'),
    ('ac_pc_no',          'AC/PC No'),
    ('ac_pc_name',        'AC/PC NAME'),
    ('ac_name',           'AC Name'),
    ('pc_name',           'PC Name'),
    ('name',              'Candidate Name'),
    ('gender',            'Gender'),
    ('party',             'Political Party'),
    ('category',          'Category'),
    ('party_designation', 'Party Designation'),
    ('admin_designation', 'Admin Designation'),
]
BLANK = ('', '-', '—', 'nan', 'None', 'null')


def now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def log(m):
    print('[Mapping Sync] ' + m)
    sys.stdout.flush()


def val(v):
    s = str(v if v is not None else '').strip()
    return '' if s in BLANK else s


def load(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def norm_handle(h):
    """@ABC, abc, https://x.com/ABC -- sab ek hi pehchaan."""
    h = str(h or '').strip()
    if '/' in h:
        h = h.rstrip('/').split('/')[-1].split('?')[0]
    return h.lstrip('@').strip().lower()


def diff(old, new):
    """purani aur nayi mapping ka farak: kya juda, kya badla, kya hata."""
    o = {norm_handle(k): v for k, v in old.items()}
    n = {norm_handle(k): v for k, v in new.items()}
    added = sorted(set(n) - set(o))
    removed = sorted(set(o) - set(n))
    modified = []
    for h in sorted(set(o) & set(n)):
        ch = []
        for key, label in WATCH:
            a, b = val(o[h].get(key)), val(n[h].get(key))
            if a != b:
                ch.append({'field': label, 'old': a or '-', 'new': b or '-'})
        if ch:
            modified.append({'handle': n[h].get('handle') or h, 'changes': ch})
    return {'added': added, 'modified': modified, 'removed': removed}


def validate(mp):
    """Mapping theek hai ya nahi. Kharab ho to sync ROK dete hain --
       aadhi-adhuri mapping se poora dashboard bigad jaata hai."""
    errs, warns = [], []
    if not mp:
        errs.append('Mapping khaali hai ya padhi nahi gayi')
        return errs, warns
    if len(mp) < 100:
        errs.append('Sirf %d handle mile -- itni chhoti mapping shaq paida karti hai' % len(mp))
    seen = {}
    for k, v in mp.items():
        h = norm_handle(k)
        if not h:
            warns.append('ek row me Twitter Account khaali hai')
            continue
        # DHYAN: 'PratapGrewal2' aur 'pratapgrewal2' DONO mapping me hote hain --
        # ye rebuild_mapping jaan-boojhkar banata hai (Mongo me tweets dusre case
        # me pade hain). Wo galti nahi hai. Isliye duplicate tabhi maante hain
        # jab dono ka DATA alag ho -- tab sach me tay nahi hota ki kaun sahi hai.
        if h in seen:
            a, b = seen[h], v
            clash = [lbl for key, lbl in WATCH if val(a.get(key)) != val(b.get(key))]
            if clash:
                warns.append('Duplicate Twitter Account: @%s -- alag-alag value: %s'
                             % (h, ', '.join(clash)))
            continue
        seen[h] = v
        if not val(v.get('name')):
            warns.append('@%s ka Candidate Name khaali hai' % h)
    return errs, warns[:50]


def run(script, args, check):
    cmd = [sys.executable, os.path.join(HERE, script)] + args
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    if p.returncode != 0:
        out = (p.stderr or p.stdout) or ''
        # Sabse aam wajah: Excel padhne wala purza (openpyxl) is Python me
        # nahi hai. Pandas ki lambi ImportError me se asli baat dhoondhni
        # padti thi -- ab seedha ilaaj likh dete hain.
        if 'openpyxl' in out:
            raise RuntimeError(
                'Excel padhne wala purza (openpyxl) is Python me nahi hai.'
                '  Ilaaj: DASHBOARD\\FIX_EXCEL_READER.bat chalao,'
                ' ya ye command: "%s" -m pip install openpyxl' % sys.executable)
        raise RuntimeError('%s fail: %s' % (script, out[-400:]))
    return p.stdout


def write_status(d):
    d['at'] = now()
    try:
        with open(STATUS, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        up = os.path.join(HERE, '..', 'UP-DASHBOARD', 'data', 'mapping_sync.json')
        if os.path.isdir(os.path.dirname(up)):
            shutil.copyfile(STATUS, up)
    except Exception as e:
        log('status likhi nahi ja saki: %s' % e)


def main():
    check = '--check' in sys.argv
    log('Started' + ('  (CHECK mode -- kuch nahi badlega)' if check else ''))

    if not os.path.exists(XLSX):
        log('FAIL -- Mapping.xlsx nahi mili: %s' % XLSX)
        write_status({'ok': False, 'why': 'Mapping.xlsx nahi mili',
                      'added': 0, 'modified': 0, 'removed': 0})
        return 1

    before = load(SYNCED)
    if before:
        log('Mongo me aakhri baar gayi mapping: %s handle' % f'{len(before):,}')
    else:
        log('Mongo me pehle kabhi mapping nahi gayi -- is baar poori bhejenge')

    # 1. Mapping.xlsx -> handle_master.json  (rebuild_mapping hi karta hai)
    try:
        if check:
            run('rebuild_mapping.py', [], True)          # report mode
            # Report mode kuch likhta nahi, isliye ABHI jo handle_master.json
            # padi hai wahi dekhte hain.
            # PEHLE yahan 'before' (aakhri bheji gayi mapping) lagti thi --
            # aur PEHLI BAAR wo khaali hoti hai, isliye --check hamesha
            # "Mapping khaali hai ya padhi nahi gayi" kehkar fail ho jaata
            # tha, chaahe mapping bilkul theek ho.
            after = load(MAPJSON) or before
            log('CHECK mode -- poora farak dekhne ke liye bina --check chalao')
        else:
            run('rebuild_mapping.py', ['--apply'], True)
            after = load(MAPJSON)
    except Exception as e:
        log('FAIL -- mapping banayi nahi ja saki: %s' % e)
        log('Dashboard PURANI mapping par chalta rahega (kuch mitaya nahi gaya)')
        write_status({'ok': False, 'why': str(e)[:300],
                      'added': 0, 'modified': 0, 'removed': 0})
        return 1

    errs, warns = validate(after)
    for w in warns:
        log('[Validation] ' + w)
    if errs:
        for e in errs:
            log('[Validation ERROR] ' + e)
        log('FAIL -- mapping kharab lagi, Mongo ko haath nahi lagaya')
        write_status({'ok': False, 'why': '; '.join(errs)[:300],
                      'added': 0, 'modified': 0, 'removed': 0,
                      'warnings': warns[:20]})
        return 1

    d = diff(before, after)
    log('Mapping rows: %s' % f'{len(after):,}')
    log('Added handles: %d' % len(d['added']))
    log('Modified handles: %d' % len(d['modified']))
    log('Removed handles: %d' % len(d['removed']))

    for m in d['modified'][:40]:
        log('')
        print('[Mapping Change] @%s' % m['handle'])
        for c in m['changes']:
            print('  %s: %s -> %s' % (c['field'], c['old'], c['new']))
    if len(d['modified']) > 40:
        log('... aur %d handle' % (len(d['modified']) - 40))
    for h in d['removed'][:20]:
        print('[Mapping Removed] @%s' % h)

    first = not before          # pehli baar -> poora push zaroori hai
    force = '--force' in sys.argv
    changed = bool(d['added'] or d['modified'] or d['removed']) or first or force
    pushed = False
    if check:
        log('CHECK mode -- Mongo nahi chhua')
    elif not changed:
        log('Koi badlaav nahi -- Mongo ko chhune ki zaroorat nahi')
    else:
        try:
            out = run('push_mapping_to_mongo.py', [], True)
            pushed = True
            log('MongoDB updated')
            # ab yahi "aakhri bheji gayi mapping" hai
            try:
                with open(SYNCED, 'w', encoding='utf-8') as f:
                    json.dump(after, f, ensure_ascii=False, indent=0)
            except Exception as e:
                log('snapshot likhi nahi ja saki: %s' % e)
            for line in out.strip().splitlines()[-6:]:
                print('   ' + line)
        except Exception as e:
            log('MongoDB update FAIL: %s' % e)
            write_status({'ok': False, 'why': 'Mongo: ' + str(e)[:250],
                          'added': len(d['added']), 'modified': len(d['modified']),
                          'removed': len(d['removed']), 'rows': len(after)})
            return 1

    write_status({
        'ok': True, 'why': '', 'rows': len(after),
        'added': len(d['added']), 'modified': len(d['modified']),
        'removed': len(d['removed']),
        'changed': changed, 'mongo': pushed, 'check': check,
        'warnings': warns[:20],
        'addedList': d['added'][:50],
        'removedList': d['removed'][:50],
        'modifiedList': d['modified'][:50],
    })
    log('Dashboard synchronization completed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
