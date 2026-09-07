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
  cleanWins,
  mergeTops,
  mergeWins,
  nextRung,
  rankOf,
  rungBelow,
  wearable,
  type Claim,
  type Profile,
  type Tops,
  type Wins,
} from '../../src/profile/protocol';
import { REWARDS, type Env } from './results';
import type { Caller } from './telegram';

/**
 * How many rungs the ladder has, as this side counts them. `REWARDS` is already
 * the Worker's own copy of the reward tables — one table per league — so there
 * is no second number to keep in step.
 */
export const LEAGUES = REWARDS.length;

/** The row, unpacked. Every rule below works on one of these and returns another. */
export interface Held {
  room: number;
  owned: Tops;
  outfit: Outfit;
  /** stars handed over the counter, ever */
  spent: number;
  /** stars from somewhere other than a match: the migration, and free purchases */
  granted: number;
  /** wins banked in each league, lowest first */
  wins: Wins;
}

export const EMPTY: Held = {
  room: 0,
  owned: {},
  outfit: {},
  spent: 0,
  granted: 0,
  wins: cleanWins([], LEAGUES),
};

/**
 * Has the server anything of its own for this player yet? While it has not, the
 * browser's old save is still believed — see `claimInto`. The moment it has,
 * that stops for good.
 */
export const untouched = (h: Held): boolean =>
  h.room === 0 &&
  h.spent === 0 &&
  h.granted === 0 &&
  Object.keys(h.owned).length === 0 &&
  h.wins.every((n) => n === 0);

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
  wins: h.wins,
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

/* -------------------------------------------------------------- the ladder */

/**
 * One more win in one league, which is how the ladder is climbed.
 *
 * Counted here rather than reported by the client, for the reason the stars
 * are: a league that opens because a browser said so is not a league that was
 * earned. The caller is `/result`, once per match actually recorded — a
 * re-sent submission never reaches this far, because the token is recognised
 * first.
 *
 * A duel does not come this way at all. The ladder is climbed against the bots
 * on purpose: a friend willing to lose ten times is a lift, not a climb.
 */
export function bankWin(h: Held, league: number): Held {
  if (!Number.isInteger(league) || league < 0 || league >= h.wins.length) return h;
  const wins = h.wins.slice();
  wins[league] += 1;
  return { ...h, wins };
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
    // The ladder is the one thing here the server would otherwise have no way
    // of reconstructing: it starts counting wins today, and everything climbed
    // before that only exists in the save being handed over.
    wins: mergeWins(h.wins, claim.wins),
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
  wins: string;
  spent: number;
  granted: number;
  updated_at: number;
}

/** The row and the version it was read at. Every write names one — see `write`. */
export interface Stored {
  held: Held;
  version: number;
}

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export async function earnedBy(env: Env, id: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT stars FROM players WHERE id = ?1`)
    .bind(id)
    .first<{ stars: number }>();
  return row?.stars ?? 0;
}

export async function read(env: Env, id: string): Promise<Stored | null> {
  const row = await env.DB.prepare(
    `SELECT room, owned, outfit, wins, spent, granted, updated_at
       FROM profiles WHERE id = ?1`,
  )
    .bind(id)
    .first<StoredRow>();
  if (!row) return null;
  const owned = cleanTops(parse(row.owned));
  return {
    version: row.updated_at,
    held: {
      room: Math.min(ROOM_DONE, Math.max(0, row.room)),
      owned,
      outfit: wearable(owned, cleanOutfit(parse(row.outfit))),
      spent: Math.max(0, row.spent),
      granted: Math.max(0, row.granted),
      wins: cleanWins(parse(row.wins), LEAGUES),
    },
  };
}

/**
 * Write the row back, but only if nobody has written it since it was read.
 *
 * Everything above is read-modify-write over a whole row, and without this the
 * two halves of that could interleave: a purchase and a change of clothes fired
 * a moment apart — which is what a slow connection makes of two taps — would
 * both read the same row, and whichever landed second would put the other's
 * back. The purchase would come out looking like it never happened.
 *
 * So `updated_at` is the version as well as the timestamp, and it is what the
 * WHERE clause matches on. `MAX(updated_at + 1, now)` keeps it climbing even
 * for two writes inside one millisecond, so no version can ever be reused.
 * False means the row moved; the caller reads it again and redoes the change
 * against what is actually there (`change` below).
 */
export async function write(
  env: Env,
  id: string,
  h: Held,
  /** the version this change was worked out from, or null for a row that had none */
  version: number | null,
): Promise<boolean> {
  const now = Date.now();
  const owned = JSON.stringify(h.owned);
  const outfit = JSON.stringify(h.outfit);
  const wins = JSON.stringify(h.wins);

  const res =
    version === null
      ? // A row that was not there. If one appeared in the meantime this does
        // nothing, and the caller starts again knowing about it.
        await env.DB.prepare(
          `INSERT INTO profiles (id, room, owned, outfit, wins, spent, granted,
                                 first_seen, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
           ON CONFLICT (id) DO NOTHING`,
        )
          .bind(id, h.room, owned, outfit, wins, h.spent, h.granted, now)
          .run()
      : await env.DB.prepare(
          `UPDATE profiles
              SET room       = ?2,
                  owned      = ?3,
                  outfit     = ?4,
                  wins       = ?5,
                  spent      = ?6,
                  granted    = ?7,
                  updated_at = MAX(updated_at + 1, ?8)
            WHERE id = ?1 AND updated_at = ?9`,
        )
          .bind(id, h.room, owned, outfit, wins, h.spent, h.granted, now, version)
          .run();

  return (res.meta?.changes ?? 0) > 0;
}

/**
 * How many times a change may be worked out again after losing the race. Two
 * requests from one player is already the unusual case and a third is not a
 * thing a pair of thumbs can do; this is a guard against spinning, not a queue.
 */
const ATTEMPTS = 4;

/** What a route answers with: the state to show, and why nothing changed if so. */
export interface Applied {
  held: Held;
  earned: number;
  error?: string;
}

/** A change, worked out against the row as it stands at the moment it is read. */
export type Change = (h: Held, earned: number) => Bought;

/**
 * Read, change, write — and if the row moved underneath, read it again and work
 * the change out afresh rather than writing a decision made about the past.
 *
 * The refusals come back rather than throwing: "not the next rung" is an answer
 * about a real profile and the caller sends that profile back with it.
 */
export async function change(env: Env, caller: Caller, apply: Change): Promise<Applied> {
  let last: Applied | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const earned = await earnedBy(env, caller.id);
    const stored = await read(env, caller.id);
    const held = stored?.held ?? EMPTY;

    const out = apply(held, earned);
    if (!out.ok) return { held, earned, error: out.error };

    if (await write(env, caller.id, out.held, stored?.version ?? null)) {
      return { held: out.held, earned };
    }
    last = { held, earned };
  }
  // Four collisions in a row is not a thing that happens to one player; if it
  // somehow does, the honest answer is the profile as last seen, and the client
  // redraws to that and can try again.
  return { ...(last as Applied), error: 'busy' };
}

/**
 * The profile as it stands: opening a row for a player who has never had one,
 * and folding in the browser's old save when there is one and the door is still
 * open. Every session starts here.
 */
export async function open(env: Env, caller: Caller, claim: Claim | null): Promise<Applied> {
  return change(env, caller, (held, earned) => ({
    ok: true,
    held: claim && untouched(held) ? claimInto(held, earned, claim) : held,
  }));
}

/**
 * What this player is actually wearing, for the duel object to dress them in.
 * `null` when there is no row at all, which is the one case where a duellist's
 * own word for it is still worth taking (see `worker/src/duel.ts`).
 */
export async function outfitOf(env: Env, id: string): Promise<Outfit | null> {
  const stored = await read(env, id);
  return stored ? stored.held.outfit : null;
}
