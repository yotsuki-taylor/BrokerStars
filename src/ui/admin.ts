/**
 * Developer conveniences for one person: free purchases and undo.
 *
 * NOT a security boundary, and cannot be one. The id is baked into the client
 * bundle at build time, so anyone can read it, and it is checked against
 * Telegram's `initDataUnsafe`, which is unsigned and trivially forged. It only
 * keeps the buttons out of ordinary players' way. Anything that must not be
 * cheated has to be enforced on a server, which this prototype does not have.
 */

const ADMIN_ID = String(import.meta.env.VITE_ADMIN_ID ?? '').trim();

export function isAdmin(): boolean {
  // a local dev build is always the developer's own machine
  if (import.meta.env.DEV) return true;
  if (!ADMIN_ID) return false;
  const id = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id != null && String(id) === ADMIN_ID;
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
