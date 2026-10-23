import { afterEach, describe, expect, it } from 'vitest';
import { platform } from './index';
import { __codeOf as codeOf } from './crazygames';
import { canHandOver, linkToShare } from '../ui/duel';

const TG = 'https://t.me/BrokerStarsBot?start=duel_abc123';
const WEB = 'https://yotsuki-taylor.github.io/BrokerStars/?d=abc123';

/**
 * Put a fake CrazyGames SDK on the window, the way their script tag puts the
 * real one there, and let the adapter initialise against it. Returns the
 * gameplay calls it collected.
 */
async function onCrazyGames(
  environment = 'crazygames',
  invite: Record<string, string> = {},
): Promise<string[]> {
  const calls: string[] = [];
  (globalThis as any).window = {
    CrazyGames: {
      SDK: {
        environment,
        init: async () => {},
        user: { systemInfo: { locale: 'de-DE' } },
        game: {
          getInviteParam: (key: string) => invite[key] ?? null,
          inviteLink: (params: Record<string, string>) =>
            `https://www.crazygames.com/game/broker-stars?${new URLSearchParams(params)}`,
          gameplayStart: () => calls.push('start'),
          gameplayStop: () => calls.push('stop'),
        },
      },
    },
  };
  await platform().ready();
  return calls;
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe('on CrazyGames', () => {
  it('is picked when the SDK is loaded, and is walled', async () => {
    await onCrazyGames();
    expect(platform().id).toBe('crazygames');
    expect(platform().walled).toBe(true);
  });

  it('beats Telegram if both scripts were ever loaded', async () => {
    await onCrazyGames();
    (globalThis as any).window.Telegram = { WebApp: {} };
    expect(platform().id).toBe('crazygames');
  });

  it('takes the language from the site', async () => {
    await onCrazyGames();
    expect(platform().language()).toBe('de-DE');
  });

  it('reads an invitation off the page it was opened on', async () => {
    await onCrazyGames('crazygames', { d: 'abc123' });
    expect(platform().launchParam()).toBe('duel_abc123');
    await onCrazyGames('crazygames', { f: 'xyz' });
    expect(platform().launchParam()).toBe('friend_xyz');
    await onCrazyGames();
    expect(platform().launchParam()).toBe('');
  });

  it('sends neither of the server links, only its own with the same code', async () => {
    await onCrazyGames();
    const sent = linkToShare(TG, WEB);
    expect(sent).toBe('https://www.crazygames.com/game/broker-stars?d=abc123');
    // the bot link alone is reshaped the same way
    expect(linkToShare(TG, null)).toBe(sent);
  });

  it('sends nothing at all rather than a link it may not send', async () => {
    await onCrazyGames('disabled');
    expect(linkToShare(TG, WEB)).toBeNull();
  });

  it('never offers the Android app', async () => {
    await onCrazyGames();
    // Node has a navigator of its own with no setter, so it is replaced rather
    // than assigned, and the phone it describes is Chrome on Android: the one
    // place the offer would otherwise be made
    const own = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/126 Mobile Safari/537.36' },
    });
    try {
      expect(canHandOver()).toBe(false);
    } finally {
      if (own) Object.defineProperty(globalThis, 'navigator', own);
      else delete (globalThis as any).navigator;
    }
  });

  it('tells the site about a match only when it starts and stops', async () => {
    const calls = await onCrazyGames();
    const p = platform();
    for (const playing of [false, true, true, true, false, false, true]) p.gameplay?.(playing);
    p.gameplay?.(false);
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
  });

  it('tells nobody when the SDK said it is disabled', async () => {
    const calls = await onCrazyGames('disabled');
    platform().gameplay?.(true);
    expect(calls).toEqual([]);
    expect(platform().launchParam()).toBe('');
  });
});

describe('the code inside an invitation', () => {
  it('comes off either of the server links', () => {
    expect(codeOf(WEB)).toEqual({ key: 'd', code: 'abc123' });
    expect(codeOf(TG)).toEqual({ key: 'd', code: 'abc123' });
    expect(codeOf('https://host/BrokerStars/?f=xyz')).toEqual({ key: 'f', code: 'xyz' });
    expect(codeOf('https://t.me/bot?start=friend_xyz')).toEqual({ key: 'f', code: 'xyz' });
  });

  it('is nothing when there is none', () => {
    expect(codeOf('https://t.me/+9R4CBPEDUwg0MTQy')).toBeNull();
    expect(codeOf('not a link')).toBeNull();
  });
});
