import { describe, expect, it } from 'vitest';
import { Pool, SEEK_MS, type Seeker } from './pool';

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
  it('waits the full minute, whoever else has or has not been about', () => {
    // the screen offers the bot after a few seconds, so the wait itself is
    // never cut short: a quiet league gets the same minute as a busy one
    const pool = new Pool<string>();
    const got = pool.seek(seeker('a'));
    expect(got.kind === 'wait' && got.ms).toBe(SEEK_MS);
    expect(SEEK_MS).toBe(60_000);
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
