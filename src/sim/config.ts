/**
 * ALL balance parameters live here. The dev panel edits a clone of this object
 * at runtime, so everything below has to survive a JSON round trip.
 *
 * The one import is the company roster, which is pure data too: `stocks` is
 * only the default board — a real match asks companies.ts for three drawn from
 * the league being played.
 */

import { DEFAULT_STOCKS } from './companies';

export type { Company, StockConfig, Trait, TraitKind } from './companies';

export interface PhaseConfig {
  id: string;
  fromSec: number;
  toSec: number;
  volMult: number;
  truthShift: number;
  newsEvents?: number;
}

export interface BotConfig {
  reactionMs: [number, number];
  /** chance it sits out a move it noticed */
  ignoreChance: number;
  /**
   * Fraction of the cash on hand one order commits. 'random' and 'hold' only:
   * a momentum bot sizes off the two shares below instead, and leaving this
   * here for it would just be a number that looked as if it did something.
   */
  sizeFraction?: number;
  /**
   * Momentum only, and the two knobs that decide how much of itself the bot
   * actually puts at risk. Both are shares of NET WORTH, not of cash on hand:
   * the trading API sizes orders off cash, and sizing decisions off it too is
   * what used to leave the bot playing out a match on a tenth of its money,
   * with a balance that barely moved.
   *
   * `targetInvested` is what it wants working in the market — at 0.95 it treats
   * idle cash as a mistake and sweeps it into whatever is climbing, and what is
   * left over (0.05) is the float it keeps back to react with.
   */
  targetInvested: number;
  /**
   * Momentum only. Most of its net worth any one company may take, which is
   * the only thing making the bot hold more than one. It is a variance knob as
   * much as a risk one: at 0.55 a rung can put the whole account into two
   * companies and mirror duels stop being close (43 % inside 15 % of each
   * other, against a design floor of 50 %); at 0.45 the same rung has to hold
   * all three and closeness comes back to 58 %.
   */
  maxStockShare: number;
  /** how many ticks back it compares the price against */
  lookbackTicks: number;
  /**
   * How far the move must stand out from that stock's own noise before the bot
   * calls it a trend, in sigmas over the lookback window. A flat number of
   * percent would make it chase every twitch of URANUS and ignore TET entirely.
   */
  triggerSigmas: number;
  /** ticks it keeps a trade before taking it off; 0 = never exits on its own */
  holdTicks: number;
  panicChance: number;
  /** 'momentum' reads the chart; 'random' mashes buttons; 'hold' buys once and sits. */
  mode?: 'momentum' | 'random' | 'hold';
}

export const CONFIG = {
  match: {
    durationSec: 80,
    tickMs: 500,
    /**
     * The match is a business year. Four quarters of 20 seconds, two half-years
     * of 40: the chart rules them off and several companies key their behaviour
     * to the closes, so nothing may assume this is 4 except by reading it here.
     */
    quarters: 4,
    startingCash: 10000,
    commissionRate: 0.003,
    bankruptcyEnabled: true,
    autoLiquidateAtEnd: true, // no slippage, no commission
  },
  chart: {
    /**
     * How much history the plot holds, as a share of the match: 60 ticks is 30
     * seconds of an 80-second year, or a quarter and a half on screen at once.
     * Less than that and the line crosses the panel too fast for playtesters to
     * read; much more and the tick-to-tick chop compresses into a flat smear.
     * Presentation only — the market is unchanged.
     */
    windowTicks: 60,
    mode: 'percent' as 'percent' | 'absolute',
    /**
     * The vertical axis fits whatever is on screen. A fixed frame was tried and
     * dropped: strong trends ran off the top and the line disappeared. Set
     * autoScale to false in the dev panel to pin the axis to the range below.
     */
    autoScale: true,
    percentRange: [-50, 50] as [number, number],
    absoluteRange: [0, 2000] as [number, number],
  },
  stocks: DEFAULT_STOCKS,
  impact: {
    refQty: 12,
    slippageCoef: 0.02,
    permanentCoef: 0.012,
    decayPerTick: 0.15,
  },
  /**
   * One phase per quarter, so the year the chart draws and the volatility the
   * market runs at are the same four boxes. The two headlines are spread one
   * per middle quarter rather than both landing in the same half-year.
   */
  phases: [
    { id: 'q1', fromSec: 0, toSec: 20, volMult: 0.7, truthShift: 0.05 },
    { id: 'q2', fromSec: 20, toSec: 40, volMult: 1.0, truthShift: 0.0, newsEvents: 1 },
    { id: 'q3', fromSec: 40, toSec: 60, volMult: 1.25, truthShift: 0.0, newsEvents: 1 },
    { id: 'q4', fromSec: 60, toSec: 80, volMult: 1.6, truthShift: -0.1 },
  ] as PhaseConfig[],
  bot: {
    /**
     * Five rungs, one per league. `holdTicks` is still the main lever (see
     * README): a bot that sits on a position past the move it caught hands the
     * profit back to mean reversion.
     *
     * `ignoreChance` — how many of the moves it spots the bot lets go by —
     * carries more of the ladder than it used to, and now moves with it rather
     * than against it: 0.78 down to 0.45. Every rung plays its whole account,
     * so the money is no longer what separates them.
     *
     * `holdTicks` used to run 26 down to 8. Same lever, same direction, longer
     * scale: 40 down to 18. A position is three times the size it was, and
     * slippage is charged on the square of an order, so a rung that flips its
     * whole book every four seconds now pays for the privilege — the old
     * numbers made the bottom of the ladder cheaper to run than the top.
     *
     * `triggerSigmas` is the gate on how rare a move has to be before the bot
     * believes it. It no longer decides when the bot first appears on the board
     * — the sweep in bot.ts puts its money to work in the first seconds either
     * way — but it still decides how much of what happens it acts on.
     */
    rookie: {
      reactionMs: [2200, 4000] as [number, number],
      ignoreChance: 0.78,
      lookbackTicks: 11,
      triggerSigmas: 2.0,
      holdTicks: 40,
      panicChance: 0.35,
      targetInvested: 0.85,
      maxStockShare: 0.55,
      mode: 'momentum' as const,
    },
    easy: {
      reactionMs: [1200, 2400] as [number, number],
      ignoreChance: 0.68,
      lookbackTicks: 8,
      triggerSigmas: 1.8,
      holdTicks: 32,
      panicChance: 0.2,
      targetInvested: 0.9,
      maxStockShare: 0.5,
      mode: 'momentum' as const,
    },
    medium: {
      reactionMs: [600, 1400] as [number, number],
      ignoreChance: 0.6,
      lookbackTicks: 5,
      triggerSigmas: 1.15,
      holdTicks: 26,
      panicChance: 0.1,
      targetInvested: 0.95,
      maxStockShare: 0.45,
      mode: 'momentum' as const,
    },
    hard: {
      reactionMs: [300, 800] as [number, number],
      ignoreChance: 0.52,
      lookbackTicks: 4,
      triggerSigmas: 1.0,
      holdTicks: 22,
      panicChance: 0.05,
      targetInvested: 0.95,
      maxStockShare: 0.45,
      mode: 'momentum' as const,
    },
    elite: {
      reactionMs: [150, 450] as [number, number],
      ignoreChance: 0.45,
      lookbackTicks: 3,
      triggerSigmas: 0.85,
      holdTicks: 18,
      panicChance: 0.02,
      targetInvested: 1.0,
      maxStockShare: 0.4,
      mode: 'momentum' as const,
    },
    /** control group for balance runs */
    random: {
      reactionMs: [400, 1600] as [number, number],
      ignoreChance: 1,
      sizeFraction: 0.25,
      lookbackTicks: 5,
      triggerSigmas: 1.15,
      holdTicks: 11,
      panicChance: 0.05,
      targetInvested: 0,
      maxStockShare: 1,
      mode: 'random' as const,
    },
    /** buy at the open and never touch it again */
    holder: {
      reactionMs: [0, 0] as [number, number],
      ignoreChance: 1,
      sizeFraction: 0.5,
      lookbackTicks: 5,
      triggerSigmas: 1.3,
      holdTicks: 0,
      panicChance: 0,
      targetInvested: 0,
      maxStockShare: 1,
      mode: 'hold' as const,
    },
  } as Record<string, BotConfig>,
  flags: {
    marketImpact: true,
    shorting: true,
    phases: true,
  },
  finalPhaseMultiplier: 1.0,
};

export type Config = typeof CONFIG;
export type BotPreset = keyof typeof CONFIG.bot;

export function cloneConfig(cfg: Config = CONFIG): Config {
  return JSON.parse(JSON.stringify(cfg)) as Config;
}
