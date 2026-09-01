import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig, type Config } from './config';
import { createMatch, finish, resign, runToEnd, step } from './match';
import { totalTicks } from './market';
import { applyAction, netWorth } from './trading';
import type { MatchState } from './types';

const twoBots = (seed: number, cfg: Config = CONFIG) =>
  createMatch(seed, cfg, {
    traders: [
      { name: 'A', kind: 'bot', preset: 'medium' },
      { name: 'B', kind: 'bot', preset: 'hard' },
    ],
  });

/** A match with a human seat, so nothing trades unless the test says so. */
const solo = (seed = 1, cfg: Config = CONFIG) =>
  createMatch(seed, cfg, {
    traders: [
      { name: 'YOU', kind: 'human', preset: 'medium' },
      { name: 'IDLE', kind: 'human', preset: 'medium' },
    ],
  });

const prices = (s: MatchState) => s.stocks.map((st) => st.history.join(','));

describe('determinism', () => {
  it('replays a seed tick for tick', () => {
    const a = runToEnd(twoBots(42));
    const b = runToEnd(twoBots(42));
    expect(prices(a)).toEqual(prices(b));
    expect(a.traders.map((t) => t.netWorthHistory)).toEqual(b.traders.map((t) => t.netWorthHistory));
    expect(a.winner).toBe(b.winner);
  });

  it('gives different seeds different markets', () => {
    expect(prices(runToEnd(twoBots(1)))).not.toEqual(prices(runToEnd(twoBots(2))));
  });

  it('replays the same match after the same manual trades', () => {
    const play = () => {
      const s = solo(7);
      for (let i = 0; i < 40; i++) {
        step(s);
        if (i % 7 === 0) applyAction(s, { trader: 0, stock: i % s.stocks.length, side: 'buy', fraction: 0.25 });
      }
      return s;
    };
    const a = play();
    const b = play();
    expect(prices(a)).toEqual(prices(b));
    expect(a.traders[0].cash).toBe(b.traders[0].cash);
    expect(a.traders[0].positions).toEqual(b.traders[0].positions);
  });
});

describe('match lifecycle', () => {
  it('runs exactly the configured number of ticks and then stops', () => {
    const s = runToEnd(twoBots(3));
    expect(s.tick).toBe(totalTicks(CONFIG));
    expect(s.finished).toBe(true);
    const before = s.tick;
    step(s);
    expect(s.tick).toBe(before);
  });

  it('closes every position at the whistle without charging for it', () => {
    const s = solo(11);
    for (let i = 0; i < 30; i++) step(s);
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.5 });
    const held = s.traders[0].positions[0];
    expect(held).toBeGreaterThan(0);

    const worthBeforeClose = netWorth(s, s.traders[0]);
    finish(s);
    expect(s.traders[0].positions.every((p) => p === 0)).toBe(true);
    // liquidation is at the last tick price, so net worth must not move
    expect(s.traders[0].netWorth).toBeCloseTo(worthBeforeClose, 6);
  });

  it('awards the match to whoever is worth more', () => {
    const s = runToEnd(twoBots(5));
    const [a, b] = s.traders;
    expect(s.winner).toBe(a.netWorth > b.netWorth ? 0 : 1);
  });

  it('hands the match to the other trader when one resigns', () => {
    const s = solo(9);
    for (let i = 0; i < 20; i++) step(s);
    resign(s, 0);
    expect(s.finished).toBe(true);
    expect(s.resigned).toBe(0);
    expect(s.winner).toBe(1);
  });

  it('resigning after the whistle changes nothing', () => {
    const s = runToEnd(twoBots(13));
    const winner = s.winner;
    resign(s, 0);
    expect(s.winner).toBe(winner);
    expect(s.resigned).toBeNull();
  });

  it('marks a trader bankrupt once they are worth nothing', () => {
    const cfg = cloneConfig();
    cfg.match.bankruptcyEnabled = true;
    const s = solo(17, cfg);
    step(s);
    s.traders[0].cash = -1_000_000; // straight into the hole
    step(s);
    expect(s.traders[0].bankrupt).toBe(true);
    expect(s.traders[0].netWorth).toBe(0);
    expect(s.traders[0].positions.every((p) => p === 0)).toBe(true);
  });
});

describe('flags', () => {
  for (const flag of ['marketImpact', 'shorting', 'phases'] as const) {
    it(`plays a whole match with ${flag} switched off`, () => {
      const cfg = cloneConfig();
      cfg.flags[flag] = false;
      const s = runToEnd(twoBots(23, cfg));
      expect(s.finished).toBe(true);
      expect(s.stocks.every((st) => st.history.every((p) => Number.isFinite(p) && p > 0))).toBe(true);
    });
  }
});
