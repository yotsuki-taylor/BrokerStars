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
 * WHO THE PLAYER IS comes from CrazyGames when they are logged in there, and
 * that needs no button: CrazyGames logs its users in for every game, and asks
 * games to use the account and its username. At startup the SDK's user token is
 * traded once at `/auth/crazygames` for a session of the Worker's own, which is
 * what every request then carries. A player who is not logged in is a guest, as
 * in a browser tab (`ui/guest.ts`), kept in the Data module.
 */

import type { Platform } from './index';
import { forgetGuest, guestToken, keepGuestIn, type GuestStore } from '../ui/guest';
import { read, write } from '../ui/store';
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

/* -------------------------------------------------------------- the account */

/**
 * Where the Worker is, read when it is needed rather than once at load, which
 * is all that lets the tests point it somewhere.
 */
const api = (): string => String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

const SESSION_KEY = 'brokerstars.cg.session';

/** How long startup waits on the sign-in before the game draws as a guest. */
const SIGN_IN_MS = 5000;

interface Session {
  /** the Worker's own token, what every request carries */
  token: string;
  /** `cg:<userId>`, or whatever it resolves to on the server */
  id: string;
  /** the CrazyGames username */
  name: string;
  /**
   * Which CrazyGames account it was minted for, so that another account logging
   * in on this browser is traded afresh. Told apart by the SDK's own user id,
   * which its docs say not to trust for authentication — and it is not: it only
   * decides whether to ask the server again, and the server checks the token.
   */
  user: string;
}

let session: Session | null = null;

function loadSession(): Session | null {
  try {
    const raw = read(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    return s.token && s.id
      ? { token: String(s.token), id: String(s.id), name: String(s.name ?? ''), user: String(s.user ?? '') }
      : null;
  } catch {
    return null;
  }
}

function keepSession(next: Session | null): void {
  session = next;
  write(SESSION_KEY, next ? JSON.stringify(next) : '');
}

/**
 * Sign the player in as the CrazyGames user they are logged in as, if they are.
 *
 * Silent in every way it can fail — no server, no account features on this
 * domain, a token the server refuses, a slow network — because each of them
 * leaves an ordinary guest, which is a whole game. A logout on CrazyGames
 * reloads the page, so a player who is no longer logged in arrives here with
 * no user, and the session kept for the last one is let go of.
 *
 * The guest goes along to the server, which makes the account a second door
 * into the guest's save; once it has, the guest is spent.
 */
async function signIn(): Promise<void> {
  const base = api();
  const user = sdk()?.user;
  if (!base || !user?.isUserAccountAvailable) return;

  let who: { username?: string; __dangerousUserId?: string } | null = null;
  try {
    who = await user.getUser();
  } catch {
    return;
  }
  if (!who) {
    keepSession(null);
    return;
  }

  // Traded afresh on every launch, as CrazyGames asks: a username changed
  // there reaches the game, and the server, the next time it opens. The
  // session kept from last time is only the fallback for a trade that fails,
  // and only for the same account -- somebody else logged in on this browser
  // is never handed the last one's session.
  const tag = String(who.__dangerousUserId ?? who.username ?? '');
  const held = loadSession();
  const fallback = held && held.user === tag ? held : null;
  const keepHeld = () => {
    session = fallback;
  };

  let token = '';
  try {
    token = String((await user.getUserToken({ signingKeyType: 'IN_GAME_AUTH' })) ?? '');
  } catch {
    return keepHeld();
  }
  if (!token) return keepHeld();

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), SIGN_IN_MS);
  try {
    const res = await fetch(`${base}/auth/crazygames`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, guest: guestToken() }),
      signal: stop.signal,
    });
    if (!res.ok) return keepHeld();
    const body = (await res.json()) as { token?: string; id?: string; name?: string; adopted?: boolean };
    if (!body.token || !body.id) return keepHeld();
    keepSession({
      token: body.token,
      id: body.id,
      name: String(body.name || who.username || '').slice(0, 24),
      user: tag,
    });
    if (body.adopted) forgetGuest();
  } catch {
    // no answer in time: last launch's session, or a guest
    keepHeld();
  } finally {
    clearTimeout(timer);
  }
}

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
  ownNames: true,

  async ready(): Promise<void> {
    // The one hook the stylesheet has on this host: CrazyGames plays in a wide,
    // short iframe the phone layouts were never drawn for (styles.css, under
    // `[data-host='crazygames']`). Set before anything else, so the first frame
    // is already laid out for it.
    const doc = (globalThis as any).document;
    if (doc?.documentElement) doc.documentElement.dataset.host = 'crazygames';
    // nobody until the SDK says otherwise (`signIn`)
    session = null;
    const s = sdk();
    if (!s) return;
    try {
      await s.init();
      live = s.environment !== 'disabled';
      // Before anything reads the guest: App asks for one after this resolves.
      if (live && s.data) keepGuestIn(dataModule);
      // And before the first frame, which asks who is playing.
      if (live) await signIn();
    } catch {
      // A page that cannot reach CrazyGames still has a game in it; it just
      // plays as an ordinary tab with nobody told.
      live = false;
    }
  },

  authToken(): string {
    return session?.token ?? '';
  },

  userId(): string | null {
    return session?.id ?? null;
  },

  userName(): string {
    return session?.name ?? '';
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

  /**
   * Room Data, which is how CrazyGames draws its invite button: a room the
   * player can be joined in, its invitation parameters, and later that it is
   * closed. The old show/hide button calls are deprecated in favour of this.
   * The parameters are the duel link's own, so a friend arriving through the
   * button lands where a link would have put them (`launchParam`, `onLink`).
   */
  room: (() => {
    let open: string | null = null;
    return (code: string | null): void => {
      if (code === open || !live) return;
      const was = open;
      open = code;
      try {
        const game = sdk().game;
        if (code) {
          game.updateRoom({ roomId: code, isJoinable: true, inviteParams: { d: code } });
        } else if (was) {
          game.updateRoom({ isJoinable: false });
          game.leftRoom();
        }
      } catch {
        /* no button is a duel still joined by its link */
      }
    };
  })(),

  instantDuel(): boolean {
    if (!live) return false;
    try {
      return sdk().game.isInstantMultiplayer === true;
    } catch {
      return false;
    }
  },

  onMute(listener: (muted: boolean) => void): () => void {
    if (!live) return () => {};
    try {
      const game = sdk().game;
      const hear = (settings: { muteAudio?: boolean } | undefined) =>
        listener(settings?.muteAudio === true);
      hear(game.settings);
      game.addSettingsChangeListener(hear);
      return () => {
        try {
          game.removeSettingsChangeListener(hear);
        } catch {
          /* already gone */
        }
      };
    } catch {
      return () => {};
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

  /**
   * A friend's invitation accepted while the game is already open — the invite
   * button, or a link opened in the same tab — arrives here rather than as a
   * page load, so the duel is joined without a reload. Shaped like
   * `launchParam`, which covers the invitations that do start the game.
   */
  onLink(listener: (param: string) => void): () => void {
    if (!live) return () => {};
    try {
      const game = sdk().game;
      const join = (params: Record<string, unknown> | undefined) => {
        const duel = params?.d;
        const friend = params?.f;
        if (duel) listener(`duel_${duel}`);
        else if (friend) listener(`friend_${friend}`);
      };
      game.addJoinRoomListener(join);
      return () => {
        try {
          game.removeJoinRoomListener(join);
        } catch {
          /* already gone */
        }
      };
    } catch {
      return () => {};
    }
  },

  onVisibility(listener: (visible: boolean) => void): () => void {
    return onDocumentVisibility(listener);
  },
};
