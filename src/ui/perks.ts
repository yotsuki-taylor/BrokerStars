/**
 * What the player is wearing, turned into what the game does differently.
 *
 * This is the one place that knows clothes have consequences. The simulation
 * sees only a TraderPerks bag on the human's seat (src/sim/perks.ts) and never
 * hears the word "outfit"; everything else here is UI — what is drawn, what is
 * revealed, what a match pays — and never reaches sim/ at all.
 *
 * One slot is one kind of power and the rarity scales it, so every table below
 * is indexed the same way: 0 is a bare slot, 1 is common, up to 5 for mythic.
 * The catalogue in wardrobe.ts is the text for these numbers; the two have to
 * be changed together.
 */

import { NO_PERKS, NEVER_BUST, type TraderPerks } from '../sim/perks';
import { RARITIES, type Outfit, type Slot } from './wardrobe';

/** Everything the outfit changes that the simulation never hears about. */
export interface UiPerks {
  /* NECK — what a match pays */
  starMult: number;
  /** the gain a match has to clear for the profit bonus */
  profitBar: number;
  lossPaysDraw: boolean;

  /* EXTRA — what you know */
  /** the company's kind is written on its row during the match */
  showKind: boolean;
  /** the board is spelled out, quirks and all, before you agree to it */
  showQuirks: boolean;
  /** a heads-up a few seconds before a headline lands */
  headlineWarning: boolean;
  /** the company you are holding says which way it is going */
  holdDirection: boolean;
  /** how many ticks of the committed future the chart draws for a held company */
  truthTicks: number;

  /* HEAD — the board you get */
  /** the three companies are named before READY, and you may walk away */
  seeBoard: boolean;
  rerolls: number;
  bans: number;
  pins: number;
  pickAll: boolean;

  /** mirrored from the trader perks so the HUD can show the button */
  undos: number;
}

export interface Perks {
  trader: TraderPerks;
  ui: UiPerks;
}

/** 0 for a bare slot, then 1..5 up the ladder. */
function rank(outfit: Outfit, slot: Slot): number {
  const r = outfit[slot];
  return r ? RARITIES.indexOf(r) + 1 : 0;
}

/** Reads a per-rank table, falling back to the bare value. */
const at = <T,>(table: readonly T[], i: number): T => table[Math.min(i, table.length - 1)];

/* --------------------------------------------------------------- the tables */

//                                bare  common uncommon rare  legend mythic
const COMMISSION = [1, 0.85, 0.7, 0.55, 0.4, 0] as const;
const SLIPPAGE = [1, 1, 1, 0.8, 0.65, 0.65] as const;
const BANKRUPT_AT = [0, -500, NEVER_BUST, NEVER_BUST, NEVER_BUST, NEVER_BUST] as const;
const KEEP_SHARE = [0, 0, 0.1, 0.1, 0.1, 0.1] as const;
const STOP_USES = [0, 0, 0, 1, 2, 2] as const;
const LOSS_REFUND = [0, 0, 0, 0, 0.5, 0.5] as const;
const STAR_MULT = [1, 1.05, 1.1, 1.15, 1.2, 1.25] as const;
const PROFIT_BAR = [0.4, 0.4, 0.4, 0.37, 0.34, 0.3] as const;
const REROLLS = [0, 0, 1, 2, 2, 2] as const;

/** A position this far under water is one the rare BODY item bails out of. */
const STOP_AT = 0.15;
/** Five seconds at the standard tick, which is what the card promises. */
const UNDO_WINDOW_TICKS = 10;

export const NO_UI_PERKS: UiPerks = {
  starMult: 1,
  profitBar: PROFIT_BAR[0],
  lossPaysDraw: false,
  showKind: false,
  showQuirks: false,
  headlineWarning: false,
  holdDirection: false,
  truthTicks: 0,
  seeBoard: false,
  rerolls: 0,
  bans: 0,
  pins: 0,
  pickAll: false,
  undos: 0,
};

export const NO_PERKS_AT_ALL: Perks = { trader: NO_PERKS, ui: NO_UI_PERKS };

/**
 * `startingCash` is needed because the BODY floor is a share of the book, not
 * a number: "you keep a tenth of your money" has to mean a tenth of whatever
 * the match started you with.
 */
export function perksFor(outfit: Outfit, startingCash: number): Perks {
  const hand = rank(outfit, 'hand');
  const body = rank(outfit, 'torso');
  const neck = rank(outfit, 'neck');
  const eyes = rank(outfit, 'access');
  const head = rank(outfit, 'hat');

  const trader: TraderPerks = {
    commissionMult: at(COMMISSION, hand),
    slippageMult: at(SLIPPAGE, hand),
    freeExits: hand >= 5,
    bankruptAt: at(BANKRUPT_AT, body),
    minResult: startingCash * at(KEEP_SHARE, body),
    stopLossAt: at(STOP_USES, body) > 0 ? STOP_AT : 0,
    stopLossUses: at(STOP_USES, body),
    firstLossRefund: at(LOSS_REFUND, body),
    undos: body >= 5 ? 1 : 0,
    undoWindowTicks: UNDO_WINDOW_TICKS,
  };

  const ui: UiPerks = {
    starMult: at(STAR_MULT, neck),
    profitBar: at(PROFIT_BAR, neck),
    lossPaysDraw: neck >= 5,
    showKind: eyes >= 1,
    showQuirks: eyes >= 2,
    headlineWarning: eyes >= 3,
    holdDirection: eyes >= 4,
    truthTicks: eyes >= 5 ? 4 : 0,
    seeBoard: head >= 1,
    rerolls: at(REROLLS, head),
    bans: head >= 3 ? 1 : 0,
    pins: head >= 4 ? 1 : 0,
    pickAll: head >= 5,
    undos: trader.undos,
  };

  return { trader, ui };
}

/** Does anything the player owns want a look at the board before the match? */
export function wantsBoardScreen(ui: UiPerks): boolean {
  return ui.seeBoard || ui.showQuirks || ui.rerolls > 0 || ui.bans > 0 || ui.pins > 0 || ui.pickAll;
}
