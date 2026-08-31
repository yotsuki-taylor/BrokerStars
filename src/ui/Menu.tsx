import React, { useState } from 'react';
import { Star, tex } from './components';

/**
 * Main menu. The hero is a placeholder portrait until the real art lands, and
 * SHOP / EQUIP are wired to a stub so there is somewhere to build into.
 */
export default function Menu({
  stars,
  onPlay,
  onHelp,
}: {
  stars: number;
  onPlay: () => void;
  onHelp: () => void;
}) {
  const [stub, setStub] = useState<string | null>(null);

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
        <img src={tex('player1.png')} alt="" />
      </div>

      <div className="menu-actions">
        <div className="menu-left">
          <button className="menu-btn" onClick={() => setStub('SHOP')}>
            SHOP
          </button>
          <button className="menu-btn" onClick={() => setStub('EQUIP')}>
            EQUIP
          </button>
        </div>
        <button className="menu-btn play" onClick={onPlay}>
          PLAY
        </button>
      </div>

      {stub && (
        <div className="overlay" onClick={() => setStub(null)}>
          <h2>{stub}</h2>
          <p>
            Not built yet. Stars you win in matches are already being counted, so there will be
            something to spend them on.
          </p>
          <button className="big-btn" onClick={() => setStub(null)}>
            BACK
          </button>
        </div>
      )}
    </div>
  );
}
