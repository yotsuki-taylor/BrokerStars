import { afterEach, describe, expect, it } from 'vitest';
import { appLink, canHandOver, linkToShare } from './duel';

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

const userAgent = (ua: string) => {
  (globalThis as any).navigator = { userAgent: ua };
};

const PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).navigator;
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

/**
 * Whether a page offers to hand the invitation to the app, which is the whole
 * of what can be done without a domain of our own: nothing may ask a phone what
 * it has installed, so the page offers and the player answers.
 */
describe('offering the invitation to the app', () => {
  it('offers on an Android browser, where there might be one', () => {
    userAgent(PHONE);
    expect(canHandOver()).toBe(true);
  });

  it('offers inside Telegram on Android, which is a browser like any other', () => {
    inTelegram();
    userAgent(PHONE);
    expect(canHandOver()).toBe(true);
  });

  it('says nothing in the app itself, where there is nowhere to hand it', () => {
    onAndroid();
    userAgent(PHONE);
    expect(canHandOver()).toBe(false);
  });

  it('says nothing where the app cannot be installed at all', () => {
    userAgent(IPHONE);
    expect(canHandOver()).toBe(false);
    userAgent(DESKTOP);
    expect(canHandOver()).toBe(false);
  });

  it('says nothing rather than guessing when there is no agent to read', () => {
    expect(canHandOver()).toBe(false);
  });

  it('builds the address the app answers to', () => {
    // the other end is paramFromUrl in src/platform/android.ts
    expect(appLink('ABC123')).toBe('brokerstars://duel/ABC123');
  });
});
