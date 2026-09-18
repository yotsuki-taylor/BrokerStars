/**
 * Whether this package is still one the server will talk to.
 *
 * WHAT THIS IS FOR. An Android package is the one copy of this game that can go
 * stale: it sits on a phone until somebody updates it, while the mini app and
 * the browser fetch the bundle from Pages at every launch and cannot be old.
 * When a build turns out to be wrong rather than merely previous, the server
 * raises `MIN_BUILD` (`worker/src/index.ts`) and anything below it puts up a
 * wall with one way out — the store listing.
 *
 * WHAT IT CANNOT DO, and it is worth knowing before trusting it: the answer
 * arrives over the network. A package that cannot reach the Worker at all never
 * asks and is never told, so this is no help for the failure it most looks like
 * it should cover — 1.1.1 shipped pointing at a developer's own machine and
 * would have sat there silent. `.env.android` is what stops that one. This is
 * for builds that are old, not for builds that are deaf.
 *
 * Nor can it reach backwards: a package built before this file existed has no
 * code to put a wall up with. The floor protects the releases after it and
 * nothing before, which is a reason to keep the number at zero until there is a
 * specific build worth naming.
 *
 * FAILURE IS ALWAYS "CARRY ON". Every unknown here — no server configured, a
 * request that did not answer, a version string that would not parse — reads as
 * "not blocked". A wall thrown up because a fetch timed out would be a game
 * that stops working when the network hiccups, which is a worse bug than the
 * one being defended against.
 */

import { platform } from '../platform';

/** The build, put there by Vite out of `build.gradle`. See vite.config.ts. */
const BUILD_VERSION = typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : '';

/** Read the same way `ui/api.ts` reads it, and not imported from there: that
 *  module is the whole wire protocol and this is one number on one route. */
const BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/**
 * This package's `versionCode`, out of the `1.1.2+22` the bundle carries.
 *
 * Null when there is no number to read — a web build whose gradle file could
 * not be read at build time carries a bare name or an empty string, and a
 * missing number must never read as zero: zero is below every floor, so a
 * parse failure would wall off exactly the builds that know least about
 * themselves.
 */
export function codeOf(version: string): number | null {
  const plus = version.lastIndexOf('+');
  if (plus < 0) return null;
  const tail = version.slice(plus + 1);
  if (!/^\d+$/.test(tail)) return null;
  const code = Number(tail);
  return Number.isSafeInteger(code) ? code : null;
}

export const buildCode = (): number | null => codeOf(BUILD_VERSION);

/**
 * The decision itself, with both numbers already in hand.
 *
 * Separate from everything that has to go and ask, because this is the part
 * with a rule in it: either number being unknown means the game carries on.
 */
export const blocked = (mine: number | null, min: number | null): boolean =>
  mine !== null && min !== null && mine < min;

/** What the server will still talk to, or null if it did not say. */
export async function fetchMinBuild(): Promise<number | null> {
  if (!BASE) return null;
  try {
    const answer = await fetch(`${BASE}/health`);
    if (!answer.ok) return null;
    const body = (await answer.json()) as { minBuild?: unknown };
    const min = Number(body?.minBuild);
    return Number.isInteger(min) && min >= 0 ? min : null;
  } catch {
    return null;
  }
}

/**
 * Should this package stop and ask to be updated?
 *
 * The platform is checked first and on this side of the network, so a browser
 * and a mini app never make the request at all: they cannot be stale, and a
 * call whose answer can only ever be "no" is a call not worth making.
 */
export async function mustUpdate(): Promise<boolean> {
  if (platform().id !== 'android') return false;
  const mine = buildCode();
  if (mine === null) return false;
  return blocked(mine, await fetchMinBuild());
}

/** Where a player goes to get the new one. */
export const STORE_URL = 'https://play.google.com/store/apps/details?id=com.brokerstars.game';

export function openStore(): void {
  platform().openLink(STORE_URL);
}
