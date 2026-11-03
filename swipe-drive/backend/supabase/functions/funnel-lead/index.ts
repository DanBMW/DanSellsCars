// SwipeToDrive: funnel-lead (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// Called by find-my-bmw.html after the funnel's own enquiry has gone through, only when the customer ticked the
// SwipeToDrive consent box. It validates the answers, rate limits by network address (lead_hit, a hash, never the
// address itself), creates the customer's SwipeToDrive record with Dan as owner and their consent recorded, and
// returns a claim link. The claim only works once they sign in with the same email, so nobody can take over
// someone else's record. It never sends any email or message itself. Public (verify_jwt = false), CORS: the site only.
// Secrets: none beyond SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase), LEAD_HASH_SALT (optional).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle } from '../_shared/funnel-lead.ts';
const env = (k: string) => Deno.env.get(k) || '';
Deno.serve((req) => handle(req, () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')), env));
