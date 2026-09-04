/**
 * Which companies the player has actually met.
 *
 * Meta, like progress.ts and renovation.ts: a company is recorded the moment
 * it goes up on a board, and nothing in the simulation ever reads this back.
 * The roster itself lives in sim/companies.ts — only the discovery does.
 */

import { COMPANIES } from '../sim/companies';

const KEY = 'brokerstars.companies';

/** Private browsing and locked-down webviews throw on access, so never assume. */
export function loadSeen(): Set<string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (!Array.isArray(raw)) return new Set();
    // a company dropped from the roster since must not linger in the count
    const known = new Set(COMPANIES.map((c) => c.id));
    return new Set(raw.filter((id): id is string => typeof id === 'string' && known.has(id)));
  } catch {
    return new Set();
  }
}

export function saveSeen(ids: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable — the archive simply does not persist this session */
  }
}

/**
 * The set with `ids` added, or the same set back when there is nothing new.
 * Returning the identity unchanged keeps a match start from re-rendering the
 * menu tree for a board the player has already met.
 */
export function withSeen(prev: Set<string>, ids: string[]): Set<string> {
  if (ids.every((id) => prev.has(id))) return prev;
  const next = new Set(prev);
  for (const id of ids) next.add(id);
  return next;
}
