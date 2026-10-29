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

    last_problem = None

    def problem(msg):
        # same problem every minute -> print it once, not 60 times an hour
        nonlocal last_problem
        if msg != last_problem:
            log(msg)
            last_problem = msg

    while True:
        try:
            # 1. Fetch latest refs from origin
            rc, out, err = run_git(['fetch', 'origin', 'main'])
            if rc != 0:
                problem(f"WARNING: git fetch fail hua (internet / GitHub login?). Detail: {err}")
                time.sleep(CHECK_INTERVAL_SECONDS)
                continue

            # 2. How far ahead / behind origin/main are we?
            _, counts, _ = run_git(['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
            ahead, behind = (int(x) for x in counts.split())

            if behind == 0 and ahead == 0:
                last_problem = None
            else:
                # This folder is a mirror of GitHub main. Anything local that
                # would get in the way is saved first (stash / backup branch),
                # never thrown away.
                stamp = datetime.datetime.now().strftime('%Y-%m-%d_%H%M')
                log(f"GitHub par {behind} naye commit (yahan {ahead} extra). Syncing...")

                # 3. Local edits in files GitHub also changed -> stash only those
                _, dirty, _ = run_git(['diff', '--name-only', 'HEAD'])
                _, incoming, _ = run_git(['diff', '--name-only', 'HEAD', 'origin/main'])
                blocking = sorted(set(dirty.split('\n')) & set(incoming.split('\n')) - {''})
                if blocking:
                    rc_st, _, err_st = run_git(['stash', 'push', '-m', f'auto-sync local edits {stamp}', '--'] + blocking)
                    if rc_st != 0:
                        problem(f"ERROR: local edits stash nahi hue -- sync ruk gaya. {err_st}")
                        time.sleep(CHECK_INTERVAL_SECONDS)
                        continue
                    log(f"Local edits stash me rakhe ('git stash list'): {', '.join(blocking)}")

                # 4. Local-only commits -> keep them on a backup branch
                if ahead:
                    backup = f'backup/auto-sync-{stamp}'
                    run_git(['branch', backup, 'HEAD'])
                    log(f"{ahead} local-only commit backup branch me rakhe: {backup}")

                # 5. Move to origin/main; --keep leaves other uncommitted edits alone
                _, old_head, _ = run_git(['rev-parse', 'HEAD'])
                _, gone, _ = run_git(['diff', '--name-only', '--diff-filter=D', 'HEAD', 'origin/main'])
                rc_sync, _, err_sync = run_git(['reset', '--keep', 'origin/main'])

                # GitHub "stopped tracking" a file (secrets moved to .gitignore):
                # git deletes it here too, so put the local copy back.
                if rc_sync == 0 and gone:
                    _, ignored, _ = run_git(['check-ignore', '--no-index'] + gone.split('\n'))
                    if ignored:
                        run_git(['restore', '--source', old_head, '--worktree', '--'] + ignored.split('\n'))
                        log(f"Untracked kiye gaye files wapas rakhe: {', '.join(ignored.split())}")

                if rc_sync == 0:
                    last_problem = None
                    _, subject, _ = run_git(['log', '-1', '--pretty=%s'])
                    _, author, _ = run_git(['log', '-1', '--pretty=%an'])
                    log(f"SUCCESS: Synced updates by {author}: '{subject}'")
                    log("Your local project is now 100% up-to-date!\n")
                else:
                    problem("ERROR: Sync nahi hua -- kuch nahi badla.\n"
                            f"  {err_sync}")

        except KeyboardInterrupt:
            log("Auto-Sync stopped by user.")
            break
        except Exception as e:
            log(f"Error in sync loop: {e}")

        time.sleep(CHECK_INTERVAL_SECONDS)

if __name__ == '__main__':
    sync_loop()
