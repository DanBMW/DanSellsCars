-- Swipe Drive fix, 21 Oct 2026. Safe to run more than once.
-- 1) Read policy checks the row itself (no self lookup), so a new customer can be read back straight away.
drop policy if exists c_sel on public.customers;
create policy c_sel on public.customers for select to authenticated using (
  public.is_admin()
  or (owner_staff_id = auth.uid() and public.my_role() = 'staff')
  or user_id = auth.uid());
-- 2) The I confirm tick is only required once part exchange condition ratings are filled in.
alter table public.customers drop constraint if exists px_needs_confirmation;
alter table public.customers add constraint px_needs_confirmation
  check (px_condition_ratings = '{}'::jsonb or px_terms_confirmed_at is not null);
-- 3) One settlement figure: copy any older "finance still owed" answer into px_settlement_gbp where it is empty.
update public.customers set px_settlement_gbp = round((px->>'finance_outstanding')::numeric)::int
 where px_settlement_gbp is null and px ? 'finance_outstanding' and (px->>'finance_outstanding') ~ '^[0-9]+(\.[0-9]+)?$';
