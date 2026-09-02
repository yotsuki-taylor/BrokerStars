import { describe, expect, it } from 'vitest';
import { AXIS_TAU_MS, easeAxis, type AxisDomain } from './chart';

const FRAME = 16.7;
/** Does the drawn axis still cover everything that is on screen? */
const covers = (d: AxisDomain, fit: AxisDomain) => d.lo <= fit.lo && d.hi >= fit.hi;

describe('the vertical axis glide', () => {
  it('widens on the very frame a spike needs the room', () => {
    // the line has just shot past the top of the frame
    const fit = { lo: -10, hi: 40 };
    const out = easeAxis({ lo: -12, hi: 12 }, { lo: -16, hi: 46 }, fit, FRAME);
    expect(out.hi).toBe(40);
    expect(covers(out, fit)).toBe(true);
  });

  it('gives back the slack slowly instead of snapping', () => {
    // an old extreme has scrolled off the left edge, so the fit collapses
    const prev = { lo: -30, hi: 30 };
    const target = { lo: -6, hi: 6 };
    const out = easeAxis(prev, target, { lo: -5, hi: 5 }, FRAME);
    expect(out.hi).toBeLessThan(prev.hi);
    expect(out.hi).toBeGreaterThan(target.hi);
    // a single frame moves only a few percent of the way
    expect((prev.hi - out.hi) / (prev.hi - target.hi)).toBeLessThan(0.1);
  });

  it('closes the gap on an exponential curve, not a linear one', () => {
    // half a time constant, so the 250 ms frame cap does not bite
    const dt = AXIS_TAU_MS / 2;
    const out = easeAxis({ lo: 0, hi: 100 }, { lo: 0, hi: 0 }, { lo: 0, hi: 0 }, dt);
    const moved = (100 - out.hi) / 100;
    expect(moved).toBeCloseTo(1 - Math.exp(-0.5), 3);
  });

  it('converges on the target when nothing else moves', () => {
    let d = { lo: -30, hi: 30 };
    const target = { lo: -6, hi: 6 };
    for (let i = 0; i < 120; i++) d = easeAxis(d, target, { lo: -5, hi: 5 }, FRAME);
    expect(d.hi).toBeCloseTo(target.hi, 1);
    expect(d.lo).toBeCloseTo(target.lo, 1);
  });

  it('never hides a visible point, whatever the frame time', () => {
    let d = { lo: -8, hi: 8 };
    for (const dt of [0, 1, FRAME, 100, 250, 5000, -5, NaN]) {
      // a fit that keeps outgrowing the eased domain in both directions
      const fit = { lo: d.lo - 3, hi: d.hi + 3 };
      d = easeAxis(d, { lo: fit.lo - 2, hi: fit.hi + 2 }, fit, dt);
      expect(covers(d, fit)).toBe(true);
    }
  });

  it('caps a long frame so a stalled tab does not jump the whole way', () => {
    const prev = { lo: 0, hi: 100 };
    const target = { lo: 0, hi: 0 };
    const long = easeAxis(prev, target, target, 5000);
    const capped = easeAxis(prev, target, target, 250);
    expect(long.hi).toBe(capped.hi);
    expect(long.hi).toBeGreaterThan(0);
  });

  it('does not move on a zero-length frame', () => {
    const prev = { lo: -30, hi: 30 };
    const out = easeAxis(prev, { lo: -6, hi: 6 }, { lo: -5, hi: 5 }, 0);
    expect(out).toEqual(prev);
  });
});
