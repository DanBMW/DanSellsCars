/* Read a whole table through PostgREST, which caps every response at 1000 rows (the project's max rows).
   Pages with .range() in a stable order, then checks the total against an exact count so a short read can
   never pass silently: if they differ it throws, and the job stops instead of re-alerting or re-sending. */
export const PAGE = 1000;
export async function fetchAll(db, table, cols, order, page = PAGE) {
  const orderBy = Array.isArray(order) ? order : [order];
  const head = await db.from(table).select('*', { count: 'exact', head: true });
  if (head.error) throw new Error(`${table} count failed: ${head.error.message}`);
  const total = head.count ?? 0, rows = [];
  for (let from = 0; ; from += page) {
    let q = db.from(table).select(cols);
    for (const o of orderBy) q = q.order(o, { ascending: true });
    const r = await q.range(from, from + page - 1);
    if (r.error) throw new Error(`${table} page ${from} failed: ${r.error.message}`);
    const got = r.data || []; rows.push(...got);
    if (got.length < page) break;
    if (from > 5_000_000) throw new Error(`${table} paging runaway`);
  }
  /* rows can be added while we read (the job itself does not write these tables until after reading) */
  if (rows.length < total) throw new Error(`${table} read ${rows.length} of ${total} rows, refusing to run`);
  return rows;
}
