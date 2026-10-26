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

/** Somewhere a short string can be kept: this browser by default. */
export interface GuestStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

const browser: GuestStore = { read, write };
let vault: GuestStore = browser;

/**
 * Keep the guest somewhere better than this browser, for a host that offers one.
 *
 * CrazyGames does: its Data module keeps a logged-in player's data in their
 * account, so a guest kept there comes back on every device they sign in on,
 * and for a player who is not logged in it is this browser anyway. The guest
 * is the key to everything the server holds for this player, so where it lives
 * is where their progress lives. Called by `platform/crazygames.ts` once the SDK
 * is up; every other host keeps the default.
 *
 * The browser is never let go of. Every write goes to both, and a read the
 * better place has nothing for falls back on the browser and copies what it
 * finds across — which is also how a guest from before the move gets there,
 * with nothing to run once. So a place that loses things, refuses them or
 * throws costs a player the cross-device part and never the guest: found the
 * hard way, by a test whose Data module was switched off.
 */
export function keepGuestIn(store: GuestStore): void {
  vault = store;
  guest = undefined;
}

/** Back to this browser, and nothing cached. For the tests, which are the only thing that may call it. */
export function __resetGuestStore(): void {
  vault = browser;
  guest = undefined;
}

function load(): Guest | null {
  if (guest !== undefined) return guest;
  guest = null;
  try {
    let raw = vault === browser ? browser.read(KEY) : safely(() => vault.read(KEY));
    if (vault !== browser) {
      const here = browser.read(KEY);
      if (!raw && here) {
        // the better place had nothing: give it what this browser had
        raw = here;
        safely(() => vault.write(KEY, here));
      } else if (raw && raw !== here) {
        // and this browser keeps a copy of what the better place had, so the
        // fallback is there the day the better place is not
        browser.write(KEY, raw);
      }
    }
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
  const value = next ? JSON.stringify(next) : '';
  try {
    browser.write(KEY, value);
  } catch {
    /* a session we cannot write is one that lasts until the tab closes */
  }
  if (vault !== browser) safely(() => vault.write(KEY, value));
}

/** Whatever a host's store does wrong is the same as it having nothing. */
function safely<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
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
