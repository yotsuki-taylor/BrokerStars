import React, { useEffect, useState } from 'react';
import Character from './Character';
import Room from './Room';
import { Check, Cross, Star, tex } from './components';
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
  onPlay,
  onShop,
  onEquip,
  onHelp,
}: {
  stars: number;
  outfit: Outfit;
  roomDone: number;
  admin: boolean;
  freeMode: boolean;
  onRenovate: () => void;
  onUndoRenovate: () => void;
  onToggleFree: () => void;
  onPlay: () => void;
  onShop: () => void;
  onEquip: () => void;
  onHelp: () => void;
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

      <header className="menu-top">
        <div className="star-count">
          <Star size={20} />
          <b>{stars}</b>
        </div>
        <span className="spacer" />
        <button className="icon-btn accent" onClick={onHelp} aria-label="help">
          <img src={tex('help.png')} alt="" />
        </button>
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
        </div>
      )}

      {step ? (
        <div className={`reno${confirming ? ' confirming' : ''}`}>
          <div className="reno-text">
            <span className="reno-kicker">
              {confirming ? 'RENOVATE?' : `NEXT UPGRADE · ${roomDone + 1}/${ROOM_DONE}`}
            </span>
            <b>{step.label}</b>
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
                'FREE'
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
          <b>ROOM COMPLETE</b>
        </div>
      )}

      <div className="menu-actions">
        <div className="menu-left">
          <button className="menu-btn" onClick={onShop}>
            SHOP
          </button>
          <button className="menu-btn" onClick={onEquip}>
            EQUIP
          </button>
        </div>
        <button className="menu-btn play" onClick={onPlay}>
          PLAY
        </button>
      </div>
    </div>
  );
}
