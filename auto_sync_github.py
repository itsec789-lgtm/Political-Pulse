import subprocess
import time
import datetime
import os
import sys

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
CHECK_INTERVAL_SECONDS = 60  # checks GitHub every 60 seconds

def log(msg):
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{now}] {msg}", flush=True)

def run_git(args):
    try:
        res = subprocess.run(
            ['git'] + args,
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=False
        )
        return res.returncode, res.stdout.strip(), res.stderr.strip()
    except Exception as e:
        return -1, "", str(e)

def sync_loop():
    log("GitHub Auto-Sync started.")
    log(f"Monitoring repository: {REPO_DIR}")
    log(f"Polling interval: {CHECK_INTERVAL_SECONDS} seconds.")
    log("Whenever changes are pushed to GitHub, they will be pulled automatically.\n")

    while True:
        try:
            # 1. Fetch latest refs from origin
            rc, out, err = run_git(['fetch', 'origin', 'main'])
            if rc != 0:
                # network or auth hiccup, silently retry next loop
                time.sleep(CHECK_INTERVAL_SECONDS)
                continue

            # 2. Compare local HEAD with origin/main
            _, local_sha, _ = run_git(['rev-parse', 'HEAD'])
            _, remote_sha, _ = run_git(['rev-parse', 'origin/main'])

            if local_sha and remote_sha and local_sha != remote_sha:
                log(f"Detected new changes on GitHub! (remote: {remote_sha[:7]} != local: {local_sha[:7]})")
                log("Pulling latest updates into your local project...")

                # 3. Pull latest commits
                rc_pull, out_pull, err_pull = run_git(['pull', '--no-rebase', 'origin', 'main'])
                if rc_pull != 0 and any(kw in err_pull.lower() for kw in ['divergent', 'conflict', 'reconcile']):
                    log("Notice: Local replica diverged from remote. Auto-aligning with origin/main...")
                    rc_reset, _, _ = run_git(['reset', '--hard', 'origin/main'])
                    if rc_reset == 0:
                        rc_pull = 0

                if rc_pull == 0:
                    _, subject, _ = run_git(['log', '-1', '--pretty=%s'])
                    _, author, _ = run_git(['log', '-1', '--pretty=%an'])
                    log(f"SUCCESS: Synced updates by {author}: '{subject}'")
                    log("Your local project is now 100% up-to-date!\n")
                else:
                    log(f"Notice: Pull returned status {rc_pull}. Detail: {err_pull}")

        except KeyboardInterrupt:
            log("Auto-Sync stopped by user.")
            break
        except Exception as e:
            log(f"Error in sync loop: {e}")

        time.sleep(CHECK_INTERVAL_SECONDS)

if __name__ == '__main__':
    sync_loop()
