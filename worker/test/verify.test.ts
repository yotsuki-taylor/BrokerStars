import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../src/index';

/**
 * The signature check is the whole security boundary: everything the board
 * writes goes through it. These build real Telegram init data the way Telegram
 * builds it, so a mistake in the check shows up as a test that passes when it
 * should not.
 */

const TOKEN = '123456:AAHfake-bot-token-for-tests';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}

/** Exactly what Telegram does, so the test is not just the code read twice. */
async function signed(fields: Record<string, string>, token = TOKEN): Promise<string> {
  const pairs = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`);
  const secret = await hmac(enc.encode('WebAppData'), token);
  const hash = hex(await hmac(secret, pairs.join('\n')));
  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

const now = () => Math.floor(Date.now() / 1000);
const user = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ id: 4242, first_name: 'Masha', username: 'masha', ...over });

describe('verifying who is calling', () => {
  it('accepts data Telegram really signed', async () => {
    const data = await signed({ auth_date: String(now()), query_id: 'x', user: user() });
    const caller = await verifyInitData(data, TOKEN);
    expect(caller).toEqual({ id: '4242', name: 'Masha' });
  });

  it('refuses data signed with a different token', async () => {
    const data = await signed({ auth_date: String(now()), user: user() }, 'someone-elses-token');
    expect(await verifyInitData(data, TOKEN)).toBeNull();
  });

  it('refuses data with a field changed after signing', async () => {
    const data = await signed({ auth_date: String(now()), user: user() });
    // the whole point: swap yourself for somebody else and the hash no longer fits
    const tampered = new URLSearchParams(data);
    tampered.set('user', user({ id: 9999 }));
    expect(await verifyInitData(tampered.toString(), TOKEN)).toBeNull();
  });

  it('refuses data with no hash at all', async () => {
    const params = new URLSearchParams({ auth_date: String(now()), user: user() });
    expect(await verifyInitData(params.toString(), TOKEN)).toBeNull();
  });

  it('refuses a session older than a day', async () => {
    const data = await signed({ auth_date: String(now() - 25 * 60 * 60), user: user() });
    expect(await verifyInitData(data, TOKEN)).toBeNull();
  });

  it('refuses a signature that is valid but carries no user', async () => {
    const data = await signed({ auth_date: String(now()), query_id: 'x' });
    expect(await verifyInitData(data, TOKEN)).toBeNull();
  });

  it('falls back to the username, and to something, for a nameless account', async () => {
    const noFirst = await signed({ auth_date: String(now()), user: user({ first_name: '' }) });
    expect((await verifyInitData(noFirst, TOKEN))?.name).toBe('masha');
    const nameless = await signed({
      auth_date: String(now()),
      user: user({ first_name: '', username: '' }),
    });
    expect((await verifyInitData(nameless, TOKEN))?.name).toBe('PLAYER');
  });

  it('does not let a long name run away with the row', async () => {
    const data = await signed({ auth_date: String(now()), user: user({ first_name: 'x'.repeat(200) }) });
    expect((await verifyInitData(data, TOKEN))?.name.length).toBe(24);
  });

  it('survives junk without throwing', async () => {
    for (const junk of ['', 'hash=', 'not even pairs', '%%%', 'hash=abc&user=notjson']) {
      expect(await verifyInitData(junk, TOKEN)).toBeNull();
    }
  });
});
