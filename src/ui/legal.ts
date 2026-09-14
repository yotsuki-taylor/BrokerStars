/**
 * The privacy policy, and how to get to it from inside the game.
 *
 * Google Play will not take a build without a policy at a public URL, and it
 * wants that link reachable from the app as well as from the store listing —
 * hence the row in the settings sheet. The page itself is `public/privacy.html`
 * and rides out with the web build, so the document and the game it describes
 * are deployed together and cannot drift apart by a release.
 *
 * WHY THE ADDRESS IS SPELLED OUT AND NOT DERIVED. On the web and inside
 * Telegram the game is served from the very site the page is on, so a relative
 * path would do. The Android build is the reason it will not: its assets are
 * packed into the APK and served from `https://localhost`, where a relative
 * `privacy.html` resolves to a page that does not exist and a policy link that
 * does nothing is worse than none. One absolute address works on all three
 * hosts. Moving the site means changing this line — the same bargain
 * `CHAT_LINK` makes in `friends.ts`, and for the same reason.
 */

import { platform } from '../platform';

export const PRIVACY_URL = 'https://yotsuki-taylor.github.io/BrokerStars/privacy.html';

/**
 * Open it wherever this host opens things. Inside Telegram that is Telegram's
 * own opener, which puts the page over the game rather than throwing the
 * player out to a browser tab; on Android the system browser, so the policy
 * does not replace the app in its own WebView with no way back.
 */
export function openPrivacy(): void {
  platform().openLink(PRIVACY_URL);
}
