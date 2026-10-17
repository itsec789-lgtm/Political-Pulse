# -*- coding: utf-8 -*-
"""
make_up_base.py  -  india_Pulse (All-India) se sirf Uttar Pradesh ka data nikaal kar
UP base banata hai (up_pulse ke liye). EK BAAR chalao (ya jab structure badle).

Chalao:  python make_up_base.py            (india_Pulse MongoDB se padhega)
         python make_up_base.py --file "path\to\dashboard_data.json"   (testing)
"""
import sys, os, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
SRC_DB = "india_Pulse"
UP = "Uttar Pradesh"
MET = ('tw', 'vw', 'lk', 'rt', 'pos', 'neu', 'neg')


def _blank():
    return {'tw': 0, 'vw': 0, 'lk': 0, 'rt': 0, 'pos': 0, 'neu': 0, 'neg': 0}


def load_blobs():
    if '--file' in sys.argv:
        p = sys.argv[sys.argv.index('--file') + 1]
        arr = json.load(open(p, encoding='utf-8'))
        phd = None
        phdp = os.path.join(os.path.dirname(p), 'phd.json')
        if os.path.exists(phdp):
            pl = json.load(open(phdp, encoding='utf-8'))
            phd = {d['h']: {'t': d.get('t'), 'v': d.get('v'), 'k': d.get('k'), 'r': d.get('r')} for d in pl}
        return {b['key']: b['value'] for b in arr}, phd
    from pymongo import MongoClient
    cli = MongoClient(MONGO_URL)
    db = cli[SRC_DB]
    blobs = {d['key']: d['value'] for d in db['dashboard_data'].find({})}
    phd = {d['h']: {'t': d.get('t'), 'v': d.get('v'), 'k': d.get('k'), 'r': d.get('r')} for d in db['phd'].find({})}
    return blobs, phd


def build_up(blobs, phd=None):
    uni = blobs['UNI']
    # UP handles only
    upH = [h for h in uni['allHandles'] if h.get('state') == UP]
    upset = set(h['h'] for h in upH)

    U = {}
    U['allHandles'] = upH
    U['handles'] = len(upH)
    # tot + level + sent
    tot = _blank()
    lv = collections.Counter()
    sent = {'pos': 0, 'neu': 0, 'neg': 0}
    for h in upH:
        for k in MET: tot[k] += (h.get(k) or 0)
        lv[h.get('level', 'Others')] += (h.get('tw') or 0)
        for sk in ('pos', 'neu', 'neg'): sent[sk] += (h.get(sk) or 0)
    U['tot'] = {'tw': tot['tw'], 'vw': tot['vw'], 'lk': tot['lk'], 'rt': tot['rt'], 'cm': 0, 'bm': 0}
    U['level'] = dict(lv)
    U['sent'] = sent
    # party (rich)
    party = {}
    for h in upH:
        p = h.get('party', '')
        if not p: continue
        pd = party.get(p)
        if pd is None: pd = _blank(); pd['handles'] = 0; party[p] = pd
        for k in MET: pd[k] += (h.get(k) or 0)
        pd['handles'] += 1
    U['party'] = party
    # states -> sirf UP (rich)
    st_tot = _blank(); st_party = {}
    for h in upH:
        for k in MET: st_tot[k] += (h.get(k) or 0)
        p = h.get('party', '')
        if p:
            sp = st_party.get(p)
            if sp is None: sp = _blank(); st_party[p] = sp
            for k in MET: sp[k] += (h.get(k) or 0)
    U['states'] = {UP: {'tot': st_tot, 'handles': len(upH), 'party': st_party, 'sent': dict(sent)}}
    # topHandles (top UP by views)
    U['topHandles'] = sorted(upH, key=lambda h: -(h.get('vw') or 0))[:20]
    # keep UP-specific blobs
    U['updist'] = uni.get('updist', {})
    U['viral_up'] = uni.get('viral_up', [])
    U['updates'] = uni.get('updates', [])
    U['viral'] = [v for v in uni.get('viral', []) if v.get('state') == UP][:50]
    blobs['UNI'] = U

    # CM_DATA -> UP only
    blobs['CM_DATA'] = [c for c in blobs.get('CM_DATA', []) if c.get('state') == UP]
    # STATE_DATA -> UP row only
    blobs['STATE_DATA'] = [r for r in blobs.get('STATE_DATA', []) if r.get('state') == UP]
    # PARTY_DATA -> recompute from UP handles
    pd_new = {}
    for p, pv in party.items():
        pd_new[p] = {'tweets': pv['tw'], 'views': pv['vw'], 'likes': pv['lk'], 'rt': pv['rt'],
                     'pos': pv['pos'], 'neu': pv['neu'], 'neg': pv['neg']}
    if isinstance(blobs.get('PARTY_DATA'), dict):
        blobs['PARTY_DATA'] = {k: v for k, v in blobs['PARTY_DATA'].items() if k in party} or pd_new
    # MLA_DATA / PARTY_HANDLES / HANDLES -> filter to UP handles if list-of-handles
    for key in ('MLA_DATA', 'HANDLES', 'TWEETS'):
        v = blobs.get(key)
        if isinstance(v, list):
            blobs[key] = [x for x in v if (isinstance(x, dict) and (x.get('h') in upset or x.get('handle') in upset or x.get('state') == UP))] or v
    # D -> handles UP, recompute party stuff
    D = blobs.get('D', {})
    dH = [h for h in D.get('handles', []) if h.get('s') == UP]
    D['handles'] = dH
    ND = len(D.get('AD', [])) or (len(dH[0]['t']) if dH else 0)
    top_parties = [p for p, _ in sorted(party.items(), key=lambda kv: -kv[1]['tw'])][:8]
    D['parties'] = top_parties
    pdaily = {p: {'t': [0]*ND, 'v': [0]*ND, 'k': [0]*ND, 'r': [0]*ND} for p in top_parties + ['Others']}
    for h in dH:
        p = h.get('p', '')
        o = pdaily.get(p) or pdaily['Others']
        for i in range(min(ND, len(h.get('t', [])))):
            o['t'][i] += h['t'][i]; o['v'][i] += h['v'][i]
    D['partyDaily'] = pdaily
    T = (sent['pos'] + sent['neu'] + sent['neg']) or 1
    D['sent'] = {'Neutral': round(sent['neu']*100.0/T, 1), 'Positive': round(sent['pos']*100.0/T, 1), 'Negative': round(sent['neg']*100.0/T, 1)}
    blobs['D'] = D

    # ---- GROWTH -> sirf UP handles (Growth tab isi se banta hai) ----
    G = blobs.get('GROWTH')
    if isinstance(G, dict) and isinstance(G.get('H'), dict):
        blobs['GROWTH'] = {'dates': G.get('dates', []),
                           'H': {h: v for h, v in G['H'].items() if v.get('s') == UP}}

    # ---- DAILY_DATA + AGG -> UP per-din (phd me t,v,k,r sab -> likes/RT charts bhi chalein) ----
    AD = D.get('AD', [])
    NDD = len(AD)
    lvlparty = {h['h']: (h.get('level', 'Others'), h.get('party', '')) for h in upH}
    if NDD and phd:
        tw = [0]*NDD; lk = [0]*NDD; vw = [0]*NDD; rt = [0]*NDD
        S = {}
        def _add(key, i, t_, v_, k_, r_):
            s = S.get(key)
            if s is None: s = {'t': [0]*NDD, 'v': [0]*NDD, 'k': [0]*NDD, 'r': [0]*NDD}; S[key] = s
            s['t'][i] += t_; s['v'][i] += v_; s['k'][i] += k_; s['r'][i] += r_
        for h, (l, p) in lvlparty.items():
            e = phd.get(h)
            if not e: continue
            T = e.get('t') or []; V = e.get('v') or []; K = e.get('k') or []; R = e.get('r') or []
            for i in range(NDD):
                t_ = T[i] if i < len(T) else 0; v_ = V[i] if i < len(V) else 0
                k_ = K[i] if i < len(K) else 0; r_ = R[i] if i < len(R) else 0
                tw[i] += t_; vw[i] += v_; lk[i] += k_; rt[i] += r_
                _add(l+'|ALL', i, t_, v_, k_, r_); _add('ALL|ALL', i, t_, v_, k_, r_)
                if p:
                    _add(l+'|'+p, i, t_, v_, k_, r_); _add('ALL|'+p, i, t_, v_, k_, r_)
        blobs['DAILY_DATA'] = [{'d': AD[i], 'tw': tw[i], 'lk': lk[i], 'vw': vw[i], 'rt': rt[i]} for i in range(NDD)]
        blobs['AGG'] = {'dates': AD, 'S': S}

    return blobs


if __name__ == "__main__":
    blobs, phd = load_blobs()
    print("Loaded blobs:", list(blobs.keys())[:6], "...")
    upblobs = build_up(blobs, phd)
    U = upblobs['UNI']
    print("UP: handles=%d  tweets=%d  parties=%d  districts=%d  viral=%d" % (
        U['handles'], U['tot']['tw'], len(U['party']), len(U['updist']), len(U['viral_up'])))
    print("CM_DATA(UP):", len(upblobs['CM_DATA']), "| D.handles(UP):", len(upblobs['D']['handles']))
    # write base
    os.makedirs(DATA, exist_ok=True)
    docs = [{"key": k, "value": v} for k, v in upblobs.items()]
    json.dump(docs, open(os.path.join(DATA, "dashboard_data.json"), 'w', encoding='utf-8'), ensure_ascii=False)
    print("UP base written:", os.path.join(DATA, "dashboard_data.json"))
    if phd is not None:
        upphd = [{"h": h, **v} for h, v in phd.items() if h in set(x['h'] for x in U['allHandles'])]
        json.dump(upphd, open(os.path.join(DATA, "phd.json"), 'w', encoding='utf-8'), ensure_ascii=False)
        print("UP phd written:", len(upphd), "handles")
