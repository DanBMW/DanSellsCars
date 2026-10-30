-- SwipeToDrive: referrals from dan-sells.co.uk/refer.html. DRAFT, NOT APPLIED. For Dan to run once in the Supabase SQL
-- editor after he says yes. Safe to run twice. Needs update-2026-10-30-funnel-leads.sql first (lead_hits and lead_hit).
-- One row per referral. Both people get a customers record (written by the referral-lead edge function with the
-- service role). The referred customer also carries desk.referred_by so their card shows "Referred by <first name>".
-- Only Dan (admin) can read referrals or tick the reward as paid. No customer messages are sent by any of this.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  referrer_customer_id uuid references public.customers(id) on delete set null,
  referred_customer_id uuid references public.customers(id) on delete set null,
  referrer_first_name text,
  referred_first_name text,
  reward_choice text not null check (reward_choice in ('credit','cash')),   -- the two options on refer.html
  reward_label text not null,                                              -- exactly as the customer picked it
  notes text,
  status text not null default 'new' check (status in ('new','contacted','sold','lost')),
  paid_out_at timestamptz,
  paid_out_by uuid references public.profiles(id),
  paid_out_by_name text
);
create index if not exists referrals_created_idx on public.referrals (created_at desc);
alter table public.referrals enable row level security;
drop policy if exists r_sel on public.referrals;
create policy r_sel on public.referrals for select to authenticated using (public.is_admin());
-- no insert, update or delete policies: the edge function inserts, the two functions below change status and payout

create or replace function public.referral_set_paid(rid uuid, paid boolean) returns public.referrals
language plpgsql security definer set search_path = public as $$
declare r public.referrals;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.referrals set
    paid_out_at = case when paid then now() else null end,
    paid_out_by = case when paid then auth.uid() else null end,
    paid_out_by_name = case when paid then (select name from public.profiles where id = auth.uid()) else null end
  where id = rid returning * into r;
  return r; end $$;
create or replace function public.referral_set_status(rid uuid, st text) returns public.referrals
language plpgsql security definer set search_path = public as $$
declare r public.referrals;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.referrals set status = st where id = rid returning * into r;
  return r; end $$;
revoke all on function public.referral_set_paid(uuid, boolean) from public, anon;
revoke all on function public.referral_set_status(uuid, text) from public, anon;
grant execute on function public.referral_set_paid(uuid, boolean) to authenticated;
grant execute on function public.referral_set_status(uuid, text) to authenticated;
