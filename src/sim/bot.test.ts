import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig, type Config } from './config';
import { createMatch, step } from './match';
import { grossExposure } from './trading';
import type { MatchState, TraderState } from './types';

const RUNGS = ['rookie', 'easy', 'medium', 'hard', 'elite'];

const match = (seed: number, preset: string, cfg: Config = CONFIG) =>
  createMatch(seed, cfg, {
    traders: [
      { name: 'BOT', kind: 'bot', preset },
      { name: 'IDLE', kind: 'human', preset: 'medium' },
    ],
  });

/** What one bot did with its money over a whole match, sampled every tick. */
function play(seed: number, preset: string, cfg: Config = CONFIG) {
  const st = match(seed, preset, cfg);
  const t: TraderState = st.traders[0];
  let invested = 0;
  let flat = 0;
  let ticks = 0;
  let firstTrade = Infinity;
  let peakExposure = 0;
  let idleCash = 0;
  while (!st.finished) {
    step(st);
    if (st.finished) break;
    ticks++;
    const gross = grossExposure(st, t);
    invested += gross / Math.max(1, t.netWorth);
    peakExposure = Math.max(peakExposure, gross / Math.max(1, t.netWorth));
    idleCash = Math.max(idleCash, t.cash / Math.max(1, t.netWorth));
    if (gross === 0) flat++;
    if (firstTrade === Infinity && t.trades.length) firstTrade = st.tick;
  }
  return {
    state: st as MatchState,
    trader: t,
    invested: invested / ticks,
    flat: flat / ticks,
    firstTrade,
    peakExposure,
    idleCash,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const seeds = [1, 7, 13, 42, 99];

describe('a bot plays for the money it has', () => {
  it.each(RUNGS)('%s keeps most of its net worth in the market', (preset) => {
    const runs = seeds.map((s) => play(s, preset));
    // the complaint this answers: rookie used to run at 9 % invested and sit
    // flat a third of the match, which reads as an opponent who is not playing
    expect(mean(runs.map((r) => r.invested))).toBeGreaterThan(0.6);
    expect(mean(runs.map((r) => r.flat))).toBeLessThan(0.15);
  });

  it.each(RUNGS)('%s is on the board within the first seconds', (preset) => {
    for (const seed of seeds) {
      const { firstTrade } = play(seed, preset);
      expect(firstTrade).toBeLessThanOrEqual(12); // six seconds at a 500 ms tick
    }
  });

  it('sizes off net worth, so a committed bot still trades in size', () => {
    // every order used to be a slice of the cash left over, so the more the bot
    // held the smaller it traded; the tenth trade should be no tiddler
    const { trader, state } = play(7, 'medium');
    const late = trader.trades.slice(10).map((tr) => Math.abs(tr.qty * tr.price));
    expect(late.length).toBeGreaterThan(10);
    expect(mean(late)).toBeGreaterThan(state.cfg.match.startingCash * 0.1);
  });

  it('stays inside the exposure its rung is configured for', () => {
    for (const preset of RUNGS) {
      const cap = CONFIG.bot[preset].targetInvested;
      for (const seed of seeds) {
        // the ceiling is only enforced when the bot opens something, so a
        // position moving in its favour can carry it a little past
        expect(play(seed, preset).peakExposure).toBeLessThan(cap + 0.5);
      }
    }
  });

  it('leaves the money alone when the rung is told to sit on it', () => {
    const cfg = cloneConfig(CONFIG);
    cfg.bot.medium.targetInvested = 0.1;
    const r = play(7, 'medium', cfg);
    expect(r.invested).toBeLessThan(0.35);
    expect(r.idleCash).toBeGreaterThan(0.6);
  });

  it('turns the book over rather than buying once and sitting', () => {
    const { trader } = play(7, 'medium');
    const opens = trader.trades.filter((tr) => tr.realized === 0).length;
    const closes = trader.trades.length - opens;
    expect(closes).toBeGreaterThan(8);
    expect(opens).toBeGreaterThan(8);
  });
});
