import type { Config, PhaseConfig, StockConfig } from './config';
import { Rng } from './rng';

export interface Segment {
  start: number; // inclusive tick
  end: number; // exclusive tick
  dir: -1 | 0 | 1;
  strength: 0 | 1 | 2 | 3;
  isNews: boolean;
}

export interface NeutralPhase {
  id: string;
  volMult: number;
  truthShift: number;
}

const NEUTRAL: NeutralPhase = { id: 'flat', volMult: 1, truthShift: 0 };

export function phaseAtTick(cfg: Config, tick: number): PhaseConfig | NeutralPhase {
  if (!cfg.flags.phases) return NEUTRAL;
  const sec = (tick * cfg.match.tickMs) / 1000;
  for (const p of cfg.phases) {
    if (sec >= p.fromSec && sec < p.toSec) return p;
  }
  return cfg.phases[cfg.phases.length - 1] ?? NEUTRAL;
}

export function totalTicks(cfg: Config): number {
  return Math.round((cfg.match.durationSec * 1000) / cfg.match.tickMs);
}

/** Which ticks, and on which stock, the news phase fires its forced segments. */
export function planNewsEvents(cfg: Config, rng: Rng): { tick: number; stockIdx: number }[] {
  if (!cfg.flags.phases) return [];
  const out: { tick: number; stockIdx: number }[] = [];
  for (const phase of cfg.phases) {
    const count = phase.newsEvents ?? 0;
    if (!count) continue;
    const from = Math.round((phase.fromSec * 1000) / cfg.match.tickMs);
    const to = Math.round((phase.toSec * 1000) / cfg.match.tickMs);
    const span = Math.max(1, Math.floor((to - from) / count));
    for (let i = 0; i < count; i++) {
      const lo = from + i * span;
      const hi = Math.min(to - 2, lo + span - 1);
      out.push({ tick: rng.int(lo, Math.max(lo, hi)), stockIdx: rng.int(0, cfg.stocks.length - 1) });
    }
  }
  return out.sort((a, b) => a.tick - b.tick);
}

/**
 * The whole future of one stock, generated up front. Trades never rewrite it —
 * market impact is added on top of the prices it produces, so replaying a seed
 * with the same actions reproduces the match tick for tick.
 */
export function buildSchedule(
  stock: StockConfig,
  rng: Rng,
  total: number,
  newsTicks: number[],
): Segment[] {
  const segs: Segment[] = [];
  const pending = [...newsTicks].sort((a, b) => a - b);
  let t = 0;
  while (t < total) {
    let len = rng.int(stock.segmentTicks[0], stock.segmentTicks[1]);
    let isNews = false;
    if (pending.length && t >= pending[0]) {
      pending.shift();
      isNews = true;
    }
    let dir: -1 | 0 | 1;
    let strength: 0 | 1 | 2 | 3;
    if (isNews) {
      dir = rng.chance(0.5) ? 1 : -1;
      strength = 3;
      len = Math.round(len * 1.6);
    } else if (rng.chance(0.15)) {
      dir = 0;
      strength = 0;
    } else {
      dir = rng.chance(0.5) ? 1 : -1;
      const r = rng.next();
      strength = r < 0.4 ? 1 : r < 0.75 ? 2 : 3;
    }
    segs.push({ start: t, end: Math.min(t + len, total), dir, strength, isNews });
    t += len;
  }
  return segs;
}

export function segmentAt(segs: Segment[], tick: number): Segment | undefined {
  for (let i = 0; i < segs.length; i++) {
    if (tick >= segs[i].start && tick < segs[i].end) return segs[i];
  }
  return undefined;
}

export interface PriceStepInput {
  price: number;
  impact: number;
  stock: StockConfig;
  segment: Segment | undefined;
  volMult: number;
  decayPerTick: number;
  rng: Rng;
}

export interface PriceStepResult {
  price: number;
  impact: number;
}

export function stepPrice(inp: PriceStepInput): PriceStepResult {
  const { stock, segment, volMult, rng } = inp;
  const dir = segment?.dir ?? 0;
  const strength = segment?.strength ?? 0;
  const segDrift = dir * strength * stock.driftPerStrength * volMult;
  const noise = rng.gauss(stock.noiseSigma * volMult);
  const reversion = stock.meanReversion * ((stock.basePrice - inp.price) / stock.basePrice);
  let p = inp.price * (1 + segDrift + noise + reversion) + inp.impact;
  const lo = stock.basePrice * 0.2;
  const hi = stock.basePrice * 4;
  p = Math.min(hi, Math.max(lo, p));
  return { price: p, impact: inp.impact * (1 - inp.decayPerTick) };
}
