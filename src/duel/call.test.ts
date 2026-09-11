import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanCall } from './protocol';

/**
 * A duel call is the one thing in this game that arrives unasked and offers to
 * take the player somewhere, so what it refuses matters more than what it
 * accepts: a banner naming a duel that has already closed sends somebody into
 * a lobby that will tell them no.
 */

const soon = () => Date.now() + 60_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('a call from the server', () => {
  it('reads the three things a banner needs', () => {
    const at = soon();
    expect(cleanCall({ code: 'BCDF2345', from: 'MASHA', expiresAt: at })).toEqual({
      code: 'bcdf2345',
      from: 'MASHA',
      expiresAt: at,
    });
  });

  it('refuses one that expired while it was travelling', () => {
    // the row was alive when the server read it; the answer may have sat in a
    // queue, and the clock this side is the one the player is looking at
    expect(cleanCall({ code: 'BCDF2345', from: 'MASHA', expiresAt: Date.now() - 1 })).toBeNull();
  });

  it('refuses one with no code to join', () => {
    expect(cleanCall({ from: 'MASHA', expiresAt: soon() })).toBeNull();
    expect(cleanCall({ code: '', from: 'MASHA', expiresAt: soon() })).toBeNull();
  });

  it('refuses a deadline that is not one', () => {
    expect(cleanCall({ code: 'BCDF2345', from: 'M', expiresAt: 'soon' })).toBeNull();
    expect(cleanCall({ code: 'BCDF2345', from: 'M' })).toBeNull();
  });

  it('still names somebody when the server sent no name', () => {
    // the banner is a sentence about a person; it cannot be about nobody
    expect(cleanCall({ code: 'BCDF2345', expiresAt: soon() })?.from).toBe('PLAYER');
    expect(cleanCall({ code: 'BCDF2345', from: '   ', expiresAt: soon() })?.from).toBe('PLAYER');
  });

  it('cuts a name long enough to push the buttons off the screen', () => {
    const call = cleanCall({ code: 'BCDF2345', from: 'X'.repeat(100), expiresAt: soon() });
    expect(call?.from.length).toBe(24);
  });

  it('is null for nothing at all', () => {
    expect(cleanCall(null)).toBeNull();
    expect(cleanCall(undefined)).toBeNull();
  });
});
