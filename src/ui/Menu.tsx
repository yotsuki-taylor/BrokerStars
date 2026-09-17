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
  Person,
  Tie,
  Tower,
  Trophy,
  money,
} from './components';
import { t, tr } from './i18n';
import { ROOM_CASH_TOTAL, ROOM_DONE, ROOM_STEPS, stepIndexOf } from './renovation';
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
  onArchive,
  onRating,
  onDaily,
  onProfile,
  onCorps,
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
  onArchive: () => void;
  onRating: () => void;
  onDaily: () => void;
  onProfile: () => void;
  onCorps: () => void;
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

      {/* Facing it across the room: the player themselves.
 
          THE LEFT RAIL IS WHAT ARRIVES, THE RIGHT ONE IS WHO YOU ARE. That is
          the whole of why there are two now rather than a column of three on
          one side. The day is news — it lights up, it is gone by midnight, and
          it is the only thing in this game that behaves that way. The profile
          is the opposite: it never changes without the player changing it, and
          it is where they are rather than where they are going.
 
          The friends went inside it. They were a round button here for a long
          time and the round button was always slightly wrong: a list of people
          is not news either, and what somebody actually wants from that screen
          — the link, the code, the list — is a thing they go and do, once. */}
      <button
        className="rail-btn profile-btn"
        data-tut="profile"
        onClick={onProfile}
        aria-label={t('profile.title')}
      >
        <Person size={28} />
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
            {/* What the step is actually bought for, under the name of it: the
                room stopped being decoration when the steps started paying, and
                a player who is told so on the card is a player who finishes it.
                Money in the market's own units, so it reads as the same stuff
                the match is played in rather than a second currency. */}
            <span className="reno-gain">{t('menu.roomCash', { n: money(step.cash) })}</span>
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
          <span className="reno-gain">
            {t('menu.roomCashTotal', { n: money(ROOM_CASH_TOTAL) })}
          </span>
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
          <button className="menu-btn" data-tut="archive" onClick={onArchive}>
            <Cards />
            <span>{t('menu.archive')}</span>
          </button>
          {/* People you play with, between what you buy and where you stand:
              the column now reads spend · study · belong · rank, which is the
              order somebody actually meets them in. */}
          <button className="menu-btn" data-tut="corps" onClick={onCorps}>
            <Tower />
            <span>{t('corp.title')}</span>
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
