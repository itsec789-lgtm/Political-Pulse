# All-India + UP Pipeline — Spec (SAVE / yaad rakhne ke liye)

## 1. Handle = PRIMARY KEY
Sab kuch Handle par tika hai. Mapping: `data/handle_master.json` (3,102 handles).
Har handle ke against: name, state, party, category, **designations (multi-list)**,
levels (derived), ac_pc_no, ac_name, pc_name, location, status, tweet_url, profile_url.

## 2. INPUT CONTRACT — user sirf ye columns dega (Handle se Sentiment tak)
```
Handle, Tweet URL, Tweet ID, Tweet Date, Tweet Text, Followers, Followings,
Date of Joining, Total Posts, Total Comments, Total Likes, Total Retweets,
Total Views, Total Bookmark Tweets Times, Sentiment, Sentiment Score
```
Ye tweet-level data hai. **Baaki columns user NAHI dega.**

## 3. MAPPING se bharne wale columns (Handle par join karke)
Ye `handle_master.json` se aayenge — kabhi user se nahi:
```
State, Locations, AC/PC No, AC Name, PC Name, Designation(s),
Candidate Name, Category, Party, Status
```
Rule:
- Har incoming tweet ka Handle lo -> mapping me dekho -> ye attributes bhar do.
- **Multi-designation preserve** (MLA + CM/DCM/MP alag-alag). MLA filter par MLA wale
  (chahe CM bhi ho) dikhein; leader-tab par saari designations dikhein.
- Category aur Designation/Level DONO alag rakhne hain.

## 4. NAYA HANDLE (mapping me nahi mila)
- Auto-add karo mapping me. Jo attribute incoming file me ho (agar ho) use lo;
  warna URL/naam se best-effort, ya "Unmapped" mark + review-list. **Data miss na ho.**
- handle_master.json update ho jaaye.

## 5. EK MASTER -> DONO DASHBOARD
- Ek hi All-India master banega.
- **All-India dashboard** = poora data.
- **UP dashboard** = usi master ka filtered view (`State == 'Uttar Pradesh'`).
- IMPORTANT: jab All-India par 30-min wala push chalega, **UP wala apne aap
  filtered view me update ho jaayega** — alag se kuch nahi karna.

## 6. PHASES
- Phase 1 (DONE): mapping ban gayi (All-India Apr1–Jul1 + UP merge).
- Phase 2 (manual): user July1 -> aaj tak ka merged Excel dega -> MANUAL push
  (dashboard aaj tak current). Naye handle mapping me add.
- Phase 3 (automation): August ke baad ki files -> 30-min auto-update (jaise UP).
  Login-scope: email ke hisaab se All-India ya UP (ya state) dashboard.

## 6.5 DATA FACTS (verified 11-Aug — confusion se bachne ke liye)
- "RT @..." (retweet) rows me Likes=0, Comments=0 (aur aksar Views=0) hona
  NORMAL hai — ORIGINAL source file me hi aise hai (100% RT rows, 2.42L rows).
  RT par metrics original tweet ke hote hain, RT karne wale ke nahi.
- 0 = source me hi 0 tha.  BLANK = woh column us row ke ingest me read nahi hua tha
  (Tweet ID/DOJ/Posts/Comments/Bookmarks/Score — fix ke baad full-rescan se bhar jaate hain).
- Raw files se ab Handle -> Sentiment(Score) tak SAARE columns padhte hain;
  State..Party hamesha mapping se.

## 7. Multi-value defaults
- Party / State agar ek handle ke do-do -> primary (most frequent).
- Designations -> hamesha multi (list).
- Category "Top Leaders"/"Page" -> level-filter me "Others".
