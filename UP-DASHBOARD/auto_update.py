# -*- coding: utf-8 -*-
"""
auto_update.py  --  FULLY AUTOMATIC (har 30 min) All-India updater.

Flow:
  1. BASE folder (saare subfolders) scan -- Media Houses SKIP.
  2. Nayi/badli files uthata hai (state-tracked; growing files bhi pakadta).
  3. Handle..Sentiment le, 1-July se aaj tak, attributes TUMHARI mapping se.
     Handle na mile to Tweet URL se. Mapping me na mile -> needs_mapping.csv.
  4. master_tweets.csv me merge + Tweet URL par dedupe.
  5. DONO dashboard push: All-India (india_pulse) + UP filtered (up_pulse).

Tum sirf All-India data doge -> UP apne aap filtered view me update.

Chalane ke liye har 30 min: START_LIVE.bat (server + loop) ya run_once.bat.
"""
import os, sys, json, time, shutil, datetime, importlib
import pandas as pd

HERE   = os.path.dirname(os.path.abspath(__file__))
DATA   = os.path.join(HERE, "data")
MASTER = os.path.join(DATA, "master_tweets.csv")
STATE  = os.path.join(HERE, "auto_state.json")
NEEDMAP= os.path.join(HERE, "needs_mapping.csv")
LOGF   = os.path.join(HERE, "auto_update.log")

sys.path.insert(0, HERE)
import phase2_push as P2          # find_files, read_map_file, BASE, MAPJSON, FILL
DATE_FROM = datetime.date(2026, 7, 1)   # is date ke pehle ka data nahi (purani Apr-Jun ignore)


def log(m):
    line = "[" + datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "] " + str(m)
    print(line)
    try: open(LOGF, "a", encoding="utf-8").write(line + "\n")
    except Exception: pass


def load_state():
    try: return json.load(open(STATE, encoding="utf-8"))
    except Exception: return {"processed": {}}

def save_state(s):
    try: json.dump(s, open(STATE, "w", encoding="utf-8"))
    except Exception as e: log("  (state save fail: %s)" % e)


def find_new(state):
    out = []
    for f in P2.find_files():                 # BASE scan, Media Houses skip
        try: st = os.stat(f)
        except Exception: continue
        mt, sz = st.st_mtime, st.st_size
        prev = state["processed"].get(f)
        if prev and prev.get("mtime") == mt and prev.get("size") == sz:
            continue                           # already done (badli nahi)
        out.append((f, mt, sz))
    return out


def main():
    if not os.path.isdir(P2.BASE):
        log("!! BASE folder nahi mila (network off?): " + P2.BASE); return
    t0 = time.time()
    state = load_state()
    newf = find_new(state)
    if not newf:
        log("No new files. Dashboard already up-to-date."); return
    log("Naye/badle files: %d" % len(newf))

    mp = json.load(open(P2.MAPJSON, encoding="utf-8"))
    today = datetime.date.today()
    frames, unmapped, done = [], {}, []
    for f, mt, sz in newf:
        try:
            df, um = P2.read_map_file(f, mp, DATE_FROM, today)
        except Exception as e:
            log("  ERROR read (skip): %s -> %s" % (os.path.basename(f), e)); continue
        if df is not None:
            for h, n in um.items(): unmapped[h] = unmapped.get(h, 0) + n
            frames.append(df)
            log("  %-42s +%d rows" % (os.path.basename(f)[:42], len(df)))
        done.append((f, mt, sz))

    for f, mt, sz in done:
        state["processed"][f] = {"mtime": mt, "size": sz}
    save_state(state)

    if not frames:
        log("Naye files me July+ data nahi mila."); return
    new = pd.concat(frames, ignore_index=True)
    log("Total naye rows: %d" % len(new))
    if unmapped:
        pd.DataFrame(sorted(unmapped.items(), key=lambda x:-x[1]),
                     columns=['Handle','tweets']).to_csv(NEEDMAP, index=False)
        log("Mapping me na mile %d handle -> needs_mapping.csv" % len(unmapped))

    if os.path.exists(MASTER) and os.path.getsize(MASTER) > 100:
        master = pd.read_csv(MASTER, dtype=str).fillna("")
        combined = pd.concat([master, new], ignore_index=True)
    else:
        combined = new
    before = len(combined)
    hasu = combined["Tweet URL"].astype(str).str.strip() != ""
    ded = combined[hasu].drop_duplicates(subset="Tweet URL", keep="last")
    combined = pd.concat([ded, combined[~hasu]], ignore_index=True)
    log("Master: %d -> %d (dedupe by Tweet URL)" % (before, len(combined)))
    tmp = MASTER + ".tmp"; combined.to_csv(tmp, index=False, encoding="utf-8"); os.replace(tmp, MASTER)

    log("Push -> All-India + UP...")
    import push_all_scopes as PA; importlib.reload(PA)
    PA.push_all(MASTER, log=log)
    log("DONE in %ds. Dono dashboard update. (browser khud reload ~30s)" % int(time.time() - t0))


if __name__ == "__main__":
    try: main()
    except Exception as e:
        import traceback; log("FATAL: " + str(e)); log(traceback.format_exc()); sys.exit(1)
