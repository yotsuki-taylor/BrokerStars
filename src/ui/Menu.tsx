import React, { useEffect, useState } from 'react';
import Character from './Character';
import Room from './Room';
import {
  Briefcase,
  Cards,
  Cart,
  Check,
  Cross,
  Dollar,
  Gear,
  Coin,
  People,
  Tie,
  Trophy,
  money,
} from './components';
import { t, tr } from './i18n';
import { ROOM_DONE, ROOM_STEPS, stepIndexOf } from './renovation';
import type { Outfit } from './wardrobe';

/** Main menu: the player's room, the player standing in it, and the way out to a match. */
export default function Menu({
  coins,
  dollars,
  nudge,
  outfit,
  roomDone,
  admin,
  freeMode,
  onRenovate,
  onUndoRenovate,
  onToggleFree,
  onOpenDev,
  onPlay,
  onDuel,
  onShop,
  onEquip,
  onArchive,
  onRating,
  onDaily,
  onFriends,
  onSettings,
}: {
  coins: number;
  /** the hard currency, which so far only the daily bonus pays */
  dollars: number;
  /** something is waiting behind the DAILY button — see `worthATap` */
  nudge: boolean;
  outfit: Outfit;
  roomDone: number;
  admin: boolean;
  freeMode: boolean;
  onRenovate: () => void;
  onUndoRenovate: () => void;
  onToggleFree: () => void;
  onOpenDev: () => void;
  onPlay: () => void;
  onDuel: () => void;
  onShop: () => void;
  onEquip: () => void;
  onArchive: () => void;
  onRating: () => void;
  onDaily: () => void;
  onFriends: () => void;
  onSettings: () => void;
}) {
  const step = roomDone < ROOM_DONE ? ROOM_STEPS[roomDone] : null;
  const [confirming, setConfirming] = useState(false);
  const price = freeMode ? 0 : (step?.price ?? 0);
  const affordable = coins >= price;

  /**
   * What the room shows right now — one step ahead while a purchase is being
   * confirmed, so the preview is the whole scene rather than the furniture
   * alone.
   */
  const shown = confirming ? roomDone + 1 : roomDone;

  /**
   * Is there a desk under him yet?
   *
   * Without one he stands in an empty room and the renovation card below is
   * what his figure is cut off by. With one he is sitting AT it, and the desk
   * is drawn over him — so he has to come up, or the near edge crosses him at
   * the shoulders and he reads as somebody standing behind a desk rather than
   * working at one. See `.hero-seated` in styles.css for the amount.
   */
  const seated = shown > stepIndexOf('table');

  // never leave the confirm state hanging over a different upgrade
  useEffect(() => setConfirming(false), [roomDone]);

  return (
    <div className="menu">
      {/* while confirming, the room already shows what the upgrade would look like */}
      <Room done={shown} />

      {/* The corner used to be the help button and nothing else. Help is one of
          two things behind it now, so the corner opens a menu instead, and the
          counters move across to give it the left-hand side.

          Two currencies, two counters, and the dollars go on the inside: coins
          have been in that corner since the first build, and moving them to
          make room for the newcomer would cost more than it bought. */}
      <header className="menu-top">
        <button
          className="icon-btn"
          data-tut="settings"
          onClick={onSettings}
          aria-label="settings"
        >
          <Gear size={22} />
        </button>
        <span className="spacer" />
        <div className="dollar-count" data-tut="dollars">
          <Dollar size={18} />
          <b>{money(dollars)}</b>
        </div>
        <div className="coin-count" data-tut="coins">
          <Coin size={20} />
          <b>{coins}</b>
        </div>
      </header>

      {/* Off to the side rather than down in the column of four: the column is
          places to go, and this is a thing to collect. It lights up when there
          is something behind it, which is the only reason a button that leads
          nowhere new belongs on the main screen at all. */}
      <button
        className={`rail-btn daily-btn${nudge ? ' nudge' : ''}`}
        data-tut="daily"
        onClick={onDaily}
        aria-label={t('menu.daily')}
      >
        <Briefcase size={30} />
      </button>

      {/* Under it, on the same rail and for the same reason: a list of people
          is a thing to look at, not one of the four places to go. It never
          lights up — nothing arrives on it that will be gone tomorrow, so a
          second button competing for the corner of the eye would be buying
          attention it has no news to spend. */}
      <button
        className="rail-btn friends-btn"
        data-tut="friends"
        onClick={onFriends}
        aria-label={t('friends.title')}
      >
        <People size={28} />
      </button>

      <div className={`hero${seated ? ' hero-seated' : ''}`}>
        <Character outfit={outfit} />
      </div>

      {/* The near half of the room, over the character: he sits AT the desk. */}
      <Room done={shown} front />

      {admin && (
        <div className="admin-bar">
          <span className="admin-tag">DEV</span>
          <button className={`admin-btn${freeMode ? ' on' : ''}`} onClick={onToggleFree}>
            FREE {freeMode ? 'ON' : 'OFF'}
          </button>
          <button className="admin-btn" onClick={onUndoRenovate} disabled={roomDone === 0}>
            UNDO ROOM
          </button>
          <button className="admin-btn" onClick={onOpenDev}>
            PANEL
          </button>
        </div>
      )}

      {step ? (
        <div className={`reno${confirming ? ' confirming' : ''}`} data-tut="room">
          <div className="reno-text">
            <span className="reno-kicker">
              {confirming
                ? t('menu.renovate')
                : t('menu.nextUpgrade', { n: roomDone + 1, of: ROOM_DONE })}
            </span>
            <b>{tr(`room.${step.slot}`, step.label)}</b>
          </div>

          {confirming ? (
            <div className="confirm-pair">
              <button
                className="confirm-btn no"
                onClick={() => setConfirming(false)}
                aria-label="cancel"
              >
                <Cross size={22} />
              </button>
              <button
                className="confirm-btn yes"
                onClick={() => {
                  onRenovate();
                  setConfirming(false);
                }}
                aria-label="confirm"
              >
                <Check size={22} />
              </button>
            </div>
          ) : (
            <button
              className="menu-btn reno-btn"
              disabled={!affordable}
              onClick={() => setConfirming(true)}
            >
              {price === 0 ? (
                t('menu.free')
              ) : (
                <>
                  <Coin size={15} /> {price}
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="reno done" data-tut="room">
          <b>{t('menu.roomComplete')}</b>
        </div>
      )}

      <div className="menu-actions">
        {/* Each of the four carries its mark at a fixed inset, so the pictures
            line up down the column while the words stay centred in what is
            left of the button. */}
        <div className="menu-left">
          <button className="menu-btn" data-tut="shop" onClick={onShop}>
            <Cart />
            <span>{t('menu.shop')}</span>
          </button>
          <button className="menu-btn" data-tut="equip" onClick={onEquip}>
            <Tie />
            <span>{t('menu.equip')}</span>
          </button>
          <button className="menu-btn" data-tut="archive" onClick={onArchive}>
            <Cards />
            <span>{t('menu.archive')}</span>
          </button>
          <button className="menu-btn" data-tut="rating" onClick={onRating}>
            <Trophy />
            <span>{t('rating.title')}</span>
          </button>
        </div>
        {/* PLAY is still the button the eye lands on. DUEL sits under it at
            two thirds the height: the same journey, but one that needs a
            friend at the other end of it, and it should not be competing with
            the one that needs nobody. */}
        <div className="menu-right">
          <button className="menu-btn play" data-tut="play" onClick={onPlay}>
            {t('menu.play')}
          </button>
          <button className="menu-btn duel" data-tut="duel" onClick={onDuel}>
            {t('menu.duel')}
          </button>
        </div>
      </div>
    </div>
  );
}
