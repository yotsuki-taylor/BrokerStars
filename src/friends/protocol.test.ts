import { describe, expect, it } from 'vitest';
import {
  INVITE_CAP,
  INVITE_COINS,
  INVITE_MATCHES,
  MAX_FRIENDS,
  cleanCode,
  cleanFriends,
  cleanInvite,
  cleanList,
} from './protocol';
import { PRICES } from '../ui/wardrobe';
import { ROOM_DONE } from '../ui/renovation';

/**
 * A friend code comes off an address bar and a friend list comes off the wire,
 * so neither is believed. These are the two doors and this is what they refuse.
 */

describe('a friend code', () => {
  it('forgives case and the spaces a paste brings with it', () => {
    expect(cleanCode('  BCDFGH2345 ')).toBe('bcdfgh2345');
  });

  it('refuses anything with a vowel in it', () => {
    // the alphabet has none, so a code with one was never minted here
    expect(cleanCode('bcdfgha345')).toBeNull();
    expect(cleanCode('hello12345')).toBeNull();
  });

  it('refuses what is too short, too long, or not there', () => {
    expect(cleanCode('bcd')).toBeNull();
    expect(cleanCode('b'.repeat(33))).toBeNull();
    expect(cleanCode(null)).toBeNull();
    expect(cleanCode(undefined)).toBeNull();
    expect(cleanCode({})).toBeNull();
  });
});

describe('a friend list off the wire', () => {
  it('keeps what it can read and drops the rest', () => {
    const rows = cleanFriends([
      { id: '7', name: 'ANNA', coins: 40, matches: 9, room: 3, outfit: { torso: 'rare' } },
      { name: 'NOBODY', coins: 1 }, // no id: not a player
      null,
      { id: '8' }, // everything but the id may be missing
    ]);
    expect(rows).toEqual([
      { id: '7', name: 'ANNA', coins: 40, matches: 9, room: 3, outfit: { torso: 'rare' } },
      { id: '8', name: 'PLAYER', coins: 0, matches: 0, room: 0, outfit: {} },
    ]);
  });

  it('will not open a door on a room or an outfit that does not exist', () => {
    // a visit draws these straight into <Room> and <Character>, so a room past
    // the last step or a rarity nobody sells is a friend with a broken door
    const [row] = cleanFriends([
      { id: '7', room: 99, outfit: { torso: 'priceless', nonsense: 'rare' } },
    ]);
    expect(row.room).toBe(ROOM_DONE);
    expect(row.outfit).toEqual({});
  });

  it('will not take a negative or a fractional count', () => {
    const [row] = cleanFriends([{ id: '7', coins: -5, matches: 2.7 }]);
    expect(row.coins).toBe(0);
    expect(row.matches).toBe(2);
  });

  it('is bounded, however long the answer was', () => {
    const many = Array.from({ length: MAX_FRIENDS + 50 }, (_, i) => ({ id: String(i) }));
    expect(cleanFriends(many)).toHaveLength(MAX_FRIENDS);
  });

  it('is nothing at all when it is not a list', () => {
    expect(cleanFriends(null)).toEqual([]);
    expect(cleanFriends('friends')).toEqual([]);
  });
});

describe('the whole answer', () => {
  it('needs a code to be worth drawing', () => {
    expect(cleanList({ friends: [] })).toBeNull();
    expect(cleanList(null)).toBeNull();
  });

  it('takes a list with no link — there is still one to copy nowhere', () => {
    const list = cleanList({ code: 'BCDFGH2345', link: null, friends: [{ id: '7' }] });
    expect(list).toEqual({
      code: 'bcdfgh2345',
      link: null,
      webLink: null,
      friends: [{ id: '7', name: 'PLAYER', coins: 0, matches: 0, room: 0, outfit: {} }],
      // a server too old to know about invitations says nothing about them
      invite: null,
    });
  });

  it('keeps both links when the server sends both', () => {
    const list = cleanList({
      code: 'BCDFGH2345',
      link: 'https://t.me/bot?start=friend_bcdfgh2345',
      webLink: 'https://example.test/game/?f=bcdfgh2345',
      friends: [],
    });
    expect(list?.link).toBe('https://t.me/bot?start=friend_bcdfgh2345');
    expect(list?.webLink).toBe('https://example.test/game/?f=bcdfgh2345');
  });

  it('reads a server that has not been redeployed yet as having no web link', () => {
    // the field simply is not in the answer, which must not become the string
    // "undefined" on a button somebody is about to send to a friend
    const list = cleanList({ code: 'BCDFGH2345', link: null, friends: [] });
    expect(list?.webLink).toBeNull();
  });
});

/**
 * What the invitation offer is worth, as numbers rather than as taste.
 *
 * These are not arbitrary: fifty is the first rung of a slot and the cap is
 * what bounds the farming that free guest sessions make possible. If either
 * moves, it should move because somebody decided to move it.
 */
describe('what an invitation pays', () => {
  it('is exactly one common item, so the offer can be named', () => {
    expect(INVITE_COINS).toBe(PRICES.common);
  });

  it('is capped low enough that farming it is not worth the trouble', () => {
    // the whole wardrobe is 7750; five fifties is about three per cent of it
    const whole = Object.values(PRICES).reduce((a, b) => a + b, 0) * 5;
    expect((INVITE_COINS * INVITE_CAP) / whole).toBeLessThan(0.05);
  });

  it('asks for more than one match, so a single tap is not enough', () => {
    expect(INVITE_MATCHES).toBeGreaterThan(1);
  });
});

describe('reading the standing back', () => {
  const full = { paid: 2, cap: 5, coins: 50, matches: 3 };

  it('takes the server at its word for all four numbers', () => {
    expect(cleanInvite(full)).toEqual(full);
  });

  it('is nothing at all from a server that has not been redeployed', () => {
    expect(cleanInvite(undefined)).toBeNull();
    expect(cleanInvite(null)).toBeNull();
  });

  it('never draws a bar past its own end', () => {
    expect(cleanInvite({ ...full, paid: 99 })?.paid).toBe(5);
    expect(cleanInvite({ ...full, paid: -4 })?.paid).toBe(0);
  });

  it('survives junk where the numbers should be', () => {
    const out = cleanInvite({ paid: 'lots', cap: null, coins: NaN, matches: {} });
    expect(out).toEqual({ paid: 0, cap: 0, coins: 0, matches: 0 });
  });
});
