# -*- coding: utf-8 -*-
"""parties-v2 (10-Oct) ko dono template me lagata hai.
   Chalao:  python3 apply_parties.py
   Har kadam par jaanch hai -- kuch bhi na mile to kuch likha hi nahi jaata."""
import io, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FILES = [os.path.join(ROOT, 'DASHBOARD', 'dashboard.template.html'),
         os.path.join(ROOT, 'UP-DASHBOARD', 'dashboard.template.html')]

def R(p):
    return io.open(p, encoding='utf-8').read()

BODY = R(os.path.join(HERE, 'p_body.html')).rstrip('\n')
CSS = R(os.path.join(HERE, 'p_extra.css')).rstrip('\n')
APP = R(os.path.join(HERE, 'p_app.js')).rstrip('\n')

SEC_START = '<div class="page-section" id="sec-parties">'
SEC_END_MARK = '<!-- 8. UP ANALYSIS -->'

OLD_TAB = ("if(tab==='parties'){animateSentBarsAll();try{renderPartyCards();}"
           "catch(e){console.warn('partyCards',e);}setTimeout(()=>{renderPartiesCharts();"
           "renderPartyTweetChart();renderPartySentChart2();},50);}}")
NEW_TAB = ("if(tab==='parties'){/* parties-v2 (10-Oct): poora tab ab ek hi jagah se "
           "banta hai -- purane alag-alag renderer nahi chalte */"
           "setTimeout(function(){try{window.pfRender&&window.pfRender();}"
           "catch(e){console.warn('parties-v2',e);}},30);}}")

CSS_ANCHOR = '/* ===== header-anim (10-Oct) : swoosh wave + logo coin flip ====='
AGG_OLD = 'const AGG="__MONGO_AGG__";'
AGG_NEW = ('const AGG="__MONGO_AGG__";\n'
           '/* parties-v2: AGG const tha -> bahar wale script block ko dikhta hi nahi\n'
           '   tha. Parties tab ko poori ISO date yahin se chahiye. */\n'
           'try{window.AGG=AGG;}catch(e){}')

def one(path):
    s = R(path)
    tag = os.path.basename(os.path.dirname(path))
    assert 'parties-v2 (10-Oct)' not in s, 'ALREADY PATCHED: ' + path
    n0 = len(s)
    shutil.copyfile(path, path + '.bak_before_partiesv2')

    # 1. poora section badlo
    i = s.index(SEC_START)
    j = s.index(SEC_END_MARK, i)
    old = s[i:j]
    assert old.rstrip().endswith('</div>'), 'section ka ant nahi mila'
    assert 'partyCardsSection' in old and 'partySentChart2' in old, 'galat section'
    s = s[:i] + BODY + '\n' + s[j:]

    # 2. CSS
    assert s.count(CSS_ANCHOR) == 1, 'css anchor'
    s = s.replace(CSS_ANCHOR, CSS + '\n' + CSS_ANCHOR)

    # 3. AGG ko window par
    assert s.count(AGG_OLD) == 1, 'AGG decl'
    s = s.replace(AGG_OLD, AGG_NEW)

    # 4. switchTab
    assert s.count(OLD_TAB) == 1, 'switchTab parties branch'
    s = s.replace(OLD_TAB, NEW_TAB)

    # 5. script -- aakhri </body> se pehle
    k = s.rfind('</body>')
    assert k > 0
    s = s[:k] + '<script>\n' + APP + '\n</script>\n' + s[k:]

    # purane id ab kahin markup me nahi bache
    for bad in ['id="partyCardsSection"', 'id="activePartyBanner"', 'id="pDailyChart"',
                'id="partyTweetChart"', 'id="partySentChart2"', 'id="pPartyViewsChart"',
                'id="pTopHandlesChart"', 'id="pHourlyChart"', 'id="pDateSelect"',
                'id="pLevelSelect"', 'id="pStateSelect"', 'id="pPartySelect"']:
        assert bad not in s, 'markup me abhi bhi: ' + bad

    io.open(path, 'w', encoding='utf-8').write(s)
    print('PATCHED %-13s %d -> %d  (+%d)' % (tag, n0, len(s), len(s) - n0))

for f in FILES:
    one(f)
print('done')
