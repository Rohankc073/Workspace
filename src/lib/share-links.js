import { createHmac } from 'crypto';

/**
 * A per-link cookie marker proving the visitor entered the correct
 * password. It's an HMAC over the link id + its password hash, so it
 * can't be forged, and it changes if the link is ever re-passworded.
 * Requires SHARE_LINK_SECRET in the environment (any long random string).
 */
export function shareCookieValue(link) {
  const secret = process.env.SHARE_LINK_SECRET;
  if (!secret) {
    throw new Error('SHARE_LINK_SECRET is not set. Add it to your .env file.');
  }
  return createHmac('sha256', secret)
    .update(`${link.id}:${link.passwordHash ?? ''}`)
    .digest('hex');
}

export function shareCookieName(link) {
  return `sl_${link.id}`;
}