/**
 * What a finished match paid, and the row it leaves behind.
 *
 * Both ways in end up here: `/result`, which is a client saying what happened
 * in a match against a bot, and the duel object, which does not have to be
 * told because it ran the match itself. Either way the star count is worked
 * out on this side of the wire and never read off the request.
 */

import type { Caller } from './telegram';

export interface Env {
  DB: D1Database;
  /** the bot's token, set with `wrangler secret put BOT_TOKEN` */
  BOT_TOKEN?: string;
  DUEL: DurableObjectNamespace;
}

export type Outcome = 'win' | 'draw' | 'loss';

/**
 * The server's own copy of ui/leagues.ts. Duplicated on purpose: a payout the
 * client can edit is not a payout. If the tables in the game change, change
 * them here too — `worker/README.md` says so, and the numbers are few enough
 * that sharing a module across two builds would cost more than it saves.
 */
export const REWARDS: { win: number; draw: number; profit: number }[] = [
  { win: 3, draw: 1, profit: 2 }, // bronze
  { win: 5, draw: 2, profit: 3 }, // silver
  { win: 8, draw: 3, profit: 4 }, // gold
  { win: 12, draw: 4, profit: 6 }, // global
  { win: 18, draw: 6, profit: 9 }, // crown
];

/**
 * The gain a match has to clear for the profit bonus, and the same copy of the
 * same number for the same reason — `REWARDS.profitBar` in ui/progress.ts.
 *
 * A bot match is the client's word for whether the bar was cleared and the
 * server only pays on it; a duel is the server's own arithmetic, which is what
 * this constant is for.
 */
export const PROFIT_BAR = 0.4;

export const clearedBar = (netWorth: number, startingCash: number): boolean =>
  netWorth >= startingCash * (1 + PROFIT_BAR);

/** A loss pays nothing, and a surrender never gets this far. */
export function payout(league: number, outcome: string, tradedWell: boolean): number {
  const table = REWARDS[league];
  if (!table) return 0;
  const base = outcome === 'win' ? table.win : outcome === 'draw' ? table.draw : 0;
  return base + (tradedWell ? table.profit : 0);
}

/** Split the same way the result screen shows it, so the two numbers add up. */
export function award(league: number, outcome: Outcome, tradedWell: boolean) {
  const table = REWARDS[league] ?? { win: 0, draw: 0, profit: 0 };
  const win = outcome === 'win' ? table.win : outcome === 'draw' ? table.draw : 0;
  const profit = tradedWell ? table.profit : 0;
  return { win, profit, total: win + profit, league };
}

export interface Row {
  id: string;
  name: string;
  stars: number;
  matches: number;
  wins: number;
  best_net_worth: number;
  top_league: number;
}

/**
 * The highest league this player has ever finished a match in, as the server
 * remembers it — never as the client claims. A duel pays each side at their
 * own ladder position rather than at whoever's league was played, or beating
 * one friend under the crown would be worth eighteen stars to somebody who has
 * never left the bronze pit.
 */
export async function topLeague(env: Env, id: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT top_league FROM players WHERE id = ?1`)
    .bind(id)
    .first<{ top_league: number }>();
  return row?.top_league ?? 0;
}

export interface Recorded {
  seed: string;
  league: number;
  outcome: Outcome;
  netWorth: number;
  tradedWell: boolean;
  /** what the SERVER decided to pay */
  stars: number;
}

/** One match into the two tables: the running total the board reads, and the row kept for a replay check. */
export async function record(env: Env, caller: Caller, r: Recorded): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO players (id, name, stars, matches, wins, best_net_worth, top_league,
                            first_seen, updated_at)
            VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT (id) DO UPDATE SET
            name           = ?2,
            stars          = stars + ?3,
            matches        = matches + 1,
            wins           = wins + ?4,
            best_net_worth = MAX(best_net_worth, ?5),
            top_league     = MAX(top_league, ?6),
            updated_at     = ?7`,
    ).bind(
      caller.id,
      caller.name,
      r.stars,
      r.outcome === 'win' ? 1 : 0,
      r.netWorth,
      r.league,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO results (player_id, seed, league, outcome, net_worth, traded_well, stars,
                            verified, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)`,
    ).bind(
      caller.id,
      r.seed,
      r.league,
      r.outcome,
      r.netWorth,
      r.tradedWell ? 1 : 0,
      r.stars,
      now,
    ),
  ]);
}
