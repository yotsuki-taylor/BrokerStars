/**
 * What a player wanted to say, and how it reaches somebody who can act on it.
 *
 * The settings sheet grows a row that opens a box to type in. This is the far
 * end of it: who may send, the cooldown that stops one player filling the
 * channel, and the delivery. What counts as a message at all is the rules both
 * ends share (`src/feedback/protocol.ts`), so the client greys its button on
 * exactly the condition this would have refused it on.
 *
 * WHERE IT GOES, AND WHY THE GAME NEVER SAYS SO. Today the bot carries the
 * report to `ADMIN_ID` in a private chat, because that costs nothing and works
 * with what this Worker already has. The stated destination is
 * `brokerstarsupport@gmail.com`, and it will be, the day there is something to
 * send mail with — a Cloudflare `send_email` binding needs a domain on
 * Cloudflare, and this deployment is a `github.io` page in front of a
 * `workers.dev` Worker, so it will take an outside sender and a key.
 *
 * So the button in the game names no channel at all. A player does not care
 * which inbox their bug report lands in, they care that somebody reads it; and
 * a button that said "write to us by email" while the text went to Telegram
 * would be a lie told to the person doing you a favour. When the mail goes in
 * it goes in HERE, in `deliver` below, and not one string in the client changes.
 *
 * NOTHING IS STORED. The message is read off the request, put into a Telegram
 * message and forgotten; there is no table of what players have written, so
 * there is no row to leak, to hand over, or to forget to delete when somebody
 * deletes their account. The one thing written down is a timestamp saying
 * somebody sent SOMETHING, which is the cooldown below and carries no word of
 * theirs.
 *
 * The price of that is real and is paid in the open: if Telegram refuses, the
 * report is gone and the player is told so while their text is still in the box
 * for them to send again. A queue would fix that and would be a table of
 * everybody's complaints, which is the thing being avoided.
 */

import { cleanAbout, stillWaiting, type About } from '../../src/feedback/protocol';
import { isGuest } from './auth';
import { sendMessage } from './telegram';
import type { Caller } from './telegram';
import type { Env } from './results';

export { cleanAbout };
export type { About };

/**
 * WHY THIS IS NOT `mayShout`, WHICH REFUSES GUESTS OUTRIGHT.
 *
 * The chat rule is right for the chat: writing into a room of real people under
 * no name at all is worth giving up, and refusing guests shut the Play crawler
 * out as a side effect. Neither half of that argument survives the move here.
 *
 * There is no room — this lands in the developer's own inbox, where a handful
 * of junk messages per release is an annoyance rather than a harm. And the
 * player most likely to have something worth hearing is the one who hit a bug
 * in their first two minutes, before it ever occurred to them to sign in.
 * Closing the bug report to the people most likely to file one, to save
 * yourself five messages a month, is the wrong side of that trade.
 *
 * So guests may write, and the report says they are one (`feedbackMessage`), so
 * that what the crawler sends is obvious at a glance instead of anonymous.
 */
export const mayWrite = (): boolean => true;

/** Whether this deployment has anywhere to deliver a report at all. */
export const feedbackAvailable = (env: Env): boolean => Boolean(env.BOT_TOKEN && env.ADMIN_ID);

export async function waitLeft(env: Env, playerId: string, now: number): Promise<number> {
  const row = await env.DB.prepare(`SELECT last_at FROM feedback_sent WHERE player_id = ?1`)
    .bind(playerId)
    .first<{ last_at: number }>();
  return stillWaiting(row?.last_at ?? 0, now);
}

/**
 * Remember that they wrote. Only after the message has landed, as `markShout`
 * is: a cooldown charged for a report nobody received is a bug the player
 * cannot see and cannot explain.
 */
export async function markWrite(env: Env, playerId: string, now: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO feedback_sent (player_id, last_at) VALUES (?1, ?2)
     ON CONFLICT(player_id) DO UPDATE SET last_at = ?2`,
  )
    .bind(playerId, now)
    .run();
}

/**
 * The report, as a Telegram message.
 *
 * Plain text and no parse mode, which is the one detail here that is load
 * bearing: the body is a stranger's text, and handing a stranger's text to
 * Telegram as Markdown or HTML is either a broken message the moment somebody
 * types an underscore, or an injection into the developer's own chat. Nothing
 * is escaped because nothing needs to be.
 *
 * The header exists so that what the crawler sends can be told from what a
 * person sends without reading either: a guest on Android, no version, no reply
 * address, twice a release, is the robot.
 */
export function feedbackMessage(
  caller: Pick<Caller, 'id' | 'name'>,
  text: string,
  replyTo: string,
  about: About,
): Record<string, unknown> {
  const who = [
    caller.name || 'no name',
    caller.id,
    isGuest(caller.id) ? 'GUEST' : 'signed in',
    about.platform || 'unknown host',
    about.version && `v${about.version}`,
    about.lang,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = ['FEEDBACK', who, replyTo ? `reply to: ${replyTo}` : 'no reply address', '', text].join(
    '\n',
  );

  return { text: body, disable_web_page_preview: true };
}

/**
 * Carry it. True when it landed somewhere a person will see it.
 *
 * THE ONE FUNCTION THE EMAIL GOES IN. Everything either side of it — the box,
 * the route, the cooldown, the strings — is already the shape it will be; this
 * is where a second delivery is added, or where Telegram is replaced by a mail
 * sender once there is one. Keeping it a function of its own rather than four
 * lines inside the route is the whole reason that change will be small.
 */
export async function deliver(
  env: Env,
  caller: Pick<Caller, 'id' | 'name'>,
  text: string,
  replyTo: string,
  about: About,
): Promise<boolean> {
  return sendMessage(
    String(env.BOT_TOKEN),
    String(env.ADMIN_ID),
    feedbackMessage(caller, text, replyTo, about),
  );
}
