# -*- coding: utf-8 -*-
"""
fb_graph_api.py  --  Facebook Page ka data Graph API se (v25.0)

Purani script (Bhagyashree Borate wali) ka upgrade. Kya-kya theek hua:

  API ki taraf se
   1. v2.4 / v2.6 -> v25.0   (v2.x saalon pehle band ho chuka hai)
   2. App Token (app_id|app_secret) hata diya -- 2018 se wo Page feed nahi
      padh sakta. Ab PAGE ACCESS TOKEN chahiye. Iska matlab: sirf UN pages
      ka data mil sakta hai jinke tum admin ho.
   3. Pagination joda -- purani script sirf pehle 30 post laati thi aur ruk
      jaati thi. Ab poora feed aata hai (ya jitni date range chahiye).
   4. 'sad' reaction maanga hi nahi ja raha tha -> hamesha 0 aata tha. Ab aata hai.

  Code ki taraf se
   5. page_id list me '...' (Ellipsis) tha -> chalte hi TypeError.
   6. Har page ki PEHLI post chhoot jaati thi (flag==0 wali branch me
      writerow tha hi nahi).
   7. CSV har run par MIT jaati thi (file ke aakhir me open(...,'w')).
      Ab append hota hai, header sirf nayi file par.
   8. request_until_succeed() galat token par ANANT KAAL tak loop karta tha,
      chup-chaap. Ab 4 koshish, phir saaf error.
   9. while True + now.second==50 -> CPU 100%, aur wo exact second aksar
      chook jaata tha. Scheduler hata diya -- ek baar chalta hai. Roz chahiye
      to Windows Task Scheduler se laga dena.
  10. Time -5 ghante (EST) kar raha tha. Ab IST (+5:30).

Chalao:
   python fb_graph_api.py
   python fb_graph_api.py --from 2026-08-01 --to 2026-08-21
"""
import csv
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# =============================================================================
# CONFIGURATION -- yahan bharo
# =============================================================================

API_VERSION = "v25.0"

# PAGE ACCESS TOKEN (App Token nahi).
# Kahan se: developers.facebook.com -> Graph API Explorer -> apna App chuno ->
#   User Token lo permissions ke saath: pages_show_list, pages_read_engagement,
#   pages_read_user_content -> phir "Get Page Access Token" -> apna page chuno.
# Wo short-lived hota hai (~1-2 ghante). Lamba chahiye to /oauth/access_token se
# long-lived banwa lena.
PAGE_TOKEN = "yahan apna page access token daalo"

# Jin pages ka data chahiye. Page ka username ya numeric ID -- dono chalte hain.
# DHYAN: tum in pages ke ADMIN hone chahiye, warna API mana kar degi.
PAGE_IDS = [
    "your_page_username",
    # "1234567890",
]

OUT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "facebook_details.csv")

# Date range (khaali chhodo to sab kuch)
START_DATE = ""          # "2026-08-01"
END_DATE = ""            # "2026-08-21"

PAGE_SIZE = 100          # ek request me kitni post (max 100)
MAX_PAGES = 200          # safety -- itne "next page" se aage nahi
SLEEP_BETWEEN = 1.0      # rate limit se bachne ke liye

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

COLS = ["Account", "Page Likes", "Post ID", "URL", "Data Collected Time",
        "Post Creation Time (IST)", "Likes", "Love", "Haha", "Wow", "Sad",
        "Angry", "Total Reactions", "Comments", "Shares", "Text",
        "Hashtag Count", "Hashtags", "Link Count", "Link1", "Link2", "Link3"]


# =============================================================================
# HELPERS
# =============================================================================

def log(*a):
    print(*a, flush=True)


class FBError(Exception):
    pass


def api_get(path, params, tries=4):
    """Graph API call.

    BUG THA: purana request_until_succeed() 'while success is False' me
    hamesha ke liye ghoomta rehta tha. Galat token par script bas latki
    rehti thi aur error print bhi comment kiya hua tha.
    Ab: gadbad token / permission par TURANT saaf error, aur network
    dikkat par sirf 4 koshish (badhte hue intezaar ke saath).
    """
    params = dict(params or {})
    params["access_token"] = PAGE_TOKEN
    url = "https://graph.facebook.com/%s/%s?%s" % (
        API_VERSION, path.lstrip("/"), urllib.parse.urlencode(params))

    last = ""
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", {})
            except Exception:
                err = {}
            msg = err.get("message", body[:300])
            code = err.get("code")
            # 400/403 = token ya permission ki dikkat -- dobara koshish bekaar
            if e.code in (400, 403) or code in (190, 200, 10, 803):
                raise FBError("Facebook ne mana kiya (HTTP %s, code %s):\n   %s"
                              % (e.code, code, msg))
            last = "HTTP %s: %s" % (e.code, msg)
        except Exception as e:
            last = str(e)
        wait = 3 * (i + 1)
        log("   (dikkat: %s -- %ds baad dobara)" % (last, wait))
        time.sleep(wait)
    raise FBError("4 koshish ke baad bhi nahi mila: %s" % last)


def page_info(pid):
    d = api_get(pid, {"fields": "id,name,fan_count,followers_count,link"})
    return {
        "id": d.get("id", pid),
        "name": d.get("name", ""),
        "likes": d.get("fan_count") or d.get("followers_count") or "",
        "link": d.get("link", ""),
    }


def to_ist(created):
    """'2026-08-20T14:37:12+0000' -> IST.
    BUG THA: purana code timedelta(hours=-5) laga kar EST banata tha --
    Bharat ke liye 10:30 ghante ka farq pad jaata tha."""
    try:
        dt = datetime.datetime.strptime(created, "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        return "", None
    ist = dt.astimezone(IST)
    return ist.strftime("%Y-%m-%d %H:%M:%S"), ist


def summary_count(node, key):
    v = node.get(key)
    if not isinstance(v, dict):
        return 0
    s = v.get("summary")
    if isinstance(s, dict):
        return int(s.get("total_count") or 0)
    return 0


_HASH = re.compile(r"\B#\w+", re.UNICODE)
_URL = re.compile(r"https?://[^\s<>\"']+")


def row_from_post(pg, post):
    text = post.get("message") or ""
    pid = post.get("id", "")
    # post URL: id "PAGEID_POSTID" hota hai
    parts = pid.split("_")
    url = post.get("permalink_url") or (
        "https://www.facebook.com/%s/posts/%s" % (pg["id"], parts[-1]) if len(parts) > 1 else "")

    tags = _HASH.findall(text)
    links = _URL.findall(text)
    l3 = (links + ["", "", ""])[:3]

    created_str, _ = to_ist(post.get("created_time", ""))

    likes = summary_count(post, "likes")
    love = summary_count(post, "love")
    haha = summary_count(post, "haha")
    wow = summary_count(post, "wow")
    sad = summary_count(post, "sad")        # BUG THA: ye maanga hi nahi jaata tha
    angry = summary_count(post, "angry")
    total_react = summary_count(post, "reactions")
    comments = summary_count(post, "comments")
    shares = int((post.get("shares") or {}).get("count") or 0)

    return [
        pg["name"], pg["likes"], pid, url,
        datetime.datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S"),
        created_str,
        likes, love, haha, wow, sad, angry, total_react,
        comments, shares,
        " ".join(text.split()),
        len(tags), " ".join(tags),
        len(links), l3[0], l3[1], l3[2],
    ]


FIELDS = ",".join([
    "id", "message", "created_time", "permalink_url", "shares",
    "reactions.limit(0).summary(total_count)",
    "reactions.type(LIKE).limit(0).summary(total_count).as(likes)",
    "reactions.type(LOVE).limit(0).summary(total_count).as(love)",
    "reactions.type(HAHA).limit(0).summary(total_count).as(haha)",
    "reactions.type(WOW).limit(0).summary(total_count).as(wow)",
    "reactions.type(SAD).limit(0).summary(total_count).as(sad)",
    "reactions.type(ANGRY).limit(0).summary(total_count).as(angry)",
    "comments.limit(0).summary(total_count)",
])


def fetch_posts(pg, since=None, until=None):
    """Poora feed -- PAGINATION ke saath.
    BUG THA: purani script ek hi request maarti thi (30 post) aur ruk jaati thi."""
    params = {"fields": FIELDS, "limit": PAGE_SIZE}
    if since:
        params["since"] = int(since.timestamp())
    if until:
        params["until"] = int(until.timestamp())

    path = "%s/posts" % pg["id"]
    out, seen, page_no = [], set(), 0
    data = api_get(path, params)

    while True:
        page_no += 1
        batch = data.get("data", [])
        for p in batch:
            if p.get("id") and p["id"] not in seen:
                seen.add(p["id"])
                out.append(p)
        log("   page %-3d | is page par %-3d | kul %d" % (page_no, len(batch), len(out)))

        nxt = (data.get("paging") or {}).get("next")
        if not nxt or not batch or page_no >= MAX_PAGES:
            break
        time.sleep(SLEEP_BETWEEN)
        try:
            with urllib.request.urlopen(urllib.request.Request(nxt), timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
        except Exception as e:
            log("   (agla page nahi mila: %s)" % e)
            break
    return out


def arg(name, default=""):
    a = sys.argv
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


# =============================================================================
# MAIN
# =============================================================================

def main():
    sd = arg("--from", START_DATE)
    ed = arg("--to", END_DATE)
    since = until = None
    if sd:
        since = datetime.datetime.strptime(sd, "%Y-%m-%d").replace(tzinfo=IST)
    if ed:
        until = (datetime.datetime.strptime(ed, "%Y-%m-%d")
                 + datetime.timedelta(days=1)).replace(tzinfo=IST)

    log("=" * 62)
    log("  Facebook Graph API  %s" % API_VERSION)
    log("  Pages : %d" % len(PAGE_IDS))
    log("  Range : %s" % (("%s se %s" % (sd, ed)) if sd or ed else "sab kuch"))
    log("  Output: %s" % OUT_CSV)
    log("=" * 62)

    if not PAGE_TOKEN or PAGE_TOKEN.startswith("yahan"):
        sys.exit("\n[!] PAGE_TOKEN nahi bhara. Upar CONFIGURATION me daalo.")
    bad = [p for p in PAGE_IDS if not isinstance(p, str) or not p.strip()
           or p.startswith("your_")]
    if bad or not PAGE_IDS:
        sys.exit("\n[!] PAGE_IDS theek se bharo. Abhi galat: %r" % (bad or "khaali"))

    # token pehle hi jaanch lo -- baad me har page par error se behtar hai
    try:
        me = api_get("me", {"fields": "id,name"})
        log("\n  Token theek hai -> %s (%s)\n" % (me.get("name", "?"), me.get("id", "?")))
    except FBError as e:
        sys.exit("\n[!] Token kaam nahi kar raha:\n   %s\n\n"
                 "   Dhyan do: App Token (app_id|app_secret) se Page ki posts\n"
                 "   NAHI padhi ja sakti. PAGE ACCESS TOKEN chahiye, aur tum us\n"
                 "   page ke admin hone chahiye." % e)

    # CSV: append, header sirf nayi file par
    # BUG THA: purani script file ke aakhir me open(...,'w') karti thi ->
    # har run par saara purana data mit jaata tha.
    is_new = not os.path.exists(OUT_CSV) or os.path.getsize(OUT_CSV) == 0
    fh = open(OUT_CSV, "a", newline="", encoding="utf-8-sig")
    w = csv.writer(fh, quoting=csv.QUOTE_ALL)
    if is_new:
        w.writerow(COLS)

    grand = 0
    for i, pid in enumerate(PAGE_IDS, 1):
        log("[%d/%d] %s" % (i, len(PAGE_IDS), pid))
        try:
            pg = page_info(pid)
        except FBError as e:
            log("   [!] chhod rahe hain: %s\n" % e)
            continue
        log("   %s | likes: %s" % (pg["name"] or "?", pg["likes"] or "-"))

        try:
            posts = fetch_posts(pg, since, until)
        except FBError as e:
            log("   [!] posts nahi mile: %s\n" % e)
            continue

        n = 0
        for p in posts:
            # BUG THA: pehli post kabhi likhi hi nahi jaati thi (flag wali galti)
            w.writerow(row_from_post(pg, p))
            n += 1
        fh.flush()
        grand += n
        log("   -> %d post save\n" % n)
        time.sleep(SLEEP_BETWEEN)

    fh.close()
    log("=" * 62)
    log("  DONE  ->  %s   (%d post)" % (OUT_CSV, grand))
    log("=" * 62)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\nRok diya.")
