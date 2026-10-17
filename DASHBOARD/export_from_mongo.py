# -*- coding: utf-8 -*-
"""
export_from_mongo.py  --  MongoDB (pulse_master.master_tweets) se CSV export.

Examples:
  python export_from_mongo.py                                    # poora data
  python export_from_mongo.py --from 2026-07-01 --to 2026-08-11  # date range
  python export_from_mongo.py --state "Uttar Pradesh"            # sirf UP
  python export_from_mongo.py --category "Media House"           # sirf media
  python export_from_mongo.py --handle myogiadityanath           # ek handle
  python export_from_mongo.py --party BJP --from 2026-08-01
  python export_from_mongo.py --out "D:\\report.csv"             # apna path
  python export_from_mongo.py --split                            # Excel-safe month-wise parts

Default output folder:  \\192.168.2.85\d\Social Media   (na mile to X folder)
"""
import os, sys, csv, re, datetime
_BAD = re.compile(r'[\r\n\t\u00a0\u200b]+')


def clean(v):
    if v is None: return ''
    x = str(v)
    return _BAD.sub(' ', x).strip() if _BAD.search(x) else x.strip()

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
HERE = os.path.dirname(os.path.abspath(__file__))
NETDIR = r"\\192.168.2.85\d\Social Media\Exported Data"

COLS = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
        'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
        'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
        'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
        'Category','Party','Status']
EXCEL_LIMIT = 1048576


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if (name in a and a.index(name) + 1 < len(a)) else default


def main():
    from pymongo import MongoClient
    c = MongoClient(MONGO_URL)[DB][COLL]

    q = {}
    d_from, d_to = arg('--from'), arg('--to')
    if d_from or d_to:
        rng = {}
        if d_from: rng['$gte'] = d_from
        if d_to:   rng['$lte'] = d_to + '~'      # 'YYYY-MM-DD ...' bhi cover ho
        q['Tweet Date'] = rng
    for opt, field in [('--state','State'), ('--category','Category'), ('--party','Party'),
                       ('--handle','Handle'), ('--designation','Designation')]:
        v = arg(opt)
        if v: q[field] = v
    split = '--split' in sys.argv

    outdir = NETDIR
    try: os.makedirs(outdir, exist_ok=True)
    except Exception: outdir = os.path.dirname(HERE)
    name = 'Export_' + datetime.date.today().isoformat()
    for opt in ['--state', '--category', '--party', '--handle']:
        v = arg(opt)
        if v: name += '_' + str(v).replace(' ', '')
    if d_from or d_to: name += '_' + (d_from or 'start') + '_to_' + (d_to or 'today')
    out = arg('--out') or os.path.join(outdir, name + '.csv')

    print("Query:", q if q else "(poora data)")
    total = c.count_documents(q) if q else c.estimated_document_count()
    print("Matching rows:", f"{total:,}")
    if not total:
        print("Kuch nahi mila."); return

    cur = c.find(q, {k: 1 for k in COLS}).batch_size(5000)
    parts = {}
    n = 0
    fh = open(out, 'w', encoding='utf-8-sig', newline='')
    w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator='\r\n'); w.writerow(COLS)
    for doc in cur:
        row = [clean(doc.get(k)) for k in COLS]
        w.writerow(row); n += 1
        if split:
            ym = str(doc.get('Tweet Date', ''))[:7] or 'other'
            p = parts.get(ym)
            if p is None:
                p = open(out.replace('.csv', '_' + ym + '.csv'), 'w', encoding='utf-8-sig', newline='')
                pw = csv.writer(p, quoting=csv.QUOTE_ALL, lineterminator='\r\n'); pw.writerow(COLS); parts[ym] = (p, pw, 0)
                p, pw, cnt = parts[ym]
            else:
                p, pw, cnt = parts[ym]
            pw.writerow(row); parts[ym] = (p, pw, cnt + 1)
        if n % 100000 == 0: print("  likhe:", f"{n:,}", flush=True)
    fh.close()
    for ym, (p, pw, cnt) in sorted(parts.items()):
        p.close(); print("   part", ym, f"{cnt:,} rows")
    print("\nDONE:", out)
    print("Rows:", f"{n:,}", "| Columns:", len(COLS))
    if n > EXCEL_LIMIT - 1 and not split:
        print("(Excel limit se zyada rows -- Excel me poori nahi khulegi. '--split' laga kar month-wise parts bana lo.)")


if __name__ == "__main__":
    main()
