import { describe, expect, it } from 'vitest';
import { fakeD1, type Fake } from './d1';
import worker, { mintGuest, mintSession, type Env } from '../src/index';
import * as events from '../src/events';
import * as link from '../src/link';
import { BACKDATE_MS, MAX_BATCH, RETENTION_DAYS } from '../../src/analytics/protocol';
import { dayOf } from '../../src/daily/protocol';

/**
 * The analytics route, end to end, against real SQL.
 *
 * `src/analytics/protocol.test.ts` holds the catalogue to its shapes and needs
 * nothing. This is the half that only exists as statements and as a route: that
 * a batch lands under the id the rest of the database knows this player by,
 * that ninety days is ninety days, that linking two accounts carries the
 * joining one's history over, and that deleting an account takes this with it.
 */

const SECRET = 'test-session-secret';
const DAY = 24 * 60 * 60 * 1000;

const setup = () => {
  const fake = fakeD1();
  const env = { DB: fake, SESSION_SECRET: SECRET } as unknown as Env;
  return { env, fake };
};

/**
 * A POST as a browser sends one. `content-length` is set by hand because a
 * `Request` built in Node does not carry it, and a browser's always does — the
 * size check on `/events` reads it before it reads anything else.
 */
const post = (env: Env, path: string, body: unknown) => {
  const text = JSON.stringify(body);
  return worker.fetch(
    new Request(`https://api.test${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(new TextEncoder().encode(text).length),
      },
      body: text,
    }),
    env,
  );
};

type Row = { eid: string; player_id: string; host: string; build: string; name: string; props: string; day: number; ts: number };

const rows = async (fake: Fake): Promise<Row[]> =>
  (await fake.prepare(`SELECT * FROM events ORDER BY id`).all<Row>()).results;

/** A fresh id for every event, as the phone mints one; pass your own to send the same event twice. */
let minted = 0;
const withIds = (evs: unknown[]) =>
  evs.map((e) => ({ id: `evt-${String(minted++).padStart(8, '0')}`, ...(e as object) }));

const send = (env: Env, token: string, evs: unknown[], over: Record<string, unknown> = {}) =>
  post(env, '/events', {
    initData: token,
    host: 'android',
    build: '1.1.3+25',
    events: withIds(evs),
    ...over,
  });

describe('POST /events', () => {
  it('writes a batch under the signed id, host and build', async () => {
    const { env, fake } = setup();
    const { token, caller } = await mintGuest(SECRET);
    const now = Date.now();
    const res = await send(env, token, [
      { name: 'app_open', props: {}, ts: now },
      { name: 'match_start', props: { league: 0 }, ts: now },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, taken: 2 });

    const got = await rows(fake);
    expect(got.map((r) => r.name)).toEqual(['app_open', 'match_start']);
    for (const r of got) {
      expect(r.player_id).toBe(caller.id);
      expect(r.host).toBe('android');
      expect(r.build).toBe('1.1.3+25');
      expect(r.day).toBe(dayOf(r.ts));
    }
    expect(JSON.parse(got[1].props)).toEqual({ league: 0 });
  });

  it('refuses anybody who has not signed', async () => {
    const { env, fake } = setup();
    expect((await send(env, '', [{ name: 'app_open', props: {} }])).status).toBe(401);
    expect((await send(env, 'bs1.forged.sig', [{ name: 'app_open', props: {} }])).status).toBe(401);
    expect(await rows(fake)).toEqual([]);
  });

  it('drops what is not in the catalogue and keeps the rest', async () => {
    const { env, fake } = setup();
    const { token } = await mintGuest(SECRET);
    const res = await send(env, token, [
      { name: 'app_open', props: {} },
      { name: 'screen_view', props: {} },
      { name: 'stock_buy', props: { company: 'no-such-company' } },
      { name: 'match_start', props: { league: 0, extra: 1 } },
      { name: 'shop_buy', props: { item: 'room' } },
    ]);
    expect(await res.json()).toEqual({ ok: true, taken: 2 });
    expect((await rows(fake)).map((r) => r.name)).toEqual(['app_open', 'shop_buy']);
  });

  it('refuses a batch past the ceiling whole, and one from no known host', async () => {
    const { env, fake } = setup();
    const { token } = await mintGuest(SECRET);
    const many = Array.from({ length: MAX_BATCH + 1 }, () => ({ name: 'app_open', props: {} }));
    expect((await send(env, token, many)).status).toBe(400);
    expect((await send(env, token, [{ name: 'app_open' }], { host: 'ios' })).status).toBe(400);
    expect(await rows(fake)).toEqual([]);

    const full = many.slice(0, MAX_BATCH);
    expect(await (await send(env, token, full)).json()).toEqual({ ok: true, taken: MAX_BATCH });
  });

  it('counts an event sent twice once', async () => {
    // The answer to the first request was lost, so the phone sends the same
    // batch again — plus whatever happened since.
    const { env, fake } = setup();
    const { token } = await mintGuest(SECRET);
    const first = [
      { id: 'same-event-0001', name: 'app_open', props: {} },
      { id: 'same-event-0002', name: 'match_start', props: { league: 1 } },
    ];
    expect(await (await send(env, token, first)).json()).toEqual({ ok: true, taken: 2 });
    const again = [...first, { id: 'same-event-0003', name: 'match_end', props: { league: 1, outcome: 'win', surrender: false } }];
    expect(await (await send(env, token, again)).json()).toEqual({ ok: true, taken: 1 });
    expect((await rows(fake)).map((r) => r.name)).toEqual(['app_open', 'match_start', 'match_end']);
  });

  it('refuses a body too big to be a batch this game built', async () => {
    const { env } = setup();
    const { token } = await mintGuest(SECRET);
    const res = await send(env, token, [{ name: 'app_open', props: {} }], {
      padding: 'x'.repeat(40 * 1024),
    });
    expect(res.status).toBe(413);
  });

  it('holds the phone clock to the last 48 hours of the server one', async () => {
    const { env, fake } = setup();
    const { token } = await mintGuest(SECRET);
    const now = Date.now();
    await send(env, token, [
      { name: 'app_open', props: {}, ts: now + 365 * DAY },
      { name: 'app_open', props: {}, ts: now - 30 * DAY },
      { name: 'app_open', props: {}, ts: now - DAY },
    ]);
    const [future, ancient, yesterday] = await rows(fake);
    const after = Date.now();
    expect(future.ts).toBeGreaterThanOrEqual(now);
    expect(future.ts).toBeLessThanOrEqual(after);
    expect(ancient.ts).toBeGreaterThanOrEqual(now - BACKDATE_MS);
    expect(ancient.ts).toBeLessThanOrEqual(after - BACKDATE_MS);
    expect(yesterday.ts).toBe(now - DAY);
    expect(yesterday.day).toBe(dayOf(now - DAY));
  });
});

describe('ninety days', () => {
  it('sweeps what has aged out on the next write, and nothing younger', async () => {
    const { env, fake } = setup();
    const now = Date.now();
    const today = dayOf(now);
    const put = (day: number) =>
      fake.exec(
        `INSERT INTO events (eid, player_id, host, name, props, day, ts)
         VALUES ('old-${day}', 'old', 'web', 'app_open', '{}', ${day}, ${day * DAY})`,
      );
    put(today - RETENTION_DAYS - 5);
    put(today - RETENTION_DAYS - 1);
    put(today - RETENTION_DAYS);
    put(today - 10);

    await events.record(
      env,
      'new',
      {
        host: 'web',
        build: '',
        events: [{ id: 'new-event-1', name: 'app_open', props: '{}', ts: now, day: today }],
      },
      now,
    );

    const left = await rows(fake);
    expect(left.map((r) => r.day)).toEqual([today - RETENTION_DAYS, today - 10, today]);
  });
});

describe('two accounts, one person', () => {
  it('carries the joining account’s events over when a guest signs in with Google', async () => {
    const { env, fake } = setup();
    const guest = await mintGuest(SECRET);
    const google = { id: 'g:123', name: 'ANNA' };
    const googleToken = await mintSession(google, SECRET);

    await send(env, guest.token, [{ name: 'app_open', props: {} }]);
    // the Google account opened the game on another phone before anything was linked
    await send(env, googleToken, [{ name: 'app_open', props: {} }]);

    expect(await link.adopt(env, google, guest.caller.id)).toBeNull();

    // everything before the link is the guest's now, and so is everything after
    await send(env, googleToken, [{ name: 'signin', props: { via: 'google' } }]);
    const got = await rows(fake);
    expect(got).toHaveLength(3);
    expect(new Set(got.map((r) => r.player_id))).toEqual(new Set([guest.caller.id]));
  });

  it('does not count events as a game that would make the link refuse', async () => {
    const { env } = setup();
    const google = { id: 'g:456', name: 'BOB' };
    await send(env, await mintSession(google, SECRET), [{ name: 'app_open', props: {} }]);
    expect(await link.adopt(env, google, '777')).toBeNull();
  });
});

describe('deleting an account', () => {
  it('deletes its events and nobody else’s', async () => {
    const { env, fake } = setup();
    const me = await mintGuest(SECRET);
    const other = await mintGuest(SECRET);
    await send(env, me.token, [{ name: 'app_open', props: {} }, { name: 'daily_claim', props: {} }]);
    await send(env, other.token, [{ name: 'app_open', props: {} }]);

    const res = await post(env, '/profile/delete', { initData: me.token, confirm: 'delete' });
    expect(res.status).toBe(200);

    const left = await rows(fake);
    expect(left.map((r) => r.player_id)).toEqual([other.caller.id]);
  });
});
