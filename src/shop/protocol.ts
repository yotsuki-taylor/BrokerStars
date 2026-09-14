/**
 * What is on the shop's shelf today.
 *
 * The shop used to be the whole catalogue at once, climbed a rung at a time:
 * every item was always there, and the only question was whether you had paid
 * for the one under it yet. That made the shop a price list. Nothing was ever
 * news, nothing was ever gone tomorrow, and the cheap thing you did not want
 * stood between you and the dear thing you did.
 *
 * So: five garments a day, drawn at midnight, and any of them may be bought in
 * any order the moment the coins are there. What you already own is never
 * offered — see `showing` — so the shelf shrinks as the wardrobe fills, and the
 * day you own all twenty-five it is empty for good.
 *
 * Both ends import this file, for the reason `src/profile/protocol.ts` is
 * shared: the browser draws the shelf and the server charges against it, and a
 * client that asks for something that was never on today's shelf is refused
 * (`worker/src/profile.ts`).
 *
 * WHY THE SHELF IS STORED AND NOT WORKED OUT ON DEMAND. The draw is a pure
 * function of the day and what the player owned when it ran, so it could have
 * been recomputed on every read and never written down — except that buying
 * changes what is owned, which would change the draw, which would put a sixth
 * garment on a five-garment shelf the instant you bought the first. The day's
 * draw is made once and kept (`rolledOffer`), and buying only ever takes
 * something off it.
 */

import { NO_DAY, dayOf } from '../daily/protocol';
import { Rng, hashSeed } from '../sim/rng';
import { read, write } from '../ui/store';
import { ALL_ITEMS, RARITIES, type Rarity } from '../ui/wardrobe';

/** How many garments a day puts out. Never more; often fewer, once you own some. */
export const OFFER_SIZE = 5;

/**
 * The chance of each rarity, as a weight on one item.
 *
 * The numbers are readable as percentages on purpose. Every rarity has exactly
 * one item in each of the five slots, so a full catalogue is five items at each
 * weight, and a rarity's share of the first draw is `5 * w / 500` — that is, w
 * percent. A bare wardrobe therefore sees a COMMON two draws in five and a
 * LEGEND about one shelf in three.
 *
 * They no longer have to carry the "cheap first" rule the ladder used to
 * enforce, because nothing enforces it any more: what keeps a new player in
 * commons is that a legend costs twelve times as much, and what keeps the
 * legend worth waiting for is that it turns up on one shelf in three.
 *
 * As the wardrobe fills the pool loses whatever has been bought, and the
 * weights renormalise over what is left — so a player who owns every common
 * stops being shown commons rather than being shown an emptier shelf.
 */
export const RARITY_CHANCE: Record<Rarity, number> = {
  common: 40,
  uncommon: 26,
  rare: 17,
  mythic: 11,
  legend: 6,
};

/** The shop as one player sees it on one day. */
export interface Offer {
  /** the UTC day this was drawn for; the whole of the rollover, as in `Daily` */
  day: number;
  /** item ids, in the order they were drawn */
  items: string[];
}

/** A shelf from before any day: earlier than every real one, so it rolls at once. */
export const NO_OFFER: Offer = { day: NO_DAY, items: [] };

/** Every garment this build knows, by id — the pool, and the guard on the wire. */
const KNOWN = new Map(ALL_ITEMS.map((it) => [it.id, it]));

/**
 * The day's draw: up to `OFFER_SIZE` distinct garments the player does not
 * already own, weighted by `RARITY_CHANCE` and drawn without replacement.
 *
 * Seeded by the day alone, so the stock is the same for everybody — two players
 * with the same wardrobe see the same shelf, and one who owns more sees what is
 * left of it. That is deliberate: a shop the whole league is looking at on the
 * same morning is a thing to talk about, and a per-player seed would have
 * bought nothing but the inability to say "the stetson is up today".
 */
export function rollOffer(day: number, owned: ReadonlySet<string>): Offer {
  const rng = new Rng(hashSeed(`brokerstars.shop.${day}`));
  const pool = ALL_ITEMS.filter((it) => !owned.has(it.id));
  const items: string[] = [];

  while (items.length < OFFER_SIZE && pool.length > 0) {
    let total = 0;
    for (const it of pool) total += RARITY_CHANCE[it.rarity];
    let roll = rng.next() * total;
    // the last index is the fallback, so a float that walks off the end of the
    // sum by a rounding error still lands on a real garment
    let i = 0;
    for (; i < pool.length - 1; i++) {
      roll -= RARITY_CHANCE[pool[i].rarity];
      if (roll <= 0) break;
    }
    items.push(pool[i].id);
    pool.splice(i, 1);
  }

  return { day, items };
}

/**
 * Today's shelf, drawn afresh if what is held is yesterday's.
 *
 * Returns the SAME object when the day has not moved — `rolled` in
 * `src/daily/protocol.ts` promises that for the same reason, and for the same
 * caller: this is read on a render path.
 */
export function rolledOffer(offer: Offer, owned: ReadonlySet<string>, now: number): Offer {
  const day = dayOf(now);
  return offer.day === day ? offer : rollOffer(day, owned);
}

/** Is this garment for sale today? The one question the counter asks. */
export const onOffer = (offer: Offer, id: string): boolean => offer.items.includes(id);

/**
 * What the player actually sees: today's draw minus whatever has been bought
 * since it was drawn, sorted cheapest first so the shelf reads left to right.
 *
 * Buying does not put anything new out — the draw is fixed for the day — so a
 * shelf of five becomes a shelf of four, and that is the point.
 */
export function showing(offer: Offer, owned: ReadonlySet<string>): string[] {
  const rank = (id: string) => RARITIES.indexOf(KNOWN.get(id)!.rarity);
  return offer.items.filter((id) => KNOWN.has(id) && !owned.has(id)).sort((a, b) => rank(a) - rank(b));
}

/** Off the wire: a day and item ids this build knows, nothing else. */
export function cleanOffer(raw: unknown): Offer {
  if (!raw || typeof raw !== 'object') return NO_OFFER;
  const src = raw as Record<string, unknown>;
  const day = Math.floor(Number(src.day));
  const items = Array.isArray(src.items)
    ? [...new Set(src.items.filter((id): id is string => typeof id === 'string' && KNOWN.has(id)))]
    : [];
  return {
    day: Number.isFinite(day) ? day : NO_DAY,
    items: items.slice(0, OFFER_SIZE),
  };
}

/* ------------------------------------------------------------- persistence */

/**
 * The shelf lives on the server like the wardrobe does, and this is the copy
 * the shop draws before the first answer comes back — and the whole of it in a
 * build with no server behind one.
 *
 * It matters more than the usual early-draw copy. The draw is only fixed for
 * the day because somebody remembers it: a shelf worked out fresh on every
 * load, from a wardrobe that has one more garment in it than it did an hour
 * ago, is a shelf that quietly restocks every time you buy something. Offline,
 * this key is the only thing stopping that.
 */
const OFFER_KEY = 'brokerstars.offer';

export function loadOffer(): Offer {
  try {
    const raw = read(OFFER_KEY);
    return raw ? cleanOffer(JSON.parse(raw)) : NO_OFFER;
  } catch {
    return NO_OFFER;
  }
}

export function saveOffer(offer: Offer): void {
  write(OFFER_KEY, JSON.stringify(offer));
}
