# -*- coding: utf-8 -*-
"""
Facebook Scraper  --  manual login + Playwright

FIX LIST (purane code me kya galat tha):
 1. "8h" / "1d" / "3w" parse hi nahi hote the. Code sirf poore shabd dhoondhta tha
    ("hour", "day"). Chhote roop dateutil ke fuzzy parser me chale jaate the aur
    "1d" ka matlab "1 August" nikal aata tha -- date bilkul galat.
 2. Post text ke liye fallback 'div[dir="auto"]' tha, jo aksar AUTHOR KA NAAM
    utha leta tha. Har post ki key ek jaisi ban jaati thi -> dedup sab kha jaata
    -> "0 new" -> 3 scroll me hi ruk jaata. YAHI "pehle hi ruk jaata hai" ki wajah.
 3. MAX_SCROLLS 40 tha. Aaj se May tak jaane ke liye 40 scroll kaafi hi nahi.
 4. Likes/comments "1.2K" ko int() nahi kar pata tha -> 1 aa jaata tha.
 5. "See more" har post par click hota tha. Ab sirf us post par jo date range me hai.
 6. Har post ke aakhir me khaali "except: continue" tha -- asli error chhup jaate the.

Chalao:  python facebook_scraper_fixed.py
"""
import csv
import os
import random
import re
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import urlparse

import pandas as pd
from playwright.sync_api import sync_playwright
from textblob import TextBlob

try:
    from dateutil import parser as dateutil_parser
except ImportError:
    sys.exit("Pehle ye chalao:  pip install python-dateutil")

# =============================================================================
# CONFIGURATION
# =============================================================================

INPUT_FILE  = r"C:\Users\arpan\OneDrive\Documents\Book1.xlsx"
LINK_COLUMN = "Facebook Link"

START_DATE = "2026-08-19"
END_DATE   = "2026-08-21"

OUTPUT_FILE = (r"C:\Users\arpan\OneDrive\Documents\Facebook_Posts_%s_to_%s.csv"
               % (START_DATE, END_DATE))
# Progress file DATE RANGE ke naam par hai.
# Pehle sirf aaj ki taarikh par thi -- range badalne par bhi purana progress
# lag jaata tha aur "Already done: 7 / Remaining: 0" aa jaata tha.
# Ab range badloge to apne aap naya progress shuru hoga.
PROGRESS_FILE = OUTPUT_FILE.replace(".csv", "_progress.txt")

# Purane code me 40 tha -- 3 mahine peeche jaane ke liye bahut kam.
MAX_SCROLLS_PER_PROFILE = 400
# Ek profile par itne minute se zyada mat lagao (warna ek hi profile par atak jaoge)
MAX_MINUTES_PER_PROFILE = 12
# Range khatam hone ke baad kitni purani post dekh kar rukna hai.
# Facebook me date par jump nahi kar sakte -- feed naye se purane chalti hai.
# Isliye "range khatam" tabhi pata chalta hai jab range se purani post dikhe.
# 1 rakhoge to PINNED post (jo mahino purani ho sakti hai) turant rok degi,
# isliye 3 -- ek pinned post se dhoka na ho.
STOP_AFTER_OLDER = 3
SCROLL_PAUSE = (2.0, 3.5)
DELAY_BETWEEN_PROFILES = (9, 15)

DEBUG = True          # True -> kaunsi post kis wajah se chhoot rahi hai wo dikhega

# =============================================================================
# HELPERS
# =============================================================================

def log(*a):
    print(*a, flush=True)


def dbg(*a):
    if DEBUG:
        print(*a, flush=True)


def get_sentiment(text):
    try:
        score = TextBlob(str(text)).sentiment.polarity
        if score > 0.05:
            return "Positive", round(score, 4)
        if score < -0.05:
            return "Negative", round(score, 4)
        return "Neutral", round(score, 4)
    except Exception:
        return "Neutral", 0.0


def clean_facebook_url(raw):
    if not raw or str(raw).strip() in ("", "-", "nan", "None"):
        return None
    raw = str(raw).strip().rstrip("/")
    raw = raw.split("?")[0].split("#")[0]
    if "facebook.com" in raw or "fb.com" in raw:
        path = urlparse(raw).path.strip("/")
        path = re.sub(r"/(posts|about|photos|videos|reels|events|followers|following).*$",
                      "", path, flags=re.I)
        return path or None
    return raw.lstrip("@")


# ---------------------------------------------------------------------------
# FIX 4:  "1.2K" / "3.4M" / "1,234" / "2.5 lakh" -> asli number
# purana code int(re.findall(r'[\d,]+')[0]) karta tha -> "1.2k" se 1 nikalta tha
# ---------------------------------------------------------------------------
_MULT = {'k': 1_000, 'm': 1_000_000, 'b': 1_000_000_000,
         'l': 100_000, 'lakh': 100_000, 'cr': 10_000_000, 'crore': 10_000_000}


def parse_count(txt):
    if not txt:
        return 0
    t = str(txt).strip().lower().replace(",", "").replace("\u00a0", " ")
    m = re.search(r'(\d+(?:\.\d+)?)\s*(crore|lakh|cr|[kmbl])?\b', t)
    if not m:
        return 0
    try:
        n = float(m.group(1))
    except ValueError:
        return 0
    suf = (m.group(2) or '').strip()
    return int(round(n * _MULT.get(suf, 1)))


# ---------------------------------------------------------------------------
# FIX 1:  date parsing
# Facebook chhota roop dikhata hai: 8h, 1d, 3w, 5m, 2y  ya  "5 May", "5 May 2025"
# ---------------------------------------------------------------------------
_REL = re.compile(r'^\s*(\d+)\s*([smhdwy])\b', re.I)
_MONTHS = ('jan', 'feb', 'mar', 'apr', 'may', 'jun',
           'jul', 'aug', 'sep', 'oct', 'nov', 'dec')


def parse_fb_date(date_str, now=None):
    """FB ka date text -> datetime (naive). Samajh na aaye to None."""
    if not date_str:
        return None
    now = now or datetime.now()
    s = str(date_str).strip()
    low = s.lower()

    if any(w in low for w in ("just now", "a few seconds", "seconds ago")):
        return now

    # -- chhote roop: 8h, 1d, 3w, 5m, 2y  (YEHI purane code me chhoot gaya tha) --
    m = _REL.match(low)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if unit == 's':
            return now - timedelta(seconds=n)
        if unit == 'm':
            return now - timedelta(minutes=n)
        if unit == 'h':
            return now - timedelta(hours=n)
        if unit == 'd':
            return now - timedelta(days=n)
        if unit == 'w':
            return now - timedelta(weeks=n)
        if unit == 'y':
            return now - timedelta(days=365 * n)

    # -- poore shabd --
    m = re.search(r'(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago', low)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        mult = {'second': timedelta(seconds=1), 'minute': timedelta(minutes=1),
                'hour': timedelta(hours=1), 'day': timedelta(days=1),
                'week': timedelta(weeks=1), 'month': timedelta(days=30),
                'year': timedelta(days=365)}[unit]
        return now - mult * n
    if "yesterday" in low:
        return (now - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
    if "today" in low:
        return now

    # -- "5 May", "May 5", "5 May 2025", "May 5, 2025 at 3:14 PM" --
    # Fuzzy tabhi chalao jab mahine ka naam sach me maujood ho, warna
    # "Public" / "· 3" jaisi junk bhi date ban jaati hai.
    if not any(mn in low for mn in _MONTHS):
        return None
    try:
        d = dateutil_parser.parse(s, fuzzy=True, default=datetime(now.year, 1, 1))
    except Exception:
        return None
    if d.tzinfo is not None:
        d = d.replace(tzinfo=None)          # naive vs aware compare crash na ho
    # saal nahi likha tha aur date future me chali gayi -> pichhla saal
    if not re.search(r'\b(19|20)\d{2}\b', s) and d > now + timedelta(days=1):
        d = d.replace(year=d.year - 1)
    return d


# =============================================================================
# EK ARTICLE SE DATA
# =============================================================================

# Date aksar link me NAHI hoti -- plain <div> me hoti hai (user ke XPath se pata chala:
# .../div[13]/div/div/div[2]/div  = post ka header).
# Isliye post ke UPRI hisse ke chhote text tukde uthate hain aur jo date jaisa lage
# wahi lete hain. Upri hissa isliye taaki post ke TEXT me likhi koi date
# (jaise "15 August ko rally hai") galti se na uth jaaye.
_DATE_JS = r"""
(node) => {
  const box = node.getBoundingClientRect();
  const out = [];
  node.querySelectorAll('span, div, a, abbr').forEach(e => {
    if (e.children.length) return;
    const t = (e.textContent || '').trim();
    if (!t || t.length > 32) return;
    const r = e.getBoundingClientRect();
    if (!r.height) return;
    const rel = box.height ? (r.top - box.top) / box.height : 0;
    out.push({t: t, rel: rel});
  });
  out.sort((a, b) => a.rel - b.rel);
  // pehle upri hissa (header) -- wahan asli timestamp hota hai.
  // na mile to poora container (kuch layout me date neeche hoti hai).
  const top = out.filter(o => o.rel <= 0.45).map(o => o.t);
  const rest = out.filter(o => o.rel > 0.45).map(o => o.t);
  return top.slice(0, 16).concat(rest.slice(0, 16));
}
"""


def date_from_header(el):
    try:
        for t in (el.evaluate(_DATE_JS) or []):
            if parse_fb_date(t):
                return t
    except Exception as e:
        dbg("      date scan: %s" % e)
    return ""


def article_date_text(el):
    """Post ka timestamp text. Modern FB me ye permalink <a> ke andar hota hai."""
    for sel in ('a[href*="/posts/"]', 'a[href*="/permalink/"]',
                'a[href*="story_fbid"]', 'a[href*="pfbid"]', 'a[href*="/videos/"]'):
        for a in el.query_selector_all(sel):
            lbl = a.get_attribute("aria-label") or ""
            if lbl and parse_fb_date(lbl):
                return lbl
            try:
                t = (a.inner_text() or "").strip()
            except Exception:
                t = ""
            if t and len(t) <= 30 and parse_fb_date(t):
                return t
    ab = el.query_selector("abbr[aria-label]")           # purana FB
    if ab:
        lbl = ab.get_attribute("aria-label") or ""
        if parse_fb_date(lbl):
            return lbl
    return date_from_header(el)              # link me nahi mili -> header se


def article_permalink(el):
    for sel in ('a[href*="/posts/"]', 'a[href*="story_fbid"]',
                'a[href*="pfbid"]', 'a[href*="/permalink/"]', 'a[href*="/videos/"]'):
        a = el.query_selector(sel)
        if a:
            u = a.get_attribute("href") or ""
            if u:
                if not u.startswith("http"):
                    u = "https://www.facebook.com" + u
                return u.split("?")[0]
    return ""


def expand_see_more(el):
    """FIX 5: 'See more' sirf ISI post par, aur tabhi jab post range me ho."""
    for sel in ('div[role="button"]:has-text("See more")',
                'div[role="button"]:has-text("See More")',
                'span:has-text("See more")'):
        try:
            btn = el.query_selector(sel)
            if btn:
                btn.click(timeout=2000)
                time.sleep(0.4)
                return True
        except Exception:
            continue
    return False


def article_text(el):
    """Post ka asli message. FIX 2: 'div[dir=auto]' wala andha fallback hata diya --
    wo author ka naam utha leta tha aur har post ki key ek jaisi ban jaati thi."""
    for sel in ('div[data-ad-preview="message"]',
                'div[data-ad-comet-preview="message"]',
                'div[data-testid="post_message"]'):
        t_el = el.query_selector(sel)
        if t_el:
            try:
                t = (t_el.inner_text() or "").strip()
                if t:
                    return t
            except Exception:
                pass
    # fallback: sabse LAMBA dir=auto block (naam chhota hota hai, post lamba)
    best = ""
    for t_el in el.query_selector_all('div[dir="auto"]'):
        try:
            t = (t_el.inner_text() or "").strip()
        except Exception:
            continue
        if len(t) > len(best):
            best = t
    return best


# ---- engagement ----
# ASLI DIKKAT: Playwright ka inner_text() CHHUPE HUE text ko chhod deta hai,
# aur Facebook counts ko screen-reader wale hidden span me rakhta hai
# ("1.2K reactions", "345 comments"). Isliye text_content() chahiye -- wo
# saara text deta hai, chhupa hua bhi.
_NUM = r'([\d][\d,]*(?:\.\d+)?\s*(?:crore|lakh|cr|[kmbl])?)'
_ENG_PATS = {
    'likes':    [r'all reactions:?\s*' + _NUM,
                 _NUM + r'\s*people reacted',
                 _NUM + r'\s*reactions?\b',
                 r'like:?\s*' + _NUM + r'\s*(?:people|person)'],
    'comments': [_NUM + r'\s*comments?\b'],
    'shares':   [_NUM + r'\s*shares?\b'],
    'views':    [_NUM + r'\s*(?:views?|plays?)\b'],
}


# Leaf text ko " | " se jodo -- warna do alag numbers chipak kar
# ek bada galat number ban jaate hain (427 + 419 = "427419").
_LEAF_TEXT_JS = r"""
(node) => {
  const out = [];
  node.querySelectorAll('span, div, a, abbr').forEach(e => {
    if (e.children.length) return;
    const t = (e.textContent || '').trim();
    if (t) out.push(t);
  });
  return out.join(' | ');
}
"""


def _counts_from_text(t):
    t = ' '.join(str(t or '').split())
    out = {}
    for k, pats in _ENG_PATS.items():
        best = 0
        for p in pats:
            for m in re.finditer(p, t, re.I):
                best = max(best, parse_count(m.group(1)))
        out[k] = best
    return out


# ---------------------------------------------------------------------------
# ASLI POST KA CONTAINER
# Facebook har COMMENT ko bhi role="article" deta hai, aur post ka footer
# (likes/comments/share) + permalink aksar us chhote article box ke BAHAR
# rehta hai. Isi wajah se post link, counts aur poora text -- teeno khaali
# aa rahe the. Yahan hum:
#   1. nested article (yani comment) chhod dete hain
#   2. article se UPAR chadh kar wo container dhoondhte hain jisme permalink
#      aur engagement dono aa jaayein
# ---------------------------------------------------------------------------
_ROOT_JS = r"""
(node) => {
  // comment hai? (kisi dusre article ke andar)
  let p = node.parentElement;
  while (p) {
    if (p.getAttribute && p.getAttribute('role') === 'article') return null;
    p = p.parentElement;
  }
  const hasLink = (n) => !!n.querySelector(
    'a[href*="/posts/"],a[href*="story_fbid"],a[href*="pfbid"],a[href*="/permalink/"],a[href*="/videos/"]');
  const hasFooter = (n) => {
    const t = (n.innerText || '').toLowerCase();
    return t.includes('comment') || t.includes('share') || t.includes('like');
  };
  let best = node, cur = node, up = 0;
  while (cur && up < 6) {
    if (hasLink(cur) && hasFooter(cur)) { best = cur; break; }
    if (hasLink(cur) && !hasLink(best)) best = cur;
    cur = cur.parentElement; up++;
    // bahut bada ho gaya to ruk jao (poori feed mat pakad lena)
    if (cur && cur.getBoundingClientRect().height > 3000) break;
  }
  return best;
}
"""


def post_root(el):
    """article -> asli post container. Comment ho to None."""
    try:
        h = el.evaluate_handle(_ROOT_JS)
        e = h.as_element()
        return e if e else None
    except Exception as ex:
        dbg("      root scan: %s" % ex)
        return el

# ---------------------------------------------------------------------------
# Bare-number engagement (jaisa screenshot me hai:  [thumb] 124  [bubble] 5  [arrow] 8)
# Yahan "comments"/"shares" shabd hote hi nahi, sirf number hota hai -- isliye
# text regex bekaar hai. Icon aur number EK HI LINE me hote hain, to number ko
# uske SABSE PAAS wale Like/Comment/Share button se jod dete hain.
# (XPath use nahi kar sakte -- FB ka mount_0_0_+f har reload par badal jaata hai.)
# ---------------------------------------------------------------------------
_ENG_JS = r"""
(node) => {
  const R = {likes:0, comments:0, shares:0, views:0};
  const numRe = /^\s*([\d][\d,]*(?:\.\d+)?)\s*([KkMmBb])?\s*$/;
  const toN = (v, suf) => {
    let n = parseFloat(String(v).replace(/,/g, ''));
    if (!isFinite(n)) return 0;
    const mm = {k:1e3, m:1e6, b:1e9};
    if (suf) n *= (mm[suf.toLowerCase()] || 1);
    return Math.round(n);
  };

  const box = node.getBoundingClientRect();

  // 1) counts -- leaf element jinka poora text bas ek number hai
  const counts = [];
  node.querySelectorAll('span, div').forEach(e => {
    if (e.children.length) return;
    const m = ((e.textContent || '').trim()).match(numRe);
    if (!m) return;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return;
    counts.push({v: toN(m[1], m[2]), x: r.left + r.width/2, y: r.top + r.height/2});
  });

  // 2) Like / Comment / Share ke button.
  //    Share ka aria-label aksar "Send this to friends or post it on your
  //    Timeline" hota hai -- usme 'share' shabd hota hi nahi, isliye extra patterns.
  const acts = [];
  node.querySelectorAll('[aria-label], [role="button"], a').forEach(e => {
    const l = (((e.getAttribute('aria-label') || '') + ' ' +
                (e.textContent || '')).toLowerCase()).slice(0, 60);
    let k = null;
    if (/\breact|\blike\b/.test(l)) k = 'likes';
    else if (/\bcomment/.test(l)) k = 'comments';
    else if (/\bshare|send this|your timeline/.test(l)) k = 'shares';
    if (!k) return;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return;
    acts.push({k, x: r.left + r.width/2, y: r.top + r.height/2});
  });

  // 3) number ko usi line ke sabse paas wale button se jodo
  counts.forEach(c => {
    let best = null, bd = 1e9;
    acts.forEach(a => {
      if (Math.abs(a.y - c.y) > 26) return;
      const d = Math.abs(a.x - c.x);
      if (d < bd) { bd = d; best = a; }
    });
    if (best && bd < 280) R[best.k] = Math.max(R[best.k], c.v);
  });

  // 4) label na mile to POSITION se: footer wali line ke numbers
  //    baayen se daayen = likes, comments, shares
  if (!R.likes || !R.comments || !R.shares) {
    const lines = {};
    counts.forEach(c => {
      const key = Math.round(c.y / 12);
      (lines[key] = lines[key] || []).push(c);
    });
    let bestLine = null;
    Object.keys(lines).forEach(k => {
      const ln = lines[k];
      if (ln.length < 2) return;
      const y = ln[0].y;
      if (box.height && (y - box.top) < box.height * 0.35) return;  // footer neeche hota hai
      if (!bestLine || ln.length > bestLine.length) bestLine = ln;
    });
    if (bestLine) {
      bestLine.sort((a, b) => a.x - b.x);
      const order = ['likes', 'comments', 'shares'];
      bestLine.slice(0, 3).forEach((c, idx) => {
        if (!R[order[idx]]) R[order[idx]] = c.v;
      });
    }
  }
  return R;
}
"""


def engagement_by_position(el):
    try:
        r = el.evaluate(_ENG_JS)
        return (int(r.get('likes') or 0), int(r.get('comments') or 0),
                int(r.get('shares') or 0), int(r.get('views') or 0))
    except Exception as e:
        dbg("      position scan: %s" % e)
        return 0, 0, 0, 0

def article_engagement(el):
    # SABSE PEHLE geometry wala tarika -- FB aajkal sirf number dikhata hai
    likes, comments, shares, views = engagement_by_position(el)

    # 1) aria-label -- yahan poora number likha hota hai
    try:
        for a in el.query_selector_all('[aria-label]'):
            lbl = (a.get_attribute("aria-label") or "").strip()
            if not lbl or len(lbl) > 90:
                continue
            low = lbl.lower()
            n = parse_count(lbl)
            if not n:
                continue
            if "comment" in low:
                comments = max(comments, n)
            elif "share" in low:
                shares = max(shares, n)
            elif "view" in low or "play" in low:
                views = max(views, n)
            elif "reaction" in low or "reacted" in low or "like" in low:
                likes = max(likes, n)
    except Exception as e:
        dbg("      aria-label scan: %s" % e)

    # 2) text se -- SIRF un metric ke liye jo abhi tak 0 hain.
    #
    # BUG THA: text_content() alag-alag element ka text BINA SPACE jod deta hai.
    # "427" (reactions) aur "419" chipak kar "427419" ban jaate the aur
    # "views" me chala jaata tha. CSV me likes 427 / views 427419 isi wajah se aaya.
    # Isliye ab leaf text ko " | " se jodte hain, aur position wala jawab
    # mil chuka ho to text par bharosa hi nahi karte.
    if not (likes and comments and shares and views):
        try:
            raw = el.evaluate(_LEAF_TEXT_JS) or ""
        except Exception:
            raw = ""
        c = _counts_from_text(raw)
        if not likes:
            likes = c['likes']
        if not comments:
            comments = c['comments']
        if not shares:
            shares = c['shares']
        if not views:
            views = c['views']

    return likes, comments, shares, views


# ---------------------------------------------------------------------------
# POST KAISE DHOONDHE  (debug dump se pata chala)
#
# Modern Facebook profile page par POST ko role="article" milta hi NAHI.
# role="article" sirf COMMENTS ko milta hai -- unke link me comment_id= hota hai.
# Aur beech me "Loading..." wale khaali placeholder bhi article bane rehte hain.
# Isliye purana tarika (div[role="article"]) sirf comments aur khaali dabbe
# pakad raha tha -> text adhoora, post link khaali, counts khaali.
#
# Naya tarika: har post ke PERMALINK link se shuru karo (usme comment_id nahi
# hota), phir upar chadh kar wo container dhoondho jisme footer (Like/Comment/
# Share) bhi aa jaaye. Us container ko data-sc-post se mark kar dete hain.
# ---------------------------------------------------------------------------
_MARK_JS = r"""
() => {
  document.querySelectorAll('[data-sc-post]').forEach(e => e.removeAttribute('data-sc-post'));
  const sel = 'a[href*="/posts/"],a[href*="/videos/"],a[href*="/permalink/"],' +
              'a[href*="story_fbid"],a[href*="/photo"],a[href*="pfbid"]';
  const seen = new Set();
  let n = 0;

  // URL saaf karo.
  // BUG THA: photo link "/photo/?fbid=123" hota hai -- asli ID QUERY me hai.
  // Sab kuch '?' par kaat dete the to har photo post ka URL bas "/photo/" bach
  // jaata tha -> CSV me bekaar URL, aur dedup me saare photo post EK maan liye jaate.
  const tidy = (href) => {
    const q = href.indexOf('?') >= 0 ? href.slice(href.indexOf('?') + 1) : '';
    const base = href.split('?')[0].split('#')[0];
    if (/\/photo\b|\/photo\.php/.test(base)) {
      const m = q.match(/(?:^|&)fbid=(\d+)/);
      if (m) return base + '?fbid=' + m[1];
      return '';                      // fbid ke bina photo link bekaar hai
    }
    return base;
  };
  // asli permalink pehle, photo baad me -- taaki container par achha URL lage
  const rank = (h) => (/\/posts\/|\/permalink\/|story_fbid|pfbid/.test(h) ? 0
                     : /\/videos\//.test(h) ? 1 : 2);
  const anchors = [...document.querySelectorAll(sel)]
      .filter(a => {
        const h = a.getAttribute('href') || '';
        return h && !/comment_id=|reply_comment_id=/.test(h);
      })
      .sort((x, y) => rank(x.getAttribute('href')) - rank(y.getAttribute('href')));

  const why = {anchors: anchors.length, no_id: 0, dup: 0, no_footer: 0, marked: 0};
  anchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    const clean = tidy(href);
    if (!clean) { why.no_id++; return; }
    if (seen.has(clean)) { why.dup++; return; }

    // upar chadho jab tak footer (Like/Comment/Share) wala container na mile
    let cur = a, best = null, up = 0;
    while (cur && up < 14) {
      const r = cur.getBoundingClientRect();
      if (r.height > 2600) break;                  // itna bada = poori feed, ruk jao
      if (r.height > 110) {
        const t = (cur.innerText || '').toLowerCase();
        if (t.includes('comment') || t.includes('share') || t.includes('like')) {
          best = cur; break;
        }
      }
      cur = cur.parentElement; up++;
    }
    if (!best) { why.no_footer++; return; }
    if (best.getAttribute('data-sc-post')) return; // ek hi container do baar nahi
    seen.add(clean);
    best.setAttribute('data-sc-post', clean.startsWith('http')
        ? clean : ('https://www.facebook.com' + clean));
    why.marked++;
  });
  return why;
}
"""

# "Loading..." placeholder khatam hone ka intezaar
_LOADING_JS = r"""
() => document.querySelectorAll('[aria-label="Loading..."]').length
"""


def wait_rendered(page, secs=8):
    """FB pehle khaali dabbe dikhata hai (aria-label='Loading...').
    Unke bharne tak ruko, warna 0-char wale article milte hain."""
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if page.evaluate(_LOADING_JS) == 0:
                return True
        except Exception:
            return False
        time.sleep(0.6)
    return False


def find_posts(page):
    """Post containers dhoondho aur unke handle + permalink lauta do."""
    try:
        why = page.evaluate(_MARK_JS) or {}
    except Exception as e:
        dbg("      mark: %s" % e)
        return [], {}
    out = []
    for el in page.query_selector_all('[data-sc-post]'):
        try:
            out.append((el, el.get_attribute('data-sc-post') or ''))
        except Exception:
            continue
    return out, why


# =============================================================================
# SCRAPER
# =============================================================================

def scrape_one_profile(page, url, start_dt, end_dt):
    posts = {}                    # permalink/text-key -> post dict
    seen_keys = set()
    profile = {"page_name": "", "followers": "", "following": ""}

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(random.uniform(4, 6))
    except Exception as e:
        log("    [!] page khul hi nahi payi: %s" % e)
        return [], profile

    # ---------- profile info ----------
    try:
        h1 = page.query_selector("h1")
        if h1:
            profile["page_name"] = (h1.inner_text() or "").strip()
        body = page.inner_text("body")
        m = re.search(r'([\d.,]+\s*[KkMmBb]?)\s*followers?', body, re.I)
        if m:
            profile["followers"] = m.group(1).strip()
        m = re.search(r'([\d.,]+\s*[KkMmBb]?)\s*following', body, re.I)
        if m:
            profile["following"] = m.group(1).strip()
    except Exception as e:
        dbg("    profile info error: %s" % e)

    log("    -> %s | Followers: %s | Following: %s"
        % (profile["page_name"] or "?", profile["followers"] or "-", profile["following"] or "-"))

    t0 = time.time()
    stagnant = 0            # lagataar kitni baar koi NAYA article nahi mila
    consec_older = 0        # lagataar kitni post start_date se purani mili
    last_height = 0
    no_date = 0

    for i in range(MAX_SCROLLS_PER_PROFILE):
        if (time.time() - t0) / 60 > MAX_MINUTES_PER_PROFILE:
            log("    -> %d minute ho gaye, aage badh rahe hain" % MAX_MINUTES_PER_PROFILE)
            break

        wait_rendered(page)                  # khaali "Loading..." dabbe bhar jaane do
        arts, why = find_posts(page)
        new_here = 0
        in_range_here = 0
        oldest = None
        # har scroll par ginti -- post kahan mar rahi hai wo pata chale
        cnt = {'nodate': 0, 'naya': 0, 'purana': 0, 'range': 0, 'notext': 0}
        bad_dates = []       # jo date text samajh nahi aaye
        seen_dates = []      # jo samajh aaye

        for el, link in arts:
            try:
                if not link:
                    link = article_permalink(el)
                dtxt = article_date_text(el)
                pdt = parse_fb_date(dtxt)

                # dedup: permalink se (ab hamesha milta hai)
                key = link or (article_text(el)[:90])
                if not key or key in seen_keys:
                    continue
                seen_keys.add(key)
                new_here += 1

                if pdt is None:
                    no_date += 1
                    cnt['nodate'] += 1
                    if len(bad_dates) < 3:
                        if dtxt:
                            bad_dates.append(repr(dtxt)[:60])
                        else:
                            try:
                                cand = el.evaluate(_DATE_JS) or []
                            except Exception:
                                cand = []
                            try:
                                head = ' '.join((el.inner_text() or '').split())[:90]
                            except Exception:
                                head = ''
                            bad_dates.append('\n        URL : %s\n        text: %s\n        leaf: %s'
                                             % (link[:95] or '(khaali)', head or '(khaali)',
                                                cand[:8] or 'KHAALI'))
                    continue                     # date hi nahi mili -> range bata hi nahi sakte
                if len(seen_dates) < 4:
                    seen_dates.append(pdt.strftime('%d %b'))

                if oldest is None or pdt < oldest:
                    oldest = pdt

                # range se PURANI post -> ginti badhao (feed neeche ja chuki hai)
                if pdt < start_dt:
                    consec_older += 1
                    cnt['purana'] += 1
                    continue
                # range se NAYI post -> abhi range tak pahunche hi nahi, ginti reset
                consec_older = 0
                if pdt >= end_dt:
                    cnt['naya'] += 1
                    continue
                cnt['range'] += 1

                # ---- YAHAN aane ka matlab: post range ke ANDAR hai ----
                # FIX 5: See more ab SIRF yahan click hota hai
                if expand_see_more(el):
                    time.sleep(0.5)              # DOM ko khulne do
                text = article_text(el)
                if not text or len(text) < 5:
                    cnt['notext'] += 1
                    dbg("      [range me thi par TEXT nahi mila] %s" % link[:80])
                    continue

                likes, comments, shares, views = article_engagement(el)
                label, score = get_sentiment(text)
                in_range_here += 1

                posts[key] = {
                    "post_url": link,
                    "post_date": pdt.strftime("%Y-%m-%d %H:%M"),
                    "post_date_raw": dtxt,
                    "post_text": " ".join(text.split())[:4000],
                    "likes": likes, "comments": comments,
                    "shares": shares, "views": views,
                    "sentiment": label, "sentiment_score": score,
                }
            except Exception as e:
                dbg("      post skip: %s" % e)      # FIX 6: chhupao mat
                continue

        log("    scroll %-3d | naye: %-3d | date nahi: %-3d | naye se: %-3d | purane se: %-3d"
            "  | range me: %-3d | text nahi: %-2d | kul: %d"
            % (i + 1, new_here, cnt['nodate'], cnt['naya'], cnt['purana'],
               cnt['range'], cnt['notext'], len(posts)))
        if not arts:
            log("               POST MILI HI NAHI -> link mile: %s | id nahi: %s"
                " | dohra: %s | footer nahi mila: %s"
                % (why.get('anchors', '?'), why.get('no_id', '?'),
                   why.get('dup', '?'), why.get('no_footer', '?')))
        if seen_dates:
            log("               dates mile : %s" % ", ".join(seen_dates))
        if bad_dates:
            log("               DATE SAMAJH NAHI AAYI: %s" % " ; ".join(bad_dates))

        # ---- rukne ke niyam ----
        # Range se purani post lagataar dikhne lagi = feed range se aage nikal gayi.
        if consec_older >= STOP_AFTER_OLDER:
            log("    -> %d post lagataar %s se purani -- range khatam, ruk rahe hain"
                % (consec_older, START_DATE))
            break

        stagnant = stagnant + 1 if new_here == 0 else 0
        if stagnant >= 6:                       # purane code me 3 tha, bahut jaldi
            log("    -> 6 baar koi naya post nahi mila, bas")
            break

        page.mouse.wheel(0, 2500)
        time.sleep(random.uniform(*SCROLL_PAUSE))
        try:
            h = page.evaluate("document.body.scrollHeight")
            if h == last_height:
                page.keyboard.press("End")
                time.sleep(1.5)
            last_height = h
        except Exception:
            pass

    if no_date:
        dbg("    (%d article ki date nahi padh paye)" % no_date)
    out = list(posts.values())
    out.sort(key=lambda p: p["post_date"])
    log("    -> range me mile: %d post" % len(out))
    return out, profile


# =============================================================================
# MAIN
# =============================================================================

def main():
    start_dt = datetime.strptime(START_DATE, "%Y-%m-%d")
    end_dt = datetime.strptime(END_DATE, "%Y-%m-%d") + timedelta(days=1)

    log("=" * 65)
    log("  Facebook Scraper  (manual login)")
    log("  Date range : %s se %s" % (START_DATE, END_DATE))
    log("  Input      : %s" % INPUT_FILE)
    log("  Output     : %s" % OUTPUT_FILE)
    log("=" * 65)

    df = pd.read_excel(INPUT_FILE, dtype=str)
    if LINK_COLUMN not in df.columns:          # pehle check, phir filter
        log("\n[Error] Column '%s' nahi mili." % LINK_COLUMN)
        log("Available: %s" % list(df.columns))
        return
    df = df[df[LINK_COLUMN].notna() & (df[LINK_COLUMN].astype(str).str.strip() != "-")]

    extra_cols = [c for c in df.columns if c != LINK_COLUMN]
    log("  Extra columns: %s" % extra_cols)

    link_map = {}
    for _, row in df.iterrows():
        ident = clean_facebook_url(row[LINK_COLUMN])
        if ident and ident not in link_map:
            link_map[ident] = {
                "url": str(row[LINK_COLUMN]).strip(),
                "extra": [str(row.get(c, "")) if pd.notna(row.get(c)) else "" for c in extra_cols],
            }

    all_ids = list(link_map.keys())
    log("  Total profiles: %d" % len(all_ids))

    done = set()
    if "--fresh" in sys.argv and os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
        log("  (--fresh: purana progress hata diya, sab dobara chalenge)")
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            done = {ln.strip() for ln in f if ln.strip()}
        log("  Already done : %d" % len(done))

    remaining = [i for i in all_ids if i not in done]
    log("  Remaining    : %d\n" % len(remaining))
    if not remaining:
        log("Sab profile is range ke liye pehle hi ho chuke hain.")
        log("Dobara chalana hai to:")
        log("   python facebook_scraper_fixed.py --fresh")
        log("(ya ye file hata do: %s)" % PROGRESS_FILE)
        return

    headers = ["Handle", "Post URL", "Facebook ID", "Post Date", "Post Date (raw)",
               "Post Text", "Followers", "Followings",
               "Total Comments", "Total Likes", "Total Shares", "Total Views",
               "Sentiment", "Sentiment Score"] + extra_cols

    file_exists = os.path.exists(OUTPUT_FILE)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=40)
        ctx = browser.new_context(
            viewport={"width": 1366, "height": 900},
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"))
        page = ctx.new_page()
        page.goto("https://www.facebook.com", wait_until="domcontentloaded")

        log("\n" + "=" * 55)
        log("  Browser khul gaya. Facebook me MANUAL LOGIN karo.")
        log("  Login ho jaaye to yahan ENTER dabao...")
        log("=" * 55)
        input()
        log("\nStart...\n")

        with open(OUTPUT_FILE, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            if not file_exists:
                w.writerow(headers)

            for idx, ident in enumerate(remaining, 1):
                info = link_map[ident]
                url = info["url"]
                if not url.startswith("http"):
                    url = "https://www.facebook.com/" + ident

                log("[%d/%d] %s" % (idx, len(remaining), ident))
                posts, prof = scrape_one_profile(page, url, start_dt, end_dt)

                for po in posts:
                    w.writerow([
                        ident, po["post_url"], ident,
                        po["post_date"], po["post_date_raw"], po["post_text"],
                        prof["followers"], prof["following"],
                        po["comments"], po["likes"], po["shares"], po["views"],
                        po["sentiment"], po["sentiment_score"],
                    ] + info["extra"])
                f.flush()
                log("  -> %d post save\n" % len(posts))

                with open(PROGRESS_FILE, "a", encoding="utf-8") as pf:
                    pf.write(ident + "\n")

                if idx < len(remaining):
                    d = random.uniform(*DELAY_BETWEEN_PROFILES)
                    log("  %.1fs ruk rahe hain...\n" % d)
                    time.sleep(d)

        browser.close()

    log("\n" + "=" * 65)
    log("  Done  ->  %s" % OUTPUT_FILE)
    log("=" * 65)


if __name__ == "__main__":
    main()
