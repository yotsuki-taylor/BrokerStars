import React from 'react';
import { SPRITE_H, SPRITE_W, buildLayers, pieceUrl, piecesOf, type Outfit } from './wardrobe';

/**
 * The dressed trader: every sprite shares one canvas, so layers stack.
 *
 * In `silhouette` mode every layer is crushed to black and the eyewear is drawn
 * once more, inverted, so the lenses read as two pale shapes in the dark — the
 * unrevealed-opponent look.
 */
export default function Character({
  outfit,
  silhouette = false,
  className,
}: {
  outfit: Outfit;
  silhouette?: boolean;
  className?: string;
}) {
  const layers = buildLayers(outfit);
  const eyewear = outfit.access;
  return (
    <div
      className={`character${silhouette ? ' silhouette' : ''}${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: `${SPRITE_W} / ${SPRITE_H}` }}
    >
      {layers.map((l) => (
        <img
          key={l.key}
          src={l.url}
          alt=""
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            if (import.meta.env.DEV) console.error(`missing sprite for layer "${l.key}": ${l.url}`);
          }}
        />
      ))}
      {silhouette && eyewear && (
        <img
          className="glint"
          src={pieceUrl('access', eyewear, piecesOf('access', eyewear) === 'single' ? 'single' : 'up')}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
}
