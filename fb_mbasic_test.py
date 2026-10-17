# -*- coding: utf-8 -*-
"""
fb_mbasic_test.py  --  sirf JAANCH, kuch scrape nahi karta.

Sawal: kya mbasic.facebook.com abhi bhi chalta hai?

Facebook ne mbasic 4 Dec 2024 ko retire kar diya tha, par kuch report ke
hisaab se wo abhi bhi jawab de raha hai. Agar chal raha hai to hamare liye
bahut badi baat hai -- mbasic PLAIN HTML hai:
   * date <abbr> tag me saaf likhi hoti hai
   * likes/comments "427 Likes 19 Comments" seedha text me
   * post ka asli link /story.php?story_fbid=...&id=... hota hai
Yani jo teen cheezein www.facebook.com par mushkil se nikaal rahe hain,
wo yahan aasani se mil jaayengi.

Chalao:
   C:\\Users\\arpan\\anaconda3\\python.exe fb_mbasic_test.py
"""
import os
import re
import time

from playwright.sync_api import sync_playwright

PROFILE = "MeeNallamilli"          # jis profile par test karna hai

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(HERE, "mbasic_report.txt")
DUMP = os.path.join(HERE, "mbasic_page.html")

OUT = []


def w(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    OUT.append(line)


def main():
    with sync_playwright() as p:
        br = p.chromium.launch(headless=False, slow_mo=30)
        ctx = br.new_context(viewport={"width": 1100, "height": 850})
        page = ctx.new_page()

        w("1) mbasic khul raha hai?")
        try:
            r = page.goto("https://mbasic.facebook.com/", wait_until="domcontentloaded", timeout=45000)
            w("   HTTP status :", r.status if r else "?")
            w("   asli URL    :", page.url)
            if "mbasic" not in page.url:
                w("   >> REDIRECT ho gaya -- matlab mbasic BAND hai.")
        except Exception as e:
            w("   [!] khul hi nahi paaya:", e)
            br.close()
            return

        print("\n" + "=" * 55)
        print("  Ab is window me MANUAL LOGIN karo.")
        print("  (mbasic ka login page purane zamane jaisa dikhega -- wahi sahi hai)")
        print("  Login ho jaaye to yahan ENTER dabao...")
        print("=" * 55)
        input()

        url = "https://mbasic.facebook.com/" + PROFILE
        w("")
        w("2) profile khol rahe hain:", url)
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        time.sleep(2)
        w("   pahunche      :", page.url)
        if "mbasic" not in page.url:
            w("   >> mbasic se hata diya gaya. Ye raasta band hai.")
            br.close()
            return

        html = page.content()
        with open(DUMP, "w", encoding="utf-8") as f:
            f.write(html)
        w("   HTML save     :", DUMP, "(%d chars)" % len(html))

        # ---- wo teen cheezein jo www par mushkil thin ----
        w("")
        w("3) jo cheezein www.facebook.com par nahi mil rahi thin:")

        abbrs = page.query_selector_all("abbr")
        w("   <abbr> (date) : %d mile" % len(abbrs))
        for a in abbrs[:6]:
            try:
                w("        %r" % (a.inner_text() or "").strip())
            except Exception:
                pass

        links = page.query_selector_all('a[href*="story_fbid"], a[href*="/photo.php"], a[href*="permalink"]')
        w("   post ke link  : %d mile" % len(links))
        for a in links[:5]:
            w("        %s" % (a.get_attribute("href") or "")[:95])

        txt = page.inner_text("body")
        likes = re.findall(r'([\d,]+)\s*(?:Like|Reaction)', txt, re.I)
        cmts = re.findall(r'([\d,]+)\s*Comment', txt, re.I)
        shrs = re.findall(r'([\d,]+)\s*Share', txt, re.I)
        w("   'N Likes'     : %s" % (likes[:8] or "koi nahi"))
        w("   'N Comments'  : %s" % (cmts[:8] or "koi nahi"))
        w("   'N Shares'    : %s" % (shrs[:8] or "koi nahi"))

        more = page.query_selector_all('a[href*="cursor"], a[href*="sectionLoadingID"]')
        w("   'See more posts' link: %d  (purani posts tak jaane ke liye)" % len(more))

        w("")
        ok = len(abbrs) > 0 and len(links) > 0
        w("NATEEJA: %s" % ("mbasic CHAL RAHA HAI -- isi par scraper likhna behtar rahega"
                           if ok else
                           "mbasic se kaam ka kuch nahi mila -- www wala scraper hi rakhte hain"))

        with open(REPORT, "w", encoding="utf-8") as f:
            f.write("\n".join(OUT))
        w("report save:", REPORT)
        input("\nENTER dabao to band ho jaayega...")
        br.close()


if __name__ == "__main__":
    main()
