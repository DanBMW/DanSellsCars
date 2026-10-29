-- SwipeToDrive | run these AFTER paste-into-sql-editor.sql, one block at a time.

-- 1) Make Dan the admin. First sign in once on https://dan-sells.co.uk/swipe-drive/
--    with the email below (after the app is switched to live mode), then run:
update public.profiles set role = 'admin', name = 'Dan', whatsapp = '447827138197'
where lower(email) = lower('DAN_EMAIL_HERE');

-- 2) Daily match and reminder job, 10:15 UTC (after the morning stock and the
--    lookup rebuild). Needs the match-alerts edge function deployed and a
--    CRON_SECRET chosen; replace CRON_SECRET_HERE with the same value.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('swipe-drive-match-alerts', '15 10 * * *', $$
  select net.http_post(
    url := 'https://dexqyqrbelmdjdhxaboq.supabase.co/functions/v1/match-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET_HERE')) $$);
