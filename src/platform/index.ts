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
import { CRAZYGAMES, inCrazyGames } from './crazygames';
import { TELEGRAM, inTelegram } from './telegram';
import { WEB } from './web';

export interface Platform {
  /**
   * Which set of methods this is, for a build that has to say so. Not a stand-in
   * for "is there a real player behind this": `'telegram'` only means the SDK
   * answered, and it answers in a browser tab too — see `inTelegram`. Ask
   * `authToken()` for that.
   */
  readonly id: 'telegram' | 'web' | 'android' | 'crazygames';

  /**
   * A host that forbids sending players anywhere else — CrazyGames, which takes
   * no links to other platforms, app stores or other copies of the game. Asked
   * by everything that would open Telegram or offer the Android app; the
   * privacy policy is the one link out that stays. Absent means open.
   */
  readonly walled?: boolean;

  /**
   * A host whose players already have a name the game must use, and no
   * nickname of the game's own -- CrazyGames, which asks for its usernames and
   * forbids a second name. The name box is hidden, and the host's name wins
   * over any chosen one. Absent means the game may let players choose.
   */
  readonly ownNames?: boolean;

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
   *
   * THE LINK IS OPTIONAL, because one invitation in this game has no link to
   * send: a corporation is joined by typing its code, so the message is the
   * code and nothing else. Leaving it out is not the same as passing an empty
   * string — Android's share plugin refuses any url it cannot recognise, and
   * an empty string is a url it cannot recognise.
   */
  share(text: string, url?: string): void;

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
   * The address an invitation should travel as on this host, made from one of
   * the server's own links. Empty when there is none to give, which the caller
   * treats as no link at all.
   *
   * Absent everywhere but on a host whose rules forbid the server's links: there
   * the code is lifted off them and put on a link of the host's own, and
   * `launchParam()` reads it back off the page the recipient lands on.
   */
  invitation?(link: string): string;

  /**
   * A match on the board and running (`true`), and not any more (`false`).
   * Called every frame by the match loop, so an implementation that tells
   * somebody passes on changes only.
   *
   * Absent wherever nobody is listening, which is everywhere but CrazyGames —
   * it keeps its ads out of play and measures the download up to the first one.
   */
  gameplay?(playing: boolean): void;

  /**
   * The first frame is on screen: whatever the host counts as loading is over.
   * Called once, by `main.tsx`, after the first render has been painted.
   *
   * Absent wherever nobody is listening — CrazyGames is told the load began
   * when its SDK came up (`ready`) and ended here, which is how it measures
   * the time between a click on the game and a game.
   */
  loaded?(): void;

  /**
   * The duel this player can be joined in right now, or null for none.
   *
   * For a host with an invite button of its own: CrazyGames shows one on the
   * page while the game says the player is in a joinable room, and that room is
   * how a friend there gets in. Told every time the answer might have changed;
   * an implementation that tells somebody passes on changes only. Absent
   * elsewhere, where the invitation screen's own link is the whole of it.
   */
  room?(code: string | null): void;

  /**
   * The host started the game to play with friends straight away — CrazyGames'
   * "instant multiplayer", from its multiplayer pages — so the first thing on
   * screen should be a duel that can be joined. Absent, or false, everywhere
   * else and on any ordinary launch.
   */
  instantDuel?(): boolean;

  /**
   * The host's own mute switch, which outranks the game's. The listener hears
   * its state at once and on every change; returns the way to stop listening.
   * Absent wherever the host has no such switch.
   */
  onMute?(listener: (muted: boolean) => void): () => void;

  /**
   * The game going to the background (`false`) and coming back (`true`).
   * Returns the way to stop listening.
   *
   * What the analytics queue sends on, and what counts as opening the game a
   * second time (`ui/analytics.ts`). A page hears it as `visibilitychange`;
   * an Android app hears the native `pause` and `resume`, because the moment
   * the app is swiped away is exactly the moment a WebView may not be told.
   */
  onVisibility(listener: (visible: boolean) => void): () => void;

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
 * host is the one that actually knows who is playing. CrazyGames comes next
 * for the same reason Telegram is never the only check: its build carries no
 * Telegram script either, and only it carries its own.
 */
export function platform(): Platform {
  if (inAndroid()) return ANDROID;
  if (inCrazyGames()) return CRAZYGAMES;
  return inTelegram() ? TELEGRAM : WEB;
}
