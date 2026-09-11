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

  it('does not throw on the things it cannot do', () => {
    const p = platform();
    expect(() => p.ready()).not.toThrow();
    expect(() => p.haptic('heavy')).not.toThrow();
    expect(() => p.openLink('https://t.me/x')).not.toThrow();
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
