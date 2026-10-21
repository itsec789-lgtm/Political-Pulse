# -*- coding: utf-8 -*-
"""
scrape_x_profile_photos.py
================================================================================
X (Twitter) Profile Photo Scraper (Standalone Tool)

Ye script kisi bhi X (Twitter) handle ki High-Resolution Profile Photo (400x400),
Banner Cover, Display Name aur Follower count scrape karke locally download karti hai.

KAISE USE KAREIN:
1. Browser me x.com par jayein (login hona chahiye).
2. Keyboard par F12 dabayein -> 'Application' (ya Storage) tab -> 'Cookies' -> 'https://x.com'.
3. Wahan se 3 values copy karke neeche CONFIG section me daal dein:
   - auth_token
   - ct0
   - twid (optional)

4. Run karne ke tarike:
   - Command line se handle dekar:
       python scrape_x_profile_photos.py @narendramodi @myogiadityanath @RahulGandhi
   
   - Ya ek text file (handles.txt) bana kar jisme har line par ek handle ho:
       python scrape_x_profile_photos.py --file handles.txt

   - Ya ek CSV file (handles.csv) se:
       python scrape_x_profile_photos.py --csv handles.csv --col Handle

OUTPUT:
- Saari photos 'downloaded_photos/@handle.jpg' folder me save hongi.
- Saara data 'scraped_profiles_summary.csv' me export ho jayega.
================================================================================
"""

import os
import sys
import time
import json
import csv
import urllib.request
import urllib.parse
import urllib.error

# ==============================================================================
# 1. APNI X (TWITTER) COOKIES YAHAAN BHAREIN:
# ==============================================================================
AUTH_TOKEN = "PASTE_YOUR_AUTH_TOKEN_HERE"
CT0        = "PASTE_YOUR_CT0_HERE"
TWID       = "PASTE_YOUR_TWID_HERE"   # Example: "u%3D123456789..." (optional)

# Photo download folder
OUTPUT_FOLDER = "downloaded_photos"
SUMMARY_CSV   = "scraped_profiles_summary.csv"
SLEEP_DELAY   = 1.5   # Seconds between requests to avoid rate limits


# ==============================================================================
# X GRAPHQL API CONSTANTS
# ==============================================================================
GQL_URL = "https://x.com/i/api/graphql/Yka-W8dz7RaEuQNkroPkYw/UserByScreenName"
BEARER  = ("Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
           "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA")

FEATURES = {
    "hidden_profile_likes_enabled": True,
    "hidden_profile_subscriptions_enabled": True,
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


def get_headers(handle):
    cookie_str = f"auth_token={AUTH_TOKEN.strip()}; ct0={CT0.strip()}; lang=en; dnt=1"
    if TWID and not TWID.startswith("PASTE"):
        cookie_str += f"; twid={TWID.strip()}"

    return {
        "authorization": BEARER,
        "cookie": cookie_str,
        "content-type": "application/json",
        "x-csrf-token": CT0.strip(),
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "en",
        "referer": f"https://x.com/{handle}",
        "user-agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    }


def fetch_profile_data(handle):
    """X API se profile metadata fetch karta hai."""
    handle = handle.strip().lstrip("@")
    if not handle:
        return None, "Empty handle"

    payload = {
        "variables": {"screen_name": handle, "withSafetyModeUserFields": True},
        "features": FEATURES,
        "fieldToggles": {"withAuxiliaryUserLabels": False},
    }

    req = urllib.request.Request(
        GQL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=get_headers(handle),
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            return None, "RATE_LIMIT"
        if e.code == 401 or e.code == 403:
            return None, "AUTH_EXPIRED"
        return None, f"HTTP_{e.code}"
    except Exception as e:
        return None, str(e)[:60]

    try:
        user_res = data["data"]["user"]["result"]
        legacy = user_res.get("legacy") or {}
        
        # High resolution photo (400x400)
        raw_img = legacy.get("profile_image_url_https") or ""
        high_res_img = raw_img.replace("_normal", "_400x400") if raw_img else ""

        # Banner image
        raw_banner = legacy.get("profile_banner_url") or ""
        banner_url = (raw_banner + "/1500x500") if raw_banner else ""

        return {
            "handle": handle,
            "name": legacy.get("name", "") or "",
            "photo_url": high_res_img,
            "banner_url": banner_url,
            "followers": int(legacy.get("followers_count") or 0),
            "following": int(legacy.get("friends_count") or 0),
            "tweets_count": int(legacy.get("statuses_count") or 0),
            "bio": (legacy.get("description") or "").replace("\n", " ").strip(),
        }, None
    except Exception:
        return None, "User not found or suspended"


def download_image(url, save_path):
    """Image URL se image download karke local disk par save karti hai."""
    if not url:
        return False
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r, open(save_path, "wb") as f:
            f.write(r.read())
        return True
    except Exception as e:
        return False


def main():
    print("=" * 70)
    print("  X (TWITTER) PROFILE PHOTO SCRAPER")
    print("=" * 70)

    # 1. Check cookies
    if "PASTE_" in AUTH_TOKEN or "PASTE_" in CT0 or not AUTH_TOKEN.strip() or not CT0.strip():
        print("\n[!] ERROR: Cookies nahi daali gayi hain!")
        print("    Kripya script ko khol kar upar AUTH_TOKEN aur CT0 bharein.")
        print("    Browser me x.com par F12 -> Application -> Cookies se milegi.\n")
        sys.exit(1)

    # 2. Parse handles from args or files
    handles = []
    args = sys.argv[1:]
    
    if "--file" in args:
        idx = args.index("--file")
        if idx + 1 < len(args):
            fn = args[idx + 1]
            if os.path.exists(fn):
                with open(fn, "r", encoding="utf-8") as f:
                    handles = [line.strip().lstrip("@") for line in f if line.strip()]
            else:
                print(f"[!] File nahi mili: {fn}")
                sys.exit(1)
    elif "--csv" in args:
        idx = args.index("--csv")
        col_name = "Handle"
        if "--col" in args:
            cidx = args.index("--col")
            if cidx + 1 < len(args):
                col_name = args[cidx + 1]
        if idx + 1 < len(args):
            fn = args[idx + 1]
            if os.path.exists(fn):
                with open(fn, "r", encoding="utf-8", errors="ignore") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        h = row.get(col_name) or row.get(col_name.lower()) or row.get("handle") or row.get("username")
                        if h and h.strip():
                            handles.append(h.strip().lstrip("@"))
            else:
                print(f"[!] CSV file nahi mili: {fn}")
                sys.exit(1)
    else:
        # Direct handles passed in command line
        for a in args:
            if not a.startswith("--"):
                handles.append(a.strip().lstrip("@"))

    # Agar koi argument na diya ho, to default list mang lo ya prompt karo
    if not handles:
        print("\nHandles kaise pass karein:")
        print("  1. Command line se:   python scrape_x_profile_photos.py @narendramodi @myogiadityanath")
        print("  2. Text file se:       python scrape_x_profile_photos.py --file handles.txt")
        print("  3. CSV file se:        python scrape_x_profile_photos.py --csv handles.csv --col Handle\n")
        user_input = input("Ya abhi handles type karein (comma se alag karke): ").strip()
        if user_input:
            handles = [h.strip().lstrip("@") for h in user_input.split(",") if h.strip()]
        else:
            print("[!] Koi handle nahi mila. Exit kar rahe hain.")
            sys.exit(0)

    # Remove duplicates
    handles = list(dict.fromkeys(handles))
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    print(f"\n[*] Total handles to process: {len(handles)}")
    print(f"[*] Photos save folder      : {os.path.abspath(OUTPUT_FOLDER)}")
    print(f"[*] Summary export file     : {SUMMARY_CSV}\n")

    results = []
    success_count = 0
    fail_count = 0

    for i, h in enumerate(handles, 1):
        print(f"[{i}/{len(handles)}] Fetching @{h} ...", end=" ", flush=True)
        data, err = fetch_profile_data(h)

        if err == "RATE_LIMIT":
            print("\n[!] X RATE LIMIT: X ne temporary rok lagayi hai. Kuch der ruk kar dobara chalayein.")
            break
        elif err == "AUTH_EXPIRED":
            print("\n[!] AUTH FAILED: Cookies expire ho chuki hain. Nayi cookies daalein.")
            break
        elif err:
            print(f"[FAILED: {err}]")
            fail_count += 1
            results.append({
                "Handle": h, "Status": "Failed", "Error": err, "Name": "",
                "Photo_URL": "", "Local_File": "", "Followers": 0
            })
        else:
            # Download Photo
            photo_url = data["photo_url"]
            local_filename = f"{h}.jpg"
            local_filepath = os.path.join(OUTPUT_FOLDER, local_filename)

            dl_ok = download_image(photo_url, local_filepath)
            status_text = "Downloaded" if dl_ok else "Photo URL Found (Download Failed)"
            print(f"[OK] -> {data['name']} ({data['followers']:,} followers) -> Saved: {local_filename}")
            success_count += 1

            results.append({
                "Handle": h,
                "Status": status_text,
                "Error": "",
                "Name": data["name"],
                "Photo_URL": photo_url,
                "Local_File": local_filepath if dl_ok else "",
                "Followers": data["followers"]
            })

        time.sleep(SLEEP_DELAY)

    # Export to CSV
    if results:
        keys = ["Handle", "Status", "Name", "Photo_URL", "Local_File", "Followers", "Error"]
        with open(SUMMARY_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(results)

    print("\n" + "=" * 70)
    print(f"  COMPLETE: {success_count} photos downloaded, {fail_count} failed.")
    print(f"  Images Folder: {os.path.abspath(OUTPUT_FOLDER)}")
    print(f"  Summary File : {os.path.abspath(SUMMARY_CSV)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
