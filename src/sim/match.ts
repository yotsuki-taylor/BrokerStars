import { CONFIG, cloneConfig, type Config } from './config';
import { botStep } from './bot';
import type { StockConfig } from './companies';
import {
  buildSchedule,
  phaseAtTick,
  planNewsEvents,
  segmentAt,
  stepPrice,
  totalTicks,
} from './market';
import { Rng } from './rng';
import { initTraitState, traitStep } from './traits';
import { liquidate, netWorth } from './trading';
import type { MatchState, StockState, TraderState } from './types';

export interface TraderSpec {
  name: string;
  kind: 'human' | 'bot';
  preset: string;
}

export interface MatchOptions {
  traders?: [TraderSpec, TraderSpec];
  /**
   * The board for this match. Leave it out and the config's default three go
   * up; the game hands in whatever the league drew (see companies.ts).
   */
  stocks?: StockConfig[];
}

const DEFAULT_TRADERS: [TraderSpec, TraderSpec] = [
  { name: 'YOU', kind: 'human', preset: 'medium' },
  { name: 'RIVAL', kind: 'bot', preset: 'medium' },
];

export function createMatch(seed: number, cfg: Config = CONFIG, opts: MatchOptions = {}): MatchState {
  const config = cloneConfig(cfg);
  // cloned too: a match must never be able to edit the roster it was dealt
  if (opts.stocks?.length) config.stocks = JSON.parse(JSON.stringify(opts.stocks));
  const total = totalTicks(config);

  const scheduleRng = new Rng(seed ^ 0x9e3779b9);
  const priceRng = new Rng(seed ^ 0xc2b2ae35);
  const botRng = new Rng(seed ^ 0x27d4eb2f);
  const traitRng = new Rng(seed ^ 0x85ebca6b);

  const news = planNewsEvents(config, scheduleRng);
  const stocks: StockState[] = config.stocks.map((s, idx) => {
    const ticks = news.filter((n) => n.stockIdx === idx).map((n) => n.tick);
    return {
      price: s.basePrice,
      prevPrice: s.basePrice,
      impact: 0,
      history: [s.basePrice],
      segments: buildSchedule(s, scheduleRng, total, ticks),
      trait: initTraitState(s),
    };
  });

  const specs = opts.traders ?? DEFAULT_TRADERS;
  const traders: TraderState[] = specs.map((spec, idx) => ({
    idx,
    name: spec.name,
    kind: spec.kind,
    preset: spec.preset,
    cash: config.match.startingCash,
    positions: config.stocks.map(() => 0),
    avgEntry: config.stocks.map(() => 0),
    bankrupt: false,
    netWorth: config.match.startingCash,
    netWorthHistory: [config.match.startingCash],
    trades: [],
    pending: [],
    exitAt: config.stocks.map(() => -1),
  }));

  const state: MatchState = {
    seed,
    cfg: config,
    tick: 0,
    totalTicks: total,
    stocks,
    traders,
    news: [],
    finished: false,
    winner: null,
    resigned: null,
    rng: { price: priceRng, bot: botRng, trait: traitRng },
  };
  return state;
}

/** One fixed simulation tick. Mutates and returns the same state object. */
export function step(state: MatchState): MatchState {
  if (state.finished) return state;
  state.tick++;

  for (const t of state.traders) {
    if (t.kind === 'bot') botStep(state, t);
  }

  const phase = phaseAtTick(state.cfg, state.tick);
  for (let i = 0; i < state.stocks.length; i++) {
    const st = state.stocks[i];
    const seg = segmentAt(st.segments, state.tick);
    if (seg?.isNews && seg.start === state.tick) {
      state.news.push({
        tick: state.tick,
        stockIdx: i,
        text: `${state.cfg.stocks[i].name}: BREAKING`,
      });
    }
    const plan = traitStep(
      state.cfg,
      state.cfg.stocks[i],
      st.trait,
      st.price,
      state.tick,
      state.rng.trait,
    );
    const res = stepPrice({
      price: st.price,
      impact: st.impact,
      stock: state.cfg.stocks[i],
      segment: seg,
      volMult: phase.volMult,
      decayPerTick: state.cfg.impact.decayPerTick,
      rng: state.rng.price,
      plan,
    });
    st.prevPrice = st.price;
    st.price = res.price;
    st.impact = res.impact;
    st.history.push(res.price);
  }

  for (const t of state.traders) {
    t.netWorth = netWorth(state, t);
    t.netWorthHistory.push(t.netWorth);
    if (state.cfg.match.bankruptcyEnabled && !t.bankrupt && t.netWorth <= 0) {
      t.bankrupt = true;
      for (let i = 0; i < state.stocks.length; i++) {
        t.positions[i] = 0;
        t.avgEntry[i] = 0;
      }
      t.cash = 0;
      t.netWorth = 0;
    }
  }

  if (state.tick >= state.totalTicks) finish(state);
  return state;
}

export function finish(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.cfg.match.autoLiquidateAtEnd) {
    for (const t of state.traders) if (!t.bankrupt) liquidate(state, t);
  }
  state.finished = true;
  const [a, b] = state.traders;
  state.winner = a.netWorth === b.netWorth ? null : a.netWorth > b.netWorth ? 0 : 1;
  return state;
}

/** Giving up: the match ends here and the other trader takes it, whatever the book says. */
export function resign(state: MatchState, traderIdx: number): MatchState {
  if (state.finished) return state;
  state.resigned = traderIdx;
  finish(state);
  state.winner = 1 - traderIdx;
  return state;
}

export function runToEnd(state: MatchState): MatchState {
  while (!state.finished) step(state);
  return state;
}

export { applyAction, buyingPower, isShortSide, plannedQty } from './trading';
export type { MatchState, TraderState } from './types';
