/**
 * Looking for somebody to play, and the whole of how two strangers are paired.
 *
 * PLAY on the menu used to be a match against a bot and nothing else; the
 * search on the versus screen was a flourish. Now it is real: the game asks
 * the server's one pool (`worker/src/matchmaker.ts`) whether anybody else is
 * looking in the same league, and two who are get a duel of their own -- the
 * same `Duel` object a link opens, told that this one counts on the ladder.
 * Nobody turns up in time and the game deals the bot, exactly as it always did.
 *
 * WHO DECIDES THAT NOBODY CAME. The server, never the phone. A phone that gave
 * up on its own clock could do so in the very millisecond the pool paired it,
 * and the other player would sit down opposite an empty chair. One pool in one
 * object answers every seeker exactly once — paired, or nobody — and the phone
 * keeps a timer of its own only for a server that says nothing at all.
 *
 * HOW LONG. A minute, every time. The screen says how long it has been and,
 * a few seconds in, offers the bot (`VersusScreen`), so the minute is the
 * longest anybody waits rather than how long everybody does. An earlier
 * version cut the wait short for a league nobody had visited lately; with a
 * way out on the screen, a full minute for whoever is willing to wait is the
 * better bet on finding them somebody.
 *
 * Both ends import this file, and the pairing itself is plain arithmetic over
 * a list so that it can be tested without a Durable Object to run it in.
 */

/** How long a seek waits for somebody before the answer is nobody. */
export const SEEK_MS = 60_000;

/**
 * How long the phone waits past `SEEK_MS` for a server that has said nothing,
 * before dealing the bot itself. Only ever reached when the answer was lost;
 * the server's own deadline always comes first.
 */
export const SEEK_GRACE_MS = 2500;

/**
 * How long a paired duel may take to start before the phone gives up on it and
 * deals the bot. Both phones connect within a second of hearing about the pair;
 * one that has not by now never will.
 */
export const PAIR_START_MS = 8000;

/**
 * How long a paired duel stands open for its two players to sit down, against
 * an invitation's fifteen minutes. Both were told about it in the same instant
 * and are connecting already; anything still empty after a minute is litter.
 */
export const PAIR_TTL_MS = 60_000;

export type SeekClientMsg =
  /** the first and only thing a seeker says; initData is who is asking */
  { k: 'seek'; initData: string; league: number };

export type SeekServerMsg =
  /** paired: sit down at this duel, as an ordinary duellist would */
  | { k: 'found'; code: string }
  /** nobody came; play the bot */
  | { k: 'none' }
  | { k: 'error'; reason: 'badsig' | 'noserver' };

export interface Seeker<T> {
  id: string;
  league: number;
  /** when they started looking, by the pool's clock */
  at: number;
  /** whatever the caller needs to answer them by — a socket, in the Worker */
  handle: T;
}

export type Seek<T> =
  /** two of them: `host` was waiting first and takes seat 0 */
  | { kind: 'pair'; host: Seeker<T>; guest: Seeker<T> }
  /**
   * Waiting, for this long. `replaced` is the same player's earlier seek from
   * another tab or a phone that reconnected, which the caller should answer
   * with nobody and let go of.
   */
  | { kind: 'wait'; ms: number; replaced: Seeker<T> | null };

export class Pool<T> {
  private waiting: Seeker<T>[] = [];

  seek(s: Seeker<T>): Seek<T> {
    // The same player twice is a tab left open or a phone that dropped and came
    // back. Pairing them with themselves would be a duel for their own coins.
    const i = this.waiting.findIndex((w) => w.id === s.id);
    const replaced = i >= 0 ? this.waiting.splice(i, 1)[0] : null;

    const j = this.waiting.findIndex((w) => w.league === s.league);
    if (j >= 0) {
      const host = this.waiting.splice(j, 1)[0];
      return { kind: 'pair', host, guest: s };
    }

    this.waiting.push(s);
    return { kind: 'wait', ms: SEEK_MS, replaced };
  }

  /**
   * The deadline came. True if this seeker was still waiting and has now been
   * taken out; false if they were paired or left in the meantime, in which case
   * they have had their answer and must not be given a second one.
   */
  expire(handle: T): boolean {
    return this.drop(handle);
  }

  /** The seeker went away on their own: closed the screen, lost the socket. */
  leave(handle: T): void {
    this.drop(handle);
  }

  /** How many are waiting right now. For the tests. */
  get size(): number {
    return this.waiting.length;
  }

  private drop(handle: T): boolean {
    const i = this.waiting.findIndex((w) => w.handle === handle);
    if (i < 0) return false;
    this.waiting.splice(i, 1);
    return true;
  }
}
