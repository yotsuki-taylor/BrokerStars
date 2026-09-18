/**
 * The game as an Android app: the same bundle, inside a Capacitor WebView.
 *
 * What makes this host different from the other two is that nobody hands it an
 * identity. A mini app is opened by somebody Telegram already knows and signed
 * for; here the player is anonymous until they choose not to be, so signing in
 * is a thing that happens in the game rather than a thing that happened before
 * it started. `signIn` below is the whole of that, and the rest of this file is
 * what it leaves behind.
 *
 * WHAT IS STORED, and why it is not Google's token. Google's ID token lives
 * about an hour, and `authToken()` is read before every write — a game that
 * woke the Credential Manager hourly would be a game that keeps asking
 * permission to be played. So the token goes to `/auth/google` once and comes
 * back as a session of the Worker's own (worker/src/auth.ts), good for months
 * and checkable with arithmetic. That session is what sits in `localStorage`
 * and what every request carries, in the same `initData` field Telegram's
 * signature travels in.
 *
 * A player who never signs in still has a game: matches against bots, coins,
 * the room, the wardrobe, all of it local, exactly as a browser tab has always
 * had. What signing in buys is what a server has to keep — the board, duels,
 * friends, and a profile that survives a new phone.
 */

import type { Account, Platform, SignInError } from './index';
import { forgetGuest, guestToken } from '../ui/guest';

/** Where the Worker is. Read the same way ui/api.ts reads it, and deliberately
 * not imported from there: that module imports this one through `./index`, and
 * a cycle between the door and the thing that knocks on it is not worth one
 * shared line. */
const API = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Set by Capacitor's own bridge script, which only a native WebView gets. */
const bridge = (): any => (globalThis as any).window?.Capacitor;

export const inAndroid = (): boolean => bridge()?.getPlatform?.() === 'android';

/* --------------------------------------------------------------- the session */

const SESSION_KEY = 'brokerstars.session';

interface Session {
  /** the Worker's own token, the thing every request carries */
  token: string;
  /** the namespaced player id, `g:<sub>` */
  id: string;
  name: string;
}

/**
 * Read once and kept, because `authToken()` is synchronous and is called on the
 * way into every write. Undefined means "not looked yet"; null means "looked,
 * nobody signed in", which is an ordinary state and not an error.
 */
let session: Session | null | undefined;

function load(): Session | null {
  if (session !== undefined) return session;
  session = null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (parsed.token && parsed.id) {
        session = {
          token: String(parsed.token),
          id: String(parsed.id),
          name: String(parsed.name ?? '').slice(0, 24),
        };
      }
    }
  } catch {
    /* unreadable storage is a player who is not signed in */
  }
  return session;
}

function keep(next: Session | null): void {
  session = next;
  try {
    if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* a session we cannot write is a session that lasts until the app closes */
  }
}

/** Is there somebody signed in? What the sign-in screen asks before drawing. */
export const signedIn = (): boolean => load() !== null;

/**
 * Forget the session.
 *
 * Local only, and that is the right scope: it ends this device's claim to the
 * account without touching the account. Deleting the account itself is a server
 * route and a different, heavier thing (`/profile/delete`).
 */
export function signOut(): void {
  keep(null);
}

/* ---------------------------------------------------------------- signing in */

/**
 * Sign in with Google and come back with a session.
 *
 * Two round trips, and both have to happen: Credential Manager for a token that
 * says Google vouches for this person, then `/auth/google`, which is the only
 * place that token is ever sent. The Worker checks it against Google's keys and
 * our client id and answers with a session — see worker/src/auth.ts, and note
 * that the Worker trusting Google is not the same as the Worker trusting us.
 *
 * The plugin is imported here rather than at the top of the file so that a web
 * or Telegram build never pulls native plugin code into its bundle for a
 * function it can never call.
 */
export async function signIn(): Promise<SignInError | null> {
  if (!API) return 'noserver';

  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
  if (!clientId) return 'noserver';

  let idToken: string;
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.initialize({ google: { webClientId: clientId } });
    // No `scopes`, deliberately, and do not add any. The plugin already asks for
    // `openid`, `userinfo.email` and `userinfo.profile`, which is the whole of
    // what an ID token needs — and passing a scopes array AT ALL, even with
    // those same three in it, makes the plugin demand that MainActivity extend a
    // class of its own and refuse the login until it does. We want an identity,
    // not access to anybody's Google data, so there is nothing here to ask for.
    const { result } = await SocialLogin.login({ provider: 'google', options: {} });
    const token = 'idToken' in result ? result.idToken : null;
    if (!token) return 'failed';
    idToken = token;
  } catch (err) {
    // Backing out of the account picker is not a failure and must not be drawn
    // as one; the plugin says so with a code rather than a message.
    return (err as { code?: string })?.code === 'USER_CANCELLED' ? 'cancelled' : 'failed';
  }

  try {
    const res = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The guest session, if this player has been playing as one. Holding both
      // tokens is the proof that they are the same person, so the server makes
      // the Google account a second door into the guest's save rather than an
      // empty room beside it — see `adopt` in worker/src/link.ts. Sent from here
      // because here is where the request is made; the guest itself is the
      // game's business rather than the host's (`ui/guest.ts`).
      body: JSON.stringify({ idToken, guest: guestToken() }),
    });
    if (!res.ok) return res.status === 401 ? 'refused' : 'noserver';
    const body = (await res.json()) as { token?: string; id?: string; name?: string };
    if (!body.token || !body.id) return 'failed';
    keep({ token: body.token, id: body.id, name: String(body.name ?? '').slice(0, 24) });
    // Spent: the server has been told the two are the same person, and the
    // session above wins over it from here anyway.
    forgetGuest();
    return null;
  } catch {
    return 'failed';
  }
}

/* ------------------------------------------------------------- the launch url */

let launchParam = '';

/**
 * The link the app was opened on, already reshaped into what the game expects.
 *
 * Both shapes turn into the same thing, and the same thing Telegram's
 * `start_param` carries, so `duelCodeFromLaunch` and `friendCodeFromLaunch`
 * read them without knowing which door they came through:
 *
 *     brokerstars://duel/ABC123                    -> duel_ABC123
 *     https://host/BrokerStars/?d=ABC123           -> duel_ABC123
 *     brokerstars://friend/XYZ                     -> friend_XYZ
 *     https://host/BrokerStars/?f=XYZ              -> friend_XYZ
 *
 * THE SCHEME came first, because an App Link needs a file served from the root
 * of a host and the game lives on a path inside somebody else's. The cost was
 * that a link in a chat is not an ordinary address: it is not tappable, and a
 * browser handed one loads it and fails.
 *
 * THE HTTPS ONE is that file finally being served (`android/assetlinks.json`).
 * It is the invitation exactly as it is sent -- one address that opens the app
 * where the app is installed and the web game where it is not, with nobody
 * asked to choose. The scheme stays because it is what the page falls back to
 * when verification has not happened, and because links already sent still use
 * it.
 *
 * The host is not checked here. Android has already checked it, against a
 * signature, before this process was started -- that is what the verification
 * IS -- and re-deciding it off a string would only be a second, worse answer.
 */
function paramFromUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (parsed.protocol === 'brokerstars:') {
      // `brokerstars://duel/ABC` parses with host `duel` and pathname `/ABC`
      const kind = parsed.host;
      const code = parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
      if (!code) return '';
      return kind === 'duel' || kind === 'friend' ? `${kind}_${code}` : '';
    }

    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      // the same two keys `webInvite` puts on a link (worker/src/index.ts)
      const duel = parsed.searchParams.get('d');
      if (duel) return `duel_${duel}`;
      const friend = parsed.searchParams.get('f');
      if (friend) return `friend_${friend}`;
      // an ordinary visit to the game, which is a launch and not an invitation
      return '';
    }

    return '';
  } catch {
    return '';
  }
}

/** Exported for the tests, which are the only thing that may call it. */
export const __paramFromUrl = paramFromUrl;

/**
 * What the share plugin is handed, and the whole of a bug worth a name.
 *
 * The url is OMITTED when there is none rather than sent empty. The plugin
 * refuses any url that is neither a file nor an http address — `SharePlugin.java`
 * answers "Unsupported url" — and an empty string is neither. So a
 * corporation's invitation, which is a code with no link behind it, was
 * rejected before the sheet could open; the `catch` around the call then
 * swallowed that rejection as if the player had changed their mind, and a dead
 * button looked exactly like a cancelled one.
 *
 * Exported for the test, like `paramFromUrl` above: the plugin cannot be
 * imported outside a WebView, so the only part that can be checked on this side
 * is the shape of what it would have been given.
 */
export const __shareOptions = (
  text: string,
  url?: string,
): { text: string; dialogTitle: string; url?: string } =>
  url ? { text, url, dialogTitle: text } : { text, dialogTitle: text };

/** The three questions the settings screen asks, and nothing else. */
const ACCOUNT: Account = { signedIn, signIn, signOut };

export const ANDROID: Platform = {
  id: 'android',
  account: ACCOUNT,

  /**
   * Read the session off the disk and the intent off the launcher, before the
   * first frame. Both are why `ready()` is awaited in main.tsx: the game asks
   * for the launch parameter during its first render, and an answer that
   * arrives afterwards is an invitation nobody joins.
   *
   * A link that arrives while the app is ALREADY open comes through Capacitor's
   * `appUrlOpen` event instead, which nothing listens for yet — the screen that
   * would act on it is the next piece of work.
   */
  async ready(): Promise<void> {
    load();
    try {
      const { App } = await import('@capacitor/app');
      const opened = await App.getLaunchUrl();
      if (opened?.url) launchParam = paramFromUrl(opened.url);
    } catch {
      /* no launch url is the ordinary case: the app was opened from its icon */
    }
  },

  authToken(): string {
    return load()?.token ?? '';
  },

  userId(): string | null {
    return load()?.id ?? null;
  },

  userName(): string {
    return load()?.name ?? '';
  },

  language(): string {
    // The WebView reports the device's locale, which is the phone's language.
    return String((globalThis as any).navigator?.language ?? '');
  },

  launchParam(): string {
    return launchParam;
  },

  haptic(kind: 'light' | 'heavy'): void {
    (globalThis as any).navigator?.vibrate?.(kind === 'heavy' ? 25 : 10);
  },

  openLink(url: string): void {
    // A t.me address or the group chat: both are somebody else's app, and the
    // system opener is what hands them over. `_blank` in a Capacitor WebView is
    // routed out to the browser rather than replacing the game.
    (globalThis as any).window?.open(url, '_blank', 'noopener');
  },

  /**
   * The system share sheet, which is every app on the phone rather than one.
   *
   * Nothing is done about a failure and nothing should be: the sheet closing
   * because the player changed their mind reaches this as a rejection, and it
   * is indistinguishable from one that failed. Neither is worth an error the
   * player has to dismiss — the link is still on the screen behind it.
   */
  share(text: string, url?: string): void {
    void (async () => {
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share(__shareOptions(text, url));
      } catch {
        /* dismissed, or no sheet to open */
      }
    })();
  },

  onLink(listener: (param: string) => void): () => void {
    let stop: (() => void) | null = null;
    let dropped = false;
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appUrlOpen', ({ url }) => {
          const param = paramFromUrl(String(url ?? ''));
          if (param) listener(param);
        });
        // unsubscribed before the listener finished attaching: attach and go
        if (dropped) await handle.remove();
        else stop = () => void handle.remove();
      } catch {
        /* no native App plugin means no links to hear about */
      }
    })();
    return () => {
      dropped = true;
      stop?.();
    };
  },
};
