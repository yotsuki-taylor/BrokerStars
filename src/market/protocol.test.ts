import { describe, expect, it } from 'vitest';
import { COMPANIES, companyById } from '../sim/companies';
import { dayOf } from '../daily/protocol';
import {
  BAND,
  HISTORY_DAYS,
  ORDERS_A_DAY,
  SPREAD,
  affordable,
  askOf,
  bidOf,
  buyShares,
  cleanMarket,
  cleanPortfolio,
  costOf,
  marketFor,
  NEVER_TRADED,
  ordersLeft,
  overnight,
  prevPriceIn,
  priceIn,
  priceOn,
  sellShares,
  seriesFor,
  tradedOn,
  valueOf,
  type Portfolio,
} from './protocol';

const DAY = dayOf(Date.UTC(2026, 2, 14));
const nova = companyById('nova')!;
const uranus = companyById('uranus')!;

describe('what a share costs', () => {
  it('is the same number every time it is asked', () => {
    expect(priceOn(nova, DAY, 'salt')).toBe(priceOn(nova, DAY, 'salt'));
  });

  /**
   * The load-bearing property of the whole file. A series is anchored
   * `WINDOW + length` days back rather than `WINDOW`, so every element in it is
   * folded over exactly the same number of days as a one-day answer for that
   * date — which is what makes "yesterday's price" on the chart the same number
   * yesterday's trade was settled at.
   */
  it('reads the same on a chart as it does on its own day', () => {
    const series = seriesFor(nova, DAY, HISTORY_DAYS, 'salt');
    expect(series).toHaveLength(HISTORY_DAYS);
    for (let i = 0; i < HISTORY_DAYS; i++) {
      expect(series[i]).toBe(priceOn(nova, DAY - (HISTORY_DAYS - 1 - i), 'salt'));
    }
  });

  it('is a different market under a different salt', () => {
    // the whole reason the salt is the Worker's: knowing the walk is not
    // knowing the prices
    const mine = seriesFor(uranus, DAY, HISTORY_DAYS, '');
    const theirs = seriesFor(uranus, DAY, HISTORY_DAYS, 'a-real-deployment');
    expect(mine).not.toEqual(theirs);
  });

  it('never leaves the band, for any company on any day of a year', () => {
    for (const c of COMPANIES) {
      const lo = c.basePrice * Math.exp(-BAND);
      const hi = c.basePrice * Math.exp(BAND);
      for (const price of seriesFor(c, DAY, 365, 'salt')) {
        expect(price).toBeGreaterThanOrEqual(Math.floor(lo));
        expect(price).toBeLessThanOrEqual(Math.ceil(hi));
      }
    }
  });

  it('holds a PROTECTED company above its own floor', () => {
    for (const c of COMPANIES) {
      if (c.trait.kind !== 'floor' || !c.trait.floor) continue;
      for (const price of seriesFor(c, DAY, 365, 'salt')) {
        expect(price).toBeGreaterThanOrEqual(c.trait.floor);
      }
    }
  });

  it('keeps STATE money nearer its listing price than anything else', () => {
    const drift = (id: string) => {
      const c = companyById(id)!;
      const series = seriesFor(c, DAY, 365, 'salt');
      return Math.max(...series.map((p) => Math.abs(p / c.basePrice - 1)));
    };
    // CIVIC ANCHOR is dragged home five times as hard as BEACON MEDIA, which
    // lists at a similar price and swings about as much per day
    expect(drift('civic')).toBeLessThan(drift('beacon'));
  });

  it('prices every company the game has, and nothing it does not', () => {
    const prices = marketFor(DAY, HISTORY_DAYS, 'salt');
    expect(Object.keys(prices).sort()).toEqual(COMPANIES.map((c) => c.id).sort());
  });
});

describe('a market off the wire', () => {
  it('keeps known companies and drops the rest', () => {
    const m = cleanMarket({
      day: DAY,
      prices: { nova: [700, 710], 'ghost-corp': [1, 2], tet: 'not a series' },
    });
    expect(Object.keys(m.prices)).toEqual(['nova']);
    expect(priceIn(m, 'nova')).toBe(710);
    expect(prevPriceIn(m, 'nova')).toBe(700);
  });

  it('is nothing at all when the day is not a number', () => {
    expect(cleanMarket({ prices: { nova: [700] } }).day).toBe(-1);
    expect(cleanMarket(null).prices).toEqual({});
  });

  it('has no yesterday when it was only sent one day', () => {
    expect(prevPriceIn(cleanMarket({ day: DAY, prices: { nova: [700] } }), 'nova')).toBeNull();
    expect(priceIn(cleanMarket({ day: DAY, prices: {} }), 'nova')).toBeNull();
  });
});

describe('the house cut', () => {
  it('costs more to buy than it fetches to sell', () => {
    expect(askOf(1000)).toBe(Math.ceil(1000 * (1 + SPREAD)));
    expect(bidOf(1000)).toBe(Math.floor(1000 * (1 - SPREAD)));
    expect(askOf(1000)).toBeGreaterThan(bidOf(1000));
  });

  it('never prices a share at nothing, however cheap it got', () => {
    expect(bidOf(1)).toBe(1);
  });

  it('counts what a balance can afford at the asking price, not the mid', () => {
    // 2000 buys one share at 1010 and not two, however close the mid looks
    expect(affordable(2000, 1000)).toBe(1);
    expect(affordable(2020, 1000)).toBe(2);
  });
});

describe('buying', () => {
  it('takes the dollars and files the shares', () => {
    const out = buyShares({}, 5000, 'nova', 3, 1000, DAY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.paid).toBe(3030);
    expect(out.dollars).toBe(1970);
    expect(out.portfolio.nova).toEqual({ shares: 3, cost: 3030, day: DAY });
  });

  it('adds to a position rather than replacing it', () => {
    const first = buyShares({}, 5000, 'nova', 2, 1000, DAY - 4);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = buyShares(first.portfolio, first.dollars, 'nova', 1, 500, DAY);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // and the position is dated by the LATEST trade, not the first
    expect(second.portfolio.nova).toEqual({ shares: 3, cost: 2020 + 505, day: DAY });
  });

  it('refuses what the balance will not cover, and changes nothing', () => {
    expect(buyShares({}, 100, 'nova', 1, 1000, DAY)).toEqual({
      ok: false,
      error: 'not enough dollars',
    });
  });

  it('refuses a company the game does not have, and a size that is not one', () => {
    expect(buyShares({}, 9999, 'ghost-corp', 1, 10, DAY).ok).toBe(false);
    expect(buyShares({}, 9999, 'nova', 0, 10, DAY).ok).toBe(false);
    expect(buyShares({}, 9999, 'nova', -3, 10, DAY).ok).toBe(false);
  });
});

describe('selling', () => {
  const held: Portfolio = { nova: { shares: 4, cost: 4000, day: DAY - 9 } };

  it('hands back the bid and clears the row when it is all of it', () => {
    const out = sellShares(held, 0, 'nova', 4, 1000, DAY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dollars).toBe(3960);
    expect(out.portfolio.nova).toBeUndefined();
  });

  it('takes the cost basis out in proportion, so the average price holds', () => {
    const out = sellShares(held, 0, 'nova', 1, 1000, DAY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // three left of four, so three quarters of what the four cost
    expect(out.portfolio.nova).toEqual({ shares: 3, cost: 3000, day: DAY });
  });

  it('refuses more than is held, and changes nothing', () => {
    expect(sellShares(held, 0, 'nova', 5, 1000, DAY)).toEqual({
      ok: false,
      error: 'not that many shares',
    });
    expect(sellShares({}, 0, 'nova', 1, 1000, DAY).ok).toBe(false);
  });
});

describe('what the book is worth', () => {
  /** both bought a while ago, so both count towards the overnight figure */
  const book: Portfolio = {
    nova: { shares: 2, cost: 1400, day: DAY - 6 },
    tet: { shares: 1, cost: 1000, day: DAY - 6 },
  };
  const market = { day: DAY, prices: { nova: [700, 800], tet: [1000, 900] } };

  it('adds up at the day’s prices, and knows what it cost', () => {
    expect(valueOf(book, (id) => priceIn(market, id))).toBe(2500);
    expect(costOf(book)).toBe(2400);
  });

  it('skips a company the market did not send rather than valuing it at zero', () => {
    expect(valueOf({ nova: { shares: 2, cost: 0, day: DAY } }, () => null)).toBe(0);
  });

  it('is the price move times the shares, position by position', () => {
    // NOVA went 700 -> 800 on two shares, TET went 1000 -> 900 on one
    expect(overnight(book, market)).toBe(2 * 100 - 100);
  });

  /**
   * The rule that stops the counter being a slot machine that pays on entry.
   * A position opened this morning was bought at TODAY's price, so the jump
   * from yesterday happened without the player in it.
   */
  it('pays nothing for a night spent holding dollars', () => {
    const boughtToday: Portfolio = { nova: { shares: 2, cost: 1600, day: DAY } };
    expect(overnight(boughtToday, market)).toBe(0);
    expect(tradedOn(boughtToday, 'nova', DAY)).toBe(true);
  });

  it('counts a position again the day after it was traded', () => {
    const yesterday: Portfolio = { nova: { shares: 2, cost: 1600, day: DAY - 1 } };
    expect(overnight(yesterday, market)).toBe(200);
  });

  it('has nothing to compare against when only one day was sent', () => {
    expect(overnight(book, { day: DAY, prices: { nova: [800] } })).toBe(0);
  });
});

describe('a book off the wire', () => {
  it('keeps known companies with whole positive positions', () => {
    expect(
      cleanPortfolio({
        nova: { shares: 3, cost: 900, day: DAY },
        'ghost-corp': { shares: 3, cost: 900, day: DAY },
        tet: { shares: 0, cost: 10, day: DAY },
        uranus: { shares: -2, cost: 10, day: DAY },
        velvet: 'not a holding',
      }),
    ).toEqual({ nova: { shares: 3, cost: 900, day: DAY } });
  });

  it('reads a position with no cost as one that cost nothing', () => {
    expect(cleanPortfolio({ nova: { shares: 2 } })).toEqual({
      nova: { shares: 2, cost: 0, day: NEVER_TRADED },
    });
  });

  /**
   * A row written before positions carried a date is one that was not traded
   * today — the friendly reading, and the one that counts it.
   */
  it('reads an undated position as one that was not traded today', () => {
    const old = cleanPortfolio({ nova: { shares: 2, cost: 500 } });
    expect(old.nova.day).toBe(NEVER_TRADED);
    expect(tradedOn(old, 'nova', DAY)).toBe(false);
  });
});

describe('the day’s orders', () => {
  const day = { day: DAY, bonus: false, progress: {}, taken: [], orders: 0 };

  it('starts at three and runs out', () => {
    expect(ordersLeft(day)).toBe(ORDERS_A_DAY);
    expect(ordersLeft({ ...day, orders: 2 })).toBe(1);
    expect(ordersLeft({ ...day, orders: ORDERS_A_DAY })).toBe(0);
  });

  it('never goes below zero, whatever a stored row claims', () => {
    expect(ordersLeft({ ...day, orders: 99 })).toBe(0);
  });
});
