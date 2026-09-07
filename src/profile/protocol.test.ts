import { describe, expect, it } from 'vitest';
import {
  cleanClaim,
  cleanProfile,
  cleanTops,
  mergeTops,
  mergeWins,
  nextRung,
  setOf,
  topsOf,
  wearable,
} from './protocol';
import { ROOM_DONE } from '../ui/renovation';
import { LEAGUE_COUNT } from '../ui/leagues';

/**
 * The wire between the game and the wardrobe the server keeps. Everything here
 * is about the two ends disagreeing — an old build answering a new one, a save
 * from a version of the shop that allowed something this one does not — because
 * that is what a profile that outlives a browser has to survive.
 */

describe('reading a wardrobe off the wire', () => {
  it('keeps the five known slots and drops everything else', () => {
    expect(cleanTops({ torso: 'rare', pockets: 'legend', hat: 'nonsense' })).toEqual({
      torso: 'rare',
    });
  });

  it('answers with an empty wardrobe for anything that is not one', () => {
    expect(cleanTops(null)).toEqual({});
    expect(cleanTops('legend')).toEqual({});
    expect(cleanTops(7)).toEqual({});
  });
});

describe('a set of item ids and one rarity a slot', () => {
  it('goes round the loop unchanged when the ladder is whole', () => {
    const owned = new Set(['torso-common', 'torso-uncommon', 'hat-common']);
    expect(topsOf(owned)).toEqual({ torso: 'uncommon', hat: 'common' });
    expect(setOf(topsOf(owned))).toEqual(owned);
  });

  it('fills in the rungs an old save skipped rather than taking anything away', () => {
    // the shop used to let a slot be climbed out of order, and cannot draw it
    expect([...setOf(topsOf(new Set(['neck-mythic'])))].sort()).toEqual([
      'neck-common',
      'neck-mythic',
      'neck-rare',
      'neck-uncommon',
    ]);
  });

  it('has nothing to say about a bare wardrobe', () => {
    expect(topsOf(new Set())).toEqual({});
    expect(setOf({})).toEqual(new Set());
  });
});

describe('what may be worn', () => {
  it('drops a slot that is not owned at all', () => {
    expect(wearable({}, { hat: 'common' })).toEqual({});
  });

  it('comes down to the top rung rather than refusing the outfit', () => {
    expect(wearable({ hat: 'uncommon' }, { hat: 'legend' })).toEqual({ hat: 'uncommon' });
  });

  it('leaves a legitimate outfit alone', () => {
    expect(wearable({ hat: 'legend' }, { hat: 'rare' })).toEqual({ hat: 'rare' });
  });
});

describe('the next rung of a slot', () => {
  it('is the bottom one on a bare slot and nothing on a finished one', () => {
    expect(nextRung({}, 'hat')).toBe('common');
    expect(nextRung({ hat: 'mythic' }, 'hat')).toBe('legend');
    expect(nextRung({ hat: 'legend' }, 'hat')).toBeNull();
  });
});

describe('merging two wardrobes', () => {
  it('keeps the better rung of each slot', () => {
    expect(mergeTops({ hat: 'rare', neck: 'common' }, { hat: 'common', torso: 'legend' })).toEqual({
      hat: 'rare',
      neck: 'common',
      torso: 'legend',
    });
  });
});

describe('a claim, before the server is asked to believe it', () => {
  const claim = (raw: unknown) => cleanClaim(raw, LEAGUE_COUNT);

  it('clamps the room to the steps that exist', () => {
    expect(claim({ room: 99 }).room).toBe(ROOM_DONE);
    expect(claim({ room: -4 }).room).toBe(0);
  });

  it('cannot claim to be wearing what it does not claim to own', () => {
    expect(claim({ owned: {}, outfit: { hat: 'legend' } }).outfit).toEqual({});
  });

  it('pads a ladder from a shorter one and cuts a longer one down', () => {
    expect(claim({ wins: [4, 2] }).wins).toEqual([4, 2, ...Array(LEAGUE_COUNT - 2).fill(0)]);
    expect(claim({ wins: Array(99).fill(1) }).wins).toHaveLength(LEAGUE_COUNT);
    expect(claim({ wins: [-3, 'x'] }).wins[0]).toBe(0);
  });

  it('survives a save that is not there at all', () => {
    expect(claim(undefined)).toEqual({
      stars: 0,
      room: 0,
      owned: {},
      outfit: {},
      wins: Array(LEAGUE_COUNT).fill(0),
    });
  });
});

describe('a profile coming back', () => {
  it('is nothing at all when the answer has no stars in it', () => {
    expect(cleanProfile({ room: 3 }, LEAGUE_COUNT)).toBeNull();
    expect(cleanProfile(null, LEAGUE_COUNT)).toBeNull();
  });

  it('trims an outfit the wardrobe does not cover, and squares the ladder up', () => {
    const p = cleanProfile(
      {
        stars: 5,
        earned: 9,
        spent: 4,
        room: 2,
        owned: { hat: 'common' },
        outfit: { hat: 'legend' },
        wins: [3],
      },
      LEAGUE_COUNT,
    );
    expect(p).toEqual({
      stars: 5,
      earned: 9,
      spent: 4,
      room: 2,
      owned: { hat: 'common' },
      outfit: { hat: 'common' },
      wins: [3, ...Array(LEAGUE_COUNT - 1).fill(0)],
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
