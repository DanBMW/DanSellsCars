-- Follow up tracker (links.html). NOT APPLIED: Dan must approve before this runs.
-- The database only ever holds ciphertext. Names, emails, cars, notes, options and due
-- dates are encrypted in the browser (AES-GCM 256, key from PBKDF2 SHA-256, 600,000 rounds,
-- from a passphrase only Dan knows). Without the passphrase the rows cannot be read by
-- anyone, including Supabase, the site, or the service role.
-- Access: signed in admin only, and only their own rows. No anon access at all.

create table if not exists public.followup_vault (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  salt text not null check (length(salt) between 16 and 64),
  iterations int not null check (iterations >= 600000),
  check_iv text not null, check_ct text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.followups (
  id text primary key check (length(id) between 8 and 40),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  v smallint not null default 1,
  iv text not null check (length(iv) between 12 and 32),
  ct text not null check (length(ct) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists followups_owner_idx on public.followups(owner);

create or replace function public.followups_touch() returns trigger language plpgsql set search_path = public as
$$ begin new.updated_at = now(); new.owner = old.owner; return new; end $$;
drop trigger if exists followups_touch on public.followups;
create trigger followups_touch before update on public.followups for each row execute function public.followups_touch();

alter table public.followup_vault enable row level security;
alter table public.followups enable row level security;
alter table public.followup_vault force row level security;
alter table public.followups force row level security;

revoke all on public.followup_vault, public.followups from anon, public;
grant select, insert, update, delete on public.followups to authenticated;
grant select, insert on public.followup_vault to authenticated;  -- vault is write once (changing passphrase = new export/import)

drop policy if exists fv_own on public.followup_vault;
create policy fv_own on public.followup_vault for all to authenticated
  using (owner = auth.uid() and public.is_admin()) with check (owner = auth.uid() and public.is_admin());

drop policy if exists fu_own on public.followups;
create policy fu_own on public.followups for all to authenticated
  using (owner = auth.uid() and public.is_admin()) with check (owner = auth.uid() and public.is_admin());

-- Supabase default privileges grant everything to authenticated; trim to what the app needs.
revoke all on public.followup_vault, public.followups from authenticated;
grant select, insert on public.followup_vault to authenticated;
grant select, insert, update, delete on public.followups to authenticated;
