import { describe, expect, it } from 'vitest';
import { ABILITY_IDS } from '../sim/abilities';
import { CONFIG } from '../sim/config';
import { NEVER_BUST } from '../sim/perks';
import { perksFor, wantsBoardScreen } from './perks';
import { CATALOGUE, RARITIES, SLOTS, type Outfit, type Rarity, type Slot } from './wardrobe';

const CASH = CONFIG.match.startingCash;
const bare: Outfit = {};
const wearing = (slot: Slot, rarity: Rarity): Outfit => ({ [slot]: rarity });
const dressed = (rarity: Rarity): Outfit =>
  Object.fromEntries(SLOTS.map((s) => [s, rarity])) as Outfit;

/** The perk bag for every rung of one slot, bare first. */
const ladder = <T,>(slot: Slot, read: (p: ReturnType<typeof perksFor>) => T): T[] => [
  read(perksFor(bare, CASH)),
  ...RARITIES.map((r) => read(perksFor(wearing(slot, r), CASH))),
];

describe('a bare trader', () => {
  it('trades on exactly the terms the game had before clothes meant anything', () => {
    const { trader, ui } = perksFor(bare, CASH);
    expect(trader.commissionMult).toBe(1);
    expect(trader.slippageMult).toBe(1);
    expect(trader.freeExits).toBe(false);
    expect(trader.bankruptAt).toBe(0);
    expect(trader.minResult).toBe(0);
    expect(trader.stopLossUses).toBe(0);
    expect(trader.undos).toBe(0);
    expect(ui.ability).toBe(null);
    expect(ui.truthTicks).toBe(0);
    expect(wantsBoardScreen(ui)).toBe(false);
  });

  it('is not helped by a slot it has nothing in', () => {
    // a full set of hats must leave the commission alone
    expect(perksFor(wearing('hat', 'legend'), CASH).trader.commissionMult).toBe(1);
    expect(perksFor(wearing('hand', 'legend'), CASH).ui.pickAll).toBe(false);
  });
});

describe('every ladder climbs the right way', () => {
  it('makes trading strictly cheaper up the HANDS slot', () => {
    const costs = ladder('hand', (p) => p.trader.commissionMult);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThan(costs[i - 1]);
    expect(costs[costs.length - 1]).toBe(0);
    expect(perksFor(wearing('hand', 'legend'), CASH).trader.freeExits).toBe(true);
    expect(perksFor(wearing('hand', 'mythic'), CASH).trader.freeExits).toBe(false);
  });

  it('never makes slippage worse up the HANDS slot', () => {
    const slip = ladder('hand', (p) => p.trader.slippageMult);
    for (let i = 1; i < slip.length; i++) expect(slip[i]).toBeLessThanOrEqual(slip[i - 1]);
  });

  it('deepens the hole a BODY can survive, then closes it entirely', () => {
    const [barest, common, uncommon] = ladder('torso', (p) => p.trader.bankruptAt);
    expect(barest).toBe(0);
    expect(common).toBe(-500);
    expect(uncommon).toBe(NEVER_BUST);
    expect(perksFor(wearing('torso', 'uncommon'), CASH).trader.minResult).toBe(CASH * 0.1);
    const stops = ladder('torso', (p) => p.trader.stopLossUses);
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
    expect(perksFor(wearing('torso', 'legend'), CASH).trader.undos).toBe(1);
    expect(perksFor(wearing('torso', 'mythic'), CASH).trader.undos).toBe(0);
  });

  it('brings a different ability at every rung of the NECK slot', () => {
    // The neck is the only slot that is not a ladder of the same thing turned
    // up: each rung is its own tool, so what is asserted is that they differ.
    const got = ladder('neck', (p) => p.ui.ability);
    expect(got[0]).toBe(null);
    const worn = got.slice(1);
    expect(worn).toHaveLength(RARITIES.length);
    expect(new Set(worn).size).toBe(worn.length);
    for (const a of worn) expect(ABILITY_IDS).toContain(a);
  });

  it('reveals one more thing per rung up the EXTRA slot', () => {
    const reveals = ladder(
      'access',
      (p) =>
        [p.ui.showKind, p.ui.showQuirks, p.ui.headlineWarning, p.ui.holdDirection, p.ui.truthTicks > 0].filter(
          Boolean,
        ).length,
    );
    expect(reveals).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('hands over more of the draw per rung up the HEAD slot', () => {
    const rerolls = ladder('hat', (p) => p.ui.rerolls);
    for (let i = 1; i < rerolls.length; i++) {
      expect(rerolls[i]).toBeGreaterThanOrEqual(rerolls[i - 1]);
    }
    expect(perksFor(wearing('hat', 'rare'), CASH).ui.bans).toBe(1);
    expect(perksFor(wearing('hat', 'uncommon'), CASH).ui.bans).toBe(0);
    expect(perksFor(wearing('hat', 'mythic'), CASH).ui.pins).toBe(1);
    expect(perksFor(wearing('hat', 'rare'), CASH).ui.pins).toBe(0);
    expect(perksFor(wearing('hat', 'legend'), CASH).ui.pickAll).toBe(true);
  });
});

describe('the board screen', () => {
  it('opens for the first rung of either slot that looks at the draw', () => {
    expect(wantsBoardScreen(perksFor(wearing('hat', 'common'), CASH).ui)).toBe(true);
    expect(wantsBoardScreen(perksFor(wearing('access', 'uncommon'), CASH).ui)).toBe(true);
    // the reading glasses only write on the rows during the match
    expect(wantsBoardScreen(perksFor(wearing('access', 'common'), CASH).ui)).toBe(false);
    expect(wantsBoardScreen(perksFor(wearing('torso', 'legend'), CASH).ui)).toBe(false);
  });
});

describe('the catalogue and the numbers', () => {
  it('has a card for every rung of every slot', () => {
    for (const slot of SLOTS) {
      for (const r of RARITIES) {
        expect(CATALOGUE[slot][r].name.length).toBeGreaterThan(0);
        expect(CATALOGUE[slot][r].text.length).toBeGreaterThan(0);
      }
    }
  });

  it('charges the discounts the HANDS cards promise', () => {
    // the cards say 15 / 30 / 45 / 60 percent off, then free
    const promised = [0.15, 0.3, 0.45, 0.6, 1];
    RARITIES.forEach((r, i) => {
      expect(perksFor(wearing('hand', r), CASH).trader.commissionMult).toBeCloseTo(
        1 - promised[i],
        6,
      );
    });
  });

  it('names on the NECK cards the ability that rung actually brings', () => {
    const promised: Record<string, string> = {
      common: 'STATIC',
      uncommon: 'HALT',
      rare: 'DOSSIER',
      mythic: 'MARGIN CALL',
      legend: 'RUMOUR',
    };
    for (const r of RARITIES) {
      const ability = perksFor(wearing('neck', r), CASH).ui.ability;
      expect(ability).not.toBe(null);
      expect(CATALOGUE.neck[r].text).toContain(promised[r]);
    }
  });

  it('stacks the whole wardrobe without any slot cancelling another', () => {
    const { trader, ui } = perksFor(dressed('legend'), CASH);
    expect(trader.commissionMult).toBe(0);
    expect(trader.freeExits).toBe(true);
    expect(trader.bankruptAt).toBe(NEVER_BUST);
    expect(trader.undos).toBe(1);
    expect(ui.ability).toBe('rumour');
    expect(ui.truthTicks).toBeGreaterThan(0);
    expect(ui.pickAll).toBe(true);
  });
});
