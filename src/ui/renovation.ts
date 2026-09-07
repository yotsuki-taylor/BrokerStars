/**
 * The room behind the menu and its renovation, one item at a time.
 * Meta, like progress.ts and wardrobe.ts — the simulation knows nothing of it.
 *
 * Every sprite is 1080x1920, the whole room on one canvas, so the scene is
 * plain image stacking with no per-item placement.
 */

import { read, write } from './store';

export type RoomSlot = 'bg' | 'bed' | 'door' | 'table' | 'window' | 'shelf' | 'rug' | 'picture';

export interface RoomStep {
  slot: RoomSlot;
  label: string;
  price: number;
}

/**
 * Renovation order, exactly as it is offered. All eight numbers live here and
 * nowhere else, and they come to 1000 coins.
 *
 * DELIBERATELY A TENTH OF THE WARDROBE, WHICH IS 7750. The room is the one
 * thing a player buys that does nothing: it changes the picture behind the
 * menu and not a single number in a match, where every rung of a slot hands
 * out a perk. A cosmetic that costs what a perk costs is a cosmetic nobody
 * sane buys, and this used to be worse in the other direction — the eight
 * steps came to 144 coins against a wardrobe of 415, so the room was a quarter
 * of everything there was to buy and finished in an afternoon.
 *
 * The shape follows two rules. No step costs more than the SECOND rung of a
 * slot (`PRICES.uncommon` is 200, the dearest step here is 260 — close enough
 * that the room never out-prices a garment that actually does something), and
 * the first step at 20 stays the cheapest purchase in the game, under even the
 * common. That first one is the tutorial for spending: it is on the menu from
 * the first minute, and it should be affordable on the first evening.
 *
 * At what a league pays and what the day's quests add, the whole room is two
 * to five weeks — a side goal that finishes while the wardrobe is still
 * months away, which is the right order for the thing with an award on it and
 * no effect on play.
 */
export const ROOM_STEPS: RoomStep[] = [
  { slot: 'bg', label: 'WALLS & FLOOR', price: 20 },
  { slot: 'bed', label: 'BED', price: 40 },
  { slot: 'door', label: 'DOOR', price: 70 },
  { slot: 'window', label: 'WINDOW', price: 100 },
  { slot: 'table', label: 'TABLE', price: 130 },
  { slot: 'shelf', label: 'SHELF', price: 170 },
  { slot: 'rug', label: 'RUG', price: 210 },
  { slot: 'picture', label: 'PICTURE', price: 260 },
];

/**
 * Bottom to top: walls, then what hangs flat on them, the rug on the floor,
 * wall fittings, and furniture last. The picture goes in early — it is paint
 * on a wall, and anything in the room stands in front of it.
 */
const DRAW_ORDER: RoomSlot[] = [
  'bg',
  'picture',
  'rug',
  'window',
  'door',
  'shelf',
  'bed',
  'table',
];

/**
 * What the starting room already has, in some shabby form. Three slots have no
 * poor sprite at all and stay empty until they are bought: there is no rug on
 * the floor, nothing on the wall, and nowhere to work — the table is the one
 * piece of furniture the room is missing rather than merely a bad version of.
 */
const POOR_HAS: Record<RoomSlot, boolean> = {
  bg: true,
  bed: true,
  door: true,
  table: false,
  window: true,
  shelf: true,
  rug: false,
  picture: false,
};

/**
 * The prices above are plain data and the Worker imports them: what a
 * renovation step costs is charged on the server now, not in the browser that
 * asks for it (`worker/src/profile.ts`). A Worker has no Vite `import.meta.env`
 * and no `window`, so the one place this module touches a platform reaches for
 * it rather than naming it — the same dodge `ui/wardrobe.ts` makes, and for the
 * same reason.
 */
const BASE_URL =
  (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

const tex = (name: string) => `${BASE_URL}textures/room/${name}.png`;

export function stepIndexOf(slot: RoomSlot): number {
  return ROOM_STEPS.findIndex((s) => s.slot === slot);
}

/** Sprites for the room at a given number of completed steps. */
export function roomLayers(done: number): { key: string; url: string }[] {
  const out: { key: string; url: string }[] = [];
  for (const slot of DRAW_ORDER) {
    const upgraded = stepIndexOf(slot) < done;
    if (!upgraded && !POOR_HAS[slot]) continue;
    out.push({ key: slot, url: tex(`${upgraded ? 'cosy' : 'poor'}_${slot}`) });
  }
  return out;
}

/** Preview sprite for the renovation card: what that slot is about to become. */
export function upgradedSprite(slot: RoomSlot): string {
  return tex(`cosy_${slot}`);
}

export const ROOM_DONE = ROOM_STEPS.length;

/* ------------------------------------------------------------- persistence */

/**
 * The room lives on the server now (`src/profile/protocol.ts`); this is the
 * copy the menu draws before the first answer comes back, and the whole of it
 * in a build with no server behind one.
 */
const KEY = 'brokerstars.room';

export function loadRoom(): number {
  const n = Number(read(KEY));
  return Number.isFinite(n) ? Math.min(ROOM_DONE, Math.max(0, Math.floor(n))) : 0;
}

export function saveRoom(done: number): void {
  write(KEY, String(done));
}
