/**
 * Five leagues — the difficulty ladder and the shape of the whole progression.
 * Meta, like progress.ts and renovation.ts: the simulation knows nothing about
 * leagues, it only ever sees the bot preset a league names.
 *
 * A league is one opponent from CONFIG.bot, one star payout, and one gate: a
 * number of wins in that league before the next one opens.
 */

import type { RewardTable } from './progress';

export interface League {
  id: string;
  name: string;
  /** file under public/textures/leagues */
  icon: string;
  /** key of CONFIG.bot — the opponent this league puts up */
  preset: string;
  /** one line on what that opponent is like */
  blurb: string;
  /**
   * Wins in THIS league before the next one opens. 0 on the last one, which
   * has nothing after it.
   */
  winsToNext: number;
  reward: RewardTable;
}

/**
 * The numbers come off 300-match headless runs (see README). What matters to
 * the player is not the bot-versus-bot win rate but the bar each opponent
 * sets — its own median net worth, from 9.9k in the bronze pit to 18.2k under
 * the crown, against a 10k start. The payouts climb with that bar.
 */
export const LEAGUES: League[] = [
  {
    id: 'bronze',
    name: 'BRONZE PIT',
    icon: 'league1.png',
    preset: 'rookie',
    blurb: 'Trades late, small, and panics out. Finishes about where it started.',
    winsToNext: 3,
    reward: { win: 3, draw: 1, profit: 2 },
  },
  {
    id: 'silver',
    name: 'SILVER FLOOR',
    icon: 'league2.png',
    preset: 'easy',
    blurb: 'Only takes the moves nobody could miss, and sits on them too long.',
    winsToNext: 5,
    reward: { win: 5, draw: 2, profit: 3 },
  },
  {
    id: 'gold',
    name: 'GOLD DESK',
    icon: 'league3.png',
    preset: 'medium',
    blurb: 'Reacts inside a second and takes a trade off once the move is done.',
    winsToNext: 7,
    reward: { win: 8, draw: 3, profit: 4 },
  },
  {
    id: 'global',
    name: 'GLOBAL FUND',
    icon: 'league4.png',
    preset: 'hard',
    blurb: 'Catches almost every trend and sizes up on it. Ends near 16k.',
    winsToNext: 10,
    reward: { win: 12, draw: 4, profit: 6 },
  },
  {
    id: 'crown',
    name: 'BULL CROWN',
    icon: 'league5.png',
    preset: 'elite',
    blurb: 'Reads the tape before you do. Beat it and you nearly doubled the book.',
    winsToNext: 0,
    reward: { win: 18, draw: 6, profit: 9 },
  },
];

export const LEAGUE_COUNT = LEAGUES.length;

/** Index of the league a bot preset belongs to, or -1 for the dev-only presets. */
export function leagueOfPreset(preset: string): number {
  return LEAGUES.findIndex((l) => l.preset === preset);
}

/**
 * How many leagues are open, given the wins banked in each. The gate is per
 * league and cumulative through the ladder: three wins in the bronze pit open
 * the silver floor, and nothing opens the gold desk until five are banked on
 * that floor.
 */
export function unlockedCount(wins: number[]): number {
  let open = 1;
  while (open < LEAGUE_COUNT && (wins[open - 1] ?? 0) >= LEAGUES[open - 1].winsToNext) open++;
  return open;
}

export function isUnlocked(index: number, wins: number[]): boolean {
  return index < unlockedCount(wins);
}

/** Wins still owed in the league below before `index` opens. 0 once it is open. */
export function winsOwed(index: number, wins: number[]): number {
  if (index <= 0 || isUnlocked(index, wins)) return 0;
  const prev = LEAGUES[index - 1];
  return Math.max(0, prev.winsToNext - (wins[index - 1] ?? 0));
}

/* ------------------------------------------------------------- persistence */

const WINS_KEY = 'brokerstars.league.wins';
const PICK_KEY = 'brokerstars.league.pick';

const emptyWins = (): number[] => LEAGUES.map(() => 0);

/** Private browsing and locked-down webviews throw on access, so never assume. */
export function loadWins(): number[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(WINS_KEY) ?? 'null');
    if (!Array.isArray(raw)) return emptyWins();
    // stored under an older, shorter ladder: keep what is there, pad the rest
    return emptyWins().map((_, i) => {
      const n = Number(raw[i]);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    });
  } catch {
    return emptyWins();
  }
}

export function saveWins(wins: number[]): void {
  try {
    window.localStorage.setItem(WINS_KEY, JSON.stringify(wins));
  } catch {
    /* storage unavailable — league progress simply does not persist */
  }
}

/** Last league played, clamped to what is actually open. */
export function loadPick(wins: number[]): number {
  let n = 0;
  try {
    n = Number(window.localStorage.getItem(PICK_KEY));
  } catch {
    n = 0;
  }
  if (!Number.isFinite(n)) n = 0;
  return Math.min(Math.max(0, Math.floor(n)), unlockedCount(wins) - 1);
}

export function savePick(index: number): void {
  try {
    window.localStorage.setItem(PICK_KEY, String(index));
  } catch {
    /* storage unavailable */
  }
}
