import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig, type Config } from './config';
import { createMatch, step } from './match';
import { applyAction, buyingPower, netWorth, plannedQty } from './trading';

/** Both seats human, so nothing happens unless a test asks for it. */
const table = (cfg: Config = CONFIG, seed = 1) =>
  createMatch(seed, cfg, {
    traders: [
      { name: 'YOU', kind: 'human', preset: 'medium' },
      { name: 'IDLE', kind: 'human', preset: 'medium' },
    ],
  });

describe('buying', () => {
  it('turns cash into shares', () => {
    const s = table();
    const me = s.traders[0];
    const cashBefore = me.cash;
    const trade = applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.25 })!;
    expect(trade.qty).toBeGreaterThan(0);
    expect(me.positions[0]).toBe(trade.qty);
    expect(me.cash).toBeLessThan(cashBefore);
    expect(me.cash).toBeCloseTo(cashBefore - trade.qty * trade.price - trade.commission, 6);
  });

  it('is limited by cash, not by a multiple of net worth', () => {
    const s = table();
    const me = s.traders[0];
    expect(buyingPower(s, me)).toBe(me.cash);
    me.cash = 0;
    expect(plannedQty(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 })).toBe(0);
    expect(applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 })).toBeNull();
  });

  it('charges commission and slippage against the buyer', () => {
    const s = table();
    const mid = s.stocks[0].price;
    const trade = applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 })!;
    expect(trade.price).toBeGreaterThan(mid); // slippage always works against you
    expect(trade.commission).toBeCloseTo(
      CONFIG.match.commissionRate * Math.abs(trade.qty * trade.price),
      6,
    );
  });

  it('averages the entry price over several buys', () => {
    const s = table();
    const me = s.traders[0];
    const first = applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.2 })!;
    step(s);
    const second = applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.2 })!;
    const expected =
      (first.price * first.qty + second.price * second.qty) / (first.qty + second.qty);
    expect(me.avgEntry[0]).toBeCloseTo(expected, 6);
  });
});

describe('selling and shorting', () => {
  it('sells against a slipped price, below the mid', () => {
    const s = table();
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 });
    const mid = s.stocks[0].price;
    const sale = applyAction(s, { trader: 0, stock: 0, side: 'sell', fraction: 1 })!;
    expect(sale.qty).toBeLessThan(0);
    expect(sale.price).toBeLessThan(mid);
  });

  it('opens a short and pays the proceeds into cash', () => {
    const s = table();
    const me = s.traders[0];
    const cashBefore = me.cash;
    const trade = applyAction(s, { trader: 0, stock: 1, side: 'sell', fraction: 0.5 })!;
    expect(me.positions[1]).toBeLessThan(0);
    expect(me.cash).toBeGreaterThan(cashBefore);
    expect(trade.qty).toBeLessThan(0);
  });

  it('refuses to go short when the flag is off', () => {
    const cfg = cloneConfig();
    cfg.flags.shorting = false;
    const s = table(cfg);
    expect(plannedQty(s, { trader: 0, stock: 0, side: 'sell', fraction: 1 })).toBe(0);
    expect(applyAction(s, { trader: 0, stock: 0, side: 'sell', fraction: 1 })).toBeNull();
    expect(s.traders[0].positions[0]).toBe(0);
  });

  it('lets a position be closed even with no cash left', () => {
    const s = table();
    const me = s.traders[0];
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 });
    me.cash = 0;
    const closed = applyAction(s, { trader: 0, stock: 0, side: 'sell', fraction: 1 })!;
    expect(closed).not.toBeNull();
    expect(me.positions[0]).toBe(0);
  });

  it('books a gain when the price rose and a loss when it fell', () => {
    for (const [move, sign] of [
      [1.5, 1],
      [0.5, -1],
    ] as const) {
      const s = table();
      applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.5 });
      s.stocks[0].price *= move;
      const close = applyAction(s, { trader: 0, stock: 0, side: 'sell', fraction: 1 })!;
      expect(Math.sign(close.realized)).toBe(sign);
    }
  });
});

describe('market impact', () => {
  it('moves the price for everyone and then decays', () => {
    const s = table();
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 });
    expect(s.stocks[0].impact).toBeGreaterThan(0);
    const first = s.stocks[0].impact;
    step(s);
    expect(s.stocks[0].impact).toBeLessThan(first);
    expect(s.stocks[0].impact).toBeCloseTo(first * (1 - CONFIG.impact.decayPerTick), 6);
  });

  it('leaves the price alone when the flag is off', () => {
    const cfg = cloneConfig();
    cfg.flags.marketImpact = false;
    const s = table(cfg);
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 1 });
    expect(s.stocks[0].impact).toBe(0);
  });

  it('pushes the price down when the trade is a sale', () => {
    const s = table();
    applyAction(s, { trader: 0, stock: 1, side: 'sell', fraction: 1 });
    expect(s.stocks[1].impact).toBeLessThan(0);
  });
});

describe('net worth', () => {
  it('counts cash plus every position, a short included as a debt', () => {
    const s = table();
    const me = s.traders[0];
    const held = () => me.positions.reduce((sum, p, i) => sum + p * s.stocks[i].price, 0);
    expect(netWorth(s, me)).toBeCloseTo(CONFIG.match.startingCash, 6);

    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.5 });
    expect(netWorth(s, me)).toBeCloseTo(me.cash + held(), 6);

    applyAction(s, { trader: 0, stock: 1, side: 'sell', fraction: 0.5 });
    expect(me.positions[1]).toBeLessThan(0);
    // the short sits in the books as a negative holding, so it drags net worth down
    expect(me.positions[1] * s.stocks[1].price).toBeLessThan(0);
    expect(netWorth(s, me)).toBeCloseTo(me.cash + held(), 6);
  });

  it('is only dented by costs when a trade is opened and closed at once', () => {
    const s = table();
    const me = s.traders[0];
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.5 });
    applyAction(s, { trader: 0, stock: 0, side: 'sell', fraction: 1 });
    // slippage both ways plus two commissions, but nowhere near the stake
    expect(netWorth(s, me)).toBeLessThan(CONFIG.match.startingCash);
    expect(netWorth(s, me)).toBeGreaterThan(CONFIG.match.startingCash * 0.9);
  });
});
