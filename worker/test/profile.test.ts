import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  LEAGUES,
  balance,
  bankWin,
  buyItem,
  buyRoom,
  claimInto,
  priceOf,
  refundItem,
  refundRoom,
  untouched,
  wear,
  type Held,
} from '../src/profile';
import { ROOM_DONE, ROOM_STEPS } from '../../src/ui/renovation';
import { PRICES } from '../../src/ui/wardrobe';
import { cleanClaim, setOf, topsOf } from '../../src/profile/protocol';

/**
 * The shop, as the server plays it. Every rule that decides whether a player
 * may have something, and what it costs them, is a pure function of the row —
 * so this file needs no database and none of these are integration tests.
 *
 * The one that matters most is the last block. There are players with a room
 * and a wardrobe in a `localStorage` this server has never seen, and the
 * migration is the only chance any of it gets to reach the table.
 */

const held = (over: Partial<Held> = {}): Held => ({ ...EMPTY, ...over });

describe('what is in hand', () => {
  it('is earned minus spent', () => {
    expect(balance(held({ spent: 12 }), 30)).toBe(18);
  });

  it('never goes below nothing, whatever the columns say', () => {
    expect(balance(held({ spent: 99 }), 10)).toBe(0);
  });

  it('counts what was granted outside a match', () => {
    expect(balance(held({ granted: 40, spent: 10 }), 0)).toBe(30);
  });
});

describe('buying a rung', () => {
  it('sells the next one up and wears it', () => {
    const out = buyItem(EMPTY, 100, 'torso', 'common', false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned.torso).toBe('common');
    expect(out.held.outfit.torso).toBe('common');
    expect(out.held.spent).toBe(PRICES.common);
  });

  it('refuses a rung that is not next, however rich the caller', () => {
    expect(buyItem(EMPTY, 10_000, 'torso', 'legend', false)).toEqual({
      ok: false,
      error: 'not the next rung',
    });
  });

  it('refuses one that is already owned', () => {
    const owned = held({ owned: { torso: 'common' }, spent: PRICES.common });
    expect(buyItem(owned, 100, 'torso', 'common', false).ok).toBe(false);
  });

  it('refuses what the balance does not cover', () => {
    expect(buyItem(EMPTY, PRICES.common - 1, 'torso', 'common', false)).toEqual({
      ok: false,
      error: 'not enough stars',
    });
  });

  it('charges nothing in free mode, and still hands the item over', () => {
    const out = buyItem(EMPTY, 0, 'torso', 'common', true);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.spent).toBe(0);
    expect(out.held.owned.torso).toBe('common');
  });

  it('climbs a whole slot for what the ladder says it costs', () => {
    let h = EMPTY;
    for (const r of ['common', 'uncommon', 'rare', 'mythic', 'legend'] as const) {
      const out = buyItem(h, 1000, 'hat', r, false);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      h = out.held;
    }
    expect(h.spent).toBe(4 + 7 + 12 + 20 + 40);
    expect(h.owned.hat).toBe('legend');
  });
});

describe('renovating', () => {
  it('sells the next step only', () => {
    const out = buyRoom(EMPTY, 100, false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.room).toBe(1);
    expect(out.held.spent).toBe(ROOM_STEPS[0].price);
  });

  it('refuses once the room is finished', () => {
    expect(buyRoom(held({ room: ROOM_DONE }), 10_000, false).ok).toBe(false);
  });

  it('refuses what the balance does not cover', () => {
    expect(buyRoom(EMPTY, ROOM_STEPS[0].price - 1, false).ok).toBe(false);
  });
});

describe('the developer handing things back', () => {
  it('takes the top rung and refunds it', () => {
    const h = held({ owned: { hat: 'uncommon' }, outfit: { hat: 'uncommon' }, spent: 11 });
    const out = refundItem(h, 'hat', 'uncommon');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // dropped a rung, and wearing what is left rather than what is gone
    expect(out.held.owned.hat).toBe('common');
    expect(out.held.outfit.hat).toBe('common');
    expect(out.held.spent).toBe(11 - PRICES.uncommon);
  });

  it('leaves the slot bare and bare-headed at the bottom of the ladder', () => {
    const h = held({ owned: { hat: 'common' }, outfit: { hat: 'common' }, spent: 4 });
    const out = refundItem(h, 'hat', 'common');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.owned.hat).toBeUndefined();
    expect(out.held.outfit.hat).toBeUndefined();
  });

  it('refuses anything but the top rung — a ladder cannot have a hole in it', () => {
    const h = held({ owned: { hat: 'rare' } });
    expect(refundItem(h, 'hat', 'common').ok).toBe(false);
  });

  it('cannot mint stars by refunding what was never paid for', () => {
    // bought in free mode: spent never went up, so it must not come down
    const free = buyItem(EMPTY, 0, 'hat', 'common', true);
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    const back = refundItem(free.held, 'hat', 'common');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.held.spent).toBe(0);
    expect(balance(back.held, 0)).toBe(0);
  });

  it('steps the room back and refuses to go past bare', () => {
    const out = refundRoom(held({ room: 1, spent: ROOM_STEPS[0].price }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.held.room).toBe(0);
    expect(refundRoom(EMPTY).ok).toBe(false);
  });
});

describe('getting dressed', () => {
  it('puts on what is owned', () => {
    const h = held({ owned: { torso: 'rare' } });
    expect(wear(h, { torso: 'uncommon' }).outfit).toEqual({ torso: 'uncommon' });
  });

  it('trims what is not, rather than refusing the lot', () => {
    const h = held({ owned: { torso: 'common' } });
    expect(wear(h, { torso: 'legend', hat: 'mythic' }).outfit).toEqual({ torso: 'common' });
  });
});

describe('the migration', () => {
  const claim = (over: Record<string, unknown> = {}) =>
    cleanClaim({ stars: 0, room: 0, owned: {}, outfit: {}, wins: [], ...over }, LEAGUES);

  it('takes a save at its word while the server has nothing of its own', () => {
    expect(untouched(EMPTY)).toBe(true);
    const h = claimInto(EMPTY, 0, claim({ stars: 7, room: 3, owned: { hat: 'rare' } }));
    expect(h.room).toBe(3);
    expect(h.owned.hat).toBe('rare');
    // and the stars the player could see are still there afterwards
    expect(balance(h, 0)).toBe(7);
  });

  it('books the purchases as spent, so the board is not paying for them twice', () => {
    const h = claimInto(EMPTY, 0, claim({ stars: 7, room: 3, owned: { hat: 'rare' } }));
    expect(h.spent).toBe(priceOf({ hat: 'rare' }, 3));
  });

  it('leaves a player who really did earn it all with exactly what they had', () => {
    // 40 earned on the board, 23 of it spent in the shop, 17 in hand
    const spent = priceOf({ hat: 'uncommon' }, 1);
    const h = claimInto(EMPTY, 40, claim({ stars: 40 - spent, room: 1, owned: { hat: 'uncommon' } }));
    expect(h.granted).toBe(0);
    expect(balance(h, 40)).toBe(40 - spent);
  });

  it('shuts the door behind the first save with anything in it', () => {
    const h = claimInto(EMPTY, 0, claim({ stars: 7 }));
    expect(untouched(h)).toBe(false);
  });

  it('leaves it open for a browser that turned up empty-handed', () => {
    // a cleared cache, or the desktop client where nothing was ever stored:
    // the row is opened but stays untouched, so the real save can still arrive
    expect(untouched(claimInto(EMPTY, 0, claim()))).toBe(true);
  });

  it('hands the earned stars back to a player whose save was lost', () => {
    const h = claimInto(EMPTY, 55, claim());
    expect(balance(h, 55)).toBe(55);
  });

  it('repairs a save with a hole in it rather than dropping the rungs', () => {
    // an early build let a slot be climbed out of order; the shop cannot draw
    // that, so the skipped rungs come across as bought
    const patchy = new Set(['hat-common', 'hat-rare']);
    const h = claimInto(EMPTY, 0, claim({ owned: topsOf(patchy) }));
    expect(h.owned.hat).toBe('rare');
    expect([...setOf(h.owned)].sort()).toEqual(['hat-common', 'hat-rare', 'hat-uncommon']);
  });

  it('brings the ladder across, which nothing else could reconstruct', () => {
    const h = claimInto(EMPTY, 0, claim({ wins: [7, 3] }));
    expect(h.wins.slice(0, 2)).toEqual([7, 3]);
    expect(h.wins).toHaveLength(LEAGUES);
  });

  it('counts a ladder as something worth shutting the door for', () => {
    // a save with nothing bought but three wins in it is still a save
    expect(untouched(claimInto(EMPTY, 0, claim({ wins: [3] })))).toBe(false);
  });

  it('caps a claim that has clearly been edited by hand', () => {
    const h = claimInto(EMPTY, 0, claim({ stars: 1e12 }));
    expect(balance(h, 0)).toBe(100_000);
  });
});

describe('climbing the ladder', () => {
  it('counts a win in the league it was won in', () => {
    const h = bankWin(bankWin(EMPTY, 0), 0);
    expect(h.wins[0]).toBe(2);
    expect(h.wins[1]).toBe(0);
  });

  it('ignores a league that is not on the ladder', () => {
    expect(bankWin(EMPTY, LEAGUES)).toEqual(EMPTY);
    expect(bankWin(EMPTY, -1)).toEqual(EMPTY);
    expect(bankWin(EMPTY, 1.5)).toEqual(EMPTY);
  });

  it('leaves the one it was given alone', () => {
    const before = { ...EMPTY, wins: EMPTY.wins.slice() };
    bankWin(before, 2);
    expect(before.wins[2]).toBe(0);
  });
});
