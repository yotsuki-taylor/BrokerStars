/**
 * What a corporation can wear: a mark and a colour, both from a closed set.
 *
 * Shared by the game and the Worker, like `src/awards/catalogue.ts` and for the
 * same reason — the screen draws from this list and the server validates
 * against it, so a corporation cannot be shown wearing one thing and stored
 * wearing another.
 *
 * WHY A CATALOGUE AND NOT AN UPLOAD. The same argument that keeps free text out
 * of the feed and Cyrillic out of a name: a picture somebody supplies is a
 * moderation duty, and this game has nobody to staff one. A closed set of marks
 * cannot say anything, so nothing has to be checked after the fact. It is also
 * the reason the colour is a list rather than a picker — see `COLORS`.
 *
 * TWO KINDS IN ONE LIST. Fourteen marks drawn for this (`textures/corps/`), and
 * the twenty-eight the companies already wear. The second half costs nothing —
 * every one of them is in the bundle already — and gives somebody who has met
 * KRAKEN on a board the option of flying its flag. They are namespaced `c:` so
 * that no company can ever collide with a mark of our own, and so that the two
 * halves can be drawn under separate headings.
 *
 * Every mark is a white silhouette on a 48×48 viewBox, tinted through a CSS
 * mask by `LogoMask` — which is what makes one file work in ten colours and at
 * any size.
 */

import { COMPANIES } from '../sim/companies';

export interface Emblem {
  id: string;
  /** relative to `public/textures/`, as `tex()` and `LogoMask` expect */
  file: string;
}

/**
 * The marks drawn for corporations.
 *
 * Chosen to be legible at eighteen pixels, which is the size the list draws
 * them at and the size that sent three back to be redrawn: a key upright is a
 * dot, a painted window is not a hole in a mask, and a bull whose horns point
 * up is a rabbit. What survives is bold, and none of it has a detail smaller
 * than the stroke.
 *
 * The order is the order they are offered in, and it opens with the four that
 * are about this game rather than about heraldry.
 *
 * TWO ARE MISSING ON PURPOSE. An anchor and a rocket were drawn and then taken
 * out, because `civic` and `garage` in the half below are an anchor and a
 * rocket — and two near-identical marks in one picker are not a choice, they
 * are a thing to squint at. The company half cannot give them up; these could.
 * Anything drawn for this set from now on wants checking against those
 * twenty-eight first.
 */
export const OWN_EMBLEMS: Emblem[] = [
  'arrow',
  'candles',
  'bull',
  'mountain',
  'crown',
  'diamond',
  'shield',
  'bolt',
  'star',
  'flame',
  'target',
  'hex',
  'key',
  'moon',
].map((id) => ({ id, file: `corps/${id}.svg` }));

/**
 * The marks the companies wear, offered under their own heading.
 *
 * Derived from the roster rather than copied out of it, so adding a company
 * adds an emblem and nothing has to be kept in step. A corporation holding an
 * id whose company has since been removed falls back to the default rather than
 * drawing nothing — see `emblemById`.
 */
export const COMPANY_EMBLEMS: Emblem[] = COMPANIES.map((c) => ({
  id: `c:${c.id}`,
  file: c.logo,
}));

export const EMBLEMS: Emblem[] = [...OWN_EMBLEMS, ...COMPANY_EMBLEMS];

const BY_ID = new Map(EMBLEMS.map((e) => [e.id, e]));

/** The one a corporation gets when it has not chosen, or chose something gone. */
export const DEFAULT_EMBLEM = OWN_EMBLEMS[0].id;

export const emblemById = (id: string): Emblem =>
  BY_ID.get(id) ?? BY_ID.get(DEFAULT_EMBLEM)!;

/** An emblem id as it can be stored, or the default. Never anything else. */
export const cleanEmblem = (raw: unknown): string => {
  const id = String(raw ?? '');
  return BY_ID.has(id) ? id : DEFAULT_EMBLEM;
};

/**
 * The ten colours a corporation may be.
 *
 * A LIST AND NOT A PICKER, for two reasons and the second is the serious one.
 *
 * A picker lets somebody choose the background they are drawn on, and a mark
 * nobody can see is not a choice anybody meant to make — it is a mistake that
 * every other member has to look at. These ten are all checked against the dark
 * blue every screen in this game is painted on.
 *
 * And this value ends up in `style.backgroundColor` on a mark drawn for thirty
 * other people. A free string there is somebody else's CSS running in your
 * client; a closed set is ten constants. The server validates against this same
 * list (`cleanColor`), so what reaches a browser is always one of these
 * literals whatever was sent.
 *
 * Ordered around the wheel rather than by taste, so the row of swatches reads
 * as a spectrum and two neighbours are never nearly the same colour.
 */
export const COLORS: string[] = [
  '#FFC02E', // gold — the game's own
  '#F08322', // orange
  '#FF6051', // red
  '#FF7BC2', // pink
  '#C06BFF', // purple
  '#4B95FF', // blue
  '#57E0FF', // cyan
  '#00C98D', // green
  '#C8F53C', // lime
  '#E6F0FF', // steel, for anybody who wants no colour at all
];

export const DEFAULT_COLOR = COLORS[0];

/** A colour as it can be stored: one of the ten, or the default. */
export const cleanColor = (raw: unknown): string => {
  const c = String(raw ?? '').toUpperCase();
  return COLORS.includes(c) ? c : DEFAULT_COLOR;
};
