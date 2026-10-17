# -*- coding: utf-8 -*-
"""
smart_import.py  --  kisi bhi column-layout wali Excel/CSV ko dashboard ke
canonical master schema me normalize karta hai (alias-based).
Chahe header 'State' ho ya 'State Name', 'Level'/'Levels'/'Designation'/'Category' —
sab apne aap sahi jagah map ho jaayenge.
"""
import re
import pandas as pd

# canonical master column  ->  possible header names (kisi bhi case/spacing me)
ALIASES = {
    'Handle':         ['handle', 'username', 'user name', 'screen name', 'screenname',
                       'twitter handle', 'twitter_handle', 'twitterhandle', 'handle name',
                       'twitter id', 'twitter username', 'twitter account', 'twitter user',
                       'account', 'account handle', 'profile', 'profile handle', 'user',
                       'user id', 'userid', 'x handle', 'screen_name', 'user_name'],
    'Tweet URL':      ['tweet url', 'tweeturl', 'url', 'link', 'tweet link'],
    'Tweet Date':     ['tweet date', 'tweet date (ist)', 'tweet date ist', 'date', 'created at', 'created'],
    'Tweet Text':     ['tweet text', 'text', 'tweet', 'content'],
    'Followers':      ['followers', 'follower', 'followers count', 'total followers', 'follower count', 'no of followers'],
    'Followings':     ['followings', 'following', 'follows', 'friends', 'total followings', 'following count', 'no of following'],
    'Total Likes':    ['total likes', 'likes', 'favorites', 'favourites', 'like count', 'total like', 'total favourites', 'fav', 'favs'],
    'Total Retweets': ['total retweets', 'retweets', 'reposts', 'rt', 'retweet count', 'total retweet', 'total rt', 'repost count'],
    'Total Views':    ['total views', 'views', 'impressions', 'view count', 'total view', 'total impressions', 'total tweet views', 'tweet views'],
    'Sentiment':      ['sentiment', 'sentiment label'],
    'Tweet ID':       ['tweet id', 'tweetid', 'status id', 'statusid'],
    'Date of Joining':['date of joining', 'joining date', 'joined', 'account created', 'doj',
                       'created date', 'account created at', 'join date', 'date joined'],
    'Total Posts':    ['total posts', 'posts', 'statuses count', 'post count', 'total post',
                       'total tweets', 'total tweet', 'tweet count', 'no of tweets'],
    'Total Comments': ['total comments', 'comments', 'replies', 'reply count', 'comment count',
                       'total comment', 'total replies', 'total reply'],
    'Total Bookmark Tweets Times': ['total bookmark tweets times', 'total bookmarks', 'bookmarks',
                       'bookmark count', 'total bookmark', 'bookmark', 'total bookmarked'],
    'Sentiment Score':['sentiment score', 'sentimentscore', 'score', 'sentiment value', 'sent score'],
    'State':          ['state', 'state name'],
    'Designation':    ['designation', 'level', 'levels', 'post', 'position'],
    'Candidate Name': ['candidate name', 'name', 'leader name', 'candidate'],
    'Party':          ['party', 'political party'],
    # NOTE: yahan 'ac/pc no' / 'ac no' MAT daalna -- warna code (AC_80) naam ki jagah
    # aa jaata hai. Woh sirf 'AC/PC No' column me jaana chahiye.
    'AC Name':        ['ac name', 'acname', 'assembly', 'assembly constituency', 'vidhan sabha'],
    'PC Name':        ['pc name', 'constituency', 'pc'],
    'Locations':      ['locations', 'location', 'district', 'area'],
    'AC/PC No':       ['ac/pc no', 'ac/pc', 'ac no', 'pc no', 'acpc no', 'seat no', 'ac/pc number'],
    'Category':       ['category', 'categories', 'type', 'handle type'],
    'Status':         ['status', 'active status', 'account status'],
}
# agar Designation na mile to Category se le lo (user: Category == Level)
DESIG_FALLBACK = ['category']

REQUIRED = ['Handle', 'Tweet URL', 'Tweet Text', 'Tweet Date', 'Party']


def _norm(s):
    """header normalize: extra space/newline/nbsp hata, lowercase."""
    x = str(s).replace(' ', ' ').replace('﻿', '')
    return re.sub(r'\s+', ' ', x.strip().lower())


def _squeeze(s):
    """aggressive: sirf letters+digits (space, _, -, ., /, () sab hata) -> 'Total  Tweet_Views' == 'totaltweetviews'"""
    return re.sub(r'[^a-z0-9]', '', _norm(s))


_URL_H = re.compile(r'(?:twitter|x)\.com/([A-Za-z0-9_]{1,20})', re.I)
_SKIP_H = {'i', 'home', 'search', 'hashtag', 'intent', 'share', 'status'}


def _handle_from_url(u):
    m = _URL_H.search(str(u))
    if not m:
        return ''
    h = m.group(1)
    return '' if h.lower() in _SKIP_H else h


# state ke naam ki spelling-galtiyan (warna ek state do jagah bat jaata hai)
_STATE_FIX = {
    'up': 'Uttar Pradesh', 'uttar pradesh': 'Uttar Pradesh', 'uttarpradesh': 'Uttar Pradesh',
    'u.p.': 'Uttar Pradesh', 'u p': 'Uttar Pradesh', 'uttar-pradesh': 'Uttar Pradesh',
    'odisa': 'Odisha', 'orissa': 'Odisha', 'odissa': 'Odisha', 'odisha': 'Odisha',
    'uttrakhand': 'Uttarakhand', 'uttaranchal': 'Uttarakhand', 'uttarakhand': 'Uttarakhand',
    'chattisgarh': 'Chhattisgarh', 'chhatisgarh': 'Chhattisgarh', 'chhattisgarh': 'Chhattisgarh',
    'tamilnadu': 'Tamil Nadu', 'tamil nadu': 'Tamil Nadu',
    'madhyapradesh': 'Madhya Pradesh', 'madhya pradesh': 'Madhya Pradesh',
    'andhrapradesh': 'Andhra Pradesh', 'andhra pradesh': 'Andhra Pradesh',
    'jammu & kashmir': 'Jammu and Kashmir', 'j&k': 'Jammu and Kashmir',
    'jammu and kashmir': 'Jammu and Kashmir', 'delhi': 'Delhi', 'new delhi': 'Delhi',
    'west bengal': 'West Bengal', 'westbengal': 'West Bengal',
    'himachal pradesh': 'Himachal Pradesh', 'himachal': 'Himachal Pradesh',
    'pondicherry': 'Puducherry', 'puducherry': 'Puducherry',
}


def _norm_state(s):
    x = _norm(s)
    return _STATE_FIX.get(x, str(s).strip())


def _norm_level(s):
    x = _norm(s).replace('.', '').replace('-', ' ')
    x = re.sub(r'\s+', ' ', x).strip()
    if x in ('ls_mp', 'ls mp', 'lok sabha mp', 'lok sabha', 'mp lok sabha', 'lsmp'):
        return 'LS_MP'
    if x in ('rs_mp', 'rs mp', 'rajya sabha mp', 'rajya sabha', 'rsmp'):
        return 'RS_MP'
    if x in ('mla', 'm l a'):
        return 'MLA'
    if x in ('mlc', 'm l c'):
        return 'MLC'
    if x in ('chief minister', 'cm', 'c m'):
        return 'Chief Minister'
    if x in ('deputy chief minister', 'dy cm', 'dycm', 'deputy cm', 'dy chief minister', 'deputy c m'):
        return 'Deputy Chief Minister'
    if x in ('mp', 'member of parliament'):
        return 'LS_MP'   # plain "MP" -> Lok Sabha (adjust if needed)
    return str(s).strip()


def _read_any(path, log=print):
    """
    Naam .xlsx ho sakta hai par andar kuch aur ho (HTML table / tab-text).
    Isliye asli bytes dekh kar format pehchante hain, phir sahi tareeke se padhte hain.
    """
    with open(path, 'rb') as fh:
        head = fh.read(1024)

    # asli xlsx/xlsm (zip -> 'PK')
    if head[:4] == b'PK\x03\x04':
        return pd.read_excel(path, dtype=str, engine='openpyxl')

    # purana .xls (OLE2)
    if head[:4] == b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1':
        try:
            return pd.read_excel(path, dtype=str, engine='xlrd')
        except Exception as e:
            log('  (xls engine fail: %s)' % e)

    # text-based (HTML ya delimited) - jo .xlsx naam ke bhes me hai
    txt = head.decode('utf-8', 'ignore').lstrip().lower()
    if txt.startswith('<') or ('<table' in txt) or ('<html' in txt) or ('<tr' in txt):
        for enc in ('utf-8-sig', 'utf-8', 'utf-16', 'latin-1'):
            try:
                dfs = pd.read_html(path, encoding=enc)   # needs lxml/html5lib (anaconda me hota hai)
                if dfs:
                    log('  (format: HTML-table)')
                    return dfs[0].astype(str)
            except Exception:
                continue
    # delimited text: separator khud sniff karo
    for sep, nm in [(None, 'auto'), ('\t', 'tab'), (',', 'comma'), (';', 'semicolon'), ('|', 'pipe')]:
        for enc in ('utf-8-sig', 'utf-8', 'utf-16', 'latin-1'):
            try:
                df = pd.read_csv(path, dtype=str, sep=sep, engine='python',
                                 encoding=enc, on_bad_lines='skip')
                if df.shape[1] > 1:
                    log('  (format: text/%s)' % nm)
                    return df
            except Exception:
                continue
    raise ValueError('format samajh nahi aaya. Pehle 60 bytes: %r' % head[:60])


def smart_read(path, log=print):
    """returns (DataFrame in master schema, list_of_missing_required_cols)"""
    df = _read_any(path, log)
    df.columns = [str(c).strip() for c in df.columns]
    df = df.fillna('')
    cols, sq = {}, {}
    for c in df.columns:
        cols.setdefault(_norm(c), c)
        sq.setdefault(_squeeze(c), c)          # space/underscore/dash-proof lookup

    out = pd.DataFrame(index=df.index)   # index set -> scalar '' sab rows me sahi bharega
    found, missing = {}, []
    for canon, aliases in ALIASES.items():
        # 1) normal match  2) squeezed match ("Total  Tweet_Views" bhi mil jaaye)
        src = next((cols[a] for a in aliases if a in cols), None)
        if src is None:
            src = next((sq[_squeeze(a)] for a in aliases if _squeeze(a) in sq), None)
        if src is not None:
            out[canon] = df[src].astype(str)
            found[canon] = src
        else:
            out[canon] = ''
            missing.append(canon)

    # Designation fallback -> Category
    if ('Designation' in missing) or (out['Designation'].astype(str).str.strip() == '').all():
        src = next((cols[a] for a in DESIG_FALLBACK if a in cols), None)
        if src is not None:
            out['Designation'] = df[src].astype(str)
            found['Designation'] = src + ' (via Category)'
            if 'Designation' in missing:
                missing.remove('Designation')

    # normalize state + level
    out['State'] = out['State'].map(_norm_state)
    out['Designation'] = out['Designation'].map(_norm_level)

    # Handle: BOM/zero-width/space/@ sab hatao (warna 'ncbn' aur '﻿ncbn' do handle ban jaate hain)
    out['Handle'] = (out['Handle'].astype(str)
                     .str.replace('[﻿​‌‍\xa0]', '', regex=True)
                     .str.strip().str.lstrip('@').str.strip())
    blank = out['Handle'].str.strip() == ''
    if blank.any():
        out.loc[blank, 'Handle'] = out.loc[blank, 'Tweet URL'].map(_handle_from_url)
        n = int((out['Handle'].str.strip() != '').sum() - (~blank).sum())
        if n > 0:
            log('  Handle column nahi tha -> %d handles Tweet URL se nikaale' % n)

    # master CSV jaisa column order
    MASTER_ORDER = ['Handle', 'Tweet URL', 'Tweet ID', 'Tweet Date', 'Tweet Text', 'Followers',
                    'Followings', 'Date of Joining', 'Total Posts', 'Total Comments',
                    'Total Likes', 'Total Retweets', 'Total Views', 'Total Bookmark Tweets Times',
                    'Sentiment', 'Sentiment Score', 'State', 'Locations', 'AC/PC No',
                    'AC Name', 'PC Name', 'Designation', 'Candidate Name', 'Category',
                    'Party', 'Status']
    out = out[MASTER_ORDER]

    log('  mapped: ' + ', '.join(f'{k} <- {v}' for k, v in found.items()))
    if missing:
        log('  (header nahi mila: ' + ', '.join(missing) + ')')

    # required "lacking" tabhi jab poora column khaali ho (fallback ke baad)
    lack = [r for r in REQUIRED if (out[r].astype(str).str.strip() == '').all()]
    if lack:
        log('  RAW columns file me the: ' + ' | '.join(map(str, df.columns)))
    return out, lack
