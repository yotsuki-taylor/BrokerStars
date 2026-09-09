/**
 * The bot, such as it is.
 *
 * It has three jobs: open the game, turn a duel invitation into a button that
 * opens the game *on that duel*, and turn a friend invitation into one that
 * opens it on that friendship. All of them are one message with one `web_app`
 * button, which is why this is a short file in the Worker that was already
 * here rather than a process somebody has to keep alive.
 *
 * Every reply below is returned as the **response to the webhook** rather than
 * sent with a second call to the Bot API. Telegram reads a method call out of
 * the body of a webhook response and performs it, so an update costs one round
 * trip instead of two, and the reply needs no token of its own. The catch is
 * that it is one method per update, which is one more than anything here wants.
 *
 * `bot/bot.mjs` is the other half: a one-shot script that points Telegram at
 * this route and sets the menu button. It is not a daemon and does not poll.
 *
 * THE BOT IS IN A GROUP NOW, and a group is not a private chat as far as the
 * buttons go: Telegram allows `web_app` on an inline button only in a chat
 * between one person and the bot, and rejects the whole message anywhere else.
 * So every reply here asks which kind of chat it is answering and, in a group,
 * sends a `url` button through the bot's own `?start=` door instead -- one
 * extra tap for the reader, and the alternative is a message Telegram refuses
 * to deliver at all.
 */

import { normalizeCode } from '../../src/duel/protocol';
import { cleanCode } from '../../src/friends/protocol';

/** A `/start duel_<code>` deep link, which is what an invitation is. */
const DUEL_START = /^\/start\s+duel_(\S+)$/;

/**
 * A `/start friend_<code>` deep link. Unlike a duel's, the code in it stands
 * for a person rather than for a match, so the same link can be sent to a
 * whole group chat and does not run out — see `src/friends/protocol.ts`.
 */
const FRIEND_START = /^\/start\s+friend_(\S+)$/;

const HELP =
  'Broker Stars — a two-minute trading duel.\n\n' +
  'You and a rival trade the same three stocks. Whoever ends with the bigger ' +
  'net worth wins; positions close automatically at the whistle. Big orders ' +
  'move the price against you, so the rival feels every trade you make.\n\n' +
  'PLAY puts a bot opposite you. DUEL, on the menu, sends a friend a link and ' +
  'puts them there instead — same market, same second, and your abilities land ' +
  'on each other.\n\n' +
  'Tap PLAY to start.';

const BEFRIENDED =
  'Somebody wants you on their list.\n\n' +
  'Tap below and the two of you are friends in Broker Stars — you will see ' +
  'each other on the friends menu, and where you each stand. This link does ' +
  'not run out, so there is no hurry.';

const INVITED =
  'Somebody wants eighty seconds of your time.\n\n' +
  'Tap below and you are in the same match they are — same three companies, ' +
  'same chart, same tick. The invitation is only good for 15 minutes from when ' +
  'it was sent.';

/**
 * The button that opens the mini app: plainly, on a duel, or on a friendship.
 *
 * The code goes in the query and not the fragment on purpose: Telegram appends
 * its own `#tgWebAppData=…` to the hash, and anything of ours there is in its
 * way.
 */
function playButton(webappUrl: string, on?: { duel?: string; friend?: string }) {
  const url = new URL(webappUrl);
  if (on?.duel) url.searchParams.set('d', on.duel);
  if (on?.friend) url.searchParams.set('f', on.friend);
  if (on?.duel) return { text: '⚔️ ACCEPT THE DUEL', web_app: { url: url.toString() } };
  if (on?.friend) return { text: '🤝 ADD THEM BACK', web_app: { url: url.toString() } };
  return { text: '🎮 PLAY', web_app: { url: url.toString() } };
}

/**
 * The same button for a group, where `web_app` is not allowed.
 *
 * It goes to the bot's private chat carrying the payload, and the bot answers
 * there with the real button -- which is exactly the road a duel link already
 * travels when it is forwarded to somebody (`?start=duel_<code>`), so nothing
 * new has to understand it.
 */
function doorButton(botName: string, on?: { duel?: string; friend?: string }) {
  const start = on?.duel ? `duel_${on.duel}` : on?.friend ? `friend_${on.friend}` : '';
  const url = `https://t.me/${botName}${start ? `?start=${start}` : ''}`;
  if (on?.duel) return { text: '⚔️ ACCEPT THE DUEL', url };
  if (on?.friend) return { text: '🤝 ADD THEM BACK', url };
  return { text: '🎮 PLAY', url };
}

/** A reply with no button at all: the honest answer when there is none to give. */
const reply = (chatId: number | string, text: string, button?: unknown) =>
  button
    ? {
        method: 'sendMessage',
        chat_id: chatId,
        text,
        reply_markup: { inline_keyboard: [[button]] },
      }
    : { method: 'sendMessage', chat_id: chatId, text };

/**
 * A duel invitation pushed at one named friend, rather than a link somebody
 * has to hand over themselves.
 *
 * One of the two messages this bot sends that are not answers to a webhook —
 * `chatShout` below is the other, and `sendMessage` in `telegram.ts` says what
 * that costs and how it fails. This one says
 * who by name, because a message that arrives on its own has to explain itself:
 * an anonymous "somebody wants eighty seconds of your time" is what a link
 * forwarded by a friend looks like, and this did not come from a friend's own
 * hands.
 */
export function duelPush(webappUrl: string, code: string, from: string) {
  return {
    text:
      `${from} has called you out.\n\n` +
      'Tap below and you are in the same match they are — same three companies, ' +
      'same chart, same tick. The invitation is only good for 15 minutes.',
    reply_markup: { inline_keyboard: [[playButton(webappUrl, { duel: code })]] },
  };
}

/**
 * A duel called out in the game's own group chat, by somebody with nobody to
 * play against.
 *
 * The one message this game sends that is not addressed to a person: it goes
 * to a room full of strangers, so it names who is asking and says how long the
 * offer stands, and the button is a plain link because a group cannot carry
 * the other kind. Who is allowed to make the bot say it, and how often, is
 * `chat.ts` -- none of that belongs in a file about wording.
 */
export function chatShout(botName: string, code: string, from: string) {
  return {
    text:
      `${from} is looking for a duel.\n\n` +
      'Eighty seconds, three companies, and whoever ends with the bigger net ' +
      'worth takes it. First one to tap gets the seat -- the invitation is good ' +
      'for 15 minutes.',
    reply_markup: { inline_keyboard: [[doorButton(botName, { duel: code })]] },
  };
}

/**
 * What to answer one update with, or null for the many kinds there is nothing
 * to say to. Never throws: an update that cannot be read is an update that gets
 * a 200 and no reply, because the alternative is Telegram retrying it forever.
 *
 * `botName` is only needed in a group, where the buttons have to be links
 * rather than mini-app launches. Without it a group gets the words and no
 * button -- worse than the real answer, better than a message Telegram throws
 * away.
 */
export function answerUpdate(
  update: unknown,
  webappUrl: string,
  botName?: string | null,
): unknown | null {
  const msg = (
    update as {
      message?: { text?: unknown; chat?: { id?: number | string; type?: unknown } };
    }
  )?.message;
  const chatId = msg?.chat?.id;
  if (chatId == null || typeof msg?.text !== 'string') return null;

  // Anything that is not a private chat is treated as a group: the buttons are
  // the thing at stake, and `web_app` is private-only. An update with no type
  // on it at all is the private case, which is what every test and every
  // ordinary player is.
  const kind = msg.chat?.type;
  const group = typeof kind === 'string' && kind !== 'private';
  const button = (on?: { duel?: string; friend?: string }) =>
    group ? (botName ? doorButton(botName, on) : undefined) : playButton(webappUrl, on);

  const text = msg.text.trim().toLowerCase();
  if (!text.startsWith('/')) return null;

  // Which chat is this? Asked in a group by whoever is setting the game up, so
  // that the id can be put in `CHAT_ID` and the game can call duels out here.
  // Not a secret: posting still needs the bot's token, and the id alone buys
  // nobody anything.
  if (text.startsWith('/chat')) {
    return group
      ? reply(chatId, `This chat is ${chatId}.`)
      : reply(chatId, 'Ask me that in the group, not here.');
  }

  // Checked before /start, which it also matches.
  const invited = DUEL_START.exec(text);
  if (invited) {
    const code = normalizeCode(invited[1]);
    // A link with a code we would refuse anyway gets the ordinary button: the
    // friend still ends up in the game, which is better than a dead end.
    return code
      ? reply(chatId, INVITED, button({ duel: code }))
      : reply(chatId, HELP, button());
  }

  // Same shape, and checked before /start for the same reason.
  const befriended = FRIEND_START.exec(text);
  if (befriended) {
    const code = cleanCode(befriended[1]);
    return code
      ? reply(chatId, BEFRIENDED, button({ friend: code }))
      : reply(chatId, HELP, button());
  }

  if (text.startsWith('/start') || text.startsWith('/play')) {
    return reply(chatId, 'Ready to trade?', button());
  }
  if (text.startsWith('/help')) return reply(chatId, HELP, button());
  return null;
}
