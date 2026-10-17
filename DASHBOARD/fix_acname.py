# -*- coding: utf-8 -*-
"""
fix_acname.py  --  purani galti theek karta hai:
  AC Name / PC Name me CODE (AC_80, PC_80) bhar gaya tha, naam ki jagah.

Sahi hona chahiye:
  AC/PC No  ->  AC_80 / PC_80        (code)
  AC Name   ->  seat ka NAAM         (MLA ke liye)
  PC Name   ->  seat ka NAAM         (MP ke liye)

Ye script:
  1. handle_master.json (mapping) theek karta hai
  2. MongoDB pulse_master.master_tweets me bhi wahi theek karta hai

Chalao:
  python fix_acname.py --check     # sirf ginti
  python fix_acname.py             # theek kar do
  (uske baad:  python push_all_scopes.py MONGO)
"""
import os, re, sys, json
from pymongo import MongoClient, UpdateMany

HERE = os.path.dirname(os.path.abspath(__file__))
MAPJSON = os.path.join(HERE, "data", "handle_master.json")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
CODE = re.compile(r'^(AC|PC)[_\s-]?\d+$', re.I)


def is_code(v):
    return bool(CODE.match(str(v or '').strip()))


def main():
    check = '--check' in sys.argv

    # ---------- 1) MAPPING ----------
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    bad_ac = [h for h, v in mp.items() if is_code(v.get('ac_name'))]
    bad_pc = [h for h, v in mp.items() if is_code(v.get('pc_name'))]
    print("MAPPING (%s handles)" % f"{len(mp):,}")
    print("   AC Name me code:", len(bad_ac), (bad_ac[:4] if bad_ac else ""))
    print("   PC Name me code:", len(bad_pc), (bad_pc[:4] if bad_pc else ""))

    # dono naam ek jaise (AC Name == PC Name) -> ek galat hai
    same = [h for h, v in mp.items()
            if str(v.get('ac_name') or '').strip() not in ('', '-')
            and str(v.get('ac_name') or '').strip().lower() == str(v.get('pc_name') or '').strip().lower()]
    print("   AC Name == PC Name (duplicate):", len(same), (same[:4] if same else ""))

    if not check:
        fixed = 0
        for h, v in mp.items():
            code = str(v.get('ac_pc_no') or '').strip().upper()
            acn = str(v.get('ac_name') or '').strip()
            pcn = str(v.get('pc_name') or '').strip()
            loc = str(v.get('locations') or '').strip()
            real = next((x for x in (acn, pcn, loc) if x and x != '-' and not is_code(x)), '')
            ds = [str(d).upper().replace(' ', '_') for d in (v.get('designations') or [])]
            # DUAL-ROLE (LS_MP + MLA/MLC): inke DO seat hote hain -- AC aur PC dono
            # sahi ho sakte hain. Inhe chhod do, ye dual_role_seats.csv se set honge.
            if 'LS_MP' in ds and ('MLA' in ds or 'MLC' in ds):
                continue
            # seat ka type: code se, warna designation se
            if code.startswith('AC'):   seat = 'AC'
            elif code.startswith('PC'): seat = 'PC'
            elif any(d in ('LS_MP', 'RS_MP') for d in ds): seat = 'PC'
            elif any(d in ('MLA', 'MLC') for d in ds):     seat = 'AC'
            else: seat = ''
            old = (acn, pcn, v.get('ac_pc_no'))
            if seat == 'AC':
                v['ac_name'] = real or '-'
                v['pc_name'] = '-'                 # MLA ka PC nahi hota
            elif seat == 'PC':
                v['pc_name'] = real or '-'
                v['ac_name'] = '-'                 # MP ka AC nahi hota
            else:
                if is_code(acn): v['ac_name'] = real or '-'
                if is_code(pcn): v['pc_name'] = real or '-'
            # code khaali ho par naam-field me code pada tha -> code sahi jagah
            if (not code or code == '-') and (is_code(acn) or is_code(pcn)):
                v['ac_pc_no'] = acn if is_code(acn) else pcn
            if (v.get('ac_name'), v.get('pc_name'), v.get('ac_pc_no')) != old: fixed += 1
        json.dump(mp, open(MAPJSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print("   -> theek kiye:", fixed)

    # ---------- 2) MONGO ----------
    c = MongoClient(MONGO_URL)[DB][COLL]
    q_ac = {"AC Name": {"$regex": r"^(AC|PC)[_\s-]?\d+$"}}
    q_pc = {"PC Name": {"$regex": r"^(AC|PC)[_\s-]?\d+$"}}
    n_ac = c.count_documents(q_ac); n_pc = c.count_documents(q_pc)
    print("\nMONGO master")
    print("   AC Name me code:", f"{n_ac:,}")
    print("   PC Name me code:", f"{n_pc:,}")

    if check:
        print("\n(--check: kuch nahi badla)"); return

    # SAARE handles ke seat-fields mapping se sync kar do (code wale + duplicate wale + baaki)
    print("   Mongo me sab handles ke AC/PC fields mapping se sync ho rahe hain...")
    ops, done = [], 0
    for h, v in mp.items():
        st = {"AC Name": (v.get('ac_name') or '-'),
              "PC Name": (v.get('pc_name') or '-'),
              "Locations": (v.get('locations') or '-')}
        # AC/PC No sirf tab likho jab mapping me sach me code ho --
        # warna raw data ka sahi code '-' se mit jaata hai.
        if is_code(v.get('ac_pc_no')):
            st["AC/PC No"] = str(v.get('ac_pc_no')).strip().upper()
        ops.append(UpdateMany({"Handle": h}, {"$set": st}))
        if len(ops) >= 500:
            c.bulk_write(ops, ordered=False); done += len(ops); ops = []
            if done % 2000 == 0: print("     handles:", f"{done:,}", flush=True)
    if ops:
        c.bulk_write(ops, ordered=False); done += len(ops)
    print("   -> handles synced:", f"{done:,}")
    dup = c.count_documents({"$expr": {"$and": [
        {"$ne": ["$AC Name", "-"]}, {"$eq": ["$AC Name", "$PC Name"]}]}})
    print("   AC Name == PC Name wale rows ab:", f"{dup:,}")
    print("   ab AC Name me code:", f"{c.count_documents(q_ac):,}",
          "| PC Name me code:", f"{c.count_documents(q_pc):,}")
    print("\nAb chalao:  python push_all_scopes.py MONGO   (phir export)")


if __name__ == "__main__":
    main()
