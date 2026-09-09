/**
 * The guided tour of the main menu.
 *
 * Everything this game does is behind a button on one screen, and none of the
 * buttons say what they are for: SHOP and EQUIP look like the same errand until
 * somebody notices that clothes carry perks, the counter where dollars buy a
 * piece of a company is two taps inside ARCHIVE, and DUEL needs a friend at the
 * other end of a link nobody has been told about. HOW TO PLAY covers the eighty
 * seconds of a match and nothing around it, which is the half a player works
 * out on their own anyway.
 *
 * So this is a list of steps rather than a page of text: each one names a mark
 * in the menu's markup, and the overlay lights that button up and dims the rest
 * of the screen while it says what is behind it. The text lives in `i18n.ts`
 * under `tut.<id>.title` and `tut.<id>.body`, keyed by the id here.
 *
 * WHY MARKS AND NOT CSS SELECTORS. A step points at `data-tut="play"`, not at
 * `.menu-btn.play`. The tour then survives restyling — and a mark that has been
 * renamed out of the menu simply drops its step (see `TutorialOverlay.tsx`)
 * instead of lighting up empty floor.
 *
 * THE MATCH ITSELF IS NOT IN HERE. One step says PLAY starts a match against a
 * bot and leaves it there. What happens inside those eighty seconds is what
 * HOW TO PLAY is for, and a tour that stopped to teach shorting would be closed
 * before it reached the things nobody discovers by themselves.
 */

import { read, write } from './store';

export interface TutorialStep {
  /** `tut.<id>.title` and `tut.<id>.body` in the dictionary */
  id: string;
  /**
   * The `data-tut` marks to light up together, in the order the union of their
   * boxes is taken. Nothing means the step talks about the game rather than
   * about a button, and the screen stays evenly dimmed under it.
   */
  marks?: string[];
}

/**
 * The tour, in the order it is given.
 *
 * The shape of it is: what the two big buttons do, then where the money comes
 * from, then what it is spent on, and the settings last because that is where
 * this tour can be started again. The share counter gets a step of its own
 * rather than a clause in the ARCHIVE one — it is a whole second game played at
 * one order a day, and it is the single feature players are least likely to
 * find, being a tab behind a button named after a shelf.
 */
export const TUTORIAL: TutorialStep[] = [
  { id: 'welcome' },
  { id: 'play', marks: ['play'] },
  { id: 'duel', marks: ['duel'] },
  { id: 'friends', marks: ['friends'] },
  { id: 'money', marks: ['dollars', 'coins'] },
  { id: 'daily', marks: ['daily'] },
  { id: 'archive', marks: ['archive'] },
  { id: 'shares', marks: ['archive'] },
  { id: 'shop', marks: ['shop'] },
  { id: 'equip', marks: ['equip'] },
  { id: 'room', marks: ['room'] },
  { id: 'rating', marks: ['rating'] },
  { id: 'settings', marks: ['settings'] },
];

/* ------------------------------------------------------------- persistence */

/**
 * Whether this device has been shown the tour. Deliberately local and not part
 * of the profile: it is about this browser having seen an overlay, not about
 * anything the player owns, and the server has no business holding it.
 *
 * A store that is missing or locked down answers "not seen" for ever, so the
 * tour would greet every launch. That is why it is marked seen the moment it
 * OPENS rather than when it is finished — in the normal case the difference is
 * invisible, and in the broken one it at least fails towards a tour that can be
 * closed once per session instead of one that cannot be got rid of.
 */
const KEY = 'brokerstars.tutorial';

export function tutorialSeen(): boolean {
  return read(KEY) === '1';
}

export function markTutorialSeen(): void {
  write(KEY, '1');
}
