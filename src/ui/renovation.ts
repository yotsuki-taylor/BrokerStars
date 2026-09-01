/**
 * The room behind the menu and its renovation, one item at a time.
 * Meta, like progress.ts and wardrobe.ts — the simulation knows nothing of it.
 *
 * Every sprite is 1080x1920, the whole room on one canvas, so the scene is
 * plain image stacking with no per-item placement.
 */

export type RoomSlot = 'bg' | 'bed' | 'door' | 'table' | 'window' | 'shelf' | 'rug';

export interface RoomStep {
  slot: RoomSlot;
  label: string;
  price: number;
}

/**
 * Renovation order, exactly as it is offered. Prices climb so the room stays
 * something to work towards rather than a first-evening purchase — all seven
 * numbers live here and nowhere else.
 */
export const ROOM_STEPS: RoomStep[] = [
  { slot: 'bg', label: 'WALLS & FLOOR', price: 3 },
  { slot: 'bed', label: 'BED', price: 6 },
  { slot: 'door', label: 'DOOR', price: 10 },
  { slot: 'window', label: 'WINDOW', price: 15 },
  { slot: 'table', label: 'TABLE', price: 20 },
  { slot: 'shelf', label: 'SHELF', price: 25 },
  { slot: 'rug', label: 'RUG', price: 30 },
];

/** Bottom to top: walls, then the rug on the floor, wall fittings, furniture. */
const DRAW_ORDER: RoomSlot[] = ['bg', 'rug', 'window', 'door', 'shelf', 'bed', 'table'];

/** The starting room has no rug at all — laying one is the last step. */
const POOR_HAS: Record<RoomSlot, boolean> = {
  bg: true,
  bed: true,
  door: true,
  table: true,
  window: true,
  shelf: true,
  rug: false,
};

const tex = (name: string) => `${import.meta.env.BASE_URL}textures/room/${name}.png`;

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

const KEY = 'brokerstars.room';

export function loadRoom(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(n) ? Math.min(ROOM_DONE, Math.max(0, Math.floor(n))) : 0;
  } catch {
    return 0;
  }
}

export function saveRoom(done: number): void {
  try {
    window.localStorage.setItem(KEY, String(done));
  } catch {
    /* storage unavailable — the room resets next session */
  }
}
