#!/bin/sh
# Run lock tests against a throwaway local Postgres database.
set -e; D=$(dirname "$0"); cat "$D/supabase-shim.sql" "$D/../schema.sql" > /tmp/ct-all.sql; cp "$D/job-lock-test.sql" /tmp/ct-lock.sql; chmod 644 /tmp/ct-*.sql
sudo -u postgres dropdb --if-exists ctlock; sudo -u postgres createdb ctlock
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d ctlock -f /tmp/ct-all.sql >/dev/null 2>&1
sudo -u postgres psql -q -t -A -d ctlock -f /tmp/ct-lock.sql
