import { describe, expect, it } from 'vitest';
import { LINK_CODE_LENGTH, cleanLinkCode, cleanLinkState } from './protocol';

/**
 * A link code is a password to somebody's save file for as long as it lives, so
 * what these pin is mostly what is refused.
 */

describe('a link code', () => {
  it('forgives case and the spaces around a code read off a screen', () => {
    expect(cleanLinkCode('  BCDF2345  ')).toBe('bcdf2345');
  });

  it('refuses anything the alphabet cannot contain', () => {
    // base32 without vowels: no code spells a word, and no pair a keyboard
    // confuses is in it twice
    for (const junk of ['bcdfae23', 'bcdf-234', 'бцдф2345', '', 'bc']) {
      expect(cleanLinkCode(junk)).toBeNull();
    }
  });

  it('is eight characters, which is what the server mints', () => {
    expect(LINK_CODE_LENGTH).toBe(8);
    expect(cleanLinkCode('bcdf2345')).toBe('bcdf2345');
  });
});

describe('what the server says about a link', () => {
  it('keeps a code that is still good', () => {
    const at = Date.now() + 60_000;
    expect(cleanLinkState({ linked: false, code: 'BCDF2345', expiresAt: at })).toEqual({
      linked: false,
      code: 'bcdf2345',
      expiresAt: at,
    });
  });

  it('drops a code that has run out, and keeps the linked state', () => {
    // the answer travelled, or the screen was left open: a code shown after it
    // stopped working is a player typing it in for nothing
    const state = cleanLinkState({ linked: true, code: 'BCDF2345', expiresAt: Date.now() - 1 });
    expect(state).toEqual({ linked: true, code: null, expiresAt: null });
  });

  it('reads a bare linked answer, which is what minting returns when there is nothing to mint', () => {
    expect(cleanLinkState({ linked: true })).toEqual({ linked: true, code: null, expiresAt: null });
  });

  it('treats a missing `linked` as not linked rather than as true', () => {
    expect(cleanLinkState({})?.linked).toBe(false);
  });

  it('is null for nothing at all', () => {
    expect(cleanLinkState(null)).toBeNull();
  });
});
