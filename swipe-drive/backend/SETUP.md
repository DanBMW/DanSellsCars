# SwipeToDrive backend setup (Supabase)

The app at /swipe-drive/ runs in demo mode until these steps are done. Nothing
secret is ever committed: the service role key, VAPID private key, Resend key
and cron secret live only in Supabase secrets.

## 1. Supabase project (Dan, about 10 minutes, free tier)
1. Sign up at https://supabase.com with your own email. New project, name `swipe-drive`, region London (eu-west-2). Save the database password somewhere safe.
2. SQL editor: paste and run `supabase/schema.sql`.
3. Sign in once on the app (step 4), then run the commented line at the bottom of schema.sql with your email to make yourself admin.
4. Authentication > URL configuration: Site URL `https://dan-sells.co.uk/swipe-drive/`; add the same as a redirect URL.
5. Authentication > Providers > Email: leave it on with sign ups allowed. Customers sign themselves up; colleagues only become staff through an invite (enforced in SQL, not in the app).
6. Send back (both are public by design): **Project URL** and **anon public key** (Project Settings > API). They go in `swipe-drive/config.js` with `MODE: 'supabase'`.

## 2. Edge functions and the daily job
```
npx supabase login
npx supabase link --project-ref <ref>
npx supabase secrets set VAPID_PUBLIC=<public key in config.js> VAPID_PRIVATE=<from the box file> CRON_SECRET=<random> CUSTOMER_EMAIL_ENABLED=false
npx supabase functions deploy match-alerts --no-verify-jwt
npx supabase functions deploy unsubscribe --no-verify-jwt
```
Then run the commented pg_cron block in schema.sql (daily 10:15 UTC, see after-signin-and-secrets.sql).
Optional for email: `RESEND_API_KEY` and `MAIL_FROM="SwipeToDrive <matches@mail.dan-sells.co.uk>"`.

## 3. Email (internal staff digests and sign in links)
See the SwipeToDrive report for the recommended route (Resend on mail.dan-sells.co.uk) and the GoDaddy records.
Supabase's built in email only delivers to members of the Supabase project team and is heavily rate limited,
so magic link sign in for customers and colleagues needs custom SMTP: Authentication > SMTP settings,
host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender `signin@mail.dan-sells.co.uk`.

## Access rules (tested, see supabase/test)
admin sees everything; staff see only customers they own (and those customers' swipes, purchases and PX photos);
a customer sees only their own profile. Run `supabase/test/run.sh` against local Postgres.
