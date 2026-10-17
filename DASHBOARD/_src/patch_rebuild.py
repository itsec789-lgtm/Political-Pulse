# -*- coding: utf-8 -*-
"""rebuild_mapping.py ko NAYI Mapping.xlsx ke layak banata hai.

   TEEN BAAT:
   1. Header ke naye naam  : 'AC No/PC No', 'AC Name/PC Name'
      Sheet ka naam        : 'Working Data'  (pehle sirf 'Sheet1')
   2. Admin Designation ab sach me bhari hui hai (214 row) -- par usme ek hi
      cheez ke kai roop hain: 'Cabiniet Minister'(41) / 'Cabinet Minister'(35)
      / sirf 'Cabinet'(21), 'Chief MInister', 'Uninon Minister', MOS /
      MOS(IC) / 'Minister of State', kuch bold-unicode akshar me, kuch do
      line me. Inhe saaf shreni (bucket) me badalte hain --
          Prime Minister | Chief Minister | Deputy Chief Minister |
          Union Minister | Cabinet Minister | Minister of State |
          Speaker | Deputy Speaker | Committee Role | Other Admin
      EXCEL CHHUI NAHI JAATI. Asli likhavat 'admin_designation_raw' me
      jyon ki tyon rehti hai (dashboard par hover me dikhegi).
   3. Isi safai se CM / Dy CM apne aap theek ban jaate hain: LVL me
      'CHIEF MINISTER' aur 'DEPUTY CHIEF MINISTER' pehle se hain, bas unhe
      saaf likhavat milni chahiye thi. 'Chief MInister' (chhota i, bada I)
      pehle 'Others' me gir raha tha.
"""
import io, os, sys, shutil

P = sys.argv[1] if len(sys.argv) > 1 else 'DASHBOARD/rebuild_mapping.py'
s = io.open(P, encoding='utf-8').read()
assert 'newmap (13-Oct)' not in s, 'ALREADY'
if not os.path.exists(P + '.bak_newmap'):
    shutil.copyfile(P, P + '.bak_newmap')

# ---------------- 1. sheet ka naam ----------------
A = "SHEET = 'Sheet1'          # SIRF yahi sheet padhni hai (baaki tabs galti se bani thin)"
assert s.count(A) == 1
s = s.replace(A, "# newmap (13-Oct): nayi Mapping ki sheet ka naam 'Working Data' hai.\n"
                 "# Dono naam chalte hain -- jo mile wahi padh li jaati hai.\n"
                 "SHEETS_OK = ['Sheet1', 'Working Data']   # SIRF ye sheet padhni hain\n"
                 "SHEET = SHEETS_OK[0]")

A = """    if SHEET in x.sheet_names:
        sheets = [SHEET]
    else:
        sheets = x.sheet_names[:1]
        print("  [!] '%s' nahi mili -- pehli sheet '%s' li ja rahi hai" % (SHEET, sheets[0]))"""
assert s.count(A) == 1
s = s.replace(A, """    _ok = [n for n in SHEETS_OK if n in x.sheet_names]
    if _ok:
        sheets = _ok[:1]
    else:
        sheets = x.sheet_names[:1]
        print("  [!] %s me se koi sheet nahi mili -- pehli sheet '%s' li ja rahi hai"
              % (' / '.join(SHEETS_OK), sheets[0]))""")

# ---------------- 2. header ke naye naam ----------------
A = "        ('AC/PC No',          ['AC/PC No', 'AC/PC NO', 'AC PC No']),"
assert s.count(A) == 1
s = s.replace(A, "        # newmap (13-Oct): nayi Excel me 'AC No/PC No' aur 'AC Name/PC Name'\n"
                 "        ('AC/PC No',          ['AC/PC No', 'AC/PC NO', 'AC PC No',\n"
                 "                              'AC No/PC No', 'AC No / PC No']),")
A = "        ('AC/PC NAME',        ['AC/PC NAME', 'AC/PC Name', 'AC PC Name', 'AC/PC_NAME']),"
assert s.count(A) == 1
s = s.replace(A, "        ('AC/PC NAME',        ['AC/PC NAME', 'AC/PC Name', 'AC PC Name', 'AC/PC_NAME',\n"
                 "                              'AC Name/PC Name', 'AC Name / PC Name']),")

# ---------------- 3. Admin Designation ki safai ----------------
NORM = '''

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
    t = t.replace('\\u00a0', ' ')
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
    if _re.search(r'\\bmos\\b', rest) and 'Minister of State' not in out:
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
'''

A = "\ndef row_rank(r):"
assert s.count(A) == 1
s = s.replace(A, NORM + "\ndef row_rank(r):")

# ---- desig ab SAAF shreni se banta hai (raw alag rakh liya) ----
A = """            d['desig'] = [(clean(a) or clean(pp))
                          for a, pp in zip(d['adesig'], d['pdesig'])]"""
assert s.count(A) == 1
s = s.replace(A, """            # newmap (13-Oct): Admin Designation pehle -- par ab SAAF shreni ke
            # roop me. 'Chief MInister' / 'Cabiniet Minister' jaisi likhavat
            # pehle LVL se match hi nahi hoti thi aur aadmi 'Others' me gir
            # jaata tha. Asli likhavat 'adesig' me jyon ki tyon padi rehti hai.
            d['adesig_norm'] = [' | '.join(adm_buckets(a)) for a in d['adesig']]
            d['desig'] = [(an or clean(pp))
                          for an, pp in zip(d['adesig_norm'], d['pdesig'])]""")

A = """            d = d[['state', 'acpc', 'acname', 'pcname', 'name', 'desig',
                   'category', 'party', 'url', 'gender', 'pdesig', 'adesig',
                   'acpcname']]"""
assert s.count(A) == 1
s = s.replace(A, """            d = d[['state', 'acpc', 'acname', 'pcname', 'name', 'desig',
                   'category', 'party', 'url', 'gender', 'pdesig', 'adesig',
                   'adesig_norm', 'acpcname']]""")

A = """            d['gender'] = ''
            d['pdesig'] = d['desig']
            d['adesig'] = ''"""
assert s.count(A) == 1
s = s.replace(A, """            d['gender'] = ''
            d['pdesig'] = d['desig']
            d['adesig'] = ''
            d['adesig_norm'] = ''""")

# ---- desig me ek row se kai shreni aa sakti hain -> alag-alag tod do ----
A = """        desigs, seen = [], set()
        for r in rows:
            d = clean(r['desig'])"""
assert s.count(A) == 1
s = s.replace(A, """        desigs, seen = [], set()
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
                continue""")

# ---- handle_master me raw bhi jaaye ----
A = """            'admin_designation': dash(' | '.join(_uniq(
                [clean(r.get('adesig', '')) for r in top]))),"""
assert s.count(A) == 1
s = s.replace(A, """            # newmap (13-Oct): SAAF shreni yahan, aur Excel ki ASLI likhavat
            # 'admin_designation_raw' me -- dashboard chip par hover karne se
            # wahi dikhti hai. Dono rakhne se ginti saaf rehti hai aur aapka
            # likha hua bhi nahi khota.
            'admin_designation': dash(' | '.join(adm_sort(sum(
                [adm_buckets(r.get('adesig', '')) for r in top], [])))),
            'admin_designation_raw': dash(' | '.join(_uniq(
                [_plain(r.get('adesig', '')) for r in top]))),
            # ginti / filter ke liye moti shreni (chip me ye nahi jaata)
            'admin_group': dash(' | '.join(_uniq(
                [adm_group(r.get('adesig', '')) for r in top]))),""")

io.open(P, 'w', encoding='utf-8').write(s)
print('PATCHED', P)
