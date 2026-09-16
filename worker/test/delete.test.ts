import { describe, expect, it } from 'vitest';
import SCHEMA from '../schema.sql?raw';
import CORPS from '../src/corps.ts?raw';
import INDEX from '../src/index.ts?raw';

/**
 * Does deleting an account actually empty it?
 *
 * The delete is a batch of statements against D1 and there is no database in
 * these tests, so this reads the two files as TEXT and holds them against each
 * other — the trick `src/ui/tutorial.test.ts` uses on the menu's markup, and
 * for the same reason: the failure being guarded is somebody adding a thing and
 * forgetting the other end of it.
 *
 * IT HAS ALREADY HAPPENED ONCE. `feedback_sent` was added with the feedback box
 * and left out of the delete for a day, so a deleted account kept a row. The
 * row was an id and a timestamp and nothing else, which is exactly why nobody
 * would have noticed: every table in this class is small, boring, and
 * individually easy to forget.
 *
 * So the rule is inverted. Every table keyed to a player is deleted UNLESS it
 * is named below with a reason — a new table is a failing test until somebody
 * decides which it is, rather than a silent omission.
 */

/**
 * The statements `deleteAccount` runs, and nothing else in the file.
 *
 * Plus the ones it splices in from elsewhere. `corps.forgetting` hands back
 * statements rather than running them precisely so that this route keeps its
 * one promise — one batch, all of it or none — and a batch assembled in two
 * files would otherwise be half invisible to the check below. Following it is
 * the alternative to exempting five tables with a reason that amounts to "they
 * are deleted, just not here".
 */
const DELETE_BATCH = (() => {
  const from = INDEX.indexOf('async function deleteAccount');
  expect(from, 'deleteAccount has been renamed').toBeGreaterThan(-1);
  const batch = INDEX.slice(from, INDEX.indexOf('\n}', from));
  expect(batch, 'deleteAccount no longer splices in the corporation statements').toContain(
    'corps.forgetting(env, id)',
  );

  const spliced = CORPS.indexOf('export const forgetting');
  expect(spliced, 'corps.forgetting has been renamed').toBeGreaterThan(-1);
  return batch + CORPS.slice(spliced, CORPS.indexOf('\n];', spliced));
})();

/**
 * Every table the schema declares, with the columns it names.
 *
 * Comments are stripped before anything is counted and the body is then read by
 * balancing parentheses rather than by a regex. Both are load bearing: this
 * schema documents itself heavily, half those comments contain brackets like
 * `(src/profile/protocol.ts)`, and a pattern that stopped at the first `)` lost
 * `profiles` — a table the delete very much has to cover.
 */
const TABLES = (() => {
  const sql = SCHEMA.replace(/--.*/g, '');
  const out: { name: string; body: string }[] = [];
  const head = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g;
  for (let m = head.exec(sql); m; m = head.exec(sql)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < sql.length && depth > 0; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
    }
    out.push({ name: m[1], body: sql.slice(m.index + m[0].length, i - 1) });
  }
  return out;
})();

/**
 * A column that holds somebody's player id. `players` and `profiles` key the
 * person on `id` itself; everywhere else it is a named reference.
 */
const PLAYER_COLUMNS = ['player_id', 'host_id', 'friend_id', 'to_id', 'from_id', 'alias_id'];

/**
 * Tables that are deliberately NOT emptied, each with the reason. Anything not
 * in this list and not in the batch fails the test below.
 */
const EXEMPT: Record<string, string> = {
  players: 'deleted on `id`, not on a player column',
  profiles: 'deleted on `id`, not on a player column',
  // Short-lived by construction: both carry `expires_at` and are swept, so a
  // row left behind by a deletion is gone within the quarter-hour either way.
  duel_calls: 'expires in fifteen minutes on its own',
  link_codes: 'expires on its own',
  // Named out loud in the privacy policy — "если вы связывали между собой вход
  // через Telegram и Google, служебная запись об этой связи может остаться" —
  // so this is a documented promise rather than a hole. It stays exempt only
  // while the policy keeps saying so.
  identities: 'documented in public/privacy.html as possibly remaining',
  // Who invited whom. Keyed on the OTHER person as often as on the caller, and
  // deleting it would erase somebody else's record of an invitation they were
  // paid for. Left alone on purpose.
  invites: 'holds the other side of a friendship, not only the caller',
};

describe('deleting an account', () => {
  it('finds the tables it is supposed to be checking', () => {
    // If the schema stops parsing, every assertion below passes vacuously.
    expect(TABLES.length).toBeGreaterThan(8);
    expect(TABLES.map((t) => t.name)).toContain('feedback_sent');
  });

  it('empties every table keyed to a player, or says why not', () => {
    for (const { name, body } of TABLES) {
      const keyed = PLAYER_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(body));
      if (!keyed) continue;
      if (EXEMPT[name]) continue;
      expect(DELETE_BATCH, `${name} is keyed to a player and is never deleted`).toContain(
        `DELETE FROM ${name}`,
      );
    }
  });

  it('deletes the player and the profile themselves', () => {
    expect(DELETE_BATCH).toContain('DELETE FROM players');
    expect(DELETE_BATCH).toContain('DELETE FROM profiles');
  });

  it('deletes the feedback cooldown, which is the one that was forgotten', () => {
    expect(DELETE_BATCH).toContain('DELETE FROM feedback_sent');
  });

  it('exempts nothing that no longer exists', () => {
    // An exemption for a dropped table is a reason nobody will re-read, and it
    // would silently cover a future table that happened to take the name.
    const names = new Set(TABLES.map((t) => t.name));
    for (const name of Object.keys(EXEMPT)) {
      expect(names, `${name} is exempted but is not in the schema`).toContain(name);
    }
  });
});
