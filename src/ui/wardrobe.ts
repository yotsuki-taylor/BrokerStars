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

/**
 * Garments the artist split in two, so one piece can sit under the neck item
 * and the other over it. Everything else is a single sprite.
 */
const TWO_PIECE = new Set(['torso-common', 'torso-uncommon', 'torso-rare', 'torso-legend', 'torso-mythic', 'neck-common']);

export function itemId(slot: Slot, rarity: Rarity): string {
  return `${slot}-${rarity}`;
}

export function isTwoPiece(slot: Slot, rarity: Rarity): boolean {
  return TWO_PIECE.has(itemId(slot, rarity));
}

/** Sprite for one half of a garment, or the whole thing when it is single. */
export function pieceUrl(slot: Slot, rarity: Rarity, piece: 'up' | 'down' | 'single'): string {
  const id = itemId(slot, rarity);
  return tex(piece === 'single' ? id : `${id}-${piece}`);
}

export type Outfit = Partial<Record<Slot, Rarity>>;

interface Layer {
  key: string;
  url: string;
}

/**
 * Bottom-to-top draw order. The two-piece garments straddle the neck item:
 * shirt body, then the chain that tucks under the collar, then the collar,
 * then whatever hangs in front.
 */
export function buildLayers(outfit: Outfit): Layer[] {
  const out: Layer[] = [];
  const push = (key: string, url: string) => out.push({ key, url });
  const half = (slot: Slot, piece: 'up' | 'down') => {
    const r = outfit[slot];
    if (!r) return;
    if (isTwoPiece(slot, r)) push(`${slot}-${piece}`, pieceUrl(slot, r, piece));
    else if (piece === 'down') push(slot, pieceUrl(slot, r, 'single'));
  };
  const whole = (slot: Slot) => {
    const r = outfit[slot];
    if (r && !isTwoPiece(slot, r)) push(slot, pieceUrl(slot, r, 'single'));
  };

  push('body', tex('body'));
  half('torso', 'down');
  half('neck', 'down');
  half('torso', 'up');
  half('neck', 'up');
  push('face', tex('face'));
  push('hair', tex('hair-1'));
  whole('hat');
  push('hand-base', tex('hand'));
  whole('hand');
  whole('access');
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
