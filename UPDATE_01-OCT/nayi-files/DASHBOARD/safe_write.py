# -*- coding: utf-8 -*-
"""
safe_write.py  --  file aise likho ki beech me bijli jaaye to bhi purani bachi rahe.

Dikkat kya thi (audit A4, A5):
    json.dump(mp, open(PATH, 'w'))

    open(...,'w') pehle file ko KHAALI kar deta hai, phir likhna shuru hota
    hai. Agar beech me process mara, bijli gayi, ya disk bhar gayi --
    file aadhi likhi reh jaati hai. handle_master.json ke saath aisa hone par
    pipeline har run par usi jagah mar jaata hai (json.load fail), aur saara
    handle mapping chala jaata hai.

Ab:
    1. PATH.tmp me poora likho
    2. flush + fsync  (disk par sach me pahunch gaya)
    3. purani ko PATH.prev bana do (ek peedhi ka safety net)
    4. os.replace(tmp, PATH)  -- Windows aur Linux dono par atomic
    Kabhi bhi PATH ya to poori purani hoti hai ya poori nayi. Aadhi kabhi nahi.

Saath me disk ki jagah bhi dekh lete hain -- bharnе wali disk par likhne se
pehle ruk jaana behtar hai.
"""
from __future__ import print_function
import json, os, shutil, sys

TMP_SUF = ".tmp"
PREV_SUF = ".prev"
MIN_FREE_MB = 200          # itni jagah na bache to likhna hi mat


def free_mb(path):
    """path ki disk par kitne MB khaali. Pata na chale to None."""
    try:
        d = path if os.path.isdir(path) else os.path.dirname(os.path.abspath(path)) or "."
        u = shutil.disk_usage(d)
        return u.free / (1024.0 * 1024.0)
    except Exception:
        return None


def check_space(path, need_mb=MIN_FREE_MB, log=print):
    """Jagah kam ho to False (aur ek saaf line log me)."""
    f = free_mb(path)
    if f is None:
        return True                      # pata hi nahi chala -> rok mat lagao
    if f < need_mb:
        log("  !! DISK LAGBHAG BHARI HAI: %s par sirf %d MB khaali (%d MB chahiye)"
            % (os.path.dirname(os.path.abspath(path)) or ".", int(f), int(need_mb)))
        return False
    return True


def atomic_write(path, data, encoding="utf-8", keep_prev=True):
    """data (str ya bytes) ko atomically likho."""
    tmp = path + TMP_SUF
    binary = isinstance(data, bytes)
    mode = "wb" if binary else "w"
    kw = {} if binary else {"encoding": encoding, "newline": ""}
    with open(tmp, mode, **kw) as fh:
        fh.write(data)
        fh.flush()
        try: os.fsync(fh.fileno())
        except Exception: pass
    if keep_prev and os.path.exists(path):
        try: shutil.copy2(path, path + PREV_SUF)
        except Exception: pass
    os.replace(tmp, path)
    return path


def atomic_json(path, obj, keep_prev=True, **dumps_kw):
    """json.dump ki jagah -- wahi kaam, par aadhi file kabhi nahi banti."""
    dumps_kw.setdefault("ensure_ascii", False)
    return atomic_write(path, json.dumps(obj, **dumps_kw), keep_prev=keep_prev)


def load_json(path, default=None, log=print):
    """json padho. File kharab ho to .prev se koshish karo, phir default."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except Exception as e:
        log("  !! %s padhi nahi gayi (%s)" % (os.path.basename(path), e))
        prev = path + PREV_SUF
        if os.path.exists(prev):
            try:
                with open(prev, encoding="utf-8") as f:
                    v = json.load(f)
                log("     -> pichhli theek copy (%s) se chala liya"
                    % os.path.basename(prev))
                return v
            except Exception as e2:
                log("     -> .prev bhi kharab (%s)" % e2)
        return default
