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
import { perksFor } from './perks';
import type { Outfit } from './wardrobe';

/** A duel needs a server to run on and a Telegram to prove who is playing. */
export const duelsAvailable = (): boolean => Boolean(apiBase()) && Boolean(initData());

export interface Invite {
  code: string;
  /** the t.me link to send, or null when the server could not name its bot */
  link: string | null;
  expiresAt: number;
  /** the highest league the server will pay this player at */
  yourLeague: number;
}

/** Open one. Null when there is no server, no signature, or it said no. */
export async function createInvite(league: number, outfit: Outfit): Promise<Invite | null> {
  const base = apiBase();
  const signed = initData();
  if (!base || !signed) return null;
  try {
    const res = await fetch(`${base}/duel/new`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signed, league, outfit }),
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
  const start = String((window as any).Telegram?.WebApp?.initDataUnsafe?.start_param ?? '');
  return start.startsWith('duel_') ? normalizeCode(start.slice(5)) : null;
}

/**
 * Hand the link to a friend. Telegram's own share sheet is the contact picker:
 * it opens the chat list, and the message lands in whichever one is tapped.
 */
export function shareInvite(link: string, text: string): void {
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener');
}

/** Best effort, and the caller shows the link either way. */
export async function copyLink(link: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(link);
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
 */
const RETRIES = 6;
const RETRY_MS = 1200;

export class DuelSocket {
  private ws: WebSocket | null = null;
  private tries = 0;
  private closed = false;
  private timer = 0;

  constructor(
    private readonly code: string,
    private readonly hello: { name: string; outfit: Outfit },
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onLink: (state: Link) => void,
  ) {
    this.dial();
  }

  private dial(): void {
    if (this.closed) return;
    const base = apiBase().replace(/^http/, 'ws');
    this.onLink(this.tries === 0 ? 'connecting' : 'lost');
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
      this.onLink('open');
      this.send({ k: 'hello', initData: initData(), ...this.hello });
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
    if (this.closed) return;
    if (++this.tries > RETRIES) {
      this.onLink('lost');
      return;
    }
    this.onLink('lost');
    this.timer = window.setTimeout(() => this.dial(), RETRY_MS);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.timer);
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
