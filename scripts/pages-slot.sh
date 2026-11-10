#!/usr/bin/env bash
# Wait for a quiet moment before an automated push to main.
#
# Every push to main rebuilds and redeploys the whole GitHub Pages site (about
# two minutes, far longer on a bad day). Pushes that land while a build is
# still running cancel it, and a run of them in the same few minutes is how we
# got 269 cancelled and 21 failed Pages builds between 27 October and
# 10 November 2026. So automated jobs each get their own slot in the hour and
# keep clear of whatever was pushed last:
#
#   :02  eVA appraisals (even hours, Dan's machine)
#   :13  daily-refresh.py single push (07:00, 12:00, 16:00 runs)
#   :18-:26  new-car-quotes.yml
#   :30  Sales Docs order feeds (Dan's machine)
#   :40-:47  daily-lookup.yml
#
# Usage: scripts/pages-slot.sh FROM_MIN TO_MIN [MIN_GAP_SECONDS] [MAX_WAIT_SECONDS]
# Returns 0 when the minute of the hour is within FROM_MIN..TO_MIN, the last
# commit on origin/main is at least MIN_GAP_SECONDS old and no Pages build is
# running. After MAX_WAIT_SECONDS it gives up waiting and returns 0 anyway:
# a late push is better than no push. Never fails the job.
set -u
FROM=${1:?from minute}; TO=${2:?to minute}
GAP=${3:-480}; MAXWAIT=${4:-4200}
REPO=${GITHUB_REPOSITORY:-DanBMW/DanSellsCars}
start=$(date +%s)

pages_busy() {
  # Best effort: needs `pages: read`. Any error counts as not busy.
  [ -n "${GITHUB_TOKEN:-}" ] || return 1
  s=$(curl -fsS -m 15 -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H 'Accept: application/vnd.github+json' \
        "https://api.github.com/repos/$REPO/pages/builds/latest" 2>/dev/null \
      | grep -o '"status": *"[a-z_]*"' | head -1 | sed 's/.*"\([a-z_]*\)"$/\1/')
  [ "$s" = "building" ] || [ "$s" = "queued" ]
}

while :; do
  git fetch -q origin main 2>/dev/null || true
  now=$(date +%s)
  last=$(git log -1 --format=%ct origin/main 2>/dev/null || echo 0)
  min=$((10#$(date -u +%M)))
  waited=$((now - start))
  if [ $waited -ge "$MAXWAIT" ]; then
    echo "pages-slot: waited ${waited}s, pushing anyway"; exit 0
  fi
  if [ "$min" -ge "$FROM" ] && [ "$min" -le "$TO" ] && [ $((now - last)) -ge "$GAP" ]; then
    if pages_busy; then
      echo "pages-slot: a Pages build is running, waiting"
    else
      echo "pages-slot: minute $min, last main commit $((now - last))s ago, go"; exit 0
    fi
  fi
  sleep 30
done
