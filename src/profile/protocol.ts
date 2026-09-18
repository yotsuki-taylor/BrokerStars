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

import { ALLOWED, banned, squash } from '../corp/protocol';


import { cleanAwards } from '../awards/catalogue';
import { cleanDaily, type Daily } from '../daily/protocol';
import { cleanPortfolio, type Portfolio } from '../market/protocol';
import { COMPANIES } from '../sim/companies';
import { ROOM_DONE } from '../ui/renovation';
import { cleanOffer, type Offer } from '../shop/protocol';
import {
  ALL_ITEMS,
  RARITIES,
  SLOTS,
  itemId,
  rankOf,
  type Outfit,
  type Rarity,
  type Slot,
} from '../ui/wardrobe';

/**
 * What a wardrobe is, at rest: the ids of the garments owned, in no order.
 *
 * It used to be one rarity per slot, because a slot was climbed in order and a
 * player's holdings in it were therefore a prefix of RARITIES — the top rung
 * described the whole thing. The shop sells any garment on today's shelf to
 * anybody who can pay for it (`src/shop/protocol.ts`), so a wardrobe is now any
 * subset of the twenty-five, holes and all, and only the list says which.
 *
 * `cleanOwned` still reads the old shape off the wire and off the database, and
 * will for as long as there are rows written before this changed.
 */
export type Owned = string[];

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
  owned: Owned;
  outfit: Outfit;
  /** the five garments on sale today, and the day they were drawn for */
  offer: Offer;
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
  /**
   * The name this player chose for themselves, or null for one they were given.
   *
   * The client draws names from the host — Telegram's first name, Google's
   * display name, GUEST 4F2A — and the host has never heard of a name typed
   * into this game. So the server says, and `ui/nick.ts` keeps the answer for
   * the frame before the next one arrives.
   */
  nick?: string | null;
}

/**
 * What a browser is holding the first time it meets the server — a save made
 * before any of this existed. See `worker/src/profile.ts` for when it is
 * believed, which is once and only while the server has nothing of its own.
 */
export interface Claim {
  coins: number;
  room: number;
  owned: Owned;
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

const KNOWN_ITEMS = new Set(ALL_ITEMS.map((it) => it.id));

/**
 * A wardrobe off the wire, or out of the database: garment ids this build
 * knows, deduplicated, in a stable order.
 *
 * TWO SHAPES ARE READ, and the second one is history. Every row written before
 * the shop stopped being a ladder holds `{"hat":"rare"}` — the top rung of each
 * slot — and back then that meant the rungs under it had been paid for too. So
 * an object is expanded into the whole prefix it stood for, which is what the
 * player actually owned. An array is the shape written today and is taken as it
 * comes. Nothing has to be migrated in the database: the next write puts the
 * row into the new shape, and until then it reads correctly either way.
 */
export function cleanOwned(raw: unknown): Owned {
  const out = new Set<string>();
  if (Array.isArray(raw)) {
    for (const id of raw) if (typeof id === 'string' && KNOWN_ITEMS.has(id)) out.add(id);
  } else if (raw && typeof raw === 'object') {
    const src = raw as Record<string, unknown>;
    for (const slot of SLOTS) {
      const top = src[slot];
      if (typeof top !== 'string' || !(RARITIES as readonly string[]).includes(top)) continue;
      for (let i = 0; i <= rankOf(top as Rarity); i++) out.add(itemId(slot, RARITIES[i]));
    }
  }
  return [...out];
}

/**
 * An outfit is still one rarity per slot — you wear one hat — so it keeps the
 * shape the wardrobe used to share with it, and is cleaned on its own.
 */
export function cleanOutfit(raw: unknown): Outfit {
  const out: Outfit = {};
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
  const owned = cleanOwned(src.owned);
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
  c.owned.length === 0 &&
  c.wins.every((n) => n === 0) &&
  c.seen.length === 0;

/**
 * You cannot wear what you do not own. That is now the whole of the rule: it
 * used to also trim a worn rarity down to the top one owned, because a hole in
 * a slot was impossible and anything above the top was a lie. Holes are the
 * normal case now — a player may own the legend hat and nothing else on their
 * head — so a garment is either in the wardrobe or it is not.
 */
export function wearable(owned: Owned, outfit: Outfit): Outfit {
  const has = new Set(owned);
  const out: Outfit = {};
  for (const slot of SLOTS) {
    const worn = outfit[slot];
    if (worn && has.has(itemId(slot, worn))) out[slot] = worn;
  }
  return out;
}

/** The best garment owned in a slot, or null — the fallback after a refund. */
export function topOf(owned: Owned, slot: Slot): Rarity | null {
  const has = new Set(owned);
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (has.has(itemId(slot, RARITIES[i]))) return RARITIES[i];
  }
  return null;
}

/** Everything in either wardrobe: two devices' worth of shopping, kept whole. */
export const mergeOwned = (a: Owned, b: Owned): Owned => [...new Set([...a, ...b])];

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
  const owned = cleanOwned(src.owned);
  return {
    coins: Math.max(0, Math.floor(balance)),
    earned: cleanCount(src.earned),
    spent: cleanCount(src.spent),
    room: cleanRoom(src.room),
    owned,
    outfit: wearable(owned, cleanOutfit(src.outfit)),
    offer: cleanOffer(src.offer),
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
    // Through the same rules it was stored by, so a row edited in the database
    // by hand cannot put an unsayable name on a leaderboard.
    nick: cleanNick(src.nick),
  };
}

/* --------------------------------------------- the browser's own shape */

/**
 * The game keeps a wardrobe as a Set of garment ids, because that is what the
 * shop asks it (`owned.has(itemId(slot, rarity))`). The wire carries the same
 * thing as an array, so these two are only the conversion — they used to be the
 * place a set was flattened to one rung per slot and blown back up again, and
 * the rounding that went on in there is now `cleanOwned`'s business.
 */
export const listOf = (owned: Set<string>): Owned => [...owned];

export const setOf = (owned: Owned): Set<string> => new Set(owned);

/* ------------------------------------------------------ a name of one's own */

/**
 * What a player may call themselves, agreed on by both ends.
 *
 * WHY THIS EXISTS AT ALL. Until now the name on a leaderboard row was whatever
 * the host said: a Telegram first name, a Google display name, or GUEST 4F2A.
 * None of those is a choice, one of them is somebody's real name, and the row
 * they sit on is public and kept.
 *
 * THE RULES ARE A CORPORATION'S RULES, and they are imported rather than
 * copied. A name typed by a person and shown to strangers is the same problem
 * whether it is over a company or over a player: the same alphabet, so nothing
 * can be spelled in a script the next player cannot read; the same short word
 * list, checked with the spaces taken out so `F U C K` is the same word; and no
 * moderation beyond that, for the reasons already written down in the README.
 *
 * The lengths are this file's own, and the floor is lower: a corporation is a
 * group and can be asked for three characters, while people are called things
 * like JO.
 */
export const NICK_MIN = 2;
export const NICK_MAX = 16;

/**
 * How often a player may change it. A week, which is the corporation's own
 * interval — a name other people learn should outlast the afternoon somebody
 * felt like being called something else.
 */
export const RENAME_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A nickname as it can be stored, or null for one that cannot.
 *
 * Null rather than a tidied-up version, for the reason `cleanName` gives: being
 * quietly renamed to something you did not type is worse than being told no.
 */
export function cleanNick(raw: unknown): string | null {
  const s = squash(raw);
  if (s.length < NICK_MIN || s.length > NICK_MAX) return null;
  // `ALLOWED` is the corporation's alphabet and carries its own rule about a
  // name made of nothing but punctuation; `cleanName` applies both and so does
  // this, which is the point of importing rather than copying.
  if (!ALLOWED.test(s) || !/[A-Z0-9А-ЯЁ]/.test(s)) return null;
  if (banned(s)) return null;
  return s;
}

/**
 * The form uniqueness is decided on: the name with its spaces taken out.
 *
 * `keyOf` for corporations does exactly this and is not imported, because the
 * two are equal by coincidence rather than by rule — a corporation could grow a
 * different key tomorrow without a player's name having to follow it.
 */
export const nickKey = (nick: string): string => nick.replace(/ /g, '');

/** Everything that can go wrong, in the one word the screen looks up. */
export type NickError = 'badname' | 'taken' | 'renamed' | 'busy';
