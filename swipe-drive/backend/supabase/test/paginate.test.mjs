/* node backend/supabase/test/paginate.test.mjs : match-alerts reads every row past the 1000 row API cap,
   refuses to run on a short read, and the push opens the alerted car. */
import { fetchAll } from '../functions/_shared/paginate.js';
import { pushUrl } from '../functions/_shared/links.js';
let p = 0, f = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? p++ : f++; };
/* fake PostgREST: every response capped at MAX rows, like Supabase's max rows setting */
function fakeDb(tables, { MAX = 1000, lie = 0 } = {}) {
  return { from(t) { const rows = tables[t]; let ord = [], head = false, rng = null;
    const q = { select(c, o) { head = !!(o && o.head); return q; }, order(k) { ord.push(k); return q; }, range(a, b) { rng = [a, b]; return q; },
      then(res) { if (head) return res({ count: rows.length + lie, data: null, error: null });
        let d = rows.slice(); if (ord.length) d.sort((x, y) => { for (const k of ord) { if (x[k] < y[k]) return -1; if (x[k] > y[k]) return 1; } return 0; });
        if (rng) d = d.slice(rng[0], rng[1] + 1); return res({ data: d.slice(0, MAX), error: null }); } }; return q; } }; }
const seen = Array.from({ length: 2500 }, (_, i) => ({ reg: 'AB' + String(i).padStart(5, '0') }));
const custs = ['c1', 'c2', 'c3'], sent = [];
for (const c of custs) for (let i = 0; i < 600; i++) sent.push({ recipient: 'u-' + c, customer_id: c, reg: seen[i].reg, channel: 'push' });
const db = fakeDb({ stock_seen: seen, notifications_sent: sent });
/* the old code: one plain select */
const naive = await new Promise(r => db.from('stock_seen').select('reg').then(r));
ok(naive.data.length === 1000, `fixture shows the bug: a plain select returns ${naive.data.length} of 2500`);
const all = await fetchAll(db, 'stock_seen', 'reg', 'reg');
ok(all.length === 2500 && new Set(all.map(r => r.reg)).size === 2500, `stock_seen paged read gets all ${all.length} rows, no duplicates`);
const stock = seen.slice(0, 2400).map(s => ({ reg: s.reg })).concat([{ reg: 'ZZ26NEW' }]);
const set = new Set(all.map(r => r.reg)); const fresh = stock.filter(c => !set.has(c.reg));
ok(fresh.length === 1 && fresh[0].reg === 'ZZ26NEW', `only the genuinely new car counts as fresh (${fresh.length})`);
const oldSet = new Set(naive.data.map(r => r.reg)); ok(stock.filter(c => !oldSet.has(c.reg)).length === 1401, 'the old read would have alerted 1401 old cars as new');
const s2 = await fetchAll(db, 'notifications_sent', 'recipient,customer_id,reg,channel', ['recipient', 'customer_id', 'reg', 'channel']);
ok(s2.length === 1800, `notifications_sent paged read gets all ${s2.length} rows`);
const done = new Set(s2.map(s => [s.recipient, s.customer_id, s.reg, s.channel].join('|')));
const resend = custs.flatMap(c => seen.slice(0, 600).filter(x => !done.has(['u-' + c, c, x.reg, 'push'].join('|'))));
ok(resend.length === 0, 'dedupe: nothing already sent is sent again');
const oldDone = new Set((await new Promise(r => db.from('notifications_sent').select('*').then(r))).data.map(s => [s.recipient, s.customer_id, s.reg, s.channel].join('|')));
ok(custs.flatMap(c => seen.slice(0, 600).filter(x => !oldDone.has(['u-' + c, c, x.reg, 'push'].join('|')))).length === 800, 'the old read would have re-sent 800 alerts');
ok((await fetchAll(db, 'stock_seen', 'reg', 'reg', 1000)).length === 2500 && (await fetchAll(fakeDb({ stock_seen: seen.slice(0, 1000) }), 'stock_seen', 'reg', 'reg')).length === 1000, 'exactly 1000 rows reads cleanly (one extra empty page)');
let threw = ''; try { await fetchAll(fakeDb({ stock_seen: seen }, { MAX: 700 }), 'stock_seen', 'reg', 'reg'); } catch (e) { threw = e.message; }
ok(/refusing to run/.test(threw), 'guard: a server cap below the page size makes it stop, not run short (' + threw + ')');
threw = ''; try { await fetchAll(fakeDb({ stock_seen: seen }, { lie: 5 }), 'stock_seen', 'reg', 'reg'); } catch (e) { threw = e.message; }
ok(/2500 of 2505/.test(threw), 'guard: fewer rows than the exact count stops the job');
ok((await fetchAll(fakeDb({ stock_seen: [] }), 'stock_seen', 'reg', 'reg')).length === 0, 'empty table is fine (first run seeds)');
/* push link */
const A = 'https://dan-sells.co.uk/swipe-drive/';
ok(pushUrl(A, [{ car: { reg: 'AB12CDE' } }, { car: { reg: 'XY34ZZZ' } }]) === A + '?reg=AB12CDE&src=alert', 'push opens the first alerted car');
ok(pushUrl(A, []) === A && pushUrl(A, [{ car: {} }]) === A, 'no reg falls back to the app');
ok(!pushUrl(A, [{ car: { reg: 'AB12CDE' } }]).includes('#matches'), 'push no longer goes to #matches');
console.log(`RESULT paginate ${p}/${p + f} passed`); process.exit(f ? 1 : 0);
