import type { Config } from './config';
import type { Action, MatchState, Trade, TraderState } from './types';

export function positionValue(state: MatchState, t: TraderState): number {
  let v = 0;
  for (let i = 0; i < state.stocks.length; i++) v += t.positions[i] * state.stocks[i].price;
  return v;
}

/** Total size of everything held, longs and shorts alike. Reported, not enforced. */
export function grossExposure(state: MatchState, t: TraderState): number {
  let v = 0;
  for (let i = 0; i < state.stocks.length; i++) {
    v += Math.abs(t.positions[i] * state.stocks[i].price);
  }
  return v;
}

export function netWorth(state: MatchState, t: TraderState): number {
  return t.cash + positionValue(state, t);
}

/**
 * What the trader can commit right now: the cash actually on hand. There is no
 * leverage ceiling — a position is limited by money, not by a multiple of net
 * worth. Note that a short pays its proceeds into cash, so shorting first and
 * buying after is a way to build exposure well past the starting capital.
 */
export function buyingPower(state: MatchState, t: TraderState): number {
  return Math.max(0, t.cash);
}

/** A fraction that rounds down to nothing still buys one share if it is affordable. */
function atLeastOne(power: number, price: number, f: number): number {
  const q = Math.floor((power * f) / price);
  if (q > 0) return q;
  return power >= price ? 1 : 0;
}

/**
 * What an ability has shut, read straight off the state rather than through
 * abilities.ts — the same way the shorting flag is read straight off the config
 * — so that the module which owns the effects can call applyAction without the
 * two files importing each other.
 */
function shutOut(state: MatchState, action: Action, pos: number): boolean {
  if (action.force) return false;
  if (state.tick < state.abilities.frozenUntil[action.stock]) return true;
  // a blocked trader keeps the right to get out of what they already hold;
  // what they lose is opening anything or adding to it
  const opening = action.side === 'buy' ? pos >= 0 : pos <= 0;
  return opening && state.tick < state.abilities.blockedUntil[action.trader];
}

/** Share count a BUY/SELL of `fraction` would move, before any clamping. */
export function plannedQty(state: MatchState, action: Action): number {
  const t = state.traders[action.trader];
  const price = state.stocks[action.stock].price;
  const pos = t.positions[action.stock];
  const f = Math.min(1, Math.max(0, action.fraction));
  if (shutOut(state, action, pos)) return 0;
  if (action.side === 'buy') {
    if (pos < 0) {
      // buying back a short: close up to `fraction` of it first
      return Math.min(-pos, Math.max(1, Math.ceil(-pos * f)));
    }
    return atLeastOne(buyingPower(state, t), price, f);
  }
  if (pos > 0) return -Math.max(1, Math.ceil(pos * f));
  if (!state.cfg.flags.shorting) return 0;
  return -atLeastOne(buyingPower(state, t), price, f);
}

/** True when SELL on this row would open a short rather than reduce a position. */
export function isShortSide(state: MatchState, trader: number, stock: number): boolean {
  return state.cfg.flags.shorting && state.traders[trader].positions[stock] <= 0;
}

/**
 * The one public entry point for trading. The bot uses it exactly as the player
 * does — swapping in a human opponent later needs no new code here.
 */
export function applyAction(state: MatchState, action: Action): Trade | null {
  if (state.finished) return null;
  const t = state.traders[action.trader];
  if (t.bankrupt) return null;

  const stock = state.stocks[action.stock];
  const cfg: Config = state.cfg;
  const perks = t.perks;
  let q = plannedQty(state, action);
  if (!Number.isFinite(q) || q === 0) return null;

  const posBefore = t.positions[action.stock];
  const posAfter = posBefore + q;
  const reducing = posBefore !== 0 && Math.sign(q) !== Math.sign(posBefore);

  // An undo restores the book, so the snapshot has to be taken before the
  // trade touches it — and only while an undo is actually on offer.
  if (t.undosLeft > 0) {
    t.undoPoint = {
      tick: state.tick,
      cash: t.cash,
      positions: [...t.positions],
      avgEntry: [...t.avgEntry],
    };
  }

  const p = stock.price;
  // An automatic exit and a perk that pays for the spread both price at the
  // mid; everything else pays slippage scaled by how much of it there is.
  const free = action.noSlip || (perks.freeExits && reducing);
  const slip = free
    ? 0
    : (cfg.impact.slippageCoef * perks.slippageMult * Math.abs(q)) / cfg.impact.refQty;
  const execPrice = p * (1 + Math.sign(q) * slip);
  const cost = q * execPrice;
  const commission = cfg.match.commissionRate * perks.commissionMult * Math.abs(cost);

  // realised P&L on the part of the trade that reduces an existing position
  let realized = 0;
  if (reducing) {
    const closed = Math.min(Math.abs(q), Math.abs(posBefore));
    realized = (execPrice - t.avgEntry[action.stock]) * closed * Math.sign(posBefore);
  }

  // the house pays part of the first loss you take, once a match
  let refund = 0;
  if (realized < 0 && perks.firstLossRefund > 0 && !t.refundUsed) {
    t.refundUsed = true;
    refund = -realized * perks.firstLossRefund;
  }

  // average entry: keep it on the surviving side of the position
  if (posBefore === 0 || Math.sign(posAfter) !== Math.sign(posBefore)) {
    t.avgEntry[action.stock] = posAfter === 0 ? 0 : execPrice;
  } else if (Math.sign(q) === Math.sign(posBefore)) {
    const total = Math.abs(posBefore) + Math.abs(q);
    t.avgEntry[action.stock] =
      (t.avgEntry[action.stock] * Math.abs(posBefore) + execPrice * Math.abs(q)) / total;
  }

  t.cash -= cost + commission - refund;
  t.positions[action.stock] = posAfter;

  if (cfg.flags.marketImpact) {
    stock.impact += (p * cfg.impact.permanentCoef * q) / cfg.impact.refQty;
  }

  const trade: Trade = {
    tick: state.tick,
    trader: action.trader,
    stock: action.stock,
    qty: q,
    price: execPrice,
    commission,
    realized,
    refund,
  };
  t.trades.push(trade);
  t.netWorth = netWorth(state, t);
  return trade;
}

/**
 * Take back the last trade at the price it was done at.
 *
 * The book is restored from the snapshot rather than replayed backwards: the
 * average-entry maths is lossy in reverse, and an undo that quietly moved your
 * break-even line would be worse than no undo at all. What the trade did to
 * the market is deliberately left alone — the impact it printed is already in
 * everyone else's prices, and it decays on its own within a few ticks.
 */
export function undoLast(state: MatchState, traderIdx: number): boolean {
  const t = state.traders[traderIdx];
  const point = t.undoPoint;
  if (state.finished || t.bankrupt || !point || t.undosLeft <= 0) return false;
  if (state.tick - point.tick > t.perks.undoWindowTicks) return false;
  t.cash = point.cash;
  t.positions = [...point.positions];
  t.avgEntry = [...point.avgEntry];
  t.trades.pop();
  t.undosLeft--;
  t.undoPoint = null;
  t.netWorth = netWorth(state, t);
  return true;
}

/** True while the last trade is still inside its taking-back window. */
export function canUndo(state: MatchState, traderIdx: number): boolean {
  const t = state.traders[traderIdx];
  if (state.finished || t.bankrupt || t.undosLeft <= 0 || !t.undoPoint) return false;
  return state.tick - t.undoPoint.tick <= t.perks.undoWindowTicks;
}

/**
 * Positions far enough under water get out on their own, at the mid, as many
 * times a match as the trader's perks allow. Run once per tick, after the
 * prices for that tick are in.
 */
export function runStops(state: MatchState): void {
  for (const t of state.traders) {
    if (t.bankrupt || t.stopsLeft <= 0 || t.perks.stopLossAt <= 0) continue;
    for (let i = 0; i < state.stocks.length && t.stopsLeft > 0; i++) {
      const pos = t.positions[i];
      const entry = t.avgEntry[i];
      if (!pos || !entry) continue;
      const pnl = ((state.stocks[i].price - entry) / entry) * Math.sign(pos);
      if (pnl > -t.perks.stopLossAt) continue;
      const done = applyAction(state, {
        trader: t.idx,
        stock: i,
        side: pos > 0 ? 'sell' : 'buy',
        fraction: 1,
        noSlip: true,
      });
      if (done) t.stopsLeft--;
    }
  }
}

/** Flatten everything at the last tick price — no slippage, no commission. */
export function liquidate(state: MatchState, t: TraderState): void {
  for (let i = 0; i < state.stocks.length; i++) {
    const pos = t.positions[i];
    if (!pos) continue;
    const price = state.stocks[i].price;
    t.cash += pos * price;
    t.positions[i] = 0;
    t.avgEntry[i] = 0;
  }
  t.netWorth = t.cash;
}
