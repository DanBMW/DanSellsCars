// One click unsubscribe from Swipe Drive emails. GET shows a page, POST (List-Unsubscribe-Post) just does it.
import { createClient } from 'npm:@supabase/supabase-js@2';
Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') || '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data } = await db.rpc('email_unsubscribe', { tok: t });
  const ok = data === true;
  if (req.method === 'POST') return new Response(null, { status: ok ? 200 : 404 });
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Swipe Drive | Unsubscribe</title><body style="font:17px Helvetica,Arial;padding:40px;text-align:center">${ok ? 'You are unsubscribed from Swipe Drive emails.' : 'That link has expired or was already used.'}</body>`, { headers: { 'Content-Type': 'text/html' } });
});
