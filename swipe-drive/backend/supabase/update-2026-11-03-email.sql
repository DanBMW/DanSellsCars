-- Swipe Drive update, 3 Nov 2026: customer match emails, switched on per customer by Dan.
-- Safe to run more than once. Paste into Supabase > SQL Editor > Run.

-- A) Dan's tick: only customers with this ticked are sent match emails
alter table public.customers add column if not exists email_alerts boolean not null default false;

-- B) the customer's own unsubscribe: set by the unsubscribe link or by unticking on the Me page, null means subscribed
alter table public.profiles add column if not exists email_unsubscribed_at timestamptz;
