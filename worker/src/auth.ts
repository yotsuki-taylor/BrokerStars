/**
 * Telling who is asking, when the answer is no longer "Telegram said so".
 *
 * The game used to have exactly one door, and `telegram.ts` was the lock on it:
 * every write arrived with an `initData` string Telegram had HMAC'd over the bot
 * token. An Android build has no Telegram to sign anything, so there is a second
 * door now, and this file is where both are answered with the same `Caller`.
 *
 * Token shapes are told apart by their first characters, not by a flag the
 * client sets — a client that could pick which check to face would pick the
 * weakest one. A token starting `bs1.` is a session this Worker minted itself,
 * and is the only thing the Android build ever sends on an ordinary request;
 * anything else is Telegram's initData, checked exactly as it always was.
 *
 * A Google ID token is neither, and is deliberately not accepted here. It goes
 * to `/auth/google` once, is traded for a session, and never appears again —
 * see `mintSession` for why that trade is worth making.
 *
 * IDS ARE NAMESPACED, and the namespace is the whole of the migration. Telegram
 * ids stay exactly as they are: bare digits, the same strings already sitting in
 * `players.id` and `profiles.id`, so not one existing player loses anything.
 * Google ids arrive prefixed `g:`, which no Telegram id can collide with because
 * Telegram ids are numbers. Two kinds of player, one database, no migration.
 */

import type { Env } from './results';
import type { Caller } from './telegram';
import { verifyInitData } from './telegram';
import { b64urlDecode, b64urlEncode, b64urlText, hex, hmacSha256, sameSignature } from './crypto';

const enc = new TextEncoder();

/* --------------------------------------------------------------- sessions */

/**
 * How long a session is good for.
 *
 * Long, on purpose. A Google ID token expires in about an hour, and a game that
 * woke the Credential Manager every hour to read a leaderboard would be a game
 * that keeps asking permission to be played. The client signs in once, keeps
 * this, and goes back to Google only when the Worker finally refuses it.
 */
const SESSION_DAYS = 180;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** What every minted token starts with, and how `identify` knows it is one. */
const SESSION_PREFIX = 'bs1.';

interface SessionBody {
  /** the namespaced player id */
  i: string;
  /** display name at sign-in, refreshed whenever they sign in again */
  n: string;
  /** minted at, epoch ms */
  t: number;
}

/**
 * Sign a session for somebody Google has just vouched for.
 *
 * Our own token rather than Google's passed around, and three things fall out
 * of that — all three being the reason:
 *
 *   The client keeps a string and sends it, exactly as it sent `initData`. No
 *   call site above this file learns that a second kind of player exists.
 *
 *   Checking it is arithmetic, not a network call. Verifying a Google token
 *   means fetching Google's keys, and doing that on every trade of every share
 *   would put Google in the path of the game.
 *
 *   It expires on our terms rather than on Google's hour.
 */
export async function mintSession(caller: Caller, secret: string): Promise<string> {
  const body: SessionBody = { i: caller.id, n: caller.name, t: Date.now() };
  const payload = b64urlEncode(enc.encode(JSON.stringify(body)));
  const sig = hex(await hmacSha256(enc.encode(secret), payload));
  return `${SESSION_PREFIX}${payload}.${sig}`;
}

/** The same check backwards. Null for anything not signed by us, or gone stale. */
export async function readSession(token: string, secret: string): Promise<Caller | null> {
  if (!token.startsWith(SESSION_PREFIX)) return null;
  const rest = token.slice(SESSION_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot < 1) return null;

  const payload = rest.slice(0, dot);
  const given = rest.slice(dot + 1);
  const mine = hex(await hmacSha256(enc.encode(secret), payload));
  if (!sameSignature(mine, given)) return null;

  const text = b64urlText(payload);
  if (!text) return null;
  try {
    const body = JSON.parse(text) as Partial<SessionBody>;
    const id = String(body.i ?? '');
    const at = Number(body.t ?? 0);
    if (!id || !at) return null;
    if (Date.now() - at > SESSION_MS) return null;
    return { id, name: String(body.n ?? '').slice(0, 24) || 'PLAYER' };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- Google */

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/** Clocks disagree. A minute either way is not a forged token. */
const SKEW_SECONDS = 60;

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

/**
 * Google's signing keys, kept for the life of the isolate.
 *
 * They rotate, which is what the second look on an unknown `kid` is for: a key
 * id we have never seen is far likelier to be one minted since we last fetched
 * than an attacker's invention, and the signature check settles which it was.
 */
let keyCache: { at: number; keys: Map<string, CryptoKey> } | null = null;
const KEY_TTL_MS = 60 * 60 * 1000;

async function loadKeys(): Promise<void> {
  const fetched = await fetchGoogleKeys();
  if (fetched) keyCache = { at: Date.now(), keys: fetched };
}

async function googleKey(kid: string): Promise<CryptoKey | null> {
  const stale = !keyCache || Date.now() - keyCache.at > KEY_TTL_MS;
  if (stale) await loadKeys();
  const hit = keyCache?.keys.get(kid);
  if (hit) return hit;
  // not stale but not known either: the keys may have rotated since we looked
  if (!stale) await loadKeys();
  return keyCache?.keys.get(kid) ?? null;
}

async function fetchGoogleKeys(): Promise<Map<string, CryptoKey> | null> {
  try {
    const res = await fetch(GOOGLE_CERTS);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: Jwk[] };
    const out = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
      try {
        const key = await crypto.subtle.importKey(
          'jwk',
          { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        out.set(jwk.kid, key);
      } catch {
        /* a key we cannot import is a key we cannot verify with */
      }
    }
    return out.size ? out : null;
  } catch {
    return null;
  }
}

/**
 * Check a Google ID token and say who it is for.
 *
 * Every line here is a thing that has to be true, and each has been somebody's
 * breach: the algorithm is the one we expect and not `none`; the signature is
 * Google's; the issuer is Google; the audience is OUR client and not some other
 * application's, which is what stops a token minted for an unrelated app being
 * replayed at this one; and it has not expired.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<Caller | null> {
  if (!clientId) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSig] = parts;

  const headerText = b64urlText(rawHeader);
  if (!headerText) return null;
  let kid = '';
  try {
    const header = JSON.parse(headerText) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;
    kid = header.kid;
  } catch {
    return null;
  }

  const key = await googleKey(kid);
  if (!key) return null;

  const sigBytes = b64urlDecode(rawSig);
  if (!sigBytes) return null;

  const signed = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sigBytes as BufferSource,
    enc.encode(`${rawHeader}.${rawPayload}`),
  );
  if (!signed) return null;

  const payloadText = b64urlText(rawPayload);
  if (!payloadText) return null;
  try {
    const claims = JSON.parse(payloadText) as Record<string, unknown>;
    if (!GOOGLE_ISSUERS.includes(String(claims.iss))) return null;
    if (String(claims.aud) !== clientId) return null;
    const exp = Number(claims.exp ?? 0);
    if (!exp || exp + SKEW_SECONDS < Date.now() / 1000) return null;
    const sub = String(claims.sub ?? '');
    if (!sub) return null;
    // the given name reads like a player; the full one reads like a document
    const name = String(claims.given_name || claims.name || '').trim();
    return { id: `g:${sub}`, name: name.slice(0, 24) || 'PLAYER' };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- the door */

/**
 * Who is asking, from whatever they sent. Null means nobody, and every caller
 * treats null exactly as it always treated a bad signature.
 *
 * Fails closed on missing configuration, as the old check did: a deployment
 * with no bot token cannot tell a Telegram player from a curl, and one with no
 * session secret cannot tell an Android player from one either.
 */
export async function identify(token: string, env: Env): Promise<Caller | null> {
  if (!token) return null;
  if (token.startsWith(SESSION_PREFIX)) {
    return env.SESSION_SECRET ? readSession(token, env.SESSION_SECRET) : null;
  }
  return env.BOT_TOKEN ? verifyInitData(token, env.BOT_TOKEN) : null;
}

/** Where a player's id came from, for the places that have to care. */
export const isGoogle = (id: string): boolean => id.startsWith('g:');
