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
 * THE MATCH ITSELF IS NOT IN HERE. One clause says PLAY is eighty seconds
 * against a bot and leaves it there. What happens inside those seconds is what
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
 * The tour, in the order it is given, and it is SIX steps because it used to be
 * thirteen.
 *
 * Thirteen steps was thirty-four hundred characters of paragraph between a
 * player opening the game and playing it, and most of it described buttons that
 * describe themselves. A tour is read once, by somebody who wants to start, and
 * every sentence they skim is one that could have been the sentence they
 * needed.
 *
 * WHAT SURVIVED IS WHAT NOBODY WORKS OUT ALONE. Clothes change the match and
 * only count while worn. The office is cash at the opening bell. Dollars buy
 * real shares in the companies you have played. A duel is against a person, and
 * you send them a link. Those four are pinned by `tutorial.test.ts`, which is
 * the test that stops a future tidy-up from quietly removing them.
 *
 * WHAT WENT. A welcome that said the tour was a tour; PLAY, which is one tap
 * away from explaining itself; the shop's own restock rules, which the shop
 * prints on its shelf; RATING and SETTINGS, which are a table and a gear. Where
 * two steps described two halves of one screen — the shop and the wardrobe, the
 * bonus and the balance — they are one step now, because they are one screen
 * now.
 */
export const TUTORIAL: TutorialStep[] = [
  { id: 'duel', marks: ['play', 'duel'] },
  { id: 'friends', marks: ['profile'] },
  // The two counters and not the case beside them. Lighting all three drew an
  // ellipse across the whole top of the screen, which teaches less than a tight
  // one: the case is the only button in the game that glows on its own, and the
  // sentence names it.
  { id: 'money', marks: ['coins', 'dollars'] },
  { id: 'shares', marks: ['archive'] },
  { id: 'equip', marks: ['shop'] },
  { id: 'room', marks: ['room'] },
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
