import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig, type Config } from './config';
import {
  ABILITIES,
  ABILITY_IDS,
  canUseAbility,
  isBlocked,
  isFrozen,
  isHit,
  useAbility,
  type AbilityId,
} from './abilities';
import { createMatch, step } from './match';
import { applyAction, plannedQty } from './trading';
import type { MatchState } from './types';

/** Two humans, so nothing fires except what a test fires itself. */
function table(mine: AbilityId | null, theirs: AbilityId | null = null, cfg: Config = CONFIG) {
  return createMatch(4, cfg, {
    traders: [
      { name: 'ME', kind: 'human', preset: 'medium', ability: mine },
      { name: 'YOU', kind: 'human', preset: 'medium', ability: theirs },
    ],
  });
}

const buy = (s: MatchState, trader: number, stock = 0, fraction = 0.25) =>
  applyAction(s, { trader, stock, side: 'buy', fraction });

const secondsInTicks = (s: MatchState, seconds: number) =>
  Math.round((seconds * 1000) / s.cfg.match.tickMs);

describe('carrying an ability', () => {
  it('gives a bare neck nothing to press', () => {
    const s = table(null);
    expect(canUseAbility(s, 0)).toBe(false);
    expect(useAbility(s, 0)).toBe(false);
  });

  it('spends it once and not twice', () => {
    const s = table('static');
    expect(useAbility(s, 0)).toBe(true);
    expect(s.traders[0].abilityUsed).toBe(true);
    expect(canUseAbility(s, 0)).toBe(false);
    expect(useAbility(s, 0)).toBe(false);
  });

  it('does not spend it on a tap that could not land', () => {
    // RUMOUR needs a position of your own and HALT one of theirs; with an empty
    // board both are dead taps, and a dead tap must not cost the use
    for (const id of ['rumour', 'halt'] as const) {
      const s = table(id);
      expect(canUseAbility(s, 0)).toBe(false);
      expect(useAbility(s, 0)).toBe(false);
      expect(s.traders[0].abilityUsed).toBe(false);
    }
  });

  it('runs for the seconds the card promises', () => {
    const s = table('static');
    useAbility(s, 0);
    const span = secondsInTicks(s, ABILITIES.static.seconds);
    for (let i = 0; i < span; i++) {
      expect(isBlocked(s, 1)).toBe(true);
      step(s);
    }
    expect(isBlocked(s, 1)).toBe(false);
  });
});

describe('STATIC', () => {
  it('stops the other one opening anything, and lets them out of what they hold', () => {
    const s = table('static');
    buy(s, 1);
    const held = s.traders[1].positions[0];
    expect(held).toBeGreaterThan(0);
    useAbility(s, 0);

    // no new position, in either direction, in any company
    expect(plannedQty(s, { trader: 1, stock: 1, side: 'buy', fraction: 0.25 })).toBe(0);
    expect(plannedQty(s, { trader: 1, stock: 1, side: 'sell', fraction: 0.25 })).toBe(0);
    // and not more of the one they have
    expect(plannedQty(s, { trader: 1, stock: 0, side: 'buy', fraction: 0.25 })).toBe(0);
    // but the way out stays open
    expect(applyAction(s, { trader: 1, stock: 0, side: 'sell', fraction: 1 })).not.toBeNull();
    expect(s.traders[1].positions[0]).toBe(0);
  });

  it('leaves the trader who fired it free to trade', () => {
    const s = table('static');
    useAbility(s, 0);
    expect(buy(s, 0)).not.toBeNull();
  });
});

describe('HALT', () => {
  it('shuts the company the other one is deepest in, for both of them', () => {
    const s = table('halt');
    buy(s, 1, 2, 0.5);
    useAbility(s, 0);
    expect(isFrozen(s, 2)).toBe(true);

    // neither side can touch it, in either direction, even to get out
    for (const trader of [0, 1]) {
      for (const side of ['buy', 'sell'] as const) {
        expect(plannedQty(s, { trader, stock: 2, side, fraction: 1 })).toBe(0);
      }
    }
    // the rest of the board is untouched
    expect(buy(s, 0, 0)).not.toBeNull();
    expect(buy(s, 1, 0)).not.toBeNull();
  });
});

describe('DOSSIER', () => {
  it('opens the other book and touches nothing else', () => {
    const s = table('dossier');
    useAbility(s, 0);
    expect(s.abilities.seesBook[0]).toBe(true);
    expect(s.abilities.seesBook[1]).toBe(false);
    expect(isBlocked(s, 1)).toBe(false);
    expect(buy(s, 1)).not.toBeNull();
  });
});

describe('MARGIN CALL', () => {
  it('flattens the other book where it stands and books what it made', () => {
    const s = table('margincall');
    buy(s, 1, 0, 0.5);
    buy(s, 1, 1, 0.5);
    s.stocks[0].price *= 1.2;
    const tradesBefore = s.traders[1].trades.length;

    useAbility(s, 0);
    expect(s.traders[1].positions.every((p) => p === 0)).toBe(true);
    // it closes through the ordinary trading path, so the P&L is really booked
    const closes = s.traders[1].trades.slice(tradesBefore);
    expect(closes).toHaveLength(2);
    expect(closes.some((t) => t.realized > 0)).toBe(true);
  });

  it('reaches a book that a halt has frozen', () => {
    const s = table('margincall', 'halt');
    buy(s, 0, 1, 0.5);
    buy(s, 1, 0, 0.5);
    // they freeze the company I am in, then I call them anyway
    useAbility(s, 1);
    expect(isFrozen(s, 1)).toBe(true);
    useAbility(s, 0);
    expect(s.traders[1].positions[0]).toBe(0);
  });

  it('does nothing at all to an empty book', () => {
    const s = table('margincall');
    const before = s.traders[1].cash;
    expect(useAbility(s, 0)).toBe(true);
    expect(s.traders[1].cash).toBe(before);
    expect(s.traders[1].trades).toHaveLength(0);
  });
});

describe('RUMOUR', () => {
  const drift = (id: AbilityId | null, dir: 'long' | 'short') => {
    // no noise and no drift, so whatever the price does is the ability
    const cfg = cloneConfig();
    for (const c of cfg.stocks) {
      c.noiseSigma = 0;
      c.driftPerStrength = 0;
      c.meanReversion = 0;
    }
    cfg.flags.marketImpact = false; // keep the opening trade from moving it
    const s = table(id, null, cfg);
    applyAction(s, { trader: 0, stock: 0, side: dir === 'long' ? 'buy' : 'sell', fraction: 0.5 });
    const from = s.stocks[0].price;
    if (id) expect(useAbility(s, 0)).toBe(true);
    for (let i = 0; i < 12; i++) step(s);
    return s.stocks[0].price / from - 1;
  };

  it('leans the price the way the position wants, and only while it runs', () => {
    expect(drift('rumour', 'long')).toBeGreaterThan(0.02);
    expect(drift('rumour', 'short')).toBeLessThan(-0.02);
    // the same board with nobody firing anything does not move at all
    expect(Math.abs(drift(null, 'long'))).toBeLessThan(1e-9);
  });

  it('is finite: it stops pushing, and the move it made settles', () => {
    // The impact channel is a push, not an offset — stepPrice adds the impact
    // to the price every tick — so a rumour relocates a price the way a large
    // order does, and the impact it printed keeps feeding in for a few seconds
    // after the ability itself is over. What matters is that it ends: the
    // injection stops on time and the price converges instead of running away.
    const cfg = cloneConfig();
    for (const c of cfg.stocks) {
      c.noiseSigma = 0;
      c.driftPerStrength = 0;
      c.meanReversion = 0;
    }
    cfg.flags.marketImpact = false;
    const s = table('rumour', null, cfg);
    applyAction(s, { trader: 0, stock: 0, side: 'buy', fraction: 0.5 });
    const from = s.stocks[0].price;
    useAbility(s, 0);
    const span = secondsInTicks(s, ABILITIES.rumour.seconds);
    for (let i = 0; i < span; i++) step(s);
    const during = s.stocks[0].price - from;
    expect(during).toBeGreaterThan(0);
    expect(s.abilities.rumour).toBeNull();

    // let the printed impact bleed out, then check the line has gone flat
    for (let i = 0; i < 40; i++) step(s);
    const settled = s.stocks[0].price;
    for (let i = 0; i < 20; i++) step(s);
    expect(Math.abs(s.stocks[0].price - settled)).toBeLessThan(during * 0.01);
  });
});

describe('what the rival sees', () => {
  it('marks a trader as hit for as long as the thing done to them lasts', () => {
    const s = table('static');
    expect(isHit(s, 1)).toBe(false);
    useAbility(s, 0);
    expect(isHit(s, 1)).toBe(true);
    expect(isHit(s, 0)).toBe(false);
    for (let i = 0; i < secondsInTicks(s, ABILITIES.static.seconds); i++) step(s);
    expect(isHit(s, 1)).toBe(false);
  });

  it('flashes on an instant one too, so a margin call is not silent', () => {
    const s = table('margincall');
    buy(s, 1);
    useAbility(s, 0);
    expect(isHit(s, 1)).toBe(true);
  });
});

describe('the bot', () => {
  it('brings and spends every ability the player can', () => {
    // Two bots, so both books are live: HALT needs an opponent holding
    // something and MARGIN CALL needs them holding something that is winning.
    // Each of these is a reading of the board rather than a timer, so a given
    // seed may never present the moment — hence several.
    for (const id of ABILITY_IDS) {
      let fired = 0;
      for (let seed = 0; seed < 12; seed++) {
        const s = createMatch(seed, CONFIG, {
          traders: [
            { name: 'A', kind: 'bot', preset: 'medium', ability: id },
            { name: 'B', kind: 'bot', preset: 'elite', ability: id },
          ],
        });
        while (!s.finished) step(s);
        if (s.traders[1].abilityUsed) fired++;
        expect(s.traders[1].ability).toBe(id);
      }
      expect(fired, `a bot never found a moment to fire ${id}`).toBeGreaterThan(0);
    }
  });

  it('never fires on the opening tick, whatever it is holding', () => {
    for (const id of ABILITY_IDS) {
      const s = createMatch(11, CONFIG, {
        traders: [
          { name: 'YOU', kind: 'human', preset: 'medium', ability: null },
          { name: 'RIVAL', kind: 'bot', preset: 'elite', ability: id },
        ],
      });
      step(s);
      expect(s.traders[1].abilityUsed, `${id} went off on tick 1`).toBe(false);
    }
  });
});

describe('a match without abilities', () => {
  it('replays exactly as it did before, tick for tick', () => {
    const prices = (s: MatchState) => s.stocks.map((x) => x.history.join(',')).join('|');
    const a = createMatch(9, CONFIG);
    const b = createMatch(9, CONFIG);
    while (!a.finished) step(a);
    while (!b.finished) step(b);
    expect(prices(a)).toBe(prices(b));
    expect(a.traders[1].trades.length).toBe(b.traders[1].trades.length);
    expect(a.traders.every((t) => t.ability === null)).toBe(true);
  });
});
