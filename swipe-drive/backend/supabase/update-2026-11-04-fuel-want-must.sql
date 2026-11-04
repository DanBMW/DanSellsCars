-- Fuel Want and Must (branch grok/swipe-fuel-wantmust).
-- fuel_must holds the fuels tapped twice (must have). NULL means a profile saved before this change:
-- the app then treats every picked fuel as a must have, exactly as before. No data changes.
-- Also allows the new 'phev' (plug in hybrid) fuel value. 'hybrid' keeps its meaning (plug in and mild hybrids).
alter table public.customers add column if not exists fuel_must text[];
alter table public.customers drop constraint if exists customers_fuel_check;
alter table public.customers add constraint customers_fuel_check check (
  fuel is null or fuel = 'open' or
  fuel ~ '^(petrol|diesel|hybrid|phev|electric)(,(petrol|diesel|hybrid|phev|electric))*$'
);
