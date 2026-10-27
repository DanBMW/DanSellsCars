// One click unsubscribe from Swipe Drive emails. GET shows a confirm page (link scanners never unsubscribe anyone),
// POST does it: the page's button, and mail apps using List-Unsubscribe-Post: List-Unsubscribe=One-Click.
// t is a signed per recipient token (see ../_shared/unsub.js). Old uuid tokens from earlier emails still work.
// Secrets: UNSUBSCRIBE_SECRET (shared with match-alerts). SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY come from Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyUnsub } from '../_shared/unsub.js';
const env = (k: string) => Deno.env.get(k) || '';
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Swipe Drive | Unsubscribe</title>
<body style="margin:0;background:#f2f4f8;font:17px/1.5 Helvetica,Arial,sans-serif;color:#0b1220"><div style="max-width:460px;margin:48px auto;background:#fff;border-radius:16px;padding:28px 24px;text-align:center">
<div style="font-weight:700;font-size:20px;margin:0 0 14px">Swipe Drive</div>${body}</div></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

async function unsubscribe(t: string): Promise<boolean> {
  const v = await verifyUnsub(env('UNSUBSCRIBE_SECRET'), t);
  if (v && v.purpose === 'custmail') {   // "latest stock" emails sent to a customer record (no login needed)
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const { data, error } = await db.from('customers').update({ email_opt_out: true }).eq('id', v.id).select('id');
    return !error && !!data && data.length > 0;
  }
  if (v) {
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const { data, error } = await db.from('profiles').update({ notify_email: false }).eq('id', v.id).select('id');
    return !error && !!data && data.length > 0;
  }
  if (/^[0-9a-f-]{36}$/i.test(t)) {   // legacy token from an older email
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'));
    const { data } = await db.rpc('email_unsubscribe', { tok: t });
    return data === true;
  }
  return false;
}

Deno.serve(async (req) => {
  const url = new URL(req.url); const t = url.searchParams.get('t') || '';
  if (req.method === 'POST') {
    const ok = await unsubscribe(t);
    if ((req.headers.get('content-type') || '').includes('form') && !(await req.clone().text()).includes('List-Unsubscribe=One-Click'))
      return page(ok ? '<p>Done. You will not get Swipe Drive emails any more.</p><p style="font-size:14px;color:#6b7280">Changed your mind? Turn email alerts back on in Swipe Drive, under Me.</p>' : '<p>That link did not work. WhatsApp Dan on 07827 138197 and he will take you off the list.</p>', ok ? 200 : 404);
    return new Response(null, { status: ok ? 200 : 404 });
  }
  if (!t) return page('<p>That link is missing its code.</p>', 400);
  return page(`<p>Stop getting Swipe Drive emails?</p><form method="post" action="?t=${encodeURIComponent(t)}"><input type="hidden" name="via" value="page"><button style="background:#0b1220;color:#fff;border:0;border-radius:24px;padding:13px 26px;font:700 16px Helvetica,Arial,sans-serif;cursor:pointer">Unsubscribe</button></form><p style="font-size:14px;color:#6b7280">App notifications are separate and can be turned off on your phone.</p>`);
});
