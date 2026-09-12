/**
 * What a friend is, on both sides of the wire.
 *
 * The client reads this from `src/ui/friends.ts` and the Worker from
 * `worker/src/friends.ts`, so the shape is written once and a change to it
 * breaks the build on both ends rather than in production — the same bargain
 * `src/duel/protocol.ts` and `src/market/protocol.ts` strike.
 *
 * The whole of the feature is two facts kept on the server: a code that stands
 * for one player, and a list of pairs. A friend code is NOT an invitation in
 * the sense a duel code is — it does not expire, it is not consumed, and the
 * same link can be sent to a whole group chat. That is deliberate. An
 * invitation that has to be minted for every friend is a round trip and a
 * countdown for something nobody is waiting on; a duel needs both because a
 * duel is a seat somebody is standing beside.
 *
 * What that costs: anybody holding the link can become your friend, and being
 * somebody's friend buys them a line in a list and nothing else — no messages,
 * no notifications, nothing that can be spent. The code can be reissued by
 * hand if one ever needs to be; see `worker/src/friends.ts`.
 */

import { cleanOutfit, cleanRoom } from '../profile/protocol';
import type { Outfit } from '../ui/wardrobe';

/** A code is this long. Sixty bits, the same as a duel's, and never a word. */
export const FRIEND_CODE_LENGTH = 10;

/** More than anybody will meet, and a bound on the list query. */
export const MAX_FRIENDS = 200;

/**
 * Base32 without vowels, so no code can spell anything and none of the pairs a
 * phone keyboard confuses are both in the alphabet — the same alphabet duel
 * codes use, for the same reasons, spelled out here rather than imported so
 * that neither feature is holding the other's definition.
 */
const CODE = /^[0-9bcdfghjklmnpqrstvwxyz]{4,32}$/;

/** A code as it can be trusted, or null. Case and stray spaces are forgiven. */
export function cleanCode(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return CODE.test(s) ? s : null;
}

/**
 * One line of the list, and everything a visit to them draws.
 *
 * The room and the clothes ride along with the list rather than being fetched
 * when a friend is actually visited. Two reasons. They come out of the same
 * query — `profiles` is one more LEFT JOIN beside the one the list already
 * makes — so they cost nothing to send; and a visit is then instant, with no
 * spinner over a picture of somebody's bedroom. Neither is a secret: they are
 * what the friend is showing anybody who opens their door.
 */
export interface Friend {
  id: string;
  name: string;
  /** coins EARNED, the same number the rating ranks on */
  coins: number;
  matches: number;
  /** how far their renovation has got — see `src/ui/renovation.ts` */
  room: number;
  outfit: Outfit;
}

/** Why an attempt to add somebody came to nothing. */
/**
 * What an invitation pays, and how many times.
 *
 * Fifty is exactly the first rung of any slot (`ui/wardrobe.ts`), which is what
 * makes the offer nameable: a friend buys you a piece of clothing, not a
 * number. It is about a day and a half of ordinary play -- worth sending a
 * link for, and small enough not to compress the wardrobe's three-to-seven
 * month horizon, which is deliberate and documented where the prices are.
 *
 * THE CAP IS THE REAL DEFENCE, not the threshold below it. Guest sessions are
 * handed to anybody who asks, for free and without proof of anything -- that is
 * what makes an invitation work outside Telegram at all -- so a reward for
 * bringing somebody in can always be farmed by bringing in nobody. Five paid
 * invitations is 250 coins, about three per cent of the wardrobe, which is a
 * small enough ceiling that the farming is not worth the trouble. Nothing here
 * pretends to make it impossible.
 */
export const INVITE_COINS = 50;
export const INVITE_CAP = 5;

/**
 * How many matches the invited friend has to finish before either of them is
 * paid.
 *
 * Not a wall, a toll: the server refuses two results from the same player
 * inside forty-five seconds, so three of them is a minute and a half that
 * cannot be scripted away. Three is also about the point where somebody has
 * actually seen the game rather than opened it.
 */
export const INVITE_MATCHES = 3;

/** How an invitation is going, for the screen that offers it. */
export interface InviteStanding {
  /** invitations paid for so far */
  paid: number;
  /** and the most that ever will be */
  cap: number;
  /** what each side gets, each time */
  coins: number;
  /** matches the friend must finish first */
  matches: number;
}

export type FriendError = 'nosuch' | 'yourself' | 'full';

/** The answer to every route here: the list as it stands afterwards. */
export interface FriendList {
  /** the caller's own code, minted the first time they ask */
  code: string;
  /** the t.me link to send, or null when the server could not name its bot */
  link: string | null;
  /**
   * The same invitation as an ordinary web address, or null when the server
   * does not know where the game is served from.
   *
   * Both exist because they are good at different things. Inside Telegram the
   * bot link is the better door — it opens for somebody who has never started
   * the mini app. Anywhere else it is the wrong one entirely: a phone with the
   * Android app and no Telegram cannot follow it. See `linkToShare` in
   * src/ui/duel.ts, which is the one place that chooses.
   */
  webLink: string | null;
  friends: Friend[];
  /**
   * How the invitation offer stands. Null from a server that has not been
   * redeployed yet, which is a screen that simply does not draw the card.
   */
  invite: InviteStanding | null;
}

const str = (v: unknown, max: number): string => String(v ?? '').slice(0, max);
const num = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Nothing off the wire is believed, here as everywhere else. */
export function cleanFriends(raw: unknown): Friend[] {
  if (!Array.isArray(raw)) return [];
  const out: Friend[] = [];
  for (const item of raw.slice(0, MAX_FRIENDS)) {
    const r = item as Record<string, unknown>;
    const id = str(r?.id, 32);
    if (!id) continue;
    out.push({
      id,
      name: str(r?.name, 24) || 'PLAYER',
      coins: num(r?.coins),
      matches: num(r?.matches),
      // Both through the profile's own cleaners: a room past the last step or
      // a rarity that does not exist would be a friend whose door opens on a
      // broken picture.
      room: cleanRoom(r?.room),
      outfit: cleanOutfit(r?.outfit),
    });
  }
  return out;
}

/** The whole answer, or null when what came back was not one. */
export function cleanList(raw: unknown): FriendList | null {
  const r = raw as Record<string, unknown> | null;
  const code = cleanCode(r?.code);
  if (!code) return null;
  const link = typeof r?.link === 'string' && r.link ? r.link.slice(0, 200) : null;
  // A server that has not been redeployed yet sends no `webLink` at all, which
  // is null here and leaves the bot link as the only one there ever was.
  const webLink = typeof r?.webLink === 'string' && r.webLink ? r.webLink.slice(0, 200) : null;
  return { code, link, webLink, friends: cleanFriends(r?.friends), invite: cleanInvite(r?.invite) };
}

/**
 * The invitation standing, or null when the server said nothing about it.
 *
 * The numbers come back from the server rather than being read off the
 * constants above, because the server is the one that pays and a client whose
 * idea of the cap is out of date must not be the one drawing the bar. Clamped
 * anyway: a bar past its own end is worse than a wrong number.
 */
export function cleanInvite(raw: unknown): InviteStanding | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const cap = Math.max(0, Math.min(99, num(r.cap)));
  return {
    cap,
    paid: Math.max(0, Math.min(cap, num(r.paid))),
    coins: Math.max(0, Math.min(10_000, num(r.coins))),
    matches: Math.max(0, Math.min(99, num(r.matches))),
  };
}
