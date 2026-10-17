# -*- coding: utf-8 -*-
"""
rebuild_mapping.py  --  Mapping/Mapping.xlsx se handle_master.json banata hai.

Mapping.xlsx hi MASTER hai. Purani mapping ka koi data nahi uthaya jaata.
Excel me khaali hai to mapping me bhi khaali ('-') hi rahega.

Chalao:
   python rebuild_mapping.py            # sirf REPORT (kuch nahi badalta)
   python rebuild_mapping.py --apply    # backup lekar mapping likh do

Ye script sirf DO cheezein khud se karta hai, dono zaroori hain:
  1. Naam ke variants seedhe karta hai (inc->INC, Odisa->Odisha, Mla->MLA...)
     -- warna dashboard me ek hi party/state do baar dikhti hai.
  2. Jis handle ke tweets Mongo me DUSRE case me pade hain, uske liye ek
     alias entry banata hai (wahi Excel wala data) -- warna wo tweets
     unmapped ho jaate hain.
Har takraav mapping_conflicts.csv me likh diya jaata hai -- wo dekh lena.
"""
import os, sys, re, csv, json, shutil, collections
from datetime import datetime
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, '..', 'Mapping', 'Mapping.xlsx')
MAPJSON = os.path.join(HERE, 'data', 'handle_master.json')
UP_MAPJSON = os.path.join(HERE, '..', 'UP-DASHBOARD', 'data', 'handle_master.json')
DASHDATA = os.path.join(HERE, 'data', 'dashboard_data.json')
CONFCSV = os.path.join(HERE, 'mapping_conflicts.csv')

BLANK = ('', '-', '—', 'nan', 'None', 'null', '(blank)', 'na', 'n/a')

# designation -> dashboard ka level
LVL = {
    'MLA': 'MLA', 'MLA CONTESTENT': 'MLA Contestent', 'MLA CONTESTANT': 'MLA Contestent',
    'LS_MP': 'LS MP', 'LS_MP CANDIDATE': 'LS MP', 'RS_MP': 'RS MP',
    'MLC': 'MLC', 'CHIEF MINISTER': 'CM', 'DEPUTY CHIEF MINISTER': 'Dy CM',
}

# ---- naam ke variants seedhe karo (ye dashboard todte hain) ----
PARTY_FIX = {'inc': 'INC', 'ind.': 'IND', 'ind': 'IND', 'ham (s)': 'HAM(S)',
             'aitc': 'TMC',                      # AITC aur TMC ek hi party hai
             'apna dal (s)': 'AD(S)', 'apna dal(s)': 'AD(S)'}
STATE_FIX = {'jammu & kashmir': 'Jammu and Kashmir', 'odisa': 'Odisha',
             'delhi (nct)': 'Delhi'}
CATEGORY_FIX = {'mla': 'MLA', 'media houses': 'Media House', 'media house': 'Media House',
                'journalist': 'Journalist', 'page': 'Page', 'top leaders': 'Top Leaders',
                'mla contestent': 'MLA Contestent', 'mlc': 'MLC',
                'mla contestant': 'MLA Contestent',
                'ls_mp': 'LS_MP', 'rs_mp': 'RS_MP',
                # nayi Excel me bina underscore wali spelling bhi aa gayi
                'lsmp': 'LS_MP', 'rsmp': 'RS_MP', 'ls mp': 'LS_MP', 'rs mp': 'RS_MP'}
# category chunte waqt tarjeeh -- 'Top Leaders' sabse aam hai, isliye sabse aakhir
CAT_RANK = ['Chief Minister', 'MLA', 'MLC', 'LS_MP', 'RS_MP', 'MLA Contestent',
            'Media House', 'Journalist', 'Page', 'Top Leaders']

# ABHI ka pad -- ye rows purani (contest wali) rows se zyada bharosemand hain
CURRENT = {'MLA', 'MLC', 'LS_MP', 'RS_MP', 'CHIEF MINISTER', 'DEPUTY CHIEF MINISTER'}



# ===================== newmap (13-Oct): Admin Designation ki safai =========
# Excel me ek hi pad kai tarah se likha hai. Niche ki do cheezein hoti hain:
#   adm_buckets('Cabiniet Minister')        -> ['Cabinet Minister']
#   adm_buckets('Deputy Chief Minister & MOS') -> ['Deputy Chief Minister',
#                                                 'Minister of State']
# Asli likhavat kahin mitati nahi -- wo 'admin_designation_raw' me jaati hai.
# Excel bilkul nahi chhui jaati.
import unicodedata as _ud

def _plain(v):
    """bold/italic unicode akshar ko saada banao, nayi line aur dohre space hatao"""
    t = _ud.normalize('NFKC', str(v or ''))
    t = t.replace('\u00a0', ' ')
    t = ' '.join(t.split())
    return t.strip()

# EK HI CHEEZ KE KAI ROOP -> ek saaf naam. Jo yahan NAHI hai, wo jaisa
# Excel me likha hai waisa hi rehta hai -- 'Defence Minister' ko generic
# 'Minister' bana dena jaankari ghataana hai, isliye nahi karte.
# KRAM ZAROORI hai: 'deputy chief minister' pehle, warna uske andar ka
# 'chief minister' bhi pakda jaata hai aur ek hi aadmi CM + Dy CM dono
# gina jaata (53 CM dikhne lage the, jabki hain 31).
ADM_RULES = [
    ('deputy chief minister',   'Deputy Chief Minister'),
    ('dy chief minister',       'Deputy Chief Minister'),
    ('dy. chief minister',      'Deputy Chief Minister'),
    ('chief minister',          'Chief Minister'),
    ('prime minister',          'Prime Minister'),
    ('union minister of state', 'Minister of State'),
    ('minister of state',       'Minister of State'),
    ('union minister',          'Union Minister'),
    ('uninon minister',         'Union Minister'),     # Excel ki spelling
    ('cabiniet minister',       'Cabinet Minister'),   # Excel ki spelling
    ('cabinet minister',        'Cabinet Minister'),
]
# poora khaana hi jo ho (upar wale niyam se nahi pakda jaata)
ADM_EXACT = {'cabinet': 'Cabinet Minister',
             'mos': 'Minister of State', 'mos(ic)': 'Minister of State',
             'mos (ic)': 'Minister of State'}
ADM_COMMITTEE = ('committee', 'chairman', 'chairperson')


def adm_buckets(v):
    """Excel ki likhavat -> dikhane layak naam ki list.
    Jo jaani-pehchani galti/paryay hai wahi badalta hai; baaki jyon ka tyon."""
    t = _plain(v)
    if not t or t.lower() in ('-', 'na', 'n/a', 'none', 'nan'):
        return []
    low = t.lower()
    if low in ADM_EXACT:
        return [ADM_EXACT[low]]
    out, rest = [], low
    for key, name in ADM_RULES:
        if key in rest:
            rest = rest.replace(key, ' ')
            if name not in out:
                out.append(name)
    import re as _re
    if _re.search(r'\bmos\b', rest) and 'Minister of State' not in out:
        out.append('Minister of State')
    # kuch bhi nahi pakda -> Excel ki apni likhavat hi rakho
    if not out:
        return [t]
    return out


def adm_group(v):
    """sirf GINTI/filter ke liye motі shreni (chip me ye nahi jaata)"""
    b = adm_buckets(v)
    if not b:
        return ''
    n = b[0]
    if n in ADM_RANK:
        return n
    low = n.lower()
    if 'speaker' in low:
        return 'Speaker'
    if any(k in low for k in ADM_COMMITTEE):
        return 'Committee Role'
    if 'minister' in low:
        return 'Other Minister'
    return 'Other Admin'


# shreni ka kram -- bada pad pehle (chip aur ginti isi kram me)
ADM_RANK = ['Prime Minister', 'Chief Minister', 'Deputy Chief Minister',
            'Union Minister', 'Cabinet Minister', 'Minister of State']


def adm_sort(names):
    return sorted(set(names), key=lambda n: ADM_RANK.index(n) if n in ADM_RANK else 99)
# ==========================================================================

def row_rank(r):
    """Ek handle ki kai row me se kaunsi zyada sahi hai.
    Excel me aksar aadmi ki ABHI ki seat aur uske PURANE chunav dono padte hain
    (AnilKumarMZN: abhi MLA Purqazi/RLD + 2022 me contest Bareilly/BSP).
    Party-state-seat abhi wali row se lena chahiye, purani se nahi."""
    d = clean(r['desig']).upper()
    has_seat = bool(clean(r['acpc']))
    if d in CURRENT:
        return 0 if has_seat else 1
    if 'CONTEST' in d:
        return 3
    return 2 if d else 4


def clean(v):
    s = str(v if v is not None else '').strip()
    return '' if s in BLANK else s


def dash(v):
    return clean(v) or '-'


def handle_of(u):
    u = str(u or '').strip()
    if not u:
        return ''
    m = re.search(r'(?:twitter\.com|x\.com)/@?([A-Za-z0-9_]{1,20})', u, re.I)
    if m:
        return m.group(1)
    if re.fullmatch(r'@?[A-Za-z0-9_]{1,20}', u):
        return u.lstrip('@')
    return ''                      # instagram / facebook / khaali


def fix(v, table):
    s = clean(v)
    return table.get(s.lower(), s) if s else ''


def nicer(vals):
    """ek hi naam ke case-variant me se behtar chuno: 'Morena' > 'MORENA'."""
    vals = sorted(set(vals))
    if len(vals) == 1:
        return vals[0]
    tc = [v for v in vals if not v.isupper()]
    return tc[0] if tc else vals[0]


def pick(vals, conflicts, handle, col):
    """kai value ho to majority; case-variant ho to sundar wala."""
    vals = [v for v in vals if v]
    if not vals:
        return ''
    uniq = set(vals)
    if len(uniq) == 1:
        return vals[0]
    # sirf case ka farq?
    if len({v.lower() for v in uniq}) == 1:
        return nicer(uniq)
    c = collections.Counter(vals)
    best = c.most_common(1)[0][0]
    conflicts.append((handle, col, ' | '.join(sorted(uniq)), best))
    return best


# newmap (13-Oct): nayi Mapping ki sheet ka naam 'Working Data' hai.
# Dono naam chalte hain -- jo mile wahi padh li jaati hai.
SHEETS_OK = ['Sheet1', 'Working Data']   # SIRF ye sheet padhni hain
SHEET = SHEETS_OK[0]



def _uniq(vals):
    """Khaali hataao aur dohraav mitao, kram wahi rakho."""
    out, seen = [], set()
    for v in vals:
        v = str(v or '').strip()
        if not v or v == '-':
            continue
        k = v.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(v)
    return out


def _need_openpyxl():
    """Excel padhne ke liye pandas ko 'openpyxl' chahiye. Wo na ho to pandas
    ek lambi-chaudi ImportError phenkta hai jisme se asli baat dhoondhni
    padti hai. Isliye pehle hi saaf-saaf bata dete hain KI karna kya hai."""
    try:
        import openpyxl            # noqa: F401
        return
    except Exception:
        pass
    py = sys.executable or 'python'
    print("")
    print("  " + "=" * 64)
    print("  EXCEL PADHNE WALA PURZA (openpyxl) IS PYTHON ME NAHI HAI")
    print("  " + "=" * 64)
    print("  Python: %s" % py)
    print("")
    print("  Ek hi command chalani hai (Command Prompt me, ya seedha")
    print("  DASHBOARD\\FIX_EXCEL_READER.bat par double-click karo):")
    print("")
    print('     "%s" -m pip install openpyxl' % py)
    print("")
    print("  Tab tak dashboard PURANI mapping par chalta rahega -- kuch")
    print("  mita nahi hai, koi handle gayab nahi hua.")
    print("  " + "=" * 64)
    print("")
    sys.exit(2)


def load_rows():
    _need_openpyxl()
    x = pd.ExcelFile(XLSX)
    # PURANE (9 column)  aur  NAYE (10 column) -- dono Excel chalti hain.
    #   purana: AC Name + PC Name alag, 'Designation', 'Party'
    #   naya  : ek 'AC/PC NAME', 'Party Designation' + 'Admin Designation',
    #           'Political Party', aur 'Gender'
    OLD_NEED = ['State', 'AC/PC No', 'AC Name', 'PC Name', 'Candidate Name',
                'Designation', 'Category', 'Party', 'Twitter Account']
    # Nayi Excel ke column. Har khaane ke kai naam chal jaate hain --
    # 'Party' ho ya 'Political Party', 'AC/PC NAME' ho ya 'AC/PC Name' --
    # taaki header thoda idhar-udhar ho to bhi mapping ruke nahi.
    NEW_ALT = [
        ('State',             ['State', 'State Name']),
        # newmap (13-Oct): nayi Excel me 'AC No/PC No' aur 'AC Name/PC Name'
        ('AC/PC No',          ['AC/PC No', 'AC/PC NO', 'AC PC No',
                              'AC No/PC No', 'AC No / PC No']),
        ('AC/PC NAME',        ['AC/PC NAME', 'AC/PC Name', 'AC PC Name', 'AC/PC_NAME',
                              'AC Name/PC Name', 'AC Name / PC Name']),
        ('Candidate Name',    ['Candidate Name', 'Name']),
        ('Gender',            ['Gender', 'Sex']),
        ('Political Party',   ['Political Party', 'Party']),
        ('Category',          ['Category', 'CATEGORY']),
        ('Party Designation', ['Party Designation', 'Designation']),
        ('Admin Designation', ['Admin Designation', 'Administrative Designation']),
        ('Twitter Account',   ['Twitter Account', 'Twitter', 'Handle']),
    ]
    _ok = [n for n in SHEETS_OK if n in x.sheet_names]
    if _ok:
        sheets = _ok[:1]
    else:
        sheets = x.sheet_names[:1]
        print("  [!] %s me se koi sheet nahi mili -- pehli sheet '%s' li ja rahi hai"
              % (' / '.join(SHEETS_OK), sheets[0]))
    ignored = [s for s in x.sheet_names if s not in sheets]
    if ignored:
        print("  (chhodi gayi sheet: %s)" % ', '.join(ignored))
    frames = []
    for sn in sheets:
        d = pd.read_excel(x, sheet_name=sn, dtype=str, keep_default_na=False)
        d = d.rename(columns={'State Name': 'State', 'CATEGORY': 'Category'})
        d = d.drop(columns=[c for c in d.columns if str(c).startswith('Unnamed')])
        # har khaane ke liye jo naam SACH ME sheet me hai, wo dhoondho
        have = {str(c).strip().lower(): c for c in d.columns}
        pickcol, miss_new = {}, []
        for canon, alts in NEW_ALT:
            got = next((have[a.lower()] for a in alts if a.lower() in have), None)
            if got is None:
                miss_new.append(canon)
            else:
                pickcol[canon] = got
        miss_old = [c for c in OLD_NEED if c not in d.columns]
        if not miss_new:
            # ---- NAYI 10-column Excel ----
            d = d[[pickcol[c] for c, _ in NEW_ALT]].copy()
            d.columns = ['state', 'acpc', 'acpcname', 'name', 'gender',
                         'party', 'category', 'pdesig', 'adesig', 'url']
            # Ek hi 'AC/PC NAME' ko wapas AC Name / PC Name me baant do.
            # NIYAM (seedha 'AC/PC No' se):
            #     AC_1  -> wo naam AC Name me
            #     PC_1  -> wo naam PC Name me
            #     baaki ('-') -> dono khaali
            # Aapke data me: AC 3,294 / PC 467 / '-' 915.
            # '-' wali 291 row me "Nominated" likha hai -- wo na AC hai na PC,
            # isliye use AC Name me daalna galat hota. Raw value 'ac_pc_name'
            # me bachi rehti hai, kuch khoya nahi jaata.
            def _kind(v):
                u = str(v or '').strip().upper()
                return 'PC' if u.startswith('PC') else ('AC' if u.startswith('AC') else '')
            _k = [_kind(a) for a in d['acpc']]
            d['acname'] = [(n if k == 'AC' else '') for k, n in zip(_k, d['acpcname'])]
            d['pcname'] = [(n if k == 'PC' else '') for k, n in zip(_k, d['acpcname'])]
            # Designation: Admin Designation pehle, warna Party Designation.
            # DHYAN: Excel me khaali ki jagah '-' / 'NA' likha hota hai, isliye
            # seedhi truthiness se kaam nahi chalta -- clean() se dekhte hain.
            # (Isi ke bina 5,633 row me desig '-' ban kar designation gayab ho
            # gaya tha.) Jis din Admin Designation sach me bharoge, wo apne aap
            # aage aa jaayega.
            # newmap (13-Oct): Admin Designation pehle -- par ab SAAF shreni ke
            # roop me. 'Chief MInister' / 'Cabiniet Minister' jaisi likhavat
            # pehle LVL se match hi nahi hoti thi aur aadmi 'Others' me gir
            # jaata tha. Asli likhavat 'adesig' me jyon ki tyon padi rehti hai.
            d['adesig_norm'] = [' | '.join(adm_buckets(a)) for a in d['adesig']]
            d['desig'] = [(an or clean(pp))
                          for an, pp in zip(d['adesig_norm'], d['pdesig'])]
            d = d[['state', 'acpc', 'acname', 'pcname', 'name', 'desig',
                   'category', 'party', 'url', 'gender', 'pdesig', 'adesig',
                   'adesig_norm', 'acpcname']]
            _ren = ['%s -> %s' % (pickcol[c], c) for c, _ in NEW_ALT if pickcol[c] != c]
            print("  (nayi 10-column Mapping padhi: '%s')" % sn)
            if _ren:
                print("     column ke naam jod diye: %s" % ', '.join(_ren))
        elif not miss_old:
            # ---- PURANI 9-column Excel ----
            d = d[OLD_NEED].copy()
            d.columns = ['state', 'acpc', 'acname', 'pcname', 'name',
                         'desig', 'category', 'party', 'url']
            d['gender'] = ''
            d['pdesig'] = d['desig']
            d['adesig'] = ''
            d['adesig_norm'] = ''
            # purani Excel me ek hi khaana nahi tha -- jo bhara hai wahi raw
            d['acpcname'] = [(a or b) for a, b in zip(d['acname'], d['pcname'])]
            print("  (purani 9-column Mapping padhi: '%s')" % sn)
        else:
            print("  [!] '%s' me ye column nahi: %s -- sheet chhodi" % (sn, miss_new))
            continue
        d['_sheet'] = sn
        frames.append(d)
    if not frames:
        sys.exit("Kisi sheet me zaroori column nahi mile.")
    return pd.concat(frames, ignore_index=True)


def live_handles():
    """Mongo/roster me handle kis case me pade hain -- alias ke liye."""
    try:
        dd = {r['key']: r['value'] for r in json.load(open(DASHDATA, encoding='utf-8'))}
        return {o['h'] for o in dd['UNI']['allHandles']}
    except Exception as e:
        print("  (roster nahi padha ja saka, alias skip: %s)" % e)
        return set()


def build():
    df = load_rows()
    df['h'] = df['url'].map(handle_of)
    skipped = df[df['h'] == '']
    df = df[df['h'] != ''].copy()

    by = collections.OrderedDict()
    for rec in df.to_dict('records'):
        by.setdefault(rec['h'], []).append(rec)

    conflicts = []
    new = {}
    for h, rows in by.items():
        # designation SAARI rows se (dual role bhi chahiye),
        # par baaki detail sirf SABSE BHAROSEMAND rows se
        best = min(row_rank(r) for r in rows)
        top = [r for r in rows if row_rank(r) == best]

        desigs, seen = [], set()
        for r in rows:
            # newmap (13-Oct): ek hi khaane me do pad ho sakte hain
            # ('Deputy Chief Minister | Minister of State') -- dono alag
            # chip bante hain, isliye yahin tod dete hain.
            for _d in [x.strip() for x in str(r['desig'] or '').split('|')]:
                if not clean(_d):
                    continue
                if _d.lower() not in seen:
                    seen.add(_d.lower()); desigs.append(_d)
            d = clean(r['desig'])
            if ' | ' in str(r['desig'] or ''):
                continue
            # NAYI Excel: jo log chunav lade (aur jeete nahi), unka
            # Party Designation 'MLA' hi likha hai -- "MLA Contestent" sirf
            # CATEGORY me hai. Purani Excel me wo Designation me hota tha.
            # Isi wajah se "MLA Contestants" ka card 0 dikhane laga tha.
            # Yahan Category ko maan kar level theek kar dete hain.
            c = fix(r['category'], CATEGORY_FIX)
            if c == 'MLA Contestent' and (not d or d.upper() == 'MLA'):
                d = 'MLA Contestent'
            if d and d.lower() not in seen:
                seen.add(d.lower()); desigs.append(d)

        # ---- Category bhi level deti hai ----
        # Nayi Excel me MP ka 'Party Designation' '-' hota hai aur ministry ka
        # naam 'Admin Designation' me (Prime Minister / Cabinet / MOS / Top
        # Leaders / NA). Level sirf designation se banta tha, isliye 79 MP
        # 'Others' me gir rahe the -- Narendra Modi aur Rahul Gandhi samet.
        # Category (LS_MP / RS_MP / MLC / MLA / MLA Contestent) se level wapas
        # le aate hain. Jo pad pehle se hai wo chhinta nahi -- ye sirf JUDTA hai,
        # isliye dual role (CM + MLA) waise hi bana rehta hai.
        for r in rows:
            c = fix(r['category'], CATEGORY_FIX)
            if c and LVL.get(str(c).upper()) and c.lower() not in seen:
                seen.add(c.lower()); desigs.append(c)

        levels, ls = [], set()
        for d in desigs:
            L = LVL.get(d.upper(), 'Others')
            if L not in ls:
                ls.add(L); levels.append(L)
        if not levels:
            levels = ['Others']
        if len(levels) > 1 and 'Others' in levels:
            levels = [L for L in levels if L != 'Others']

        # seat ke liye ek hi row chuno: jisme sabse zyada seat-info bhari ho
        def seat_score(r):
            return -sum(1 for k in ('acpc', 'acname', 'pcname') if clean(r[k]))
        srow = sorted(top, key=seat_score)[0]
        seat = {k: clean(srow[k]) for k in ('acpc', 'acname', 'pcname')}
        seats = {(clean(r['acpc']), clean(r['acname']), clean(r['pcname'])) for r in top}
        seats = {t for t in seats if any(t)}
        if len(seats) > 1:
            shown = ' || '.join('/'.join(p for p in t if p) for t in sorted(seats))
            chose = '/'.join(p for p in (seat['acpc'], seat['acname'], seat['pcname']) if p)
            conflicts.append((h, 'seat', shown, chose))

        cats = [fix(r['category'], CATEGORY_FIX) for r in top]
        cats = [c for c in cats if c]
        if len(set(cats)) > 1:
            conflicts.append((h, 'category', ' | '.join(sorted(set(cats))), ''))
            cat = sorted(set(cats), key=lambda c: CAT_RANK.index(c) if c in CAT_RANK else 99)[0]
            conflicts[-1] = (h, 'category', ' | '.join(sorted(set(cats))), cat)
        else:
            cat = cats[0] if cats else ''

        new[h] = {
            'handle': h,
            'name': pick([clean(r['name']) for r in top], conflicts, h, 'name'),
            'state': dash(pick([fix(r['state'], STATE_FIX) for r in top], conflicts, h, 'state')),
            'locations': '-',
            # seat ke teeno column EK HI row se -- warna AC/PC No kisi aur seat ka
            # aur AC Name kisi aur ka aa jaata hai (CPSGangwarBJP: PC_25 + Baheri)
            'ac_pc_no': dash(seat['acpc']),
            'ac_name': dash(seat['acname']),
            'pc_name': dash(seat['pcname']),
            'designation_raw': ' | '.join(desigs) if desigs else '-',
            'designations': desigs,
            'levels': levels,
            'category': dash(cat),
            # SAARE label, sirf ek nahi. Excel me ek hi aadmi ki kai row hoti hai
            # (Yogi: 'MLA' + 'Top Leaders'). 'category' upar wale CAT_RANK se ek hi
            # chunta hai -- wo Level cards (CM/LS MP/MLA) ke liye sahi hai.
            # Par export me "Top Leaders" poochne par wo aadmi bhi aana chahiye.
            # Isliye yahan uske SAARE label rakhte hain.
            'categories': sorted(set(cats)) if cats else ([dash(cat)] if dash(cat) != '-' else []),
            'party': dash(pick([fix(r['party'], PARTY_FIX) for r in top], conflicts, h, 'party')),
            # ---- nayi Mapping ke teen column ----
            # Gender aur Admin Designation abhi Excel me khaali hain. Dhaancha
            # yahan bana diya hai -- jis din aap Excel me bhar doge, mapping me
            # apne aap aa jaayenge, code dobara nahi badalna padega.
            # raw 'AC/PC NAME' -- jo AC/PC No '-' hai (jaise "Nominated") uska
            # naam yahan bacha rehta hai, chaahe AC/PC Name khaali ho
            'ac_pc_name': dash(clean(srow.get('acpcname', ''))),
            'gender': dash(pick([clean(r.get('gender', '')) for r in top], conflicts, h, 'gender')),
            'party_designation': dash(' | '.join(_uniq(
                [clean(r.get('pdesig', '')) for r in top]))),
            # newmap (13-Oct): SAAF shreni yahan, aur Excel ki ASLI likhavat
            # 'admin_designation_raw' me -- dashboard chip par hover karne se
            # wahi dikhti hai. Dono rakhne se ginti saaf rehti hai aur aapka
            # likha hua bhi nahi khota.
            'admin_designation': dash(' | '.join(adm_sort(sum(
                [adm_buckets(r.get('adesig', '')) for r in top], [])))),
            'admin_designation_raw': dash(' | '.join(_uniq(
                [_plain(r.get('adesig', '')) for r in top]))),
            # ginti / filter ke liye moti shreni (chip me ye nahi jaata)
            'admin_group': dash(' | '.join(_uniq(
                [adm_group(r.get('adesig', '')) for r in top]))),
            'status': 'Active',
            'tweet_url': '',
            'profile_url': 'https://x.com/' + h,
        }

    # ---- alias: tweets dusre case me pade hain to us case ki entry bhi banao ----
    live = live_handles()
    new_ci = {h.lower(): h for h in new}
    alias = []
    for lh in live:
        if lh in new:
            continue
        k = new_ci.get(lh.lower())
        if k:
            rec = dict(new[k])
            rec['handle'] = lh
            rec['profile_url'] = 'https://x.com/' + lh
            # NISHAAN: ye entry Excel se nahi, Mongo me pade doosre case se
            # bani hai. Jahan ek hi handle do spelling me ho, wahan dashboard
            # ko pata hona chahiye ki ASLI spelling kaun si hai (jo
            # Mapping.xlsx me likhi hai) -- @AmitShah, @amitshah nahi.
            rec['alias_of'] = k
            new[lh] = rec
            alias.append((lh, k))

    return new, skipped, conflicts, alias, live


def main():
    apply = '--apply' in sys.argv
    if not os.path.exists(XLSX):
        sys.exit("Mapping.xlsx nahi mila: %s" % XLSX)

    old = json.load(open(MAPJSON, encoding='utf-8')) if os.path.exists(MAPJSON) else {}
    new, skipped, conflicts, alias, live = build()

    print("\n=== MAPPING.XLSX SE BANI MAPPING ===")
    print("  handles      : %s" % f"{len(new):,}")
    print("  (purani thi  : %s)" % f"{len(old):,}")
    if len(skipped):
        print("  URL se handle nahi nikla (insta/fb/khaali): %d row" % len(skipped))
        for u in list(skipped['url'])[:5]:
            print("     %s" % (str(u)[:60] or '(khaali)'))
    if alias:
        print("\n  Mongo me dusre case me tweets -> alias entry bani: %d" % len(alias))
        for a, k in alias[:6]:
            print("     %-22s = %s" % (a, k))
        if len(alias) > 6:
            print("     ... aur %d" % (len(alias) - 6))

    # roster me hai par mapping me nahi
    orphan = sorted(h for h in live if h not in new)
    if orphan:
        print("\n  Mongo me tweets hain par Mapping.xlsx me NAHI: %d handles" % len(orphan))
        for h in orphan[:12]:
            print("     %-24s %s" % (h, str(old.get(h, {}).get('name', ''))[:26]))
        if len(orphan) > 12:
            print("     ... aur %d" % (len(orphan) - 12))

    lv = collections.Counter()
    for v in new.values():
        for L in v['levels']:
            lv[L] += 1
    print("\n  LEVEL:")
    for k, n in lv.most_common():
        print("     %-16s %s" % (k, f"{n:,}"))
    print("\n  CATEGORY:")
    for k, n in collections.Counter(v['category'] for v in new.values()).most_common():
        print("     %-16s %s" % (k, f"{n:,}"))

    if conflicts:
        print("\n  Ek hi handle par alag-alag value (takraav): %d" % len(conflicts))
        cc = collections.Counter(c[1] for c in conflicts)
        for k, n in cc.most_common():
            print("     %-16s %d" % (k, n))
        with open(CONFCSV, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f, quoting=csv.QUOTE_ALL)
            w.writerow(['Handle', 'Column', 'Excel me jo-jo tha', 'Jo chuna gaya'])
            for c in sorted(conflicts):
                w.writerow(c)
        print("     -> poori list: %s" % os.path.basename(CONFCSV))

    if not apply:
        print("\n(REPORT MODE -- kuch nahi badla. Likhne ke liye: python rebuild_mapping.py --apply)")
        return

    track_removed(old, new)

    for tgt in (MAPJSON, UP_MAPJSON):
        if not os.path.isdir(os.path.dirname(tgt)):
            continue
        if os.path.exists(tgt):
            bak = tgt + '.bak_' + datetime.now().strftime('%Y%m%d_%H%M%S')
            shutil.copy2(tgt, bak)
            print("  backup: %s" % os.path.basename(bak))
        json.dump(new, open(tgt, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print("  likha : %s  (%s handles)" % (tgt, f"{len(new):,}"))

    print("\nAb chalao:  python push_mapping_to_mongo.py --check")



REMOVEDJSON = os.path.join(HERE, 'data', 'mapping_removed.json')
UP_REMOVEDJSON = os.path.join(HERE, '..', 'UP-DASHBOARD', 'data', 'mapping_removed.json')


def track_removed(old, new):
    """Jo handle PEHLE mapping me the aur AB nahi hain, unhe
    data/mapping_removed.json me likh deta hai.

    Dashboard ka map-gate SIRF isi list ko dekh kar handle hatata hai.
    'mapping me nahi hai' kaafi nahi hota -- bahut se handle (Narendra Modi
    jaise) kabhi Mapping.xlsx me aaye hi nahi, unhe hatana galat hoga.

    Jo handle wapas mapping me aa jaaye, wo list se apne aap nikal jaata hai.
    """
    newlow = {str(k).strip().lower() for k in new}
    oldlow = {str(k).strip().lower() for k in old}
    gone = sorted(oldlow - newlow)

    cur, head = [], {}
    try:
        with open(REMOVEDJSON, encoding='utf-8') as f:
            head = json.load(f)
            cur = [str(h).strip().lower() for h in (head.get('handles') or [])]
    except Exception:
        pass

    back = sorted(h for h in cur if h in newlow)      # wapas mapping me aa gaye
    keep = [h for h in cur if h not in newlow]

    # ---- SURAKSHA ----
    # Ek-do handle hatana aam baat hai. Par EK SAATH bahut saare gayab ho jaana
    # aksar hatane ki niyat nahi hoti -- Excel ka dhaancha badal gaya, galat
    # sheet lag gayi, ya file aadhi bhari hui hai. (08-Oct ko aisa hi hua:
    # 9 se 10 column hote hi 190 handle "hat gaye" dikhe, Narendra Modi samet.)
    # Aise me list me kuch nahi daalte -- sirf saaf-saaf bata dete hain.
    LIMIT = 0        # 08-Oct: 0 = kabhi khud se nahi jodte (neeche wajah)
    if len(gone) > LIMIT:
        print("  [!] %d handle nayi mapping me nahi mile." % len(gone))
        print("      Mapping me na hona = hatana nahi hota. Ehtiyaat ke taur par")
        print("      inhe 'hataye gaye' nahi maana ja raha -- dashboard par sab")
        print("      pehle jaisa dikhta rahega.")
        print("      Sach me hatana ho to data/mapping_removed.json me khud jod do.")
        print("      Poori list: data/mapping_removed_candidates.json")
        try:
            _cand = {
                '_kya_hai': 'Ye handle nayi Mapping.xlsx me nahi mile. SIRF dekhne ke liye -- '
                            'dashboard se kuch nahi hata. Sach me hatana ho to inhe '
                            'mapping_removed.json ke "handles" me khud daalo.',
                'at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'kitne': len(gone),
                'handles': gone,
            }
            for _t in (os.path.join(os.path.dirname(REMOVEDJSON), 'mapping_removed_candidates.json'),
                       os.path.join(os.path.dirname(UP_REMOVEDJSON), 'mapping_removed_candidates.json')):
                if os.path.isdir(os.path.dirname(_t)):
                    json.dump(_cand, open(_t, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        except Exception as _e:
            print("      (candidates file likhne me dikkat: %s)" % _e)
        for h in gone[:10]:
            print("        - @%s" % h)
        if len(gone) > 10:
            print("        ... aur %d" % (len(gone) - 10))
        gone = []

    added = [h for h in gone if h not in keep]
    out = sorted(set(keep) | set(gone))

    head['handles'] = out
    head['at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    head.setdefault('_kya_hai', 'Wo handle jo Mapping.xlsx se JAAN-BOOJHKAR hataye gaye.')
    for tgt in (REMOVEDJSON, UP_REMOVEDJSON):
        if not os.path.isdir(os.path.dirname(tgt)):
            continue
        json.dump(head, open(tgt, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    if added:
        print("  mapping se hataye gaye: %d handle -> dashboard se bhi hat jaayenge" % len(added))
        print("     " + ', '.join(added[:8]) + (', ...' if len(added) > 8 else ''))
    if back:
        print("  wapas mapping me aa gaye: %d handle -> dobara dikhne lagenge" % len(back))
        print("     " + ', '.join(back[:8]) + (', ...' if len(back) > 8 else ''))
    if not added and not back:
        print("  (hataye gaye handle ki list me koi badlaav nahi: %d)" % len(out))


if __name__ == '__main__':
    main()
