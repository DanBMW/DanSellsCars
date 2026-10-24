/* Swipe Drive config. Public values only: never put a service role key,
   VAPID private key or Resend key here (they live in Supabase secrets).
   MODE 'demo': profile and swipes live on this device, sign in is a placeholder.
   MODE 'supabase': fill the three values below from the Supabase project. */
window.CT_CONFIG = {
  MODE: 'supabase',
  SUPABASE_URL: 'https://dexqyqrbelmdjdhxaboq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRleHF5cXJiZWxtZGpkaHhhYm9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MDkzMTUsImV4cCI6MjEwODE4NTMxNX0.TrUevRftRSZxIh8W8n_0ZJh7wQmehpyoGtygR02BCc8', // public anon key
  VAPID_PUBLIC_KEY: 'BG1p5oUrGPbG5ZKSXbQXlZnGhtq-cPu3bBP7Vwg9YCrkTAAgAKS8b0hthElXCohNPgaxwwhAEjxnxdhrzMoxUUo',
  CUSTOMER_EMAIL_ENABLED: false, // customer match emails on hold: customers get push only
  FORMSPREE: 'https://formspree.io/f/xqewleog',
  DAN_WA: '447827138197',
  GOOGLE_LOGIN_ENABLED: false // turn on once the Google provider is set up in Supabase (see backend/GOOGLE-SIGN-IN.md)
};
