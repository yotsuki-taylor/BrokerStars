/**
 * The primitives two different signatures are checked with.
 *
 * `telegram.ts` checks an HMAC Telegram made over the bot token; `auth.ts`
 * checks one this Worker made itself, and an RSA signature Google made. They
 * share the arithmetic and, more to the point, they share the comparison:
 * there should be exactly one constant-time compare in a codebase, not one per
 * thing being compared, because the second copy is where somebody eventually
 * writes `===`.
 */

const enc = new TextEncoder();

export async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  message: string,
): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

export const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant time, because comparing a signature with === leaks it a byte at a time. */
export function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* --------------------------------------------------------------- base64url */

/**
 * What JWTs are spelled in: base64 with two characters swapped and the padding
 * left off. Every part of a Google ID token arrives this way, and so does every
 * part of the session token this Worker mints.
 */
export function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Null rather than a throw: every caller is deciding whether to trust a string. */
export function b64urlDecode(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function b64urlText(text: string): string | null {
  const bytes = b64urlDecode(text);
  return bytes ? new TextDecoder().decode(bytes) : null;
}
