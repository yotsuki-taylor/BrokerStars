/**
 * The standing orders the player has given about the draw: one company they
 * always want on the board, one they never want to see again.
 *
 * Meta, like archive.ts — the draw itself lives in sim/companies.ts and takes
 * these as options. Both are kept globally rather than per league: a ban that
 * only held in the bronze pit would be forgotten by the time it mattered, and
 * the pool a league offers already decides whether the named company can turn
 * up at all.
 */

import { COMPANIES } from '../sim/companies';

const KEY = 'brokerstars.board';
const HELD_KEY = 'brokerstars.held';

export interface BoardPrefs {
  pin: string | null;
  ban: string | null;
}

export const NO_PREFS: BoardPrefs = { pin: null, ban: null };

const known = (id: unknown): string | null =>
  typeof id === 'string' && COMPANIES.some((c) => c.id === id) ? id : null;

/** Private browsing and locked-down webviews throw on access, so never assume. */
export function loadPrefs(): BoardPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...NO_PREFS };
    const pin = known(raw.pin);
    const ban = known(raw.ban);
    // pinning and banning the same company would cancel out in the draw and
    // leave the player staring at two lit-up buttons that do nothing
    return { pin, ban: ban === pin ? null : ban };
  } catch {
    return { ...NO_PREFS };
  }
}

export function savePrefs(prefs: BoardPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — the orders hold for this session only */
  }
}

/* ------------------------------------------------------------ held boards */

/**
 * The seed each league is holding for the player: the board it has already
 * dealt them, standing until they play that match out.
 *
 * Without this the draw was a free reroll. Backing out of the board screen and
 * coming back dealt three fresh companies, and so did stepping into another
 * league and back — which left the BALL CAP and the BLACK BRIM, the two items
 * sold on being able to change the board, buying something the player already
 * had for nothing.
 *
 * Kept per league, because each league draws from its own pool, and written to
 * storage rather than memory, or reloading the page would be the same reroll
 * with an extra step.
 */
export type HeldBoards = Record<number, string>;

export function loadHeld(): HeldBoards {
  try {
    const raw = JSON.parse(window.localStorage.getItem(HELD_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return {};
    const out: HeldBoards = {};
    for (const [k, v] of Object.entries(raw)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && typeof v === 'string' && v) out[i] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveHeld(held: HeldBoards): void {
  try {
    window.localStorage.setItem(HELD_KEY, JSON.stringify(held));
  } catch {
    /* storage unavailable — the board holds for this session only */
  }
}
