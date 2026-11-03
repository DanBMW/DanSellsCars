-- Swipe Drive update, 3 Nov 2026: model year on the profile, and "Notify me when one comes in".
-- Safe to run more than once. Needs schema.sql (can_access_customer) already in place.
-- Paste into Supabase > SQL Editor > Run.

-- A) the model year a customer asks for, "from 2024" means 2024 and newer
alter table public.customers add column if not exists year_from int check (year_from between 2000 and 2100);

-- B) saved wishes: the criteria a customer had when nothing fitted, checked against each new arrival by match-alerts
create table if not exists public.alert_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default '',
  criteria jsonb not null default '{}',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz
);
create index if not exists alert_requests_customer on public.alert_requests (customer_id);
alter table public.alert_requests enable row level security;

-- the customer, their staff owner and Dan can see and add requests for a customer they can access
drop policy if exists ar_sel on public.alert_requests;
create policy ar_sel on public.alert_requests for select to authenticated using (public.can_access_customer(customer_id));
drop policy if exists ar_ins on public.alert_requests;
create policy ar_ins on public.alert_requests for insert to authenticated with check (
  public.can_access_customer(customer_id) and (created_by is null or created_by = auth.uid()));
drop policy if exists ar_upd on public.alert_requests;
create policy ar_upd on public.alert_requests for update to authenticated
  using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id));
revoke all on public.alert_requests from anon;
grant select, insert, update on public.alert_requests to authenticated;
