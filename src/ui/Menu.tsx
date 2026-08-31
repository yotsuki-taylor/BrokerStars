import React from 'react';
import Character from './Character';
import { Star, tex } from './components';
import type { Outfit } from './wardrobe';

/** Main menu. The hero wears whatever the player has equipped. */
export default function Menu({
  stars,
  outfit,
  onPlay,
  onShop,
  onEquip,
  onHelp,
}: {
  stars: number;
  outfit: Outfit;
  onPlay: () => void;
  onShop: () => void;
  onEquip: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="menu">
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

      <div className="menu-title">BROKER STARS</div>

      <div className="hero">
        <Character outfit={outfit} />
      </div>

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
