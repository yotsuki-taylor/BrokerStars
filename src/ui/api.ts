/**
 * Talking to the leaderboard (see worker/).
 *
 * Everything here is allowed to fail. The game is a single-player experience
 * that happens to keep a board; if the board is down, unreachable, or simply
 * not configured for this build, matches still play and stars are still earned
 * locally. Nothing in this file throws at a caller and nothing blocks a render.
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

const BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** The signed one. `initDataUnsafe` is the forgeable one — see admin.ts. */
function initData(): string {
  return String((window as any).Telegram?.WebApp?.initData ?? '');
}

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

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: stop.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** The board, or null when there is none to be had. Never throws. */
export async function fetchBoard(limit = 25): Promise<Board | null> {
  if (!BASE) return null;
  const me = myId();
  const body = (await call(`/top?limit=${limit}${me ? `&me=${encodeURIComponent(me)}` : ''}`)) as
    | Board
    | null;
  return body && Array.isArray(body.top) ? body : null;
}

export interface MatchResult {
  seed: string;
  league: number;
  outcome: 'win' | 'draw' | 'loss';
  netWorth: number;
  tradedWell: boolean;
}

/**
 * Hand a finished match in. Note what is NOT sent: how many stars it was worth.
 * The server works that out from its own table, so this cannot inflate it.
 */
export async function submitResult(result: MatchResult): Promise<void> {
  const signed = initData();
  if (!BASE || !signed) return;
  await call('/result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...result, initData: signed }),
  });
}
