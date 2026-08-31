import React from 'react';
import { SPRITE_H, SPRITE_W, buildLayers, type Outfit } from './wardrobe';

/** The dressed trader: every sprite shares one canvas, so layers just stack. */
export default function Character({ outfit, className }: { outfit: Outfit; className?: string }) {
  const layers = buildLayers(outfit);
  return (
    <div
      className={`character${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: `${SPRITE_W} / ${SPRITE_H}` }}
    >
      {layers.map((l) => (
        <img key={l.key} src={l.url} alt="" draggable={false} />
      ))}
    </div>
  );
}
