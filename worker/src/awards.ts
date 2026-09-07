/**
 * Who has earned what.
 *
 * On the server for the reason the stars and the ladder are: an award the
 * browser hands itself is a line in `localStorage`, and this one would be a
 * line saying you beat ten people. It is also the only way an award survives a
 * new phone, which is what the last few changes were all for.
 *
 * Everything here is a pure function of a profile and, where the award is about
 * something that just happened, of the match that happened — so the whole
 * shelf is testable without a database (`worker/test/awards.test.ts`). What the
 * awards ARE lives in `src/awards/catalogue.ts`, shared with the game.
 *
 * Two rules hold the design together:
 *
 * ONCE EARNED, NEVER LOST. `grant` only ever adds. Half of these are read off
 * state that can go backwards — the developer refunds a hat, and DRESSED would
 * evaporate — and an award that comes off is not an award, it is a status
 * light. The stored map is the truth; this file only ever proposes additions.
 *
 * JUDGED AT THE MOMENT, NOT ON HISTORY. The per-match ones look at the match in
 * hand rather than scanning `results`, so nothing here grows a query as the
 * table grows. The two that need memory carry it as a counter on the profile —
 * duel wins and the current streak — for the same reason.
 */

import { AWARDS, cleanAwards, type Award } from '../../src/awards/catalogue';
import { COMPANIES } from '../../src/sim/companies';
import { RARITIES, SLOTS } from '../../src/ui/wardrobe';
import { ROOM_DONE } from '../../src/ui/renovation';
import type { Held } from './profile';

/** What one finished match is, as far as the shelf is concerned. */
export interface MatchFacts {
  outcome: 'win' | 'draw' | 'loss';
  netWorth: number;
  tradedWell: boolean;
  bankrupt: boolean;
  /** how many trades the player made in it; zero is a whole achievement */
  trades: number;
  /** a duel, rather than a bot. Paid differently and counted differently. */
  duel: boolean;
}

/** What the judge needs beyond the profile itself. */
export interface Standing {
  /** best net worth ever, as `players` remembers it */
  bestNetWorth: number;
  /** highest league a match was ever finished in, likewise */
  topLeague: number;
}

/** The starting cash a match is measured against; `sim/config.ts` sets it. */
const STARTING_CASH = 10_000;

/**
 * Everything the profile satisfies right now. Called after a match and after a
 * purchase, and safe to call at any other time: it is a question, not an event.
 */
export function satisfied(held: Held, at: Standing, match?: MatchFacts): string[] {
  const out: string[] = [];
  const yes = (a: Award) => out.push(a.id);

  for (const a of AWARDS) {
    switch (a.group) {
      case 'money':
        // The best match ever, not the one just played: an award for reaching a
        // number should not depend on being asked on the right day.
        if (at.bestNetWorth >= (a.goal ?? Infinity)) yes(a);
        break;

      case 'duel':
        if (held.duelWins >= (a.goal ?? Infinity)) yes(a);
        break;

      case 'league':
        // Earned by having played there, which is the part the server can see
        // for itself. Opening a league you never sit down in earns nothing.
        if (at.topLeague >= (a.league ?? Infinity)) yes(a);
        break;

      case 'style':
        if (a.id === 'dressed' && SLOTS.every((s) => held.owned[s])) yes(a);
        if (a.id === 'legend-item' && SLOTS.some((s) => held.owned[s] === 'legend')) yes(a);
        if (a.id === 'room-done' && held.room >= ROOM_DONE) yes(a);
        break;

      case 'secret':
        if (a.id === 'streak-3' && held.streak >= (a.goal ?? Infinity)) yes(a);
        if (a.id === 'all-companies' && held.seen.length >= COMPANIES.length) yes(a);
        if (!match) break;
        // Going broke. Not read off a net worth of zero, which is what it used
        // to look like: the PRESSED SHIRT leaves you a tenth of your money, so
        // a busted trader in a decent shirt has a perfectly ordinary number.
        if (a.id === 'bust' && match.bankrupt) yes(a);
        // Cleared the profit bar and lost anyway — only possible against an
        // opponent who finishes well above where they started, which is what
        // the top of the ladder is.
        if (a.id === 'honest-loss' && match.tradedWell && match.outcome === 'loss') yes(a);
        // Won with less than you sat down with. The other side did worse.
        if (a.id === 'pyrrhic' && match.outcome === 'win' && match.netWorth < STARTING_CASH) yes(a);
        // Won without touching anything. The market drifts up on its own and
        // once in a long while that is enough.
        if (a.id === 'no-trades' && match.outcome === 'win' && match.trades === 0) yes(a);
        break;
    }
  }

  return out;
}

/**
 * The profile with everything a finished match changes about it: the streak,
 * the duel count, and then whatever that makes true. `record` has already
 * written the match itself and banked any league win by the time this runs.
 */
export function afterMatch(held: Held, at: Standing, match: MatchFacts, now: number): Held {
  const won = match.outcome === 'win';
  const next: Held = {
    ...held,
    // A draw is not a win, so it is not a streak either. And a draw is a real
    // thing here, unlike against a bot: two duellists who both sit on their
    // hands finish holding exactly the cash they started with, to the penny,
    // and the match is decided by comparing those. It was the first thing that
    // happened the first time a duel was played end to end in a test.
    streak: won ? held.streak + 1 : 0,
    duelWins: held.duelWins + (won && match.duel ? 1 : 0),
  };
  return grant(next, satisfied(next, at, match), now);
}

/** The same, for the things that change in the shop rather than in a match. */
export function afterChange(held: Held, at: Standing, now: number): Held {
  return grant(held, satisfied(held, at), now);
}

/** Add whatever is not already on the shelf, dated. Never removes anything. */
export function grant(held: Held, ids: string[], now: number): Held {
  let awards = held.awards;
  let added = false;
  for (const id of ids) {
    if (awards[id] !== undefined) continue;
    if (!added) {
      awards = { ...awards };
      added = true;
    }
    awards[id] = now;
  }
  return added ? { ...held, awards } : held;
}

/** Companies met, as a set that only grows. The archive tab draws this. */
export function withSeen(held: Held, ids: string[]): Held {
  const known = new Set(COMPANIES.map((c) => c.id));
  const seen = new Set(held.seen);
  let added = false;
  for (const id of ids) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    added = true;
  }
  return added ? { ...held, seen: [...seen] } : held;
}

/** A stored shelf, read back: only ids this build knows about. */
export const cleanShelf = cleanAwards;

/** A list of company ids off the wire, cut to the ones that exist. */
export function cleanSeen(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(COMPANIES.map((c) => c.id));
  const out = new Set<string>();
  for (const id of raw) if (typeof id === 'string' && known.has(id)) out.add(id);
  return [...out];
}

/** Rarities are a ladder and `legend` is the top of it — checked, not assumed. */
export const TOP_RARITY = RARITIES[RARITIES.length - 1];
