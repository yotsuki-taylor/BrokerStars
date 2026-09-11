/**
 * One person, two ways in.
 *
 * The whole of the design is in `worker/migrations/010-identities.sql` and in
 * `src/link/protocol.ts`; what matters here is that nothing is ever moved. A
 * link is one row saying `g:<sub>` IS this Telegram player, `resolve` below
 * swaps the id the moment a signature is checked, and every table under that
 * point goes on knowing exactly one id per person. Unlinking deletes the row.
 *
 * Which is also why the failure modes are refusals rather than merges. Two
 * accounts that have both been played are two wardrobes and two wallets, and
 * there is no honest arithmetic that turns them into one — so the joining
 * account has to be empty, and if it is not, the player is told to delete it
 * themselves (`/profile/delete`) rather than having it silently absorbed.
 */

import {
  LINK_CODE_LENGTH,
  LINK_CODE_TTL_MS,
  type LinkError,
} from '../../src/link/protocol';
import type { Env } from './results';
import type { Caller } from './telegram';

/** The same alphabet the other codes in this game use. */
const ALPHABET = '0123456789bcdfghjklmnpqrstvwxyz';

function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * Who this caller really is, after any alias is followed.
 *
 * Called on every authenticated request, so it is written to cost nothing to
 * the players who will never use it: only an id that looks like Google's is
 * ever looked up, because the direction is one-way and a Telegram id can never
 * be an alias for anything.
 *
 * A lookup that fails answers the id it was given. The alternative — refusing
 * the request — would take a linked player's whole game away over one unlucky
 * read, and answering the unlinked id merely gives them the account they had
 * before they linked.
 */
export async function resolve(env: Env, id: string): Promise<string> {
  if (!id.startsWith('g:')) return id;
  try {
    const row = await env.DB.prepare(`SELECT player_id FROM identities WHERE alias_id = ?1`)
      .bind(id)
      .first<{ player_id: string }>();
    return row?.player_id ?? id;
  } catch {
    return id;
  }
}

/** Is this player linked to anything? True for either end of a link. */
export async function isLinked(env: Env, caller: Caller): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS n FROM identities WHERE player_id = ?1 OR alias_id = ?1`,
    )
      .bind(caller.id)
      .first<{ n: number }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

/**
 * Mint a code for the account that is keeping its save.
 *
 * One live code per player, replaced rather than queued: a player who asks
 * twice wants the code on the screen in front of them to be the one that
 * works, and two live passwords to the same save is one more than anybody
 * needs.
 *
 * Expired rows for this player go with it, which is this table's whole
 * housekeeping. Somebody else's expired code is swept when they next ask, or
 * when it is offered and refused.
 */
export async function mint(env: Env, caller: Caller): Promise<{ code: string; expiresAt: number }> {
  const code = mintCode();
  const expiresAt = Date.now() + LINK_CODE_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO link_codes (code, player_id, expires_at)
          VALUES (?1, ?2, ?3)
     ON CONFLICT (player_id) DO UPDATE SET
          code = excluded.code,
          expires_at = excluded.expires_at`,
  )
    .bind(code, caller.id, expiresAt)
    .run();
  return { code, expiresAt };
}

/**
 * Has this account ever been played?
 *
 * The question behind `busy`, and it is asked of both tables that hold a save
 * rather than of one: `players` gets a row when a match is FINISHED, `profiles`
 * when somebody so much as opens the shop, and either is enough to mean there
 * is something here that linking would strand.
 */
async function hasGame(env: Env, id: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS n FROM players WHERE id = ?1
        UNION ALL
       SELECT 1 AS n FROM profiles WHERE id = ?1
        LIMIT 1`,
    )
      .bind(id)
      .first<{ n: number }>();
    return Boolean(row);
  } catch {
    // Unreadable is treated as occupied. Refusing a link costs a player one
    // retry; going ahead on a guess costs them a save.
    return true;
  }
}

/**
 * Spend a code and make the link. The caller is the account doing the joining.
 *
 * Everything that can be wrong is checked before anything is written, and each
 * answer is a different sentence to a player rather than a shrug.
 */
export async function redeem(env: Env, caller: Caller, code: string): Promise<LinkError | null> {
  const row = await env.DB.prepare(
    `SELECT player_id, expires_at FROM link_codes WHERE code = ?1`,
  )
    .bind(code)
    .first<{ player_id: string; expires_at: number }>();

  // Swept whether it was any good or not: a code that has been offered once has
  // been said out loud, and one that has expired is rubbish either way.
  if (row) await env.DB.prepare(`DELETE FROM link_codes WHERE code = ?1`).bind(code).run();

  if (!row || row.expires_at <= Date.now()) return 'nosuch';
  if (row.player_id === caller.id) return 'self';

  // Only a Google account joins, and only a non-Google account is joined. Both
  // are the direction the table is built for, and neither can be got at through
  // the game — but a route is a route.
  if (!caller.id.startsWith('g:') || row.player_id.startsWith('g:')) return 'self';

  if (await isLinked(env, caller)) return 'already';
  const other = await env.DB.prepare(
    `SELECT 1 AS n FROM identities WHERE player_id = ?1 OR alias_id = ?1`,
  )
    .bind(row.player_id)
    .first<{ n: number }>();
  if (other) return 'already';

  // The joining account must be empty. Anything it holds would be stranded the
  // moment its id starts resolving to somebody else's, and stranding a save
  // quietly is worse than refusing and saying why.
  if (await hasGame(env, caller.id)) return 'busy';

  await env.DB.prepare(
    `INSERT INTO identities (alias_id, player_id, linked_at) VALUES (?1, ?2, ?3)`,
  )
    .bind(caller.id, row.player_id, Date.now())
    .run();
  return null;
}

/**
 * Undo it. Either end may, and what happens is the same from both: the Google
 * account stops resolving to anybody and is an empty account again — which is
 * what it was before the link and what the screen says it will be.
 *
 * Nothing is deleted but the one row. The Telegram save is untouched, which is
 * the point of never having merged them.
 */
export async function unlink(env: Env, caller: Caller): Promise<void> {
  await env.DB.prepare(`DELETE FROM identities WHERE player_id = ?1 OR alias_id = ?1`)
    .bind(caller.id)
    .run();
}
