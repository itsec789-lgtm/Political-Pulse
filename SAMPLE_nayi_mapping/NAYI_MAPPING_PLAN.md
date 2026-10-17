# Nayi Mapping.xlsx — plan (STEP 1) + sample (STEP 2)

**13-Oct-2026** · abhi tak aapki koi file nahi chhui gayi. Sab kuch alag jagah
par chalakar dekha gaya hai.

---

## 1. Nayi file me hai kya

| | |
|---|---|
| Sheet | `Working Data` (pehle `Sheet1`) |
| Rows | 6,359 |
| Column | 10 — State, **AC No/PC No**, **AC Name/PC Name**, Candidate Name, Gender, **Political Party**, Category, Party Designation, Admin Designation, Twitter Account |
| Alag-alag handle | **5,231** (abhi mapping me 4,330) |
| Twitter ka khaana bhara | 5,352 row · 1,013 row me kuch nahi (ya Insta/FB ka link) |

**Category** (10 saaf value): MLA 4,549 · LSMP 600 · MLC 431 · RSMP 280 ·
MLA Contestent 265 · Top Leaders 74 · NOB 63 · Media Houses 41 · Page 30 ·
Journalist 26

**Admin Designation** — 214 row bhari hui (pehle lagbhag khaali thi)
**Party Designation** — 441 row bhari hui (190 alag-alag pad)

---

## 2. Pehli dikkat: abhi ye file padhi hi nahi jaayegi

Aapke system par `RUN_MAPPING_UPDATE.bat` chalakar dekha —

```
[!] 'Sheet1' nahi mili -- pehli sheet 'Working Data' li ja rahi hai
[!] 'Working Data' me ye column nahi: ['AC/PC No', 'AC/PC NAME'] -- sheet chhodi
Kisi sheet me zaroori column nahi mile.
```

Wajah: header ke naam badal gaye hain — `AC/PC No` → **`AC No/PC No`**,
`AC/PC NAME` → **`AC Name/PC Name`**. Reader me dono naam jod dene hain
(purani Excel bhi chalti rahe), aur sheet `Working Data` bhi.

---

## 3. Admin Designation ki safai (aapka chuna hua tarika)

Ek hi pad kai tarah se likha hai. **Excel bilkul nahi chhui jaayegi** —
safai sirf padhte waqt hoti hai, aur Excel ki asli likhavat
`admin_designation_raw` me jyon ki tyon rehti hai (chip par hover karne se
wahi dikhegi).

| Excel me | Dashboard par |
|---|---|
| `Cabiniet Minister` (41), `Cabinet Minister` (35), `Cabinet` (21) | **Cabinet Minister** |
| `Chief MInister` | **Chief Minister** |
| `Uninon Minister` | **Union Minister** |
| `MOS` (27), `MOS(IC)` (3), `Minister of State` | **Minister of State** |
| `Deputy Chief Minister & MOS` | **Deputy Chief Minister** + **Minister of State** (do chip) |
| bold-unicode / do line wali likhavat | saada text, ek line |

**Jo is list me nahi hai wo jaisa likha hai waisa hi rehta hai.**
`Defence Minister` ko generic "Minister" bana dena jaankari ghataana hai —
isliye wo `Defence Minister` hi rehta hai. `Chairperson, Standing Committee
on RD & Panchayati Raj` bhi poora rehta hai.

Ginti/filter ke liye ek aur khaana banta hai (`admin_group`) —
Cabinet Minister 96 · Minister of State 33 · Chief Minister 32 ·
Deputy Chief Minister 21 · Committee Role 12 · Union Minister 9 · Speaker 5 ·
Other Minister 4 · Prime Minister 1 · Other Admin 1

> Ek baat jo zaroor batani hai: `deputy chief minister` ke andar
> `chief minister` bhi chhupa hai. Bina dhyan ke 53 CM ban jaate the (hain 31).
> Pakda hua hissa mita kar aage badhne se ye theek hua — test me likh diya hai.

---

## 4. Asli dashboard par kya badlega (aapke apne data par naapa gaya)

Ye aankde aapke live blob par server ka **asli** `mapGate()` chalakar nikle hain —
jo yahan likha hai wahi page par dikhega.

| | Abhi | Nayi mapping se |
|---|---|---|
| Dashboard par dikhne wale handle | 3,203 | **3,245** (+42) |
| Mapping me na hone se chhupe handle | 89 | **47** |
| CM | 31 | 31 |
| **Dy CM** | 19 | **21** |
| "Others" level me pade handle | 112 | **96** |
| MLA / MLC / RS MP | 2,209 / 57 / 203 | 2,258 / 63 / 210 |

**Designation ka chip 493 handle par badlega.** Kuch namune:

| Handle | Pehle | Ab |
|---|---|---|
| @AmitShah | LS MP | **Cabinet Minister / LS MP** |
| @DrSJaishankar | RS MP | **Cabinet Minister / RS MP** |
| @KirenRijiju | LS MP | **Cabinet Minister / LS MP** |
| @PawanKalyan | MLA / Deputy Chief Minister | **Deputy Chief Minister / MLA** |
| @RahulGandhi | LS MP | **Leader / LS MP** |
| @yadavakhilesh | LS MP | **President / LS MP** |
| @ysjagan | MLA | **State President / MLA** |
| @rajnathsingh | Defence Minister / LS MP | *(waisa hi)* |

Poori list saath wali CSV me hai: **Designation_Badlav_13Oct.csv** (493 rows,
har row me Excel ka asli text bhi).

---

## 5. Jo main NAHI chhuunga (aapke jawab ke mutabik)

- Koi naya filter / naya section nahi. Parties tab, Top Leaders ke filter,
  Elected Representatives — sab waise ke waise.
- Party Designation handle_master me jaayega (chip me dikhega, jaise
  "National General Secretary / LS MP") par uska apna view nahi banega.
- Bihar: jo Excel me hai wahi chalega — Samrat Chaudhary CM, Nitish Kumar
  CM ke roop me nahi. Main koi naam apne aap nahi badlunga.
- Mapping.xlsx me ek akshar nahi badlega.

---

## 6. Dhyan dene layak baatein (faisla aapka)

**(a) 15 handle dashboard se gayab ho jaayenge** — ye abhi dikhte hain par nayi
mapping me nahi hain (niyam: mapping me nahi = dashboard par nahi):

| Handle | Naam | Views |
|---|---|---|
| @ShayarImran | Imran Pratapgarhi | 1.03 Cr |
| @mp_kaushal | Kaushal Kishore | 8.77 L |
| @mpriteshpandey | Ritesh Pandey | 4.43 L |
| @drsanjeevbalyan | Sanjeev Kumar Balyan | 3.53 L |
| @SadhviNiranjan | Niranjan Jyoti | 3.47 L |
| @R_Lakhanpal, @LalluSinghBJP, @mlagorakhnath, @bpsvermabjp, @DrRamShankarMP, @DrRaghvendrashr, @rkmauryapbh, @AmbrishRawat2, @vineshsanwal, @puneet_inc | | 1.4 L se kam |

Zyadatar wo log hain jo ab MP/MLA nahi rahe. Agar kisi ko rakhna hai to Excel
me uski row jod dijiye — mapping dobara chalte hi wapas aa jaayega.

**(b) 1,013 row ka Twitter khaana khaali hai ya Insta/FB ka link hai** — un
rows ka koi handle nahi banta. 6 row me link to hai par theek nahi
(`Gour Chandra Mandal (@GourChMandal) / Posts / X`, Instagram/Facebook ke
link). Chahein to inki list bana dunga.

**(c) 115 handle ki ek se zyada row hai**, unme 17 ki Category alag-alag hai
(jaise ek row me MLA, doosri me Top Leaders). Code pehle se ek niyam se
chunta hai (abhi wali seat wali row ko tarjeeh) aur `mapping_conflicts.csv`
me poori list likhta hai — ye waise hi chalta rahega.

---

## 7. Kaam ka kram (aapke "haan" ke baad)

1. `rebuild_mapping.py` — header ke naye naam + sheet + Admin Designation ki
   safai (backup ke saath).
2. Dashboard: chip par hover karne se Excel ki **asli** likhavat dikhe.
3. Test: naya `t_newmap.js` (safai ke niyam, CM/Dy CM ki ginti, raw bacha hai
   ya nahi) + poora purana suite (abhi 3,200 jaanch).
4. `UPDATE_07-OCT` package aur `PEHLE_YE_PADHO.txt` update.
5. Aapke main system par: **nayi Mapping.xlsx `Mapping\` folder me rakhiye**,
   phir `DASHBOARD\RUN_MAPPING_UPDATE.bat` — baaki sab apne aap.

---

## STEP 2 — Sample

`SAMPLE_nayi_mapping.html` — ye koi mockup nahi hai: aapka asli data + nayi
mapping, server ke asli `mapGate()` se guzaar kar banaya gaya page. Browser me
kholiye, **Top Leaders** aur **Elected Representatives** tab dekhiye — chip
par "Cabinet Minister / LS MP", "Chief Minister / MLA" waghairah dikhega.
(Chart khaali rahenge — sample internet se chart library nahi laata.)

Dekh kar bataiye, phir asli files par lagata hoon.
