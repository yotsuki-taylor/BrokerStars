/**
 * Who knows whom.
 *
 * Two tables and no arithmetic. `friend_codes` is one row per player — the
 * code their invitation link carries, minted the first time they open the
 * friends menu and kept forever after. `friends` is one row per direction of
 * every friendship, so reading somebody's list is a single indexed query with
 * no OR in it and no pair to normalise.
 *
 * The name is stored on both, which is the one piece of denormalisation here
 * and earns its keep: `players` only gets a row when somebody finishes a
 * match, so a friend who has been invited but has not played yet would
 * otherwise have no name to show. The live name from `players` wins whenever
 * there is one — see `list` — and the stored one is only the fallback.
 *
 * Why a standing code rather than a one-shot invitation like a duel's: see
 * `src/friends/protocol.ts`, which says what that buys and what it costs.
 */

import * as invites from './invites';
import { FRIEND_CODE_LENGTH, MAX_FRIENDS, type Friend, type FriendError } from '../../src/friends/protocol';
import { cleanOutfit, cleanRoom } from '../../src/profile/protocol';
import type { Env } from './results';
import type { Caller } from './telegram';

/** The duel alphabet, for the reasons `mintCode` in index.ts gives. */
const ALPHABET = '0123456789bcdfghjklmnpqrstvwxyz';

function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(FRIEND_CODE_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * The caller's code, minted once and then theirs.
 *
 * The name is refreshed on the way past: it is what the *other* side will see
 * in their list before either of them has played a match, and somebody who
 * renamed themselves in Telegram last week should not be introduced under the
 * old one.
 *
 * A collision on the primary key is sixty bits unlucky and is retried rather
 * than reported — with a re-read in between, because the other way to lose
 * that insert is two requests from the same player racing, and then the row is
 * already there and is the answer.
 */
export async function codeFor(env: Env, caller: Caller): Promise<string> {
  const mine = await env.DB.prepare(`SELECT code, name FROM friend_codes WHERE player_id = ?1`)
    .bind(caller.id)
    .first<{ code: string; name: string }>();
  if (mine) {
    if (mine.name !== caller.name) {
      await env.DB.prepare(`UPDATE friend_codes SET name = ?2 WHERE player_id = ?1`)
        .bind(caller.id, caller.name)
        .run();
    }
    return mine.code;
  }

  for (let tries = 0; tries < 4; tries++) {
    const code = mintCode();
    try {
      await env.DB.prepare(
        `INSERT INTO friend_codes (code, player_id, name, created_at) VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(code, caller.id, caller.name, Date.now())
        .run();
      return code;
    } catch {
      const now = await env.DB.prepare(`SELECT code FROM friend_codes WHERE player_id = ?1`)
        .bind(caller.id)
        .first<{ code: string }>();
      if (now) return now.code;
    }
  }
  throw new Error('could not mint a friend code');
}

/**
 * The list, best first.
 *
 * Ranked on coins earned rather than on when the two met, which turns the menu
 * into a table of the people the player actually knows — the leaderboard the
 * rating screen shows is everybody alive, and nobody is thirtieth among their
 * own friends.
 */
export async function list(env: Env, id: string): Promise<Friend[]> {
  const { results } = await env.DB.prepare(
    `SELECT f.friend_id                     AS id,
            COALESCE(p.name, f.name)        AS name,
            COALESCE(p.stars, 0)            AS coins,
            COALESCE(p.matches, 0)          AS matches,
            COALESCE(pr.room, 0)            AS room,
            COALESCE(pr.outfit, '{}')       AS outfit
       FROM friends f
       LEFT JOIN players p ON p.id = f.friend_id
       LEFT JOIN profiles pr ON pr.id = f.friend_id
      WHERE f.player_id = ?1
      ORDER BY coins DESC, f.created_at ASC
      LIMIT ?2`,
  )
    .bind(id, MAX_FRIENDS)
    .all<Omit<Friend, 'outfit'> & { outfit: string }>();

  // The room and the clothes ride along so that visiting a friend is instant
  // rather than a second request over a picture of their bedroom — see the
  // note on `Friend`. `outfit` is JSON in the column and a shape on the wire.
  return (results ?? []).map((r) => ({
    ...r,
    room: cleanRoom(r.room),
    outfit: cleanOutfit(parse(r.outfit)),
  }));
}

/** A column that should hold JSON and, on a bad day, does not. */
function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Are these two actually friends? Asked before a duel invitation is pushed
 * into somebody's Telegram: the bot can message anybody who has ever started
 * it, so being on the list is what turns that from a capability into a
 * permission.
 */
export async function areFriends(env: Env, a: string, b: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS yes FROM friends WHERE player_id = ?1 AND friend_id = ?2`,
  )
    .bind(a, b)
    .first<{ yes: number }>();
  return Boolean(row);
}

const countOf = async (env: Env, id: string): Promise<number> => {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM friends WHERE player_id = ?1`)
    .bind(id)
    .first<{ n: number }>();
  return row?.n ?? 0;
};

/**
 * Somebody tapped a link. Both directions go in one batch — a friendship that
 * only one of the two can see is worse than none — and both are written with
 * OR IGNORE, so tapping the same link a second time is a no-op rather than an
 * error. It is a link in a chat: it WILL be tapped twice.
 */
export async function befriend(
  env: Env,
  caller: Caller,
  code: string,
): Promise<FriendError | null> {
  const owner = await env.DB.prepare(`SELECT player_id, name FROM friend_codes WHERE code = ?1`)
    .bind(code)
    .first<{ player_id: string; name: string }>();
  if (!owner) return 'nosuch';
  if (owner.player_id === caller.id) return 'yourself';

  // Checked on both sides, or a popular player could be filled up by strangers
  // while the person they invited cannot get in.
  const [mine, theirs] = await Promise.all([
    countOf(env, caller.id),
    countOf(env, owner.player_id),
  ]);
  if (mine >= MAX_FRIENDS || theirs >= MAX_FRIENDS) return 'full';

  const now = Date.now();
  const add = (a: string, b: string, name: string) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO friends (player_id, friend_id, name, created_at)
            VALUES (?1, ?2, ?3, ?4)`,
    ).bind(a, b, name, now);

  await env.DB.batch([
    add(caller.id, owner.player_id, owner.name),
    add(owner.player_id, caller.id, caller.name),
  ]);

  // Whose code it was, which the friendship above deliberately does not record:
  // it is two symmetric rows and they are the same the moment they exist. The
  // pair is not paid here -- see `invites.settle` for why the money waits for
  // the friend to actually play.
  await invites.invited(env, owner.player_id, caller.id);
  return null;
}
