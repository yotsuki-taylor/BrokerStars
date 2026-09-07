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
  Star,
  Tie,
  Trophy,
  money,
} from './components';
import { t, tr } from './i18n';
import { ROOM_DONE, ROOM_STEPS } from './renovation';
import type { Outfit } from './wardrobe';

/** Main menu: the player's room, the player standing in it, and the way out to a match. */
export default function Menu({
  stars,
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
  onSettings,
}: {
  stars: number;
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
  onSettings: () => void;
}) {
  const step = roomDone < ROOM_DONE ? ROOM_STEPS[roomDone] : null;
  const [confirming, setConfirming] = useState(false);
  const price = freeMode ? 0 : (step?.price ?? 0);
  const affordable = stars >= price;

  // never leave the confirm state hanging over a different upgrade
  useEffect(() => setConfirming(false), [roomDone]);

  return (
    <div className="menu">
      {/* while confirming, the room already shows what the upgrade would look like */}
      <Room done={confirming ? roomDone + 1 : roomDone} />

      {/* The corner used to be the help button and nothing else. Help is one of
          two things behind it now, so the corner opens a menu instead, and the
          counters move across to give it the left-hand side.

          Two currencies, two counters, and the dollars go on the inside: stars
          have been in that corner since the first build, and moving them to
          make room for the newcomer would cost more than it bought. */}
      <header className="menu-top">
        <button className="icon-btn accent" onClick={onSettings} aria-label="settings">
          <Gear size={22} />
        </button>
        <span className="spacer" />
        <div className="dollar-count">
          <Dollar size={18} />
          <b>{money(dollars)}</b>
        </div>
        <div className="star-count">
          <Star size={20} />
          <b>{stars}</b>
        </div>
      </header>

      {/* Off to the side rather than down in the column of four: the column is
          places to go, and this is a thing to collect. It lights up when there
          is something behind it, which is the only reason a button that leads
          nowhere new belongs on the main screen at all. */}
      <button
        className={`daily-btn${nudge ? ' nudge' : ''}`}
        onClick={onDaily}
        aria-label={t('menu.daily')}
      >
        <Briefcase size={30} />
      </button>

      <div className="hero">
        <Character outfit={outfit} />
      </div>

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
        <div className={`reno${confirming ? ' confirming' : ''}`}>
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
                  <Star size={15} /> {price}
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="reno done">
          <b>{t('menu.roomComplete')}</b>
        </div>
      )}

      <div className="menu-actions">
        {/* Each of the four carries its mark at a fixed inset, so the pictures
            line up down the column while the words stay centred in what is
            left of the button. */}
        <div className="menu-left">
          <button className="menu-btn" onClick={onShop}>
            <Cart />
            <span>{t('menu.shop')}</span>
          </button>
          <button className="menu-btn" onClick={onEquip}>
            <Tie />
            <span>{t('menu.equip')}</span>
          </button>
          <button className="menu-btn" onClick={onArchive}>
            <Cards />
            <span>{t('menu.archive')}</span>
          </button>
          <button className="menu-btn" onClick={onRating}>
            <Trophy />
            <span>{t('rating.title')}</span>
          </button>
        </div>
        {/* PLAY is still the button the eye lands on. DUEL sits under it at
            two thirds the height: the same journey, but one that needs a
            friend at the other end of it, and it should not be competing with
            the one that needs nobody. */}
        <div className="menu-right">
          <button className="menu-btn play" onClick={onPlay}>
            {t('menu.play')}
          </button>
          <button className="menu-btn duel" onClick={onDuel}>
            {t('menu.duel')}
          </button>
        </div>
      </div>
    </div>
  );
}
