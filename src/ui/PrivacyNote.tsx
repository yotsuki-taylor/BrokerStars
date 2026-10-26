import React, { useState } from 'react';
import { platform } from '../platform';
import { openPrivacy } from './legal';
import { t } from './i18n';

/**
 * A line about the privacy policy for a player who has never seen it, on the
 * hosts that ask for one.
 *
 * Today that is CrazyGames alone. Its rules want a notice for new players from
 * any game that keeps more than the SDK's own events, and this one keeps a
 * guest account, matches, a nickname and its own analytics (`public/privacy.html`
 * lists them). Telegram and Play have their own arrangements — a policy in the
 * store listing, a row in the settings sheet — and the phone builds are left
 * exactly as they were.
 *
 * Non-blocking, as CrazyGames recommends: a strip along the bottom of the menu
 * that leaves every button working, and goes for good once dismissed. "For
 * good" is this browser's storage, which is the right scope — a player who
 * clears it is a new player as far as anybody can tell.
 */

const SEEN_KEY = 'brokerstars.privacy.noted';

/** The hosts whose rules ask for the notice. */
const wantsNotice = (): boolean => platform().id === 'crazygames';

function noted(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // no storage to remember in: show it, since we cannot know it was seen
    return false;
  }
}

function note(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* it goes for this session, and comes back next time */
  }
}

export default function PrivacyNote() {
  const [open, setOpen] = useState(() => wantsNotice() && !noted());
  if (!open) return null;
  return (
    <div className="privacy-note" role="note">
      <p>{t('privacy.note')}</p>
      <div className="privacy-note-actions">
        <button className="menu-btn" onClick={openPrivacy}>
          {t('settings.privacy')}
        </button>
        <button
          className="big-btn"
          onClick={() => {
            note();
            setOpen(false);
          }}
        >
          {t('privacy.ok')}
        </button>
      </div>
    </div>
  );
}
