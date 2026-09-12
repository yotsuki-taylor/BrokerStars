/**
 * Where the game is running, and everything that answer changes.
 *
 * The game proper — the market, the match, the wardrobe — never cared whether
 * it was opened from a chat or from an icon on a home screen. Six files did,
 * because they reached into `window.Telegram.WebApp` themselves: who the player
 * is, what the launch link said, how a link gets handed to a friend, whether a
 * tap buzzes. Ten places in seventeen thousand lines, and those ten were the
 * whole of what tied this game to Telegram.
 *
 * They come through here now. A build that is not a mini app — the Android one
 * — is a third file beside `telegram.ts` and `web.ts` and a line in `platform`
 * below; nothing above this module has to learn about it.
 *
 * Nothing here is memoized, deliberately. Every one of those ten call sites
 * used to read `window.Telegram` afresh, and this keeps that: the object is put
 * there by the script tag in index.html, and a lookup that happened to run
 * first would otherwise answer "plain browser" for the rest of the session.
 */

import { ANDROID, inAndroid } from './android';
import { TELEGRAM, inTelegram } from './telegram';
import { WEB } from './web';

export interface Platform {
  /**
   * Which set of methods this is, for a build that has to say so. Not a stand-in
   * for "is there a real player behind this": `'telegram'` only means the SDK
   * answered, and it answers in a browser tab too — see `inTelegram`. Ask
   * `authToken()` for that.
   */
  readonly id: 'telegram' | 'web' | 'android';

  /**
   * Whatever the host wants doing before the game draws — full height, a
   * gesture to disable, chrome to paint, a session to remember, the link the
   * app was opened on. Called once, from main.tsx, and awaited: Android cannot
   * answer `launchParam()` until the intent has been read, and a duel invitation
   * that arrives after the first render is a duel invitation nobody joins.
   */
  ready(): Promise<void>;

  /**
   * Proof of who is asking, for the server to check. Empty when there is none,
   * and empty is the normal answer outside a mini app rather than a failure —
   * see `canSign` in ui/api.ts, which treats it as "not in this life" and
   * queues nothing.
   *
   * Still travels to the server under the JSON key `initData`: that is the
   * server's field name (worker/src/index.ts) and renaming it here would only
   * mean renaming it back at the socket.
   */
  authToken(): string;

  /**
   * Who the host says this is, unverified. Good for highlighting the player's
   * own row on a board and for keeping developer buttons out of other people's
   * way; good for nothing that must not be forged. `authToken` is the checkable
   * one.
   */
  userId(): string | null;

  /** A display name, unverified and cosmetic. Empty when the host has none. */
  userName(): string;

  /**
   * What language the host thinks this player reads, as a BCP-47 tag — `ru`,
   * `en-GB`, `pt-BR`. Empty when it has no idea.
   *
   * A guess, and treated as one: it decides only what a player who has never
   * chosen sees first, and a stored choice always wins (`ui/i18n.ts`). Telegram
   * knows because the player set it in Telegram; a browser and a WebView know
   * because the device does.
   */
  language(): string;

  /**
   * The parameter the game was launched with, raw. Duel and friend invitations
   * both arrive this way, and both know their own prefix — this only fetches.
   */
  launchParam(): string;

  /** A tap, felt. Silently nothing on a host with no motor. */
  haptic(kind: 'light' | 'heavy'): void;

  /** Send the player somewhere else: an invitation, the group chat. */
  openLink(url: string): void;

  /**
   * Hand a link to somebody. Whose contact list opens is the host's business:
   * Telegram's own share sheet inside Telegram, the system one on Android.
   */
  share(text: string, url: string): void;

  /**
   * An invitation arriving at a game that is already running, rather than one
   * the game was started by. Returns the way to stop listening.
   *
   * Only Android has this: a link tapped there wakes the app that is already
   * open, and `launchParam()` — read once before the first render — never hears
   * about it. In a browser or a mini app the equivalent is a page load, which
   * the launch parameter already covers, so their implementations subscribe to
   * nothing and say so by handing back a no-op.
   *
   * The string is shaped exactly like `launchParam()`: `duel_<code>` or
   * `friend_<code>`, so one reader serves both doors.
   */
  onLink(listener: (param: string) => void): () => void;

  /**
   * Tap the player on the shoulder while they are looking at something else.
   *
   * There is exactly one thing worth interrupting somebody for: a duel they
   * opened has been accepted, and it is already running. Sending the invitation
   * is what takes them out of the game -- the share sheet hands them to a chat
   * app -- so the moment they most need to be told is the moment they cannot
   * see the screen.
   *
   * Absent everywhere but the Android app. A browser tab has the Notification
   * API and deliberately does not use it: a page that asks permission to
   * interrupt you is the reason that permission is usually refused. Inside
   * Telegram the mini app cannot, and does not need to -- Telegram itself is
   * already the thing the player is looking at.
   *
   * Best effort by nature. It runs in a backgrounded WebView, which Android may
   * throttle or freeze at any time, so it is a courtesy rather than a promise:
   * nothing may depend on it having arrived.
   */
  notify?(title: string, body: string): void;

  /**
   * Ask for permission to do that, if this host needs asking and has not been
   * asked yet. Never awaited and never answered: a refusal is a player who does
   * not want to be interrupted, which is a preference rather than an error.
   *
   * Separate from `notify` because of WHEN it has to happen. Android 13 raises
   * a dialog, and a dialog cannot be raised over an app the player has already
   * left -- so the asking belongs to the moment the invitation appears, and the
   * notifying to the moment it is accepted, which may be minutes apart and in a
   * different app.
   */
  askToNotify?(): void;

  /**
   * Signing in, where signing in is a thing the player does.
   *
   * Absent on every host that already knows who is playing before the game
   * draws — a mini app is opened by somebody Telegram signed for — and absent
   * where nobody can sign in at all. So its presence is exactly the question
   * the settings screen asks before drawing an ACCOUNT button, which is why it
   * is an optional object rather than three optional methods.
   */
  readonly account?: Account;
}

/** Why a sign-in did not end in a session. */
export type SignInError = 'cancelled' | 'noserver' | 'refused' | 'failed';

export interface Account {
  signedIn(): boolean;
  /** Null on success. The caller draws the reason; none of them is fatal. */
  signIn(): Promise<SignInError | null>;
  /** This device forgets the session. The account itself is untouched. */
  signOut(): void;
}

/**
 * The one we are running on, asked fresh every time.
 *
 * Android is tested first and the order is not arbitrary: the Android build
 * carries no Telegram SDK (vite.config.ts takes the tag out), so the two can
 * never both answer — but if a future build ever did carry both, the native
 * host is the one that actually knows who is playing.
 */
export function platform(): Platform {
  if (inAndroid()) return ANDROID;
  return inTelegram() ? TELEGRAM : WEB;
}
