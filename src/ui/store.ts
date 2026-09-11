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

/** Every key this game owns starts with this. Nothing else is ours to remove. */
const PREFIX = 'brokerstars.';

/**
 * Forget everything the game has kept on this device.
 *
 * One caller, and it is the serious one: deleting an account. The server empties
 * its own tables (`/profile/delete`), and this is the other half — a player told
 * that everything is gone should not reopen the app and find their office still
 * furnished. It also stops the leftovers being handed back as a `claim` the next
 * time somebody signs in on this phone, which would quietly restore what was
 * just deleted.
 *
 * `keep` is for the settings that belong to the device rather than to the
 * account. The chosen language is the only one today: flipping somebody back to
 * a language they did not pick is not part of what they asked to delete.
 *
 * Keys are collected before any are removed. Removing while walking `key(i)`
 * reindexes the store underneath the loop and leaves half of them behind.
 */
export function wipe(keep: string[] = []): void {
  try {
    const s = store() as (KeyValueStore & Storage) | null;
    if (!s || typeof s.key !== 'function') return;
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(PREFIX) && !keep.includes(key)) doomed.push(key);
    }
    for (const key of doomed) s.removeItem(key);
  } catch {
    /* a store we cannot walk is a store we cannot clear; the server half stands */
  }
}
