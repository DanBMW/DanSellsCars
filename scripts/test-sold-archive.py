#!/usr/bin/env python3
"""Tests automation/sold_archive.py: a sold car's scrape info is kept for 30 days,
cleared if it comes back, and the kinds from different scripts land on one record.
Writes only to a temporary file. Run: python3 scripts/test-sold-archive.py"""
import os, sys, json, tempfile
from datetime import date, timedelta
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'automation'))
import sold_archive as S

n = 0
def ok(c, m):
    global n
    if not c: sys.exit('FAIL: ' + m)
    n += 1

p = os.path.join(tempfile.mkdtemp(), 'arc.json')
d0 = date(2026, 11, 18)
S.keep('details', {'1': {'images': ['a']}, '2': {'images': ['b']}}, {'3'}, d0, p)
S.keep('finance', {'1': {'monthly': 300}}, {'3'}, d0, p)
a = S.load(p)
ok(set(a) == {'1', '2'}, 'both sold cars kept')
ok(a['1']['details'] == {'images': ['a']} and a['1']['finance'] == {'monthly': 300}, 'details and finance on one record')
ok(a['1']['gone'] == '2026-11-18', 'gone is the day it was first found missing')
S.keep('ladder', {'1': {'steps': {}}}, {'3'}, d0 + timedelta(days=5), p)
ok(S.load(p)['1']['gone'] == '2026-11-18', 'a later kind does not move the gone date')
S.keep('details', {}, {'3', '2'}, d0 + timedelta(days=6), p)
ok('2' not in S.load(p), 'a car back in stock leaves the archive')
S.keep('details', {}, set(), d0 + timedelta(days=30), p)
ok('1' in S.load(p), 'still there on day 30')
held, expired = S.keep('details', {}, set(), d0 + timedelta(days=31), p)
ok('1' not in S.load(p) and expired == 1 and held == 0, 'gone after 30 days')
json.dump({'9': {'gone': 'nonsense'}}, open(p, 'w'))
S.keep('details', {}, set(), d0, p)
ok(S.load(p) == {}, 'an unreadable date is let go rather than kept for ever')
open(p, 'w').write('not json')
S.keep('details', {'5': {}}, set(), d0, p)
ok(set(S.load(p)) == {'5'}, 'a damaged file is started again rather than crashing the scrape')
print('sold archive: %d checks ok' % n)
