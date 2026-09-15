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
  ALL_ITEMS,
  PRICES,
  RARITIES,
  SLOTS,
  itemId,
  type Outfit,
  type Rarity,
  type Slot,
} from '../../src/ui/wardrobe';
import {
  NO_OFFER,
  cleanOffer,
  onOffer,
  rollOffer,
  rolledOffer,
  type Offer,
} from '../../src/shop/protocol';
import {
  DAILY_BONUS,
  EMPTY_DAILY,
  cleanDaily,
  countMatch,
  dayOf,
  questDone,
  questsToday,
  rolled,
  type Daily,
} from '../../src/daily/protocol';
import {
  buyShares,
  cleanPortfolio,
  priceOn,
  sellShares,
  type Portfolio,
} from '../../src/market/protocol';
import { companyById } from '../../src/sim/companies';
import {
  cleanOutfit,
  cleanOwned,
  cleanWins,
  mergeOwned,
  mergeWins,
  setOf,
  topOf,
  wearable,
  type Claim,
  type Owned,
  type Profile,
  type Wins,
} from '../../src/profile/protocol';
import { REWARDS, type Env } from './results';
import {
  afterChange,
  afterMatch,
  cleanSeen,
  cleanShelf,
  withSeen,
  type MatchFacts,
  type Standing,
} from './awards';
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
  owned: Owned;
  outfit: Outfit;
  /** the garments on sale today, for the day named inside it — see `withToday` */
  offer: Offer;
  /** coins handed over the counter, ever */
  spent: number;
  /** coins from somewhere other than a match: the migration, and free purchases */
  granted: number;
  /** wins banked in each league, lowest first */
  wins: Wins;
  /** what is on the shelf, and when it went there — see `awards.ts` */
  awards: Record<string, number>;
  /** duels won, ever. A counter rather than a scan of `results`. */
  duelWins: number;
  /** matches won in a row right now, zero the moment one is not won */
  streak: number;
  /** companies this player has met, which used to live in the browser */
  seen: string[];
  /**
   * The hard currency. A balance rather than the earned/spent pair the coins
   * are, because nothing ranks on it: see `src/daily/protocol.ts`.
   */
  dollars: number;
  /** shares held, by company — what the dollars are spent on */
  portfolio: Portfolio;
  /** the bonus and the quests, for the day named inside it */
  daily: Daily;
}

export const EMPTY: Held = {
  room: 0,
  owned: [],
  outfit: {},
  offer: NO_OFFER,
  spent: 0,
  granted: 0,
  wins: cleanWins([], LEAGUES),
  awards: {},
  duelWins: 0,
  streak: 0,
  seen: [],
  dollars: 0,
  portfolio: {},
  daily: EMPTY_DAILY,
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
  h.owned.length === 0 &&
  h.wins.every((n) => n === 0) &&
  h.seen.length === 0 &&
  h.dollars === 0 &&
  Object.keys(h.portfolio).length === 0 &&
  Object.keys(h.awards).length === 0;

/**
 * Coins in hand. Never stored, always worked out: `players.stars` is the
 * board's own running total of what was EARNED and spending must not touch it,
 * so the balance is the three numbers subtracted at the moment somebody asks.
 * Two columns that could drift apart would be one column too many.
 */
export const balance = (h: Held, earned: number): number =>
  Math.max(0, earned + h.granted - h.spent);

/**
 * The profile as the browser receives it. `bestNetWorth` and `topLeague` come
 * off the `players` row rather than out of here: the shelf screen draws
 * progress towards the money and ladder awards, and those two numbers are what
 * the judge measured them against.
 */
export const view = (h: Held, earned: number, at: Standing): Profile => ({
  coins: balance(h, earned),
  // The old name, alongside the new one, for as long as there may be a browser
  // out there holding a bundle from before the rename. A client that has been
  // updated reads `coins` and ignores this; one that has not reads this and
  // never notices. Drop it once every deployment has turned over — the reader
  // on the other side is `cleanProfile` in `src/profile/protocol.ts`.
  stars: balance(h, earned),
  earned,
  spent: h.spent,
  room: h.room,
  owned: h.owned,
  outfit: h.outfit,
  // Already today's, like `daily` below and for the same reason: `change` rolls
  // the shelf before anything is decided against it or drawn from it.
  offer: h.offer,
  wins: h.wins,
  awards: h.awards,
  duelWins: h.duelWins,
  streak: h.streak,
  seen: h.seen,
  dollars: h.dollars,
  portfolio: h.portfolio,
  // Already today's: `change` rolls the day before it hands the row to
  // anything, so nothing that reaches here can answer about yesterday.
  daily: h.daily,
  bestNetWorth: at.bestNetWorth,
  topLeague: at.topLeague,
});

/** What one garment costs, by its id — the wardrobe is a list of those now. */
const PRICE_BY_ID = new Map(ALL_ITEMS.map((it) => [it.id, PRICES[it.rarity]]));

/**
 * What this wardrobe and this much room would have cost, at today's prices.
 *
 * One garment, one price. It used to have to walk down a slot's ladder adding
 * up the rungs under the top one, because owning the top meant having bought
 * them all; now nothing is implied by anything else and the wardrobe is
 * simply the list.
 */
export function priceOf(owned: Owned, room: number): number {
  let sum = 0;
  for (const id of owned) sum += PRICE_BY_ID.get(id) ?? 0;
  for (let i = 0; i < Math.min(room, ROOM_DONE); i++) sum += ROOM_STEPS[i].price;
  return sum;
}

/* ------------------------------------------------------------- the counter */

/** A purchase either happened or it did not, and the caller is told which. */
export type Bought = { ok: true; held: Held } | { ok: false; error: string };

/**
 * One garment off today's shelf.
 *
 * THE SHELF IS THE WHOLE GATE NOW. There used to be a ladder — a slot could buy
 * exactly one rarity next, and anything else was 'not the next rung'. Nothing
 * is climbed any more, so the only two questions are whether the garment is on
 * sale today and whether it has already been bought. Both are asked here rather
 * than trusted from the body, and for the same reason the price is: a client
 * that names a garment the shop is not showing is a client that has been
 * edited, or one whose idea of the day is stale.
 *
 * The shelf it is checked against is TODAY'S, and that is not this function's
 * doing: `change` puts every row through `withToday` before anything decides
 * anything about it, so a row that reaches here with yesterday's shelf on it
 * cannot exist. The player who left the app open across midnight taps a garment
 * that is no longer on sale, is refused, and gets today's shelf back with the
 * refusal.
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
  const id = itemId(slot, rarity);
  if (h.owned.includes(id)) return { ok: false, error: 'already owned' };
  if (!onOffer(h.offer, id)) return { ok: false, error: 'not on sale today' };
  const price = free ? 0 : PRICES[rarity];
  if (balance(h, earned) < price) return { ok: false, error: 'not enough coins' };
  return {
    ok: true,
    held: {
      ...h,
      owned: [...h.owned, id],
      outfit: { ...h.outfit, [slot]: rarity },
      spent: h.spent + price,
    },
  };
}

/** The next renovation step, which is the only one on offer. */
export function buyRoom(h: Held, earned: number, free: boolean): Bought {
  if (h.room >= ROOM_DONE) return { ok: false, error: 'the room is finished' };
  const price = free ? 0 : ROOM_STEPS[h.room].price;
  if (balance(h, earned) < price) return { ok: false, error: 'not enough coins' };
  return { ok: true, held: { ...h, room: h.room + 1, spent: h.spent + price } };
}

/**
 * Developer only: hand one garment back and refund it. Any of them — the rule
 * used to be "only the top one", so that a slot's ladder never ended up with a
 * hole in it that nothing could fill, and holes are the normal case now.
 *
 * If the garment was on the trader it comes off with the refund, and the best
 * of what is left in that slot goes on in its place — a dev handing back the
 * stetson should end up in the bandana, not bare-headed.
 *
 * `spent` is floored at zero because a garment bought in free mode cost
 * nothing, and refunding it would otherwise mint coins. The game's own dev
 * panel has always had that asymmetry; the floor is what stops it compounding.
 */
export function refundItem(h: Held, slot: Slot, rarity: Rarity): Bought {
  const id = itemId(slot, rarity);
  if (!h.owned.includes(id)) return { ok: false, error: 'does not own it' };
  const owned = h.owned.filter((x) => x !== id);
  const outfit = wearable(owned, h.outfit);
  const fallback = h.outfit[slot] === rarity ? topOf(owned, slot) : null;
  return {
    ok: true,
    held: {
      ...h,
      owned,
      outfit: fallback ? { ...outfit, [slot]: fallback } : outfit,
      spent: Math.max(0, h.spent - PRICES[rarity]),
    },
  };
}

/** Developer only: step the room back and hand the coins back. */
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

/* ----------------------------------------------------------------- the day */

/**
 * Today's bonus, and the only thing in the game that pays for turning up.
 *
 * Which day it is is decided HERE, off this server's clock, for the reason the
 * payout of a match is: a browser that says it is tomorrow is a browser that
 * says it is owed another thousand. The day the row is holding was already
 * rolled forward on the way out of the database (`read`), so this only has to
 * ask whether today's has gone.
 *
 * A second tap is refused rather than rounded, and the refusal comes back with
 * the profile as it really stands — so a client that drew the thousand
 * optimistically and was wrong redraws to the truth. There is no token here and
 * none is needed: unlike handing a match in, the operation is naturally
 * idempotent, because the second attempt finds `bonus` already set.
 */
/**
 * The row with today's day on it, rolling yesterday's away if that is what it
 * is holding.
 *
 * This is the one place the rollover happens, and it is in `change` rather than
 * in `read` for a reason worth writing down: a player who has never had a row
 * does not come through `read` at all, they come through `EMPTY` — and `EMPTY`
 * carries a day that is no day. Rolling on the way out of the database would
 * leave exactly the newest player looking at a profile whose day is `NO_DAY`.
 *
 * Nothing has to be cleared on a schedule and nothing sweeps the table: a day
 * simply stops matching and everything under it is dropped the next time the
 * row is touched. A player who does not open the game for a month costs nothing
 * to keep.
 *
 * The same object comes back when the day has not moved, so the common case
 * allocates nothing.
 */
export function withToday(h: Held, now: number): Held {
  const daily = rolled(h.daily, now);
  // The shelf rolls on the same clock and in the same place, and it is drawn
  // from the wardrobe as it stands at that moment — so a garment bought
  // yesterday is never offered again today. Buying does NOT redraw it: once
  // today's day is on it, this hands the same object back untouched, which is
  // what keeps a five-garment shelf from growing a sixth the moment one is sold
  // (`src/shop/protocol.ts`).
  const offer = rolledOffer(h.offer, setOf(h.owned), now);
  return daily === h.daily && offer === h.offer ? h : { ...h, daily, offer };
}

export function claimBonus(h: Held, now: number): Bought {
  const daily = rolled(h.daily, now);
  if (daily.bonus) return { ok: false, error: 'the bonus is taken today' };
  return {
    ok: true,
    held: { ...h, dollars: h.dollars + DAILY_BONUS, daily: { ...daily, bonus: true } },
  };
}

/**
 * A finished quest, cashed in for its coins.
 *
 * WHY `granted` AND NOT THE BOARD. `players.stars` — the column kept its old
 * name — is what the leaderboard
 * ranks on, and it is a running total of what matches paid. A quest reward is
 * not that. Two players with identical match records should not be separated in
 * the table by which of them remembered to tap a button — the board is a
 * ranking of how well people play, and a daily is a reward for doing the
 * rounds. So the coins land in `granted`, which is where every coin that did
 * not come out of a match already goes, and they are spendable in the shop
 * exactly like any other. It keeps `players.stars` a pure sum of the `results`
 * table as well, which is what the replay check will one day want to verify
 * against.
 *
 * Three refusals, all of them checked here rather than trusted from the body:
 * a quest today was not dealt, a quest that is not finished, and one that has
 * been collected already. `taken` is what makes the last of those safe to
 * retry — a second attempt finds the id in the list and is refused, so a lost
 * answer costs nobody anything.
 */
export function claimQuest(h: Held, id: string, now: number): Bought {
  const daily = rolled(h.daily, now);
  const quest = questsToday(daily.day).find((q) => q.id === id);
  if (!quest) return { ok: false, error: 'no such quest today' };
  if (daily.taken.includes(id)) return { ok: false, error: 'already collected' };
  if (!questDone(daily, quest)) return { ok: false, error: 'not finished' };
  return {
    ok: true,
    held: {
      ...h,
      granted: h.granted + quest.coins,
      daily: { ...daily, taken: [...daily.taken, id] },
    },
  };
}

/* -------------------------------------------------------- the share counter */

/**
 * Shares bought or sold, at the price this server works out for today.
 *
 * FOUR THINGS ARE DECIDED HERE AND NOWHERE ELSE, and between them they are the
 * whole reason the counter is not simply a screen:
 *
 *   WHICH DAY IT IS, off this clock. A browser that says it is tomorrow is a
 *   browser that has seen tomorrow's price.
 *
 *   WHAT A SHARE COSTS. `priceOn` is seeded with `MARKET_SALT`, which never
 *   leaves the Worker — the client is sent prices (`/market`) rather than the
 *   means to compute them, so the walk stays unpredictable while staying
 *   perfectly reproducible on this side. Nothing is read out of the body but
 *   the company, the size, and which way round it is.
 *
 *   WHETHER THE PLAYER HAS MET THE COMPANY. The archive is the shop window: a
 *   company you have never had on a board is one you cannot buy a piece of.
 *   That is the same rule the archive tab already draws, and it keeps the
 *   counter tied to the game rather than sitting beside it.
 *
 * A refusal comes back with the profile as it really stands, like every other
 * refusal here — the client redraws and the buttons tell the truth.
 */
export function trade(
  h: Held,
  id: string,
  shares: number,
  sell: boolean,
  salt: string,
  now: number,
): Bought {
  const company = companyById(id);
  if (!company) return { ok: false, error: 'no such company' };
  if (!h.seen.includes(id)) return { ok: false, error: 'not in the archive yet' };

  const today = dayOf(now);
  const price = priceOn(company, today, salt);
  const done = sell
    ? sellShares(h.portfolio, h.dollars, id, shares, price, today)
    : buyShares(h.portfolio, h.dollars, id, shares, price, today);
  if (!done.ok) return { ok: false, error: done.error };

  return {
    ok: true,
    held: {
      ...h,
      portfolio: done.portfolio,
      dollars: done.dollars,
    },
  };
}

/* -------------------------------------------------------------- the ladder */

/**
 * One more win in one league, which is how the ladder is climbed.
 *
 * Counted here rather than reported by the client, for the reason the coins
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
 * coins AND their purchases. A player whose save was lost but whose matches the
 * board remembers claims nothing, and gets their earned coins back as a balance
 * instead: the door does not shut on an empty claim, so their real save can
 * still walk in from another phone afterwards.
 */
export function claimInto(h: Held, earned: number, claim: Claim): Held {
  const owned = mergeOwned(h.owned, claim.owned);
  const room = Math.max(h.room, claim.room);
  const spent = priceOf(owned, room);
  return {
    room,
    owned,
    outfit: wearable(owned, claim.outfit),
    // Redrawn, because the wardrobe underneath it just changed. `withToday`
    // rolled today's shelf a moment ago against a row with nothing in it — this
    // only ever runs on such a row (`untouched`) — and a claim can arrive
    // holding half the catalogue, which would leave the shop offering garments
    // the player walked in wearing. Same day, same seed, new pool.
    offer: rollOffer(h.offer.day, setOf(owned)),
    spent,
    granted: Math.max(0, claim.coins + spent - earned),
    // The ladder is the one thing here the server would otherwise have no way
    // of reconstructing: it starts counting wins today, and everything climbed
    // before that only exists in the save being handed over.
    wins: mergeWins(h.wins, claim.wins),
    // The shelf is not claimed. Every award on it is something the server can
    // work out for itself from what it already knows, and the first evaluation
    // after this hands over the ones that were already true — so there is
    // nothing here worth taking anybody's word for.
    awards: h.awards,
    duelWins: h.duelWins,
    streak: h.streak,
    // The archive is different: which companies a player has met is not
    // recoverable from anything the server kept, so it rides in like the room.
    seen: [...new Set([...h.seen, ...claim.seen])],
    // None of these is claimed, and none ever will be. Dollars did not exist
    // before this table did, so there is no save anywhere holding any — and a
    // currency a client may claim is a currency a console mints. A portfolio
    // bought with such a currency is the same thing one step along.
    dollars: h.dollars,
    portfolio: h.portfolio,
    daily: h.daily,
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
  offer: string;
  wins: string;
  awards: string;
  seen: string;
  duel_wins: number;
  streak: number;
  spent: number;
  granted: number;
  dollars: number;
  portfolio: string;
  daily: string;
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

/**
 * The two numbers the shelf is judged against, off the board's own row. Both
 * are things the server has always kept for its own reasons — the best match
 * ever played, and the highest league one was finished in — so the awards that
 * turn on them need no new bookkeeping and are already true of everybody who
 * has been playing.
 */
export async function standingOf(env: Env, id: string): Promise<Standing> {
  const row = await env.DB.prepare(
    `SELECT best_net_worth, top_league FROM players WHERE id = ?1`,
  )
    .bind(id)
    .first<{ best_net_worth: number; top_league: number }>();
  return {
    bestNetWorth: Math.max(0, row?.best_net_worth ?? 0),
    topLeague: Math.max(0, row?.top_league ?? 0),
  };
}

export async function read(env: Env, id: string): Promise<Stored | null> {
  const row = await env.DB.prepare(
    `SELECT room, owned, outfit, offer, wins, awards, seen, duel_wins, streak,
            spent, granted, dollars, portfolio, daily, updated_at
       FROM profiles WHERE id = ?1`,
  )
    .bind(id)
    .first<StoredRow>();
  if (!row) return null;
  const owned = cleanOwned(parse(row.owned));
  return {
    version: row.updated_at,
    held: {
      room: Math.min(ROOM_DONE, Math.max(0, row.room)),
      owned,
      outfit: wearable(owned, cleanOutfit(parse(row.outfit))),
      // Exactly what is stored, yesterday's draw included, for the reason
      // `daily` is: `withToday` rolls both, once, where the clock is read.
      offer: cleanOffer(parse(row.offer)),
      spent: Math.max(0, row.spent),
      granted: Math.max(0, row.granted),
      wins: cleanWins(parse(row.wins), LEAGUES),
      awards: cleanShelf(parse(row.awards)),
      seen: cleanSeen(parse(row.seen)),
      duelWins: Math.max(0, row.duel_wins),
      streak: Math.max(0, row.streak),
      dollars: Math.max(0, row.dollars),
      portfolio: cleanPortfolio(parse(row.portfolio)),
      // Exactly what is stored, yesterday's day included. `change` rolls it —
      // see `withToday`, and see why it is there and not here.
      daily: cleanDaily(parse(row.daily)),
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
  const offer = JSON.stringify(h.offer);
  const wins = JSON.stringify(h.wins);
  const awards = JSON.stringify(h.awards);
  const seen = JSON.stringify(h.seen);
  const portfolio = JSON.stringify(h.portfolio);
  const daily = JSON.stringify(h.daily);

  const res =
    version === null
      ? // A row that was not there. If one appeared in the meantime this does
        // nothing, and the caller starts again knowing about it.
        await env.DB.prepare(
          `INSERT INTO profiles (id, room, owned, outfit, offer, wins, awards, seen,
                                 duel_wins, streak, spent, granted,
                                 dollars, portfolio, daily, first_seen, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)
           ON CONFLICT (id) DO NOTHING`,
        )
          .bind(
            id, h.room, owned, outfit, offer, wins, awards, seen,
            h.duelWins, h.streak, h.spent, h.granted, h.dollars, portfolio, daily, now,
          )
          .run()
      : await env.DB.prepare(
          `UPDATE profiles
              SET room       = ?2,
                  owned      = ?3,
                  outfit     = ?4,
                  offer      = ?5,
                  wins       = ?6,
                  awards     = ?7,
                  seen       = ?8,
                  duel_wins  = ?9,
                  streak     = ?10,
                  spent      = ?11,
                  granted    = ?12,
                  dollars    = ?13,
                  portfolio  = ?14,
                  daily      = ?15,
                  updated_at = MAX(updated_at + 1, ?16)
            WHERE id = ?1 AND updated_at = ?17`,
        )
          .bind(
            id, h.room, owned, outfit, offer, wins, awards, seen,
            h.duelWins, h.streak, h.spent, h.granted, h.dollars, portfolio, daily, now, version,
          )
          .run();

  return (res.meta?.changes ?? 0) > 0;
}

/**
 * One more open, on the clock.
 *
 * This is the one number the rest of the file cannot produce. Everything else
 * here is a record of what a player OWNS, and somebody who opens the game, has
 * a look and leaves owns nothing new at the end of it: `results` knew who
 * finished a match, and nothing at all knew who turned up.
 *
 * The caller decides what counts, and it is not "a request to `/profile`" --
 * that route is also how the game refetches after a match, so counting it would
 * count matches over again. See the call in `index.ts`, which counts only the
 * handshake that carries a claim.
 *
 * NOT PART OF `Held`, AND THAT IS THE POINT. Every other column on the row is
 * something the player has, and goes out to the browser in `view`. These two
 * are about the player rather than theirs: they are never sent, never claimed,
 * and never carried to another device -- the same rule `chat_shouts` is kept
 * under, and for the same reason.
 *
 * THREE THINGS IT DELIBERATELY DOES NOT DO:
 *
 *   - It does not read first. One statement, and `opens + 1` is computed by
 *     the database, so two opens at once cannot both write the same number.
 *   - It does not touch `updated_at`. That column is the version every write
 *     compares against (`write`), and a counter that moved it would make a
 *     purchase in flight lose a race it had already won.
 *   - It does not throw. A counter is not worth failing a handshake for, so a
 *     database that says no here is simply a number that did not go up. The
 *     precedent is `giftFirstHat`, where the match is banked either way.
 *
 * It also does not INSERT. On a first ever open the row is made by the
 * handshake itself, so this is called after that and finds one; if the
 * handshake somehow made none, the UPDATE matches nothing and the day's first
 * open goes uncounted, which is the right way round for a counter to be wrong.
 */
export async function countOpen(env: Env, id: string, now: number): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE profiles SET opens = opens + 1, last_open = ?2 WHERE id = ?1`,
    )
      .bind(id, now)
      .run();
  } catch {
    /* a number that did not go up is not a reason to fail the request */
  }
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
  at: Standing;
  error?: string;
}

/** A change, worked out against the row as it stands at the moment it is read. */
export type Change = (h: Held, earned: number, at: Standing) => Bought;

/**
 * The welcome present: the bandana, after a first finished match.
 *
 * A new player's first match is against a stranger on a board they were not
 * shown, because seeing the board before agreeing to it is what the first item
 * in the wardrobe buys — and they have no wardrobe. So the game gives them one,
 * once, for finishing a match. It is the cheapest rung of the cheapest slot and
 * it teaches the thing the shop is for: clothes are not decoration here, they
 * change what you know and what you can do.
 *
 * The rule is "owns nothing on their head", not "has played exactly one match".
 * Idempotent, needs no counter, and gives the present to anybody who was
 * playing before it existed the next time they finish a match — which is right,
 * since it is a welcome rather than a reward for being early.
 *
 * `spent` is deliberately not moved. A present that comes out of the balance is
 * not a present, and `spent` is what the shop charges against.
 */
export function giftHat(held: Held): Bought {
  if (topOf(held.owned, 'hat')) return { ok: false, error: 'already has one' };
  const id = itemId('hat', 'common');
  return {
    ok: true,
    held: {
      ...held,
      owned: [...held.owned, id],
      // Worn as well as owned: an item in a drawer teaches nothing, and the
      // next board is the first place it does anything.
      outfit: { ...held.outfit, hat: 'common' },
    },
  };
}

/**
 * The same present, given to a row.
 *
 * Never throws and never blocks: it runs beside recording a match, and a match
 * that was played must be banked whether or not the hat arrives with it.
 */
export async function giftFirstHat(env: Env, caller: Caller): Promise<void> {
  try {
    await change(env, caller, giftHat);
  } catch {
    /* the match is banked either way */
  }
}

/**
 * Read, change, write — and if the row moved underneath, read it again and work
 * the change out afresh rather than writing a decision made about the past.
 *
 * The refusals come back rather than throwing: "not on sale today" is an answer
 * about a real profile and the caller sends that profile back with it.
 */
export async function change(env: Env, caller: Caller, apply: Change): Promise<Applied> {
  let last: Applied | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const earned = await earnedBy(env, caller.id);
    const at = await standingOf(env, caller.id);
    const stored = await read(env, caller.id);
    // Today first, before anything is decided or drawn: every rule below, and
    // the profile that goes back to the browser, is about the day it is now.
    const held = withToday(stored?.held ?? EMPTY, Date.now());

    const out = apply(held, earned, at);
    if (!out.ok) return { held, earned, at, error: out.error };

    // Anything a change makes true is true immediately, so the shelf is looked
    // at on the way past rather than on a timer or at the next sign-in. A
    // fifth slot filled in the shop is DRESSED before the screen redraws.
    const settled = afterChange(out.held, at, Date.now());

    if (await write(env, caller.id, settled, stored?.version ?? null)) {
      return { held: settled, earned, at };
    }
    last = { held, earned, at };
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
 * Everything one finished match does to a profile, from either of the two
 * places a match can finish: `/result` for a bot, and the object that ran a
 * duel. One `change`, so the ladder, the archive and the shelf all move under
 * the same compare-and-set rather than racing each other.
 *
 * The order matters. The league win is banked first because an award turns on
 * the ladder; the companies are filed next because an award turns on the
 * archive; the shelf is judged last, against a profile that already knows
 * about both.
 */
export async function settle(
  env: Env,
  caller: Caller,
  m: { league: number; facts: MatchFacts; companies: string[] },
): Promise<Applied> {
  const now = Date.now();
  return change(env, caller, (held, _earned, at) => {
    // The ladder is climbed against the bots. A friend willing to lose ten
    // times is a lift, not a climb, so a duel banks no league win.
    const climbed =
      m.facts.outcome === 'win' && !m.facts.duel ? bankWin(held, m.league) : held;
    // The day's quests hear about it next, and unlike the ladder they hear
    // about a duel too: there is no ladder here to inflate, and a duel is a
    // match that was played. `MatchFacts` is a superset of what the day counts,
    // so it goes straight in.
    const counted = { ...climbed, daily: countMatch(climbed.daily, m.facts, now) };
    return { ok: true, held: afterMatch(withSeen(counted, m.companies), at, m.facts, now) };
  });
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

/**
 * How far this player's office is along, or null for somebody with no row yet.
 *
 * The duel object asks at kick-off, the same way it asks for the outfit and
 * for the same reason: a renovation is money at the desk (`ui/renovation.ts`),
 * and what a player claims about their own is not what they play on.
 */
export async function roomOf(env: Env, id: string): Promise<number | null> {
  const stored = await read(env, id);
  return stored ? stored.held.room : null;
}
