/**
 * Telegram bot that opens the mini app.
 *
 *   npm run bot
 *
 * Reads BOT_TOKEN and WEBAPP_URL from .env (never commit that file). Long
 * polling, no webhook and no server of its own — the game itself is a static
 * page served from wherever WEBAPP_URL points.
 *
 * Node 18+ only, no dependencies.
 */
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

const PLAY_BUTTON = { text: '🎮 PLAY', web_app: { url: WEBAPP_URL } };

/** One-off setup: the blue menu button next to the message box, and /commands. */
async function configure() {
  const me = await api('getMe');
  await api('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'PLAY', web_app: { url: WEBAPP_URL } },
  });
  await api('setMyCommands', {
    commands: [
      { command: 'play', description: 'Open Broker Stars' },
      { command: 'help', description: 'How the match works' },
    ],
  });
  console.log(`@${me.username} is live. Mini app: ${WEBAPP_URL}`);
  console.log('Menu button and commands set. Ctrl+C to stop polling.');
}

const HELP =
  'Broker Stars — a two-minute trading duel.\n\n' +
  'You and a rival trade the same three stocks. Whoever ends with the bigger ' +
  'net worth wins; positions close automatically at the whistle. Big orders ' +
  'move the price against you, so size matters.\n\n' +
  'Tap PLAY to start.';

async function handle(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const text = msg.text.trim().toLowerCase();
  const chatId = msg.chat.id;

  if (text.startsWith('/start') || text.startsWith('/play')) {
    await api('sendMessage', {
      chat_id: chatId,
      text: `Ready to trade, ${msg.from.first_name ?? 'broker'}?`,
      reply_markup: { inline_keyboard: [[PLAY_BUTTON]] },
    });
    return;
  }
  if (text.startsWith('/help')) {
    await api('sendMessage', {
      chat_id: chatId,
      text: HELP,
      reply_markup: { inline_keyboard: [[PLAY_BUTTON]] },
    });
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 30 });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handle(u).catch((e) => console.error('handler:', e.message));
      }
    } catch (e) {
      console.error('poll:', e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

await configure();
await poll();
