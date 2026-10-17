# -*- coding: utf-8 -*-
"""
phase2_push.py  --  MANUAL push (ek baar): 1 July -> aaj tak ka data.

Kya karta hai:
  1. Neeche diye folders ki SAARI csv/xlsx padhta hai (Media Houses SKIP).
  2. Sirf 1-July-2026 se aaj tak ke tweets rakhta hai (baaki rows chhod deta).
  3. File se sirf tweet-columns (Handle..Sentiment). Baaki attributes
     (State, Party, Designation, AC/PC, Candidate Name...) TUMHARI mapping se.
  4. Handle na mile to Tweet URL se nikaalta hai.
  5. Mapping me na mile handle -> needs_mapping.csv me log (tweet phir bhi rakhta).
  6. master_tweets.csv me merge + Tweet URL par dedupe.
  7. update_dashboard --push + push_tweets  (dashboard update).

Chalao:  C:\\Users\\arpan\\anaconda3\\python.exe phase2_push.py
"""
import os, sys, json, glob, datetime, importlib
import pandas as pd

HERE   = os.path.dirname(os.path.abspath(__file__))
DATA   = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")
MAPJSON= os.path.join(DATA, "handle_master.json")
NEEDMAP= os.path.join(HERE, "needs_mapping.csv")
LOGF   = os.path.join(HERE, "phase2_push.log")

BASE = r"\\192.168.2.85\d\Tweeter Data Social Media (25-07-2026)"
SKIP_FOLDERS = set()                                  # ab koi folder skip nahi
# ye folders "media" hain: inke handles ka koi state/seat nahi hota ->
# State/AC/PC blank, Designation+Category = label (reports me pehchane jaayenge)
MEDIA_LABEL = {"media houses": "Media House", "journalist": "Journalist"}


def media_label_for(path):
    parts = [p.lower() for p in str(path).replace('/', '\\').split('\\')]
    for k, v in MEDIA_LABEL.items():
        if k in parts: return v
    return None
DATE_FROM = datetime.date(2026, 7, 1)                # 1 July se aaj tak (master Apr-1July tak hai; July2-30 gap + Aug bharo)
DATE_TO   = datetime.date.today()                    # aaj tak
EXTS = ("*.csv", "*.xlsx", "*.xls", "*.xlsm")

sys.path.insert(0, HERE)
import smart_import as SI
import re as _re

# filename se date nikalo: (YYYY-MM-DD) parenthesis > YYYY-MM-DD > DD-MM-YYYY
_RE_PAREN = _re.compile(r'\((\d{4})-(\d{1,2})-(\d{1,2})\)')
_RE_ISO   = _re.compile(r'(\d{4})-(\d{1,2})-(\d{1,2})')
_RE_DMY   = _re.compile(r'(\d{1,2})-(\d{1,2})-(\d{4})')

def file_date(path):
    nm = os.path.basename(path)
    m = _RE_PAREN.search(nm)
    if m: y, mo, d = m.groups()
    else:
        m = _RE_ISO.search(nm)
        if m: y, mo, d = m.groups()
        else:
            m = _RE_DMY.search(nm)
            if m: d, mo, y = m.groups()
            else: return None
    try: return datetime.date(int(y), int(mo), int(d))
    except Exception: return None

# mapping se ye master-columns bharenge (file se nahi):
# mapping se bharne wale SAARE attribute columns (Designation alag se neeche)
FILL = {'State':'state', 'Locations':'locations', 'AC/PC No':'ac_pc_no',
        'AC Name':'ac_name', 'PC Name':'pc_name', 'Candidate Name':'name',
        'Category':'category', 'Party':'party', 'Status':'status'}


def to_ist_series(s):
    """Tweet Date ko IST me laata hai. UTC/GMT wale +5:30, IST wale waise ke waise.
       Output: 'YYYY-MM-DD HH:MM:SS IST'. Parse na ho to original rakhta hai."""
    s = s.astype(str)
    base = s.str.replace(r'\s+(IST|UTC|GMT|BST|IDT|PST|EST)\b.*$', '', regex=True)
    dt = pd.to_datetime(base, errors='coerce')
    is_utc = s.str.contains(r'\b(?:UTC|GMT)\b', case=False, regex=True).fillna(False)
    dt = dt + pd.to_timedelta(is_utc.astype(int) * 5.5, unit='h')
    formatted = dt.dt.strftime('%Y-%m-%d %H:%M:%S') + ' IST'
    return formatted.where(dt.notna(), s)


def log(m):
    line = "[" + datetime.datetime.now().strftime("%H:%M:%S") + "] " + str(m)
    print(line)
    try: open(LOGF, "a", encoding="utf-8").write(line + "\n")
    except Exception: pass


def find_files():
    """BASE ke SAARE folders scan (media houses + journalist bhi).
       Media/journalist ki rows read_map_file me label ho jaati hain."""
    out = []
    for root, dirs, files in os.walk(BASE):
        parts = [p.lower() for p in root.split(os.sep)]
        if SKIP_FOLDERS and any(s in parts for s in SKIP_FOLDERS):
            continue
        if SKIP_FOLDERS:
            dirs[:] = [d for d in dirs if d.lower() not in SKIP_FOLDERS]
        for pat in EXTS:
            for f in glob.glob(os.path.join(root, pat)):
                if os.path.basename(f).startswith("~$"):
                    continue
                # SAARI files padho (sirf skip-folders chhod kar).
                # Date filter ROW-level Tweet Date se hota hai (July31+) - yahi authoritative.
                # (filename date par skip nahi karte - warna date-range naam wali files chhut jaati hain)
                out.append(f)
    return out


def _levels_from(vals):
    """designation/category se level buckets (CM / Dy CM / LS MP / RS MP / MLA / MLC ...)"""
    out = []
    for v in vals:
        x = str(v or '').strip().lower()
        if not x or x == '-': continue
        if 'deputy chief minister' in x: out.append('Dy CM')
        elif 'chief minister' in x and 'former' not in x: out.append('CM')
        elif x in ('ls_mp', 'ls mp', 'ls_mp candidate'): out.append('LS MP')
        elif x in ('rs_mp', 'rs mp'): out.append('RS MP')
        elif x == 'mla': out.append('MLA')
        elif x == 'mlc': out.append('MLC')
        elif x == 'media house': out.append('Media House')
        elif x == 'journalist': out.append('Journalist')
    return sorted(set(out)) or ['Others']


def desig_for(mp_entry):
    """master ke Designation column ke liye ek value (level bucketing).
       multi ho to pehla (dashboard multi-view mapping se dikhata hai)."""
    ds = mp_entry.get('designations') or []
    return ds[0] if ds else (mp_entry.get('designation_raw') or '')


def read_map_file(f, mp, date_from, date_to):
    """Ek file padho -> Handle..Sentiment le, date filter, attributes MAPPING se bhar.
       returns (df or None, unmapped_handles_dict). Reusable (phase2 + automation)."""
    df, _ = SI.smart_read(f, log=lambda *_: None)
    df = df[(df['Handle'].astype(str).str.strip() != '') &
            (df['Tweet URL'].astype(str).str.strip() != '')]
    if len(df) == 0:
        return None, {}
    # Tweet Date ko IST me convert karo (UTC/GMT +5:30), phir uspar filter
    df['Tweet Date'] = to_ist_series(df['Tweet Date'])
    _d = df['Tweet Date'].astype(str).str.replace(r'\s+IST\b.*$', '', regex=True)
    dt = pd.to_datetime(_d, errors='coerce', dayfirst=False)
    df = df[((dt.dt.date >= date_from) & (dt.dt.date <= date_to)).fillna(False)]
    if len(df) == 0:
        return None, {}
    # Tweet ID HAMESHA URL se (warna _id URL ban jaata hai -> duplicate docs)
    _rid = _re.compile(r'/status(?:es)?/(\d+)')
    _uid = df['Tweet URL'].astype(str).map(lambda u: (_rid.search(u).group(1) if _rid.search(u) else ''))
    old_id = df['Tweet ID'] if 'Tweet ID' in df.columns else pd.Series([''] * len(df), index=df.index)
    df['Tweet ID'] = [u if u else str(o).strip() for u, o in zip(_uid, old_id)]

    hs = df['Handle'].astype(str).str.strip()
    mlabel = media_label_for(f)
    if mlabel:
        # MEDIA / JOURNALIST: koi state/seat nahi -> blank; label se pehchan
        df['State'] = ''
        df['Locations'] = '-'; df['AC/PC No'] = '-'; df['AC Name'] = '-'; df['PC Name'] = '-'
        df['Designation'] = mlabel; df['Category'] = mlabel; df['Status'] = 'Active'
        df['Party'] = hs.map(lambda h: (mp.get(h, {}).get('party') or '-') if h in mp else '-')
        df['Candidate Name'] = [ (mp.get(h, {}).get('name') or n) if h in mp else n
                                 for h, n in zip(hs, df.get('Candidate Name', pd.Series([''] * len(df)))) ]
        # naye media handles -> caller ko batao taaki mapping me add ho jaayein
        newmedia = {h: mlabel for h in hs.unique() if h and h not in mp}
        return df, {'__media__': newmedia}
    # NAYE handle (mapping me nahi) -> raw file ke SAARE attribute columns capture karo
    # taaki mapping me apne aap sahi jagah bhar sakein
    newmap = {}
    RAWCOLS = {'State': 'state', 'Locations': 'locations', 'AC/PC No': 'ac_pc_no',
               'AC Name': 'ac_name', 'PC Name': 'pc_name', 'Designation': 'designation_raw',
               'Candidate Name': 'name', 'Category': 'category', 'Party': 'party', 'Status': 'status'}
    for h in hs[~hs.isin(mp)].unique():
        if not h: continue
        sub = df[hs == h]
        rec = {'handle': h, 'profile_url': 'https://x.com/' + h, 'tweet_url': '',
               '_folder': os.path.basename(os.path.dirname(str(f)))}   # kis folder ki file se aaya
        for col, key in RAWCOLS.items():
            val = ''
            if col in sub.columns:
                nz = [str(v).strip() for v in sub[col] if str(v).strip() not in ('', '-', 'nan')]
                if nz: val = nz[0]
            rec[key] = val or '-'
        try:
            rec['tweet_url'] = str(sub['Tweet URL'].iloc[0])
        except Exception:
            pass
        ds = [p.strip() for p in str(rec.get('designation_raw', '')).split('|') if p.strip() and p.strip() != '-']
        rec['designations'] = ds or ['-']
        rec['levels'] = _levels_from(ds + [rec.get('category', '')])
        newmap[h] = rec

    # normal (political): saare attribute columns mapping se
    for master_col, mkey in FILL.items():
        mv = hs.map(lambda h: mp.get(h, {}).get(mkey, None))
        old = df[master_col] if master_col in df.columns else pd.Series([''] * len(df), index=df.index)
        df[master_col] = [m if (m is not None and str(m).strip() not in ('', '-')) else o
                          for m, o in zip(mv, old)]
    # SAARE category label ek column me (Mongo me array ban jaata hai).
    # 'Category' ek hi rehta hai (Level cards ke liye), 'Categories' me sab.
    df['Categories'] = [ (mp[h].get('categories') or ([mp[h].get('category')] if mp[h].get('category') else []))
                         if h in mp else [] for h in hs ]
    # naye handle ka Designation raw se hi rakho (mapping me nahi hai)
    df['Designation'] = [ (desig_for(mp[h]) if h in mp else (newmap.get(h, {}).get('designation_raw', '') or d))
                          for h, d in zip(hs, df['Designation']) ]
    unmapped = {}
    for h in hs[~hs.isin(mp)].unique():
        unmapped[h] = int((hs == h).sum())
    if newmap:
        unmapped['__new__'] = newmap        # caller ise mapping me add kar dega
    return df, unmapped


def main():
    if not os.path.isdir(BASE):
        log("!! BASE folder nahi mila (network off?): " + BASE); return
    mp = json.load(open(MAPJSON, encoding='utf-8'))
    log("mapping handles: %d" % len(mp))

    files = find_files()
    log("files milीं (Media Houses ke bina): %d" % len(files))
    frames, unmapped = [], {}
    for f in files:
        try:
            df, um = read_map_file(f, mp, DATE_FROM, DATE_TO)
        except Exception as e:
            log("  ERROR read (skip): %s -> %s" % (os.path.basename(f), e)); continue
        if df is None: continue
        for h, n in um.items(): unmapped[h] = unmapped.get(h, 0) + n
        frames.append(df)
        log("  %-45s +%d rows (July+)" % (os.path.basename(f)[:45], len(df)))

    if not frames:
        log("Koi July+ data nahi mila."); return
    new = pd.concat(frames, ignore_index=True)
    log("Total naye (July+) rows: %d" % len(new))

    if unmapped:
        pd.DataFrame(sorted(unmapped.items(), key=lambda x:-x[1]),
                     columns=['Handle','tweets']).to_csv(NEEDMAP, index=False)
        log("Mapping me na mile %d naye handle -> needs_mapping.csv (tweet phir bhi rakhe)" % len(unmapped))

    # master merge + dedupe by Tweet URL
    if os.path.exists(MASTER) and os.path.getsize(MASTER) > 100:
        master = pd.read_csv(MASTER, dtype=str, encoding='utf-8-sig').fillna('')
        combined = pd.concat([master, new], ignore_index=True)
    else:
        combined = new
    # poore master ki Tweet Date IST me (UTC/GMT +5:30) - ek hi format
    combined['Tweet Date'] = to_ist_series(combined['Tweet Date'])
    before = len(combined)
    # dedupe by TWEET ID (URL me se /status/<id>), highest Total Views wala rakho
    combined['_v'] = pd.to_numeric(combined['Total Views'].astype(str).str.replace(',', '', regex=False), errors='coerce').fillna(0)
    _id = combined['Tweet URL'].astype(str).str.extract(r"/status(?:es)?/(\d+)", expand=False)
    combined['_key'] = _id.where(_id.notna(), combined['Tweet URL'].astype(str).str.strip())
    hasu = combined['_key'].astype(str).str.strip() != ''
    ded = combined[hasu].sort_values('_v').drop_duplicates(subset='_key', keep='last')
    combined = pd.concat([ded, combined[~hasu]], ignore_index=True).drop(columns=['_v', '_key'])
    log("Master: %d -> %d (dedupe by Tweet ID, highest-count rakha)" % (before, len(combined)))
    tmp = MASTER + ".tmp"; combined.to_csv(tmp, index=False, encoding='utf-8'); os.replace(tmp, MASTER)

    # push -> DONO dashboard (All-India + UP filtered view)
    log("Recompute + MongoDB push (All-India + UP)...")
    import push_all_scopes as PA; importlib.reload(PA)
    PA.push_all(MASTER, log=log)
    log("DONE. Dono dashboard update (All-India + UP). Browser khud reload hoga.")


if __name__ == "__main__":
    try: main()
    except Exception as e:
        import traceback; log("FATAL: "+str(e)); log(traceback.format_exc()); sys.exit(1)
