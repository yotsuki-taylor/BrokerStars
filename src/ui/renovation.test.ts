import { describe, expect, it } from 'vitest';
import { CONFIG } from '../sim/config';
import { createMatch } from '../sim/match';
import { PRICES } from './wardrobe';
import {
  ROOM_CASH_TOTAL,
  ROOM_DONE,
  ROOM_STEPS,
  roomCash,
  roomLayers,
  stepIndexOf,
} from './renovation';

/**
 * The renovation stopped being decoration, so its table stopped being trivia:
 * two of these numbers are now the difference between the book the player
 * opens a match on and the one their rival does.
 */
describe('the office', () => {
  it('pays what the design says it pays', () => {
    // The whole of it, and the number the tour quotes at the player.
    expect(ROOM_CASH_TOTAL).toBe(700);
    // A seventh of the opening book: felt, and under what the best single
    // garment in the game is worth over a match. See the comment on the table.
    expect(ROOM_CASH_TOTAL / CONFIG.match.startingCash).toBeCloseTo(0.07, 10);
  });

  it('climbs a rung of 25 and never flattens out', () => {
    ROOM_STEPS.forEach((s, i) => expect(s.cash, s.slot).toBe(25 * (i + 1)));
  });

  it('keeps the cheap first step the generous one', () => {
    // Dollars per coin. The first step is the best bargain in the table by a
    // wide margin and the rest settle around two thirds of a dollar a coin —
    // the same shape as the rarity ladder, where common 50 buys more per coin
    // than legend 600. A table that ever inverted this would make the last
    // poster the efficient purchase and the tutorial-for-spending the trap.
    const perCoin = ROOM_STEPS.map((s) => s.cash / s.price);
    const first = perCoin[0];
    expect(first).toBeGreaterThan(1);
    for (let i = 1; i < perCoin.length; i++) {
      expect(perCoin[i], ROOM_STEPS[i].slot).toBeLessThan(first * 0.75);
    }
    expect(perCoin[perCoin.length - 1]).toBeLessThan(first);
  });

  it('keeps the prices where the room-versus-wardrobe balance put them', () => {
    // Both of these are the reason the cash column exists rather than a price
    // cut, so a change to one of them is a change to the whole argument.
    expect(ROOM_STEPS.reduce((n, s) => n + s.price, 0)).toBe(1000);
    expect(Math.max(...ROOM_STEPS.map((s) => s.price))).toBeLessThanOrEqual(PRICES.uncommon + 50);
    expect(Math.min(...ROOM_STEPS.map((s) => s.price))).toBeLessThan(PRICES.common);
  });

  it('adds the steps up, and only the ones that are finished', () => {
    expect(roomCash(0)).toBe(0);
    expect(roomCash(1)).toBe(ROOM_STEPS[0].cash);
    expect(roomCash(3)).toBe(ROOM_STEPS[0].cash + ROOM_STEPS[1].cash + ROOM_STEPS[2].cash);
    expect(roomCash(ROOM_DONE)).toBe(ROOM_CASH_TOTAL);
  });

  it('cannot be talked into paying for an office nobody has', () => {
    // It reads a count off a profile, and a profile is a thing the client
    // sends: the clamp is the whole defence.
    expect(roomCash(99)).toBe(ROOM_CASH_TOTAL);
    expect(roomCash(-4)).toBe(0);
    expect(roomCash(2.9)).toBe(roomCash(2));
    expect(roomCash(NaN)).toBe(0);
    expect(roomCash(undefined as unknown as number)).toBe(0);
  });

  it('is what the match actually opens on', () => {
    const start = CONFIG.match.startingCash + roomCash(ROOM_DONE);
    const st = createMatch(7, undefined, {
      traders: [
        { name: 'YOU', kind: 'human', preset: 'medium', startCash: start },
        // the bot never renovated and never will: the asymmetry is the reward
        { name: 'RIVAL', kind: 'bot', preset: 'medium' },
      ],
    });
    const [me, rival] = st.traders;
    expect(me.cash).toBe(start);
    expect(me.startCash).toBe(start);
    expect(me.netWorth).toBe(start);
    expect(me.netWorthHistory).toEqual([start]);
    expect(rival.startCash).toBe(CONFIG.match.startingCash);
    expect(me.startCash - rival.startCash).toBe(ROOM_CASH_TOTAL);
  });

  it('draws a slot as soon as its step is paid for', () => {
    // The cash column sits in the same rows as the sprites, so a step that
    // pays has to be a step that shows.
    const desk = stepIndexOf('table');
    const before = roomLayers(desk).find((l) => l.key === 'table');
    const after = roomLayers(desk + 1).find((l) => l.key === 'table');
    expect(before).toBeUndefined();
    expect(after?.url).not.toMatch(/_poor/);
  });
});
