/**
 * The office behind the menu and its renovation, one item at a time.
 * Meta, like progress.ts and wardrobe.ts — the simulation knows nothing of it.
 *
 * Every sprite is 1080x1920, the whole room on one canvas, so the scene is
 * plain image stacking with no per-item placement.
 *
 * It used to be a bedroom, and the bedroom is gone: a trader who has been
 * grinding leagues to buy a nicer bed was decorating the wrong room. What the
 * renovation builds now is the place the game is played from — a desk, a
 * machine on it, and the walls around them.
 */

import { read, write } from './store';

export type RoomSlot = 'bg' | 'window' | 'table' | 'comp' | 'shelf' | 'picture_1' | 'picture_2';

export interface RoomStep {
  slot: RoomSlot;
  label: string;
  price: number;
  /** what finishing this step adds to the starting cash of every match */
  cash: number;
}

/**
 * Renovation order, exactly as it is offered. All fourteen numbers live here
 * and nowhere else: the prices come to 1000 coins, the cash column to 700
 * dollars.
 *
 * PRICES ARE DELIBERATELY A TENTH OF THE WARDROBE, WHICH IS 7750. The room
 * used to be the one thing a player buys that does nothing — it changed the
 * picture behind the menu and not a single number in a match, where every rung
 * of a slot hands out a perk. That is what the cash column is for, and the
 * prices stay where they were: the room is still the cheap purchase, it simply
 * is no longer the empty one.
 *
 * The shape of the prices follows two rules. No step costs more than the
 * SECOND rung of a slot (`PRICES.uncommon` is 200, the dearest step here is
 * 250 — close enough that the room never out-prices a garment), and the first
 * step at 20 stays the cheapest purchase in the game, under even the common.
 * That first one is the tutorial for spending: it is on the menu from the
 * first minute, and it should be affordable on the first evening.
 *
 * THE CASH COLUMN IS AN ARITHMETIC LADDER OF 25, and the whole of it is +700
 * on a starting 10 000 — a seventh of a match's opening book, handed out over
 * two to five weeks of leagues and day quests. Three things set that ceiling:
 *
 *   - It has to stay UNDER the best single garment. A legend HAND takes the
 *     commission to zero and slippage to 0.65, which over a busy match is
 *     worth something like five per cent of the book, and it costs 600 coins
 *     against the room's 1000 for the lot. A room that beat it would make the
 *     cheapest thing in the game the strongest, and the wardrobe — the months
 *     of play — the mug's bargain.
 *   - It has to be FELT. The rival sits down with a flat 10 000 and the market
 *     is won by the wider book, so +7 % is a few points of win rate rather
 *     than a rounding error: enough that a finished office is a reason to
 *     finish it, and not enough to carry a bad match.
 *   - The rungs rise while the value per coin falls away from a generous
 *     first step: 25 dollars for 20 coins is a dollar and a quarter each, and
 *     every step after it settles around two thirds of that. Same shape as the
 *     rarity ladder, where common 50 buys more per coin than legend 600, and
 *     it keeps the cheapest purchase in the game the open-handed one — which
 *     is the whole job of the first step.
 *
 * The bedroom's eight steps also came to 1000. Keeping the total across the
 * change is what makes the move free: `spent` is a stored number, not one
 * recomputed from this table, so nobody's balance moves when the office
 * replaces the bedroom under a save that is halfway through it. The cash
 * column arrived later and needed no such care — it is recomputed from the
 * count every match and nothing stores it.
 */
export const ROOM_STEPS: RoomStep[] = [
  { slot: 'bg', label: 'WALLS & FLOOR', price: 20, cash: 25 },
  { slot: 'window', label: 'WINDOW', price: 60, cash: 50 },
  { slot: 'table', label: 'DESK', price: 110, cash: 75 },
  { slot: 'comp', label: 'COMPUTER', price: 150, cash: 100 },
  { slot: 'shelf', label: 'CABINET', price: 190, cash: 125 },
  { slot: 'picture_1', label: 'POSTER', price: 220, cash: 150 },
  { slot: 'picture_2', label: 'SECOND POSTER', price: 250, cash: 175 },
];

/**
 * Bottom to top: walls and floor, then the two holes and hangings in the wall,
 * then the furniture standing in front of them, and the computer last because
 * it sits on the desk.
 */
const DRAW_ORDER: RoomSlot[] = [
  'bg',
  'window',
  'picture_1',
  'picture_2',
  'shelf',
  'table',
  'comp',
];

/**
 * The slots that stand between the viewer and the trader, rather than behind
 * him. The desk is drawn from the near side and he is sitting AT it, so his
 * legs belong under it and the monitor belongs in front of his chest — put
 * them behind him and he is standing in the middle of his own desk.
 *
 * Everything else is wall: the window, the posters and the cabinet are all
 * flat against the back of the room, and nothing that far away should ever
 * cross the figure.
 *
 * This is the whole reason the scene is drawn in two stacks instead of one —
 * see `Room.tsx`, which the menu renders once on each side of the character.
 */
const IN_FRONT: RoomSlot[] = ['table', 'comp'];

/**
 * What the starting office already has, in some shabby form. It is a room with
 * nothing in it: bare walls and a broken window, and that is the whole of it.
 * Every other slot stays empty until it is bought — an empty office is a
 * better first frame than a badly furnished one, because it reads as something
 * to be built rather than something to be tidied.
 */
const POOR_HAS: Record<RoomSlot, boolean> = {
  bg: true,
  window: true,
  table: false,
  comp: false,
  shelf: false,
  picture_1: false,
  picture_2: false,
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

/**
 * WebP, and the room is the only place in the game that uses it.
 *
 * These are nine full-screen 1080x1920 layers stacked to make one office, and
 * as PNGs they were 7.1 MB — more than everything else the game ships put
 * together, downloaded by every player to draw one screen. At quality 90 they
 * are 0.57 MB and a pixel-for-pixel comparison of the wallpaper, the skirting
 * and the floorboards shows nothing to tell apart.
 *
 * Safe everywhere this game runs: WebView has read WebP since Android 4.2 and
 * this app's floor is 7, Telegram's WebView is modern Chrome, and every browser
 * has supported it for years.
 *
 * Only here because only here is the extension in one place. Everywhere else a
 * texture is named with its extension in a data file — `sim/companies.ts`,
 * `ui/leagues.ts` — and converting those means editing the names rather than
 * one line.
 */
const tex = (name: string) => `${BASE_URL}textures/room/${name}.webp`;

export function stepIndexOf(slot: RoomSlot): number {
  return ROOM_STEPS.findIndex((s) => s.slot === slot);
}

/**
 * Sprites for the room at a given number of completed steps, in painting
 * order, each one saying which side of the character it belongs on.
 */
export function roomLayers(done: number): { key: string; url: string; front: boolean }[] {
  const out: { key: string; url: string; front: boolean }[] = [];
  for (const slot of DRAW_ORDER) {
    const upgraded = stepIndexOf(slot) < done;
    if (!upgraded && !POOR_HAS[slot]) continue;
    out.push({
      key: slot,
      url: tex(`office_${slot}${upgraded ? '' : '_poor'}`),
      front: IN_FRONT.includes(slot),
    });
  }
  return out;
}

/** Preview sprite for the renovation card: what that slot is about to become. */
export function upgradedSprite(slot: RoomSlot): string {
  return tex(`office_${slot}`);
}

export const ROOM_DONE = ROOM_STEPS.length;

/**
 * What a room this far along is worth at the whistle: the dollars added to the
 * starting cash of every match this player sits down to.
 *
 * ADDED TO, not replacing. The match config's `startingCash` is still what
 * everyone starts with — a bot always, an opponent whose office is bare — and
 * this is the only thing on top of it. Clamped both ends because the number it
 * reads comes off a profile, and a profile is a thing the client sends.
 *
 * Recomputed from the count wherever it is needed rather than stored anywhere.
 * That is what lets this table be re-tuned without a migration: change a
 * number below and every save is worth the new number the next time it plays.
 */
export function roomCash(done: number): number {
  const n = Math.min(ROOM_DONE, Math.max(0, Math.floor(done || 0)));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += ROOM_STEPS[i].cash;
  return sum;
}

/** What a finished office is worth. 700, against a starting book of 10 000. */
export const ROOM_CASH_TOTAL = roomCash(ROOM_DONE);

/* ------------------------------------------------------------- persistence */

/**
 * The room lives on the server now (`src/profile/protocol.ts`); this is the
 * copy the menu draws before the first answer comes back, and the whole of it
 * in a build with no server behind one.
 *
 * A save is a COUNT of finished steps and nothing else, which is what carries
 * a bedroom halfway through renovation over to an office: five steps done stay
 * five steps done, and only the pictures behind the number changed. The one
 * place it has to bend is the top — the bedroom had eight steps and the office
 * has seven — and the clamp below does that on the way in, as does the
 * server's own read (`worker/src/profile.ts`) and the claim a legacy save
 * arrives on (`src/profile/protocol.ts`). Somebody who had finished the
 * bedroom finds the office finished; somebody who was one step short of it
 * finds the office finished too, which is a step handed out for free. That is
 * the right direction to round in — the alternative is taking a purchase back
 * off a player because the room they bought it for no longer exists.
 */
const KEY = 'brokerstars.room';

export function loadRoom(): number {
  const n = Number(read(KEY));
  return Number.isFinite(n) ? Math.min(ROOM_DONE, Math.max(0, Math.floor(n))) : 0;
}

export function saveRoom(done: number): void {
  write(KEY, String(done));
}
