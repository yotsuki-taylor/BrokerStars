import { describe, expect, it } from 'vitest';
import { mintToken, verdictOf } from './api';

/**
 * What to do with a match that did not go through.
 *
 * This is a short function and it decides something that cannot be seen going
 * wrong: the coin balance is the server's now, so a match dropped instead of
 * kept is coins the player earned and will never be paid. Keeping one that will
 * never be accepted is the other mistake, and it is only a queue that never
 * empties.
 */
describe('what became of a submission', () => {
  it('is done when the server took it', () => {
    expect(verdictOf({ status: 200, body: { ok: true } })).toBe('done');
    // a repeat of a match already paid for answers 200 as well, on purpose
    expect(verdictOf({ status: 200, body: { ok: true, already: true } })).toBe('done');
  });

  it('is kept when nothing came back at all', () => {
    // the ambiguous one: the write may well have landed and only the answer got
    // lost. Sending it again is safe because the token makes it safe.
    expect(verdictOf(null)).toBe('retry');
  });

  it('is kept, without spending a life, when the server says not yet', () => {
    expect(verdictOf({ status: 429, body: null })).toBe('later');
  });

  it('is kept while the server is having a moment', () => {
    expect(verdictOf({ status: 500, body: null })).toBe('retry');
    expect(verdictOf({ status: 503, body: null })).toBe('retry');
  });

  it('is let go when the server will refuse it just as hard tomorrow', () => {
    expect(verdictOf({ status: 400, body: null })).toBe('drop');
    expect(verdictOf({ status: 401, body: null })).toBe('drop');
    expect(verdictOf({ status: 403, body: null })).toBe('drop');
  });
});

describe('naming a match', () => {
  it('gives every one of them a different name', () => {
    const names = new Set(Array.from({ length: 500 }, mintToken));
    expect(names.size).toBe(500);
  });
});
