import { afterEach, describe, expect, it } from 'vitest';
import { linkToShare } from './duel';

/**
 * Which link goes to a friend, and it matters more than it looks: a t.me
 * address sent from an Android phone to somebody with no Telegram is a dead
 * end, and the player who sent it has no way to find that out.
 */

const TG = 'https://t.me/brokerbot?start=duel_ABCD';
const WEB = 'https://example.test/BrokerStars/?d=ABCD';

const inTelegram = () => {
  (globalThis as any).window = { Telegram: { WebApp: { initData: 'auth=x' } } };
};
const onAndroid = () => {
  (globalThis as any).window = { Capacitor: { getPlatform: () => 'android' } };
};

afterEach(() => {
  delete (globalThis as any).window;
});

describe('choosing the link to send', () => {
  it('sends the bot link from inside Telegram', () => {
    // it opens for somebody who has never started the mini app, which no other
    // link does — and everybody reachable from in there has Telegram
    inTelegram();
    expect(linkToShare(TG, WEB)).toBe(TG);
  });

  it('sends the web link from the Android app', () => {
    onAndroid();
    expect(linkToShare(TG, WEB)).toBe(WEB);
  });

  it('sends the web link from a plain browser', () => {
    expect(linkToShare(TG, WEB)).toBe(WEB);
  });

  it('falls back rather than leaving the player with nothing to send', () => {
    // a deployment with no bot, and one that does not know its own address
    onAndroid();
    expect(linkToShare(TG, null)).toBe(TG);
    inTelegram();
    expect(linkToShare(null, WEB)).toBe(WEB);
  });

  it('is null only when the server offered neither', () => {
    expect(linkToShare(null, null)).toBeNull();
  });
});
