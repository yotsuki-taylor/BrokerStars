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
   * The parameter the game was launched with, raw. Duel and friend invitations
   * both arrive this way, and both know their own prefix — this only fetches.
   */
  launchParam(): string;

  /** A tap, felt. Silently nothing on a host with no motor. */
  haptic(kind: 'light' | 'heavy'): void;

  /** Send the player somewhere else: an invitation, the group chat. */
  openLink(url: string): void;

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
