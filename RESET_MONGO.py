# -*- coding: utf-8 -*-
"""
RESET_MONGO.py  --  NAYE laptop par purani/adhoori database saaf karta hai.

Kyun chahiye:
  Naye laptop par pehle se kuch collection bane hue ho sakte hain (purane
  setup se, ya adhoore import se). Unke upar dump bharne par aadha purana
  aur aadha naya data mil jaata hai -- ginti kabhi milti hi nahi.
  Isliye pehle poori tarah saaf karo, phir restore.

Kya hataata hai (SIRF ye chaar):
    pulse_master      raw tweets + users/login
    india_Pulse       All India dashboard
    up_pulse          UP dashboard
    political_lens    Punjab dashboard

  Inke alawa kisi database ko haath NAHI lagata -- na admin, na config,
  na local, na tumhari koi doosri database.

--------------------------------------------------------------------------
!! DHYAN SE !!
  Ye PURANE laptop par MAT chalana. Wahan ka asli data chala jayega.
  Sirf NAYE laptop par, restore se PEHLE.
--------------------------------------------------------------------------

Chalao:
    python RESET_MONGO.py --list      <- sirf dikhao, kuch mat hatao
    python RESET_MONGO.py             <- dikhao, poochho, phir hatao
    python RESET_MONGO.py --yes       <- bina poochhe hatao

Iske turant baad:
    python mongo_backup.py --restore
Ya seedha SETUP.bat chala do.

Zaroorat: pymongo  |  MongoDB chalti honi chahiye
"""
import sys

from mongo_conf import MONGO_URL as URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
MINE = ["pulse_master", "india_Pulse", "up_pulse", "political_lens"]
SYSTEM = {"admin", "config", "local"}


def human(n):
    return f"{n:,}"


def main():
    try:
        from pymongo import MongoClient
    except ImportError:
        print("  [!] pymongo nahi hai.  python -m pip install pymongo")
        return 1

    try:
        cli = MongoClient(URL, serverSelectionTimeoutMS=8000)
        cli.admin.command("ping")
    except Exception as e:
        print("  [!] MongoDB se baat nahi hui: %s" % e)
        print("      net start MongoDB")
        return 1

    all_dbs = sorted(cli.list_database_names())

    print("=" * 68)
    print("  IS LAPTOP KI MONGODB ME ABHI KYA HAI")
    print("=" * 68)

    found = []
    for d in all_dbs:
        if d in SYSTEM:
            continue
        mark = "  <-- HATEGI" if d in MINE else ""
        try:
            cols = sorted(cli[d].list_collection_names())
        except Exception:
            cols = []
        total = 0
        detail = []
        for c in cols:
            try:
                n = cli[d][c].estimated_document_count()
            except Exception:
                n = 0
            total += n
            detail.append((c, n))
        print("\n  %-18s %12s docs%s" % (d, human(total), mark))
        for c, n in sorted(detail, key=lambda x: -x[1])[:8]:
            print("       %-26s %12s" % (c, human(n)))
        if len(detail) > 8:
            print("       ... aur %d collection" % (len(detail) - 8))
        if d in MINE and total:
            found.append((d, total))

    other = [d for d in all_dbs if d not in SYSTEM and d not in MINE]
    if other:
        print("\n  Ye database chhod di jaayengi (inka is project se lena-dena nahi):")
        for d in other:
            print("       " + d)

    print("\n" + "=" * 68)
    if not found:
        print("  Hatane layak kuch mila hi nahi -- MongoDB pehle se saaf hai.")
        print("  Seedha aage badho:  python mongo_backup.py --restore")
        print("=" * 68)
        cli.close()
        return 0

    grand = sum(n for _, n in found)
    print("  HATEGI: %s   (kul %s documents)"
          % (", ".join(d for d, _ in found), human(grand)))
    print("=" * 68)

    if "--list" in sys.argv:
        print("\n  (--list tha, isliye kuch nahi hataya)")
        cli.close()
        return 0

    if "--yes" not in sys.argv:
        print("\n  !! Ye wapas nahi aayega.")
        print("     Pakka karo ki ye NAYA laptop hai, purana nahi.")
        try:
            ans = input("\n  Hatane ke liye  DROP  likho (aur kuch bhi = ruk jao): ").strip()
        except Exception:
            ans = ""
        if ans != "DROP":
            print("\n  Kuch nahi hataya. Sab waise ka waisa hai.")
            cli.close()
            return 1

    print()
    for d, n in found:
        try:
            cli.drop_database(d)
            print("  hat gayi   %-18s %s docs" % (d, human(n)))
        except Exception as e:
            print("  [!] %s: %s" % (d, e))

    left = [d for d in cli.list_database_names() if d in MINE]
    cli.close()

    print("\n" + "=" * 68)
    if left:
        print("  [!] ye ab bhi hain: %s" % ", ".join(left))
        print("      MongoDB Compass khula ho to band karke dobara chalao.")
        return 1
    print("  SAAF HO GAYA.")
    print()
    print("  Ab data bharo:")
    print("     python mongo_backup.py --restore")
    print("  Ya seedha SETUP.bat chala do -- wo khud bhar dega.")
    print("=" * 68)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n  Rok diya. Kuch nahi hataya.")
        sys.exit(1)
