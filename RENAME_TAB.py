# -*- coding: utf-8 -*-
r"""
RENAME_TAB.py  --  sidebar ka tab naam "MLA Tracker" -> "Elected Representatives"
================================================================================
Dono dashboard me ek saath badal deta hai:

    <project>\DASHBOARD\dashboard.template.html        (All India)
    <project>\UP-DASHBOARD\dashboard.template.html     (UP)

SIRF DIKHNE WALA NAAM badalta hai. Andar ka kaam karne wala code bilkul
haath nahi lagta:
    data-tab="mla-tracker"      <- waisa ka waisa
    switchTab('mla-tracker')    <- waisa ka waisa
    id="sec-mla-tracker"        <- waisa ka waisa
    renderMLA() / filterMLA()   <- waisa ka waisa
Isliye tab ka kaam-kaaj bilkul pehle jaisa chalta rahega, sirf label badlega.

SURAKSHA:
  * Badalne se pehle backup banta hai:  dashboard.template.html.bak_tabname
  * Dobara chala do to kuch nahi hota (pehle se laga hai to chhod deta hai)
  * Badalne ke baad khud jaanch karta hai ki andar ka code toota to nahi
  * Server RESTART karne ki zaroorat nahi -- server har baar file dobara
    padhta hai. Bas browser refresh (Ctrl+F5) kar lo.

CHALAO (project folder ke andar se):
    python RENAME_TAB.py                 <- badal do
    python RENAME_TAB.py --dry-run       <- sirf dikhao, badlo mat
    python RENAME_TAB.py --undo          <- wapas "MLA Tracker" kar do
    python RENAME_TAB.py <file1> <file2> <- khud file batana ho to
================================================================================
"""
import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

OLD_NAME = "MLA Tracker"
NEW_NAME = "Elected Representatives"

DRY = "--dry-run" in sys.argv
UNDO = "--undo" in sys.argv

# wahi ek tab ka block pakadta hai, aur usi ke andar ka text badalta hai.
# (<svg> ke baad aur </div> se pehle jo likha hai -- yahi screen par dikhta hai)
def pattern(name):
    return re.compile(
        r'(<div class="mnav-tab" data-tab="mla-tracker"[^>]*>.*?</svg>\s*)'
        + re.escape(name) + r'(\s*</div>)',
        re.S)

# ye andar ka code hai -- iski ginti badalni NAHI chahiye
GUARDS = ['data-tab="mla-tracker"', "switchTab('mla-tracker')",
          'id="sec-mla-tracker"', "renderMLA", "filterMLA"]


def say(m=""):
    print(m, flush=True)


def targets():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        return [os.path.abspath(a) for a in args]
    return [
        os.path.join(HERE, "DASHBOARD", "dashboard.template.html"),
        os.path.join(HERE, "UP-DASHBOARD", "dashboard.template.html"),
    ]


def do_file(path, frm, to):
    label = os.path.basename(os.path.dirname(path)) + "\\" + os.path.basename(path)
    if not os.path.isfile(path):
        say("  [NAHI MILA]  %s" % label)
        return None

    s = io.open(path, encoding="utf-8", newline="").read()
    before = {g: s.count(g) for g in GUARDS}

    if pattern(to).search(s):
        say("  [pehle se]   %s   -- already '%s'" % (label, to))
        return True

    m = pattern(frm).search(s)
    if not m:
        say("  [MILA NAHI]  %s   -- isme '%s' wala tab block nahi mila" % (label, frm))
        return False

    new_s = pattern(frm).sub(lambda mm: mm.group(1) + to + mm.group(2), s, count=1)

    # jaanch: andar ka code jyon ka tyon hai?
    after = {g: new_s.count(g) for g in GUARDS}
    broke = [g for g in GUARDS if before[g] != after[g]]
    if broke:
        say("  [ROK DIYA]   %s   -- andar ka code badal raha tha: %s" % (label, broke))
        return False

    if DRY:
        say("  [dry-run]    %s   -- '%s' -> '%s' (file nahi badli)" % (label, frm, to))
        return True

    bak = path + ".bak_tabname"
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    io.open(path, "w", encoding="utf-8", newline="").write(new_s)

    # likhne ke baad dobara padh kar pakka karo
    chk = io.open(path, encoding="utf-8", newline="").read()
    if not pattern(to).search(chk):
        say("  [FAIL]       %s   -- likhne ke baad bhi nahi mila!" % label)
        return False
    say("  [HO GAYA]    %s   -- ab '%s'" % (label, to))
    return True


def main():
    frm, to = (NEW_NAME, OLD_NAME) if UNDO else (OLD_NAME, NEW_NAME)

    say("=" * 70)
    say("  TAB KA NAAM BADAL RAHE HAIN")
    say("     '%s'  ->  '%s'" % (frm, to))
    if DRY:
        say("     *** DRY RUN -- koi file nahi badlegi ***")
    say("=" * 70)
    say()

    res = [do_file(p, frm, to) for p in targets()]
    done = sum(1 for r in res if r)
    fail = sum(1 for r in res if r is False)

    say()
    say("=" * 70)
    if fail:
        say("  %d theek, %d me dikkat -- upar dekho." % (done, fail))
        say("  (jo file nahi badli, wo waisi ki waisi hai -- kuch bigda nahi)")
        say("=" * 70)
        sys.exit(1)
    say("  SAB HO GAYA (%d file)" % done)
    if not DRY:
        say()
        say("  Server restart karne ki ZAROORAT NAHI.")
        say("  Bas browser me dashboard refresh karo:  Ctrl+F5")
        say()
        say("  Wapas purana naam chahiye to:  python RENAME_TAB.py --undo")
    say("=" * 70)


if __name__ == "__main__":
    main()
