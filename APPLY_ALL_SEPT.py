# -*- coding: utf-8 -*-
"""
APPLY_ALL_SEPT.py
=================
3 September 2026 se aaj tak dashboard me jo bhi badla, wo SAB ek baar me
hosted PC par laga deta hai -- All India + Uttar Pradesh + Punjab, teeno.

CHALAO (project root me, jahan DASHBOARD / UP-DASHBOARD / PunjabLens folder hain):

    python APPLY_ALL_SEPT.py                      <- sirf report, kuch nahi badlega
    python APPLY_ALL_SEPT.py --apply              <- code laga do
    python APPLY_ALL_SEPT.py --apply --rebuild    <- code + DATA dono (poora kaam)

SENTIMENT ke naye card (Pro-BJP / Anti-BJP / Pro-Govt / Anti-Govt) agar 0
dikh rahe hain to --rebuild hi chahiye. Wajah: ye ginti HTML me nahi hoti,
'dashboard_data' blob me hoti hai. Sirf code lagane se card DIKHNE lagte
hain par unke peeche purana 3-category wala blob hi hota hai -> 0.
--rebuild wahi blob Mongo se dobara banata hai (10-15 minute lag sakte hain).

Uske baad:
    1. server band karke dobara chalu karo (START_LIVE.bat)  -- server.js badla hai
    2. browser me Ctrl + Shift + R

--------------------------------------------------------------------------
AAPKA DATA / CONFIG BILKUL NAHI CHHUA JAATA
--------------------------------------------------------------------------
Ye script sirf CODE badalti hai. In cheezon ko haath tak nahi lagati:
    * MongoDB -- na padhti hai, na likhti hai
    * data/ ke andar kuch bhi (master_tweets.csv, dashboard_data.json,
      handles.json, phd.json, handle_master.json, mapping.json)
    * db_config.json      (MongoDB ka password/URL)
    * local_config.json   (primary / secondary laptop)
    * ai_config.json, mail_config.json, config.json
    * network folder, backup, scraper, koi bhi .bat file
Har badli hui file ka backup pehle ban jaata hai:  <file>.bak_ALL_<date_time>

Dobara chalane par kuch bigadta nahi -- har change ka apna nishaan hai,
jo pehle se laga hai wo "pehle se hai" bol kar chhod diya jaata hai.

--------------------------------------------------------------------------
KYA-KYA LAGTA HAI
--------------------------------------------------------------------------
1. Header + side panel scroll  -- side panel scroll karne par header jam
                                  jaata hai (Punjab jaisa), teeno page par
2. Hinglish -> English         -- dashboard ke saare baaki Hindi/Hinglish
                                  label angrezi me
3. MLA Contestant ginti        -- filter lagate hi 0 ho jaane wali bug
4. Real-time update indicator  -- badhne par hara "13K up +1K", count-up
                                  aur pulse ke saath (rt-delta v3):
                                    - tab badalne/reload par gayab nahi hota
                                    - table me row ki pehchan @handle se
                                      hoti hai (rank se nahi), isliye sort
                                      badalne par jhoothe delta nahi aate
5. SENTIMENT -- 3 se 8 category:
                Pro-BJP, Anti-Govt, Pro-Govt, Positive, Neutral,
                Anti-BJP, Negative, No-Sentiment
                (KPI card, by-party chart, daily trend, leaders table,
                 party card, hashtag chart, badge, report doughnut --
                 teeno dashboard me; Punjab ka DB label bhi theek hota hai)
6. BREAKING NEWS -- naya tab, teeno dashboard me. Source sirf aapka apna
                    scrape kiya hua data (Media House / Journalist wale
                    tweets). Koi bahar ka news API nahi, koi nakli khabar
                    nahi.
7. TWEET INTELLIGENCE -- 'Trending' aur 'Tweet Explorer' ab do alag menu
                         nahi, ek hi page ke andar do sub-tab. Dono ka
                         poora purana kaam waisa hi chalta hai.

NOTE: point 5 ke naye number tabhi dikhenge jab pipeline ek baar dobara
chalega (REBUILD_SENTIMENT.py). Ye script sirf code lagati hai.
"""
import os, sys, re, json, zlib, base64, tempfile, runpy, datetime, subprocess, shutil, io

HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = '--apply' in sys.argv
REBUILD = '--rebuild' in sys.argv      # code lagane ke BAAD data bhi dobara bana do
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M')
DASH = os.path.join(HERE, 'DASHBOARD')
UPD = os.path.join(HERE, 'UP-DASHBOARD')
PJ = os.path.join(HERE, 'PunjabLens')

# ---- jin file ko haath lagta hai (backup inhi ka banta hai) ----
TOUCH = [
    os.path.join(DASH, 'dashboard.template.html'),
    os.path.join(DASH, 'update_dashboard.py'),
    os.path.join(DASH, 'server.js'),
    os.path.join(UPD, 'dashboard.template.html'),
    os.path.join(UPD, 'update_dashboard.py'),
    os.path.join(PJ, 'aggregate.js'),
    os.path.join(PJ, 'build_punjab_data.py'),
    os.path.join(PJ, 'public', 'app.js'),
    os.path.join(PJ, 'public', 'index.html'),
    os.path.join(PJ, 'public', 'style.css'),
]

# ---- ye kabhi nahi chhue jaate (bas yaad dilane ke liye likha hai) ----
NEVER = ['data/', 'db_config.json', 'local_config.json', 'ai_config.json',
         'mail_config.json', 'config.json', '*.bat', 'MongoDB']

PAYLOAD = (
    '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'
)


def bar(t=''):
    print('\n' + '=' * 74)
    if t: print('  ' + t); print('=' * 74)


def unpack():
    d = tempfile.mkdtemp(prefix='dashfix_')
    blob = json.loads(zlib.decompress(base64.b64decode(PAYLOAD)).decode('utf-8'))
    for name, src in blob.items():
        io.open(os.path.join(d, name), 'w', encoding='utf-8').write(src)
    return d


def check_layout():
    ok = True
    for p, n in [(DASH, 'DASHBOARD'), (UPD, 'UP-DASHBOARD'), (PJ, 'PunjabLens')]:
        got = os.path.isdir(p)
        print('   %-14s %s' % (n, 'mila' if got else '!! NAHI MILA'))
        ok = ok and got
    if not ok:
        print('\n   Ye script project ROOT me rakh kar chalani hai --')
        print('   yaani wahan jahan ye teeno folder hain.')
    return ok


def backup():
    n = 0
    for p in TOUCH:
        if not os.path.exists(p): continue
        b = p + '.bak_ALL_' + STAMP
        if not os.path.exists(b):
            shutil.copy2(p, b); n += 1
    print('   %d file ka backup bana (.bak_ALL_%s)' % (n, STAMP))


def node_ok():
    try:
        subprocess.run(['node', '--version'], capture_output=True, timeout=10)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------- steps
def step(no, title, fn):
    bar('%d. %s' % (no, title))
    try:
        fn()
    except SystemExit as e:
        if e.code: print('   !! ye step ruk gaya (%s)' % e.code)
    except Exception as e:
        print('   !! ye step fail hua: %s' % e)
        print('      baaki step phir bhi chalte rahenge.')


def dedupe_punjab():
    """PunjabLens/public/index.html me DOHRI entry saaf karta hai.

    KYUN: pehle wale version me is file ka "pehle se laga hai" wala pehra
    kaam nahi karta tha -- marker sirf style.css me likha jaata tha,
    index.html me nahi. Jisne installer do-teen baar chalaya uske paas
    Breaking News section, sidebar item, breaking.js ka script tag aur
    sentiment ka KPI grid DO-TEEN baar pad gaye. Ek hi id do baar hone se
    JS galat element pakadta hai aur breaking.js do baar chalti hai.

    Ab marker index.html me bhi jaata hai (dobara nahi lagega), aur ye
    function pehle se bani hui copy hata deta hai -- pehli rehne deta hai.
    Kuch dohra nahi mila to file ko haath bhi nahi lagta.
    """
    idx = os.path.join(PJ, 'public', 'index.html')
    if not os.path.isfile(idx):
        return
    s = io.open(idx, encoding='utf-8').read()
    orig = s
    n = 0

    def keep_first(pat, label, flags=re.S):
        nonlocal s, n
        hits = list(re.finditer(pat, s, flags))
        if len(hits) < 2:
            return
        # aakhri se hatao taaki index na khiske
        for m in reversed(hits[1:]):
            s = s[:m.start()] + s[m.end():]
        print('   %-26s %d extra copy hatai' % (label, len(hits) - 1))
        n += len(hits) - 1

    keep_first(r'[ \t]*<!--[^\n]*SECTION: BREAKING NEWS[^\n]*-->\s*'
               r'<section class="page" id="breaking">.*?</section>\n?', 'Breaking News section')
    keep_first(r'[ \t]*<li data-target="breaking">.*?</li>\n?', 'sidebar item')
    keep_first(r'[ \t]*<script src="breaking\.js"></script>\n?', 'breaking.js tag')
    keep_first(r'(?:[ \t]*<!-- SENT8[^\n]*-->\n)?[ \t]*'
               r'<div class="kpi-grid" id="sentKpiGrid"></div>\n?', 'sentiment KPI grid')

    # Bacha hua ek copy purane version ka ho sakta hai jisme NISHAAN nahi tha.
    # Nishaan wapas laga do, warna aage ka patch use "nahi laga" samajh kar
    # ek aur copy chipka dega -- aur hum wahin ke wahin.
    if '<section class="page" id="breaking">' in s and 'BREAKING NEWS (news v1)' not in s:
        s = re.sub(r'[ \t]*<!--[^\n]*SECTION: BREAKING NEWS[^\n]*-->\n', '', s, count=1)
        s = s.replace('  <section class="page" id="breaking">',
                      '  <!-- ============ SECTION: BREAKING NEWS (news v1) ============ -->\n'
                      '  <section class="page" id="breaking">', 1)
        print('   %-26s nishaan wapas lagaya' % 'Breaking News section')
        n += 1
    if 'id="sentKpiGrid"' in s and 'SENT8 -- 8 sentiment categories' not in s:
        s = s.replace('    <div class="kpi-grid" id="sentKpiGrid"></div>',
                      '    <!-- SENT8 -- 8 sentiment categories -->\n'
                      '    <div class="kpi-grid" id="sentKpiGrid"></div>', 1)
        print('   %-26s nishaan wapas lagaya' % 'sentiment KPI grid')
        n += 1

    if n and s != orig:
        io.open(idx + '.bak_DUP_' + STAMP, 'w', encoding='utf-8').write(orig)
        io.open(idx, 'w', encoding='utf-8').write(s)
        print('   ho gaya (backup: index.html.bak_DUP_%s)' % STAMP)
    elif not n:
        print('   koi dohri entry nahi mili -- file jaisi thi waisi hai')


def main():
    print('\n' + '#' * 74)
    print('#  APPLY_ALL_SEPT  --  %s'
          % ('APPLY (file badlengi)' if APPLY else 'REPORT ONLY (kuch nahi badlega)'))
    print('#  Folder : %s' % HERE)
    print('#  Data/config ko haath nahi lagta: %s' % ', '.join(NEVER[:5]))
    print('#' * 74)

    bar('0. FOLDER JAANCH')
    if not check_layout(): return 1
    if not node_ok():
        print('   !! node nahi mila -- JS ki jaanch skip hogi (patch phir bhi lagega)')

    if not APPLY:
        print('\n   REPORT ONLY hai. Asli me lagane ke liye:')
        print('       python APPLY_ALL_SEPT.py --apply\n')
        return 0

    bar('BACKUP')
    backup()

    bar('0b. PUNJAB -- purani DOHRI entry saaf')
    dedupe_punjab()

    tmp = unpack()
    sys.path.insert(0, tmp)

    # -- 1. Sept 3-5 wale fixes (scroll, English, MLA, real-time indicator) --
    def s1():
        dst = os.path.join(HERE, 'APPLY_DASHBOARD_FIXES.py')
        shutil.copy2(os.path.join(tmp, 'APPLY_DASHBOARD_FIXES.py'), dst)
        old = sys.argv[:]
        sys.argv = ['APPLY_DASHBOARD_FIXES.py', '--apply']
        try: runpy.run_path(dst, run_name='__main__')
        finally: sys.argv = old
    step(1, 'SCROLL + ENGLISH + MLA COUNT + REAL-TIME INDICATOR', s1)

    # -- 2. sentiment: update_dashboard.py (All India + UP) --
    def s2():
        import patch_py
        patch_py.apply(os.path.join(DASH, 'update_dashboard.py'), patch_py.RULES)
        patch_py.apply(os.path.join(UPD, 'update_dashboard.py'),
                       patch_py.RULES + patch_py.RULES_UP)
    step(2, 'SENTIMENT 8 CATEGORY -- pipeline (update_dashboard.py)', s2)

    # -- 3. sentiment: dono template --
    def s3():
        import patch_tpl
        patch_tpl.patch(os.path.join(DASH, 'dashboard.template.html'))
        patch_tpl.patch(os.path.join(UPD, 'dashboard.template.html'))
    step(3, 'SENTIMENT 8 CATEGORY -- All India + UP ka UI', s3)

    # -- 4. sentiment: Punjab --
    def s4():
        import patch_punjab
        patch_punjab.apply(os.path.join(PJ, 'aggregate.js'), patch_punjab.AGG_RULES)
        patch_punjab.apply(os.path.join(PJ, 'public', 'app.js'), patch_punjab.APP_RULES)
        patch_punjab.apply(os.path.join(PJ, 'public', 'index.html'), patch_punjab.IDX_RULES)
        old = sys.argv[:]
        sys.argv = ['patch_pjpy.py', os.path.join(PJ, 'build_punjab_data.py')]
        try: runpy.run_path(os.path.join(tmp, 'patch_pjpy.py'), run_name='__main__')
        except SystemExit: pass
        finally: sys.argv = old
    step(4, 'SENTIMENT 8 CATEGORY -- Punjab', s4)

    # -- 5. Breaking News: server API --
    def s5():
        shutil.copy2(os.path.join(tmp, 'news_lib.js'), os.path.join(DASH, 'news_lib.js'))
        print('   news_lib.js rakh di (DASHBOARD/)')
        import patch_server
        patch_server.main(os.path.join(DASH, 'server.js'))
        import patch_live
        patch_live.patch_server(os.path.join(DASH, 'server.js'))
    step(5, 'BREAKING NEWS -- server ka /api/news (+ /api/live)', s5)

    # -- 6. Breaking News: All India + UP ka UI --
    # Ye do step (6 aur 8) tabhi lag sakte hain jab template me Trending /
    # Tweet Explorer / Word Cloud tab pehle se hon. Bahut purane template me
    # ye tab hote hi nahi -- to jodne ki jagah hi nahi milti. Aise me
    # chup-chaap [MISS] ki jhadi lagane se behtar hai saaf-saaf bata dena.
    def newtabs_ok(p):
        try: t = io.open(p, encoding='utf-8', errors='ignore').read()
        except Exception: return False
        return ('sec-wordcloud' in t) and ('data-tab="trending"' in t)

    OLD_TPL = [p for p in (os.path.join(DASH, 'dashboard.template.html'),
                           os.path.join(UPD, 'dashboard.template.html'))
               if not newtabs_ok(p)]

    def s6():
        if OLD_TPL:
            print('   !! Ye template PURANI generation ka hai -- isme Trending /')
            print('      Tweet Explorer / Word Cloud tab hain hi nahi, isliye')
            print('      Breaking News jodne ki jagah nahi mil rahi:')
            for p in OLD_TPL: print('         ' + os.path.relpath(p, HERE))
            print('      Hal: is folder ke saath jo taiyaar template bheji gayi hai')
            print('      use copy kar do, phir ye script dobara chala do.')
            return
        import patch_tpl_news
        patch_tpl_news.patch(os.path.join(DASH, 'dashboard.template.html'))
        patch_tpl_news.patch(os.path.join(UPD, 'dashboard.template.html'))
    step(6, 'BREAKING NEWS -- All India + UP ka UI', s6)

    # -- 7. Breaking News: Punjab --
    def s7():
        shutil.copy2(os.path.join(tmp, 'breaking.js'),
                     os.path.join(PJ, 'public', 'breaking.js'))
        print('   breaking.js rakh di (PunjabLens/public/)')
        import patch_punjab_news
        patch_punjab_news.patch(PJ)
    step(7, 'BREAKING NEWS -- Punjab ka UI', s7)

    # -- 8. Trending + Explorer -> Tweet Intelligence --
    def s8():
        if OLD_TPL:
            print('   !! purani generation ki template -- Trending/Explorer tab')
            print('      maujood hi nahi hain, isliye jodne ko kuch hai nahi.')
            print('      (upar step 6 me jo likha hai wahi karo)')
            return
        import patch_merge
        patch_merge.patch(os.path.join(DASH, 'dashboard.template.html'))
        patch_merge.patch(os.path.join(UPD, 'dashboard.template.html'))
    step(8, 'TWEET INTELLIGENCE -- Trending + Explorer ek tab me', s8)

    # -- 9. helper script (data dobara banane ke liye) --
    def s9():
        for f in ('REBUILD_SENTIMENT.py', 'CHECK_SENTIMENT.py', 'DIAGNOSE_PIPELINE.py'):
            shutil.copy2(os.path.join(tmp, f), os.path.join(HERE, f))
            print('   ' + f + ' rakh di')
        print('   (sentiment ke naye number in me se REBUILD_SENTIMENT.py se aate hain)')
    step(9, 'HELPER SCRIPT', s9)

    # -------------------------------------------------------- verify
    bar('10. JAANCH  (sab laga ya nahi)')
    MARKS = [
        (os.path.join(DASH, 'dashboard.template.html'), [
            ('rt-delta v3', 'real-time indicator'),
            ('SENTIMENT 8-CATEGORY CORE', 'sentiment 8'),
            ('BREAKING NEWS (news v1)', 'breaking news'),
            ('TWEET INTELLIGENCE (merge v1)', 'tweet intelligence')]),
        (os.path.join(UPD, 'dashboard.template.html'), [
            ('rt-delta v3', 'real-time indicator'),
            ('SENTIMENT 8-CATEGORY CORE', 'sentiment 8'),
            ('BREAKING NEWS (news v1)', 'breaking news'),
            ('TWEET INTELLIGENCE (merge v1)', 'tweet intelligence')]),
        (os.path.join(DASH, 'update_dashboard.py'), [('SENT_CATS', 'sentiment 8')]),
        (os.path.join(UPD, 'update_dashboard.py'), [('SENT_CATS', 'sentiment 8')]),
        (os.path.join(DASH, 'server.js'), [
            ('BREAKING NEWS API', '/api/news'),
            ('LIVE DATA INDICATOR', '/api/live')]),
        (os.path.join(DASH, 'news_lib.js'), [('MEDIA_CATS', 'news engine')]),
        (os.path.join(PJ, 'aggregate.js'), [('SENT8', 'sentiment 8')]),
        (os.path.join(PJ, 'build_punjab_data.py'), [('SENT8_CODES', 'sentiment 8')]),
        (os.path.join(PJ, 'public', 'app.js'), [('SENT8', 'sentiment 8')]),
        (os.path.join(PJ, 'public', 'index.html'), [('data-target="breaking"', 'breaking news')]),
        (os.path.join(PJ, 'public', 'breaking.js'), [('api/news', 'news feed')]),
    ]
    bad = 0
    for path, marks in MARKS:
        try:
            s = io.open(path, encoding='utf-8', errors='ignore').read()
        except Exception:
            print('   !! nahi mili : %s' % path); bad += 1; continue
        for m, label in marks:
            got = m in s
            if not got: bad += 1
            print('   %-52s %-22s %s'
                  % (os.path.relpath(path, HERE), label, 'OK' if got else '!! NAHI LAGA'))

    # syntax
    bar('11. SYNTAX JAANCH')
    for p in [os.path.join(DASH, 'update_dashboard.py'),
              os.path.join(UPD, 'update_dashboard.py'),
              os.path.join(PJ, 'build_punjab_data.py')]:
        try:
            compile(io.open(p, encoding='utf-8').read(), p, 'exec')
            print('   %-46s python OK' % os.path.relpath(p, HERE))
        except Exception as e:
            print('   %-46s !! %s' % (os.path.relpath(p, HERE), e)); bad += 1
    if node_ok():
        for p in [os.path.join(DASH, 'server.js'), os.path.join(DASH, 'news_lib.js'),
                  os.path.join(PJ, 'aggregate.js'), os.path.join(PJ, 'public', 'app.js'),
                  os.path.join(PJ, 'public', 'breaking.js')]:
            r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
            print('   %-46s %s' % (os.path.relpath(p, HERE),
                                   'node OK' if r.returncode == 0
                                   else '!! ' + r.stderr.strip().split(chr(10))[0][:70]))
            if r.returncode: bad += 1

    # ---- sabse zaroori jaanch: DATA me 8 category hai ya nahi? ----
    # Card 0 dikhne ki 99%% wajah yahi hoti hai -- code lag gaya par pipeline
    # dobara nahi chala, isliye purana 3-category wala blob hi pada hai.
    bar('12. DATA JAANCH  (card 0 kyun dikh rahe hain -- asli jawab yahin hai)')
    NEW5 = ['probjp', 'antigovt', 'progovt', 'antibjp', 'none']
    need_rebuild = False
    try:
        sys.path.insert(0, HERE); sys.path.insert(0, DASH)
        from mongo_conf import MONGO_URL
        from pymongo import MongoClient
        cli = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
        for db, label in [('india_Pulse', 'All India'), ('up_pulse', 'Uttar Pradesh')]:
            try:
                d = cli[db]['dashboard_data'].find_one({'key': 'UNI'})
                sent = ((d or {}).get('value') or {}).get('sent') or {}
                miss = [k for k in NEW5 if k not in sent]
                if miss:
                    need_rebuild = True
                    print('   %-14s : PURANA blob -- %s hain hi nahi -> card 0 dikhenge'
                          % (label, ', '.join(miss)))
                else:
                    print('   %-14s : theek hai -- Pro-BJP %s, Anti-BJP %s, Anti-Govt %s'
                          % (label, format(sent.get('probjp', 0), ','),
                             format(sent.get('antibjp', 0), ','),
                             format(sent.get('antigovt', 0), ',')))
            except Exception as e:
                print('   %-14s : padha nahi gaya (%s)' % (label, e))
        try:
            vals = cli['political_lens']['tweets'].distinct('sn')
            vals = [str(v) for v in vals if v]
            if len(vals) <= 3:
                need_rebuild = True
                print('   %-14s : DB me sirf %d sentiment value hain (%s)'
                      % ('Punjab', len(vals), ', '.join(sorted(vals))))
                print('                    -> build_punjab_data.py --push chalana hai')
            else:
                print('   %-14s : theek hai -- %d value (%s)'
                      % ('Punjab', len(vals), ', '.join(sorted(vals))))
        except Exception as e:
            print('   %-14s : padha nahi gaya (%s)' % ('Punjab', e))
        cli.close()
    except Exception as e:
        print('   Mongo se juda nahi ja saka (%s)' % e)
        print('   Khud dekhne ke liye:  python REBUILD_SENTIMENT.py --check')
        need_rebuild = True

    if need_rebuild:
        print('')
        print('   >>> KARNA KYA HAI: neeche wali command ek baar chalao,')
        print('       tabhi 8 category ke asli number aayenge:')
        print('')
        print('           python REBUILD_SENTIMENT.py')
        print('')

    # ---- 13. DATA dobara banao (sirf --rebuild par) ----
    if REBUILD:
        bar('13. DATA DOBARA BANAO  (All India + UP + Punjab)')
        print('   Ye Mongo se poora dashboard blob dobara banata hai.')
        print('   Master data (master_tweets) ko sirf PADHA jaata hai, badla nahi.')
        print('   10-15 minute lag sakte hain -- window band mat karna.\n')
        old_argv = sys.argv[:]
        sys.argv = ['REBUILD_SENTIMENT.py']
        rc, err = 0, None
        try:
            runpy.run_path(os.path.join(HERE, 'REBUILD_SENTIMENT.py'), run_name='__main__')
        except SystemExit as e:
            # PEHLE ye chupchaap 'pass' tha. Rebuild fail hoke exit 1 karta tha
            # aur installer 'HO GAYA' likh deta tha -- aadmi ko lagta tha sab
            # theek hai, aur dashboard par 0 hi dikhta rehta tha. Ab nahi.
            try: rc = int(e.code or 0)
            except Exception: rc = 1
        except Exception as e:
            rc, err = 1, e
        finally:
            sys.argv = old_argv
        if rc:
            bad += 1
            print('')
            print('   ' + '!' * 60)
            print('   !!  DATA REBUILD FAIL HUA  (exit %d)%s' % (rc, ': %s' % err if err else ''))
            print('   !!  Code lag chuka hai, par ginti purani hi rahegi --')
            print('   !!  Pro-BJP / Anti-BJP / Pro-Govt / Anti-Govt 0 dikhenge.')
            print('   !!  Upar step 13 ka poora output mujhe bhej dena.')
            print('   !!  Alag se chala kar dekho:  python REBUILD_SENTIMENT.py')
            print('   ' + '!' * 60)
    elif need_rebuild:
        print('   (ya seedha ek hi command me:'
              '  python APPLY_ALL_SEPT.py --apply --rebuild )')

    bar('HO GAYA' if not bad else 'HO GAYA -- par %d cheez dekhni hai' % bad)
    print('  1. Server band karke dobara chalu karo  ->  START_LIVE.bat')
    print('     (server.js badla hai -- template apne aap padh liye jaate hain,')
    print('      par server.js sirf shuru hone par padha jaata hai.)')
    print('  2. Browser me Ctrl + Shift + R')
    if REBUILD:
        print('  3. Data rebuild ka step chal chuka hai -- upar step 13 ka output')
        print('     dekh lo. Ginti milani ho to:  python CHECK_SENTIMENT.py')
    else:
        print('  3. Sentiment ke 8 naye number ABHI 0 dikhenge -- unke liye data')
        print('     dobara banana padta hai. Ek hi command me sab:')
        print('         python APPLY_ALL_SEPT.py --apply --rebuild')
        print('     (ya alag se:  python REBUILD_SENTIMENT.py )')
    print('')
    print('  Kuch galat lage to backup se wapas:')
    print('     copy /Y DASHBOARD\\dashboard.template.html.bak_ALL_%s '
          'DASHBOARD\\dashboard.template.html' % STAMP)
    print('')
    return 0


if __name__ == '__main__':
    sys.exit(main())
