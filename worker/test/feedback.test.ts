import { describe, expect, it } from 'vitest';
import { feedbackAvailable, feedbackMessage, mayWrite } from '../src/feedback';
import { cleanAbout } from '../../src/feedback/protocol';
import type { Env } from '../src/results';

const env = (over: Partial<Env> = {}) => ({ ...over }) as Env;
const about = (over = {}) =>
  cleanAbout({ platform: 'android', version: '1.0.15+17', lang: 'ru', ...over });

describe('whether there is anywhere to deliver', () => {
  it('needs both the bot and somebody to send to', () => {
    expect(feedbackAvailable(env({ BOT_TOKEN: 'x', ADMIN_ID: '1' }))).toBe(true);
    expect(feedbackAvailable(env({ BOT_TOKEN: 'x' }))).toBe(false);
    expect(feedbackAvailable(env({ ADMIN_ID: '1' }))).toBe(false);
    expect(feedbackAvailable(env())).toBe(false);
  });
});

describe('who may write', () => {
  it('lets a guest write, unlike the chat', () => {
    // Deliberate divergence from `mayShout`, which refuses guests: this lands
    // in a private inbox rather than a room of people, and the player most
    // likely to have something worth hearing is the one who hit a bug before
    // it ever occurred to them to sign in. See the comment on `mayWrite`.
    expect(mayWrite()).toBe(true);
  });
});

describe('the message that gets sent', () => {
  const caller = { id: '165233146', name: 'MASHA' };

  it('carries the text, who sent it, and what they were playing on', () => {
    const msg = feedbackMessage(caller, 'the chart goes blank in Q3', 'me@example.com', about());
    const text = String(msg.text);
    expect(text).toContain('the chart goes blank in Q3');
    expect(text).toContain('MASHA');
    expect(text).toContain('165233146');
    expect(text).toContain('android');
    expect(text).toContain('v1.0.15+17');
    expect(text).toContain('reply to: me@example.com');
    expect(text).toContain('signed in');
  });

  it('says outright when there is no way to answer', () => {
    const msg = feedbackMessage(caller, 'a real message', '', about());
    expect(String(msg.text)).toContain('no reply address');
    expect(String(msg.text)).not.toContain('reply to:');
  });

  it('marks a guest, which is how the Play crawler is told from a person', () => {
    // A guest id starts `a:` (`worker/src/auth.ts`). The pre-launch crawler is
    // a brand new guest every time — see the post-mortem in `chat.ts` — and the
    // whole point of this word is that its reports are obvious without reading.
    const msg = feedbackMessage({ id: 'a:9f3c', name: 'PLAYER' }, 'a real message', '', about());
    expect(String(msg.text)).toContain('GUEST');
    expect(String(msg.text)).not.toContain('signed in');
  });

  it('never asks Telegram to format a stranger.s text', () => {
    // The body is somebody else.s writing. With a parse_mode it is either a
    // broken message the first time anybody types an underscore, or an
    // injection into the developer.s own chat, so there is no parse_mode at all
    // and nothing is escaped because nothing needs to be.
    const nasty = '*bold* _under_ [link](http://evil) <b>html</b> `code`';
    const msg = feedbackMessage(caller, nasty, '', about());
    expect(msg.parse_mode).toBeUndefined();
    expect(String(msg.text)).toContain(nasty);
  });

  it('holds up when the client said nothing about itself', () => {
    const msg = feedbackMessage({ id: 'a:1', name: '' }, 'a real message', '', cleanAbout(null));
    const text = String(msg.text);
    expect(text).toContain('no name');
    expect(text).toContain('unknown host');
    // no version, so no stray "v" on its own
    expect(text).not.toMatch(/\bv(\s|·|$)/);
  });
});
