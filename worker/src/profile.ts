/**
 * The room, the wardrobe and the star balance, kept where a cleared browser
 * cannot reach them.
 *
 * Everything above the storage line is a pure function of one `Held` — the row
 * as it stands — and that is on purpose: the rules about what may be bought and
 * what it costs are the interesting part, and they are testable without a
 * database (`worker/test/profile.test.ts`). Below the line is one read, one
 * upsert and no arithmetic.
 *
 * The shape of the thing, and why it is here at all: `src/profile/protocol.ts`.
 *
 * Prices are NOT copied. `PRICES` and `ROOM_STEPS` are imported straight out of
 * the game, unlike the reward tables in `results.ts` which are a deliberate
 * copy. The difference is what a lie would buy: a payout the client can edit is
 * a payout it can inflate, while a price it can edit is a price it can only
 * edit for itself, and the charge is made here regardless. One table for the
 * shop to draw and the server to charge from is worth more than a second copy
 * to keep in step.
 */

import { ROOM_DONE, ROOM_STEPS } from '../../src/ui/renovation';
import {
  PRICES,
  RARITIES,
  SLOTS,
  type Outfit,
  type Rarity,
  type Slot,
} from '../../src/ui/wardrobe';
import {
  cleanOutfit,
  cleanTops,
  mergeTops,
  nextRung,
  rankOf,
  rungBelow,
  wearable,
  type Claim,
  type Profile,
  type Tops,
} from '../../src/profile/protocol';
import type { Env } from './results';
import type { Caller } from './telegram';

/** The row, unpacked. Every rule below works on one of these and returns another. */
export interface Held {
  room: number;
  owned: Tops;
  outfit: Outfit;
  /** stars handed over the counter, ever */
  spent: number;
  /** stars from somewhere other than a match: the migration, and free purchases */
  granted: number;
}

export const EMPTY: Held = { room: 0, owned: {}, outfit: {}, spent: 0, granted: 0 };

/**
 * Has the server anything of its own for this player yet? While it has not, the
 * browser's old save is still believed — see `claimInto`. The moment it has,
 * that stops for good.
 */
export const untouched = (h: Held): boolean =>
  h.room === 0 && h.spent === 0 && h.granted === 0 && Object.keys(h.owned).length === 0;

/**
 * Stars in hand. Never stored, always worked out: `players.stars` is the
 * board's own running total of what was EARNED and spending must not touch it,
 * so the balance is the three numbers subtracted at the moment somebody asks.
 * Two columns that could drift apart would be one column too many.
 */
export const balance = (h: Held, earned: number): number =>
  Math.max(0, earned + h.granted - h.spent);

export const view = (h: Held, earned: number): Profile => ({
  stars: balance(h, earned),
  earned,
  spent: h.spent,
  room: h.room,
  owned: h.owned,
  outfit: h.outfit,
});

/** What this wardrobe and this much room would have cost, at today's prices. */
export function priceOf(owned: Tops, room: number): number {
  let sum = 0;
  for (const slot of SLOTS) {
    const top = owned[slot];
    if (!top) continue;
    // a slot is a ladder, so owning the top rung means having paid for every
    // rung under it as well
    for (let i = 0; i <= rankOf(top); i++) sum += PRICES[RARITIES[i]];
  }
  for (let i = 0; i < Math.min(room, ROOM_DONE); i++) sum += ROOM_STEPS[i].price;
  return sum;
}

/* ------------------------------------------------------------- the counter */

/** A purchase either happened or it did not, and the caller is told which. */
export type Bought = { ok: true; held: Held } | { ok: false; error: string };

/**
 * One rung of one slot. A slot is climbed in order, so there is exactly one
 * rarity it can buy next, and asking for any other is refused rather than
 * rounded to the right one — a client out of step should be put right by the
 * profile that comes back, not quietly charged for something it never asked
 * for.
 *
 * Buying wears it, the same way the shop does: nobody buys a hat for the box.
 */
export function buyItem(
  h: Held,
  earned: number,
  slot: Slot,
  rarity: Rarity,
  free: boolean,
): Bought {
  if (nextRung(h.owned, slot) !== rarity) return { ok: false, error: 'not the next rung' };
  const price = free ? 0 : PRICES[rarity];
  if (balance(h, earned) < price) return { ok: false, error: 'not enough stars' };
  return {
    ok: true,
    held: {
      ...h,
      owned: { ...h.owned, [slot]: rarity },
      outfit: { ...h.outfit, [slot]: rarity },
      spent: h.spent + price,
    },
  };
}

/** The next renovation step, which is the only one on offer. */
export function buyRoom(h: Held, earned: number, free: boolean): Bought {
  if (h.room >= ROOM_DONE) return { ok: false, error: 'the room is finished' };
  const price = free ? 0 : ROOM_STEPS[h.room].price;
  if (balance(h, earned) < price) return { ok: false, error: 'not enough stars' };
  return { ok: true, held: { ...h, room: h.room + 1, spent: h.spent + price } };
}

/**
 * Developer only: hand the top rung back and refund it. Only the top, or the
 * ladder ends up with a hole in it that nothing can fill.
 *
 * `spent` is floored at zero because a rung bought in free mode cost nothing,
 * and refunding it would otherwise mint stars. The game's own dev panel has
 * always had that asymmetry; the floor is what stops it compounding.
 */
export function refundItem(h: Held, slot: Slot, rarity: Rarity): Bought {
  if (h.owned[slot] !== rarity) return { ok: false, error: 'not the top rung' };
  const below = rungBelow(rarity);
  const owned = { ...h.owned };
  if (below) owned[slot] = below;
  else delete owned[slot];
  return {
    ok: true,
    held: {
      ...h,
      owned,
      outfit: wearable(owned, h.outfit),
      spent: Math.max(0, h.spent - PRICES[rarity]),
    },
  };
}

/** Developer only: step the room back and hand the stars back. */
export function refundRoom(h: Held): Bought {
  if (h.room <= 0) return { ok: false, error: 'the room is bare already' };
  return {
    ok: true,
    held: {
      ...h,
      room: h.room - 1,
      spent: Math.max(0, h.spent - ROOM_STEPS[h.room - 1].price),
    },
  };
}

/** Changing clothes. Wearing what is not owned is not refused, it is trimmed. */
export function wear(h: Held, outfit: Outfit): Held {
  return { ...h, outfit: wearable(h.owned, outfit) };
}

/* ----------------------------------------------------------- the migration */

/**
 * A save made before any of this existed, taken at its word — once.
 *
 * This is the single place a client is believed about what it owns, and it has
 * to be. There are players with a room half finished and a wardrobe half
 * bought, every bit of it in a `localStorage` this server has never seen, and
 * throwing that away to make a point about trust would be throwing away the
 * thing the change is for. So the door stands open exactly as long as the
 * server has nothing of its own for this player (`untouched`), and the first
 * save with anything in it shuts it.
 *
 * The arithmetic is chosen so that nobody can come out behind. `spent` is set
 * to what the claimed room and wardrobe would have cost, and `granted` tops the
 * balance up to what the browser said was in hand — so a player keeps their
 * stars AND their purchases. A player whose save was lost but whose matches the
 * board remembers claims nothing, and gets their earned stars back as a balance
 * instead: the door does not shut on an empty claim, so their real save can
 * still walk in from another phone afterwards.
 */
export function claimInto(h: Held, earned: number, claim: Claim): Held {
  const owned = mergeTops(h.owned, claim.owned);
  const room = Math.max(h.room, claim.room);
  const spent = priceOf(owned, room);
  return {
    room,
    owned,
    outfit: wearable(owned, claim.outfit),
    spent,
    granted: Math.max(0, claim.stars + spent - earned),
  };
}

/* ------------------------------------------------------------------ storage */

/**
 * The developer, as the SERVER can tell: the signed id out of Telegram against
 * `ADMIN_ID` in `wrangler.toml`. `src/ui/admin.ts` says in as many words that
 * its own check is not a security boundary and cannot be one, because it reads
 * an unsigned field in a bundle anybody can open. This one is — free purchases
 * and refunds are granted, or not, on this side of the wire.
 */
export const isAdmin = (env: Env, id: string): boolean =>
  Boolean(env.ADMIN_ID) && id === env.ADMIN_ID;

interface StoredRow {
  room: number;
  owned: string;
  outfit: string;
  spent: number;
  granted: number;
}

const parse = (raw: string): Tops => {
  try {
    return cleanTops(JSON.parse(raw));
  } catch {
    return {};
  }
};

export async function earnedBy(env: Env, id: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT stars FROM players WHERE id = ?1`)
    .bind(id)
    .first<{ stars: number }>();
  return row?.stars ?? 0;
}

export async function load(env: Env, id: string): Promise<Held | null> {
  const row = await env.DB.prepare(
    `SELECT room, owned, outfit, spent, granted FROM profiles WHERE id = ?1`,
  )
    .bind(id)
    .first<StoredRow>();
  if (!row) return null;
  const owned = parse(row.owned);
  return {
    room: Math.min(ROOM_DONE, Math.max(0, row.room)),
    owned,
    outfit: wearable(owned, cleanOutfit(parse(row.outfit))),
    spent: Math.max(0, row.spent),
    granted: Math.max(0, row.granted),
  };
}

export async function save(env: Env, id: string, h: Held): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO profiles (id, room, owned, outfit, spent, granted, first_seen, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT (id) DO UPDATE SET
          room       = ?2,
          owned      = ?3,
          outfit     = ?4,
          spent      = ?5,
          granted    = ?6,
          updated_at = ?7`,
  )
    .bind(id, h.room, JSON.stringify(h.owned), JSON.stringify(h.outfit), h.spent, h.granted, now)
    .run();
}

/**
 * The profile as it stands: opening a row for a player who has never had one,
 * and folding in the browser's old save when there is one and the door is still
 * open. Every route that reads or changes anything starts here.
 */
export async function open(env: Env, caller: Caller, claim: Claim | null): Promise<Held> {
  const stored = await load(env, caller.id);
  let held = stored ?? EMPTY;
  if (claim && untouched(held)) {
    held = claimInto(held, await earnedBy(env, caller.id), claim);
    await save(env, caller.id, held);
  } else if (!stored) {
    await save(env, caller.id, held);
  }
  return held;
}

/**
 * What this player is actually wearing, for the duel object to dress them in.
 * `null` when there is no row at all, which is the one case where a duellist's
 * own word for it is still worth taking (see `worker/src/duel.ts`).
 */
export async function outfitOf(env: Env, id: string): Promise<Outfit | null> {
  const held = await load(env, id);
  return held ? held.outfit : null;
}
