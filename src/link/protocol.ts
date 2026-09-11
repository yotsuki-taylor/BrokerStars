/**
 * Linking two ways in to one player, and the shapes both ends agree on.
 *
 * Somebody who has been playing in Telegram installs the Android app, signs in
 * with Google, and finds an empty office — two accounts, two ids, and nothing
 * saying they are the same person. Linking is what says it.
 *
 * HOW IT IS PROVED. Not by claiming: by holding both. The account keeping its
 * save mints a code, the account joining it types the code in, and the server
 * has seen two signatures rather than one assertion. Which is why the code is
 * short-lived and why there is only ever one of them — for as long as it
 * exists, it is a password to somebody's save file.
 *
 * The direction is one-way on purpose: a Google account joins a Telegram one,
 * never the reverse. `worker/migrations/010-identities.sql` says why.
 */

/** Long enough not to be guessed inside its lifetime, short enough to dictate. */
export const LINK_CODE_LENGTH = 8;

/**
 * How long a code stands. Ten minutes: this is a thing somebody reads off one
 * screen and types into another on the same table, and every minute past that
 * is a minute it can be used by whoever else has seen it.
 */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Base32 without vowels, the same alphabet duel codes and friend codes use, and
 * spelled out here rather than imported for the same reason those two spell it
 * out separately: no feature should be holding another's definition of what a
 * code may contain.
 */
const CODE = /^[0-9bcdfghjklmnpqrstvwxyz]{4,32}$/;

/** A code as it can be trusted, or null. Case and stray spaces are forgiven. */
export function cleanLinkCode(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return CODE.test(s) ? s : null;
}

/**
 * Why a link did not happen. Each of these is a different sentence to a player
 * and none of them is a bug:
 *
 *   nosuch   — the code is not one that was minted, or it has expired
 *   self     — both ends are the same account already
 *   busy     — the joining account has a game of its own; see below
 *   already  — one of the two is linked to something already
 *   noserver — this deployment cannot link anything
 */
export type LinkError = 'nosuch' | 'self' | 'busy' | 'already' | 'noserver';

/**
 * Whether this player is linked, and to what.
 *
 * `code` is present only just after one was minted. `linked` is the state the
 * settings screen draws.
 */
export interface LinkState {
  linked: boolean;
  /** a freshly minted code, for the side that is being joined */
  code: string | null;
  expiresAt: number | null;
}

export function cleanLinkState(raw: unknown): LinkState | null {
  const r = raw as Record<string, unknown> | null;
  if (!r) return null;
  const code = cleanLinkCode(r.code);
  const expiresAt = Math.floor(Number(r.expiresAt));
  const alive = code && Number.isFinite(expiresAt) && expiresAt > Date.now();
  return {
    linked: r.linked === true,
    code: alive ? code : null,
    expiresAt: alive ? expiresAt : null,
  };
}
