/**
 * The client half of the friends menu.
 *
 * Almost nothing: the list and the link are the server's (`worker/src/friends.ts`),
 * this end only asks for them, reads a code out of the address bar when the
 * game was opened on somebody's invitation, and hands the link to Telegram's
 * share sheet.
 */

import { cleanCode } from '../friends/protocol';
import { apiBase, initData } from './api';

/** Friends need a server to be kept on and a Telegram to prove who is asking. */
export const friendsAvailable = (): boolean => Boolean(apiBase()) && Boolean(initData());

/**
 * The friend code the game was opened on, if it was opened on one.
 *
 * Two ways in and one read, exactly like `duelCodeFromLaunch` in `./duel.ts`:
 * `?f=` is what the bot's own button carries (worker/src/bot.ts), and
 * `start_param` is what a direct mini-app link would carry. Wiped from the
 * address bar on the way past so that reloading the page does not add the same
 * person again — harmless, since adding is idempotent, but it would reopen the
 * menu over whatever the player had gone on to do.
 */
export function friendCodeFromLaunch(): string | null {
  let code: string | null = null;
  try {
    const url = new URL(window.location.href);
    code = cleanCode(url.searchParams.get('f'));
    if (code) {
      url.searchParams.delete('f');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    /* an address bar we cannot read is one with no invitation in it */
  }
  if (code) return code;
  const start = String((window as any).Telegram?.WebApp?.initDataUnsafe?.start_param ?? '');
  return start.startsWith('friend_') ? cleanCode(start.slice(7)) : null;
}

/**
 * Handing a link to somebody, and the clipboard behind it.
 *
 * Both live in `./duel.ts` because that is where the first link in this game
 * needed them, and neither has anything to do with duelling: `shareInvite`
 * opens Telegram's own share sheet, which is the contact picker this feature
 * would otherwise have to invent. Re-exported rather than copied, and rather
 * than having every caller reach into the duel module for something that is
 * not about duels.
 */
export { shareInvite, copyLink } from './duel';
