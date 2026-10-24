-- run by job-lock.sh after the schema; prints PASS/FAIL lines
create temp table t(name text, ok boolean); grant all on t to authenticated;
do $$ declare a uuid; b uuid; c uuid; begin
  a := public.take_job_lock('match-alerts', 20);
  b := public.take_job_lock('match-alerts', 20);
  insert into t values ('first run gets the lock', a is not null), ('second run while held is refused', b is null);
  perform public.release_job_lock('match-alerts', gen_random_uuid());
  insert into t values ('a stranger cannot release it', public.take_job_lock('match-alerts', 20) is null);
  perform public.release_job_lock('match-alerts', a);
  c := public.take_job_lock('match-alerts', 20);
  insert into t values ('released lock can be taken again', c is not null and c <> a);
  update public.job_locks set locked_until = now() - interval '1 minute';
  insert into t values ('an expired lock (crashed run) is taken over', public.take_job_lock('match-alerts', 20) is not null);
  insert into t values ('other jobs are independent', public.take_job_lock('other', 5) is not null);
end $$;
set role authenticated;
do $$ begin perform public.take_job_lock('x', 1); insert into t values ('signed in users cannot take it', false);
exception when insufficient_privilege then insert into t values ('signed in users cannot take it', true); end $$;
reset role;
select (case when ok then 'PASS ' else 'FAIL ' end) || name from t;
