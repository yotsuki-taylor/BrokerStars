import type { Config, PhaseConfig } from './config';
import type { StockConfig } from './companies';
import { Rng } from './rng';

export interface Segment {
  start: number; // inclusive tick
  end: number; // exclusive tick
  dir: -1 | 0 | 1;
  strength: 0 | 1 | 2 | 3;
  isNews: boolean;
  /** dead flat: the price is held exactly, noise included (PIXEL ARENA's stalls) */
  frozen?: boolean;
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

/* ------------------------------------------------------------- quarters */

/**
 * The match is a business year: four quarters, and two half-years made of
 * them. The chart rules them off and several companies key their behaviour to
 * the closes, so this is the one place the arithmetic lives.
 */
export function quarterTicks(cfg: Config): number {
  return Math.max(1, Math.round(totalTicks(cfg) / cfg.match.quarters));
}

/** Which quarter a tick falls in, 0-based and clamped to the last one. */
export function quarterOf(cfg: Config, tick: number): number {
  const q = Math.floor(tick / quarterTicks(cfg));
  return Math.min(cfg.match.quarters - 1, Math.max(0, q));
}

/** The tick each quarter closes on, first to last. */
export function quarterCloses(cfg: Config): number[] {
  const step = quarterTicks(cfg);
  return Array.from({ length: cfg.match.quarters }, (_, i) => (i + 1) * step);
}

/** True on the tick a quarter closes. */
export function isQuarterClose(cfg: Config, tick: number): boolean {
  return tick > 0 && tick % quarterTicks(cfg) === 0;
}

/**
 * How far through the current half-year a tick sits, 0 at the open and 1 at
 * the close. A half-year is two quarters.
 */
export function halfProgress(cfg: Config, tick: number): number {
  const half = quarterTicks(cfg) * 2;
  const into = ((tick % half) + half) % half;
  return into === 0 && tick > 0 ? 1 : into / half;
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

/** Draws 1, 2 or 3 from a weight triple, falling back to a single move. */
function runLength(weights: [number, number, number] | undefined, rng: Rng): number {
  if (!weights) return 1;
  const total = weights[0] + weights[1] + weights[2];
  if (total <= 0) return 1;
  const r = rng.next() * total;
  if (r < weights[0]) return 1;
  if (r < weights[0] + weights[1]) return 2;
  return 3;
}

/**
 * The whole future of one stock, generated up front. Trades never rewrite it —
 * market impact is added on top of the prices it produces, so replaying a seed
 * with the same actions reproduces the match tick for tick.
 *
 * Three traits shape the schedule rather than the price step, because all
 * three are about which segment comes next rather than what one tick does:
 * `locked` keeps a direction across a run of segments, `stall` swaps a segment
 * for a stretch where nothing at all happens, and `headline` turns one into a
 * full-strength news move the banner announces.
 */
export function buildSchedule(
  stock: StockConfig,
  rng: Rng,
  total: number,
  newsTicks: number[],
): Segment[] {
  const trait = stock.trait;
  const segs: Segment[] = [];
  const pending = [...newsTicks].sort((a, b) => a - b);
  let t = 0;
  // locked: what is left of the current committed run, and where it points
  let runLeft = 0;
  let runDir: -1 | 1 = 1;
  while (t < total) {
    let len = rng.int(stock.segmentTicks[0], stock.segmentTicks[1]);
    let isNews = false;
    if (pending.length && t >= pending[0]) {
      pending.shift();
      isNews = true;
    } else if (t > 0 && trait?.kind === 'headline' && rng.chance(trait.headlineChance ?? 0)) {
      // This company makes its own news, on top of whatever the phase planned.
      // Never on the opening segment: the banner fires on the tick a segment
      // starts and the match starts at tick 1, so that one would move the
      // price with nothing on screen to say why.
      isNews = true;
    }
    let dir: -1 | 0 | 1;
    let strength: 0 | 1 | 2 | 3;
    let frozen = false;
    if (isNews) {
      dir = rng.chance(0.5) ? 1 : -1;
      strength = 3;
      len = Math.round(len * 1.6);
      runLeft = 0; // a headline breaks whatever run was under way
    } else if (trait?.kind === 'stall' && rng.chance(trait.stallChance ?? 0)) {
      dir = 0;
      strength = 0;
      frozen = true;
      const span = trait.stallTicks ?? [4, 10];
      len = rng.int(span[0], span[1]);
    } else if (trait?.kind === 'locked') {
      if (runLeft <= 0) {
        runLeft = runLength(trait.runWeights, rng);
        runDir = rng.chance(0.5) ? 1 : -1;
      }
      runLeft--;
      dir = runDir;
      // never a limp move: the whole point is that the run is readable
      strength = rng.chance(0.45) ? 2 : 3;
    } else if (rng.chance(0.15)) {
      dir = 0;
      strength = 0;
    } else {
      dir = rng.chance(0.5) ? 1 : -1;
      const r = rng.next();
      strength = r < 0.4 ? 1 : r < 0.75 ? 2 : 3;
    }
    segs.push({ start: t, end: Math.min(t + len, total), dir, strength, isNews, frozen });
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

/**
 * One tick's worth of trait interference, produced by traits.ts and consumed
 * here. A plain company gets `plainPlan`, which reproduces the market exactly
 * as it behaved before traits existed.
 */
export interface TickPlan {
  /** what mean reversion aims at */
  anchor: number;
  /** the clamp on the printed price */
  lo: number;
  hi: number;
  /** replaces the segment's drift outright, or null to keep it */
  drift: number | null;
  /** added on top of whatever drift the tick ended up with */
  driftBias: number;
  /** after the step, close this share of the gap to `pullTo` */
  pullTo: number | null;
  pullK: number;
  /** hold the price exactly where it is, noise included */
  hold: boolean;
  /** set the price to this and let nothing else touch it */
  setTo: number | null;
}

export function plainPlan(stock: StockConfig): TickPlan {
  return {
    anchor: stock.basePrice,
    lo: stock.basePrice * 0.2,
    hi: stock.basePrice * 4,
    drift: null,
    driftBias: 0,
    pullTo: null,
    pullK: 0,
    hold: false,
    setTo: null,
  };
}

export interface PriceStepInput {
  price: number;
  impact: number;
  stock: StockConfig;
  segment: Segment | undefined;
  volMult: number;
  decayPerTick: number;
  rng: Rng;
  /** trait interference for this tick; omitted means a plain company */
  plan?: TickPlan;
}

export interface PriceStepResult {
  price: number;
  impact: number;
}

export function stepPrice(inp: PriceStepInput): PriceStepResult {
  const { stock, segment, volMult, rng } = inp;
  const plan = inp.plan ?? plainPlan(stock);
  const decayed = inp.impact * (1 - inp.decayPerTick);

  // A frozen segment or a holding trait means exactly that: no drift, no
  // noise, not even the mean reversion. The line goes flat on the chart.
  if (plan.hold || segment?.frozen) return { price: inp.price, impact: decayed };

  const dir = segment?.dir ?? 0;
  const strength = segment?.strength ?? 0;
  const segDrift =
    (plan.drift ?? dir * strength * stock.driftPerStrength * volMult) + plan.driftBias;
  const noise = rng.gauss(stock.noiseSigma * volMult);
  const reversion = plan.anchor > 0 ? stock.meanReversion * ((plan.anchor - inp.price) / plan.anchor) : 0;
  let p = inp.price * (1 + segDrift + noise + reversion) + inp.impact;
  if (plan.pullTo !== null && plan.pullK > 0) p += (plan.pullTo - p) * plan.pullK;
  if (plan.setTo !== null) p = plan.setTo;
  p = Math.min(plan.hi, Math.max(plan.lo, p));
  return { price: p, impact: decayed };
}
