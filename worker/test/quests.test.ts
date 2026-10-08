import { describe, expect, it } from 'vitest';
import { fakeD1 } from './d1';
import * as profiles from '../src/profile';
import type { Env } from '../src/results';

/**
 * A collected quest's coins on the board: `write` puts `Bought.coins` on
 * `players.stars` in the same transaction as the profile, on the same
 * condition, so the board and the `taken` list can never disagree.
 */

const db = () => {
  const fake = fakeD1();
  return { env: { DB: fake } as unknown as Env, fake };
};

const me = { id: 'p1', name: 'MASHA' };

const stars = async (env: Env) =>
  (
    await env.DB.prepare(`SELECT stars, matches, updated_at FROM players WHERE id = ?1`)
      .bind(me.id)
      .first<{ stars: number; matches: number; updated_at: number }>()
  ) ?? null;

const seat = (fake: ReturnType<typeof fakeD1>, coins: number) =>
  fake.exec(
    `INSERT INTO players (id, name, stars, matches, first_seen, updated_at)
     VALUES ('${me.id}', '${me.name}', ${coins}, 3, 1, 1000)`,
  );

/** A change that pays `coins` onto the board, as `claimQuest` does. */
const paying =
  (coins: number): profiles.Change =>
  (held) => ({ ok: true, held, coins });

describe('coins a change puts on the board', () => {
  it('adds them to the board total and to what the change reports as earned', async () => {
    const { env, fake } = db();
    seat(fake, 100);
    await profiles.open(env, me, null);

    const out = await profiles.change(env, me, paying(7));
    expect(out.error).toBeUndefined();
    expect(out.earned).toBe(107);
    expect(out.coins).toBe(7);

    const row = await stars(env);
    expect(row?.stars).toBe(107);
    // the cooldown between matches is read off updated_at, and a quest is not a match
    expect(row?.updated_at).toBe(1000);
    expect(row?.matches).toBe(3);
  });

  it('writes neither half when the profile moved underneath', async () => {
    const { env, fake } = db();
    seat(fake, 100);
    await profiles.open(env, me, null);
    const stored = (await profiles.read(env, me.id))!;

    // somebody else wrote the row after it was read
    await profiles.change(env, me, (held) => ({ ok: true, held }));

    const landed = await profiles.write(env, me.id, stored.held, stored.version, {
      coins: 7,
      name: me.name,
    });
    expect(landed).toBe(false);
    expect((await stars(env))?.stars).toBe(100);
  });

  it('opens a board row that stays off the board until a match is played', async () => {
    const { env } = db();
    await profiles.open(env, me, null);

    await profiles.change(env, me, paying(5));
    const row = await stars(env);
    expect(row?.stars).toBe(5);
    expect(row?.matches).toBe(0);
  });

  it('touches the board not at all when there is nothing to put on it', async () => {
    const { env, fake } = db();
    seat(fake, 100);
    await profiles.change(env, me, paying(0));
    expect((await stars(env))?.stars).toBe(100);
  });
});
