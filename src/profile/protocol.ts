/**
 * The wire for what a player owns: the room behind the menu, the clothes on
 * the trader, and the coins still in hand.
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
 * The ladder is here too, and it was the last thing that was not. It gates
 * which leagues are open and what a match pays, so losing it to a new phone
 * cost more than losing a hat did — and half of it was on the server already
 * (`players.top_league`, which is what a duel pays each side by), so the split
 * had stopped making sense. Wins are counted by the server as matches are
 * handed in, the same way coins are, rather than being something the client
 * banks and reports.
 *
 * The portfolio is here for the same reason the coins are, and more so: shares
 * are bought with a balance the server keeps, at a price the server decides
 * (`src/market/protocol.ts`), so a book the browser owned would be a book the
 * browser could write.
 *
 * What is deliberately NOT here: the company archive, the board preferences,
 * the language, and which league was played last. None of them is progress —
 * they are conveniences, and they are allowed to differ between two phones.
 */

import { cleanAwards } from '../awards/catalogue';
import { cleanDaily, type Daily } from '../daily/protocol';
import { cleanPortfolio, type Portfolio } from '../market/protocol';
import { COMPANIES } from '../sim/companies';
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

/**
 * Wins banked in each league, lowest first — the ladder, and the only thing on
 * a profile the player does not buy.
 *
 * How long the array is depends on who is asking, which is why every function
 * that touches one is told: the game reads `LEAGUE_COUNT` off its own ladder,
 * and the Worker reads it off `REWARDS`, its deliberate copy of the reward
 * tables. Neither has to import the other's.
 */
export type Wins = number[];

/** Everything the server keeps for one player, as the browser receives it. */
export interface Profile {
  /**
   * Coins in hand: earned + granted − spent, all three of them the server's.
   *
   * The database column behind it is still called `stars`, and so is the field
   * `stars` the server keeps emitting beside this one — see `cleanProfile`.
   * The rename is a rename of the GAME's vocabulary, because Telegram sells a
   * currency called Stars and the shop must not look like it charges those.
   * What a column is called is not something a player can see, and renaming it
   * would be a migration bought with nothing.
   */
  coins: number;
  /**
   * @deprecated The same number under its old name, sent by the server for one
   * release so that a browser holding a bundle from before the rename keeps
   * working whichever side is deployed first. Nothing reads it but
   * `cleanProfile`, and it goes as soon as every deployment has turned over.
   */
  stars?: number;
  /** coins EARNED, which is what the board ranks on and what spending never touches */
  earned: number;
  spent: number;
  /**
   * The hard currency, paid by the daily bonus and spent at the share counter.
   * One number rather than the three above, because unlike coins it is nobody's
   * ranking: see `src/daily/protocol.ts`.
   */
  dollars: number;
  /** shares held, by company — what the dollars were spent on */
  portfolio: Portfolio;
  /** the bonus and the quests as they stand TODAY — already rolled over */
  daily: Daily;
  /** renovation steps finished, 0..ROOM_DONE */
  room: number;
  owned: Tops;
  outfit: Outfit;
  wins: Wins;
  /** the shelf: award id to when it was earned. See `src/awards/catalogue.ts`. */
  awards: Record<string, number>;
  duelWins: number;
  streak: number;
  /** companies met, which the archive tab draws */
  seen: string[];
  /** best match ever and highest league played, off the board's own row */
  bestNetWorth: number;
  topLeague: number;
}

/**
 * What a browser is holding the first time it meets the server — a save made
 * before any of this existed. See `worker/src/profile.ts` for when it is
 * believed, which is once and only while the server has nothing of its own.
 */
export interface Claim {
  coins: number;
  room: number;
  owned: Tops;
  outfit: Outfit;
  wins: Wins;
  /**
   * The archive. Unlike the shelf, which the server works out for itself, which
   * companies somebody has met cannot be recovered from anything it kept — so
   * this rides in with the room and the wardrobe.
   */
  seen: string[];
}

/**
 * A fat-finger guard on the claim, not a security boundary — the claim is
 * believed or it is not, and that decision is made elsewhere. The whole
 * wardrobe plus the whole room is 8750 coins at today's prices, so nothing
 * legitimate is within an order of magnitude of this.
 */
export const MAX_CLAIM_COINS = 100_000;

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

/** A whole number of coins, never negative. */
export function cleanCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** The same, but capped: only a claim is ever read through this one. */
export const cleanClaimedCoins = (raw: unknown): number =>
  Math.min(MAX_CLAIM_COINS, cleanCount(raw));

/**
 * A ladder off the wire: `count` numbers, none of them negative, padded and cut
 * to whatever length the reader's own ladder is. A save made under a shorter
 * ladder keeps what it has and gains zeroes.
 */
export function cleanWins(raw: unknown, count: number): Wins {
  const src = Array.isArray(raw) ? raw : [];
  const out: Wins = [];
  for (let i = 0; i < count; i++) out.push(cleanCount(src[i]));
  return out;
}

/** The better of two ladders, rung by rung. */
export const mergeWins = (a: Wins, b: Wins): Wins =>
  a.map((n, i) => Math.max(n, b[i] ?? 0));

/** A list of company ids off the wire, cut to the ones this build knows. */
export function cleanSeen(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(COMPANIES.map((c) => c.id));
  const out = new Set<string>();
  for (const id of raw) if (typeof id === 'string' && known.has(id)) out.add(id);
  return [...out];
}

export function cleanClaim(raw: unknown, leagues: number): Claim {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const owned = cleanTops(src.owned);
  return {
    // `coins` from a client that has been renamed, `stars` from one that has
    // not yet loaded the new bundle. Both are read for a release or two; see
    // `cleanProfile` for the same seam pointing the other way.
    coins: cleanClaimedCoins(src.coins ?? src.stars),
    room: cleanRoom(src.room),
    owned,
    outfit: wearable(owned, cleanOutfit(src.outfit)),
    wins: cleanWins(src.wins, leagues),
    seen: cleanSeen(src.seen),
  };
}

/** Nothing bought, nothing won, no coins: a claim with nothing in it to keep. */
export const emptyClaim = (c: Claim): boolean =>
  c.coins === 0 &&
  c.room === 0 &&
  Object.keys(c.owned).length === 0 &&
  c.wins.every((n) => n === 0) &&
  c.seen.length === 0;

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
export function cleanProfile(raw: unknown, leagues: number): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  // A server that has not been redeployed yet still calls this `stars`. Read
  // both, prefer the new name, and drop the old one once every deployment has
  // turned over — without this the first client to ship ahead of the Worker
  // would read no balance at all and fall back to `localStorage` for everyone.
  const balance = src.coins ?? src.stars;
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;
  const owned = cleanTops(src.owned);
  return {
    coins: Math.max(0, Math.floor(balance)),
    earned: cleanCount(src.earned),
    spent: cleanCount(src.spent),
    room: cleanRoom(src.room),
    owned,
    outfit: wearable(owned, cleanOutfit(src.outfit)),
    wins: cleanWins(src.wins, leagues),
    awards: cleanAwards(src.awards),
    dollars: cleanCount(src.dollars),
    portfolio: cleanPortfolio(src.portfolio),
    // The server rolls the day over before it answers, so this is today's by
    // the time it gets here. `DailyScreen` rolls it again anyway, for the game
    // left open across midnight.
    daily: cleanDaily(src.daily),
    duelWins: cleanCount(src.duelWins),
    streak: cleanCount(src.streak),
    seen: cleanSeen(src.seen),
    bestNetWorth: cleanCount(src.bestNetWorth),
    topLeague: cleanCount(src.topLeague),
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
