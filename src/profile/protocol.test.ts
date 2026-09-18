import { describe, expect, it } from 'vitest';
import {
  cleanClaim,
  cleanOwned,
  cleanProfile,
  listOf,
  mergeOwned,
  mergeWins,
  setOf,
  topOf,
  wearable,
  NICK_MAX,
  cleanNick,
  nickKey,
} from './protocol';
import { NO_OFFER } from '../shop/protocol';
import { ROOM_DONE } from '../ui/renovation';
import { LEAGUE_COUNT } from '../ui/leagues';
import { COMPANIES } from '../sim/companies';

/**
 * The wire between the game and the wardrobe the server keeps. Everything here
 * is about the two ends disagreeing — an old build answering a new one, a save
 * from a version of the shop that allowed something this one does not — because
 * that is what a profile that outlives a browser has to survive.
 */

describe('reading a wardrobe off the wire', () => {
  it('keeps the garments this build knows and drops everything else', () => {
    expect(cleanOwned(['torso-rare', 'pockets-legend', 'hat-nonsense', 7])).toEqual(['torso-rare']);
  });

  it('says the same garment once however many times it was sent', () => {
    expect(cleanOwned(['hat-common', 'hat-common'])).toEqual(['hat-common']);
  });

  it('answers with an empty wardrobe for anything that is not one', () => {
    expect(cleanOwned(null)).toEqual([]);
    expect(cleanOwned('legend')).toEqual([]);
    expect(cleanOwned(7)).toEqual([]);
  });

  it('reads a row from before the shop stopped being a ladder', () => {
    // one rarity per slot used to mean the rungs under it were paid for too,
    // so an old save is expanded into the whole prefix it stood for
    expect(cleanOwned({ neck: 'rare', torso: 'common' }).sort()).toEqual([
      'neck-common',
      'neck-rare',
      'neck-uncommon',
      'torso-common',
    ]);
    expect(cleanOwned({ hat: 'nonsense', pockets: 'legend' })).toEqual([]);
  });
});

describe('a Set here and a list on the wire', () => {
  it('goes round the loop unchanged, holes and all', () => {
    const owned = new Set(['torso-legend', 'hat-common']);
    expect(setOf(listOf(owned))).toEqual(owned);
  });

  it('has nothing to say about a bare wardrobe', () => {
    expect(listOf(new Set())).toEqual([]);
    expect(setOf([])).toEqual(new Set());
  });
});

describe('what may be worn', () => {
  it('drops a slot that is not owned at all', () => {
    expect(wearable([], { hat: 'common' })).toEqual({});
  });

  it('drops a garment that is not in the wardrobe rather than rounding it down', () => {
    // the ladder used to make this a legitimate outfit trimmed to the top rung;
    // a wardrobe with holes in it has no rung to come down to
    expect(wearable(['hat-uncommon'], { hat: 'legend' })).toEqual({});
  });

  it('leaves a legitimate outfit alone, however it was arrived at', () => {
    expect(wearable(['hat-legend'], { hat: 'legend' })).toEqual({ hat: 'legend' });
  });
});

describe('the best of a slot', () => {
  it('is the dearest thing in it, with or without anything under it', () => {
    expect(topOf([], 'hat')).toBeNull();
    expect(topOf(['hat-common', 'hat-mythic'], 'hat')).toBe('mythic');
    expect(topOf(['hat-legend'], 'hat')).toBe('legend');
    expect(topOf(['neck-legend'], 'hat')).toBeNull();
  });
});

describe('merging two wardrobes', () => {
  it('keeps everything either of them bought', () => {
    expect(mergeOwned(['hat-rare', 'neck-common'], ['hat-rare', 'torso-legend']).sort()).toEqual([
      'hat-rare',
      'neck-common',
      'torso-legend',
    ]);
  });
});

describe('a claim, before the server is asked to believe it', () => {
  const claim = (raw: unknown) => cleanClaim(raw, LEAGUE_COUNT);

  it('clamps the room to the steps that exist', () => {
    expect(claim({ room: 99 }).room).toBe(ROOM_DONE);
    expect(claim({ room: -4 }).room).toBe(0);
  });

  it('cannot claim to be wearing what it does not claim to own', () => {
    expect(claim({ owned: [], outfit: { hat: 'legend' } }).outfit).toEqual({});
  });

  it('pads a ladder from a shorter one and cuts a longer one down', () => {
    expect(claim({ wins: [4, 2] }).wins).toEqual([4, 2, ...Array(LEAGUE_COUNT - 2).fill(0)]);
    expect(claim({ wins: Array(99).fill(1) }).wins).toHaveLength(LEAGUE_COUNT);
    expect(claim({ wins: [-3, 'x'] }).wins[0]).toBe(0);
  });

  it('keeps only companies this build has heard of', () => {
    expect(claim({ seen: [COMPANIES[0].id, 'ghost-corp'] }).seen).toEqual([COMPANIES[0].id]);
  });

  it('survives a save that is not there at all', () => {
    expect(claim(undefined)).toEqual({
      coins: 0,
      room: 0,
      owned: [],
      outfit: {},
      wins: Array(LEAGUE_COUNT).fill(0),
      seen: [],
    });
  });
});

describe('a profile coming back', () => {
  it('is nothing at all when the answer has no coins in it', () => {
    expect(cleanProfile({ room: 3 }, LEAGUE_COUNT)).toBeNull();
    expect(cleanProfile(null, LEAGUE_COUNT)).toBeNull();
  });

  it('trims an outfit the wardrobe does not cover, and squares the ladder up', () => {
    const p = cleanProfile(
      {
        coins: 5,
        earned: 9,
        spent: 4,
        room: 2,
        owned: ['hat-common'],
        outfit: { hat: 'legend' },
        wins: [3],
        awards: { bust: 1700, 'not-an-award': 1700 },
        duelWins: 2,
        streak: 1,
        seen: [COMPANIES[0].id, 'ghost-corp'],
        dollars: 2000,
        portfolio: {
          [COMPANIES[0].id]: { shares: 4, cost: 3000, day: 19_990 },
          'ghost-corp': { shares: 9, cost: 9, day: 19_990 },
        },
        daily: {
          day: 20_000,
          bonus: true,
          progress: { 'win-1': 1, ghost: 9 },
          taken: ['ghost'],
          orders: 2,
        },
        bestNetWorth: 31_000,
        topLeague: 1,
      },
      LEAGUE_COUNT,
    );
    expect(p).toEqual({
      coins: 5,
      earned: 9,
      spent: 4,
      room: 2,
      owned: ['hat-common'],
      outfit: {},
      // A deployment from before the shop had a shelf sends none, which reads
      // as a shelf from before every real day and rolls on the next request.
      offer: NO_OFFER,
      wins: [3, ...Array(LEAGUE_COUNT - 1).fill(0)],
      // an award this build does not have is dropped rather than drawn as a
      // blank row, and so is a company it does not have
      awards: { bust: 1700 },
      duelWins: 2,
      streak: 1,
      seen: [COMPANIES[0].id],
      dollars: 2000,
      // nobody chose a name in this answer, which is what a player wearing the
      // one their host gave them looks like
      nick: null,
      // a share in a company this build does not have goes the same way
      portfolio: { [COMPANIES[0].id]: { shares: 4, cost: 3000, day: 19_990 } },
      // a quest this build does not have goes the way the award did, out of
      // the progress AND out of what has been cashed in
      // `orders` went in and does not come out: the day counted them until the
      // counter was removed, and a stored row that still carries one is not a
      // reason to keep drawing it
      daily: {
        day: 20_000,
        bonus: true,
        progress: { 'win-1': 1 },
        taken: [],
      },
      bestNetWorth: 31_000,
      topLeague: 1,
    });
  });
});

describe('merging two ladders', () => {
  it('keeps the better count of each league', () => {
    expect(mergeWins([3, 0, 1], [1, 5, 0])).toEqual([3, 5, 1]);
  });

  it('is as long as the ladder being merged into', () => {
    expect(mergeWins([0, 0], [9, 9, 9, 9])).toEqual([9, 9]);
  });
});

/**
 * A name somebody typed, and the rules it has to clear before anybody else
 * sees it. The shape rules are the corporation's — same alphabet, same word
 * list — and the lengths are a person's.
 */
describe('a name of one’s own', () => {
  it('takes a name and squares it up', () => {
    expect(cleanNick('  max   power ')).toBe('MAX POWER');
    expect(cleanNick('JO')).toBe('JO');
    // the alphabet a game that is half in Russian ought to let a player type
    expect(cleanNick('макс')).toBe('МАКС');
    expect(cleanNick('max-power')).toBe('MAX-POWER');
  });

  it('refuses what it cannot show, rather than tidying it into something else', () => {
    expect(cleanNick('J')).toBeNull();
    expect(cleanNick('A'.repeat(NICK_MAX + 1))).toBeNull();
    expect(cleanNick('max!')).toBeNull();
    expect(cleanNick('😀😀')).toBeNull();
    expect(cleanNick('--')).toBeNull();
    expect(cleanNick(null)).toBeNull();
  });

  /** Uniqueness is decided on the key, so spacing cannot buy a second copy. */
  it('sees through spaces when deciding whether somebody has that name', () => {
    expect(nickKey(cleanNick('max power')!)).toBe(nickKey(cleanNick('MAXPOWER')!));
    expect(nickKey('MAX POWER')).toBe('MAXPOWER');
  });

  /**
   * Nor can a keyboard layout. Thirteen Cyrillic capitals are the same picture
   * as Latin ones, so without this a name could be taken twice and nobody
   * looking at the two rows could say which was which.
   */
  it('sees through the alphabet a name was typed in', () => {
    // every letter of МАКС is Cyrillic; every letter of MAKC is Latin
    expect(nickKey('МАКС')).toBe(nickKey('MAKC'));
    expect(nickKey('РАУРАL')).toBe(nickKey('PAYPAL'));
    // and a name that only LOOKS different is still different
    expect(nickKey('МАКС')).not.toBe(nickKey('MAX'));
  });

  /**
   * Digits are left alone on purpose: M4X reads differently from MAX, so it is
   * a stylised name rather than a forged one, and folding it would cost real
   * names to catch nobody.
   */
  it('leaves a digit standing in for a letter alone', () => {
    expect(nickKey('M4X')).not.toBe(nickKey('MAX'));
    expect(nickKey('MAX 100')).not.toBe(nickKey('MAX IOO'));
  });

  /** The word list reads the folded form too, or one Cyrillic С undoes it. */
  it('catches a banned word spelled in two alphabets', () => {
    expect(cleanNick('FUСK')).toBeNull();
    expect(cleanNick('АДМИН')).toBeNull();
  });
});
