/**
 * Paying for an invitation somebody took up.
 *
 * Both sides get the same fifty coins, once per invited friend, at most five
 * times per host, and only after the friend has finished three matches. What
 * each number is for is written where they are declared
 * (`src/friends/protocol.ts`); this file is the bookkeeping.
 *
 * WHY IT IS NOT PAID WHEN THE CODE IS REDEEMED. Because redeeming a code costs
 * nothing. A guest session is handed to anybody who asks -- that is what makes
 * an invitation work outside Telegram -- so paying on redemption pays for
 * typing, and typing can be scripted. Paying on the third finished match at
 * least buys a minute and a half of the server's own rate limit, and the cap
 * above it is what bounds the rest. See the protocol file: none of this is
 * airtight and it is not meant to be, it is meant to be cheap to defend and not
 * worth attacking.
 *
 * Nothing in here ever throws at its caller. It runs beside a match being
 * banked, and a match that was played must be recorded whether or not fifty
 * coins move.
 */

import { INVITE_CAP, INVITE_COINS, INVITE_MATCHES, type InviteStanding } from '../../src/friends/protocol';
import { change } from './profile';
import type { Env } from './results';
import type { Caller } from './telegram';

/**
 * Note that this player came in on that player's code.
 *
 * `OR IGNORE` on a primary key of `friend_id` is the whole rule: somebody can
 * be an invited friend exactly once, whatever they redeem afterwards. A row is
 * written even when the host is already at the cap, because the cap is about
 * paying rather than about knowing, and a row that exists is a row that cannot
 * be claimed again later by somebody else.
 */
export async function invited(env: Env, hostId: string, friendId: string): Promise<void> {
  if (hostId === friendId) return;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO invites (friend_id, host_id, created_at) VALUES (?1, ?2, ?3)`,
    )
      .bind(friendId, hostId, Date.now())
      .run();
  } catch {
    /* an invitation we failed to write is one nobody is paid for */
  }
}

/** How many this host has been paid for. */
async function paidFor(env: Env, hostId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM invites WHERE host_id = ?1 AND paid_at IS NOT NULL`,
  )
    .bind(hostId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** What the friends screen draws its card from. */
export async function standing(env: Env, caller: Caller): Promise<InviteStanding> {
  let paid = 0;
  try {
    paid = await paidFor(env, caller.id);
  } catch {
    /* an unreadable count is a card that says nothing has been paid yet */
  }
  return { paid, cap: INVITE_CAP, coins: INVITE_COINS, matches: INVITE_MATCHES };
}

/** Hand one player their fifty, out of nowhere rather than out of a match. */
async function pay(env: Env, id: string, coins: number): Promise<void> {
  await change(env, { id, name: '' }, (held) => ({
    ok: true,
    held: { ...held, granted: held.granted + coins },
  }));
}

/**
 * A match was banked for this player. If they arrived on somebody's code and
 * have now played enough, pay the pair.
 *
 * Called from both places a match is banked -- the submission route and the
 * duel object -- and cheap for the overwhelming majority of players, who have
 * no unpaid invitation and cost one indexed lookup that finds nothing.
 */
export async function settle(env: Env, caller: Caller): Promise<void> {
  try {
    const row = await env.DB.prepare(
      `SELECT host_id FROM invites WHERE friend_id = ?1 AND paid_at IS NULL`,
    )
      .bind(caller.id)
      .first<{ host_id: string }>();
    if (!row) return;

    const played = await env.DB.prepare(`SELECT matches FROM players WHERE id = ?1`)
      .bind(caller.id)
      .first<{ matches: number }>();
    if ((played?.matches ?? 0) < INVITE_MATCHES) return;

    if ((await paidFor(env, row.host_id)) >= INVITE_CAP) return;

    // Marked paid FIRST, and only paid if the mark took. Two matches landing
    // together would otherwise both read "unpaid" and both hand out the coins;
    // the WHERE clause is the lock, and `changes` says whether this call is the
    // one that won it.
    const marked = await env.DB.prepare(
      `UPDATE invites SET paid_at = ?2 WHERE friend_id = ?1 AND paid_at IS NULL`,
    )
      .bind(caller.id, Date.now())
      .run();
    if (!marked.meta.changes) return;

    // The host first: they are the one who did the inviting, and if only one of
    // the two payments can happen it should be theirs. Neither failure is worth
    // unwinding the mark -- an invitation paid once and badly is better than one
    // that can be claimed twice.
    await pay(env, row.host_id, INVITE_COINS);
    await pay(env, caller.id, INVITE_COINS);
  } catch {
    /* the match is banked either way */
  }
}
