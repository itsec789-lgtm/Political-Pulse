# Incremental Update Guide (sirf naye din ka data)

Ab aapko har baar poora data nahi dena. Bas naye din ki CSV.

## Pehli baar (SIRF EK BAAR) - master banao
Apni poori April1..July1 wali CSV se:
```
cd "C:\Users\arpan\Claude\Projects\X\DASHBOARD"
python update_add.py "C:\path\April1_July1.csv" --init --push
```
Ye `data/master_tweets.csv` bana dega (sab tweets store) + MongoDB update.

## Uske baad (har update) - sirf naye din
Jaise July 2..8 ka data aaya:
```
python update_add.py "C:\path\July2_July8.csv" --push
```
- Ye naye din master me jod deta hai
- Tweet URL se DUPLICATE khud hata deta hai (galti se overlapping din de diye to bhi safe)
- Poora recompute (CM_DATA, hashtags, charts, loader - SAB) + MongoDB update

Phir browser: **localhost:3000** reload (`Ctrl + Shift + R`).

## Zaroori baatein
- `--push` = seedha MongoDB me (koi manual import nahi).
- `--init` sirf PEHLI baar (master banane ke liye). Uske baad mat lagao.
- Dedup key = **Tweet URL** (Tweet ID CSV me kharab/scientific-notation me aata hai).
- `master_tweets.csv` badi file hai (sab tweets) - ise delete mat karo.

## Do scripts ka farak
| Script | Kab |
|---|---|
| `update_add.py` | **Incremental** - sirf naye din (recommend) |
| `update_dashboard.py` | Full - poora cumulative data har baar (purana tareeka) |

Setup: `pip install pandas pymongo`
