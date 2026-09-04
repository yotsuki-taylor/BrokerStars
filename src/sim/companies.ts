/**
 * Every company the game can put on the board.
 *
 * Three of these go up per match. Which three depends on the league: a small
 * set of staples is offered everywhere, and each rung of the ladder adds five
 * more companies with their own quirk, so the higher you climb the stranger
 * the board gets and the wider the draw. The quirk itself is `trait`, and
 * traits.ts is the only place that knows what each kind does to a price.
 *
 * Pure data plus the picker. No imports, no React, no CONFIG.
 */

export type TraitKind =
  | 'plain'
  | 'locked'
  | 'regulated'
  | 'bubble'
  | 'stall'
  | 'floor'
  | 'moonshot'
  | 'luxury'
  | 'dividend'
  | 'headline'
  | 'ratchet';

/**
 * What makes one company behave unlike another. Every field is optional and
 * only ever read by the kind that owns it — one flat bag beats eight unions
 * for something the dev panel has to be able to poke at.
 */
export interface Trait {
  kind: TraitKind;
  /** locked: chance of holding a direction across 1, 2 or 3 segments */
  runWeights?: [number, number, number];
  /** regulated: the price the half-year close drags it back to */
  anchor?: number;
  /** regulated: the last share of each half over which that pull is applied */
  anchorWindow?: number;
  /** regulated: how much of the gap the very last tick of the half closes */
  anchorPull?: number;
  /** bubble: chance the next step is up while it is still inflating */
  riseChance?: number;
  /** bubble: size of one of those steps */
  riseStep?: number;
  /** bubble: chance per tick that it pops */
  popChance?: number;
  /** bubble: the price one tick of popping takes it to */
  popTo?: number;
  /** stall: chance a segment is dead flat instead, and how long that lasts */
  stallChance?: number;
  stallTicks?: [number, number];
  /** floor: the price it is never printed under */
  floor?: number;
  /** moonshot: the band it trades in until it jumps */
  band?: [number, number];
  /**
   * moonshot: chance of jumping at each quarter close it is offered — the
   * first three. The fourth close is the whistle, and a jump there would move
   * the price with no time left to trade it.
   */
  jumpChance?: number[];
  /** moonshot: what a jump multiplies the whole band by */
  jumpMult?: number;
  /** luxury: how far down a quarter turn can knock it, as a share of base */
  dipTo?: number;
  /** luxury: chance of that happening at a quarter close, and how long it lasts */
  dipChance?: number;
  dipTicks?: [number, number];
  /** dividend: the share of the price handed out at each quarter close */
  dropAtClose?: number;
  /** dividend: the upward lean it carries between those closes */
  yieldDrift?: number;
  /** headline: chance any one segment turns into a full-strength news move */
  headlineChance?: number;
  /** ratchet: how far below its own running high it is ever allowed to fall */
  giveBack?: number;
  /**
   * ratchet: the downward lean underneath that floor. Without it a trailing
   * floor is free money — every upward excursion is locked in and every
   * downward one is truncated, so buy-and-hold beat everything else on the
   * board by 30-50% a match.
   */
  drag?: number;
}

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
  /** Absent means 'plain' — the company trades by the standard rules. */
  trait?: Trait;
}

/**
 * Colour families, so a match never fields two lines a player has to squint at.
 * The picker takes at most one company from each.
 */
export type ColorFamily =
  | 'amber'
  | 'red'
  | 'pink'
  | 'violet'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'silver';

export interface Company extends StockConfig {
  trait: Trait;
  family: ColorFamily;
  /** One line for the archive card. Player-facing: it may name the quirk. */
  tagline: string;
  /** Offered in every league — the familiar line you read the board against. */
  staple?: boolean;
  /** Lowest league index this company turns up in. Ignored for staples. */
  fromLeague: number;
}

export const COMPANIES: Company[] = [
  /* ------------------------------------------------------------- staples */
  {
    id: 'tet',
    name: 'TET CORP',
    basePrice: 1000,
    noiseSigma: 0.008,
    driftPerStrength: 0.0035,
    segmentTicks: [16, 24],
    meanReversion: 0.05,
    color: '#FFB020',
    family: 'amber',
    logo: 'logo0.png',
    trait: { kind: 'plain' },
    tagline: 'Heavy and slow. It takes its time in both directions.',
    staple: true,
    fromLeague: 0,
  },
  {
    id: 'uranus',
    name: 'URANUS',
    basePrice: 500,
    noiseSigma: 0.022,
    driftPerStrength: 0.008,
    segmentTicks: [8, 16],
    meanReversion: 0.04,
    color: '#C56BFF',
    family: 'violet',
    logo: 'logo1.png',
    trait: { kind: 'plain' },
    tagline: 'The widest swings on the board, and no manners about it.',
    staple: true,
    fromLeague: 0,
  },
  {
    id: 'nova',
    name: 'NOVA',
    basePrice: 750,
    noiseSigma: 0.014,
    driftPerStrength: 0.005,
    segmentTicks: [12, 18],
    meanReversion: 0.045,
    color: '#3FD2F5',
    family: 'cyan',
    logo: 'logo2.png',
    trait: { kind: 'plain' },
    tagline: 'The middle of the market. Nothing clever, nothing cruel.',
    staple: true,
    fromLeague: 0,
  },

  /* ------------------------------------------------------ bronze pit (0) */
  {
    id: 'compass',
    name: 'IRON COMPASS',
    basePrice: 600,
    noiseSigma: 0.01,
    driftPerStrength: 0.004,
    segmentTicks: [10, 16],
    meanReversion: 0.05,
    // grass rather than mint: NOVA's cyan is the one line it can sit beside
    color: '#5FD93A',
    family: 'green',
    logo: 'companies/compass.svg',
    trait: { kind: 'locked', runWeights: [0.05, 0.25, 0.7] },
    tagline: 'Picks a direction and commits — seven times in ten, for three moves running.',
    fromLeague: 0,
  },
  {
    id: 'brisket',
    name: 'BIG BRISKET',
    basePrice: 500,
    noiseSigma: 0.012,
    driftPerStrength: 0.0045,
    segmentTicks: [12, 20],
    meanReversion: 0.05,
    color: '#FF6B6B',
    family: 'red',
    logo: 'companies/brisket.svg',
    trait: { kind: 'floor', floor: 300 },
    tagline: 'People eat in every market. The price never prints below 300.',
    fromLeague: 0,
  },

  {
    id: 'homestead',
    name: 'HOMESTEAD MUTUAL',
    basePrice: 700,
    noiseSigma: 0.007,
    driftPerStrength: 0.0028,
    segmentTicks: [16, 26],
    meanReversion: 0.06,
    color: '#CBD9EC',
    family: 'silver',
    logo: 'companies/homestead.svg',
    trait: { kind: 'plain' },
    tagline: 'Insurance. Nothing happens here, and that is what people pay for.',
    fromLeague: 0,
  },
  {
    id: 'tinbox',
    name: 'TIN BOX DINER',
    basePrice: 380,
    noiseSigma: 0.013,
    driftPerStrength: 0.005,
    segmentTicks: [12, 18],
    meanReversion: 0.05,
    color: '#6FA0FF',
    family: 'blue',
    logo: 'companies/tinbox.svg',
    trait: { kind: 'stall', stallChance: 0.2, stallTicks: [3, 7] },
    tagline: 'Quiet between the lunch rushes. The line goes flat for a second or two at a time.',
    fromLeague: 0,
  },
  {
    id: 'postal',
    name: 'POSTAL & CO',
    basePrice: 640,
    noiseSigma: 0.011,
    driftPerStrength: 0.004,
    segmentTicks: [12, 20],
    meanReversion: 0.045,
    color: '#46D6C4',
    family: 'teal',
    logo: 'companies/postal.svg',
    trait: { kind: 'dividend', dropAtClose: 0.05, yieldDrift: 0.0008 },
    tagline: 'Pays out at every quarter close, and the price gaps down by exactly what it paid.',
    fromLeague: 0,
  },

  /* ---------------------------------------------------- silver floor (1) */
  {
    id: 'arena',
    name: 'PIXEL ARENA',
    basePrice: 450,
    noiseSigma: 0.016,
    driftPerStrength: 0.006,
    segmentTicks: [10, 16],
    meanReversion: 0.045,
    color: '#5B8CFF',
    family: 'blue',
    logo: 'companies/arena.svg',
    trait: { kind: 'stall', stallChance: 0.3, stallTicks: [4, 10] },
    tagline: 'Goes dead for seconds at a time, then remembers it is listed.',
    fromLeague: 1,
  },
  {
    id: 'civic',
    name: 'CIVIC ANCHOR',
    basePrice: 500,
    noiseSigma: 0.015,
    driftPerStrength: 0.006,
    segmentTicks: [10, 18],
    meanReversion: 0.02,
    color: '#D9E6F5',
    family: 'silver',
    logo: 'companies/civic.svg',
    trait: { kind: 'regulated', anchor: 500, anchorWindow: 0.3, anchorPull: 0.16 },
    tagline: 'State money. Every half-year close drags it back to 500.',
    fromLeague: 1,
  },

  {
    id: 'beacon',
    name: 'BEACON MEDIA',
    basePrice: 560,
    noiseSigma: 0.016,
    driftPerStrength: 0.006,
    segmentTicks: [10, 16],
    meanReversion: 0.045,
    color: '#FF74B8',
    family: 'pink',
    logo: 'companies/beacon.svg',
    trait: { kind: 'headline', headlineChance: 0.15 },
    tagline: 'Always in its own papers. It breaks news on itself several times a match.',
    fromLeague: 1,
  },
  {
    id: 'granite',
    name: 'GRANITE VAULT',
    basePrice: 1100,
    noiseSigma: 0.007,
    driftPerStrength: 0.003,
    segmentTicks: [16, 24],
    meanReversion: 0.05,
    color: '#D6A24A',
    family: 'amber',
    logo: 'companies/granite.svg',
    trait: { kind: 'floor', floor: 800 },
    tagline: 'Dear, dull and guaranteed: the price never prints below 800.',
    fromLeague: 1,
  },
  {
    id: 'ember',
    name: 'EMBER UTILITIES',
    basePrice: 900,
    noiseSigma: 0.01,
    driftPerStrength: 0.004,
    segmentTicks: [12, 20],
    meanReversion: 0.045,
    color: '#35C7A0',
    family: 'teal',
    logo: 'companies/ember.svg',
    trait: { kind: 'dividend', dropAtClose: 0.07, yieldDrift: 0.001 },
    tagline: 'The fat payout: seven percent gone at every close, ground back up in between.',
    fromLeague: 1,
  },

  /* ------------------------------------------------------- gold desk (2) */
  {
    id: 'yeti',
    name: 'YETI COIN',
    basePrice: 300,
    noiseSigma: 0.01,
    driftPerStrength: 0.004,
    segmentTicks: [8, 14],
    meanReversion: 0,
    color: '#2FD3B8',
    family: 'teal',
    logo: 'companies/yeti.svg',
    trait: {
      kind: 'bubble',
      riseChance: 0.9,
      riseStep: 0.006,
      popChance: 0.01,
      // the floor it was never allowed under while it inflated. Deeper than
      // this and the dead coin drags the chart's whole scale down with it for
      // the rest of the match, squashing the two lines still worth trading.
      popTo: 180,
    },
    tagline: 'Climbs nine ticks in ten, then hands the whole climb back in one. It never recovers.',
    fromLeague: 2,
  },
  {
    id: 'velvet',
    name: 'VELVET CROWN',
    basePrice: 1800,
    noiseSigma: 0.006,
    driftPerStrength: 0.0025,
    segmentTicks: [14, 22],
    meanReversion: 0.05,
    color: '#FF5FA2',
    family: 'pink',
    logo: 'companies/velvet.svg',
    trait: { kind: 'luxury', dipTo: 0.5, dipChance: 0.4, dipTicks: [10, 22] },
    tagline: 'Expensive and calm — except at a quarter close, when it can halve.',
    fromLeague: 2,
  },

  {
    id: 'crampon',
    name: 'CRAMPON STEEL',
    basePrice: 700,
    noiseSigma: 0.013,
    driftPerStrength: 0.005,
    segmentTicks: [10, 18],
    meanReversion: 0.05,
    color: '#43C97A',
    family: 'green',
    logo: 'companies/crampon.svg',
    trait: { kind: 'ratchet', giveBack: 0.18 },
    tagline: 'Climbing gear. Inside a quarter it never gives back 18% of its own high — then the mark resets.',
    fromLeague: 2,
  },
  {
    id: 'freight',
    name: 'NIGHT FREIGHT',
    basePrice: 620,
    noiseSigma: 0.02,
    driftPerStrength: 0.007,
    segmentTicks: [8, 14],
    meanReversion: 0.04,
    color: '#4F7BEE',
    family: 'blue',
    logo: 'companies/freight.svg',
    trait: { kind: 'plain' },
    tagline: 'No trick at all, and no brakes either: standard rules, twice the temper.',
    fromLeague: 2,
  },
  {
    id: 'orchid',
    name: 'ORCHID LABS',
    basePrice: 1300,
    noiseSigma: 0.012,
    driftPerStrength: 0.006,
    segmentTicks: [12, 18],
    meanReversion: 0.04,
    color: '#B77BFF',
    family: 'violet',
    logo: 'companies/orchid.svg',
    trait: { kind: 'headline', headlineChance: 0.18 },
    tagline: 'A trial result every few seconds, and a full-strength move on each one.',
    fromLeague: 2,
  },

  /* ----------------------------------------------------- global fund (3) */
  {
    id: 'clockwork',
    name: 'CLOCKWORK OIL',
    basePrice: 850,
    noiseSigma: 0.016,
    // a locked company never draws a limp segment, so the same drift that
    // makes URANUS lively drives this one straight into the clamp
    driftPerStrength: 0.0055,
    segmentTicks: [8, 14],
    meanReversion: 0.05,
    color: '#E8913A',
    family: 'amber',
    logo: 'companies/clockwork.svg',
    trait: { kind: 'locked', runWeights: [0.15, 0.35, 0.5] },
    tagline: 'Holds a direction the way IRON COMPASS does, and swings twice as hard doing it.',
    fromLeague: 3,
  },
  {
    id: 'saltcandle',
    name: 'SALT & CANDLE',
    basePrice: 320,
    noiseSigma: 0.009,
    driftPerStrength: 0.003,
    segmentTicks: [14, 22],
    meanReversion: 0.055,
    color: '#A8E063',
    family: 'green',
    logo: 'companies/saltcandle.svg',
    trait: { kind: 'floor', floor: 200 },
    tagline: 'Cheap and stubborn. It will not go under 200, and rarely tries.',
    fromLeague: 3,
  },

  {
    id: 'halo',
    name: 'HALO ORBITAL',
    basePrice: 480,
    noiseSigma: 0.015,
    driftPerStrength: 0.005,
    segmentTicks: [10, 18],
    meanReversion: 0.08,
    color: '#56E0F0',
    family: 'cyan',
    logo: 'companies/halo.svg',
    trait: {
      kind: 'moonshot',
      band: [280, 520],
      jumpChance: [0.02, 0.04, 0.06],
      jumpMult: 1.8,
    },
    tagline: 'A launch window at every quarter close, and it takes one about one match in eight.',
    fromLeague: 3,
  },
  {
    id: 'tulip',
    name: 'TULIP EXCHANGE',
    basePrice: 420,
    noiseSigma: 0.011,
    driftPerStrength: 0.004,
    segmentTicks: [10, 16],
    meanReversion: 0,
    color: '#FF5555',
    family: 'red',
    logo: 'companies/tulip.svg',
    trait: {
      kind: 'bubble',
      riseChance: 0.88,
      riseStep: 0.005,
      popChance: 0.007,
      popTo: 252,
    },
    tagline: 'The slow bubble. It climbs for longer than YETI COIN, and lands just as hard.',
    fromLeague: 3,
  },
  {
    id: 'ironwood',
    name: 'IRONWOOD TRUST',
    basePrice: 900,
    noiseSigma: 0.013,
    driftPerStrength: 0.005,
    segmentTicks: [12, 20],
    meanReversion: 0.02,
    color: '#B9C9DE',
    family: 'silver',
    logo: 'companies/ironwood.svg',
    trait: { kind: 'regulated', anchor: 900, anchorWindow: 0.3, anchorPull: 0.16 },
    tagline: 'Audited money. Both half-year closes haul it back to 900.',
    fromLeague: 3,
  },

  /* ------------------------------------------------------ bull crown (4) */
  {
    id: 'garage',
    name: 'GARAGE NINE',
    basePrice: 400,
    noiseSigma: 0.014,
    driftPerStrength: 0.005,
    segmentTicks: [10, 18],
    meanReversion: 0.09,
    color: '#FF7AE0',
    family: 'pink',
    logo: 'companies/garage.svg',
    trait: {
      kind: 'moonshot',
      // it lists at the top of its band and spends the match sliding around
      // in it; the band's ceiling is the opening price, not something above it
      band: [200, 400],
      jumpChance: [0.01, 0.03, 0.05],
      jumpMult: 2.2,
    },
    tagline: 'Stuck in the basement. Each quarter close is one small chance to leave it, for good.',
    fromLeague: 4,
  },
  {
    id: 'meridian',
    name: 'MERIDIAN RAIL',
    basePrice: 1200,
    noiseSigma: 0.012,
    driftPerStrength: 0.005,
    segmentTicks: [12, 20],
    meanReversion: 0.02,
    color: '#AFC3DC',
    family: 'silver',
    logo: 'companies/meridian.svg',
    trait: { kind: 'regulated', anchor: 1200, anchorWindow: 0.3, anchorPull: 0.16 },
    tagline: 'Public rail. Both half-year closes pull it back to 1200, whatever it did in between.',
    fromLeague: 4,
  },
  {
    id: 'obsidian',
    name: 'OBSIDIAN CLUB',
    basePrice: 2600,
    noiseSigma: 0.006,
    driftPerStrength: 0.0025,
    segmentTicks: [14, 22],
    meanReversion: 0.05,
    color: '#9B5BFF',
    family: 'violet',
    logo: 'companies/obsidian.svg',
    trait: { kind: 'luxury', dipTo: 0.45, dipChance: 0.45, dipTicks: [12, 24] },
    tagline: 'The dearest name on the board, and the longest way down when a quarter closes on it.',
    fromLeague: 4,
  },
  {
    id: 'highwater',
    name: 'HIGHWATER FUND',
    basePrice: 1500,
    noiseSigma: 0.014,
    driftPerStrength: 0.0055,
    segmentTicks: [10, 16],
    meanReversion: 0.05,
    color: '#38D8C0',
    family: 'teal',
    logo: 'companies/highwater.svg',
    trait: { kind: 'ratchet', giveBack: 0.16, drag: 0.0008 },
    tagline: 'A high-water mark it holds for the quarter: 16% off its peak and no further, until the close wipes it.',
    fromLeague: 4,
  },
  {
    id: 'kraken',
    name: 'KRAKEN CHEM',
    basePrice: 780,
    noiseSigma: 0.019,
    driftPerStrength: 0.007,
    segmentTicks: [8, 14],
    meanReversion: 0.04,
    color: '#7BD93F',
    family: 'green',
    logo: 'companies/kraken.svg',
    trait: { kind: 'headline', headlineChance: 0.2 },
    tagline: 'A spill, a patent, a lawsuit. Something breaks on it every few seconds.',
    fromLeague: 4,
  },
];

/** A word for each quirk, short enough for a stock row. Player-facing. */
export const TRAIT_LABEL: Record<TraitKind, string> = {
  plain: 'STANDARD',
  locked: 'TRENDING',
  regulated: 'REGULATED',
  bubble: 'BUBBLE',
  stall: 'STREAKY',
  floor: 'PROTECTED',
  moonshot: 'LONG SHOT',
  luxury: 'LUXURY',
  dividend: 'PAYS OUT',
  headline: 'IN THE NEWS',
  ratchet: 'RATCHET',
};

/**
 * The same words again, cut to fit a stock row. The row gives a label about
 * forty pixels beside a company name and a price, so TRAIT_LABEL's wording is
 * for the archive and the board screen, and this one is for the match.
 */
export const TRAIT_SHORT: Record<TraitKind, string> = {
  plain: 'PLAIN',
  locked: 'TREND',
  regulated: 'STATE',
  bubble: 'BUBBLE',
  stall: 'STALLS',
  floor: 'FLOOR',
  moonshot: 'SHOT',
  luxury: 'LUXURY',
  dividend: 'DIV',
  headline: 'NEWS',
  ratchet: 'HOLDS',
};

/** The board a match falls back to when nobody picked one: the three staples. */
export const DEFAULT_STOCKS: StockConfig[] = COMPANIES.filter((c) => c.staple);

export function companyById(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}

/** Everything a given league may put up — staples plus whatever it has opened. */
export function poolFor(leagueIndex: number): Company[] {
  return COMPANIES.filter((c) => c.staple || c.fromLeague <= leagueIndex);
}

/** Minimal RNG surface, so this module does not have to import the class. */
export interface Picker {
  int(a: number, b: number): number;
}

/** What the player's own hat lets them dictate about the draw. */
export interface PickOptions {
  /** a company that must be on the board whenever the league offers it */
  pin?: string | null;
  /** a company that must not be */
  ban?: string | null;
  /** the whole board, named by the player; ids the league does not offer are ignored */
  force?: readonly string[] | null;
}

/**
 * The three companies for one match.
 *
 * One slot always goes to a staple — a plain company is the reference you read
 * the two strange ones against, and a board of three quirks at once is soup.
 * The other two come from the rest of the league's pool, and no two picks may
 * share a colour family, or the chart hands you two lines of the same shade.
 *
 * Anything the player has pinned, banned or named outright is honoured first
 * and the rest of the board is filled around it. A board they chose in full
 * skips the staple rule: it is their soup to eat.
 */
export function pickCompanies(
  leagueIndex: number,
  rng: Picker,
  count = 3,
  opts: PickOptions = {},
): Company[] {
  const pool = poolFor(leagueIndex).filter((c) => c.id !== opts.ban);
  const out: Company[] = [];
  const families = new Set<ColorFamily>();

  const add = (c: Company | undefined): void => {
    if (!c || out.includes(c) || out.length >= count) return;
    out.push(c);
    families.add(c.family);
  };

  const take = (from: Company[]): boolean => {
    const fresh = from.filter((c) => !out.includes(c));
    if (!fresh.length) return false;
    // Colour separation is a preference, not a rule: a pool that cannot honour
    // it still has to hand back a full board.
    const clear = fresh.filter((c) => !families.has(c.family));
    const src = clear.length ? clear : fresh;
    add(src[rng.int(0, src.length - 1)]);
    return true;
  };

  for (const id of opts.force ?? []) add(pool.find((c) => c.id === id));
  if (opts.pin) add(pool.find((c) => c.id === opts.pin));

  if (out.length < count && !out.some((c) => c.staple)) take(pool.filter((c) => c.staple));
  const rest = pool.filter((c) => !c.staple);
  while (out.length < count) {
    if (!take(rest) && !take(pool)) break; // pool exhausted: hand back what there is
  }
  return out;
}
