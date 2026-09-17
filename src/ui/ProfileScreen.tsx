import React, { useEffect, useState } from 'react';
import Character from './Character';
import { COMPANIES } from '../sim/companies';
import AwardsShelf from './AwardsShelf';
import { Coin, Dollar, People, Trophy, money } from './components';
import { LEAGUES, leagueName } from './leagues';
import { fetchFriends } from './api';
import { friendsAvailable } from './friends';
import { t } from './i18n';
import type { Profile } from '../profile/protocol';
import type { Outfit } from './wardrobe';

/**
 * Who the player is: the trader, what they have done, and the people they know.
 *
 * WHY IT EXISTS. Everything on this screen was already kept and was scattered
 * across screens that are about something else. The awards sat in the archive —
 * now the market — beside companies and share prices, which is a screen about
 * the world rather than about the player. The friends were a round button on a
 * rail. The career was nowhere at all: the server has counted league wins,
 * duels won, the best book ever finished and the highest league reached since
 * the first build, and none of it was ever shown in one place.
 *
 * WHAT IT IS NOT. Not a hub with a copy of every screen behind it. It holds the
 * three things that are true of the PLAYER — what they are wearing, what they
 * have earned, and who they know — and everything else on the main menu stays
 * where it is.
 *
 * THE NUMBERS ARE THE SERVER'S. Every figure here comes off the profile the
 * Worker sends (`src/profile/protocol.ts`), which is the same arrangement the
 * shelf has always had: a client that counted its own wins would be a client
 * that could edit them.
 */

/** One figure and what it is, which is the whole of the career block. */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <b>{children}</b>
      <span>{label}</span>
    </div>
  );
}

export default function ProfileScreen({
  name,
  outfit,
  profile,
  onFriends,
  onBack,
}: {
  name: string;
  outfit: Outfit;
  /** null in a build with no server behind it, or before the first answer */
  profile: Profile | null;
  onFriends: () => void;
  onBack: () => void;
}) {
  /**
   * How many people are on the list, asked for here rather than passed in.
   *
   * It is one request for one number, and it is made on the screen that shows
   * the number — the menu has no business holding a friends list it never
   * draws. Null until it answers and null for ever in a build with no server,
   * and the line underneath says something useful in both cases rather than
   * "0 on the list", which would be a lie about a list nobody has read.
   */
  const [friends, setFriends] = useState<number | null>(null);
  useEffect(() => {
    if (!friendsAvailable()) return;
    let alive = true;
    void fetchFriends().then((list) => {
      if (alive && list) setFriends(list.friends.length);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Wins against the bots, added up off the ladder.
   *
   * `wins` is one number per league and is what the ladder is climbed on, so
   * the sum is every match won against a bot and nothing else. Duels are
   * counted separately and shown separately — a friend willing to lose ten
   * times is not a climb, which is why the ladder ignores them, and a screen
   * that quietly added the two together would be undoing that on purpose.
   */
  const ladderWins = (profile?.wins ?? []).reduce((sum, n) => sum + n, 0);

  /** The highest league ever finished in, by name rather than by index. */
  const top = LEAGUES[profile?.topLeague ?? 0];

  return (
    <div className="archive profile">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="arch-count">{t('profile.title')}</div>
      </header>

      {/* The trader himself, in what he is actually wearing. He is the one
          picture in this game that is nobody else's, and the profile is the
          only screen where he is the subject rather than the scenery. */}
      <div className="profile-hero">
        <Character outfit={outfit} />
      </div>
      <b className="profile-name">{name}</b>

      <div className="profile-stats">
        <Stat label={t('profile.wins')}>{ladderWins}</Stat>
        <Stat label={t('profile.duelWins')}>{profile?.duelWins ?? 0}</Stat>
        <Stat label={t('profile.best')}>
          <Dollar size={13} /> {money(profile?.bestNetWorth ?? 0)}
        </Stat>
        <Stat label={t('profile.league')}>{top ? leagueName(top) : '—'}</Stat>
        <Stat label={t('profile.earned')}>
          <Coin size={13} /> {profile?.earned ?? 0}
        </Stat>
        <Stat label={t('profile.met')}>
          {(profile?.seen ?? []).length}/{COMPANIES.length}
        </Stat>
      </div>

      {/* The people, one line and a way through. The whole friends screen is
          behind it — the list, the invitation, the code — because that screen
          is where somebody GOES to do something about a friend, and this is
          where they look to see that they have any. */}
      <button className="profile-friends" onClick={onFriends}>
        <People size={22} />
        <span className="profile-friends-text">
          <b>{t('friends.title')}</b>
          <i>{friends === null ? t('profile.friendsUnknown') : t('profile.friendsN', { n: friends })}</i>
        </span>
        <span className="profile-chev">›</span>
      </button>

      <div className="profile-shelf">
        <b className="corp-section-title">
          <Trophy size={14} /> {t('profile.awards')}
        </b>
        <AwardsShelf profile={profile} />
      </div>
    </div>
  );
}
