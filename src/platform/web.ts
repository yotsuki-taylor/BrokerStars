/**
 * The game as an ordinary web page: `npm run dev`, or the built bundle opened
 * outside Telegram.
 *
 * Most of this is the honest empty answer rather than a fallback. There is no
 * signed identity here and no host to ask for one, so the board is read-only
 * and the server refuses writes by design — ui/api.ts says so at length. The
 * game itself is untouched: matches play, coins are earned, progress is saved
 * to localStorage exactly as ever.
 *
 * It is also the shape the Android build starts from. What that build adds is
 * an `authToken` with something in it — a device account, or a Google sign-in
 * the Worker learns to check beside `verifyInitData` — and a `launchParam` read
 * off the intent that opened the app. The rest of this file is already right
 * for it.
 */

import type { Platform } from './index';

export const WEB: Platform = {
  id: 'web',

  async ready(): Promise<void> {
    /* a browser tab needs no arranging */
  },

  authToken(): string {
    return '';
  },

  userId(): string | null {
    return null;
  },

  userName(): string {
    return '';
  },

  launchParam(): string {
    return '';
  },

  haptic(kind: 'light' | 'heavy'): void {
    (globalThis as any).navigator?.vibrate?.(kind === 'heavy' ? 25 : 10);
  },

  openLink(url: string): void {
    (globalThis as any).window?.open(url, '_blank', 'noopener');
  },
};
