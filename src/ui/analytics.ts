/**
 * The game's side of its own analytics: a queue on the phone, drained to the
 * Worker now and then.
 *
 * What may be said is `src/analytics/protocol.ts`, and `track` below only takes
 * what is listed there — the same catalogue the server holds every batch
 * against. Where it goes is our own Worker and nowhere else; there is no SDK
 * here and there is not going to be one (README, «Аналитика»).
 *
 * NOTHING HERE MAY COST THE PLAYER ANYTHING. `track` writes to memory and to
 * `localStorage` and returns; sending happens on a timer and on going to the
 * background, never in the path of a tap. Every way this can fail — no server,
 * no signature yet, no network, a full or locked store, a server that answers
 * nonsense — is swallowed, and the game carries on exactly as it would have
 * without any of this.
 *
 * EVENTS WAIT FOR SOMEBODY TO BELONG TO. A fresh install that opened offline
 * has no guest session yet and so no id; what it records stays in the queue
 * and goes up under the first id this phone gets. Same for a session the
 * server has stopped accepting: a 401 keeps the queue rather than dropping it,
 * because the next token this phone holds is the same person.
 */

import { MAX_BATCH, type Event, type EventName, type EventProps, type Host } from '../analytics/protocol';
import { platform } from '../platform';
import { apiBase, initData, mintToken } from './api';
import { read, write } from './store';

const KEY = 'brokerstars.events';

/**
 * How many events wait on the phone at most. An offline evening is a few
 * hundred at the very worst; past this the oldest go first, because the
 * newest are the ones that say whether the player came back.
 */
export const MAX_QUEUE = 500;

/** How often the queue is drained while the game is open. */
const FLUSH_MS = 20_000;

/** Long enough for a cold Worker; nobody is waiting on this. */
const TIMEOUT_MS = 8_000;

/** The build, as `api.ts` reads it. */
const BUILD = typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : '';

/* ------------------------------------------------------------------ the queue */

let queue: Event[] | null = null;

function load(): Event[] {
  if (queue) return queue;
  queue = [];
  try {
    const raw = read(KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr)) {
      queue = arr.filter(
        (e): e is Event =>
          Boolean(e) && typeof e.id === 'string' && typeof e.name === 'string',
      );
    }
  } catch {
    /* an unreadable queue is an empty one */
  }
  return queue;
}

function save(): void {
  try {
    write(KEY, JSON.stringify(queue ?? []));
  } catch {
    /* a queue we cannot keep lasts as long as the page does */
  }
}

/** The oldest go first once there are too many. Exported for the test. */
export const capped = <T>(q: T[], max = MAX_QUEUE): T[] =>
  q.length > max ? q.slice(q.length - max) : q;

/**
 * Something happened. Typed against the catalogue, so a name or a props shape
 * the server would throw away does not compile here in the first place.
 */
export function track<K extends EventName>(name: K, props: EventProps[K]): void {
  try {
    const q = load();
    q.push({ id: mintToken(), name, props: props as Record<string, unknown>, ts: Date.now() });
    queue = capped(q);
    save();
  } catch {
    /* never a reason for a tap not to happen */
  }
}

/**
 * Throw away what is waiting. For a deleted account: what it did before it was
 * deleted must not go up under whoever this phone becomes next.
 */
export function forgetEvents(): void {
  queue = [];
  save();
}

/* ---------------------------------------------------------------- sending */

/**
 * Where the game is honestly running. Not `platform().id` on its own: the
 * Telegram adapter answers in an ordinary browser tab too, because the SDK
 * loads there (`platform/telegram.ts`), and a tab is not a mini app until
 * Telegram has signed something.
 */
export function hostOf(): Host {
  const p = platform();
  if (p.id === 'android') return 'android';
  if (p.id === 'telegram' && p.authToken()) return 'telegram';
  return 'web';
}

/**
 * What to do with a batch after one attempt. Exported for the test.
 *
 *   sent — the server has it, or refused it for a reason that will not
 *          change (400, 413): either way it leaves the queue
 *   keep — nothing came back, the server is having a moment, or it does not
 *          know who is asking yet (401): try again later
 */
export function outcomeOf(status: number | null): 'sent' | 'keep' {
  if (status === 200 || status === 400 || status === 413) return 'sent';
  return 'keep';
}

let sending = false;

async function post(batch: Event[], keepalive: boolean): Promise<number | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: initData(), host: hostOf(), build: BUILD, events: batch }),
      // So the request outlives the page when the player swipes the app away.
      keepalive,
      signal: stop.signal,
    });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drain the queue, fifty at a time, until it is empty or something says stop.
 * One drain at a time; a call that arrives while one is running is the same
 * wish and is dropped.
 */
export async function flushEvents(keepalive = false): Promise<void> {
  if (sending) return;
  try {
    if (!apiBase() || !initData()) return;
    sending = true;
    for (;;) {
      const batch = load().slice(0, MAX_BATCH);
      if (batch.length === 0) return;
      const status = await post(batch, keepalive);
      if (outcomeOf(status) === 'keep') return;
      // By id rather than by position: events tracked while the request was
      // out are behind these in the queue and must stay there.
      const gone = new Set(batch.map((e) => e.id));
      queue = load().filter((e) => !gone.has(e.id));
      save();
    }
  } catch {
    /* next time */
  } finally {
    sending = false;
  }
}

/* ---------------------------------------------------------------- the clock */

let started = false;
/** Once per page, however many times React mounts the component that asks. */
let opened = false;

/**
 * Called once, when the game has drawn: the first `app_open`, the timer, and
 * the background listener. Returns the way to stop, for a component that
 * unmounts; a second call before that is a no-op, and the launch is counted
 * once per page, so React's development double-mount does not make it two.
 *
 * Coming back from the background is an `app_open` of its own, because to the
 * player it is opening the game. Going to it is when the queue is sent, because
 * it may be the last moment anything here runs.
 */
export function startAnalytics(): () => void {
  if (started) return () => {};
  started = true;
  if (!opened) {
    opened = true;
    track('app_open', {});
  }
  const timer = setInterval(() => void flushEvents(), FLUSH_MS);
  const stopListening = platform().onVisibility((visible) => {
    if (visible) {
      track('app_open', {});
      void flushEvents();
    } else {
      void flushEvents(true);
    }
  });
  return () => {
    started = false;
    clearInterval(timer);
    stopListening();
  };
}
