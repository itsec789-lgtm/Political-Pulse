# -*- coding: utf-8 -*-
"""TASK 3 -- Punjab dashboard se "Political Lens Assistant" hataana.

   Kya hat raha hai:
     - floating button (#aiFabBtn) + chat popup (#aiPanel)
     - assistant.js (offline chat engine) -- poori file
     - assistant-ai.js ka CHAT wala hissa
     - assistant ka CSS (.ai-fab/.ai-panel/.ai-msg/.ai-chip ...)
     - server.js ka POST /api/ask  (sirf assistant use karta tha)
     - wire.js ka wireAssistant()

   Kya BACHA rehta hai (kyunki Reports isi par chalti hai):
     - Settings ka AI key/model panel  -> naya ai-settings.js
     - /api/ai/status, /api/ai/key, /api/ai/models
     - /api/ai/narrative  (report-ai.js, Reports tab ka AI analysis)

   Har chhui hui file ka .bak backup banta hai.
"""
import io, os, re, shutil, sys

ROOT = os.environ['HOME'] + '/mnt/Main Twitter Project/PunjabLens'
PUB = ROOT + '/public'
GONE = PUB + '/_removed_assistant'

def R(p):
    return io.open(p, encoding='utf-8').read()

def W(p, s):
    io.open(p, 'w', encoding='utf-8').write(s)

def bak(p):
    b = p + '.bak_before_noassistant'
    if not os.path.exists(b):
        shutil.copyfile(p, b)
    return b

def grab(src, name):
    """`function name(` se shuru hokar uske matching `}` tak ka poora block."""
    m = re.search(r'\n(\s*)function ' + re.escape(name) + r'\s*\(', src)
    assert m, 'function nahi mila: ' + name
    i = m.start() + 1
    j = src.index('{', m.end() - 1)
    d = 0
    k = j
    while k < len(src):
        c = src[k]
        if c == '{': d += 1
        elif c == '}':
            d -= 1
            if d == 0:
                return src[i:k + 1]
        k += 1
    raise AssertionError('brace match fail: ' + name)

changed, notes = [], []

if 'aiFabBtn' not in R(PUB + '/index.html'):
    print('PEHLE HI HO CHUKA HAI -- kuch nahi kiya.')
    sys.exit(0)

# ----------------------------------------------------------------- 1. ai-settings.js
AAI = PUB + '/assistant-ai.js'
src = R(AAI)
bak(AAI)
head = ("var PL_BASE = (typeof window !== 'undefined' && window.PL_BASE) || '';\n"
 "/* ======================================================================\n"
 "   AI SETTINGS  (pehle assistant-ai.js ka hissa tha)\n"
 "   ----------------------------------------------------------------------\n"
 "   \"Political Lens Assistant\" (floating chat) 10-Oct ko hata diya gaya.\n"
 "   Par Settings ka Gemini key/model panel wahin pada tha, aur Reports tab\n"
 "   ka AI analysis (report-ai.js -> /api/ai/narrative) usi key par chalta\n"
 "   hai. Isliye sirf chat wala hissa nikala gaya, ye panel bacha liya.\n"
 "\n"
 "   Key kabhi browser me nahi aati -- server par ai_config.json me rehti hai.\n"
 "   ====================================================================== */\n"
 "(function () {\n"
 "  'use strict';\n"
 "\n"
 "  var PLX = window.PL || {};\n"
 "  var qs = function (s) { return document.querySelector(s); };\n"
 "  var escX = PLX.esc || function (v) { return String(v == null ? '' : v); };\n"
 "\n"
 "  var AI = { enabled: false, model: '', checked: false };\n"
 "\n"
 "  /* ------------------------------------------------------------ status -- */\n"
 "  function setStatusTag() {\n"
 "    var tag = qs('#aiStatusTag');\n"
 "    if (tag) {\n"
 "      tag.textContent = AI.enabled ? ('On \\u00b7 ' + AI.model) : 'Off';\n"
 "      tag.classList.toggle('tag-on', AI.enabled);\n"
 "    }\n"
 "  }\n\n")

refresh = grab(src, 'refreshStatus')
models = grab(src, 'loadModels')
wiresettings = grab(src, 'wireSettings')
for nm, blk in [('refreshStatus', refresh), ('loadModels', models), ('wireSettings', wiresettings)]:
    assert 'api/ask' not in blk, nm + ' me chat ka code bacha hai'

refresh = refresh.replace('setModeLine();', 'setStatusTag();')
refresh = refresh.replace("'No key set - the assistant is answering offline.'",
                          "'No key set - Reports ka AI analysis band rahega.'")
assert 'setModeLine' not in refresh

NEW = (head + refresh + "\n"
 "  /* Model list seedha Google se -- hardcoded list har kuch mahine me\n"
 "     purani pad jaati hai aur \"model no longer available\" dene lagti hai. */\n"
 + models + "\n"
 "  window.plAiRefresh = refreshStatus;\n"
 "  window.plAiOn = function () { return AI.enabled; };\n\n"
 "  /* ------------------------------------------------------------- wiring -- */\n"
 + wiresettings + "\n"
 "  function init() {\n"
 "    wireSettings();\n"
 "    refreshStatus();\n"
 "  }\n\n"
 "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);\n"
 "  else init();\n"
 "})();\n")
W(PUB + '/ai-settings.js', NEW)
changed.append('public/ai-settings.js  (NAYI -- assistant-ai.js ka sirf settings wala hissa)')

# purani do file hata kar alag folder me (delete band hai, isliye move)
if not os.path.isdir(GONE):
    os.makedirs(GONE)
for f in ['assistant.js', 'assistant-ai.js']:
    s0 = R(PUB + '/' + f)
    W(GONE + '/' + f, s0)
    W(PUB + '/' + f, '/* 10-Oct: Political Lens Assistant hata diya gaya.\n'
                     '   Is file ka asli content public/_removed_assistant/' + f + ' me rakha hai.\n'
                     '   index.html ab ise load nahi karta. */\n')
    changed.append('public/' + f + '  (khaali kar di; asli content _removed_assistant/ me)')

# ----------------------------------------------------------------- 2. index.html
IDX = PUB + '/index.html'
s = R(IDX)
bak(IDX)
i = s.index('<!-- ============ ASSISTANT ============ -->')
j = s.index('<!-- ==================================================================', i)
blk = s[i:j]
assert 'aiFabBtn' in blk and 'aiPanel' in blk and 'aiInput' in blk, 'galat block'
s = s[:i] + s[j:]
assert s.count('<script src="assistant.js"></script>\n<script src="assistant-ai.js"></script>\n') == 1
s = s.replace('<script src="assistant.js"></script>\n<script src="assistant-ai.js"></script>\n',
              '<script src="ai-settings.js"></script>\n')
# Settings card ka text: ab sirf Reports ke baare me
s = s.replace('<div class="card-head"><h3>AI Assistant &amp; Reports</h3>',
              '<div class="card-head"><h3>AI for Reports</h3>')
s = s.replace('it powers both the assistant and the report analysis.',
              'it powers the AI analysis in Reports.')
s = s.replace('Without a key the assistant keeps working in offline mode using its built-in answers.',
              'Without a key, Reports still work &mdash; only the AI narrative is skipped.')
for bad in ['aiFabBtn', 'aiPanel', 'aiInput', 'aiMessages', 'aiModeLine', 'assistant.js', 'assistant-ai.js']:
    assert bad not in s, 'index.html me abhi bhi: ' + bad
W(IDX, s)
changed.append('public/index.html  (chat button + popup hata, script tag badla, Settings ka text theek kiya)')

# ----------------------------------------------------------------- 3. wire.js
WIRE = PUB + '/wire.js'
s = R(WIRE)
bak(WIRE)
w = grab(s, 'wireAssistant')
s = s.replace(w + '\n', '')
s = s.replace("  /* --------------------------------------------------------- assistant -- */\n", '')
s = s.replace("     1. Open and close the assistant's floating button\n     2. When data arrives",
              "     Jab data aata hai (app.js `pl:data` event firti hai) tab")
s = s.replace("     1. Open and close the assistant's floating button\n", '')
s = s.replace("  if (document.readyState === 'loading') {\n"
              "    document.addEventListener('DOMContentLoaded', wireAssistant);\n"
              "  } else {\n"
              "    wireAssistant();\n"
              "  }\n", '')
assert 'wireAssistant' not in s, 'wire.js me wireAssistant bacha hai'
assert 'rerenderModules' in s and "pl:data" in s, 'wire.js ka doosra kaam toot gaya'
W(WIRE, s)
changed.append('public/wire.js  (wireAssistant hataya; data aane par re-render waala kaam waisa hi)')

# ----------------------------------------------------------------- 4. style.css
CSS = PUB + '/style.css'
s = R(CSS)
bak(CSS)
a1 = '/* ============================================================ */\n/*  AI ASSISTANT'
i = s.index(a1)
j = s.index('/* ============ ADVANCED FILTER PANEL ============ */', i)
cut1 = s[i:j]
assert '.ai-fab{' in cut1 and '.ai-input-row' in cut1
s = s[:i] + s[j:]
a2 = '/* ============ ASSISTANT ============ */'
i = s.index(a2)
j = s.index('@media (max-width:820px){', i)
cut2 = s[i:j]
assert '.ai-chip{' in cut2 and '.ai-guess{' in cut2
s = s[:i] + s[j:]
# chat ke bubble/typing-dots wale baad ke rules
a3 = '/* new bubble bits for the assistant */'
i = s.index(a3)
j = s.index('/* new controls in the report builder */', i)
cut3 = s[i:j]
assert '.ai-dots' in cut3 and '.ai-msg p' in cut3
s = s[:i] + s[j:]
# jo selector doosre rules ke saath mile hue the, unme se sirf assistant wala naam hata do
for a, b in [('.rp-kpi b, .ai-stats b, .cf-chip i{', '.rp-kpi b, .cf-chip i{'),
             ('.tab:active, .rpt-type:active, .ai-chip:active{', '.tab:active, .rpt-type:active{'),
             ('.cf-chip, .fp-mode, .date-chip, .tab, .rpt-type, .ai-chip{',
              '.cf-chip, .fp-mode, .date-chip, .tab, .rpt-type{')]:
    assert s.count(a) == 1, 'css selector nahi mila: ' + a
    s = s.replace(a, b)
# Settings/Reports ke .ai-key-row aur .ai-btn JAAN-BOOJH KAR bache hain
for keep in ['.ai-key-row', '.ai-btn', '.card-tag.tag-on']:
    assert keep in s, 'ye CSS galti se hat gaya: ' + keep
for bad in ['.ai-fab', '.ai-panel', '.ai-msg', '.ai-input-row', '.ai-chip', '.ai-guess',
            '.ai-tbl', '.ai-stats', '.ai-dots', '.ai-warn', '.ai-note', '.ai-yn', '.ai-yes', '.ai-no{',
            'aiBlink']:
    assert bad not in s, 'style.css me abhi bhi: ' + bad
W(CSS, s)
changed.append('public/style.css  (assistant ka CSS hataya -- %d akshar; .ai-key-row aur .ai-btn bache)'
               % (len(cut1) + len(cut2) + len(cut3)))

# ----------------------------------------------------------------- 5. server.js : POST /api/ask
SRV = ROOT + '/server.js'
s = R(SRV)
bak(SRV)
i = s.index("app.post('/api/ask'")
# is route ka ant: agle "app." se pehle
j = s.index('\napp.', i + 10)
# upar ka comment bhi saath le lo
c = s.rfind('/* An assistant question.', 0, i)
start = c if c >= 0 else i
cut = s[start:j + 1]
assert 'gemini(' in cut and '/api/ask' in cut
s = s[:start] + ("/* 10-Oct: POST /api/ask hata diya gaya -- wo SIRF \"Political Lens\n"
                 "   Assistant\" (floating chat) use karta tha, aur wo chat ab dashboard\n"
                 "   se hata di gayi hai. Baaki AI routes (status / key / models /\n"
                 "   narrative) waise ke waise hain -- Reports ka AI analysis unhi par\n"
                 "   chalta hai. */\n") + s[j + 1:]
assert "'/api/ask'" not in s, 'server.js me /api/ask bacha hai'
for keep in ["'/api/ai/status'", "'/api/ai/key'", "'/api/ai/models'", "'/api/ai/narrative'"]:
    assert keep in s, 'ye route galti se hat gaya: ' + keep
W(SRV, s)
changed.append('server.js  (sirf POST /api/ask hataya; baaki AI routes salaamat)')

print('--- BADLI HUI FILES ---')
for c in changed:
    print('  ' + c)
print('\n--- BACKUP ---')
for p in [IDX, WIRE, CSS, SRV, AAI]:
    b = p + '.bak_before_noassistant'
    print('  ' + ('OK ' if os.path.exists(b) else '?? ') + os.path.relpath(b, ROOT))
print('\ndone')
