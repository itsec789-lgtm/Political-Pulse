r"""
daily_report.py  --  Daily scraping report (All India + Uttar Pradesh).

Shows for BOTH scopes (toggle buttons at top):
  * TOTAL (till date)  : total tweets, handles, designation + category breakdown
  * TODAY              : tweets posted today, tweets added to DB today, new handles
  * NEW HANDLES        : auto-added to mapping today (name/state/party/designation)
  * BACKDATE SCRAPING  : which dates the tweets added today belonged to
  * SOURCE FOLDERS     : files updated today in each folder

Output: \\192.168.2.85\d\Social Media\Daily Report\daily_report_YYYY-MM-DD.html
        (+ daily_report_latest.html)   -- has a "Save as PDF" button

Run:  python daily_report.py --open      (or double-click DAILY_REPORT.bat)
"""
import os, sys, glob, csv, datetime, html

from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB, COLL = "pulse_master", "master_tweets"
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = r"\\192.168.2.85\d\Social Media\Daily Report"
BASE = r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
TODAY = datetime.date.today().isoformat()
UP_FOLDERS = ('up_mla', 'up_mp', 'uttarpradeh data', 'uttarpradesh data')


def IN(n):
    try: n = int(n)
    except Exception: return str(n)
    s = str(abs(n)); r = ''
    if len(s) > 3:
        r = ',' + s[-3:]; s = s[:-3]
        while len(s) > 2: r = ',' + s[-2:] + r; s = s[:-2]
    return ('-' if n < 0 else '') + s + r


CAT_LABEL = {
    'page': 'Official Page', 'mla': 'MLA', 'mlc': 'MLC',
    'ls_mp': 'LS MP', 'rs_mp': 'RS MP', 'top leaders': 'Top Leaders',
    'media house': 'Media House', 'journalist': 'Journalist',
    'mla contestent': 'MLA Contestent', 'mla contestant': 'MLA Contestent',
    'president of maharashtra': 'Top Leaders', 'president of maharastra': 'Top Leaders',
    '': 'Other', '-': 'Other', '(blank)': 'Other',
}
LEVELS = ['Chief Minister', 'Deputy Chief Minister', 'LS MP', 'RS MP', 'MLA',
          'MLA Contestent', 'MLC',
          'Official Page', 'Media House', 'Journalist', 'Party Functionary', 'Other']


def clean_cat(v):
    k = str(v or '').strip()
    return CAT_LABEL.get(k.lower(), k or 'Other')


def levels_of(desig):
    s = str(desig or '').strip()
    if not s or s == '-': return ['Other']
    out = []
    for part in s.split('|'):
        x = part.strip().lower()
        if not x: continue
        if 'deputy chief minister' in x: out.append('Deputy Chief Minister')
        elif 'chief minister' in x and 'former' not in x and 'ex' not in x: out.append('Chief Minister')
        elif x in ('ls_mp', 'ls mp', 'ls_mp candidate'): out.append('LS MP')
        elif x in ('rs_mp', 'rs mp'): out.append('RS MP')
        elif x == 'mla': out.append('MLA')
        elif x == 'mlc': out.append('MLC')
        elif x == 'media house': out.append('Media House')
        elif x == 'journalist': out.append('Journalist')
        elif 'mla contestent' in x or 'mla contestant' in x: out.append('MLA Contestent')
        elif any(w in x for w in ('spokesperson', 'secretary', 'president', 'coordinator',
                                  'in-charge', 'incharge', 'treasurer', 'morcha',
                                  'party head', 'senior leader', 'leader', 'minister')):
            out.append('Party Functionary')
        else: out.append('Other')
    return sorted(set(out)) or ['Other']


def agg_count(c, q, field):
    out = {}
    for r in c.aggregate([{"$match": q}, {"$group": {"_id": "$" + field, "n": {"$sum": 1}}}]):
        k = clean_cat(r["_id"])
        out[k] = out.get(k, 0) + r["n"]
    return dict(sorted(out.items(), key=lambda x: -x[1]))


def agg_levels(c, q):
    tw = {k: 0 for k in LEVELS}; hd = {k: set() for k in LEVELS}
    for r in c.aggregate([{"$match": q},
                          {"$group": {"_id": {"d": "$Designation", "c": "$Category", "h": "$Handle"},
                                      "n": {"$sum": 1}}}]):
        k0 = r["_id"] or {}
        d, cat, h = k0.get("d"), str(k0.get("c") or "").strip().lower(), k0.get("h")
        for lv in (['Official Page'] if cat == 'page' else levels_of(d)):
            tw[lv] += r["n"]
            if h: hd[lv].add(h)
    return [(k, tw[k], len(hd[k])) for k in LEVELS if (tw[k] or hd[k]) and k != 'Other']


def folder_status(only_up=False):
    rows = []
    if not os.path.isdir(BASE): return rows
    for d in sorted(os.listdir(BASE)):
        p = os.path.join(BASE, d)
        if not os.path.isdir(p): continue
        if only_up and d.lower() not in UP_FOLDERS: continue
        files = []
        for pat in ("*.csv", "*.xlsx", "*.xls", "*.xlsm"):
            files += glob.glob(os.path.join(p, pat))
        tod = [f for f in files if datetime.date.fromtimestamp(os.path.getmtime(f)).isoformat() == TODAY]
        last = max([os.path.getmtime(f) for f in files], default=0)
        rows.append({"folder": d, "files": len(files), "today": len(tod),
                     "last": (datetime.datetime.fromtimestamp(last).strftime("%d %b %H:%M") if last else "-")})
    return rows


def new_handles_today(state=None):
    rows = []
    p = os.path.join(HERE, 'new_handles_today.csv')
    try:
        if os.path.exists(p) and datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat() == TODAY:
            with open(p, encoding='utf-8-sig') as fh:
                rows = list(csv.DictReader(fh))
    except Exception:
        pass
    if state:
        rows = [r for r in rows if str(r.get('State', '')).strip().lower() == state.lower()]
    return rows


def build_stats(c, db, scope):
    """scope: None = All India | 'Uttar Pradesh' = UP"""
    base_q = {} if not scope else {"State": scope}
    total = c.count_documents(base_q) if scope else c.estimated_document_count()
    handles = len(c.distinct("Handle", base_q))
    q_today = dict(base_q); q_today["Tweet Date"] = {"$gte": TODAY, "$lte": TODAY + "~"}
    q_new = dict(base_q); q_new["_first"] = TODAY

    today_tweets = c.count_documents(q_today)
    new_docs = c.count_documents(q_new)
    # aaj ke tweets me se kitne media/journalist ke (dashboard inhe nahi ginta)
    q_today_mj = dict(q_today); q_today_mj["Category"] = {"$in": ["Media House", "Journalist"]}
    today_mj = c.count_documents(q_today_mj)

    dr = list(c.aggregate([{"$match": q_new}, {"$group": {"_id": None,
              "min": {"$min": "$Tweet Date"}, "max": {"$max": "$Tweet Date"}}}]))
    bd_min = (dr[0]["min"] or "")[:10] if dr else ""
    bd_max = (dr[0]["max"] or "")[:10] if dr else ""
    bd_dates = [(r["_id"], r["n"]) for r in c.aggregate([{"$match": q_new},
                {"$group": {"_id": {"$substr": ["$Tweet Date", 0, 10]}, "n": {"$sum": 1}}},
                {"$sort": {"n": -1}}, {"$limit": 8}])]

    # DONO scope ek hi source se ginte hain (warna UP > All India ho jaata tha)
    nh = new_handles_today(scope)          # scope=None -> saare
    new_handles = len(nh)
    if not scope and new_handles == 0:     # CSV na ho to fallback
        try: new_handles = db["handles_seen"].count_documents({"first": TODAY})
        except Exception: pass

    # naye handles ka data-coverage: kis date se kis date tak inka data nikal chuka hai
    nh_all = new_handles_today(scope)
    fold_of = {str(r.get('Handle', '')).strip(): str(r.get('Folder', '') or '') for r in nh_all}
    nh_names = [h for h in fold_of if h]
    nh_cov = []
    if nh_names:
        FULL_FROM = '2026-04-05'      # itna purana data mil gaya = backfill poora
        for r in c.aggregate([{"$match": {"Handle": {"$in": nh_names}}},
                              {"$group": {"_id": {"h": "$Handle", "c": "$Category"},
                                          "n": {"$sum": 1},
                                          "mn": {"$min": "$Tweet Date"}, "mx": {"$max": "$Tweet Date"}}}]):
            k0 = r["_id"] or {}
            h = k0.get("h"); mn = (r.get("mn") or "")[:10]; mx = (r.get("mx") or "")[:10]
            if mn and mn <= FULL_FROM:
                continue              # Apr se poora data hai -> dikhane ki zaroorat nahi
            nh_cov.append([h, clean_cat(k0.get("c")), fold_of.get(h, ''), r["n"], mn or '-', mx or '-'])
        nh_cov.sort(key=lambda x: -x[3])

    return dict(nh_cov=nh_cov, today_mj=today_mj,
                total=total, handles=handles, today=today_tweets, added=new_docs,
                new_handles=new_handles, nh_rows=nh,
                lvl=agg_levels(c, base_q), cat=agg_count(c, base_q, "Category"),
                lvl_today=agg_levels(c, q_today), cat_added=agg_count(c, q_new, "Category"),
                bd_min=bd_min, bd_max=bd_max, bd_dates=bd_dates,
                folders=folder_status(only_up=bool(scope)))


# ---------------- HTML ----------------
CSS = """
*{box-sizing:border-box}
body{font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;background:#f6f7fb;
     margin:0;padding:26px 30px;color:#1f2430;-webkit-font-smoothing:antialiased}
.head{text-align:center;padding-bottom:12px;margin-bottom:6px;border-bottom:2px solid #f1d9c6}
.title{font-size:30px;font-weight:800;letter-spacing:-.5px;color:#0f172a;line-height:1.15}
.title span{color:#EA580C}
.headbar{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.tip{font-size:10.5px;color:#94a3b8;margin-top:7px}
.sub{font-size:12.5px;color:#64748b;margin-bottom:16px}
.tabs{display:flex;gap:8px}
.tab{padding:9px 20px;border-radius:9px;border:1px solid #dbe0ea;background:#fff;cursor:pointer;
     font-size:13.5px;font-weight:600;color:#475569;transition:.15s}
.tab:hover{border-color:#EA580C;color:#EA580C}
.tab.on{background:#EA580C;border-color:#EA580C;color:#fff;box-shadow:0 2px 8px rgba(234,88,12,.28)}
.btn{padding:9px 18px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;
     font-size:13px;font-weight:600;color:#334155}
.btn:hover{background:#f1f5f9}
h2{font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#EA580C;
   margin:26px 0 10px;padding-bottom:7px;border-bottom:2px solid #f1d9c6}
.row{display:flex;gap:13px;flex-wrap:wrap;margin-bottom:6px}
.card{flex:1;min-width:172px;background:#fff;border:1px solid #e8ecf3;border-radius:12px;
      padding:15px 17px;box-shadow:0 1px 3px rgba(15,23,42,.04)}
.card .v{font-size:27px;font-weight:800;letter-spacing:-.5px;line-height:1.15}
.card .l{font-size:10.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-top:3px;font-weight:600}
.grid{display:flex;gap:15px;flex-wrap:wrap;align-items:flex-start}
.col{flex:1;min-width:320px}
.lbl{font-size:12px;color:#64748b;margin:10px 0 5px;font-weight:600}
.lbl span{font-weight:400;color:#a0aab8}
table{width:100%;border-collapse:collapse;font-size:12.8px;background:#fff;
      border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.04);margin-bottom:12px}
th{padding:9px 12px;text-align:left;font-weight:600;font-size:11.5px;letter-spacing:.4px;
   text-transform:uppercase;color:#fff}
td{padding:8px 12px;border-top:1px solid #f1f4f9;color:#334155}
tr:nth-child(even) td{background:#fbfcfe}
.note{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:11px 14px;
      margin:10px 0;font-size:12.5px;color:#9a3412}
.foot{color:#a0aab8;font-size:11px;margin-top:26px;border-top:1px solid #e8ecf3;padding-top:10px}
@page{size:A4 portrait;margin:8mm}
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{background:#fff;padding:0;font-size:11px}
  .tabs,.btn,.tip{display:none!important}
  .scope{display:block!important}
  .scope+.scope{page-break-before:always}
  .head{border-bottom:2px solid #EA580C;padding-bottom:8px;margin-bottom:10px}
  .title{font-size:22px}
  h2{margin:14px 0 7px;font-size:11.5px}
  .card{box-shadow:none;border:1px solid #e2e6ee;padding:10px 12px;min-width:150px}
  .card .v{font-size:21px}
  table{box-shadow:none;border:1px solid #e2e6ee;font-size:10.5px;page-break-inside:avoid}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  th{padding:6px 9px;font-size:9.5px}
  td{padding:5px 9px}
  .row,.grid{page-break-inside:avoid}
  .col{min-width:0;flex:1 1 46%}
}
"""


PCE = '-webkit-print-color-adjust:exact;print-color-adjust:exact;'


def tbl(rows, heads, color="#EA580C"):
    s = '<table><thead><tr style="background:%s;%s">' % (color, PCE)
    s += ''.join('<th style="background:%s;color:#fff;%s">%s</th>' % (color, PCE, h) for h in heads)
    s += '</tr></thead><tbody>'
    for i, r in enumerate(rows):
        bg = '#fbfcfe' if i % 2 else '#ffffff'
        s += '<tr style="background:%s;%s">' % (bg, PCE)
        s += ''.join('<td>%s</td>' % x for x in r) + '</tr>'
    return s + '</tbody></table>'


def card(label, val, color="#EA580C", sub=""):
    return ('<div class="card" style="border-left:4px solid %s;%s">'
            '<div class="v" style="color:%s">%s</div>'
            '<div class="l">%s</div>%s</div>'
            % (color, PCE, color, val, label,
               ('<div style="font-size:9.5px;color:#b6bfcc;margin-top:2px">%s</div>' % sub) if sub else ''))


def scope_html(s, title, subtitle, last_run):
    H = []
    H.append('<div style="font-size:18px;font-weight:700;color:#0f172a;margin:2px 0 2px">%s</div>' % title)
    H.append('<div class="sub">%s</div>' % subtitle)

    H.append('<h2>Total (till date)</h2><div class="row">')
    H.append(card("Total Tweets", IN(s['total'])))
    H.append(card("Total Handles", IN(s['handles']), "#1d4ed8"))
    H.append('</div>')
    H.append('<div class="grid">')
    H.append('<div class="col"><div class="lbl">By Designation <span>(handles with two roles counted in both)</span></div>'
             + tbl([[html.escape(k), IN(t), IN(h)] for k, t, h in s['lvl']],
                   ["Designation", "Tweets", "Handles"], "#1d4ed8") + '</div>')
    H.append('<div class="col"><div class="lbl">By Category</div>'
             + tbl([[html.escape(k), IN(v)] for k, v in s['cat'].items()],
                   ["Category", "Tweets"]) + '</div>')
    H.append('</div>')

    H.append('<h2>Today &nbsp;&middot;&nbsp; %s</h2>' % TODAY)
    files_today = sum(f["today"] for f in s['folders'])
    H.append('<div class="sub">Pipeline last run: <b>%s</b> &nbsp;|&nbsp; files updated today: <b>%s</b></div>'
             % (last_run, IN(files_today)))
    H.append('<div class="row">')
    _mj = s.get('today_mj', 0)
    _sub = ("%s politicians + %s media/journalist" % (IN(s['today'] - _mj), IN(_mj))) if _mj \
        else "Tweet Date = today"
    H.append(card("Tweets posted today", IN(s['today']), "#EA580C", _sub))
    H.append(card("Tweets added to DB", IN(s['added']), "#15803d", "including backdated"))
    H.append(card("New handles", IN(s['new_handles']), "#7c3aed", "first time seen"))
    H.append('</div>')
    if files_today and not s['added']:
        H.append('<div class="note"><b>Note:</b> %s file(s) were updated in the source folders today, '
                 'but have not been ingested yet. Run <code>run_pipeline.py</code> or keep START_LIVE.bat running.</div>'
                 % IN(files_today))
    H.append('<div class="grid">')
    if s['lvl_today']:
        H.append('<div class="col"><div class="lbl">Tweets today &mdash; by designation</div>'
                 + tbl([[html.escape(k), IN(t)] for k, t, h in s['lvl_today']],
                       ["Designation", "Tweets Today"], "#1d4ed8") + '</div>')
    if s['cat_added']:
        H.append('<div class="col"><div class="lbl">Tweets added today &mdash; by category</div>'
                 + tbl([[html.escape(k), IN(v)] for k, v in s['cat_added'].items()],
                       ["Category", "Tweets"], "#15803d") + '</div>')
    H.append('</div>')

    H.append('<h2>Backdate scraping</h2>')
    H.append('<div class="sub">Which dates did the tweets added today belong to &mdash; '
             'range: <b>%s</b> to <b>%s</b></div>' % (s['bd_min'] or "-", s['bd_max'] or "-"))
    H.append('<div class="grid">')
    if s['bd_dates']:
        H.append('<div class="col"><div class="lbl">Date-wise (tweets added today)</div>'
                 + tbl([[d, IN(n)] for d, n in s['bd_dates']],
                       ["Tweet Date", "Tweets added today"], "#0f172a") + '</div>')
    H.append('</div>')

    return ''.join(H)


def main():
    from pymongo import MongoClient
    db = MongoClient(MONGO_URL)[DB]
    c = db[COLL]

    last_run = "-"
    for fp in (os.path.join(HERE, "pipeline.log"), os.path.join(HERE, "auto_state.json")):
        try:
            last_run = datetime.datetime.fromtimestamp(os.path.getmtime(fp)).strftime("%d %b %I:%M %p"); break
        except Exception: pass

    india = build_stats(c, db, None)
    up = build_stats(c, db, "Uttar Pradesh")

    # console
    for nm, s in (("ALL INDIA", india), ("UTTAR PRADESH", up)):
        print("\n" + "=" * 58)
        print("  %s  --  %s" % (nm, datetime.date.today().strftime("%d %b %Y")))
        print("=" * 58)
        print("  Total tweets : %s | handles: %s" % (IN(s['total']), IN(s['handles'])))
        print("  Today posted : %s | added to DB: %s | new handles: %s"
              % (IN(s['today']), IN(s['added']), IN(s['new_handles'])))
        for k, t, h in s['lvl']:
            print("     %-24s %10s  |  %s handles" % (k, IN(t), IN(h)))

    now = datetime.datetime.now().strftime("%d %b %Y, %I:%M %p")
    H = ['<!doctype html><html><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         '<title>Political Pulse &mdash; Daily Report %s</title>' % TODAY,
         '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">',
         '<style>%s</style></head><body>' % CSS,
         '<div class="head">',
         '<div class="title">POLITICAL <span>PULSE</span></div>',
         '<div class="sub" style="margin-bottom:0">Daily Scraping Report &nbsp;&middot;&nbsp; %s</div>' % now,
         '<div class="headbar">',
         '<div class="tabs"><button class="tab on" id="tb-in" onclick="pick(\'in\')">All India</button>',
         '<button class="tab" id="tb-up" onclick="pick(\'up\')">Uttar Pradesh</button></div>',
         '<button class="btn" onclick="window.print()">&#128438; Save as PDF</button></div>',
         '<div class="tip">In the print dialog: turn ON <b>Background graphics</b> and turn OFF '
         '<b>Headers and footers</b> for a clean PDF (both scopes are included).</div></div>',
         '<div class="scope" id="sc-in">' + scope_html(india, 'All India Political Pulse',
             'Nationwide handles &mdash; MP / MLA / MLC / CM / party pages / media', last_run) + '</div>',
         '<div class="scope" id="sc-up" style="display:none">' + scope_html(up, 'Uttar Pradesh Political Pulse',
             'Uttar Pradesh handles only', last_run) + '</div>',
         '<div class="foot">Auto-generated from MongoDB &middot; pulse_master.master_tweets</div>',
         "<script>function pick(k){document.getElementById('sc-in').style.display=(k==='in'?'block':'none');",
         "document.getElementById('sc-up').style.display=(k==='up'?'block':'none');",
         "document.getElementById('tb-in').className='tab'+(k==='in'?' on':'');",
         "document.getElementById('tb-up').className='tab'+(k==='up'?' on':'');}</script>",
         '</body></html>']

    outdir = OUTDIR
    try: os.makedirs(outdir, exist_ok=True)
    except Exception:
        outdir = os.path.dirname(HERE); print("\n(network folder not found -> saving local:", outdir, ")")
    p1 = os.path.join(outdir, "daily_report_%s.html" % TODAY)
    p2 = os.path.join(outdir, "daily_report_latest.html")
    for p in (p1, p2):
        try: open(p, "w", encoding="utf-8").write("".join(H))
        except Exception as e: print("  (write fail %s: %s)" % (p, e))
    print("\nHTML report: %s" % p1)
    return p1


if __name__ == "__main__":
    try:
        p = main()
        if "--open" in sys.argv:
            try: os.startfile(p)
            except Exception: pass
    except Exception as e:
        import traceback; traceback.print_exc(); input("\nPress Enter...")
