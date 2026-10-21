# -*- coding: utf-8 -*-
"""
sync_client.py -- Political Pulse Wi-Fi MongoDB Sync Client (for Laptop 2)
Usage on Laptop 2:
    python sync_client.py http://192.168.0.229:5050
"""

import os
import sys
import time
import json
import zipfile
import subprocess
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))

def print_banner():
    print("=" * 65)
    print("  POLITICAL PULSE - WI-FI MONGODB SYNC CLIENT (LAPTOP 2)")
    print("=" * 65)

def sync_from_server(server_url):
    server_url = server_url.rstrip("/")
    status_url = f"{server_url}/api/status"
    dump_url = f"{server_url}/api/dump"

    print(f"[*] Connecting to Sync Server at: {server_url} ...")
    try:
        req = urllib.request.Request(status_url, headers={"User-Agent": "PoliticalPulse-SyncClient"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"\n[!] Cannot connect to Laptop 1 at {server_url}")
        print(f"    Reason: {e.reason}")
        print("    Please verify:")
        print("    1. Laptop 1 and Laptop 2 are connected to the SAME Wi-Fi network.")
        print("    2. 'python sync_server.py' is running on Laptop 1.")
        print(f"    3. IP address and port ({server_url}) are typed correctly.")
        sys.exit(1)
    except Exception as e:
        print(f"\n[!] Unexpected error checking server status: {e}")
        sys.exit(1)

    print(f"[+] Connected successfully!")
    print(f"    Server Status : {data.get('status', 'unknown')}")
    print(f"    Package Size  : {data.get('zip_size_mb', 0)} MB")
    print(f"    Databases     : {', '.join(data.get('databases', {}).keys())}")

    if not data.get("zip_ready"):
        print("\n[*] Server is currently preparing or exporting the database dump.")
        print("    Waiting for package to be ready...")
        while True:
            time.sleep(3)
            try:
                with urllib.request.urlopen(status_url, timeout=5) as resp:
                    st = json.loads(resp.read().decode("utf-8"))
                    if st.get("zip_ready"):
                        print("[+] Package is now ready!")
                        break
                    print(f"    Status: {st.get('message', 'in progress...')}")
            except Exception:
                pass

    zip_target = os.path.join(HERE, "mongo_dump_py.zip")
    print(f"\n[*] Downloading complete database dump to: {zip_target}")
    t0 = time.time()

    try:
        req = urllib.request.Request(dump_url, headers={"User-Agent": "PoliticalPulse-SyncClient"})
        with urllib.request.urlopen(req) as response:
            total_size = int(response.headers.get("Content-Length", 0))
            downloaded = 0
            block_size = 1024 * 1024  # 1MB blocks

            with open(zip_target, "wb") as out_file:
                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    downloaded += len(buffer)
                    out_file.write(buffer)

                    # Progress display
                    elapsed = max(time.time() - t0, 0.01)
                    speed_mb = (downloaded / (1024 * 1024)) / elapsed
                    percent = (downloaded / total_size * 100) if total_size > 0 else 0
                    mb_cur = downloaded / (1024 * 1024)
                    mb_tot = total_size / (1024 * 1024)
                    print(f"\r    Progress: {percent:5.1f}% | {mb_cur:6.1f} / {mb_tot:6.1f} MB | Speed: {speed_mb:5.1f} MB/s", end="", flush=True)

        print("\n[+] Download complete!")
    except Exception as e:
        print(f"\n[!] Download failed: {e}")
        sys.exit(1)

    print("\n[*] Extracting database dump files into project...")
    try:
        with zipfile.ZipFile(zip_target, "r") as zf:
            zf.extractall(HERE)
        print("[+] Extracted 'mongo_dump_py' successfully.")
    except Exception as e:
        print(f"[!] Extraction failed: {e}")
        sys.exit(1)

    # Automatically restore into local MongoDB
    restore_script = os.path.join(HERE, "mongo_backup.py")
    if os.path.exists(restore_script):
        print("\n" + "=" * 65)
        print("  RESTORING COMPLETE MONGODB ON LAPTOP 2")
        print("=" * 65)
        print("[*] Running: python mongo_backup.py --restore ...")
        proc = subprocess.run([sys.executable, restore_script, "--restore"], cwd=HERE)
        if proc.returncode == 0:
            print("\n" + "=" * 65)
            print("  SUCCESS: Laptop 2 MongoDB is 100% synchronized with Laptop 1!")
            print("=" * 65)
        else:
            print(f"\n[!] mongo_backup.py returned exit code {proc.returncode}.")
            print("    You can retry manually: python mongo_backup.py --restore")
    else:
        print("\n[!] mongo_backup.py not found in current folder.")
        print("    Please ensure you are running sync_client.py from 'Main Twitter Project' folder.")


if __name__ == "__main__":
    print_banner()
    if len(sys.argv) >= 2:
        server_url = sys.argv[1].strip()
    else:
        print("\nEnter Laptop 1 Wi-Fi IP or Server URL:")
        print("Default: http://192.168.0.229:5050")
        try:
            inp = input("Server URL [Press Enter for default]: ").strip()
        except Exception:
            inp = ""
        server_url = inp if inp else "http://192.168.0.229:5050"

    if not server_url.startswith("http://") and not server_url.startswith("https://"):
        server_url = "http://" + server_url
    if ":" not in server_url.split("//", 1)[-1]:
        server_url = f"{server_url}:5050"

    sync_from_server(server_url)
