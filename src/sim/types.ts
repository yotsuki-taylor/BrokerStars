import type { Config } from './config';
import type { Segment } from './market';
import type { Rng } from './rng';

export interface Trade {
  tick: number;
  trader: number;
  stock: number;
  qty: number; // >0 buy, <0 sell/short
  price: number; // execution price, slippage included
  commission: number;
  /** realised P&L booked when this trade reduced an existing position */
  realized: number;
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
}

export interface StockState {
  price: number;
  prevPrice: number;
  impact: number;
  history: number[];
  segments: Segment[];
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
  rng: { price: Rng; bot: Rng };
}

export type ActionSide = 'buy' | 'sell';

export interface Action {
  trader: number;
  stock: number;
  side: ActionSide;
  fraction: number;
}
