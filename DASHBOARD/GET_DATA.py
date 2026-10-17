# -*- coding: utf-8 -*-
"""
GET_DATA.py  --  poochta hai kaunsa data chahiye, phir MongoDB se CSV bana deta hai.

Chalao:  python GET_DATA.py     (ya GET_DATA.bat par double-click)
"""
import os, csv, datetime, re, time

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
HERE = os.path.dirname(os.path.abspath(__file__))
NETDIR = r"\\192.168.2.85\d\Social Media\Exported Data"
EXCEL_LIMIT = 1048576

COLS = ['Handle','Tweet URL','Tweet ID','Tweet Date','Tweet Text','Followers','Followings',
        'Date of Joining','Total Posts','Total Comments','Total Likes','Total Retweets',
        'Total Views','Total Bookmark Tweets Times','Sentiment','Sentiment Score',
        'State','Locations','AC/PC No','AC Name','PC Name','Designation','Candidate Name',
        'Category','Party','Status']

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_BAD = re.compile(r'[\r\n\t  ]+')     # newline/tab -> row tod dete hain


def clean(v):
    """CSV safe: newline/tab hata do, extra space ek karo. Baaki value jyon ki tyon."""
    if v is None: return ''
    s = str(v)
    if _BAD.search(s):
        s = _BAD.sub(' ', s)
    return s.strip()


def ask(msg, default=''):
    v = input(msg).strip()
    return v or default


def ask_date(msg):
    while True:
        v = input(msg).strip()
        if not v: return ''
        v = v.replace('/', '-')
        if DATE_RE.match(v): return v
        print("   format galat. Aise likho: 2026-07-01")


def main():
    from pymongo import MongoClient
    c = MongoClient(MONGO_URL)[DB][COLL]
    total_all = c.estimated_document_count()

    print("=" * 58)
    print("  DATA EXPORT  (MongoDB me abhi %s tweets hain)" % f"{total_all:,}")
    print("=" * 58)
    print("\n1 = POORA data (1 Apr se aaj tak)")
    print("2 = KISI DATE RANGE ka data")
    ch = ask("\nKya chahiye? (1/2) [1]: ", "1")

    q, name = {}, "Export_" + datetime.date.today().isoformat()
    if ch == "2":
        print("\n(date aise likho: 2026-07-01   |  khaali chhodo to koi limit nahi)")
        d1 = ask_date("  KAB SE  : ")
        d2 = ask_date("  KAB TAK : ")
        rng = {}
        if d1: rng['$gte'] = d1
        if d2: rng['$lte'] = d2 + '~'
        if rng:
            q['Tweet Date'] = rng
            name += "_" + (d1 or 'start') + "_to_" + (d2 or 'today')

    print("\nExtra filter (na chahiye to Enter dabao):")
    st = ask("  State (jaise Uttar Pradesh): ")
    if st: q['State'] = st; name += "_" + st.replace(' ', '')
    cat = ask("  Category (MLA / LS_MP / Media House / Journalist / Top Leaders): ")
    if cat: q['Category'] = cat; name += "_" + cat.replace(' ', '')
    pty = ask("  Party (BJP / SP / INC ...): ")
    if pty: q['Party'] = pty; name += "_" + pty
    hnd = ask("  Handle (ek hi handle ka data): ")
    if hnd: q['Handle'] = hnd.lstrip('@'); name += "_" + hnd.lstrip('@')

    n = c.count_documents(q) if q else total_all
    print("\n  Milne wale rows: %s" % f"{n:,}")
    if n == 0:
        print("  Kuch nahi mila - filter badal kar dobara try karo."); input("\nEnter dabao..."); return

    split = (n > EXCEL_LIMIT - 1)
    if not split and n > 200000:
        split = ask("  Month-wise alag files chahiye (Excel me aasani)? (y/n) [n]: ", "n").lower() == 'y'
    if n > EXCEL_LIMIT - 1:
        print("  (rows Excel limit se zyada -> month-wise files bhi banengi)")

    # output folder (na ho to bana dega; network na mile to local X folder)
    outdir = NETDIR
    try:
        os.makedirs(outdir, exist_ok=True)
    except Exception:
        outdir = os.path.dirname(HERE)
        print("  (network folder nahi mila -> local me save: %s)" % outdir)
    out = os.path.join(outdir, name + ".csv")
    print("\n  Save ho raha hai: %s" % out)

    # NETWORK share par seedha likhna bahut slow hai -- har row SMB par jaati hai.
    # Isliye pehle LOCAL me likhte hain, aakhir me network par copy kar dete hain.
    import shutil, tempfile
    net = out
    local_tmp = None
    if out.startswith('\\\\'):
        local_tmp = os.path.join(tempfile.gettempdir(), os.path.basename(out))
        out = local_tmp
        print("  (pehle local me: %s -- baad me network par copy)" % out)

    t0 = time.time()
    cur = c.find(q, {k: 1 for k in COLS}).batch_size(5000)
    fh = open(out, 'w', encoding='utf-8-sig', newline='')
    w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
    w.writerow(COLS)
    parts, done = {}, 0
    for d in cur:
        row = [clean(d.get(k)) for k in COLS]
        w.writerow(row); done += 1
        if split:
            ym = str(d.get('Tweet Date', ''))[:7] or 'other'
            if ym not in parts:
                p = open(out.replace('.csv', '_' + ym + '.csv'), 'w', encoding='utf-8-sig', newline='')
                pw = csv.writer(p, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
                pw.writerow(COLS); parts[ym] = [p, pw, 0]
            parts[ym][1].writerow(row); parts[ym][2] += 1
        if done % 20000 == 0:
            el = time.time() - t0
            rate = done / el if el > 0 else 0
            left = (n - done) / rate if rate and n > done else 0
            print("     %s / %s rows  (%d rows/sec, ~%d min bacha)"
                  % (f"{done:,}", f"{n:,}", rate, left / 60), flush=True)
    fh.close()
    if local_tmp:
        print("\n  network par copy ho rahi hai... (%s MB)"
              % f"{os.path.getsize(local_tmp)/1e6:.0f}")
        try:
            shutil.copy2(local_tmp, net)
            os.remove(local_tmp)
            out = net
        except Exception as e:
            print("  network par copy nahi ho payi: %s" % e)
            print("  file yahan padi hai: %s" % local_tmp)
            out = local_tmp
    for ym in sorted(parts):
        parts[ym][0].close()
        print("     part %s : %s rows" % (ym, f"{parts[ym][2]:,}"))

    print("\n  DONE  ->  %s" % out)
    print("  Rows: %s | Columns: %s" % (f"{done:,}", len(COLS)))
    input("\nEnter dabao band karne ke liye...")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("\nERROR:", e)
        input("Enter dabao...")
