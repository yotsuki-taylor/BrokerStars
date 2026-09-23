import { describe, expect, it } from 'vitest';
import { MAX_QUEUE, capped, outcomeOf } from './analytics';

/**
 * The two decisions the queue on the phone makes, and both can only be seen
 * going wrong in aggregate: a queue that keeps what the server will never take
 * never empties, and one that drops what it could have sent later loses the
 * very evening a phone spent offline.
 */
describe('what becomes of a batch', () => {
  it('leaves the queue once the server has it', () => {
    expect(outcomeOf(200)).toBe('sent');
  });

  it('leaves the queue when the server will refuse it for ever', () => {
    // not a batch this game built, or too big to be one: sending it again
    // changes nothing
    expect(outcomeOf(400)).toBe('sent');
    expect(outcomeOf(413)).toBe('sent');
  });

  it('stays while nobody can be told who it belongs to', () => {
    // a session the server no longer takes; the next one this phone gets is
    // the same person, and the events wait for it
    expect(outcomeOf(401)).toBe('keep');
  });

  it('stays when nothing came back or the server is having a moment', () => {
    expect(outcomeOf(null)).toBe('keep');
    expect(outcomeOf(500)).toBe('keep');
    expect(outcomeOf(503)).toBe('keep');
    expect(outcomeOf(429)).toBe('keep');
  });
});

describe('the ceiling on the phone', () => {
  it('drops the oldest first', () => {
    const q = Array.from({ length: MAX_QUEUE + 3 }, (_, i) => i);
    const kept = capped(q);
    expect(kept).toHaveLength(MAX_QUEUE);
    expect(kept[0]).toBe(3);
    expect(kept[kept.length - 1]).toBe(MAX_QUEUE + 2);
  });

  it('leaves a queue under the ceiling alone', () => {
    const q = [1, 2, 3];
    expect(capped(q)).toBe(q);
  });
});
