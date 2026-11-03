-- SwipeToDrive: guest swipe link from the latest stock email. NOT applied yet; run after Dan approves,
-- after update-2026-10-27-latest-stock-email.sql.
alter table public.customers add column if not exists guest_version int not null default 0;   -- bump to revoke every guest link
alter table public.swipes add column if not exists source text;          -- 'guest_link' when swiped from the email link
alter table public.buy_requests add column if not exists source text;    -- 'guest_link' when sent from the email link
-- per customer, per minute request counter for the guest-deck function (service role only)
create table if not exists public.guest_hits (customer_id uuid not null, minute timestamptz not null, n int not null default 0, primary key (customer_id, minute));
alter table public.guest_hits enable row level security;   -- no policies: only the service role can touch it
create or replace function public.guest_hit(cid uuid) returns int
language sql security definer set search_path = public as $$
  delete from public.guest_hits where minute < now() - interval '1 hour';
  insert into public.guest_hits (customer_id, minute, n) values (cid, date_trunc('minute', now()), 1)
  on conflict (customer_id, minute) do update set n = public.guest_hits.n + 1
  returning n; $$;
revoke all on function public.guest_hit(uuid) from public, anon, authenticated;
grant execute on function public.guest_hit(uuid) to service_role;
-- closing a customer or unsubscribing revokes their guest links straight away
create or replace function public.guest_revoke() returns trigger language plpgsql as $$
begin
  if (new.closed_at is not null and old.closed_at is null) or (new.email_opt_out and not old.email_opt_out) then
    new.guest_version := old.guest_version + 1;
  end if;
  return new;
end $$;
drop trigger if exists customers_guest_revoke on public.customers;
create trigger customers_guest_revoke before update on public.customers for each row execute function public.guest_revoke();
notify pgrst, 'reload schema';
-- Confirm your details from the guest page: changes to an existing phone or email wait here for Dan to apply
alter table public.customers add column if not exists guest_update jsonb;
notify pgrst, 'reload schema';
