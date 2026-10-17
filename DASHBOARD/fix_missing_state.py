# -*- coding: utf-8 -*-
"""
fix_missing_state.py  --  jin handles ka State mapping me khaali hai,
unka State TUMHARE APNE RAW DATA se bhar deta hai.

NOTE: apni taraf se koi guess nahi karta. Sirf wahi bharta hai jo tweet rows me
mil jaaye. Jo kahin nahi milta uski list bana deta hai -- wo tum khud bharoge.

Media House / Journalist / national office-bearers ko chhod deta hai
(unka state hota hi nahi).

Chalao:
   python fix_missing_state.py --check     # sirf report
   python fix_missing_state.py             # mapping + Mongo bhar do
"""
import os, sys, json, collections
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
MAPJSON = os.path.join(HERE, "data", "handle_master.json")
MASTER = os.path.join(HERE, "data", "master_tweets.csv")
TODO = os.path.join(HERE, "missing_state.csv")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"

# inka state hota hi nahi -- inhe chhodo
SKIP_DESIG = {'MEDIA_HOUSE', 'JOURNALIST'}
# ye seat wale hain -- inka state hona hi chahiye
SEAT_DESIG = {'RS_MP', 'LS_MP', 'MLA', 'MLC', 'CHIEF_MINISTER', 'DEPUTY_CHIEF_MINISTER'}


def blank(v):
    return str(v or '').strip() in ('', '-', '—')


def desigs(v):
    return {str(d).upper().replace(' ', '_') for d in (v.get('designations') or [])}


def main():
    check = '--check' in sys.argv
    mp = json.load(open(MAPJSON, encoding='utf-8'))

    need = {}
    for h, v in mp.items():
        if not blank(v.get('state')):
            continue
        ds = desigs(v)
        if ds & SKIP_DESIG:
            continue
        need[h] = v
    seat = {h: v for h, v in need.items() if desigs(v) & SEAT_DESIG}
    print("MAPPING: %s handles" % f"{len(mp):,}")
    print("   State khaali (media/journalist chhod kar): %d" % len(need))
    print("   -> inme se seat-wale (MP/MLA/MLC/CM): %d  <-- inka state hona hi chahiye" % len(seat))

    if not need:
        print("\nSab theek hai."); return

    # ---- raw data me dhoondo ----
    print("\nRaw data scan ho raha hai...")
    found = collections.defaultdict(collections.Counter)
    if os.path.exists(MASTER):
        for ch in pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig', chunksize=200000,
                              keep_default_na=False, on_bad_lines='skip',
                              usecols=lambda c: str(c).strip() in ('Handle', 'State')):
            ch = ch.rename(columns=lambda c: str(c).strip())
            if 'Handle' not in ch.columns or 'State' not in ch.columns:
                break
            s = ch[ch['Handle'].str.strip().isin(need)]
            for h, st in zip(s['Handle'].str.strip(), s['State'].astype(str).str.strip()):
                if st and st not in ('-', '—'):
                    found[h][st] += 1
    else:
        print("  (master_tweets.csv nahi mila -- sirf Mongo se try karenge)")

    # Mongo se bhi (agar CSV purani ho)
    try:
        from pymongo import MongoClient
        cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        c = cli[DB][COLL]
        for h in list(need):
            if h in found: continue
            for d in c.aggregate([{"$match": {"Handle": h, "State": {"$nin": ['', '-', '—', None]}}},
                                  {"$group": {"_id": "$State", "n": {"$sum": 1}}},
                                  {"$sort": {"n": -1}}, {"$limit": 1}]):
                found[h][d['_id']] += d['n']
        cli.close()
    except Exception as e:
        print("  (Mongo skip: %s)" % e)

    fills = {h: cnt.most_common(1)[0][0] for h, cnt in found.items() if cnt}
    todo = [h for h in need if h not in fills]
    print("\n   raw data se mil gaya : %d" % len(fills))
    print("   kahin nahi mila      : %d" % len(todo))

    if fills:
        print("\n-- ye bhare jaayenge --")
        for h, st in sorted(fills.items()):
            v = mp[h]
            print("   %-20s %-24s -> %s" % (h, str(v.get('name'))[:24], st))

    # jo nahi mile unki CSV
    seat_todo = [h for h in todo if desigs(mp[h]) & SEAT_DESIG]
    if seat_todo:
        print("\n-- inka state kahin nahi mila, tum bhar do (%s) --" % os.path.basename(TODO))
        for h in sorted(seat_todo):
            v = mp[h]
            print("   %-20s %-24s %-6s %s" % (h, str(v.get('name'))[:24],
                  str(v.get('party'))[:6], '|'.join(sorted(desigs(v)))))
    if not check and todo:
        import csv
        with open(TODO, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f, quoting=csv.QUOTE_ALL)
            w.writerow(['Handle', 'Candidate Name', 'Party', 'Designation', 'State (BHARO)'])
            for h in sorted(todo):
                v = mp[h]
                w.writerow([h, v.get('name', ''), v.get('party', ''),
                            '|'.join(sorted(desigs(v))), ''])
        print("\n   -> %s bana di (%d rows)" % (TODO, len(todo)))

    if check:
        print("\n(--check: kuch nahi badla)"); return
    if not fills:
        print("\nBharne ko kuch nahi mila."); return

    # ---- mapping ----
    for h, st in fills.items():
        mp[h]['state'] = st
    json.dump(mp, open(MAPJSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print("\nmapping me bhare: %d" % len(fills))

    # ---- Mongo ----
    try:
        from pymongo import MongoClient, UpdateMany
        cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=6000)
        c = cli[DB][COLL]
        ops = [UpdateMany({"Handle": h}, {"$set": {"State": st}}) for h, st in fills.items()]
        n = 0
        for i in range(0, len(ops), 200):
            n += c.bulk_write(ops[i:i + 200], ordered=False).modified_count
        print("Mongo rows update: %s" % f"{n:,}")
        cli.close()
    except Exception as e:
        print("Mongo skip: %s" % e)

    print("\nAb chalao:  python push_all_scopes.py MONGO")


if __name__ == "__main__":
    main()
