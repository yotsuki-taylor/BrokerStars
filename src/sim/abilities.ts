/**
 * Abilities: the one thing a trader can do in a match that is not a trade.
 *
 * Every trader carries at most one, fires it at most once, and it takes no
 * target — the target is read off the board at the moment it goes off. That is
 * deliberate: the match is 80 seconds on a phone, and a targeting mode would
 * cost more taps than the ability is worth. The decision an ability asks for is
 * *when*, not *what*, and when is the harder question anyway.
 *
 * All of this lives in the sim rather than the UI because it moves prices and
 * blocks trades, and because a match has to replay identically from its seed.
 * Nothing here draws on RNG, so the same match with the same taps is the same
 * match.
 */

import { applyAction } from './trading';
import type { MatchState, TraderState } from './types';

export type AbilityId = 'static' | 'halt' | 'dossier' | 'margincall' | 'rumour';

export const ABILITY_IDS: AbilityId[] = ['static', 'halt', 'dossier', 'margincall', 'rumour'];

interface AbilitySpec {
  /** how long the effect runs; 0 for the ones that land and are done */
  seconds: number;
}

export const ABILITIES: Record<AbilityId, AbilitySpec> = {
  static: { seconds: 5 },
  halt: { seconds: 10 },
  dossier: { seconds: 0 },
  margincall: { seconds: 0 },
  rumour: { seconds: 6 },
};

/**
 * How hard a rumour leans on a price, per tick, as a share of the price.
 *
 * It is fed through the same `impact` channel a big order uses, which is a
 * push and not an offset: `stepPrice` adds the impact to the price every tick,
 * so what the rumour does is *relocate* the price rather than hold it up and
 * let go. Hence `permanentCoef` next door — the same thing is true of a large
 * order. What walks it back afterwards is the company's own mean reversion,
 * on its own schedule, which is why the ability is worth having and why it
 * still cannot be sat on: the push stops the moment the six seconds are up.
 */
const RUMOUR_PER_TICK = 0.012;

/** How long a trader reads as "just hit" after something lands on them. */
const HIT_TICKS = 4;

export interface AbilityState {
  /** per trader: tick until which they may not OPEN or add to a position */
  blockedUntil: number[];
  /** per stock: tick until which nobody may trade it at all */
  frozenUntil: number[];
  /** the rumour now running, if any */
  rumour: { stock: number; dir: 1 | -1; until: number } | null;
  /** per trader: whether they can read the other one's book */
  seesBook: boolean[];
  /** per trader: tick until which the UI should show them as hit */
  hitUntil: number[];
}

export function initAbilities(traders: number, stocks: number): AbilityState {
  const zeros = (n: number) => Array.from({ length: n }, () => -1);
  return {
    blockedUntil: zeros(traders),
    frozenUntil: zeros(stocks),
    rumour: null,
    seesBook: Array.from({ length: traders }, () => false),
    hitUntil: zeros(traders),
  };
}

const ticksFor = (state: MatchState, seconds: number) =>
  Math.max(1, Math.round((seconds * 1000) / state.cfg.match.tickMs));

/** The stock a trader has the most money riding on, or -1 when they are flat. */
export function biggestPosition(state: MatchState, t: TraderState): number {
  let best = -1;
  let size = 0;
  for (let i = 0; i < state.stocks.length; i++) {
    const v = Math.abs(t.positions[i] * state.stocks[i].price);
    if (v > size) {
      size = v;
      best = i;
    }
  }
  return best;
}

const other = (state: MatchState, idx: number) => state.traders[1 - idx] ?? state.traders[idx];

/**
 * Whether the button should be live. Beyond having an unspent ability, two of
 * the five need something on the board to point at: a rumour needs a position
 * of your own to push, and a halt needs one of theirs to freeze.
 */
export function canUseAbility(state: MatchState, idx: number): boolean {
  const t = state.traders[idx];
  if (state.finished || t.bankrupt || !t.ability || t.abilityUsed) return false;
  if (t.ability === 'rumour') return biggestPosition(state, t) >= 0;
  if (t.ability === 'halt') return biggestPosition(state, other(state, idx)) >= 0;
  return true;
}

/**
 * Fire it. Returns false when it could not go off, in which case the use is
 * not spent — a dead tap must never cost the player their one ability.
 */
export function useAbility(state: MatchState, idx: number): boolean {
  if (!canUseAbility(state, idx)) return false;
  const t = state.traders[idx];
  const foe = other(state, idx);
  const ab = state.abilities;
  const id = t.ability!;
  const span = ticksFor(state, ABILITIES[id].seconds);

  switch (id) {
    case 'static':
      // they keep what they hold and can still get out of it; what they lose is
      // the right to start anything new
      ab.blockedUntil[foe.idx] = state.tick + span;
      ab.hitUntil[foe.idx] = state.tick + span;
      break;

    case 'halt': {
      // whatever they are most committed to, shut for both of us
      const s = biggestPosition(state, foe);
      if (s < 0) return false;
      ab.frozenUntil[s] = state.tick + span;
      ab.hitUntil[foe.idx] = state.tick + span;
      break;
    }

    case 'dossier':
      ab.seesBook[idx] = true;
      break;

    case 'margincall':
      // flatten them where they stand, at the mid: this is meant to take the
      // rest of a move away, not to charge them a spread for the privilege
      for (let i = 0; i < state.stocks.length; i++) {
        if (!foe.positions[i]) continue;
        applyAction(state, {
          trader: foe.idx,
          stock: i,
          side: foe.positions[i] > 0 ? 'sell' : 'buy',
          fraction: 1,
          noSlip: true,
          force: true,
        });
      }
      ab.hitUntil[foe.idx] = state.tick + HIT_TICKS;
      break;

    case 'rumour': {
      const s = biggestPosition(state, t);
      if (s < 0) return false;
      ab.rumour = { stock: s, dir: t.positions[s] > 0 ? 1 : -1, until: state.tick + span };
      break;
    }
  }

  t.abilityUsed = true;
  return true;
}

/**
 * One tick of whatever is still running. Called before prices step, so a rumour
 * leans on the very tick it was started on.
 */
export function abilityStep(state: MatchState): void {
  const r = state.abilities.rumour;
  if (!r) return;
  if (state.tick >= r.until) {
    state.abilities.rumour = null;
    return;
  }
  const st = state.stocks[r.stock];
  st.impact += st.price * RUMOUR_PER_TICK * r.dir;
}

/* ------------------------------------------------------- what they forbid */

/*
 * All three are half-open: fired at tick T for a span of N, an effect covers
 * ticks T through T+N-1, so "five seconds" is five seconds of ticks and not one
 * more. trading.ts compares the same way — see `shutOut` there.
 */

/** True while this trader may not start anything new. */
export function isBlocked(state: MatchState, idx: number): boolean {
  return state.tick < state.abilities.blockedUntil[idx];
}

/** True while nobody may touch this company. */
export function isFrozen(state: MatchState, stock: number): boolean {
  return state.tick < state.abilities.frozenUntil[stock];
}

/** True while this trader should be drawn as having just taken one. */
export function isHit(state: MatchState, idx: number): boolean {
  return state.tick < state.abilities.hitUntil[idx];
}
