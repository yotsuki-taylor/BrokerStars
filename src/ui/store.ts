/**
 * `localStorage`, reached rather than named.
 *
 * Two of the modules that keep something there — the wardrobe and the room —
 * are also imported by the Worker, which has no `window` and no `localStorage`
 * at all. Naming either of them directly is a build error over there, so this
 * is the one place that goes looking for the store through `globalThis` and
 * answers null when it is not found.
 *
 * Null happens outside a Worker too: private browsing and locked-down webviews
 * throw on the very first access. Nothing here throws at a caller, and a game
 * whose store is missing simply plays a session that does not survive being
 * closed — which, since the room and the wardrobe moved to a server, is now
 * only true of a game with no server behind it either.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const store = (): KeyValueStore | null => {
  try {
    return (globalThis as { localStorage?: KeyValueStore }).localStorage ?? null;
  } catch {
    return null;
  }
};

/** Whatever is under the key, or null — never an exception. */
export function read(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function write(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* storage unavailable — this much simply does not survive the session */
  }
}
