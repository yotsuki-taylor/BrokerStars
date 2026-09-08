import { describe, expect, it } from 'vitest';
import { priceTable, rankByWorth, type Holder } from '../src/board';
import { COMPANIES } from '../../src/sim/companies';
import { dayOf } from '../../src/daily/protocol';

/**
 * The dollar board, as the server works it out. Every rule here is a pure
 * function of rows and a price table, so none of this needs a database.
 *
 * The one that matters most is the first block: a board that ranked balances
 * would rank people for not playing, and that is the mistake this file exists
 * to keep out.
 */

const PRICES = { nova: 1000, tet: 500 };

const holder = (id: string, dollars: number, portfolio: object = {}): Holder => ({
  id,
  name: id.toUpperCase(),
  dollars,
  portfolio: JSON.stringify(portfolio),
});

const share = (shares: number) => ({ shares, cost: 0, day: 0 });

describe('what the dollar board ranks', () => {
  it('counts shares at today’s price alongside the cash', () => {
    const rows = [holder('a', 1000, { nova: share(5) })];
    const { top } = rankByWorth(rows, PRICES, 25, null);
    expect(top[0].cash).toBe(1000);
    expect(top[0].shares).toBe(5000);
    expect(top[0].worth).toBe(6000);
  });

  /**
   * The whole reason this board is not a `SELECT ... ORDER BY dollars`. Two
   * players who have had exactly the same money, one of whom spent it on
   * shares: the investor must not be ranked below the one who sat on it.
   */
  it('does not punish the player who spent their cash on shares', () => {
    const saver = holder('saver', 6000);
    const investor = holder('investor', 0, { nova: share(7) });
    const { top } = rankByWorth([saver, investor], PRICES, 25, null);
    expect(top.map((r) => r.id)).toEqual(['investor', 'saver']);
    expect(top[0].worth).toBe(7000);
    expect(top[0].cash).toBe(0);
  });

  it('adds up a book spread over several companies', () => {
    const rows = [holder('a', 100, { nova: share(2), tet: share(3) })];
    expect(rankByWorth(rows, PRICES, 25, null).top[0].worth).toBe(100 + 2000 + 1500);
  });

  it('sorts richest first and numbers the ranks from one', () => {
    const rows = [holder('poor', 10), holder('rich', 900), holder('middle', 400)];
    const { top } = rankByWorth(rows, PRICES, 25, null);
    expect(top.map((r) => [r.rank, r.id])).toEqual([
      [1, 'rich'],
      [2, 'middle'],
      [3, 'poor'],
    ]);
  });

  it('breaks a tie the same way every time it is asked', () => {
    const rows = [holder('zeta', 500), holder('alpha', 500)];
    const once = rankByWorth(rows, PRICES, 25, null).top.map((r) => r.id);
    const again = rankByWorth([...rows].reverse(), PRICES, 25, null).top.map((r) => r.id);
    expect(once).toEqual(['alpha', 'zeta']);
    expect(again).toEqual(once);
  });
});

describe('the caller’s own row', () => {
  const rows = Array.from({ length: 30 }, (_, i) => holder(`p${String(i).padStart(2, '0')}`, 1000 - i));

  it('is marked inside the slice rather than repeated under it', () => {
    const { top, me } = rankByWorth(rows, PRICES, 5, 'p02');
    expect(top.find((r) => r.you)?.id).toBe('p02');
    expect(me).toBeNull();
  });

  it('comes back with its real rank when it fell outside the slice', () => {
    const { top, me } = rankByWorth(rows, PRICES, 5, 'p20');
    expect(top.some((r) => r.you)).toBe(false);
    expect(me?.id).toBe('p20');
    expect(me?.rank).toBe(21);
    expect(me?.you).toBe(true);
  });

  it('is nothing at all for somebody with no row on the board', () => {
    expect(rankByWorth(rows, PRICES, 5, 'nobody').me).toBeNull();
    expect(rankByWorth(rows, PRICES, 5, null).me).toBeNull();
  });
});

describe('rows that are not what they should be', () => {
  it('values a company this build has dropped at nothing rather than throwing', () => {
    const rows = [holder('a', 100, { 'ghost-corp': share(9), nova: share(1) })];
    expect(rankByWorth(rows, PRICES, 25, null).top[0].worth).toBe(1100);
  });

  it('survives a portfolio column that is not JSON', () => {
    const broken: Holder = { id: 'a', name: 'A', dollars: 50, portfolio: 'not json' };
    expect(rankByWorth([broken], PRICES, 25, null).top[0].worth).toBe(50);
  });

  it('skips a company the price table does not carry', () => {
    // nova is priced, tet is not: the book is worth only the part that is
    expect(rankByWorth([holder('a', 0, { nova: share(1), tet: share(4) })], { nova: 1000 }, 25, null)
      .top[0].worth).toBe(1000);
  });

  it('reads a negative balance as nothing', () => {
    expect(rankByWorth([holder('a', -500)], PRICES, 25, null).top[0].cash).toBe(0);
  });

  it('hands back an empty table rather than failing on no rows', () => {
    expect(rankByWorth([], PRICES, 25, 'me')).toEqual({ top: [], me: null });
  });
});

describe('the price table', () => {
  const DAY = dayOf(Date.UTC(2026, 2, 14));

  it('prices every company the game has, once each', () => {
    const table = priceTable(DAY, 'salt');
    expect(Object.keys(table).sort()).toEqual(COMPANIES.map((c) => c.id).sort());
    for (const price of Object.values(table)) expect(price).toBeGreaterThan(0);
  });

  it('is the salted market, not the one a bundle could work out', () => {
    expect(priceTable(DAY, 'a-real-deployment')).not.toEqual(priceTable(DAY, ''));
  });
});
