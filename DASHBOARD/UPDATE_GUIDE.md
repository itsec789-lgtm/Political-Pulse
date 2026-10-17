# Dashboard Data Update — Guide

`update_dashboard.py` = nayi CSV se dashboard ka data refresh karne wala script.
**Test kiya gaya hai** aapki April1–July1 CSV par — totals, levels, daily, handles sab **exact match** ✅.

---

## Ek baar setup
```
pip install pandas pymongo
```

## Chalाना (2 tareeke)

**A) Sirf files banao (safe — pehle check karo):**
```
python update_dashboard.py "C:\path\to\data.csv"
```
Ye nayi JSON files bana dega (dashboard_data, phd, handles, mapping). Compass se import kar lena.

**B) Seedha MongoDB me push karo (ek command me sab):**
```
python update_dashboard.py "C:\path\to\data.csv" --push
```
Ye seedha `india_pulse` ke `handles`, `phd`, `mapping`, `dashboard_data` update kar dega.
Phir browser me **http://localhost:3000/refresh** → reload. 🎉

---

## Abhi ye "FULL recompute" hai

Matlab: aap jo CSV doge, **usi se poora data banega**. Toh abhi aapko **poora (cumulative) data** dena hai:
- July 8 tak update karna hai → **April1–July8 wali poori CSV** do.

Ye chhoti-chhoti April1–July1 wali file se test-verified hai aur bilkul sahi kaam karta hai.

---

## Incremental banana (sirf naye din dena) — agla step

Agar aap chahte ho ki **sirf naye din** (July2–8) do, poora nahi — to hume ek **accumulator** chahiye
jo purana + naya jod ke rakhe (Tweet ID se duplicate hataake). Do options:

1. **Master CSV (disk pe)** — ek `master_tweets.csv` file jisme sab jama ho; update = naya append + dedupe → recompute. MongoDB chhota rehta hai. *(Recommended)*
2. **`tweets` collection (MongoDB me)** — saare raw tweets MongoDB me; size badhega.

Ye incremental layer main add kar sakta hoon — bolna.

---

## Kya preserve hota hai (taaki dashboard na toote)

Script **numbers recompute** karta hai (tweets, views, likes, sentiment, daily, level/party/state totals),
par **level classification aur curated structure** (CM_DATA, roles, viral selections) current `dashboard_data`
se **preserve** karta hai. Isiliye levels exact match karte hain.

> ⚠️ Pehli baar chalane ke baad **dashboard zaroor check karo**. Koi number/section match na kare to
> Data Team ko batao — us hisse ko tune kar denge.
