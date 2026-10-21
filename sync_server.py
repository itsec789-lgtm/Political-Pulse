# -*- coding: utf-8 -*-
"""
sync_server.py -- Political Pulse Wi-Fi MongoDB Sync Server
Serves full MongoDB dump (mongo_dump_py.zip) over local Wi-Fi HTTP on port 5050.

Endpoints:
  GET  /            -> High-speed visual sync web dashboard
  GET  /api/status  -> JSON status with Wi-Fi IP, collections, file sizes, ready state
  GET  /api/dump    -> Stream download of mongo_dump_py.zip
  POST /api/export  -> Trigger fresh export from MongoDB in background thread
"""

import os
import sys
import json
import time
import socket
import zipfile
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = 5050
HERE = os.path.dirname(os.path.abspath(__file__))
DUMP_DIR = os.path.join(HERE, "mongo_dump_py")
ZIP_PATH = os.path.join(HERE, "mongo_dump_py.zip")

# Global status tracking
sync_state = {
    "status": "idle",       # "idle", "exporting", "zipping", "ready", "error"
    "message": "Initializing...",
    "progress": 0,
    "last_error": None,
    "zip_size_bytes": 0,
    "zip_mtime": None,
    "started_at": time.time(),
    "dbs": {}
}
state_lock = threading.Lock()

def get_wifi_ip():
    """Detect local Wi-Fi IPv4 address."""
    ip_candidates = []
    
    # Method 1: Outbound socket route check (most reliable on active LAN)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        out_ip = s.getsockname()[0]
        s.close()
        if out_ip and not out_ip.startswith("127."):
            ip_candidates.append(out_ip)
    except Exception:
        pass

    # Method 2: Hostname inspection
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and ip not in ip_candidates:
                ip_candidates.append(ip)
    except Exception:
        pass

    # Method 3: PowerShell Wi-Fi adapter query on Windows
    if sys.platform == "win32":
        try:
            cmd = ['powershell', '-Command', 
                   '(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias *Wi-Fi* -ErrorAction SilentlyContinue).IPAddress']
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            for line in res.stdout.strip().splitlines():
                line = line.strip()
                if line and "." in line and line not in ip_candidates:
                    ip_candidates.insert(0, line)
        except Exception:
            pass

    # Prefer 192.168.x.x or 10.x.x.x
    for ip in ip_candidates:
        if ip.startswith("192.168."):
            return ip
    for ip in ip_candidates:
        if ip.startswith("10.") or ip.startswith("172."):
            return ip

    return ip_candidates[0] if ip_candidates else "127.0.0.1"


def get_dump_summary():
    """Scan mongo_dump_py folder and collect stats."""
    dbs = {}
    total_docs = 0
    total_bytes = 0
    if os.path.isdir(DUMP_DIR):
        for dbn in sorted(os.listdir(DUMP_DIR)):
            db_path = os.path.join(DUMP_DIR, dbn)
            if not os.path.isdir(db_path):
                continue
            colls = []
            for fn in sorted(os.listdir(db_path)):
                if fn.endswith(".jsonl.gz"):
                    fp = os.path.join(db_path, fn)
                    sz = os.path.getsize(fp)
                    total_bytes += sz
                    c_name = fn[:-len(".jsonl.gz")]
                    colls.append({
                        "collection": c_name,
                        "file": fn,
                        "size_mb": round(sz / (1024 * 1024), 2)
                    })
            dbs[dbn] = {
                "collections": colls,
                "collection_count": len(colls)
            }
    return dbs, total_bytes


def package_zip():
    """Package mongo_dump_py directory into mongo_dump_py.zip using stored mode (already gzipped)."""
    global sync_state
    if not os.path.isdir(DUMP_DIR):
        with state_lock:
            sync_state["status"] = "error"
            sync_state["message"] = "mongo_dump_py directory not found. Please export first."
        return False

    with state_lock:
        sync_state["status"] = "zipping"
        sync_state["message"] = "Packaging mongo_dump_py into mongo_dump_py.zip..."

    print("\n[*] Packaging mongo_dump_py into zip archive...", flush=True)
    t0 = time.time()
    tmp_zip = ZIP_PATH + ".tmp"
    
    try:
        # Files are already gzip-compressed; use ZIP_STORED for near-instant 0-overhead packaging
        with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_STORED) as zf:
            for root, _, files in os.walk(DUMP_DIR):
                for f in files:
                    fp = os.path.join(root, f)
                    arcname = os.path.relpath(fp, HERE)
                    zf.write(fp, arcname)

        if os.path.exists(ZIP_PATH):
            os.remove(ZIP_PATH)
        os.rename(tmp_zip, ZIP_PATH)

        sz = os.path.getsize(ZIP_PATH)
        elapsed = time.time() - t0
        dbs, _ = get_dump_summary()

        with state_lock:
            sync_state["status"] = "ready"
            sync_state["message"] = f"Database zip ready ({round(sz / (1024*1024), 1)} MB in {round(elapsed, 1)}s)"
            sync_state["zip_size_bytes"] = sz
            sync_state["zip_mtime"] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(ZIP_PATH)))
            sync_state["dbs"] = dbs

        print(f"[+] Zip package complete! Size: {round(sz / (1024*1024), 1)} MB, Duration: {round(elapsed, 1)}s\n", flush=True)
        return True

    except Exception as e:
        if os.path.exists(tmp_zip):
            try:
                os.remove(tmp_zip)
            except Exception:
                pass
        with state_lock:
            sync_state["status"] = "error"
            sync_state["last_error"] = str(e)
            sync_state["message"] = f"Failed to create zip: {e}"
        print(f"[-] Zip packaging failed: {e}", flush=True)
        return False


def run_mongo_export_sync():
    """Run python mongo_backup.py and re-package zip."""
    global sync_state
    with state_lock:
        sync_state["status"] = "exporting"
        sync_state["message"] = "Exporting complete MongoDB databases via mongo_backup.py..."

    print("\n[*] Starting MongoDB export via mongo_backup.py...", flush=True)
    backup_script = os.path.join(HERE, "mongo_backup.py")
    
    if not os.path.exists(backup_script):
        with state_lock:
            sync_state["status"] = "error"
            sync_state["message"] = "mongo_backup.py not found in project root"
        return

    try:
        proc = subprocess.run([sys.executable, backup_script], cwd=HERE, capture_output=True, text=True)
        if proc.returncode != 0:
            err_msg = proc.stderr.strip() or proc.stdout.strip()
            with state_lock:
                sync_state["status"] = "error"
                sync_state["message"] = f"mongo_backup.py failed: {err_msg[:200]}"
            print(f"[-] Export error: {err_msg}", flush=True)
            return

        print("[+] MongoDB export finished successfully. Now packaging zip...", flush=True)
        package_zip()
    except Exception as e:
        with state_lock:
            sync_state["status"] = "error"
            sync_state["message"] = f"Export exception: {e}"
        print(f"[-] Export exception: {e}", flush=True)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class SyncHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Clean logging format
        print(f"[{time.strftime('%H:%M:%S')}] {self.client_address[0]} - {format % args}", flush=True)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        url_path = self.path.split("?")[0].rstrip("/")

        # 1. API: /api/status
        if url_path == "/api/status":
            self.handle_api_status()
            return

        # 2. API: /api/dump (Download endpoint)
        if url_path == "/api/dump":
            self.handle_api_dump()
            return

        # 3. API: /api/export (Trigger fresh export)
        if url_path == "/api/export":
            threading.Thread(target=run_mongo_export_sync, daemon=True).start()
            self.send_response(202)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {"ok": True, "message": "MongoDB export triggered in background"}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        # 4. Web Dashboard UI: /
        if url_path == "" or url_path == "/index.html":
            self.handle_web_ui()
            return

        # 404 for other endpoints
        self.send_response(404)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        url_path = self.path.split("?")[0].rstrip("/")
        if url_path == "/api/export":
            threading.Thread(target=run_mongo_export_sync, daemon=True).start()
            self.send_response(202)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {"ok": True, "message": "MongoDB export triggered in background"}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def handle_api_status(self):
        wifi_ip = get_wifi_ip()
        dbs, _ = get_dump_summary()
        zip_exists = os.path.exists(ZIP_PATH)
        zip_size = os.path.getsize(ZIP_PATH) if zip_exists else 0

        with state_lock:
            status_val = sync_state["status"]
            msg_val = sync_state["message"]
            err_val = sync_state["last_error"]

        data = {
            "server": "PoliticalPulse-MongoSync",
            "status": status_val,
            "message": msg_val,
            "error": err_val,
            "wifi_ip": wifi_ip,
            "port": PORT,
            "download_url": f"http://{wifi_ip}:{PORT}/api/dump",
            "zip_ready": zip_exists and status_val != "zipping",
            "zip_size_bytes": zip_size,
            "zip_size_mb": round(zip_size / (1024 * 1024), 2),
            "databases": dbs,
            "total_databases": len(dbs),
            "instructions": {
                "step1": f"Download zip: http://{wifi_ip}:{PORT}/api/dump",
                "step2": "Extract 'mongo_dump_py' into your 'Main Twitter Project' folder",
                "step3": "Run command: python mongo_backup.py --restore"
            }
        }

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))

    def handle_api_dump(self):
        if not os.path.exists(ZIP_PATH):
            self.send_response(404)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = {"error": "Zip dump not found. Server may still be packaging. Check /api/status."}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        with state_lock:
            if sync_state["status"] == "zipping":
                self.send_response(503)
                self.send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                resp = {"error": "Zip is currently being updated. Please retry in 5 seconds."}
                self.wfile.write(json.dumps(resp).encode("utf-8"))
                return

        file_size = os.path.getsize(ZIP_PATH)
        filename = "mongo_dump_py.zip"

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(file_size))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        print(f"[*] Starting high-speed streaming of {round(file_size / (1024*1024), 1)} MB to {self.client_address[0]}...", flush=True)
        chunk_size = 1024 * 1024  # 1MB buffer
        bytes_sent = 0
        t0 = time.time()
        
        try:
            with open(ZIP_PATH, "rb") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    bytes_sent += len(chunk)
            
            elapsed = time.time() - t0
            speed_mb = (bytes_sent / (1024 * 1024)) / max(elapsed, 0.01)
            print(f"[+] Successfully sent {round(bytes_sent / (1024*1024), 1)} MB in {round(elapsed, 1)}s ({round(speed_mb, 1)} MB/s) to {self.client_address[0]}", flush=True)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            print(f"[-] Client {self.client_address[0]} cancelled download midway.", flush=True)
        except Exception as e:
            print(f"[-] Stream error: {e}", flush=True)

    def handle_web_ui(self):
        wifi_ip = get_wifi_ip()
        zip_size_mb = round(os.path.getsize(ZIP_PATH) / (1024 * 1024), 1) if os.path.exists(ZIP_PATH) else 0
        dbs, _ = get_dump_summary()

        db_cards_html = ""
        for dbn, dinfo in dbs.items():
            colls_badges = " ".join([f'<span class="badge">{c["collection"]} ({c["size_mb"]} MB)</span>' for c in dinfo["collections"][:8]])
            if len(dinfo["collections"]) > 8:
                colls_badges += f' <span class="badge badge-more">+{len(dinfo["collections"]) - 8} more</span>'
            db_cards_html += f"""
            <div class="db-card">
              <div class="db-title">
                <span class="db-icon">&#128451;</span> {dbn}
                <span class="db-count">{dinfo["collection_count"]} collections</span>
              </div>
              <div class="badges-wrap">{colls_badges}</div>
            </div>
            """

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Political Pulse - MongoDB Wi-Fi Sync</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #090d16;
      --card-bg: rgba(22, 29, 47, 0.85);
      --card-border: rgba(56, 189, 248, 0.2);
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --accent: #10b981;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --font-main: 'Outfit', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, var(--bg) 70%);
      color: var(--text);
      font-family: var(--font-main);
      min-height: 100vh;
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }}
    .container {{
      max-width: 900px;
      width: 100%;
    }}
    .header {{
      text-align: center;
      margin-bottom: 35px;
    }}
    .badge-status {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 16px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }}
    .pulse-dot {{
      width: 8px;
      height: 8px;
      background: #34d399;
      border-radius: 50%;
      box-shadow: 0 0 10px #34d399;
      animation: pulse 1.5s infinite;
    }}
    @keyframes pulse {{
      0% {{ transform: scale(0.95); opacity: 0.8; }}
      50% {{ transform: scale(1.3); opacity: 1; }}
      100% {{ transform: scale(0.95); opacity: 0.8; }}
    }}
    h1 {{
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, #ffffff 30%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
    }}
    .subtitle {{
      color: var(--text-muted);
      font-size: 1.05rem;
    }}
    .main-card {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 35px;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      margin-bottom: 30px;
      text-align: center;
    }}
    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
      text-align: left;
    }}
    .meta-item {{
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 15px 20px;
      border-radius: 12px;
    }}
    .meta-label {{
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }}
    .meta-val {{
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      font-family: var(--font-mono);
    }}
    .btn-download {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #fff;
      text-decoration: none;
      padding: 18px 42px;
      font-size: 1.25rem;
      font-weight: 700;
      border-radius: 14px;
      box-shadow: 0 10px 25px rgba(2, 132, 199, 0.4);
      transition: all 0.2s ease;
      cursor: pointer;
      border: none;
      width: 100%;
      max-width: 480px;
    }}
    .btn-download:hover {{
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      transform: translateY(-2px);
      box-shadow: 0 15px 30px rgba(14, 165, 233, 0.5);
    }}
    .btn-download:active {{
      transform: translateY(1px);
    }}
    .direct-url {{
      margin-top: 15px;
      font-size: 0.9rem;
      color: var(--text-muted);
    }}
    .direct-url a {{
      color: var(--primary);
      text-decoration: none;
    }}
    .direct-url a:hover {{
      text-decoration: underline;
    }}
    .section-title {{
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .db-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }}
    .db-card {{
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 14px;
      padding: 20px;
    }}
    .db-title {{
      font-weight: 700;
      font-size: 1.1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }}
    .db-count {{
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 500;
    }}
    .badges-wrap {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }}
    .badge {{
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.2);
      color: #7dd3fc;
      font-size: 0.78rem;
      font-family: var(--font-mono);
      padding: 4px 10px;
      border-radius: 6px;
    }}
    .badge-more {{
      background: rgba(148, 163, 184, 0.1);
      border-color: rgba(148, 163, 184, 0.2);
      color: #cbd5e1;
    }}
    .steps-card {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 30px;
      margin-bottom: 30px;
    }}
    .step {{
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
    }}
    .step-num {{
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #0284c7;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      flex-shrink: 0;
    }}
    .step-content {{
      flex: 1;
    }}
    .step-title {{
      font-weight: 600;
      margin-bottom: 6px;
    }}
    .code-box {{
      background: #020617;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 0.9rem;
      color: #38bdf8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
    }}
    .copy-btn {{
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      font-family: var(--font-main);
    }}
    .copy-btn:hover {{
      background: rgba(255, 255, 255, 0.2);
    }}
    footer {{
      margin-top: auto;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge-status">
        <span class="pulse-dot"></span> Wi-Fi Sync Server Active
      </div>
      <h1>Political Pulse MongoDB Sync</h1>
      <p class="subtitle">High-speed LAN synchronization between Laptop 1 and Laptop 2</p>
    </div>

    <div class="main-card">
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">Host Wi-Fi IPv4</div>
          <div class="meta-val">{wifi_ip}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Sync Port</div>
          <div class="meta-val">{PORT}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Package Size</div>
          <div class="meta-val">{zip_size_mb} MB</div>
        </div>
      </div>

      <a href="/api/dump" class="btn-download" id="downloadBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Download Complete Dump ({zip_size_mb} MB)
      </a>

      <div class="direct-url">
        Direct URL: <a href="http://{wifi_ip}:{PORT}/api/dump">http://{wifi_ip}:{PORT}/api/dump</a>
      </div>
    </div>

    <div class="section-title">&#128450; Packaged MongoDB Databases</div>
    <div class="db-grid">
      {db_cards_html}
    </div>

    <div class="steps-card">
      <div class="section-title" style="margin-top: 0;">&#9889; 1-Minute Setup on Laptop 2</div>
      
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <div class="step-title">Option A: Automated Client Sync (Recommended)</div>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Run this single command on Laptop 2 in the project root to auto-download and restore:</p>
          <div class="code-box">
            <span>python sync_client.py http://{wifi_ip}:{PORT}</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('python sync_client.py http://{wifi_ip}:{PORT}')">Copy</button>
          </div>
        </div>
      </div>

      <div class="step">
        <div class="step-num">2</div>
        <div class="step-content">
          <div class="step-title">Option B: Manual Restore</div>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Click the download button above, unzip <code>mongo_dump_py</code> into project root, then run:</p>
          <div class="code-box">
            <span>python mongo_backup.py --restore</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('python mongo_backup.py --restore')">Copy</button>
          </div>
        </div>
      </div>
    </div>

    <footer>
      Political-Pulse &bull; Central Mongo Sync Server &bull; Port {PORT}
    </footer>
  </div>
</body>
</html>
"""
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))


def start_server(host="0.0.0.0", port=PORT, export_first=False):
    global sync_state

    # 1. Check or prepare zip dump
    if export_first:
        print("[*] Performing fresh MongoDB export before launching server...", flush=True)
        run_mongo_export_sync()
    elif not os.path.exists(ZIP_PATH):
        if os.path.isdir(DUMP_DIR):
            package_zip()
        else:
            print("[*] No existing dump found; running initial export...", flush=True)
            run_mongo_export_sync()
    else:
        sz = os.path.getsize(ZIP_PATH)
        dbs, _ = get_dump_summary()
        with state_lock:
            sync_state["status"] = "ready"
            sync_state["message"] = f"Using existing database zip ({round(sz / (1024*1024), 1)} MB)"
            sync_state["zip_size_bytes"] = sz
            sync_state["zip_mtime"] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(ZIP_PATH)))
            sync_state["dbs"] = dbs

    wifi_ip = get_wifi_ip()
    server = ThreadedHTTPServer((host, port), SyncHandler)

    print("=" * 70, flush=True)
    print("  POLITICAL PULSE - WI-FI MONGODB SYNC SERVER RUNNING", flush=True)
    print("=" * 70, flush=True)
    print(f"  Laptop 1 Wi-Fi IPv4  :  {wifi_ip}", flush=True)
    print(f"  Web Dashboard        :  http://{wifi_ip}:{port}/", flush=True)
    print(f"  Direct Download Link :  http://{wifi_ip}:{port}/api/dump", flush=True)
    print(f"  Status Endpoint      :  http://{wifi_ip}:{port}/api/status", flush=True)
    print(f"  Package Size         :  {round(os.path.getsize(ZIP_PATH) / (1024*1024), 1)} MB", flush=True)
    print("-" * 70, flush=True)
    print("  INSTRUCTIONS FOR LAPTOP 2 (Collaborator):", flush=True)
    print(f"  1. Ensure Laptop 2 is on the same Wi-Fi network.")
    print(f"  2. Open browser at: http://{wifi_ip}:{port}/")
    print(f"     OR on Laptop 2 run:")
    print(f"     python sync_client.py http://{wifi_ip}:{port}")
    print("=" * 70, flush=True)
    print("  Server is listening for connections... (Press Ctrl+C to stop)\n", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Stopping sync server...", flush=True)
        server.server_close()
        print("[+] Sync server stopped.")


if __name__ == "__main__":
    export_flag = "--export" in sys.argv
    p = PORT
    if "--port" in sys.argv:
        try:
            p = int(sys.argv[sys.argv.index("--port") + 1])
        except Exception:
            pass
    start_server(host="0.0.0.0", port=p, export_first=export_flag)
