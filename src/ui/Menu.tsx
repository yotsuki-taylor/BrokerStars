import React, { useEffect, useState } from 'react';
import Character from './Character';
import Room from './Room';
import { Check, Cross, Gear, Star } from './components';
import { t, tr } from './i18n';
import { ROOM_DONE, ROOM_STEPS } from './renovation';
import type { Outfit } from './wardrobe';

/** Main menu: the player's room, the player standing in it, and the way out to a match. */
export default function Menu({
  stars,
  outfit,
  roomDone,
  admin,
  freeMode,
  onRenovate,
  onUndoRenovate,
  onToggleFree,
  onOpenDev,
  onPlay,
  onShop,
  onEquip,
  onArchive,
  onSettings,
}: {
  stars: number;
  outfit: Outfit;
  roomDone: number;
  admin: boolean;
  freeMode: boolean;
  onRenovate: () => void;
  onUndoRenovate: () => void;
  onToggleFree: () => void;
  onOpenDev: () => void;
  onPlay: () => void;
  onShop: () => void;
  onEquip: () => void;
  onArchive: () => void;
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
          stars move across to give it the left-hand side. */}
      <header className="menu-top">
        <button className="icon-btn accent" onClick={onSettings} aria-label="settings">
          <Gear size={22} />
        </button>
        <span className="spacer" />
        <div className="star-count">
          <Star size={20} />
          <b>{stars}</b>
        </div>
      </header>

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
        <div className="menu-left">
          <button className="menu-btn" onClick={onShop}>
            {t('menu.shop')}
          </button>
          <button className="menu-btn" onClick={onEquip}>
            {t('menu.equip')}
          </button>
          <button className="menu-btn" onClick={onArchive}>
            {t('menu.companies')}
          </button>
        </div>
        <button className="menu-btn play" onClick={onPlay}>
          {t('menu.play')}
        </button>
      </div>
    </div>
  );
}
