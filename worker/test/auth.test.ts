import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { identify, mintSession, readSession, verifyGoogleIdToken } from '../src/index';
import type { Env } from '../src/index';

/**
 * The second door into the game, tested the way the first one is: by building
 * real tokens the way the thing that mints them builds them, so a mistake in a
 * check shows up as a test that passes when it should not.
 *
 * The Google half signs with a genuine RSA key generated here and serves it
 * back through a stubbed key endpoint. Nothing is mocked on the checking side —
 * `verifyGoogleIdToken` does the same work against these tokens that it will do
 * against Google's.
 */

const SECRET = 'session-secret-for-tests';
const CLIENT_ID = '1234.apps.googleusercontent.com';
const KID = 'test-key-1';

const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64urlJson = (value: unknown): string => b64url(enc.encode(JSON.stringify(value)));

let keys: CryptoKeyPair;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  publicJwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey;
});

/** Google's certs endpoint, answering with the key these tokens are signed by. */
function serveKeys(): void {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      keys: [{ kid: KID, kty: 'RSA', alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
    }),
  );
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

/** A token shaped and signed exactly as Google shapes and signs one. */
async function googleToken(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const h = b64urlJson({ alg: 'RS256', kid: KID, typ: 'JWT', ...header });
  const p = b64urlJson({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '900719925474099',
    given_name: 'Masha',
    name: 'Masha Fomina',
    exp: future(),
    ...claims,
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a session this Worker minted', () => {
  it('reads back the player it was minted for', async () => {
    const token = await mintSession({ id: 'g:42', name: 'Masha' }, SECRET);
    expect(token.startsWith('bs1.')).toBe(true);
    expect(await readSession(token, SECRET)).toEqual({ id: 'g:42', name: 'Masha' });
  });

  it('is refused under a different key', async () => {
    const token = await mintSession({ id: 'g:42', name: 'Masha' }, SECRET);
    expect(await readSession(token, 'some other secret')).toBeNull();
  });

  it('is refused when the payload is edited', async () => {
    const token = await mintSession({ id: 'g:42', name: 'Masha' }, SECRET);
    const [prefix, payload, sig] = [token.slice(0, 4), ...token.slice(4).split('.')];
    // somebody promoting themselves to another player's id
    const forged = b64urlJson({ i: 'g:1', n: 'Masha', t: Date.now() });
    expect(await readSession(`${prefix}${forged}.${sig}`, SECRET)).toBeNull();
    // and the untouched one still works, so the test is about the edit
    expect(await readSession(`${prefix}${payload}.${sig}`, SECRET)).not.toBeNull();
  });

  it('goes stale eventually', async () => {
    const token = await mintSession({ id: 'g:42', name: 'Masha' }, SECRET);
    const almost = Date.now() + 179 * 24 * 60 * 60 * 1000;
    vi.setSystemTime(almost);
    expect(await readSession(token, SECRET)).not.toBeNull();
    vi.setSystemTime(almost + 2 * 24 * 60 * 60 * 1000);
    expect(await readSession(token, SECRET)).toBeNull();
    vi.useRealTimers();
  });

  it('is not something else wearing the prefix', async () => {
    for (const junk of ['bs1.', 'bs1.x', 'bs1..', 'bs1.abc.def', '']) {
      expect(await readSession(junk, SECRET)).toBeNull();
    }
  });
});

describe('a Google ID token', () => {
  it('names the player it was issued for, under the g: namespace', async () => {
    serveKeys();
    const caller = await verifyGoogleIdToken(await googleToken(), CLIENT_ID);
    expect(caller).toEqual({ id: 'g:900719925474099', name: 'Masha' });
  });

  it('is refused when it was minted for another application', async () => {
    serveKeys();
    const token = await googleToken({ aud: 'somebody-elses-app.apps.googleusercontent.com' });
    expect(await verifyGoogleIdToken(token, CLIENT_ID)).toBeNull();
  });

  it('is refused when it has expired', async () => {
    serveKeys();
    const token = await googleToken({ exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await verifyGoogleIdToken(token, CLIENT_ID)).toBeNull();
  });

  it('is refused when it did not come from Google', async () => {
    serveKeys();
    const token = await googleToken({ iss: 'https://accounts.example.com' });
    expect(await verifyGoogleIdToken(token, CLIENT_ID)).toBeNull();
  });

  it('is refused when the claims were edited after signing', async () => {
    serveKeys();
    const token = await googleToken();
    const [h, , s] = token.split('.');
    const swapped = b64urlJson({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'somebody-else',
      exp: future(),
    });
    expect(await verifyGoogleIdToken(`${h}.${swapped}.${s}`, CLIENT_ID)).toBeNull();
  });

  it('refuses an unsigned token however politely it asks', async () => {
    serveKeys();
    // the classic: a header claiming there is no algorithm to check
    const token = await googleToken({}, { alg: 'none' });
    expect(await verifyGoogleIdToken(token, CLIENT_ID)).toBeNull();
  });

  it('refuses everything when no client id is configured', async () => {
    serveKeys();
    expect(await verifyGoogleIdToken(await googleToken(), '')).toBeNull();
  });
});

describe('the door', () => {
  const env = (over: Partial<Env> = {}) =>
    ({ SESSION_SECRET: SECRET, BOT_TOKEN: '123456:AAHfake', ...over }) as Env;

  it('lets a session through', async () => {
    const token = await mintSession({ id: 'g:42', name: 'Masha' }, SECRET);
    expect(await identify(token, env())).toEqual({ id: 'g:42', name: 'Masha' });
  });

  it('refuses a session when this deployment signs none', async () => {
    const token = await mintSession({ id: 'g:42', name: 'Masha' }, SECRET);
    expect(await identify(token, env({ SESSION_SECRET: undefined }))).toBeNull();
  });

  it('refuses a Google token sent where a session belongs', async () => {
    // /auth/google is the only route that takes one, and this is why: a client
    // must not get to pick which of two checks it faces
    serveKeys();
    expect(await identify(await googleToken(), env())).toBeNull();
  });

  it('refuses nothing at all', async () => {
    expect(await identify('', env())).toBeNull();
  });

  it('still sends anything else to the Telegram check', async () => {
    // not signed by the bot token, so it fails -- but it fails THERE, which is
    // what keeps every existing Telegram player working unchanged
    expect(await identify('auth_date=1&hash=deadbeef', env())).toBeNull();
  });
});
