# -*- coding: utf-8 -*-
"""
push_mapping_to_mongo.py  --  handle_master.json ko master_tweets par laga deta hai.

Chalao:
   python push_mapping_to_mongo.py --check     # sirf report, kuch nahi badlega
   python push_mapping_to_mongo.py             # sach me update

NIYAM (yahi sabse zaroori hai):
  * Sirf wahi field likhte hain jinme mapping ke paas ASLI value hai.
  * Mapping me '-' / khaali hai to Mongo ka purana value CHHUA TAK NAHI jaata.
    (pichhli baar AC/PC No isi galti se ud gaye the -- ab ho hi nahi sakta.)
  * Tweet Text / Views / Likes / Sentiment jaise field kabhi nahi chhedte.
"""
import os, sys, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
MAPJSON = os.path.join(HERE, 'data', 'handle_master.json')
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"

# mapping ka field  ->  Mongo ka column
FIELDS = [
    ('state',           'State'),
    ('party',           'Party'),
    ('ac_pc_no',        'AC/PC No'),
    ('ac_name',         'AC Name'),
    ('pc_name',         'PC Name'),
    ('designation_raw', 'Designation'),
    ('name',            'Candidate Name'),
    ('category',        'Category'),
    # ---- nayi Mapping ke column ----
    # Gender aur Admin Designation abhi Excel me khaali hain. Khaali value
    # kabhi nahi likhi jaati (upar wala NIYAM), isliye ye abhi Mongo ko
    # chhuenge hi nahi. Jis din Excel me bhar doge, apne aap chale jaayenge.
    ('gender',             'Gender'),
    ('party_designation',  'Party Designation'),
    ('admin_designation',  'Admin Designation'),
]
BLANK = ('', '-', '—', 'nan', 'None', 'null')


def real(v):
    """asli value hai ya khaali/dash"""
    s = str(v if v is not None else '').strip()
    return s if s not in BLANK else ''


def main():
    check = '--check' in sys.argv
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    print("mapping: %s handles" % f"{len(mp):,}")

    try:
        from pymongo import MongoClient, UpdateMany
    except ImportError:
        sys.exit("pymongo nahi mila. Chalao:  pip install pymongo")

    cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    c = cli[DB][COLL]
    try:
        total = c.estimated_document_count()
    except Exception as e:
        sys.exit("MongoDB se baat nahi ho payi: %s\n(MongoDB chalu hai?)" % e)
    print("master_tweets: %s rows\n" % f"{total:,}")

    # Mongo me kaunse handle hain (mapping se milaane ke liye)
    print("Mongo ke handles gine ja rahe hain...")
    live = {}
    for d in c.aggregate([{"$group": {"_id": "$Handle", "n": {"$sum": 1}}}], allowDiskUse=True):
        if d['_id']:
            live[str(d['_id'])] = d['n']
    print("  alag-alag handle: %s\n" % f"{len(live):,}")

    matched = [h for h in live if h in mp]
    unmapped = [h for h in live if h not in mp]
    print("  mapping me mil gaye : %s" % f"{len(matched):,}")
    print("  mapping me NAHI hain: %s  (%s tweets)"
          % (f"{len(unmapped):,}", f"{sum(live[h] for h in unmapped):,}"))
    if unmapped:
        for h in sorted(unmapped, key=lambda x: -live[x])[:10]:
            print("     %-24s %s tweets" % (h, f"{live[h]:,}"))

    # kya-kya badlega
    ops, per_field = [], collections.Counter()
    rows_touched = 0
    for h in matched:
        v = mp[h]
        st = {}
        for mk, col in FIELDS:
            val = real(v.get(mk))
            if val:                      # khaali mapping se kabhi overwrite nahi
                st[col] = val
        # SAARE category label ek array me. Yogi ka 'Category' = MLA rahega
        # (Level cards ke liye), par 'Categories' = ['MLA','Top Leaders'] hoga --
        # export me "Top Leaders" poochne par wo bhi aa jaayega.
        cl = [str(x).strip() for x in (v.get('categories') or []) if str(x).strip() not in ('', '-')]
        if not cl and real(v.get('category')):
            cl = [real(v.get('category'))]
        if cl:
            st['Categories'] = sorted(set(cl))
        if st:
            ops.append(UpdateMany({"Handle": h}, {"$set": st}))
            rows_touched += live[h]
            for k in st:
                per_field[k] += 1

    print("\n=== JO LIKHA JAAYEGA ===")
    print("  handles: %s  |  tweet rows: %s" % (f"{len(ops):,}", f"{rows_touched:,}"))
    for k, n in per_field.most_common():
        print("     %-16s %s handles" % (k, f"{n:,}"))

    if check:
        print("\n(--check: kuch nahi badla.  Chalane ke liye bina --check chalao)")
        cli.close()
        return

    print("\nUpdate chalu... (thoda waqt lagega)")
    done = 0
    for i in range(0, len(ops), 200):
        done += c.bulk_write(ops[i:i + 200], ordered=False).modified_count
        print("   %s / %s handles" % (f"{min(i+200, len(ops)):,}", f"{len(ops):,}"), end='\r')
    print("\nrows update hue: %s" % f"{done:,}")
    cli.close()

    print("\nAb chalao:")
    print("   python push_all_scopes.py MONGO")
    print("   phir START_LIVE.bat restart")


if __name__ == '__main__':
    main()
