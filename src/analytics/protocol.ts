/**
 * What the game tells its own server about how it is being played, agreed on by
 * both ends.
 *
 * THIS FILE IS THE WHOLE LIST. The Worker imports it and throws away anything
 * that is not in it: an event with a name not below, or with props of any shape
 * but the one written next to that name, never reaches the database. So what the
 * privacy policy says is collected and what the code can collect are the same
 * sentence — adding an event means adding it here, and adding it here is where
 * somebody has to look at the policy.
 *
 * WHAT IS NOT HERE, ON PURPOSE. Nothing that names a device (no advertising id,
 * no fingerprint, no model), nothing that names a place (the Worker does not
 * write the address a request came from), and nothing from inside a match: the
 * simulation does not know this file exists, and a stream of every BUY tap would
 * be a recording of somebody playing rather than a count of who came back.
 *
 * Each props value is an enum or a small integer and never text a player typed.
 * That is what keeps the check below a check: a free string field would be a
 * place anything could be smuggled into, whitelist or not.
 */

import { COMPANIES } from '../sim/companies';
import { dayOf } from '../daily/protocol';
import { RARITIES, SLOTS, itemId } from '../ui/wardrobe';

/** Where the game was opened, as `src/platform` would say it if it were honest about browser tabs. */
export const HOSTS = ['telegram', 'android', 'web'] as const;
export type Host = (typeof HOSTS)[number];

/**
 * How many steps the tour has. Spelled out rather than read off
 * `src/ui/tutorial.ts`, which reaches for `localStorage` and has no business in
 * a Worker; `src/ui/tutorial.test.ts` holds the two numbers together.
 */
export const TOUR_STEPS = 6;

/** Every way a player can call somebody out to a duel. */
export const INVITE_VIA = ['link', 'chat', 'corp', 'friend'] as const;

/**
 * How a sign-in happened: Google's button, or a link code typed from the other
 * device. A guest who signs in with Google and is adopted is `google` — the
 * player pressed one button.
 */
export const SIGNIN_VIA = ['google', 'code'] as const;

/** What a surrendered, lost or won match looks like on the wire, as `/result` spells it. */
export const OUTCOMES = ['win', 'draw', 'loss'] as const;

/**
 * The shop sells garments and the next step of the office. The garment ids are
 * the wardrobe's own; `room` is the renovation, which has one step on sale at a
 * time and so needs no number.
 */
export const SHOP_ITEMS: readonly string[] = [
  ...SLOTS.flatMap((slot) => RARITIES.map((rarity) => itemId(slot, rarity))),
  'room',
];

const COMPANY_IDS: readonly string[] = COMPANIES.map((c) => c.id);

/* --------------------------------------------------------------- the catalogue */

/**
 * One reader per field: takes whatever came off the wire, answers the value or
 * `undefined` for "not this". A props object passes only if it has exactly the
 * fields listed and every one of them reads.
 */
type Field = (raw: unknown, leagues: number) => unknown;

const oneOf =
  (values: readonly string[]): Field =>
  (raw) =>
    typeof raw === 'string' && values.includes(raw) ? raw : undefined;

const intBelow =
  (max: (leagues: number) => number): Field =>
  (raw, leagues) =>
    Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < max(leagues)
      ? raw
      : undefined;

const flag: Field = (raw) => (typeof raw === 'boolean' ? raw : undefined);

const league = intBelow((n) => n);

/**
 * Name, and the exact shape of what travels with it. Eleven of them, and every one
 * is either a step of the way into the game or the thing the game is for.
 */
export const EVENTS = {
  /** the game was opened, or came back from the background */
  app_open: {},
  /** a step of the tour was shown; 0 is the first */
  tour_step: { step: intBelow(() => TOUR_STEPS) },
  /** a match against a bot began */
  match_start: { league },
  /** a match against a bot ended; `surrender` is the player walking away from it */
  match_end: { league, outcome: oneOf(OUTCOMES), surrender: flag },
  /** somebody was called out to a duel, and by which road */
  duel_invite: { via: oneOf(INVITE_VIA) },
  /** a duel actually started, with two people in it */
  duel_start: {},
  /** a duel ended, as this player's side of it saw it */
  duel_end: { outcome: oneOf(OUTCOMES), surrender: flag },
  /** a sign-in that ended in a session, or a link that was made */
  signin: { via: oneOf(SIGNIN_VIA) },
  /** the day's bonus was taken */
  daily_claim: {},
  /** shares were bought at the counter */
  stock_buy: { company: oneOf(COMPANY_IDS) },
  /** something was bought in the shop */
  shop_buy: { item: oneOf(SHOP_ITEMS) },
} satisfies Record<string, Record<string, Field>>;

export type EventName = keyof typeof EVENTS;
export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

/**
 * The props each event carries, as the client writes them. Kept by hand beside
 * the readers above because a type derived from them would say `unknown`
 * everywhere; `protocol.test.ts` sends one of each through the check, so the
 * two cannot drift apart without a red test.
 */
export interface EventProps {
  app_open: Record<string, never>;
  tour_step: { step: number };
  match_start: { league: number };
  match_end: { league: number; outcome: (typeof OUTCOMES)[number]; surrender: boolean };
  duel_invite: { via: (typeof INVITE_VIA)[number] };
  duel_start: Record<string, never>;
  duel_end: { outcome: (typeof OUTCOMES)[number]; surrender: boolean };
  signin: { via: (typeof SIGNIN_VIA)[number] };
  daily_claim: Record<string, never>;
  stock_buy: { company: string };
  shop_buy: { item: string };
}

/* ------------------------------------------------------------------ the wire */

/**
 * The most events one request may carry. The client flushes every twenty
 * seconds and on going to the background, so a real batch is a handful; fifty
 * leaves room for an offline evening being sent in pieces. A bigger one is not
 * something this game builds, and is refused whole.
 */
export const MAX_BATCH = 50;

/**
 * The longest a props object may be, as JSON. The largest real one is
 * `match_end` at about fifty characters; this is a ceiling on what a forged one
 * can cost, not a budget anybody is expected to approach.
 */
export const MAX_PROPS = 200;

/** Long enough for `1.1.3+25`, and cut rather than refused past it. */
export const MAX_BUILD = 24;

/**
 * How far back an event may say it happened. Events wait on the phone while it
 * is offline, so the client's own time is the one that matters — but only
 * within this window of the server's. A phone whose clock is a week out, or a
 * year, would otherwise put its owner in a cohort that does not exist.
 */
export const BACKDATE_MS = 48 * 60 * 60 * 1000;

/** How long a raw event is kept. The privacy policy says the same number. */
export const RETENTION_DAYS = 90;

/**
 * What an event's own name looks like: the phone mints one when the event
 * happens (`crypto.randomUUID`, or the hex fallback `mintToken` uses) and the
 * server keeps the first arrival of each. That is what makes a batch safe to
 * send twice — a request whose answer was lost is sent again, and the copy is
 * dropped rather than counted as a second match in the same session.
 */
const EVENT_ID = /^[0-9a-z-]{8,64}$/;

/** One event as it was recorded on the phone. */
export interface Event {
  /** minted once on the phone; see EVENT_ID */
  id: string;
  name: EventName;
  props: Record<string, unknown>;
  /** epoch ms, by the phone's clock */
  ts: number;
}

/** What `POST /events` carries besides the signature. */
export interface Batch {
  host: Host;
  build: string;
  events: Event[];
}

/** An event as the server will write it. */
export interface Clean {
  id: string;
  name: EventName;
  /** JSON, already measured against MAX_PROPS */
  props: string;
  ts: number;
  day: number;
}

/**
 * The phone's time, trusted only as far as the window allows. Anything that is
 * not a number at all is "now": an event with no time is still an event.
 */
export function clampTs(raw: unknown, now: number): number {
  const ts = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : now;
  return Math.min(now, Math.max(now - BACKDATE_MS, ts));
}

/** Props as they can be trusted, or null. Exactly the listed fields, no more, no fewer. */
export function cleanProps(
  name: EventName,
  raw: unknown,
  leagues: number,
): Record<string, unknown> | null {
  const shape: Record<string, Field> = EVENTS[name];
  const given = raw == null ? {} : raw;
  if (typeof given !== 'object' || Array.isArray(given)) return null;
  const src = given as Record<string, unknown>;

  const keys = Object.keys(src);
  const wanted = Object.keys(shape);
  if (keys.length !== wanted.length || keys.some((k) => !(k in shape))) return null;

  const out: Record<string, unknown> = {};
  for (const key of wanted) {
    const value = shape[key](src[key], leagues);
    if (value === undefined) return null;
    out[key] = value;
  }
  return out;
}

/** Length as JSON; anything that will not serialise counts as too big. */
function sizeOf(raw: unknown): number {
  try {
    return JSON.stringify(raw ?? {}).length;
  } catch {
    return Infinity;
  }
}

const isName = (raw: unknown): raw is EventName =>
  typeof raw === 'string' && Object.prototype.hasOwnProperty.call(EVENTS, raw);

/** One event as the server will write it, or null for anything off the list. */
export function cleanEvent(raw: unknown, leagues: number, now: number): Clean | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  if (!isName(src.name)) return null;
  if (typeof src.id !== 'string' || !EVENT_ID.test(src.id)) return null;
  // Measured as it arrived, before any of it is walked: a props object the
  // size of a novel is refused for its size, not after its every key is read.
  if (sizeOf(src.props) > MAX_PROPS) return null;
  const props = cleanProps(src.name, src.props, leagues);
  if (!props) return null;
  const ts = clampTs(src.ts, now);
  return { id: src.id, name: src.name, props: JSON.stringify(props), ts, day: dayOf(ts) };
}

/**
 * A whole request, or null when it is not one this game would send: not a list,
 * longer than `MAX_BATCH`, or from a host that does not exist. Inside a good
 * batch a bad event is dropped on its own and the rest are kept — one stale
 * build sending a name that has since been retired should not cost the app_open
 * next to it.
 */
export function cleanBatch(
  raw: unknown,
  leagues: number,
  now: number,
): { host: Host; build: string; events: Clean[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const host = HOSTS.find((h) => h === src.host);
  if (!host) return null;
  if (!Array.isArray(src.events) || src.events.length > MAX_BATCH) return null;
  const build = typeof src.build === 'string' ? src.build.trim().slice(0, MAX_BUILD) : '';
  const events: Clean[] = [];
  for (const e of src.events) {
    const clean = cleanEvent(e, leagues, now);
    if (clean) events.push(clean);
  }
  return { host, build, events };
}
