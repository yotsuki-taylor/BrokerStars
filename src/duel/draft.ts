/**
 * The board of a duel, argued over before the match.
 *
 * Against a bot the HEAD slot is a bargain with the dealer: see the three, send
 * them back, ban one, pin one, name all three. A duel has one board for two
 * people, so none of that can be struck alone — and for a long time a duel
 * simply dealt a clean three and the hat did nothing. This is the hat working
 * in a duel: a short phase between "found" and the versus screen in which each
 * player spends what their hat gives them on the shared board, taking turns
 * when both have something to spend, the way a draft is picked.
 *
 * What each item becomes on a board somebody else also owns:
 *
 *   swap  (the caps' rerolls) — one company, chosen, goes back for a random one.
 *         Not the whole three: that would undo the other player in one tap.
 *   ban   — a company goes, a random one takes its slot, and it cannot come
 *           back before the match.
 *   pin   — a company stays: nobody may swap, ban or replace it.
 *   pick  (the STETSON's whole board) — a company goes for one the player names
 *           out of the league, up to three times.
 *
 * The standing orders a hat keeps for matches against the bot ("always this
 * one", "never that one") are not read here: the board starts as a clean draw
 * and everything done to it is done in this phase, in front of both players.
 *
 * Pure, and both ends import it: the server runs it (worker/src/duel.ts) and
 * the client only draws what it is sent, but the rules for which buttons may be
 * pressed are written once.
 */

import { poolFor, type Company, type Picker } from '../sim/companies';
import type { UiPerks } from '../ui/perks';

/** The whole phase, however it is spent. */
export const DRAFT_MS = 15_000;
/** One turn, when both players have something to spend; a turn not taken is passed. */
export const TURN_MS = 5_000;
/** The STETSON names the whole board against the bot; here it may replace this many. */
export const STETSON_PICKS = 3;

export type Seat = 0 | 1;

/** What a player may still do to the board. `see` is whether they may look at it at all. */
export interface DraftPowers {
  see: boolean;
  swaps: number;
  bans: number;
  pins: number;
  picks: number;
}

export const NO_POWERS: DraftPowers = { see: false, swaps: 0, bans: 0, pins: 0, picks: 0 };

/** Off the perks the server built from the wardrobe it keeps, never off a client's word. */
export function powersOf(ui: UiPerks): DraftPowers {
  return {
    see: ui.seeBoard || ui.showQuirks || ui.rerolls > 0 || ui.bans > 0 || ui.pins > 0 || ui.pickAll,
    swaps: ui.rerolls,
    bans: ui.bans,
    pins: ui.pins,
    picks: ui.pickAll ? STETSON_PICKS : 0,
  };
}

export const actions = (p: DraftPowers): number => p.swaps + p.bans + p.pins + p.picks;

export type DraftMove =
  | { kind: 'swap'; slot: number }
  | { kind: 'ban'; slot: number }
  | { kind: 'pin'; slot: number }
  | { kind: 'pick'; slot: number; id: string }
  /** done: nothing more from this seat. Also what a player with nothing to spend sends. */
  | { kind: 'ready' };

/** The last thing that happened to the board, for both screens to say. */
export interface DraftEvent {
  seat: Seat;
  kind: 'swap' | 'ban' | 'pin' | 'pick' | 'pass' | 'ready';
  slot?: number;
  /** the company that left the slot, and the one that came in */
  from?: string;
  to?: string;
}

export interface Draft {
  league: number;
  /** three company ids, in slot order */
  board: string[];
  /** who pinned each slot */
  pinned: (Seat | null)[];
  /** banned this phase; never dealt again before the match */
  banned: string[];
  left: [DraftPowers, DraftPowers];
  /** done, by choice, by running out, or by never having had anything */
  done: [boolean, boolean];
  /**
   * Whose turn it is while both still have something to spend; once one of
   * them is done, the other has the board to themselves and this names them.
   * Null when nobody is left to act.
   */
  turn: Seat | null;
  /** server clock */
  turnEndsAt: number;
  endsAt: number;
  last: DraftEvent | null;
}

/**
 * Open the phase on a board already dealt, or return null when there is
 * nothing to argue about: neither player can change a thing.
 *
 * The weaker hat moves first — the stronger one answers, and the last word
 * is what a stronger hat is worth. Level hats leave it to the dealer.
 */
export function openDraft(
  league: number,
  board: string[],
  powers: [DraftPowers, DraftPowers],
  now: number,
  rng: Picker,
): Draft | null {
  const done: [boolean, boolean] = [actions(powers[0]) === 0, actions(powers[1]) === 0];
  if (done[0] && done[1]) return null;
  const alone = done[0] || done[1];
  const a = actions(powers[0]);
  const b = actions(powers[1]);
  const first: Seat = done[0] ? 1 : done[1] ? 0 : a < b ? 0 : b < a ? 1 : (rng.int(0, 1) as Seat);
  return {
    league,
    board: [...board],
    pinned: board.map(() => null),
    banned: [],
    left: [{ ...powers[0] }, { ...powers[1] }],
    done,
    turn: first,
    turnEndsAt: alone ? now + DRAFT_MS : now + TURN_MS,
    endsAt: now + DRAFT_MS,
    last: null,
  };
}

/** Both are still spending, so turns alternate; otherwise the one left plays freely. */
const contested = (d: Draft): boolean => !d.done[0] && !d.done[1];

export const over = (d: Draft, now: number): boolean =>
  now >= d.endsAt || (d.done[0] && d.done[1]);

/**
 * Hand the board on after `seat` has moved (or let its turn go). With both
 * still spending it goes to the other; once one is done, it stays with the
 * one who is not.
 */
function pass(d: Draft, seat: Seat, now: number): void {
  if (actions(d.left[seat]) === 0) d.done[seat] = true;
  const other: Seat = seat === 0 ? 1 : 0;
  d.turn = !d.done[other] ? other : !d.done[seat] ? seat : null;
  // Alone at the board, the whole phase is their clock.
  d.turnEndsAt = contested(d) ? now + TURN_MS : d.endsAt;
}

/** May `seat` press anything at all right now? */
export function mayAct(d: Draft, seat: Seat, now: number): boolean {
  return !over(d, now) && !d.done[seat] && d.turn === seat;
}

/**
 * A random company for `slot`, by the dealer's own rules: not one already on
 * the board or banned, a staple if the slot was the board's only staple, and a
 * colour the other two do not have when the pool allows it.
 */
function deal(d: Draft, slot: number, rng: Picker): string | null {
  const pool = poolFor(d.league);
  const byId = new Map(pool.map((c) => [c.id, c]));
  const others = d.board.filter((_, i) => i !== slot).map((id) => byId.get(id)).filter(Boolean) as Company[];
  let fresh = pool.filter((c) => !d.board.includes(c.id) && !d.banned.includes(c.id));
  if (!others.some((c) => c.staple)) {
    const staples = fresh.filter((c) => c.staple);
    if (staples.length) fresh = staples;
  }
  if (!fresh.length) return null;
  const families = new Set(others.map((c) => c.family));
  const clear = fresh.filter((c) => !families.has(c.family));
  const src = clear.length ? clear : fresh;
  return src[rng.int(0, src.length - 1)].id;
}

/**
 * One move from one seat. False — and the draft untouched — for anything the
 * rules do not allow: not their turn, nothing left of that kind, a pinned slot,
 * a company the league does not offer. The server answers a false with
 * nothing, as it does a trade it would not take.
 */
export function applyMove(d: Draft, seat: Seat, move: DraftMove, now: number, rng: Picker): boolean {
  if (over(d, now) || d.done[seat]) return false;

  if (move?.kind === 'ready') {
    d.done[seat] = true;
    d.last = { seat, kind: 'ready' };
    if (d.turn === seat || d.turn === null) pass(d, seat, now);
    return true;
  }

  if (d.turn !== seat) return false;
  const slot = Math.floor(Number((move as { slot?: unknown })?.slot));
  if (!(slot >= 0 && slot < d.board.length)) return false;
  const left = d.left[seat];
  const from = d.board[slot];

  switch (move.kind) {
    case 'pin': {
      if (left.pins <= 0 || d.pinned[slot] !== null) return false;
      left.pins--;
      d.pinned[slot] = seat;
      d.last = { seat, kind: 'pin', slot, from, to: from };
      break;
    }
    case 'swap':
    case 'ban': {
      if (d.pinned[slot] !== null) return false;
      if (move.kind === 'swap' ? left.swaps <= 0 : left.bans <= 0) return false;
      // Banned before the deal, so the dealer cannot hand the same one back.
      if (move.kind === 'ban') d.banned.push(from);
      const to = deal(d, slot, rng);
      if (!to) {
        if (move.kind === 'ban') d.banned.pop();
        return false;
      }
      if (move.kind === 'swap') left.swaps--;
      else left.bans--;
      d.board[slot] = to;
      d.last = { seat, kind: move.kind, slot, from, to };
      break;
    }
    case 'pick': {
      if (left.picks <= 0 || d.pinned[slot] !== null) return false;
      const id = String(move.id ?? '');
      const offered = poolFor(d.league).some((c) => c.id === id);
      if (!offered || d.board.includes(id) || d.banned.includes(id)) return false;
      left.picks--;
      d.board[slot] = id;
      d.last = { seat, kind: 'pick', slot, from, to: id };
      break;
    }
    default:
      return false;
  }

  // Turns only matter while both are spending; alone, a player keeps the board.
  if (contested(d)) pass(d, seat, now);
  else if (actions(left) === 0) pass(d, seat, now);
  return true;
}

/**
 * The clock. A turn that ran out is passed — not given up: the seat keeps what
 * it had and gets the board back next time round. Returns whether anything
 * changed, so the server knows to say so.
 */
export function step(d: Draft, now: number): boolean {
  if (over(d, now) || d.turn === null || now < d.turnEndsAt) return false;
  const seat = d.turn;
  // Alone at the board, a turn running out changes nothing: the whole phase is
  // their clock.
  if (!contested(d)) {
    d.turnEndsAt = d.endsAt;
    return false;
  }
  d.last = { seat, kind: 'pass' };
  pass(d, seat, now);
  return true;
}

/* ------------------------------------------------------------ on the wire */

/** The draft as one seat sees it: "you" first, times as what is left of them. */
export interface DraftView {
  board: string[];
  pinned: ('you' | 'rival' | null)[];
  banned: string[];
  you: DraftPowers;
  rival: DraftPowers;
  youDone: boolean;
  rivalDone: boolean;
  turn: 'you' | 'rival' | null;
  /** milliseconds, so two clocks that disagree still count the same seconds */
  turnInMs: number;
  endsInMs: number;
  /** turns alternate only while both are spending */
  contested: boolean;
  last: (Omit<DraftEvent, 'seat'> & { who: 'you' | 'rival' }) | null;
}

export function viewFor(d: Draft, seat: Seat, now: number): DraftView {
  const other: Seat = seat === 0 ? 1 : 0;
  const who = (s: Seat | null) => (s === null ? null : s === seat ? 'you' : 'rival');
  const { seat: lastSeat, ...last } = d.last ?? ({} as DraftEvent);
  return {
    board: [...d.board],
    pinned: d.pinned.map(who),
    banned: [...d.banned],
    you: { ...d.left[seat] },
    rival: { ...d.left[other] },
    youDone: d.done[seat],
    rivalDone: d.done[other],
    turn: who(d.turn),
    turnInMs: Math.max(0, Math.min(d.turnEndsAt, d.endsAt) - now),
    endsInMs: Math.max(0, d.endsAt - now),
    contested: contested(d),
    last: d.last ? { ...last, who: who(lastSeat) as 'you' | 'rival' } : null,
  };
}
