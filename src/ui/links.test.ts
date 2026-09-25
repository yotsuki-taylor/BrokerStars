import { afterEach, describe, expect, it } from 'vitest';
import {
  appLink,
  canHandOver,
  duelCodeFromText,
  handsOffItself,
  linkToShare,
  selfLink,
} from './duel';

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

/**
 * The SDK loaded, but nobody signed in: the published page carries Telegram's
 * script on every host, so this is what an ordinary Chrome tab looks like.
 */
const sdkOnly = () => {
  (globalThis as any).window = { Telegram: { WebApp: { initData: '' } } };
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

  it('says nothing in Telegram anywhere there is no app to reach', () => {
    // a desktop and an iPhone are both Telegram, and neither has an Android
    // app behind them
    inTelegram();
    userAgent(DESKTOP);
    expect(canHandOver()).toBe(false);
    inTelegram();
    userAgent(IPHONE);
    expect(canHandOver()).toBe(false);
  });

  it('still offers inside Telegram on Android, which has an opener of its own', () => {
    // An invitation sent from Telegram opens in the mini app, and a player
    // whose game is in the Android app needs a way across from there.
    inTelegram();
    userAgent(PHONE);
    expect(canHandOver()).toBe(true);
  });

  it('links rather than asking in a browser that merely carries the SDK', () => {
    // The published page loads Telegram's script everywhere, so an ordinary
    // Chrome tab reports the telegram platform. Taking the mini app's route
    // there would open the page it is already on -- a button that does nothing
    // but reload. A signed initData is what tells the two apart.
    sdkOnly();
    userAgent(PHONE);
    expect(canHandOver()).toBe(true);
    expect(handsOffItself()).toBe(false);
  });

  it('asks Telegram to open it rather than linking, because linking failed', () => {
    // The whole of the bug in one assertion. A mini app is a WebView: an
    // anchor to a custom scheme is loaded as an address and lands on
    // Telegram's error page. Everywhere else the anchor is the only thing that
    // works, and that was measured on a phone.
    inTelegram();
    userAgent(PHONE);
    expect(handsOffItself()).toBe(true);

    delete (globalThis as any).window;
    userAgent(PHONE);
    expect(handsOffItself()).toBe(false);
  });

  it('says nothing in any other embedded browser either', () => {
    // `wv` is what Android puts in an embedded browser's user agent and leaves
    // out of Chrome's. Any chat app that keeps links in a browser of its own
    // lands here, not only the one that was reported.
    userAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126 Mobile Safari/537.36',
    );
    expect(canHandOver()).toBe(false);
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

/**
 * The invitation put back on the address it was read from, which is what a mini
 * app hands to Telegram: the scheme is the thing Telegram may refuse, and an
 * ordinary address is the thing it cannot.
 */
describe('rebuilding the invitation from the page it landed on', () => {
  const href = (url: string) => {
    (globalThis as any).window = { location: { href: url } };
  };

  it('puts the code back where the launch took it off', () => {
    href('https://example.test/BrokerStars/');
    expect(selfLink('d', 'abc123')).toBe('https://example.test/BrokerStars/?d=abc123');
    expect(selfLink('f', 'abc123')).toBe('https://example.test/BrokerStars/?f=abc123');
  });

  it('drops whatever else was on the address, including the old code', () => {
    // the launch wipes `?d=` as it reads it, but a reload or a second
    // invitation must not leave two of them on one link
    href('https://example.test/BrokerStars/?d=stale&x=1#frag');
    expect(selfLink('d', 'fresh')).toBe('https://example.test/BrokerStars/?d=fresh');
  });

  it('answers nothing rather than throwing when there is no address to read', () => {
    delete (globalThis as any).window;
    expect(selfLink('d', 'abc123')).toBe('');
  });
});

describe('a friend’s code typed into the duel screen', () => {
  it('takes the code as it is read out, in any case and with spaces', () => {
    expect(duelCodeFromText('bcdf234567')).toBe('bcdf234567');
    expect(duelCodeFromText('  BCDF 2345-67 ')).toBe('bcdf234567');
  });

  it('takes the whole invitation pasted in, in every shape it travels', () => {
    expect(duelCodeFromText('https://example.test/BrokerStars/?d=BCDF234567')).toBe('bcdf234567');
    expect(duelCodeFromText('https://t.me/brokerbot?start=duel_bcdf234567')).toBe('bcdf234567');
    expect(duelCodeFromText('brokerstars://duel/bcdf234567')).toBe('bcdf234567');
    expect(duelCodeFromText('Go! https://x.test/?lang=ru&d=bcdf234567 good for 15 min')).toBe(
      'bcdf234567',
    );
  });

  it('refuses what is not a code', () => {
    expect(duelCodeFromText('')).toBeNull();
    expect(duelCodeFromText('hello there')).toBeNull();
    expect(duelCodeFromText('https://example.test/')).toBeNull();
  });
});
