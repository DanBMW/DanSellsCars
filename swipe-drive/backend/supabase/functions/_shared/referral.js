/* refer.html referral -> two SwipeToDrive customers rows and one referrals row. Pure functions, shared by the
   referral-lead edge function and the tests. No messaging consent is recorded and nothing is sent. */
import { phoneUK } from './funnel.js';
/* the two rewards refer.html offers, keyed by the exact button value it sends */
export const REWARDS = { '\u00a3250 BMW Credit': 'credit', '\u00a3125 Cash': 'cash' };
export const REWARD_LABEL = { credit: '\u00a3250 BMW Credit', cash: '\u00a3125 Cash' };
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const okName = (s) => s && s.length <= 40 && !/[<>@]/.test(s);
export const first = (s) => cleanName(s).split(' ')[0] || '';
export function validateReferral(b) {
  b = b || {};
  if (b._gotcha) return 'spam';
  if (!okName(cleanName(b.referrer_name))) return 'referrer_name';
  if (!phoneUK(b.referrer_phone)) return 'referrer_phone';
  const em = String(b.referrer_email || '').trim();
  if (em && (!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(em) || em.length > 120)) return 'referrer_email';
  if (!okName(cleanName(b.friend_name))) return 'friend_name';
  if (String(b.friend_phone || '').trim() && !phoneUK(b.friend_phone)) return 'friend_phone';
  if (!REWARDS[String(b.reward_preference || '')]) return 'reward';
  if (String(b.notes || '').length > 500) return 'notes';
  if (phoneUK(b.friend_phone) && phoneUK(b.friend_phone) === phoneUK(b.referrer_phone)) return 'same';
  return null;
}
export function toRows(b, now) {
  const at = now || new Date().toISOString(), rid = b.referral_id;
  const rName = cleanName(b.referrer_name), fName = cleanName(b.friend_name);
  const referrer = { name: rName, phone: phoneUK(b.referrer_phone), email: String(b.referrer_email || '').trim().toLowerCase() || null,
    desk: { lead_source: 'referral', referrals_made: [{ referral_id: rid, first_name: first(fName), at }] } };
  const referred = { name: fName, phone: phoneUK(b.friend_phone), email: null,
    desk: { lead_source: 'referral', referred_by: { referral_id: rid, first_name: first(rName), at },
      enquiry: { source: 'referral', at, first_name: first(fName), actioned_at: null } } };
  const choice = REWARDS[b.reward_preference];
  const referral = { id: rid, referrer_first_name: first(rName), referred_first_name: first(fName), reward_choice: choice,
    reward_label: REWARD_LABEL[choice], notes: String(b.notes || '').trim().slice(0, 500) || null, status: 'new' };
  return { referrer, referred, referral };
}
/* an existing record is never overwritten from a public form: only desk notes are added */
export function mergeReferrer(desk, add) { const d = { ...(desk || {}) }; d.referrals_made = [...(d.referrals_made || []), ...add.referrals_made].slice(-20); return d; }
export function mergeReferred(desk, add) { const d = { ...(desk || {}) };
  if (!d.referred_by) d.referred_by = add.referred_by;                       // the first referrer keeps the credit
  d.enquiry = { ...add.enquiry, repeat: !!(desk && desk.enquiry) }; return d; }
