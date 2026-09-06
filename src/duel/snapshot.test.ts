import { describe, expect, it } from 'vitest';
import { useAbility } from '../sim/abilities';
import { createMatch, resign, step } from '../sim/match';
import { perksOrDefault } from '../sim/perks';
import { applyAction } from '../sim/trading';
import type { MatchState, Trade } from '../sim/types';
import { applySync, applyTick, buildMirror } from '../ui/duel';
import { snapshotFor, syncFor, type Seat } from './snapshot';

/**
 * The one thing a duel cannot get wrong.
 *
 * Both players watch a market neither of them is running, and the only thing
 * standing between them and two different charts is this: what the object
 * writes down, and what the client writes it over. So these play a real match
 * the way the Durable Object does — abilities, trades, the lot — pipe every
 * tick through the wire format into a mirror built the way the client builds
 * one, and demand the two states still agree at the whistle.
 */

const PERKS = perksOrDefault({ undos: 1, undoWindowTicks: 10 });

function liveMatch(seed = 4242): MatchState {
  return createMatch(seed, undefined, {
    traders: [
      { name: 'HOST', kind: 'human', preset: 'medium', perks: PERKS, ability: 'rumour' },
      { name: 'GUEST', kind: 'human', preset: 'medium', perks: PERKS, ability: 'margincall' },
    ],
  });
}

/** The mirror the client would build off the `setup` this match would produce. */
function mirrorOf(server: MatchState, seat: Seat): MatchState {
  const order = <T>(pair: [T, T]): [T, T] => (seat === 0 ? pair : [pair[1], pair[0]]);
  return buildMirror({
    seed: server.seed,
    stocks: server.cfg.stocks,
    names: order([server.traders[0].name, server.traders[1].name]),
    // The outfits only matter here for the perks they imply, and the two seats
    // in this match share theirs; what is being tested is the tick, not the
    // wardrobe.
    outfits: [{ torso: 'legend' }, { torso: 'legend' }],
    abilities: order([server.traders[0].ability, server.traders[1].ability]),
  });
}

/**
 * Runs a match on a "server" and mirrors it on two "clients", handing the ticks
 * over exactly as the object does — including the extra same-tick snapshot it
 * sends the moment somebody's tap goes through.
 */
function playMirrored(
  seed: number,
  /** returns true when it touched the match, so the same-tick reply is sent */
  script: (state: MatchState, tick: number) => boolean = () => false,
) {
  const server = liveMatch(seed);
  const clients = [mirrorOf(server, 0), mirrorOf(server, 1)] as const;
  const sentTrades = [0, 0];
  let sentNews = 0;
  const seen: Trade[][] = [[], []];

  const flush = () => {
    const news = server.news.slice(sentNews);
    sentNews = server.news.length;
    const trades = [
      ...server.traders[0].trades.slice(sentTrades[0]),
      ...server.traders[1].trades.slice(sentTrades[1]),
    ];
    sentTrades[0] = server.traders[0].trades.length;
    sentTrades[1] = server.traders[1].trades.length;
    for (const seat of [0, 1] as Seat[]) {
      // through JSON, because that is what actually happens
      const tick = JSON.parse(JSON.stringify(snapshotFor(server, seat, news, trades)));
      seen[seat].push(...applyTick(clients[seat], tick));
    }
  };

  // The object steps and sends in one breath, and only then can a tap reach
  // it — which is answered with a second snapshot carrying the same tick
  // number. Anything else would be testing an order of events that cannot
  // happen.
  while (!server.finished) {
    step(server);
    flush();
    if (script(server, server.tick) && !server.finished) flush();
  }
  return { server, clients, seen };
}

describe('a duel seen from both seats', () => {
  it('leaves both mirrors holding the match the server played', () => {
    const { server, clients } = playMirrored(4242, (st, tick) => {
      if (tick === 6) return Boolean(applyAction(st, { trader: 0, stock: 0, side: 'buy', fraction: 0.25 }));
      if (tick === 9) return Boolean(applyAction(st, { trader: 1, stock: 1, side: 'sell', fraction: 0.25 }));
      if (tick === 20) return useAbility(st, 0); // RUMOUR — leans on a price for six seconds
      if (tick === 34) return useAbility(st, 1); // MARGIN CALL — flattens the other one
      if (tick === 50) return Boolean(applyAction(st, { trader: 0, stock: 2, side: 'buy', fraction: 0.5 }));
      return false;
    });

    for (const seat of [0, 1] as const) {
      const mine = clients[seat];
      const theirs = server;
      expect(mine.tick).toBe(theirs.tick);
      expect(mine.finished).toBe(true);
      // the same chart, every tick of it, to the last decimal
      expect(mine.stocks.map((s) => s.history)).toEqual(theirs.stocks.map((s) => s.history));
      expect(mine.traders[0].netWorthHistory).toEqual(
        theirs.traders[seat].netWorthHistory,
      );
      expect(mine.traders[0].netWorth).toBe(theirs.traders[seat].netWorth);
      expect(mine.traders[0].cash).toBe(theirs.traders[seat].cash);
      expect(mine.traders[0].positions).toEqual(theirs.traders[seat].positions);
    }
  });

  it('tells each of them they are trader 0, and who won in those terms', () => {
    // Two humans who never touch a button finish level, so somebody has to
    // trade for there to be a winner to renumber.
    const { server, clients } = playMirrored(77, (st, tick) => {
      if (tick === 8) return Boolean(applyAction(st, { trader: 0, stock: 0, side: 'buy', fraction: 0.5 }));
      if (tick === 44) return Boolean(applyAction(st, { trader: 0, stock: 0, side: 'sell', fraction: 1 }));
      return false;
    });
    const winner = server.winner;
    expect(winner).not.toBeNull();
    expect(clients[winner!].winner).toBe(0);
    expect(clients[1 - winner!].winner).toBe(1);
  });

  it('renumbers a surrender the same way', () => {
    const server = liveMatch(9);
    for (let i = 0; i < 10; i++) step(server);
    resign(server, 1);
    expect(snapshotFor(server, 0, [], []).res).toBe(1);
    expect(snapshotFor(server, 1, [], []).res).toBe(0);
    expect(snapshotFor(server, 0, [], []).win).toBe(0);
    expect(snapshotFor(server, 1, [], []).win).toBe(1);
  });

  it('never hands a player the rival book they did not buy', () => {
    const server = liveMatch(1234);
    for (let i = 0; i < 5; i++) step(server);
    applyAction(server, { trader: 1, stock: 0, side: 'buy', fraction: 0.5 });

    const tick = snapshotFor(server, 0, [], server.traders[1].trades);
    expect(server.traders[1].positions[0]).toBeGreaterThan(0);
    expect(tick.tr[1].pos).toEqual([0, 0, 0]);
    expect(tick.tr[1].ae).toEqual([0, 0, 0]);
    // what the card has always shown, and no more
    expect(tick.tr[1].hv).toBeCloseTo(
      server.traders[1].positions[0] * server.stocks[0].price,
      6,
    );
    expect(tick.trades).toEqual([]);
    expect(syncFor(server, 0).trades[1]).toEqual([]);
  });

  it('opens the book once a DOSSIER has been fired at it', () => {
    const server = createMatch(1234, undefined, {
      traders: [
        { name: 'HOST', kind: 'human', preset: 'medium', ability: 'dossier' },
        { name: 'GUEST', kind: 'human', preset: 'medium', ability: null },
      ],
    });
    for (let i = 0; i < 5; i++) step(server);
    applyAction(server, { trader: 1, stock: 0, side: 'buy', fraction: 0.5 });
    useAbility(server, 0);

    expect(snapshotFor(server, 0, [], []).tr[1].pos).toEqual(server.traders[1].positions);
    // and it is still one-way: the other one bought nothing
    expect(snapshotFor(server, 1, [], []).tr[1].pos).toEqual([0, 0, 0]);
  });

  it('catches a client up without doubling the history it hands over', () => {
    const server = liveMatch(555);
    for (let i = 0; i < 40; i++) step(server);
    applyAction(server, { trader: 0, stock: 1, side: 'buy', fraction: 0.25 });
    for (let i = 0; i < 10; i++) step(server);

    // a client that has just reconnected: a fresh mirror, and one sync
    const mirror = mirrorOf(server, 0);
    applySync(
      mirror,
      JSON.parse(JSON.stringify(syncFor(server, 0))),
      JSON.parse(JSON.stringify(snapshotFor(server, 0, [], []))),
    );

    expect(mirror.tick).toBe(server.tick);
    expect(mirror.stocks[0].history.length).toBe(server.stocks[0].history.length);
    expect(mirror.stocks.map((s) => s.history)).toEqual(server.stocks.map((s) => s.history));
    expect(mirror.traders[0].netWorthHistory).toEqual(server.traders[0].netWorthHistory);
    expect(mirror.traders[0].trades.length).toBe(server.traders[0].trades.length);

    // and it goes on from there in step
    for (let i = 0; i < 5; i++) {
      step(server);
      applyTick(mirror, JSON.parse(JSON.stringify(snapshotFor(server, 0, [], []))));
    }
    expect(mirror.stocks.map((s) => s.history)).toEqual(server.stocks.map((s) => s.history));
  });

  it('answers a tap between two ticks without growing the chart', () => {
    const server = liveMatch(31);
    const mirror = mirrorOf(server, 0);
    for (let i = 0; i < 12; i++) {
      step(server);
      applyTick(mirror, JSON.parse(JSON.stringify(snapshotFor(server, 0, [], []))));
    }
    const before = mirror.stocks[0].history.length;

    // the extra same-tick snapshot the object sends the instant a tap lands
    const trade = applyAction(server, { trader: 0, stock: 0, side: 'buy', fraction: 0.25 });
    expect(trade).not.toBeNull();
    const echoed = applyTick(
      mirror,
      JSON.parse(JSON.stringify(snapshotFor(server, 0, [], [trade!]))),
    );

    expect(mirror.stocks[0].history.length).toBe(before);
    expect(mirror.traders[0].netWorthHistory.length).toBe(before);
    expect(mirror.traders[0].positions).toEqual(server.traders[0].positions);
    expect(echoed).toHaveLength(1);
    expect(echoed[0].trader).toBe(0);
  });
});
