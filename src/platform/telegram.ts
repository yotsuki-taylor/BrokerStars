/**
 * The game as a Telegram mini app — the only host it had until now.
 *
 * Everything in here was inlined at its call site before, guarded with `?.` so
 * that a plain browser fell through to something sensible. The guards are gone
 * from the call sites and live here instead: this file is only ever reached
 * when `inTelegram()` is true, and even then an older client can be missing any
 * given method, which is what the remaining `?.` are for.
 */

import type { Platform } from './index';

/** The object the script tag in index.html puts on the window, if it did. */
function webApp(): any {
  return (globalThis as any).window?.Telegram?.WebApp;
}

/**
 * Is the Telegram SDK loaded? Which is not quite the same question as "are we
 * inside Telegram", and the difference is worth knowing.
 *
 * The script in index.html defines `Telegram.WebApp` wherever it is loaded,
 * including an ordinary browser tab, so this is true during `npm run dev` too.
 * That is fine and is exactly what the old inlined `if (tg)` did: the stub it
 * leaves behind hands back an empty `initData`, so the game signs nothing and
 * falls through to the single-player path, which is the correct behaviour in a
 * browser tab anyway.
 *
 * The honest test of "really inside Telegram" is therefore a non-empty
 * `authToken()`, and that is what ui/api.ts has always checked. What this
 * decides is only which set of methods to call.
 *
 * The Android build drops the script tag, so there is no stub, and `web.ts`
 * gets picked without anything having to know about Android.
 */
export const inTelegram = (): boolean => Boolean(webApp());

/**
 * Painted on the chat's own chrome so the window around the game matches the
 * game. The same blue as the `theme-color` meta in index.html; changing one
 * without the other leaves a seam at the top of the screen.
 */
const CHROME = '#0B4FA8';

export const TELEGRAM: Platform = {
  id: 'telegram',

  ready(): void {
    const tg = webApp();
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      tg.disableVerticalSwipes?.();
      tg.setHeaderColor?.(CHROME);
      tg.setBackgroundColor?.(CHROME);
    } catch {
      /* older client, ignore */
    }
  },

  authToken(): string {
    return String(webApp()?.initData ?? '');
  },

  userId(): string | null {
    const id = webApp()?.initDataUnsafe?.user?.id;
    return id == null ? null : String(id);
  },

  userName(): string {
    const u = webApp()?.initDataUnsafe?.user;
    // `||`, not `??`: Telegram sends an empty first_name rather than leaving it
    // out, and `??` only falls through on null, so the username was never reached
    return String(u?.first_name || u?.username || '').trim();
  },

  launchParam(): string {
    return String(webApp()?.initDataUnsafe?.start_param ?? '');
  },

  haptic(kind: 'light' | 'heavy'): void {
    const haptics = webApp()?.HapticFeedback;
    if (haptics?.impactOccurred) haptics.impactOccurred(kind === 'heavy' ? 'medium' : 'light');
    else (globalThis as any).navigator?.vibrate?.(kind === 'heavy' ? 25 : 10);
  },

  openLink(url: string): void {
    const tg = webApp();
    // Through Telegram's own opener when there is one, so a chat or a share
    // sheet comes up inside the app the player is already in rather than in a
    // browser tab that asks them to open Telegram.
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else (globalThis as any).window?.open(url, '_blank', 'noopener');
  },
};
