import { describe, expect, it } from 'vitest';
import { webInvite, type Env } from '../src/index';

/**
 * The link that goes to somebody who is not on Telegram. Small enough to read
 * at a glance and worth a test anyway: it is built by hand out of a string an
 * operator wrote in wrangler.toml, and every one of these cases is a way that
 * string can differ from the one in front of us.
 */
const env = (url?: string) => ({ WEBAPP_URL: url }) as Env;

describe('the web invitation', () => {
  it('hangs the code off the address the game is served from', () => {
    expect(webInvite(env('https://example.test/BrokerStars/'), 'd', 'ABCD')).toBe(
      'https://example.test/BrokerStars/?d=ABCD',
    );
  });

  it('uses the key each kind of invitation is already read under', () => {
    // ?d= and ?f= are what src/ui/duel.ts and src/ui/friends.ts look for
    expect(webInvite(env('https://example.test/'), 'f', 'XY')).toBe('https://example.test/?f=XY');
  });

  it('joins onto an address that already carries a query', () => {
    expect(webInvite(env('https://example.test/?lang=ru'), 'd', 'ABCD')).toBe(
      'https://example.test/?lang=ru&d=ABCD',
    );
  });

  it('drops a fragment rather than building a link with the code after it', () => {
    // a code after a # never reaches the server OR the query string, so a link
    // built that way would look right and do nothing
    expect(webInvite(env('https://example.test/game#top'), 'd', 'ABCD')).toBe(
      'https://example.test/game?d=ABCD',
    );
  });

  it('escapes the code rather than trusting it to be tame', () => {
    expect(webInvite(env('https://example.test/'), 'd', 'a b&c')).toBe(
      'https://example.test/?d=a%20b%26c',
    );
  });

  it('is null when this deployment does not know where the game lives', () => {
    expect(webInvite(env(), 'd', 'ABCD')).toBeNull();
    expect(webInvite(env(''), 'd', 'ABCD')).toBeNull();
  });
});
