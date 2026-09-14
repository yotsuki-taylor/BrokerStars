/**
 * Cosmetics: what exists, what it costs, what the player owns and wears.
 * Like progress.ts this is meta and lives outside sim/ — the match neither
 * knows nor cares what the trader is wearing.
 *
 * Every sprite is exported on the same 474x732 canvas, so the character is
 * built by stacking whole images with no per-item offsets.
 */

import { read, write } from './store';

export type Slot = 'hat' | 'neck' | 'torso' | 'hand' | 'access';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'legend';

export const SLOTS: Slot[] = ['hat', 'neck', 'torso', 'hand', 'access'];
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'mythic', 'legend'];

export const SLOT_LABEL: Record<Slot, string> = {
  hat: 'HEAD',
  neck: 'NECK',
  torso: 'BODY',
  hand: 'HANDS',
  access: 'EXTRA',
};

/**
 * What one garment costs, by how rare it is.
 *
 * These used to be STEP prices on a ladder: a slot was climbed in order, so the
 * legend at the top really cost 1550 coins because the four rungs under it had
 * to be bought first. Nothing is climbed any more — every garment on today's
 * shelf may be bought on its own, in any order — so a legend costs 600 and the
 * whole catalogue costs 7750 rather than the old 7750-with-no-choice-in-it.
 *
 * WHY THEY ARE THIS BIG. The old curve was 4/7/12/20/40, and the trouble with
 * it was the size rather than the shape: at what a league pays, every single
 * item on it cost about a fifth of an evening, and a whole wardrobe went in six
 * days. Clothes hand out perks that change how every subsequent match is
 * played — the neck slot hands out the abilities outright — so they were at
 * once the biggest lever in the game and the cheapest thing in it. Seven coins
 * for an ability is not a price.
 *
 * THE SHAPE IS THE LEAGUE'S. A league pays 2.2 coins a match in the bronze pit
 * and 12.2 under the crown, and the day's quests add about 7.5 on top of
 * whatever gets played (`src/daily/protocol.ts`). Against that, at eight
 * matches an evening, these prices come to 2 / 5.6 / 5.9 / 5.5 / 5.7 days per
 * item in the league where each tier actually gets bought.
 *
 * THE COMMON IS THE ODD ONE, DELIBERATELY. At two days it is half the price in
 * evenings of everything above it. The first purchase is not a reward for a
 * grind, it is the lesson that the shop exists and that what is in it decides
 * matches, so it is cheap on purpose — and the shelf puts a common out two
 * draws in five (`src/shop/protocol.ts`), so a new player meets one quickly.
 *
 * What a price no longer has to do is gate anything. A player who saves for
 * three weeks and spends the lot on the first legend the shelf offers is
 * playing the game as intended; the price is the wait, and the shelf is the
 * luck.
 */
export const PRICES: Record<Rarity, number> = {
  common: 50,
  uncommon: 200,
  rare: 300,
  mythic: 400,
  legend: 600,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  mythic: 'MYTHIC',
  legend: 'LEGEND',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa9bf',
  uncommon: '#5fd08a',
  rare: '#4aa8ff',
  mythic: '#c56bff',
  legend: '#ffb020',
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
 * This is the text. The numbers behind it live in ui/perks.ts and the two have
 * to be changed together — there is a test that checks the discounts and the
 * payouts named below are the ones the game actually applies.
 */
export const SLOT_THEME: Record<Slot, string> = {
  hat: 'THE BOARD YOU GET',
  neck: 'WHAT YOU CAN DO ONCE',
  torso: 'HOW BAD IT CAN GET',
  hand: 'WHAT TRADING COSTS',
  access: 'WHAT YOU KNOW',
};

/**
 * Names describe the sprite the player is looking at, not the effect: the
 * preview shows a red bandana, so the card cannot call it a flat cap. The
 * effect is the line underneath, and that is where the plain language goes.
 *
 * EVERY LINE STANDS ALONE. They used to be written as a ladder — the FLOOR SUIT
 * said "that, and once a match...", because the shop only ever showed it to
 * somebody who was already wearing the shirt under it and had just read what
 * the shirt does. The shop draws five unrelated garments now
 * (`src/shop/protocol.ts`), so a card is as likely as not the first thing its
 * slot has ever shown the player, and "the same again" names nothing. Each line
 * says the whole of what wearing that one garment does, lower rungs included —
 * which is the truth anyway, since `ui/perks.ts` reads one rank per slot and a
 * higher rank carries everything under it.
 */
export const CATALOGUE: Record<Slot, Record<Rarity, ItemCard>> = {
  hat: {
    common: {
      name: 'BANDANA',
      text: 'You see which three companies you are about to face, and can walk away.',
    },
    uncommon: {
      name: 'BALL CAP',
      text: 'You see the three companies before the match, and once you can send them back for a different three.',
    },
    rare: {
      name: 'PIT CAP',
      text: 'You see the three, can send them back twice a match, and can bar one company from this league for good.',
    },
    mythic: {
      name: 'BLACK BRIM',
      text: 'Name one company you always want on the board and it is always there — plus two goes at the rest, and a company barred for good.',
    },
    legend: {
      name: 'TEN GALLON',
      text: 'You choose all three companies yourself, every match.',
    },
  },
  neck: {
    common: {
      name: 'STAFF LANYARD',
      text: 'STATIC — five seconds where your rival cannot open anything new.',
    },
    uncommon: {
      name: 'PLAIN TIE',
      text: 'HALT — ten seconds where nobody may trade what your rival is deepest in. You too.',
    },
    rare: {
      name: 'SILK TIE',
      text: 'DOSSIER — see what your rival is holding for the rest of the match.',
    },
    mythic: {
      name: 'BOW TIE',
      text: 'MARGIN CALL — close every position your rival has, where it stands.',
    },
    legend: {
      name: 'GOLD PENDANT',
      text: 'RUMOUR — six seconds of the market moving your biggest position your way.',
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
      text: 'You cannot be wiped out, and once a match a position 15% under water gets out on its own.',
    },
    mythic: {
      name: 'HOUSE TUXEDO',
      text: 'You cannot be wiped out, two sinking positions a match get out on their own, and your first losing trade hands half of it back.',
    },
    legend: {
      name: 'EARLY RETIREMENT',
      text: 'Everything a bad day can be spared, and once a match you can take back your last trade at the price you paid.',
    },
  },
  hand: {
    common: { name: 'SPIRAL NOTEPAD', text: 'Trading costs you 15% less.' },
    uncommon: { name: 'CLIPBOARD', text: 'Trading costs you 30% less.' },
    rare: {
      name: 'WAD OF CASH',
      text: 'Trading costs you 45% less, and a big order moves the price against you less.',
    },
    mythic: {
      name: 'BURNER PHONE',
      text: 'Trading costs you 60% less, and big orders barely move the price at all.',
    },
    legend: {
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
      text: 'The board is spelled out before you agree to it, and three seconds before a headline lands you hear which company it hits.',
    },
    mythic: {
      name: 'EARPIECE',
      text: 'The board is spelled out, headlines come with warning, and the company you are holding tells you which way it is about to go.',
    },
    legend: {
      name: 'ORACLE LENS',
      text: 'Everything the market will admit to, and the next two seconds of the company you hold drawn ahead of the line.',
    },
  },
};

/**
 * Every garment there is, flat — the shop's pool, and the only place that
 * wants the catalogue as a list rather than as a table
 * (`src/shop/protocol.ts`).
 */
export const ALL_ITEMS: { slot: Slot; rarity: Rarity; id: string }[] = SLOTS.flatMap((slot) =>
  RARITIES.map((rarity) => ({ slot, rarity, id: itemId(slot, rarity) })),
);

export const SPRITE_W = 474;
export const SPRITE_H = 732;

/**
 * Everything in this file above the sprite plumbing is plain data, and the
 * server imports it: what a duellist's clothes are worth is worked out on the
 * object that runs the match (`worker/src/duel.ts`), and what a rung costs is
 * charged where the wardrobe is kept (`worker/src/profile.ts`) — not in the
 * browser that asks for either. A Worker has neither Vite's `import.meta.env`
 * nor a `window`, so the one place this module touches a platform reaches for
 * it rather than names it, and `./store` does the same for the other.
 */
const BASE_URL =
  (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

const tex = (name: string) => `${BASE_URL}textures/shop/${name}.png`;

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
  'torso-mythic': 'both',
  'torso-legend': 'both',
  'neck-common': 'both',
  'neck-legend': 'both',
  'neck-mythic': 'both',
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

/* ---------------------------------------------------------- what is owned */

/**
 * The best garment owned in a slot, or null for a bare one.
 *
 * There is no longer a ladder under this: a wardrobe is any twenty-five-way
 * subset now, holes and all, so "highest" is the best thing in the drawer
 * rather than the top of an unbroken run. It is what the menu asks in order to
 * know whether a slot has anything in it at all, and what a refund falls back
 * to when the garment being worn is handed in.
 */
export function highestOwned(owned: Set<string>, slot: Slot): Rarity | null {
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (owned.has(itemId(slot, RARITIES[i]))) return RARITIES[i];
  }
  return null;
}

/** Rarity as a number, cheapest first — the one order the shelf is sorted in. */
export const rankOf = (rarity: Rarity): number => RARITIES.indexOf(rarity);

export type Outfit = Partial<Record<Slot, Rarity>>;

interface Layer {
  key: string;
  url: string;
}

/**
 * Bottom-to-top draw order. The two-piece garments straddle the neck item:
 * shirt body, then the chain that tucks under the collar, then the collar,
 * then whatever hangs in front. The bare hand caps the stack.
 *
 * Eyewear goes on before the hat, not after: glasses sit on a face and a brim
 * comes down over the temples, so a stetson drawn under its own sunglasses
 * reads as the glasses floating in front of the hat.
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
  whole('access');
  whole('hat');
  whole('hand');
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
 * head-to-toe legend should feel like an event, not the average Tuesday.
 */
const RARITY_WEIGHTS: [Rarity, number][] = [
  ['common', 35],
  ['uncommon', 27],
  ['rare', 20],
  ['mythic', 13],
  ['legend', 5],
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

/**
 * The wardrobe lives on the server now (`src/profile/protocol.ts`). These two
 * keys are the copy the menu and the shop draw before the first answer comes
 * back, and the whole of it in a build with no server behind one.
 */
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
    const raw = read(OWNED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveOwned(owned: Set<string>): void {
  write(OWNED_KEY, JSON.stringify([...owned]));
}

export function loadOutfit(): Outfit {
  try {
    const raw = read(OUTFIT_KEY);
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
  write(OUTFIT_KEY, JSON.stringify(outfit));
}
