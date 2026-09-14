import { describe, expect, it } from 'vitest';
import {
  NO_OFFER,
  OFFER_SIZE,
  RARITY_CHANCE,
  cleanOffer,
  onOffer,
  rollOffer,
  rolledOffer,
  showing,
} from './protocol';
import { MS_PER_DAY, dayOf } from '../daily/protocol';
import { ALL_ITEMS, RARITIES, type Rarity } from '../ui/wardrobe';

/**
 * The shelf. Two properties carry the whole design and both are here: a day
 * draws five garments and never more, and buying one of them does not put a
 * sixth out.
 */

const TODAY = 20_000;
const NOON = TODAY * MS_PER_DAY + 12 * 3_600_000;
const rarityOf = (id: string): Rarity => ALL_ITEMS.find((it) => it.id === id)!.rarity;

describe('the day’s draw', () => {
  it('puts out five garments, all different, all real', () => {
    const { items } = rollOffer(TODAY, new Set());
    expect(items).toHaveLength(OFFER_SIZE);
    expect(new Set(items).size).toBe(OFFER_SIZE);
    for (const id of items) expect(ALL_ITEMS.some((it) => it.id === id)).toBe(true);
  });

  it('is the same shelf every time it is asked for the same day', () => {
    expect(rollOffer(TODAY, new Set())).toEqual(rollOffer(TODAY, new Set()));
    expect(rollOffer(TODAY, new Set()).items).not.toEqual(rollOffer(TODAY + 1, new Set()).items);
  });

  it('never offers something the player already owns', () => {
    const owned = new Set(rollOffer(TODAY, new Set()).items);
    const again = rollOffer(TODAY, owned);
    expect(again.items.filter((id) => owned.has(id))).toEqual([]);
    expect(again.items).toHaveLength(OFFER_SIZE);
  });

  it('runs short rather than repeating itself once the wardrobe is nearly full', () => {
    const owned = new Set(ALL_ITEMS.slice(0, ALL_ITEMS.length - 2).map((it) => it.id));
    expect(rollOffer(TODAY, owned).items).toHaveLength(2);
    expect(rollOffer(TODAY, new Set(ALL_ITEMS.map((it) => it.id))).items).toEqual([]);
  });

  it('draws the cheap tiers far more often than the dear ones', () => {
    // the weights are readable as percentages against a full catalogue, so over
    // a year of shelves the shares should land near them
    const seen: Record<string, number> = {};
    let drawn = 0;
    for (let day = 0; day < 400; day++) {
      for (const id of rollOffer(day, new Set()).items) {
        seen[rarityOf(id)] = (seen[rarityOf(id)] ?? 0) + 1;
        drawn++;
      }
    }
    for (const r of RARITIES) {
      const share = ((seen[r] ?? 0) / drawn) * 100;
      expect(share, r).toBeGreaterThan(RARITY_CHANCE[r] - 6);
      expect(share, r).toBeLessThan(RARITY_CHANCE[r] + 6);
    }
    // and the order is the one the prices assume, whatever the noise
    expect(seen.common).toBeGreaterThan(seen.uncommon);
    expect(seen.uncommon).toBeGreaterThan(seen.rare);
    expect(seen.rare).toBeGreaterThan(seen.mythic);
    expect(seen.mythic).toBeGreaterThan(seen.legend);
  });
});

describe('a shelf across midnight', () => {
  it('hands back the very same object while the day holds', () => {
    const today = rollOffer(dayOf(NOON), new Set());
    expect(rolledOffer(today, new Set(), NOON)).toBe(today);
  });

  it('draws again once the day has moved, and not before', () => {
    const yesterday = rollOffer(dayOf(NOON) - 1, new Set());
    expect(rolledOffer(yesterday, new Set(), NOON).day).toBe(dayOf(NOON));
    expect(rolledOffer(NO_OFFER, new Set(), NOON).day).toBe(dayOf(NOON));
  });

  it('does not restock when a garment is bought', () => {
    // the point of storing the draw rather than working it out on demand: the
    // wardrobe has changed, and the shelf has not
    const today = rollOffer(dayOf(NOON), new Set());
    const bought = new Set([today.items[0]]);
    expect(rolledOffer(today, bought, NOON)).toBe(today);
    expect(showing(today, bought)).toHaveLength(OFFER_SIZE - 1);
  });
});

describe('what the player is shown', () => {
  const offer = { day: TODAY, items: ['hat-legend', 'neck-common', 'torso-rare'] };

  it('leaves out what has been bought and sorts the rest cheapest first', () => {
    expect(showing(offer, new Set(['hat-legend']))).toEqual(['neck-common', 'torso-rare']);
    expect(showing(offer, new Set())).toEqual(['neck-common', 'torso-rare', 'hat-legend']);
  });

  it('draws nothing for a shelf that has been cleared out', () => {
    expect(showing(offer, new Set(offer.items))).toEqual([]);
  });

  it('drops a garment this build has never heard of', () => {
    expect(showing({ day: TODAY, items: ['hat-legend', 'cape-legend'] }, new Set())).toEqual([
      'hat-legend',
    ]);
  });
});

describe('a shelf off the wire', () => {
  it('keeps a well formed one', () => {
    const today = rollOffer(TODAY, new Set());
    expect(cleanOffer(JSON.parse(JSON.stringify(today)))).toEqual(today);
  });

  it('answers with a shelf from before every day for anything that is not one', () => {
    expect(cleanOffer(null)).toEqual(NO_OFFER);
    expect(cleanOffer('legend')).toEqual(NO_OFFER);
    expect(cleanOffer({})).toEqual(NO_OFFER);
    expect(cleanOffer({ day: 'soon', items: ['hat-common'] }).day).toBe(NO_OFFER.day);
  });

  it('will not be talked into a sixth garment, a fake one, or the same one twice', () => {
    const fat = { day: TODAY, items: [...ALL_ITEMS.map((it) => it.id)] };
    expect(cleanOffer(fat).items).toHaveLength(OFFER_SIZE);
    expect(cleanOffer({ day: TODAY, items: ['hat-common', 'hat-common'] }).items).toEqual([
      'hat-common',
    ]);
    expect(cleanOffer({ day: TODAY, items: ['cape-legend', 7, null] }).items).toEqual([]);
  });
});

describe('what the counter asks', () => {
  it('is only ever whether the garment is on today’s shelf', () => {
    const offer = { day: TODAY, items: ['hat-legend'] };
    expect(onOffer(offer, 'hat-legend')).toBe(true);
    expect(onOffer(offer, 'hat-common')).toBe(false);
    expect(onOffer(NO_OFFER, 'hat-legend')).toBe(false);
  });
});
