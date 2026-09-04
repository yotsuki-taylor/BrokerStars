/**
 * Cosmetics: what exists, what it costs, what the player owns and wears.
 * Like progress.ts this is meta and lives outside sim/ — the match neither
 * knows nor cares what the trader is wearing.
 *
 * Every sprite is exported on the same 474x732 canvas, so the character is
 * built by stacking whole images with no per-item offsets.
 */

export type Slot = 'hat' | 'neck' | 'torso' | 'hand' | 'access';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legend' | 'mythic';

export const SLOTS: Slot[] = ['hat', 'neck', 'torso', 'hand', 'access'];
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legend', 'mythic'];

export const SLOT_LABEL: Record<Slot, string> = {
  hat: 'HEAD',
  neck: 'NECK',
  torso: 'BODY',
  hand: 'HANDS',
  access: 'EXTRA',
};

/**
 * What one step up a slot costs.
 *
 * Rarities inside a slot are a ladder, bought in order, so these are step
 * prices rather than the price of an item standing alone: taking a slot from
 * bare to mythic is 4+7+12+20+40 = 83 stars whichever way you come at it.
 * Skipping used to be strictly better — buy the rare for 10 and the common and
 * uncommon you passed over were 10 stars thrown away — which meant the shop
 * punished you for buying what you could afford today.
 *
 * The curve is set against what a league pays (see leagues.ts). Filling all
 * five slots at one tier is 10 to 17 matches in the league where that tier
 * gets bought: 20 stars at 2.2 a match in the bronze pit, 200 at 12 a match
 * under the crown. So a rung always costs about the same number of evenings,
 * whichever rung you are on.
 */
export const PRICES: Record<Rarity, number> = {
  common: 4,
  uncommon: 7,
  rare: 12,
  legend: 20,
  mythic: 40,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  legend: 'LEGEND',
  mythic: 'MYTHIC',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa9bf',
  uncommon: '#5fd08a',
  rare: '#4aa8ff',
  legend: '#c56bff',
  mythic: '#ffb020',
};

export interface ItemCard {
  name: string;
  /** One line in the player's own language: what wearing it does, no jargon. */
  text: string;
}

/**
 * One slot is one kind of power, and the rarity is how much of it you get.
 * Five curves are something a player can hold in their head; twenty-five
 * unrelated effects are not, and could not be balanced either.
 *
 * NOTE: the effects below are the catalogue, not the code. Nothing here is
 * wired into the simulation yet — the shop describes what each rung will do,
 * and the abilities themselves land after it.
 */
export const SLOT_THEME: Record<Slot, string> = {
  hat: 'THE BOARD YOU GET',
  neck: 'WHAT A MATCH PAYS',
  torso: 'HOW BAD IT CAN GET',
  hand: 'WHAT TRADING COSTS',
  access: 'WHAT YOU KNOW',
};

/**
 * Names describe the sprite the player is looking at, not the effect: the
 * preview shows a red bandana, so the card cannot call it a flat cap. The
 * effect is the line underneath, and that is where the plain language goes.
 */
export const CATALOGUE: Record<Slot, Record<Rarity, ItemCard>> = {
  hat: {
    common: {
      name: 'BANDANA',
      text: 'You see which three companies you are about to face, and can walk away.',
    },
    uncommon: {
      name: 'BALL CAP',
      text: 'Once a match you can ask for a different three.',
    },
    rare: {
      name: 'PIT CAP',
      text: 'Twice a match, and you can bar one company from this league for good.',
    },
    legend: {
      name: 'BLACK BRIM',
      text: 'Name one company you always want on the board, and it is always there.',
    },
    mythic: {
      name: 'TEN GALLON',
      text: 'You choose all three companies yourself.',
    },
  },
  neck: {
    common: { name: 'STAFF LANYARD', text: 'Matches pay 5% more stars.' },
    uncommon: { name: 'PLAIN TIE', text: 'Matches pay 10% more stars.' },
    rare: {
      name: 'SILK TIE',
      text: 'Matches pay 15% more, and the bonus for a well traded match comes sooner.',
    },
    legend: {
      name: 'BOW TIE',
      text: 'Matches pay 20% more, and that bonus comes sooner still.',
    },
    mythic: {
      name: 'GOLD PENDANT',
      text: 'Matches pay 25% more, the bonus comes sooner again, and a loss still pays.',
    },
  },
  torso: {
    common: {
      name: 'KNIT VEST',
      text: 'You keep trading until you are 500 in the hole, not until you hit zero.',
    },
    uncommon: {
      name: 'PRESSED SHIRT',
      text: 'You cannot be wiped out. However bad it gets, you keep a tenth of your money.',
    },
    rare: {
      name: 'FLOOR SUIT',
      text: 'That, and once a match a position 15% under water gets out on its own.',
    },
    legend: {
      name: 'HOUSE TUXEDO',
      text: 'Twice a match, and the first losing trade you close hands half of it back.',
    },
    mythic: {
      name: 'EARLY RETIREMENT',
      text: 'Once a match you can take back your last trade, at the price you paid.',
    },
  },
  hand: {
    common: { name: 'SPIRAL NOTEPAD', text: 'Trading costs you 15% less.' },
    uncommon: { name: 'CLIPBOARD', text: 'Trading costs you 30% less.' },
    rare: {
      name: 'WAD OF CASH',
      text: 'Trading costs you 45% less, and a big order moves the price against you less.',
    },
    legend: {
      name: 'BURNER PHONE',
      text: 'Trading costs you 60% less, and big orders barely move the price at all.',
    },
    mythic: {
      name: 'THE TERMINAL',
      text: 'You trade for free, and getting out of a position never costs you a worse price.',
    },
  },
  access: {
    common: {
      name: 'READING GLASSES',
      text: 'Every company on the board tells you what kind it is.',
    },
    uncommon: {
      name: 'RED SHADES',
      text: 'You see all three companies, and what each does, before you agree to the match.',
    },
    rare: {
      name: 'TRADING HEADSET',
      text: 'Three seconds before a headline lands, you hear which company it lands on.',
    },
    legend: {
      name: 'EARPIECE',
      text: 'The company you are holding tells you which way it is about to go.',
    },
    mythic: {
      name: 'ORACLE LENS',
      text: 'The next two seconds of the company you hold are drawn ahead of the line.',
    },
  },
};

export const SPRITE_W = 474;
export const SPRITE_H = 732;

const tex = (name: string) => `${import.meta.env.BASE_URL}textures/shop/${name}.png`;

export type Piece = 'single' | 'up' | 'down';

/**
 * Which halves each item was exported as, and therefore where it lands
 * relative to the neck item. Three shapes exist in the art:
 *
 *   'both' — split in two, so a chain can pass under a collar and the collar
 *            draws over it, or a bow tie's strap goes under while the bow
 *            itself sits in front;
 *   'up'   — one sprite that must sit above the collar anyway;
 *   'down' — one sprite that must sit below it.
 *
 * Anything absent from this map is a single sprite drawn in the lower pass.
 * The keys must match the filenames: `<slot>-<rarity>[-up|-down].png`.
 */
const PIECES: Record<string, 'both' | 'up' | 'down'> = {
  'torso-common': 'both',
  'torso-uncommon': 'both',
  'torso-rare': 'both',
  'torso-legend': 'both',
  'torso-mythic': 'both',
  'neck-common': 'both',
  'neck-mythic': 'both',
  'neck-legend': 'both',
};

export function itemId(slot: Slot, rarity: Rarity): string {
  return `${slot}-${rarity}`;
}

export function piecesOf(slot: Slot, rarity: Rarity): 'both' | 'up' | 'down' | 'single' {
  return PIECES[itemId(slot, rarity)] ?? 'single';
}

/** Sprite for one half of a garment, or the whole thing when it is single. */
export function pieceUrl(slot: Slot, rarity: Rarity, piece: Piece): string {
  const id = itemId(slot, rarity);
  return tex(piece === 'single' ? id : `${id}-${piece}`);
}

/** The half worth showing on a shop card. */
export function thumbPiece(slot: Slot, rarity: Rarity): Piece {
  const p = piecesOf(slot, rarity);
  if (p !== 'both') return p;
  // a torso's lower half is the whole garment; a neck item's upper half is the jewel
  return slot === 'torso' ? 'down' : 'up';
}

/* ------------------------------------------------------------- the ladder */

/**
 * A slot is climbed in order, so what a player owns in it is a prefix of
 * RARITIES and one number describes the whole slot.
 */
export function highestOwned(owned: Set<string>, slot: Slot): Rarity | null {
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (owned.has(itemId(slot, RARITIES[i]))) return RARITIES[i];
  }
  return null;
}

/** The one rarity a slot can buy next, or null once it is finished. */
export function nextRarity(owned: Set<string>, slot: Slot): Rarity | null {
  const top = highestOwned(owned, slot);
  const i = top === null ? 0 : RARITIES.indexOf(top) + 1;
  return RARITIES[i] ?? null;
}

/** True only for the single rung a slot is standing in front of. */
export function isBuyable(owned: Set<string>, slot: Slot, rarity: Rarity): boolean {
  return nextRarity(owned, slot) === rarity;
}

/** The rung under this one, or null at the bottom of the ladder. */
export function rarityBelow(rarity: Rarity): Rarity | null {
  return RARITIES[RARITIES.indexOf(rarity) - 1] ?? null;
}

export type Outfit = Partial<Record<Slot, Rarity>>;

interface Layer {
  key: string;
  url: string;
}

/**
 * Bottom-to-top draw order. The two-piece garments straddle the neck item:
 * shirt body, then the chain that tucks under the collar, then the collar,
 * then whatever hangs in front. The bare hand caps the stack.
 */
export function buildLayers(outfit: Outfit): Layer[] {
  const out: Layer[] = [];
  const push = (key: string, url: string) => out.push({ key, url });
  /** Draws the part of a layered slot that belongs in this pass, if any. */
  const half = (slot: Slot, piece: 'up' | 'down') => {
    const r = outfit[slot];
    if (!r) return;
    const shape = piecesOf(slot, r);
    if (shape === 'both' || shape === piece) push(`${slot}-${piece}`, pieceUrl(slot, r, piece));
    else if (shape === 'single' && piece === 'down') push(slot, pieceUrl(slot, r, 'single'));
  };
  const whole = (slot: Slot) => {
    const r = outfit[slot];
    if (r && piecesOf(slot, r) === 'single') push(slot, pieceUrl(slot, r, 'single'));
  };

  push('body', tex('body'));
  half('torso', 'down');
  half('neck', 'down');
  half('torso', 'up');
  half('neck', 'up');
  push('face', tex('face'));
  push('hair', tex('hair-1'));
  whole('hat');
  whole('hand');
  whole('access');
  // The bare hand goes last: it grips whatever the hand slot is holding, so the
  // fingers have to sit in front of it and of everything else. With nothing
  // held there is nothing to grip, and the sprite is a free-floating hand
  // rather than the end of an arm — leaving it out is what empty-handed looks
  // like, and the body it hangs off has no arms drawn on it either.
  if (outfit.hand) push('hand-base', tex('hand'));
  return out;
}

/**
 * Where each slot lives on the shared canvas, so a thumbnail can zoom into
 * the item instead of showing a mostly transparent sheet.
 */
export const SLOT_FOCUS: Record<Slot, { x: number; y: number; w: number; h: number }> = {
  hat: { x: 110, y: 60, w: 260, h: 260 },
  neck: { x: 140, y: 330, w: 200, h: 200 },
  torso: { x: 60, y: 380, w: 360, h: 360 },
  hand: { x: 40, y: 430, w: 300, h: 300 },
  access: { x: 120, y: 150, w: 240, h: 240 },
};

/**
 * A look for the opponent. Weighted so the rare tiers stay rare — a rival in
 * head-to-toe mythic should feel like an event, not the average Tuesday.
 */
const RARITY_WEIGHTS: [Rarity, number][] = [
  ['common', 35],
  ['uncommon', 27],
  ['rare', 20],
  ['legend', 13],
  ['mythic', 5],
];

export function randomOutfit(rand: () => number): Outfit {
  const total = RARITY_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  const out: Outfit = {};
  for (const slot of SLOTS) {
    let roll = rand() * total;
    for (const [rarity, weight] of RARITY_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) {
        out[slot] = rarity;
        break;
      }
    }
    out[slot] ??= 'common';
  }
  return out;
}

/* ------------------------------------------------------------- persistence */

const OWNED_KEY = 'brokerstars.owned';
const OUTFIT_KEY = 'brokerstars.outfit';

/**
 * Nobody starts dressed. The commons used to be granted and force-merged back
 * in on every load, which made them impossible not to own and therefore
 * impossible to sell a player on; now the bottom rung of every slot is a
 * purchase like any other, and the menu opens on a bare trader with hair.
 */
export const STARTER: Outfit = {};

export function loadOwned(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OWNED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveOwned(owned: Set<string>): void {
  try {
    window.localStorage.setItem(OWNED_KEY, JSON.stringify([...owned]));
  } catch {
    /* storage unavailable — purchases do not survive the session */
  }
}

export function loadOutfit(): Outfit {
  try {
    const raw = window.localStorage.getItem(OUTFIT_KEY);
    if (!raw) return { ...STARTER };
    const parsed = JSON.parse(raw) as Outfit;
    const out: Outfit = {};
    for (const s of SLOTS) {
      const r = parsed?.[s];
      if (r && RARITIES.includes(r)) out[s] = r;
    }
    // an empty outfit is a real answer now, not a sign of a broken save
    return out;
  } catch {
    return { ...STARTER };
  }
}

export function saveOutfit(outfit: Outfit): void {
  try {
    window.localStorage.setItem(OUTFIT_KEY, JSON.stringify(outfit));
  } catch {
    /* same as above */
  }
}
