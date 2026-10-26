# -*- coding: utf-8 -*-
"""
mongo_swap.py  --  collection ko BINA khaali kiye badalna.

Dikkat kya thi (audit A1):
    db[coll].delete_many({})      <- collection ab KHAALI hai
    db[coll].insert_many(docs)    <- bharne me kuch second lagte hain

    Un do line ke BEECH me:
      * koi dashboard khole  -> "collection khaali hai" -> HTTP 500
      * Mongo gir jaaye / disk bhar jaaye / process mar jaaye
        -> collection HAMESHA ke liye khaali -> dashboard poora band

    Ye har ghante ke push me hota tha. Khaali window chhoti thi, par thi.

Ab kya hota hai:
    1. naya data "<coll>__new" me bharte hain  (asli collection ko haath nahi)
    2. ginti check karte hain -- jitne docs bheje, utne gaye ya nahi
    3. phir RENAME se swap:  coll -> coll__old,  coll__new -> coll
       rename Mongo ke andar metadata ka kaam hai, milliseconds ka.
    4. coll__old hata dete hain

    Kisi bhi step par kuch bigda to asli collection JYUN KA TYUN rehta hai
    aur exception upar jaata hai. Dashboard purana data dikhata rehta hai --
    jo khaali page se hamesha behtar hai.

Rename ke liye kisi replica-set ya transaction ki zaroorat nahi -- ye
single-node Mongo par bhi chalta hai.

Use:
    from mongo_swap import swap_collection
    swap_collection(db, "handles", docs)
"""
from __future__ import print_function

NEW_SUF = "__new"
OLD_SUF = "__old"
BATCH = 5000


def _drop_quiet(db, name):
    try:
        db[name].drop()
    except Exception:
        pass


def swap_collection(db, coll, docs, log=print, indexes=None, batch=BATCH):
    """docs ko `coll` me daal do -- bina ek pal ke liye bhi khaali kiye.

    docs    : list of dicts
    indexes : ['party','date'] jaisi list -- swap se PEHLE naye par lag jaate
              hain, taaki swap ke baad pehli query bhi tez ho
    """
    docs = list(docs or [])
    new = coll + NEW_SUF
    old = coll + OLD_SUF

    # pichhli baar ka adhoora kachra (agar process beech me mara ho)
    _drop_quiet(db, new)

    if not docs:
        # Khaali list = kuch gadbad hai (build fail hua). Purana mat mitao.
        raise ValueError("swap_collection('%s'): 0 docs bheje gaye -- "
                         "purana data waise hi rakha hai (kuch nahi badla)" % coll)

    # ---- 1. naye me bharo ----
    try:
        for i in range(0, len(docs), batch):
            db[new].insert_many(docs[i:i + batch], ordered=False)
    except Exception:
        _drop_quiet(db, new)
        raise

    # ---- 2. ginti milao ----
    try:
        got = db[new].count_documents({})
    except Exception:
        _drop_quiet(db, new)
        raise
    if got != len(docs):
        _drop_quiet(db, new)
        raise ValueError("swap_collection('%s'): %d bheje par %d pahunche -- "
                         "swap nahi kiya, purana data safe hai" % (coll, len(docs), got))

    # ---- 3. index (swap se pehle, taaki pehli query bhi tez ho) ----
    for ix in (indexes or []):
        try:
            db[new].create_index(ix)
        except Exception as e:
            log("    (index %s skip: %s)" % (ix, e))

    # ---- 4. swap ----
    names = set()
    try:
        names = set(db.list_collection_names())
    except Exception:
        pass

    _drop_quiet(db, old)
    try:
        if coll in names:
            db[coll].rename(old)                    # purana hatao
        db[new].rename(coll)                        # naya aage laao
    except Exception:
        # swap beech me toota -- purana wapas le aao
        try:
            if coll not in set(db.list_collection_names()) and old in set(db.list_collection_names()):
                db[old].rename(coll)
                log("    (swap fail -- purana '%s' wapas laga diya)" % coll)
        except Exception:
            pass
        _drop_quiet(db, new)
        raise

    _drop_quiet(db, old)
    log("  MongoDB %s: %d docs" % (coll, got))
    return got


def swap_collection_iter(db, coll, docs_iter, log=print, indexes=None, batch=BATCH):
    """swap_collection jaisa hi, par docs ek ITERATOR se aate hain aur
    `batch` ke tukdon me seedhe `<coll>__new` me jaate hain -- poori list
    kabhi RAM me nahi banti (8 GB laptop par 29 lakh docs ki list hi
    process ko maar deti thi). Ginti-check aur rename-swap wahi hain.
    """
    new = coll + NEW_SUF
    old = coll + OLD_SUF
    _drop_quiet(db, new)
    sent = 0
    buf = []
    try:
        for d in docs_iter:
            buf.append(d)
            if len(buf) >= batch:
                db[new].insert_many(buf, ordered=False); sent += len(buf); buf = []
        if buf:
            db[new].insert_many(buf, ordered=False); sent += len(buf); buf = []
    except Exception:
        _drop_quiet(db, new)
        raise
    if not sent:
        _drop_quiet(db, new)
        raise ValueError("swap_collection_iter('%s'): 0 docs bheje gaye -- "
                         "purana data waise hi rakha hai (kuch nahi badla)" % coll)
    try:
        got = db[new].count_documents({})
    except Exception:
        _drop_quiet(db, new)
        raise
    if got != sent:
        _drop_quiet(db, new)
        raise ValueError("swap_collection_iter('%s'): %d bheje par %d pahunche -- "
                         "swap nahi kiya, purana data safe hai" % (coll, sent, got))
    for ix in (indexes or []):
        try:
            db[new].create_index(ix)
        except Exception as e:
            log("    (index %s skip: %s)" % (ix, e))
    names = set()
    try:
        names = set(db.list_collection_names())
    except Exception:
        pass
    _drop_quiet(db, old)
    try:
        if coll in names:
            db[coll].rename(old)
        db[new].rename(coll)
    except Exception:
        try:
            if coll not in set(db.list_collection_names()) and old in set(db.list_collection_names()):
                db[old].rename(coll)
                log("    (swap fail -- purana '%s' wapas laga diya)" % coll)
        except Exception:
            pass
        _drop_quiet(db, new)
        raise
    _drop_quiet(db, old)
    log("  MongoDB %s: %d docs" % (coll, got))
    return got


def swap_many(db, pairs, log=print, indexes=None):
    """Ek saath kai collection. pairs = [(name, docs), ...]

    Pehle SAARE naye banate hain, phir ek-ek karke swap.
    Isse 'handles naya, dashboard_data purana' jaisi aadhi haalat ka
    window kam se kam rehta hai (sirf renames ka, milliseconds).
    """
    indexes = indexes or {}
    staged = []
    try:
        for coll, docs in pairs:
            docs = list(docs or [])
            if not docs:
                raise ValueError("swap_many: '%s' ke 0 docs -- kuch nahi badla" % coll)
            new = coll + NEW_SUF
            _drop_quiet(db, new)
            for i in range(0, len(docs), BATCH):
                db[new].insert_many(docs[i:i + BATCH], ordered=False)
            got = db[new].count_documents({})
            if got != len(docs):
                raise ValueError("swap_many: '%s' me %d bheje par %d pahunche -- kuch nahi badla"
                                 % (coll, len(docs), got))
            for ix in indexes.get(coll, []):
                try: db[new].create_index(ix)
                except Exception as e: log("    (index %s skip: %s)" % (ix, e))
            staged.append((coll, got))
    except Exception:
        for coll, _n in staged:
            _drop_quiet(db, coll + NEW_SUF)
        try:
            for coll, _d in pairs:
                _drop_quiet(db, coll + NEW_SUF)
        except Exception:
            pass
        raise

    # saare ban gaye -> ab swap
    try:
        names = set(db.list_collection_names())
    except Exception:
        names = set()
    for coll, got in staged:
        old = coll + OLD_SUF
        _drop_quiet(db, old)
        if coll in names:
            db[coll].rename(old)
        db[coll + NEW_SUF].rename(coll)
        _drop_quiet(db, old)
        log("  MongoDB %s: %d docs" % (coll, got))
    return [g for _c, g in staged]
