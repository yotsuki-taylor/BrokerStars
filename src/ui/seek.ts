/**
 * PLAY asking the server whether anybody else is looking for a match.
 *
 * One socket, one question, one answer: a duel code to sit down at, or nobody.
 * The rules of the pool — who is paired with whom, and how long a seeker waits
 * — are the server's and are written down in `src/duel/pool.ts`. All this end
 * decides is that a server which says nothing at all is the same as a server
 * that said nobody.
 */

import { SEEK_GRACE_MS, SEEK_MS, type SeekClientMsg, type SeekServerMsg } from '../duel/pool';
import { normalizeCode } from '../duel/protocol';
import { apiBase, initData } from './api';
import { duelsAvailable } from './duel';

/** Whether this build can look for anybody: a server, and a way to say who is asking. */
export const seekAvailable = duelsAvailable;

export interface Search {
  /** the code of the duel to sit down at, or null for a bot */
  result: Promise<string | null>;
  /** stop looking; the result settles as null */
  cancel(): void;
}

export function seekRival(league: number): Search {
  let settle: (code: string | null) => void = () => {};
  const result = new Promise<string | null>((resolve) => {
    settle = resolve;
  });

  let ws: WebSocket | null = null;
  let done = false;
  const finish = (code: string | null) => {
    if (done) return;
    done = true;
    window.clearTimeout(fallback);
    try {
      ws?.close();
    } catch {
      /* already gone */
    }
    settle(code);
  };

  // Only for an answer that never comes. The server always answers inside
  // `SEEK_MS`, and its answer is the one that counts (`pool.ts` says why).
  const fallback = window.setTimeout(() => finish(null), SEEK_MS + SEEK_GRACE_MS);

  try {
    ws = new WebSocket(`${apiBase().replace(/^http/, 'ws')}/match/ws`);
  } catch {
    finish(null);
    return { result, cancel: () => finish(null) };
  }

  ws.onopen = () => {
    const msg: SeekClientMsg = { k: 'seek', initData: initData(), league };
    ws?.send(JSON.stringify(msg));
  };
  ws.onmessage = (e) => {
    let msg: SeekServerMsg;
    try {
      msg = JSON.parse(String(e.data)) as SeekServerMsg;
    } catch {
      return;
    }
    finish(msg.k === 'found' ? normalizeCode(msg.code) : null);
  };
  // A pool that is not deployed, a dropped connection, a refusal: all of them
  // are a match against a bot, which is what PLAY was before any of this.
  ws.onclose = () => finish(null);
  ws.onerror = () => finish(null);

  return { result, cancel: () => finish(null) };
}
