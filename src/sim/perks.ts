/**
 * The terms one trader trades on.
 *
 * Two traders in the same match do not have to face the same costs. A cheaper
 * commission, a stop that fires on its own, a floor under a ruined book — all
 * of that belongs to the trader rather than to the market, so it lives here
 * and not in CONFIG, which both sides share. Putting it in CONFIG would hand
 * every discount to the opponent as well.
 *
 * Nothing in this file knows where the numbers come from. The game builds them
 * out of what the player is wearing (src/ui/perks.ts) and passes them in with
 * the trader spec; a bot gets NO_PERKS and behaves exactly as it always did.
 */
export interface TraderPerks {
  /** multiplies the config's commission rate, for this trader only */
  commissionMult: number;
  /** multiplies the slippage this trader's own orders suffer */
  slippageMult: number;
  /** any trade that reduces a position prices at the mid instead */
  freeExits: boolean;
  /**
   * Net worth at which this trader is wiped out. 0 is the ordinary rule; a
   * large negative number is how "cannot go bust" is spelled, so that the
   * whole thing stays one comparison and survives a JSON round trip.
   */
  bankruptAt: number;
  /** net worth this trader cannot finish below, applied at the whistle */
  minResult: number;
  /** close a position this far under water on its own; 0 disables it */
  stopLossAt: number;
  /** how many times that may happen in one match */
  stopLossUses: number;
  /** share of the first losing close handed straight back */
  firstLossRefund: number;
  /** how many trades may be taken back */
  undos: number;
  /** and how long after a trade the offer stands */
  undoWindowTicks: number;
}

/** The terms everybody used to trade on, and the ones every bot still does. */
export const NO_PERKS: TraderPerks = {
  commissionMult: 1,
  slippageMult: 1,
  freeExits: false,
  bankruptAt: 0,
  minResult: 0,
  stopLossAt: 0,
  stopLossUses: 0,
  firstLossRefund: 0,
  undos: 0,
  undoWindowTicks: 0,
};

/** How `bankruptAt` says "never". Far below any book this game can produce. */
export const NEVER_BUST = -1e9;

export function perksOrDefault(p?: Partial<TraderPerks>): TraderPerks {
  return { ...NO_PERKS, ...p };
}
