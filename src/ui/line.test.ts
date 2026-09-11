import { describe, expect, it } from 'vitest';
import { advance, progressOf, stalled, startLine, LAG, type Line } from './line';

/**
 * The chart's clock, run against the thing it exists for: ticks that do not
 * arrive when they are due.
 *
 * These are not assertions about pixels. They are about two numbers a player
 * actually sees — whether the line ever STOPS (which reads as a stutter, and is
 * what "the chart jumps in PvP" was), and the worst single FRAME step (which
 * reads as a jolt). A run is sixty seconds of match at sixty frames a second.
 */

const TICK_MS = 500;
const FRAME_MS = 1000 / 60;
const TICKS = 120;

/** A repeatable wobble, so a failing run can be looked at twice. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Run {
  /** share of frames with the line held against the newest price */
  stalls: number;
  /** longest unbroken stall, in milliseconds */
  worstStallMs: number;
  /** biggest single frame step, as a multiple of an ordinary one */
  worstStep: number;
  /** how far behind the newest tick the line sits, on average, in ticks */
  meanLag: number;
}

/**
 * Play the arrival pattern through the clock and watch the line.
 *
 * `jitterMs` is how far either side of its due time a tick may land. Arrivals
 * keep their order and the clock never runs backwards, which is what a socket
 * gives you.
 */
function run(jitterMs: number, seed = 1, lag = LAG): Run {
  const rnd = noise(seed);
  const due: number[] = [];
  for (let t = 1; t <= TICKS; t++) {
    due.push(t * TICK_MS + (rnd() * 2 - 1) * jitterMs);
  }
  // a socket delivers in order: a tick cannot overtake the one before it
  for (let i = 1; i < due.length; i++) due[i] = Math.max(due[i], due[i - 1] + 1);

  let line: Line = startLine();
  let tick = 0;
  let arrivedAt = 0;
  let next = 0;

  let frames = 0;
  let stalls = 0;
  let stallRun = 0;
  let worstStall = 0;
  let worstStep = 0;
  let lagSum = 0;

  for (let now = 0; now <= TICKS * TICK_MS; now += FRAME_MS) {
    while (next < due.length && due[next] <= now) {
      tick = next + 1;
      arrivedAt = now;
      next++;
    }
    if (tick === 0) continue;

    const before = line.pos;
    line = advanceWith(line, { tick, sinceTick: now - arrivedAt, dt: FRAME_MS, tickMs: TICK_MS }, lag);

    frames++;
    lagSum += tick - line.pos;
    const step = (line.pos - before) / (FRAME_MS / TICK_MS);
    if (step > worstStep) worstStep = step;

    if (stalled(line, tick)) {
      stalls++;
      stallRun += FRAME_MS;
      if (stallRun > worstStall) worstStall = stallRun;
    } else stallRun = 0;
  }

  return {
    stalls: stalls / frames,
    worstStallMs: worstStall,
    worstStep,
    meanLag: lagSum / frames,
  };
}

/**
 * The same maths at a lag of our choosing, so the choice can be compared
 * against the one it replaced rather than asserted. Kept to this file: nothing
 * in the game may pick its own lag.
 */
function advanceWith(
  line: Line,
  at: { tick: number; sinceTick: number; dt: number; tickMs: number },
  lag: number,
): Line {
  if (lag === LAG) return advance(line, at);
  const target = at.tick - 1 + at.sinceTick / at.tickMs - lag;
  const want = Math.min(1.4, Math.max(0.7, 1 + (target - line.pos) * 1.0));
  const speed = line.speed + (want - line.speed) * 0.1;
  return { pos: Math.min(at.tick, line.pos + (at.dt / at.tickMs) * speed), speed };
}

describe('a line drawn from ticks that arrive when they feel like it', () => {
  it('never stops on a connection doing its job', () => {
    const r = run(0);
    expect(r.stalls).toBe(0);
    expect(r.worstStep).toBeLessThan(1.45);
  });

  it('barely stops at the jitter of an ordinary mobile connection', () => {
    // ±200ms at a 500ms tick. Not never: a reserve is a reserve and a bad
    // enough arrival spends all of it. Rare enough not to be the complaint.
    for (const seed of [1, 2, 3, 7, 99]) {
      const r = run(200, seed);
      expect(r.stalls).toBeLessThan(0.02);
      expect(r.worstStep).toBeLessThan(1.45);
    }
  });

  it('never lurches, however bad it gets', () => {
    // the speed bound is what buys this, and it holds even when the reserve
    // is long gone
    for (const seed of [1, 5, 42]) {
      expect(run(450, seed).worstStep).toBeLessThan(1.45);
    }
  });

  it('buys quiet with staleness, which is the only knob there is', () => {
    // Both directions of the trade, measured, because the temptation when a
    // chart misbehaves is to reach for this number -- and on the bug this was
    // written for, reaching for it would have made things worse rather than
    // better. A bigger reserve puts the edge further back, and the edge going
    // further back is what `headOf` in `ui/chart.ts` was getting wrong.
    const small = run(300, 1, 0.45);
    const big = run(300, 1, 1.0);
    expect(big.stalls).toBeLessThan(small.stalls);
    expect(big.meanLag).toBeGreaterThan(small.meanLag);
  });

  it('runs about a tick behind the newest price it has been sent', () => {
    // Which is the fact the drawing has to cope with: the edge is regularly
    // more than one whole tick back, so a head read as a position inside the
    // newest tick is being asked for a sample that is not there.
    const r = run(200, 1);
    expect(r.meanLag).toBeGreaterThan(0.6);
    expect(r.meanLag).toBeLessThan(1.4);
  });
});

describe('what the chart is handed', () => {
  it('reads as a position inside the newest tick', () => {
    expect(progressOf({ pos: 7.25, speed: 1 }, 8)).toBeCloseTo(0.25);
    expect(progressOf({ pos: 8, speed: 1 }, 8)).toBeCloseTo(1);
  });

  it('starts at the beginning rather than somewhere', () => {
    expect(startLine()).toEqual({ pos: 0, speed: 1 });
  });

  it('is never drawn past a price nobody has sent', () => {
    // a frame so long it would overshoot -- a tab coming back from the
    // background, which is where this clamp earns its keep
    const line = advance({ pos: 5.9, speed: 1.4 }, { tick: 6, sinceTick: 0, dt: 5000, tickMs: 500 });
    expect(line.pos).toBe(6);
  });
});
