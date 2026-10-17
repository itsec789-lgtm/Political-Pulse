# -*- coding: utf-8 -*-
"""
sentiment_cli.py  --  tweet text ka sentiment, wahi jo aapke notebook me hai.

Node (x_scraper.js) ise chalata hai. Baat JSON me hoti hai:

   stdin   {"texts": ["pehla tweet", "doosra tweet", ...]}
   stdout  {"engine": "sentiment_tagger",
            "results": [{"label": "Positive", "score": 0.91}, ...]}

ENGINE kaunsa chalega (isi tarteeb me, jo pehle mile wahi):

  1. sentiment_tagger   -- aapka trained package (notebook wala):
                              st.tag_texts([t])[0] -> {label, confidence}
                           YAHI SAHI HAI. Iske label aapke apne hain
                           (jaise "Anti-BJP"), 7-8 class.
  2. textblob           -- SIRF 3 label: Positive / Negative / Neutral
  3. wordlist           -- SIRF 3 label, aakhri sahara

  DHYAN DO: 2 aur 3 aapke 7-8 wale label DE HI NAHI SAKTE -- wo alag
  tarah ke classifier hain. Isliye tracker default roop se trained model
  ke bina sentiment likhta hi nahi (x_scraper.js ka sentimentStrict).
  Galat label database me chale jaana, khaali chhodne se zyada bura hai.

Panel par saaf likha rehta hai ki abhi kaunsa engine chal raha hai, taaki
"sentiment theek nahi aa raha" par guess na lagana pade.

sentiment_tagger install karne ke liye (jis machine par dashboard chalta hai):
    pip install -e "C:\\Users\\<aap>\\Documents\\sentiment_tagger_pkg"
Install karte hi ye file apne aap usi par chali jaayegi -- yahan kuch
badalna nahi padta.
"""
import sys, json

ENGINE = None
_tagger = None


def labels():
    """Model ke SAARE label, agar package bataata ho.

    Aapke notebook ka jawaab:  [{'label': 'Anti-BJP', 'confidence': 0.4268}]
    Yaani label sirf Positive/Negative/Neutral nahi hain -- 7-8 class hain.
    Isliye kahin bhi ye maan kar nahi chalte ki teen hi honge; jo model de,
    wahi seedha database me jaata hai.
    """
    if ENGINE != 'sentiment_tagger':
        return []
    for attr in ('LABELS', 'labels', 'CLASSES', 'classes', 'label_names'):
        try:
            v = getattr(_tagger, attr, None)
            if callable(v):
                v = v()
            if v:
                return sorted(str(x) for x in v)
        except Exception:
            pass
    # kuch model apna label-set classifier ke andar rakhte hain
    for attr in ('model', '_model', 'clf', 'pipeline'):
        try:
            m = getattr(_tagger, attr, None)
            cl = getattr(m, 'classes_', None)
            if cl is not None:
                return sorted(str(x) for x in cl)
        except Exception:
            pass
    return []


def _load():
    """Pehli baar me hi tay kar lo ki kaunsa engine hai."""
    global ENGINE, _tagger
    if ENGINE:
        return
    try:
        import sentiment_tagger as st
        if hasattr(st, 'tag_texts'):
            st.tag_texts(['warm up'])          # sach me chal raha hai ya nahi
            _tagger, ENGINE = st, 'sentiment_tagger'
            return
    except Exception:
        pass
    try:
        from textblob import TextBlob
        TextBlob('warm up').sentiment.polarity
        _tagger, ENGINE = TextBlob, 'textblob'
        return
    except Exception:
        pass
    ENGINE = 'wordlist'


POS = ['good', 'great', 'amazing', 'excellent', 'win', 'success', 'happy', 'love',
       'best', 'positive', 'growth', 'support', 'congratulations', 'proud', 'strong',
       'improve', 'vikas', 'samman', 'jeet']
NEG = ['bad', 'worst', 'fail', 'failure', 'crisis', 'angry', 'sad', 'hate', 'negative',
       'loss', 'corrupt', 'scandal', 'attack', 'threat', 'weak', 'crash', 'virodh',
       'bhrashtachar']


def _wordlist(text):
    import re
    w = [x for x in re.sub(r'[^a-z\s]', ' ', str(text).lower()).split() if x]
    if not w:
        return 'Neutral', 0.0
    p = sum(1 for x in w if x in POS)
    n = sum(1 for x in w if x in NEG)
    sc = (p - n) / float(len(w))
    lab = 'Positive' if sc > 0.02 else ('Negative' if sc < -0.02 else 'Neutral')
    return lab, round(sc, 4)


def tag_one(text):
    """Ek text ka (label, score). Kuch bhi ho jaaye, exception bahar nahi jaata --
       sentiment ki wajah se poora scrape rukna nahi chahiye."""
    if text is None or str(text).strip() == '':
        return 'Neutral', 0.0
    try:
        if ENGINE == 'sentiment_tagger':
            r = _tagger.tag_texts([text])[0]
            return str(r.get('label', 'Neutral')), round(float(r.get('confidence', 0.0)), 4)
        if ENGINE == 'textblob':
            sc = _tagger(str(text)).sentiment.polarity
            lab = 'Positive' if sc > 0.05 else ('Negative' if sc < -0.05 else 'Neutral')
            return lab, round(float(sc), 4)
    except Exception:
        pass
    return _wordlist(text)


def main():
    _load()
    if '--engine' in sys.argv:            # sirf jaanch: kaunsa engine hai
        import platform
        why = ''
        if ENGINE != 'sentiment_tagger':
            try:
                import sentiment_tagger            # noqa
                why = 'import to ho gaya par tag_texts() nahi chala'
            except Exception as e:
                why = '%s: %s' % (type(e).__name__, str(e)[:160])
        print(json.dumps({
            'engine': ENGINE, 'labels': labels(),
            'trained': ENGINE == 'sentiment_tagger',
            'python': sys.executable,                 # ISI me install karna hai
            'version': platform.python_version(),
            'why': why,
        }))
        return
    try:
        req = json.loads(sys.stdin.read() or '{}')
    except Exception as e:
        print(json.dumps({'engine': ENGINE, 'error': 'bad json: %s' % e, 'results': []}))
        return
    texts = req.get('texts') or []
    out = []
    for t in texts:
        lab, sc = tag_one(t)
        out.append({'label': lab, 'score': sc})
    sys.stdout.write(json.dumps({'engine': ENGINE, 'results': out,
                                 'trained': ENGINE == 'sentiment_tagger'}))


if __name__ == '__main__':
    main()
