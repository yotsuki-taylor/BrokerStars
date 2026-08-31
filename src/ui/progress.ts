/**
 * Meta progression. Deliberately outside sim/ — the simulation has no idea
 * stars exist, and a match plays out identically whether or not it pays any.
 */

const KEY = 'brokerstars.stars';

export const REWARDS = {
  win: 3,
  draw: 1,
  loss: 0,
  /** paid on top when you end the match with more money than you started */
  profit: 1,
};

export interface Award {
  win: number;
  profit: number;
  total: number;
}

/** Surrendering pays nothing — otherwise an early lead could be cashed out. */
export const NO_AWARD: Award = { win: 0, profit: 0, total: 0 };

export function awardFor(won: boolean, drew: boolean, inProfit: boolean): Award {
  const win = won ? REWARDS.win : drew ? REWARDS.draw : REWARDS.loss;
  const profit = inProfit ? REWARDS.profit : 0;
  return { win, profit, total: win + profit };
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
