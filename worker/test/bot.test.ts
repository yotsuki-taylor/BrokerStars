import { describe, expect, it } from 'vitest';
import { answerUpdate, duelPush } from '../src/bot';

/**
 * The bot is two messages and a button, and it used to be a script somebody
 * ran. Now it is a route, and a route that answers wrongly is a friend tapping
 * an invitation and landing nowhere — so the routing gets a test.
 */

const APP = 'https://example.github.io/BrokerStars/';
const msg = (text: string) => ({ message: { chat: { id: 42 }, text } });

/** The url on the one button of a reply. */
const buttonUrl = (answer: any): string =>
  answer.reply_markup.inline_keyboard[0][0].web_app.url;

describe('what the bot answers', () => {
  it('sends an invitation straight into that duel', () => {
    const answer: any = answerUpdate(msg('/start duel_bcdfgh2345'), APP);
    expect(answer.method).toBe('sendMessage');
    expect(answer.chat_id).toBe(42);
    // a query, not a fragment: Telegram wants the hash for tgWebAppData
    expect(buttonUrl(answer)).toBe(`${APP}?d=bcdfgh2345`);
  });

  it('opens the game plainly for anything else', () => {
    for (const text of ['/start', '/play', '/help', '/start@BrokerStars_bot']) {
      const answer: any = answerUpdate(msg(text), APP);
      expect(answer, text).not.toBeNull();
      expect(buttonUrl(answer), text).toBe(APP);
    }
  });

  it('still opens the game when the code in the link is nonsense', () => {
    // Better than a dead end: the duel will not be found, but the friend is at
    // least inside the game rather than looking at a bot that said nothing.
    const answer: any = answerUpdate(msg('/start duel_' + 'a'.repeat(80)), APP);
    expect(buttonUrl(answer)).toBe(APP);
  });

  it('says nothing to everything it is not for', () => {
    expect(answerUpdate(msg('hello'), APP)).toBeNull();
    expect(answerUpdate({ message: { chat: { id: 1 } } }, APP)).toBeNull();
    expect(answerUpdate({ edited_message: { chat: { id: 1 }, text: '/play' } }, APP)).toBeNull();
    expect(answerUpdate({}, APP)).toBeNull();
    expect(answerUpdate(null, APP)).toBeNull();
    expect(answerUpdate('/play', APP)).toBeNull();
  });

  it('sends a friend invitation straight to the friends menu', () => {
    const answer: any = answerUpdate(msg('/start friend_bcdfgh2345'), APP);
    expect(answer.method).toBe('sendMessage');
    expect(buttonUrl(answer)).toBe(`${APP}?f=bcdfgh2345`);
  });

  it('does not confuse the two kinds of invitation', () => {
    // one code stands for a match and the other for a person, and a button
    // carrying both would open the game on a duel that is not there
    const duel = new URL(buttonUrl(answerUpdate(msg('/start duel_bcdfgh2345'), APP)));
    expect(duel.searchParams.get('f')).toBeNull();
    const friend = new URL(buttonUrl(answerUpdate(msg('/start friend_bcdfgh2345'), APP)));
    expect(friend.searchParams.get('d')).toBeNull();
  });

  it('still opens the game when the friend code is nonsense', () => {
    const answer: any = answerUpdate(msg('/start friend_' + 'a'.repeat(80)), APP);
    expect(buttonUrl(answer)).toBe(APP);
  });

  it('names the caller in an invitation it pushes at one friend', () => {
    // A message that arrives on its own has to explain itself: anonymous is
    // what a forwarded link looks like, and this did not come from a friend.
    const push: any = duelPush(APP, 'bcdfgh2345', 'ANNA');
    expect(push.text).toContain('ANNA');
    expect(push.reply_markup.inline_keyboard[0][0].web_app.url).toBe(`${APP}?d=bcdfgh2345`);
    // no `method` and no `chat_id`: this one is sent, not answered with
    expect(push).not.toHaveProperty('method');
  });

  it('keeps whatever the mini app url already carried', () => {
    const withPath = 'https://example.com/game/?v=2';
    const answer: any = answerUpdate(msg('/start duel_bcdfgh2345'), withPath);
    const url = new URL(buttonUrl(answer));
    expect(url.searchParams.get('v')).toBe('2');
    expect(url.searchParams.get('d')).toBe('bcdfgh2345');
  });
});
