import { describe, expect, it } from 'vitest';
import { CONFIG } from '../sim/config';
import { LEAGUES, leagueOfPreset, rollRivalNeck, unlockedCount, winsOwed } from './leagues';
import { Rng } from '../sim/rng';
import { RARITIES } from './wardrobe';

const noWins = () => LEAGUES.map(() => 0);

describe('the ladder', () => {
  it('names a real opponent for every league', () => {
    for (const l of LEAGUES) expect(CONFIG.bot[l.preset]).toBeDefined();
  });

  it('gives each league its own opponent', () => {
    const presets = LEAGUES.map((l) => l.preset);
    expect(new Set(presets).size).toBe(presets.length);
    LEAGUES.forEach((l, i) => expect(leagueOfPreset(l.preset)).toBe(i));
  });

  it('pays more the higher up you go', () => {
    for (let i = 1; i < LEAGUES.length; i++) {
      expect(LEAGUES[i].reward.win).toBeGreaterThan(LEAGUES[i - 1].reward.win);
      expect(LEAGUES[i].reward.profit).toBeGreaterThan(LEAGUES[i - 1].reward.profit);
    }
  });

  it('ends the ladder with a league that gates nothing', () => {
    expect(LEAGUES[LEAGUES.length - 1].winsToNext).toBe(0);
    for (let i = 0; i < LEAGUES.length - 1; i++) expect(LEAGUES[i].winsToNext).toBeGreaterThan(0);
  });
});

describe('unlocking', () => {
  it('opens exactly one league on a fresh save', () => {
    expect(unlockedCount(noWins())).toBe(1);
    expect(unlockedCount([])).toBe(1);
  });

  it('opens the next league on the last owed win, and not before', () => {
    const wins = noWins();
    wins[0] = LEAGUES[0].winsToNext - 1;
    expect(unlockedCount(wins)).toBe(1);
    expect(winsOwed(1, wins)).toBe(1);
    wins[0]++;
    expect(unlockedCount(wins)).toBe(2);
    expect(winsOwed(1, wins)).toBe(0);
  });

  it('will not skip a league, however many wins are banked below it', () => {
    const wins = noWins();
    wins[0] = 999;
    expect(unlockedCount(wins)).toBe(2);
  });

  it('opens the whole ladder once every gate is cleared', () => {
    const wins = LEAGUES.map((l) => l.winsToNext);
    expect(unlockedCount(wins)).toBe(LEAGUES.length);
  });

  it('owes nothing for a league that is already open', () => {
    expect(winsOwed(0, noWins())).toBe(0);
  });
});

describe("the rival's neck", () => {
  it('has odds that add up to a hundred in every league', () => {
    for (const l of LEAGUES) expect(l.rivalNeck.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('lands on each rung about as often as the table says', () => {
    const N = 20_000;
    LEAGUES.forEach((l, li) => {
      const rng = new Rng(1234 + li);
      const seen = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < N; i++) {
        const neck = rollRivalNeck(li, () => rng.next());
        seen[neck === null ? 0 : RARITIES.indexOf(neck) + 1]++;
      }
      l.rivalNeck.forEach((pct, i) => {
        // a rung at zero never comes up at all; the rest within a point and a half
        if (pct === 0) expect(seen[i]).toBe(0);
        else expect(Math.abs((100 * seen[i]) / N - pct)).toBeLessThan(1.5);
      });
    });
  });

  it('reads a bare neck at the bottom of the roll and a legend at the top', () => {
    expect(rollRivalNeck(4, () => 0)).toBeNull();
    expect(rollRivalNeck(4, () => 0.9999)).toBe('legend');
  });
});
