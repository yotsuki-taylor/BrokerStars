/**
 * What a player is allowed to send the developers, agreed on by both ends.
 *
 * The same bargain every `protocol.ts` in here makes: the rules are one module
 * that the game and the Worker both import, so the box in the settings sheet
 * and the check behind `/feedback` cannot drift into disagreeing about what a
 * message is. The client greys its button on exactly the rule the server would
 * have refused it on, which is why nobody ever types a report and is told
 * afterwards that it was too short.
 *
 * Delivery is NOT here and cannot be: `worker/src/feedback.ts` is the only end
 * that knows where a report goes, and the browser is deliberately never told.
 */

/**
 * Length limits, both ends, and both are about the same thing: a message a
 * person actually wrote.
 *
 * The floor is the real filter. Google Play's pre-launch crawler walks every
 * button in the app on every upload — it is what was filling the group chat
 * before `mayShout` closed that door (`worker/src/chat.ts`) — and it will find
 * this box too. A robot taps; typing a sentence is a different thing.
 */
export const MIN_FEEDBACK = 10;
export const MAX_FEEDBACK = 1000;
/** Enough for any address a person actually has. */
export const MAX_REPLY_TO = 120;

/**
 * How long one player waits before the channel hears from them again.
 *
 * Shorter than the chat's ten minutes (`worker/src/chat.ts`) on purpose: that
 * cooldown guards a room full of other people, and this one guards a private
 * inbox. Somebody who has just reported a crash and immediately remembers the
 * other half of it should not be made to wait out a coffee break.
 */
export const FEEDBACK_COOLDOWN = 2 * 60 * 1000;

/** Why a report did not go. Every one of them is a sentence the panel draws. */
export type FeedbackError =
  | 'noserver'
  | 'empty'
  | 'short'
  | 'long'
  | 'wait'
  | 'refused'
  | 'failed';

/** The message as it will be sent, or the reason it will not be. */
export type Cleaned =
  | { ok: true; text: string; replyTo: string }
  | { ok: false; reason: 'empty' | 'short' | 'long' };

/**
 * Trimmed first and measured after: a box full of newlines is an empty message
 * that happens to be long, and the floor exists to catch exactly that.
 */
export function cleanFeedback(rawText: unknown, rawReplyTo: unknown): Cleaned {
  const text = String(rawText ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length < MIN_FEEDBACK) return { ok: false, reason: 'short' };
  if (text.length > MAX_FEEDBACK) return { ok: false, reason: 'long' };
  // Never validated as an address, and deliberately. It is optional, it is only
  // ever read by a human deciding whether to answer, and a regex that rejects
  // somebody's perfectly good address is worse than a line of nonsense in a
  // message that is being read anyway.
  const replyTo = String(rawReplyTo ?? '')
    .trim()
    .slice(0, MAX_REPLY_TO);
  return { ok: true, text, replyTo };
}

/**
 * How much of the cooldown started at `lastAt` is left. A player who has never
 * written is `lastAt` of 0 — a moment in 1970, and so never still waiting, so
 * the missing row and the very old row are one answer rather than two cases.
 *
 * The same shape as `stillWaiting` in the chat, and kept separate from it: two
 * cooldowns that happen to be spelled alike are not one cooldown, and sharing
 * the function would tie the next change to one of them to the other.
 */
export const stillWaiting = (lastAt: number, now: number): number =>
  Math.max(0, lastAt + FEEDBACK_COOLDOWN - now);

/** What the client may say about itself. All of it unverified, all of it hints. */
export interface About {
  /** 'telegram' | 'android' | 'web', as `src/platform` spells them */
  platform: string;
  /** the build, when the build knows its own number */
  version: string;
  /** the language the game is being read in */
  lang: string;
}

export function cleanAbout(raw: unknown): About {
  const src = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) =>
    String(v ?? '')
      .trim()
      .slice(0, n);
  return {
    platform: str(src.platform, 16),
    version: str(src.version, 24),
    lang: str(src.lang, 16),
  };
}
