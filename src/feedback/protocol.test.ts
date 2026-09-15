import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_COOLDOWN,
  MAX_FEEDBACK,
  MAX_REPLY_TO,
  MIN_FEEDBACK,
  cleanAbout,
  cleanFeedback,
  stillWaiting,
} from './protocol';

const long = (n: number) => 'a'.repeat(n);

describe('what may be sent', () => {
  it('takes an ordinary message and hands it back trimmed', () => {
    const out = cleanFeedback('  the chart goes blank in Q3  ', ' me@example.com ');
    expect(out).toEqual({ ok: true, text: 'the chart goes blank in Q3', replyTo: 'me@example.com' });
  });

  it('refuses an empty box, and a box that is only whitespace', () => {
    // The second is the reason the trim happens BEFORE the measuring: eleven
    // newlines are longer than the floor and are not a message.
    expect(cleanFeedback('', '')).toEqual({ ok: false, reason: 'empty' });
    expect(cleanFeedback('   \n\n\n\n\n\n\n\n\n\n\n  ', '')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a message too short to act on', () => {
    expect(cleanFeedback(long(MIN_FEEDBACK - 1), '')).toEqual({ ok: false, reason: 'short' });
    expect(cleanFeedback(long(MIN_FEEDBACK), '')).toMatchObject({ ok: true });
  });

  it('refuses one too long, at exactly the limit the box enforces', () => {
    expect(cleanFeedback(long(MAX_FEEDBACK), '')).toMatchObject({ ok: true });
    expect(cleanFeedback(long(MAX_FEEDBACK + 1), '')).toEqual({ ok: false, reason: 'long' });
  });

  it('takes the reply address as given, and only cuts it', () => {
    // Never validated as an address on purpose: it is optional, a human reads
    // it, and a regex that rejects somebody's good address is worse than a line
    // of nonsense in a message that is being read anyway.
    const out = cleanFeedback('a real message', long(MAX_REPLY_TO + 50));
    expect(out).toMatchObject({ ok: true });
    if (out.ok) expect(out.replyTo).toHaveLength(MAX_REPLY_TO);

    const junk = cleanFeedback('a real message', 'not an address at all');
    expect(junk).toMatchObject({ ok: true, replyTo: 'not an address at all' });
  });

  it('treats a missing reply address as no reply address', () => {
    expect(cleanFeedback('a real message', undefined)).toMatchObject({ ok: true, replyTo: '' });
    expect(cleanFeedback('a real message', null)).toMatchObject({ ok: true, replyTo: '' });
  });

  it('survives anything at all arriving over the wire', () => {
    // It is a POST body; the shapes below are what a client that is broken, old
    // or hostile sends, and none of them may be an exception on the server.
    expect(cleanFeedback(undefined, undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(cleanFeedback(null, null)).toEqual({ ok: false, reason: 'empty' });
    expect(cleanFeedback(12345678901234, null)).toMatchObject({ ok: true });
    expect(cleanFeedback({ a: 1 }, [])).toMatchObject({ ok: true });
  });
});

describe('what the client says about itself', () => {
  it('keeps the three hints and cuts them to size', () => {
    expect(cleanAbout({ platform: 'android', version: '1.0.15+17', lang: 'ru' })).toEqual({
      platform: 'android',
      version: '1.0.15+17',
      lang: 'ru',
    });
  });

  it('answers with empties rather than throwing, whatever arrives', () => {
    const empty = { platform: '', version: '', lang: '' };
    expect(cleanAbout(undefined)).toEqual(empty);
    expect(cleanAbout(null)).toEqual(empty);
    expect(cleanAbout('nonsense')).toEqual(empty);
    expect(cleanAbout({ platform: long(500) }).platform).toHaveLength(16);
  });
});

describe('the cooldown', () => {
  it('lets somebody who has never written send at once', () => {
    // A missing row reads as 0, which is a moment in 1970 — the same answer as
    // a very old one, and not a special case anywhere.
    expect(stillWaiting(0, 1_700_000_000_000)).toBe(0);
  });

  it('counts down and then opens', () => {
    const now = 1_700_000_000_000;
    expect(stillWaiting(now, now)).toBe(FEEDBACK_COOLDOWN);
    expect(stillWaiting(now - FEEDBACK_COOLDOWN / 2, now)).toBe(FEEDBACK_COOLDOWN / 2);
    expect(stillWaiting(now - FEEDBACK_COOLDOWN, now)).toBe(0);
    expect(stillWaiting(now - FEEDBACK_COOLDOWN * 10, now)).toBe(0);
  });

  it('never answers a negative wait, even on a clock that went backwards', () => {
    const now = 1_700_000_000_000;
    expect(stillWaiting(now + 60_000, now)).toBeGreaterThan(0);
    expect(stillWaiting(now - 1, now + FEEDBACK_COOLDOWN)).toBe(0);
  });

  it('is shorter than the chat shout, which guards a room full of people', () => {
    // This one guards a private inbox. If the two ever swap places that is a
    // decision, not a typo, and it should fail here first.
    expect(FEEDBACK_COOLDOWN).toBeLessThan(10 * 60 * 1000);
  });
});
