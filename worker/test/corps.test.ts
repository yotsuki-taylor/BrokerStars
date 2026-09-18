import { describe, expect, it } from 'vitest';
import { fakeD1 } from './d1';
import * as corps from '../src/corps';
import { COLORS, DEFAULT_COLOR, DEFAULT_EMBLEM } from '../../src/corp/emblems';
import {
  MAX_MEMBERS,
  MIN_RANKED,
  RENAME_EVERY_MS,
  SWITCH_COOLDOWN_MS,
  seasonOf,
} from '../../src/corp/protocol';
import type { Env } from '../src/results';
import type { Caller } from '../src/telegram';

/**
 * The rules a corporation is kept under, against real SQL.
 *
 * What is being tested here is not arithmetic — that is in
 * `src/corp/protocol.test.ts` and needs nothing. It is the half of the feature
 * that only exists as statements: the seat that two people cannot both take,
 * the membership row that cannot be written twice, the season that rolls itself
 * over, the ownership that is never vacant, and the compare-and-set that makes
 * the first tap on a duel card the one that counts.
 *
 * Every test builds its own empty database off `schema.sql`, so a change to the
 * schema that the queries have not caught up with fails here rather than in
 * production.
 */

const db = () => {
  const fake = fakeD1();
  return { env: { DB: fake } as unknown as Env, fake };
};

const who = (id: string, name = id.toUpperCase()): Caller => ({ id, name });

const found = async (
  env: Env,
  caller: Caller,
  over: { name?: string; tag?: string; policy?: string } = {},
  now = Date.now(),
) =>
  corps.create(
    env,
    caller,
    { name: over.name ?? 'BULL RUN', tag: over.tag ?? 'BR', motto: '', policy: over.policy },
    now,
  );

/** The corporation `caller` is in, which every test wants in one line. */
const seen = (env: Env, caller: Caller, now = Date.now()) => corps.mine(env, caller, now);

describe('founding one', () => {
  it('makes the founder the owner and the only member', async () => {
    const { env } = db();
    expect(await found(env, who('a'))).toEqual({});

    const corp = await seen(env, who('a'));
    expect(corp?.name).toBe('BULL RUN');
    expect(corp?.ownerId).toBe('a');
    expect(corp?.members.map((m) => m.id)).toEqual(['a']);
    expect(corp?.members[0].owner).toBe(true);
  });

  it('costs nothing, so a player with no coins can found one', async () => {
    // Nothing in `create` reads a balance, and this is the test that says the
    // decision was deliberate rather than unimplemented.
    const { env } = db();
    expect(await found(env, who('broke'))).toEqual({});
  });

  it('refuses a name somebody already has, spaces and case notwithstanding', async () => {
    const { env } = db();
    await found(env, who('a'), { name: 'BULL RUN' });
    expect(await found(env, who('b'), { name: 'bullrun', tag: 'XX' })).toEqual({ error: 'taken' });
    expect(await found(env, who('c'), { name: 'B U L LRUN', tag: 'YY' })).toEqual({
      error: 'taken',
    });
  });

  it('frees the name again once the last member has gone', async () => {
    const { env } = db();
    await found(env, who('a'));
    await corps.leave(env, who('a'));
    expect(await seen(env, who('a'))).toBeNull();
    // and somebody else may now have it
    expect(await found(env, who('b'), { tag: 'XX' })).toEqual({});
  });

  it('refuses a name this game will not show a stranger', async () => {
    const { env } = db();
    // Cyrillic is a name now rather than a refusal; the emoji is what is left.
    expect(await found(env, who('a'), { name: 'BULL 🐂 RUN' })).toEqual({ error: 'badname' });
    expect(await found(env, who('a'), { name: 'AB' })).toEqual({ error: 'badname' });
    expect(await found(env, who('a'), { name: 'FUCK INC' })).toEqual({ error: 'badname' });
  });
});

describe('the mark and the colour', () => {
  it('stores what was chosen', async () => {
    const { env } = db();
    await corps.create(
      env,
      who('a'),
      { name: 'BULL RUN', tag: 'BR', motto: '', policy: 'open', emblem: 'bull', color: COLORS[4] },
      Date.now(),
    );
    const corp = (await seen(env, who('a')))!;
    expect(corp.emblem).toBe('bull');
    expect(corp.color).toBe(COLORS[4]);
  });

  it('refuses anything that is not in the catalogue, without refusing the founding', async () => {
    // The check is here as well as on the client, and it is the one that
    // counts: this route is reachable with a hand-written body. A mark nobody
    // recognises is not worth failing a founding over, though — there is
    // nothing for the player to correct — so it becomes the default.
    const { env } = db();
    const made = await corps.create(
      env,
      who('a'),
      {
        name: 'BULL RUN',
        tag: 'BR',
        motto: '',
        policy: 'open',
        emblem: '../../etc/passwd',
        color: '#000000; background: url(x)',
      },
      Date.now(),
    );
    expect(made).toEqual({});

    const corp = (await seen(env, who('a')))!;
    expect(corp.emblem).toBe(DEFAULT_EMBLEM);
    expect(corp.color).toBe(DEFAULT_COLOR);
  });

  it('lets the owner change both, as often as they like', async () => {
    // Unlike the name: fourteen drawings and ten colours cannot be made to say
    // anything, so there is nothing for a cooldown to defend against.
    const t = Date.now();
    const { env } = db();
    await found(env, who('a'), {}, t);
    expect(await corps.edit(env, who('a'), { emblem: 'crown', color: COLORS[2] }, t)).toEqual({});
    expect(await corps.edit(env, who('a'), { emblem: 'moon', color: COLORS[7] }, t + 1)).toEqual(
      {},
    );

    const corp = (await seen(env, who('a'), t))!;
    expect(corp.emblem).toBe('moon');
    expect(corp.color).toBe(COLORS[7]);
    // ...and changing them is not a rename, so the week is not spent
    expect(await corps.edit(env, who('a'), { name: 'BEAR PIT' }, t + 2)).toEqual({});
  });

  it('leaves them alone when a change is about something else', async () => {
    const t = Date.now();
    const { env } = db();
    await corps.create(
      env,
      who('a'),
      { name: 'BULL RUN', tag: 'BR', motto: '', policy: 'open', emblem: 'crown', color: COLORS[5] },
      t,
    );
    await corps.edit(env, who('a'), { policy: 'closed' }, t);
    const corp = (await seen(env, who('a'), t))!;
    expect(corp.emblem).toBe('crown');
    expect(corp.color).toBe(COLORS[5]);
  });

  it('carries them into the list and the table', async () => {
    const MAY = Date.UTC(2026, 4, 15);
    const { env } = db();
    await corps.create(
      env,
      who('a'),
      { name: 'BULL RUN', tag: 'BR', motto: '', policy: 'open', emblem: 'bolt', color: COLORS[6] },
      MAY,
    );
    const corp = (await seen(env, who('a'), MAY))!;
    await corps.join(env, who('b'), { id: corp.id }, MAY);
    await corps.join(env, who('c'), { id: corp.id }, MAY);

    const [listed] = await corps.browse(env, '', 25, MAY);
    expect([listed.emblem, listed.color]).toEqual(['bolt', COLORS[6]]);

    const { top } = await corps.table(env, 'coins', 10, null, MAY);
    expect([top[0].emblem, top[0].color]).toEqual(['bolt', COLORS[6]]);
  });
});

describe('one player, one corporation', () => {
  it('refuses a second founding', async () => {
    const { env } = db();
    await found(env, who('a'), { name: 'ALPHA', tag: 'AL' });
    expect(await found(env, who('a'), { name: 'BETA', tag: 'BE' })).toEqual({ error: 'already' });
  });

  it('refuses joining while already in one', async () => {
    const { env } = db();
    await found(env, who('a'), { name: 'ALPHA', tag: 'AL' });
    await found(env, who('b'), { name: 'BETA', tag: 'BE' });
    const beta = (await seen(env, who('b')))!;
    expect(await corps.join(env, who('a'), { id: beta.id })).toEqual({ error: 'already' });
    expect((await seen(env, who('a')))?.name).toBe('ALPHA');
  });

  it('cannot be got round by two requests arriving together', async () => {
    // The membership row is keyed on the player, so the second INSERT does
    // nothing and the seat it took is given back.
    const { env } = db();
    await found(env, who('a'), { name: 'ALPHA', tag: 'AL' });
    const alpha = (await seen(env, who('a')))!;

    const [first, second] = await Promise.all([
      corps.join(env, who('b'), { id: alpha.id }),
      corps.join(env, who('b'), { id: alpha.id }),
    ]);
    expect([first.error, second.error].filter(Boolean)).toEqual(['already']);
    expect((await seen(env, who('a')))?.members.length).toBe(2);
  });
});

describe('the last seat', () => {
  const fill = async (env: Env, corpId: string, from: number, to: number) => {
    for (let i = from; i < to; i++) {
      // sequentially, which is how thirty people actually join
      expect(await corps.join(env, who(`p${i}`), { id: corpId })).toEqual({});
    }
  };

  it('is the thirtieth and there is no thirty-first', async () => {
    const { env } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await fill(env, corp.id, 1, MAX_MEMBERS);

    expect((await seen(env, who('a')))?.members.length).toBe(MAX_MEMBERS);
    expect(await corps.join(env, who('late'), { id: corp.id })).toEqual({ error: 'full' });
  });

  it('is taken by exactly one of two people reaching for it at once', async () => {
    // The case that actually happens, and the whole reason `members` is a
    // counted column rather than a COUNT(*) read and then acted on.
    const { env } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await fill(env, corp.id, 1, MAX_MEMBERS - 1);

    const [x, y] = await Promise.all([
      corps.join(env, who('x'), { id: corp.id }),
      corps.join(env, who('y'), { id: corp.id }),
    ]);
    expect([x.error, y.error].filter(Boolean)).toEqual(['full']);
    expect((await seen(env, who('a')))?.members.length).toBe(MAX_MEMBERS);
  });

  it('is given back when the seat was taken but the membership was not', async () => {
    // The compensation in `seat`: if the INSERT does nothing, the count has to
    // come back down or the corporation slowly locks itself shut.
    const { env } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id });
    // b is already in, so this takes a seat and then cannot use it
    expect(await corps.join(env, who('b'), { id: corp.id })).toEqual({ error: 'already' });

    const row = await env.DB.prepare(`SELECT members FROM corps WHERE id = ?1`)
      .bind(corp.id)
      .first<{ members: number }>();
    expect(row?.members).toBe(2);
  });
});

describe('the door', () => {
  it('lets anybody into an open corporation', async () => {
    const { env } = db();
    await found(env, who('a'), { policy: 'open' });
    const corp = (await seen(env, who('a')))!;
    expect(await corps.join(env, who('b'), { id: corp.id })).toEqual({});
  });

  it('takes a request at a closed one, and the owner answers it', async () => {
    const { env } = db();
    await found(env, who('a'), { policy: 'closed' });
    const corp = (await seen(env, who('a')))!;

    expect(await corps.join(env, who('b'), { id: corp.id })).toEqual({ error: 'closed' });
    expect(await seen(env, who('b'))).toBeNull();
    // asking twice is not a second request
    expect(await corps.join(env, who('b'), { id: corp.id })).toEqual({ error: 'pending' });

    expect((await seen(env, who('a')))?.requests.map((r) => r.id)).toEqual(['b']);
    expect(await corps.answer(env, who('a'), 'b', true)).toEqual({});
    expect((await seen(env, who('b')))?.id).toBe(corp.id);
  });

  it('shows nobody but the owner who is waiting', async () => {
    const { env } = db();
    await found(env, who('a'), { policy: 'closed' });
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id });
    await corps.answer(env, who('a'), 'b', true);
    await corps.join(env, who('c'), { id: corp.id });

    expect((await seen(env, who('a')))?.requests.length).toBe(1);
    expect((await seen(env, who('b')))?.requests).toEqual([]);
  });

  it('opens for the code even when it is closed', async () => {
    // The code IS the owner's permission, handed over in advance.
    const { env } = db();
    await found(env, who('a'), { policy: 'closed' });
    const corp = (await seen(env, who('a')))!;
    expect(await corps.join(env, who('b'), { code: corp.code })).toEqual({});
  });

  it('lets a refusal be exactly that', async () => {
    const { env } = db();
    await found(env, who('a'), { policy: 'closed' });
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id });
    expect(await corps.answer(env, who('a'), 'b', false)).toEqual({});
    expect(await seen(env, who('b'))).toBeNull();
    expect((await seen(env, who('a')))?.requests).toEqual([]);
  });

  it('is answered by the owner and by nobody else', async () => {
    const { env } = db();
    await found(env, who('a'), { policy: 'closed' });
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { code: corp.code });
    await corps.join(env, who('c'), { id: corp.id });
    expect(await corps.answer(env, who('b'), 'c', true)).toEqual({ error: 'notowner' });
  });
});

describe('leaving', () => {
  it('hands the corporation to the oldest member when the owner goes', async () => {
    const { env } = db();
    const t = Date.now();
    await found(env, who('a'), {}, t);
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id }, t + 1000);
    await corps.join(env, who('c'), { id: corp.id }, t + 2000);

    await corps.leave(env, who('a'), t + 3000);
    // b joined before c, so b has it — seniority is the one thing nobody can
    // farm on a Tuesday afternoon
    expect((await seen(env, who('b')))?.ownerId).toBe('b');
  });

  it('deletes the corporation when the last member walks out', async () => {
    const { env } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await corps.leave(env, who('a'));

    for (const table of ['corps', 'corp_members', 'corp_feed', 'corp_requests']) {
      const left = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table}${table === 'corps' ? ' WHERE id = ?1' : ' WHERE corp_id = ?1'}`,
      )
        .bind(corp.id)
        .first<{ n: number }>();
      expect(left?.n, table).toBe(0);
    }
  });

  it('leaves the season behind: a contribution belongs to the pair', async () => {
    const { env } = db();
    const t = Date.UTC(2026, 4, 10);
    await found(env, who('a'), {}, t);
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id }, t);
    await corps.credit(env, 'b', { coins: 40 }, t);
    expect((await seen(env, who('a'), t))?.members.find((m) => m.id === 'b')?.coins).toBe(40);

    await corps.leave(env, who('b'), t);
    // ...and back again, past the cooldown, to nothing
    await corps.join(env, who('b'), { id: corp.id }, t + SWITCH_COOLDOWN_MS + 1);
    expect(
      (await seen(env, who('a'), t + SWITCH_COOLDOWN_MS + 1))?.members.find((m) => m.id === 'b')
        ?.coins,
    ).toBe(0);
  });

  it('charges a day before the next corporation', async () => {
    const { env } = db();
    const t = Date.now();
    await found(env, who('a'), { name: 'ALPHA', tag: 'AL' }, t);
    await found(env, who('b'), { name: 'BETA', tag: 'BE' }, t);
    const beta = (await seen(env, who('b')))!;

    await corps.leave(env, who('a'), t);
    const refused = await corps.join(env, who('a'), { id: beta.id }, t + 1000);
    expect(refused.error).toBe('cooldown');
    expect(refused.wait).toBeGreaterThan(0);

    expect(await corps.join(env, who('a'), { id: beta.id }, t + SWITCH_COOLDOWN_MS)).toEqual({});
  });

  it('charges nobody who did not choose to go', async () => {
    const { env } = db();
    const t = Date.now();
    await found(env, who('a'), { name: 'ALPHA', tag: 'AL' }, t);
    const alpha = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: alpha.id }, t);
    await found(env, who('c'), { name: 'BETA', tag: 'BE' }, t);
    const beta = (await seen(env, who('c')))!;

    expect(await corps.kick(env, who('a'), 'b', t)).toEqual({});
    // thrown out a second ago, and free to join somewhere else immediately
    expect(await corps.join(env, who('b'), { id: beta.id }, t + 1000)).toEqual({});
  });
});

describe('what the owner can do', () => {
  const owned = async (now = Date.now()) => {
    const { env } = db();
    await found(env, who('a'), {}, now);
    const corp = (await seen(env, who('a'), now))!;
    await corps.join(env, who('b'), { id: corp.id }, now);
    return { env, corp };
  };

  it('throws a member out, and only the owner can', async () => {
    const { env } = await owned();
    expect(await corps.kick(env, who('b'), 'a')).toEqual({ error: 'notowner' });
    expect(await corps.kick(env, who('a'), 'b')).toEqual({});
    expect(await seen(env, who('b'))).toBeNull();
  });

  it('cannot throw itself out — that is leaving, and leaving hands over', async () => {
    const { env } = await owned();
    expect(await corps.kick(env, who('a'), 'a')).toEqual({ error: 'notowner' });
    expect((await seen(env, who('a')))?.members.length).toBe(2);
  });

  it('hands ownership on', async () => {
    const { env } = await owned();
    expect(await corps.transfer(env, who('a'), 'b')).toEqual({});
    expect((await seen(env, who('a')))?.ownerId).toBe('b');
    // and is an ordinary member afterwards
    expect(await corps.kick(env, who('a'), 'b')).toEqual({ error: 'notowner' });
  });

  it('will not hand it to somebody who is not in it', async () => {
    const { env } = await owned();
    expect(await corps.transfer(env, who('a'), 'stranger')).toEqual({ error: 'nosuch' });
  });

  it('disbands it, with everybody still inside', async () => {
    const { env, corp } = await owned();
    expect(await corps.disband(env, who('b'))).toEqual({ error: 'notowner' });
    expect(await corps.disband(env, who('a'))).toEqual({});
    expect(await seen(env, who('a'))).toBeNull();
    expect(await seen(env, who('b'))).toBeNull();

    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM corp_members WHERE corp_id = ?1`)
      .bind(corp.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('renames it, but not twice in a week', async () => {
    const t = Date.now();
    const { env } = await owned(t);
    expect(await corps.edit(env, who('a'), { name: 'BEAR PIT' }, t)).toEqual({});
    expect((await seen(env, who('a'), t))?.name).toBe('BEAR PIT');

    const soon = await corps.edit(env, who('a'), { name: 'BULL RUN' }, t + 1000);
    expect(soon.error).toBe('renamed');
    expect((await seen(env, who('a'), t))?.name).toBe('BEAR PIT');

    expect(await corps.edit(env, who('a'), { name: 'BULL RUN' }, t + RENAME_EVERY_MS)).toEqual({});
  });

  it('changes the door as often as it likes: that is not a rename', async () => {
    const t = Date.now();
    const { env } = await owned(t);
    await corps.edit(env, who('a'), { name: 'BEAR PIT' }, t);
    expect(await corps.edit(env, who('a'), { policy: 'closed' }, t + 1)).toEqual({});
    expect(await corps.edit(env, who('a'), { policy: 'open' }, t + 2)).toEqual({});
    expect((await seen(env, who('a'), t))?.policy).toBe('open');
  });

  it('lets everybody in when the door is opened rather than leaving a queue', async () => {
    const t = Date.now();
    const { env, corp } = await owned(t);
    await corps.edit(env, who('a'), { policy: 'closed' }, t);
    await corps.join(env, who('c'), { id: corp.id }, t);
    expect((await seen(env, who('a'), t))?.requests.length).toBe(1);

    await corps.edit(env, who('a'), { policy: 'open' }, t + 1);
    expect((await seen(env, who('a'), t))?.requests).toEqual([]);
  });

  it('refuses a change worked out against a row that has since moved', async () => {
    // The compare-and-set on `updated_at`, which is the version as well as the
    // timestamp — the same bargain `profile.ts` strikes. `transfer` reads and
    // then writes, so a write in between is what it has to refuse.
    const { env, corp } = await owned();

    const before = await env.DB.prepare(`SELECT updated_at FROM corps WHERE id = ?1`)
      .bind(corp.id)
      .first<{ updated_at: number }>();

    // somebody joins, which moves the row
    await corps.join(env, who('c'), { id: corp.id });
    const after = await env.DB.prepare(`SELECT updated_at FROM corps WHERE id = ?1`)
      .bind(corp.id)
      .first<{ updated_at: number }>();
    expect(after!.updated_at).toBeGreaterThan(before!.updated_at);
  });

  it('never lets two transfers made from the same reading both land', async () => {
    const { env, corp } = await owned();
    await corps.join(env, who('c'), { id: corp.id });

    const [x, y] = await Promise.all([
      corps.transfer(env, who('a'), 'b'),
      corps.transfer(env, who('a'), 'c'),
    ]);
    // one of them worked out its change against a row that moved underneath
    expect([x.error, y.error].filter(Boolean)).toEqual(['busy']);
    expect((await seen(env, who('a')))?.ownerId).not.toBe('a');
  });
});

describe('the season', () => {
  const MAY = Date.UTC(2026, 4, 15);
  const JUNE = Date.UTC(2026, 5, 2);

  it('adds up what the server paid, and nothing the client said', async () => {
    const { env } = db();
    await found(env, who('a'), {}, MAY);
    await corps.credit(env, 'a', { coins: 12 }, MAY);
    await corps.credit(env, 'a', { coins: 8 }, MAY);
    await corps.credit(env, 'a', { dollars: 500 }, MAY);

    const corp = (await seen(env, who('a'), MAY))!;
    expect(corp.season).toBe(seasonOf(MAY));
    expect(corp.members[0].coins).toBe(20);
    expect(corp.members[0].dollars).toBe(500);
  });

  it('starts again on the first of the month, with nothing running', async () => {
    const { env } = db();
    await found(env, who('a'), {}, MAY);
    await corps.credit(env, 'a', { coins: 20 }, MAY);

    // Nothing at all happens between the two lines. The month simply stops
    // matching, and last month's number is read as zero.
    expect((await seen(env, who('a'), JUNE))?.members[0].coins).toBe(0);

    // ...and is overwritten rather than added to by the next thing credited
    await corps.credit(env, 'a', { coins: 3 }, JUNE);
    expect((await seen(env, who('a'), JUNE))?.members[0].coins).toBe(3);
    expect((await seen(env, who('a'), MAY))?.members[0].coins).toBe(0);
  });

  it('credits nobody who is in no corporation, and does not mind', async () => {
    const { env } = db();
    await expect(corps.credit(env, 'nobody', { coins: 5 }, MAY)).resolves.toBeUndefined();
  });
});

describe('the table', () => {
  const MAY = Date.UTC(2026, 4, 15);

  /** A corporation of `n` members, each having earned `each` coins this season. */
  const team = async (env: Env, name: string, tag: string, n: number, each: number) => {
    const boss = who(`${name}-0`);
    await found(env, boss, { name, tag }, MAY);
    const corp = (await seen(env, boss, MAY))!;
    await corps.credit(env, boss.id, { coins: each }, MAY);
    for (let i = 1; i < n; i++) {
      const member = who(`${name}-${i}`);
      await corps.join(env, member, { id: corp.id }, MAY);
      await corps.credit(env, member.id, { coins: each }, MAY);
    }
    return corp.id;
  };

  it('ranks the average and not the sum, which is the whole point', async () => {
    const { env } = db();
    // SMALL is five people earning a hundred each; BIG is ten earning fifty.
    // The sum says BIG by a mile; the average says SMALL, and the average is
    // the question the table is supposed to be asking.
    const small = await team(env, 'SMALL', 'SM', 5, 100);
    await team(env, 'BIG', 'BG', 10, 50);

    const { top } = await corps.table(env, 'coins', 10, null, MAY);
    expect(top.map((c) => c.name)).toEqual(['SMALL', 'BIG']);
    expect(top[0].average).toBe(100);
    expect(top[1].average).toBe(50);
    expect(top[0].id).toBe(small);
  });

  it('keeps a corporation of one prodigy out of it', async () => {
    const { env } = db();
    await team(env, 'SOLO', 'SO', MIN_RANKED - 1, 10_000);
    await team(env, 'REAL', 'RE', MIN_RANKED, 10);

    const { top } = await corps.table(env, 'coins', 10, null, MAY);
    expect(top.map((c) => c.name)).toEqual(['REAL']);
  });

  /**
   * Out of the TABLE is not the same as earning nothing, and the card a browsed
   * row opens has to be able to tell them apart: it prints the average, and a
   * zero there would say a corporation had a bad month rather than that it is
   * too small to be placed.
   */
  it('still knows what a corporation below the floor averages', async () => {
    const { env } = db();
    await team(env, 'SOLO', 'SO', MIN_RANKED - 1, 10_000);
    await team(env, 'REAL', 'RE', MIN_RANKED, 10);

    const rows = await corps.browse(env, '', 25, MAY);
    const solo = rows.find((r) => r.name === 'SOLO')!;
    expect(solo.rank).toBeNull();
    expect(solo.coinAverage).toBe(10_000);

    // and the placed one agrees with the table it is placed in
    expect(rows.find((r) => r.name === 'REAL')!.coinAverage).toBe(10);
  });

  it('carries both averages, whichever table the row came out of', async () => {
    const { env } = db();
    const id = await team(env, 'BOTH', 'BO', MIN_RANKED, 30);
    for (let i = 0; i < MIN_RANKED; i++) {
      await corps.credit(env, `BOTH-${i}`, { dollars: 600 }, MAY);
    }

    const { top } = await corps.table(env, 'coins', 10, null, MAY);
    const row = top.find((c) => c.id === id)!;
    expect(row.coinAverage).toBe(30);
    expect(row.dollarAverage).toBe(600);

    // the same two numbers from the other table, in the same places
    const fromDollars = (await corps.table(env, 'dollars', 10, null, MAY)).top.find(
      (c) => c.id === id,
    )!;
    expect(fromDollars.coinAverage).toBe(30);
    expect(fromDollars.dollarAverage).toBe(600);
  });

  it('counts a member who has earned nothing, which is what makes a seat cost', async () => {
    const { env } = db();
    await team(env, 'KEEN', 'KE', 3, 90);
    const idle = await team(env, 'IDLE', 'ID', 3, 90);
    // one more body, no more coins: the average falls by a quarter
    await corps.join(env, who('passenger'), { id: idle }, MAY);

    const { top } = await corps.table(env, 'coins', 10, null, MAY);
    expect(top[0].name).toBe('KEEN');
    expect(top.find((c) => c.name === 'IDLE')?.average).toBe(68);
  });

  it('ranks the dollar table on what the game paid out, never on a balance', async () => {
    const { env } = db();
    const rich = await team(env, 'RICH', 'RI', 3, 0);
    await team(env, 'POOR', 'PO', 3, 0);
    for (let i = 0; i < 3; i++) await corps.credit(env, `RICH-${i}`, { dollars: 500 }, MAY);

    const { top } = await corps.table(env, 'dollars', 10, null, MAY);
    expect(top[0].name).toBe('RICH');
    expect(top[0].id).toBe(rich);
    expect(top[0].average).toBe(500);
  });

  it('empties on the first of the month', async () => {
    const { env } = db();
    await team(env, 'KEEN', 'KE', 3, 90);
    const { top } = await corps.table(env, 'coins', 10, null, Date.UTC(2026, 5, 1));
    expect(top[0].average).toBe(0);
  });

  it('carries the caller own corporation under the page when it placed outside', async () => {
    const { env } = db();
    for (let i = 0; i < 4; i++) await team(env, `TEAM${i}`, `T${i}`, 3, 100 - i);
    const last = (await seen(env, who('TEAM3-0'), MAY))!;

    const { top, me } = await corps.table(env, 'coins', 2, last.id, MAY);
    expect(top.length).toBe(2);
    expect(me?.id).toBe(last.id);
    expect(me?.rank).toBe(4);
  });

  it('tells a corporation its place in both tables at once', async () => {
    const { env } = db();
    await team(env, 'ALPHA', 'AL', 3, 10);
    await team(env, 'BETA', 'BE', 3, 20);

    expect((await seen(env, who('BETA-0'), MAY))?.coinRank).toBe(1);
    expect((await seen(env, who('ALPHA-0'), MAY))?.coinRank).toBe(2);

    // Nobody has earned a dollar, so the two are level in that table. Which of
    // them is first is not the interesting part — that the order is TOTAL is:
    // two rows tied on the average still hold two different places, and hold
    // the same ones on the next read.
    const [alpha, beta] = [
      (await seen(env, who('ALPHA-0'), MAY))!,
      (await seen(env, who('BETA-0'), MAY))!,
    ];
    expect([alpha.dollarRank, beta.dollarRank].sort()).toEqual([1, 2]);
    expect((await seen(env, who('ALPHA-0'), MAY))?.dollarRank).toBe(alpha.dollarRank);
  });
});

describe('the list somebody with no corporation reads', () => {
  const some = async (env: Env, now: number) => {
    await found(env, who('a'), { name: 'IRON DESK', tag: 'IRD' }, now);
    await found(env, who('b'), { name: 'NIGHT SHIFT', tag: 'NS' }, now);
    const iron = (await seen(env, who('a'), now))!;
    await corps.join(env, who('c'), { id: iron.id }, now);
  };

  it('lists everybody when nothing has been typed', async () => {
    // The empty box is the case every single player sees first, and it is the
    // one a hand-numbered parameter got wrong: `LIMIT ?2` in a statement bound
    // with one argument is not a wrong answer, it is a refused query.
    const { env } = db();
    const t = Date.now();
    await some(env, t);
    const rows = await corps.browse(env, '', 25, t);
    expect(rows.map((r) => r.name).sort()).toEqual(['IRON DESK', 'NIGHT SHIFT']);
    // biggest first: a corporation somebody can actually talk to is worth more
    // to a newcomer than an empty one with a good average
    expect(rows[0].name).toBe('IRON DESK');
  });

  it('searches the name and the tag alike, and does not mind the case', async () => {
    const { env } = db();
    const t = Date.now();
    await some(env, t);
    expect((await corps.browse(env, 'night', 25, t)).map((r) => r.name)).toEqual(['NIGHT SHIFT']);
    expect((await corps.browse(env, 'IRD', 25, t)).map((r) => r.name)).toEqual(['IRON DESK']);
    expect(await corps.browse(env, 'NOBODY', 25, t)).toEqual([]);
  });

  it('does not let a wildcard mean anything', async () => {
    // A `%` is stripped like every other character a name cannot contain, so
    // it cannot change what the pattern matches — and a search made of nothing
    // but wildcards is the same as no search, which is the listing everybody
    // gets anyway. What must not happen is `IR%K` finding IRON DESK.
    const { env } = db();
    const t = Date.now();
    await some(env, t);
    expect((await corps.browse(env, '%', 25, t)).length).toBe(2);
    expect(await corps.browse(env, 'IR%K', 25, t)).toEqual([]);
    expect(await corps.browse(env, 'IRON_DESK', 25, t)).toEqual([]);
  });

  it('shows a full corporation rather than hiding it', async () => {
    // The one somebody is looking for is very often the one their friends have
    // already filled, and a list it is missing from looks broken.
    const { env } = db();
    const t = Date.now();
    await found(env, who('a'), {}, t);
    const corp = (await seen(env, who('a'), t))!;
    for (let i = 1; i < MAX_MEMBERS; i++) await corps.join(env, who(`p${i}`), { id: corp.id }, t);

    const [row] = await corps.browse(env, '', 25, t);
    expect(row.members).toBe(MAX_MEMBERS);
  });
});

describe('the feed', () => {
  it('says who arrived and who left, and nothing anybody typed', async () => {
    const { env } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id });
    await corps.leave(env, who('b'));

    const feed = (await seen(env, who('a')))!.feed;
    expect(feed.map((f) => `${f.kind}:${f.who}`)).toEqual(['left:B', 'joined:B', 'joined:A']);
  });

  it('keeps only the last of them', async () => {
    const { env } = db();
    await found(env, who('a'));
    for (let i = 0; i < 70; i++) await corps.note(env, who('a'), 'award', `award-${i}`);
    const feed = (await seen(env, who('a')))!.feed;
    expect(feed.length).toBeLessThanOrEqual(60);
    // and they are the newest, not the oldest
    expect(feed[0].detail).toBe('award-69');
  });

  it('forgets anything older than a week', async () => {
    const { env } = db();
    const t = Date.now();
    await found(env, who('a'), {}, t - 30 * 86_400_000);
    await corps.note(env, who('a'), 'award', 'ancient', t - 8 * 86_400_000);
    await corps.note(env, who('a'), 'award', 'fresh', t);

    const feed = (await seen(env, who('a'), t))!.feed;
    expect(feed.map((f) => f.detail)).toEqual(['fresh']);
  });

  it('says nothing at all about a player who is in no corporation', async () => {
    const { env } = db();
    await expect(corps.note(env, who('nobody'), 'league', '2')).resolves.toBeUndefined();
  });
});

describe('a duel left in the feed', () => {
  const setup = async (now = Date.now()) => {
    const { env } = db();
    await found(env, who('a'), {}, now);
    const corp = (await seen(env, who('a'), now))!;
    await corps.join(env, who('b'), { id: corp.id }, now);
    await corps.join(env, who('c'), { id: corp.id }, now);
    return { env, corp };
  };

  const cardIn = async (env: Env, caller: Caller, now: number) =>
    (await seen(env, caller, now))!.feed.find((f) => f.kind === 'duel')!;

  it('is taken by exactly one person', async () => {
    const t = Date.now();
    const { env } = await setup(t);
    await corps.callOut(env, who('a'), 'abcdefghjk', t + 900_000, t);
    const card = await cardIn(env, who('b'), t);

    const [first, second] = await Promise.all([
      corps.takeDuel(env, who('b'), card.id, t),
      corps.takeDuel(env, who('c'), card.id, t),
    ]);
    const outcomes = [first, second];
    expect(outcomes.filter((o) => typeof o === 'string')).toEqual(['gone']);
    expect(outcomes.find((o) => typeof o !== 'string')).toEqual({ code: 'abcdefghjk' });
  });

  it('goes dark for everybody else, saying who took it', async () => {
    const t = Date.now();
    const { env } = await setup(t);
    await corps.callOut(env, who('a'), 'abcdefghjk', t + 900_000, t);
    await corps.takeDuel(env, who('b'), (await cardIn(env, who('b'), t)).id, t);

    expect((await cardIn(env, who('c'), t)).takenBy).toBe('B');
    expect(await corps.takeDuel(env, who('c'), (await cardIn(env, who('c'), t)).id, t)).toBe('gone');
  });

  it('can always be picked up again by whoever left it', async () => {
    const t = Date.now();
    const { env } = await setup(t);
    await corps.callOut(env, who('a'), 'abcdefghjk', t + 900_000, t);
    const card = await cardIn(env, who('a'), t);
    await corps.takeDuel(env, who('b'), card.id, t);
    // the host walked away from their own lobby and is coming back to it
    expect(await corps.takeDuel(env, who('a'), card.id, t)).toEqual({ code: 'abcdefghjk' });
  });

  it('is gone the moment the invitation behind it is', async () => {
    const t = Date.now();
    const { env } = await setup(t);
    await corps.callOut(env, who('a'), 'abcdefghjk', t + 900_000, t);
    const card = await cardIn(env, who('b'), t);

    // a quarter of an hour later there is no seat to take, so there is no card
    expect((await seen(env, who('b'), t + 901_000))!.feed.some((f) => f.kind === 'duel')).toBe(
      false,
    );
    expect(await corps.takeDuel(env, who('b'), card.id, t + 901_000)).toBe('nosuch');
  });

  it('cannot be taken from outside the corporation', async () => {
    const t = Date.now();
    const { env } = await setup(t);
    await corps.callOut(env, who('a'), 'abcdefghjk', t + 900_000, t);
    const card = await cardIn(env, who('a'), t);
    expect(await corps.takeDuel(env, who('stranger'), card.id, t)).toBe('notmember');
  });
});

describe('what a deleted account leaves behind', () => {
  it('is nothing, and the corporation goes too when it was the last member', async () => {
    const { env, fake } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await fake.batch(corps.forgetting(env, 'a') as never[]);

    for (const table of ['corps', 'corp_members', 'corp_feed', 'corp_requests', 'corp_moves']) {
      const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(left?.n, table).toBe(0);
    }
    expect(await seen(env, who('a'))).toBeNull();
    expect(corp.id).toBeTruthy();
  });

  it('leaves the corporation standing when other people are in it', async () => {
    const { env, fake } = db();
    await found(env, who('a'));
    const corp = (await seen(env, who('a')))!;
    await corps.join(env, who('b'), { id: corp.id });

    await fake.batch(corps.forgetting(env, 'a') as never[]);
    const after = await seen(env, who('b'));
    expect(after?.members.map((m) => m.id)).toEqual(['b']);
    // the owner deleted their account, so the oldest member left has it now
    expect(after?.ownerId).toBe('b');
  });
});
