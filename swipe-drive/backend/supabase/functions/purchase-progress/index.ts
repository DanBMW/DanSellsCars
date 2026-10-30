// SwipeToDrive: purchase-progress (Supabase Edge Function, Deno). NOT deployed until Dan approves.
// Public, read only (verify_jwt = false), CORS: dan-sells.co.uk only. purchase-thankyou.html calls
// GET ?t=<token> on load so the customer sees the ticks Dan set in SwipeToDrive (customers.desk.purchase_progress).
// The token is 24 random url safe characters made when Dan first ticks. Rate limited per network via lead_hit
// (a hash, never the address). Returns ONLY first name, deposit, finance, order, type and seen. Nothing else.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle } from '../_shared/purchase-progress.ts';
const env = (k: string) => Deno.env.get(k) || '';
Deno.serve((req) => handle(req, () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')), env));
