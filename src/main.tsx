import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { platform } from './platform';
import { installSfx, setHostMuted } from './ui/sfx';
import './ui/styles.css';

/**
 * Fetch the game's face before the first frame, so the menu does not open in
 * the system font and then jump. Capped: a font that is slow to arrive is not
 * worth a blank screen, and `font-display: swap` fills it in when it lands.
 */
function fontReady(): Promise<unknown> {
  const load = document.fonts?.load("800 16px 'Lapsus Pro'") ?? Promise.resolve();
  const cap = new Promise((resolve) => setTimeout(resolve, 1500));
  return Promise.race([load.catch(() => undefined), cap]);
}

/**
 * Let the host arrange itself, then draw.
 *
 * Inside Telegram that is full height and a locked swipe-to-close; in a browser
 * tab it is nothing; on Android it is the session read off the disk and the
 * link the app was opened on. The last of those is why this is awaited rather
 * than fired and forgotten — the game reads the launch parameter during its
 * first render, and an invitation that arrives after it is one nobody joins.
 */
async function start(): Promise<void> {
  installSfx();
  await Promise.all([platform().ready(), fontReady()]);
  // A host with a mute switch of its own (CrazyGames) is heard from the start.
  platform().onMute?.(setHostMuted);
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  // Two frames: the first runs before React's commit has been painted, the
  // second after — the moment the player is actually looking at the game. A
  // page opened in a background tab paints nothing and runs no frames, so a
  // timer says it too; `loaded` only answers the first of them.
  const loaded = () => platform().loaded?.();
  requestAnimationFrame(() => requestAnimationFrame(loaded));
  setTimeout(loaded, 1000);
}

void start();
