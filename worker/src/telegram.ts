/**
 * Telling a real Telegram user from a curl.
 *
 * `Telegram.WebApp.initDataUnsafe` is unsigned — `src/ui/admin.ts` says so in
 * as many words — but `initData` is not: it comes with an HMAC over the bot
 * token, so a Worker holding that token can check it. This is the whole
 * security boundary of the leaderboard and of duels alike, which is why it
 * lives in a file of its own with a test pointed straight at it.
 */

export interface Caller {
  id: string;
  name: string;
}

/** initData older than this is not a live session. Telegram's own advice is a day. */
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant time, because comparing a signature with === leaks it a byte at a time. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Telegram's check, exactly as documented: every field except `hash`, sorted by
 * key, joined with newlines, HMAC'd under a key which is itself an HMAC of the
 * bot token under the literal string "WebAppData".
 */
export async function verifyInitData(initData: string, botToken: string): Promise<Caller | null> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = params.get('hash');
  if (!hash) return null;

  const pairs: string[] = [];
  for (const [k, v] of [...params].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (k !== 'hash') pairs.push(`${k}=${v}`);
  }

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const mine = hex(await hmac(secret, pairs.join('\n')));
  if (!sameSignature(mine, hash)) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user || user.id == null) return null;
    // `||`, not `??`: Telegram sends an empty first_name rather than omitting
    // it, and `??` only falls through on null, so the username was never reached
    const name = String(user.first_name || user.username || '').trim();
    return { id: String(user.id), name: name.slice(0, 24) || 'PLAYER' };
  } catch {
    return null;
  }
}

/**
 * The password on the webhook, which is the bot token wearing a hat.
 *
 * Telegram sends whatever `secret_token` was given to `setWebhook` back in a
 * header on every update, and that is how a Worker tells a real update from
 * anybody who guessed the path. Deriving it from the token rather than minting
 * a second secret means there is nothing to keep in step: the script that sets
 * the hook and the Worker that checks it both hold the token, both do this,
 * and both get the same answer. Rotate the token and the hook's password
 * rotates with it.
 *
 * Hex, because Telegram only allows `A-Za-z0-9_-` in it.
 */
export async function webhookSecret(botToken: string): Promise<string> {
  return hex(await hmac(enc.encode(botToken), 'BrokerStarsWebhook')).slice(0, 48);
}

/** Constant time, for the same reason the signature check is. */
export const sameSecret = sameSignature;

/**
 * Say something to somebody, out of the blue.
 *
 * Every other message this bot sends is the answer to a webhook, which costs
 * nothing and needs no token — see `bot.ts`. The two that come through here are
 * not answers to anything: a duel invitation pushed into a friend's Telegram
 * while they are doing something else, and a duel called out in the game's
 * group chat. Both have to be real calls to the API.
 *
 * A private chat's id IS the user's id, which is why a friend's row is all the
 * address this needs; a group's is the number the group was given, which is
 * `CHAT_ID`. False rather than throwing on every way it can fail, and they are
 * ordinary: somebody who has never started the bot, or has blocked it, cannot
 * be written to, and Telegram says so with a 403 — as does a group the bot has
 * been thrown out of. The caller shows the link instead, which is what it would
 * have done anyway.
 */
export async function sendMessage(
  token: string,
  chatId: string,
  message: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, ...message }),
    });
    const body = (await res.json()) as { ok?: boolean };
    return body?.ok === true;
  } catch {
    return false;
  }
}

/**
 * The bot's @name, asked of Telegram once and kept for the life of the isolate.
 *
 * A duel invitation is a `t.me/<bot>?start=...` link, and the name in it is
 * something only the token knows. Asking here rather than adding a build-time
 * variable keeps the game's config to what it already had: change the token,
 * and the links follow.
 */
let cachedUsername: string | null = null;

export async function botUsername(token: string): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const body = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    const name = body?.ok ? body.result?.username : null;
    if (name) cachedUsername = name;
    return cachedUsername;
  } catch {
    return null;
  }
}
