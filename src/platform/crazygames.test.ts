import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platform } from './index';
import { __codeOf as codeOf } from './crazygames';
import { canHandOver, linkToShare } from '../ui/duel';
import { __resetGuestStore, forgetGuest, guestToken } from '../ui/guest';

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
          loadingStart: () => calls.push('loading'),
          loadingStop: () => calls.push('loaded'),
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
    // and names its players itself: no nickname box, the username wins
    expect(platform().ownNames).toBe(true);
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
    expect(calls.filter((c) => c === 'start' || c === 'stop')).toEqual(['start', 'stop', 'start', 'stop']);
  });

  it('tells the site the load began with the SDK and ended at the first frame, once', async () => {
    const calls = await onCrazyGames();
    expect(calls).toEqual(['loading']);
    platform().loaded?.();
    platform().loaded?.();
    expect(calls).toEqual(['loading', 'loaded']);
  });

  it('tells nobody when the SDK said it is disabled', async () => {
    const calls = await onCrazyGames('disabled');
    platform().gameplay?.(true);
    platform().loaded?.();
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

describe('the guest, kept in the Data module', () => {
  const KEY = 'brokerstars.guest';
  const saved = (token: string) => JSON.stringify({ token, id: `a:${token}`, name: 'GUEST' });

  /** A Storage-shaped map, for this browser and for the Data module alike. */
  const memory = (seed: Record<string, string> = {}) => {
    const m = new Map(Object.entries(seed));
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  let browser: ReturnType<typeof memory>;

  beforeEach(() => {
    __resetGuestStore();
    browser = memory();
    (globalThis as any).localStorage = browser;
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    __resetGuestStore();
  });

  async function withData(seed: Record<string, string> = {}, environment = 'crazygames') {
    const data = memory(seed);
    (globalThis as any).window = {
      CrazyGames: { SDK: { environment, init: async () => {}, data, user: {}, game: {} } },
    };
    await platform().ready();
    return data;
  }

  it('moves a guest already in this browser into the account, and keeps the browser copy', async () => {
    // somebody who played before the guest moved must not start over
    browser.setItem(KEY, saved('old'));
    const data = await withData();
    // copied across on the first read, which the game makes right after this
    expect(guestToken()).toBe('old');
    expect(data.m.get(KEY)).toBe(saved('old'));
    expect(browser.getItem(KEY)).toBe(saved('old'));
  });

  it('takes the guest the account already has over the one in this browser', async () => {
    // a logged-in player on a second device: the account is who they are
    browser.setItem(KEY, saved('here'));
    const data = await withData({ [KEY]: saved('account') });
    expect(guestToken()).toBe('account');
    expect(data.m.get(KEY)).toBe(saved('account'));
    // and this browser now holds the account's guest as its fallback
    expect(browser.getItem(KEY)).toBe(saved('account'));
  });

  it('forgets the guest in the account, not only in this browser', async () => {
    const data = await withData({ [KEY]: saved('gone') });
    forgetGuest();
    expect(data.m.has(KEY)).toBe(false);
    expect(guestToken()).toBe('');
  });

  it('stays in this browser when the SDK says it is disabled', async () => {
    browser.setItem(KEY, saved('local'));
    const data = await withData({}, 'disabled');
    expect(guestToken()).toBe('local');
    expect(data.m.size).toBe(0);
  });

  it('falls back on the browser when the Data module throws', async () => {
    // switched off on CrazyGames' side, say: the guest must not be lost
    browser.setItem(KEY, saved('safe'));
    const broken = {
      getItem: () => {
        throw new Error('dataModuleDisabled');
      },
      setItem: () => {
        throw new Error('dataModuleDisabled');
      },
      removeItem: () => {},
    };
    (globalThis as any).window = {
      CrazyGames: { SDK: { environment: 'crazygames', init: async () => {}, data: broken, user: {}, game: {} } },
    };
    await platform().ready();
    expect(guestToken()).toBe('safe');
  });
});

describe('multiplayer and sound, through the SDK', () => {
  /** A fake SDK that records what the game told it, with hooks to talk back. */
  async function sdkWith(over: Record<string, unknown> = {}) {
    const calls: unknown[][] = [];
    let settingsListener: ((s: { muteAudio?: boolean }) => void) | null = null;
    let joinListener: ((p: Record<string, string>) => void) | null = null;
    (globalThis as any).window = {
      CrazyGames: {
        SDK: {
          environment: 'crazygames',
          init: async () => {},
          user: {},
          game: {
            settings: { muteAudio: false, disableChat: false },
            isInstantMultiplayer: false,
            updateRoom: (r: unknown) => calls.push(['updateRoom', r]),
            leftRoom: () => calls.push(['leftRoom']),
            addSettingsChangeListener: (f: typeof settingsListener) => {
              settingsListener = f;
            },
            removeSettingsChangeListener: () => {
              settingsListener = null;
            },
            addJoinRoomListener: (f: typeof joinListener) => {
              joinListener = f;
            },
            removeJoinRoomListener: () => {
              joinListener = null;
            },
            ...over,
          },
        },
      },
    };
    await platform().ready();
    return {
      calls,
      settings: (s: { muteAudio?: boolean }) => settingsListener?.(s),
      join: (p: Record<string, string>) => joinListener?.(p),
      listening: () => joinListener !== null,
    };
  }

  it('opens a joinable room under the duel code, once, and leaves it when the lobby closes', async () => {
    const sdk = await sdkWith();
    const p = platform();
    p.room?.(null); // nothing open yet: nothing to say
    p.room?.('abc123');
    p.room?.('abc123'); // the same answer again is not news
    p.room?.(null);
    expect(sdk.calls).toEqual([
      ['updateRoom', { roomId: 'abc123', isJoinable: true, inviteParams: { d: 'abc123' } }],
      ['updateRoom', { isJoinable: false }],
      ['leftRoom'],
    ]);
  });

  it('says when it was launched to play with friends', async () => {
    await sdkWith({ isInstantMultiplayer: true });
    expect(platform().instantDuel?.()).toBe(true);
    await sdkWith();
    expect(platform().instantDuel?.()).toBe(false);
  });

  it('hears the site mute at once and on every change', async () => {
    const sdk = await sdkWith({ settings: { muteAudio: true } });
    const heard: boolean[] = [];
    const stop = platform().onMute?.((m) => heard.push(m));
    sdk.settings({ muteAudio: false });
    sdk.settings({ muteAudio: true });
    expect(heard).toEqual([true, false, true]);
    stop?.();
  });

  it('joins a duel or a friend accepted while the game is open, without a reload', async () => {
    const sdk = await sdkWith();
    const params: string[] = [];
    const stop = platform().onLink((p) => params.push(p));
    sdk.join({ d: 'abc123' });
    sdk.join({ f: 'xyz' });
    expect(params).toEqual(['duel_abc123', 'friend_xyz']);
    stop();
    expect(sdk.listening()).toBe(false);
  });

  it('does none of it when the SDK says it is disabled', async () => {
    const calls: unknown[] = [];
    (globalThis as any).window = {
      CrazyGames: {
        SDK: {
          environment: 'disabled',
          init: async () => {},
          game: { updateRoom: () => calls.push(1), isInstantMultiplayer: true },
        },
      },
    };
    await platform().ready();
    platform().room?.('abc123');
    expect(calls).toEqual([]);
    expect(platform().instantDuel?.()).toBe(false);
  });
});

describe('signing in as the CrazyGames user', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k) };
  };

  let posted: Record<string, unknown>[];
  let answer: { status: number; body: Record<string, unknown> };

  beforeEach(() => {
    __resetGuestStore();
    (globalThis as any).localStorage = memory();
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    posted = [];
    answer = { status: 200, body: { ok: true, token: 'bs1.session', id: 'cg:Xk3mZ8', name: 'masha_trades', adopted: true } };
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      posted.push({ url, ...JSON.parse(init.body) });
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as any).localStorage;
    __resetGuestStore();
  });

  async function onCrazyGamesAs(user: { username: string; __dangerousUserId: string } | null) {
    (globalThis as any).window = {
      CrazyGames: {
        SDK: {
          environment: 'crazygames',
          init: async () => {},
          game: {},
          user: {
            isUserAccountAvailable: true,
            getUser: async () => user,
            getUserToken: async (o: { signingKeyType?: string }) => `jwt-${o?.signingKeyType}`,
          },
        },
      },
    };
    await platform().ready();
  }

  it('trades the user token for a session, with the guest along, and plays under the username', async () => {
    (globalThis as any).localStorage.setItem('brokerstars.guest', JSON.stringify({ token: 'bs1.guest', id: 'a:1', name: 'GUEST 1' }));
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    expect(posted).toEqual([{ url: 'https://api.test/auth/crazygames', token: 'jwt-IN_GAME_AUTH', guest: 'bs1.guest' }]);
    expect(platform().authToken()).toBe('bs1.session');
    expect(platform().userId()).toBe('cg:Xk3mZ8');
    expect(platform().userName()).toBe('masha_trades');
    // the server took the guest in, so it is spent
    expect(guestToken()).toBe('');
  });

  it('trades again on every launch, so a username changed on CrazyGames arrives', async () => {
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    answer.body = { ok: true, token: 'bs1.next', id: 'cg:Xk3mZ8', name: 'masha_renamed' };
    await onCrazyGamesAs({ username: 'masha_renamed', __dangerousUserId: 'Xk3mZ8' });
    expect(posted).toHaveLength(2);
    expect(platform().authToken()).toBe('bs1.next');
    expect(platform().userName()).toBe('masha_renamed');
  });

  it('keeps last launch’s session for the same account when the trade fails', async () => {
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    answer = { status: 503, body: { error: 'down' } };
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    expect(platform().authToken()).toBe('bs1.session');
  });

  it('never hands another account the last one’s session when the trade fails', async () => {
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    answer = { status: 503, body: { error: 'down' } };
    await onCrazyGamesAs({ username: 'other_one', __dangerousUserId: 'Q9' });
    expect(platform().authToken()).toBe('');
  });


  it('asks again when a different account logs in on this browser', async () => {
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    answer.body = { ok: true, token: 'bs1.other', id: 'cg:Q9', name: 'other_one' };
    await onCrazyGamesAs({ username: 'other_one', __dangerousUserId: 'Q9' });
    expect(posted).toHaveLength(2);
    expect(platform().userName()).toBe('other_one');
  });

  it('lets the session go when the player has logged out, and is a guest again', async () => {
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    await onCrazyGamesAs(null);
    expect(platform().authToken()).toBe('');
    expect(platform().userName()).toBe('');
  });

  it('stays a guest when the server refuses the token, and keeps the guest', async () => {
    (globalThis as any).localStorage.setItem('brokerstars.guest', JSON.stringify({ token: 'bs1.guest', id: 'a:1', name: 'GUEST 1' }));
    answer = { status: 401, body: { error: 'bad token' } };
    await onCrazyGamesAs({ username: 'masha_trades', __dangerousUserId: 'Xk3mZ8' });
    expect(platform().authToken()).toBe('');
    expect(guestToken()).toBe('bs1.guest');
  });
});
