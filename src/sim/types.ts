import type { Config } from './config';
import type { Segment } from './market';
import type { Rng } from './rng';
import type { TraitState } from './traits';
import type { TraderPerks } from './perks';
import type { AbilityId, AbilityState } from './abilities';

export interface Trade {
  tick: number;
  trader: number;
  stock: number;
  qty: number; // >0 buy, <0 sell/short
  price: number; // execution price, slippage included
  commission: number;
  /** realised P&L booked when this trade reduced an existing position */
  realized: number;
  /** part of a realised loss handed straight back by a perk, if any */
  refund: number;
}

export interface TraderState {
  idx: number;
  name: string;
  kind: 'human' | 'bot';
  preset: string;
  cash: number;
  positions: number[];
  /** average entry price per stock, for the dashed break-even line */
  avgEntry: number[];
  bankrupt: boolean;
  netWorth: number;
  netWorthHistory: number[];
  trades: Trade[];
  /** bot scratch space: queued reactions */
  pending: { atTick: number; stock: number; dir: -1 | 1; fraction: number }[];
  /** bot scratch space: tick at which it plans to take the position off, per stock */
  exitAt: number[];
  /** the terms this trader trades on; bots get NO_PERKS */
  perks: TraderPerks;
  /** what is left of the per-match allowances the perks grant */
  stopsLeft: number;
  undosLeft: number;
  refundUsed: boolean;
  /**
   * The book as it stood before the last trade, kept only while an undo is
   * still on offer. Restoring a snapshot is exact, where replaying a trade
   * backwards through the average-entry maths is not.
   */
  undoPoint: { tick: number; cash: number; positions: number[]; avgEntry: number[] } | null;
  /** the one ability this trader brought, if any, and whether it is spent */
  ability: AbilityId | null;
  abilityUsed: boolean;
}

export interface StockState {
  price: number;
  prevPrice: number;
  impact: number;
  history: number[];
  segments: Segment[];
  /** whatever this company's quirk has to remember across the match */
  trait: TraitState;
}

export interface NewsBanner {
  tick: number;
  stockIdx: number;
  text: string;
}

export interface MatchState {
  seed: number;
  cfg: Config;
  tick: number;
  totalTicks: number;
  stocks: StockState[];
  traders: TraderState[];
  news: NewsBanner[];
  finished: boolean;
  winner: number | null;
  /** index of the trader who gave up, if the match ended that way */
  resigned: number | null;
  rng: { price: Rng; bot: Rng; trait: Rng };
  /** what the abilities fired so far are still doing to the board */
  abilities: AbilityState;
}

export type ActionSide = 'buy' | 'sell';

export interface Action {
  trader: number;
  stock: number;
  side: ActionSide;
  fraction: number;
  /** an automatic exit prices at the mid, whatever the trader's slippage is */
  noSlip?: boolean;
  /**
   * Push it through whatever an ability has shut. A margin call flattens a book
   * that a halt has frozen; the freeze is there to stop the traders acting, not
   * to protect them from each other.
   */
  force?: boolean;
}
