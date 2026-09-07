/**
 * The wire for what a player owns: the room behind the menu, the clothes on
 * the trader, and the stars still in hand.
 *
 * Both ends import this file — the browser from `src/ui/api.ts`, the Worker
 * from `worker/src/profile.ts` — for the same reason `src/duel/protocol.ts` is
 * shared: the shape is written once, and changing it breaks the build on both
 * sides rather than in production.
 *
 * Why a server holds any of this. Until now the room and the wardrobe lived in
 * `localStorage` and nowhere else, so a cleared browser, a new phone or the
 * desktop Telegram client instead of the phone one threw away every star ever
 * earned. That is the whole reason for this file. A wardrobe the console
 * cannot edit is a second reason, and the duel object cashes it in: it dresses
 * each duellist out of this table rather than out of what their browser
 * claimed to be wearing (`worker/src/duel.ts`).
 *
 * What is deliberately NOT here: leagues, the company archive and board
 * preferences. Those stay in `localStorage`, because none of them is a thing
 * bought with stars and none of them is what a player loses sleep over.
 */

import { ROOM_DONE } from '../ui/renovation';
import { RARITIES, SLOTS, itemId, type Outfit, type Rarity, type Slot } from '../ui/wardrobe';

/**
 * What a wardrobe is, at rest: the top rung owned in each slot, or nothing.
 *
 * A slot is climbed in order — `wardrobe.ts` says a player's holdings in it are
 * a prefix of RARITIES — so one rarity per slot describes the whole thing, and
 * it is the same shape as an outfit for the same reason.
 */
export type Tops = Partial<Record<Slot, Rarity>>;

/** Everything the server keeps for one player, as the browser receives it. */
export interface Profile {
  /** stars in hand: earned + granted − spent, all three of them the server's */
  stars: number;
  /** stars EARNED, which is what the board ranks on and what spending never touches */
  earned: number;
  spent: number;
  /** renovation steps finished, 0..ROOM_DONE */
  room: number;
  owned: Tops;
  outfit: Outfit;
}

/**
 * What a browser is holding the first time it meets the server — a save made
 * before any of this existed. See `worker/src/profile.ts` for when it is
 * believed, which is once and only while the server has nothing of its own.
 */
export interface Claim {
  stars: number;
  room: number;
  owned: Tops;
  outfit: Outfit;
}

/**
 * A fat-finger guard on the claim, not a security boundary — the claim is
 * believed or it is not, and that decision is made elsewhere. The whole
 * wardrobe plus the whole room is 559 stars, so nothing legitimate is anywhere
 * near this.
 */
export const MAX_CLAIM_STARS = 100_000;

export const rankOf = (rarity: Rarity): number => RARITIES.indexOf(rarity);

/** Five known slots, five known rarities, nothing else — from an untrusted message. */
export function cleanTops(raw: unknown): Tops {
  const out: Tops = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const slot of SLOTS) {
    const r = src[slot];
    if (typeof r === 'string' && (RARITIES as readonly string[]).includes(r)) {
      out[slot] = r as Rarity;
    }
  }
  return out;
}

/** An outfit is the same shape as a wardrobe, and cleaned the same way. */
export const cleanOutfit = (raw: unknown): Outfit => cleanTops(raw);

export function cleanRoom(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(ROOM_DONE, Math.max(0, n)) : 0;
}

/** A whole number of stars, never negative. */
export function cleanCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** The same, but capped: only a claim is ever read through this one. */
export const cleanClaimedStars = (raw: unknown): number =>
  Math.min(MAX_CLAIM_STARS, cleanCount(raw));

export function cleanClaim(raw: unknown): Claim {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const owned = cleanTops(src.owned);
  return {
    stars: cleanClaimedStars(src.stars),
    room: cleanRoom(src.room),
    owned,
    outfit: wearable(owned, cleanOutfit(src.outfit)),
  };
}

/** Nothing bought, nothing worn, no stars: a claim with nothing in it to keep. */
export const emptyClaim = (c: Claim): boolean =>
  c.stars === 0 && c.room === 0 && Object.keys(c.owned).length === 0;

/** You cannot wear what you do not own, and you cannot wear above what you do. */
export function wearable(owned: Tops, outfit: Outfit): Outfit {
  const out: Outfit = {};
  for (const slot of SLOTS) {
    const worn = outfit[slot];
    const top = owned[slot];
    if (!worn || !top) continue;
    out[slot] = rankOf(worn) <= rankOf(top) ? worn : top;
  }
  return out;
}

/** The one rarity a slot can buy next, or null once it is finished. */
export function nextRung(owned: Tops, slot: Slot): Rarity | null {
  const top = owned[slot];
  return RARITIES[top ? rankOf(top) + 1 : 0] ?? null;
}

/** The rung under the top one, or null once the slot is bare again. */
export function rungBelow(rarity: Rarity): Rarity | null {
  return RARITIES[rankOf(rarity) - 1] ?? null;
}

/** The better of two wardrobes, slot by slot. */
export function mergeTops(a: Tops, b: Tops): Tops {
  const out: Tops = {};
  for (const slot of SLOTS) {
    const x = a[slot];
    const y = b[slot];
    if (x && y) out[slot] = rankOf(x) >= rankOf(y) ? x : y;
    else if (x || y) out[slot] = (x ?? y) as Rarity;
  }
  return out;
}

/**
 * A profile as it comes back off the wire. The server is not an attacker, but
 * an old deployment answering a new client is a real thing, and a room of
 * `undefined` draws a blank screen rather than a bare room.
 */
export function cleanProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  if (typeof src.stars !== 'number' || !Number.isFinite(src.stars)) return null;
  const owned = cleanTops(src.owned);
  return {
    stars: Math.max(0, Math.floor(src.stars)),
    earned: cleanCount(src.earned),
    spent: cleanCount(src.spent),
    room: cleanRoom(src.room),
    owned,
    outfit: wearable(owned, cleanOutfit(src.outfit)),
  };
}

/* --------------------------------------------- the browser's own shape */

/**
 * The game keeps a wardrobe as a flat set of item ids, because that is what
 * the shop asks it (`owned.has(itemId(slot, rarity))`). These two turn it into
 * the one-rarity-per-slot shape that goes on the wire and back.
 *
 * `topsOf` reads the highest rung of each slot and forgets the rest, which
 * repairs a save with a hole in it: an early build let a player buy the rare
 * while skipping the common and uncommon under it, and the ladder has not
 * allowed that for a while. Coming back the other way through `setOf`, those
 * skipped rungs are handed over — a migration should round in the player's
 * favour, and a wardrobe that is a proper prefix is the only one the shop can
 * draw honestly.
 */
export function topsOf(owned: Set<string>): Tops {
  const out: Tops = {};
  for (const slot of SLOTS) {
    for (let i = RARITIES.length - 1; i >= 0; i--) {
      if (owned.has(itemId(slot, RARITIES[i]))) {
        out[slot] = RARITIES[i];
        break;
      }
    }
  }
  return out;
}

export function setOf(tops: Tops): Set<string> {
  const out = new Set<string>();
  for (const slot of SLOTS) {
    const top = tops[slot];
    if (!top) continue;
    for (let i = 0; i <= rankOf(top); i++) out.add(itemId(slot, RARITIES[i]));
  }
  return out;
}
