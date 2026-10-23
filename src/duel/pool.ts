/**
 * Looking for somebody to play, and the whole of how two strangers are paired.
 *
 * PLAY on the menu used to be a match against a bot and nothing else; the
 * search on the versus screen was a flourish. Now it is real for a few seconds:
 * the game asks the server's one pool (`worker/src/matchmaker.ts`) whether
 * anybody else is looking in the same league, and two who are get a duel of
 * their own -- the same `Duel` object a link opens, told that this one counts
 * on the ladder. Nobody turns up in time and the game deals the bot, exactly as
 * it always did.
 *
 * WHO DECIDES THAT NOBODY CAME. The server, never the phone. A phone that gave
 * up on its own clock could do so in the very millisecond the pool paired it,
 * and the other player would sit down opposite an empty chair. One pool in one
 * object answers every seeker exactly once — paired, or nobody — and the phone
 * keeps a timer of its own only for a server that says nothing at all.
 *
 * HOW LONG. Up to a minute, and only when there is somebody to wait for. A
 * minute is long, so the screen says how long it has been and offers the bot
 * at any moment (`VersusScreen`); the wait is the ceiling, not a sentence. A
 * seeker alone in a league whose last visitor left an hour ago gets the old
 * flourish's length instead, so a quiet evening costs nobody anything over
 * what PLAY always cost. "Somebody" is anyone else who looked for a match in
 * this league recently: a player in a bot match now is in the queue again in
 * about two minutes, which is what the window is sized to.
 *
 * Both ends import this file, and the pairing itself is plain arithmetic over
 * a list so that it can be tested without a Durable Object to run it in.
 */

/** The longest a seek waits, when there is somebody it might be paired with. */
export const SEEK_MS = 60_000;

/** The wait for a seeker nobody is likely to join: the old flourish's length. */
export const SEEK_ALONE_MS = 1400;

/**
 * How recently another seeker must have looked for this league to count as
 * about. A match against a bot is eighty seconds plus the screens either side
 * of it, so a player who is playing one now looks again inside this.
 */
export const ONLINE_WINDOW_MS = 3 * 60_000;

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

/** Who looked for which league and when: what the pool keeps between visits. */
export type Seen = [id: string, last: { league: number; at: number }][];

export class Pool<T> {
  private waiting: Seeker<T>[] = [];
  /** who looked for which league and when, kept for `ONLINE_WINDOW_MS` */
  private seen = new Map<string, { league: number; at: number }>();

  /**
   * The visitors, to be kept somewhere that outlives this object.
   *
   * The queue itself never needs keeping: somebody waiting holds a socket open,
   * and an open socket holds the object in memory. The visitors are the other
   * way round — they are exactly the players who have gone off to play a bot,
   * leaving nothing open — so an idle pool is evicted, and without this a quiet
   * minute would make everybody look alone. Found the hard way, on a local run.
   */
  snapshot(): Seen {
    return [...this.seen];
  }

  /** Put back what `snapshot` gave, as the object wakes up. */
  restore(seen: Seen | undefined, now: number): void {
    for (const [id, last] of seen ?? []) {
      if (typeof id === 'string' && Number.isFinite(last?.at)) this.seen.set(id, last);
    }
    this.forget(now);
  }

  seek(s: Seeker<T>): Seek<T> {
    this.forget(s.at);

    // The same player twice is a tab left open or a phone that dropped and came
    // back. Pairing them with themselves would be a duel for their own coins.
    const i = this.waiting.findIndex((w) => w.id === s.id);
    const replaced = i >= 0 ? this.waiting.splice(i, 1)[0] : null;

    // Read before this seeker is written in, so they do not count as company
    // for themselves.
    const about = this.about(s);
    this.seen.set(s.id, { league: s.league, at: s.at });

    const j = this.waiting.findIndex((w) => w.league === s.league);
    if (j >= 0) {
      const host = this.waiting.splice(j, 1)[0];
      return { kind: 'pair', host, guest: s };
    }

    this.waiting.push(s);
    return { kind: 'wait', ms: about ? SEEK_MS : SEEK_ALONE_MS, replaced };
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

  /** Is anybody else about in this league — waiting now, or looked recently? */
  private about(s: Seeker<T>): boolean {
    for (const [id, last] of this.seen) {
      if (id !== s.id && last.league === s.league) return true;
    }
    return false;
  }

  private drop(handle: T): boolean {
    const i = this.waiting.findIndex((w) => w.handle === handle);
    if (i < 0) return false;
    this.waiting.splice(i, 1);
    return true;
  }

  private forget(now: number): void {
    for (const [id, last] of this.seen) {
      if (now - last.at > ONLINE_WINDOW_MS) this.seen.delete(id);
    }
  }
}
