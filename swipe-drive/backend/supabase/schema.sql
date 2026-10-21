-- Swipe Drive schema for Supabase (Postgres + RLS). Run in the SQL editor once.
-- Roles: admin (Dan), staff (invited colleagues), customer.
-- Every table has RLS on; access is decided by the helper functions below.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'customer' check (role in ('admin','staff','customer')),
  name text,
  whatsapp text,                       -- staff: own number, digits only e.g. 447700900000
  notify_push boolean not null default true,
  notify_email boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  whatsapp text,
  invited_by uuid references public.profiles(id),
  approved boolean not null default true,   -- admin can revoke before use
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_staff_id uuid references public.profiles(id),   -- null = Dan's own direct customer
  user_id uuid unique references public.profiles(id),   -- set once the customer claims it
  name text, phone text, email text, postcode text,
  budget_type text check (budget_type in ('cash','monthly')),
  cash_gbp int, monthly_gbp int, deposit_gbp int,
  annual_mileage int,
  fuel text check (fuel in ('petrol','diesel','hybrid','electric','open')),
  body text, models text[] not null default '{}',
  colours text[] not null default '{}',        -- colour families liked (Black, Grey, Blue...)
  colours_must text[] not null default '{}',   -- subset that is a must have
  specs text[] not null default '{}',          -- spec keys, see swipe-drive/match-core.js specOptions()
  specs_must text[] not null default '{}',
  new_used text check (new_used in ('new','used','both')),
  px jsonb,                              -- {reg, mileage, condition, finance_outstanding, photos}
  px_valuation_gbp int check (px_valuation_gbp >= 0),      -- PX valuation from Dan (no automatic valuations)
  px_valued_on date,
  px_valuation_set_by text check (px_valuation_set_by in ('customer','staff')),  -- stamped by trigger
  px_valuation_set_by_user uuid references public.profiles(id),
  px_settlement_gbp int check (px_settlement_gbp >= 0),    -- settlement figure, outstanding finance
  px_settlement_valid_until date,
  -- condition ratings: {"overall":{"rating":1..5,"notes":""},"bodywork":...,"paintwork","wheels_tyres","interior","mechanical","electrics","service_history","mot"}
  px_condition_ratings jsonb not null default '{}',
  px_terms_confirmed_at timestamptz,       -- "I confirm" tick on the PX terms note
  px_terms_confirmed_by text check (px_terms_confirmed_by in ('customer','staff')),
  constraint px_needs_confirmation check (px is null or px_terms_confirmed_at is not null),
  constraint px_ratings_1_to_5 check (jsonb_typeof(px_condition_ratings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_claims (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null,
  expires_at timestamptz not null default now() + interval '14 days',
  claimed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.swipes (
  customer_id uuid not null references public.customers(id) on delete cascade,
  reg text not null,
  liked boolean not null,
  shortlisted boolean not null default false,
  by_user uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (customer_id, reg)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  created_at timestamptz not null default now()
);


-- "I've bought my car": one or more purchases per customer, reminder at purchase + 33 months
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  reg text not null, model text,
  purchase_date date not null,
  finance_type text not null check (finance_type in ('pcp','hp','lease','cash','other')),
  term_months int check (term_months between 0 and 120),
  insurances jsonb not null default '[]',   -- [{type: gap|tyre_alloy|cosmetic|warranty|other, label, ends_on}]
  remind_on date generated always as ((purchase_date + interval '33 months')::date) stored,
  reminder_sent_at timestamptz,
  cancelled boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- what has been notified already, so a car is never sent twice to the same person
create table if not exists public.notifications_sent (
  recipient uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reg text not null,
  channel text not null check (channel in ('push','email')),
  sent_at timestamptz not null default now(),
  primary key (recipient, customer_id, reg, channel)
);

-- yesterday's regs, written by the match job (service role only)
create table if not exists public.stock_seen (reg text primary key, first_seen date not null default current_date);

-- ---------- helpers (security definer so policies don't recurse) ----------
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'admin', false) $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() in ('staff','admin'), false) $$;
create or replace function public.can_access_customer(cid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.customers c where c.id = cid and (
     public.is_admin()
     or (c.owner_staff_id = auth.uid() and public.my_role() = 'staff')
     or c.user_id = auth.uid())) $$;

-- new auth user: staff if an approved invite exists, otherwise customer
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from public.staff_invites where lower(email) = lower(new.email) and approved and accepted_at is null;
  insert into public.profiles (id, email, role, name, whatsapp)
  values (new.id, new.email, case when inv.id is not null then 'staff' else 'customer' end, inv.name, inv.whatsapp);
  if inv.id is not null then update public.staff_invites set accepted_at = now() where id = inv.id; end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- nobody but the admin can change a role; only the admin can move a customer between owners
create or replace function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role and the SQL editor; current_user can't be used inside security definer
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only the admin can change roles'; end if;
  return new; end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

create or replace function public.guard_customer() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.owner_staff_id is distinct from old.owner_staff_id or new.user_id is distinct from old.user_id)
     and auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('ct.claiming', true), '') <> '1' then
    raise exception 'owner and claim can only change through claim_customer or the admin'; end if;
  new.updated_at = now(); return new; end $$;
drop trigger if exists guard_customer on public.customers;
create trigger guard_customer before update on public.customers for each row execute function public.guard_customer();

-- who last set the PX valuation, from the signed in role (the app cannot fake it)
create or replace function public.stamp_valuation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (tg_op = 'INSERT' and new.px_valuation_gbp is not null
       or tg_op = 'UPDATE' and new.px_valuation_gbp is distinct from old.px_valuation_gbp) then
    new.px_valuation_set_by = case when public.my_role() = 'customer' then 'customer' else 'staff' end;
    new.px_valuation_set_by_user = auth.uid();
  elsif tg_op = 'UPDATE' and auth.uid() is not null then
    new.px_valuation_set_by = old.px_valuation_set_by; new.px_valuation_set_by_user = old.px_valuation_set_by_user;
  end if;
  return new; end $$;
drop trigger if exists stamp_valuation on public.customers;
create trigger stamp_valuation before insert or update on public.customers for each row execute function public.stamp_valuation();

-- name of whoever last set a customer's valuation (for "Valuation entered by Dan")
create or replace function public.valuation_set_by_name(cid uuid) returns text language sql stable security definer set search_path = public as
$$ select case when c.px_valuation_set_by = 'customer' then 'customer' else coalesce(p.name, 'staff') end
   from public.customers c left join public.profiles p on p.id = c.px_valuation_set_by_user
   where c.id = cid and public.can_access_customer(cid) $$;

-- customer claims a staff created profile from the emailed link (claim id is the secret)
create or replace function public.claim_customer(claim uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare cl public.customer_claims; me text;
begin
  select email into me from public.profiles where id = auth.uid();
  select * into cl from public.customer_claims where id = claim and claimed_at is null and expires_at > now();
  if cl.id is null or lower(cl.email) <> lower(me) then raise exception 'claim link invalid or expired'; end if;
  perform set_config('ct.claiming', '1', true);
  update public.customers set user_id = auth.uid() where id = cl.customer_id and user_id is null;
  perform set_config('ct.claiming', '', true);
  update public.customer_claims set claimed_at = now() where id = cl.id;
  return cl.customer_id; end $$;

-- WhatsApp number for a customer's CTAs: owning colleague, else Dan
create or replace function public.customer_whatsapp(cid uuid) returns text language sql stable security definer set search_path = public as
$$ select coalesce((select nullif(p.whatsapp,'') from public.customers c join public.profiles p on p.id = c.owner_staff_id
                    where c.id = cid and public.can_access_customer(cid)), '447827138197') $$;

-- one click unsubscribe from email (token in every email); callable without login
create or replace function public.email_unsubscribe(tok uuid) returns boolean language sql security definer set search_path = public as
$$ with u as (update public.profiles set notify_email = false where unsubscribe_token = tok returning 1) select exists (select 1 from u) $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.customers enable row level security;
alter table public.customer_claims enable row level security;
alter table public.swipes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications_sent enable row level security;
alter table public.stock_seen enable row level security;
alter table public.purchases enable row level security;

drop policy if exists p_sel on public.profiles; drop policy if exists p_upd on public.profiles;
create policy p_sel on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy p_upd on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists i_all on public.staff_invites;
create policy i_all on public.staff_invites for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists c_sel on public.customers; drop policy if exists c_ins on public.customers;
drop policy if exists c_upd on public.customers; drop policy if exists c_del on public.customers;
create policy c_sel on public.customers for select to authenticated using (public.can_access_customer(id));
create policy c_ins on public.customers for insert to authenticated with check (
  public.is_admin()
  or (public.my_role() = 'staff' and owner_staff_id = auth.uid() and user_id is null)
  or (public.my_role() = 'customer' and owner_staff_id is null and user_id = auth.uid()));
create policy c_upd on public.customers for update to authenticated using (public.can_access_customer(id)) with check (public.can_access_customer(id));
create policy c_del on public.customers for delete to authenticated using (public.is_admin() or (owner_staff_id = auth.uid() and public.my_role() = 'staff'));

drop policy if exists cl_all on public.customer_claims;
create policy cl_all on public.customer_claims for all to authenticated
  using (public.is_admin() or exists (select 1 from public.customers c where c.id = customer_id and c.owner_staff_id = auth.uid() and public.my_role() = 'staff'))
  with check (public.is_admin() or exists (select 1 from public.customers c where c.id = customer_id and c.owner_staff_id = auth.uid() and public.my_role() = 'staff'));

drop policy if exists s_all on public.swipes;
create policy s_all on public.swipes for all to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id));

drop policy if exists pu_all on public.purchases;
create policy pu_all on public.purchases for all to authenticated using (public.can_access_customer(customer_id)) with check (public.can_access_customer(customer_id));

drop policy if exists ps_all on public.push_subscriptions;
create policy ps_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ns_sel on public.notifications_sent;
create policy ns_sel on public.notifications_sent for select to authenticated using (recipient = auth.uid() or public.is_admin());
-- stock_seen: no policies, so only the service role (match job) can touch it.

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.claim_customer(uuid), public.customer_whatsapp(uuid), public.valuation_set_by_name(uuid) to authenticated;
grant execute on function public.email_unsubscribe(uuid) to anon, authenticated;

-- ---------- Storage: private bucket px, path = <customer_id>/<file> ----------
insert into storage.buckets (id, name, public) values ('px', 'px', false) on conflict (id) do nothing;
drop policy if exists px_sel on storage.objects; drop policy if exists px_ins on storage.objects;
drop policy if exists px_upd on storage.objects; drop policy if exists px_del on storage.objects;
create policy px_sel on storage.objects for select to authenticated using (bucket_id = 'px' and public.can_access_customer(((storage.foldername(name))[1])::uuid));
create policy px_ins on storage.objects for insert to authenticated with check (bucket_id = 'px' and public.can_access_customer(((storage.foldername(name))[1])::uuid));
create policy px_upd on storage.objects for update to authenticated using (bucket_id = 'px' and public.can_access_customer(((storage.foldername(name))[1])::uuid));
create policy px_del on storage.objects for delete to authenticated using (bucket_id = 'px' and public.can_access_customer(((storage.foldername(name))[1])::uuid));

-- ---------- Upgrading an existing project from the first version:
-- alter table public.customers add column if not exists colours text[] not null default '{}', add column if not exists colours_must text[] not null default '{}', add column if not exists specs text[] not null default '{}', add column if not exists specs_must text[] not null default '{}';

-- alter table public.customers add column if not exists px_valuation_gbp int, add column if not exists px_valued_on date, add column if not exists px_valuation_set_by text, add column if not exists px_valuation_set_by_user uuid references public.profiles(id), add column if not exists px_settlement_gbp int, add column if not exists px_settlement_valid_until date;

-- alter table public.customers add column if not exists px_condition_ratings jsonb not null default '{}', add column if not exists px_terms_confirmed_at timestamptz, add column if not exists px_terms_confirmed_by text, add constraint px_needs_confirmation check (px is null or px_terms_confirmed_at is not null);

-- ---------- Make Dan the admin (after his first sign in) ----------
-- update public.profiles set role = 'admin', whatsapp = '447827138197', name = 'Dan' where email = 'DAN_EMAIL_HERE';

-- ---------- Schedule the match job daily at 10:20 UK (09:20 UTC in BST) ----------
-- create extension if not exists pg_cron; create extension if not exists pg_net;
-- select cron.schedule('swipe-drive-match-alerts', '20 9 * * *', $$ select net.http_post(
--   url := 'https://PROJECT_REF.supabase.co/functions/v1/match-alerts',
--   headers := jsonb_build_object('Authorization', 'Bearer ' || 'CRON_SECRET_HERE')) $$);
