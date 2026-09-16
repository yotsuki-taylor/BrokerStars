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
  countOpen,
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
import { cleanClaim } from '../../src/profile/protocol';
import { rollOffer, type Offer } from '../../src/shop/protocol';
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
import { askOf, bidOf, priceOn } from '../../src/market/protocol';
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

/**
 * A shelf with these garments on it, for today.
 *
 * Every purchase has to come off a shelf now, so a test that buys something has
 * to say what the shop was showing — which is the whole of the new rule, and
 * the reason there is no `shopping()` helper that quietly puts the thing being
 * bought on sale.
 */
const TODAY = 20_000;
const shelf = (...items: string[]): Offer => ({ day: TODAY, items });

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

describe('buying off the shelf', () => {
  it('sells what is on it and wears it', () => {
    const out = buyItem(held({ offer: shelf('torso-common') }), 100, 'torso', 'common', false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toEqual(['torso-common']);
    expect(out.held.outfit.torso).toBe('common');
    expect(out.held.spent).toBe(PRICES.common);
  });

  it('sells a legend to somebody who owns nothing under it', () => {
    // the whole of the change: there is no rung below this one to buy first
    const out = buyItem(held({ offer: shelf('torso-legend') }), 10_000, 'torso', 'legend', false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toEqual(['torso-legend']);
    expect(out.held.spent).toBe(PRICES.legend);
  });

  it('refuses what today is not showing, however rich the caller', () => {
    expect(buyItem(held({ offer: shelf('hat-common') }), 10_000, 'torso', 'legend', false)).toEqual(
      { ok: false, error: 'not on sale today' },
    );
  });

  it('refuses one that is already owned', () => {
    const owned = held({
      owned: ['torso-common'],
      offer: shelf('torso-common'),
      spent: PRICES.common,
    });
    expect(buyItem(owned, 100, 'torso', 'common', false)).toEqual({
      ok: false,
      error: 'already owned',
    });
  });

  it('refuses what the balance does not cover', () => {
    expect(
      buyItem(held({ offer: shelf('torso-common') }), PRICES.common - 1, 'torso', 'common', false),
    ).toEqual({ ok: false, error: 'not enough coins' });
  });

  it('charges nothing in free mode, and still hands the item over', () => {
    const out = buyItem(held({ offer: shelf('torso-common') }), 0, 'torso', 'common', true);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.spent).toBe(0);
    expect(out.held.owned).toEqual(['torso-common']);
  });

  it('takes a whole shelf for the sum of its prices, and adds nothing to it', () => {
    const items = RARITIES.map((r) => `hat-${r}`);
    const whole = RARITIES.reduce((n, r) => n + PRICES[r], 0);
    let h = held({ offer: { day: TODAY, items } });
    for (const r of RARITIES) {
      const out = buyItem(h, whole, 'hat', r, false);
      expect(out.ok, `could not buy ${r}`).toBe(true);
      if (!out.ok) return;
      h = out.held;
    }
    expect(h.spent).toBe(whole);
    // buying does not restock: the shelf is still the five it was drawn with
    expect(h.offer.items).toEqual(items);
    expect(h.owned).toHaveLength(RARITIES.length);
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
  it('takes the garment and puts on the best of what is left', () => {
    const spent = PRICES.common + PRICES.uncommon;
    const h = held({
      owned: ['hat-common', 'hat-uncommon'],
      outfit: { hat: 'uncommon' },
      spent,
    });
    const out = refundItem(h, 'hat', 'uncommon');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toEqual(['hat-common']);
    expect(out.held.outfit.hat).toBe('common');
    expect(out.held.spent).toBe(spent - PRICES.uncommon);
  });

  it('leaves the slot bare and bare-headed when it was the only thing in it', () => {
    const h = held({ owned: ['hat-common'], outfit: { hat: 'common' }, spent: PRICES.common });
    const out = refundItem(h, 'hat', 'common');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toEqual([]);
    expect(out.held.outfit.hat).toBeUndefined();
  });

  it('takes one out of the middle and leaves the hole where it is', () => {
    // the rule used to be "the top rung only", so that no slot ever ended up
    // with a gap; a wardrobe is a list now and a gap is nothing special
    const h = held({ owned: ['hat-common', 'hat-legend'], outfit: { hat: 'legend' } });
    const out = refundItem(h, 'hat', 'common');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toEqual(['hat-legend']);
    // and what was on the trader stays on it
    expect(out.held.outfit.hat).toBe('legend');
  });

  it('refuses what was never owned', () => {
    expect(refundItem(held({ owned: ['hat-rare'] }), 'hat', 'common')).toEqual({
      ok: false,
      error: 'does not own it',
    });
  });

  it('cannot mint coins by refunding what was never paid for', () => {
    // bought in free mode: spent never went up, so it must not come down
    const free = buyItem(held({ offer: shelf('hat-common') }), 0, 'hat', 'common', true);
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
    const h = held({ owned: ['torso-rare'] });
    expect(wear(h, { torso: 'rare' }).outfit).toEqual({ torso: 'rare' });
  });

  it('trims what is not, rather than refusing the lot', () => {
    const h = held({ owned: ['torso-common'] });
    expect(wear(h, { torso: 'legend', hat: 'mythic' }).outfit).toEqual({});
    expect(wear(h, { torso: 'common', hat: 'mythic' }).outfit).toEqual({ torso: 'common' });
  });
});

describe('the welcome present', () => {
  it('gives a bare-headed player the bandana, worn', () => {
    const out = giftHat(EMPTY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toEqual(['hat-common']);
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
      expect(giftHat(held({ owned: [`hat-${r}`] })).ok).toBe(false);
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
    const h = held({ owned: ['torso-rare'], outfit: { torso: 'rare' }, room: 2, spent: 7 });
    const out = giftHat(h);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned).toContain('torso-rare');
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
    cleanClaim({ coins: 0, room: 0, owned: [], outfit: {}, wins: [], ...over }, LEAGUES);

  it('takes a save at its word while the server has nothing of its own', () => {
    expect(untouched(EMPTY)).toBe(true);
    const h = claimInto(EMPTY, 0, claim({ coins: 7, room: 3, owned: ['hat-rare'] }));
    expect(h.room).toBe(3);
    expect(h.owned).toEqual(['hat-rare']);
    // and the coins the player could see are still there afterwards
    expect(balance(h, 0)).toBe(7);
  });

  it('books the purchases as spent, so the board is not paying for them twice', () => {
    const h = claimInto(EMPTY, 0, claim({ coins: 7, room: 3, owned: ['hat-rare'] }));
    expect(h.spent).toBe(priceOf(['hat-rare'], 3));
  });

  it('leaves a player who really did earn it all with exactly what they had', () => {
    // everything they own was paid for out of what the board already says they
    // earned, with some left over: nothing has to be granted to make it add up
    const spent = priceOf(['hat-uncommon'], 1);
    const earned = spent + 17;
    const h = claimInto(EMPTY, earned, claim({ coins: 17, room: 1, owned: ['hat-uncommon'] }));
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

  it('takes a save with a hole in it exactly as it stands', () => {
    // this used to be repaired — an early build let a slot be climbed out of
    // order and the shop could not draw the result, so the skipped rungs were
    // handed over. Nothing is climbed any more and a gap is just a gap.
    const h = claimInto(EMPTY, 0, claim({ owned: ['hat-common', 'hat-rare'] }));
    expect([...h.owned].sort()).toEqual(['hat-common', 'hat-rare']);
  });

  it('reads a save from before the shop stopped being a ladder', () => {
    // one rarity per slot meant the rungs under it had been paid for too
    const h = claimInto(EMPTY, 0, claim({ owned: { hat: 'uncommon' } }));
    expect([...h.owned].sort()).toEqual(['hat-common', 'hat-uncommon']);
    expect(h.spent).toBe(PRICES.common + PRICES.uncommon);
  });

  it('draws a shelf the claimed wardrobe cannot already be wearing', () => {
    // the row was empty when today's shelf was rolled, so a claim that walks in
    // holding half the catalogue would otherwise be offered its own clothes
    const owned = rollOffer(TODAY, new Set()).items;
    const h = claimInto(
      { ...EMPTY, offer: rollOffer(TODAY, new Set()) },
      0,
      claim({ owned }),
    );
    expect(h.offer.day).toBe(TODAY);
    expect(h.offer.items.filter((id) => owned.includes(id))).toEqual([]);
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
    const today = {
      ...EMPTY,
      daily: freshDay(dayOf(NOON)),
      offer: rollOffer(dayOf(NOON), new Set()),
    };
    expect(withToday(today, NOON)).toBe(today);
  });

  it('draws a new shelf at midnight, and only then', () => {
    const yesterday = {
      ...EMPTY,
      daily: freshDay(dayOf(NOON)),
      offer: { day: dayOf(NOON) - 1, items: ['torso-common'] },
    };
    const rolled = withToday(yesterday, NOON);
    expect(rolled.offer.day).toBe(dayOf(NOON));
    expect(rolled.offer).toEqual(rollOffer(dayOf(NOON), new Set()));
    // which is what makes yesterday's shelf unbuyable: `buyItem` is only ever
    // handed a row this has been through
    expect(buyItem(rolled, 10_000, 'torso', 'common', false).ok).toBe(
      rolled.offer.items.includes('torso-common'),
    );
  });

  it('leaves a shelf alone when the wardrobe changes under it', () => {
    // the day is what redraws it, never a purchase — otherwise buying one
    // garment would put a sixth on a five-garment shelf
    const h = { ...EMPTY, daily: freshDay(dayOf(NOON)), offer: rollOffer(dayOf(NOON), new Set()) };
    const bought = { ...h, owned: [h.offer.items[0]] };
    expect(withToday(bought, NOON).offer).toBe(bought.offer);
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

  /* ------------------------------------------ what a sale actually earned */

  /**
   * `dollars` on a trade is what goes into a corporation's season, so getting
   * it wrong is not a wrong number on a screen — it is a table anybody can
   * mint a place in. The rule is that it is the PROFIT and never the proceeds.
   */
  it('reports the profit on a sale, not what the sale paid out', () => {
    const cost = 3000;
    const out = trade(
      trader({ portfolio: { nova: { shares: 3, cost, day: TODAY - 5 } }, dollars: 0 }),
      'nova',
      3,
      true,
      SALT,
      NOON,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const got = bidOf(price) * 3;
    // the proceeds are `got`; what was EARNED is that less what those shares
    // cost, and the two are wildly different numbers
    expect(out.dollars).toBe(Math.max(0, got - cost));
    expect(out.dollars).not.toBe(got);
  });

  it('earns nothing on a purchase: the dollars moved, they were not made', () => {
    const out = trade(trader(), 'nova', 2, false, SALT, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dollars).toBe(0);
  });

  it('cannot be farmed by buying and selling the same shares', () => {
    // The trap this whole field exists to avoid. Buy, then sell the lot back
    // at the same price: the spread means it comes back SHORT, so a round trip
    // earns nothing at all and a season cannot be minted out of one purchase.
    const bought = trade(trader(), 'nova', 5, false, SALT, NOON);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const sold = trade(bought.held, 'nova', 5, true, SALT, NOON);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;

    expect(sold.dollars).toBe(0);
    // ...and the player really is down on the round trip, by the spread
    expect(sold.held.dollars).toBeLessThan(100_000);
  });

  it('counts a loss as nothing rather than as a subtraction', () => {
    // A decision about the game rather than about arithmetic: a season that
    // can go backwards is a member who can be blamed for a bad week.
    const out = trade(
      trader({ portfolio: { nova: { shares: 2, cost: 999_999, day: TODAY - 9 } }, dollars: 0 }),
      'nova',
      2,
      true,
      SALT,
      NOON,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dollars).toBe(0);
  });

  it('reports the same total whether a position is sold whole or in halves', () => {
    // The cost basis leaves in proportion, so two halves have to add up to the
    // whole — otherwise selling in pieces would be worth more than selling at
    // once, and somebody would find that out.
    const start = { nova: { shares: 4, cost: 2000, day: TODAY - 3 } };
    const whole = trade(trader({ portfolio: start, dollars: 0 }), 'nova', 4, true, SALT, NOON);
    const first = trade(trader({ portfolio: start, dollars: 0 }), 'nova', 2, true, SALT, NOON);
    expect(whole.ok && first.ok).toBe(true);
    if (!whole.ok || !first.ok) return;
    const second = trade(first.held, 'nova', 2, true, SALT, NOON);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect((first.dollars ?? 0) + (second.dollars ?? 0)).toBe(whole.dollars);
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

  /**
   * There used to be three orders a day and no fourth. The counter is gone: a
   * position was meant to be a decision rather than a habit, and what it
   * actually did was leave dollars sitting unspent, which is the opposite of
   * what the counter is for.
   *
   * Nothing needs to hold the line in its place. The spread is charged on both
   * sides of every order, so churning is a way of losing money rather than a
   * way of making it, and the price moves once a day for everybody -- there is
   * nothing inside one day to trade against.
   */
  it('takes as many orders in a day as somebody cares to place', () => {
    let book = trader();
    for (let i = 0; i < 25; i++) {
      const out = trade(book, 'nova', 1, false, SALT, NOON);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      book = out.held;
    }
    expect(book.portfolio.nova.shares).toBe(25);
  });

  it('leaves nothing on the day to be run down', () => {
    const out = trade(trader(), 'nova', 1, false, SALT, NOON);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // the day still rolls, it just has nothing to count any more
    expect(out.held.daily.day).toBe(TODAY);
    expect('orders' in out.held.daily).toBe(false);
  });

  it('refuses what the balance will not cover', () => {
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

/**
 * Counting opens. The only thing here that touches a database, so it gets the
 * smallest one that can answer: a `prepare` that remembers the statement and a
 * `run` that either works or does not.
 *
 * What is worth pinning is not that the number goes up — that is SQLite's job
 * — but the two promises the comment on `countOpen` makes about what the
 * statement must never do.
 */
interface Recorded {
  sql: string;
  args: unknown[];
}

const fakeDb = (fail = false) => {
  const seen: Recorded[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        const rec: Recorded = { sql, args: [] };
        return {
          bind(...args: unknown[]) {
            rec.args = args;
            return this;
          },
          async run() {
            if (fail) throw new Error('D1_ERROR: no such table');
            seen.push(rec);
            return { meta: { changes: 1 } };
          },
        };
      },
    },
  } as unknown as Parameters<typeof countOpen>[0];
  return { env, seen };
};

describe('counting an open', () => {
  it('adds one and stamps the clock, in a single statement', async () => {
    const { env, seen } = fakeDb();
    await countOpen(env, 'a:beef', 1_700_000_000_000);
    expect(seen).toHaveLength(1);
    expect(seen[0].sql.replace(/\s+/g, ' ')).toContain(
      'UPDATE profiles SET opens = opens + 1, last_open = ?2 WHERE id = ?1',
    );
    expect(seen[0].args).toEqual(['a:beef', 1_700_000_000_000]);
  });

  it('leaves `updated_at` alone, which is what stops it losing somebody a race', () => {
    // That column is the version every write compares against, so a counter
    // that moved it would make a purchase in flight fail for no reason.
    const { env, seen } = fakeDb();
    return countOpen(env, 'a:beef', 1).then(() => {
      expect(seen[0].sql).not.toContain('updated_at');
    });
  });

  it('reads nothing first, so two opens at once cannot write the same number', async () => {
    const { env, seen } = fakeDb();
    await countOpen(env, 'a:beef', 1);
    expect(seen[0].sql).not.toMatch(/SELECT/i);
  });

  it('swallows a database that says no rather than failing the handshake', async () => {
    const { env } = fakeDb(true);
    await expect(countOpen(env, 'a:beef', 1)).resolves.toBeUndefined();
  });
});
