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

export const PRICES: Record<Rarity, number> = {
  common: 5,
  uncommon: 12,
  rare: 25,
  legend: 50,
  mythic: 100,
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa9bf',
  uncommon: '#5fd08a',
  rare: '#4aa8ff',
  legend: '#c56bff',
  mythic: '#ffb020',
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
 *            draws over it;
 *   'up'   — one sprite that must sit above the collar anyway (a bow tie);
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
  'neck-legend': 'up',
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
  // the bare hand goes last: it grips whatever the hand slot is holding, so the
  // fingers have to sit in front of it and of everything else
  push('hand-base', tex('hand'));
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

/** Everyone starts dressed, otherwise the menu opens on an undressed mannequin. */
export const STARTER: Outfit = {
  hat: 'common',
  neck: 'common',
  torso: 'common',
  hand: 'common',
  access: 'common',
};

export function starterOwned(): string[] {
  return SLOTS.map((s) => itemId(s, 'common'));
}

export function loadOwned(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OWNED_KEY);
    if (!raw) return new Set(starterOwned());
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set([...starterOwned(), ...arr.map(String)]) : new Set(starterOwned());
  } catch {
    return new Set(starterOwned());
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
    return Object.keys(out).length ? out : { ...STARTER };
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
