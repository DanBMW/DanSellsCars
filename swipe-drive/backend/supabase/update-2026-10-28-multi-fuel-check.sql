-- Allow multi fuel choices (comma list, e.g. 'petrol,hybrid') saved by the app since b6f9b52.
-- Existing single values all still pass. No data changes.
alter table public.customers drop constraint if exists customers_fuel_check;
alter table public.customers add constraint customers_fuel_check check (
  fuel is null or fuel = 'open' or
  fuel ~ '^(petrol|diesel|hybrid|electric)(,(petrol|diesel|hybrid|electric))*$'
);
