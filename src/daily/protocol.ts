/**
 * The day's business: the bonus that is there for turning up, and the quests
 * that are there for playing.
 *
 * Both ends import this file — the browser from `src/ui/DailyScreen.tsx`, the
 * Worker from `worker/src/profile.ts` — for the reason `src/duel/protocol.ts`
 * and `src/profile/protocol.ts` are shared: the shape is written once, and
 * changing it breaks the build on both sides rather than in production.
 *
 * WHY A SECOND CURRENCY. Stars are earned by playing and spent on the room and
 * the wardrobe — everything a star buys makes the next match go better. Dollars
 * are meant for the other half of the game, the metagame counter where a player
 * buys a piece of a company rather than a hat, and mixing the two would make
 * every purchase there a purchase not made in the shop. So they are a separate
 * balance, they are earned a separate way — turning up, rather than winning —
 * and the shop cannot see them at all.
 *
 * Note what a dollar balance is NOT: it is not `players.stars`, which the board
 * ranks on and which must never go down, so there is no earned/spent/granted
 * split here. One number, and the counter that will eventually spend it takes
 * from it.
 *
 * WHAT A DAY IS. `Math.floor(now / 86400000)` — the UTC day, counted off the
 * epoch by both sides. Not a local day, deliberately: a player who flies east
 * would otherwise get two bonuses out of one afternoon, and one who flies west
 * would be told to wait. The server's answer is the one that counts either way
 * (`worker/src/profile.ts` rolls the row over on read), and the browser's copy
 * of the arithmetic is only there so the screen can be drawn before the answer
 * comes back.
 */

import { Rng, hashSeed } from '../sim/rng';

/** What one day's bonus is worth. The whole of the hard currency, for now. */
export const DAILY_BONUS = 1000;

export const MS_PER_DAY = 86_400_000;

/** Which day it is, as both sides count one: whole UTC days since the epoch. */
export const dayOf = (now: number): number => Math.floor(now / MS_PER_DAY);

/** When the next one starts, which is when the bonus comes back. */
export const nextDayAt = (now: number): number => (dayOf(now) + 1) * MS_PER_DAY;

/**
 * What a quest counts. One kind per quest, and the kind is what decides how a
 * finished match moves the counter — see `COMBINE`.
 *
 * It does a second job, which is why it is a field rather than a switch buried
 * in the counting: a day is never dealt two quests of the same kind
 * (`questsFor`), so the three on offer always ask for three different things.
 * Without that rule a shuffle could deal "play three" beside "play five" and
 * call it a day's work.
 */
export type Counts =
  /** matches finished, whatever came of them */
  | 'matches'
  /** matches won */
  | 'wins'
  /** matches that cleared the profit bar */
  | 'profit'
  /** trades made, added up across the day */
  | 'trades'
  /** the best single match of the day — a high-water mark, not a total */
  | 'best'
  /** matches finished without going broke */
  | 'survived'
  /** duels played, whoever won */
  | 'duels'
  /** duels won */
  | 'duelWins';

/**
 * One of the day's quests.
 *
 * `goal` is what the counter has to reach and `stars` is what reaching it pays.
 * All three fields are read by the screen that draws the row AND by the server
 * that counts and pays, so a quest cannot be advertised as one thing and
 * settled as another — the same arrangement `src/awards/catalogue.ts` uses.
 *
 * The wording is not here, for the reason it is not in the award catalogue: the
 * Worker has no business carrying a translation table. The `quest.<id>.*` pairs
 * live in `src/ui/i18n.ts`.
 */
export interface Quest {
  id: string;
  counts: Counts;
  goal: number;
  /** stars paid for finishing it — quests pay the soft currency, not dollars */
  stars: number;
  /**
   * Needs somebody else at the other end of it — which today means a duel.
   *
   * A quest nobody can finish alone is a quest that is dead for anybody whose
   * friends are asleep, so `questsFor` deals at most ONE of these a day. That
   * rule is the whole reason this is a field: a player who has nobody to call
   * still has two of the day's three to get on with, always.
   *
   * It is also why the two of them pay a little more than their difficulty
   * deserves. A duel is eighty seconds like any other match — the work is in
   * arranging it, and that is what the extra star is for.
   */
  social?: boolean;
}

/** How many of them a day is dealt. */
export const QUESTS_A_DAY = 3;

/**
 * Everything a day can deal, and every one of them is something a player can
 * finish on their own in an evening.
 *
 * THE TWO THAT NEED A FRIEND. `duel-1` and `duel-win` are marked `social`. A
 * day deals at most one of them and only asks at all about one day in three
 * (`SOCIAL_DAYS`). They are the only quests here somebody can be stopped from
 * finishing by circumstance rather than by skill, so the other two slots are
 * always things one person can do alone.
 *
 * WHAT IS DELIBERATELY NOT HERE. Nothing gated on the ladder: "play in the
 * silver hall" is impossible for the player who has not opened it yet, which is
 * exactly the player a daily is for. And nothing about the archive — a veteran
 * who has met every company could never finish it again. Both of those are
 * permanently shut for a whole class of player, which is a different thing from
 * the duels, where the door opens the moment somebody answers.
 *
 * WHAT IT PAYS. A day comes to between six and ten stars, which is about one
 * good match in the silver hall. That is the shape it should be — enough that
 * doing the rounds is worth the taps, not so much that the shop is better
 * reached by turning up than by playing.
 *
 * Quest stars are `granted`, not earned: see `claimQuest` in
 * `worker/src/profile.ts` for why the leaderboard does not see them.
 */
export const QUESTS: Quest[] = [
  { id: 'play-3', counts: 'matches', goal: 3, stars: 2 },
  { id: 'play-5', counts: 'matches', goal: 5, stars: 3 },
  { id: 'win-1', counts: 'wins', goal: 1, stars: 2 },
  { id: 'win-2', counts: 'wins', goal: 2, stars: 3 },
  { id: 'gain', counts: 'profit', goal: 1, stars: 2 },
  { id: 'trades-20', counts: 'trades', goal: 20, stars: 2 },
  // Starting cash is 10 000 and roughly a fifth of matches clear 20 000, so
  // this is a good evening rather than a great one — see `src/awards/catalogue.ts`
  // for where those numbers come from.
  { id: 'nw-15k', counts: 'best', goal: 15_000, stars: 3 },
  { id: 'no-bust-3', counts: 'survived', goal: 3, stars: 2 },
  { id: 'duel-1', counts: 'duels', goal: 1, stars: 3, social: true },
  { id: 'duel-win', counts: 'duelWins', goal: 1, stars: 4, social: true },
];

export const QUEST_IDS: string[] = QUESTS.map((q) => q.id);

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

export const questById = (id: string): Quest | undefined => BY_ID.get(id);

/**
 * How often a day is willing to ask for a duel at all.
 *
 * Roughly one day in three. This is the number to turn if the duel quests are
 * pulling too hard or not hard enough, and it is a single number on purpose:
 * left to the shuffle alone, two social quests in a catalogue of ten put one in
 * front of somebody on 55% of days, which is a tax on not having a friend to
 * hand rather than a nudge towards playing with one.
 */
export const SOCIAL_DAYS = 0.35;

/** A copy of the list in a shuffled order. Fisher-Yates, on the day's own RNG. */
function shuffled(list: readonly Quest[], rng: Rng): Quest[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The three quests a given day is dealt — the same three for everybody, and the
 * same three every time anybody asks.
 *
 * Worked out from the day rather than stored, which is the whole trick: there
 * is no column holding the pick, no moment at which the day has to be dealt,
 * nothing to write for a player who does not open the game, and no way for the
 * screen and the server to be looking at different quests. It is the same
 * bargain `createMatch(seed)` makes — a number in, the same world out.
 *
 * Whether the day asks for a duel is decided FIRST and on its own, rather than
 * being left to fall out of where the shuffle landed. Two reasons. It makes the
 * rate an exact number somebody can turn (`SOCIAL_DAYS`) instead of an emergent
 * one, and it means the duel — the one quest that has to be arranged rather
 * than merely played — is dealt into the first slot and read first on the
 * screen, which is where a thing you have to go and organise belongs.
 *
 * The rest is filled from the quests that need nobody, no two of them counting
 * the same thing, so a day always asks for three different kinds of evening.
 * Six such kinds against two slots to fill: it can never run short.
 */
export function questsFor(day: number): Quest[] {
  const rng = new Rng(hashSeed(`brokerstars.daily.${day}`));
  const asksAFriend = rng.chance(SOCIAL_DAYS);

  const out: Quest[] = [];
  const kinds = new Set<Counts>();
  const take = (q: Quest) => {
    kinds.add(q.counts);
    out.push(q);
  };

  const social = QUESTS.filter((q) => q.social);
  if (asksAFriend && social.length > 0) take(shuffled(social, rng)[0]);

  for (const q of shuffled(QUESTS.filter((q) => !q.social), rng)) {
    if (out.length === QUESTS_A_DAY) break;
    if (kinds.has(q.counts)) continue;
    take(q);
  }
  return out;
}

/**
 * The same, remembering the last answer.
 *
 * `questsFor` is pure and cheap, but it is asked on the render path — the menu
 * button reads it through `worthATap` on every single frame the menu draws —
 * and handing back a fresh array each time is a fresh prop each time. One day
 * is all that is ever wanted at once.
 */
let cachedDay: number | null = null;
let cachedQuests: Quest[] = [];

export function questsToday(day: number): Quest[] {
  if (cachedDay !== day) {
    cachedDay = day;
    cachedQuests = questsFor(day);
  }
  return cachedQuests;
}

/**
 * One player's day, as it is stored and as it goes on the wire.
 *
 * `day` is what the rest of it is about, and it is the whole of the rollover
 * mechanism: nothing is cleared on a timer or at a sign-in, the day simply
 * stops matching and everything under it is thrown away at once (`rolled`).
 */
export interface Daily {
  /** the UTC day the three fields below describe */
  day: number;
  /** today's bonus has been taken */
  bonus: boolean;
  /** how far along each quest is today, by quest id */
  progress: Record<string, number>;
  /** quests whose reward has already been handed over today */
  taken: string[];
}

/** A day nobody has played: earlier than any real one, so it rolls at once. */
export const NO_DAY = -1;

export const freshDay = (day: number): Daily => ({
  day,
  bonus: false,
  progress: {},
  taken: [],
});

export const EMPTY_DAILY: Daily = freshDay(NO_DAY);

/**
 * Today's day, or a brand new one if what is held is yesterday's.
 *
 * Returns the SAME object when the day has not moved, so a render that calls
 * this on every frame does not hand its children a new prop each time.
 *
 * Everything below reads a rolled day. Asking `bonusReady` about a stale one
 * answers about yesterday, which is the one wrong answer this file can give.
 */
export function rolled(d: Daily, now: number): Daily {
  const day = dayOf(now);
  return d.day === day ? d : freshDay(day);
}

export const bonusReady = (d: Daily): boolean => !d.bonus;

/** Finished, whether or not it has been cashed in. */
export const questDone = (d: Daily, q: Quest): boolean => (d.progress[q.id] ?? 0) >= q.goal;

/** Finished and still owed — the state the menu button is lit for. */
export const questReady = (d: Daily, q: Quest): boolean =>
  questDone(d, q) && !d.taken.includes(q.id);

/**
 * Anything finished and unpaid among TODAY's three — not among the catalogue.
 * A counter left standing on a quest this day was not dealt is not a reward
 * anybody is owed, and lighting the button for one would send the player to a
 * screen where there is nothing to tap.
 */
export const anyQuestReady = (d: Daily): boolean =>
  questsToday(d.day).some((q) => questReady(d, q));

/**
 * Is there anything in there to come and get? This is the whole condition
 * behind the glow on the menu button, and it lives here rather than in the
 * component so that the button and the screen cannot disagree about it.
 *
 * Ask it about a ROLLED day — `rolled(d, now)`. Yesterday's answer is the one
 * wrong answer this file can give.
 */
export const worthATap = (d: Daily): boolean => bonusReady(d) || anyQuestReady(d);

/* --------------------------------------------------------- counting a match */

/**
 * One finished match, as far as the day is concerned.
 *
 * A subset of the Worker's own `MatchFacts` (`worker/src/awards.ts`) on
 * purpose, and structurally assignable from it, so the server hands its facts
 * straight to `countMatch` with nothing to map and nothing to keep in step. The
 * game builds the same shape at the whistle for its own copy of the day.
 */
export interface DayFacts {
  outcome: 'win' | 'draw' | 'loss';
  netWorth: number;
  tradedWell: boolean;
  bankrupt: boolean;
  /** trades made in this match */
  trades: number;
  /** against a person rather than a bot */
  duel: boolean;
}

/**
 * What one match does to a counter of each kind.
 *
 * `best` is the odd one and the reason this is a table rather than a sum:
 * "finish a match holding 15 000" is not "hold 5 000 three times", so it keeps
 * the best single match of the day instead of adding them up. Everything else
 * is a running total.
 *
 * A surrendered match never arrives at all. The game does not hand one in
 * (`App.tsx`), so the server never hears about it and neither does the day —
 * otherwise "play three matches" would be three taps of GIVE UP.
 */
const COMBINE: Record<Counts, (at: number, m: DayFacts) => number> = {
  matches: (at) => at + 1,
  wins: (at, m) => at + (m.outcome === 'win' ? 1 : 0),
  profit: (at, m) => at + (m.tradedWell ? 1 : 0),
  trades: (at, m) => at + Math.max(0, Math.floor(m.trades)),
  survived: (at, m) => at + (m.bankrupt ? 0 : 1),
  best: (at, m) => Math.max(at, Math.round(Math.max(0, m.netWorth))),
  duels: (at, m) => at + (m.duel ? 1 : 0),
  duelWins: (at, m) => at + (m.duel && m.outcome === 'win' ? 1 : 0),
};

/**
 * The day after one more match, counted against the three quests it was dealt.
 *
 * Only today's three move. A counter on a quest the day did not deal would be
 * thrown away at midnight anyway, and not writing it keeps the stored row to
 * the three numbers that mean something.
 *
 * A duel counts twice over: towards the ordinary quests, because it is a match
 * that was played, and towards the two that ask for one. The ladder ignores
 * duels — a friend willing to lose ten times is a lift rather than a climb —
 * but there is no ladder here to inflate.
 */
export function countMatch(d: Daily, m: DayFacts, now: number): Daily {
  const day = rolled(d, now);
  const progress = { ...day.progress };
  for (const q of questsToday(day.day)) {
    progress[q.id] = COMBINE[q.counts](progress[q.id] ?? 0, m);
  }
  return { ...day, progress };
}

/** A whole number, never negative — the same guard `cleanCount` is elsewhere. */
const count = (raw: unknown): number => {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

/**
 * A day off the wire or out of a stored row.
 *
 * Only quest ids this build knows survive, so a save written by a later version
 * cannot invent a quest — the same rule `cleanAwards` applies to the shelf. A
 * day that is not a number is `NO_DAY`, which rolls immediately and costs the
 * player nothing: the worst it can do is hand back a bonus that was taken under
 * a broken row.
 */
export function cleanDaily(raw: unknown): Daily {
  if (!raw || typeof raw !== 'object') return EMPTY_DAILY;
  const src = raw as Record<string, unknown>;
  const day = Math.floor(Number(src.day));

  const progress: Record<string, number> = {};
  const from = (src.progress ?? {}) as Record<string, unknown>;
  if (from && typeof from === 'object') {
    for (const q of QUESTS) {
      const at = count(from[q.id]);
      if (at > 0) progress[q.id] = at;
    }
  }

  const taken = Array.isArray(src.taken)
    ? [...new Set(src.taken.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)))]
    : [];

  return {
    day: Number.isFinite(day) ? day : NO_DAY,
    bonus: src.bonus === true,
    progress,
    taken,
  };
}
