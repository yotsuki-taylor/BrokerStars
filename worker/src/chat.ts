/**
 * The game's group chat, and who is allowed to shout into it.
 *
 * A duel opened from the menu needs somebody on the other end of it, and a
 * player with an empty friends list has nobody to send the link to. So the
 * duel screen can have the bot call the duel out in the chat the friends menu
 * points everybody at — one message, a name, and a button that takes the first
 * person to tap it into that match.
 *
 * WHICH CHAT. `CHAT_ID` in `wrangler.toml`, and nothing happens without it:
 * every route below answers "not configured" and the button never appears in
 * the game. The id is not a secret — posting into a chat needs the bot's
 * token, which this is not — and it is a plain var beside `WEBAPP_URL` for the
 * same reason that one is: it names this deployment rather than protecting it.
 * Ask the bot `/chat` in the group to be told what it is.
 *
 * WHY THERE IS A COOLDOWN. This is the one place in the game where a tap on a
 * phone writes into a room full of other people, and a room full of other
 * people is exactly what a bored player will fill if nothing stops them. One
 * shout per player per ten minutes: enough that somebody who has waited out an
 * invitation can ask again, and little enough that the chat cannot be turned
 * into a wall of the same name. It is per PLAYER rather than per duel because
 * a duel costs nothing to open — counting invitations would be counting the
 * wrong thing.
 *
 * The table is one row per player and is written only by this file. It is not
 * part of the profile: what somebody has done to a chat is not something the
 * client should be told, be able to claim, or carry to another device.
 */

import { isGuest } from './auth';
import type { Env } from './results';

/** How long a player has to wait before the chat hears from them again. */
export const SHOUT_COOLDOWN = 10 * 60 * 1000;

/** Whether this deployment has a chat to shout into at all. */
export const chatAvailable = (env: Env): boolean =>
  Boolean(env.CHAT_ID && env.BOT_TOKEN);

/**
 * Who may make the bot speak in a room full of people: not a guest.
 *
 * WHY THE COOLDOWN BELOW WAS NEVER THE ANSWER. It counts per `player_id`, and
 * a guest id costs one request to `/auth/guest` and nothing else -- so every
 * shout came from an account that had never shouted, which is exactly the
 * state the cooldown lets through. It has been running for months and has
 * never once refused anybody.
 *
 * WHAT WAS ACTUALLY HAPPENING, because it was worth finding out before
 * building a defence against the wrong thing: nobody was abusing this. Every
 * one of those shouts was Google Play's pre-launch crawler, which installs the
 * app on several devices for every upload and walks every button it can find.
 * Caught in the act on 2026-09-14 -- `/duel/shout` from 66.249.84.138, an
 * `https://localhost` origin and a OnePlus 8 Pro that Google's test fleet is
 * made of. The signature fits every shout before it too: a brand new guest
 * each time, one match with the starting cash untouched because a robot taps
 * but does not trade, a shout ninety seconds to five minutes after the account
 * was born, and three of them inside three minutes when a report ran several
 * devices at once.
 *
 * So the rule is about identity rather than rate, and it closes the crawler out
 * as a side effect of closing out anonymity. A robot never signs in.
 *
 * THE COST IS REAL AND IS ACCEPTED. This button was built for the player with
 * nobody -- no friends on the list and no one to send a link to -- and a guest
 * on Android who has not signed in is exactly that player. They lose it until
 * they sign in. Writing into a room of real people under no name at all is the
 * thing being given up, and it is worth more than the convenience.
 */
export const mayShout = (playerId: string): boolean => !isGuest(playerId);

/**
 * The rule itself, with the database taken out of it: how long is left of the
 * cooldown that started at `lastAt`.
 *
 * A player who has never shouted is `lastAt` of 0, which is a moment in 1970
 * and so is never still waiting — the missing row and the very old row are the
 * same answer, and neither is a special case.
 */
export const stillWaiting = (lastAt: number, now: number): number =>
  Math.max(0, lastAt + SHOUT_COOLDOWN - now);

/**
 * How long this player still has to wait, in milliseconds, or 0 if they may
 * shout now.
 */
export async function waitLeft(env: Env, playerId: string, now: number): Promise<number> {
  const row = await env.DB.prepare(`SELECT last_at FROM chat_shouts WHERE player_id = ?1`)
    .bind(playerId)
    .first<{ last_at: number }>();
  return stillWaiting(row?.last_at ?? 0, now);
}

/**
 * Remember that they did. Written only after Telegram has said the message
 * landed: a cooldown charged for a message nobody ever saw would be a bug the
 * player has no way to explain.
 */
export async function markShout(env: Env, playerId: string, now: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO chat_shouts (player_id, last_at) VALUES (?1, ?2)
     ON CONFLICT(player_id) DO UPDATE SET last_at = ?2`,
  )
    .bind(playerId, now)
    .run();
}
