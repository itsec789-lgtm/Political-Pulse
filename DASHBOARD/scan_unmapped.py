# -*- coding: utf-8 -*-
"""
scan_unmapped.py  --  EK BAAR chalao.

Jo handles mapping me nahi hain (needs_mapping / 77 wale), unki details
network wali RAW files se nikaalta hai (waha SAARE columns hote hain:
State, Party, Designation, Candidate Name, AC/PC...).

  1. Master data se unmapped handles ki list banata hai
  2. Saari files scan (Media Houses + journalist skip) - FULL columns
  3. Un handles ke rows se State/Party/Designation/Name/AC-PC jama karta hai
  4. handle_master.json me ADD (UP wale UP-mapping me bhi)
  5. Report: unmapped_found.csv (mil gaye) / unmapped_notfound.csv (nahi mile)

Iske baad ek baar push chala do -> woh handles dashboard me aa jaayenge.
"""
import os, sys, json, csv, datetime
from collections import defaultdict, Counter
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")
MAPJSON = os.path.join(DATA, "handle_master.json")
sys.path.insert(0, HERE)
import smart_import as SI
import phase2_push as P2   # find_files (skip-folders wala)


def log(m): print("[" + datetime.datetime.now().strftime("%H:%M:%S") + "]", m)


def bucket(s):
    x = str(s).strip().lower()
    if 'deputy chief minister' in x or x in ('dy cm', 'dycm', 'deputy cm'): return 'Dy CM'
    if 'chief minister' in x and 'former' not in x and 'ex' not in x: return 'CM'
    if x in ('ls_mp', 'ls mp', 'ls_mp candidate'): return 'LS MP'
    if x in ('rs_mp', 'rs mp'): return 'RS MP'
    if x == 'mla': return 'MLA'
    if x == 'mlc': return 'MLC'
    return None


def main():
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    lower_map = {k.lower(): k for k in mp}

    # 1) master me kaunse handles unmapped hain
    un = Counter()
    for ch in pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig',
                          usecols=lambda c: c.strip() == 'Handle', chunksize=200000):
        col = ch.columns[0]
        for h in ch[col].fillna(''):
            h = str(h).strip()
            if h and h.lower() not in lower_map:
                un[h] += 1
    targets = {h.lower(): h for h in un}
    log("Unmapped handles (master me): %d" % len(targets))
    if not targets:
        log("Sab mapped hai - kuch nahi karna."); return

    # 2) saari files full-columns se scan, sirf in handles ke attributes jama
    name = defaultdict(Counter); state = defaultdict(Counter); party = defaultdict(Counter)
    desig = defaultdict(set); acnm = defaultdict(Counter); pcnm = defaultdict(Counter)
    files = P2.find_files()
    log("Files scan hongi: %d (Media Houses + journalist ke bina)" % len(files))
    for i, f in enumerate(files, 1):
        try:
            df, _ = SI.smart_read(f, log=lambda *a: None)
        except Exception:
            continue
        hl = df['Handle'].astype(str).str.strip().str.lower()
        hit = df[hl.isin(targets)]
        if len(hit) == 0:
            continue
        log("  %-45s -> %d matching rows" % (os.path.basename(f)[:45], len(hit)))
        for r in hit.itertuples(index=False):
            d = dict(zip(hit.columns, r))
            k = str(d.get('Handle', '')).strip().lower()
            def g(c): return str(d.get(c, '')).strip()
            v = g('Designation')
            if v and v != '-': desig[k].add('MLA' if v.lower() == 'mla' else ('MLC' if v.lower() == 'mlc' else v))
            for cc, acc in [('Candidate Name', name), ('State', state), ('Party', party),
                            ('AC Name', acnm), ('PC Name', pcnm)]:
                v = g(cc)
                if v and v != '-': acc[k][v] += 1

    def prim(c, d='-'): return c.most_common(1)[0][0] if c else d

    # 3) mapping me add
    found, notfound = [], []
    for k, h in targets.items():
        st = prim(state[k], '')
        if not st and not desig[k] and not party[k]:
            notfound.append((h, un[h])); continue
        ds = sorted(desig[k]) or ['-']
        lv = sorted({b for x in ds if (b := bucket(x))}) or ['Others']
        is_mp = any(x in ('LS_MP', 'RS_MP') for x in ds)
        an = prim(acnm[k], ''); pn = prim(pcnm[k], '')
        mp[h] = {'handle': h, 'name': prim(name[k], ''), 'state': st,
                 'locations': '-', 'ac_pc_no': '-',
                 'ac_name': (an if an else '-'), 'pc_name': (pn if pn else '-'),
                 'designation_raw': ' | '.join(ds), 'designations': ds, 'levels': lv,
                 'category': (ds[0] if ds != ['-'] else '-'), 'party': prim(party[k]),
                 'status': 'Active', 'tweet_url': '', 'profile_url': 'https://x.com/' + h}
        found.append((h, st, prim(party[k]), ' | '.join(ds), un[h]))

    json.dump(mp, open(MAPJSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    log("Mapping me ADD: %d  | detail nahi mili: %d  | total mapping: %d" % (len(found), len(notfound), len(mp)))

    # UP mapping bhi
    upm = {h: mp[h] for h in mp if str(mp[h].get('state', '')).strip().lower() == 'uttar pradesh'}
    json.dump(upm, open(os.path.join(os.path.dirname(HERE), 'UP-DASHBOARD', 'data', 'handle_master_UP.json'),
                        'w', encoding='utf-8'), ensure_ascii=False, indent=0)

    # 4) reports
    X = os.path.dirname(HERE)
    with open(os.path.join(X, 'unmapped_found.csv'), 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.writer(fh); w.writerow(['Handle', 'State', 'Party', 'Designation', 'Tweets'])
        for r in sorted(found, key=lambda x: -x[4]): w.writerow(r)
    with open(os.path.join(X, 'unmapped_notfound.csv'), 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.writer(fh); w.writerow(['Handle', 'Tweets'])
        for r in sorted(notfound, key=lambda x: -x[1]): w.writerow(r)
    log("Reports: unmapped_found.csv / unmapped_notfound.csv (X folder me)")
    log("AB CHALAO:  python push_all_scopes.py \"data\\master_tweets.csv\"   (dashboard me dikhne lagenge)")


if __name__ == '__main__':
    main()
