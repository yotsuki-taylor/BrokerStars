/**
 * The game on CrazyGames: the web bundle inside their iframe, with their SDK
 * loaded beside it (`npm run build:crazygames`, which puts the script tag in and
 * takes Telegram's out — see vite.config.ts).
 *
 * Three things make this host different from a plain browser tab, and they are
 * the whole of this file.
 *
 * THE SITE IS WALLED. CrazyGames does not let a game send its players to other
 * platforms: no Telegram, no app store, no other playable copy of the game. So
 * `walled` is set, and the places that would open a t.me address — the group
 * chat, the shout into it, the offer to continue in the Android app — ask it
 * and stay away. The privacy policy is the one link out that is allowed.
 *
 * INVITATIONS TRAVEL AS THEIR LINKS. The server mints a bot link and a web link
 * for a duel or a friendship; neither may be sent from here. `invitation` turns
 * either into CrazyGames' own invite link with the same code on it, and
 * `launchParam` reads the code back off the page the recipient lands on, in the
 * `duel_<code>` / `friend_<code>` shape every other host hands over.
 *
 * THE SITE WANTS TO KNOW WHEN A MATCH IS ON. `gameplay` is that signal, and it
 * is what CrazyGames measures the initial download against and keeps its ads
 * out of.
 *
 * Who the player is, is still nobody: a guest session, exactly as in a browser
 * tab (`ui/guest.ts`). Signing in with a CrazyGames account is the next piece of
 * work and a Worker route of its own, not something this file can do alone.
 */

import type { Platform } from './index';
import { keepGuestIn, type GuestStore } from '../ui/guest';
import { onDocumentVisibility } from './visibility';

/** The SDK object the script tag puts on the window, if it did. */
const sdk = (): any => (globalThis as any).window?.CrazyGames?.SDK;

/**
 * Is the SDK loaded? Only the CrazyGames build carries its script, so this is
 * the same thing as "this is the CrazyGames build" — and on their site, on
 * localhost and under `?useLocalSdk=true`, also "the SDK will answer".
 */
export const inCrazyGames = (): boolean => Boolean(sdk());

/**
 * Whether the SDK said yes to `init()`. Off their site and off localhost it
 * says `disabled` and every call after that throws, so each one below checks
 * this first and falls back to doing what a browser tab would.
 */
let live = false;

/* ---------------------------------------------------------------- the guest */

/**
 * The SDK's Data module, shaped as the store the guest is kept in.
 *
 * It keeps a logged-in player's data in their CrazyGames account and syncs it
 * to every device they play on; for a player who is not logged in it keeps it
 * in this browser and moves it into the account if they log in later. Only the
 * guest goes here: it is the key to everything the server holds for the player,
 * so it is the one thing that has to follow them. Every other key stays in
 * localStorage, where losing it costs a convenience and nothing more.
 *
 * Its API is localStorage's. An empty value is a removal, as it is for the
 * guest module. Any error — the module switched off on CrazyGames' side, over
 * its 1MB, anything — reads as nothing kept and writes as a no-op, so the guest
 * module falls back on what it already had rather than losing it.
 */
const dataModule: GuestStore = {
  read(key) {
    try {
      const v = sdk().data.getItem(key);
      return v == null ? null : String(v);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      if (value) sdk().data.setItem(key, value);
      else sdk().data.removeItem(key);
    } catch {
      /* not kept in the account; the browser's copy still stands */
    }
  },
};

/** Exported for the tests, which are the only thing that may call it. */
export const __dataModule = dataModule;

/* ---------------------------------------------------------------- invitations */

/**
 * The code an invitation carries, whichever of the server's two links it came
 * as. The web link puts it in `?d=` or `?f=` (worker/src/index.ts, `webInvite`);
 * the bot link in `?start=duel_…` or `?start=friend_…`.
 */
function codeOf(link: string): { key: 'd' | 'f'; code: string } | null {
  try {
    const url = new URL(link);
    const duel = url.searchParams.get('d');
    if (duel) return { key: 'd', code: duel };
    const friend = url.searchParams.get('f');
    if (friend) return { key: 'f', code: friend };
    const start = /^(duel|friend)_([0-9a-z]+)$/i.exec(url.searchParams.get('start') ?? '');
    if (start) return { key: start[1].toLowerCase() === 'duel' ? 'd' : 'f', code: start[2] };
  } catch {
    /* not an address at all */
  }
  return null;
}

/** Exported for the tests, which are the only thing that may call it. */
export const __codeOf = codeOf;

/**
 * Hand a text to somebody, from inside an iframe with no contact list of its
 * own. The system share sheet where the browser has one and the iframe is
 * allowed it; otherwise the clipboard, so the button still leaves the player
 * with something to paste rather than doing nothing.
 */
function handOver(text: string): void {
  const nav = (globalThis as any).navigator;
  const copy = () => void nav?.clipboard?.writeText?.(text).catch(() => {});
  if (!nav?.share) return copy();
  nav.share({ text }).catch((err: { name?: string }) => {
    // the player closing the sheet is not a reason to overwrite their clipboard
    if (err?.name !== 'AbortError') copy();
  });
}

export const CRAZYGAMES: Platform = {
  id: 'crazygames',
  walled: true,

  async ready(): Promise<void> {
    // The one hook the stylesheet has on this host: CrazyGames plays in a wide,
    // short iframe the phone layouts were never drawn for (styles.css, under
    // `[data-host='crazygames']`). Set before anything else, so the first frame
    // is already laid out for it.
    const doc = (globalThis as any).document;
    if (doc?.documentElement) doc.documentElement.dataset.host = 'crazygames';
    const s = sdk();
    if (!s) return;
    try {
      await s.init();
      live = s.environment !== 'disabled';
      // Before anything reads the guest: App asks for one after this resolves.
      if (live && s.data) keepGuestIn(dataModule);
    } catch {
      // A page that cannot reach CrazyGames still has a game in it; it just
      // plays as an ordinary tab with nobody told.
      live = false;
    }
  },

  authToken(): string {
    return '';
  },

  userId(): string | null {
    return null;
  },

  userName(): string {
    return '';
  },

  language(): string {
    // The site's own idea first, which is the language the player browses
    // CrazyGames in; they ask games to use it and fall back to English, and
    // `ui/i18n.ts` already falls back to English on anything it cannot read.
    let said = '';
    if (live) {
      try {
        said = String(sdk().user?.systemInfo?.locale ?? '').trim();
      } catch {
        /* no system info is no opinion */
      }
    }
    return said || String((globalThis as any).navigator?.language ?? '');
  },

  launchParam(): string {
    if (!live) return '';
    try {
      const duel = sdk().game.getInviteParam('d');
      if (duel) return `duel_${duel}`;
      const friend = sdk().game.getInviteParam('f');
      if (friend) return `friend_${friend}`;
    } catch {
      /* no invitation is the ordinary launch */
    }
    return '';
  },

  haptic(kind: 'light' | 'heavy'): void {
    (globalThis as any).navigator?.vibrate?.(kind === 'heavy' ? 25 : 10);
  },

  openLink(url: string): void {
    // Only ever reached for links this host allows — the privacy policy. The
    // rest are kept from getting here by `walled`.
    (globalThis as any).window?.open(url, '_blank', 'noopener');
  },

  share(text: string, url?: string): void {
    handOver(url ? `${text} ${url}` : text);
  },

  invitation(link: string): string {
    const found = codeOf(link);
    if (!found || !live) return '';
    try {
      return String(sdk().game.inviteLink({ [found.key]: found.code }) ?? '');
    } catch {
      return '';
    }
  },

  gameplay: (() => {
    // Called every frame by the match loop; the site is told only on a change.
    let on = false;
    return (playing: boolean): void => {
      if (playing === on || !live) return;
      on = playing;
      try {
        if (playing) sdk().game.gameplayStart();
        else sdk().game.gameplayStop();
      } catch {
        /* a missed signal costs the site a statistic, not the player a match */
      }
    };
  })(),

  onLink(): () => void {
    // An invitation opened on CrazyGames is a page load, which `launchParam` covers.
    return () => {};
  },

  onVisibility(listener: (visible: boolean) => void): () => void {
    return onDocumentVisibility(listener);
  },
};
