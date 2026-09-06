/**
 * Points Telegram at the bot and stops.
 *
 *   npm run bot          set the webhook, the menu button and the commands
 *   npm run bot -- --off remove the webhook again
 *
 * This used to be a long-polling loop, and the loop was the whole of the bot:
 * something had to stay alive for a PLAY button to be answered. It does not any
 * more. The Worker already holds the token — it needs it to check who is
 * handing in a score and who is sitting down to a duel — so it answers updates
 * too, on `/tg` (`worker/src/bot.ts`). What is left here is the one-off setup,
 * which is a script rather than a service.
 *
 * The webhook's `secret_token` is derived from the bot token rather than
 * invented, so there is no second secret to set on the Worker and nothing to
 * fall out of step: both sides HMAC the same label under the same token. See
 * `webhookSecret` in `worker/src/telegram.ts` — this has to agree with it.
 *
 * Reads BOT_TOKEN, WEBAPP_URL and VITE_API_URL from .env (never commit that
 * file). Node 18+ only, no dependencies.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Minimal .env reader: KEY=value per line, # comments, optional quotes. */
function loadEnv(path = '.env') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnv();

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const API_URL = String(process.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const off = process.argv.includes('--off');

if (!TOKEN || !WEBAPP_URL) {
  console.error(
    'Missing BOT_TOKEN or WEBAPP_URL.\n' +
      'Copy .env.example to .env and fill both in — see the README section "Telegram".',
  );
  process.exit(1);
}
if (!WEBAPP_URL.startsWith('https://')) {
  console.error(`WEBAPP_URL must be https, got: ${WEBAPP_URL}`);
  process.exit(1);
}
if (!off && !API_URL) {
  console.error(
    'Missing VITE_API_URL — the bot answers from the Worker now, so there has to\n' +
      'be one to point Telegram at. Deploy worker/ and put its address in .env.\n' +
      'To take an old webhook off instead: npm run bot -- --off',
  );
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function api(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

/** Must match `webhookSecret` in worker/src/telegram.ts. */
const webhookSecret = () =>
  createHmac('sha256', TOKEN).update('BrokerStarsWebhook').digest('hex').slice(0, 48);

const me = await api('getMe');

if (off) {
  await api('deleteWebhook', { drop_pending_updates: false });
  console.log(`@${me.username}: webhook removed. Nothing is answering /start now.`);
  process.exit(0);
}

// The Worker only ever needs messages. Asking for nothing else keeps the rest
// of Telegram's firehose off a route that would only drop it anyway.
await api('setWebhook', {
  url: `${API_URL}/tg`,
  secret_token: webhookSecret(),
  allowed_updates: ['message'],
  max_connections: 20,
});

await api('setChatMenuButton', {
  menu_button: { type: 'web_app', text: 'PLAY', web_app: { url: WEBAPP_URL } },
});

await api('setMyCommands', {
  commands: [
    { command: 'play', description: 'Open Broker Stars' },
    { command: 'help', description: 'How the match works' },
  ],
});

const hook = await api('getWebhookInfo');
console.log(`@${me.username} is set up. Mini app: ${WEBAPP_URL}`);
console.log(`Webhook: ${hook.url}`);
if (hook.last_error_message) {
  console.log(`Last error Telegram saw: ${hook.last_error_message}`);
}
console.log('Nothing needs to keep running — the Worker answers from here on.');
