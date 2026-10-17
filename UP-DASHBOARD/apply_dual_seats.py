# -*- coding: utf-8 -*-
"""
apply_dual_seats.py -- dual_role_seats.csv me tumne jo AC/PC bhara hai,
usko mapping (handle_master.json) + MongoDB dono me laga deta hai.

Kaise:
  1. dual_role_seats.csv Excel me kholo
  2. "AC Name (BHARO)" / "PC Name (BHARO)" / "AC No (BHARO)" / "PC No (BHARO)" bharo
     - jo khaali chhodoge, wo waise ka waisa reh jaayega (mitega nahi)
     - jo nahi hai uske liye  -  likh do
  3. save karo (CSV hi rakhna, Excel format mat karna)
  4. python apply_dual_seats.py --check      # kya-kya badlega
     python apply_dual_seats.py              # laga do
"""
import os, re, sys, csv, json

HERE = os.path.dirname(os.path.abspath(__file__))
CSVF = os.path.join(HERE, "dual_role_seats.csv")
MAPJSON = os.path.join(HERE, "data", "handle_master.json")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
CODE = re.compile(r'^(AC|PC)[_\s-]?\d+$', re.I)


def val(r, k):
    return str(r.get(k, '') or '').strip()


def norm_code(v, kind):
    v = str(v or '').strip().upper().replace(' ', '_').replace('-', '_')
    v = re.sub(r'_+', '_', v)
    if not v: return ''
    if v.isdigit(): v = kind + '_' + v          # sirf number likha ho to prefix laga do
    return v if CODE.match(v) else ''


def main():
    check = '--check' in sys.argv
    if not os.path.exists(CSVF):
        print("CSV nahi mili:", CSVF); return
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    rows = list(csv.DictReader(open(CSVF, encoding='utf-8-sig')))
    plan = {}
    for r in rows:
        h = val(r, 'Handle')
        if not h or h not in mp: continue
        acn, pcn = val(r, 'AC Name (BHARO)'), val(r, 'PC Name (BHARO)')
        acno = norm_code(val(r, 'AC No (BHARO)'), 'AC')
        pcno = norm_code(val(r, 'PC No (BHARO)'), 'PC')
        s = {}
        if acn: s['ac_name'] = acn
        if pcn: s['pc_name'] = pcn
        if acno: s['ac_pc_no'] = acno            # AC ko priority (row-level MLA data zyada hota hai)
        elif pcno: s['ac_pc_no'] = pcno
        if s: plan[h] = s
    print("CSV rows: %d | bhare hue: %d" % (len(rows), len(plan)))
    for h, s in plan.items():
        old = mp[h]
        print("  %-18s  %s / %s / %s   ->   %s / %s / %s" % (h,
              old.get('ac_pc_no'), old.get('ac_name'), old.get('pc_name'),
              s.get('ac_pc_no', old.get('ac_pc_no')), s.get('ac_name', old.get('ac_name')),
              s.get('pc_name', old.get('pc_name'))))
    if check:
        print("\n(--check: kuch nahi badla)"); return
    if not plan:
        print("\nCSV me kuch bhara hi nahi hai."); return

    for h, s in plan.items():
        mp[h].update(s)
    json.dump(mp, open(MAPJSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print("\nmapping update:", len(plan))

    from pymongo import MongoClient, UpdateMany
    c = MongoClient(MONGO_URL)[DB][COLL]
    K = {'ac_name': 'AC Name', 'pc_name': 'PC Name', 'ac_pc_no': 'AC/PC No'}
    ops = [UpdateMany({"Handle": h}, {"$set": {K[k]: v for k, v in s.items()}})
           for h, s in plan.items()]
    n = 0
    for i in range(0, len(ops), 200):
        n += c.bulk_write(ops[i:i + 200], ordered=False).modified_count
    print("Mongo rows update:", f"{n:,}")
    print("\nAb chalao:  python push_all_scopes.py MONGO   phir   python export_from_mongo.py --split")


if __name__ == "__main__":
    main()
