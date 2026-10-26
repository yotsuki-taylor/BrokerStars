import { describe, expect, it } from 'vitest';
import { poolFor } from '../sim/companies';
import { Rng } from '../sim/rng';
import { NO_UI_PERKS, perksFor } from '../ui/perks';
import {
  DRAFT_MS,
  LOOK_MS,
  NO_POWERS,
  STETSON_PICKS,
  TURN_MS,
  applyMove,
  openDraft,
  over,
  powersOf,
  step,
  viewFor,
  type DraftPowers,
} from './draft';

const LEAGUE = 2;
const pool = poolFor(LEAGUE);
const staple = pool.find((c) => c.staple)!;
const others = pool.filter((c) => !c.staple);
/** a legal opening board: one staple, two others */
const BOARD = [staple.id, others[0].id, others[1].id];

const powers = (p: Partial<DraftPowers>): DraftPowers => ({ ...NO_POWERS, see: true, ...p });
const rng = () => new Rng(7);

describe('powersOf', () => {
  it('reads each hat into what it may do to a shared board', () => {
    const hat = (rarity: string) => powersOf(perksFor({ hat: rarity } as any, 10_000).ui);
    expect(powersOf(NO_UI_PERKS)).toEqual(NO_POWERS);
    expect(hat('common')).toEqual({ see: true, swaps: 0, bans: 0, pins: 0, picks: 0 });
    expect(hat('uncommon')).toMatchObject({ swaps: 1, bans: 0, pins: 0 });
    expect(hat('rare')).toMatchObject({ swaps: 2, bans: 1, pins: 0 });
    expect(hat('mythic')).toMatchObject({ swaps: 2, bans: 1, pins: 1, picks: 0 });
    expect(hat('legend')).toMatchObject({ picks: STETSON_PICKS });
  });

  it('never lets a bare head see the board, whatever glasses it wears', () => {
    const p = powersOf(perksFor({ access: 'legend' } as any, 10_000).ui);
    expect(p).toEqual(NO_POWERS);
  });
});

describe('openDraft', () => {
  it('opens nothing when neither player can change the board or look at it', () => {
    expect(openDraft(LEAGUE, BOARD, [NO_POWERS, NO_POWERS], 0, rng())).toBeNull();
  });

  it('only shows the board, for a shorter while, when nobody can change it but somebody may look', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({}), NO_POWERS], 0, rng())!;
    expect(d.look).toBe(true);
    expect(d.turn).toBeNull();
    expect(d.endsAt).toBe(LOOK_MS);
    // the one looking holds it open; the one who cannot look never does
    expect(d.done).toEqual([false, true]);
    expect(viewFor(d, 0, 1000)).toMatchObject({ look: true, contested: false, turnInMs: LOOK_MS - 1000 });
  });

  it('ends the look as soon as everybody looking has said ready', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({}), powers({})], 0, rng())!;
    expect(applyMove(d, 0, { kind: 'swap', slot: 0 }, 0, rng())).toBe(false);
    expect(applyMove(d, 0, { kind: 'ready' }, 1000, rng())).toBe(true);
    expect(d.turn).toBeNull();
    expect(over(d, 1000)).toBe(false);
    expect(applyMove(d, 1, { kind: 'ready' }, 2000, rng())).toBe(true);
    expect(over(d, 2000)).toBe(true);
    expect(d.board).toEqual(BOARD);
  });

  it('ends the look on its clock if somebody never says ready', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({}), powers({})], 0, rng())!;
    expect(step(d, LOOK_MS - 1)).toBe(false);
    expect(over(d, LOOK_MS)).toBe(true);
  });

  it('gives the weaker hat the first move', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 2, bans: 1 }), powers({ swaps: 1 })], 0, rng())!;
    expect(d.turn).toBe(1);
    expect(d.endsAt).toBe(DRAFT_MS);
    expect(d.turnEndsAt).toBe(TURN_MS);
  });

  it('hands the board to the only player who can change it, and marks the other done', () => {
    const d = openDraft(LEAGUE, BOARD, [NO_POWERS, powers({ swaps: 1 })], 0, rng())!;
    expect(d.turn).toBe(1);
    expect(d.done).toEqual([true, false]);
    // and their clock is the whole phase, not a turn
    expect(viewFor(d, 1, 1000).turnInMs).toBe(DRAFT_MS - 1000);
  });
});

describe('applyMove', () => {
  it('alternates turns while both are spending', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 2 }), powers({ swaps: 2 })], 0, rng())!;
    const first = d.turn!;
    const second = first === 0 ? 1 : 0;
    expect(applyMove(d, second, { kind: 'swap', slot: 1 }, 100, rng())).toBe(false);
    expect(applyMove(d, first, { kind: 'swap', slot: 1 }, 100, rng())).toBe(true);
    expect(d.turn).toBe(second);
    expect(d.board[1]).not.toBe(BOARD[1]);
    expect(d.last).toMatchObject({ seat: first, kind: 'swap', slot: 1, from: BOARD[1] });
  });

  it('swaps one company and keeps a staple on the board', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 2 }), NO_POWERS], 0, rng())!;
    expect(applyMove(d, 0, { kind: 'swap', slot: 0 }, 0, rng())).toBe(true);
    expect(d.board[1]).toBe(BOARD[1]);
    expect(d.board[2]).toBe(BOARD[2]);
    expect(pool.find((c) => c.id === d.board[0])!.staple).toBe(true);
    expect(new Set(d.board).size).toBe(3);
  });

  it('never deals a banned company back', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ bans: 1, swaps: 2 }), NO_POWERS], 0, new Rng(1))!;
    expect(applyMove(d, 0, { kind: 'ban', slot: 1 }, 0, rng())).toBe(true);
    expect(d.banned).toEqual([BOARD[1]]);
    applyMove(d, 0, { kind: 'swap', slot: 2 }, 0, new Rng(2));
    applyMove(d, 0, { kind: 'swap', slot: 2 }, 0, new Rng(3));
    expect(d.board).not.toContain(BOARD[1]);
  });

  it('protects a pinned company from both players', () => {
    const d = openDraft(
      LEAGUE,
      BOARD,
      [powers({ pins: 1, swaps: 1 }), powers({ swaps: 1, bans: 1, picks: 1 })],
      0,
      rng(),
    )!;
    d.turn = 0;
    expect(applyMove(d, 0, { kind: 'pin', slot: 2 }, 0, rng())).toBe(true);
    expect(d.pinned[2]).toBe(0);
    expect(applyMove(d, 1, { kind: 'swap', slot: 2 }, 0, rng())).toBe(false);
    expect(applyMove(d, 1, { kind: 'ban', slot: 2 }, 0, rng())).toBe(false);
    expect(applyMove(d, 1, { kind: 'pick', slot: 2, id: others[3].id }, 0, rng())).toBe(false);
    expect(d.board[2]).toBe(BOARD[2]);
  });

  it('lets the STETSON name a company from the league, and nothing outside it', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ picks: STETSON_PICKS }), NO_POWERS], 0, rng())!;
    const outside = poolFor(4).find((c) => !pool.includes(c));
    if (outside) expect(applyMove(d, 0, { kind: 'pick', slot: 1, id: outside.id }, 0, rng())).toBe(false);
    expect(applyMove(d, 0, { kind: 'pick', slot: 1, id: BOARD[2] }, 0, rng())).toBe(false);
    expect(applyMove(d, 0, { kind: 'pick', slot: 1, id: others[4].id }, 0, rng())).toBe(true);
    expect(d.board[1]).toBe(others[4].id);
    expect(d.left[0].picks).toBe(STETSON_PICKS - 1);
  });

  it('refuses what the hat does not have', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 1 }), NO_POWERS], 0, rng())!;
    expect(applyMove(d, 0, { kind: 'ban', slot: 1 }, 0, rng())).toBe(false);
    expect(applyMove(d, 0, { kind: 'pin', slot: 1 }, 0, rng())).toBe(false);
    expect(applyMove(d, 0, { kind: 'swap', slot: 9 }, 0, rng())).toBe(false);
  });

  it('ends the phase once everybody has spent everything or said ready', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 1 }), powers({ swaps: 1 })], 0, rng())!;
    const first = d.turn!;
    const second = first === 0 ? 1 : 0;
    applyMove(d, first, { kind: 'swap', slot: 1 }, 0, rng());
    expect(over(d, 0)).toBe(false);
    expect(applyMove(d, second, { kind: 'ready' }, 0, rng())).toBe(true);
    expect(over(d, 0)).toBe(true);
  });

  it('leaves the board to the other player once one says ready, without turns', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 2 }), powers({ swaps: 2 })], 0, rng())!;
    const first = d.turn!;
    const second = first === 0 ? 1 : 0;
    applyMove(d, first, { kind: 'ready' }, 0, rng());
    expect(d.turn).toBe(second);
    expect(viewFor(d, second, 2000).turnInMs).toBe(DRAFT_MS - 2000);
    applyMove(d, second, { kind: 'swap', slot: 1 }, 0, rng());
    expect(d.turn).toBe(second);
    applyMove(d, second, { kind: 'swap', slot: 2 }, 0, rng());
    expect(over(d, 0)).toBe(true);
  });

  it('takes nothing after the clock runs out', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 2 }), NO_POWERS], 0, rng())!;
    expect(applyMove(d, 0, { kind: 'swap', slot: 1 }, DRAFT_MS, rng())).toBe(false);
    expect(over(d, DRAFT_MS)).toBe(true);
  });
});

describe('step', () => {
  it('passes a turn that ran out, and the seat keeps what it had', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 1 }), powers({ swaps: 1 })], 0, rng())!;
    const first = d.turn!;
    expect(step(d, TURN_MS - 1)).toBe(false);
    expect(step(d, TURN_MS)).toBe(true);
    expect(d.turn).toBe(first === 0 ? 1 : 0);
    expect(d.left[first].swaps).toBe(1);
    expect(d.last).toMatchObject({ seat: first, kind: 'pass' });
  });

  it('does not hurry a player who has the board to themselves', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ swaps: 2 }), NO_POWERS], 0, rng())!;
    expect(step(d, TURN_MS)).toBe(false);
    expect(d.turn).toBe(0);
    expect(viewFor(d, 0, TURN_MS).turnInMs).toBe(DRAFT_MS - TURN_MS);
  });
});

describe('viewFor', () => {
  it('writes the draft from the side of the seat it goes to', () => {
    const d = openDraft(LEAGUE, BOARD, [powers({ pins: 1 }), powers({ swaps: 1 })], 0, rng())!;
    d.turn = 0;
    applyMove(d, 0, { kind: 'pin', slot: 0 }, 1000, rng());
    const mine = viewFor(d, 0, 1000);
    const theirs = viewFor(d, 1, 1000);
    expect(mine.pinned[0]).toBe('you');
    expect(theirs.pinned[0]).toBe('rival');
    expect(mine.last?.who).toBe('you');
    expect(theirs.last?.who).toBe('rival');
    expect(theirs.turn).toBe('you');
    expect(mine.you.pins).toBe(0);
    expect(theirs.rival.pins).toBe(0);
    expect(mine.endsInMs).toBe(DRAFT_MS - 1000);
  });
});
