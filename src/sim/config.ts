/**
 * ALL balance parameters live here. Pure data, no imports.
 * The dev panel edits a clone of this object at runtime.
 */

export interface StockConfig {
  id: string;
  name: string;
  basePrice: number;
  noiseSigma: number;
  driftPerStrength: number;
  segmentTicks: [number, number];
  meanReversion: number;
  /** Company identity colour: chart line, icon, its button row. Never means buy/sell. */
  color: string;
  /** White silhouette used as a CSS mask so the icon takes the company colour. */
  logo: string;
}

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
  sizeFraction: number;
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
    durationSec: 120,
    tickMs: 500,
    startingCash: 10000,
    commissionRate: 0.003,
    bankruptcyEnabled: true,
    autoLiquidateAtEnd: true, // no slippage, no commission
  },
  chart: {
    /**
     * How much history the plot holds. 60 ticks is 30 seconds, and the line
     * crossed the panel fast enough that playtesters could not read it; 90 is
     * 45 seconds, which both slows the scroll and compresses the tick-to-tick
     * chop into something legible. Presentation only — the market is unchanged.
     */
    windowTicks: 90,
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
  stocks: [
    {
      id: 'tet',
      name: 'TET CORP',
      basePrice: 1000,
      noiseSigma: 0.008,
      driftPerStrength: 0.0035,
      segmentTicks: [16, 24] as [number, number],
      meanReversion: 0.05,
      color: '#FFB020',
      logo: 'logo0.png',
    },
    {
      id: 'uranus',
      name: 'URANUS',
      basePrice: 500,
      noiseSigma: 0.022,
      driftPerStrength: 0.008,
      segmentTicks: [8, 16] as [number, number],
      meanReversion: 0.04,
      color: '#C56BFF',
      logo: 'logo1.png',
    },
    // the middle ground: neither the safe bet nor the lottery ticket
    {
      id: 'nova',
      name: 'NOVA',
      basePrice: 750,
      noiseSigma: 0.014,
      driftPerStrength: 0.005,
      segmentTicks: [12, 18] as [number, number],
      meanReversion: 0.045,
      color: '#3FD2F5',
      logo: 'logo2.png',
    },
  ] as StockConfig[],
  impact: {
    refQty: 12,
    slippageCoef: 0.02,
    permanentCoef: 0.012,
    decayPerTick: 0.15,
  },
  phases: [
    { id: 'open', fromSec: 0, toSec: 40, volMult: 0.7, truthShift: 0.05 },
    { id: 'news', fromSec: 40, toSec: 80, volMult: 1.0, truthShift: 0.0, newsEvents: 2 },
    { id: 'close', fromSec: 80, toSec: 120, volMult: 1.6, truthShift: -0.1 },
  ] as PhaseConfig[],
  bot: {
    /**
     * Five rungs, one per league. `holdTicks` is the main lever (see README):
     * a bot that sits on a position past the move it caught hands the profit
     * back to mean reversion, so the ladder tightens it from 26 down to 8.
     */
    rookie: {
      reactionMs: [2200, 4000] as [number, number],
      ignoreChance: 0.78,
      sizeFraction: 0.1,
      lookbackTicks: 11,
      triggerSigmas: 2.6,
      holdTicks: 26,
      panicChance: 0.35,
      mode: 'momentum' as const,
    },
    easy: {
      reactionMs: [1200, 2400] as [number, number],
      ignoreChance: 0.55,
      sizeFraction: 0.15,
      lookbackTicks: 8,
      triggerSigmas: 1.8,
      holdTicks: 18,
      panicChance: 0.2,
      mode: 'momentum' as const,
    },
    medium: {
      reactionMs: [600, 1400] as [number, number],
      ignoreChance: 0.3,
      sizeFraction: 0.25,
      lookbackTicks: 5,
      triggerSigmas: 1.15,
      holdTicks: 11,
      panicChance: 0.1,
      mode: 'momentum' as const,
    },
    hard: {
      reactionMs: [300, 800] as [number, number],
      ignoreChance: 0.1,
      sizeFraction: 0.35,
      lookbackTicks: 4,
      triggerSigmas: 1.0,
      holdTicks: 9,
      panicChance: 0.05,
      mode: 'momentum' as const,
    },
    elite: {
      reactionMs: [150, 450] as [number, number],
      ignoreChance: 0.03,
      sizeFraction: 0.4,
      lookbackTicks: 3,
      triggerSigmas: 0.85,
      holdTicks: 8,
      panicChance: 0.02,
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
