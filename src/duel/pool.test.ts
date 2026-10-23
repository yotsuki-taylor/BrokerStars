import { describe, expect, it } from 'vitest';
import { ONLINE_WINDOW_MS, Pool, SEEK_ALONE_MS, SEEK_MS, type Seeker } from './pool';

/**
 * The pool's every decision: who is paired with whom, how long a seeker waits,
 * and that nobody is ever answered twice. The sockets around it are the
 * Worker's (`worker/src/matchmaker.ts`); what is worth getting right is here.
 */

const NOW = 1_700_000_000_000;

const seeker = (id: string, league = 1, at = NOW): Seeker<string> => ({
  id,
  league,
  at,
  handle: `ws:${id}:${at}`,
});

describe('pairing', () => {
  it('pairs two who look in the same league, the first one hosting', () => {
    const pool = new Pool<string>();
    expect(pool.seek(seeker('a')).kind).toBe('wait');
    const got = pool.seek(seeker('b', 1, NOW + 900));
    expect(got.kind).toBe('pair');
    if (got.kind !== 'pair') return;
    expect(got.host.id).toBe('a');
    expect(got.guest.id).toBe('b');
    expect(pool.size).toBe(0);
  });

  it('never pairs across leagues', () => {
    const pool = new Pool<string>();
    pool.seek(seeker('a', 0));
    expect(pool.seek(seeker('b', 3)).kind).toBe('wait');
    expect(pool.size).toBe(2);
  });

  it('never pairs a player with themselves, and lets go of the older seek', () => {
    // a second tab, or a phone that dropped and came back
    const pool = new Pool<string>();
    const first = seeker('a');
    pool.seek(first);
    const again = pool.seek(seeker('a', 1, NOW + 500));
    expect(again.kind).toBe('wait');
    if (again.kind !== 'wait') return;
    expect(again.replaced?.handle).toBe(first.handle);
    expect(pool.size).toBe(1);
  });

  it('pairs whoever has waited longest first', () => {
    const pool = new Pool<string>();
    pool.seek(seeker('a', 1, NOW));
    pool.seek(seeker('b', 1, NOW + 1)); // paired with a
    pool.seek(seeker('c', 1, NOW + 2));
    const got = pool.seek(seeker('d', 1, NOW + 3));
    expect(got.kind === 'pair' && got.host.id).toBe('c');
  });
});

describe('how long a seeker waits', () => {
  it('waits only the flourish when nobody has been about', () => {
    const pool = new Pool<string>();
    const got = pool.seek(seeker('a'));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_ALONE_MS);
  });

  it('waits the full minute when somebody looked in this league lately', () => {
    // b is playing a bot now and will be back in the queue in a minute or two
    const pool = new Pool<string>();
    const b = seeker('b', 1, NOW);
    pool.seek(b);
    pool.expire(b.handle);
    const got = pool.seek(seeker('a', 1, NOW + 60_000));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_MS);
  });

  it('does not count somebody about in another league', () => {
    const pool = new Pool<string>();
    const b = seeker('b', 4, NOW);
    pool.seek(b);
    pool.expire(b.handle);
    const got = pool.seek(seeker('a', 1, NOW + 1000));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_ALONE_MS);
  });

  it('does not count the seeker as their own company', () => {
    const pool = new Pool<string>();
    const a = seeker('a', 1, NOW);
    pool.seek(a);
    pool.expire(a.handle);
    const got = pool.seek(seeker('a', 1, NOW + 90_000));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_ALONE_MS);
  });

  it('forgets a visitor once the window has passed', () => {
    const pool = new Pool<string>();
    const b = seeker('b', 1, NOW);
    pool.seek(b);
    pool.expire(b.handle);
    const got = pool.seek(seeker('a', 1, NOW + ONLINE_WINDOW_MS + 1));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_ALONE_MS);
  });
});

describe('waking up', () => {
  it('remembers who was about through an eviction', () => {
    // the visitor goes off to a bot match, nothing is left open, and the
    // object is evicted; the next seeker must still see them
    const before = new Pool<string>();
    const b = seeker('b', 1, NOW);
    before.seek(b);
    before.expire(b.handle);

    const after = new Pool<string>();
    after.restore(JSON.parse(JSON.stringify(before.snapshot())), NOW + 50_000);
    const got = after.seek(seeker('a', 1, NOW + 60_000));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_MS);
  });

  it('drops what went stale while it slept, and anything it cannot read', () => {
    const pool = new Pool<string>();
    pool.restore(
      [
        ['b', { league: 1, at: NOW }],
        ['c', { league: 1, at: Number.NaN }],
      ],
      NOW + ONLINE_WINDOW_MS + 1,
    );
    expect(pool.snapshot()).toEqual([]);
    pool.restore(undefined, NOW);
    expect(pool.snapshot()).toEqual([]);
  });
});

describe('answering exactly once', () => {
  it('expires a seeker still waiting, and only once', () => {
    const pool = new Pool<string>();
    const a = seeker('a');
    pool.seek(a);
    expect(pool.expire(a.handle)).toBe(true);
    expect(pool.expire(a.handle)).toBe(false);
  });

  it('does not expire a seeker who was paired in the meantime', () => {
    // the deadline and the pair landing in the same instant: the pair won,
    // and the deadline must not also tell them nobody came
    const pool = new Pool<string>();
    const a = seeker('a');
    pool.seek(a);
    pool.seek(seeker('b'));
    expect(pool.expire(a.handle)).toBe(false);
  });

  it('takes out a seeker who left, so nobody is paired with an empty chair', () => {
    const pool = new Pool<string>();
    const a = seeker('a');
    pool.seek(a);
    pool.leave(a.handle);
    expect(pool.seek(seeker('b')).kind).toBe('wait');
  });
});
