/**
 * The second leaderboard: who is richest at the share counter.
 *
 * WHAT IT RANKS, AND WHY NOT THE OBVIOUS THING. Not the dollar balance. A board
 * that ranked cash in hand would rank people for NOT playing the mechanic it is
 * a board for: the moment somebody buys a share their balance drops and they
 * fall down it, and the player who sat on the daily bonus for a month tops a
 * table about a stock market. So it ranks cash PLUS what the shares are worth
 * at today's prices — the meta net worth, the number the PORTFOLIO tab already
 * shows the player about themselves.
 *
 * That makes it a live table rather than a running total. Unlike the coin board
 * — `players.stars`, which only ever goes up and is a record of what somebody
 * earned — a place here can be lost overnight to a company that fell. That is
 * the point: it is a scoreboard for holding the right things now, not a
 * monument to what was earned once, and the two boards are worth having
 * precisely because they reward opposite habits.
 *
 * Everything here is a pure function of rows and a price table, so the ranking
 * is testable without a database (`worker/test/board.test.ts`) — the same split
 * `profile.ts` draws above its own storage line.
 */

import { cleanPortfolio, priceOn, valueOf } from '../../src/market/protocol';
import { COMPANIES } from '../../src/sim/companies';

/**
 * How many profiles are read to build the table.
 *
 * The sort key cannot be computed in SQL — a portfolio is JSON and a share
 * price is a four-hundred-day fold — so the rows have to be valued here, and
 * that means a bound on how many. Ordered by `updated_at`, so the cut falls on
 * the least recently active rather than on the poorest: a player who put every
 * dollar into shares must not be dropped for having no cash, which is the exact
 * mistake this whole file exists to avoid.
 *
 * A game that outgrows this wants a column materialised once a day, not a
 * bigger number here.
 */
export const SCAN_LIMIT = 5000;

/** One profile as the query hands it over, portfolio still unparsed. */
export interface Holder {
  id: string;
  name: string;
  dollars: number;
  /** the `portfolio` column: JSON of company id to {shares, cost, day} */
  portfolio: string;
}

export interface WorthRow {
  rank: number;
  id: string;
  name: string;
  /** dollars in hand */
  cash: number;
  /** what the shares are worth at today's prices */
  shares: number;
  /** the two added up — what this board ranks on */
  worth: number;
  you: boolean;
}

/**
 * Today's price for every company, worked out once and handed to every row.
 *
 * One fold per company rather than one per holding: thirty companies against
 * however many players, and without this a table of a thousand people would
 * price NOVA a thousand times over.
 */
export function priceTable(day: number, salt: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of COMPANIES) out[c.id] = priceOn(c, day, salt);
  return out;
}

/**
 * The table, and the caller's own row when they placed outside it.
 *
 * Ties break on id rather than being left to the sort's own devices, so two
 * players worth the same amount are in the same order every time anybody looks.
 * Nothing is trusted from the rows but the numbers: a portfolio goes through
 * `cleanPortfolio`, so a company this build has dropped since is worth nothing
 * rather than throwing.
 */
export function rankByWorth(
  rows: readonly Holder[],
  prices: Record<string, number>,
  limit: number,
  me: string | null,
): { top: WorthRow[]; me: WorthRow | null } {
  const priced = rows
    .map((row) => {
      const cash = Math.max(0, Math.floor(Number(row.dollars) || 0));
      const shares = valueOf(cleanPortfolio(parse(row.portfolio)), (id) => prices[id] ?? null);
      return { id: row.id, name: row.name ?? '', cash, shares, worth: cash + shares };
    })
    .sort((a, b) => b.worth - a.worth || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const at = (i: number): WorthRow => ({
    rank: i + 1,
    ...priced[i],
    you: priced[i].id === me,
  });

  const top = priced.slice(0, Math.max(0, limit)).map((_, i) => at(i));

  // Somebody outside the slice still wants to know where they stand, and their
  // real position is already in hand — the whole table was sorted to build the
  // slice above, so finding it costs a scan rather than a second query.
  if (!me || top.some((r) => r.you)) return { top, me: null };
  const mine = priced.findIndex((r) => r.id === me);
  return { top, me: mine === -1 ? null : at(mine) };
}

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
