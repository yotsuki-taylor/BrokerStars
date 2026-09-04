/**
 * What a company's quirk does to its price, one tick at a time.
 *
 * Three of the eleven kinds are not here: `locked`, `stall` and `headline`
 * shape the segment schedule instead (see buildSchedule), because all three
 * are about which move comes next rather than what one tick does. The rest
 * work by handing stepPrice a TickPlan — a clamp, an anchor, a drift, a pull.
 *
 * Everything is driven off `state.rng.trait`, a stream of its own, so adding a
 * trait company to a board never disturbs the prices of the plain ones.
 */

import type { Config } from './config';
import type { StockConfig, Trait, TraitKind } from './companies';
import { halfProgress, isQuarterClose, quarterTicks, type TickPlan } from './market';
import type { Rng } from './rng';

const PLAIN: Trait = { kind: 'plain' };

/** Per-match, per-stock scratch space. Everything a trait remembers lives here. */
export interface TraitState {
  kind: TraitKind;
  /** what mean reversion currently aims at */
  anchor: number;
  /** the clamp on the printed price, which some traits move mid-match */
  lo: number;
  hi: number;
  /** bubble: it has burst, and the odds have swapped */
  popped: boolean;
  /** moonshot: it has left the band it started in */
  jumped: boolean;
  /** luxury: the tick the current dip runs until, exclusive */
  dipUntil: number;
  /** ratchet: the highest price printed so far, which its floor trails */
  peak: number;
  /** the last quarter close already rolled for; -1 before the first */
  rolledClose: number;
}

export function initTraitState(stock: StockConfig): TraitState {
  const trait = stock.trait ?? PLAIN;
  const base = stock.basePrice;
  const ts: TraitState = {
    kind: trait.kind,
    anchor: base,
    lo: base * 0.2,
    hi: base * 4,
    popped: false,
    jumped: false,
    dipUntil: -1,
    peak: base,
    rolledClose: -1,
  };

  switch (trait.kind) {
    case 'floor':
      ts.lo = Math.max(ts.lo, trait.floor ?? 0);
      break;
    case 'regulated':
      ts.anchor = trait.anchor ?? base;
      break;
    case 'bubble':
      // it only ever climbs until it pops, so the floor is nominal, and the
      // ceiling has to leave room for a whole match of climbing
      ts.lo = base * 0.6;
      ts.hi = base * 2.2;
      break;
    case 'moonshot': {
      const band = trait.band ?? [base * 0.5, base];
      ts.lo = band[0];
      ts.hi = band[1];
      ts.anchor = (band[0] + band[1]) / 2;
      break;
    }
    case 'ratchet':
      // the floor starts where the price does and only ever climbs after it
      ts.lo = Math.max(ts.lo, base * (1 - (trait.giveBack ?? 0.15)));
      break;
    default:
      break;
  }
  return ts;
}

function planFrom(ts: TraitState): TickPlan {
  return {
    anchor: ts.anchor,
    lo: ts.lo,
    hi: ts.hi,
    drift: null,
    driftBias: 0,
    pullTo: null,
    pullK: 0,
    hold: false,
    setTo: null,
  };
}

/**
 * Index of the quarter close falling on this tick, or -1 for any other tick.
 * The final close is deliberately not offered: a company that jumps on the
 * whistle has done nothing to the match but deny the player the trade.
 */
function closeIndexAt(cfg: Config, tick: number): number {
  const q = quarterTicks(cfg);
  if (tick <= 0 || tick % q !== 0) return -1;
  const idx = tick / q - 1;
  return idx < cfg.match.quarters - 1 ? idx : -1;
}

/**
 * One tick of trait behaviour. Mutates `ts` and returns the plan stepPrice
 * should run under. `price` is the price going into this tick.
 */
export function traitStep(
  cfg: Config,
  stock: StockConfig,
  ts: TraitState,
  price: number,
  tick: number,
  rng: Rng,
): TickPlan {
  const trait = stock.trait ?? PLAIN;
  const plan = planFrom(ts);

  switch (trait.kind) {
    /* Regulated: it drifts where it likes for most of the half-year, and the
       closer the half-year close gets the harder the regulator pulls it back. */
    case 'regulated': {
      const window = trait.anchorWindow ?? 0.3;
      const prog = halfProgress(cfg, tick);
      if (window > 0 && prog > 1 - window) {
        const ramp = (prog - (1 - window)) / window;
        plan.pullTo = ts.anchor;
        plan.pullK = (trait.anchorPull ?? 0.15) * ramp;
      }
      break;
    }

    /* Bubble: nine ticks up in ten, until the tick it gives everything back.
       The pop is drawn per tick rather than as the flat 10% down-chance, which
       would burst it inside the first three seconds of every single match. */
    case 'bubble': {
      const rise = trait.riseChance ?? 0.9;
      const step = trait.riseStep ?? 0.006;
      const popTo = trait.popTo ?? stock.basePrice * 0.4;
      if (!ts.popped) {
        if (tick > 2 && rng.chance(trait.popChance ?? 0.01)) {
          ts.popped = true;
          ts.lo = popTo;
          ts.hi = popTo * 1.6;
          ts.anchor = popTo;
          plan.lo = ts.lo;
          plan.hi = ts.hi;
          plan.anchor = ts.anchor;
          plan.setTo = popTo;
          break;
        }
        plan.drift = rng.chance(rise) ? step : -step;
      } else {
        // the odds are the other way round now, and they stay that way
        plan.drift = rng.chance(1 - rise) ? step : -step;
      }
      break;
    }

    /* Moonshot: it lives in the basement, and each quarter close is one small
       chance to move to the top of the board for good. */
    case 'moonshot': {
      const band = trait.band ?? [stock.basePrice * 0.5, stock.basePrice];
      const mult = trait.jumpMult ?? 2;
      const idx = closeIndexAt(cfg, tick);
      if (!ts.jumped && idx >= 0 && idx > ts.rolledClose) {
        ts.rolledClose = idx;
        if (rng.chance(trait.jumpChance?.[idx] ?? 0)) {
          ts.jumped = true;
          ts.hi = band[1] * mult;
          ts.anchor = ((band[0] + band[1]) / 2) * mult;
        }
      }
      // the floor follows the price up, so the climb is one-way once it lands
      if (ts.jumped && price > band[0] * mult) ts.lo = band[0] * mult;
      plan.lo = ts.lo;
      plan.hi = ts.hi;
      plan.anchor = ts.anchor;
      break;
    }

    /* Luxury: dear and dull, until a quarter close knocks it down to the
       middle of the board for a while. */
    case 'luxury': {
      const idx = closeIndexAt(cfg, tick);
      if (idx >= 0 && idx > ts.rolledClose) {
        ts.rolledClose = idx;
        if (tick >= ts.dipUntil && rng.chance(trait.dipChance ?? 0)) {
          const span = trait.dipTicks ?? [10, 20];
          ts.dipUntil = tick + rng.int(span[0], span[1]);
        }
      }
      if (tick < ts.dipUntil) plan.anchor = stock.basePrice * (trait.dipTo ?? 0.6);
      break;
    }

    /* Dividend: it pays out at every quarter close, and the price gaps down by
       exactly what it paid. Between closes it leans up, so the notch is a
       thing to buy rather than a thing to be caught by. */
    case 'dividend': {
      const idx = closeIndexAt(cfg, tick);
      if (idx >= 0 && idx > ts.rolledClose) {
        ts.rolledClose = idx;
        plan.setTo = price * (1 - (trait.dropAtClose ?? 0.05));
        break;
      }
      plan.driftBias = trait.yieldDrift ?? 0;
      break;
    }

    /* Ratchet: inside a quarter, whatever it climbs to it keeps — the floor
       trails the highest price of that quarter and never comes back down.
       Every close wipes the mark and sets a new one under wherever the price
       now is. Without that reset the trait is free money: over a whole match
       every upward excursion is locked in and every downward one truncated,
       and buy-and-hold beat the rest of the board by 30-50%. */
    case 'ratchet': {
      const give = trait.giveBack ?? 0.15;
      const hardLo = stock.basePrice * 0.2;
      if (isQuarterClose(cfg, tick)) {
        ts.peak = price;
        ts.lo = Math.max(hardLo, price * (1 - give));
      } else if (price > ts.peak) {
        ts.peak = price;
        ts.lo = Math.max(ts.lo, price * (1 - give));
      }
      plan.lo = ts.lo;
      // the ceiling has to stay ahead of a floor that keeps climbing
      plan.hi = Math.max(plan.hi, ts.lo * 1.6);
      plan.driftBias = -(trait.drag ?? 0);
      break;
    }

    default:
      break;
  }

  return plan;
}
