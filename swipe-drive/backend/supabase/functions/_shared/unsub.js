/* Signed one click unsubscribe tokens, one per recipient. Token = <profile id>.<purpose>.<signature>,
   signature = HMAC SHA256(UNSUBSCRIBE_SECRET, id + '.' + purpose) in base64url. Nothing to store, cannot be
   guessed or changed to unsubscribe someone else. Works in Deno (edge functions) and node 20 (tests). */
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export async function signUnsub(secret, id, purpose = 'alerts') {
  if (!secret || secret.length < 16) throw new Error('UNSUBSCRIBE_SECRET missing or too short');
  return `${id}.${purpose}.${await hmac(secret, id + '.' + purpose)}`;
}
export async function verifyUnsub(secret, tok) {
  const m = /^([0-9a-f-]{36})\.([a-z]+)\.([A-Za-z0-9_-]{43})$/i.exec(String(tok || ''));
  if (!m || !secret) return null;
  const want = await hmac(secret, m[1] + '.' + m[2]);
  let d = want.length ^ m[3].length; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ (m[3].charCodeAt(i) || 0);
  return d === 0 ? { id: m[1], purpose: m[2] } : null;
}
