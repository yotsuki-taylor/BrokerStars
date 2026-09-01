/**
 * Meta progression. Deliberately outside sim/ — the simulation has no idea
 * stars exist, and a match plays out identically whether or not it pays any.
 */

const KEY = 'brokerstars.stars';

export const REWARDS = {
  win: 3,
  draw: 1,
  loss: 0,
  /**
   * Paid on top for a well traded match, whoever won. The bar is a grown
   * capital, not merely a positive one: the market drifts up on its own, so
   * 96% of matches end above the starting cash and a bonus for that is not a
   * bonus at all. Clearing +40% happens in roughly a third of matches.
   */
  profit: 2,
  profitBar: 0.4,
};

export interface Award {
  win: number;
  profit: number;
  total: number;
}

/** Surrendering pays nothing — otherwise an early lead could be cashed out. */
export const NO_AWARD: Award = { win: 0, profit: 0, total: 0 };

export function awardFor(won: boolean, drew: boolean, tradedWell: boolean): Award {
  const win = won ? REWARDS.win : drew ? REWARDS.draw : REWARDS.loss;
  const profit = tradedWell ? REWARDS.profit : 0;
  return { win, profit, total: win + profit };
}

/** Did the match clear the bar the profit bonus is paid for? */
export function tradedWell(netWorth: number, startingCash: number): boolean {
  return netWorth >= startingCash * (1 + REWARDS.profitBar);
}

/** Private browsing and locked-down webviews throw on access, so never assume. */
export function loadStars(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveStars(n: number): void {
  try {
    window.localStorage.setItem(KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* storage unavailable — stars simply do not persist this session */
  }
}
