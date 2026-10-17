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
SKIP_FOLDERS = {"media houses"}                      # ye folder skip (media house dashboard me nahi)
DATE_FROM = datetime.date(2026, 7, 1)                # 1 July se
DATE_TO   = datetime.date.today()                    # aaj tak
EXTS = ("*.csv", "*.xlsx", "*.xls", "*.xlsm")

sys.path.insert(0, HERE)
import smart_import as SI

# mapping se ye master-columns bharenge (file se nahi):
FILL = {'State':'state', 'Candidate Name':'name', 'Party':'party',
        'AC Name':'ac_name', 'PC Name':'pc_name'}


def log(m):
    line = "[" + datetime.datetime.now().strftime("%H:%M:%S") + "] " + str(m)
    print(line)
    try: open(LOGF, "a", encoding="utf-8").write(line + "\n")
    except Exception: pass


def find_files():
    out = []
    for root, dirs, files in os.walk(BASE):
        # Media Houses (aur uske andar ke) skip
        parts = [p.lower() for p in root.split(os.sep)]
        if any(s in parts for s in SKIP_FOLDERS):
            continue
        dirs[:] = [d for d in dirs if d.lower() not in SKIP_FOLDERS]
        for pat in EXTS:
            for f in glob.glob(os.path.join(root, pat)):
                if not os.path.basename(f).startswith("~$"):
                    out.append(f)
    return out


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
    # "IST"/"UTC" jaisा timezone suffix hata do (warning se bachne + sahi parse ke liye)
    _d = df['Tweet Date'].astype(str).str.replace(r'\s+(IST|UTC|GMT|PST|EST|BST|IDT)\b.*$', '', regex=True)
    dt = pd.to_datetime(_d, errors='coerce', dayfirst=False)
    df = df[((dt.dt.date >= date_from) & (dt.dt.date <= date_to)).fillna(False)]
    if len(df) == 0:
        return None, {}
    for master_col, mkey in FILL.items():
        df[master_col] = df['Handle'].map(lambda h: mp.get(h, {}).get(mkey, ''))
    df['Designation'] = df['Handle'].map(lambda h: desig_for(mp[h]) if h in mp else '')
    unmapped = {}
    for h in df.loc[~df['Handle'].isin(mp), 'Handle'].unique():
        unmapped[h] = int((df['Handle'] == h).sum())
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
        master = pd.read_csv(MASTER, dtype=str).fillna('')
        combined = pd.concat([master, new], ignore_index=True)
    else:
        combined = new
    before = len(combined)
    hasu = combined['Tweet URL'].astype(str).str.strip() != ''
    ded = combined[hasu].drop_duplicates(subset='Tweet URL', keep='last')
    combined = pd.concat([ded, combined[~hasu]], ignore_index=True)
    log("Master: %d -> %d (dedupe by Tweet URL)" % (before, len(combined)))
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
