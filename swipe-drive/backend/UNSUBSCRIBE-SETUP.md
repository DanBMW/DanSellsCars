# Email unsubscribe (GDPR and PECR), not deployed yet

Every SwipeToDrive email that can reach a customer (the match digest) now has a visible Unsubscribe button,
a line saying why they got it, and the List-Unsubscribe plus List-Unsubscribe-Post: List-Unsubscribe=One-Click
headers. The link carries a signed per recipient token (`functions/_shared/unsub.js`).

Before deploying (Dan approves first):
1. `supabase secrets set UNSUBSCRIBE_SECRET=<a long random string>` (32 or more characters).
2. `supabase functions deploy unsubscribe --no-verify-jwt` and `supabase functions deploy match-alerts`.
3. Customer emails stay off until CUSTOMER_EMAIL_ENABLED is true AND UNSUBSCRIBE_SECRET is set.

Unsubscribing sets `profiles.notify_email = false`; match-alerts only emails a customer when notify_email is true,
so the next run skips them. Old links with the stored uuid token still work.
Emails only to Dan or colleagues (buy requests, 33 month reminders) do not need the footer.
Test: `node backend/supabase/test/unsubscribe.test.mjs`.
