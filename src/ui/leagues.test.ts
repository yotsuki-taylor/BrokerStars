import { describe, expect, it } from 'vitest';
import { CONFIG } from '../sim/config';
import { LEAGUES, leagueOfPreset, unlockedCount, winsOwed } from './leagues';

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
