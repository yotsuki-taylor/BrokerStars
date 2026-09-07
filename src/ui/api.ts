/**
 * Talking to the leaderboard and to the player's own profile (see worker/).
 *
 * Everything here is allowed to fail. The game is a single-player experience
 * that happens to keep a board and, since the room and the wardrobe moved off
 * the phone, a profile; if either is down, unreachable, or simply not
 * configured for this build, matches still play, stars are still earned and
 * everything is still written to `localStorage` exactly as it used to be.
 * Nothing in this file throws at a caller and nothing blocks a render.
 *
 * Two reasons a submission is skipped rather than attempted:
 *
 *   no VITE_API_URL — a build with no server behind it, which is every local
 *   `npm run dev` unless somebody sets one.
 *
 *   no Telegram initData — the game opened in a plain browser rather than
 *   inside Telegram. The server refuses unsigned results by design, so there is
 *   nothing to send. Reading the board still works: it is public.
 */

import { cleanProfile, type Claim, type Profile } from '../profile/protocol';
import { LEAGUE_COUNT } from './leagues';
import { read, write } from './store';
import type { Outfit, Rarity, Slot } from './wardrobe';

const BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/**
 * The signed one. `initDataUnsafe` is the forgeable one — see admin.ts.
 *
 * Exported because duels need it too: the object that runs a duel has to know
 * who is on each end of it, and this string is the only thing that says so in
 * a way a server can check (src/ui/duel.ts).
 */
export function initData(): string {
  return String((window as any).Telegram?.WebApp?.initData ?? '');
}

/** Where the server is, for the socket a duel opens. Empty in a build with none. */
export const apiBase = (): string => BASE;

/** Who the server will say we are, used only to highlight a row. */
export function myId(): string | null {
  const id = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id == null ? null : String(id);
}

export const boardConfigured = (): boolean => BASE !== '';

export interface BoardRow {
  rank: number;
  id: string;
  name: string;
  stars: number;
  matches: number;
  wins: number;
  best_net_worth: number;
  top_league: number;
  you: boolean;
}

export interface Board {
  top: BoardRow[];
  /** the caller's own row when they fell outside the slice above */
  me: BoardRow | null;
}

/** Six seconds: long enough for a cold worker, short enough not to look hung. */
const TIMEOUT_MS = 6000;

/**
 * What came back, status and all. The status matters to exactly one caller —
 * handing a match in, which has to tell "the server said no" from "the server
 * said nothing" — and everybody else reads `ok()` below and forgets about it.
 */
interface Answer {
  status: number;
  body: unknown;
}

/** Null means nothing came back at all: no network, no server, no patience. */
async function call(path: string, init?: RequestInit): Promise<Answer | null> {
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: stop.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* an error page is not JSON, and the status is the part that matters */
    }
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

const ok = (a: Answer | null): unknown => (a && a.status === 200 ? a.body : null);

/**
 * Is there anywhere to send a signed thing at all? False for a build with no
 * `VITE_API_URL` and for the game opened outside Telegram — in both cases the
 * answer is not "try again later" but "not in this life", so nothing is queued
 * for a retry that could never happen.
 */
const canSign = (): boolean => BASE !== '' && initData() !== '';

/** A signed POST, which is every write. Null when there is no server to sign to. */
async function post(path: string, body: Record<string, unknown>): Promise<Answer | null> {
  const signed = initData();
  if (!BASE || !signed) return null;
  return call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, initData: signed }),
  });
}

/** The board, or null when there is none to be had. Never throws. */
export async function fetchBoard(limit = 25): Promise<Board | null> {
  if (!BASE) return null;
  const me = myId();
  const body = ok(
    await call(`/top?limit=${limit}${me ? `&me=${encodeURIComponent(me)}` : ''}`),
  ) as Board | null;
  return body && Array.isArray(body.top) ? body : null;
}

export interface MatchResult {
  seed: string;
  league: number;
  outcome: 'win' | 'draw' | 'loss';
  netWorth: number;
  tradedWell: boolean;
  /**
   * This match's name, minted once when it finished and never again. It is the
   * whole of what makes sending it twice safe: the server pays the first
   * arrival and answers every later one with what the first one earned, so a
   * submission whose answer was lost can simply be sent again.
   */
  token: string;
  /** went broke — an award turns on it, and a net worth of zero is not proof */
  bankrupt: boolean;
  /** trades made; zero in a won match is an award of its own */
  trades: number;
  /** which companies were on the board, for the archive */
  companies: string[];
}

/** A name for one finished match. Random, and nothing is read off it. */
export function mintToken(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    return [...c.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // no crypto at all is not a browser this game runs in, but a token that is
  // merely unlikely to collide still beats no token
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * What became of one attempt, and what to do about it.
 *
 * The distinction that matters is `retry` against `drop`. A match that was
 * played and could not be handed in is stars the player earned and did not get,
 * because the balance is the server's now — so it is kept and sent again. A
 * match the server actively refused will be refused the same way forever, and
 * keeping it is only a queue that never empties.
 */
export type Verdict = 'done' | 'later' | 'retry' | 'drop';

/** Exported for the test that pins it down: getting this wrong loses stars. */
export function verdictOf(answer: Answer | null): Verdict {
  if (!answer) return 'retry'; // nothing came back: no network, or too slow
  if (answer.status === 200) return 'done';
  if (answer.status === 429) return 'later'; // handed one in moments ago
  if (answer.status >= 500) return 'retry'; // the server is having a moment
  return 'drop'; // 400, 401, 403: this will not work later either
}

const send = async (result: MatchResult): Promise<Verdict> =>
  verdictOf(await post('/result', { ...result }));

/* ------------------------------------------------- matches still to hand in */

/**
 * Matches played while the server could not be reached.
 *
 * This queue only earns its keep because handing one in is idempotent. Before
 * the token, a retry could have paid twice for the same match if the first
 * attempt reached the database and only its answer was lost — the most likely
 * failure of the lot, and the one a timeout looks exactly like. Now the server
 * recognises the second arrival, so the choice is not "risk double pay or lose
 * the stars" any more.
 */
const PENDING_KEY = 'brokerstars.pending';

/** Deep enough for a bad evening, shallow enough to drain in one sitting. */
const MAX_PENDING = 8;

/** After this many real failures a match is not coming back. Let it go. */
const MAX_TRIES = 6;

interface Pending extends MatchResult {
  tries: number;
}

function loadPending(): Pending[] {
  try {
    const raw = read(PENDING_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr)) return [];
    return arr.filter((r): r is Pending => Boolean(r) && typeof r.token === 'string' && r.token);
  } catch {
    return [];
  }
}

const savePending = (queue: Pending[]) => write(PENDING_KEY, JSON.stringify(queue));

/** Keep a match for later, oldest out first once the queue is full. */
function keep(result: MatchResult): void {
  const queue = loadPending().filter((r) => r.token !== result.token);
  queue.push({ ...result, tries: 1 });
  savePending(queue.slice(-MAX_PENDING));
}

/**
 * Hand a finished match in. Note what is NOT sent: how many stars it was worth.
 * The server works that out from its own table, so this cannot inflate it.
 *
 * Never throws and never blocks anything the player can see; a match that does
 * not go through goes into the queue above instead of into the ground.
 */
export async function submitResult(result: MatchResult): Promise<void> {
  if (!canSign()) return;
  const verdict = await send(result);
  if (verdict === 'retry' || verdict === 'later') keep(result);
}

/**
 * Everything still owed, tried again. Called on the way in, before the profile
 * is asked for — the stars these are worth have to be on the board before the
 * balance built out of it is read, or the answer would be short by exactly
 * them.
 */
export async function flushPending(): Promise<void> {
  if (!canSign()) return;
  const queue = loadPending();
  if (queue.length === 0) return;

  const left: Pending[] = [];
  for (const item of queue) {
    const verdict = await send(item);
    // A 429 is the server saying "not this second", which is not the match's
    // fault and does not count against its lives.
    if (verdict === 'later') left.push(item);
    else if (verdict === 'retry' && item.tries + 1 < MAX_TRIES) {
      left.push({ ...item, tries: item.tries + 1 });
    }
  }
  savePending(left);
}

/* ------------------------------------------------------------- the profile */

/**
 * The room, the wardrobe and the stars in hand, which the server now keeps —
 * see `src/profile/protocol.ts` for why. Every one of these answers with the
 * whole profile as it stands afterwards, including the refusals: a client that
 * thought it could afford something and could not wants the truth, not an
 * error code, and the truth is what redraws the star count and the button.
 *
 * All of them are still allowed to fail, exactly like the board above. Without
 * a server, or opened outside Telegram where nothing can be signed, they answer
 * null and the game goes on keeping everything in `localStorage` as it always
 * did.
 */
const profileCall = async (path: string, body: Record<string, unknown> = {}) => {
  const answer = ok(await post(path, body)) as { profile?: unknown } | null;
  return cleanProfile(answer?.profile, LEAGUE_COUNT);
};

/**
 * Open the session. `claim` is whatever this browser had in `localStorage`
 * before any of this existed; the server folds it in the first time and never
 * again (`worker/src/profile.ts`), so what comes back is the truth from here
 * on.
 */
export const openProfile = (claim: Claim): Promise<Profile | null> =>
  profileCall('/profile', { claim });

/**
 * The same handshake without the claim, for when the server has just been told
 * something this end wants the consequences of — a match handed in, a duel
 * paid out.
 */
export const refreshProfile = (): Promise<Profile | null> => profileCall('/profile');

export const buyItem = (slot: Slot, rarity: Rarity, free: boolean): Promise<Profile | null> =>
  profileCall('/profile/buy', { slot, rarity, free });

export const buyRoomStep = (free: boolean): Promise<Profile | null> =>
  profileCall('/profile/buy', { room: true, free });

export const wearOutfit = (outfit: Outfit): Promise<Profile | null> =>
  profileCall('/profile/wear', { outfit });

/** Dev only, and the server checks that for itself against a signed id. */
export const refundItem = (slot: Slot, rarity: Rarity): Promise<Profile | null> =>
  profileCall('/profile/refund', { slot, rarity });

export const refundRoomStep = (): Promise<Profile | null> =>
  profileCall('/profile/refund', { room: true });
