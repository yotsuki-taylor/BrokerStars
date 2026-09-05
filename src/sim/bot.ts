import type { BotConfig } from './config';
import { canUseAbility, useAbility } from './abilities';
import { applyAction, grossExposure } from './trading';
import type { MatchState, TraderState } from './types';

/**
 * The bot reads the same chart the player does — recent price action, nothing
 * else — and trades through the same applyAction API. It has no access to the
 * generated future, so a human opponent could take its seat unchanged.
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
        applyAction(state, { trader: t.idx, stock: s, side: 'buy', fraction: bc.sizeFraction });
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
        fraction: bc.sizeFraction,
      });
      t.exitAt[stock] = state.tick + bc.holdTicks;
    }
    closeExpired(state, t);
    return;
  }

  // spot a move that is already under way and ride the rest of the segment
  for (let s = 0; s < state.stocks.length; s++) {
    if (t.positions[s] !== 0) continue; // already committed to this one
    if (t.pending.some((p) => p.stock === s)) continue;
    const h = state.stocks[s].history;
    if (h.length <= bc.lookbackTicks) continue;
    const past = h[h.length - 1 - bc.lookbackTicks];
    const now = h[h.length - 1];
    if (past <= 0) continue;
    const move = (now - past) / past;
    const threshold =
      bc.triggerSigmas * state.cfg.stocks[s].noiseSigma * Math.sqrt(bc.lookbackTicks);
    if (Math.abs(move) < threshold) continue;
    // a bot holding DOSSIER knows where the opponent is committed, and skips
    // far fewer of the moves that happen there
    const watched = state.abilities.seesBook[t.idx] && state.traders[1 - t.idx]?.positions[s] !== 0;
    if (rng.chance(watched ? bc.ignoreChance / 2 : bc.ignoreChance)) continue;
    const delayTicks = Math.max(1, Math.round(rng.int(bc.reactionMs[0], bc.reactionMs[1]) / tickMs));
    t.pending.push({
      atTick: state.tick + delayTicks,
      stock: s,
      dir: move > 0 ? 1 : -1,
      fraction: bc.sizeFraction,
    });
  }

  // fire whatever is due
  const due = t.pending.filter((p) => p.atTick <= state.tick);
  if (due.length) {
    t.pending = t.pending.filter((p) => p.atTick > state.tick);
    for (const p of due) {
      const trade = applyAction(state, {
        trader: t.idx,
        stock: p.stock,
        side: p.dir > 0 ? 'buy' : 'sell',
        fraction: p.fraction,
      });
      if (trade) t.exitAt[p.stock] = state.tick + bc.holdTicks;
    }
  }

  // a trade is a bet on one move, not a marriage: take it off when it is played out
  closeExpired(state, t);

  // panic out of a losing position
  if (bc.panicChance > 0) {
    for (let s = 0; s < state.stocks.length; s++) {
      const pos = t.positions[s];
      if (!pos) continue;
      const entry = t.avgEntry[s];
      if (!entry) continue;
      const pnlPct = ((state.stocks[s].price - entry) / entry) * Math.sign(pos);
      if (pnlPct < -0.05 && rng.chance(bc.panicChance)) {
        applyAction(state, {
          trader: t.idx,
          stock: s,
          side: pos > 0 ? 'sell' : 'buy',
          fraction: 1,
        });
        t.exitAt[s] = -1;
      }
    }
  }
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
function closeExpired(state: MatchState, t: TraderState): void {
  for (let s = 0; s < state.stocks.length; s++) {
    const pos = t.positions[s];
    if (!pos || t.exitAt[s] < 0 || state.tick < t.exitAt[s]) continue;
    applyAction(state, { trader: t.idx, stock: s, side: pos > 0 ? 'sell' : 'buy', fraction: 1 });
    t.exitAt[s] = -1;
  }
}
