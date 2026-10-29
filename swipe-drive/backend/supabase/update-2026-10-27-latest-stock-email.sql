-- SwipeToDrive: "Send customer latest stock" email, reply buttons and send log. NOT applied yet; run after Dan approves.
-- Customer emails still need CUSTOMER_EMAIL_ENABLED=true (Dan approves) before anything sends.
alter table public.customers
  add column if not exists email_opt_out boolean not null default false,   -- unsubscribed from customer emails
  add column if not exists stock_reply text,                                -- interested | keepinformed | offmarket
  add column if not exists stock_reply_at timestamptz,
  add column if not exists close_suggested_at timestamptz;                  -- said no longer on the market: Dan decides whether to close
create table if not exists public.stock_emails (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by uuid, sent_by_name text, to_email text,
  cars jsonb not null default '[]',          -- [{reg, model, price, kind}]
  status text not null default 'sent', resend_id text,
  reply text, replied_at timestamptz);
create index if not exists stock_emails_customer_idx on public.stock_emails (customer_id, sent_at desc);
alter table public.stock_emails enable row level security;
-- staff can read the log for customers they can access; only the edge functions (service role) write it
drop policy if exists se_sel on public.stock_emails;
create policy se_sel on public.stock_emails for select to authenticated using (public.can_access_customer(customer_id));
notify pgrst, 'reload schema';
