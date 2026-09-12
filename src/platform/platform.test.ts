import { afterEach, describe, expect, it } from 'vitest';
import { platform } from './index';

/**
 * Put a fake Telegram on the window, the way the script tag in index.html puts
 * the real one there. Returns the calls it collected.
 */
function fakeTelegram(webApp: Record<string, unknown>): void {
  (globalThis as any).window = { Telegram: { WebApp: webApp } };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe('with no host to ask', () => {
  it('is the web platform, and answers nothing to every question', () => {
    const p = platform();
    expect(p.id).toBe('web');
    expect(p.authToken()).toBe('');
    expect(p.userId()).toBeNull();
    expect(p.userName()).toBe('');
    expect(p.launchParam()).toBe('');
  });

  it('has no opinion about language', () => {
    // node has no navigator; a browser would answer, and either is fine
    expect(typeof platform().language()).toBe('string');
  });

  it('does not throw on the things it cannot do', async () => {
    const p = platform();
    await expect(p.ready()).resolves.toBeUndefined();
    expect(() => p.haptic('heavy')).not.toThrow();
    expect(() => p.openLink('https://t.me/x')).not.toThrow();
  });

  it('offers no way to interrupt the player, so nobody asks it to', () => {
    // a page that asks a browser for permission to send notifications is the
    // reason that permission is usually refused
    expect(platform().notify).toBeUndefined();
    expect(platform().askToNotify).toBeUndefined();
  });
});

describe('inside Telegram', () => {
  it('signs with initData and never with the forgeable one', () => {
    fakeTelegram({ initData: 'auth=signed', initDataUnsafe: { user: { id: 7 } } });
    const p = platform();
    expect(p.id).toBe('telegram');
    expect(p.authToken()).toBe('auth=signed');
    // the unsigned id is for highlighting a row, and is a string when it exists
    expect(p.userId()).toBe('7');
  });

  it('falls through an empty first_name to the username', () => {
    // Telegram sends an empty first_name rather than leaving it out, which is
    // why the name is picked with `||` and not `??`
    fakeTelegram({ initDataUnsafe: { user: { first_name: '', username: 'broker' } } });
    expect(platform().userName()).toBe('broker');
  });

  it('reports the language the player set in Telegram', () => {
    // Telegram's own, not the phone's: one of the two was chosen deliberately
    fakeTelegram({ initDataUnsafe: { user: { language_code: 'ru' } } });
    expect(platform().language()).toBe('ru');
  });

  it('reads the launch parameter raw, prefix and all', () => {
    fakeTelegram({ initDataUnsafe: { start_param: 'duel_ABC123' } });
    expect(platform().launchParam()).toBe('duel_ABC123');
  });

  it('opens links through Telegram rather than in a browser tab', () => {
    const opened: string[] = [];
    fakeTelegram({ openTelegramLink: (url: string) => opened.push(url) });
    platform().openLink('https://t.me/+invite');
    expect(opened).toEqual(['https://t.me/+invite']);
  });

  it('survives an older client that is missing half the methods', () => {
    fakeTelegram({ ready: () => {}, expand: () => {} });
    expect(() => platform().ready()).not.toThrow();
  });
});

describe('inside the Android app', () => {
  /** What Capacitor's own bridge script puts on the window in a native WebView. */
  function fakeCapacitor(platformName: string): void {
    (globalThis as any).window = { Capacitor: { getPlatform: () => platformName } };
  }

  it('is chosen by the bridge, not by the build', () => {
    fakeCapacitor('android');
    expect(platform().id).toBe('android');
  });

  it('leaves a Capacitor web build to the web adapter', () => {
    // `npx cap serve` and a plain browser both report 'web'; neither has a
    // native bridge behind it and neither can sign anybody in
    fakeCapacitor('web');
    expect(platform().id).toBe('web');
  });

  it('has nobody signed in until somebody signs in', () => {
    fakeCapacitor('android');
    const p = platform();
    expect(p.authToken()).toBe('');
    expect(p.userId()).toBeNull();
    expect(p.userName()).toBe('');
  });

  /**
   * The tap on the shoulder, which only this host can give. What matters is not
   * that it works -- that needs a phone -- but that it is OFFERED here and
   * nowhere else, because every caller decides whether to bother by asking
   * whether the method exists at all.
   */
  it('is the only host that can interrupt the player', () => {
    fakeCapacitor('android');
    expect(typeof platform().notify).toBe('function');
    expect(typeof platform().askToNotify).toBe('function');
  });

  it('does not throw when there is no native plugin behind it', () => {
    fakeCapacitor('android');
    const p = platform();
    // both swallow everything: an import that fails in a browser-run test is
    // the same to them as a phone that has refused permission
    expect(() => p.notify?.('a duel', 'come back')).not.toThrow();
    expect(() => p.askToNotify?.()).not.toThrow();
  });

  it('wins over a Telegram SDK that somehow loaded anyway', () => {
    // the Android build strips the script tag, so this cannot happen today --
    // the test pins which answer is right if a future build ever carries both
    (globalThis as any).window = {
      Capacitor: { getPlatform: () => 'android' },
      Telegram: { WebApp: { initData: 'auth=whatever' } },
    };
    expect(platform().id).toBe('android');
  });
});

describe('the choice itself', () => {
  it('is made afresh every time, so a late-loading Telegram is still found', () => {
    // the script tag is a network request; anything that asked before it landed
    // must not have cached the answer "plain browser" for the rest of the session
    expect(platform().id).toBe('web');
    fakeTelegram({ initData: 'auth=late' });
    expect(platform().id).toBe('telegram');
    expect(platform().authToken()).toBe('auth=late');
  });
});
