/**
 * The pool: everybody who pressed PLAY in the last few seconds, and who of them
 * gets to play somebody real.
 *
 * One object for the whole game, named `pool`. One is the point rather than a
 * shortcut: a pairing is a decision about two sockets at once, and two objects
 * could each hand the same waiting player to a different stranger. Everything
 * here is a list in memory a few entries long, so one is also plenty — and an
 * eviction costs the people waiting at that instant a bot match, which is what
 * they would have had anyway.
 *
 * The decisions themselves are `Pool` in `src/duel/pool.ts`, plain enough to
 * test without a Worker. This file is the sockets around it: who is asking,
 * the deadline, and opening the duel a pair sits down at.
 */

import { Pool, type SeekClientMsg, type SeekServerMsg, type Seeker } from '../../src/duel/pool';
import { cleanOutfit } from '../../src/profile/protocol';
import { identify } from './auth';
import { duelStub, mintCode } from './duel';
import { nameOf, outfitOf } from './profile';
import type { Env } from './results';
import type { Caller } from './telegram';

/** Long enough for a phone to say who it is; a socket that has not is nobody. */
const HELLO_TIMEOUT_MS = 10_000;

interface Waiter {
  ws: WebSocket;
  caller: Caller;
  /**
   * The socket closed. Set by the close handler whenever it fires — including
   * while `seek` is still waiting on `identify`, which is the case the pool
   * alone cannot see: the seeker is not in it yet, so leaving it does nothing,
   * and without this they would be put in a moment later with nobody on the
   * other end. A stranger paired with that is paired with an empty chair.
   */
  gone: boolean;
}

export class Matchmaker implements DurableObject {
  private pool = new Pool<Waiter>();

  constructor(
    _state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.accept(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private accept(ws: WebSocket): void {
    ws.accept();
    // Made before anybody is identified, so a close at any moment has somewhere
    // to land; `caller` is filled in once `identify` has answered.
    const me: Waiter = { ws, caller: { id: '', name: '' }, gone: false };
    let asked = false;

    const hello = setTimeout(() => {
      if (!asked) close(ws);
    }, HELLO_TIMEOUT_MS);

    ws.addEventListener('message', (event) => {
      // One question per socket. Anything after it is noise.
      if (asked) return;
      let msg: SeekClientMsg;
      try {
        msg = JSON.parse(String(event.data)) as SeekClientMsg;
      } catch {
        return;
      }
      if (msg?.k !== 'seek') return;
      asked = true;
      clearTimeout(hello);
      void this.seek(me, msg);
    });

    const drop = () => {
      clearTimeout(hello);
      me.gone = true;
      this.pool.leave(me);
    };
    ws.addEventListener('close', drop);
    ws.addEventListener('error', drop);
  }

  /** Put a seeker in the pool and answer them, now or at their deadline. */
  private async seek(waiter: Waiter, msg: SeekClientMsg): Promise<void> {
    const ws = waiter.ws;
    if (!this.env.BOT_TOKEN && !this.env.SESSION_SECRET) {
      answer(ws, { k: 'error', reason: 'noserver' });
      return;
    }
    const caller = await identify(String(msg.initData ?? ''), this.env);
    if (!caller) {
      answer(ws, { k: 'error', reason: 'badsig' });
      return;
    }
    // Hung up while being identified: nobody to put in the pool.
    if (waiter.gone) return;
    waiter.caller = caller;

    const league = Math.min(4, Math.max(0, Math.floor(Number(msg.league) || 0)));
    const seeker: Seeker<Waiter> = { id: caller.id, league, at: Date.now(), handle: waiter };
    const got = this.pool.seek(seeker);

    if (got.kind === 'pair') {
      await this.open(got.host, got.guest);
      return;
    }

    if (got.replaced) answer(got.replaced.handle.ws, { k: 'none' });
    setTimeout(() => {
      // Paired or gone in the meantime: they have had their answer already.
      if (this.pool.expire(waiter)) answer(ws, { k: 'none' });
    }, got.ms);
  }

  /**
   * Open the duel two strangers sit down at, and send them both to it.
   *
   * The same object and the same route an invitation opens, told two more
   * things: that it is `ranked`, and whose is the second seat. The host's name
   * and clothes come off the server's own rows for the reason `/duel/new` takes
   * them from there — clothes are perks, and this is a match against somebody
   * who can open a console.
   */
  private async open(host: Seeker<Waiter>, guest: Seeker<Waiter>): Promise<void> {
    const code = mintCode();
    const who = host.handle.caller;
    let ok = false;
    try {
      const res = await duelStub(this.env, code).fetch('https://duel/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: who.id,
          name: (await nameOf(this.env, who.id)) || who.name,
          outfit: cleanOutfit((await outfitOf(this.env, who.id)) ?? {}),
          league: host.league,
          ranked: true,
          guest: guest.handle.caller.id,
        }),
      });
      ok = res.ok;
    } catch (err) {
      console.error('pool could not open a duel', err);
    }
    // A duel that would not open is a bot match for both, which is no worse
    // than nobody having turned up.
    const msg: SeekServerMsg = ok ? { k: 'found', code } : { k: 'none' };
    answer(host.handle.ws, msg);
    answer(guest.handle.ws, msg);
  }
}

/** Say the one thing a seeker is waiting to hear, and hang up. */
function answer(ws: WebSocket, msg: SeekServerMsg): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* gone already */
  }
  close(ws);
}

function close(ws: WebSocket): void {
  try {
    ws.close(1000, 'done');
  } catch {
    /* already gone */
  }
}
