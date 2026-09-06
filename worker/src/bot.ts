/**
 * The bot, such as it is.
 *
 * It has exactly two jobs: open the game, and turn a duel invitation into a
 * button that opens the game *on that duel*. Both are one message with one
 * `web_app` button, which is why this is forty lines in the Worker that was
 * already here rather than a process somebody has to keep alive.
 *
 * Every reply below is returned as the **response to the webhook** rather than
 * sent with a second call to the Bot API. Telegram reads a method call out of
 * the body of a webhook response and performs it, so an update costs one round
 * trip instead of two, and the reply needs no token of its own. The catch is
 * that it is one method per update, which is one more than anything here wants.
 *
 * `bot/bot.mjs` is the other half: a one-shot script that points Telegram at
 * this route and sets the menu button. It is not a daemon and does not poll.
 */

import { normalizeCode } from '../../src/duel/protocol';

/** A `/start duel_<code>` deep link, which is what an invitation is. */
const DUEL_START = /^\/start\s+duel_(\S+)$/;

const HELP =
  'Broker Stars — a two-minute trading duel.\n\n' +
  'You and a rival trade the same three stocks. Whoever ends with the bigger ' +
  'net worth wins; positions close automatically at the whistle. Big orders ' +
  'move the price against you, so the rival feels every trade you make.\n\n' +
  'PLAY puts a bot opposite you. DUEL, on the menu, sends a friend a link and ' +
  'puts them there instead — same market, same second, and your abilities land ' +
  'on each other.\n\n' +
  'Tap PLAY to start.';

const INVITED =
  'Somebody wants eighty seconds of your time.\n\n' +
  'Tap below and you are in the same match they are — same three companies, ' +
  'same chart, same tick. The invitation is only good for 15 minutes from when ' +
  'it was sent.';

/**
 * The button that opens the mini app, with a duel on it or without.
 *
 * The code goes in the query and not the fragment on purpose: Telegram appends
 * its own `#tgWebAppData=…` to the hash, and anything of ours there is in its
 * way.
 */
function playButton(webappUrl: string, code?: string) {
  const url = new URL(webappUrl);
  if (code) url.searchParams.set('d', code);
  return {
    text: code ? '⚔️ ACCEPT THE DUEL' : '🎮 PLAY',
    web_app: { url: url.toString() },
  };
}

const reply = (chatId: number | string, text: string, button: unknown) => ({
  method: 'sendMessage',
  chat_id: chatId,
  text,
  reply_markup: { inline_keyboard: [[button]] },
});

/**
 * What to answer one update with, or null for the many kinds there is nothing
 * to say to. Never throws: an update that cannot be read is an update that gets
 * a 200 and no reply, because the alternative is Telegram retrying it forever.
 */
export function answerUpdate(update: unknown, webappUrl: string): unknown | null {
  const msg = (update as { message?: { text?: unknown; chat?: { id?: number | string } } })
    ?.message;
  const chatId = msg?.chat?.id;
  if (chatId == null || typeof msg?.text !== 'string') return null;

  const text = msg.text.trim().toLowerCase();
  if (!text.startsWith('/')) return null;

  // Checked before /start, which it also matches.
  const invited = DUEL_START.exec(text);
  if (invited) {
    const code = normalizeCode(invited[1]);
    // A link with a code we would refuse anyway gets the ordinary button: the
    // friend still ends up in the game, which is better than a dead end.
    return code
      ? reply(chatId, INVITED, playButton(webappUrl, code))
      : reply(chatId, HELP, playButton(webappUrl));
  }

  if (text.startsWith('/start') || text.startsWith('/play')) {
    return reply(chatId, 'Ready to trade?', playButton(webappUrl));
  }
  if (text.startsWith('/help')) return reply(chatId, HELP, playButton(webappUrl));
  return null;
}
