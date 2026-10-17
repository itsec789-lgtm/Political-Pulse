# -*- coding: utf-8 -*-
r"""
fetch_x_profiles.py  --  har handle ki PHOTO / COVER / BIO X se laa kar Mongo me
================================================================================
Handle Analytics tab me avatar aur cover yahin se aate hain.
Ye script na chalao to bhi tab poora chalta hai -- bas photo ki jagah naam ke
initials dikhte hain. Ye sirf usme rang bharti hai.

KAHAN SAVE HOTA HAI
    pulse_master.x_profiles        _id = handle
    { _id, name, image, cover, bio, followers, following, posts, fetchedAt }

PEHLE EK BAAR
    1. x_config.sample.json ka naam badal kar  x_config.json  karo
    2. Usme apne X ke 3 cookie bhar do (auth_token, ct0, twid)
       -- kaise milenge, wahi file me likha hai
    3. python fetch_x_profiles.py

ROZ / BAAD ME
    python fetch_x_profiles.py              <- sirf wahi handle jinki photo
                                               nahi hai ya 30 din purani hai
    python fetch_x_profiles.py --all        <- sabko dobara
    python fetch_x_profiles.py --limit 50   <- sirf 50 (dekhne ke liye)
    python fetch_x_profiles.py --only yogi  <- ek hi handle

DHYAN
  * Beech me rok do to koi dikkat nahi -- jitne ho gaye wo Mongo me bache
    rehte hain, agli baar wahin se aage chalta hai.
  * X thoda-thoda karke hi deta hai. Har call ke beech ruk kar chalti hai,
    aur 429 (rate limit) aane par apne aap ruk jaati hai.
  * Ye script Mongo me sirf x_profiles me likhti hai. master_tweets ya
    kisi aur collection ko haath nahi lagati.
================================================================================
"""
import datetime
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(HERE, "x_config.json")
SAMPLE = os.path.join(HERE, "x_config.sample.json")

DB_MASTER = "pulse_master"
COLL_OUT = "x_profiles"
STALE_DAYS = 30
SLEEP_SEC = 1.2                 # har handle ke beech -- X ko pareshan mat karo
GQL = "https://x.com/i/api/graphql/Yka-W8dz7RaEuQNkroPkYw/UserByScreenName"
BEARER = ("Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
          "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA")

FEATURES = {
    "hidden_profile_likes_enabled": True, "hidden_profile_subscriptions_enabled": True,
    "rweb_tipjar_consumption_enabled": False,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": True,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
    "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": True,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
}


def say(m=""):
    print(m, flush=True)


def mongo_url():
    """mongo_conf.py se (wahi jo baaki pipeline use karta hai)."""
    try:
        sys.path.insert(0, HERE)
        from mongo_conf import MONGO_URL
        return MONGO_URL
    except Exception:
        return os.environ.get("MONGO_URL", "mongodb://localhost:27017")


def load_cfg():
    if not os.path.isfile(CFG):
        say("=" * 70)
        say("  x_config.json nahi mila.")
        say("=" * 70)
        say("  1. Is file ka naam badlo:")
        say("       %s" % SAMPLE)
        say("     ->  x_config.json")
        say("  2. Usme apne X ke 3 cookie bhar do (auth_token, ct0, twid)")
        say("     -- kahan se milenge, wahi file me likha hai.")
        say("  3. Phir ye script dobara chalao.")
        say("")
        say("  (Jab tak ye na karo tab bhi Handle Analytics chalta hai --")
        say("   bas photo ki jagah naam ke initials dikhte hain.)")
        sys.exit(1)
    try:
        c = json.load(open(CFG, encoding="utf-8"))
    except Exception as e:
        sys.exit("[FAIL] x_config.json padha nahi gaya: %s" % e)
    miss = [k for k in ("auth_token", "ct0", "twid")
            if not str(c.get(k, "")).strip() or "PASTE" in str(c.get(k, ""))]
    if miss:
        sys.exit("[FAIL] x_config.json me ye abhi bhare nahi hain: " + ", ".join(miss))
    return c


def headers(cfg, handle):
    return {
        "authorization": BEARER,
        "cookie": "auth_token=%s; ct0=%s; twid=%s; lang=en; dnt=1"
                  % (cfg["auth_token"], cfg["ct0"], cfg["twid"]),
        "content-type": "application/json",
        "x-csrf-token": cfg["ct0"],
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "en",
        "referer": "https://x.com/%s" % handle,
        "user-agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    }


def banner(url):
    """X banner URL bina size ke aata hai -- size lagaye bina image load nahi hoti."""
    u = str(url or "")
    if not u:
        return ""
    import re
    if re.search(r"/\d+x\d+$|/(web|web_retina|mobile|mobile_retina|ipad|ipad_retina)$", u):
        return u
    return u + "/1500x500"


def fetch_one(cfg, handle):
    """X se ek profile. (dict, None) ya (None, 'wajah')"""
    import urllib.request, urllib.parse, urllib.error
    payload = {
        "variables": {"screen_name": handle, "withSafetyModeUserFields": True},
        "features": FEATURES,
        "fieldToggles": {"withAuxiliaryUserLabels": False},
    }
    req = urllib.request.Request(GQL, data=json.dumps(payload).encode("utf-8"),
                                 headers=headers(cfg, handle), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            return None, "RATE"
        if e.code == 401:
            return None, "AUTH"
        return None, "HTTP %s" % e.code
    except Exception as e:
        return None, str(e)[:60]

    try:
        res = j["data"]["user"]["result"]
        lg = res.get("legacy") or {}
        return {
            "name": lg.get("name", "") or "",
            "image": (lg.get("profile_image_url_https") or "").replace("_normal", "_400x400"),
            "cover": banner(lg.get("profile_banner_url")),
            "bio": (lg.get("description") or "").replace("\n", " "),
            "followers": int(lg.get("followers_count") or 0),
            "following": int(lg.get("friends_count") or 0),
            "posts": int(lg.get("statuses_count") or 0),
        }, None
    except Exception:
        return None, "handle nahi mila"


def main():
    cfg = load_cfg()
    try:
        from pymongo import MongoClient
    except ImportError:
        sys.exit("[FAIL] pymongo nahi hai. Chalao: python -m pip install pymongo")

    only = None
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        if i + 1 < len(sys.argv):
            only = sys.argv[i + 1].strip().lstrip("@")
    limit = 0
    if "--limit" in sys.argv:
        i = sys.argv.index("--limit")
        if i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])
    redo_all = "--all" in sys.argv

    cli = MongoClient(mongo_url(), serverSelectionTimeoutMS=8000)
    cli.admin.command("ping")
    out = cli[DB_MASTER][COLL_OUT]

    # kis-kis handle ke liye laana hai -- dono dashboard ke handle milaa kar
    wanted = []
    for dbn in ("india_Pulse", "up_pulse"):
        try:
            for d in cli[dbn]["handles"].find({}, {"_id": 1}):
                wanted.append(d["_id"])
        except Exception:
            pass
    wanted = sorted(set(h for h in wanted if h))
    if only:
        wanted = [h for h in wanted if h.lower() == only.lower()] or [only]

    # pehle se jo hai + taaza hai, use chhod do
    have = {}
    for d in out.find({}, {"_id": 1, "fetchedAt": 1}):
        have[d["_id"]] = d.get("fetchedAt", "")
    cut = (datetime.datetime.now() - datetime.timedelta(days=STALE_DAYS)).strftime("%Y-%m-%d")
    todo = [h for h in wanted
            if redo_all or only or h not in have or str(have.get(h, ""))[:10] < cut]
    if limit:
        todo = todo[:limit]

    say("=" * 70)
    say("  X PROFILES  ->  %s.%s" % (DB_MASTER, COLL_OUT))
    say("=" * 70)
    say("  Kul handle      : %s" % f"{len(wanted):,}")
    say("  Pehle se taaza  : %s" % f"{len(wanted) - len(todo):,}")
    say("  Ab laane hain   : %s" % f"{len(todo):,}")
    if not todo:
        say("\n  Sab taaza hai -- kuch karne ki zaroorat nahi.")
        cli.close(); return
    say("  (~%d minute lagenge. Beech me rok sakte ho, kaam bacha rehta hai.)"
        % max(1, int(len(todo) * SLEEP_SEC / 60)))
    say("")

    ok = skip = 0
    t0 = time.time()
    for i, h in enumerate(todo, 1):
        prof, err = fetch_one(cfg, h)
        if err == "RATE":
            say("\n  [RUK GAYE] X ne rate-limit laga diya (%d/%d ho chuke)." % (i - 1, len(todo)))
            say("  Thodi der baad dobara chala dena -- bache hue se shuru hoga.")
            break
        if err == "AUTH":
            say("\n  [FAIL] Token kaam nahi kar rahe (401).")
            say("  x.com par dobara login karke x_config.json me naye cookie daalo.")
            break
        if err:
            skip += 1
            say("  [skip] @%-24s %s" % (h[:24], err))
        else:
            prof["_id"] = h
            prof["fetchedAt"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            out.replace_one({"_id": h}, prof, upsert=True)
            ok += 1
            if ok <= 5 or ok % 25 == 0:
                say("  [ok]   @%-24s %s followers%s"
                    % (h[:24], f"{prof['followers']:,}", "  (cover bhi mila)" if prof["cover"] else ""))
        time.sleep(SLEEP_SEC)

    cli.close()
    say("")
    say("=" * 70)
    say("  HO GAYA  --  %d profile aayi, %d skip, %d minute"
        % (ok, skip, (time.time() - t0) / 60))
    say("  Dashboard me Handle Analytics kholo -- photo aur cover dikhne lagenge.")
    say("  (Server restart ki zaroorat nahi.)")
    say("=" * 70)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        say("\n  Rok diya -- jitne ho gaye wo Mongo me safe hain.")
        sys.exit(1)
