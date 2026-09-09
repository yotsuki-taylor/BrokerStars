import React from 'react';
import { roomLayers } from './renovation';

/**
 * The room scene: every sprite is the full 1080x1920 canvas, so layers stack.
 *
 * Rendered TWICE per screen, once on each side of the character — `front`
 * picks which half. The desk and what stands on it are drawn from the near
 * side and the trader sits at them, so they have to paint over him; the walls
 * and everything hanging on them paint under. Which slot is which is
 * `renovation.ts`, not this file, and the front half is a no-op until the desk
 * is bought.
 */
export default function Room({ done, front = false }: { done: number; front?: boolean }) {
  return (
    <div className={`room${front ? ' room-front' : ''}`} aria-hidden="true">
      {roomLayers(done)
        .filter((l) => l.front === front)
        .map((l) => (
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
