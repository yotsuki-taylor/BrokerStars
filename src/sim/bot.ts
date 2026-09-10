import type { BotConfig } from './config';
import { canUseAbility, useAbility } from './abilities';
import { applyAction, grossExposure } from './trading';
import type { MatchState, TraderState } from './types';

/**
 * The bot reads the same chart the player does — recent price action, nothing
 * else — and trades through the same applyAction API. It has no access to the
 * generated future, so a human opponent could take its seat unchanged.
 *
 * It also plays for the same stakes. Everything it owns is meant to be working:
 * it opens on a move, adds while the company is still under its cap, spreads
 * whatever cash is left over across the board, and pays for a new idea by
 * selling the holding that is doing worst. Sizes come off net worth rather than
 * off the cash that happens to be lying about — sizing off cash is what used to
 * shrink every order the moment the bot committed to anything, and left it
 * playing out the whole match on a tenth of its money.
 */
export function botStep(state: MatchState, t: TraderState): void {
  const bc: BotConfig | undefined = state.cfg.bot[t.preset];
  if (!bc || t.bankrupt) return;
  const rng = state.rng.bot;
  const tickMs = state.cfg.match.tickMs;

  maybeFireAbility(state, t);

  if (bc.mode === 'hold') {
    if (state.tick === 1) {
      for (let s = 0; s < state.stocks.length; s++) {
        applyAction(state, { trader: t.idx, stock: s, side: 'buy', fraction: bc.sizeFraction ?? 0.5 });
      }
    }
    return;
  }

  if (bc.mode === 'random') {
    if (rng.chance(0.07)) {
      const stock = rng.int(0, state.stocks.length - 1);
      applyAction(state, {
        trader: t.idx,
        stock,
        side: rng.chance(0.5) ? 'buy' : 'sell',
        fraction: bc.sizeFraction ?? 0.25,
      });
      t.exitAt[stock] = state.tick + bc.holdTicks;
    }
    closeExpired(state, t, bc);
    return;
  }

  // spot a move that is already under way and ride the rest of the segment
  for (let s = 0; s < state.stocks.length; s++) {
    if (t.pending.some((p) => p.stock === s)) continue;
    const dir = trendDir(state, bc, s);
    if (!dir) continue;
    const pos = t.positions[s];
    // a move it is already riding is worth a queue slot only while the company
    // has room left; one that has turned against it is worth one either way
    if (pos !== 0 && Math.sign(pos) === dir && roomFor(state, t, bc, s) <= 0) continue;
    // a bot holding DOSSIER knows where the opponent is committed, and skips
    // far fewer of the moves that happen there
    const watched = state.abilities.seesBook[t.idx] && state.traders[1 - t.idx]?.positions[s] !== 0;
    if (rng.chance(watched ? bc.ignoreChance / 2 : bc.ignoreChance)) continue;
    const delayTicks = Math.max(1, Math.round(rng.int(bc.reactionMs[0], bc.reactionMs[1]) / tickMs));
    t.pending.push({ atTick: state.tick + delayTicks, stock: s, dir });
  }

  // fire whatever is due
  const due = t.pending.filter((p) => p.atTick <= state.tick);
  if (due.length) {
    t.pending = t.pending.filter((p) => p.atTick > state.tick);
    for (const p of due) {
      const pos = t.positions[p.stock];
      if (pos !== 0 && Math.sign(pos) !== p.dir) {
        // the chart turned on something it holds: take the money off this
        // company rather than doubling down, and let it work somewhere else
        close(state, t, bc, p.stock);
        continue;
      }
      openOrAdd(state, t, bc, p.stock, p.dir);
    }
  }

  // a trade is a bet on one move, not a marriage: take it off when it is played out
  closeExpired(state, t, bc);

  // panic out of a losing position
  if (bc.panicChance > 0) {
    for (let s = 0; s < state.stocks.length; s++) {
      const pos = t.positions[s];
      if (!pos) continue;
      const entry = t.avgEntry[s];
      if (!entry) continue;
      const pnlPct = ((state.stocks[s].price - entry) / entry) * Math.sign(pos);
      if (pnlPct < -0.05 && rng.chance(bc.panicChance)) close(state, t, bc, s);
    }
  }

  // whatever came off above is money again, and money is not a position
  investIdleCash(state, t, bc);
}

/** Price change over the last `ticks` ticks, or null while the chart is too short. */
function moveOver(state: MatchState, s: number, ticks: number): number | null {
  const h = state.stocks[s].history;
  const span = Math.min(ticks, h.length - 1);
  if (span < 1) return null;
  const past = h[h.length - 1 - span];
  if (past <= 0) return null;
  return (h[h.length - 1] - past) / past;
}

/** How far a move has to stand out from that stock's own noise to be believed. */
function trendThreshold(state: MatchState, bc: BotConfig, s: number): number {
  return bc.triggerSigmas * state.cfg.stocks[s].noiseSigma * Math.sqrt(bc.lookbackTicks);
}

/** Which way the chart says this company is going, or 0 for "nothing to see". */
function trendDir(state: MatchState, bc: BotConfig, s: number): -1 | 0 | 1 {
  if (state.stocks[s].history.length <= bc.lookbackTicks) return 0;
  const move = moveOver(state, s, bc.lookbackTicks);
  if (move === null || Math.abs(move) < trendThreshold(state, bc, s)) return 0;
  return move > 0 ? 1 : -1;
}

/**
 * Money the bot still wants working on this company: whichever of its two caps
 * bites first — how much of its net worth one company may take, and how much of
 * that net worth is meant to be in the market at all. Both are shares of net
 * worth, so the size it trades does not melt away as it commits.
 */
function roomFor(state: MatchState, t: TraderState, bc: BotConfig, s: number): number {
  const nw = Math.max(1, t.netWorth);
  const held = Math.abs(t.positions[s] * state.stocks[s].price);
  const perStock = bc.maxStockShare * nw - held;
  const overall = bc.targetInvested * nw - grossExposure(state, t);
  return Math.max(0, Math.min(perStock, overall));
}

/**
 * The trading API sizes every order as a share of the cash on hand, so the size
 * the bot wants has to be turned back into one. A share of 1 — the whole
 * account into one company — is an ordinary answer here, not an edge case.
 */
function cashFractionFor(state: MatchState, t: TraderState, bc: BotConfig, s: number): number {
  if (t.cash <= 0) return 0;
  const want = roomFor(state, t, bc, s);
  return want <= 0 ? 0 : Math.min(1, want / t.cash);
}

/**
 * Flatten one company, and leave it alone for a while afterwards.
 *
 * The cooling off is what stops the idle-cash sweep below from buying back
 * whatever it has just sold: a bot that keeps its money in the market and takes
 * a position off every few seconds will otherwise spend the whole match doing
 * round trips in the same company and paying commission for the privilege. A
 * fresh signal is still allowed straight back in — a reason to return is not
 * the same thing as having nowhere else to put the money.
 */
function close(state: MatchState, t: TraderState, bc: BotConfig, s: number): boolean {
  const pos = t.positions[s];
  if (!pos) return false;
  const done = applyAction(state, {
    trader: t.idx,
    stock: s,
    side: pos > 0 ? 'sell' : 'buy',
    fraction: 1,
  });
  if (done) {
    t.exitAt[s] = -1;
    t.coolUntil[s] = state.tick + Math.ceil(bc.holdTicks / 2);
  }
  return !!done;
}

/**
 * Open on a move, or add to what is already there. A bot that means to stay
 * invested normally has the money spent by the time the next idea arrives, so
 * it pays for that idea the way a trader would: by taking off whichever holding
 * is losing worst. A position that is doing its job is never sold to chase.
 */
function openOrAdd(
  state: MatchState,
  t: TraderState,
  bc: BotConfig,
  s: number,
  dir: -1 | 1,
): void {
  let f = cashFractionFor(state, t, bc, s);
  if (f <= 0) {
    if (!sellWorstLoser(state, t, bc, s)) return;
    f = cashFractionFor(state, t, bc, s);
    if (f <= 0) return;
  }
  const trade = applyAction(state, {
    trader: t.idx,
    stock: s,
    side: dir > 0 ? 'buy' : 'sell',
    fraction: f,
  });
  if (trade) t.exitAt[s] = state.tick + bc.holdTicks;
}

/** Close the holding furthest under water, to pay for a better one. */
function sellWorstLoser(
  state: MatchState,
  t: TraderState,
  bc: BotConfig,
  except: number,
): boolean {
  let worst = -1;
  let worstPnl = 0; // a position that is not losing is not a source of funds
  for (let s = 0; s < state.stocks.length; s++) {
    if (s === except || !t.positions[s] || !t.avgEntry[s]) continue;
    const pnl =
      ((state.stocks[s].price - t.avgEntry[s]) / t.avgEntry[s]) * Math.sign(t.positions[s]);
    if (pnl < worstPnl) {
      worstPnl = pnl;
      worst = s;
    }
  }
  return worst >= 0 && close(state, t, bc, worst);
}

/**
 * Cash sitting in the account earns nothing and, from the other side of the
 * table, reads as an opponent who is not playing: its net worth barely moves
 * because barely any of it is at risk. Anything above the small float the bot
 * keeps back for reactions goes into the company with the emptiest slot.
 *
 * The sweep only ever buys. Shorting pays its proceeds into cash, so a sweep
 * allowed to short would find more money every time it ran and keep levering
 * the book up until the market took it apart.
 */
function investIdleCash(state: MatchState, t: TraderState, bc: BotConfig): void {
  // not off the opening bell: a rung that can put its whole account to work in
  // the first half-second reads as a machine, and the ladder already owns a
  // number for how long this one takes to look at a board
  if (state.tick * state.cfg.match.tickMs < bc.reactionMs[0]) return;
  const nw = Math.max(1, t.netWorth);
  if (t.cash <= (1 - bc.targetInvested) * nw) return;
  if (grossExposure(state, t) >= bc.targetInvested * nw) return;

  let best = -1;
  let bestRoom = 0;
  for (let s = 0; s < state.stocks.length; s++) {
    if (t.positions[s] < 0) continue; // buying here would only cover its own short
    if (state.tick < t.coolUntil[s]) continue; // just sold this one; give it a rest
    const free = roomFor(state, t, bc, s);
    if (free <= 0) continue;
    const move = moveOver(state, s, bc.lookbackTicks);
    if (move === null) continue;
    // never buy into something visibly on its way down: the momentum side of
    // the bot is the part that trades those, and it trades them from the short
    if (move <= -trendThreshold(state, bc, s)) continue;
    // the emptiest slot rather than the best-looking one. Buying the leader
    // here was tried first and had to go: it is a second momentum bet, taken
    // with whatever money the first one left over, and it doubled the edge of
    // every rung at once — the ladder had to be handicapped back down to where
    // it started. Spare cash is a housekeeping problem, not a strategy.
    if (free > bestRoom) {
      best = s;
      bestRoom = free;
    }
  }
  if (best < 0) return;

  const f = cashFractionFor(state, t, bc, best);
  if (f <= 0) return;
  const trade = applyAction(state, { trader: t.idx, stock: best, side: 'buy', fraction: f });
  // bought to be invested rather than off a signal, but it comes off on the
  // same clock as everything else, so the book keeps turning over
  if (trade && t.exitAt[best] < 0) t.exitAt[best] = state.tick + bc.holdTicks;
}

/** What an open book is worth over what it was opened at, for one trader. */
function unrealised(state: MatchState, t: TraderState): number {
  let v = 0;
  for (let i = 0; i < state.stocks.length; i++) {
    if (!t.positions[i] || !t.avgEntry[i]) continue;
    v += (state.stocks[i].price - t.avgEntry[i]) * t.positions[i];
  }
  return v;
}

/**
 * When the bot spends its one ability.
 *
 * Each of these is a plain reading of the board rather than a schedule, so a
 * bot that never gets the moment never fires — which is right: an ability held
 * back is a decision too. Nothing here draws on RNG, so a seed still replays.
 *
 * DOSSIER is the odd one. It buys a look at the opponent's book, and a bot has
 * no eyes; rather than leave the rung dead, holding it makes the bot pay closer
 * attention where the opponent is committed (see `ignoreChance` below).
 */
function maybeFireAbility(state: MatchState, t: TraderState): void {
  if (!canUseAbility(state, t.idx)) return;
  const foe = state.traders[1 - t.idx];
  if (!foe) return;
  const start = state.cfg.match.startingCash;
  // never on the opening tick: every one of these wants a board to read
  const warm = state.tick > Math.round(state.totalTicks * 0.1);
  if (!warm) return;

  switch (t.ability) {
    case 'static':
    case 'halt':
      // deny time to someone who is using it better than you are
      if (foe.netWorth > t.netWorth) useAbility(state, t.idx);
      break;
    case 'dossier':
      useAbility(state, t.idx);
      break;
    case 'margincall':
      // take the rest of a move off them, once the move is worth taking
      if (unrealised(state, foe) > start * 0.03) useAbility(state, t.idx);
      break;
    case 'rumour':
      // only worth it behind a position big enough to carry the push
      if (grossExposure(state, t) > start * 0.15) useAbility(state, t.idx);
      break;
  }
}

/** Flatten positions whose planned holding time has run out. */
function closeExpired(state: MatchState, t: TraderState, bc: BotConfig): void {
  for (let s = 0; s < state.stocks.length; s++) {
    if (!t.positions[s] || t.exitAt[s] < 0 || state.tick < t.exitAt[s]) continue;
    close(state, t, bc, s);
  }
}
