import { describe, expect, it } from 'vitest';
import { EMPTY, type Held } from '../src/profile';
import {
  afterChange,
  afterMatch,
  grant,
  satisfied,
  withSeen,
  type MatchFacts,
  type Standing,
} from '../src/awards';
import { AWARDS, AWARD_IDS } from '../../src/awards/catalogue';
import { COMPANIES } from '../../src/sim/companies';
import { ROOM_DONE } from '../../src/ui/renovation';

/**
 * The shelf. Every rule that decides whether somebody has earned something is a
 * pure function of a profile and a match, so none of this needs a database.
 *
 * The property worth guarding hardest is the last block: an award, once given,
 * is never taken back. Half of them read state that can go backwards — the
 * developer refunds a hat, a streak breaks — and an award that comes off is not
 * an award.
 */

const held = (over: Partial<Held> = {}): Held => ({ ...EMPTY, ...over });
const at = (over: Partial<Standing> = {}): Standing => ({
  bestNetWorth: 0,
  topLeague: 0,
  ...over,
});
const match = (over: Partial<MatchFacts> = {}): MatchFacts => ({
  outcome: 'win',
  netWorth: 12_000,
  tradedWell: false,
  bankrupt: false,
  trades: 4,
  duel: false,
  ...over,
});

const NOW = 1_700_000_000_000;

describe('the catalogue itself', () => {
  it('has no two awards under one id', () => {
    expect(new Set(AWARD_IDS).size).toBe(AWARD_IDS.length);
  });

  it('gives every tiered award the number it is judged by', () => {
    for (const a of AWARDS) {
      if (a.group === 'money' || a.group === 'duel') expect(a.goal).toBeGreaterThan(0);
      if (a.group === 'league') expect(a.league).toBeGreaterThan(0);
    }
  });
});

describe('money on the whistle', () => {
  it('is measured against the best match ever, not the one just played', () => {
    // a bad match does not take away what an earlier good one earned
    const out = satisfied(EMPTY, at({ bestNetWorth: 31_000 }), match({ netWorth: 900 }));
    expect(out).toContain('nw-20k');
    expect(out).toContain('nw-30k');
    expect(out).not.toContain('nw-50k');
  });

  it('gives nothing at the starting cash', () => {
    expect(satisfied(EMPTY, at({ bestNetWorth: 10_000 }))).not.toContain('nw-20k');
  });

  it('gives the whole ladder at the top of it', () => {
    const out = satisfied(EMPTY, at({ bestNetWorth: 80_000 }));
    expect(out).toEqual(expect.arrayContaining(['nw-20k', 'nw-30k', 'nw-50k', 'nw-75k']));
  });
});

describe('duels', () => {
  it('counts only duels won, not matches won', () => {
    let h = EMPTY;
    for (let i = 0; i < 3; i++) h = afterMatch(h, at(), match({ duel: false }), NOW);
    expect(h.duelWins).toBe(0);
    expect(h.awards['duel-1']).toBeUndefined();

    h = afterMatch(h, at(), match({ duel: true }), NOW);
    expect(h.duelWins).toBe(1);
    expect(h.awards['duel-1']).toBe(NOW);
  });

  it('does not count a duel that was lost', () => {
    const h = afterMatch(EMPTY, at(), match({ duel: true, outcome: 'loss' }), NOW);
    expect(h.duelWins).toBe(0);
  });

  it('opens the higher rungs on the way past', () => {
    const h = held({ duelWins: 10 });
    expect(satisfied(h, at())).toEqual(expect.arrayContaining(['duel-1', 'duel-3', 'duel-10']));
  });
});

describe('the ladder', () => {
  it('is earned by having played there, and only up to where you got', () => {
    const out = satisfied(EMPTY, at({ topLeague: 2 }));
    expect(out).toContain('league-silver');
    expect(out).toContain('league-gold');
    expect(out).not.toContain('league-global');
  });

  it('gives nothing for the league everybody starts in', () => {
    expect(satisfied(EMPTY, at({ topLeague: 0 }))).not.toContain('league-silver');
  });
});

describe('the wardrobe and the room', () => {
  it('wants all five slots for DRESSED, not four', () => {
    const four = held({ owned: { hat: 'common', neck: 'common', torso: 'common', hand: 'common' } });
    expect(satisfied(four, at())).not.toContain('dressed');
    expect(satisfied(held({ owned: { ...four.owned, access: 'common' } }), at())).toContain(
      'dressed',
    );
  });

  it('wants a legend in some slot, whichever', () => {
    expect(satisfied(held({ owned: { hand: 'mythic' } }), at())).not.toContain('legend-item');
    expect(satisfied(held({ owned: { hand: 'legend' } }), at())).toContain('legend-item');
  });

  it('wants the room finished, not merely started', () => {
    expect(satisfied(held({ room: ROOM_DONE - 1 }), at())).not.toContain('room-done');
    expect(satisfied(held({ room: ROOM_DONE }), at())).toContain('room-done');
  });
});

describe('the secret half', () => {
  it('gives BUST for going broke, whatever the number says', () => {
    // not read off a net worth of zero: a PRESSED SHIRT leaves a tenth of it
    const h = afterMatch(EMPTY, at(), match({ outcome: 'loss', bankrupt: true, netWorth: 1000 }), NOW);
    expect(h.awards.bust).toBe(NOW);
  });

  it('gives HONEST LOSS only for clearing the bar and losing anyway', () => {
    expect(satisfied(EMPTY, at(), match({ tradedWell: true, outcome: 'loss' }))).toContain(
      'honest-loss',
    );
    expect(satisfied(EMPTY, at(), match({ tradedWell: true, outcome: 'win' }))).not.toContain(
      'honest-loss',
    );
  });

  it('gives PYRRHIC for winning below the starting cash', () => {
    expect(satisfied(EMPTY, at(), match({ outcome: 'win', netWorth: 9_999 }))).toContain('pyrrhic');
    expect(satisfied(EMPTY, at(), match({ outcome: 'win', netWorth: 10_000 }))).not.toContain(
      'pyrrhic',
    );
  });

  it('gives NO TRADES only for a win nobody touched', () => {
    expect(satisfied(EMPTY, at(), match({ trades: 0 }))).toContain('no-trades');
    expect(satisfied(EMPTY, at(), match({ trades: 1 }))).not.toContain('no-trades');
    expect(satisfied(EMPTY, at(), match({ trades: 0, outcome: 'loss' }))).not.toContain('no-trades');
  });

  it('counts a streak, and breaks it on anything that is not a win', () => {
    let h = afterMatch(EMPTY, at(), match(), NOW);
    h = afterMatch(h, at(), match(), NOW);
    expect(h.streak).toBe(2);
    expect(h.awards['streak-3']).toBeUndefined();

    h = afterMatch(h, at(), match(), NOW);
    expect(h.streak).toBe(3);
    expect(h.awards['streak-3']).toBe(NOW);

    h = afterMatch(h, at(), match({ outcome: 'loss' }), NOW);
    expect(h.streak).toBe(0);
    // and the award it already earned stays on the shelf
    expect(h.awards['streak-3']).toBe(NOW);
  });

  it('gives ALL COMPANIES for the whole roster and not one short', () => {
    const ids = COMPANIES.map((c) => c.id);
    expect(satisfied(held({ seen: ids.slice(0, -1) }), at())).not.toContain('all-companies');
    expect(satisfied(held({ seen: ids }), at())).toContain('all-companies');
  });
});

describe('filing the companies met', () => {
  it('adds what is new and ignores what is not a company', () => {
    const h = withSeen(EMPTY, [COMPANIES[0].id, 'not-a-company', COMPANIES[0].id]);
    expect(h.seen).toEqual([COMPANIES[0].id]);
  });

  it('hands the same profile back when there is nothing new', () => {
    const h = withSeen(EMPTY, [COMPANIES[0].id]);
    expect(withSeen(h, [COMPANIES[0].id])).toBe(h);
  });
});

describe('once earned, never lost', () => {
  it('keeps the date of the first time, not the latest', () => {
    const first = grant(EMPTY, ['bust'], 1000);
    expect(grant(first, ['bust'], 9999).awards.bust).toBe(1000);
  });

  it('survives the state that earned it going backwards', () => {
    // the developer refunds the legend, and DRESSED does not evaporate with it
    const dressed = afterChange(
      held({ owned: { hat: 'legend', neck: 'common', torso: 'common', hand: 'common', access: 'common' } }),
      at(),
      NOW,
    );
    expect(dressed.awards.dressed).toBe(NOW);
    expect(dressed.awards['legend-item']).toBe(NOW);

    const stripped = afterChange({ ...dressed, owned: { hat: 'common' } }, at(), NOW);
    expect(stripped.awards.dressed).toBe(NOW);
    expect(stripped.awards['legend-item']).toBe(NOW);
  });

  it('hands the same profile back when nothing new was earned', () => {
    const h = afterChange(held({ room: ROOM_DONE }), at(), NOW);
    expect(afterChange(h, at(), NOW)).toBe(h);
  });
});
