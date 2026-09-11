/**
 * Being somebody without saying who.
 *
 * Telegram hands the game an identity before it draws a frame. Nowhere else
 * does: a browser tab and a freshly installed app are both nobody, and a player
 * who is nobody could not be written down anywhere — no board, no duel, no
 * friend. Which is how an invitation sent out of the Android app became a link
 * to a page where the recipient could look and not join.
 *
 * So the server will vouch for somebody it knows nothing about
 * (`worker/src/auth.ts`), and this is where the game keeps that. It is the same
 * `bs1.` token every other session is; from `identify` down, a guest is an
 * ordinary player.
 *
 * WHERE THIS SITS IN THE ORDER. The host's own token always wins — Telegram's
 * signature, or the session an Android player got by signing in with Google.
 * This is what `initData()` falls back to, and only then (`ui/api.ts`).
 *
 * WHAT IT COSTS THE PLAYER. It lives in this browser's storage and nowhere
 * else. Clear the data, reinstall, change phone, and it is gone — which is why
 * signing in with Google hands the guest's save over rather than starting a
 * fresh one beside it. That is `/auth/google` taking a `guest` field, and it is
 * the whole reason the field exists.
 */

import { read, write } from './store';

const KEY = 'brokerstars.guest';

/**
 * Where the Worker is. Read the same way ui/api.ts reads it rather than
 * imported from there: that module imports this one, and a cycle between the
 * two is not worth one shared line.
 */
const BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

interface Guest {
  token: string;
  id: string;
  name: string;
}

/**
 * Read once and kept, because `initData()` is synchronous and is asked before
 * every write. Undefined means "not looked yet"; null means "looked, no guest",
 * which is the ordinary state for a player inside Telegram.
 */
let guest: Guest | null | undefined;

function load(): Guest | null {
  if (guest !== undefined) return guest;
  guest = null;
  try {
    const raw = read(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Guest>;
      if (parsed.token && parsed.id) {
        guest = {
          token: String(parsed.token),
          id: String(parsed.id),
          name: String(parsed.name ?? '').slice(0, 24),
        };
      }
    }
  } catch {
    /* unreadable storage is a player with no guest session */
  }
  return guest;
}

function keep(next: Guest | null): void {
  guest = next;
  try {
    if (next) write(KEY, JSON.stringify(next));
    else write(KEY, '');
  } catch {
    /* a session we cannot write is one that lasts until the tab closes */
  }
}

export const guestToken = (): string => load()?.token ?? '';
export const guestId = (): string | null => load()?.id ?? null;
export const guestName = (): string => load()?.name ?? '';

/**
 * Get one, if there is a server to get it from and nobody has one already.
 *
 * Called once on the way in, before the profile handshake, because everything
 * after it asks who is playing. Silent about every way it can fail: a build
 * with no server, a server that is down, a deployment that mints no sessions —
 * all of them leave the game exactly as it was before guests existed, which is
 * playable and local.
 *
 * `hostHasOne` is passed rather than read here so that this module knows
 * nothing about hosts. Inside Telegram it is true and this does nothing at all.
 */
export async function ensureGuest(hostHasOne: boolean): Promise<void> {
  if (hostHasOne || !BASE || load()) return;
  try {
    const res = await fetch(`${BASE}/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return;
    const body = (await res.json()) as { token?: string; id?: string; name?: string };
    if (body.token && body.id) {
      keep({ token: body.token, id: body.id, name: String(body.name ?? '').slice(0, 24) });
    }
  } catch {
    /* no guest is not an error; it is the game as it was */
  }
}

/**
 * Spend it.
 *
 * After a real sign-in the guest is done with: the server has been told the two
 * are the same person and the host now carries a token of its own, which wins
 * anyway. Clearing it keeps the storage honest rather than leaving a second
 * identity lying about for somebody to wonder at.
 */
export function forgetGuest(): void {
  keep(null);
}
