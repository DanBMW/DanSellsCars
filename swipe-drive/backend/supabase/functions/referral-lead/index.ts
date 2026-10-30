// SwipeToDrive: referral-lead (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// Called by refer.html after the referral itself has gone through Formspree. Validates, rate limits by a hash of the
// network address (lead_hit), creates or finds SwipeToDrive records for the referrer and the friend (email, then
// mobile; existing records only get desk notes), marks the friend as referred by the referrer, and stores the
// referral with the chosen reward for Dan to tick as paid. Sends no email or message. Public (verify_jwt = false).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle } from '../_shared/referral-lead.ts';
const env = (k: string) => Deno.env.get(k) || '';
Deno.serve((req) => handle(req, () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')), env));
