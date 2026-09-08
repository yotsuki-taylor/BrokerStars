import React from 'react';
import Character from './Character';
import Room from './Room';
import { Coin } from './components';
import { t } from './i18n';
import { ROOM_DONE } from './renovation';
import type { Friend } from '../friends/protocol';

/**
 * Somebody else's room, with them standing in it.
 *
 * The same three pieces the main menu is built out of — `Room`, `Character`
 * and the card across the bottom — because that is the point of visiting: the
 * room a player has spent every coin on is the one thing in this game they
 * have made, and it should look to a guest exactly as it looks to them.
 *
 * Nothing here is fetched. The room and the clothes came down with the list
 * (see `Friend` in `src/friends/protocol.ts`), so a visit is instant and works
 * for as long as the list on screen does.
 *
 * One way out and nothing else to touch. A guest cannot renovate, cannot shop,
 * and is not being sold anything.
 */
export default function VisitScreen({ friend, onBack }: { friend: Friend; onBack: () => void }) {
  return (
    <div className="menu visit">
      <Room done={friend.room} />

      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="coin-count">
          <Coin size={20} />
          <b>{friend.coins}</b>
        </div>
      </header>

      <div className="hero">
        <Character outfit={friend.outfit} />
      </div>

      {/* Where the renovation card sits on the player's own menu, and it says
          the same thing about this room: how far along it is. A finished one
          says so instead of counting, exactly as the owner's does. */}
      <div className="reno visit-card">
        <div className="reno-text">
          <span className="reno-kicker">
            {friend.matches} {t('rating.matches')}
          </span>
          <b>{friend.name}</b>
        </div>
        <div className="visit-room">
          {friend.room >= ROOM_DONE
            ? t('menu.roomComplete')
            : t('friends.roomAt', { n: friend.room, of: ROOM_DONE })}
        </div>
      </div>
    </div>
  );
}
