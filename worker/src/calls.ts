/**
 * Being called out to a duel by name, and collecting the call later.
 *
 * DUEL on a friend's row used to mean one thing: the bot put the invitation in
 * that friend's Telegram. A friend's id IS their chat there, so there was
 * nothing to look up and nothing to store. Then a second kind of player
 * arrived — signed in with Google, no chat, an id the bot cannot address — and
 * calling one of them by name quietly did nothing. The link was minted, the
 * screen said so, and it went nowhere.
 *
 * So the server keeps the call instead of delivering it, and the game picks it
 * up the next time it asks the server anything. Not a worse kind of delivery
 * than a message: an invitation lives fifteen minutes, so it only ever mattered
 * while the friend was around, and one read an hour later was already dead.
 *
 * The bot still writes to whoever it can reach — a Telegram friend gets both,
 * a message now and a banner if they open the game — because a notification
 * that lights up a phone is worth more than one that waits, and neither costs
 * the other anything.
 *
 * ONE LIVE CALL PER PLAYER, enforced by the primary key rather than by tidying
 * up: a second call replaces the first. Nobody wants a queue of invitations
 * that expire in a quarter of an hour, and if two friends are both waiting,
 * the newer one is the one still likely to be there.
 */

import type { Env } from './results';
import type { Caller } from './telegram';

/** What a waiting call looks like to the game. */
export interface DuelCall {
  /** the invitation code, which is all `joining` needs */
  code: string;
  /** who is calling, for the banner to name */
  from: string;
  expiresAt: number;
}

interface Row {
  code: string;
  from_id: string;
  from_name: string;
  expires_at: number;
}

/**
 * Write the call down. Replaces whatever was waiting for this player.
 *
 * Never throws at the caller: this runs beside minting an invitation, and an
 * invitation that was minted must not fail because the note about it could not
 * be written. The player still has the link in their hand.
 */
export async function place(
  env: Env,
  toId: string,
  from: Caller,
  code: string,
  expiresAt: number,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO duel_calls (to_id, code, from_id, from_name, expires_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (to_id) DO UPDATE SET
            code = excluded.code,
            from_id = excluded.from_id,
            from_name = excluded.from_name,
            expires_at = excluded.expires_at`,
    )
      .bind(toId, code, from.id, from.name, expiresAt)
      .run();
  } catch {
    /* the invitation stands either way */
  }
}

/**
 * Is anybody waiting for this player, and take it if so.
 *
 * Read once and gone, like a knock on a door. The alternative — leaving it
 * until it expires — would have the banner come back on every screen the
 * player opens for the next quarter of an hour, including after they have
 * already taken the duel and finished it.
 *
 * An expired row answers null and is swept on the way past, which is the whole
 * of this table's housekeeping: nothing scheduled, nothing to run at midnight.
 */
export async function take(env: Env, caller: Caller): Promise<DuelCall | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT code, from_id, from_name, expires_at FROM duel_calls WHERE to_id = ?1`,
    )
      .bind(caller.id)
      .first<Row>();
    if (!row) return null;

    await env.DB.prepare(`DELETE FROM duel_calls WHERE to_id = ?1`).bind(caller.id).run();

    if (row.expires_at <= Date.now()) return null;
    return { code: row.code, from: row.from_name, expiresAt: row.expires_at };
  } catch {
    // A call we cannot read is a call that did not happen. The friend still has
    // the link, and the screen that asked for this does not stop working.
    return null;
  }
}
