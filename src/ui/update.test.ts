import { describe, expect, it } from 'vitest';
import { blocked, codeOf } from './update';

/**
 * The floor under an Android package, and the two rules that matter about it:
 * a number that cannot be read is not a low number, and an answer that did not
 * arrive is not a refusal.
 */
describe('reading this build number', () => {
  it('takes the code off the end of what the bundle carries', () => {
    expect(codeOf('1.1.2+22')).toBe(22);
    expect(codeOf('1.1.2+0')).toBe(0);
    expect(codeOf('10.20.30+123456')).toBe(123456);
  });

  /**
   * A web build whose gradle file could not be read carries a bare name, and a
   * build made before any of this existed carries nothing at all. Neither is
   * "version zero": zero is below every floor, so reading them as a number
   * would wall off exactly the builds that know least about themselves.
   */
  it('answers null rather than zero when there is no number to read', () => {
    expect(codeOf('1.1.2')).toBeNull();
    expect(codeOf('')).toBeNull();
    expect(codeOf('+')).toBeNull();
    expect(codeOf('1.1.2+')).toBeNull();
    expect(codeOf('1.1.2+beta')).toBeNull();
    expect(codeOf('1.1.2+22x')).toBeNull();
    expect(codeOf('1.1.2+-3')).toBeNull();
    expect(codeOf('1.1.2+2.5')).toBeNull();
  });

  /** `1.0.0+1+7` is not a version anybody writes, but the last one wins. */
  it('reads the last plus, not the first', () => {
    expect(codeOf('1.0.0+1+7')).toBe(7);
  });
});

describe('deciding whether to put the wall up', () => {
  it('blocks a package below the floor and nothing else', () => {
    expect(blocked(21, 22)).toBe(true);
    expect(blocked(22, 22)).toBe(false);
    expect(blocked(23, 22)).toBe(false);
  });

  /** The resting state of the server, and it must block nobody. */
  it('blocks nobody at a floor of zero', () => {
    expect(blocked(0, 0)).toBe(false);
    expect(blocked(22, 0)).toBe(false);
  });

  /**
   * Every unknown carries on. A wall thrown up because a request timed out
   * would be a game that stops working when the network hiccups, which is a
   * worse failure than the one being defended against.
   */
  it('carries on when either number is unknown', () => {
    expect(blocked(null, 22)).toBe(false);
    expect(blocked(21, null)).toBe(false);
    expect(blocked(null, null)).toBe(false);
  });
});
