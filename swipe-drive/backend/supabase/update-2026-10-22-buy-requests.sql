-- SwipeToDrive update, 22 Oct 2026: Buy this car and Send my matches leads. Safe to run more than once.
-- Paste into Supabase > SQL Editor > Run. Needs schema.sql (is_staff, can_access_customer) already in place.

create table if not exists public.buy_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null check (type in ('buy','matches')),
  car_reg text,            -- buy: the car's reg (NEW-... for a brand new model)
  car_id text,             -- buy: stock id or order number if known
  car_model text,
  car_price text,          -- price as shown on the card at the time (snapshot)
  cars jsonb not null default '[]',   -- matches: [{reg, model, price, kind}]
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new','called','closed')),
  called_at timestamptz,
  called_by uuid references public.profiles(id) on delete set null,
  notified_at timestamptz,  -- set by the notify-buy-request edge function once Dan is emailed
  created_at timestamptz not null default now()
);
create index if not exists buy_requests_created on public.buy_requests (created_at desc);
alter table public.buy_requests enable row level security;

-- the customer (or their staff owner / admin) can create a request for a customer they can access, always as 'new'
drop policy if exists br_ins on public.buy_requests;
create policy br_ins on public.buy_requests for insert to authenticated with check (
  public.can_access_customer(customer_id) and status = 'new' and called_at is null and called_by is null
  and notified_at is null and (created_by is null or created_by = auth.uid()));
-- staff read requests for their own customers, admin reads everything
drop policy if exists br_sel on public.buy_requests;
create policy br_sel on public.buy_requests for select to authenticated using (
  public.is_staff() and public.can_access_customer(customer_id));
-- staff mark as called
drop policy if exists br_upd on public.buy_requests;
create policy br_upd on public.buy_requests for update to authenticated
  using (public.is_staff() and public.can_access_customer(customer_id))
  with check (public.is_staff() and public.can_access_customer(customer_id));
revoke update on public.buy_requests from authenticated;
grant select, insert on public.buy_requests to authenticated;
grant update (status, called_at, called_by) on public.buy_requests to authenticated;
