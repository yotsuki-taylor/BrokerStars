/**
 * The share counter: what a company is worth today, and what a player holds.
 *
 * This is the other half of the game the second currency was minted for.
 * `src/daily/protocol.ts` said so when it introduced dollars — "the metagame
 * counter where a player buys a piece of a company rather than a hat" — and
 * this file is that counter. Coins are earned by playing and buy things that
 * make the next match go better; dollars are paid for turning up and buy a
 * piece of the same companies the matches are played against.
 *
 * Both ends import this file, for the reason `src/profile/protocol.ts` and
 * `src/daily/protocol.ts` are shared: the arithmetic is written once, and a
 * change to it breaks the build on both sides rather than in production.
 *
 * WHAT A DAY IS. The same UTC day the bonus is paid by (`dayOf`). One price per
 * company per day, and it changes at the exact moment the bonus comes back —
 * so "buy today, look tomorrow" is literally the loop, and there is one clock
 * in the game rather than two.
 *
 * WHY THERE IS NO PRICE TABLE. Nothing is stored, no job runs, nothing is
 * "rolled out" at midnight. A price is worked out from the company and the day,
 * the same bargain `questsFor(day)` makes and the same one `createMatch(seed)`
 * makes: a number in, the same world out. A player who does not open the game
 * for a month costs nothing to keep, and the client and the server cannot end
 * up looking at different prices.
 *
 * WHY A WINDOW AND NOT AN EPOCH. A price has to depend on yesterday's, or a
 * portfolio is a coin flip rather than a position. So it is a walk — but a walk
 * folded from a fixed epoch costs one step per day that has ever passed, for
 * ever. Instead every price is folded over the SAME NUMBER of days ending at
 * the day being asked about (`WINDOW`), starting from the company's own listing
 * price. That is O(1) in the age of the game, it is still exactly reproducible
 * on both sides, and the seam where the window slides is invisible: mean
 * reversion has cut the influence of the oldest day in the window to about
 * three parts in ten thousand by the time it drops out.
 *
 * WHY THE SEED IS SALTED. The walk is deterministic, so anybody who can read
 * the bundle could work out TOMORROW's price and buy the winner. The salt is
 * the Worker's (`MARKET_SALT`), it never leaves it, and the browser is told
 * prices rather than left to compute them (`/market`). A build with no server
 * behind it salts with the empty string and computes locally — there is no
 * server balance to cheat there, and a counter that did nothing in
 * `npm run dev` would be worse.
 */

import { COMPANIES, companyById, type Company } from '../sim/companies';
import { Rng, hashSeed } from '../sim/rng';
import type { Daily } from '../daily/protocol';

/* ------------------------------------------------------------- the dials */

/**
 * How many days are folded to reach one price. Long enough that the oldest day
 * in it has been forgotten before it drops out — at `REVERT` of 0.02 that is
 * `exp(-8)`, about 0.03% — and short enough that thirty companies cost nothing
 * to price.
 */
export const WINDOW = 400;

/** How much of the gap back to the listing price one day closes. */
export const REVERT = 0.02;

/**
 * The day's shock, as a multiple of the company's own per-tick noise. Nothing
 * new is added to the roster to make this work: a company that swings in a
 * match swings in the portfolio, so URANUS moves about 9% on an ordinary day
 * and GRANITE VAULT about 2%.
 */
export const VOL = 4;

/** No ordinary day moves a price further than this in logs — about 20%. */
export const DAY_CLAMP = 0.18;

/** Nor does any amount of walking take one further than this from its listing. */
export const BAND = 1.6;

/** What the house takes on each side of a trade. */
export const SPREAD = 0.01;

/** Orders — buys and sells alike — one player may place in one day. */
export const ORDERS_A_DAY = 3;

/** How much of a chart the archive draws, today included. */
export const HISTORY_DAYS = 14;

/** How much of its own high a RATCHET company forgets per day, in logs. */
const RATCHET_BLEED = 0.005;

/** A share is never printed at less than this, whatever the walk says. */
const MIN_PRICE = 1;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* -------------------------------------------------------------- the walk */

/**
 * Where one company's walk has got to. `x` is the whole of the price — the log
 * of what the share is worth as a multiple of its listing price — and the other
 * two are what the quirks need to remember from yesterday.
 */
interface Walk {
  x: number;
  /** which way the last day went, for the companies that hold a direction */
  dir: -1 | 0 | 1;
  /** the running high a trailing floor is measured down from */
  high: number;
}

/**
 * One day of one company, and the only place a quirk means anything here.
 *
 * Every kind is the same quirk the match knows it by — `src/sim/traits.ts` says
 * what it does to a tick, this says what it does to a day — so the tagline the
 * archive already prints doubles as advice to whoever is about to buy. A
 * BUBBLE climbs and then hands it all back; a PROTECTED company cannot fall
 * through its floor; STATE money is dragged home five times as hard as anything
 * else and is the safest thing on the board.
 */
function step(c: Company, day: number, w: Walk, salt: string): Walk {
  const rng = new Rng(hashSeed(`${salt}|share|${c.id}|${day}`));
  const kind = c.trait.kind;

  let sigma = c.noiseSigma * VOL;
  let revert = REVERT;
  let drift = 0;

  switch (kind) {
    case 'regulated':
      // the anchor, one day at a time: it is pulled home so hard that the walk
      // never gets far from the listing price
      revert = REVERT * 5;
      sigma *= 0.6;
      break;
    case 'luxury':
      sigma *= 0.5;
      break;
    case 'dividend':
      sigma *= 0.7;
      break;
    case 'stall':
      // some days nothing happens at all, which is what STREAKY means at this
      // scale: no shock, only the pull home
      if (rng.chance(0.25)) sigma = 0;
      break;
    case 'headline':
      if (rng.chance(0.12)) sigma *= 3;
      break;
    case 'bubble':
      drift = 0.009;
      break;
    case 'moonshot':
      // it bleeds while it waits, which is what makes the wait cost something
      drift = -0.0015;
      break;
    case 'ratchet':
      drift = -0.0005;
      break;
    default:
      break;
  }

  let move = drift + (sigma > 0 ? rng.gauss(sigma) : 0);

  // TRENDING: the day keeps yesterday's direction seven times in ten, which is
  // the same bargain `locked` strikes with a segment inside a match.
  if (kind === 'locked' && w.dir !== 0) {
    const want = rng.chance(0.7) ? w.dir : -w.dir;
    if (Math.sign(move) !== want) move = -move;
  }

  move = clamp(move, -DAY_CLAMP, DAY_CLAMP);
  let x = w.x + move;
  x -= revert * x;

  // The events, which are the part a clamp is not allowed to soften: a pop that
  // was capped at 20% would not be a pop.
  if (kind === 'bubble' && rng.chance(0.015)) x += Math.log(0.4);
  if (kind === 'moonshot' && rng.chance(0.007)) x += Math.log(1.9);
  if (kind === 'luxury' && rng.chance(0.015)) x += Math.log(0.6);

  // The floors, after everything else: a floor that something else could get
  // under afterwards is not one.
  if (kind === 'floor' && c.trait.floor) {
    x = Math.max(x, Math.log(c.trait.floor / c.basePrice));
  }
  let high = Math.max(w.high - RATCHET_BLEED, x);
  if (kind === 'ratchet' && c.trait.giveBack) {
    x = Math.max(x, high + Math.log(1 - c.trait.giveBack));
    high = Math.max(high, x);
  }

  x = clamp(x, -BAND, BAND);
  return { x, dir: move > 0 ? 1 : move < 0 ? -1 : 0, high };
}

const priceAt = (c: Company, x: number): number =>
  Math.max(MIN_PRICE, Math.round(c.basePrice * Math.exp(x)));

/**
 * The last `days` prices for one company, oldest first, ending on `day`.
 *
 * One fold answers the whole chart, so drawing fourteen days costs what one
 * price costs. `days` of 1 is exactly today.
 */
export function seriesFor(c: Company, day: number, days: number, salt = ''): number[] {
  const want = Math.max(1, Math.floor(days));
  const from = day - WINDOW - want + 1;
  let w: Walk = { x: 0, dir: 0, high: 0 };
  const out: number[] = [];
  for (let d = from; d <= day; d++) {
    w = step(c, d, w, salt);
    if (d > day - want) out.push(priceAt(c, w.x));
  }
  return out;
}

/** What one share of one company costs on one day. */
export const priceOn = (c: Company, day: number, salt = ''): number =>
  seriesFor(c, day, 1, salt)[0];

/**
 * Every company's recent prices, which is the whole of what `/market` answers.
 * The same for everybody, so it is cacheable and carries nobody's identity.
 */
export function marketFor(day: number, days = HISTORY_DAYS, salt = ''): Prices {
  const out: Prices = {};
  for (const c of COMPANIES) out[c.id] = seriesFor(c, day, days, salt);
  return out;
}

/* ------------------------------------------------------------- the wire */

/** Company id to its recent prices, oldest first. The last one is today's. */
export type Prices = Record<string, number[]>;

/** What `/market` sends, and what the browser keeps a copy of. */
export interface Market {
  /** the UTC day the last price in every series belongs to */
  day: number;
  prices: Prices;
}

export const EMPTY_MARKET: Market = { day: -1, prices: {} };

/** A market off the wire: known companies, finite positive prices, nothing else. */
export function cleanMarket(raw: unknown): Market {
  if (!raw || typeof raw !== 'object') return EMPTY_MARKET;
  const src = raw as Record<string, unknown>;
  const day = Math.floor(Number(src.day));
  if (!Number.isFinite(day)) return EMPTY_MARKET;

  const prices: Prices = {};
  const from = (src.prices ?? {}) as Record<string, unknown>;
  if (from && typeof from === 'object') {
    for (const c of COMPANIES) {
      const series = from[c.id];
      if (!Array.isArray(series)) continue;
      const clean = series
        .map((n) => Math.round(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= MIN_PRICE);
      if (clean.length) prices[c.id] = clean;
    }
  }
  return { day, prices };
}

/** Today's price out of a market, or null when it does not carry that company. */
export function priceIn(m: Market, id: string): number | null {
  const series = m.prices[id];
  return series && series.length ? series[series.length - 1] : null;
}

/** Yesterday's, for the change every row is drawn against. */
export function prevPriceIn(m: Market, id: string): number | null {
  const series = m.prices[id];
  return series && series.length > 1 ? series[series.length - 2] : null;
}

/* --------------------------------------------------------- what is held */

/**
 * One position: the shares, and what was paid for exactly those shares.
 *
 * `cost` is a running average rather than a list of purchases. A player wants
 * to read "you are in at 512, it is 540" off one row, and keeping every lot
 * would only be worth its weight if there were tax to work out.
 */
export interface Holding {
  shares: number;
  /** dollars paid for the shares still held, net of what selling handed back */
  cost: number;
  /**
   * The UTC day this position was last traded on, and the reason `overnight`
   * can tell a move the player was there for from one they were not.
   *
   * A position opened this morning was bought at today's price — the jump from
   * yesterday happened without it, and counting that jump as the player's would
   * pay them for a day they were not holding. So a row traded today contributes
   * nothing to the overnight figure and starts counting tomorrow, which is
   * exactly the loop the counter is for.
   */
  day: number;
}

export type Portfolio = Record<string, Holding>;

/** Earlier than any real day, so a position carrying it never reads as today's. */
export const NEVER_TRADED = -1;

/** What a share costs to buy and what it fetches to sell — the house's cut. */
export const askOf = (price: number): number => Math.max(1, Math.ceil(price * (1 + SPREAD)));
export const bidOf = (price: number): number => Math.max(1, Math.floor(price * (1 - SPREAD)));

/** The largest whole number of shares `dollars` will buy at that price. */
export const affordable = (dollars: number, price: number): number =>
  Math.max(0, Math.floor(dollars / askOf(price)));

/** A portfolio off the wire or out of a stored row. */
export function cleanPortfolio(raw: unknown): Portfolio {
  const out: Portfolio = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const c of COMPANIES) {
    const held = src[c.id];
    if (!held || typeof held !== 'object') continue;
    const { shares, cost, day } = held as Record<string, unknown>;
    const n = Math.floor(Number(shares));
    const paid = Math.round(Number(cost));
    const on = Math.floor(Number(day));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[c.id] = {
      shares: n,
      cost: Number.isFinite(paid) ? Math.max(0, paid) : 0,
      // A row written before positions carried a date is one that was not
      // traded today, which is the friendly reading: it counts.
      day: Number.isFinite(on) ? on : NEVER_TRADED,
    };
  }
  return out;
}

export const sharesOf = (p: Portfolio, id: string): number => p[id]?.shares ?? 0;

/** Was this position opened or changed on the day the market is showing? */
export const tradedOn = (p: Portfolio, id: string, day: number): boolean =>
  p[id] !== undefined && p[id].day === day;

/** What the whole book is worth at a given day's prices. */
export function valueOf(p: Portfolio, priceFor: (id: string) => number | null): number {
  let sum = 0;
  for (const [id, held] of Object.entries(p)) {
    const price = priceFor(id);
    if (price !== null) sum += price * held.shares;
  }
  return Math.round(sum);
}

/** What it cost to build, which is what a profit is measured against. */
export const costOf = (p: Portfolio): number =>
  Object.values(p).reduce((sum, held) => sum + held.cost, 0);

/**
 * What the book did overnight — the one number the whole counter exists to
 * produce.
 *
 * For each position: how many shares are held, times what the price did between
 * yesterday and today. A position TRADED TODAY is skipped entirely, and that is
 * the part worth being careful about: it was bought at today's price, so the
 * jump from yesterday happened without the player in it. Counting that jump
 * would hand somebody who bought this morning a profit for a night they spent
 * holding dollars, and it would do it every single time the price happened to
 * be up — which is not a market, it is a slot machine that pays on entry.
 *
 * So a purchase enters at nothing and starts counting tomorrow. Buy today, come
 * back tomorrow and see what it did: that is the loop, stated in arithmetic.
 */
export function overnight(p: Portfolio, m: Market): number {
  let sum = 0;
  for (const [id, held] of Object.entries(p)) {
    if (held.day === m.day) continue;
    const now = priceIn(m, id);
    const before = prevPriceIn(m, id);
    if (now === null || before === null) continue;
    sum += (now - before) * held.shares;
  }
  return Math.round(sum);
}

/* -------------------------------------------------------------- trading */

/** A trade either happened or it did not, the same shape a purchase has. */
export type Traded =
  | { ok: true; portfolio: Portfolio; dollars: number; paid: number }
  | { ok: false; error: string };

/** Orders already placed today, and how many are left. */
export const ordersLeft = (d: Daily): number => Math.max(0, ORDERS_A_DAY - (d.orders ?? 0));

/**
 * Buy whole shares at today's price plus the spread.
 *
 * Everything is checked here rather than trusted from a message, because the
 * Worker runs exactly this function against exactly this price — see
 * `worker/src/profile.ts`. A client that asked for more than it can afford gets
 * a refusal and the profile as it really stands.
 */
export function buyShares(
  p: Portfolio,
  dollars: number,
  id: string,
  shares: number,
  price: number,
  day: number,
): Traded {
  const n = Math.floor(Number(shares));
  if (!companyById(id)) return { ok: false, error: 'no such company' };
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'no shares asked for' };
  const paid = askOf(price) * n;
  if (paid > dollars) return { ok: false, error: 'not enough dollars' };

  const held = p[id] ?? { shares: 0, cost: 0, day: NEVER_TRADED };
  return {
    ok: true,
    paid,
    dollars: dollars - paid,
    portfolio: { ...p, [id]: { shares: held.shares + n, cost: held.cost + paid, day } },
  };
}

/**
 * Sell whole shares at today's price less the spread.
 *
 * The cost basis goes out in proportion to the shares — sell half a position
 * and half of what was paid for it leaves with them — so what is left on the
 * row is still the average price of what is still held.
 */
export function sellShares(
  p: Portfolio,
  dollars: number,
  id: string,
  shares: number,
  price: number,
  day: number,
): Traded {
  const n = Math.floor(Number(shares));
  if (!companyById(id)) return { ok: false, error: 'no such company' };
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'no shares asked for' };
  const held = p[id];
  if (!held || held.shares < n) return { ok: false, error: 'not that many shares' };

  const got = bidOf(price) * n;
  const next = { ...p };
  if (held.shares === n) delete next[id];
  else {
    // round the cost that leaves, so the two halves of a split position add
    // back up to what the whole one cost
    const left = held.shares - n;
    next[id] = { shares: left, cost: Math.round((held.cost * left) / held.shares), day };
  }
  return { ok: true, paid: -got, dollars: dollars + got, portfolio: next };
}
