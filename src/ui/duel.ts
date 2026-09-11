/**
 * The client half of a duel: opening one, getting into one, and turning what
 * the server says into the match state the rest of the game already draws.
 *
 * Nothing here simulates anything. `buildMirror` makes an ordinary MatchState
 * from the same seed and the same three companies the server used — which is
 * what gives the chart its segments, the headline warning its schedule and the
 * HUD its perks — and then every tick that arrives is written straight over the
 * live fields of it. The mirror is never stepped. If it were, the two players
 * would be watching two different markets within a few seconds, which is the
 * whole reason the object on the other end runs the match (see
 * `src/duel/protocol.ts`).
 */

import { CONFIG } from '../sim/config';
import { createMatch } from '../sim/match';
import type { MatchState, Trade } from '../sim/types';
import {
  normalizeCode,
  type ClientMsg,
  type DuelSync,
  type DuelTick,
  type ServerMsg,
} from '../duel/protocol';
import { apiBase, initData } from './api';
import { platform } from '../platform';
import { perksFor } from './perks';
import type { Outfit } from './wardrobe';

/** A duel needs a server to run on and a host that can prove who is playing. */
export const duelsAvailable = (): boolean => Boolean(apiBase()) && Boolean(initData());

export interface Invite {
  code: string;
  /** the t.me link to send, or null when the server could not name its bot */
  link: string | null;
  /** the same invitation as a plain web address — see `linkToShare` below */
  webLink: string | null;
  expiresAt: number;
  /**
   * The invitation was pushed into a named friend's Telegram by the bot — see
   * `invite` below. False whenever nobody was named, and also when somebody
   * was and could not be written to, which is an ordinary thing to happen: the
   * screen falls back to the link, as it would have done anyway.
   */
  sent: boolean;
  /** the highest league the server will pay this player at */
  yourLeague: number;
  /**
   * This deployment has a group chat the bot can call the duel out in, so the
   * screen may offer it. False for anybody else's server and for a build with
   * no `CHAT_ID` set — see `worker/src/chat.ts`.
   */
  chat: boolean;
}

/**
 * Open one. Null when there is no server, no signature, or it said no.
 *
 * `invite` is a friend's id, and it is the whole difference between DUEL on
 * the menu and DUEL on a friend's row: with it the server has the bot deliver
 * the invitation to that one person, instead of the player carrying the link
 * to somebody themselves. The link is minted either way and the screen still
 * shows it — a message that did not land must not be the end of the duel.
 */
export async function createInvite(
  league: number,
  outfit: Outfit,
  invite?: string,
): Promise<Invite | null> {
  const base = apiBase();
  const signed = initData();
  if (!base || !signed) return null;
  try {
    const res = await fetch(`${base}/duel/new`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signed, league, outfit, invite }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Invite & { ok?: boolean };
    return normalizeCode(body.code) ? body : null;
  } catch {
    return null;
  }
}

/**
 * The code the game was opened on, if it was opened on one.
 *
 * Two ways in, because a duel link can arrive by either. `?d=` is what the
 * bot's own button carries (see bot/bot.mjs); `start_param` is what a direct
 * mini-app link would carry if one is ever set up. Read once and wiped from the
 * address bar, so reloading the page does not try to rejoin a duel that is over.
 */
export function duelCodeFromLaunch(): string | null {
  let code: string | null = null;
  try {
    const url = new URL(window.location.href);
    code = normalizeCode(url.searchParams.get('d'));
    if (code) {
      url.searchParams.delete('d');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    /* an address bar we cannot read is one with no duel in it */
  }
  if (code) return code;
  return duelCodeIn(platform().launchParam());
}

/**
 * A duel code out of a launch parameter, or null when the parameter is about
 * something else. Split out from the reader above because the parameter has a
 * second way in now: on Android a link tapped while the game is already open
 * arrives as an event rather than as a launch (`platform().onLink`), and both
 * doors hand over the same string.
 */
export const duelCodeIn = (param: string): string | null =>
  param.startsWith('duel_') ? normalizeCode(param.slice(5)) : null;

/**
 * Which of the two links to hand somebody, and the only place that decides.
 *
 * The server mints both (worker/src/index.ts) because they are good at
 * different things, and the difference is about the RECIPIENT rather than about
 * us. The `t.me/<bot>?start=…` one opens for anybody with Telegram, including
 * somebody who has never started the mini app — no other link does that, and
 * inside Telegram everyone you can reach has Telegram. The web one is an
 * ordinary address: it is tappable in any chat app, it lands on the game's own
 * page, and a recipient with nothing installed simply plays there.
 *
 * So: in Telegram, the bot link; anywhere else, the web link. An Android player
 * sending a t.me address to somebody without Telegram is sending a dead end,
 * and that is what this exists to stop.
 *
 * Either may be null — a deployment with no bot, or one that does not know
 * where the game is served from — so each falls back to the other rather than
 * leaving the player with nothing to send.
 */
export function linkToShare(bot: string | null, web: string | null): string | null {
  return platform().id === 'telegram' ? (bot ?? web) : (web ?? bot);
}

/**
 * The address that wakes the installed Android app on a duel.
 *
 * The other half of `paramFromUrl` in `src/platform/android.ts`, which turns it
 * back into the `duel_<code>` string a Telegram launch carries. A scheme of our
 * own rather than an https App Link, for the reason written out there.
 */
export const appLink = (code: string): string => `brokerstars://duel/${code}`;

/**
 * Is this page worth offering the app to?
 *
 * Nobody can ask a phone what it has installed — no browser and no chat may,
 * and that is deliberate. So the page does not ask. It offers, on the only
 * devices where the offer could mean anything, and the player answers by
 * tapping or not tapping.
 *
 * WHY IT IS A SCREEN AND NOT A LINK ON THE WAY PAST. The invitation could be
 * taken here and handed over afterwards, and that would be worse: sitting down
 * starts the match, and the seat is held by the id that took it. The app would
 * arrive a second later as somebody else and be told the duel had started. So
 * the choice is made before anybody sits, which costs an Android player one tap
 * and costs everybody else nothing.
 *
 * Not offered inside the app itself, where there is nothing to hand over to.
 */
export function canHandOver(): boolean {
  if (platform().id === 'android') return false;
  return /Android/i.test(String((globalThis as any).navigator?.userAgent ?? ''));
}

/**
 * Hand the link to a friend, through whatever passes for a contact list where
 * the game is running: Telegram's own share sheet inside Telegram, the system
 * one on Android, a browser tab pointed at Telegram's sheet in a plain page.
 * Which is which is `src/platform/`'s business, not this module's.
 */
export function shareInvite(link: string, text: string): void {
  platform().share(text, link);
}

/** How a shout into the group chat ended. */
export type Shout = 'ok' | 'wait' | 'failed';

/**
 * Have the bot call this duel out in the game's group chat.
 *
 * For the player with nobody: no friends on the list and nobody to hand the
 * link to. The message is the server's to send and the rate limit is the
 * server's to enforce (`worker/src/chat.ts`) — this end knows only whether it
 * went, so that the button can say so.
 *
 * `wait` is not a failure and is worth its own answer: it means the chat heard
 * from this player minutes ago, and a screen that said "could not send" to
 * that would be lying about a rule the player is allowed to know.
 */
export async function shoutInvite(code: string): Promise<Shout> {
  const base = apiBase();
  const signed = initData();
  if (!base || !signed) return 'failed';
  try {
    const res = await fetch(`${base}/duel/shout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signed, code }),
    });
    if (!res.ok) return 'failed';
    const body = (await res.json()) as { ok?: boolean; reason?: string };
    if (body.ok) return 'ok';
    return body.reason === 'wait' ? 'wait' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Put a string on the clipboard. Best effort, and every caller goes on showing
 * the thing it copied either way.
 *
 * Called `copyText` rather than `copyLink`: it started life copying an
 * invitation and now also copies a link code, which is not a link and is the
 * one thing in this game somebody has to carry between two devices by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- the socket */

export type Link = 'connecting' | 'open' | 'lost';

/**
 * One duel's connection, with a few reconnects in it.
 *
 * A phone that locks for four seconds drops the socket, and the object on the
 * other end is happy to take the seat back and say what has happened since —
 * so the right answer to a dropped connection is to dial again, not to end the
 * match. Give up after enough tries that a real outage stops looking like one.
 *
 * Three numbers, and each is there for a reason a player would recognise.
 *
 * The first retry is almost immediate and the rest back off: most drops are a
 * blip and heal on the first try, and waiting a second and a half to find that
 * out is a second and a half of a match spent looking at a warning.
 *
 * Which is what `GRACE_MS` is really about. A blip that heals inside it is
 * never mentioned — the banner is for a connection that is actually in
 * trouble, and one that flashes up whenever a packet is late trains the player
 * to ignore it.
 *
 * `PING_MS` keeps something going up the wire. A player who is not trading
 * sends nothing at all, and there are mobile carriers that will quietly hang
 * up a connection that has been one-way for a minute.
 */
const BACKOFF_MS = [200, 500, 1000, 2000, 3000, 4000];
const GRACE_MS = 2500;
const PING_MS = 20_000;

export class DuelSocket {
  private ws: WebSocket | null = null;
  private tries = 0;
  private closed = false;
  private timer = 0;
  private grace = 0;
  private heartbeat = 0;

  constructor(
    private readonly code: string,
    private readonly hello: { name: string; outfit: Outfit },
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onLink: (state: Link) => void,
  ) {
    this.onLink('connecting');
    this.dial();
  }

  private dial(): void {
    if (this.closed) return;
    const base = apiBase().replace(/^http/, 'ws');
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${base}/duel/${this.code}/ws`);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.tries = 0;
      window.clearTimeout(this.grace);
      this.grace = 0;
      this.onLink('open');
      this.send({ k: 'hello', initData: initData(), ...this.hello });
      window.clearInterval(this.heartbeat);
      this.heartbeat = window.setInterval(() => this.send({ k: 'ping' }), PING_MS);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* a message we cannot read is one we did not get */
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.retry();
    };
    ws.onerror = () => {
      // onclose follows, and doing the retry twice would halve the budget
    };
  }

  private retry(): void {
    this.ws = null;
    window.clearInterval(this.heartbeat);
    this.heartbeat = 0;
    if (this.closed) return;

    // Say nothing yet. If the next dial lands inside the grace, the player
    // never learns this happened, which is the truthful thing to show them:
    // the match did not miss anything either.
    if (!this.grace) {
      this.grace = window.setTimeout(() => {
        this.grace = 0;
        if (this.ws?.readyState !== WebSocket.OPEN) this.onLink('lost');
      }, GRACE_MS);
    }

    const wait = BACKOFF_MS[this.tries];
    if (wait === undefined) {
      window.clearTimeout(this.grace);
      this.grace = 0;
      this.onLink('lost');
      return;
    }
    this.tries++;
    this.timer = window.setTimeout(() => this.dial(), wait);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.grace);
    window.clearInterval(this.heartbeat);
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      /* already gone */
    }
  }
}

/* ------------------------------------------------------------- the mirror */

export interface DuelSetup {
  seed: number;
  stocks: MatchState['cfg']['stocks'];
  names: [string, string];
  outfits: [Outfit, Outfit];
  abilities: [MatchState['traders'][number]['ability'], MatchState['traders'][number]['ability']];
}

/**
 * The state the screens read, built to agree with the server's before a single
 * tick arrives: same seed, same board, so the same news schedule and the same
 * committed future behind the ORACLE's four ticks of peek.
 *
 * The local player is always trader 0, because the server writes every message
 * that way round (see `src/duel/protocol.ts`).
 */
export function buildMirror(setup: DuelSetup): MatchState {
  const cash = CONFIG.match.startingCash;
  const perks = [perksFor(setup.outfits[0], cash), perksFor(setup.outfits[1], cash)];
  return createMatch(setup.seed, CONFIG, {
    stocks: setup.stocks,
    traders: [
      {
        name: setup.names[0],
        kind: 'human',
        preset: 'medium',
        perks: perks[0].trader,
        ability: setup.abilities[0],
      },
      {
        name: setup.names[1],
        kind: 'human',
        preset: 'medium',
        perks: perks[1].trader,
        ability: setup.abilities[1],
      },
    ],
  });
}

/**
 * Write one tick over the mirror.
 *
 * A tick that repeats the number already on the state is not a new tick: it is
 * the server answering a tap between two of them, which it does at once rather
 * than making the player wait out the rest of the half-second. Everything on
 * the books moves for one of those; the two histories do not. They are what
 * each tick *closed* at, the server keeps them the same way, and a busy player
 * would otherwise finish the match with a longer chart than a quiet one.
 */
export function applyTick(st: MatchState, d: DuelTick): Trade[] {
  const fresh = d.t !== st.tick;
  st.tick = d.t;

  for (let i = 0; i < st.stocks.length; i++) {
    const s = st.stocks[i];
    if (fresh) {
      s.prevPrice = s.price;
      s.history.push(d.p[i]);
    }
    s.price = d.p[i];
  }

  for (let i = 0; i < st.traders.length; i++) {
    const t = st.traders[i];
    const x = d.tr[i];
    if (!x) continue;
    t.cash = x.c;
    t.positions = [...x.pos];
    t.avgEntry = [...x.ae];
    t.netWorth = x.nw;
    t.bankrupt = x.bust;
    t.abilityUsed = x.used;
    t.undosLeft = x.ul;
    // Enough of a snapshot for `canUndo` to answer; the real one is on the
    // server, and taking a trade back is a message, not a local edit.
    t.undoPoint = x.ua < 0 ? null : { tick: x.ua, cash: 0, positions: [], avgEntry: [] };
    if (fresh) t.netWorthHistory.push(x.nw);
  }

  st.abilities = d.ab;
  for (const n of d.news) st.news.push(n);
  for (const trade of d.trades) st.traders[trade.trader]?.trades.push(trade);
  st.finished = d.fin;
  st.winner = d.win;
  st.resigned = d.res;
  return d.trades;
}

/** Everything a client that missed part of the match has to be told at once. */
export function applySync(st: MatchState, sync: DuelSync, tick: DuelTick): Trade[] {
  for (let i = 0; i < st.stocks.length; i++) {
    if (sync.hist[i]) st.stocks[i].history = [...sync.hist[i]];
  }
  for (let i = 0; i < st.traders.length; i++) {
    if (sync.nwHist[i]) st.traders[i].netWorthHistory = [...sync.nwHist[i]];
    if (sync.trades[i]) st.traders[i].trades = [...sync.trades[i]];
  }
  st.news = [...sync.news];
  // The histories above already run to the tick below, so it must not extend
  // them: line the counter up first and the write lands in place.
  st.tick = tick.t;
  applyTick(st, tick);
  return [];
}
