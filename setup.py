# -*- coding: utf-8 -*-
"""
setup.py  --  NAYE laptop par poora dashboard ek baar me khada kar deta hai.

Isse seedha mat chalao -- SETUP.bat par double-click karo.

Kya-kya karta hai:
   1. Python packages  (pandas, pymongo, openpyxl)
   2. Node + npm install  (DASHBOARD aur PunjabLens, dono)
   3. MongoDB chal rahi hai ya nahi
   4. Saari .bat files me is system ka python path likh deta hai
   5. Network folder (naye tweets) pahunch me hai ya nahi
   6. MongoDB me poora data bhar deta hai  (mongo_dump_py se)
   7. Primary / Secondary laptop tay karta hai
   8. Aakhir me ginti dikha kar verify karta hai

Kuch bhi mita nahi jaata sivaay us data ke jo restore karte waqt tum khud
'y' kehte ho.
"""
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, "DASHBOARD")
UPD = os.path.join(HERE, "UP-DASHBOARD")
PBL = os.path.join(HERE, "PunjabLens")
PY = sys.executable

OK, WARN, BAD = "  [ok]  ", "  [!]   ", "  [X]   "
DBS = ["pulse_master", "india_Pulse", "up_pulse", "political_lens"]
STEPS = 8


def head(t):
    print()
    print("=" * 70)
    print("  " + t)
    print("=" * 70)


def line(tag, msg):
    print(tag + msg, flush=True)


def run(cmd, **kw):
    try:
        return subprocess.run(cmd, **kw)
    except Exception as e:
        class R:
            returncode = 1
            stdout = ""
            stderr = str(e)
        return R()


def ask(q, default="y"):
    try:
        a = input("\n  " + q + " [" + ("Y/n" if default == "y" else "y/N") + "] ").strip().lower()
    except Exception:
        return default == "y"
    if not a:
        return default == "y"
    return a.startswith("y")


# =============================================================================
# 1. PYTHON PACKAGES
# =============================================================================
def step_packages():
    head("1/%d  Python packages" % STEPS)
    line("", "Python: %s" % PY)
    line("", "Version: %s" % sys.version.split()[0])
    if sys.version_info < (3, 8):
        line(BAD, "Python 3.8 ya usse naya chahiye.")
        return False

    need = [("pandas", "pandas"), ("pymongo", "pymongo"), ("openpyxl", "openpyxl")]
    missing = []
    for mod, pkg in need:
        try:
            __import__(mod)
            line(OK, "%s pehle se hai" % mod)
        except ImportError:
            missing.append(pkg)
            line(WARN, "%s nahi hai" % mod)

    if missing:
        line("", "Install kar rahe hain: " + ", ".join(missing))
        r = run([PY, "-m", "pip", "install"] + missing)
        if r.returncode != 0:
            line(BAD, "pip install fail. Haath se chalao:")
            line("", '   "%s" -m pip install %s' % (PY, " ".join(missing)))
            return False
        for mod, _ in need:
            try:
                __import__(mod)
            except ImportError:
                line(BAD, "%s ab bhi nahi mila" % mod)
                return False
        line(OK, "sab lag gaye")
    return True


# =============================================================================
# 2. NODE + npm install  (do folder)
# =============================================================================
def step_node():
    head("2/%d  Node.js aur packages" % STEPS)
    r = run(["node", "-v"], capture_output=True, text=True, shell=True)
    if r.returncode != 0:
        line(BAD, "Node.js nahi mila.")
        line("", "nodejs.org se LTS install karo, phir SETUP.bat dobara chalao.")
        return False
    line(OK, "Node %s" % (r.stdout or "").strip())

    allok = True
    for name, folder in (("DASHBOARD", DASH), ("PunjabLens", PBL)):
        if not os.path.isdir(folder):
            line(WARN, "%s folder nahi mila -- chhod diya" % name)
            continue
        nm = os.path.join(folder, "node_modules")
        if os.path.isdir(nm) and os.path.isdir(os.path.join(nm, "express")):
            line(OK, "%s: node_modules pehle se hai" % name)
            continue
        line("", "%s: npm install chal raha hai (2-3 minute)..." % name)
        r2 = run(["npm", "install"], cwd=folder, shell=True)
        if r2.returncode != 0 or not os.path.isdir(os.path.join(nm, "express")):
            line(BAD, "%s: npm install fail" % name)
            line("", '   cd "%s"  &&  npm install' % folder)
            allok = False
        else:
            line(OK, "%s: ho gaya" % name)
    return allok


# =============================================================================
# 3. MONGODB
# =============================================================================
def mongo_up():
    try:
        from pymongo import MongoClient
        c = MongoClient(__import__("mongo_conf").MONGO_URL, serverSelectionTimeoutMS=4000)
        c.admin.command("ping")
        c.close()
        return True
    except Exception:
        return False


def step_mongo():
    head("3/%d  MongoDB" % STEPS)
    if mongo_up():
        line(OK, "chal rahi hai (localhost:27017)")
        return True
    line(WARN, "jawab nahi de rahi. Service start karke dekhte hain...")
    run(["net", "start", "MongoDB"], capture_output=True, text=True, shell=True)
    time.sleep(4)
    if mongo_up():
        line(OK, "ab chal rahi hai")
        return True
    line(BAD, "MongoDB se baat nahi ho pa rahi.")
    line("", "  - Install hai? mongodb.com/try/download/community")
    line("", '     (install karte waqt "Install as a Service" tick rakhna)')
    line("", "  - Win+R -> services.msc -> 'MongoDB Server' -> Start")
    line("", "  Uske baad SETUP.bat dobara chalao.")
    return False


# =============================================================================
# 4. .bat FILES KA PYTHON PATH
# =============================================================================
def step_batpaths():
    head("4/%d  .bat files me python ka path" % STEPS)
    targets = [
        (DASH, ["START_LIVE.bat", "GET_DATA.bat", "DAILY_REPORT.bat",
                "RUN_MAPPING_UPDATE.bat", "run_once.bat", "START_TUNNEL.bat",
                "START_PORTAL.bat", "RESTORE_INDIA.bat", "PHONE_URL.bat"]),
        (UPD, ["START_LIVE.bat", "run_once.bat"]),
        (PBL, ["UPDATE_DATA.bat"]),
    ]
    n = 0
    for folder, bats in targets:
        for b in bats:
            p = os.path.join(folder, b)
            if not os.path.exists(p):
                continue
            try:
                s = open(p, encoding="utf-8", errors="ignore").read()
            except Exception as e:
                line(WARN, "%s padh nahi paye: %s" % (b, e))
                continue
            # NOTE: replacement me PY seedha jodne par "C:\Users\..." ka "\U"
            # escape sequence ban jaata hai aur re.sub crash karta hai.
            # Isliye lambda se replace karte hain -- usme escape nahi lagta.
            new = re.sub(r'(?im)^(\s*set\s+PY=).*$', lambda m: m.group(1) + PY, s)
            if new != s:
                # CRLF ke saath hi likho. LF wali .bat CMD me multi-line
                # "if (" block par turant band ho jaati hai -- ye bug pehle
                # pakda ja chuka hai, isliye newline khud set kar rahe hain.
                new = new.replace("\r\n", "\n").replace("\n", "\r\n")
                with open(p, "w", encoding="utf-8", newline="") as fh:
                    fh.write(new)
                n += 1
    line(OK, "%d file me python path likh diya" % n)
    line("", PY)
    return True


# =============================================================================
# 5. NETWORK FOLDER
# =============================================================================
def step_network():
    head("5/%d  Network folder (naye tweets yahin se aate hain)" % STEPS)
    sys.path.insert(0, DASH)
    try:
        import phase2_push as P2
        base = P2.BASE
    except Exception as e:
        line(WARN, "phase2_push padh nahi paye: %s" % e)
        return True
    if os.path.isdir(base):
        try:
            n = len([d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))])
            line(OK, "mil gaya (%d folder): %s" % (n, base))
        except Exception:
            line(OK, "mil gaya: %s" % base)
        return True
    line(WARN, "NAHI mila: %s" % base)
    line("", "Dashboard phir bhi chalega, par HAR GHANTE ka auto-update naye")
    line("", "tweets nahi utha payega. Theek karne ke liye:")
    line("", "  net use \\\\192.168.2.85\\d /persistent:yes")
    line("", "  (ya DASHBOARD\\phase2_push.py me BASE badal do)")
    return True


# =============================================================================
# 6. MONGODB ME DATA
# =============================================================================
def counts():
    out = {}
    try:
        from pymongo import MongoClient
        cli = MongoClient(__import__("mongo_conf").MONGO_URL, serverSelectionTimeoutMS=5000)
        for d in DBS:
            try:
                cols = cli[d].list_collection_names()
                out[d] = {c: cli[d][c].estimated_document_count() for c in sorted(cols)}
            except Exception:
                out[d] = {}
        cli.close()
    except Exception:
        pass
    return out


def show_counts(c):
    for d in DBS:
        cols = c.get(d) or {}
        if not cols:
            line("", "  %-16s --" % d)
            continue
        big = ", ".join("%s %s" % (k, f"{v:,}") for k, v in
                        sorted(cols.items(), key=lambda x: -x[1])[:4])
        line("", "  %-16s %s" % (d, big))


def step_data():
    head("6/%d  MongoDB me data" % STEPS)
    dump = os.path.join(HERE, "mongo_dump_py")
    before = counts()
    have = sum(sum(v.values()) for v in before.values())

    line("", "Abhi Mongo me:")
    show_counts(before)

    if not os.path.isdir(dump):
        line(WARN, "mongo_dump_py folder nahi mila.")
        line("", "Purane laptop par ye chalao:")
        line("", "   python mongo_backup.py")
        line("", "phir bana hua 'mongo_dump_py' folder yahan copy karo:")
        line("", "   " + HERE)
        line("", "aur SETUP.bat dobara chalao.")
        return have > 0

    files = [os.path.join(dp, f) for dp, _, fs in os.walk(dump) for f in fs
             if f.endswith(".jsonl.gz")]
    mb = sum(os.path.getsize(f) for f in files) / 1e6
    line(OK, "dump mila: %d file, %.0f MB" % (len(files), mb))

    if have > 100000:
        line(WARN, "Mongo me pehle se %s document hain." % f"{have:,}")
        if not ask("Dump se DOBARA bharein? (purana mit jayega)", "n"):
            line("", "Chhod diya -- jo data hai wahi rahega.")
            return True
    else:
        if not ask("Isi dump se MongoDB bharein? (15-25 minute)", "y"):
            line("", "Chhod diya. Baad me: python mongo_backup.py --restore")
            return have > 0

    line("", "Bhar rahe hain... window band mat karna.")
    r = run([PY, os.path.join(HERE, "mongo_backup.py"), "--restore"], cwd=HERE)
    if r.returncode != 0:
        line(BAD, "restore fail. Haath se: python mongo_backup.py --restore")
        return False
    line(OK, "data aa gaya")
    return True


# =============================================================================
# 7. PRIMARY / SECONDARY
# =============================================================================
def step_role():
    head("7/%d  Ye laptop PRIMARY hai ya SECONDARY?" % STEPS)
    line("", "PRIMARY   = network par CSV backup aur daily report likhega")
    line("", "SECONDARY = sab kuch apne andar rakhega (network par kuch nahi likhega)")
    line("", "")
    line("", "Agar purana laptop bhi chalta rahega, to ye SECONDARY hona chahiye --")
    line("", "warna dono network par ek hi file par likhenge aur ek doosre ko mita denge.")

    sec = ask("Kya purana laptop bhi chalta rahega?", "y")
    cfg = os.path.join(DASH, "local_config.json")
    try:
        json.dump({"role": "secondary" if sec else "primary"},
                  open(cfg, "w", encoding="utf-8"), indent=1)
        line(OK, "%s -> role: %s" % (os.path.basename(cfg), "secondary" if sec else "primary"))
        if sec:
            line("", "Network par kuch nahi likha jayega. Dashboard poora chalega.")
    except Exception as e:
        line(WARN, "local_config.json likh nahi paye: %s" % e)
    return True


# =============================================================================
# 8. VERIFY
# =============================================================================
def verify():
    head("8/%d  Aakhri jaanch" % STEPS)
    ok = True

    c = counts()
    line("", "MongoDB:")
    show_counts(c)
    mt = (c.get("pulse_master") or {}).get("master_tweets", 0)
    if mt > 100000:
        line(OK, "master_tweets: %s" % f"{mt:,}")
    else:
        line(WARN, "master_tweets kam/khaali hai (%s)" % f"{mt:,}")
        ok = False
    if not (c.get("india_Pulse") or {}):
        line(WARN, "india_Pulse khaali -- All India dashboard khaali dikhega")
        ok = False
    if not (c.get("political_lens") or {}):
        line(WARN, "political_lens khaali -- Punjab ke liye ye chalao:")
        line("", '   cd PunjabLens  &&  "%s" build_punjab_data.py --push' % PY)

    for f, what in ((os.path.join(DASH, "node_modules", "express"), "DASHBOARD node_modules"),
                    (os.path.join(PBL, "node_modules", "express"), "PunjabLens node_modules"),
                    (os.path.join(DASH, "dashboard.template.html"), "All India template"),
                    (os.path.join(UPD, "dashboard.template.html"), "UP template"),
                    (os.path.join(PBL, "public", "index.html"), "Punjab page"),
                    (os.path.join(HERE, "Mapping", "Mapping.xlsx"), "Mapping.xlsx")):
        if os.path.exists(f):
            line(OK, what)
        else:
            line(WARN, what + " nahi mila")
            ok = False

    # ---- Word Cloud ka data (pipeline banata hai, dump ke saath aata hai) ----
    try:
        from pymongo import MongoClient
        cli = MongoClient(__import__("mongo_conf").MONGO_URL, serverSelectionTimeoutMS=5000)
        got = []
        for d in ("india_Pulse", "up_pulse"):
            keys = [x["key"] for x in cli[d]["dashboard_data"].find({}, {"key": 1})]
            if "WORDCLOUD" in keys:
                got.append(d)
        cli.close()
        if len(got) == 2:
            line(OK, "Word Cloud ka data dono me hai")
        else:
            line(WARN, "Word Cloud ka data adhoora (%s) -- ek baar ye chalao:"
                 % (", ".join(got) if got else "kahin nahi"))
            line("", '   cd DASHBOARD  &&  "%s" run_pipeline.py --force-push' % PY)
    except Exception as e:
        line(WARN, "Word Cloud jaanch skip: %s" % e)

    # ---- AI key (optional -- na ho to sirf AI band rehta hai) ----
    aif = os.path.join(DASH, "ai_config.json")
    if os.path.exists(aif):
        try:
            k = str(json.load(open(aif, encoding="utf-8")).get("key", ""))
            if k.startswith("gsk_") and len(k) > 40:
                line(OK, "AI key mil gayi (assistant + report AI chalenge)")
            else:
                line(WARN, "ai_config.json me key adhoori lag rahi hai")
        except Exception as e:
            line(WARN, "ai_config.json padhi nahi gayi: %s" % e)
    else:
        line(WARN, "ai_config.json nahi hai -- AI assistant band rahega (baaki sab chalega)")
        line("", "   ai_config.sample.json ka naam badal kar ai_config.json karo")
        line("", "   aur console.groq.com se free key daal do")

    return ok


# =============================================================================
def main():
    print()
    print("#" * 70)
    print("#   POLITICAL PULSE  --  NAYE SYSTEM KA SETUP")
    print("#   All India  +  Uttar Pradesh  +  Punjab")
    print("#" * 70)
    print("\n  Folder: " + HERE)

    if not step_packages():
        return 1
    node_ok = step_node()
    if not step_mongo():
        return 1
    step_batpaths()
    step_network()
    step_data()
    step_role()
    v = verify()

    head("SETUP POORA HUA" if (v and node_ok) else "SETUP HUA -- par kuch cheezein dekhni hain")
    print("  Ab dashboard chalao:")
    print()
    print("     DASHBOARD\\START_LIVE.bat")
    print()
    print("  Wo window BAND MAT KARNA -- har ghante ka auto-update wahi chala rahi hai.")
    print()
    print("  Browser me:")
    print("     http://localhost:3000/          All India")
    print("     http://localhost:3000/up        Uttar Pradesh")
    print("     http://localhost:3000/punjab/   Punjab")
    print()
    print("  Login:  admin@jarvis.consulting  /  admin@Jarvis")
    print()
    if not (v and node_ok):
        print("  Upar jo [!] dikhe hain unhe ek baar dekh lena.")
        print()
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except KeyboardInterrupt:
        print("\n\n  Rok diya.")
        code = 1
    except Exception as e:
        import traceback
        print("\n  [X] " + str(e))
        traceback.print_exc()
        code = 1
    sys.exit(code)
