import type { Config } from './config';
import type { Action, MatchState, Trade, TraderState } from './types';

export function positionValue(state: MatchState, t: TraderState): number {
  let v = 0;
  for (let i = 0; i < state.stocks.length; i++) v += t.positions[i] * state.stocks[i].price;
  return v;
}

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

/** How much notional the trader may still put on, given the leverage limit. */
export function buyingPower(state: MatchState, t: TraderState): number {
  const nw = netWorth(state, t);
  if (nw <= 0) return 0;
  return Math.max(0, nw * state.cfg.match.maxLeverage - grossExposure(state, t));
}

/** A fraction that rounds down to nothing still buys one share if it is affordable. */
function atLeastOne(power: number, price: number, f: number): number {
  const q = Math.floor((power * f) / price);
  if (q > 0) return q;
  return power >= price ? 1 : 0;
}

/** Share count a BUY/SELL of `fraction` would move, before any clamping. */
export function plannedQty(state: MatchState, action: Action): number {
  const t = state.traders[action.trader];
  const price = state.stocks[action.stock].price;
  const pos = t.positions[action.stock];
  const f = Math.min(1, Math.max(0, action.fraction));
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
  let q = plannedQty(state, action);
  if (!Number.isFinite(q) || q === 0) return null;

  // never let a trade break the leverage ceiling
  const guard = () => {
    const nw = netWorth(state, t);
    const limit = nw * cfg.match.maxLeverage;
    for (let i = 0; i < 40 && q !== 0; i++) {
      const after = Math.abs((t.positions[action.stock] + q) * stock.price);
      let others = 0;
      for (let s = 0; s < state.stocks.length; s++) {
        if (s !== action.stock) others += Math.abs(t.positions[s] * state.stocks[s].price);
      }
      if (after + others <= limit + 1e-6) return;
      q = Math.trunc(q * 0.75);
    }
  };
  guard();
  if (q === 0) return null;

  const p = stock.price;
  const slip = (cfg.impact.slippageCoef * Math.abs(q)) / cfg.impact.refQty;
  const execPrice = p * (1 + Math.sign(q) * slip);
  const cost = q * execPrice;
  const commission = cfg.match.commissionRate * Math.abs(cost);

  const posBefore = t.positions[action.stock];
  const posAfter = posBefore + q;

  // realised P&L on the part of the trade that reduces an existing position
  let realized = 0;
  if (posBefore !== 0 && Math.sign(q) !== Math.sign(posBefore)) {
    const closed = Math.min(Math.abs(q), Math.abs(posBefore));
    realized = (execPrice - t.avgEntry[action.stock]) * closed * Math.sign(posBefore);
  }

  // average entry: keep it on the surviving side of the position
  if (posBefore === 0 || Math.sign(posAfter) !== Math.sign(posBefore)) {
    t.avgEntry[action.stock] = posAfter === 0 ? 0 : execPrice;
  } else if (Math.sign(q) === Math.sign(posBefore)) {
    const total = Math.abs(posBefore) + Math.abs(q);
    t.avgEntry[action.stock] =
      (t.avgEntry[action.stock] * Math.abs(posBefore) + execPrice * Math.abs(q)) / total;
  }

  t.cash -= cost + commission;
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
  };
  t.trades.push(trade);
  t.netWorth = netWorth(state, t);
  return trade;
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
