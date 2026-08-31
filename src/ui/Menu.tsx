import React from 'react';
import Character from './Character';
import Room from './Room';
import { Star, tex } from './components';
import { ROOM_DONE, ROOM_STEPS } from './renovation';
import type { Outfit } from './wardrobe';

/** Main menu: the player's room, the player standing in it, and the way out to a match. */
export default function Menu({
  stars,
  outfit,
  roomDone,
  onRenovate,
  onPlay,
  onShop,
  onEquip,
  onHelp,
}: {
  stars: number;
  outfit: Outfit;
  roomDone: number;
  onRenovate: () => void;
  onPlay: () => void;
  onShop: () => void;
  onEquip: () => void;
  onHelp: () => void;
}) {
  const step = roomDone < ROOM_DONE ? ROOM_STEPS[roomDone] : null;

  return (
    <div className="menu">
      <Room done={roomDone} />

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

      {step ? (
        <div className="reno">
          <div className="reno-text">
            <span className="reno-kicker">
              NEXT UPGRADE · {roomDone + 1}/{ROOM_DONE}
            </span>
            <b>{step.label}</b>
          </div>
          <button
            className="menu-btn reno-btn"
            disabled={stars < step.price}
            onClick={onRenovate}
          >
            <Star size={15} /> {step.price}
          </button>
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
