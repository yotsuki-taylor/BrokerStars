/**
 * The dollar balance and the day, as this browser last saw them.
 *
 * The server owns both — see `worker/src/profile.ts` — and this is the mirror,
 * kept for exactly the two reasons `progress.ts` keeps a coin count: it is what
 * the menu draws before the first answer arrives, and it is all there is when
 * the game is opened outside Telegram or against a build with no server behind
 * it. Whatever the server says replaces it (`applyProfile` in `App.tsx`).
 *
 * That means a bonus taken with no server behind the game is a bonus taken on
 * this phone only, and a second phone will hand out another one. That is the
 * same bargain every other number here has struck since the profile moved off
 * the device, and it is the honest one: the alternative is a button that does
 * nothing at all in a local `npm run dev`.
 */

import { cleanDaily, rolled, type Daily } from '../daily/protocol';
import { read, write } from './store';

const DOLLARS_KEY = 'brokerstars.dollars';
const DAILY_KEY = 'brokerstars.daily';

export function loadDollars(): number {
  const n = Number(read(DOLLARS_KEY));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export const saveDollars = (n: number): void =>
  write(DOLLARS_KEY, String(Math.max(0, Math.floor(n))));

/** Today's, always: a day held from yesterday is rolled on the way out. */
export function loadDaily(): Daily {
  let raw: unknown = null;
  try {
    const stored = read(DAILY_KEY);
    raw = stored ? JSON.parse(stored) : null;
  } catch {
    /* a row somebody edited by hand is a row nobody has played today */
  }
  return rolled(cleanDaily(raw), Date.now());
}

export const saveDaily = (d: Daily): void => write(DAILY_KEY, JSON.stringify(d));
