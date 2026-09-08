import { describe, expect, it } from 'vitest';
import {
  DAILY_BONUS,
  EMPTY_DAILY,
  MS_PER_DAY,
  NO_DAY,
  QUESTS,
  QUESTS_A_DAY,
  SOCIAL_DAYS,
  anyQuestReady,
  bonusReady,
  cleanDaily,
  countMatch,
  dayOf,
  freshDay,
  nextDayAt,
  questDone,
  questReady,
  questsFor,
  rolled,
  worthATap,
  type DayFacts,
} from './protocol';

/**
 * The day, and what makes one end. Everything here is arithmetic on a number
 * of milliseconds, which is the whole reason the rule about which day it is
 * lives in one file that both sides import rather than in two that agree today.
 */

const NOON = 20_000 * MS_PER_DAY + 12 * 3_600_000;

describe('which day it is', () => {
  it('is whole UTC days off the epoch, so both sides count the same one', () => {
    expect(dayOf(0)).toBe(0);
    expect(dayOf(MS_PER_DAY - 1)).toBe(0);
    expect(dayOf(MS_PER_DAY)).toBe(1);
  });

  it('ends at the next midnight, whatever time of day it is', () => {
    expect(nextDayAt(NOON)).toBe(20_001 * MS_PER_DAY);
    expect(nextDayAt(NOON) - NOON).toBe(12 * 3_600_000);
  });
});

describe('rolling over', () => {
  it('hands back the very same day when it has not moved', () => {
    const today = freshDay(dayOf(NOON));
    // identity, not equality: the render path calls this on every frame and
    // a new object each time would be a new prop each time
    expect(rolled(today, NOON)).toBe(today);
  });

  it('throws away yesterday whole, bonus and quests together', () => {
    const yesterday = {
      day: dayOf(NOON) - 1,
      bonus: true,
      progress: { 'win-1': 1 },
      taken: ['win-1'],
      // the day carries the share counter's order count too, and it goes with
      // the rest of yesterday
      orders: 2,
    };
    expect(rolled(yesterday, NOON)).toEqual(freshDay(dayOf(NOON)));
  });

  it('rolls a day nobody has ever played, which is what an empty row is', () => {
    expect(EMPTY_DAILY.day).toBe(NO_DAY);
    expect(rolled(EMPTY_DAILY, NOON).bonus).toBe(false);
  });
});

describe('what is worth a tap', () => {
  const today = dayOf(NOON);
  /** one of the three today actually deals — a counter on any other pays nothing */
  const q = questsFor(today)[0];

  it('is the bonus, while the bonus is still there', () => {
    expect(bonusReady(freshDay(today))).toBe(true);
    expect(worthATap(freshDay(today))).toBe(true);
  });

  it('is nothing at all once the bonus is taken and no quest is done', () => {
    const after = { ...freshDay(today), bonus: true };
    expect(worthATap(after)).toBe(false);
  });

  it('is a finished quest that has not been cashed in', () => {
    const done = { ...freshDay(today), bonus: true, progress: { [q.id]: q.goal } };
    expect(questDone(done, q)).toBe(true);
    expect(questReady(done, q)).toBe(true);
    expect(anyQuestReady(done)).toBe(true);
    expect(worthATap(done)).toBe(true);
  });

  it('is not a quest whose reward is already handed over', () => {
    const paid = {
      ...freshDay(today),
      bonus: true,
      progress: { [q.id]: q.goal },
      taken: [q.id],
    };
    expect(questDone(paid, q)).toBe(true);
    expect(questReady(paid, q)).toBe(false);
    expect(worthATap(paid)).toBe(false);
  });

  it('counts a quest overshot as done, not as broken', () => {
    expect(questDone({ ...freshDay(today), progress: { [q.id]: q.goal + 5 } }, q)).toBe(true);
  });
});

describe('a day off the wire', () => {
  it('keeps only quests this build knows about', () => {
    const d = cleanDaily({
      day: 19_000,
      bonus: true,
      progress: { [QUESTS[0].id]: 2, 'quest-from-the-future': 7 },
      taken: [QUESTS[0].id, 'quest-from-the-future'],
    });
    expect(d.progress).toEqual({ [QUESTS[0].id]: 2 });
    expect(d.taken).toEqual([QUESTS[0].id]);
  });

  it('reads rubbish as a day nobody has played, which costs the player nothing', () => {
    expect(cleanDaily(null)).toEqual(EMPTY_DAILY);
    expect(cleanDaily('what').day).toBe(NO_DAY);
    expect(cleanDaily({ day: 'tuesday', bonus: true }).day).toBe(NO_DAY);
  });

  it('never lets progress run backwards past zero', () => {
    expect(cleanDaily({ day: 1, progress: { [QUESTS[0].id]: -4 } }).progress).toEqual({});
  });

  it('only believes a bonus that was actually claimed', () => {
    // anything but `true` is "not taken": a broken row hands a bonus back
    // rather than swallowing one
    expect(cleanDaily({ day: 1, bonus: 'yes' }).bonus).toBe(false);
    expect(cleanDaily({ day: 1, bonus: true }).bonus).toBe(true);
  });
});

describe('what a day pays', () => {
  it('is a round five hundred, and quests pay coins rather than dollars', () => {
    expect(DAILY_BONUS).toBe(500);
    for (const q of QUESTS) expect(q.coins).toBeGreaterThan(0);
  });

  it('gives every quest a goal that can actually be reached', () => {
    for (const q of QUESTS) expect(q.goal).toBeGreaterThan(0);
  });

  it('names each quest once', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });
});

describe('the three a day is dealt', () => {
  it('gives the same three to everybody who asks about the same day', () => {
    expect(questsFor(20_000)).toEqual(questsFor(20_000));
  });

  it('gives a different day different work, at least across a fortnight', () => {
    const names = new Set<string>();
    for (let d = 20_000; d < 20_014; d++) names.add(questsFor(d).map((q) => q.id).join('+'));
    // not "all fourteen different" — a shuffle is allowed to repeat itself.
    // What would be a bug is one day's set forever.
    expect(names.size).toBeGreaterThan(4);
  });

  it('never asks for the same kind of evening twice in one day', () => {
    for (let d = 20_000; d < 20_120; d++) {
      const picked = questsFor(d);
      expect(picked).toHaveLength(QUESTS_A_DAY);
      expect(new Set(picked.map((q) => q.counts)).size).toBe(QUESTS_A_DAY);
    }
  });

  it('deals every quest in the catalogue sooner or later', () => {
    const seen = new Set<string>();
    for (let d = 20_000; d < 20_200; d++) for (const q of questsFor(d)) seen.add(q.id);
    expect(seen.size).toBe(QUESTS.length);
  });

  it('has a day come to something between one and two good matches', () => {
    for (let d = 20_000; d < 20_200; d++) {
      const paid = questsFor(d).reduce((n, q) => n + q.coins, 0);
      expect(paid).toBeGreaterThanOrEqual(6);
      expect(paid).toBeLessThanOrEqual(10);
    }
  });

  it('never asks for two things that need somebody else', () => {
    // the one rule that keeps a duel quest from being a broken day: whoever
    // has nobody to call still has two of the three to get on with
    for (let d = 20_000; d < 20_400; d++) {
      const needy = questsFor(d).filter((q) => q.social);
      expect(needy.length).toBeLessThanOrEqual(1);
    }
  });

  it('asks for a duel about as often as it says it does', () => {
    // a nudge towards the one part of the game that needs a friend, not a tax
    // on not having one to hand. Left to the shuffle alone this was 55%.
    let days = 0;
    const N = 2000;
    for (let d = 20_000; d < 20_000 + N; d++) {
      if (questsFor(d).some((q) => q.social)) days++;
    }
    expect(days / N).toBeGreaterThan(SOCIAL_DAYS - 0.05);
    expect(days / N).toBeLessThan(SOCIAL_DAYS + 0.05);
  });

  it('fills the other two slots with things one person can do alone', () => {
    for (let d = 20_000; d < 20_400; d++) {
      const solo = questsFor(d).filter((q) => !q.social);
      expect(solo.length).toBeGreaterThanOrEqual(QUESTS_A_DAY - 1);
    }
  });
});

describe('counting a match', () => {
  const match = (over: Partial<DayFacts> = {}): DayFacts => ({
    outcome: 'loss',
    netWorth: 9_000,
    tradedWell: false,
    bankrupt: false,
    trades: 4,
    duel: false,
    ...over,
  });

  /**
   * A day that deals the kind being tested, and that quest's id on it.
   *
   * Only today's three are counted, so a test that names a quest the day did
   * not deal would pass by counting nothing. Every quest is dealt sooner or
   * later — the block above pins that down — so this always finds one.
   */
  function dayDealing(kind: string): { now: number; id: string } {
    for (let d = 20_000; d < 20_200; d++) {
      const q = questsFor(d).find((x) => x.counts === kind);
      if (q) return { now: d * MS_PER_DAY + 12 * 3_600_000, id: q.id };
    }
    throw new Error(`no day deals ${kind}`);
  }

  const run = (kind: string, matches: DayFacts[]): number => {
    const { now, id } = dayDealing(kind);
    let d = freshDay(dayOf(now));
    for (const m of matches) d = countMatch(d, m, now);
    return d.progress[id] ?? 0;
  };

  it('counts a match played whatever came of it', () => {
    expect(run('matches', [match(), match({ outcome: 'win' })])).toBe(2);
  });

  it('counts a win as a win and nothing else as one', () => {
    expect(run('wins', [match({ outcome: 'win' }), match(), match({ outcome: 'draw' })])).toBe(1);
  });

  it('counts the matches that cleared the profit bar', () => {
    expect(run('profit', [match({ tradedWell: true }), match()])).toBe(1);
  });

  it('adds trades up across the day', () => {
    expect(run('trades', [match({ trades: 7 }), match({ trades: 5 })])).toBe(12);
  });

  it('keeps the best single match rather than the sum of them', () => {
    // holding 5 000 three times is not "finish a match holding 15 000"
    expect(run('best', [match({ netWorth: 5_000 }), match({ netWorth: 5_000 })])).toBe(5_000);
    expect(run('best', [match({ netWorth: 18_000 }), match({ netWorth: 4_000 })])).toBe(18_000);
  });

  it('does not count a match somebody went broke in as one they survived', () => {
    expect(run('survived', [match({ bankrupt: true }), match(), match()])).toBe(2);
  });

  it('counts a duel as a duel and a bot match as no part of one', () => {
    expect(run('duels', [match({ duel: true }), match(), match({ duel: true })])).toBe(2);
  });

  it('counts a duel won, and neither a duel lost nor a bot match won', () => {
    expect(
      run('duelWins', [
        match({ duel: true, outcome: 'win' }),
        match({ duel: true, outcome: 'loss' }),
        match({ duel: false, outcome: 'win' }),
      ]),
    ).toBe(1);
  });

  it('lets one duel count towards the ordinary quests as well', () => {
    // it is a match that was played, whoever was on the other end of it
    expect(run('matches', [match({ duel: true })])).toBe(1);
    expect(run('wins', [match({ duel: true, outcome: 'win' })])).toBe(1);
  });

  it('rolls the day first, so a tally from yesterday never carries over', () => {
    const { now, id } = dayDealing('matches');
    const yesterday = { ...freshDay(dayOf(now) - 1), progress: { [id]: 99 } };
    const d = countMatch(yesterday, match(), now);
    expect(d.day).toBe(dayOf(now));
    expect(d.progress[id]).toBe(1);
  });

  it('leaves the day it was handed alone', () => {
    const before = freshDay(dayOf(NOON));
    countMatch(before, match({ trades: 9 }), NOON);
    expect(before.progress).toEqual({});
  });

  it('touches nothing outside the three today was dealt', () => {
    const dealt = new Set(questsFor(dayOf(NOON)).map((q) => q.id));
    const d = countMatch(freshDay(dayOf(NOON)), match(), NOON);
    for (const id of Object.keys(d.progress)) expect(dealt.has(id)).toBe(true);
  });
});
