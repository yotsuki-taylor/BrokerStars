/**
 * The game's own analytics: what it says about how it is being played, written
 * down in the one database this game already keeps.
 *
 * What may be written is `src/analytics/protocol.ts` and nothing else; by the
 * time a batch reaches this file it has been through `cleanBatch`, so every row
 * below is one of eleven names with that name's one shape of props. This file is only
 * about the statements: one insert per batch, the sweep that keeps ninety days
 * and no more, and the move when two accounts become one. The delete when one
 * goes is written out in `/profile/delete` beside every other table's.
 */

import { EVENT_NAMES, RETENTION_DAYS, type Clean, type Host } from '../../src/analytics/protocol';
import { dayOf } from '../../src/daily/protocol';
import type { Env } from './results';

/** What `cleanBatch` hands over. */
export interface Accepted {
  host: Host;
  build: string;
  events: Clean[];
}

/**
 * The oldest day still kept. Anything whose `day` is below this has been here
 * longer than the privacy policy says it will be.
 */
export const keptFrom = (now: number): number => dayOf(now) - RETENTION_DAYS;

/**
 * Write a batch, and sweep what has aged out, in one transaction.
 *
 * ONE INSERT, NOT ONE PER EVENT, and not one with fifty rows of `VALUES` either:
 * D1 takes at most a hundred bound parameters in a statement, and fifty events
 * of eight columns is four hundred. So the whole batch travels as a
 * single JSON parameter and `json_each` unrolls it inside the database. The
 * values in it are the ones `cleanBatch` produced, not the ones that came off
 * the wire.
 *
 * Answers how many rows are new, which is fewer than were sent when some of
 * them had arrived before.
 *
 * THE SWEEP rides along rather than running on a schedule. It walks the
 * `(name, day)` index once per name in the catalogue, so on a day when nothing
 * has aged out it costs one index probe per name and reads no rows. Which is why it is
 * keyed on the catalogue: a name that is ever RETIRED from it stops being swept
 * here, and the change that retires it has to delete its rows itself.
 */
export async function record(
  env: Env,
  playerId: string,
  batch: Accepted,
  now = Date.now(),
): Promise<number> {
  if (batch.events.length === 0) return 0;
  const rows = JSON.stringify(
    batch.events.map((e) => ({ id: e.id, name: e.name, props: e.props, day: e.day, ts: e.ts })),
  );
  const [inserted] = (await env.DB.batch([
    // OR IGNORE: an event already here is one whose earlier sending did land
    // and whose answer did not. It is the same event, and it is not counted
    // twice (`events_by_eid`).
    env.DB.prepare(
      `INSERT OR IGNORE INTO events (eid, player_id, host, build, name, props, day, ts)
       SELECT json_extract(value, '$.id'), ?1, ?2, ?3,
              json_extract(value, '$.name'),
              json_extract(value, '$.props'),
              json_extract(value, '$.day'),
              json_extract(value, '$.ts')
         FROM json_each(?4)`,
    ).bind(playerId, batch.host, batch.build, rows),
    sweeping(env, now),
  ])) as { meta?: { changes?: number } }[];
  return Number(inserted?.meta?.changes ?? 0);
}

/** The ninety-day sweep, as a statement, for `record` and for the test that holds it to its word. */
export const sweeping = (env: Env, now = Date.now()) =>
  env.DB.prepare(
    `DELETE FROM events
      WHERE name IN (SELECT value FROM json_each(?1))
        AND day < ?2`,
  ).bind(JSON.stringify(EVENT_NAMES), keptFrom(now));

/**
 * Two accounts became one person: whatever the joining one did before the link
 * is now that person's history.
 *
 * The one place the link moves anything. Everything else a joining account
 * could hold is refused instead (`link.adopt` insists it is empty), because a
 * wardrobe and a wallet cannot honestly be added together. Events can, and have
 * to be: an account that opened the game, signed in and was linked a minute
 * later would otherwise be counted as somebody who came once and never again.
 */
export const moving = (env: Env, from: string, to: string) =>
  env.DB.prepare(`UPDATE events SET player_id = ?2 WHERE player_id = ?1`).bind(from, to);
