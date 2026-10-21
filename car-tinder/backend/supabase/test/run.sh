#!/bin/sh
# Runs the RLS tests against a throwaway local Postgres database.
set -e; D=$(dirname "$0"); cat "$D/supabase-shim.sql" "$D/../schema.sql" > /tmp/ct-all.sql; cp "$D/rls-test.sql" /tmp/ct-rls.sql; chmod 644 /tmp/ct-*.sql
sudo -u postgres dropdb --if-exists cttest; sudo -u postgres createdb cttest
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d cttest -f /tmp/ct-all.sql >/dev/null 2>&1
sudo -u postgres psql -q -t -A -d cttest -f /tmp/ct-rls.sql
