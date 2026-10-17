# Cloudflare Tunnel Setup — localhost:3000 ko public URL

## TAREEKA A — Quick test (bina domain, 2 minute, free)

1. **cloudflared download karo:**
   https://github.com/cloudflare/cloudflared/releases/latest
   → `cloudflared-windows-amd64.exe` download karo
   → rename karke `cloudflared.exe` karo
   → `C:\cloudflared\` folder bana kar usme rakho

2. **Dashboard server chalu ho** (START_LIVE.bat ya npm start)

3. **CMD kholo, ye chalao:**
   ```
   C:\cloudflared\cloudflared.exe tunnel --url http://localhost:3000
   ```

4. Window me ek URL dikhega:
   ```
   https://kuch-random-naam.trycloudflare.com
   ```
   Bas — ye URL kisi ko bhi do, dashboard khul jaayega (login ke saath).

   NOTE: Ye URL har baar naya banta hai (window band = URL khatam).
   Fixed URL chahiye to Tareeka B.

---

## TAREEKA B — Custom domain, FIXED URL (recommend)

### Step 1: Domain kharido (agar nahi hai)
- Cloudflare Registrar / Namecheap / GoDaddy — koi bhi (~Rs.100-800/saal)
- Naam kuch bhi: jaise `jarvispulse.com`

### Step 2: Cloudflare account + domain add
1. https://dash.cloudflare.com par free account banao
2. "Add a Site" → apna domain daalo → Free plan
3. Cloudflare do **nameservers** dega (jaise `bob.ns.cloudflare.com`)
4. Jahan se domain kharida (Namecheap/GoDaddy), wahan ke panel me
   nameservers ko Cloudflare wale se REPLACE karo
5. 5 min - 24 hr me domain "Active" ho jaayega Cloudflare me

### Step 3: Tunnel banao (ek baar, CMD me)
```
C:\cloudflared\cloudflared.exe tunnel login
```
(browser khulega -> Cloudflare login -> apna domain select)

```
C:\cloudflared\cloudflared.exe tunnel create pulse
```
(tunnel ban gaya, ek ID milegi)

```
C:\cloudflared\cloudflared.exe tunnel route dns pulse pulse.APNADOMAIN.com
```
(APNADOMAIN.com ki jagah apna domain — ye subdomain jod dega)

### Step 4: Config file banao
File: `C:\Users\arpan\.cloudflared\config.yml`  (notepad se banao)
```yaml
tunnel: pulse
credentials-file: C:\Users\arpan\.cloudflared\<TUNNEL-ID>.json
ingress:
  - hostname: pulse.APNADOMAIN.com
    service: http://localhost:3000
  - service: http_status:404
```
(<TUNNEL-ID>.json wahi file jo `tunnel create` ne banayi — us folder me dikh jaayegi)

### Step 5: Chalao
```
C:\cloudflared\cloudflared.exe tunnel run pulse
```
Ab **https://pulse.APNADOMAIN.com** par dashboard live — fixed URL, HTTPS ke saath.

### Step 6 (optional): Windows service — boot par khud chale
Admin CMD me:
```
C:\cloudflared\cloudflared.exe service install
```
Ab machine on hote hi tunnel khud chalu (window kholne ki zaroorat nahi).

---

## Yaad rakhna
- Machine ON + server (npm start/START_LIVE) chalu hona zaroori hai —
  machine band = URL down.
- Login system laga hai isliye bahar wale bina password nahi ghus sakte.
- START_LIVE.bat + tunnel service dono chalu = public URL par live dashboard,
  har ghante auto-update, browser auto-refresh.
