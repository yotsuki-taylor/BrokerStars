import { describe, expect, it } from 'vitest';
import {
  BACKDATE_MS,
  EVENTS,
  EVENT_NAMES,
  MAX_BATCH,
  MAX_BUILD,
  MAX_PROPS,
  SHOP_ITEMS,
  TOUR_STEPS,
  cleanBatch,
  cleanEvent,
  clampTs,
  type EventName,
  type EventProps,
} from './protocol';
import { COMPANIES } from '../sim/companies';
import { dayOf } from '../daily/protocol';
import { TUTORIAL } from '../ui/tutorial';

/**
 * The catalogue is a whitelist, and this is what holds it to that. Every case
 * below is a way something not in the privacy policy could have reached the
 * database: a name nobody listed, a field nobody listed, a value outside the
 * enum, a string where a number goes.
 */

const LEAGUES = 5;
const NOW = Date.UTC(2026, 8, 23, 12);

/** One good example of every event, typed against `EventProps` so the two cannot drift. */
const GOOD: { [K in EventName]: EventProps[K] } = {
  app_open: {},
  tour_step: { step: 0 },
  match_start: { league: 4 },
  match_end: { league: 2, outcome: 'loss', surrender: true },
  duel_invite: { via: 'chat' },
  duel_start: {},
  duel_end: { outcome: 'win', surrender: false },
  signin: { via: 'code' },
  daily_claim: {},
  stock_buy: { company: COMPANIES[0].id },
  shop_buy: { item: 'hat-legend' },
};

const ID = '6f1c2b8e-4a1d-4f5e-9c3b-2d7e8f9a0b1c';
const clean = (name: string, props: unknown) =>
  cleanEvent({ id: ID, name, props, ts: NOW }, LEAGUES, NOW);

describe('the catalogue', () => {
  it('has eleven events, and a good example of each passes', () => {
    expect(EVENT_NAMES).toHaveLength(11);
    for (const name of EVENT_NAMES) {
      expect(clean(name, GOOD[name]), name).toEqual({
        id: ID,
        name,
        props: JSON.stringify(GOOD[name]),
        ts: NOW,
        day: dayOf(NOW),
      });
    }
  });

  it('agrees with the tour about how many steps there are', () => {
    expect(TOUR_STEPS).toBe(TUTORIAL.length);
  });

  it('sells garments by their wardrobe ids and the room by name', () => {
    expect(SHOP_ITEMS).toContain('torso-common');
    expect(SHOP_ITEMS).toContain('room');
    expect(clean('shop_buy', { item: 'crown-of-thorns' })).toBeNull();
  });
});

describe('what is thrown away', () => {
  it('a name that is not on the list', () => {
    expect(clean('screen_view', {})).toBeNull();
    expect(clean('toString', {})).toBeNull();
    expect(clean('__proto__', {})).toBeNull();
    expect(cleanEvent({ id: ID, props: {} }, LEAGUES, NOW)).toBeNull();
    expect(cleanEvent(null, LEAGUES, NOW)).toBeNull();
  });

  it('a field nobody listed, even beside the right ones', () => {
    expect(clean('app_open', { device: 'Pixel 8' })).toBeNull();
    expect(clean('match_start', { league: 1, seed: 'abc' })).toBeNull();
  });

  it('a listed field that is missing', () => {
    expect(clean('match_end', { league: 1, outcome: 'win' })).toBeNull();
    expect(clean('tour_step', {})).toBeNull();
  });

  it('a value outside its enum or its range', () => {
    expect(clean('duel_invite', { via: 'carrier pigeon' })).toBeNull();
    expect(clean('match_start', { league: LEAGUES })).toBeNull();
    expect(clean('match_start', { league: -1 })).toBeNull();
    expect(clean('match_start', { league: 1.5 })).toBeNull();
    expect(clean('tour_step', { step: TOUR_STEPS })).toBeNull();
    expect(clean('match_end', { league: 0, outcome: 'win', surrender: 'no' })).toBeNull();
  });

  it('a value of the right meaning and the wrong type', () => {
    expect(clean('match_start', { league: '1' })).toBeNull();
    expect(clean('stock_buy', { company: [COMPANIES[0].id] })).toBeNull();
  });

  it('props that are not an object at all', () => {
    expect(clean('app_open', [])).toBeNull();
    expect(clean('app_open', 'hello')).toBeNull();
  });

  it('an event with no id of its own, or one that is not an id', () => {
    const e = (id: unknown) => cleanEvent({ id, name: 'app_open' }, LEAGUES, NOW);
    expect(e(undefined)).toBeNull();
    expect(e('')).toBeNull();
    expect(e('short')).toBeNull();
    expect(e('x'.repeat(65))).toBeNull();
    expect(e('<script>alert(1)</script>')).toBeNull();
    expect(e(12345678)).toBeNull();
    // both shapes the client mints: a UUID, and the hex fallback
    expect(e(ID)).not.toBeNull();
    expect(e('0123456789abcdef0123456789abcdef')).not.toBeNull();
  });

  it('keeps an event with no props where none are due', () => {
    expect(clean('app_open', undefined)?.props).toBe('{}');
  });
});

describe('time', () => {
  it('keeps the phone clock inside the window', () => {
    expect(clampTs(NOW - 1000, NOW)).toBe(NOW - 1000);
    expect(clampTs(NOW - BACKDATE_MS, NOW)).toBe(NOW - BACKDATE_MS);
  });

  it('pulls a clock from the future back to now', () => {
    expect(clampTs(NOW + 1, NOW)).toBe(NOW);
    expect(clampTs(NOW + 400 * 86_400_000, NOW)).toBe(NOW);
  });

  it('pulls a clock from long ago up to the edge of the window', () => {
    expect(clampTs(NOW - BACKDATE_MS - 1, NOW)).toBe(NOW - BACKDATE_MS);
    expect(clampTs(0, NOW)).toBe(NOW - BACKDATE_MS);
  });

  it('reads a time that is not a number as now', () => {
    expect(clampTs(undefined, NOW)).toBe(NOW);
    expect(clampTs('yesterday', NOW)).toBe(NOW);
    expect(clampTs(NaN, NOW)).toBe(NOW);
  });

  it('counts the day off the clamped time, not the claimed one', () => {
    const e = cleanEvent({ id: ID, name: 'app_open', ts: NOW + 10 * 86_400_000 }, LEAGUES, NOW);
    expect(e?.day).toBe(dayOf(NOW));
  });
});

describe('a batch', () => {
  let n = 0;
  const withIds = (events: unknown[]) =>
    events.map((e) => ({ id: `event-${String(n++).padStart(4, '0')}`, ...(e as object) }));
  const batch = (events: unknown[], over: Record<string, unknown> = {}) =>
    cleanBatch({ host: 'telegram', build: '1.1.3+25', events: withIds(events), ...over }, LEAGUES, NOW);

  it('keeps the good events and drops the bad ones', () => {
    const out = batch([{ name: 'app_open' }, { name: 'nope' }, { name: 'daily_claim', props: {} }]);
    expect(out?.events.map((e) => e.name)).toEqual(['app_open', 'daily_claim']);
    expect(out?.host).toBe('telegram');
  });

  it('refuses one past the ceiling whole', () => {
    const many = Array.from({ length: MAX_BATCH + 1 }, () => ({ name: 'app_open' }));
    expect(batch(many)).toBeNull();
    expect(batch(many.slice(1))?.events).toHaveLength(MAX_BATCH);
  });

  it('refuses a host that does not exist, or events that are not a list', () => {
    expect(batch([], { host: 'ios' })).toBeNull();
    expect(batch([], { host: undefined })).toBeNull();
    expect(cleanBatch({ host: 'web', events: {} }, LEAGUES, NOW)).toBeNull();
  });

  it('cuts a long build rather than refusing it', () => {
    expect(batch([], { build: 'x'.repeat(100) })?.build).toHaveLength(MAX_BUILD);
    expect(batch([], { build: 42 })?.build).toBe('');
  });

});

describe('the size of props', () => {
  it('refuses props too long to be any of the shapes, before reading them', () => {
    const huge = { item: 'room', pad: 'x'.repeat(MAX_PROPS) };
    expect(clean('shop_buy', huge)).toBeNull();
    // the same bloat in a field that WOULD pass the shape check still fails
    expect(clean('shop_buy', { item: 'x'.repeat(MAX_PROPS) })).toBeNull();
  });

  it('has room for the longest thing the catalogue can legitimately say', () => {
    // Guards the ceiling against the catalogue growing past it: the longest
    // company id and the longest item in the longest shapes must still fit.
    const longest = (xs: readonly string[]) => xs.reduce((a, b) => (b.length > a.length ? b : a));
    const worst = [
      { league: LEAGUES - 1, outcome: 'draw', surrender: false },
      { company: longest(COMPANIES.map((c) => c.id)) },
      { item: longest(SHOP_ITEMS) },
    ];
    for (const p of worst) expect(JSON.stringify(p).length).toBeLessThan(MAX_PROPS);
    expect(Object.keys(EVENTS)).toEqual(EVENT_NAMES);
  });
});
