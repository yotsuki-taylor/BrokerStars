/**
 * The clock a duel's chart runs on.
 *
 * A match against a bot is stepped by this phone, so the line moves exactly as
 * often as the screen redraws and there is nothing to smooth. A duel is not: the
 * ticks are the server's and they arrive over a network, early, late, sometimes
 * two together. What the chart does with that arrival pattern is this file.
 *
 * WHY NOT JUST DRAW THE LAST TICK THAT ARRIVED. Because that draws every wobble
 * in the network. A tick 90ms late pins the line against the newest price it has
 * and holds it there for 90ms; the next one arriving early throws it forward
 * instead. That is several visible hitches a second on a connection that is
 * working perfectly well, and it is what "everything was freezing" was.
 *
 * So the line keeps a clock of its own. It advances by itself, a tick per
 * tickMs, and the arrivals only bend its *speed* — never its position — towards
 * where they say it ought to be. Correcting the speed rather than the position
 * is the whole trick: a line moving 10% fast for half a second is invisible, and
 * a line teleported 10% forward is not.
 *
 * Nothing anybody taps is delayed by this. The tap goes up the socket at once
 * and the numbers move the moment the answer lands. Only the line is held back.
 */

export interface Line {
  /** where the right-hand edge has got to, in ticks */
  pos: number;
  /** how fast it is moving, in ticks per tick of real time */
  speed: number;
}

/**
 * How far behind the *predicted* server clock the line deliberately runs.
 *
 * The reserve a late tick is spent out of. Too little and the line runs out of
 * drawn market and stops against `pos <= tick`, which is a stutter; too much
 * and the chart trails the numbers beside it.
 *
 * MEASURE BEFORE TOUCHING THIS. It is the obvious knob to reach for when a
 * chart misbehaves and it was the wrong one for the bug it is written under:
 * "the chart jumps in PvP" was `headOf` in `ui/chart.ts` extrapolating off the
 * end of a segment, and a bigger reserve would have made that worse by putting
 * the edge further back still. `line.test.ts` measures both halves of the trade
 * at several jitters.
 *
 * Note what the number is measured FROM. It is subtracted from a guess at where
 * the server's clock is, which is already up to a whole tick ahead of the last
 * arrival — so 0.45 here is about 0.9 ticks behind the newest price on average,
 * not half of one. Anything that reads `progress` has to expect it below zero.
 */
export const LAG = 0.45;

/** How hard a frame reads the error into the line's speed. */
const GAIN = 1.0;
/** How quickly the speed itself may change. */
const EASE = 0.1;
/** What stops a catch-up from becoming a lurch. */
const SPEED_MIN = 0.7;
const SPEED_MAX = 1.4;

export const startLine = (): Line => ({ pos: 0, speed: 1 });

/**
 * One frame of it.
 *
 * `tick` is the newest tick the server has sent, `sinceTick` how long ago that
 * one arrived, `dt` how long this frame is — all in milliseconds except the
 * tick, which is a count.
 */
export function advance(
  line: Line,
  at: { tick: number; sinceTick: number; dt: number; tickMs: number },
): Line {
  const { tick, sinceTick, dt, tickMs } = at;

  // Where the server's clock probably is, less the reserve. A guess about the
  // *speed* of the far end, which is a thing that barely changes, rather than a
  // guess about the next price, which is a thing we are never told early.
  const target = tick - 1 + sinceTick / tickMs - LAG;

  const want = Math.min(SPEED_MAX, Math.max(SPEED_MIN, 1 + (target - line.pos) * GAIN));
  const speed = line.speed + (want - line.speed) * EASE;

  // Never past the newest price we were sent — that would be drawing a market
  // nobody has told us about. Behind it is fine: the chart reads `progress` as
  // where the right-hand edge has got to, and a small one merely keeps the
  // latest point out of frame a moment longer.
  const pos = Math.min(tick, line.pos + (dt / tickMs) * speed);

  return { pos, speed };
}

/** Where inside the newest tick the line is, which is what the chart draws. */
export const progressOf = (line: Line, tick: number): number => line.pos - (tick - 1);

/** Is the line held against the newest price, with nothing left to draw? */
export const stalled = (line: Line, tick: number): boolean => line.pos >= tick;
