import React from 'react';
import { roomLayers } from './renovation';

/** The room scene: every sprite is the full 1080x1920 canvas, so layers stack. */
export default function Room({ done }: { done: number }) {
  return (
    <div className="room" aria-hidden="true">
      {roomLayers(done).map((l) => (
        <img
          key={l.key}
          src={l.url}
          alt=""
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            if (import.meta.env.DEV) console.error(`missing room sprite "${l.key}": ${l.url}`);
          }}
        />
      ))}
    </div>
  );
}
