import { describe, expect, it } from 'vitest';
import { SHOUT_COOLDOWN, chatAvailable, stillWaiting } from '../src/chat';
import type { Env } from '../src/results';

/**
 * The one route in this game that makes the bot speak in a room full of
 * people. Everything worth testing about it is the two rules that decide
 * whether it will: whether there is a chat at all, and whether this player has
 * used their turn. The message itself is in `bot.test.ts`.
 */

const env = (over: Partial<Env> = {}) => over as Env;
const NOW = 1_700_000_000_000;

describe('shouting into the chat', () => {
  it('is off entirely without a chat to shout into or a bot to say it', () => {
    expect(chatAvailable(env({ BOT_TOKEN: 't', CHAT_ID: '-100123' }))).toBe(true);
    // Somebody else's deployment: the route says so and the game never draws
    // the button, rather than offering one that cannot work.
    expect(chatAvailable(env({ BOT_TOKEN: 't' }))).toBe(false);
    expect(chatAvailable(env({ CHAT_ID: '-100123' }))).toBe(false);
    expect(chatAvailable(env())).toBe(false);
  });

  it('lets a player who has never shouted go straight ahead', () => {
    // No row is a `last_at` of 0, and 1970 is not still waiting — the missing
    // row needs no case of its own.
    expect(stillWaiting(0, NOW)).toBe(0);
  });

  it('holds the door for the rest of the cooldown and then opens it', () => {
    expect(stillWaiting(NOW, NOW)).toBe(SHOUT_COOLDOWN);
    expect(stillWaiting(NOW - SHOUT_COOLDOWN / 2, NOW)).toBe(SHOUT_COOLDOWN / 2);
    expect(stillWaiting(NOW - SHOUT_COOLDOWN, NOW)).toBe(0);
    expect(stillWaiting(NOW - SHOUT_COOLDOWN * 10, NOW)).toBe(0);
  });

  it('never counts backwards, whatever the clocks are doing', () => {
    // A row written by a server whose clock was ahead is a wait that has not
    // started yet, not a negative number handed to a screen to render.
    expect(stillWaiting(NOW + SHOUT_COOLDOWN, NOW)).toBeGreaterThan(0);
    expect(stillWaiting(0, 0)).toBeGreaterThanOrEqual(0);
  });
});
