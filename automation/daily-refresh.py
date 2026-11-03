#!/usr/bin/env python3
"""The 07:00 morning job, run locally with no Claude involved.

    python automation/daily-refresh.py              # full run, commits and pushes
    python automation/daily-refresh.py --no-push    # run everything, commit nothing

Same five parts, same order, same separate commits as the old scheduled task,
so a problem in a later part never costs an earlier one:

  1  stock-snapshot.py            (Ruxley list)           -> commit 1, push
  2  group-stock.py, car-details.py, car-descriptions.py, stock-images.py -> commits, push
  3  finance-post.py --count 3                            -> commit 3, push
  4  stock-finance.py (about 40 min)                      -> commit 4, push
  5  new-stock.py                                         -> commit 5, push

A failed push in part 1 stops the run. Anything else is logged and the run
carries on. A summary is written to logs/ and, if NTFY_TOPIC is set, pushed to
your phone through ntfy.sh (free app, no account needed).

Environment (optional):
  CHROMIUM_PATH  path to chrome.exe / msedge.exe for the finance cards
  NTFY_TOPIC     private topic name for phone notifications
"""
import datetime, json, os, shutil, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PY = sys.executable
# the repo's scripts read and write UTF-8 (pound signs, accents); Windows defaults to cp1252
os.environ['PYTHONUTF8'] = '1'
os.environ['PYTHONIOENCODING'] = 'utf-8'
NO_PUSH = '--no-push' in sys.argv
LITE = '--lite' in sys.argv     # extra runs through the day: no story cards
LOGDIR = os.path.join(REPO, 'logs')
os.makedirs(LOGDIR, exist_ok=True)
STAMP = datetime.datetime.now().strftime('%Y-%m-%d_%H%M')
LOG = open(os.path.join(LOGDIR, 'morning-%s.log' % STAMP), 'w', encoding='utf-8')
REPORT = []          # lines for the summary


def say(msg):
    line = '%s  %s' % (datetime.datetime.now().strftime('%H:%M:%S'), msg)
    print(line, flush=True)
    LOG.write(line + '\n'); LOG.flush()


def run(cmd, timeout=None, cwd=REPO):
    say('$ ' + ' '.join(cmd))
    t = time.time()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=timeout)
    out = (p.stdout or '') + (p.stderr or '')
    LOG.write(out + '\n'); LOG.flush()
    say('  -> exit %d in %ds' % (p.returncode, time.time() - t))
    return p.returncode, out


def script(name, *args, timeout=None):
    return run([PY, os.path.join('automation', name)] + list(args), timeout=timeout)


GIT = shutil.which('git') or r'C:\Program Files\Git\cmd\git.exe'


def git(*args):
    return run([GIT] + list(args))


def quiet_case_dupes():
    """The repo tracks EV.html and ev.html. Windows treats them as one file, so git
    always sees one as modified and refuses to rebase. Mark such files unchanged."""
    rc, out = git('ls-files')
    seen = {}
    for f in out.splitlines():
        seen.setdefault(f.strip().lower(), []).append(f.strip())
    dupes = [f for v in seen.values() if len(v) > 1 for f in v]
    if dupes:
        git('update-index', '--assume-unchanged', *dupes)


def commit_push(paths, message):
    """Commit the given paths (only if they changed) and push to main."""
    git('add', '--', *paths)
    rc, _ = git('diff', '--cached', '--quiet')
    if rc == 0:
        say('  nothing changed for: ' + message)
        return True
    rc, out = git('commit', '-m', message)
    if rc != 0:
        REPORT.append('COMMIT FAILED: ' + message)
        return False
    if NO_PUSH:
        say('  --no-push: committed locally only')
        return True
    for attempt in (1, 2):
        rc, out = git('push', 'origin', 'HEAD:main')
        last_push_out = out
        if rc == 0:
            git('fetch', 'origin', 'main')
            rc2, _ = git('merge-base', '--is-ancestor', 'HEAD', 'origin/main')
            if rc2 == 0:
                return True
        # someone (you, from your phone) pushed in between: rebase and retry
        quiet_case_dupes()
        git('pull', '--rebase', '--autostash', '-X', 'theirs', 'origin', 'main')   # in a rebase, 'theirs' is our own replayed commit: this machine's data wins
    REPORT.append('PUSH FAILED: %s -> %s' % (message, tail(last_push_out, 4)))
    return False


def patch_windows_compat():
    """finance-post.py builds its browser URLs as 'file://' + path, which is right
    on Linux and wrong on Windows (file://C:\\dir needs to be file:///C:/dir), so
    the card render fails. Fix it in the working copy only, after the reset
    above and never committed (commits name their paths explicitly). Harmless
    on a file that already uses as_uri()."""
    path = os.path.join(HERE, 'finance-post.py')
    try:
        src = open(path, encoding='utf-8').read()
    except OSError:
        return
    new = src
    for var in ('html_path', 'enc'):
        new = new.replace("'file://' + os.path.abspath(%s)" % var,
                          "__import__('pathlib').Path(os.path.abspath(%s)).as_uri()" % var)
    # The JPEG step re-encodes the screenshot through a second Chrome pass that
    # reads the page back with --dump-dom. Chrome on Windows does not write that
    # to a pipe, so the encode comes back empty. Pillow does the same job.
    marker = "        raise SystemExit('render failed for %s: %s' % (html_path, r.stderr[-400:]))\n"
    if marker in new and 'PIL' not in new:
        new = new.replace(marker, marker + (
            "    try:\n"
            "        from PIL import Image\n"
            "        Image.open(png).convert('RGB').save(jpg_path, 'JPEG', quality=int(JPEG_QUALITY * 100))\n"
            "        os.remove(png)\n"
            "        return\n"
            "    except ImportError:\n"
            "        pass\n"), 1)
    # Chrome on Windows can return before the screenshot file has been written,
    # so the card script sees no PNG and gives up on that car (a different car
    # each time, which is the giveaway). Wait for the file to appear and settle.
    exists = "    if not os.path.exists(png):\n        raise SystemExit('render failed"
    if exists in new and 'dansells-wait' not in new:
        wait = ("    # dansells-wait\n"
                "    for _ in range(40):\n"
                "        if os.path.exists(png) and os.path.getsize(png) > 0:\n"
                "            break\n"
                "        __import__('time').sleep(0.5)\n"
                "    __import__('time').sleep(1.0)\n")
        new = new.replace(exists, wait + exists, 1)
    # If your own Chrome is open, a second headless Chrome on the default
    # profile hands the job to it and exits without writing the screenshot.
    # A private profile directory makes it an independent browser.
    flags = "'--no-sandbox',\n                           '--hide-scrollbars']"
    if flags in new and 'user-data-dir' not in new:
        new = new.replace(flags, "'--no-sandbox',\n                           '--user-data-dir=' + os.path.join(__import__('tempfile').gettempdir(), 'dansells-chrome'),\n                           '--hide-scrollbars']", 1)
    if new != src:
        open(path, 'w', encoding='utf-8', newline='').write(new)
        say('patched finance-post.py for Windows file URLs (working copy only)')
    state = {'file-urls': 'as_uri()' in new, 'wait-for-png': 'dansells-wait' in new,
             'pillow-jpeg': 'from PIL import Image' in new,
             'private-profile': 'user-data-dir' in new}
    say('card patches: ' + ', '.join('%s=%s' % (k, 'yes' if v else 'NO') for k, v in state.items()))


def notify(title, body):
    topic = os.environ.get('NTFY_TOPIC')
    if not topic:
        return
    try:
        req = urllib.request.Request('https://ntfy.sh/' + topic,
                                     data=body.encode('utf-8'),
                                     headers={'Title': title})
        urllib.request.urlopen(req, timeout=20)
    except Exception as e:
        say('notify failed: %s' % e)


def tail(out, n=3):
    return ' / '.join([l for l in out.strip().splitlines() if l.strip()][-n:])


LOCK = os.path.join(LOGDIR, '.run.lock')


def take_lock():
    """Two runs at once would race on the same files and git. A run that is
    still going after 5 hours is treated as dead."""
    if os.path.exists(LOCK) and time.time() - os.path.getmtime(LOCK) < 5 * 3600:
        say('another run is still going (lock file); exiting')
        sys.exit(0)
    open(LOCK, 'w').write(str(os.getpid()))


def drop_lock():
    try:
        os.remove(LOCK)
    except OSError:
        pass


def cards_only():
    """Debug the finance cards in about a minute: patch, run the card script,
    show everything it said. No reset, no commit, no push."""
    if not os.environ.get('CHROMIUM_PATH'):
        for p in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                  r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                  r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'):
            if os.path.exists(p):
                os.environ['CHROMIUM_PATH'] = p
                break
    say('CHROMIUM_PATH = %s' % os.environ.get('CHROMIUM_PATH'))
    patch_windows_compat()
    rc, out = script('finance-post.py', '--count', '3', timeout=1800)
    print(out[-3000:])
    say('cards-only finished with exit code %d' % rc)


def main():
    take_lock()
    say('%s job start (%s)' % ('lite' if LITE else 'full', 'no push' if NO_PUSH else 'live'))
    if not os.environ.get('CHROMIUM_PATH'):
        for p in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                  r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                  r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'):
            if os.path.exists(p):
                os.environ['CHROMIUM_PATH'] = p
                break

    try:
        import PIL  # noqa: F401  (finance card JPEG encoding on Windows)
    except ImportError:
        run([PY, '-m', 'pip', 'install', 'pillow'], timeout=600)

    # always start from exactly what is on GitHub
    git('fetch', 'origin', 'main')
    git('checkout', 'main')
    git('reset', '--hard', 'origin/main')
    quiet_case_dupes()
    patch_windows_compat()

    # ---- PART 1: Ruxley snapshot ---------------------------------------
    rc, out = script('stock-snapshot.py', timeout=600)
    new = [l[4:] for l in out.splitlines() if l.startswith('NEW ')]
    sold = [l[5:] for l in out.splitlines() if l.startswith('SOLD ')]
    warns = [l for l in out.splitlines() if l.startswith('WARN')]
    count = next((l for l in out.splitlines() if l.startswith('parsed')), 'no count line')
    if rc != 0:
        REPORT.append('PART 1 FAILED, snapshot not updated: ' + tail(out))
        say('part 1 failed; later parts still use yesterday\'s snapshot')
    else:
        REPORT.append('Stock: ' + count)
        if not commit_push(['automation/hedin-stock-snapshot.json'],
                           'Daily stock snapshot %s' % datetime.date.today().isoformat()):
            REPORT.append('Part 1 push failed, stopping.')
            return finish()
        # stock-sold / stock-arrivals are produced by .github/workflows/daily-lookup.yml
    for n in new:
        REPORT.append('NEW ARRIVAL: ' + n)
    for s in sold:
        REPORT.append('SOLD: ' + s)
    if warns:
        REPORT.append('%d sanity warnings, see log' % len(warns))

    # ---- PART 2: group stock, details, images --------------------------
    rc, out = script('group-stock.py', timeout=1800)
    REPORT.append('Group stock: ' + ('ok - ' + tail(out, 2) if rc == 0 else 'REFUSED/FAILED - ' + tail(out)))
    if os.path.exists(os.path.join(HERE, 'car-details.py')):
        rc, out = script('car-details.py', timeout=1800)
        if rc != 0:
            REPORT.append('car-details failed: ' + tail(out))
    desc_ok = False
    if os.path.exists(os.path.join(HERE, 'car-descriptions.py')):
        rc, out = script('car-descriptions.py', timeout=1800)
        desc_ok = rc == 0
        if rc != 0:
            REPORT.append('car-descriptions failed, file left as it was: ' + tail(out))
    if os.path.exists(os.path.join(HERE, 'stock-images.py')):
        rc, out = script('stock-images.py', timeout=1800)
        if rc != 0:
            REPORT.append('stock-images failed: ' + tail(out))
    commit_push(['automation/hedin-group-stock.json', 'automation/car-details.json',
                 'automation/hedin-stock-snapshot.json'],
                'Daily group stock, details and images')
    if desc_ok:
        commit_push(['automation/car-descriptions.json'], 'Daily car descriptions')

    # ---- PART 3: finance story cards (once a day only: the morning run) --
    if LITE:
        say('lite run: skipping finance cards')
    else:
        rc, out = script('finance-post.py', '--count', '3', timeout=1800)
        made = sum(1 for l in out.splitlines() if l.lower().startswith(('wrote', 'made', 'card')))
        REPORT.append('Finance cards: ' + ('ok - ' + tail(out, 3) if rc == 0 else 'FAILED - ' + tail(out)))
        if rc == 0:
            commit_push(['finance-posts', 'automation/finance-post-log.json'],
                        'Daily finance story cards')

    # ---- PART 4: finance quotes for the stock list ---------------------
    rc, out = script('stock-finance.py', timeout=4 * 3600)
    REPORT.append('Stock quotes: ' + ('ok - ' + tail(out, 3) if rc == 0 else 'FAILED - ' + tail(out)))
    if rc == 0:
        commit_push(['automation/stock-finance.json', 'automation/stock-finance-ladder.json'],
                    'Daily stock list finance quotes')

    # ---- PART 5: new car list ------------------------------------------
    if os.path.exists(os.path.join(HERE, 'new-stock.py')):
        rc, out = script('new-stock.py', timeout=1800)
        REPORT.append('New cars: ' + ('ok - ' + tail(out, 2) if rc == 0 else 'FAILED - ' + tail(out)))
        if rc == 0:
            commit_push(['lookup'], 'Daily new car list')

    finish()


def finish():
    failed = any('FAIL' in r or 'REFUSED' in r or 'CRASH' in r for r in REPORT)
    drop_lock()
    title = ('Stock refresh: ' if LITE else 'Morning stock job: ') + ('CHECK' if failed else 'done')
    body = '\n'.join(REPORT)
    say('\n' + title + '\n' + body)
    notify(title, body[:3500])


if __name__ == '__main__':
    if '--cards-only' in sys.argv:
        cards_only()
        sys.exit(0)
    try:
        main()
    except Exception as e:                      # never die silently
        REPORT.append('CRASH: %r' % e)
        finish()
        raise
