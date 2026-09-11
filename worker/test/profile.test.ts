import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  LEAGUES,
  balance,
  bankWin,
  buyItem,
  buyRoom,
  claimBonus,
  claimInto,
  claimQuest,
  giftHat,
  priceOf,
  refundItem,
  refundRoom,
  trade,
  untouched,
  wear,
  withToday,
  type Held,
} from '../src/profile';
import { ROOM_DONE, ROOM_STEPS } from '../../src/ui/renovation';
import { PRICES, RARITIES } from '../../src/ui/wardrobe';
import { cleanClaim, setOf, topsOf } from '../../src/profile/protocol';
import {
  DAILY_BONUS,
  MS_PER_DAY,
  countMatch,
  dayOf,
  freshDay,
  QUESTS,
  questsFor,
  type DayFacts,
  type Quest,
} from '../../src/daily/protocol';
import { ORDERS_A_DAY, askOf, bidOf, priceOn } from '../../src/market/protocol';
import { companyById } from '../../src/sim/companies';
import type { MatchFacts } from '../src/awards';

/**
 * The shop, as the server plays it. Every rule that decides whether a player
 * may have something, and what it costs them, is a pure function of the row —
 * so this file needs no database and none of these are integration tests.
 *
 * The one that matters most is the last block. There are players with a room
 * and a wardrobe in a `localStorage` this server has never seen, and the
 * migration is the only chance any of it gets to reach the table.
 */

const held = (over: Partial<Held> = {}): Held => ({ ...EMPTY, ...over });

describe('what is in hand', () => {
  it('is earned minus spent', () => {
    expect(balance(held({ spent: 12 }), 30)).toBe(18);
  });

  it('never goes below nothing, whatever the columns say', () => {
    expect(balance(held({ spent: 99 }), 10)).toBe(0);
  });

  it('counts what was granted outside a match', () => {
    expect(balance(held({ granted: 40, spent: 10 }), 0)).toBe(30);
  });
});

describe('buying a rung', () => {
  it('sells the next one up and wears it', () => {
    const out = buyItem(EMPTY, 100, 'torso', 'common', false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned.torso).toBe('common');
    expect(out.held.outfit.torso).toBe('common');
    expect(out.held.spent).toBe(PRICES.common);
  });

  it('refuses a rung that is not next, however rich the caller', () => {
    expect(buyItem(EMPTY, 10_000, 'torso', 'legend', false)).toEqual({
      ok: false,
      error: 'not the next rung',
    });
  });

  it('refuses one that is already owned', () => {
    const owned = held({ owned: { torso: 'common' }, spent: PRICES.common });
    expect(buyItem(owned, 100, 'torso', 'common', false).ok).toBe(false);
  });

  it('refuses what the balance does not cover', () => {
    expect(buyItem(EMPTY, PRICES.common - 1, 'torso', 'common', false)).toEqual({
      ok: false,
      error: 'not enough coins',
    });
  });

  it('charges nothing in free mode, and still hands the item over', () => {
    const out = buyItem(EMPTY, 0, 'torso', 'common', true);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.spent).toBe(0);
    expect(out.held.owned.torso).toBe('common');
  });

  it('climbs a whole slot for what the ladder says it costs', () => {
    const whole = RARITIES.reduce((n, r) => n + PRICES[r], 0);
    let h = EMPTY;
    for (const r of RARITIES) {
      const out = buyItem(h, whole, 'hat', r, false);
      expect(out.ok, `could not buy ${r}`).toBe(true);
      if (!out.ok) return;
      h = out.held;
    }
    // the sum of the rungs and nothing else: no discount for going the long
    // way and no penalty for it either
    expect(h.spent).toBe(whole);
    expect(h.owned.hat).toBe('legend');
  });
});

describe('renovating', () => {
  it('sells the next step only', () => {
    const out = buyRoom(EMPTY, 100, false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.room).toBe(1);
    expect(out.held.spent).toBe(ROOM_STEPS[0].price);
  });

  it('refuses once the room is finished', () => {
    expect(buyRoom(held({ room: ROOM_DONE }), 10_000, false).ok).toBe(false);
  });

  it('refuses what the balance does not cover', () => {
    expect(buyRoom(EMPTY, ROOM_STEPS[0].price - 1, false).ok).toBe(false);
  });
});

describe('the developer handing things back', () => {
  it('takes the top rung and refunds it', () => {
    const spent = PRICES.common + PRICES.uncommon;
    const h = held({ owned: { hat: 'uncommon' }, outfit: { hat: 'uncommon' }, spent });
    const out = refundItem(h, 'hat', 'uncommon');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // dropped a rung, and wearing what is left rather than what is gone
    expect(out.held.owned.hat).toBe('common');
    expect(out.held.outfit.hat).toBe('common');
    expect(out.held.spent).toBe(spent - PRICES.uncommon);
  });

  it('leaves the slot bare and bare-headed at the bottom of the ladder', () => {
    const h = held({ owned: { hat: 'common' }, outfit: { hat: 'common' }, spent: PRICES.common });
    const out = refundItem(h, 'hat', 'common');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned.hat).toBeUndefined();
    expect(out.held.outfit.hat).toBeUndefined();
  });

  it('refuses anything but the top rung — a ladder cannot have a hole in it', () => {
    const h = held({ owned: { hat: 'rare' } });
    expect(refundItem(h, 'hat', 'common').ok).toBe(false);
  });

  it('cannot mint coins by refunding what was never paid for', () => {
    // bought in free mode: spent never went up, so it must not come down
    const free = buyItem(EMPTY, 0, 'hat', 'common', true);
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    const back = refundItem(free.held, 'hat', 'common');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.held.spent).toBe(0);
    expect(balance(back.held, 0)).toBe(0);
  });

  it('steps the room back and refuses to go past bare', () => {
    const out = refundRoom(held({ room: 1, spent: ROOM_STEPS[0].price }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.room).toBe(0);
    expect(refundRoom(EMPTY).ok).toBe(false);
  });
});

describe('getting dressed', () => {
  it('puts on what is owned', () => {
    const h = held({ owned: { torso: 'rare' } });
    expect(wear(h, { torso: 'uncommon' }).outfit).toEqual({ torso: 'uncommon' });
  });

  it('trims what is not, rather than refusing the lot', () => {
    const h = held({ owned: { torso: 'common' } });
    expect(wear(h, { torso: 'legend', hat: 'mythic' }).outfit).toEqual({ torso: 'common' });
  });
});

describe('the welcome present', () => {
  it('gives a bare-headed player the bandana, worn', () => {
    const out = giftHat(EMPTY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned.hat).toBe('common');
    expect(out.held.outfit.hat).toBe('common');
  });

  it('costs the player nothing -- a present out of the balance is not a present', () => {
    const out = giftHat(held({ spent: 40 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.spent).toBe(40);
    expect(balance(out.held, 100)).toBe(60);
  });

  it('refuses anybody who already owns a hat, however humble', () => {
    for (const r of RARITIES) {
      expect(giftHat(held({ owned: { hat: r } })).ok).toBe(false);
    }
  });

  it('is given once, not once a match', () => {
    const first = giftHat(EMPTY);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // the second finished match asks again, and is told there is one already
    expect(giftHat(first.held).ok).toBe(false);
  });

  it('leaves the rest of the wardrobe where it was', () => {
    const h = held({ owned: { torso: 'rare' }, outfit: { torso: 'rare' }, room: 2, spent: 7 });
    const out = giftHat(h);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned.torso).toBe('rare');
    expect(out.held.outfit.torso).toBe('rare');
    expect(out.held.room).toBe(2);
    expect(out.held.spent).toBe(7);
  });

  it('does not undress somebody wearing something else on their head', () => {
    // cannot happen -- you cannot wear what you do not own -- but the guard is
    // `owned`, and this says so out loud
    const h = held({ outfit: { hat: 'legend' } });
    const out = giftHat(h);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.outfit.hat).toBe('common');
  });
});

describe('the migration', () => {
  const claim = (over: Record<string, unknown> = {}) =>
    cleanClaim({ coins: 0, room: 0, owned: {}, outfit: {}, wins: [], ...over }, LEAGUES);

  it('takes a save at its word while the server has nothing of its own', () => {
    expect(untouched(EMPTY)).toBe(true);
    const h = claimInto(EMPTY, 0, claim({ coins: 7, room: 3, owned: { hat: 'rare' } }));
    expect(h.room).toBe(3);
    expect(h.owned.hat).toBe('rare');
    // and the coins the player could see are still there afterwards
    expect(balance(h, 0)).toBe(7);
  });

  it('books the purchases as spent, so the board is not paying for them twice', () => {
    const h = claimInto(EMPTY, 0, claim({ coins: 7, room: 3, owned: { hat: 'rare' } }));
    expect(h.spent).toBe(priceOf({ hat: 'rare' }, 3));
  });

  it('leaves a player who really did earn it all with exactly what they had', () => {
    // everything they own was paid for out of what the board already says they
    // earned, with some left over: nothing has to be granted to make it add up
    const spent = priceOf({ hat: 'uncommon' }, 1);
    const earned = spent + 17;
    const h = claimInto(EMPTY, earned, claim({ coins: 17, room: 1, owned: { hat: 'uncommon' } }));
    expect(h.granted).toBe(0);
    expect(balance(h, earned)).toBe(17);
  });

  it('shuts the door behind the first save with anything in it', () => {
    const h = claimInto(EMPTY, 0, claim({ coins: 7 }));
    expect(untouched(h)).toBe(false);
  });

  it('leaves it open for a browser that turned up empty-handed', () => {
    // a cleared cache, or the desktop client where nothing was ever stored:
    // the row is opened but stays untouched, so the real save can still arrive
    expect(untouched(claimInto(EMPTY, 0, claim()))).toBe(true);
  });

  it('hands the earned coins back to a player whose save was lost', () => {
    const h = claimInto(EMPTY, 55, claim());
    expect(balance(h, 55)).toBe(55);
  });

  it('repairs a save with a hole in it rather than dropping the rungs', () => {
    // an early build let a slot be climbed out of order; the shop cannot draw
    // that, so the skipped rungs come across as bought
    const patchy = new Set(['hat-common', 'hat-rare']);
    const h = claimInto(EMPTY, 0, claim({ owned: topsOf(patchy) }));
    expect(h.owned.hat).toBe('rare');
    expect([...setOf(h.owned)].sort()).toEqual(['hat-common', 'hat-rare', 'hat-uncommon']);
  });

  it('brings the ladder across, which nothing else could reconstruct', () => {
    const h = claimInto(EMPTY, 0, claim({ wins: [7, 3] }));
    expect(h.wins.slice(0, 2)).toEqual([7, 3]);
    expect(h.wins).toHaveLength(LEAGUES);
  });

  it('counts a ladder as something worth shutting the door for', () => {
    // a save with nothing bought but three wins in it is still a save
    expect(untouched(claimInto(EMPTY, 0, claim({ wins: [3] })))).toBe(false);
  });

  it('caps a claim that has clearly been edited by hand', () => {
    const h = claimInto(EMPTY, 0, claim({ coins: 1e12 }));
    expect(balance(h, 0)).toBe(100_000);
  });
});

describe('climbing the ladder', () => {
  it('counts a win in the league it was won in', () => {
    const h = bankWin(bankWin(EMPTY, 0), 0);
    expect(h.wins[0]).toBe(2);
    expect(h.wins[1]).toBe(0);
  });

  it('ignores a league that is not on the ladder', () => {
    expect(bankWin(EMPTY, LEAGUES)).toEqual(EMPTY);
    expect(bankWin(EMPTY, -1)).toEqual(EMPTY);
    expect(bankWin(EMPTY, 1.5)).toEqual(EMPTY);
  });

  it('leaves the one it was given alone', () => {
    const before = { ...EMPTY, wins: EMPTY.wins.slice() };
    bankWin(before, 2);
    expect(before.wins[2]).toBe(0);
  });
});

describe("the day's bonus", () => {
  const NOON = 20_000 * MS_PER_DAY + 12 * 3_600_000;

  it('pays a thousand dollars and marks the day taken', () => {
    const out = claimBonus(EMPTY, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.dollars).toBe(DAILY_BONUS);
    expect(out.held.daily).toEqual({ ...freshDay(dayOf(NOON)), bonus: true });
  });

  it('refuses the second one of the same day rather than paying twice', () => {
    const first = claimBonus(EMPTY, NOON);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(claimBonus(first.held, NOON + 60_000)).toEqual({
      ok: false,
      error: 'the bonus is taken today',
    });
  });

  it('pays again tomorrow, and the dollars from today are still there', () => {
    const first = claimBonus(EMPTY, NOON);
    if (!first.ok) return;
    const second = claimBonus(first.held, NOON + MS_PER_DAY);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.held.dollars).toBe(DAILY_BONUS * 2);
  });

  it('rolls the row itself before anything reads it, row or no row', () => {
    // the newest player of all comes through EMPTY rather than through a
    // stored row, and EMPTY carries a day that is no day
    expect(withToday(EMPTY, NOON).daily.day).toBe(dayOf(NOON));
    const yesterday = {
      ...EMPTY,
      daily: { ...freshDay(dayOf(NOON) - 1), bonus: true, taken: ['win-1'] },
    };
    expect(withToday(yesterday, NOON).daily).toEqual(freshDay(dayOf(NOON)));
  });

  it('hands back the very same row when the day has not moved', () => {
    const today = { ...EMPTY, daily: freshDay(dayOf(NOON)) };
    expect(withToday(today, NOON)).toBe(today);
  });

  it('rolls a day held over from yesterday rather than reading it as today', () => {
    // the row is rolled on the way out of the database as well, but the rule
    // has to hold here too: this is the function that decides whether anybody
    // is paid, and it must not be able to answer about yesterday
    const stale = { ...EMPTY, daily: { ...freshDay(dayOf(NOON) - 1), bonus: true } };
    const out = claimBonus(stale, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.daily.day).toBe(dayOf(NOON));
  });

  it('touches nothing else on the profile, coins included', () => {
    const rich = { ...EMPTY, spent: 12, granted: 4 };
    const out = claimBonus(rich, NOON);
    if (!out.ok) return;
    expect(balance(out.held, 30)).toBe(balance(rich, 30));
  });

  it('shuts the migration door: a bonus taken is the server having something', () => {
    const out = claimBonus(EMPTY, NOON);
    if (!out.ok) return;
    expect(untouched(out.held)).toBe(false);
  });
});

describe("collecting a quest", () => {
  const NOON = 20_000 * MS_PER_DAY + 12 * 3_600_000;
  const DAY = dayOf(NOON);
  const [first, , third] = questsFor(DAY);

  /** a row standing on today, with one quest finished */
  const finished = (over: Partial<Held> = {}): Held => ({
    ...EMPTY,
    daily: { ...freshDay(DAY), progress: { [first.id]: first.goal } },
    ...over,
  });

  it('pays the coins the catalogue advertises and marks it collected', () => {
    const out = claimQuest(finished(), first.id, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.granted).toBe(first.coins);
    expect(out.held.daily.taken).toEqual([first.id]);
  });

  it('pays into granted, so the leaderboard never sees it', () => {
    // the board ranks coins EARNED from matches; two players with the same
    // match record must not be separated by who tapped a button
    const out = claimQuest(finished(), first.id, NOON);
    if (!out.ok) return;
    expect(balance(out.held, 10)).toBe(10 + first.coins);
  });

  it('refuses a quest that is not finished', () => {
    const bare = { ...EMPTY, daily: freshDay(DAY) };
    expect(claimQuest(bare, first.id, NOON)).toEqual({ ok: false, error: 'not finished' });
  });

  it('refuses the second collection of the same one rather than paying twice', () => {
    const out = claimQuest(finished(), first.id, NOON);
    if (!out.ok) return;
    expect(claimQuest(out.held, first.id, NOON)).toEqual({
      ok: false,
      error: 'already collected',
    });
  });

  it('refuses a quest today was never dealt, however finished it looks', () => {
    const never = QUESTS.find((q) => !questsFor(DAY).some((x) => x.id === q.id));
    expect(never, 'the catalogue is bigger than one day').toBeDefined();
    if (!never) return;
    const claiming = {
      ...EMPTY,
      daily: { ...freshDay(DAY), progress: { [never.id]: never.goal } },
    };
    expect(claimQuest(claiming, never.id, NOON).ok).toBe(false);
  });

  it('refuses a name that is not a quest at all', () => {
    expect(claimQuest(finished(), 'free-money', NOON).ok).toBe(false);
  });

  it('refuses one finished yesterday: the day rolls before anything is paid', () => {
    const stale = {
      ...EMPTY,
      daily: { ...freshDay(DAY - 1), progress: { [first.id]: first.goal } },
    };
    const out = claimQuest(stale, first.id, NOON);
    expect(out).toEqual({ ok: false, error: 'not finished' });
  });

  it('leaves the bonus and the other quests where they were', () => {
    const out = claimQuest(finished(), first.id, NOON);
    if (!out.ok) return;
    expect(out.held.daily.bonus).toBe(false);
    expect(out.held.daily.taken).not.toContain(third.id);
    expect(out.held.dollars).toBe(0);
  });
});

describe('a match counted against the day', () => {
  const NOON = 20_000 * MS_PER_DAY + 12 * 3_600_000;
  const DAY = dayOf(NOON);

  /** the first day that deals a quest of some description, and noon on it */
  function findDay(wanted: (q: Quest) => boolean): { n: number; at: number } {
    for (let d = 20_000; d < 20_400; d++) {
      if (questsFor(d).some(wanted)) return { n: d, at: d * MS_PER_DAY + 12 * 3_600_000 };
    }
    throw new Error('no day deals one');
  }

  const match = (over: Partial<DayFacts> = {}): DayFacts => ({
    outcome: 'win',
    netWorth: 16_000,
    tradedWell: true,
    bankrupt: false,
    trades: 9,
    duel: false,
    ...over,
  });

  it('can be played into a collectable quest and collected once', () => {
    // the whole loop, on the pure functions the routes are built out of
    let held: Held = { ...EMPTY, daily: freshDay(DAY) };
    for (let i = 0; i < 6; i++) {
      held = { ...held, daily: countMatch(held.daily, match(), NOON) };
    }
    const done = questsFor(DAY).filter((q) => (held.daily.progress[q.id] ?? 0) >= q.goal);
    expect(done.length, 'six good matches should finish all three').toBe(3);

    let paid = 0;
    for (const q of done) {
      const out = claimQuest(held, q.id, NOON);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      held = out.held;
      paid += q.coins;
    }
    expect(held.granted).toBe(paid);
    for (const q of done) expect(claimQuest(held, q.id, NOON).ok).toBe(false);
  });

  it('lets a duel finish a duel quest, facts and all', () => {
    // the point of the assertion is as much that `MatchFacts` goes straight
    // into `countMatch` — a superset, nothing mapped — as that it counts
    const day = findDay((q) => Boolean(q.social));
    const quest = questsFor(day.n).find((q) => q.social);
    expect(quest, 'some day deals a duel quest').toBeDefined();
    if (!quest) return;

    const facts: MatchFacts = { ...match({ duel: true }), duel: true };
    let held: Held = { ...EMPTY, daily: freshDay(day.n) };
    for (let i = 0; i < quest.goal; i++) {
      held = { ...held, daily: countMatch(held.daily, facts, day.at) };
    }

    const out = claimQuest(held, quest.id, day.at);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.granted).toBe(quest.coins);
  });

  it('does not let a bot match finish a duel quest', () => {
    const day = findDay((q) => Boolean(q.social));
    const quest = questsFor(day.n).find((q) => q.social);
    if (!quest) return;
    let held: Held = { ...EMPTY, daily: freshDay(day.n) };
    for (let i = 0; i < 5; i++) {
      held = { ...held, daily: countMatch(held.daily, match({ duel: false }), day.at) };
    }
    expect(claimQuest(held, quest.id, day.at)).toEqual({ ok: false, error: 'not finished' });
  });
});

describe('the share counter', () => {
  const NOON = Date.UTC(2026, 2, 14, 12);
  const TODAY = dayOf(NOON);
  const SALT = 'a-real-deployment';
  const nova = companyById('nova')!;
  const price = priceOn(nova, TODAY, SALT);

  /** somebody who has met NOVA, has money, and has not traded today */
  const trader = (over: Partial<Held> = {}): Held =>
    held({ seen: ['nova'], dollars: 100_000, daily: freshDay(TODAY), ...over });

  it('charges the asking price and files the shares', () => {
    const out = trade(trader(), 'nova', 2, false, SALT, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.dollars).toBe(100_000 - askOf(price) * 2);
    expect(out.held.portfolio.nova.shares).toBe(2);
    // dated by this server's day, so the overnight figure knows the player was
    // not holding it last night
    expect(out.held.portfolio.nova.day).toBe(TODAY);
    expect(out.held.daily.orders).toBe(1);
  });

  it('pays the bid on the way out', () => {
    const out = trade(
      trader({ portfolio: { nova: { shares: 3, cost: 3000, day: TODAY - 5 } }, dollars: 0 }),
      'nova',
      3,
      true,
      SALT,
      NOON,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.dollars).toBe(bidOf(price) * 3);
    expect(out.held.portfolio.nova).toBeUndefined();
  });

  /**
   * The archive is the shop window. A company nobody has had on a board is one
   * they cannot buy a piece of, which is the whole of what ties the counter to
   * the game rather than leaving it beside it.
   */
  it('refuses a company this player has never met', () => {
    expect(trade(trader({ seen: [] }), 'nova', 1, false, SALT, NOON)).toEqual({
      ok: false,
      error: 'not in the archive yet',
    });
  });

  it('refuses a company the game does not have at all', () => {
    expect(trade(trader({ seen: ['ghost-corp'] }), 'ghost-corp', 1, false, SALT, NOON).ok).toBe(
      false,
    );
  });

  it('allows three orders a day and no fourth', () => {
    const spent = trader({ daily: { ...freshDay(TODAY), orders: ORDERS_A_DAY } });
    expect(trade(spent, 'nova', 1, false, SALT, NOON)).toEqual({
      ok: false,
      error: 'no orders left today',
    });
  });

  /**
   * Yesterday's count is not today's. Nothing sweeps it — the day simply stops
   * matching, exactly as it does for the bonus and the quests.
   */
  it('starts the count again the moment the day turns', () => {
    const yesterday = trader({
      daily: { ...freshDay(TODAY - 1), orders: ORDERS_A_DAY },
    });
    const out = trade(yesterday, 'nova', 1, false, SALT, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.daily.day).toBe(TODAY);
    expect(out.held.daily.orders).toBe(1);
  });

  it('refuses what the balance will not cover, and spends no order doing it', () => {
    const broke = trader({ dollars: 1 });
    const out = trade(broke, 'nova', 1, false, SALT, NOON);
    expect(out).toEqual({ ok: false, error: 'not enough dollars' });
  });

  it('refuses more shares than are held', () => {
    expect(trade(trader(), 'nova', 1, true, SALT, NOON)).toEqual({
      ok: false,
      error: 'not that many shares',
    });
  });

  /**
   * The salt is the only thing standing between a published walk and a player
   * who can see tomorrow, so a deployment that sets one must not settle trades
   * at the prices a bundle can compute.
   */
  it('settles at the salted price, not the one the client could work out', () => {
    const salted = trade(trader(), 'nova', 1, false, SALT, NOON);
    const bare = trade(trader(), 'nova', 1, false, '', NOON);
    expect(salted.ok && bare.ok).toBe(true);
    if (!salted.ok || !bare.ok) return;
    expect(salted.held.dollars).not.toBe(bare.held.dollars);
  });
});
