import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig } from './config';
import { createMatch, finish, runToEnd, step } from './match';
import { NEVER_BUST, NO_PERKS, type TraderPerks } from './perks';
import { applyAction, canUndo, netWorth, undoLast } from './trading';
import type { MatchState } from './types';

/** One geared trader against one plain one, on the config's default board. */
function match(perks: Partial<TraderPerks>, seed = 1): MatchState {
  return createMatch(seed, CONFIG, {
    traders: [
      { name: 'GEARED', kind: 'human', preset: 'medium', perks },
      { name: 'PLAIN', kind: 'human', preset: 'medium' },
    ],
  });
}

const buy = (s: MatchState, trader = 0, stock = 0, fraction = 0.25) =>
  applyAction(s, { trader, stock, side: 'buy', fraction });
const sell = (s: MatchState, trader = 0, stock = 0, fraction = 1) =>
  applyAction(s, { trader, stock, side: 'sell', fraction });

describe('perks belong to a trader, not to the market', () => {
  it('leaves a bot on the plain terms', () => {
    const s = match({ commissionMult: 0 });
    expect(s.traders[1].perks).toBe(NO_PERKS);
    expect(s.traders[1].perks.commissionMult).toBe(1);
  });

  it('charges only the geared trader the cheaper commission', () => {
    const s = match({ commissionMult: 0.5 });
    step(s);
    const mine = buy(s, 0)!;
    const theirs = buy(s, 1)!;
    expect(mine.commission).toBeCloseTo(theirs.commission * 0.5, 6);
  });

  it('does not move the prices either side trades on', () => {
    const plain = runToEnd(match({}, 31));
    const geared = runToEnd(match({ commissionMult: 0, slippageMult: 0 }, 31));
    // nobody traded in either match, so the tape has to be identical
    expect(geared.stocks.map((x) => x.history)).toEqual(plain.stocks.map((x) => x.history));
  });
});

describe('what trading costs', () => {
  it('takes less slippage on a bigger order when the perk says so', () => {
    const cheap = match({ slippageMult: 0.5 });
    const plain = match({});
    step(cheap);
    step(plain);
    const a = buy(cheap, 0, 0, 1)!;
    const b = buy(plain, 0, 0, 1)!;
    expect(a.price).toBeLessThan(b.price);
    const mid = plain.stocks[0].price;
    expect((a.price - mid) / mid).toBeCloseTo(((b.price - mid) / mid) * 0.5, 6);
  });

  it('prices a closing trade at the mid once exits are free', () => {
    const s = match({ freeExits: true });
    step(s);
    buy(s, 0, 0, 0.5);
    step(s);
    const out = sell(s, 0, 0, 1)!;
    expect(out.price).toBe(s.stocks[0].price);
  });

  it('still charges slippage on the way in', () => {
    const s = match({ freeExits: true });
    step(s);
    const inTrade = buy(s, 0, 0, 1)!;
    expect(inTrade.price).toBeGreaterThan(s.stocks[0].price);
  });
});

describe('how bad it can get', () => {
  it('holds off bankruptcy until the deeper threshold', () => {
    const cfg = cloneConfig();
    const s = createMatch(3, cfg, {
      traders: [
        { name: 'A', kind: 'human', preset: 'medium', perks: { bankruptAt: -500 } },
        { name: 'B', kind: 'human', preset: 'medium' },
      ],
    });
    step(s);
    // neither holds anything, so cash is the whole book: 200 in the hole
    s.traders[0].cash = -200;
    s.traders[1].cash = -200;
    step(s);
    expect(s.traders[0].bankrupt).toBe(false);
    expect(s.traders[1].bankrupt).toBe(true);
  });

  it('never busts a trader whose threshold is off, and floors the result', () => {
    const start = CONFIG.match.startingCash;
    const s = match({ bankruptAt: NEVER_BUST, minResult: start * 0.1 });
    step(s);
    s.traders[0].cash = -1_000_000;
    step(s);
    expect(s.traders[0].bankrupt).toBe(false);
    expect(netWorth(s, s.traders[0])).toBeLessThan(0);
    finish(s);
    expect(s.traders[0].netWorth).toBe(start * 0.1);
    // and that floor counts towards the result
    expect(s.winner).toBe(1);
  });

  it('bails out of a position far enough under water, once per use', () => {
    const s = match({ stopLossAt: 0.15, stopLossUses: 1 });
    step(s);
    buy(s, 0, 0, 0.5);
    buy(s, 1, 0, 0.5);
    expect(s.traders[0].positions[0]).toBeGreaterThan(0);
    // drive the entry far above the market rather than the market down, so the
    // other trader's identical position is the control
    s.traders[0].avgEntry[0] = s.stocks[0].price * 2;
    s.traders[1].avgEntry[0] = s.stocks[0].price * 2;
    step(s);
    expect(s.traders[0].positions[0]).toBe(0);
    expect(s.traders[1].positions[0]).toBeGreaterThan(0);
    expect(s.traders[0].stopsLeft).toBe(0);
  });

  it('hands back part of the first losing close and only the first', () => {
    const s = match({ firstLossRefund: 0.5 });
    step(s);
    buy(s, 0, 0, 0.3);
    s.traders[0].avgEntry[0] = s.stocks[0].price * 2; // guarantee a loss
    const first = sell(s, 0, 0, 1)!;
    expect(first.realized).toBeLessThan(0);
    expect(first.refund).toBeCloseTo(-first.realized * 0.5, 6);

    buy(s, 0, 1, 0.3);
    s.traders[0].avgEntry[1] = s.stocks[1].price * 2;
    const second = sell(s, 0, 1, 1)!;
    expect(second.realized).toBeLessThan(0);
    expect(second.refund).toBe(0);
  });
});

describe('taking a trade back', () => {
  const withUndo = { undos: 1, undoWindowTicks: 10 };

  it('restores the book exactly and drops the trade', () => {
    const s = match(withUndo);
    step(s);
    const cash = s.traders[0].cash;
    buy(s, 0, 0, 0.5);
    expect(s.traders[0].positions[0]).toBeGreaterThan(0);
    expect(canUndo(s, 0)).toBe(true);
    expect(undoLast(s, 0)).toBe(true);
    expect(s.traders[0].cash).toBe(cash);
    expect(s.traders[0].positions[0]).toBe(0);
    expect(s.traders[0].avgEntry[0]).toBe(0);
    expect(s.traders[0].trades).toHaveLength(0);
  });

  it('is offered once, and not to a trader without the coat', () => {
    const s = match(withUndo);
    step(s);
    buy(s, 0, 0, 0.25);
    expect(undoLast(s, 0)).toBe(true);
    buy(s, 0, 0, 0.25);
    expect(canUndo(s, 0)).toBe(false);
    expect(undoLast(s, 0)).toBe(false);

    buy(s, 1, 0, 0.25);
    expect(canUndo(s, 1)).toBe(false);
    expect(undoLast(s, 1)).toBe(false);
  });

  it('closes the window after the ticks run out', () => {
    const s = match({ undos: 1, undoWindowTicks: 2 });
    step(s);
    buy(s, 0, 0, 0.25);
    step(s);
    step(s);
    expect(canUndo(s, 0)).toBe(true);
    step(s);
    expect(canUndo(s, 0)).toBe(false);
    expect(undoLast(s, 0)).toBe(false);
  });

  it('leaves the whole match replayable', () => {
    const play = () => {
      const s = match(withUndo, 12);
      for (let i = 0; i < 30; i++) {
        step(s);
        if (i === 5) buy(s, 0, 1, 0.5);
        if (i === 6) undoLast(s, 0);
        if (i === 10) buy(s, 0, 0, 0.25);
      }
      return s;
    };
    const a = play();
    const b = play();
    expect(a.traders[0].cash).toBe(b.traders[0].cash);
    expect(a.stocks.map((x) => x.history)).toEqual(b.stocks.map((x) => x.history));
  });
});
