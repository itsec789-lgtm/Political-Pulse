# Dusre system par poora replica (data + dashboards + pipelines)

## 1. Is (asli) laptop par: fresh dump banao
`DASHBOARD\scratch\run\54_make_dump.bat` double-click (ya project root me `MAKE_DUMP.bat`).
- Mongo ko sirf **padhta** hai, chalta dashboard safe hai. 20–40 minute.
- Naya dump `mongo_dump_py\` me aata hai. Pehle poora `mongo_dump_py_NEW` me banta hai, tab hi asli naam leta hai.
  Purana dump hataya nahi jaata, wo `C:\mongo_dump_py_OLD_<time>` me chala jaata hai (project ke bahar).
- Saath me `_manifest.json` (har collection ki ginti) aur `_state\auto_state.json` (kaun si network files ho chuki) bhi bantey hain.

## 2. Folder copy
Poora `Main Twitter Project` folder (mongo_dump_py samet) dusre system par copy karo.
`node_modules` chhod sakte ho, setup khud bana lega.

> Folder me `db_config.local.json` (Atlas password), `ai_config.json` jaisi files hain. Sirf apne hi system par le jao.

## 3. Dusre system par (pehle se install: Python 3.10+, Node.js 18+, MongoDB)
`REPLICA_SETUP.bat` double-click.
1. Pehle `--check`: dikhata hai wahan ki Mongo me kya hai, kya hategi. **Kuch nahi hatata.**
2. Phir tum `CLEAN` likhte ho tabhi aage badhta hai.
3. Hatata hai: `pulse_master`, `india_Pulse`, `up_pulse`, `political_lens` (aur `pulse_hot`, `pulse_hot_test` agar wahan hon).
   Baaki databases nahi chhuta. `--wipe-all` do to admin/config/local chhodkar saari user databases hategi.
4. **Wahan ka MongoDB ID/password:** `admin` database ko kabhi nahi chhuta. Agar copy ke saath aayi `db_config.json` ke
   kaaran connection fail ho (auth chahiye), to setup khud tumse wahi ID/password poochhta hai (screen par nahi dikhta)
   aur sirf `db_config.json` me likhta hai.
5. **Wahan ke dashboard login** (`pulse_master.portal_users`): hatane se pehle `replica_keep\` me save, restore ke baad wapas.
   Wahan pehle koi login nahi tha to dump wale (asli laptop ke) login rahte hain.
6. Dump se saari collection wapas, index bhi. Phir `auto_state.json`, python path wali `.bat` files, role = secondary.
7. Ginti dump ki `_manifest.json` se milayi jaati hai (`SAB BARABAR` aana chahiye), phir dashboard ka data jaancha jaata hai.
8. `START_LIVE.bat` khud chalta hai: server + har ghante wahi pipeline.

## Dhyan rakhne wali baatein
- **Atlas HOT / Nazar push replica par bhi CHALU** rehta hai (config jaisi asli laptop par hai). Dono system ek hi Atlas (`pulse_hot`)
  par push karenge: data ek jaisa hota hai, par ek saath likhne par Nazar kabhi-kabhi thodi der purana dikh sakta hai.
  Band karna ho: `python REPLICA_SETUP.py --no-hot`.
- **Role = secondary:** network par master CSV / backup nahi likhta (sirf asli laptop likhta hai). Baaki pipeline poori chalti hai.
- **Scraper folder** `\\192.168.2.85\d\Social Media` us system se dikhna chahiye, warna naya data nahi aayega
  (purana data aur dashboard chalenge). Setup step 3b me batata hai.
- `START_LIVE.bat` me ngrok ka wahi domain hai: dono system par ek saath chalane se tunnel ka error aayega.
  Replica par ngrok ki line hata do ya alag domain do.
- Dobara chalana safe hai: beech me ruk gaya to phir chalao, wahan ke login `replica_keep\` me safe rehte hain.
