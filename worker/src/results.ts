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
  /**
   * Where the game is served from, which the bot needs to build the button it
   * answers with. Public, and in `wrangler.toml` beside the database id for
   * the same reason that is: it names this deployment, it does not protect it.
   */
  WEBAPP_URL?: string;
  /**
   * The developer's Telegram id, if there is one. Not a secret — it is already
   * baked into the client bundle as `VITE_ADMIN_ID` — and not a way in either:
   * all it buys is free purchases and refunds in the shop, and only for a
   * caller whose id arrived on a signature Telegram put there. See
   * `profile.ts`.
   */
  ADMIN_ID?: string;
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
  /**
   * The client's name for this match, minted once when it finished. It is what
   * makes handing one in safe to repeat: see `alreadyPaid` and the UNIQUE index
   * the insert below leans on.
   */
  token: string;
}

/**
 * Was this match already handed in and paid for? A submission whose answer
 * never arrived gets sent again — that is the whole point of the token — and
 * this is what tells the second attempt from a second match.
 *
 * Null means no, and a number means yes and this is what it paid, so the answer
 * to a repeat is the same answer the first one would have given.
 */
export async function alreadyPaid(env: Env, token: string): Promise<number | null> {
  const row = await env.DB.prepare(`SELECT stars FROM results WHERE token = ?1`)
    .bind(token)
    .first<{ stars: number }>();
  return row ? row.stars : null;
}

/**
 * One match into the two tables: the running total the board reads, and the row
 * kept for a replay check.
 *
 * The two statements go in one batch, which is the only reason a duplicate
 * cannot be paid for twice. `alreadyPaid` above is the polite check and it has
 * a gap in it — two retries in flight at once both pass it — so the UNIQUE index
 * on `token` is the one that actually holds: the second insert raises, D1 rolls
 * the whole batch back, and the star count in `players` never moved. The caller
 * treats that raise as "already had it", because that is what it means.
 */
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
                            verified, token, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)`,
    ).bind(
      caller.id,
      r.seed,
      r.league,
      r.outcome,
      r.netWorth,
      r.tradedWell ? 1 : 0,
      r.stars,
      r.token,
      now,
    ),
  ]);
}
