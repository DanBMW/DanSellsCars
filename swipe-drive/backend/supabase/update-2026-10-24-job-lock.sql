-- Swipe Drive: run lock for the daily match job, so two overlapping runs cannot both read notifications_sent
-- before either writes it and send the same alert twice. Service role only. Safe to run more than once.
create table if not exists public.job_locks (job text primary key, locked_until timestamptz not null, run_id uuid not null);
alter table public.job_locks enable row level security;   -- no policies: only the service role can touch it

create or replace function public.take_job_lock(p_job text, p_minutes int default 20) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid := gen_random_uuid(); got uuid;
begin
  insert into public.job_locks (job, locked_until, run_id) values (p_job, now() + make_interval(mins => p_minutes), r)
  on conflict (job) do update set locked_until = excluded.locked_until, run_id = excluded.run_id
    where public.job_locks.locked_until < now()
  returning run_id into got;
  return got;   -- null when another run holds an unexpired lock
end $$;

create or replace function public.release_job_lock(p_job text, p_run uuid) returns void
language sql security definer set search_path = public as $$
  update public.job_locks set locked_until = now() - interval '1 second' where job = p_job and run_id = p_run $$;

revoke all on function public.take_job_lock(text, int), public.release_job_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.take_job_lock(text, int), public.release_job_lock(text, uuid) to service_role;
