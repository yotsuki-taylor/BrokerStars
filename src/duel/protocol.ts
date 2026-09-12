/**
 * The wire between a duellist and the Durable Object running the match.
 *
 * Both ends import this file — the client from `src/ui/duel.ts`, the server
 * from `worker/src/duel.ts` — so the shape of a message is written once and a
 * change to it breaks the build on both sides rather than in production.
 *
 * The one thing to understand before reading the rest: **the object runs the
 * simulation and the clients only draw it.** Nothing here is an input for a
 * local match to replay; the ticks below are the match, already stepped. A
 * lockstep scheme where both browsers step the same seed was the alternative
 * and was dropped for one reason — an ability moves prices, and two clients
 * that disagree by a single tick about *when* it went off spend the rest of
 * the match drawing two different charts. There is only one chart here because
 * there is only one simulation.
 *
 * A consequence worth spelling out: **every message is written for the eye of
 * the seat it goes to.** The server sends the recipient's own trader first,
 * remaps `winner` and `resigned`, and reorders the per-trader ability arrays,
 * so a client is always seat 0 of what it receives. That is why the match
 * screen needed no changes: it goes on believing the human is trader 0.
 */

import type { AbilityId, AbilityState } from '../sim/abilities';
import type { StockConfig } from '../sim/companies';
import type { NewsBanner, Trade } from '../sim/types';
import type { Outfit } from '../ui/wardrobe';

/** How long an invitation stands. Fifteen minutes, as the link says it does. */
export const DUEL_TTL_MS = 15 * 60 * 1000;

/**
 * Somebody calling this player out to a duel by name, waiting on the server.
 *
 * The invitation used to be delivered — the bot put it in the friend's
 * Telegram — and for a player signed in with Google there is no Telegram to put
 * it in. So the server holds it and the game collects it (worker/src/calls.ts).
 */
export interface DuelCall {
  code: string;
  /** who is calling, for the banner to name. Already trimmed by the server. */
  from: string;
  expiresAt: number;
}

/**
 * A call out of whatever the server put in an answer, or null.
 *
 * Null for an expired one as well as a malformed one, and the clock is checked
 * on this side too: the row was alive when it was read, but the answer may have
 * sat in a queue, and a banner offering a duel that closed while it travelled
 * is worse than no banner.
 */
export function cleanCall(raw: unknown): DuelCall | null {
  const r = raw as Record<string, unknown> | null;
  if (!r) return null;
  const code = normalizeCode(r.code);
  const expiresAt = Math.floor(Number(r.expiresAt));
  if (!code || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const from = String(r.from ?? '').trim().slice(0, 24);
  return { code, from: from || 'PLAYER', expiresAt };
}

/**
 * Between "both are here" and the first tick: the versus screen's own
 * three and a half seconds, plus the 3–2–1. The server waits it out on its own
 * clock rather than asking either client when it is ready, so the two players
 * start together whatever their phones are doing.
 */
/**
 * How long a duel holds the whistle for a host who is not on the socket.
 *
 * The invitation is minted before anybody connects, so the host's SEAT exists
 * whether or not their phone does -- and the friend sitting down used to start
 * the match on the spot. That is the same twenty seconds somebody spends in a
 * chat app choosing who to send a link to, which is where the host almost
 * always is at that exact moment (`ui/App.tsx` taps them on the shoulder).
 *
 * Bounded, because the friend is real and waiting. After this the match starts
 * regardless and an absent host simply does not trade, which is what happened
 * every time before this existed.
 */
export const HOST_WAIT_MS = 20_000;

export const DUEL_INTRO_MS = 6500;

/** A code is this long, and is the whole of the invitation's secrecy. */
export const DUEL_CODE_LENGTH = 10;

/** Who is on the other side of the versus screen. */
export interface DuelProfile {
  name: string;
  outfit: Outfit;
}

/* --------------------------------------------------------- what a tick is */

/**
 * One trader, as much of them as the match screen actually draws.
 *
 * The rival's `pos` and `ae` come through as zeros unless a DOSSIER has been
 * fired at them. Their book is what the ability is sold for, and a duel is
 * played against somebody who can open the console: what the screen does not
 * show must not be on the wire either. `hv` is what the screen does show — the
 * total they are holding — and it is sent as a number so that hiding the book
 * does not turn the HELD line into a lie.
 */
export interface DuelTraderTick {
  /** cash */
  c: number;
  /** positions, per stock; zeros for a rival you cannot see */
  pos: number[];
  /** average entry, per stock — the dashed break-even line */
  ae: number[];
  /** what everything they hold is worth, longs netted against shorts */
  hv: number;
  /** net worth */
  nw: number;
  bust: boolean;
  /** ability spent */
  used: boolean;
  /** undos left, and the tick of the trade still standing to be taken back */
  ul: number;
  ua: number;
}

export interface DuelTick {
  t: number;
  /** price per stock */
  p: number[];
  /** you first, then the other one */
  tr: [DuelTraderTick, DuelTraderTick];
  ab: AbilityState;
  /**
   * Whether the recipient's ability button should be live. Worked out on the
   * server because two of the five read the rival's book to answer, and the
   * rival's book is the one thing this end is not given.
   */
  rdy: boolean;
  /** headlines and prints since the last tick — both are usually empty */
  news: NewsBanner[];
  trades: Trade[];
  fin: boolean;
  win: number | null;
  res: number | null;
}

/**
 * Everything a client that missed some of the match needs to catch up: the
 * histories the two charts are drawn from, and the trades the result screen
 * counts. Sent once, on a connection that arrives after the first tick.
 */
export interface DuelSync {
  /** price history per stock, from the open */
  hist: number[][];
  /** net worth history, you first */
  nwHist: [number[], number[]];
  /** every trade printed so far, you first */
  trades: [Trade[], Trade[]];
  news: NewsBanner[];
}

/** What a finished duel paid, worked out by the server from its own table. */
export interface DuelAward {
  win: number;
  profit: number;
  total: number;
  /** the league it was paid at, which is not always the one that was played */
  league: number;
}

/* -------------------------------------------------------------- the messages */

export type DuelError =
  | 'notfound'
  | 'expired'
  | 'full'
  | 'badsig'
  | 'noserver'
  | 'started';

export type ClientMsg =
  /** always first, and the only place initData is ever sent */
  | { k: 'hello'; initData: string; name: string; outfit: Outfit }
  | { k: 'act'; stock: number; side: 'buy' | 'sell' }
  | { k: 'undo' }
  | { k: 'ability' }
  | { k: 'resign' }
  /**
   * Whether this player is actually looking at the game.
   *
   * Sent when it changes and once on the way in. It exists for one decision:
   * whether a duel may start. A seat is a row in the object's metadata and
   * exists from the moment the invitation was minted, and a socket can be alive
   * in a WebView the player cannot see -- neither says anybody is watching, and
   * a match that starts unwatched is a match somebody loses half of before they
   * know it began. See `HOST_WAIT_MS`.
   */
  | { k: 'here'; away: boolean }
  /**
   * Nothing to answer. It exists so that something goes *up* the socket now
   * and then: a duellist who is not trading sends nothing for a minute at a
   * time, and a lobby sends nothing for fifteen, and there are carriers and
   * proxies that hang up on a connection that quiet.
   */
  | { k: 'ping' };

export type ServerMsg =
  /** seated, and waiting for the other one. `expiresAt` is server time. */
  | {
      k: 'lobby';
      you: 0 | 1;
      rival: DuelProfile | null;
      league: number;
      expiresAt: number;
      /**
       * When the match will start without whoever is missing, or null when
       * nobody is being waited for.
       *
       * Set only in one situation: both seats are taken but the host has no
       * socket. Sending the invitation is what takes a host out of the game, so
       * the moment their friend accepts is exactly the moment they are most
       * likely to be in a chat app -- and a match that started then would run
       * its first half without them. See `HOST_WAIT_MS`.
       */
      startsBy?: number | null;
    }
  /**
   * Both are in and the match exists. Everything here is ordered for the
   * recipient: `names[0]` is theirs. The board is sent rather than re-drawn,
   * so a client that disagrees about the company roster still plays the same
   * three companies the server did.
   */
  | {
      k: 'setup';
      seed: number;
      league: number;
      stocks: StockConfig[];
      names: [string, string];
      outfits: [Outfit, Outfit];
      abilities: [AbilityId | null, AbilityId | null];
      /** null when the match is already running — see `sync` */
      startsInMs: number | null;
    }
  | { k: 'sync'; sync: DuelSync; tick: DuelTick }
  | { k: 'tick'; tick: DuelTick }
  | { k: 'end'; award: DuelAward }
  /** the other one dropped; the match, if there is one, carries on without them */
  | { k: 'gone' }
  | { k: 'back' }
  | { k: 'error'; reason: DuelError };

/** A code from an untrusted string, or null. Lowercase base32, no vowels. */
export function normalizeCode(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return /^[0-9bcdfghjklmnpqrstvwxyz]{4,32}$/.test(s) ? s : null;
}
