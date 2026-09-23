import { describe, expect, it } from 'vitest';
import { fakeD1, type Fake } from './d1';
import { fill } from '../stats/fill.mjs';
import RETENTION from '../stats/retention.sql?raw';
import BY_HOST from '../stats/retention-by-host.sql?raw';
import FUNNEL from '../stats/funnel.sql?raw';
import SESSIONS from '../stats/sessions.sql?raw';

/**
 * The saved reports, held to answers counted by hand.
 *
 * A report is a statement nobody reads the output of carefully until the day a
 * number looks wrong, and by then the decisions made on it are made. So each
 * one runs here over a small set of events whose right answer is worked out in
 * the comments beside them, through the same `fill` the script uses, against
 * the real schema.
 */

const DAY = 86_400_000;
const TODAY = 100;
const ADMIN = '42';

let n = 0;
async function put(
  fake: Fake,
  player: string,
  name: string,
  at: number,
  props: Record<string, unknown> = {},
  host = 'web',
) {
  const day = Math.floor(at / DAY);
  await fake
    .prepare(
      `INSERT INTO events (eid, player_id, host, build, name, props, day, ts)
       VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, ?7)`,
    )
    .bind(`e-${n++}`, player, host, name, JSON.stringify(props), day, at)
    .run();
}

async function seen(fake: Fake, id: string, day: number) {
  await fake
    .prepare(`INSERT INTO profiles (id, first_seen, updated_at) VALUES (?1, ?2, ?2)`)
    .bind(id, day * DAY)
    .run();
}

async function report(fake: Fake, sql: string) {
  const out = await fake.prepare(fill(sql, { admin: ADMIN, today: TODAY })).all<Record<string, unknown>>();
  return out.results;
}

/**
 * The cast, all opening the game at noon on the days named:
 *
 *   A  android  90, 91, 97       came back on day 1 and on day 7
 *   B  web      90               never came back
 *   C  web      90, 92 (+ a match on 91, which is not an open)   neither
 *   D  telegram 95, 96           day 1 yes; day 7 has not happened yet
 *   E  web      99, no profile   too new for either
 *   V  veteran: profile from day 10, opens 90 and 91 — not new, not counted
 *   42 the developer — not counted anywhere
 */
async function cast(): Promise<Fake> {
  const fake = fakeD1();
  const open = async (p: string, days: number[], host = 'web') => {
    for (const d of days) await put(fake, p, 'app_open', d * DAY + DAY / 2, {}, host);
  };
  await open('A', [90, 91, 97], 'android');
  await seen(fake, 'A', 90);
  await open('B', [90]);
  await seen(fake, 'B', 90);
  await open('C', [90, 92]);
  await put(fake, 'C', 'match_start', 91 * DAY + DAY / 2, { league: 0 });
  await open('D', [95, 96], 'telegram');
  await seen(fake, 'D', 95);
  await open('E', [99]);
  await open('V', [90, 91]);
  await seen(fake, 'V', 10);
  await open(ADMIN, [90, 91]);
  await seen(fake, ADMIN, 90);
  return fake;
}

describe('retention', () => {
  it('counts D1 and D7 per cohort, and says nothing about days still to come', async () => {
    const rows = await report(await cast(), RETENTION);
    expect(rows).toEqual([
      // A, B, C: one of three came back on day 1 (A), and one on day 7 (A)
      { когорта: '1970-04-01', игроков: 3, D1: 1, 'D1 %': 33.3, D7: 1, 'D7 %': 33.3 },
      // D came back the next day; day 102 is not over, so there is no D7
      { когорта: '1970-04-06', игроков: 1, D1: 1, 'D1 %': 100, D7: null, 'D7 %': null },
      // E opened yesterday: neither day has finished
      { когорта: '1970-04-10', игроков: 1, D1: null, 'D1 %': null, D7: null, 'D7 %': null },
    ]);
  });

  it('splits the same cohorts by the host of the first open', async () => {
    const rows = await report(await cast(), BY_HOST);
    expect(rows.slice(0, 2)).toEqual([
      { когорта: '1970-04-01', хост: 'android', игроков: 1, D1: 1, 'D1 %': 100, D7: 1, 'D7 %': 100 },
      { когорта: '1970-04-01', хост: 'web', игроков: 2, D1: 0, 'D1 %': 0, D7: 0, 'D7 %': 0 },
    ]);
    expect(rows.map((r) => r['хост'])).toEqual(['android', 'web', 'telegram', 'web']);
  });

  it('never counts the developer, whatever else changes', async () => {
    const fake = fakeD1();
    await put(fake, ADMIN, 'app_open', 90 * DAY);
    await put(fake, ADMIN, 'app_open', 91 * DAY);
    expect(await report(fake, RETENTION)).toEqual([]);
    expect(await report(fake, SESSIONS)).toEqual([
      expect.objectContaining({ сессий: 0 }),
    ]);
  });
});

describe('the funnel', () => {
  it('counts who ever reached each step, out of the newcomers', async () => {
    const fake = await cast();
    const at = 90 * DAY + DAY / 2;
    // A does everything; B looks at two steps of the tour and leaves
    for (let step = 0; step < 6; step++) await put(fake, 'A', 'tour_step', at, { step });
    await put(fake, 'A', 'match_start', at, { league: 0 });
    await put(fake, 'A', 'match_end', at, { league: 0, outcome: 'win', surrender: false });
    await put(fake, 'A', 'match_start', at, { league: 0 });
    await put(fake, 'A', 'signin', at, { via: 'google' });
    await put(fake, 'A', 'duel_start', at);
    await put(fake, 'B', 'tour_step', at, { step: 0 });
    await put(fake, 'B', 'tour_step', at, { step: 1 });
    // the veteran's match is not a newcomer's
    await put(fake, 'V', 'match_start', at, { league: 0 });

    const rows = await report(fake, FUNNEL);
    // five newcomers: A, B, C, D, E. C started a match (on day 91) and never finished one.
    expect(rows.map((r) => [r['шаг'], r['дошло'], r['% от открывших'], r['% от шага выше']])).toEqual([
      ['открыли игру', 5, 100, null],
      ['тур: шаг 1', 2, 40, 40],
      ['тур: шаг 2', 2, 40, 100],
      ['тур: шаг 3', 1, 20, 50],
      ['тур: шаг 4', 1, 20, 100],
      ['тур: шаг 5', 1, 20, 100],
      ['тур: шаг 6', 1, 20, 100],
      ['начали первый матч', 2, 40, 200],
      ['доиграли первый матч', 1, 20, 50],
      ['начали второй матч', 1, 20, 100],
      ['вошли или связали', 1, 20, 100],
      ['сыграли дуэль', 1, 20, 100],
    ]);
  });
});

describe('sessions', () => {
  it('cuts at thirty minutes and reports the median length and matches', async () => {
    const fake = fakeD1();
    const MIN = 60_000;
    const t0 = 90 * DAY;
    // P, first sitting: 0, 10 and 20 minutes in, one match -> 20 minutes long
    await put(fake, 'P', 'app_open', t0);
    await put(fake, 'P', 'match_start', t0 + 10 * MIN, { league: 0 });
    await put(fake, 'P', 'app_open', t0 + 20 * MIN);
    // a 31-minute gap is a new sitting: 5 minutes long, one duel
    await put(fake, 'P', 'app_open', t0 + 51 * MIN);
    await put(fake, 'P', 'duel_start', t0 + 56 * MIN);
    // Q opens, and again exactly thirty minutes later — which is still the
    // same sitting: 30 minutes long, no match
    await put(fake, 'Q', 'app_open', t0);
    await put(fake, 'Q', 'app_open', t0 + 30 * MIN);
    // the developer plays all day and moves nothing
    await put(fake, ADMIN, 'app_open', t0);
    await put(fake, ADMIN, 'match_start', t0 + 300 * MIN, { league: 0 });

    // lengths 20, 5, 30 -> median 20, mean 18.3; matches 1, 1, 0 -> median 1
    expect(await report(fake, SESSIONS)).toEqual([
      {
        сессий: 3,
        'медиана, мин': 20,
        'среднее, мин': 18.3,
        'матчей, медиана': 1,
        'матчей, среднее': 0.67,
      },
    ]);
  });

  it('takes the middle two for an even count', async () => {
    const fake = fakeD1();
    const MIN = 60_000;
    // two players, one sitting each: 10 and 20 minutes -> median 15
    await put(fake, 'X', 'app_open', 0);
    await put(fake, 'X', 'app_open', 10 * MIN);
    await put(fake, 'Y', 'app_open', 0);
    await put(fake, 'Y', 'app_open', 20 * MIN);
    const [row] = await report(fake, SESSIONS);
    expect(row['медиана, мин']).toBe(15);
  });
});
