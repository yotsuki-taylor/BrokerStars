/**
 * What there is to earn, and nothing about how it looks.
 *
 * Both ends import this file — the Worker to judge (`worker/src/awards.ts`),
 * the game to draw (`ui/ArchiveScreen.tsx`) — so the list is written once and
 * an id that exists on one side exists on the other.
 *
 * Deliberately no names and no wording in here. Two reasons. The Worker has no
 * business carrying a translation table, and importing `ui/i18n.ts` would drag
 * one into it. And the four league awards take their name from the league
 * itself (`LEAGUES[league].name`), because a second copy of "SILVER FLOOR"
 * would be a second thing to rename and a second chance to get it wrong — that
 * is exactly how an award once ended up calling the bronze league a pit, which
 * is a word the Russian game has never used. So an entry names a `league` and
 * the screen goes and looks it up.
 *
 * `hidden` is the only display fact here, because it is not really a display
 * fact: a hidden award is one whose CONDITION is not published, and that is a
 * decision about the design rather than about the layout.
 */

/** The order they are shown in, top to bottom. Groups read as a shelf. */
export type AwardGroup = 'money' | 'duel' | 'league' | 'style' | 'secret';

export interface Award {
  id: string;
  group: AwardGroup;
  /** hidden until earned: shown as ??? with the condition withheld */
  hidden: boolean;
  /**
   * The number the condition turns on, when there is one. The screen reads it
   * to draw progress — "24 000 of 30 000" — and the judge reads the same field,
   * so a threshold cannot be shown as one thing and applied as another.
   */
  goal?: number;
  /** for the four ladder awards: which league, and therefore whose name */
  league?: number;
}

/**
 * Money on the whistle. The rungs are set against what actually happens rather
 * than against round numbers: over the first 45 matches played by real people,
 * 18% of them cleared 20 000, 4% cleared 30 000, the same 4% cleared 50 000 —
 * both of those were one player having two very good days — and nothing came
 * near 75 000. The top rung is meant to be a horizon, not a chore, and it will
 * come closer on its own as people buy the clothes that make trading cheaper.
 */
export const AWARDS: Award[] = [
  { id: 'nw-20k', group: 'money', hidden: false, goal: 20_000 },
  { id: 'nw-30k', group: 'money', hidden: false, goal: 30_000 },
  { id: 'nw-50k', group: 'money', hidden: false, goal: 50_000 },
  { id: 'nw-75k', group: 'money', hidden: false, goal: 75_000 },

  // Duels only. A win against a bot is a different thing and pays differently;
  // these are for having beaten somebody who was actually there.
  { id: 'duel-1', group: 'duel', hidden: false, goal: 1 },
  { id: 'duel-3', group: 'duel', hidden: false, goal: 3 },
  { id: 'duel-10', group: 'duel', hidden: false, goal: 10 },

  // Earned by playing a match in the league, which is the moment you can prove
  // you got there. The server keeps `players.top_league` for its own reasons
  // already, so this needs no copy of the ladder's gates on that side.
  { id: 'league-silver', group: 'league', hidden: false, league: 1 },
  { id: 'league-gold', group: 'league', hidden: false, league: 2 },
  { id: 'league-global', group: 'league', hidden: false, league: 3 },
  { id: 'league-crown', group: 'league', hidden: false, league: 4 },

  { id: 'dressed', group: 'style', hidden: false, goal: 5 },
  { id: 'legend-item', group: 'style', hidden: false },
  { id: 'room-done', group: 'style', hidden: false },

  /*
   * The secret half. These are not harder versions of the ones above — they are
   * things that happen to you, and publishing the condition would turn each of
   * them into a chore to farm. Two of them get easier the further up the ladder
   * you go, which is the nicest property in the list: the bronze bot finishes
   * around where it started, so clearing the profit bar there and still losing
   * is nearly impossible, while the crown bot finishes at 18 000 and both of
   * these open up on their own.
   *
   * Nothing here for a draw, deliberately. Against a bot one has never happened
   * in 45 recorded matches and very likely cannot — the winner is decided by
   * comparing two fractional numbers. In a duel it is neither rare nor an
   * achievement: two people who both sit still finish on the same round number,
   * which is exactly what the first end-to-end duel in a test did.
   */
  { id: 'bust', group: 'secret', hidden: true },
  { id: 'honest-loss', group: 'secret', hidden: true },
  { id: 'pyrrhic', group: 'secret', hidden: true },
  { id: 'no-trades', group: 'secret', hidden: true },
  { id: 'streak-3', group: 'secret', hidden: true, goal: 3 },
  { id: 'all-companies', group: 'secret', hidden: true },
];

export const AWARD_IDS: string[] = AWARDS.map((a) => a.id);

const BY_ID = new Map(AWARDS.map((a) => [a.id, a]));

export const awardById = (id: string): Award | undefined => BY_ID.get(id);

export const GROUPS: AwardGroup[] = ['money', 'duel', 'league', 'style', 'secret'];

/** Only ids this build knows, so a save from a later version cannot invent one. */
export function cleanAwards(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, when] of Object.entries(raw as Record<string, unknown>)) {
    if (!BY_ID.has(id)) continue;
    const n = Math.floor(Number(when));
    out[id] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return out;
}
