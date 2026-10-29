-- SwipeToDrive update, 21 Oct 2026 (second part). Safe to run more than once.
-- Includes the earlier fix (fix-2026-10-21-customers.sql) so one paste covers everything.

-- A) read policy checks the row itself, so Add a customer can read the new row back
drop policy if exists c_sel on public.customers;
create policy c_sel on public.customers for select to authenticated using (
  public.is_admin() or (owner_staff_id = auth.uid() and public.my_role() = 'staff') or user_id = auth.uid());
-- B) the I confirm tick is only required once condition ratings are filled in
alter table public.customers drop constraint if exists px_needs_confirmation;
alter table public.customers add constraint px_needs_confirmation
  check (px_condition_ratings = '{}'::jsonb or px_terms_confirmed_at is not null);
-- C) one settlement figure
update public.customers set px_settlement_gbp = round((px->>'finance_outstanding')::numeric)::int
 where px_settlement_gbp is null and px ? 'finance_outstanding' and (px->>'finance_outstanding') ~ '^[0-9]+(\.[0-9]+)?$';

-- D) desk.html questions (usage, timeline, funding, next steps, notes) in one json column
alter table public.customers add column if not exists desk jsonb not null default '{}';

-- E) Mark as dealt: pauses match alerts until the 33 month point of the purchase
alter table public.customers add column if not exists dealt_at timestamptz;
alter table public.customers add column if not exists dealt_purchase_id uuid references public.purchases(id) on delete set null;
alter table public.customers add column if not exists due_to_change_at timestamptz;
alter table public.customers add column if not exists px_history jsonb not null default '[]';

-- F) called by the daily match-alerts job (service role). At purchase + 33 months the customer comes back:
--    old PX figures are kept in px_history, the bought car becomes the PX with equity assumed 0, flagged Due to change.
create or replace function public.reactivate_due_customers() returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select c.id, p.reg, p.model from public.customers c join public.purchases p on p.id = c.dealt_purchase_id
    where c.dealt_at is not null and not p.cancelled and p.remind_on <= current_date)
  update public.customers c set
    px_history = c.px_history || jsonb_build_array(jsonb_build_object('archived_at', now(), 'px', c.px,
      'px_valuation_gbp', c.px_valuation_gbp, 'px_valued_on', c.px_valued_on, 'px_settlement_gbp', c.px_settlement_gbp,
      'px_settlement_valid_until', c.px_settlement_valid_until, 'px_condition_ratings', c.px_condition_ratings)),
    px = jsonb_build_object('reg', due.reg, 'car', due.model, 'equity_assumed_gbp', 0),
    px_valuation_gbp = null, px_valued_on = null, px_settlement_gbp = null, px_settlement_valid_until = null,
    px_condition_ratings = '{}', px_terms_confirmed_at = null, px_terms_confirmed_by = null,
    dealt_at = null, due_to_change_at = now()
  from due where c.id = due.id
  returning c.id;
end $$;
revoke all on function public.reactivate_due_customers() from public, anon, authenticated;
grant execute on function public.reactivate_due_customers() to service_role;
