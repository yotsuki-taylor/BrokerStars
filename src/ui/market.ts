/**
 * The share book and the prices, as this browser last saw them.
 *
 * The server owns both — `worker/src/profile.ts` keeps the book, `/market`
 * hands out the prices — and this is the mirror, kept for the two reasons
 * `daily.ts` keeps a dollar balance: it is what the archive draws before the
 * first answer arrives, and it is all there is when the game is opened outside
 * Telegram or against a build with no server behind it.
 *
 * THE PRICES WITHOUT A SERVER. `src/market/protocol.ts` is a pure function of a
 * company and a day, so this end can work out the whole market for itself. What
 * it cannot work out is the salt, which is the Worker's — so the prices it
 * computes are not the prices anybody's profile is settled at. That is fine and
 * it is the same bargain the daily bonus already strikes: a build with no server
 * is a game played on this phone alone, and a counter that did nothing at all in
 * `npm run dev` would be worse than one that plays its own market.
 *
 * Which is why `localMarket` exists and why nothing else calls `seriesFor`
 * directly: there is exactly one place in the client where an unsalted price is
 * allowed to come from, and it is here.
 */

import { dayOf } from '../daily/protocol';
import {
  HISTORY_DAYS,
  cleanMarket,
  cleanPortfolio,
  marketFor,
  type Market,
  type Portfolio,
} from '../market/protocol';
import { read, write } from './store';

const PORTFOLIO_KEY = 'brokerstars.portfolio';
const MARKET_KEY = 'brokerstars.market';

export function loadPortfolio(): Portfolio {
  try {
    const raw = read(PORTFOLIO_KEY);
    return cleanPortfolio(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export const savePortfolio = (p: Portfolio): void =>
  write(PORTFOLIO_KEY, JSON.stringify(p));

/**
 * The market this end worked out for itself, for a build with no server. Salted
 * with nothing, which is exactly why the server does not accept a price from
 * here — see the note above.
 */
export const localMarket = (now = Date.now()): Market => {
  const day = dayOf(now);
  return { day, prices: marketFor(day, HISTORY_DAYS, '') };
};

/**
 * The last market the server sent, if it is still about today. A cached answer
 * from yesterday is not a stale detail — it is the wrong price on every row —
 * so it is thrown away rather than drawn.
 */
export function loadMarket(now = Date.now()): Market | null {
  try {
    const raw = read(MARKET_KEY);
    if (!raw) return null;
    const m = cleanMarket(JSON.parse(raw));
    return m.day === dayOf(now) && Object.keys(m.prices).length ? m : null;
  } catch {
    return null;
  }
}

export const saveMarket = (m: Market): void => write(MARKET_KEY, JSON.stringify(m));
