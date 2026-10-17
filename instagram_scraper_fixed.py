# -*- coding: utf-8 -*-
"""
Instagram Handle Tracking  --  manual login + Selenium

KYA-KYA THEEK HUA (purane code me):

 1. CAPTION PHAT RAHA THA -- sabse badi galti.
       df["Caption"].split(":")[-1]
    Ye AAKHRI colon ke baad ka hissa leta tha. Caption me kahin bhi ':' ho
    (time "10:30", "Note:", "https://") to poora shuruaati text ud jaata tha.
       "Aaj subah 10:30 baje karyakram tha"  ->  "30 baje karyakram tha"
       "Note: kal meeting. Details: https://t.co/abc"  ->  "//t.co/abc"
    Ab regex se sirf 'username on <date>: ' wala prefix hatate hain.

 2. post_links ek SET tha -> list(post_links)[:100] me kaunse 100 aaye,
    wo har baar alag. Date filter ke liye NAYI posts chahiye, koi bhi 100 nahi.
    Ab kram bana rehta hai (naye pehle).

 3. Likes/Comments "1,234" / "1.2K" text ki tarah save ho rahe the.
    Ab asli number.

 4. MAX_SCROLL = 6 -> bas ~40-60 post. Range bada ho to kam pad jaata hai.

 5. driver.quit() comment tha -> Chrome khula reh jaata tha.

 6. Excel me column ka naam galat ho to KeyError. Ab saaf message.

 7. Repost Count: ye aata hai ya nahi, ab script KHUD gin kar batati hai
    (neeche "REPORT" me). Usi se decide karna column rakhna hai ya nahi.

 8. SENTIMENT: TextBlob sirf ANGREZI samajhta hai. Hindi/Telugu par wo
    hamesha 0.0 (Neutral) dega, ya kabhi kisi bhatke English shabd se
    bekaar sa number. Isliye ab har row me "Sentiment Lang" bhi likhte hain
    -- 'en' matlab bharosa karo, 'other' matlab wo number matlab nahi rakhta.

Chalao:
   C:\\Users\\arpan\\anaconda3\\python.exe instagram_scraper_fixed.py
"""
import random
import re
import sys
import time
from datetime import datetime, timedelta

import pandas as pd
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from textblob import TextBlob
from tqdm import tqdm
from webdriver_manager.chrome import ChromeDriverManager

# =============================================================================
# CONFIG
# =============================================================================
START_DATE = "2026-08-16"
END_DATE = "2026-08-20"

EXCEL_FILE = r"C:\Users\arpan\OneDrive\Documents\Testing.xlsx"
LINK_COLUMN = "Instagram Accounts"

OUTPUT_FILE = (r"C:\Users\arpan\OneDrive\Documents\Instagram_%s_to_%s.csv"
               % (START_DATE, END_DATE))

MAX_SCROLL = 40                 # upri seema; asli me range khatam hote hi ruk jaata hai
POST_LIMIT = 400                # upri seema
# ---- jaldi rukne ke niyam ----
# PEHLE 3 thi -- BAHUT sakht. Instagram ka grid hamesha seedhe kram me nahi hota
# (reel, aur naya batch load hone par kram thoda upar-neeche ho jaata hai),
# isliye beech me 3 purani post mil jaati thin aur scraper wahin ruk jaata tha.
# 85 ki jagah 33 row isi wajah se aayi thin.
# Ab TEENO shart poori hone par hi rukta hai:
STOP_AFTER_OLDER = 12      # itni post LAGATAAR range se purani
MIN_CHECK = 30             # aur kam se kam itni post to dekh hi lo
GRACE_DAYS = 5             # aur sabse purani post start se itne din peeche ho
PINNED_SKIP = 3            # upar ki 3 pinned post gino mat

SCAN_ALL = False           # True (ya --all) -> jaldi rukna band, POST_LIMIT tak dekho
SLEEP_BETWEEN_POSTS = (0.6, 1.2)
SLEEP_BETWEEN_PROFILES = (2, 4)


# =============================================================================
# HELPERS
# =============================================================================

def parse_count(txt):
    """'1,234' / '1.2K' / '3.4M' -> asli number.
    Purana code inhe TEXT hi rehne deta tha -> Excel me jod nahi sakte the."""
    if txt is None:
        return None
    t = str(txt).strip().lower().replace(",", "")
    m = re.search(r'(\d+(?:\.\d+)?)\s*([kmb])?', t)
    if not m:
        return None
    n = float(m.group(1))
    n *= {'k': 1e3, 'm': 1e6, 'b': 1e9}.get(m.group(2) or '', 1)
    return int(round(n))


def extract_username(url):
    if not isinstance(url, str):
        return None
    m = re.search(r"instagram\.com/([^/?#]+)", url)
    if not m:
        return None
    u = m.group(1).strip()
    return u if u and u not in ("p", "reel", "explore", "accounts") else None


# Instagram ka meta description aisa hota hai:
#   '1,234 likes, 56 comments - username on August 5, 2026: "asli caption yahan"'
_META = re.compile(
    r'^\s*([\d.,KkMm]+)\s*likes?,\s*([\d.,KkMm]+)\s*comments?\s*-\s*'
    r'(.+?)\s+on\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})\s*:\s*(.*)$',
    re.S)


def parse_meta(content):
    """meta description se likes / comments / date / CAPTION alag karo.

    BUG THA: purana code caption = content.split(' - ',1)[1] karta tha, jisme
    'username on <date>:' bhi ghusa reh jaata tha, aur phir usko
    split(':')[-1] se kaatta tha -- yahi caption ko phaad deta tha."""
    out = {"likes": None, "comments": None, "date": None, "caption": None}
    if not content:
        return out
    m = _META.match(content.strip())
    if m:
        out["likes"] = parse_count(m.group(1))
        out["comments"] = parse_count(m.group(2))
        out["date"] = m.group(4)
        cap = m.group(5).strip()
        cap = re.sub(r'^["\u201c]|["\u201d]\.?\s*$', '', cap).strip()   # bahar ke quote hatao
        out["caption"] = cap
        return out
    # thoda alag format aaye to jitna mile utna
    m2 = re.search(r'([\d.,KkMm]+)\s*likes?,\s*([\d.,KkMm]+)\s*comments?', content)
    if m2:
        out["likes"] = parse_count(m2.group(1))
        out["comments"] = parse_count(m2.group(2))
    m3 = re.search(r'\bon\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})', content)
    if m3:
        out["date"] = m3.group(1)
    m4 = re.search(r':\s*["\u201c](.+)["\u201d]', content, re.S)
    if m4:
        out["caption"] = m4.group(1).strip()
    return out


def parse_ig_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s.replace(",", ", ").replace("  ", " ").strip(),
                                 "%B %d, %Y")
    except Exception:
        try:
            return datetime.strptime(s.strip(), "%B %d, %Y")
        except Exception:
            return None


_DEV = re.compile(r'[\u0900-\u097F\u0C00-\u0C7F\u0980-\u09FF\u0B80-\u0BFF'
                  r'\u0A80-\u0AFF\u0C80-\u0CFF\u0D00-\u0D7F\u0A00-\u0A7F]')


def sentiment_of(text):
    """TextBlob SIRF angrezi samajhta hai.
    Hindi/Telugu/Bangla par polarity hamesha 0.0 aayegi -> sab 'Neutral'.
    Isliye saath me batate hain ki text kis bhasha ka tha."""
    t = str(text or "")
    if not t.strip():
        return "Neutral", 0.0, "empty"
    lang = "other" if _DEV.search(t) else "en"
    try:
        p = TextBlob(t).sentiment.polarity
    except Exception:
        p = 0.0
    lab = "Positive" if p > 0.05 else "Negative" if p < -0.05 else "Neutral"
    return lab, round(p, 4), lang


# =============================================================================
# MAIN
# =============================================================================

def main():
    global SCAN_ALL
    if "--all" in sys.argv:
        SCAN_ALL = True
        print("(--all: jaldi rukna BAND -- har profile par POST_LIMIT tak dekhenge)")
    start_dt = datetime.strptime(START_DATE, "%Y-%m-%d")
    end_dt = datetime.strptime(END_DATE, "%Y-%m-%d") + timedelta(days=1)

    df_in = pd.read_excel(EXCEL_FILE)
    if LINK_COLUMN not in df_in.columns:
        sys.exit("[!] Column '%s' nahi mila.\n    Excel me hain: %s"
                 % (LINK_COLUMN, list(df_in.columns)))

    df_in["username"] = df_in[LINK_COLUMN].apply(extract_username)
    df_in = df_in.dropna(subset=["username"]).drop_duplicates(subset=["username"])
    print("Profiles: %d" % len(df_in))
    print("Range   : %s se %s" % (START_DATE, END_DATE))

    opts = Options()
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--start-maximized")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    wait = WebDriverWait(driver, 12)

    all_rows = []
    try:
        driver.get("https://www.instagram.com/")
        time.sleep(3)
        print("\n" + "=" * 55)
        print("  Browser me MANUAL LOGIN karo.")
        print("  Ho jaaye to yahan ENTER dabao...")
        print("=" * 55)
        input()

        session = requests.Session()
        session.cookies.update({c["name"]: c["value"] for c in driver.get_cookies()})
        session.headers.update({"User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1")})

        for _, row in tqdm(df_in.iterrows(), total=len(df_in), desc="Profiles"):
            username = row["username"]
            purl = "https://www.instagram.com/%s/" % username
            print("\n>> %s" % username)

            followers = following = posts_count = bio = None
            try:
                driver.get(purl)
                time.sleep(2.2)

                soup = BeautifulSoup(driver.page_source, "html.parser")
                md = soup.find("meta", attrs={"name": "description"})
                if md:
                    c = md.get("content", "")
                    f1 = re.search(r"([\d,.]+[KMB]?)\s+Followers", c, re.I)
                    f2 = re.search(r"([\d,.]+[KMB]?)\s+Following", c, re.I)
                    f3 = re.search(r"([\d,.]+[KMB]?)\s+Posts", c, re.I)
                    followers = parse_count(f1.group(1)) if f1 else None
                    following = parse_count(f2.group(1)) if f2 else None
                    posts_count = parse_count(f3.group(1)) if f3 else None

                try:
                    bio = wait.until(EC.presence_of_element_located(
                        (By.XPATH, "//header//section//span[contains(@class,'x1lliihq')"
                                   " or contains(@class,'x193iq5w')]"))).text
                except Exception:
                    bio = None

                print("   Followers: %s | Following: %s | Posts: %s"
                      % (followers, following, posts_count))

                # ---- posts: scroll AUR fetch saath-saath ----
                #
                # PEHLE KYA HOTA THA: 25 scroll me ~300 link jama karta tha, phir
                # HAR EK ka page kholta tha aur baad me date dekh kar phenk deta tha.
                # 5 din ke range ke liye 300 request -- slow, aur Instagram block
                # kar deta hai.
                #
                # AB: grid naye se purane kram me hoti hai. Jaise hi lagataar
                # STOP_AFTER_OLDER post range se PURANI mil jaayein, wahin ruk jaate
                # hain -- na aage scroll, na aage koi request.
                seen, kept, no_date, fetched = set(), 0, 0, 0
                consec_older = 0
                idx = 0
                done_profile = False
                oldest_seen = None
                stop_why = ""

                for _s in range(MAX_SCROLL):
                    batch = []
                    for a in driver.find_elements(
                            By.XPATH, "//a[contains(@href,'/p/') or contains(@href,'/reel/')]"):
                        try:
                            h = (a.get_attribute("href") or "").split("?")[0]
                        except Exception:
                            continue
                        if h and h not in seen:
                            seen.add(h)
                            batch.append(h)

                    for url in batch:
                        idx += 1
                        try:
                            html = session.get(url, timeout=12).text
                        except Exception:
                            continue
                        fetched += 1
                        s2 = BeautifulSoup(html, "html.parser")
                        md2 = s2.find("meta", attrs={"name": "description"})
                        info = parse_meta(md2.get("content", "") if md2 else "")
                        pdt = parse_ig_date(info["date"])

                        if pdt is None:
                            no_date += 1
                            continue

                        if oldest_seen is None or pdt < oldest_seen:
                            oldest_seen = pdt

                        if pdt < start_dt:
                            # pehli PINNED_SKIP post pinned ho sakti hain (purani) -- unhe mat gino
                            if idx > PINNED_SKIP:
                                consec_older += 1
                                # TEENO shart -- warna beech ki ek purani post
                                # poore profile ko rok deti thi
                                if (not SCAN_ALL
                                        and consec_older >= STOP_AFTER_OLDER
                                        and fetched >= MIN_CHECK
                                        and oldest_seen is not None
                                        and oldest_seen < start_dt - timedelta(days=GRACE_DAYS)):
                                    stop_why = ("%d post lagataar purani, %d post dekhi, "
                                                "sabse purani %s"
                                                % (consec_older, fetched,
                                                   oldest_seen.strftime("%d %b")))
                                    done_profile = True
                                    break
                            continue
                        consec_older = 0
                        if pdt >= end_dt:
                            continue          # range se nayi -- abhi range tak pahunche nahi

                        rp = re.search(r'"media_repost_count":\s*(\d+)', html)
                        all_rows.append({
                            "Handle": purl,
                            "User Name": username,
                            "User Bio": bio,
                            "User Post Count": posts_count,
                            "User Followings": following,
                            "User Followers": followers,
                            "Date": pdt.strftime("%Y-%m-%d"),
                            "Post Link": url,
                            "Instagram Text": info["caption"] or "",
                            "Likes": info["likes"],
                            "Comments": info["comments"],
                            "Repost Count": int(rp.group(1)) if rp else None,
                        })
                        kept += 1
                        time.sleep(random.uniform(*SLEEP_BETWEEN_POSTS))

                    if done_profile:
                        print("   ruke: %s" % stop_why)
                        break
                    if fetched >= POST_LIMIT:
                        print("   POST_LIMIT (%d) tak pahunch gaye" % POST_LIMIT)
                        break
                    if not batch and _s > 2:
                        print("   aur post nahi mil rahi -- ruk gaye")
                        break
                    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    time.sleep(1.5)

                print("   -> range me %d post  |  %d post khole (%d link mile)"
                      % (kept, fetched, len(seen))
                      + ("  | %d ki date nahi padh paye" % no_date if no_date else ""))
                time.sleep(random.uniform(*SLEEP_BETWEEN_PROFILES))
            except Exception as e:
                print("   [!] %s" % e)
                continue
    finally:
        try:
            driver.quit()          # purane code me ye comment tha -> Chrome khula rehta tha
        except Exception:
            pass

    # ---------------- save ----------------
    if not all_rows:
        print("\nIs range me koi post nahi mili.")
        return

    df = pd.DataFrame(all_rows)
    sent = df["Instagram Text"].apply(sentiment_of)
    df["Sentiment"] = [s[0] for s in sent]
    df["Sentiment Score"] = [s[1] for s in sent]
    df["Sentiment Lang"] = [s[2] for s in sent]

    cols = ["Handle", "User Name", "User Bio", "User Post Count", "User Followings",
            "User Followers", "Date", "Post Link", "Instagram Text", "Likes",
            "Comments", "Repost Count", "Sentiment", "Sentiment Score", "Sentiment Lang"]
    df = df[[c for c in cols if c in df.columns]]
    df.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")

    # ---------------- REPORT: khud dekh lo kya theek aaya ----------------
    n = len(df)
    print("\n" + "=" * 58)
    print("  %d row save -> %s" % (n, OUTPUT_FILE))
    print("=" * 58)

    def pct(k):
        return "%d/%d (%d%%)" % (k, n, round(100 * k / n))

    print("  caption mila       : %s" % pct(df["Instagram Text"].astype(str).str.strip().ne("").sum()))
    print("  likes mile         : %s" % pct(df["Likes"].notna().sum()))
    print("  comments mile      : %s" % pct(df["Comments"].notna().sum()))
    rc = df["Repost Count"].notna().sum()
    print("  Repost Count mila  : %s" % pct(rc))
    if rc == 0:
        print("     -> ek bhi row me nahi aaya. Ye column HATA DO, khaali hi rahega.")
    print()
    lang = df["Sentiment Lang"].value_counts().to_dict()
    print("  bhasha             : %s" % lang)
    if lang.get("other", 0):
        print("     -> %d row Hindi/Telugu ki hain. TextBlob sirf ANGREZI samajhta hai," % lang["other"])
        print("        un rows ka Sentiment BEKAAR hai -- 'Sentiment Lang' se chhaan lena.")


if __name__ == "__main__":
    main()
