-- SwipeToDrive: Find my BMW and stock alert sign ups. DRAFT, for Dan to run once in the Supabase SQL editor. Safe to run twice.
-- Only adds a rate limit table and one function. No customer data is changed. New enquiries live in customers.desk (existing jsonb).
create table if not exists public.lead_hits (k text not null, hour timestamptz not null, n int not null default 0, primary key (k, hour));
alter table public.lead_hits enable row level security;   -- no policies: only the service role (funnel-lead) can touch it
create or replace function public.lead_hit(k text) returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  delete from public.lead_hits where hour < now() - interval '1 day';
  insert into public.lead_hits (k, hour, n) values (k, date_trunc('hour', now()), 1)
  on conflict (k, hour) do update set n = public.lead_hits.n + 1 returning n into v;
  return v; end $$;
revoke all on function public.lead_hit(text) from public, anon, authenticated;
grant execute on function public.lead_hit(text) to service_role;
