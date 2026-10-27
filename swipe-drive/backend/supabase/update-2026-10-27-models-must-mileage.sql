-- Swipe Drive: model must haves and preferred current mileage. NOT applied yet; run after Dan approves, before the push.
-- models stays as every picked model; models_must is the subset tapped twice. Older rows get '{}', so their picks read as would like.
-- mileage_bands holds optional keys: 0_8k, 8_15k, 15_25k, 25k_plus. Fuel needs no change (fuel text now holds 'open' or a comma list).
alter table public.customers
  add column if not exists models_must text[] not null default '{}',
  add column if not exists mileage_bands text[] not null default '{}';
notify pgrst, 'reload schema';
