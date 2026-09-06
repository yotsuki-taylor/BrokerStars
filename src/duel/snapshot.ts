/**
 * A match state, written down for one of the two people playing it.
 *
 * This lives beside the protocol rather than inside the Durable Object because
 * it is the half of the wire format that has rules, and rules deserve a test
 * that does not need a server: `snapshot.test.ts` plays a real match, sends
 * every tick through here into a mirror built the way the client builds one,
 * and checks the two states still agree at the whistle.
 *
 * Two rules, and they are the reason nothing else in the game needed changing:
 *
 * **You are always trader 0.** The recipient's own trader comes first, and the
 * winner, the quitter and the per-trader ability arrays are renumbered to
 * match. The match screen goes on believing the human is trader 0 because for
 * whoever is reading, they are.
 *
 * **Their book is not yours.** A rival's positions are what DOSSIER is sold
 * for, so they are sent as zeros to anybody who has not fired one. What the
 * screen has always shown about both traders — the total they are holding —
 * is sent as a number instead, so hiding the book does not falsify the card.
 */

import { canUseAbility } from '../sim/abilities';
import { positionValue } from '../sim/trading';
import type { MatchState, NewsBanner, Trade, TraderState } from '../sim/types';
import type { DuelSync, DuelTick, DuelTraderTick } from './protocol';

export type Seat = 0 | 1;

export const otherSeat = (s: Seat): Seat => (s === 0 ? 1 : 0);

/** `[mine, theirs]` for the seat being written to. */
export const ordered = <T>(seat: Seat, pair: [T, T]): [T, T] =>
  seat === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];

/** A trader index as that seat should read it: their own is 0. */
export const relative = (seat: Seat, idx: number | null): number | null =>
  idx === null ? null : idx === seat ? 0 : 1;

export const remapTrade = (seat: Seat, t: Trade): Trade => ({
  ...t,
  trader: t.trader === seat ? 0 : 1,
});

/** `open` is false for a rival nobody has read the book of. */
function snapTrader(state: MatchState, t: TraderState, open: boolean): DuelTraderTick {
  return {
    c: t.cash,
    pos: open ? [...t.positions] : t.positions.map(() => 0),
    ae: open ? [...t.avgEntry] : t.avgEntry.map(() => 0),
    hv: positionValue(state, t),
    nw: t.netWorth,
    bust: t.bankrupt,
    used: t.abilityUsed,
    ul: t.undosLeft,
    ua: t.undoPoint?.tick ?? -1,
  };
}

/** One tick, as `seat` should see it. `news` and `trades` are what is new since the last. */
export function snapshotFor(
  state: MatchState,
  seat: Seat,
  news: NewsBanner[],
  trades: Trade[],
): DuelTick {
  const ab = state.abilities;
  return {
    t: state.tick,
    p: state.stocks.map((s) => s.price),
    tr: ordered(seat, [
      snapTrader(state, state.traders[0], seat === 0 || ab.seesBook[1]),
      snapTrader(state, state.traders[1], seat === 1 || ab.seesBook[0]),
    ]),
    ab: {
      blockedUntil: ordered(seat, [ab.blockedUntil[0], ab.blockedUntil[1]]),
      frozenUntil: [...ab.frozenUntil],
      rumour: ab.rumour ? { ...ab.rumour } : null,
      seesBook: ordered(seat, [ab.seesBook[0], ab.seesBook[1]]),
      hitUntil: ordered(seat, [ab.hitUntil[0], ab.hitUntil[1]]),
    },
    rdy: canUseAbility(state, seat),
    news,
    // The rival's prints are their book arriving a line at a time, so they go
    // under the same rule the book does.
    trades: trades
      .filter((t) => t.trader === seat || ab.seesBook[seat])
      .map((t) => remapTrade(seat, t)),
    fin: state.finished,
    win: relative(seat, state.winner),
    res: relative(seat, state.resigned),
  };
}

/** The whole match so far, for a client that arrived late or came back. */
export function syncFor(state: MatchState, seat: Seat): DuelSync {
  const open = (idx: Seat) => idx === seat || state.abilities.seesBook[seat];
  return {
    hist: state.stocks.map((s) => [...s.history]),
    nwHist: ordered(seat, [
      [...state.traders[0].netWorthHistory],
      [...state.traders[1].netWorthHistory],
    ]),
    // A rival's trade log is their book written out a line at a time, so it
    // travels under the same rule the book does.
    trades: ordered(seat, [
      open(0) ? state.traders[0].trades.map((t) => remapTrade(seat, t)) : [],
      open(1) ? state.traders[1].trades.map((t) => remapTrade(seat, t)) : [],
    ]),
    news: [...state.news],
  };
}
