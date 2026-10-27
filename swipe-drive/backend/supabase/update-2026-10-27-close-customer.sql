-- Swipe Drive: close customer (soft archive). NOT applied yet; run after Dan approves, before the push.
-- A flag only: nothing is deleted. Swipes, matches, photos, purchases and buy requests stay as they are.
alter table public.customers
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid,
  add column if not exists closed_by_name text;
create index if not exists customers_closed_at_idx on public.customers (closed_at);
notify pgrst, 'reload schema';
