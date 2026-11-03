-- Purchase progress live ticks. No new columns: data lives in customers.desk.purchase_progress (jsonb).
-- Only adds a lookup index for the purchase-progress function. Safe to run more than once. NOT applied yet.
create index if not exists customers_purchase_progress_token
  on public.customers ((desk->'purchase_progress'->>'token'))
  where desk ? 'purchase_progress';
