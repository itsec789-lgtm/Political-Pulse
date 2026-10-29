# -*- coding: utf-8 -*-
"""
update_dashboard.py  -  Nayi CSV se dashboard ka data update karo.

Ab ye SAB recompute karta hai (kuch static nahi):
  - handles / phd / mapping
  - UNI (tot, level, party, state, sent, allHandles)
  - STATE_DATA, PARTY_DATA, AGG (daily)
  - CM_DATA (State CM overview + map)         <- NAYA
  - HASHTAGS + HTFULL (hashtag tab)           <- NAYA
  - D (overview charts, hourly, party-daily)  <- NAYA
  - DAILY_DATA (daily chart)                  <- NAYA

Chalao:
    python update_dashboard.py "C:\\path\\to\\data.csv"
    python update_dashboard.py "C:\\path\\to\\data.csv" --push
Zaroorat:  pip install pandas pymongo
"""
import sys, os, json, collections, re, datetime
import pandas as pd
import src_chunks as _SRC

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
CUR_DD = os.path.join(DATA, "dashboard_data.json")
from mongo_conf import MONGO_URL  # <- central: db_config.json / MONGO_URL env (mongo_conf.py)
DB_NAME = "india_Pulse"
SCOPE_STATE = None   # None = All-India (koi filter nahi); 'Uttar Pradesh' = sirf UP
DASH = "—"   # em-dash (state default)

LVL = {'LS_MP':'LS MP','RS_MP':'RS MP','MLA':'MLA','Mla':'MLA','MLC':'MLC',
       'Chief Minister':'Chief Minister','Deputy Chief Minister':'Dy CM',
       'MLA Contestent':'MLA Contestent','MLA Contestant':'MLA Contestent'}

# Designation ab 'MLA | MLA Contestent' jaisi ho sakti hai (dual role).
# Pehle poori string ka exact match dhoonda jaata tha -> 'Others' me gir jaati thi.
# Ab '|' se tod kar sabse UNCHA pad chunte hain.
# 'MLA Contestent' sabse neeche hai -- jo aadmi baitha hua MLA bhi hai aur
# kabhi contest bhi kiya tha, wo MLA hi ginaa jaayega.
LVL_PRI = {'Chief Minister': 0, 'Dy CM': 1, 'LS MP': 2, 'RS MP': 3,
           'MLA': 4, 'MLC': 5, 'MLA Contestent': 6, 'Others': 7}


# ---------------------------------------------------------------------------
# SENTIMENT -- ab 8 category hain (pehle sirf 3 the: Positive/Neutral/Negative).
#
# MongoDB ke 'Sentiment' column me asal me ye values padi hain (ginti karke dekha):
#   Neutral, Positive, Pro-BJP, Negative, Pro-Govt, Anti-Govt, Anti-BJP
# Aathvi category 'No-Sentiment' hai -- jahan value khaali/gayab/pehchani na jaaye.
#
# CODE (chhota key) hi poore dashboard me chalta hai. pos/neu/neg jaan-boojh kar
# purane hi naam rakhe hain, taaki purana saara UI/JSON bina toote chalta rahe --
# sirf 5 nayi key JUD rahi hain, koi purani key hat nahi rahi.
# ---------------------------------------------------------------------------
SENT_CATS = [
    ('probjp',   'Pro-BJP'),
    ('antigovt', 'Anti-Govt'),
    ('progovt',  'Pro-Govt'),
    ('pos',      'Positive'),
    ('neu',      'Neutral'),
    ('antibjp',  'Anti-BJP'),
    ('neg',      'Negative'),
    ('none',     'No-Sentiment'),
]
SENT_CODES = [c for c, _ in SENT_CATS]
SENT_LABEL = dict(SENT_CATS)

# 'Pro BJP', 'pro-bjp', 'ProBJP' -- teeno ek hi hain. Isliye pehle saare
# non-alphanumeric hata dete hain, phir map karte hain.
_SENT_SQUASH = re.compile(r'[^a-z0-9]+')
_SENT_MAP = {
    'probjp': 'probjp', 'prbjp': 'probjp', 'bjppro': 'probjp',
    'antibjp': 'antibjp', 'bjpanti': 'antibjp',
    'progovt': 'progovt', 'progov': 'progovt', 'progovernment': 'progovt',
    'antigovt': 'antigovt', 'antigov': 'antigovt', 'antigovernment': 'antigovt',
    'positive': 'pos', 'pos': 'pos',
    'negative': 'neg', 'neg': 'neg',
    'neutral': 'neu', 'neu': 'neu',
    'nosentiment': 'none', 'nosent': 'none', 'none': 'none',
    'na': 'none', 'nan': 'none', 'null': 'none', '': 'none',
}


def sent_code(v):
    """Sentiment ki value -> chhota code. Jo pehchani na jaaye wo 'none' (No-Sentiment).
    Kuch bhi chupke se gira nahi -- har tweet kisi na kisi bucket me jaata hai."""
    return _SENT_MAP.get(_SENT_SQUASH.sub('', str(v if v is not None else '').strip().lower()), 'none')


def sent_blank():
    return {c: 0 for c in SENT_CODES}


def lvl_from_desig(s):
    parts = [p.strip() for p in str(s or '').split('|') if p.strip()]
    got = [LVL[p] for p in parts if p in LVL]
    if not got:
        return 'Others'
    return min(got, key=lambda L: LVL_PRI.get(L, 99))

# ---------------------------------------------------------------------------
# WORD CLOUD
# Tweet text me se aam shabd nikaal kar ginte hain.
# Devanagari saaf-saaf likhna PADTA hai: Python ka \w matra (ं ा ि) ko shabd
# ka hissa nahi maanta, isliye '#संविधान' se sirf '#स' bachta tha.
# ---------------------------------------------------------------------------
_URL_RE = re.compile(r'https?://\S+|www\.\S+')
_MENTION_RE = re.compile(r'@\w+')
_TAG_RE = re.compile(r'#[\wऀ-ॿ]+')
# NOTE: danda '।' (U+0964) bhi Devanagari block me hai, isliye seedhi range
# lagane par "है।" aur "है" alag-alag shabd ban jaate the. Use chhod diya.
_WORD_RE = re.compile(r'[a-z0-9ऀ-ॣ०-ॿ]+')

STOPWORDS = set("""
the a an and or of to in on for is are was were be been being with at by from this that these those
it its as we you they he she his her our your their i me my not no nor will would can could should
has have had do does did but if so than then there here what which who whom when where why how all
any both each few more most other some such only own same very just also into over under again
further once about against between during before after above below up down out off too dont amp rt via
http https com www co in org net twitter status pic
pe ka ki ke ko se me mein hai hain ho ye yeh wo woh aur par bhi tha the na nahi kar karo kiya raha rahe
rahi kare karne liye sab apne apni hua hui hue gaya gayi gaye jo ki tak baad pehle saath uske iske
unke inke kuch bahut abhi aaj kal ek do teen jaise waise phir bas ab tab yaha waha kyun kyu kaise
में है हैं था थे थी और एवं के का की को से पर यह वह ये वे हम आप उन इस उस लिए किया करने कर करो
साथ भी नहीं तो ही जो कि तक बाद पहले सभी सब अपने अपनी हुए हुई हुआ गया गई गए रहे रही रहा जी श्री
द्वारा एक दो तीन कुछ बहुत अब आज कल जैसे वैसे फिर बस यहाँ वहाँ क्यों कैसे लेकिन या तथा अपना
""".split())

C = {'handle':'Handle','date':'Tweet Date','text':'Tweet Text','likes':'Total Likes',
     'rts':'Total Retweets','views':'Total Views','sent':'Sentiment','state':'State',
     'desig':'Designation','name':'Candidate Name','party':'Party',
     'followers':'Followers','followings':'Followings','pc':'PC Name','ac':'AC Name',
     'cat':'Category'}

# ye dashboard ke charts/KPI me NAHI aayenge (sirf reports/export me rahenge)
EXCLUDE_CAT = {'media house', 'journalist'}


# ---- '-' ko khaali maano ----
# BUG: Python me '-' truthy hai. Pehle "row[PC] or row[AC]" likha tha, to jis row me
# PC Name '-' tha wahan asli AC Name kabhi padha hi nahi jaata tha -- 954 handles ka
# PC/AC Name table me khaali aa raha tha (Yogi Adityanath tak).
_DASHES = ('', '-', '\u2014', 'nan', 'None', 'null')


def _v(x):
    s = str(x if x is not None else '').strip()
    return '' if s in _DASHES else s


def _first(*vals):
    for v in vals:
        s = _v(v)
        if s:
            return s
    return ''


# ---- handle_master.json = master mapping; table ka koi khaana khaali na rahe ----
_MASTER = None


def master_map():
    global _MASTER
    if _MASTER is None:
        try:
            import json as _j
            with open(os.path.join(DATA, 'handle_master.json'), encoding='utf-8') as f:
                _MASTER = _j.load(f)
        except Exception as e:
            print("  (handle_master.json nahi padha: %s)" % e)
            _MASTER = {}
    return _MASTER


def from_master(h, *keys):
    v = master_map().get(h) or {}
    return _first(*[v.get(k) for k in keys])


def load_template():
    blobs = json.load(open(CUR_DD, encoding='utf-8'))
    return {b['key']: b['value'] for b in blobs}


# rt-split (27-Oct): "RT @..." rows are reposts of someone else's post, and X sends the ORIGINAL
# post's likes/views/retweets with them. They used to be counted as the handle's own tweets and
# their retweet numbers inflated "Retweets" ~30x. Now tw/lk/vw/rt = the handle's OWN posts only;
# reposts are counted separately as 'rc' (acc) and RC_DAILY[(handle, day)] (-> phd 'c').
# metrics_lib (29-Oct): sentiment, hashtags, word cloud and hourly activity bhi ab SIRF own posts --
# pehle ye har row (reposts samet) ginte the, isliye sentiment/heatmap tweet KPI se mel nahi khaate the.
RC_DAILY = collections.defaultdict(int)
# tw-rt-split (27-Oct): likes / views of the reposted ORIGINAL posts, per (handle, day) -> phd 'l' / 'w'
RL_DAILY = collections.defaultdict(int)
# rt-sent (29-Oct): retweet ("RT @") rows ka sentiment -- Sentiment tab ka "Retweets" view.
# RS_ACC[handle][code] = us handle ke retweets ka sentiment; RS_DAILY[(state, day, code)] = roz ka.
RS_ACC = collections.defaultdict(lambda: {c: 0 for c in SENT_CODES})
RS_DAILY = collections.defaultdict(int)
RV_DAILY = collections.defaultdict(int)


def read_csv_agg(csv_path, query=None):
    RC_DAILY.clear(); RL_DAILY.clear(); RV_DAILY.clear(); RS_ACC.clear(); RS_DAILY.clear()
    # hot/cold plan, Phase 4: "SPLIT" = per-day summary for old days + raw tweets for the
    # last N days (summary_agg.py). Same 11 return values, so build() is unchanged.
    if str(csv_path).strip().upper() == 'SPLIT':
        try:
            import summary_agg
            return summary_agg.split_agg(sys.modules[__name__])
        except Exception as _e:
            print("  !! SPLIT nahi chala (%s) -- poora MONGO read kar rahe hain" % _e)
            csv_path = 'MONGO'
    acc = {}
    meta = {}
    daily = collections.defaultdict(lambda: [0, 0, 0, 0])   # (handle,date)->[t,v,k,r]
    dates = set()
    htag = collections.defaultdict(lambda: dict({'c':0,'lk':0,'vw':0}, **sent_blank()))
    htag_party = collections.defaultdict(lambda: collections.defaultdict(lambda: dict({'c':0,'lk':0,'vw':0}, **sent_blank())))
    sdaily = collections.defaultdict(int)     # (state, date, sentiment-code) -> count
    htag_daily = collections.defaultdict(lambda: collections.defaultdict(int))          # tag -> date -> count
    htag_party_daily = collections.defaultdict(lambda: collections.defaultdict(int))    # (party,tag) -> date -> count
    words = collections.Counter()                                                       # Word Cloud
    hourly = [0]*24
    need = list(set(C.values()))
    for ch in _SRC.chunks(csv_path, need, query):
        ch = ch.rename(columns=lambda c: c.strip()).fillna('')
        if SCOPE_STATE:
            ch = ch[ch[C['state']].astype(str).str.strip() == SCOPE_STATE]
        # SIRF media house / journalist bahar (reports me rahenge).
        # Bina-state wale POLITICAL handles (BJP4India, Amit Malviya jaise) rehne chahiye.
        if C['cat'] in ch.columns:
            ch = ch[~ch[C['cat']].astype(str).str.strip().str.lower().isin(EXCLUDE_CAT)]
        if len(ch) == 0:
            continue
        for col in [C['likes'], C['rts'], C['views'], C['followers'], C['followings']]:
            ch[col] = pd.to_numeric(ch[col].str.replace(',', '', regex=False), errors='coerce').fillna(0)
        # har row ka sentiment code, phir har category ka 0/1 flag column.
        # column ke naam '_pos'/'_neu'/'_neg' wahi rehte hain jo pehle the.
        ch['_sc'] = ch[C['sent']].map(sent_code)
        for _c in SENT_CODES:
            ch['_' + _c] = (ch['_sc'] == _c).astype(int)
        ch['_d'] = ch[C['date']].str[:10]
        ch['_h'] = pd.to_numeric(ch[C['date']].str[11:13], errors='coerce').fillna(-1).astype(int)
        # per-handle
        _rtm = ch[C['text']].astype(str).str.startswith('RT @')          # rt-split
        ch['_o'] = (~_rtm).astype(int)
        ch['_rc'] = _rtm.astype(int)
        try:                                                            # rt-sent: retweets ka sentiment
            _rr = ch[_rtm]
            if len(_rr):
                for (_h, _cd), _n in _rr.groupby([C['handle'], '_sc']).size().items():
                    _h = str(_h).strip()
                    if _h and _cd in SENT_CODES: RS_ACC[_h][_cd] += int(_n)
                for (_st, _dd, _cd), _n in _rr.groupby([C['state'], '_d', '_sc']).size().items():
                    _dd = str(_dd)[:10]
                    if len(_dd) == 10: RS_DAILY[(str(_st).strip() or DASH, _dd, _cd)] += int(_n)
        except Exception as _e:
            print("  (rt-sent skip: %s)" % _e)
        for _c in SENT_CODES:                                           # metrics_lib: sentiment = own posts
            ch['_' + _c] = ch['_' + _c] * ch['_o']
        ch['_olk'] = ch[C['likes']] * ch['_o']
        ch['_ort'] = ch[C['rts']] * ch['_o']
        ch['_ovw'] = ch[C['views']] * ch['_o']
        ch['_rlk'] = ch[C['likes']] * ch['_rc']
        ch['_rvw'] = ch[C['views']] * ch['_rc']
        _agg = dict(tw=('_o', 'sum'), lk=('_olk', 'sum'), rt=('_ort', 'sum'),
                    vw=('_ovw', 'sum'), rc=('_rc', 'sum'))
        for _c in SENT_CODES:
            _agg[_c] = ('_' + _c, 'sum')
        g = ch.groupby(C['handle']).agg(**_agg)
        for h, r in g.iterrows():
            h = h.strip()
            if not h: continue
            a = acc.setdefault(h, dict({'tw':0,'lk':0,'rt':0,'vw':0}, **sent_blank()))
            a['tw']+=int(r['tw']); a['lk']+=int(r['lk']); a['rt']+=int(r['rt']); a['vw']+=int(r['vw'])
            a['rc'] = a.get('rc', 0) + int(r['rc'])
            for _c in SENT_CODES: a[_c] += int(r[_c])
        # daily
        gd = ch.groupby([C['handle'], '_d']).agg(t=('_o', 'sum'), k=('_olk', 'sum'), r=('_ort', 'sum'), v=('_ovw', 'sum'), c=('_rc', 'sum'), l=('_rlk', 'sum'), w=('_rvw', 'sum'))
        for (h, d), r in gd.iterrows():
            h = h.strip()
            if not h or len(d) != 10: continue
            dates.add(d); e = daily[(h, d)]; e[0]+=int(r['t']); e[1]+=int(r['v']); e[2]+=int(r['k']); e[3]+=int(r['r'])
            if int(r['c']):
                RC_DAILY[(h, d)] += int(r['c']); RL_DAILY[(h, d)] += int(r['l']); RV_DAILY[(h, d)] += int(r['w'])
        # meta -- har handle ka SABSE NAYA row.
        # (pehle 'h not in meta' tha -> followers/followings sabse PURANE tweet ke reh jaate the
        #  aur kabhi update nahi hote the. Ab latest tweet se lete hain.)
        ch['_dt'] = ch[C['date']].astype(str).str[:19]
        try:
            idx = ch.groupby(C['handle'])['_dt'].idxmax()
            latest = ch.loc[idx]
        except Exception:
            latest = ch.drop_duplicates(C['handle'])
        for r in latest.itertuples(index=False):
            row = dict(zip(latest.columns, r)); h = str(row[C['handle']]).strip()
            if not h: continue
            dt = str(row.get('_dt', ''))
            m = meta.get(h)
            if m is None:
                m = meta[h] = {'name': h, 'party': '', 'levelCSV': 'Others', 'state': DASH,
                               'followers': 0, 'followings': 0, 'pcName': '', '_dt': '', '_fdt': ''}
            if dt >= m.get('_dt', ''):                      # naya row -> naam/party/state refresh
                m['_dt'] = dt
                # ---- map-wins : MAPPING hi sach hai ----
                # Pehle ye saari value scrape ki hui CSV se aati thi, aur mapping
                # sirf KHAALI khaane bharti thi. Natija: Mapping.xlsx me party ya
                # state badal do, to dashboard par purani hi dikhti rehti thi
                # (CSV me purana value pada hai, khaali nahi).
                # Ab ulta hai: mapping me asli value ho to WAHI chalti hai,
                # aur mapping khaali ho tabhi CSV ka value liya jaata hai.
                # Tweet ka text/views/likes kabhi nahi chhede jaate -- wo itihaas hai.
                m['name'] = (from_master(h, 'name') or str(row[C['name']]).strip() or h)
                m['party'] = (from_master(h, 'party') or row[C['party']])
                m['levelCSV'] = lvl_from_desig(
                    from_master(h, 'designation_raw') or row[C['desig']])
                m['state'] = (from_master(h, 'state') or _first(row[C['state']]) or DASH)
                m['pcName'] = (from_master(h, 'pc_name', 'ac_name')
                               or _first(row[C['pc']], row[C['ac']]))
            fw = int(row[C['followers']] or 0); fg = int(row[C['followings']] or 0)
            if fw and dt >= m.get('_fdt', ''):              # followers sirf non-zero se update
                m['_fdt'] = dt; m['followers'] = fw; m['followings'] = fg
        # hashtags (+ per party) + likes/views
        for txt, party, lk, vw, _sc, d, _own in zip(ch[C['text']], ch[C['party']], ch[C['likes']], ch[C['views']], ch['_sc'], ch['_d'], ch['_o']):
            if not _own: continue                                       # metrics_lib: repost ka text apna nahi
            # ---- Word Cloud ----
            # Hashtag wale 'continue' se PEHLE, warna bina hashtag wale tweets
            # (jo zyadatar hote hain) ke shabd kabhi gine hi na jaayein.
            _s = str(txt)
            if _s:
                _s = _URL_RE.sub(' ', _s)
                _s = _MENTION_RE.sub(' ', _s)     # @handle shabd nahi hai
                _s = _TAG_RE.sub(' ', _s)         # #hashtag alag ginte hain
                for w in _WORD_RE.findall(_s.lower()):
                    if len(w) >= 3 and w not in STOPWORDS and not w.isdigit():
                        words[w] += 1

            # \w Devanagari ki matra (ं ा ि) par ruk jaata hai -- '#संविधान' se sirf '#स'
            # bachta tha. Isliye Devanagari block saaf-saaf jod diya.
            tags = set(re.findall(r'#[\wऀ-ॣ०-ॿ]+', str(txt).lower()))
            if not tags: continue
            lk = int(lk); vw = int(vw); d = str(d)[:10]
            pk = str(party).strip()
            for tag in tags:
                t = htag[tag]; t['c']+=1; t['lk']+=lk; t['vw']+=vw; t[_sc]+=1
                htag_daily[tag][d] += 1
                if pk:
                    tp = htag_party[pk][tag]; tp['c']+=1; tp['lk']+=lk; tp['vw']+=vw; tp[_sc]+=1
                    htag_party_daily[(pk, tag)][d] += 1
        # ---- per state / per din / per sentiment ----
        # Sentiment Trend chart pehle NAKLI tha (har din ka tweet count x fixed ratio).
        # Ab wo isi ginti se banta hai.
        try:
            _gsd = ch[ch['_o'] == 1].groupby([C['state'], '_d', '_sc']).size()
            for (_st, _dd2, _cd), _n in _gsd.items():
                _dd2 = str(_dd2)[:10]
                if len(_dd2) != 10: continue
                sdaily[(str(_st).strip() or DASH, _dd2, _cd)] += int(_n)
        except Exception as _e:
            print("  (sentiment-daily skip: %s)" % _e)

        # hourly
        hc = ch.loc[ch['_o'] == 1, '_h'].value_counts()                 # metrics_lib: own posts
        for hr, cnt in hc.items():
            if 0 <= int(hr) < 24: hourly[int(hr)] += int(cnt)
    return acc, meta, daily, sorted(dates), htag, htag_party, hourly, htag_daily, htag_party_daily, words, sdaily


# ---- map-gate : Mapping hi master hai -----------------------------------
# Pehle har table SIRF scrape kiye hue tweets se banta tha. Mapping.xlsx se
# koi handle hata do, to uske purane tweet Mongo me pade rehte the aur wo
# handle dashboard me dikhta hi rehta tha. Ab build karte waqt har handle
# handle_master.json ke saamne rakha jaata hai.
#
# handle_master.json khud rebuild_mapping.py banata hai -- yaani Mapping.xlsx
# badalne ke baad "RUN_MAPPING_UPDATE.bat" chalana zaroori hai, warna yahan
# purani hi mapping dikhegi.
#
# Safety: mapping padhi na gayi ho ya bahut chhoti ho, to kuch nahi chhanta.
def map_gate(acc, meta, daily):
    m = master_map()
    if not m or len(m) < 100:
        print("  (map-gate: mapping nahi padhi -- filter nahi lagaya)")
        return acc, meta, daily
    low = {str(k).strip().lower() for k in m}

    # SIRF jaan-boojhkar hataye gaye handle hatate hain. 'mapping me nahi hai'
    # kaafi nahi -- bahut se handle (Narendra Modi jaise) kabhi Mapping.xlsx
    # me aaye hi nahi, unhe hatana galat hota.
    removed = set()
    try:
        import json as _j
        with open(os.path.join(DATA, 'mapping_removed.json'), encoding='utf-8') as _f:
            for _h in (_j.load(_f).get('handles') or []):
                _h = str(_h).strip().lstrip('@').lower()
                if _h:
                    removed.add(_h)
    except Exception:
        pass
    if not removed:
        print("  (map-gate: koi handle jaan-boojhkar hataya nahi gaya -- kuch nahi chhanta)")
        return acc, meta, daily

    def keep(h):
        h = str(h).strip().lstrip('@').lower()
        return (h in low) or (h not in removed)

    gone = sorted({h for h in acc if not keep(h)})
    if not gone:
        return acc, meta, daily
    acc = {h: v for h, v in acc.items() if keep(h)}
    meta = {h: v for h, v in meta.items() if keep(h)}
    daily = {k: v for k, v in daily.items() if keep(k[0])}
    show = ', '.join(gone[:8]) + (', ...' if len(gone) > 8 else '')
    print("  map-gate: %d handle mapping me nahi hain -- hata diye (%s)" % (len(gone), show))
    return acc, meta, daily


# ---- case-merge : ek hi handle, alag spelling -> ek hi row ------------
# Mongo me kisi handle ke tweet do spelling me pade hain (@AmitShah aur
# @amitshah). Dono alag aadmi dikhte the -- Top Performers me "Amit Shah"
# do baar, dropdown me do baar, aur ginti bhi bant jaati thi.
# Yahan unhe JOD dete hain: tweet/views/likes jud jaate hain, aur naam wahi
# rehta hai jo MAPPING me likha hai (warna jiske zyada tweet hain wo).
# Ye sabse upar hota hai, isliye har table, chart, KPI aur dropdown --
# sab ko ek hi row milti hai.
def case_merge(acc, meta, daily):
    groups = {}
    for h in acc:
        groups.setdefault(h.strip().lower(), []).append(h)
    dups = {k: v for k, v in groups.items() if len(v) > 1}
    if not dups:
        return acc, meta, daily

    mp = master_map()
    mp_ci = {str(k).strip().lower(): k for k in mp}
    keep = {}
    for low, hs in groups.items():
        if len(hs) == 1:
            keep[low] = hs[0]
            continue
        # Kaun si spelling rakhni hai, isi kram me:
        #   1. jo Mapping.xlsx me LIKHI hai (alias nahi)  <- @AmitShah
        #   2. jo mapping me hai (chaahe alias ho)
        #   3. warna jiske sabse zyada tweet
        real = None
        for h in hs:
            k = mp_ci.get(h.strip().lower())
            rec = mp.get(k) if k else None
            if rec and not rec.get('alias_of') and k == h:
                real = h
                break
        pick = real or next((h for h in hs if h == mp_ci.get(low)), None)
        if not pick:
            pick = max(hs, key=lambda h: acc[h].get('tw', 0))
        keep[low] = pick

    NUM = ('tw', 'lk', 'rt', 'vw')
    acc2, meta2 = {}, {}
    for low, hs in groups.items():
        k = keep[low]
        a = dict(acc[k])
        for h in hs:
            if h == k:
                continue
            for f, v in acc[h].items():
                if isinstance(v, (int, float)):
                    a[f] = a.get(f, 0) + v
        acc2[k] = a
        m = dict(meta.get(k, {}))
        for h in hs:                       # khaali khaane doosri spelling se bhar do
            for f, v in (meta.get(h) or {}).items():
                if not str(m.get(f, '') or '').strip() and str(v or '').strip():
                    m[f] = v
                if f in ('followers', 'followings') and (v or 0) > (m.get(f) or 0):
                    m[f] = v
        meta2[k] = m

    daily2 = {}
    for (h, d), v in daily.items():
        k = keep.get(h.strip().lower(), h)
        if (k, d) in daily2:
            daily2[(k, d)] = [x + y for x, y in zip(daily2[(k, d)], v)]
        else:
            daily2[(k, d)] = list(v)
    rc2 = collections.defaultdict(int)          # rt-split: reposts follow the same spelling merge
    for (h, d), n in list(RC_DAILY.items()):
        rc2[(keep.get(h.strip().lower(), h), d)] += n
    RC_DAILY.clear(); RC_DAILY.update(rc2)
    _rs2 = collections.defaultdict(lambda: {c: 0 for c in SENT_CODES})   # rt-sent: spelling merge
    for h, o in list(RS_ACC.items()):
        k2 = keep.get(h.strip().lower(), h)
        for c in SENT_CODES: _rs2[k2][c] += o.get(c, 0)
    RS_ACC.clear(); RS_ACC.update(_rs2)
    for _X in (RL_DAILY, RV_DAILY):
        _m = collections.defaultdict(int)
        for (h, d), n in list(_X.items()):
            _m[(keep.get(h.strip().lower(), h), d)] += n
        _X.clear(); _X.update(_m)

    print("  case-merge: %d handle do-do spelling me the -- jod diye" % len(dups))
    for low, hs in list(dups.items())[:6]:
        print("     %s  ->  %s" % (' + '.join(hs), keep[low]))
    if len(dups) > 6:
        print("     ... aur %d" % (len(dups) - 6))
    return acc2, meta2, daily2


def build(csv_path):
    print("Reading CSV:", csv_path)
    acc, meta, daily, DATES, htag, htag_party, hourly, htag_daily, htag_party_daily, words, sdaily = read_csv_agg(csv_path)
    acc, meta, daily = case_merge(acc, meta, daily)
    acc, meta, daily = map_gate(acc, meta, daily)
    print("  handles=%d  dates=%d (%s..%s)" % (len(acc), len(DATES), DATES[0], DATES[-1]))
    tot_tw = sum(a['tw'] for a in acc.values())
    print("  total tweets=%d" % tot_tw)

    tpl = load_template()
    exist_level = {o['h']: o['level'] for o in tpl['UNI']['allHandles']}

    def level_of(h):
        """Purana level chipka rehta hai (churn se bachne ke liye).
        Par 'MLA Contestent' naya level hai -- purane roster me kisi ka nahi hoga,
        isliye us par sticky rule nahi lagate, warna card hamesha 0 dikhega."""
        fresh = meta.get(h, {}).get('levelCSV', 'Others')
        old = exist_level.get(h)
        if old is None:
            return fresh
        if fresh == 'MLA Contestent' or old == 'MLA Contestent':
            return fresh
        return old

    # ---------- handles ----------
    handles = []
    for h, a in acc.items():
        m = meta.get(h, {})
        handles.append({"_id": h, "name": m.get('name',''), "party": m.get('party',''),
                        "level": level_of(h), "state": m.get('state', DASH), "pcName": m.get('pcName',''),
                        "followers": m.get('followers',0), "followings": m.get('followings',0),
                        "tweets": a['tw'], "views": a['vw'], "likes": a['lk'], "retweets": a['rt'],
                        **{c: a[c] for c in SENT_CODES}})

    # ---------- phd ----------
    di = {d: i for i, d in enumerate(DATES)}
    ND = len(DATES)
    phd = {}
    for (h, d), e in daily.items():
        o = phd.setdefault(h, {"t":[0]*ND, "v":[0]*ND, "k":[0]*ND, "r":[0]*ND, "c":[0]*ND, "l":[0]*ND, "w":[0]*ND})
        i = di[d]; o['t'][i]=e[0]; o['v'][i]=e[1]; o['k'][i]=e[2]; o['r'][i]=e[3]
        o['c'][i] = RC_DAILY.get((h, d), 0)          # rt-split: reposts that day
        o['l'][i] = RL_DAILY.get((h, d), 0); o['w'][i] = RV_DAILY.get((h, d), 0)
    phd_docs = [{"h": h, **v} for h, v in phd.items()]

    # ---------- mapping ----------
    bl, bp, bs = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for h in acc:
        m = meta.get(h, {})
        bl[level_of(h)].append(h)
        bp[(m.get('party','') or 'Unknown').replace('.', '')].append(h)
        bs[(m.get('state','') or 'Unknown').replace('.', '')].append(h)
    mapping = [
        {"_id":"by_level","desc":"level -> handles","count":len(bl),"map":dict(bl)},
        {"_id":"by_party","desc":"party -> handles","count":len(bp),"map":dict(bp)},
        {"_id":"by_state","desc":"state -> handles","count":len(bs),"map":dict(bs)},
    ]

    # ---------- dashboard_data ----------
    dd = tpl
    dd['UNI']['tot']['tw'] = tot_tw
    dd['UNI']['tot']['vw'] = sum(a['vw'] for a in acc.values())
    dd['UNI']['tot']['lk'] = sum(a['lk'] for a in acc.values())
    dd['UNI']['tot']['rt'] = sum(a['rt'] for a in acc.values())
    dd['UNI']['tot']['rc'] = sum(a.get('rc', 0) for a in acc.values())     # rt-split: reposts
    dd['UNI']['handles'] = len(acc)
    lv = collections.Counter(); sent = sent_blank(); sent_rt = sent_blank()
    party_agg = {}; state_agg = {}
    MET = tuple(['tw','vw','lk','rt'] + SENT_CODES)
    def _blank(): return dict({'tw':0,'vw':0,'lk':0,'rt':0}, **sent_blank())
    for h, a in acc.items():
        m = meta.get(h, {}); p = m.get('party',''); s = m.get('state', DASH)
        lv[level_of(h)] += a['tw']
        for k in sent: sent[k] += a[k]
        if p:
            pd = party_agg.get(p)
            if pd is None: pd = _blank(); pd['handles'] = 0; party_agg[p] = pd
            for k in MET: pd[k] += a[k]
            pd['handles'] += 1
        sd = state_agg.get(s)
        if sd is None: sd = {'tot': _blank(), 'handles': 0, 'party': {}, 'sent': sent_blank()}; state_agg[s] = sd
        for k in MET: sd['tot'][k] += a[k]
        sd['handles'] += 1
        for sk in SENT_CODES: sd['sent'][sk] += a[sk]
        _ra = RS_ACC.get(h)                                             # rt-sent
        if _ra:
            sd.setdefault('sentRT', sent_blank())
            for sk in SENT_CODES: sd['sentRT'][sk] += _ra.get(sk, 0); sent_rt[sk] += _ra.get(sk, 0)
        if p:
            spd = sd['party'].get(p)
            if spd is None: spd = _blank(); spd['handles'] = 0; sd['party'][p] = spd
            for k in MET: spd[k] += a[k]
            spd['handles'] += 1
    dd['UNI']['level'] = dict(lv); dd['UNI']['party'] = party_agg; dd['UNI']['states'] = state_agg; dd['UNI']['sent'] = sent
    dd['UNI']['sentRT'] = sent_rt                                       # rt-sent
    for o in dd['UNI']['allHandles']:
        a = acc.get(o['h'])
        if a: o.update(dict({'tw':a['tw'],'vw':a['vw'],'lk':a['lk'],'rt':a['rt']}, **{c: a[c] for c in SENT_CODES}))
        if a: o['rc'] = int(a.get('rc', 0)); o['rs'] = dict(RS_ACC.get(o['h']) or sent_blank())   # rt-sent
        # followers/followings/naam/party/state bhi refresh -- pehle ye kabhi update nahi hote the
        m0 = meta.get(o['h'])
        if m0:
            if m0.get('followers'):  o['followers']  = int(m0['followers'])
            if m0.get('followings'): o['followings'] = int(m0['followings'])
            if m0.get('name'):   o['name']  = m0['name']
            if m0.get('party'):  o['party'] = m0['party']
            if m0.get('state'):  o['state'] = m0['state']
            if m0.get('pcName'): o['loc']   = m0['pcName']
        # jo ab bhi khaali hai use MAPPING se bharo (mapping hi master hai)
        if not _v(o.get('loc')):
            o['loc'] = from_master(o['h'], 'ac_name', 'pc_name') or o.get('loc', '')
        if not _v(o.get('state')):
            o['state'] = from_master(o['h'], 'state') or o.get('state', '')
        if not _v(o.get('party')):
            o['party'] = from_master(o['h'], 'party') or o.get('party', '')
        if not _v(o.get('name')):
            o['name'] = from_master(o['h'], 'name') or o.get('name', '')
        # LEVEL bhi refresh -- ye chhoot gaya tha, isliye naya level (MLA Contestent)
        # UNI.level me to aa jaata tha par roster me kabhi nahi, aur card
        # "6,107 tweets / 0 handles" dikhata tha.
        o['level'] = level_of(o['h'])
    # NAYE handles jo roster me nahi the -> ADD karo (pehle sirf update hota tha, add nahi -> count atka rehta tha)
    _known = {o['h'] for o in dd['UNI']['allHandles']}
    for h, a in acc.items():
        if h in _known: continue
        m2 = meta.get(h, {})
        dd['UNI']['allHandles'].append({
            'h': h, 'name': m2.get('name', ''), 'party': m2.get('party', ''),
            'level': m2.get('levelCSV', 'Others'), 'state': m2.get('state', DASH),
            'loc': m2.get('pcName', '') or from_master(h, 'ac_name', 'pc_name'),
            'followers': int(m2.get('followers', 0) or 0),
            'followings': int(m2.get('followings', 0) or 0),
            'tw': a['tw'], 'vw': a['vw'], 'lk': a['lk'], 'rt': a['rt'],
            **{c: a[c] for c in SENT_CODES},
            'rc': int(a.get('rc', 0)), 'rs': dict(RS_ACC.get(h) or sent_blank())})   # rt-sent
    # STALE entries hatao: jo handle ab data me nahi hai woh roster me bhi na rahe
    # (warna purane build ke numbers atke reh jaate hain - jaise media houses)
    _before = len(dd['UNI']['allHandles'])
    dd['UNI']['allHandles'] = [o for o in dd['UNI']['allHandles'] if o['h'] in acc]
    if _before != len(dd['UNI']['allHandles']):
        print("  roster clean: %d -> %d handles" % (_before, len(dd['UNI']['allHandles'])))
    # "—" (bina state) ko STATES chart se hatao - par totals me woh rehte hain
    dd['STATE_DATA'] = [r for r in dd['STATE_DATA'] if str(r.get('state', '')).strip() not in ('', DASH)]
    # naye state jodo -- par 'uttar pradesh' / 'Uttar Pradesh' ek hi maano
    _stCanon = {str(r.get('state','')).strip().lower(): str(r.get('state','')).strip() for r in dd['STATE_DATA']}
    for _st in sorted({str(meta.get(h,{}).get('state', DASH)).strip() for h in acc}):
        if not _st or _st in ('', DASH): continue
        if _st.lower() in _stCanon: continue
        _stCanon[_st.lower()] = _st
        dd['STATE_DATA'].append(dict({'state': _st, 'tweets':0, 'views':0, 'likes':0}, **sent_blank()))
        print("  naya state juda: " + _st)
    def _stOf(h): return _stCanon.get(str(meta.get(h,{}).get('state', DASH)).strip().lower(), '')
    for row in dd['STATE_DATA']:
        s = str(row['state']).strip(); hs = [h for h in acc if _stOf(h) == s]
        row.update(tweets=sum(acc[h]['tw'] for h in hs), views=sum(acc[h]['vw'] for h in hs),
                   likes=sum(acc[h]['lk'] for h in hs),
                   **{c: sum(acc[h][c] for h in hs) for c in SENT_CODES})
    # nayi party jodo -- 'inc' / 'INC' ko ek hi maano (mapping me dono pade hain)
    _ptCanon = {str(k).strip().lower(): k for k in dd['PARTY_DATA']}
    for _pt in sorted({str(meta.get(h,{}).get('party','')).strip() for h in acc}):
        if not _pt or _pt in ('', DASH): continue
        if _pt.lower() in _ptCanon: continue
        _ptCanon[_pt.lower()] = _pt
        dd['PARTY_DATA'][_pt] = dict({'tweets':0,'views':0,'likes':0,'rt':0}, **sent_blank())
        print("  nayi party judi: " + _pt)
    def _ptOf(h): return _ptCanon.get(str(meta.get(h,{}).get('party','')).strip().lower(), '')
    for party, row in dd['PARTY_DATA'].items():
        hs = [h for h in acc if _ptOf(h) == party]
        row.update(tweets=sum(acc[h]['tw'] for h in hs), views=sum(acc[h]['vw'] for h in hs),
                   likes=sum(acc[h]['lk'] for h in hs), rt=sum(acc[h]['rt'] for h in hs),
                   **{c: sum(acc[h][c] for h in hs) for c in SENT_CODES})
    dd['AGG']['dates'] = DATES
    S = {}
    for (h, d), e in daily.items():
        i = di[d]; m = meta.get(h, {}); lvl_ = level_of(h); pty = m.get('party','')
        for key in ["%s|%s" % (lvl_, pty), "%s|ALL" % lvl_, "ALL|%s" % pty, "ALL|ALL"]:
            o = S.setdefault(key, {"t":[0]*ND,"v":[0]*ND,"k":[0]*ND,"r":[0]*ND})
            o['t'][i]+=e[0]; o['v'][i]+=e[1]; o['k'][i]+=e[2]; o['r'][i]+=e[3]
    dd['AGG']['S'] = S

    # ---------- CM_DATA (State CM) refresh ----------
    for c in dd.get('CM_DATA', []):
        a = acc.get(c.get('handle'))
        if a:
            c.update(tweets=a['tw'], views=a['vw'], likes=a['lk'], rts=a['rt'],
                     **{k: a[k] for k in SENT_CODES})
        m = meta.get(c.get('handle'), {})
        if m.get('followers'): c['followers'] = m['followers']; c['followings'] = m['followings']

    # ---------- HASHTAGS + HTFULL (sorted by VIEWS) ----------
    htlist = sorted(htag.items(), key=lambda kv: -kv[1]['vw'])
    dd['HASHTAGS'] = [dict({'tag':tag,'count':v['c'],'lk':v['lk'],'vw':v['vw']},
                            **{c: v[c] for c in SENT_CODES}) for tag, v in htlist[:18]]
    def dvec(dm): return [dm.get(dt, 0) for dt in DATES]
    def htentry(tag, v, dailymap):
        return dict({'tag':tag,'c':v['c'],'lk':v['lk'],'vw':v['vw'],'d':dvec(dailymap)},
                    **{c: v[c] for c in SENT_CODES})
    HTFULL = {'all': [htentry(tag, v, htag_daily.get(tag, {})) for tag, v in htlist[:40]]}
    for pk in [k for k in dd.get('HTFULL', {}).keys() if k != 'all']:
        pv = htag_party.get(pk, {})
        top = sorted(pv.items(), key=lambda kv: -kv[1]['vw'])[:25]
        HTFULL[pk] = [htentry(tag, v, htag_party_daily.get((pk, tag), {})) for tag, v in top]
    dd['HTFULL'] = HTFULL

    # ---------- WORDCLOUD (shabd + hashtag) ----------
    # Dashboard ka Word Cloud tab isi se banta hai. Top 150 shabd kaafi hain --
    # isse zyada rakhne par HTML bhaari ho jaata hai aur koi padhta bhi nahi.
    dd['WORDCLOUD'] = {
        'words': [{'w': w, 'c': c} for w, c in words.most_common(150)],
        'tags':  [{'w': tag, 'c': v['c'], 'lk': v['lk'], 'vw': v['vw']}
                  for tag, v in sorted(htag.items(), key=lambda kv: -kv[1]['c'])[:150]],
        'total_words': len(words),
    }
    print("  wordcloud: %d alag shabd (top 150 rakhe), %d hashtag" % (len(words), len(htag)))

    # ---------- D (overview charts) ----------
    D = dd.get('D', {})
    D['dayLabels'] = [d[5:] for d in DATES]
    D['AD'] = DATES
    top_parties = [p for p, _ in sorted(party_agg.items(), key=lambda kv: -((kv[1].get('tw')) or 0)) if p][:8]
    D['parties'] = top_parties
    pdaily = {p: {'t':[0]*ND,'v':[0]*ND,'k':[0]*ND,'r':[0]*ND} for p in top_parties + ['Others']}
    for (h, d), e in daily.items():
        i = di[d]; p = meta.get(h, {}).get('party','')
        key = p if p in pdaily else 'Others'
        o = pdaily[key]; o['t'][i]+=e[0]; o['v'][i]+=e[1]; o['k'][i]+=e[2]; o['r'][i]+=e[3]
    D['partyDaily'] = pdaily
    Dh = []
    for h, a in acc.items():
        m = meta.get(h, {}); ph = phd.get(h)
        Dh.append({'h':h,'n':m.get('name',''),'p':m.get('party',''),'l':level_of(h),'s':m.get('state', DASH),
                   't': ph['t'] if ph else [0]*ND, 'v': ph['v'] if ph else [0]*ND})
    D['handles'] = Dh
    T = sum(sent[c] for c in SENT_CODES) or 1
    # purane 3 naam bhi rehne do (purane chart inhi ko padhte hain), aur
    # saath me poora 8-category ka count + percent bhi de do.
    D['sent'] = {SENT_LABEL[c]: round(sent[c]*100.0/T, 1) for c in SENT_CODES}
    D['sentN'] = {c: sent[c] for c in SENT_CODES}
    D['sentCats'] = [{'k': c, 'label': SENT_LABEL[c]} for c in SENT_CODES]
    D['HOURLY'] = hourly
    D['wd'] = [ datetime.date(int(d[:4]), int(d[5:7]), int(d[8:10])).weekday() for d in DATES ]  # JS getDay: Sun=0
    dd['D'] = D

    # ---------- DAILY_DATA (per date) ----------
    perdate = {d: [0,0,0,0] for d in DATES}   # [tw,lk,vw,rt]
    for (h, d), e in daily.items():
        pdd = perdate[d]; pdd[0]+=e[0]; pdd[1]+=e[2]; pdd[2]+=e[1]; pdd[3]+=e[3]
    dd['DAILY_DATA'] = [{'d':d,'tw':perdate[d][0],'lk':perdate[d][1],'vw':perdate[d][2],'rt':perdate[d][3]} for d in DATES]

    # ---------- SENT_DAILY (Sentiment Trend chart ka ASLI data) ----------
    # shakl: {'cats': [...], 'dates': [...], 'S': {'ALL': {code: [per-date count]},
    #                                              '<State>': {...}}}
    # Pehle ye chart har din ke tweet count ko fixed ratio (.796/.18/.022) se
    # guna karke banta tha -- yaani banaya hua data. Ab seedha ginti se.
    _sd_S = {}
    def _sd_get(k):
        o = _sd_S.get(k)
        if o is None:
            o = _sd_S[k] = {c: [0]*ND for c in SENT_CODES}
        return o
    _known_states = {str(r.get('state','')).strip().lower(): str(r.get('state','')).strip()
                     for r in dd.get('STATE_DATA', [])}
    for (_st, _d3, _cd), _n in sdaily.items():
        _i = di.get(_d3)
        if _i is None or _cd not in SENT_CODES: continue
        _sd_get('ALL')[_cd][_i] += _n
        _canon = _known_states.get(str(_st).strip().lower())
        if _canon:
            _sd_get(_canon)[_cd][_i] += _n
    _sr_S = {}                                                          # rt-sent: retweets ka roz ka sentiment
    for (_st, _d3, _cd), _n in RS_DAILY.items():
        _i = di.get(_d3)
        if _i is None or _cd not in SENT_CODES: continue
        for _key in ('ALL', _known_states.get(str(_st).strip().lower())):
            if not _key: continue
            _o = _sr_S.get(_key)
            if _o is None: _o = _sr_S[_key] = {c: [0]*ND for c in SENT_CODES}
            _o[_cd][_i] += _n
    dd['SENT_DAILY'] = {'cats': [{'k': c, 'label': SENT_LABEL[c]} for c in SENT_CODES],
                        'dates': DATES, 'S': _sd_S, 'SR': _sr_S}
    print("  sentiment-daily: %d scope x %d din" % (len(_sd_S), ND))

    dd_docs = [{"key": k, "value": v} for k, v in dd.items()]
    return handles, phd_docs, mapping, dd_docs, DATES, tot_tw


def write_files(handles, phd_docs, mapping, dd_docs):
    outs = {
        os.path.join(DATA, "dashboard_data.json"): dd_docs,
        os.path.join(DATA, "phd.json"): phd_docs,
        os.path.join(DATA, "handles.json"): handles,
        os.path.join(DATA, "mapping.json"): mapping,
    }
    for p, d in outs.items():
        p = os.path.abspath(p)
        json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        print("  wrote", p)


def push_mongo(handles, phd_docs, mapping, dd_docs):
    """Dashboard ki collections badlo -- mongo_swap (audit A1)

    PEHLE aisa tha:
        db[coll].delete_many({})      <- collection KHAALI
        db[coll].insert_many(docs)    <- bharne me kuch second

    Un do line ke beech jo bhi dashboard kholta tha use "collection khaali
    hai" wala 500 error milta tha. Aur agar us pal Mongo girta, disk bharti
    ya process marta -- to collection HAMESHA ke liye khaali reh jaata aur
    dashboard poora band ho jaata.

    Ab: naya data alag naam (coll__new) me banta hai, ginti milti hai, phir
    rename se swap hota hai (milliseconds). Kuch bhi bigda to purana data
    jyun ka tyun rehta hai -- dashboard purana dikhayega, khaali nahi.
    """
    from pymongo import MongoClient
    from mongo_swap import swap_many
    cli = MongoClient(MONGO_URL); db = cli[DB_NAME]
    try:
        swap_many(db, [("handles", handles), ("phd", phd_docs),
                       ("mapping", mapping), ("dashboard_data", dd_docs)])
    finally:
        cli.close()
    # hot/cold plan, Phase 4.2: same dashboards to Atlas (only if HOT is on; never breaks local)
    try:
        import hot_push
        hot_push.push(DB_NAME, {'dashboard_data': dd_docs, 'phd': phd_docs, 'handles': handles})
    except Exception as _e:
        print("  HOT SYNC FAIL (dashboards): %s" % _e)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit('Usage: python update_dashboard.py "path\\to\\data.csv" [--push]')
    csv_path = sys.argv[1]; push = '--push' in sys.argv
    handles, phd_docs, mapping, dd_docs, DATES, tot = build(csv_path)
    print("Writing files...")
    write_files(handles, phd_docs, mapping, dd_docs)
    if push:
        print("Pushing to MongoDB...")
        push_mongo(handles, phd_docs, mapping, dd_docs)
    print("\nDONE. tweets=%d  handles=%d  dates=%d" % (tot, len(handles), len(DATES)))
    print("Ab dashboard: http://localhost:3000/refresh  phir reload.")
