/**
 * Developer conveniences for one person: free purchases and undo.
 *
 * NOT a security boundary, and cannot be one. The id is baked into the client
 * bundle at build time, so anyone can read it, and it is checked against the
 * host's unverified idea of who is playing — `platform().userId()`, which
 * inside Telegram is `initDataUnsafe` and is trivially forged. It only keeps
 * the buttons out of ordinary players' way.
 *
 * WHAT ACTUALLY STOPS A FORGED ID is the Worker. Free purchases and refunds are
 * checked there against `ADMIN_ID` in `worker/wrangler.toml`, and against the
 * SIGNED caller rather than whatever the client says about itself. So
 * `VITE_ADMIN_ID` here decides only whether a button is drawn; what the button
 * does is decided on the other side. An `ADMIN_ID` left unset means nobody has
 * developer prices at all, which is the right answer for somebody else's
 * deployment.
 */

import { platform } from '../platform';

const ADMIN_ID = String(import.meta.env.VITE_ADMIN_ID ?? '').trim();

export function isAdmin(): boolean {
  // a local dev build is always the developer's own machine
  if (import.meta.env.DEV) return true;
  if (!ADMIN_ID) return false;
  return platform().userId() === ADMIN_ID;
}

const FREE_KEY = 'brokerstars.admin.free';

/** When on, purchases cost nothing — for walking through the progression fast. */
export function loadFreeMode(): boolean {
  try {
    return window.localStorage.getItem(FREE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveFreeMode(on: boolean): void {
  try {
    window.localStorage.setItem(FREE_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}
