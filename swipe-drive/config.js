/* Swipe Drive config. Public values only: never put a service role key,
   VAPID private key or Resend key here (they live in Supabase secrets).
   MODE 'demo': profile and swipes live on this device, sign in is a placeholder.
   MODE 'supabase': fill the three values below from the Supabase project. */
window.CT_CONFIG = {
  MODE: 'demo',
  SUPABASE_URL: '',          // e.g. https://abcd1234.supabase.co
  SUPABASE_ANON_KEY: '',     // Project Settings > API > anon public key
  VAPID_PUBLIC_KEY: 'BLPdkG2xuSQSltCw39DiaVH9xmEpOmOD2Vurehq4CzR6gYhdKlGNhySEENAEXmIe-YfMbTHiZeALIxEnWniK0Mw',
  CUSTOMER_EMAIL_ENABLED: false, // customer match emails on hold: customers get push only
  FORMSPREE: 'https://formspree.io/f/xqewleog',
  DAN_WA: '447827138197'
};
