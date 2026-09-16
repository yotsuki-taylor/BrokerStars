import { describe, expect, it } from 'vitest';
import { COMPANIES } from '../sim/companies';
import {
  COLORS,
  COMPANY_EMBLEMS,
  DEFAULT_COLOR,
  DEFAULT_EMBLEM,
  EMBLEMS,
  OWN_EMBLEMS,
  cleanColor,
  cleanEmblem,
  emblemById,
} from './emblems';
import {
  BANNED,
  MAX_MEMBERS,
  MIN_RANKED,
  MOTTO_MAX,
  NAME_MAX,
  averageOf,
  banned,
  cleanCorp,
  cleanMotto,
  cleanName,
  cleanSummaries,
  cleanTag,
  full,
  keyOf,
  nextSeasonAt,
  ranked,
  seasonOf,
} from './protocol';

/**
 * The half of a corporation that is arithmetic and text rather than SQL: what a
 * name may be, when a season ends, and what a table is ranked on. None of it
 * needs a database, which is why none of it is in `worker/test/corps.test.ts`.
 */

describe('what a corporation may be called', () => {
  it('shouts, because everything in this game does', () => {
    expect(cleanName(' bull  run ')).toBe('BULL RUN');
    expect(cleanTag('br')).toBe('BR');
  });

  it('takes nothing but capitals, digits and the space', () => {
    // The alphabet IS the moderation. See the note on `ALLOWED`: no homoglyph,
    // no invisible character and no emoji can be typed into a name, so there is
    // nothing clever left to catch.
    expect(cleanName('ГАЗПРОМ')).toBeNull();
    expect(cleanName('PAYPAL​')).toBeNull();
    expect(cleanName('РАУРАL')).toBeNull();
    expect(cleanName('BULL 🐂 RUN')).toBeNull();
    expect(cleanName('BULL-RUN')).toBeNull();
  });

  it('holds both ends of the length', () => {
    expect(cleanName('AB')).toBeNull();
    expect(cleanName('A'.repeat(NAME_MAX))).toBe('A'.repeat(NAME_MAX));
    expect(cleanName('A'.repeat(NAME_MAX + 1))).toBeNull();
    expect(cleanTag('A')).toBeNull();
    expect(cleanTag('ABCDE')).toBeNull();
  });

  it('refuses the short list, spaced out or not', () => {
    expect(cleanName('FUCK INC')).toBeNull();
    // the one evasion cheap enough to be worth closing
    expect(cleanName('F U C K')).toBeNull();
    expect(banned('SOMETHING NAZI')).toBe(true);
    expect(banned('PERFECTLY FINE')).toBe(false);
  });

  it('keeps that list in the alphabet it is checked against', () => {
    // A banned word with a lower-case letter in it would never match anything,
    // because everything is uppercased before it is checked.
    for (const word of BANNED) expect(word, word).toBe(word.toUpperCase());
  });

  it('drops a motto it cannot show rather than refusing the whole corporation', () => {
    // The odd one out, and deliberately: nobody should fail to found a
    // corporation because of an exclamation mark they could have left out.
    expect(cleanMotto('WE TRADE!')).toBe('');
    expect(cleanMotto('WE TRADE')).toBe('WE TRADE');
    expect(cleanMotto('A'.repeat(MOTTO_MAX + 40)).length).toBe(MOTTO_MAX);
  });

  it('decides uniqueness without case or spaces', () => {
    expect(keyOf(cleanName('BULL RUN')!)).toBe('BULLRUN');
    expect(keyOf(cleanName('bullrun')!)).toBe('BULLRUN');
    expect(keyOf(cleanName('B U L L R U N')!)).toBe('BULLRUN');
  });
});

describe('what a corporation wears', () => {
  it('takes an emblem this build knows, and nothing else', () => {
    expect(cleanEmblem('bull')).toBe('bull');
    expect(cleanEmblem('c:kraken')).toBe('c:kraken');
    // an id from a later version, or one whose company has since been removed
    expect(cleanEmblem('unicorn')).toBe(DEFAULT_EMBLEM);
    expect(cleanEmblem(null)).toBe(DEFAULT_EMBLEM);
    // and never a path, whatever it is dressed up as
    expect(cleanEmblem('../../secret.svg')).toBe(DEFAULT_EMBLEM);
    expect(cleanEmblem('corps/bull.svg')).toBe(DEFAULT_EMBLEM);
  });

  it('takes a colour from the ten and nothing else', () => {
    // This value is written into a style attribute on a mark thirty other
    // people are shown, so the closed set is the whole of the defence.
    expect(cleanColor(COLORS[3])).toBe(COLORS[3]);
    expect(cleanColor('#123456')).toBe(DEFAULT_COLOR);
    expect(cleanColor('red')).toBe(DEFAULT_COLOR);
    expect(cleanColor('url(javascript:alert(1))')).toBe(DEFAULT_COLOR);
    expect(cleanColor('#FFC02E; background-image: url(x)')).toBe(DEFAULT_COLOR);
  });

  it('forgives the case of a colour, since it is typed nowhere', () => {
    expect(cleanColor(COLORS[0].toLowerCase())).toBe(COLORS[0]);
  });

  it('names a real file for every emblem in the catalogue', () => {
    // A catalogue entry with no drawing behind it is an empty square in the
    // picker, which nothing else would catch.
    for (const e of EMBLEMS) {
      expect(e.file, e.id).toMatch(/\.(svg|png)$/);
      expect(e.id, e.file).not.toContain('/');
    }
    // the two halves are disjoint, which is what the `c:` prefix is for
    expect(new Set(EMBLEMS.map((e) => e.id)).size).toBe(EMBLEMS.length);
    expect(OWN_EMBLEMS.length).toBe(16);
    expect(COMPANY_EMBLEMS.length).toBe(COMPANIES.length);
  });

  it('draws something for a corporation that chose nothing', () => {
    expect(emblemById('nonsense').file).toBe(emblemById(DEFAULT_EMBLEM).file);
  });
});

describe('the season', () => {
  it('is the calendar month, in UTC', () => {
    expect(seasonOf(Date.UTC(2026, 0, 1))).toBe('2026-01');
    expect(seasonOf(Date.UTC(2026, 8, 30, 23, 59, 59))).toBe('2026-09');
    expect(seasonOf(Date.UTC(2026, 9, 1, 0, 0, 0))).toBe('2026-10');
  });

  it('ends at the first midnight of the next one', () => {
    expect(nextSeasonAt(Date.UTC(2026, 8, 16))).toBe(Date.UTC(2026, 9, 1));
    // and December rolls the year rather than the month thirteen
    expect(nextSeasonAt(Date.UTC(2026, 11, 20))).toBe(Date.UTC(2027, 0, 1));
    expect(seasonOf(nextSeasonAt(Date.UTC(2026, 11, 20)))).toBe('2027-01');
  });

  it('does not care what hour of the day it is asked', () => {
    const month = seasonOf(Date.UTC(2026, 4, 15, 3));
    for (let h = 0; h < 24; h++) expect(seasonOf(Date.UTC(2026, 4, 15, h))).toBe(month);
  });
});

describe('what the table ranks', () => {
  it('is the average, so size buys nothing', () => {
    // Five people on a hundred each beat ten on fifty, which is the entire
    // argument for an average — a sum would be a ranking of recruiting.
    expect(averageOf(500, 5)).toBe(100);
    expect(averageOf(500, 10)).toBe(50);
  });

  it('counts a member who earned nothing, which is what makes a seat cost', () => {
    expect(averageOf(300, 3)).toBe(100);
    expect(averageOf(300, 4)).toBe(75);
  });

  it('answers zero rather than infinity for a corporation of nobody', () => {
    expect(averageOf(100, 0)).toBe(0);
  });

  it('keeps a corporation of one prodigy out of the table', () => {
    expect(ranked(MIN_RANKED - 1)).toBe(false);
    expect(ranked(MIN_RANKED)).toBe(true);
  });

  it('knows when there is no seat left', () => {
    expect(full(MAX_MEMBERS - 1)).toBe(false);
    expect(full(MAX_MEMBERS)).toBe(true);
  });
});

describe('nothing off the wire is believed', () => {
  it('reads a corporation and keeps only what it understands', () => {
    const corp = cleanCorp(
      {
        id: 'x',
        name: 'BULL RUN',
        tag: 'BR',
        policy: 'nonsense',
        members: [{ id: 'a', name: 'A', coins: -5, owner: true }, { name: 'nameless' }],
        feed: [{ kind: 'gossip', who: 'A' }],
        coinRank: -3,
      },
      Date.now(),
    );
    expect(corp?.policy).toBe('open');
    // a negative contribution and a member with no id are both nonsense
    expect(corp?.members.map((m) => m.id)).toEqual(['a']);
    expect(corp?.members[0].coins).toBe(0);
    // and a kind this build has never heard of is not drawn
    expect(corp?.feed).toEqual([]);
    expect(corp?.coinRank).toBeNull();
  });

  it('is null for an answer that is not a corporation at all', () => {
    expect(cleanCorp(null)).toBeNull();
    expect(cleanCorp({ id: 'x' })).toBeNull();
    expect(cleanSummaries('nope')).toEqual([]);
  });

  it('drops a duel card whose invitation died on the way here', () => {
    const now = Date.now();
    const of = (expiresAt: number) =>
      cleanCorp(
        {
          id: 'x',
          name: 'BULL RUN',
          feed: [{ id: 1, kind: 'duel', who: 'A', detail: 'abcd', expiresAt }],
        },
        now,
      )?.feed ?? [];

    expect(of(now + 60_000).length).toBe(1);
    expect(of(now - 1)).toEqual([]);
    // and one with no deadline at all is not an invitation
    expect(
      cleanCorp({ id: 'x', name: 'N', feed: [{ id: 1, kind: 'duel', who: 'A' }] }, now)?.feed,
    ).toEqual([]);
  });
});
