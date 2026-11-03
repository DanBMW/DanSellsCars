-- SwipeToDrive: messaging consent. Run once in the Supabase SQL editor. Safe to run twice.
-- A customer added by staff is not messaged until staff record consent. Customers who signed in themselves
-- (user_id set) count as having consented, so they are backfilled below.
alter table public.customers
  add column if not exists comms_consent_at timestamptz,
  add column if not exists comms_consent_by uuid,
  add column if not exists comms_consent_by_name text,
  add column if not exists comms_consent_text text;

-- who and when are stamped by the database, not trusted from the browser
create or replace function public.stamp_comms_consent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.comms_consent_at is not null and (tg_op = 'INSERT' or old.comms_consent_at is null) then
    new.comms_consent_at := now();
    new.comms_consent_by := auth.uid();
    if new.comms_consent_by_name is null or new.comms_consent_by_name = '' then
      select coalesce(nullif(name, ''), email) into new.comms_consent_by_name from public.profiles where id = auth.uid();
    end if;
  end if;
  if tg_op = 'UPDATE' and old.comms_consent_at is not null and new.comms_consent_at is null then
    -- consent withdrawn: clear the record and revoke every swipe link that was sent
    new.comms_consent_by := null; new.comms_consent_by_name := null; new.comms_consent_text := null;
    new.guest_version := coalesce(old.guest_version, 0) + 1;
  end if;
  return new;
end $$;
drop trigger if exists customers_stamp_comms_consent on public.customers;
create trigger customers_stamp_comms_consent before insert or update on public.customers
  for each row execute function public.stamp_comms_consent();

-- customers who signed in themselves have agreed to use the app
update public.customers set comms_consent_at = coalesce(created_at, now()),
  comms_consent_text = 'Customer signed in and created their own profile.'
 where user_id is not null and comms_consent_at is null;
-- everyone else added by staff stays with no consent until staff tick the box on the profile.
